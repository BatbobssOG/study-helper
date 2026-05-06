import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { requireUser } from '@/lib/require-user'
import { broadcast } from '@/lib/kahoot-broadcast'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await requireUser()
  const db = createAdminClient()
  const { session_id } = await req.json()

  if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 })

  // Fetch session and verify ownership
  const { data: session, error } = await db
    .from('kahoot_sessions')
    .select('id, code, state, phase, question_count, time_limit_seconds, host_user_id')
    .eq('id', session_id)
    .single()

  if (error || !session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.host_user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (session.state !== 'lobby') return NextResponse.json({ error: 'Game already started' }, { status: 409 })

  // Must have at least 2 players
  const { count } = await db
    .from('kahoot_player_scores')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session_id)

  if ((count ?? 0) < 2) {
    return NextResponse.json({ error: 'Need at least 2 players to start' }, { status: 400 })
  }

  // Update session state
  const { error: updateError } = await db
    .from('kahoot_sessions')
    .update({ state: 'in_progress', phase: 'question', started_at: new Date().toISOString() })
    .eq('id', session_id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await broadcast(session.code, 'GAME_START', {
    question_count:     session.question_count,
    time_limit_seconds: session.time_limit_seconds,
  })

  return NextResponse.json({ ok: true })
}
