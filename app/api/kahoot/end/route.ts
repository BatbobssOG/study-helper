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
    .select('id, code, state, host_user_id')
    .eq('id', session_id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.host_user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (session.state !== 'in_progress') return NextResponse.json({ error: 'Game is not in progress' }, { status: 409 })

  // Finalize session
  await db
    .from('kahoot_sessions')
    .update({ state: 'finished', phase: 'finished', ended_at: new Date().toISOString() })
    .eq('id', session_id)

  // Calculate and write final ranks (score desc → questions_correct desc → display_name asc)
  const { data: players } = await db
    .from('kahoot_player_scores')
    .select('id, player_id, display_name, total_score, questions_correct')
    .eq('session_id', session_id)
    .order('total_score', { ascending: false })
    .order('questions_correct', { ascending: false })
    .order('display_name', { ascending: true })

  if (players && players.length > 0) {
    const updates = players.map((p, i) =>
      db.from('kahoot_player_scores').update({ final_rank: i + 1 }).eq('id', p.id)
    )
    await Promise.all(updates)
  }

  const finalRankings = (players ?? []).map((p, i) => ({
    final_rank:   i + 1,
    display_name: p.display_name,
    total_score:  p.total_score,
    questions_correct: p.questions_correct,
  }))

  await broadcast(session.code, 'GAME_END', { final_rankings: finalRankings })

  return NextResponse.json({ ok: true, final_rankings: finalRankings })
}
