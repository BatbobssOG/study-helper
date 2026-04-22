'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Report = {
  id: string
  reason: string
  details: string | null
  created_at: string
  resolved: boolean
  question_id: string
  quiz_questions: {
    id: string
    question: string
    options: { A: string; B: string; C: string; D: string }
    correct_answer: string
    explanation: string
    approved: boolean
  } | null
}

export default function ReportsClient({ reports }: { reports: Report[] }) {
  const router = useRouter()
  const [resolving, setResolving] = useState<string | null>(null)
  const [list, setList] = useState(reports)

  const resolve = async (reportId: string) => {
    setResolving(reportId)
    await fetch('/api/admin/reports/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_id: reportId }),
    })
    setList((prev) => prev.filter((r) => r.id !== reportId))
    setResolving(null)
  }

  const dismiss = async (reportId: string) => {
    setResolving(reportId)
    await fetch('/api/admin/reports/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_id: reportId }),
    })
    setList((prev) => prev.filter((r) => r.id !== reportId))
    setResolving(null)
  }

  if (list.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500">
        <div className="text-4xl mb-3">✅</div>
        <p>All reports resolved.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {list.map((report) => {
        const q = report.quiz_questions
        return (
          <div
            key={report.id}
            className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden"
          >
            {/* Report header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-red-500/5">
              <div className="flex items-center gap-3">
                <span className="text-red-400 text-sm">🚩</span>
                <span className="text-sm font-semibold text-red-300">{report.reason}</span>
                {report.details && (
                  <span className="text-xs text-gray-500 italic">"{report.details}"</span>
                )}
              </div>
              <span className="text-xs text-gray-600">
                {new Date(report.created_at).toLocaleDateString()}
              </span>
            </div>

            {/* Question content */}
            {q ? (
              <div className="p-5 space-y-4">
                <p className="text-white text-sm leading-relaxed">{q.question}</p>

                <div className="space-y-1.5">
                  {(['A', 'B', 'C', 'D'] as const).map((key) => (
                    <div
                      key={key}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                        key === q.correct_answer
                          ? 'bg-green-500/10 text-green-300'
                          : 'text-gray-500'
                      }`}
                    >
                      <span className={`w-5 h-5 flex items-center justify-center rounded text-xs font-bold flex-shrink-0 ${
                        key === q.correct_answer ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-600'
                      }`}>
                        {key}
                      </span>
                      <span>{q.options[key]}</span>
                      {key === q.correct_answer && (
                        <span className="ml-auto text-xs text-green-600 font-medium">Correct</span>
                      )}
                    </div>
                  ))}
                </div>

                {q.explanation && (
                  <p className="text-xs text-gray-500 border-t border-gray-800 pt-3">
                    <span className="uppercase tracking-wide text-gray-600">Explanation: </span>
                    {q.explanation}
                  </p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 pt-1">
                  <a
                    href={`/admin/review?highlight=${q.id}`}
                    className="px-4 py-2 bg-orange-600/20 hover:bg-orange-600/40 border border-orange-600/40 text-orange-300 text-sm font-medium rounded-lg transition-colors"
                  >
                    Edit question →
                  </a>
                  <button
                    onClick={() => dismiss(report.id)}
                    disabled={resolving === report.id}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {resolving === report.id ? 'Resolving…' : 'Dismiss report'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-5">
                <p className="text-gray-500 text-sm">Question was deleted.</p>
                <button
                  onClick={() => resolve(report.id)}
                  disabled={resolving === report.id}
                  className="mt-3 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
