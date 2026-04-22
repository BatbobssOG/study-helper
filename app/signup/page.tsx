'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/study')
    router.refresh()
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <div className="text-4xl mb-3">🔧</div>
          <h1 className="text-3xl font-bold text-white">Create account</h1>
          <p className="text-gray-400 mt-1">Join the Pipetrades study program</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pr-16 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-colors"
                placeholder="At least 6 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-300 transition-colors px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-orange-500 rounded"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-gray-300 mb-1">
              Confirm Password
            </label>
            <div className="relative">
              <input
                id="confirm"
                type={showConfirm ? 'text' : 'password'}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-4 py-3 pr-16 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-colors"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-300 transition-colors px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-orange-500 rounded"
              >
                {showConfirm ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-6 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-900 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-950"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-gray-400 text-sm">
          Already have an account?{' '}
          <Link href="/login" className="text-orange-400 hover:text-orange-300 font-medium">
            Sign in
          </Link>
        </p>
        <p className="text-center">
          <Link href="/" className="text-gray-600 hover:text-gray-400 text-sm">
            ← Back to home
          </Link>
        </p>
      </div>
    </main>
  )
}
