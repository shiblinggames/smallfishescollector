'use client'

// THE BOUNTY BOARD. The expedition side's daily orders, and the best gem source
// in the game.
//
// The fishing dailies tick over while you fish and mostly claim themselves.
// These do not: a bounty names a captain to sink or a depth to reach, and you
// have to go and do it. So the board leads with what is still on the table
// today rather than with how much you have already taken, because the number
// that gets someone back out on the water is the one they have not earned yet.

import { useState, useEffect, useTransition, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getBountyBoard, claimBounty, rerollBounty, type BountyBoard, type BountyView } from './bountyActions'

// Four tiers, and the colour climbs with the price. Elite shares the board's
// own purple because it IS the board at full stretch.
const TIER: Record<BountyView['tier'], { label: string; color: string }> = {
  easy:   { label: 'Easy',   color: '#7f9bb5' },
  medium: { label: 'Medium', color: '#6fb58a' },
  hard:   { label: 'Hard',   color: '#d0a24a' },
  elite:  { label: 'Elite',  color: '#c084fc' },
}

const GEM = '◆'
const GEM_COLOR = '#c084fc'
const TNUM = { fontVariantNumeric: 'tabular-nums' as const }

function SwapIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8h13l-3.5-3.5M21 16H8l3.5 3.5" />
    </svg>
  )
}

