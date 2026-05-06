import { requireUser } from '@/lib/require-user'
import { createAdminClient } from '@/lib/supabase-server'
import SelectClient from './SelectClient'

export const dynamic = 'force-dynamic'

export default async function SelectPage() {
  await requireUser()
  const db = createAdminClient()

  const [{ data: classes }, { data: sections }, { data: countRows }] = await Promise.all([
    db.from('classes').select('id, name, slug, display_order').order('display_order'),
    db.from('sections').select('id, name, class_id').order('name'),
    // Server-side aggregate: avoids PostgREST's 1000-row cap that silently
    // truncated the per-section counts when total approved > 1000.
    db.rpc('approved_question_counts_by_section'),
  ])

  // Build section_id → count map
  const questionCounts: Record<string, number> = {}
  for (const row of (countRows ?? []) as { section_id: string; question_count: number }[]) {
    questionCounts[row.section_id] = Number(row.question_count)
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
