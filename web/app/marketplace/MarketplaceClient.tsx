'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { HOOKS } from '@/lib/hooks'
import { buyHook } from '@/app/hooks/actions'

export default function MarketplaceClient({ hookTier: initialTier, doubloons: initialDoubloons, isPremium }: { hookTier: number; doubloons: number; isPremium: boolean }) {
  const router = useRouter()
  const [hookTier, setHookTier] = useState(initialTier)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [isPending, startTransition] = useTransition()
  const [hookError, setHookError] = useState<string | null>(null)
  const [tooltipTier, setTooltipTier] = useState<number | null>(null)

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

      {/* Premium membership CTA */}
      {isPremium ? (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: 'rgba(240,192,64,0.08)', border: '1px solid rgba(240,192,64,0.22)' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="#f0c040" stroke="none">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          <p className="font-karla font-600 text-[#f0c040]" style={{ fontSize: '0.72rem' }}>You&apos;re a Small Fishes Member — enjoy your daily pack and bonus doubloons.</p>
        </div>
      ) : (
        <div style={{ background: 'rgba(240,192,64,0.05)', border: '1px solid rgba(240,192,64,0.18)', borderRadius: 14, overflow: 'hidden' }}>
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#f0c040" stroke="none">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <p className="font-karla font-700 uppercase tracking-[0.14em] text-[#f0c040]" style={{ fontSize: '0.6rem' }}>Small Fishes Membership</p>
            </div>
            <p className="font-karla font-300 text-[#a09d98] mb-4" style={{ fontSize: '0.78rem', lineHeight: 1.55 }}>
              Support our small crew and get daily perks to keep your collection growing.
            </p>
            <div className="flex flex-col gap-2 mb-4">
              {[
                { icon: '📦', text: '1 free pack every day' },
                { icon: '⟡', text: '100 doubloons daily (vs. 50 free)' },
                { icon: '★', text: 'Member badge on your profile' },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-2.5">
                  <span style={{ fontSize: '0.75rem', width: 16, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                  <p className="font-karla font-400 text-[#c8c5c0]" style={{ fontSize: '0.76rem' }}>{text}</p>
                </div>
              ))}
            </div>
            <a
              href="https://shiblingshop.com/products/small-fishes-premium-membership"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-karla font-700 uppercase tracking-[0.12em] transition-opacity hover:opacity-80"
              style={{ background: 'rgba(240,192,64,0.18)', border: '1px solid rgba(240,192,64,0.35)', color: '#f0c040', fontSize: '0.65rem' }}
            >
              Become a Member
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="2.5" strokeLinecap="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </a>
          </div>
        </div>
      )}

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
          <button type="submit" disabled={redeemStatus === 'loading'} className="btn-ghost shrink-0" style={{ padding: '0 1.25rem' }}>
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
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.11)' }} />

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
            const showTooltip = tooltipTier === hook.tier
            const c = hook.color

            const isNext = hook.tier === hookTier + 1
            const clickable = isNext && canAfford && !isPending
            const luckPct = Math.round((hook.deepChance - HOOKS[0].deepChance) / (HOOKS[HOOKS.length - 1].deepChance - HOOKS[0].deepChance) * 100)

            return (
              <div
                key={hook.tier}
                onClick={clickable ? handleBuyHook : undefined}
                style={{
                  background: owned ? `${c}0d` : isNext && canAfford ? `${c}08` : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${owned ? `${c}55` : isNext && canAfford ? `${c}40` : 'rgba(255,255,255,0.09)'}`,
                  boxShadow: isActive ? `0 0 16px ${c}18` : isNext && canAfford ? `0 0 12px ${c}12` : 'none',
                  borderRadius: 12,
                  padding: '0.75rem 0.875rem',
                  opacity: locked ? 0.3 : isPending && isNext ? 0.6 : 1,
                  cursor: clickable ? 'pointer' : 'default',
                  transition: 'box-shadow 0.2s ease, opacity 0.15s ease',
                }}
              >
                <div className="flex items-start gap-3">
                  <HookIcon tier={hook.tier} color={c} owned={owned} isActive={isActive} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: owned ? '#f0ede8' : '#6a6764' }}>
                        {hook.name}
                      </p>
                      {isActive && (
                        <span className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.52rem', color: c }}>Active</span>
                      )}
                      {owned && !isActive && (
                        <span className="font-karla font-300 uppercase tracking-[0.10em] text-[#4ade80]" style={{ fontSize: '0.52rem' }}>Owned</span>
                      )}
                    </div>
                    <p className="font-karla font-300 text-[#6a6764]" style={{ fontSize: '0.7rem' }}>{hook.description}</p>

                    {isNext && (
                      <p className="font-karla font-600 mt-1" style={{ fontSize: '0.65rem', color: canAfford ? c : '#6a6764' }}>
                        {isPending ? 'Upgrading…' : canAfford ? '↑ Tap to upgrade' : `${(hook.cost - doubloons).toLocaleString()} ⟡ short`}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {!owned && (
                      <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '0.8rem' }}>
                        {hook.cost.toLocaleString()} ⟡
                      </p>
                    )}
                    <p className="font-karla font-600" style={{ fontSize: '0.65rem', color: owned ? c : '#4a4845' }}>
                      {luckPct}% luck
                    </p>
                    <button
                      onClick={(e) => { e.stopPropagation(); setTooltipTier(showTooltip ? null : hook.tier) }}
                      onMouseEnter={() => setTooltipTier(hook.tier)}
                      onMouseLeave={() => setTooltipTier(null)}
                      className="transition-colors"
                      style={{ color: showTooltip ? '#a0a09a' : '#4a4845', lineHeight: 1 }}
                      aria-label="Show zone breakdown"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="8.5"/>
                        <line x1="12" y1="12" x2="12" y2="16"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {showTooltip && (
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1" style={{ paddingLeft: 50 }}>
                    {[
                      { label: 'Shallows', value: hook.weights.shallows, color: '#60a5fa' },
                      { label: 'Open Waters', value: hook.weights.openWaters, color: '#4ade80' },
                      { label: 'Deep', value: hook.weights.deep, color: '#a78bfa' },
                      { label: 'Abyss', value: hook.weights.abyss, color: '#f0c040' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex items-center justify-between gap-2">
                        <p className="font-karla font-300 text-[#6a6764]" style={{ fontSize: '0.65rem' }}>{label}</p>
                        <p className="font-karla font-600" style={{ fontSize: '0.65rem', color }}>{(value * 100).toFixed(1)}%</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {hookError && <p className="font-karla font-300 text-red-400 text-xs text-center mb-2">{hookError}</p>}
        {!nextHook && (
          <p className="font-karla font-300 text-[#a0a09a] text-sm text-center">
            You have the best hook in the sea.
          </p>
        )}
      </div>
    </div>
  )
}

function HookIcon({ tier, color, owned, isActive }: { tier: number; color: string; owned: boolean; isActive: boolean }) {
  const stroke = owned ? color : '#4a4845'
  const fill = owned ? color : '#4a4845'
  const bg = owned ? `${color}12` : 'rgba(255,255,255,0.06)'
  const border = owned ? `${color}35` : 'rgba(255,255,255,0.11)'

  const icons: Record<number, React.ReactNode> = {
    0: ( // Rusty — simple rough hook
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v9"/>
        <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <circle cx="12" cy="3" r="1.2" fill={fill} stroke="none"/>
        <circle cx="9" cy="7" r="0.5" fill={stroke} stroke="none" opacity="0.5"/>
        <circle cx="13" cy="10" r="0.4" fill={stroke} stroke="none" opacity="0.4"/>
      </svg>
    ),
    1: ( // Bent — angled shank
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 3 L13 8 L11 12"/>
        <path d="M11 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <circle cx="13" cy="3" r="1.3" fill={fill} stroke="none"/>
      </svg>
    ),
    2: ( // Iron — barbed hook
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v9"/>
        <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <path d="M9.5 15.5 L7.5 13.5"/>
        <circle cx="12" cy="3" r="1.3" fill={fill} stroke="none"/>
      </svg>
    ),
    3: ( // Steel — ring on shank
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v9"/>
        <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <ellipse cx="12" cy="7" rx="2.5" ry="1" strokeWidth="1.4"/>
        <circle cx="12" cy="3" r="1.3" fill={fill} stroke="none"/>
      </svg>
    ),
    4: ( // Gold — ornate loop top
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v7"/>
        <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <path d="M9 3 C9 1.5 15 1.5 15 3 C15 4.5 12 5 12 5"/>
        <path d="M9.5 15.5 L7.5 13.5"/>
      </svg>
    ),
    5: ( // Enchanted — sparkles
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v9"/>
        <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <circle cx="12" cy="3" r="1.3" fill={fill} stroke="none"/>
        <circle cx="17" cy="5" r="0.8" fill={fill} stroke="none" opacity="0.7"/>
        <circle cx="15" cy="9" r="0.6" fill={fill} stroke="none" opacity="0.5"/>
        <circle cx="7" cy="7" r="0.7" fill={fill} stroke="none" opacity="0.6"/>
      </svg>
    ),
    6: ( // Legendary — trident tip
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v7"/>
        <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <path d="M9 2 L12 5 L15 2"/>
        <path d="M9 2 L9 4M15 2 L15 4"/>
        <path d="M9.5 15.5 L7.5 13.5"/>
      </svg>
    ),
  }

  return (
    <div style={{
      width: 38, height: 38, borderRadius: 10, flexShrink: 0,
      background: bg,
      border: `1px solid ${border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: isActive ? `0 0 10px ${color}25` : 'none',
    }}>
      {icons[tier]}
    </div>
  )
}
