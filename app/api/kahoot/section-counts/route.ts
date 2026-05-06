import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Returns { [section_id]: count } for all approved questions.
// Used by the session creation form to show live question counts per section.
export async function GET() {
  const db = createAdminClient()

  const { data, error } = await db
    .from('quiz_questions')
    .select('section_id')
    .eq('approved', true)
    .limit(10000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    if (row.section_id) {
      counts[row.section_id] = (counts[row.section_id] ?? 0) + 1
    }
  }

  return NextResponse.json({ counts })
}