function BountyRow({ b, rerollUsed, busy, onClaim, onSwap }: {
  b: BountyView
  rerollUsed: boolean
  busy: boolean
  onClaim: () => void
  onSwap: () => void
}) {
  const t = TIER[b.tier]
  const done = b.progress >= b.target
  const pct = b.target > 0 ? Math.min(1, b.progress / b.target) : 0

  return (
    <div style={{
      position: 'relative', padding: '0.7rem 0.8rem', borderRadius: 13,
      background: b.claimed
        ? 'rgba(255,255,255,0.02)'
        : 'linear-gradient(180deg, rgba(19,23,31,0.96) 0%, rgba(11,14,19,0.97) 100%)',
      border: `1px solid ${b.claimed ? 'rgba(255,255,255,0.05)' : done ? `${t.color}55` : 'rgba(255,255,255,0.09)'}`,
      borderTop: `1px solid ${b.claimed ? 'rgba(255,255,255,0.06)' : done ? `${t.color}88` : 'rgba(255,255,255,0.13)'}`,
      opacity: b.claimed ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.52rem', color: t.color }}>
          {t.label}
        </span>
        <span className="font-karla font-800" style={{ fontSize: '0.72rem', color: GEM_COLOR, ...TNUM }}>
          {b.gems} {GEM}
        </span>
      </div>

      <p className="font-cinzel font-700" style={{ fontSize: '0.98rem', color: b.claimed ? '#8b8781' : '#f2ede2', marginTop: 2, lineHeight: 1.2 }}>
        {b.name}
      </p>
      <p className="font-karla font-400" style={{ fontSize: '0.7rem', color: '#8a8577', marginTop: 1, lineHeight: 1.4 }}>
        {b.desc}
      </p>

      {/* The bar only earns its space when a bounty counts past one. A 0/1 bar
          is a checkbox drawn the long way. */}
      {b.target > 1 && !b.claimed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
          <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct * 100}%`, borderRadius: 3, background: `linear-gradient(90deg, ${t.color}88, ${t.color})` }} />
          </div>
          <span className="font-karla font-700" style={{ fontSize: '0.64rem', color: '#9a9488', ...TNUM }}>
            {b.progress}/{b.target}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
        {b.claimed ? (
          <span className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#6f6a63' }}>Paid</span>
        ) : done ? (
          <button type="button" onClick={onClaim} disabled={busy} className="font-karla font-800 tap"
            style={{
              flex: 1, padding: '0.5rem', borderRadius: 10, fontSize: '0.76rem',
              background: 'rgba(192,132,252,0.16)', border: '1px solid rgba(192,132,252,0.55)',
              color: '#e9d5ff', cursor: busy ? 'wait' : 'pointer', WebkitTapHighlightColor: 'transparent',
            }}>
            {busy ? 'Claiming…' : `Claim ${b.gems} ${GEM}`}
          </button>
        ) : (
          <span className="font-karla font-600" style={{ flex: 1, fontSize: '0.66rem', color: '#6f6a63' }}>
            Not done yet
          </span>
        )}

        {/* One swap a day, for an order you have no way to attempt. Hidden once
            spent rather than shown greyed: a dead control is just noise. */}
        {!b.claimed && !done && !rerollUsed && (
          <button type="button" onClick={onSwap} disabled={busy} aria-label={`Swap ${b.name}`} className="tap"
            style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
              padding: '0.42rem 0.6rem', borderRadius: 9,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#8a8577', cursor: busy ? 'wait' : 'pointer', WebkitTapHighlightColor: 'transparent',
            }}>
            <SwapIcon color="#8a8577" />
            <span className="font-karla font-700" style={{ fontSize: '0.62rem' }}>Swap</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default function BountiesPanel({ onGems }: { onGems?: (n: number) => void }) {
  const [board, setBoard] = useState<BountyBoard | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const load = useCallback(() => {
    getBountyBoard().then(b => {
      setBoard(b)
      onGems?.(b.gems)
    })
  }, [onGems])
  useEffect(() => { load() }, [load])

  if (!board) {
    return (
      <p className="font-karla font-600 uppercase tracking-[0.16em]"
        style={{ fontSize: '0.66rem', color: '#6f6a63', padding: '2.5rem 0', textAlign: 'center' }}>
        Reading the board…
      </p>
    )
  }

  if (!board.unlocked) {
    return (
      <div style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
        <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#c8c2b8', marginBottom: 8 }}>
          The board is empty
        </p>
        <p className="font-karla font-400" style={{ fontSize: '0.78rem', color: '#8a8577', lineHeight: 1.55, maxWidth: 300, margin: '0 auto' }}>
          The harbourmaster posts work for captains who have made a name. Put
          Captain Krust on the bottom of the sea and there will be orders here
          every morning after that.
        </p>
      </div>
    )
  }

  function handleClaim(b: BountyView) {
    setBusy(b.id)
    claimBounty(b.id).then(res => {
      setBusy(null)
      if ('error' in res) { setToast(res.error); return }
      setToast(`+${res.gems} ${GEM}`)
      onGems?.(res.total)
      window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.total }))
      load()
    })
  }

  function handleSwap(b: BountyView) {
    setBusy(b.id)
    startTransition(() => {
      rerollBounty(b.id).then(res => {
        setBusy(null)
        if ('error' in res) { setToast(res.error); return }
        load()
      })
    })
  }

  return (
    <div style={{ padding: '0 0.15rem 0.3rem' }}>
      {/* What is still on the table, not what you have banked. */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
        padding: '0.6rem 0.75rem', borderRadius: 12, marginBottom: 9,
        background: 'rgba(192,132,252,0.08)', border: '1px solid rgba(192,132,252,0.22)',
      }}>
        <span className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#b9aec9' }}>
          {board.remaining > 0 ? 'Still on the board today' : 'Board cleared'}
        </span>
        <span className="font-cinzel font-800" style={{ fontSize: '1.05rem', color: GEM_COLOR, ...TNUM }}>
          {board.remaining} {GEM}
        </span>
      </div>

      {/* WHICH RUNG, and what the next one is worth. The board grows with the
          campaign, so a captain three chapters in should be able to see that
          the short board is a stage rather than the whole feature, and see
          exactly whose head buys the next slot. */}
      {board.rung && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '0.42rem 0.75rem', borderRadius: 10, marginBottom: 9,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#8a8577' }}>
            Chapter {board.rung.chapter} rung
            <span style={{ color: '#6f6a63' }}> · {board.bounties.length} orders, {board.rungMax} {GEM} a day</span>
          </span>
          {board.next && (
            <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: '#b9aec9', textAlign: 'right', flexShrink: 0 }}>
              Beat {board.next.boss} → {board.next.gems} {GEM}
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {board.bounties.map(b => (
          <BountyRow key={b.id} b={b} rerollUsed={board.rerollUsed} busy={busy === b.id}
            onClaim={() => handleClaim(b)} onSwap={() => handleSwap(b)} />
        ))}
      </div>

      <p className="font-karla font-400" style={{ fontSize: '0.64rem', color: '#6f6a63', marginTop: 9, textAlign: 'center', lineHeight: 1.45 }}>
        {board.rerollUsed
          ? 'New orders posted every morning.'
          : 'One swap a day, for an order you cannot take. New orders every morning.'}
      </p>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            onAnimationComplete={() => setTimeout(() => setToast(null), 1600)}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: '6rem', zIndex: 130,
              display: 'flex', justifyContent: 'center', pointerEvents: 'none',
            }}>
            <span className="font-karla font-800" style={{
              padding: '0.5rem 0.9rem', borderRadius: 999, fontSize: '0.8rem',
              background: 'rgba(20,14,30,0.96)', border: '1px solid rgba(192,132,252,0.5)', color: '#e9d5ff',
            }}>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
