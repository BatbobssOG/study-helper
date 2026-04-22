'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'

export default function AdminNav() {
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
        href="/admin"
        className="flex items-center gap-2 font-semibold text-white hover:text-orange-400 transition-colors"
      >
        <span>⚙️</span>
        <span>Admin Panel</span>
      </a>

      <div className="ml-auto flex items-center gap-3">
        <a
          href="/study"
          className="text-sm text-gray-500 hover:text-white transition-colors"
        >
          ← Student view
        </a>
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
