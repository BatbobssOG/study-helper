'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
const PLAYER_ID_KEY = 'pipetrades_player_id'

function getOrCreatePlayerId(): string {
  if (typeof window === 'undefined') return ''
  const existing = localStorage.getItem(PLAYER_ID_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(PLAYER_ID_KEY, id)
  return id
}

export default function PlayPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-gray-950" />}>
      <PlayForm />
    </Suspense>
  )
}

function PlayForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [code,        setCode]        = useState(searchParams.get('code')?.toUpperCase() ?? '')
  const [displayName, setDisplayName] = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const playerIdRef = useRef('')

  useEffect(() => {
    playerIdRef.current = getOrCreatePlayerId()
  }, [])

  const handleJoin = async () => {
    setError('')
    const trimCode = code.trim().toUpperCase()
    const trimName = displayName.trim()

    if (trimCode.length !== 6)          return setError('Enter a 6-character game code')
    if (trimName.length < 2)            return setError('Name must be at least 2 characters')
    if (trimName.length > 20)           return setError('Name must be 20 characters or fewer')

    setLoading(true)
    try {
      const res = await fetch('/api/kahoot/join', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code:         trimCode,
          display_name: trimName,
          player_id:    playerIdRef.current,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not join')
      router.push(`/play/${trimCode}?name=${encodeURIComponent(trimName)}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-white text-center mb-2">Join a Game</h1>
        <p className="text-gray-400 text-center mb-8 text-sm">No account needed</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Game Code</label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="WELD42"
              autoCapitalize="characters"
              inputMode="text"
              className="w-full bg-gray-800 text-white border border-gray-700 rounded-xl px-4 py-4 text-2xl font-mono text-center tracking-widest focus:outline-none focus:border-orange-500 uppercase"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Your Name</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value.slice(0, 20))}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="e.g. Raide"
              className="w-full bg-gray-800 text-white border border-gray-700 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-orange-500"
            />
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            onClick={handleJoin}
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl text-lg transition-colors"
          >
            {loading ? 'Joining…' : 'Join Game →'}
          </button>
        </div>
      </div>
    </main>
  )
}
