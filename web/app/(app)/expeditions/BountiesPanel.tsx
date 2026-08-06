'use client'

// THE BOUNTY BOARD. The expedition side's daily orders, and the best gem source
// in the game.
//
// It was four full-width rows stacked down the sheet, each with a title, a
// description, a bar and a button. That is a settings list, not a board: it ran
// past the fold at the top rung, spent most of its width on empty space beside
// short titles, and finishing an order turned a grey button into a slightly
// different grey button.
//
// It is a WALL OF NOTICES now. Two columns of pinned cards, the prize stamped
// on each like a seal, and clearing one drives a PAID stamp across it. Four
// orders fit on one screen with room to spare, and the two things you came for
// (see what is worth doing, then take the money) are the loudest things on it.
//
// The fishing dailies tick over while you fish and mostly claim themselves.
// These do not: a bounty names a captain to sink or a depth to reach, and you
// have to go and do it. So the board still leads with what is on the table
// today rather than what you have already banked.

import { useState, useEffect, useTransition, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getBountyBoard, claimBounty, rerollBounty, type BountyBoard, type BountyView } from './bountyActions'
import { hapticReward } from '@/lib/haptics'

// Solid dark notices, light ink, the way every other panel in this game reads.
//
// This went through parchment first: real painted paper, torn edges, the lot.
// It was the wrong call twice over. A bright cream card in a dark app fights
// the language of every screen around it, and a two-column grid gave each
// notice about 190px to carry a tier, a prize, a title, a description, a
// progress bar and two controls. No amount of ink weight fixes 190px.
//
// Full width instead, and short. Four notices in roughly the height three
// squares used, every string at a size you can actually read, and the painted
// board showing between them doing the work the paper was hired for.
//
// The tier is carried by the COLOUR OF ITS OWN WORD and nothing else. It had a
// coloured rail down the left edge for a while, which is the accent-bar-on-a-
// rounded-card that every generated layout reaches for, and it was saying the
// same thing the label directly beside it already said.
const TIER: Record<BountyView['tier'], { label: string; color: string }> = {
  easy:   { label: 'Easy',   color: '#8fb0cc' },
  medium: { label: 'Medium', color: '#77c79a' },
  hard:   { label: 'Hard',   color: '#e0b45f' },
  elite:  { label: 'Elite',  color: '#c9a0f5' },
}

const GEM = '◆'
const GEM_COLOR = '#c9a0f5'
const TNUM = { fontVariantNumeric: 'tabular-nums' as const }

function SwapIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8h13l-3.5-3.5M21 16H8l3.5 3.5" />
    </svg>
  )
}


/** One notice. A solid slab with the tier as a spine down its left edge, the
 *  prize on the right, and the two lines that matter in between. */
