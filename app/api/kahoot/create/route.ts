import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { requireUser } from '@/lib/require-user'

export const dynamic = 'force-dynamic'

// Characters to use in session codes — excludes 0,O,1,I,L to avoid visual ambiguity
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generateCode(): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

export async function POST(req: NextRequest) {
  const user = await requireUser()
  const db = createAdminClient()

  const body = await req.json()
  const { name, class_id, section_ids, question_count, time_limit_seconds } = body

  // ── Validate inputs ───────────────────────────────────────────────────────
  if (!name?.trim() || name.trim().length > 40) {
    return NextResponse.json({ error: 'Session name is required (max 40 chars)' }, { status: 400 })
  }
  if (!class_id) {
    return NextResponse.json({ error: 'class_id is required' }, { status: 400 })
  }
  if (!Array.isArray(section_ids) || section_ids.length === 0) {
    return NextResponse.json({ error: 'Select at least one section' }, { status: 400 })
  }
  if (![10, 20, 30].includes(question_count)) {
    return NextResponse.json({ error: 'question_count must be 10, 20, or 30' }, { status: 400 })
  }
  if (![15, 20, 30].includes(time_limit_seconds)) {
    return NextResponse.json({ error: 'time_limit_seconds must be 15, 20, or 30' }, { status: 400 })
  }

  // ── Draw questions ────────────────────────────────────────────────────────
  const { data: available, error: qError } = await db
    .from('quiz_questions')
    .select('id')
    .in('section_id', section_ids)
    .eq('approved', true)
    .limit(10000)

  if (qError) return NextResponse.json({ error: qError.message }, { status: 500 })

  if (!available || available.length < question_count) {
    return NextResponse.json(
      { error: `Not enough questions (need ${question_count}, found ${available?.length ?? 0} in selected sections)` },
      { status: 400 }
    )
  }

  // Fisher-Yates shuffle then slice
  const pool = available.map(r => r.id)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const question_ids = pool.slice(0, question_count)

  // ── Generate unique session code ──────────────────────────────────────────
  let code = ''
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateCode()
    const { data: existing } = await db
      .from('kahoot_sessions')
      .select('id')
      .eq('code', candidate)
      .in('state', ['lobby', 'in_progress'])
      .maybeSingle()

    if (!existing) { code = candidate; break }
  }

  if (!code) {
    return NextResponse.json({ error: 'Failed to generate unique session code. Try again.' }, { status: 500 })
  }

  // ── Create session ────────────────────────────────────────────────────────
  const { data: session, error: insertError } = await db
    .from('kahoot_sessions')
    .insert({
      code,
      name: name.trim(),
      host_user_id: user.id,
      class_id,
      section_ids,
      question_ids,
      question_count,
      time_limit_seconds,
      state: 'lobby',
      phase: 'lobby',
    })
    .select('id, code')
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ session_id: session.id, code: session.code })
}
