import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminDashboard from './AdminDashboard'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    redirect('/login?next=/admin')
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-14">
      <div className="w-full max-w-2xl">
        <p className="sg-eyebrow text-center mb-4">Admin</p>
        <h1 className="font-cinzel font-700 text-[#f0ede8] text-center leading-[0.92] tracking-[-0.01em] mb-10"
            style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)' }}>
          Claim Links.
        </h1>
        <AdminDashboard />
      </div>
    </main>
  )
}
