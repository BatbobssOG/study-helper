import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase-server'

type AnswerEntry = {
  question_id: string
  question: string
  options: { A: string; B: string; C: string; D: string }
  correct_answer: string
  explanation: string
  selected: string
}

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

  const { session_id, answers } = await req.json() as {
    session_id: string
    answers: AnswerEntry[]
  }

  if (!session_id || !Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: 'session_id and answers required' }, { status: 400 })
  }

  const db = createAdminClient()

  // Verify session belongs to user
  const { data: session } = await db
    .from('study_sessions')
    .select('id, user_id')
    .eq('id', session_id)
    .eq('user_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const score = answers.filter((a) => a.selected === a.correct_answer).length
  const total = answers.length

  // Insert quiz attempt
  const { data: attempt, error: attemptError } = await db
    .from('quiz_attempts')
    .insert({
      session_id,
      user_id: user.id,
      score,
      total,
      answers,
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (attemptError) return NextResponse.json({ error: attemptError.message }, { status: 500 })

  // Mark session complete
  await db
    .from('study_sessions')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', session_id)

  return NextResponse.json({ attempt_id: attempt.id, score, total })
}
