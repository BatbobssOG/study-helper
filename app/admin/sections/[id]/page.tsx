import { createAdminClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'
import { notFound } from 'next/navigation'
import SectionManager from './SectionManager'

export default async function SectionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const db = createAdminClient()

  // Fetch section + class
  const { data: section, error: secErr } = await db
    .from('sections')
    .select('id, name, class_id, classes(id, name)')
    .eq('id', id)
    .single()

  if (secErr || !section) notFound()

  const cls = section.classes as unknown as { id: string; name: string }

  // Fetch slides ordered by slide number
  const { data: slides } = await db
    .from('slides')
    .select('id, slide_number, title, content')
    .eq('section_id', id)
    .order('slide_number')

  // Fetch question counts per slide for this section
  const { data: qRows } = await db
    .from('quiz_questions')
    .select('slide_id, source, approved')
    .eq('section_id', id)
    .not('slide_id', 'is', null)

  // Build per-slide count map
  const countMap: Record<string, { ai: number; uploaded: number; approved: number }> = {}
  for (const q of qRows ?? []) {
    if (!q.slide_id) continue
    if (!countMap[q.slide_id]) countMap[q.slide_id] = { ai: 0, uploaded: 0, approved: 0 }
    if (q.source === 'ai') countMap[q.slide_id].ai++
    else countMap[q.slide_id].uploaded++
    if (q.approved) countMap[q.slide_id].approved++
  }

  const slideRows = (slides ?? []).map(s => ({
    id: s.id,
    slide_number: s.slide_number,
    title: s.title,
    content: s.content,
    counts: countMap[s.id] ?? { ai: 0, uploaded: 0, approved: 0 },
  }))

  return (
    <SectionManager
      section={{ id: section.id, name: section.name }}
      className={cls.name}
      slides={slideRows}
    />
  )
}
