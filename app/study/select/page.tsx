import { requireUser } from '@/lib/require-user'
import { createAdminClient } from '@/lib/supabase-server'
import SelectClient from './SelectClient'

export default async function SelectPage() {
  await requireUser()
  const db = createAdminClient()

  const [{ data: classes }, { data: sections }] = await Promise.all([
    db.from('classes').select('id, name, slug, display_order').order('display_order'),
    db.from('sections').select('id, name, class_id').order('name'),
  ])

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <a href="/study" className="text-sm text-gray-400 hover:text-white transition-colors">
          ← Back to dashboard
        </a>
      </div>
      <h1 className="text-2xl font-bold text-white mb-6">Choose What to Study</h1>
      <SelectClient classes={classes ?? []} sections={sections ?? []} />
    </main>
  )
}
