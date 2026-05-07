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
    .select('section_ids, class_ids, question_count, user_id')
    .eq('id', session_id)
    .eq('user_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const limit      = session.question_count ?? 20
  const sectionIds: string[] = session.section_ids ?? []
  const classIds:   string[] = session.class_ids   ?? []

  type QRow = {
    id: string
    question: string
    options: unknown
    correct_answer: string
    explanation: string
  }

  let pool: QRow[]

  if (sectionIds.length > 0) {
    // Fetch from each section independently so every selected section is
    // represented in the pool, regardless of physical storage order.
    // perSection: give each section at least 10 slots, scaling so the
    // merged pool is roughly 3× the quiz size before we shuffle-down.
    const perSection = Math.max(10, Math.ceil((limit * 3) / sectionIds.length))

    const results = await Promise.all(
      sectionIds.map((sid) =>
        db
          .from('quiz_questions')
          .select('id, question, options, correct_answer, explanation')
          .eq('approved', true)
          .eq('section_id', sid)
          .limit(perSection)
      )
    )
    pool = results.flatMap((r) => r.data ?? [])
  } else {
    // No specific sections — pull from the whole class
    const { data } = await db
      .from('quiz_questions')
      .select('id, question, options, correct_answer, explanation')
      .eq('approved', true)
      .in('class_id', classIds)
      .limit(limit * 5)
    pool = data ?? []
  }

  // Shuffle the merged pool, then take the requested quiz size
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, limit)

  return NextResponse.json({
    questions: shuffled.map((q) => {
      const o = q.options as Record<string, string>
      return {
        ...q,
        options: {
          A: o.A ?? o.a ?? '',
          B: o.B ?? o.b ?? '',
          C: o.C ?? o.c ?? '',
          D: o.D ?? o.d ?? '',
        },
        correct_answer: (q.correct_answer as string).toUpperCase(),
      }
    }),
  })
}
