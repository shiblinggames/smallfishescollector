import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RedeemClient from './RedeemClient'
import ShopHeader from '@/components/ShopHeader'

export default async function RedeemPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main className="min-h-screen pb-24 sm:pb-0 pt-6">
      <div className="px-4 sm:px-6 max-w-sm mx-auto">
        <ShopHeader title="Redeem" backLabel="Market" href="/marketplace" />

        {/* Card chrome so the form reads as a real shop panel, not a stray
            system input. */}
        <div style={{
          background: 'linear-gradient(180deg, rgba(20,16,9,0.92) 0%, rgba(10,8,5,0.94) 100%)',
          border: '1px solid rgba(196,169,106,0.3)',
          borderTop: '1px solid rgba(196,169,106,0.5)',
          borderRadius: 16, padding: '1.4rem 1.25rem',
          boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <span aria-hidden style={{
              width: 46, height: 46, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.32)',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z" />
                <path d="M13 7v10" strokeDasharray="2 2" />
              </svg>
            </span>
            <p className="font-karla font-400 text-center" style={{ fontSize: '0.78rem', color: '#9a948a', lineHeight: 1.5 }}>
              Enter a pack or gift code to claim its reward.
            </p>
          </div>
          <RedeemClient />
        </div>
      </div>
    </main>
  )
}
