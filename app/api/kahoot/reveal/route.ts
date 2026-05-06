import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { requireUser } from '@/lib/require-user'
import { broadcast } from '@/lib/kahoot-broadcast'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await requireUser()
  const db = createAdminClient()
  const { session_id } = await req.json()

  const { data: session } = await db
    .from('kahoot_sessions')
    .select('id, code, phase, host_user_id, current_question_index, question_ids, time_limit_seconds')
    .eq('id', session_id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.host_user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (session.phase !== 'question') return NextResponse.json({ error: 'Wrong phase' }, { status: 409 })

  // Advance phase first (prevents double-click race)
  const { error: updateErr } = await db
    .from('kahoot_sessions')
    .update({ phase: 'revealed' })
    .eq('id', session_id)
    .eq('phase', 'question') // guard: only update if still in question phase

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Fetch correct answer + explanation
  const questionId = session.question_ids[session.current_question_index]
  const { data: question } = await db
    .from('quiz_questions')
    .select('correct_answer, explanation')
    .eq('id', questionId)
    .single()

  // Fetch per-question stats for host breakdown
  const { data: stats } = await db
    .from('kahoot_question_stats')
    .select('answers_a, answers_b, answers_c, answers_d, answers_timeout, answers_correct, answers_total')
    .eq('session_id', session_id)
    .eq('question_index', session.current_question_index)
    .maybeSingle()

  // Fetch player scores for broadcast
  const { data: players } = await db
    .from('kahoot_player_scores')
    .select('player_id, display_name, total_score')
    .eq('session_id', session_id)

  await broadcast(session.code, 'REVEAL', {
    correct_answer: question?.correct_answer,
    explanation:    question?.explanation,
    player_scores:  players ?? [],
    stats:          stats ?? {},
  })

  return NextResponse.json({
    correct_answer: question?.correct_answer,
    explanation:    question?.explanation,
    stats:          stats ?? {},
  })
}
