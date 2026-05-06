import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params
  const db = createAdminClient()

  const { data: session } = await db
    .from('kahoot_sessions')
    .select('current_question_index, expected_answer_count')
    .eq('id', sessionId)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const { count: answered } = await db
    .from('kahoot_answers')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('question_index', session.current_question_index)

  // Check for disconnected players (last_seen_at > 30s ago)
  const cutoff = new Date(Date.now() - 30_000).toISOString()
  const { count: disconnected } = await db
    .from('kahoot_player_scores')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .lt('last_seen_at', cutoff)

  return NextResponse.json({
    answered:     answered ?? 0,
    expected:     session.expected_answer_count ?? 0,
    disconnected: disconnected ?? 0,
  })
}
