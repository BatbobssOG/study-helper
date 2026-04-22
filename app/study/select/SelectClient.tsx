'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type ClassRow = { id: string; name: string; slug: string; display_order: number }
type SectionRow = { id: string; name: string; class_id: string }

export default function SelectClient({
  classes,
  sections,
  questionCounts,
}: {
  classes: ClassRow[]
  sections: SectionRow[]
  questionCounts: Record<string, number>
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'flashcard' | 'quiz'>('flashcard')
  const [questionCount, setQuestionCount] = useState(20)
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const sectionsByClass = (classId: string) => sections.filter((s) => s.class_id === classId)

  const allSelectableSections = sections.filter((s) => (questionCounts[s.id] ?? 0) > 0)
  const allSelected = allSelectableSections.length > 0 &&
    allSelectableSections.every((s) => selectedSections.has(s.id))

  const toggleGlobalAll = () => {
    setSelectedSections(() => {
      if (allSelected) return new Set()
      return new Set(allSelectableSections.map((s) => s.id))
    })
  }

  const toggleSection = (id: string) => {
    setSelectedSections((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAllInClass = (classId: string) => {
    const ids = sectionsByClass(classId)
      .filter((s) => (questionCounts[s.id] ?? 0) > 0)
      .map((s) => s.id)
    const allClassSelected = ids.every((id) => selectedSections.has(id))
    setSelectedSections((prev) => {
      const next = new Set(prev)
      if (allClassSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  const handleStart = async () => {
    if (selectedSections.size === 0) {
      setError('Select at least one section to study.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const selectedClassIds = classes
        .filter((c) => sectionsByClass(c.id).some((s) => selectedSections.has(s.id)))
        .map((c) => c.id)

      const res = await fetch('/api/study/start-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          section_ids: Array.from(selectedSections),
          class_ids: selectedClassIds,
          question_count: mode === 'quiz' ? questionCount : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start session')

      if (mode === 'quiz') {
        router.push(`/study/quiz?session=${data.session_id}`)
      } else {
        router.push(`/study/flashcards?session=${data.session_id}`)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Mode tabs */}
      <div className="flex gap-2 p-1 bg-gray-900 border border-gray-800 rounded-xl">
        <button
          onClick={() => setMode('flashcard')}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-950 ${
            mode === 'flashcard' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          🃏 Flashcards
        </button>
        <button
          onClick={() => setMode('quiz')}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-950 ${
            mode === 'quiz' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          📝 Quiz
        </button>
      </div>

      {/* Question count (quiz only) */}
      {mode === 'quiz' && (
        <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl">
          <p className="text-sm text-gray-400 mb-3">Number of questions</p>
          <div className="flex gap-2">
            {[10, 20, 30, 50].map((n) => (
              <button
                key={n}
                onClick={() => setQuestionCount(n)}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-950 ${
                  questionCount === n
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Global select all */}
      <div className="flex items-center justify-between px-1">
        <span className="text-sm text-gray-500">
          {selectedSections.size > 0
            ? `${selectedSections.size} section${selectedSections.size > 1 ? 's' : ''} selected`
            : 'No sections selected'}
        </span>
        <button
          onClick={toggleGlobalAll}
          className="text-sm text-orange-400 hover:text-orange-300 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-950 rounded"
        >
          {allSelected ? 'Deselect all' : 'Select all sections'}
        </button>
      </div>

      {/* Section picker */}
      <div className="space-y-3">
        {classes.map((cls) => {
          const classSections = sectionsByClass(cls.id)
          if (classSections.length === 0) return null

          const selectableInClass = classSections.filter((s) => (questionCounts[s.id] ?? 0) > 0)
          const allClassSelected = selectableInClass.length > 0 &&
            selectableInClass.every((s) => selectedSections.has(s.id))
          const someClassSelected = classSections.some((s) => selectedSections.has(s.id))

          return (
            <div key={cls.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                <span className="font-semibold text-white">{cls.name}</span>
                <button
                  onClick={() => toggleAllInClass(cls.id)}
                  disabled={selectableInClass.length === 0}
                  className={`text-sm px-3 py-1 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-30 disabled:cursor-not-allowed ${
                    allClassSelected
                      ? 'bg-orange-600 text-white'
                      : someClassSelected
                        ? 'bg-orange-600/20 text-orange-300 border border-orange-600/50'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {allClassSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="divide-y divide-gray-800">
                {classSections.map((sec) => {
                  const count = questionCounts[sec.id] ?? 0
                  const isEmpty = count === 0
                  return (
                    <label
                      key={sec.id}
                      className={`flex items-center justify-between px-5 py-3 transition-colors ${
                        isEmpty
                          ? 'opacity-40 cursor-not-allowed'
                          : 'cursor-pointer hover:bg-gray-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedSections.has(sec.id)}
                          onChange={() => !isEmpty && toggleSection(sec.id)}
                          disabled={isEmpty}
                          className="w-4 h-4 accent-orange-500 cursor-pointer disabled:cursor-not-allowed focus:ring-2 focus:ring-orange-500"
                        />
                        <span className="text-gray-200 text-sm">{sec.name}</span>
                      </div>
                      <span className={`text-xs ml-4 flex-shrink-0 ${isEmpty ? 'text-gray-600' : 'text-gray-500'}`}>
                        {isEmpty ? '— no questions' : `${count} question${count !== 1 ? 's' : ''}`}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        onClick={handleStart}
        disabled={loading || selectedSections.size === 0}
        className="w-full py-4 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-lg transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-950"
      >
        {loading
          ? 'Starting…'
          : selectedSections.size > 0
            ? mode === 'quiz'
              ? `Start Quiz — ${questionCount} questions (${selectedSections.size} section${selectedSections.size > 1 ? 's' : ''})`
              : `Start Flashcards (${selectedSections.size} section${selectedSections.size > 1 ? 's' : ''})`
            : mode === 'quiz' ? 'Start Quiz' : 'Start Flashcards'}
      </button>
    </div>
  )
}
