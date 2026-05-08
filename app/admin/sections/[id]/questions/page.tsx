import { createAdminClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import QuestionsManager from './QuestionsManager'

export const dynamic = 'force-dynamic'

export default async function SectionQuestionsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const db = createAdminClient()

  const { data: section } = await db
    .from('sections')
    .select('id, name, classes(name)')
    .eq('id', id)
    .single()

  if (!section) notFound()

  const cls = section.classes as unknown as { name: string }

  const { data: questions } = await db
    .from('quiz_questions')
    .select('id, question, options, correct_answer, explanation, approved, source')
    .eq('section_id', id)
    .order('approved', { ascending: true })  // pending first
    .order('question',  { ascending: true })

  const rows = (questions ?? []).map(q => ({
    ...q,
    options: q.options as Record<string, string>,
  }))

  const approvedCount = rows.filter(q => q.approved).length

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 flex-wrap">
        <Link href="/admin" className="hover:text-orange-400 transition-colors">Admin</Link>
        <span>›</span>
        <Link href="/admin/sections" className="hover:text-orange-400 transition-colors">All Sections</Link>
        <span>›</span>
        <Link href={`/admin/sections/${id}`} className="hover:text-orange-400 transition-colors">
          {section.name}
        </Link>
        <span>›</span>
        <span className="text-white">Questions</span>
      </nav>

      {/* Header */}
      <div className="mb-6">
        <p className="text-orange-400 text-sm font-medium uppercase tracking-wide">{cls.name}</p>
        <h1 className="text-2xl font-bold text-white mt-0.5">{section.name}</h1>
        <p className="text-gray-400 text-sm mt-1">
          {rows.length} questions · {approvedCount} approved
        </p>
      </div>

      <QuestionsManager initialQuestions={rows} />
    </main>
  )
}
