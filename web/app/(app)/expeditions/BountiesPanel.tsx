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

// PAPER, not dark glass, and a painted sheet rather than a gradient: real tea
// stains, foxing, fold creases and a woven grain, in the same gouache idiom as
// the board it is pinned to. A bounty should read as something written by hand
// and nailed up, not a row in an admin table.
//
// ONE sheet serves every notice. Sized to 200% and offset to a different
// QUADRANT per card, so four notices on the wall are four different pieces of
// paper instead of the same stain repeated four times. The aspect distortion
// 200% x 200% causes is invisible on a texture with no subject in it.
const PAPER_QUADRANT = ['0% 0%', '100% 0%', '0% 100%', '100% 100%']
// Under the image while it loads, so a notice is never a translucent hole.
const PAPER_BASE = '#ded1b5'
const INK = '#332a20'                     // dark brown, the writing
const INK_SOFT = '#6b5b45'                // the hand that wrote the small print

// Tier colours re-cut for paper. The dark-panel set (#7f9bb5 and friends) went
// invisible on parchment; these are the same hues at ink weight.
const TIER: Record<BountyView['tier'], { label: string; color: string }> = {
  easy:   { label: 'Easy',   color: '#40607c' },
  medium: { label: 'Medium', color: '#2f6b4a' },
  hard:   { label: 'Hard',   color: '#8a5c14' },
  elite:  { label: 'Elite',  color: '#5d3a8f' },
}

const GEM = '◆'
const GEM_COLOR = '#c084fc'      // on the dark board
const GEM_INK = '#5d3a8f'        // on the paper
const STAMP = '#a3372a'          // oxblood, the harbourmaster's rubber stamp
const TNUM = { fontVariantNumeric: 'tabular-nums' as const }

function SwapIcon({ color }: { color: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8h13l-3.5-3.5M21 16H8l3.5 3.5" />
    </svg>
  )
}

