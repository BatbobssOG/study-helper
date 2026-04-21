import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { mode, class_ids, section_ids } = body

  if (!mode || !Array.isArray(class_ids) || class_ids.length === 0) {
    return NextResponse.json({ error: 'mode and class_ids are required' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data, error } = await db
    .from('study_sessions')
    .insert({
      user_id: user.id,
      mode,
      class_ids,
      section_ids: section_ids?.length ? section_ids : null,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ session_id: data.id })
}
