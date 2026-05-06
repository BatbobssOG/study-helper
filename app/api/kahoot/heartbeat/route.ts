import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { requireUser } from '@/lib/require-user'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await requireUser()
  const db = createAdminClient()
  const { session_id } = await req.json()

  if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 })

  const { error } = await db
    .from('kahoot_sessions')
    .update({ host_last_seen_at: new Date().toISOString() })
    .eq('id', session_id)
    .eq('host_user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
