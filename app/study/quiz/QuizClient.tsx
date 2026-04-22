'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type Question = {
  id: string
  question: string
  options: { A: string; B: string; C: string; D: string }
  correct_answer: string
  explanation: string
}

type AnswerMap = Record<string, string> // question_id -> selected letter

const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const

export default function QuizClient({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [questions, setQuestions] = useState<Question[]>([])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/study/quiz?session=${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setQuestions(data.questions)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [sessionId])

  const currentQ = questions[index]
  const selectedForCurrent = currentQ ? answers[currentQ.id] : undefined
  const isLast = index === questions.length - 1
  const answeredCount = Object.keys(answers).length

  const selectAnswer = useCallback((letter: string) => {
    if (!currentQ) return
    setAnswers((prev) => ({ ...prev, [currentQ.id]: letter }))
  }, [currentQ])

  const handleNext = useCallback(() => {
    if (index < questions.length - 1) {
      setIndex((i) => i + 1)
    }
  }, [index, questions.length])

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    try {
      const payload = questions.map((q) => ({
        question_id: q.id,
        question: q.question,
        options: q.options,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        selected: answers[q.id] ?? '',
      }))

      const res = await fetch('/api/study/submit-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, answers: payload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Submission failed')
      router.push(`/study/quiz/results?attempt=${data.attempt_id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSubmitting(false)
    }
  }, [questions, answers, sessionId, router])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (loading || submitting || !currentQ) return
      const keyMap: Record<string, string> = { a: 'A', b: 'B', c: 'C', d: 'D', '1': 'A', '2': 'B', '3': 'C', '4': 'D' }
      const letter = keyMap[e.key.toLowerCase()]
      if (letter) {
        selectAnswer(letter)
      } else if (e.code === 'ArrowRight' || e.code === 'Enter') {
        if (selectedForCurrent) {
          if (isLast) handleSubmit()
          else handleNext()
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [loading, submitting, currentQ, selectedForCurrent, isLast, selectAnswer, handleNext, handleSubmit])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col p-6 max-w-2xl mx-auto">
        <div className="w-full h-2 bg-gray-800 rounded-full mb-8 mt-12 animate-pulse" />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-[560px] min-h-[360px] bg-gray-900 border border-gray-800 rounded-2xl animate-pulse" />
        </div>
        <div className="mt-8 h-14 bg-gray-800 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <p className="text-red-400">{error}</p>
          <a href="/study/select" className="text-orange-400 hover:text-orange-300 underline">
            Back to selection
          </a>
        </div>
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <div className="text-4xl">📭</div>
          <h2 className="text-xl font-semibold text-white">No questions found</h2>
          <p className="text-gray-400">This section has no approved questions.</p>
          <a href="/study/select" className="text-orange-400 hover:text-orange-300 underline">
            Back to selection
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <a href="/study" className="text-sm text-gray-400 hover:text-white transition-colors">
          ← Exit
        </a>
        <span className="text-sm text-gray-400">
          {index + 1} / {questions.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-gray-800 rounded-full mb-8">
        <div
          className="h-full bg-orange-500 rounded-full transition-all duration-300"
          style={{ width: `${(answeredCount / questions.length) * 100}%` }}
        />
      </div>

      {/* Question card */}
      <div className="flex-1 flex flex-col">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 mb-6">
          <p className="text-xs uppercase tracking-widest text-orange-400 mb-4">Question {index + 1}</p>
          <p className="text-white text-lg leading-relaxed">{currentQ.question}</p>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {OPTION_KEYS.map((key) => {
            const text = currentQ.options[key]
            const isSelected = selectedForCurrent === key
            return (
              <button
                key={key}
                onClick={() => selectAnswer(key)}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl border text-left transition-colors ${
                  isSelected
                    ? 'bg-orange-600/20 border-orange-500 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white'
                }`}
              >
                <span className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                  isSelected ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400'
                }`}>
                  {key}
                </span>
                <span className="text-sm leading-snug">{text}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 space-y-3">
        {!isLast ? (
          <button
            onClick={handleNext}
            disabled={!selectedForCurrent}
            className="w-full py-4 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
          >
            Next →
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!selectedForCurrent || submitting}
            className="w-full py-4 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
          >
            {submitting ? 'Submitting…' : 'Submit Quiz'}
          </button>
        )}
        <p className="text-center text-xs text-gray-600">
          A/B/C/D or 1/2/3/4 to select · Enter or → to advance
        </p>
      </div>
    </div>
  )
}
