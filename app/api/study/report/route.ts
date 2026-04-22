import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase-server'

const VALID_REASONS = [
  'Wrong answer',
  'Bad or confusing question',
  'Typo or grammar',
  'Duplicate question',
  'Other',
]

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { question_id, reason, details } = await req.json()

  if (!question_id || !reason || !VALID_REASONS.includes(reason)) {
    return NextResponse.json({ error: 'question_id and valid reason required' }, { status: 400 })
  }

  const db = createAdminClient()

  // Prevent duplicate open reports from same user for same question
  const { data: existing } = await db
    .from('question_reports')
    .select('id')
    .eq('question_id', question_id)
    .eq('user_id', user.id)
    .eq('resolved', false)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  const { error } = await db.from('question_reports').insert({
    question_id,
    user_id: user.id,
    reason,
    details: details?.trim() || null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
