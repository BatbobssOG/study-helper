'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

const PLAYER_ID_KEY = 'pipetrades_player_id'

type SessionInfo = {
  id:                     string
  code:                   string
  name:                   string
  state:                  string
  phase:                  string
  current_question_index: number
  question_revealed_at:   string | null
  question_count:         number
  time_limit_seconds:     number
  host_last_seen_at:      string | null
}

type Question = {
  id:            string
  question:      string
  options:       Record<string, string>
  correct_answer: string | null
  explanation:   string | null
}

type RankRow = { rank?: number; final_rank?: number; display_name: string; total_score: number }

const OPTION_COLORS: Record<string, string> = {
  A: 'bg-red-600 hover:bg-red-500',
  B: 'bg-blue-600 hover:bg-blue-500',
  C: 'bg-amber-500 hover:bg-amber-400',
  D: 'bg-violet-600 hover:bg-violet-500',
}
const OPTION_COLORS_DIM: Record<string, string> = {
  A: 'bg-red-900 opacity-50',
  B: 'bg-blue-900 opacity-50',
  C: 'bg-amber-900 opacity-50',
  D: 'bg-violet-900 opacity-50',
}

export default function PlayerGamePage() {
  const { code }      = useParams<{ code: string }>()
  const searchParams  = useSearchParams()
  const router        = useRouter()
  const displayName   = searchParams.get('name') ?? ''

  const [session,       setSession]       = useState<SessionInfo | null>(null)
  const [question,      setQuestion]      = useState<Question | null>(null)
  const [selected,      setSelected]      = useState<string | null>(null)
  const [locked,        setLocked]        = useState(false)
  const [scoreAwarded,  setScoreAwarded]  = useState<number | null>(null)
  const [totalScore,    setTotalScore]    = useState(0)
  const [myRank,        setMyRank]        = useState<number | null>(null)
  const [rankings,      setRankings]      = useState<RankRow[]>([])
  const [timeLeft,      setTimeLeft]      = useState(0)
  const [hostGone,      setHostGone]      = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState('')

  const playerIdRef = useRef('')
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevPhase   = useRef('')

  useEffect(() => {
    playerIdRef.current = localStorage.getItem(PLAYER_ID_KEY) ?? ''
  }, [])

  const fetchState = useCallback(async () => {
    const res = await fetch(`/api/kahoot/state/${code.toUpperCase()}`)
    if (!res.ok) { setError('Session not found or expired'); return }
    const data = await res.json()

    setSession(data.session)
    setQuestion(data.currentQuestion)

    // Host disconnect check
    if (data.session.host_last_seen_at) {
      const staleSec = (Date.now() - new Date(data.session.host_last_seen_at).getTime()) / 1000
      setHostGone(staleSec > 30 && data.session.state === 'in_progress')
    }

    // Reset answer state when question changes
    if (data.session.current_question_index !== undefined && prevPhase.current !== data.session.phase) {
      if (data.session.phase === 'question') {
        setSelected(null)
        setLocked(false)
        setScoreAwarded(null)
      }
      prevPhase.current = data.session.phase
    }
  }, [code])

  // Countdown timer
  const startTimer = useCallback((revealedAt: string, limitSec: number) => {
    if (timerRef.current) clearInterval(timerRef.current)
    const tick = () => {
      const elapsed    = (Date.now() - new Date(revealedAt).getTime()) / 1000
      const remaining  = Math.max(0, limitSec - elapsed)
      setTimeLeft(Math.ceil(remaining))
    }
    tick()
    timerRef.current = setInterval(tick, 250)
  }, [])

  // Submit answer
  const submitAnswer = useCallback(async (letter: string) => {
    if (!session || locked) return
    setSelected(letter)
    setLocked(true)

    const res = await fetch('/api/kahoot/answer', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id:      session.id,
        player_id:       playerIdRef.current,
        selected_answer: letter,
      }),
    })
    const data = await res.json()
    if (data.score_awarded !== undefined) {
      setScoreAwarded(data.score_awarded)
      setTotalScore(prev => prev + data.score_awarded)
    }
  }, [session, locked])

  // Realtime subscription
  useEffect(() => {
    if (!session) return
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const channel = supabase.channel(`game:${code.toUpperCase()}`)

    channel
      .on('broadcast', { event: 'GAME_START' },   () => fetchState())
      .on('broadcast', { event: 'QUESTION' },      () => { fetchState() })
      .on('broadcast', { event: 'REVEAL' },        () => fetchState())
      .on('broadcast', { event: 'LEADERBOARD' },   ({ payload }) => {
        const list = (payload as { rankings: RankRow[] }).rankings
        setRankings(list)
        const me = list.find(r => r.display_name === displayName)
        if (me) setMyRank(me.rank ?? null)
        fetchState()
      })
      .on('broadcast', { event: 'GAME_END' },      ({ payload }) => {
        const list = (payload as { final_rankings: RankRow[] }).final_rankings
        setRankings(list)
        const me = list.find(r => r.display_name === displayName)
        if (me) setMyRank(me.final_rank ?? null)
        fetchState()
      })
      .on('broadcast', { event: 'HOST_DISCONNECT' }, () => setHostGone(true))
      .on('broadcast', { event: 'HOST_RECONNECT' },  () => { setHostGone(false); fetchState() })
      .on('broadcast', { event: 'KICKED' },          ({ payload }) => {
        if ((payload as { player_id: string }).player_id === playerIdRef.current) {
          router.push('/play?error=kicked')
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [session, code, displayName, fetchState, router])

  // Timer control
  useEffect(() => {
    if (!session) return
    if (session.phase === 'question' && session.question_revealed_at) {
      startTimer(session.question_revealed_at, session.time_limit_seconds)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [session, startTimer])

  // Initial load
  useEffect(() => {
    fetchState().finally(() => setLoading(false))
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetchState])

  if (loading) return <Screen><p className="text-white text-lg">Joining game…</p></Screen>
  if (error)   return <Screen><p className="text-red-400">{error}</p></Screen>
  if (!session) return null

  // ── LOBBY / WAITING ROOM ──────────────────────────────────────────────────
  if (session.phase === 'lobby') {
    return (
      <Screen>
        <div className="text-center">
          <p className="text-green-400 font-semibold text-lg mb-1">You&apos;re in!</p>
          <p className="text-white text-2xl font-bold mb-1">{displayName}</p>
          <p className="text-gray-400 mb-8">{session.name}</p>
          <div className="text-5xl animate-pulse mb-4">⏳</div>
          <p className="text-gray-300">Waiting for host to start…</p>
          <p className="text-gray-500 text-sm mt-2">{session.question_count} questions · {session.time_limit_seconds}s each</p>
        </div>
      </Screen>
    )
  }

  // ── QUESTION ──────────────────────────────────────────────────────────────
  if (session.phase === 'question') {
    const timerPct   = session.time_limit_seconds > 0 ? timeLeft / session.time_limit_seconds : 0
    const timerColor = timerPct > 0.5 ? 'text-green-400' : timerPct > 0.25 ? 'text-yellow-400' : 'text-red-400'

    return (
      <Screen>
        {hostGone && <HostGoneBanner />}
        <div className="w-full max-w-lg mx-auto flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">{session.current_question_index + 1} / {session.question_count}</span>
            <span className={`text-3xl font-bold font-mono ${timerColor}`}>{timeLeft}s</span>
          </div>

          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <p className="text-white text-lg font-medium leading-relaxed">
              {question?.question ?? 'Loading…'}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {(['A','B','C','D'] as const).map(letter => {
              const isSelected = selected === letter
              const colorClass = locked
                ? isSelected ? OPTION_COLORS[letter].split(' ')[0] : OPTION_COLORS_DIM[letter]
                : OPTION_COLORS[letter]
              return (
                <button
                  key={letter}
                  onClick={() => submitAnswer(letter)}
                  disabled={locked}
                  className={`w-full min-h-[64px] rounded-xl px-4 py-4 text-white font-semibold text-left transition-colors ${colorClass} flex items-center gap-3`}
                >
                  <span className="font-bold text-lg">{letter}.</span>
                  <span>{question?.options?.[letter] ?? '—'}</span>
                </button>
              )
            })}
          </div>

          {locked && (
            <p className="text-center text-gray-400 text-sm mt-1">
              Locked in — waiting for reveal…
            </p>
          )}
        </div>
      </Screen>
    )
  }

  // ── REVEALED ──────────────────────────────────────────────────────────────
  if (session.phase === 'revealed') {
    const correct    = question?.correct_answer
    const wasCorrect = selected === correct
    const wasWrong   = selected && selected !== correct

    return (
      <Screen>
        {hostGone && <HostGoneBanner />}
        <div className="w-full max-w-lg mx-auto flex flex-col gap-4">
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <p className="text-gray-400 text-xs mb-1">Question</p>
            <p className="text-white text-sm">{question?.question}</p>
          </div>

          {/* Answer feedback */}
          <div className={`rounded-xl p-5 text-center ${wasCorrect ? 'bg-green-900 border border-green-500' : wasWrong ? 'bg-red-900 border border-red-500' : 'bg-gray-800'}`}>
            {wasCorrect && <p className="text-green-300 font-bold text-xl mb-1">✓ Correct!</p>}
            {wasWrong   && <p className="text-red-300 font-bold text-xl mb-1">✗ Wrong</p>}
            {!selected  && <p className="text-gray-400 font-bold text-xl mb-1">— No answer</p>}
            {correct    && <p className="text-white text-sm">Correct answer: <strong>{correct}. {question?.options?.[correct]}</strong></p>}
          </div>

          {scoreAwarded !== null && (
            <div className="text-center">
              <p className={`text-3xl font-bold ${scoreAwarded > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                {scoreAwarded > 0 ? `+${scoreAwarded.toLocaleString()} pts` : '+0 pts'}
              </p>
              <p className="text-gray-400 text-sm mt-1">Total: {totalScore.toLocaleString()} pts</p>
            </div>
          )}

          {question?.explanation && (
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
              <p className="text-gray-400 text-xs mb-1">Explanation</p>
              <p className="text-white text-sm">{question.explanation}</p>
            </div>
          )}

          <p className="text-center text-gray-500 text-sm animate-pulse">Waiting for leaderboard…</p>
        </div>
      </Screen>
    )
  }

  // ── LEADERBOARD ───────────────────────────────────────────────────────────
  if (session.phase === 'leaderboard') {
    const medals = ['🥇','🥈','🥉']
    return (
      <Screen>
        {hostGone && <HostGoneBanner />}
        <div className="w-full max-w-lg mx-auto">
          <h2 className="text-xl font-bold text-white text-center mb-4">Leaderboard</h2>
          <div className="space-y-2 mb-6">
            {rankings.map((r, i) => {
              const isMe = r.display_name === displayName
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${isMe ? 'border-orange-500 bg-orange-500/10' : 'border-gray-800 bg-gray-900'}`}
                >
                  <span className="w-8 text-center text-lg">{medals[i] ?? `#${(r.rank ?? i + 1)}`}</span>
                  <span className={`flex-1 font-medium ${isMe ? 'text-orange-300' : 'text-white'}`}>{r.display_name}{isMe ? ' (you)' : ''}</span>
                  <span className="text-orange-400 font-bold">{r.total_score.toLocaleString()}</span>
                </div>
              )
            })}
          </div>
          <p className="text-center text-gray-500 text-sm animate-pulse">Waiting for host to continue…</p>
        </div>
      </Screen>
    )
  }

  // ── FINISHED ──────────────────────────────────────────────────────────────
  if (session.state === 'finished') {
    const medals = ['🥇','🥈','🥉']
    return (
      <Screen>
        <div className="w-full max-w-lg mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-1">Game Over!</h2>
          {myRank && <p className="text-orange-400 font-semibold text-lg mb-6">You finished #{myRank}</p>}
          <div className="space-y-2 mb-8">
            {rankings.map((r, i) => {
              const isMe = r.display_name === displayName
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${isMe ? 'border-orange-500 bg-orange-500/10' : 'border-gray-800 bg-gray-900'}`}
                >
                  <span className="w-8 text-center text-lg">{medals[i] ?? `#${r.final_rank ?? i + 1}`}</span>
                  <span className={`flex-1 font-medium ${isMe ? 'text-orange-300' : 'text-white'}`}>{r.display_name}</span>
                  <span className="text-orange-400 font-bold">{r.total_score.toLocaleString()}</span>
                </div>
              )
            })}
          </div>
          <button
            onClick={() => router.push('/play')}
            className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded-xl transition-colors"
          >
            Play Again
          </button>
        </div>
      </Screen>
    )
  }

  return null
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
      {children}
    </div>
  )
}

function HostGoneBanner() {
  return (
    <div className="w-full max-w-lg mx-auto bg-yellow-900 border border-yellow-500 rounded-xl px-4 py-3 mb-4 text-center">
      <p className="text-yellow-300 text-sm font-medium">Host disconnected — game paused</p>
    </div>
  )
}
