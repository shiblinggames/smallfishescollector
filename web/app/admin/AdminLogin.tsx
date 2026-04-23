'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { adminLogin } from './actions'

export default function AdminLogin() {
  const [state, action, pending] = useActionState(adminLogin, { ok: false })
  const router = useRouter()

  useEffect(() => {
    if (state.ok) router.refresh()
  }, [state.ok, router])

  return (
    <form action={action} className="sg-card p-8 space-y-6 max-w-sm mx-auto">
      {!state.ok && state.ok === false && (
        <p className="text-sm font-karla border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-400 text-center" style={{ display: 'contents' }}>
        </p>
      )}
      <div className="space-y-1.5">
        <label className="sg-eyebrow block">Password</label>
        <input
          type="password"
          name="password"
          required
          className="sg-input"
          placeholder="••••••••"
          autoFocus
        />
      </div>
      <button type="submit" disabled={pending} className="btn-ghost w-full">
        {pending ? 'Checking…' : 'Enter'}
      </button>
    </form>
  )
}
