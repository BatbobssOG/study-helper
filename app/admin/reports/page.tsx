import { requireAdmin } from '@/lib/require-admin'
import { createAdminClient } from '@/lib/supabase-server'
import ReportsClient from './ReportsClient'

export default async function ReportsPage() {
  await requireAdmin()
  const db = createAdminClient()

  const { data: reports } = await db
    .from('question_reports')
    .select(`
      id,
      reason,
      details,
      created_at,
      resolved,
      resolved_at,
      question_id,
      quiz_questions (
        id,
        question,
        options,
        correct_answer,
        explanation,
        approved
      )
    `)
    .eq('resolved', false)
    .order('created_at', { ascending: false })

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <a href="/admin" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            ← Admin Dashboard
          </a>
          <h1 className="text-3xl font-bold text-white mt-2">🚩 Question Reports</h1>
          <p className="text-gray-400 mt-1">
            {reports?.length ?? 0} unresolved report{reports?.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {!reports || reports.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <div className="text-4xl mb-3">✅</div>
          <p>No open reports — all clear.</p>
        </div>
      ) : (
        <ReportsClient reports={reports as Parameters<typeof ReportsClient>[0]['reports']} />
      )}
    </main>
  )
}
