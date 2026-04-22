import { cookies } from 'next/headers'
import crypto from 'crypto'
import AdminLogin from './AdminLogin'
import AdminDashboard from './AdminDashboard'

function adminHash() {
  return crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD ?? '').digest('hex')
}

export default async function AdminPage() {
  const jar = await cookies()
  const authed = jar.get('admin_auth')?.value === adminHash()

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-14">
      <div className="w-full max-w-2xl">
        <p className="sg-eyebrow text-center mb-4">Admin</p>
        <h1 className="font-cinzel font-700 text-[#f0ede8] text-center leading-[0.92] tracking-[-0.01em] mb-10"
            style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)' }}>
          Claim Links.
        </h1>
        {authed ? <AdminDashboard /> : <AdminLogin />}
      </div>
    </main>
  )
}
