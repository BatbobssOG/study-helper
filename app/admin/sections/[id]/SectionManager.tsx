'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'

type SlideRow = {
  id: string
  slide_number: number
  title: string | null
  content: string | null
  counts: {
    ai: number
    uploaded: number
    approved: number
  }
}

type Props = {
  section: { id: string; name: string }
  className: string
  slides: SlideRow[]
}

type SlideStatus = 'idle' | 'loading' | 'done' | 'skipped' | 'error'

/** Pull the human-readable message out of a raw Anthropic/server error string */
function extractErrorMessage(raw: string): string {
  try {
    // Anthropic SDK error format: "400 {\"type\":\"error\",\"error\":{\"message\":\"...\"}}"
    const jsonStart = raw.indexOf('{')
    if (jsonStart !== -1) {
      const parsed = JSON.parse(raw.slice(jsonStart))
      if (parsed?.error?.message) return parsed.error.message
      if (parsed?.message) return parsed.message
    }
  } catch {
    // ignore parse failure
  }
  return raw.length > 120 ? raw.slice(0, 120) + '…' : raw
}

export default function SectionManager({ section, className, slides }: Props) {
  const [statuses, setStatuses] = useState<Record<string, SlideStatus>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [counts, setCounts] = useState<Record<string, number>>(
    Object.fromEntries(slides.map(s => [s.id, s.counts.ai]))
  )
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  const cancelRef = useRef(false)

  const generateOne = useCallback(async (slideId: string): Promise<boolean> => {
    setStatuses(prev => ({ ...prev, [slideId]: 'loading' }))
    setErrors(prev => ({ ...prev, [slideId]: '' }))

    try {
      const res = await fetch('/api/admin/generate-from-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slide_id: slideId }),
      })

      // Safely parse — server might return non-JSON on crash
      let data: Record<string, unknown> = {}
      try {
        data = await res.json()
      } catch {
        setStatuses(prev => ({ ...prev, [slideId]: 'error' }))
        setErrors(prev => ({ ...prev, [slideId]: `Server error (HTTP ${res.status})` }))
        return false
      }

      if (!res.ok) {
        const raw = (data.error as string) ?? `HTTP ${res.status}`
        setStatuses(prev => ({ ...prev, [slideId]: 'error' }))
        setErrors(prev => ({ ...prev, [slideId]: extractErrorMessage(raw) }))
        return false
      }

      if (data.skipped) {
        setStatuses(prev => ({ ...prev, [slideId]: 'skipped' }))
      } else {
        setStatuses(prev => ({ ...prev, [slideId]: 'done' }))
        setCounts(prev => ({ ...prev, [slideId]: (prev[slideId] ?? 0) + ((data.generated as number) ?? 0) }))
      }
      return true
    } catch (e) {
      setStatuses(prev => ({ ...prev, [slideId]: 'error' }))
      setErrors(prev => ({ ...prev, [slideId]: extractErrorMessage(String(e)) }))
      return false
    }
  }, [])

  const generateAll = useCallback(async () => {
    const pending = slides.filter(s => s.content?.trim() && (counts[s.id] ?? 0) < 4)
    if (pending.length === 0) return

    cancelRef.current = false
    setBulkRunning(true)
    setBulkProgress({ done: 0, total: pending.length })

    for (let i = 0; i < pending.length; i++) {
      if (cancelRef.current) break
      await generateOne(pending[i].id)
      setBulkProgress({ done: i + 1, total: pending.length })
      // Brief pause between slides to avoid hammering the API
      if (i < pending.length - 1 && !cancelRef.current) {
        await new Promise(r => setTimeout(r, 500))
      }
    }

    setBulkRunning(false)
    setBulkProgress(null)
    cancelRef.current = false
  }, [slides, counts, generateOne])

  const stopGeneration = useCallback(() => {
    cancelRef.current = true
  }, [])

  const pendingCount = slides.filter(s => s.content?.trim() && (counts[s.id] ?? 0) < 4).length
  const totalAI = slides.reduce((sum, s) => sum + (counts[s.id] ?? 0), 0)

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-4 flex-wrap">
          <Link href="/admin" className="hover:text-orange-400 transition-colors">Admin</Link>
          <span>›</span>
          <Link href="/admin/sections" className="hover:text-orange-400 transition-colors">All Sections</Link>
          <span>›</span>
          <span className="text-gray-400">{className}</span>
          <span>›</span>
          <span className="text-white">{section.name}</span>
        </nav>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-orange-400 text-sm font-medium uppercase tracking-wide">{className}</p>
            <h1 className="text-2xl font-bold text-white mt-0.5">{section.name}</h1>
            <p className="text-gray-400 text-sm mt-1">
              {slides.length} slides · {totalAI} AI questions generated
            </p>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            <Link
              href={`/admin/sections/${section.id}/questions`}
              className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-orange-500 hover:text-white text-sm transition-colors"
            >
              Manage Questions
            </Link>
            <Link
              href="/admin/review"
              className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-orange-500 hover:text-white text-sm transition-colors"
            >
              Review Queue →
            </Link>

            {bulkRunning ? (
              <>
                <span className="text-sm text-gray-400">
                  Generating… {bulkProgress?.done}/{bulkProgress?.total}
                </span>
                <button
                  onClick={stopGeneration}
                  className="px-4 py-2 rounded-lg bg-red-900 hover:bg-red-800 text-red-200 text-sm font-medium transition-colors border border-red-700"
                >
                  ■ Stop
                </button>
              </>
            ) : (
              <button
                onClick={generateAll}
                disabled={pendingCount === 0}
                className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium transition-colors"
              >
                Generate All ({pendingCount} remaining)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Slide list */}
      <div className="space-y-2">
        {slides.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-4xl mb-3">📭</p>
            <p>No slides in this section — questions were uploaded directly.</p>
            <Link href="/admin/review" className="text-orange-400 hover:underline text-sm mt-2 inline-block">
              Check the review queue
            </Link>
          </div>
        ) : (
          slides.map(slide => {
            const status = statuses[slide.id] ?? 'idle'
            const aiCount = counts[slide.id] ?? 0
            const hasContent = !!slide.content?.trim()
            const alreadyDone = aiCount >= 4

            return (
              <div
                key={slide.id}
                className="flex items-start gap-4 p-4 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors"
              >
                {/* Slide number */}
                <span className="text-gray-600 text-sm font-mono w-6 shrink-0 pt-0.5">
                  {slide.slide_number}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {slide.title ?? <span className="text-gray-500 italic">Untitled</span>}
                  </p>
                  {slide.content && (
                    <p className="text-gray-500 text-xs mt-0.5 line-clamp-1">
                      {slide.content.replace(/⚠️/g, '').trim().slice(0, 120)}
                    </p>
                  )}
                  {!hasContent && (
                    <p className="text-gray-600 text-xs mt-0.5 italic">No content — will be skipped</p>
                  )}
                  {errors[slide.id] && (
                    <p className="text-red-400 text-xs mt-1 leading-relaxed">{errors[slide.id]}</p>
                  )}
                </div>

                {/* Badge + action */}
                <div className="flex items-center gap-3 shrink-0">
                  <QuestionBadge
                    aiCount={aiCount}
                    uploaded={slide.counts.uploaded}
                    approved={slide.counts.approved}
                  />
                  <GenerateButton
                    status={status}
                    hasContent={hasContent}
                    alreadyDone={alreadyDone}
                    bulkRunning={bulkRunning}
                    onClick={() => generateOne(slide.id)}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
    </main>
  )
}

function QuestionBadge({
  aiCount,
  uploaded,
  approved,
}: {
  aiCount: number
  uploaded: number
  approved: number
}) {
  const total = aiCount + uploaded
  if (total === 0) return <span className="text-xs text-gray-600">0 questions</span>

  const allApproved = approved >= total
  const pendingReview = aiCount > 0 && approved < total

  return (
    <span
      className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${
        allApproved
          ? 'bg-green-900/50 text-green-400 border border-green-800'
          : pendingReview
          ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-800'
          : 'bg-gray-800 text-gray-400 border border-gray-700'
      }`}
    >
      {aiCount > 0 && `${aiCount} AI`}
      {uploaded > 0 && (aiCount > 0 ? ` · ${uploaded} real` : `${uploaded} real`)}
      {approved > 0 && ` · ${approved}✓`}
    </span>
  )
}

function GenerateButton({
  status,
  hasContent,
  alreadyDone,
  bulkRunning,
  onClick,
}: {
  status: SlideStatus
  hasContent: boolean
  alreadyDone: boolean
  bulkRunning: boolean
  onClick: () => void
}) {
  if (!hasContent) {
    return <span className="text-xs text-gray-700 w-20 text-center">—</span>
  }

  if (status === 'loading') {
    return (
      <span className="text-xs text-orange-400 animate-pulse w-20 text-center">
        Generating…
      </span>
    )
  }

  if (status === 'done') {
    return <span className="text-xs text-green-400 w-20 text-center">✓ Generated</span>
  }

  if (status === 'error') {
    return (
      <button
        onClick={onClick}
        className="text-xs text-red-400 hover:text-red-300 w-20 text-center underline"
      >
        Retry
      </button>
    )
  }

  if (status === 'skipped' || alreadyDone) {
    return <span className="text-xs text-gray-500 w-20 text-center">Already done</span>
  }

  return (
    <button
      onClick={onClick}
      disabled={bulkRunning}
      className="text-xs px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 hover:text-white border border-gray-700 transition-colors w-20 text-center"
    >
      Generate
    </button>
  )
}
