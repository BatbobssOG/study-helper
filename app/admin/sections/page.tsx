import { createAdminClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import Link from 'next/link'

type SectionRow = {
  id: string
  name: string
  slide_count: number
  question_count: number
  ai_pending: number
  class_name: string
}

export default async function SectionsPage() {
  await requireAdmin()
  const db = createAdminClient()

  // Fetch all sections with class name
  const { data: sections } = await db
    .from('sections')
    .select('id, name, classes(name)')
    .order('name')

  if (!sections) {
    return (
      <main className="min-h-screen p-8 max-w-4xl mx-auto">
        <p className="text-gray-500">No sections found.</p>
      </main>
    )
  }

  // Fetch slide counts per section
  const { data: slideCounts } = await db
    .from('slides')
    .select('section_id')

  // Fetch question counts per section
  const { data: questionRows } = await db
    .from('quiz_questions')
    .select('section_id, source, approved')

  // Build maps
  const slideCountMap: Record<string, number> = {}
  for (const s of slideCounts ?? []) {
    slideCountMap[s.section_id] = (slideCountMap[s.section_id] ?? 0) + 1
  }

  const qMap: Record<string, { total: number; aiPending: number }> = {}
  for (const q of questionRows ?? []) {
    if (!qMap[q.section_id]) qMap[q.section_id] = { total: 0, aiPending: 0 }
    qMap[q.section_id].total++
    if (q.source === 'ai' && !q.approved) qMap[q.section_id].aiPending++
  }

  // Group by class
  const grouped: Record<string, SectionRow[]> = {}
  for (const s of sections) {
    const className = (s.classes as unknown as { name: string })?.name ?? 'Unknown'
    if (!grouped[className]) grouped[className] = []
    grouped[className].push({
      id: s.id,
      name: s.name,
      slide_count: slideCountMap[s.id] ?? 0,
      question_count: qMap[s.id]?.total ?? 0,
      ai_pending: qMap[s.id]?.aiPending ?? 0,
      class_name: className,
    })
  }

  const classOrder = Object.keys(grouped).sort()

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <Link href="/admin" className="text-sm text-gray-500 hover:text-orange-400 transition-colors mb-3 inline-block">
          ← Admin Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-white">📑 All Sections</h1>
        <p className="text-gray-400 mt-1">Click a section to manage slides and generate AI questions.</p>
      </div>

      <div className="space-y-8">
        {classOrder.map(className => (
          <div key={className}>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-orange-400 mb-3">
              {className}
            </h2>
            <div className="space-y-2">
              {grouped[className].map(section => (
                <Link
                  key={section.id}
                  href={`/admin/sections/${section.id}`}
                  className="flex items-center justify-between p-4 rounded-xl bg-gray-900 border border-gray-800 hover:border-orange-500 transition-colors group"
                >
                  <div>
                    <p className="text-white font-medium group-hover:text-orange-300 transition-colors">
                      {section.name}
                    </p>
                    <p className="text-gray-500 text-sm mt-0.5">
                      {section.slide_count > 0 ? `${section.slide_count} slides` : 'No slides'}
                      {' · '}
                      {section.question_count} questions
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {section.ai_pending > 0 && (
                      <span className="text-xs px-2 py-1 rounded-full bg-yellow-900/50 text-yellow-400 border border-yellow-800">
                        {section.ai_pending} pending review
                      </span>
                    )}
                    {section.slide_count > 0 && section.question_count === 0 && (
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-800 text-gray-500 border border-gray-700">
                        Not generated
                      </span>
                    )}
                    <span className="text-gray-600 group-hover:text-orange-400 transition-colors">→</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
