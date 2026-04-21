import { requireAdmin } from '@/lib/require-admin'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // This runs on every admin page render.
  // Redirects to /login if not authenticated, /study if not admin.
  await requireAdmin()

  return <>{children}</>
}
