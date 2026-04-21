import { requireUser } from '@/lib/require-user'
import { createAdminClient } from '@/lib/supabase-server'
import Link from 'next/link'

export default async function StudyPage() {
  const { userId } = await requireUser()
  const db = createAdminClient()

  const [{ data: sessions }, { count: totalSessions }, { count: masteredCount }] = await Promise.all([
    db
      .from('study_sessions')
      .select('id, mode, started_at, completed_at')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(5),
    db
      .from('study_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    db
      .from('flashcard_progress')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'mastered'),
  ])

  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Study Dashboard</h1>
        <p className="text-gray-400 mt-1">SAIT Winter 2026 Pre-Employment Pipetrades</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="p-5 bg-gray-900 border border-gray-800 rounded-xl">
          <div className="text-3xl font-bold text-orange-400">{totalSessions ?? 0}</div>
          <div className="text-sm text-gray-400 mt-1">Study sessions</div>
        </div>
        <div className="p-5 bg-gray-900 border border-gray-800 rounded-xl">
          <div className="text-3xl font-bold text-green-400">{masteredCount ?? 0}</div>
          <div className="text-sm text-gray-400 mt-1">Cards mastered</div>
        </div>
      </div>

      <Link
        href="/study/select"
        className="block w-full text-center py-4 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-xl text-lg transition-colors mb-8"
      >
        Start Studying
      </Link>

      {sessions && sessions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Recent Sessions</h2>
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{s.mode === 'flashcard' ? '🃏' : '📝'}</span>
                  <span className="text-white capitalize">{s.mode} session</span>
                </div>
                <div className="flex items-center gap-3">
                  {s.completed_at ? (
                    <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">
                      Completed
                    </span>
                  ) : (
                    <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded">
                      In progress
                    </span>
                  )}
                  <span className="text-xs text-gray-500">
                    {new Date(s.started_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
