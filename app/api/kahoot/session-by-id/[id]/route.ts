import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { requireUser } from '@/lib/require-user'

export const dynamic = 'force-dynamic'

// Host-only lookup: resolves a session UUID to its code so the host game
// page can then call GET /api/kahoot/state/[code].
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser()
  const db = createAdminClient()
  const { id } = await params

  const { data: session } = await db
    .from('kahoot_sessions')
    .select('code, host_user_id')
    .eq('id', id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.host_user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json({ code: session.code })
}
