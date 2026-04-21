import { createAdminClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import Link from 'next/link'
import ReviewClient from './ReviewClient'

export default async function ReviewPage() {
  await requireAdmin()
  const db = createAdminClient()

  // Fetch all unapproved AI questions with context
  const { data: questions } = await db
    .from('quiz_questions')
    .select('id, question, options, correct_answer, explanation, section_id, slide_id, sections(name, classes(name)), slides(title, slide_number)')
    .eq('source', 'ai')
    .eq('approved', false)
    .order('created_at')

  type RawQuestion = {
    id: string
    question: string
    options: Record<string, string>
    correct_answer: string
    explanation: string
    section_id: string
    slide_id: string | null
    sections: { name: string; classes: { name: string } | null } | null
    slides: { title: string | null; slide_number: number } | null
  }

  const rows = ((questions ?? []) as unknown as RawQuestion[]).map(q => ({
    id: q.id,
    question: q.question,
    options: q.options,
    correct_answer: q.correct_answer,
    explanation: q.explanation,
    section_name: q.sections?.name ?? 'Unknown section',
    class_name: q.sections?.classes?.name ?? 'Unknown class',
    slide_title: q.slides?.title ?? null,
    slide_number: q.slides?.slide_number ?? null,
  }))

  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <Link href="/admin" className="text-sm text-gray-500 hover:text-orange-400 transition-colors mb-3 inline-block">
          ← Admin Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-white">✅ Review Queue</h1>
        <p className="text-gray-400 mt-1">
          Approve or delete AI-generated questions before they appear in student quizzes.
        </p>
      </div>
      <ReviewClient initialQuestions={rows} />
    </main>
  )
}