/** One notice pinned to the board. */
function BountyCard({ b, idx, rerollUsed, busy, wide, onClaim, onSwap }: {
  b: BountyView
  /** Position on the wall, used only to alternate the tilt. */
  idx: number
  rerollUsed: boolean
  busy: boolean
  /** The first rung posts a single order, and one card in a two-column grid
   *  looks like a mistake, so it takes the full width instead. */
  wide: boolean
  onClaim: () => void
  onSwap: () => void
}) {
  const t = TIER[b.tier]
  const done = b.progress >= b.target
  const pct = b.target > 0 ? Math.min(1, b.progress / b.target) : 0

  return (
    <motion.div
      layout
      // A finished order breathes. Nothing else on the board moves, so it is
      // the only thing your eye goes to. Transform only.
      animate={done && !b.claimed ? { y: [0, -2, 0] } : { y: 0 }}
      transition={done && !b.claimed ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
      style={{
        position: 'relative', overflow: 'hidden',
        gridColumn: wide ? '1 / -1' : undefined,
        display: 'flex', flexDirection: 'column',
        minHeight: wide ? 158 : 184,
        padding: '0.95rem 0.65rem 0.55rem', borderRadius: 3,
        backgroundColor: PAPER_BASE,
        backgroundImage: 'url(/bounty-paper.jpg)',
        backgroundSize: '200% 200%',
        backgroundPosition: PAPER_QUADRANT[idx % PAPER_QUADRANT.length],
        // Paper has no glowing border. It has an edge and a shadow, and a
        // finished order simply sits a little prouder off the board.
        border: '1px solid rgba(90,68,40,0.45)',
        boxShadow: done && !b.claimed
          ? '0 6px 16px rgba(0,0,0,0.55)'
          : '0 3px 9px rgba(0,0,0,0.45)',
        // Two of the four corners lifted, so the wall does not read as a grid
        // of identical rectangles.
        transform: idx % 2 === 0 ? 'rotate(-0.5deg)' : 'rotate(0.55deg)',
      }}
    >
      {/* A settled notice is the SAME paper, greyed. Cheaper than a second
          texture and more honest: it is the same sheet, just spent. Sits under
          the content so the ink above it stays readable. */}
      {b.claimed && (
        <span aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'rgba(150,141,120,0.46)',
        }} />
      )}

      {/* Pinned. A tack through the top of the notice, which is the one detail
          that makes the whole thing read as a board rather than a list. */}
      <span aria-hidden style={{
        position: 'absolute', top: 5, left: '50%', marginLeft: -4,
        width: 8, height: 8, borderRadius: '50%',
        background: `radial-gradient(circle at 32% 30%, #d9c9a0 0%, ${t.color} 55%, rgba(0,0,0,0.65) 100%)`,
        boxShadow: '0 1px 2px rgba(0,0,0,0.55)',
      }} />

      {/* The prize, sealed in the corner. It is the reason to read the card, so
          it is the biggest thing on it after the name. */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <span className="font-karla font-700 uppercase tracking-[0.16em]"
          style={{
            fontSize: '0.48rem', paddingTop: 3,
            color: b.claimed ? '#7d7360' : t.color,
          }}>
          {t.label}
        </span>
        <span className="font-cinzel font-800" style={{
          fontSize: '1.05rem', lineHeight: 1, whiteSpace: 'nowrap',
          color: b.claimed ? '#7d7360' : GEM_INK, ...TNUM,
        }}>
          {b.gems} {GEM}
        </span>
      </div>

      <p className="font-cinzel font-700" style={{
        position: 'relative',
        fontSize: wide ? '1.1rem' : '0.92rem', lineHeight: 1.18, marginTop: 5,
        color: b.claimed ? '#7d7360' : INK,
      }}>
        {b.name}
      </p>
      <p className="font-karla font-400" style={{
        position: 'relative',
        fontSize: '0.62rem', lineHeight: 1.35, marginTop: 3,
        color: b.claimed ? '#8b8270' : INK_SOFT,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {b.desc}
      </p>

      {/* Pinned to the foot so the buttons line up across the row however long
          the titles run. */}
      <div style={{ position: 'relative', marginTop: 'auto', paddingTop: 8 }}>
        {b.target > 1 && !b.claimed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 3, background: 'rgba(60,44,24,0.22)', overflow: 'hidden' }}>
              <motion.div
                initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                style={{ height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${t.color}88, ${t.color})` }}
              />
            </div>
            <span className="font-karla font-700" style={{ fontSize: '0.58rem', color: INK_SOFT, ...TNUM }}>
              {b.progress}/{b.target}
            </span>
          </div>
        )}

        {b.claimed ? (
          <div style={{ height: 30 }} />
        ) : done ? (
          <button type="button" onClick={onClaim} disabled={busy} className="font-karla font-800 tap"
            style={{
              width: '100%', padding: '0.44rem', borderRadius: 9, fontSize: '0.72rem',
              background: `${t.color}1f`, border: `1px solid ${t.color}99`, color: t.color,
              cursor: busy ? 'wait' : 'pointer', WebkitTapHighlightColor: 'transparent',
            }}>
            {busy ? '…' : `Claim ${b.gems} ${GEM}`}
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="font-karla font-600" style={{ flex: 1, minWidth: 0, fontSize: '0.6rem', color: INK_SOFT }}>
              Not done yet
            </span>
            {!rerollUsed && (
              <button type="button" onClick={onSwap} disabled={busy} aria-label={`Swap ${b.name}`} className="tap"
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                  padding: '0.3rem 0.44rem', borderRadius: 8,
                  background: 'rgba(60,44,24,0.10)', border: '1px solid rgba(90,68,40,0.4)',
                  color: INK_SOFT, cursor: busy ? 'wait' : 'pointer', WebkitTapHighlightColor: 'transparent',
                }}>
                <SwapIcon color={INK_SOFT} />
                <span className="font-karla font-700" style={{ fontSize: '0.56rem' }}>Swap</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* PAID, driven across the notice at an angle. The old claimed state was a
          grey word in a grey row, which is no kind of ending for the hardest
          thing on the board. */}
      <AnimatePresence>
        {b.claimed && (
          <motion.div
            key="paid"
            initial={{ opacity: 0, scale: 1.9, rotate: -24 }}
            animate={{ opacity: 1, scale: 1, rotate: -13 }}
            transition={{ type: 'spring', stiffness: 320, damping: 15 }}
            aria-hidden
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 12,
              display: 'flex', justifyContent: 'center', pointerEvents: 'none',
            }}
          >
            {/* An oxblood rubber stamp. On paper this is what a settled account
                looks like; the old purple-on-black read as a UI state. */}
            <span className="font-cinzel font-800" style={{
              fontSize: '1.05rem', letterSpacing: '0.22em', paddingLeft: '0.22em',
              color: `${STAMP}dd`, opacity: 0.85,
              border: `2.5px solid ${STAMP}aa`, borderRadius: 4,
              padding: '0.08rem 0.5rem 0.12rem',
            }}>PAID</span>
          </motion.div>
        )}
      </AnimatePresence>
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

  const single = board.bounties.length === 1
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
        <div style={{ minWidth: 0 }}>
          <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.52rem', color: '#b09a76' }}>
            {allDone ? 'Board cleared' : 'Still on the board'}
          </p>
          <p className="font-cinzel font-800" style={{ fontSize: '1.5rem', lineHeight: 1.1, color: allDone ? '#8d7f66' : '#f0dcae', ...TNUM }}>
            {board.remaining} <span style={{ color: GEM_COLOR }}>{GEM}</span>
          </p>
        </div>
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

      {/* The wall. Two columns, because four orders down one column runs past
          the fold and wastes half the width on short titles. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, padding: '2px 1px' }}>
        {board.bounties.map((b, i) => (
          <BountyCard key={b.id} b={b} idx={i} rerollUsed={board.rerollUsed} busy={busy === b.id}
            wide={single} onClaim={() => handleClaim(b)} onSwap={() => handleSwap(b)} />
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
