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
