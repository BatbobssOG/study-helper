'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type ClassRow   = { id: string; name: string; slug: string; display_order: number }
type SectionRow = { id: string; name: string; class_id: string }

const QUESTION_COUNTS   = [10, 20, 30] as const
const TIME_LIMITS       = [15, 20, 30] as const

export default function KahootCreateClient({
  classes,
  sections,
  questionCounts,
}: {
  classes:        ClassRow[]
  sections:       SectionRow[]
  questionCounts: Record<string, number>
}) {
  const router = useRouter()
  const [sessionName,    setSessionName]    = useState('')
  const [selectedClass,  setSelectedClass]  = useState('')
  const [selectedSects,  setSelectedSects]  = useState<Set<string>>(new Set())
  const [questionCount,  setQuestionCount]  = useState<10 | 20 | 30>(20)
  const [timeLimit,      setTimeLimit]      = useState<15 | 20 | 30>(20)
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState('')

  const sectionsForClass = sections.filter(s => s.class_id === selectedClass)
  const availableCount   = [...selectedSects].reduce((sum, id) => sum + (questionCounts[id] ?? 0), 0)
  const notEnough        = selectedSects.size > 0 && availableCount < questionCount

  const toggleSection = (id: string) => {
    setSelectedSects(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleCreate = async () => {
    setError('')
    if (!sessionName.trim()) return setError('Session name is required')
    if (!selectedClass)      return setError('Select a class')
    if (selectedSects.size === 0) return setError('Select at least one section')
    if (notEnough)           return setError(`Not enough questions (need ${questionCount}, found ${availableCount})`)

    setLoading(true)
    try {
      const res = await fetch('/api/kahoot/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:               sessionName.trim(),
          class_id:           selectedClass,
          section_ids:        [...selectedSects],
          question_count:     questionCount,
          time_limit_seconds: timeLimit,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create session')
      router.push(`/study/kahoot/${data.session_id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Session Name */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Session Name</label>
        <input
          type="text"
          maxLength={40}
          value={sessionName}
          onChange={e => setSessionName(e.target.value)}
          placeholder="e.g. Welding Safety Review"
          className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-orange-500"
        />
      </div>

      {/* Class Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Class</label>
        <select
          value={selectedClass}
          onChange={e => { setSelectedClass(e.target.value); setSelectedSects(new Set()) }}
          className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-orange-500"
        >
          <option value="">— Choose a class —</option>
          {classes.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Section Multi-Select */}
      {selectedClass && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Sections</label>
          <div className="space-y-2">
            {sectionsForClass.map(s => {
              const count    = questionCounts[s.id] ?? 0
              const disabled = count < 10
              return (
                <label
                  key={s.id}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    disabled
                      ? 'border-gray-700 opacity-40 cursor-not-allowed'
                      : selectedSects.has(s.id)
                        ? 'border-orange-500 bg-orange-500/10'
                        : 'border-gray-700 hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={selectedSects.has(s.id)}
                      onChange={() => toggleSection(s.id)}
                      className="accent-orange-500"
                    />
                    <span className="text-white text-sm">{s.name}</span>
                    {disabled && <span className="text-xs text-gray-500">(fewer than 10 questions)</span>}
                  </div>
                  <span className="text-xs text-gray-400">{count} q</span>
                </label>
              )
            })}
          </div>

          {/* Live question count */}
          {selectedSects.size > 0 && (
            <p className={`mt-3 text-sm font-medium ${notEnough ? 'text-red-400' : 'text-green-400'}`}>
              Questions available: {availableCount}
              {notEnough && ` — need ${questionCount}, please select more sections`}
            </p>
          )}
        </div>
      )}

      {/* Question Count + Time Limit */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Questions</label>
          <div className="flex gap-2">
            {QUESTION_COUNTS.map(n => (
              <button
                key={n}
                onClick={() => setQuestionCount(n as 10 | 20 | 30)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  questionCount === n
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Seconds per question</label>
          <div className="flex gap-2">
            {TIME_LIMITS.map(n => (
              <button
                key={n}
                onClick={() => setTimeLimit(n as 15 | 20 | 30)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  timeLimit === n
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {n}s
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        onClick={handleCreate}
        disabled={loading || notEnough}
        className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
      >
        {loading ? 'Creating…' : 'Create Session →'}
      </button>
    </div>
  )
}
