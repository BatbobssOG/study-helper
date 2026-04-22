import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/require-user'
import { createAdminClient } from '@/lib/supabase-server'

type AnswerEntry = {
  question_id: string
  question: string
  options: { A: string; B: string; C: string; D: string }
  correct_answer: string
  explanation: string
  selected: string
}

export default async function QuizResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ attempt?: string }>
}) {
  const { userId } = await requireUser()
  const { attempt: attemptId } = await searchParams
  if (!attemptId) redirect('/study')

  const db = createAdminClient()
  const { data: attempt } = await db
    .from('quiz_attempts')
    .select('score, total, answers, completed_at')
    .eq('id', attemptId)
    .eq('user_id', userId)
    .single()

  if (!attempt) redirect('/study')

  const { score, total, answers } = attempt
  const pct = total > 0 ? Math.round((score / total) * 100) : 0
  const passed = pct >= 70

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <a href="/study" className="text-sm text-gray-400 hover:text-white transition-colors">
          ← Dashboard
        </a>
      </div>

      {/* Score card */}
      <div className="text-center mb-10">
        <div className="text-5xl mb-4">{pct >= 90 ? '🏆' : pct >= 70 ? '🎉' : '📚'}</div>
        <h1 className="text-3xl font-bold text-white mb-2">Quiz Complete</h1>
        <div className={`text-6xl font-bold mb-2 ${passed ? 'text-green-400' : 'text-red-400'}`}>
          {pct}%
        </div>
        <p className="text-gray-400">{score} correct out of {total} questions</p>
        <div className={`inline-block mt-3 px-4 py-1.5 rounded-full text-sm font-semibold ${
          passed ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
        }`}>
          {passed ? 'Passed' : 'Keep studying'}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 mb-10">
        <a
          href="/study/select"
          className="flex-1 text-center py-3 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-xl transition-colors"
        >
          New Quiz
        </a>
        <a
          href="/study"
          className="flex-1 text-center py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-xl transition-colors"
        >
          Dashboard
        </a>
      </div>

      {/* Per-question review */}
      <h2 className="text-lg font-semibold text-white mb-4">Question Review</h2>
      <div className="space-y-4">
        {(answers as AnswerEntry[]).map((a, i) => {
          const correct = a.selected === a.correct_answer
          return (
            <div
              key={a.question_id}
              className={`rounded-2xl border p-5 ${
                correct
                  ? 'bg-green-500/5 border-green-500/30'
                  : 'bg-red-500/5 border-red-500/30'
              }`}
            >
              <div className="flex items-start gap-3 mb-4">
                <span className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                  correct ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {correct ? '✓' : '✗'}
                </span>
                <p className="text-white text-sm leading-relaxed">{i + 1}. {a.question}</p>
              </div>

              {/* Options */}
              <div className="space-y-2 ml-9">
                {(['A', 'B', 'C', 'D'] as const).map((key) => {
                  const isCorrect = key === a.correct_answer
                  const isSelected = key === a.selected
                  const isWrong = isSelected && !isCorrect
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                        isCorrect
                          ? 'bg-green-500/15 text-green-300'
                          : isWrong
                            ? 'bg-red-500/15 text-red-300'
                            : 'text-gray-500'
                      }`}
                    >
                      <span className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-xs font-bold ${
                        isCorrect
                          ? 'bg-green-500/30 text-green-400'
                          : isWrong
                            ? 'bg-red-500/30 text-red-400'
                            : 'bg-gray-800 text-gray-600'
                      }`}>
                        {key}
                      </span>
                      <span>{a.options[key]}</span>
                      {isCorrect && <span className="ml-auto text-xs text-green-500 font-medium">Correct</span>}
                      {isWrong && <span className="ml-auto text-xs text-red-500 font-medium">Your answer</span>}
                    </div>
                  )
                })}
              </div>

              {/* Explanation */}
              {a.explanation && (
                <div className="mt-4 ml-9 pt-3 border-t border-gray-700/50">
                  <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">Explanation</p>
                  <p className="text-gray-400 text-sm leading-relaxed">{a.explanation}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
