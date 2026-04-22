import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/require-user'
import QuizClient from './QuizClient'

export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  await requireUser()
  const { session } = await searchParams
  if (!session) redirect('/study/select')

  return <QuizClient sessionId={session} />
}