function BountyCard({ b, rerollUsed, busy, onClaim, onSwap }: {
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
    <motion.div
      layout
      style={{
        position: 'relative', overflow: 'hidden',
        padding: '0.6rem 0.75rem', borderRadius: 11,
        // OPAQUE. It sits on a painting, so it cannot be a wash.
        background: b.claimed
          ? 'linear-gradient(180deg, rgba(20,17,13,0.95) 0%, rgba(13,11,8,0.96) 100%)'
          : 'linear-gradient(180deg, rgba(30,27,22,0.97) 0%, rgba(18,16,12,0.98) 100%)',
        border: `1px solid ${done && !b.claimed ? t.color + '55' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: '0 3px 12px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span className="font-karla font-700 uppercase tracking-[0.16em]"
          style={{ fontSize: '0.6rem', color: b.claimed ? '#6d675d' : t.color }}>
          {t.label}
        </span>
        <span className="font-cinzel font-800" style={{
          fontSize: '1.15rem', lineHeight: 1, whiteSpace: 'nowrap',
          color: b.claimed ? '#6d675d' : GEM_COLOR, ...TNUM,
        }}>
          {b.gems} {GEM}
        </span>
      </div>

      <p className="font-cinzel font-700" style={{
        fontSize: '1.08rem', lineHeight: 1.2, marginTop: 3,
        color: b.claimed ? '#8b8578' : '#f4efe4',
      }}>
        {b.name}
      </p>
      <p className="font-karla font-500" style={{
        fontSize: '0.78rem', lineHeight: 1.4, marginTop: 2,
        color: b.claimed ? '#6d675d' : '#a49c8e',
      }}>
        {b.desc}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 8 }}>
        {b.target > 1 && !b.claimed && (
          <>
            <div style={{ flex: 1, minWidth: 40, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.09)', overflow: 'hidden' }}>
              <motion.div
                initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                style={{ height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${t.color}88, ${t.color})` }}
              />
            </div>
            <span className="font-karla font-700" style={{ flexShrink: 0, fontSize: '0.74rem', color: '#a49c8e', ...TNUM }}>
              {b.progress}/{b.target}
            </span>
          </>
        )}

        {b.claimed ? (
          <span className="font-karla font-800 uppercase tracking-[0.18em]"
            style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#7d7466' }}>
            Paid
          </span>
        ) : done ? (
          <button type="button" onClick={onClaim} disabled={busy} className="font-karla font-800 tap"
            style={{
              marginLeft: 'auto', flexShrink: 0, padding: '0.42rem 0.9rem', borderRadius: 9, fontSize: '0.82rem',
              background: `${t.color}22`, border: `1px solid ${t.color}88`, color: '#f6f1e6',
              cursor: busy ? 'wait' : 'pointer', WebkitTapHighlightColor: 'transparent',
            }}>
            {busy ? '…' : `Claim ${b.gems} ${GEM}`}
          </button>
        ) : (
          <>
            {b.target <= 1 && (
              <span className="font-karla font-600" style={{ flex: 1, fontSize: '0.74rem', color: '#7d7466' }}>
                Not done yet
              </span>
            )}
            {!rerollUsed && (
              <button type="button" onClick={onSwap} disabled={busy} aria-label={`Swap ${b.name}`} className="tap"
                style={{
                  marginLeft: b.target > 1 ? 'auto' : undefined,
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                  padding: '0.34rem 0.6rem', borderRadius: 8,
                  background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.14)',
                  color: '#a49c8e', cursor: busy ? 'wait' : 'pointer', WebkitTapHighlightColor: 'transparent',
                }}>
                <SwapIcon color="#a49c8e" />
                <span className="font-karla font-700" style={{ fontSize: '0.72rem' }}>Swap</span>
              </button>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}


export default function BountiesPanel({ onGems }: { onGems?: (n: number) => void }) {
  const [board, setBoard] = useState<BountyBoard | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [burst, setBurst] = useState(0)
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
        style={{ fontSize: '0.66rem', color: '#8d7f66', padding: '2.5rem 0', textAlign: 'center' }}>
        Reading the board…
      </p>
    )
  }

  if (!board.unlocked) {
    return (
      <div style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
        <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#c9b68a', marginBottom: 8 }}>
          The board is empty
        </p>
        <p className="font-karla font-400" style={{ fontSize: '0.78rem', color: '#8d7f66', lineHeight: 1.55, maxWidth: 300, margin: '0 auto' }}>
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
      hapticReward()
      setToast(`+${res.gems} ${GEM}`)
      setBurst(n => n + 1)
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

  const allDone = board.bounties.length > 0 && board.bounties.every(b => b.claimed)

  return (
    <div style={{ padding: '0 0.15rem 0.3rem' }}>
      {/* WHAT IS STILL ON THE TABLE, and which rung posted it. */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        padding: '0.7rem 0.85rem', borderRadius: 13, marginBottom: 8,
        background: 'linear-gradient(180deg, rgba(38,27,16,0.94) 0%, rgba(20,14,9,0.96) 100%)',
        border: '1px solid rgba(120,88,52,0.5)', borderTop: '1px solid rgba(190,146,92,0.5)',
      }}>
        {/* The number alone. It sits in a modal titled Bounties with a gem
            glyph on it, so a line of label above it was telling you what you
            were already looking at. */}
        <p className="font-cinzel font-800" style={{
          minWidth: 0, fontSize: '1.65rem', lineHeight: 1.05,
          color: allDone ? '#8d7f66' : '#f0dcae', ...TNUM,
        }}>
          {board.remaining} <span style={{ color: allDone ? '#8d7f66' : GEM_COLOR }}>{GEM}</span>
        </p>
        {board.rung && (
          <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 0 }}>
            <p className="font-karla font-600" style={{ fontSize: '0.56rem', color: '#8d7f66' }}>
              Chapter {board.rung.chapter} rung
            </p>
            {board.next && (
              <p className="font-karla font-700" style={{ fontSize: '0.58rem', color: '#c4ab80', marginTop: 1 }}>
                Beat {board.next.boss} → {board.next.gems} {GEM}
              </p>
            )}
          </div>
        )}

        {/* A flare across the header when an order pays out, keyed on the claim
            count so it replays every time. Transform and opacity only. */}
        <AnimatePresence>
          {burst > 0 && (
            <motion.span
              key={burst}
              initial={{ x: '-140%', opacity: 0.9 }}
              animate={{ x: '160%', opacity: 0 }}
              transition={{ duration: 0.75, ease: 'easeOut' }}
              aria-hidden
              style={{
                position: 'absolute', top: 0, bottom: 0, left: 0, width: '55%',
                background: `linear-gradient(90deg, transparent, ${GEM_COLOR}33, transparent)`,
                pointerEvents: 'none',
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Full width and short. Two columns gave each notice about 190px to
          carry a tier, a prize, a title, a description, a bar and two controls,
          and nothing legible fits in 190px. Four of these stack in roughly the
          height three of the squares took, with the board showing between. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {board.bounties.map(b => (
          <BountyCard key={b.id} b={b} rerollUsed={board.rerollUsed} busy={busy === b.id}
            onClaim={() => handleClaim(b)} onSwap={() => handleSwap(b)} />
        ))}
      </div>

      <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#8d7f66', marginTop: 10, textAlign: 'center', lineHeight: 1.45 }}>
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
              background: 'rgba(20,14,30,0.96)', border: `1px solid ${GEM_COLOR}80`, color: '#e9d5ff',
            }}>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
