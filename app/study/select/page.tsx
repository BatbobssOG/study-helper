import { requireUser } from '@/lib/require-user'
import { createAdminClient } from '@/lib/supabase-server'
import SelectClient from './SelectClient'

export const dynamic = 'force-dynamic'

export default async function SelectPage() {
  await requireUser()
  const db = createAdminClient()

  const [{ data: classes }, { data: sections }, { data: qRows }] = await Promise.all([
    db.from('classes').select('id, name, slug, display_order').order('display_order'),
    db.from('sections').select('id, name, class_id').order('name'),
    // Use a high limit to avoid Supabase's default 1000-row cap truncating counts
    db.from('quiz_questions').select('section_id').eq('approved', true).limit(10000),
  ])

  // Build section_id → count map
  const questionCounts: Record<string, number> = {}
  for (const row of qRows ?? []) {
    if (row.section_id) {
      questionCounts[row.section_id] = (questionCounts[row.section_id] ?? 0) + 1
    }
  }

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Choose What to Study</h1>
      <SelectClient
        classes={classes ?? []}
        sections={sections ?? []}
        questionCounts={questionCounts}
      />
    </main>
  )
}
