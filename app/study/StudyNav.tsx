'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'

export default function StudyNav({ email }: { email: string }) {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <nav className="sticky top-0 z-50 h-14 bg-gray-950/90 backdrop-blur-sm border-b border-gray-800 flex items-center px-5">
      <a
        href="/study"
        className="flex items-center gap-2 font-semibold text-white hover:text-orange-400 transition-colors"
      >
        <span>🔧</span>
        <span>Pipetrades</span>
      </a>

      <div className="ml-auto flex items-center gap-3">
        <a
          href="/study/select"
          className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          + New Session
        </a>
        {email && (
          <span className="text-gray-500 text-sm hidden sm:block truncate max-w-[180px]">
            {email}
          </span>
        )}
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
