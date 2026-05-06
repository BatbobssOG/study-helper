import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { requireUser } from '@/lib/require-user'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const user = await requireUser()
  const db = createAdminClient()
  const { sessionId } = params

  const { data: session } = await db
    .from('kahoot_sessions')
    .select('id, name, host_user_id, question_count, state, ended_at')
    .eq('id', sessionId)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.host_user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (session.state !== 'finished') return NextResponse.json({ error: 'Game not finished yet' }, { status: 400 })

  const { data: players } = await db
    .from('kahoot_player_scores')
    .select('player_id, display_name, total_score, questions_correct, final_rank')
    .eq('session_id', sessionId)
    .order('final_rank', { ascending: true })

  const { data: answers } = await db
    .from('kahoot_answers')
    .select('player_id, question_index, is_correct, response_ms')
    .eq('session_id', sessionId)
    .order('question_index', { ascending: true })

  // Build per-player answer lookup
  const answerMap: Record<string, Record<number, { is_correct: boolean; response_ms: number | null }>> = {}
  for (const a of answers ?? []) {
    if (!answerMap[a.player_id]) answerMap[a.player_id] = {}
    answerMap[a.player_id][a.question_index] = { is_correct: a.is_correct, response_ms: a.response_ms }
  }

  const qCount = session.question_count
  const qHeaders = Array.from({ length: qCount }, (_, i) => `q${i + 1}_correct`).join(',')

  const rows = (players ?? []).map(p => {
    const accuracy = qCount > 0 ? Math.round((p.questions_correct / qCount) * 100) : 0
    const correctAnswers = answerMap[p.player_id] ?? {}
    const responseTimes = Object.values(correctAnswers)
      .filter(a => a.is_correct && a.response_ms !== null)
      .map(a => a.response_ms as number)
    const avgResponseMs = responseTimes.length
      ? Math.round(responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length)
      : ''

    const qCols = Array.from({ length: qCount }, (_, i) => {
      const a = correctAnswers[i]
      return a ? (a.is_correct ? 'TRUE' : 'FALSE') : ''
    }).join(',')

    return [
      p.final_rank,
      `"${p.display_name.replace(/"/g, '""')}"`,
      p.total_score,
      p.questions_correct,
      qCount,
      `${accuracy}%`,
      avgResponseMs,
      qCols,
    ].join(',')
  })

  const header = `rank,display_name,total_score,questions_correct,questions_total,accuracy_pct,avg_response_ms,${qHeaders}`
  const csv = [header, ...rows].join('\n')

  const date = session.ended_at ? new Date(session.ended_at).toISOString().slice(0, 10) : 'export'
  const filename = `${session.name.replace(/[^a-z0-9]/gi, '_')}_${date}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
