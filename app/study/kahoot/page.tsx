import { requireUser } from '@/lib/require-user'
import { createAdminClient } from '@/lib/supabase-server'
import KahootCreateClient from './KahootCreateClient'

export const dynamic = 'force-dynamic'

export default async function KahootPage() {
  await requireUser()
  const db = createAdminClient()

  const [{ data: classes }, { data: sections }, { data: qRows }] = await Promise.all([
    db.from('classes').select('id, name, slug, display_order').order('display_order'),
    db.from('sections').select('id, name, class_id').order('name'),
    db.from('quiz_questions').select('section_id').eq('approved', true).limit(10000),
  ])

  const questionCounts: Record<string, number> = {}
  for (const row of qRows ?? []) {
    if (row.section_id) {
      questionCounts[row.section_id] = (questionCounts[row.section_id] ?? 0) + 1
    }
  }

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Host a Live Game</h1>
      <p className="text-gray-400 mb-8">Set up a Kahoot-style quiz for your class. Players join with a 6-character code — no account needed.</p>
      <KahootCreateClient
        classes={classes ?? []}
        sections={sections ?? []}
        questionCounts={questionCounts}
      />
    </main>
  )
}
