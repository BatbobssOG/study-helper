import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const db = createAdminClient()
  const body = await req.json()
  const { code, display_name, player_id } = body

  if (!code || !display_name?.trim() || !player_id) {
    return NextResponse.json({ error: 'code, display_name, and player_id are required' }, { status: 400 })
  }

  const trimmedName = display_name.trim()
  if (trimmedName.length < 2 || trimmedName.length > 20) {
    return NextResponse.json({ error: 'Display name must be 2–20 characters' }, { status: 400 })
  }

  // ── Fetch session ─────────────────────────────────────────────────────────
  const { data: session, error: sError } = await db
    .from('kahoot_sessions')
    .select('id, state, phase')
    .eq('code', code.toUpperCase())
    .single()

  if (sError || !session) {
    return NextResponse.json({ error: 'Invalid or expired session code' }, { status: 404 })
  }

  // ── Rejoin check — player_id already registered for this session ──────────
  const { data: existing } = await db
    .from('kahoot_player_scores')
    .select('id, display_name, total_score, questions_correct')
    .eq('session_id', session.id)
    .eq('player_id', player_id)
    .maybeSingle()

  if (existing) {
    // Allow rejoin regardless of phase — player resumes with existing score
    return NextResponse.json({
      rejoined: true,
      session_id: session.id,
      display_name: existing.display_name,
      total_score: existing.total_score,
      questions_correct: existing.questions_correct,
    })
  }

  // ── New join — only allowed during lobby ──────────────────────────────────
  if (session.state !== 'lobby') {
    return NextResponse.json({ error: 'This game has already started' }, { status: 409 })
  }

  // ── Insert player row ─────────────────────────────────────────────────────
  const { error: insertError } = await db
    .from('kahoot_player_scores')
    .insert({
      session_id:   session.id,
      player_id,
      display_name: trimmedName,
    })

  if (insertError) {
    // Unique constraint on display_name → name taken
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'That name is already taken' }, { status: 409 })
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    rejoined:    false,
    session_id:  session.id,
    display_name: trimmedName,
    total_score:  0,
    questions_correct: 0,
  })
}
