import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase-server'

export async function GET() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    }
  )

  const { data: { user }, error: userErr } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({
      step: 'getUser',
      user: null,
      error: userErr?.message,
      cookieCount: cookieStore.getAll().length,
    })
  }

  const admin = createAdminClient()
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    userId: user.id,
    userEmail: user.email,
    profile,
    profileError: profErr?.message,
  })
}
