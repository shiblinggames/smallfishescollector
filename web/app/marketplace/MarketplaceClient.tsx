'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { HOOKS } from '@/lib/hooks'
import { buyHook } from '@/app/hooks/actions'

export default function MarketplaceClient({ hookTier: initialTier, doubloons: initialDoubloons }: { hookTier: number; doubloons: number }) {
  const router = useRouter()
  const [hookTier, setHookTier] = useState(initialTier)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [isPending, startTransition] = useTransition()
  const [hookError, setHookError] = useState<string | null>(null)

  // Redeem state
  const [code, setCode] = useState('')
  const [redeemStatus, setRedeemStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [redeemMessage, setRedeemMessage] = useState('')

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault()
    setRedeemStatus('loading')
    setRedeemMessage('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const normalized = code.trim().toUpperCase()
    const { data: row, error } = await supabase
      .from('redemption_codes')
      .select('id, redeemed_by, packs_granted')
      .eq('code', normalized)
      .single()

    if (error || !row) { setRedeemStatus('error'); setRedeemMessage('Code not found. Double-check and try again.'); return }
    if (row.redeemed_by) { setRedeemStatus('error'); setRedeemMessage('This code has already been redeemed.'); return }

    const { error: updateErr } = await supabase
      .from('redemption_codes')
      .update({ redeemed_by: user.id, redeemed_at: new Date().toISOString() })
      .eq('id', row.id)

    if (updateErr) { setRedeemStatus('error'); setRedeemMessage('Something went wrong. Please try again.'); return }

    const { data: profile } = await supabase.from('profiles').select('packs_available').eq('id', user.id).single()
    await supabase.from('profiles').update({ packs_available: (profile?.packs_available ?? 0) + row.packs_granted }).eq('id', user.id)

    setRedeemStatus('success')
    setRedeemMessage(`✦ ${row.packs_granted} pack${row.packs_granted > 1 ? 's' : ''} added to your account.`)
    setCode('')
    router.refresh()
  }

  function handleBuyHook() {
    setHookError(null)
    startTransition(async () => {
      const result = await buyHook()
      if ('error' in result) {
        setHookError(result.error)
      } else {
        setHookTier(result.hookTier)
        setDoubloons(result.doubloons)
      }
    })
  }

  const nextHook = hookTier < HOOKS.length - 1 ? HOOKS[hookTier + 1] : null
  const canAfford = nextHook ? doubloons >= nextHook.cost : false

  return (
    <div className="px-6 max-w-sm mx-auto space-y-8">

      {/* Redeem section */}
      <div>
        <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] mb-3" style={{ fontSize: '0.65rem' }}>
          Pack Code
        </p>
        <form onSubmit={handleRedeem} className="flex gap-2">
          <input
            type="text"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="sg-input font-karla font-600 tracking-[0.16em] text-center text-sm uppercase flex-1"
            placeholder="FISH-XXXXX"
            spellCheck={false}
          />
          <button type="submit" disabled={redeemStatus === 'loading'} className="btn-gold shrink-0" style={{ padding: '0 1.25rem' }}>
            {redeemStatus === 'loading' ? '…' : 'Redeem'}
          </button>
        </form>
        {redeemStatus === 'success' && (
          <p className="font-karla font-600 text-[#f0c040] text-xs mt-2">{redeemMessage}</p>
        )}
        {redeemStatus === 'error' && (
          <p className="font-karla font-300 text-red-400 text-xs mt-2">{redeemMessage}</p>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

      {/* Tackle shop */}
      <div>
        <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] mb-3" style={{ fontSize: '0.65rem' }}>
          Tackle Shop
        </p>
        <div className="flex flex-col gap-2.5 mb-6">
          {HOOKS.map((hook) => {
            const owned = hook.tier <= hookTier
            const isActive = hook.tier === hookTier
            const locked = hook.tier > hookTier + 1

            return (
              <div
                key={hook.tier}
                style={{
                  background: isActive ? 'rgba(240,192,64,0.06)' : owned ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isActive ? 'rgba(240,192,64,0.35)' : owned ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)'}`,
                  borderRadius: 12,
                  padding: '0.75rem 0.875rem',
                  opacity: locked ? 0.35 : 1,
                }}
              >
                <div className="flex items-center gap-3">
                  <HookIcon active={isActive} owned={owned} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.85rem' }}>
                        {hook.name}
                      </p>
                      {isActive && (
                        <span className="font-karla font-600 uppercase tracking-[0.12em] text-[#f0c040]" style={{ fontSize: '0.52rem' }}>Active</span>
                      )}
                      {owned && !isActive && (
                        <span className="font-karla font-300 uppercase tracking-[0.10em] text-[#4ade80]" style={{ fontSize: '0.52rem' }}>Owned</span>
                      )}
                    </div>
                    <p className="font-karla font-300 text-[#6a6764]" style={{ fontSize: '0.7rem' }}>{hook.description}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <p className="font-karla font-300 text-[#4a4845] uppercase tracking-[0.10em]" style={{ fontSize: '0.58rem' }}>Deep luck</p>
                      <LuckBar score={hook.luckScore} />
                      <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: hook.luckScore === 0 ? '#4a4845' : '#8a8880' }}>
                        {hook.luckLabel}
                      </p>
                    </div>
                  </div>
                  {!owned && (
                    <p className="font-cinzel font-700 text-[#f0c040] shrink-0" style={{ fontSize: '0.8rem' }}>
                      {hook.cost.toLocaleString()} ⟡
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {nextHook ? (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleBuyHook}
              disabled={isPending || !canAfford}
              className="btn-gold w-full disabled:opacity-40"
              style={{ cursor: canAfford ? 'pointer' : 'default' }}
            >
              {isPending ? 'Buying…' : `Upgrade to ${nextHook.name} · ${nextHook.cost.toLocaleString()} ⟡`}
            </button>
            {!canAfford && (
              <p className="font-karla font-300 text-[#6a6764] text-xs">
                You need {(nextHook.cost - doubloons).toLocaleString()} more ⟡
              </p>
            )}
            {hookError && <p className="font-karla font-300 text-red-400 text-xs">{hookError}</p>}
          </div>
        ) : (
          <p className="font-karla font-300 text-[#8a8880] text-sm text-center">
            You have the best hook in the sea.
          </p>
        )}
      </div>
    </div>
  )
}

function LuckBar({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 6, height: 6, borderRadius: 1.5,
            background: i < score ? '#f0c040' : 'rgba(255,255,255,0.08)',
          }}
        />
      ))}
    </div>
  )
}

function HookIcon({ active, owned }: { active: boolean; owned: boolean }) {
  const color = active ? '#f0c040' : owned ? '#8a8880' : '#4a4845'
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 9, flexShrink: 0,
      background: active ? 'rgba(240,192,64,0.08)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${active ? 'rgba(240,192,64,0.2)' : 'rgba(255,255,255,0.06)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v10"/>
        <path d="M12 12c0 4-3 6-5 4s-1-5 2-5"/>
        <circle cx="12" cy="3" r="1.5" fill={color} stroke="none"/>
      </svg>
    </div>
  )
}
