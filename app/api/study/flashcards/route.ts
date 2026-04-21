import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
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

  const session_id = req.nextUrl.searchParams.get('session')
  if (!session_id) return NextResponse.json({ error: 'session required' }, { status: 400 })

  const db = createAdminClient()

  const { data: session } = await db
    .from('study_sessions')
    .select('section_ids, class_ids, user_id')
    .eq('id', session_id)
    .eq('user_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  let query = db
    .from('quiz_questions')
    .select('id, question, options, correct_answer, explanation, section_id')
    .eq('approved', true)
    .limit(50)

  if (session.section_ids?.length) {
    query = query.in('section_id', session.section_ids)
  } else {
    query = query.in('class_id', session.class_ids)
  }

  const { data: questions, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const shuffled = [...(questions ?? [])].sort(() => Math.random() - 0.5)

  const { data: progress } = await db
    .from('flashcard_progress')
    .select('question_id, status')
    .eq('user_id', user.id)
    .in('question_id', shuffled.map((q) => q.id))

  const progressMap = new Map(
    (progress ?? []).map((p) => [p.question_id, p.status])
  )

  return NextResponse.json({
    cards: shuffled.map((q) => ({
      ...q,
      progress: progressMap.get(q.id) ?? null,
    })),
  })
}
