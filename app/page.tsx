import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Logo / Title */}
        <div className="space-y-2">
          <div className="text-5xl mb-4">🔧</div>
          <h1 className="text-4xl font-bold text-white tracking-tight">
            Pipetrades Study Helper
          </h1>
          <p className="text-gray-400 text-lg">
            SAIT Winter 2026 Pre-Employment Program
          </p>
        </div>

        {/* Feature bullets */}
        <ul className="text-left space-y-2 text-sm text-gray-400">
          <li className="flex items-start gap-2"><span className="text-orange-400 mt-0.5">✓</span>943 practice questions from your course material</li>
          <li className="flex items-start gap-2"><span className="text-orange-400 mt-0.5">✓</span>Flashcard mode with progress tracking &amp; resume</li>
          <li className="flex items-start gap-2"><span className="text-orange-400 mt-0.5">✓</span>Scored quiz mode with per-question review</li>
          <li className="flex items-start gap-2"><span className="text-orange-400 mt-0.5">✓</span>Built for SAIT Winter 2026 Pipetrades</li>
        </ul>

        {/* Divider */}
        <div className="border-t border-gray-800" />

        {/* CTA Buttons */}
        <div className="space-y-3">
          <Link
            href="/login"
            className="block w-full py-3 px-6 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-lg transition-colors"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="block w-full py-3 px-6 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors border border-gray-700"
          >
            Create Account
          </Link>
        </div>

        <p className="text-gray-600 text-sm">
          Study flashcards &amp; practice quizzes from your course material
        </p>
      </div>
    </main>
  )
}
