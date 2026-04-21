'use client'

import { useState } from 'react'

type QuestionRow = {
  id: string
  question: string
  options: Record<string, string>
  correct_answer: string
  explanation: string
  section_name: string
  class_name: string
  slide_title: string | null
  slide_number: number | null
}

export default function ReviewClient({ initialQuestions }: { initialQuestions: QuestionRow[] }) {
  const [questions, setQuestions] = useState<QuestionRow[]>(initialQuestions)
  const [loading, setLoading] = useState<Record<string, 'approving' | 'deleting'>>({})

  const approve = async (id: string) => {
    setLoading(prev => ({ ...prev, [id]: 'approving' }))
    try {
      await fetch(`/api/admin/questions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true }),
      })
      setQuestions(prev => prev.filter(q => q.id !== id))
    } finally {
      setLoading(prev => { const n = { ...prev }; delete n[id]; return n })
    }
  }

  const approveAll = async () => {
    for (const q of questions) {
      await approve(q.id)
    }
  }

  const remove = async (id: string) => {
    setLoading(prev => ({ ...prev, [id]: 'deleting' }))
    try {
      await fetch(`/api/admin/questions/${id}`, { method: 'DELETE' })
      setQuestions(prev => prev.filter(q => q.id !== id))
    } finally {
      setLoading(prev => { const n = { ...prev }; delete n[id]; return n })
    }
  }

  if (questions.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">✅</div>
        <p className="text-white text-xl font-semibold">All caught up!</p>
        <p className="text-gray-400 mt-2">No AI questions pending review.</p>
      </div>
    )
  }

  // Group by section
  const grouped: Record<string, QuestionRow[]> = {}
  for (const q of questions) {
    const key = `${q.class_name} › ${q.section_name}`
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(q)
  }

  return (
    <div>
      {/* Header actions */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <p className="text-gray-400 text-sm">
          {questions.length} question{questions.length !== 1 ? 's' : ''} pending review
        </p>
        <button
          onClick={approveAll}
          className="px-4 py-2 text-sm bg-green-700 hover:bg-green-600 text-white rounded-lg font-medium transition-colors"
        >
          ✓ Approve All
        </button>
      </div>

      {/* Groups */}
      <div className="space-y-10">
        {Object.entries(grouped).map(([groupKey, qs]) => (
          <div key={groupKey}>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-orange-400 mb-3">
              {groupKey}
            </h2>
            <div className="space-y-4">
              {qs.map(q => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  status={loading[q.id]}
                  onApprove={() => approve(q.id)}
                  onDelete={() => remove(q.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function QuestionCard({
  question,
  status,
  onApprove,
  onDelete,
}: {
  question: QuestionRow
  status: 'approving' | 'deleting' | undefined
  onApprove: () => void
  onDelete: () => void
}) {
  const optionColors: Record<string, string> = {
    A: 'text-blue-300',
    B: 'text-purple-300',
    C: 'text-cyan-300',
    D: 'text-pink-300',
  }

  return (
    <div className="p-5 rounded-xl bg-gray-900 border border-gray-800 space-y-4">
      {/* Slide context */}
      {question.slide_title && (
        <p className="text-xs text-gray-600">
          Slide {question.slide_number}: {question.slide_title}
        </p>
      )}

      {/* Question */}
      <p className="text-white font-medium">{question.question}</p>

      {/* Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {Object.entries(question.options).map(([letter, text]) => {
          const isCorrect = letter === question.correct_answer
          return (
            <div
              key={letter}
              className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                isCorrect
                  ? 'bg-green-900/40 border border-green-700/60'
                  : 'bg-gray-800/60 border border-gray-700/40'
              }`}
            >
              <span className={`font-bold shrink-0 ${isCorrect ? 'text-green-400' : optionColors[letter] ?? 'text-gray-400'}`}>
                {letter}.
              </span>
              <span className={isCorrect ? 'text-green-200' : 'text-gray-300'}>{text}</span>
              {isCorrect && <span className="ml-auto text-green-500 shrink-0">✓</span>}
            </div>
          )
        })}
      </div>

      {/* Explanation */}
      <p className="text-gray-400 text-sm border-l-2 border-gray-700 pl-3 italic">
        {question.explanation}
      </p>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={onApprove}
          disabled={!!status}
          className="flex-1 py-2 rounded-lg bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          {status === 'approving' ? 'Approving…' : '✓ Approve'}
        </button>
        <button
          onClick={onDelete}
          disabled={!!status}
          className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-red-900/50 hover:border-red-700 disabled:opacity-50 text-gray-400 hover:text-red-300 text-sm border border-gray-700 transition-colors"
        >
          {status === 'deleting' ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
