import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/require-user'
import FlashcardClient from './FlashcardClient'

export default async function FlashcardsPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  await requireUser()
  const { session } = await searchParams
  if (!session) redirect('/study/select')

  return <FlashcardClient sessionId={session} />
}
