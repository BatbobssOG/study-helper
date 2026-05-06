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
    .select('id, code, phase, host_user_id, current_question_index, question_ids, question_count, time_limit_seconds')
    .eq('id', session_id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.host_user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (session.phase !== 'leaderboard') return NextResponse.json({ error: 'Wrong phase' }, { status: 409 })

  const nextIndex = session.current_question_index + 1
  const now = new Date().toISOString()

  // Snapshot expected_answer_count from current registered players
  const { count: playerCount } = await db
    .from('kahoot_player_scores')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session_id)

  await db
    .from('kahoot_sessions')
    .update({
      phase:                  'question',
      current_question_index: nextIndex,
      question_revealed_at:   now,
      expected_answer_count:  playerCount ?? 0,
    })
    .eq('id', session_id)
    .eq('phase', 'leaderboard')

  // Fetch next question (withhold correct_answer from broadcast)
  const nextQuestionId = session.question_ids[nextIndex]
  const { data: question } = await db
    .from('quiz_questions')
    .select('id, question, options')
    .eq('id', nextQuestionId)
    .single()

  await broadcast(session.code, 'QUESTION', {
    index:        nextIndex,
    question_text: question?.question,
    options:      question?.options,
    revealed_at:  now,
    time_limit_seconds: session.time_limit_seconds,
  })

  return NextResponse.json({ ok: true, index: nextIndex })
}
