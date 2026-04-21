import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export async function GET() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('classes')
    .select('id, name, slug, display_order')
    .order('display_order')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
