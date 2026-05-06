import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } }
) {
  const code = params.code?.toUpperCase()
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

  const db = createAdminClient()

  // Run lazy cleanup before fetching — free-tier fallback for pg_cron
  await db.rpc('cleanup_stale_kahoot_sessions')

  const { data: session, error } = await db
    .from('kahoot_sessions')
    .select('*')
    .eq('code', code)
    .single()

  if (error || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // Fetch players
  const { data: players } = await db
    .from('kahoot_player_scores')
    .select('player_id, display_name, total_score, questions_correct, final_rank, joined_at, last_seen_at')
    .eq('session_id', session.id)
    .order('total_score', { ascending: false })

  // Fetch current question if game is active
  let currentQuestion = null
  if (
    session.state === 'in_progress' &&
    session.phase !== 'finished' &&
    session.question_ids?.length > 0
  ) {
    const qId = session.question_ids[session.current_question_index]
    if (qId) {
      const { data: q } = await db
        .from('quiz_questions')
        .select('id, question, options, correct_answer, explanation')
        .eq('id', qId)
        .single()
      // Only expose correct_answer during/after reveal phase
      if (q) {
        currentQuestion = {
          id: q.id,
          question: q.question,
          options: q.options,
          explanation: q.explanation,
          correct_answer: session.phase === 'revealed' || session.phase === 'leaderboard'
            ? q.correct_answer
            : null,
        }
      }
    }
  }

  return NextResponse.json({
    session: {
      id:                     session.id,
      code:                   session.code,
      name:                   session.name,
      host_user_id:           session.host_user_id,
      class_id:               session.class_id,
      question_count:         session.question_count,
      time_limit_seconds:     session.time_limit_seconds,
      state:                  session.state,
      phase:                  session.phase,
      current_question_index: session.current_question_index,
      expected_answer_count:  session.expected_answer_count,
      question_revealed_at:   session.question_revealed_at,
      host_last_seen_at:      session.host_last_seen_at,
      started_at:             session.started_at,
      ended_at:               session.ended_at,
    },
    players:         players ?? [],
    currentQuestion,
  })
}
