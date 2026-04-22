import { requireAdmin } from '@/lib/require-admin'
import AdminNav from './AdminNav'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdmin()

  return (
    <>
      <AdminNav />
      <div>{children}</div>
    </>
  )
}
