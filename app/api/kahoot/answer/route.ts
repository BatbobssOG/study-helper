import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const db = createAdminClient()
  const body = await req.json()
  const { session_id, player_id, selected_answer } = body

  if (!session_id || !player_id) {
    return NextResponse.json({ error: 'session_id and player_id are required' }, { status: 400 })
  }
  if (selected_answer && !['A', 'B', 'C', 'D'].includes(selected_answer)) {
    return NextResponse.json({ error: 'selected_answer must be A, B, C, or D' }, { status: 400 })
  }

  // ── Fetch session ─────────────────────────────────────────────────────────
  const { data: session, error: sErr } = await db
    .from('kahoot_sessions')
    .select('id, state, phase, current_question_index, question_ids, question_revealed_at, time_limit_seconds')
    .eq('id', session_id)
    .single()

  if (sErr || !session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.state !== 'in_progress' || session.phase !== 'question') {
    return NextResponse.json({ error: 'Not accepting answers right now' }, { status: 409 })
  }

  // ── Verify player is registered ───────────────────────────────────────────
  const { data: player } = await db
    .from('kahoot_player_scores')
    .select('id')
    .eq('session_id', session_id)
    .eq('player_id', player_id)
    .maybeSingle()

  if (!player) return NextResponse.json({ error: 'Player not found in this session' }, { status: 403 })

  const now = new Date()
  const revealedAt = session.question_revealed_at ? new Date(session.question_revealed_at) : null
  const timeLimitMs = session.time_limit_seconds * 1000

  // ── Late submission check ─────────────────────────────────────────────────
  if (revealedAt && now.getTime() > revealedAt.getTime() + timeLimitMs) {
    return NextResponse.json({ late: true, score: 0 })
  }

  // ── Fetch correct answer ──────────────────────────────────────────────────
  const questionId = session.question_ids[session.current_question_index]
  const { data: question } = await db
    .from('quiz_questions')
    .select('correct_answer')
    .eq('id', questionId)
    .single()

  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 500 })

  const isCorrect = selected_answer === question.correct_answer
  const responseMs = revealedAt ? now.getTime() - revealedAt.getTime() : null

  // ── Score calculation ─────────────────────────────────────────────────────
  let scoreAwarded = 0
  if (isCorrect && responseMs !== null) {
    const timeRemainingMs = Math.max(0, timeLimitMs - responseMs)
    const speedBonus = Math.floor(500 * (timeRemainingMs / timeLimitMs))
    scoreAwarded = 1000 + speedBonus
  }

  // ── Insert answer (UNIQUE constraint prevents duplicates) ─────────────────
  const { error: insertErr } = await db
    .from('kahoot_answers')
    .insert({
      session_id,
      player_id,
      question_id:     questionId,
      question_index:  session.current_question_index,
      selected_answer: selected_answer ?? null,
      is_correct:      isCorrect,
      score_awarded:   scoreAwarded,
      response_ms:     responseMs,
      answered_at:     now.toISOString(),
    })

  if (insertErr) {
    // 23505 = unique violation — player already answered this question
    if (insertErr.code === '23505') {
      return NextResponse.json({ already_answered: true })
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // ── Atomic score update ───────────────────────────────────────────────────
  await db.rpc('increment_player_score', {
    p_session_id: session_id,
    p_player_id:  player_id,
    p_score:      scoreAwarded,
    p_correct:    isCorrect ? 1 : 0,
    p_seen_at:    now.toISOString(),
  })

  // ── Atomic question stat increment ────────────────────────────────────────
  const answerCol = selected_answer
    ? `answers_${selected_answer.toLowerCase()}` as 'answers_a' | 'answers_b' | 'answers_c' | 'answers_d'
    : null

  await db.rpc('increment_question_stat', {
    p_session_id:    session_id,
    p_question_index: session.current_question_index,
    p_answer_col:    answerCol ?? 'answers_timeout',
    p_is_correct:    isCorrect,
    p_response_ms:   responseMs,
  })

  return NextResponse.json({ score_awarded: scoreAwarded, is_correct: isCorrect })
}
