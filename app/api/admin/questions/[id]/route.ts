import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/admin/questions/[id]  — approve or edit a question
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()

  const db = createAdminClient()
  const { error } = await db
    .from('quiz_questions')
    .update(body)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/questions/[id]  — remove a question
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const db = createAdminClient()
  const { error } = await db.from('quiz_questions').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
