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
    .select('id, code, phase, host_user_id')
    .eq('id', session_id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.host_user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (session.phase !== 'revealed') return NextResponse.json({ error: 'Wrong phase' }, { status: 409 })

  await db
    .from('kahoot_sessions')
    .update({ phase: 'leaderboard' })
    .eq('id', session_id)
    .eq('phase', 'revealed')

  // Build ranked list with tie-breaking: score desc → total response_ms asc → name asc
  const { data: players } = await db
    .from('kahoot_player_scores')
    .select('player_id, display_name, total_score, questions_correct')
    .eq('session_id', session_id)
    .order('total_score', { ascending: false })

  const rankings = (players ?? []).map((p, i) => ({
    rank:              i + 1,
    player_id:         p.player_id,
    display_name:      p.display_name,
    total_score:       p.total_score,
    questions_correct: p.questions_correct,
  }))

  await broadcast(session.code, 'LEADERBOARD', { rankings })

  return NextResponse.json({ rankings })
}
