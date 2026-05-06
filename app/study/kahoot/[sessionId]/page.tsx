'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

type Player = {
  player_id:         string
  display_name:      string
  total_score:       number
  questions_correct: number
  final_rank?:       number | null
  joined_at?:        string
  last_seen_at?:     string | null
}

type Question = {
  id:            string
  question:      string
  options:       Record<string, string>
  correct_answer: string | null
  explanation:   string | null
}

type SessionState = {
  id:                     string
  code:                   string
  name:                   string
  state:                  string
  phase:                  string
  current_question_index: number
  expected_answer_count:  number | null
  question_revealed_at:   string | null
  host_last_seen_at:      string | null
  question_count:         number
  time_limit_seconds:     number
}

type GameState = {
  session:         SessionState
  players:         Player[]
  currentQuestion: Question | null
}

type AnswerCount = { answered: number; expected: number; disconnected: number }
type RevealData  = { correct_answer: string; explanation: string; stats: Record<string, number> }
type Rankings    = Array<{ rank: number; player_id: string; display_name: string; total_score: number; questions_correct: number }>

export default function HostGamePage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const router = useRouter()

  const [gameState,    setGameState]    = useState<GameState | null>(null)
  const [answerCount,  setAnswerCount]  = useState<AnswerCount>({ answered: 0, expected: 0, disconnected: 0 })
  const [revealData,   setRevealData]   = useState<RevealData | null>(null)
  const [rankings,     setRankings]     = useState<Rankings>([])
  const [timeLeft,     setTimeLeft]     = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error,        setError]        = useState('')
  const [sessionCode,  setSessionCode]  = useState('')

  const heartbeatRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch full state from DB ──────────────────────────────────────────────
  const fetchState = useCallback(async (code: string) => {
    const res = await fetch(`/api/kahoot/state/${code}`)
    if (!res.ok) { setError('Session not found'); return }
    const data: GameState = await res.json()
    setGameState(data)
    return data
  }, [])

  // ── Countdown timer ───────────────────────────────────────────────────────
  const startTimer = useCallback((revealedAt: string, limitSec: number) => {
    if (timerRef.current) clearInterval(timerRef.current)
    const tick = () => {
      const elapsed = (Date.now() - new Date(revealedAt).getTime()) / 1000
      const remaining = Math.max(0, limitSec - elapsed)
      setTimeLeft(Math.ceil(remaining))
    }
    tick()
    timerRef.current = setInterval(tick, 250)
  }, [])

  // ── Answer count polling (during question phase) ──────────────────────────
  const startAnswerPoll = useCallback((sid: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/kahoot/answer-count/${sid}`)
      if (res.ok) setAnswerCount(await res.json())
    }, 1000)
  }, [])

  const stopAnswerPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  // ── Heartbeat ─────────────────────────────────────────────────────────────
  const startHeartbeat = useCallback((sid: string) => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    heartbeatRef.current = setInterval(() => {
      fetch('/api/kahoot/heartbeat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ session_id: sid }),
      })
    }, 15_000)
  }, [])

  // ── Host action helpers ───────────────────────────────────────────────────
  const hostAction = useCallback(async (endpoint: string) => {
    if (!gameState) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/kahoot/${endpoint}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ session_id: gameState.session.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      return data
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }, [gameState])

  // ── Supabase Realtime subscription ───────────────────────────────────────
  useEffect(() => {
    if (!sessionCode || !gameState) return

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const channel = supabase.channel(`game:${sessionCode}`, {
      config: { broadcast: { self: false } }
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        // Refresh player list from DB on presence change (lobby only)
        if (gameState.session.phase === 'lobby') fetchState(sessionCode)
      })
      .on('broadcast', { event: 'GAME_START' }, () => fetchState(sessionCode))
      .on('broadcast', { event: 'QUESTION' }, () => fetchState(sessionCode))
      .on('broadcast', { event: 'REVEAL' }, ({ payload }) => {
        setRevealData(payload as RevealData)
        fetchState(sessionCode)
      })
      .on('broadcast', { event: 'LEADERBOARD' }, ({ payload }) => {
        setRankings((payload as { rankings: Rankings }).rankings)
        fetchState(sessionCode)
      })
      .on('broadcast', { event: 'GAME_END' }, ({ payload }) => {
        setRankings((payload as { final_rankings: Rankings }).final_rankings)
        fetchState(sessionCode)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sessionCode, gameState, fetchState])

  // ── Phase-driven side effects ─────────────────────────────────────────────
  useEffect(() => {
    if (!gameState) return
    const { session } = gameState

    if (session.phase === 'question' && session.question_revealed_at) {
      startTimer(session.question_revealed_at, session.time_limit_seconds)
      startAnswerPoll(session.id)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      stopAnswerPoll()
    }
  }, [gameState, startTimer, startAnswerPoll, stopAnswerPoll])

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      // Get session code from session ID via a state fetch using the ID
      const res = await fetch(`/api/kahoot/state/${sessionId}`)
        .catch(() => null)

      // sessionId param here is actually the session UUID from the URL /study/kahoot/[sessionId]
      // We need to look it up by ID first to get the code
      const r2 = await fetch(`/api/kahoot/session-by-id/${sessionId}`)
      if (!r2.ok) { setError('Session not found'); setLoading(false); return }
      const { code } = await r2.json()
      setSessionCode(code)

      const state = await fetchState(code)
      if (state) startHeartbeat(state.session.id)
      setLoading(false)
    })()

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      if (pollRef.current)      clearInterval(pollRef.current)
      if (timerRef.current)     clearInterval(timerRef.current)
    }
  }, [sessionId, fetchState, startHeartbeat])

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) return <div className="min-h-screen flex items-center justify-center text-white">Loading session…</div>
  if (error)   return <div className="min-h-screen flex items-center justify-center text-red-400">{error}</div>
  if (!gameState) return null

  const { session, players, currentQuestion } = gameState
  const isLastQuestion = session.current_question_index >= session.question_count - 1

  // ── LOBBY ─────────────────────────────────────────────────────────────────
  if (session.phase === 'lobby') {
    return (
      <main className="min-h-screen p-8 max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">{session.name}</h1>
          <p className="text-gray-400">Share this code with your class</p>
          <div className="mt-4 inline-block bg-gray-800 border border-orange-500 rounded-2xl px-8 py-4">
            <span className="text-5xl font-mono font-bold text-orange-400 tracking-widest">{session.code}</span>
          </div>
          <p className="mt-3 text-sm text-gray-500">Players join at <span className="text-orange-400">/play</span></p>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Players joined ({players.length})
          </h2>
          {players.length === 0 ? (
            <p className="text-gray-500 text-sm">Waiting for players…</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {players.map(p => (
                <div key={p.player_id} className="bg-gray-800 rounded-lg px-3 py-2 text-white text-sm">
                  {p.display_name}
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <button
          onClick={async () => { await hostAction('start'); fetchState(session.code) }}
          disabled={players.length < 2 || actionLoading}
          className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl text-lg transition-colors"
        >
          {players.length < 2
            ? `Need ${2 - players.length} more player${2 - players.length !== 1 ? 's' : ''}`
            : actionLoading ? 'Starting…' : 'Start Game →'}
        </button>
      </main>
    )
  }

  // ── QUESTION ──────────────────────────────────────────────────────────────
  if (session.phase === 'question') {
    const timerPct  = session.time_limit_seconds > 0 ? timeLeft / session.time_limit_seconds : 0
    const timerColor = timerPct > 0.5 ? 'text-green-400' : timerPct > 0.25 ? 'text-yellow-400' : 'text-red-400'

    return (
      <main className="min-h-screen p-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <span className="text-gray-400 text-sm">Question {session.current_question_index + 1} / {session.question_count}</span>
          <span className={`text-4xl font-bold font-mono ${timerColor}`}>{timeLeft}s</span>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
          <p className="text-white text-xl font-semibold leading-relaxed">
            {currentQuestion?.question ?? 'Loading question…'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {(['A','B','C','D'] as const).map((letter, i) => {
            const colors = ['bg-red-700','bg-blue-700','bg-amber-600','bg-violet-700']
            return (
              <div key={letter} className={`${colors[i]} rounded-xl px-4 py-4 text-white font-medium`}>
                <span className="font-bold mr-2">{letter}.</span>
                {currentQuestion?.options?.[letter] ?? '—'}
              </div>
            )
          })}
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center justify-between mb-4">
          <span className="text-gray-300">
            <span className="text-white font-bold text-lg">{answerCount.answered}</span>
            {' / '}
            <span className="text-white font-bold text-lg">{answerCount.expected}</span>
            {' answered'}
          </span>
          {answerCount.disconnected > 0 && (
            <span className="text-yellow-500 text-sm">{answerCount.disconnected} disconnected</span>
          )}
        </div>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button
          onClick={async () => {
            const data = await hostAction('reveal')
            if (data) setRevealData(data)
            fetchState(session.code)
          }}
          disabled={actionLoading}
          className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
        >
          {actionLoading ? 'Revealing…' : 'Reveal Answer →'}
        </button>
      </main>
    )
  }

  // ── REVEALED ──────────────────────────────────────────────────────────────
  if (session.phase === 'revealed') {
    const correct = currentQuestion?.correct_answer
    const stats   = revealData?.stats ?? {}
    const total   = (stats.answers_total as number) || 1

    return (
      <main className="min-h-screen p-8 max-w-2xl mx-auto">
        <h2 className="text-xl font-bold text-white mb-6">
          Question {session.current_question_index + 1} — Results
        </h2>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-4">
          <p className="text-gray-400 text-sm mb-1">Question</p>
          <p className="text-white">{currentQuestion?.question}</p>
        </div>

        <div className="space-y-2 mb-6">
          {(['A','B','C','D'] as const).map((letter, i) => {
            const colors = ['bg-red-700','bg-blue-700','bg-amber-600','bg-violet-700']
            const count  = (stats[`answers_${letter.toLowerCase()}`] as number) ?? 0
            const pct    = Math.round((count / total) * 100)
            const isRight = letter === correct
            return (
              <div
                key={letter}
                className={`relative rounded-xl px-4 py-3 flex items-center justify-between text-white font-medium overflow-hidden border-2 ${isRight ? 'border-green-400' : 'border-transparent'} ${colors[i]}`}
              >
                <span><span className="font-bold mr-2">{letter}.</span>{currentQuestion?.options?.[letter]}</span>
                <span className="text-sm font-bold">{count} ({pct}%){isRight ? ' ✓' : ''}</span>
              </div>
            )
          })}
        </div>

        {revealData?.explanation && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mb-6">
            <p className="text-gray-400 text-sm mb-1">Explanation</p>
            <p className="text-white text-sm">{revealData.explanation}</p>
          </div>
        )}

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button
          onClick={async () => {
            const data = await hostAction('leaderboard')
            if (data) setRankings(data.rankings)
            fetchState(session.code)
          }}
          disabled={actionLoading}
          className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
        >
          {actionLoading ? 'Loading…' : 'Show Leaderboard →'}
        </button>
      </main>
    )
  }

  // ── LEADERBOARD ───────────────────────────────────────────────────────────
  if (session.phase === 'leaderboard') {
    const medals = ['🥇', '🥈', '🥉']

    return (
      <main className="min-h-screen p-8 max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">Leaderboard</h2>

        <div className="space-y-2 mb-8">
          {rankings.map((p, i) => (
            <div
              key={p.player_id}
              className="flex items-center gap-3 bg-gray-900 rounded-xl px-4 py-3 border border-gray-800"
            >
              <span className="text-xl w-8 text-center">{medals[i] ?? `#${p.rank}`}</span>
              <span className="flex-1 text-white font-medium">{p.display_name}</span>
              <span className="text-orange-400 font-bold">{p.total_score.toLocaleString()} pts</span>
            </div>
          ))}
        </div>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button
          onClick={async () => {
            if (isLastQuestion) {
              await hostAction('end')
            } else {
              await hostAction('next')
            }
            fetchState(session.code)
          }}
          disabled={actionLoading}
          className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
        >
          {actionLoading
            ? 'Loading…'
            : isLastQuestion ? 'End Game →' : 'Next Question →'}
        </button>
      </main>
    )
  }

  // ── FINISHED ──────────────────────────────────────────────────────────────
  if (session.state === 'finished') {
    const medals = ['🥇', '🥈', '🥉']

    return (
      <main className="min-h-screen p-8 max-w-2xl mx-auto">
        <h2 className="text-3xl font-bold text-white mb-2 text-center">Game Over!</h2>
        <p className="text-center text-gray-400 mb-8">{session.name}</p>

        <div className="space-y-2 mb-8">
          {rankings.map((p, i) => (
            <div
              key={p.player_id ?? i}
              className="flex items-center gap-3 bg-gray-900 rounded-xl px-4 py-3 border border-gray-800"
            >
              <span className="text-xl w-8 text-center">{medals[i] ?? `#${(p as { final_rank?: number }).final_rank ?? i + 1}`}</span>
              <span className="flex-1 text-white font-medium">{p.display_name}</span>
              <span className="text-gray-400 text-sm mr-3">{p.questions_correct}/{session.question_count} correct</span>
              <span className="text-orange-400 font-bold">{p.total_score.toLocaleString()} pts</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <a
            href={`/api/kahoot/export/${session.id}`}
            className="flex-1 text-center bg-gray-800 hover:bg-gray-700 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Export CSV
          </a>
          <button
            onClick={() => router.push('/study/kahoot')}
            className="flex-1 bg-orange-600 hover:bg-orange-500 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            New Game
          </button>
        </div>
      </main>
    )
  }

  return null
}
