import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase-server'

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

  const { question_id, status } = await req.json()

  if (!question_id || !['mastered', 'learning'].includes(status)) {
    return NextResponse.json({ error: 'question_id and valid status required' }, { status: 400 })
  }

  const db = createAdminClient()
  const { error } = await db
    .from('flashcard_progress')
    .upsert(
      { user_id: user.id, question_id, status, last_reviewed: new Date().toISOString() },
      { onConflict: 'user_id,question_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
