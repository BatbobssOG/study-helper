'use client'

import { useEffect, useState, useCallback } from 'react'

type Card = {
  id: string
  question: string
  options: { A: string; B: string; C: string; D: string }
  correct_answer: string
  explanation: string
  progress: 'mastered' | 'learning' | null
}

export default function FlashcardClient({ sessionId }: { sessionId: string }) {
  const [cards, setCards] = useState<Card[]>([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [results, setResults] = useState<{ mastered: number; learning: number }>({
    mastered: 0,
    learning: 0,
  })
  const [done, setDone] = useState(false)
  const [savingProgress, setSavingProgress] = useState(false)

  useEffect(() => {
    fetch(`/api/study/flashcards?session=${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setCards(data.cards)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [sessionId])

  const saveProgress = useCallback(
    async (status: 'mastered' | 'learning') => {
      if (!cards[index]) return
      setSavingProgress(true)
      try {
        await fetch('/api/study/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question_id: cards[index].id, status }),
        })
      } finally {
        setSavingProgress(false)
      }
    },
    [cards, index]
  )

  const advance = useCallback(
    async (status: 'mastered' | 'learning') => {
      await saveProgress(status)
      setResults((prev) => ({ ...prev, [status]: prev[status] + 1 }))
      if (index + 1 >= cards.length) {
        setDone(true)
      } else {
        setIndex((i) => i + 1)
        setFlipped(false)
      }
    },
    [saveProgress, index, cards.length]
  )

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (loading || done || savingProgress) return
      if (e.code === 'Space') {
        e.preventDefault()
        setFlipped((f) => !f)
      } else if (e.code === 'ArrowRight' && flipped) {
        advance('mastered')
      } else if (e.code === 'ArrowLeft' && flipped) {
        advance('learning')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [loading, done, flipped, advance, savingProgress])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading cards…</div>
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

  if (cards.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <div className="text-4xl">📭</div>
          <h2 className="text-xl font-semibold text-white">No cards yet</h2>
          <p className="text-gray-400">This section has no approved questions. Check back soon.</p>
          <a href="/study/select" className="text-orange-400 hover:text-orange-300 underline">
            Back to selection
          </a>
        </div>
      </div>
    )
  }

  if (done) {
    const total = results.mastered + results.learning
    const pct = total > 0 ? Math.round((results.mastered / total) * 100) : 0
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-6 max-w-sm w-full">
          <div className="text-5xl">{pct >= 80 ? '🎉' : '📚'}</div>
          <h2 className="text-2xl font-bold text-white">Session complete!</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
              <div className="text-2xl font-bold text-green-400">{results.mastered}</div>
              <div className="text-sm text-green-300 mt-1">Got it</div>
            </div>
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
              <div className="text-2xl font-bold text-yellow-400">{results.learning}</div>
              <div className="text-sm text-yellow-300 mt-1">Still learning</div>
            </div>
          </div>
          <div className="text-3xl font-bold text-white">{pct}%</div>
          <div className="flex flex-col gap-3">
            <a
              href={`/study/flashcards?session=${sessionId}`}
              className="block py-3 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-xl transition-colors"
              onClick={() => {
                setIndex(0)
                setFlipped(false)
                setDone(false)
                setResults({ mastered: 0, learning: 0 })
                setLoading(true)
              }}
            >
              Study again
            </a>
            <a
              href="/study/select"
              className="block py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-xl transition-colors"
            >
              New session
            </a>
            <a
              href="/study"
              className="block py-3 text-gray-400 hover:text-white transition-colors text-sm"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </div>
    )
  }

  const card = cards[index]
  const correctText = card.options[card.correct_answer as keyof typeof card.options]

  return (
    <div className="min-h-screen flex flex-col p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <a href="/study" className="text-sm text-gray-400 hover:text-white transition-colors">
          ← Dashboard
        </a>
        <span className="text-sm text-gray-400">
          {index + 1} / {cards.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-gray-800 rounded-full mb-8">
        <div
          className="h-full bg-orange-500 rounded-full transition-all duration-300"
          style={{ width: `${((index + 1) / cards.length) * 100}%` }}
        />
      </div>

      {/* Card */}
      <div
        className="flex-1 flex flex-col items-center justify-center cursor-pointer"
        onClick={() => setFlipped((f) => !f)}
        style={{ perspective: '1200px' }}
      >
        <div
          style={{
            transformStyle: 'preserve-3d',
            transition: 'transform 0.45s ease',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            width: '100%',
            maxWidth: '560px',
            minHeight: '320px',
            position: 'relative',
          }}
        >
          {/* Front */}
          <div
            style={{ backfaceVisibility: 'hidden' }}
            className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-gray-900 border border-gray-700 rounded-2xl"
          >
            <p className="text-xs uppercase tracking-widest text-orange-400 mb-4">Question</p>
            <p className="text-white text-center text-lg leading-relaxed">{card.question}</p>
            <p className="text-gray-500 text-sm mt-6">Tap to reveal answer</p>
          </div>

          {/* Back */}
          <div
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
            className="absolute inset-0 flex flex-col items-start justify-center p-8 bg-gray-900 border border-orange-600/40 rounded-2xl overflow-y-auto"
          >
            <p className="text-xs uppercase tracking-widest text-orange-400 mb-3">Answer</p>
            <p className="text-white font-semibold text-lg mb-4">
              {card.correct_answer}. {correctText}
            </p>
            {card.explanation && (
              <>
                <div className="w-full h-px bg-gray-700 mb-4" />
                <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Explanation</p>
                <p className="text-gray-300 text-sm leading-relaxed">{card.explanation}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-8">
        {!flipped ? (
          <button
            onClick={() => setFlipped(true)}
            className="w-full py-4 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-xl transition-colors"
          >
            Reveal Answer
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => advance('learning')}
              disabled={savingProgress}
              className="py-4 bg-yellow-600/20 hover:bg-yellow-600/40 border border-yellow-600/40 text-yellow-300 font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              ← Still Learning
            </button>
            <button
              onClick={() => advance('mastered')}
              disabled={savingProgress}
              className="py-4 bg-green-600/20 hover:bg-green-600/40 border border-green-600/40 text-green-300 font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              Got It →
            </button>
          </div>
        )}
        <p className="text-center text-xs text-gray-600 mt-3">
          Space to flip · ← Still learning · → Got it
        </p>
      </div>
    </div>
  )
}
