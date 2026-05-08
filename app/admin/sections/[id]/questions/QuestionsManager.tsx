'use client'

import { useState } from 'react'

type QuestionRow = {
  id: string
  question: string
  options: Record<string, string>
  correct_answer: string
  explanation: string
  approved: boolean
  source: string
}

type Filter = 'all' | 'approved' | 'pending'

export default function QuestionsManager({
  initialQuestions,
}: {
  initialQuestions: QuestionRow[]
}) {
  const [questions, setQuestions] = useState<QuestionRow[]>(initialQuestions)
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const handleDelete = async (id: string) => {
    setDeleting(prev => ({ ...prev, [id]: true }))
    try {
      const res = await fetch(`/api/admin/questions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setQuestions(prev => prev.filter(q => q.id !== id))
      }
    } finally {
      setDeleting(prev => { const n = { ...prev }; delete n[id]; return n })
      setConfirmId(null)
    }
  }

  const visible = questions.filter(q => {
    if (filter === 'approved') return q.approved
    if (filter === 'pending') return !q.approved
    return true
  })

  const approvedCount = questions.filter(q => q.approved).length
  const pendingCount  = questions.filter(q => !q.approved).length

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-1 p-1 bg-gray-900 border border-gray-800 rounded-xl mb-6 w-fit">
        {([
          ['all',      `All (${questions.length})`],
          ['approved', `Approved (${approvedCount})`],
          ['pending',  `Pending (${pendingCount})`],
        ] as [Filter, string][]).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              filter === val
                ? 'bg-orange-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-3xl mb-3">📭</p>
          <p>No questions match this filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map(q => {
            const isConfirming = confirmId === q.id
            const isDeleting   = deleting[q.id]

            return (
              <div
                key={q.id}
                className={`p-5 rounded-xl border space-y-3 ${
                  q.approved
                    ? 'bg-gray-900 border-gray-800'
                    : 'bg-yellow-950/20 border-yellow-800/30'
                }`}
              >
                {/* Status badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    q.approved
                      ? 'bg-green-900/50 text-green-400 border border-green-800'
                      : 'bg-yellow-900/50 text-yellow-400 border border-yellow-800'
                  }`}>
                    {q.approved ? '✓ Approved' : '⏳ Pending'}
                  </span>
                  <span className="text-xs text-gray-600">
                    {q.source === 'ai' ? 'AI generated' : 'Uploaded'}
                  </span>
                </div>

                {/* Question */}
                <p className="text-white font-medium leading-snug">{q.question}</p>

                {/* Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {(['A', 'B', 'C', 'D'] as const).map(letter => {
                    const text = q.options[letter] ?? ''
                    if (!text) return null
                    const isCorrect = letter === q.correct_answer
                    return (
                      <div
                        key={letter}
                        className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                          isCorrect
                            ? 'bg-green-900/40 border border-green-700/60'
                            : 'bg-gray-800/60 border border-gray-700/40'
                        }`}
                      >
                        <span className={`font-bold shrink-0 ${isCorrect ? 'text-green-400' : 'text-gray-500'}`}>
                          {letter}.
                        </span>
                        <span className={isCorrect ? 'text-green-200' : 'text-gray-300'}>{text}</span>
                        {isCorrect && <span className="ml-auto text-green-500 shrink-0">✓</span>}
                      </div>
                    )
                  })}
                </div>

                {/* Explanation */}
                {q.explanation && (
                  <p className="text-gray-400 text-sm border-l-2 border-gray-700 pl-3 italic leading-relaxed">
                    {q.explanation}
                  </p>
                )}

                {/* Delete */}
                <div className="flex items-center gap-3 pt-1">
                  {isConfirming ? (
                    <>
                      <span className="text-sm text-red-300">Delete this question?</span>
                      <button
                        onClick={() => handleDelete(q.id)}
                        disabled={isDeleting}
                        className="px-3 py-1.5 text-sm rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-medium transition-colors"
                      >
                        {isDeleting ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmId(q.id)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 hover:bg-red-900/50 border border-gray-700 hover:border-red-700 text-gray-400 hover:text-red-300 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
