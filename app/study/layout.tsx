import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import StudyNav from './StudyNav'

export default async function StudyLayout({
  children,
}: {
  children: React.ReactNode
}) {
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

  return (
    <>
      <StudyNav email={user?.email ?? ''} />
      <div>{children}</div>
    </>
  )
}
