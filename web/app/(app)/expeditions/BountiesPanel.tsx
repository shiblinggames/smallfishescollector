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
import { getBountyBoard, claimBounty, rerollBounty, claimBountyMilestone, type BountyBoard, type BountyView } from './bountyActions'
import { BOUNTY_POINTS } from '@/lib/bounties'
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

/** The title row, and the only header there is.
 *
 *  The gem total had a bar of its own under this, which spent a whole strip of
 *  a small modal on two numbers and a line naming the rung. It reads as a chip
 *  beside the title now: what you have taken out of what is posted. */
function BoardHeader({ title, claimed, total, burst, onClose }: {
  title: string
  claimed?: number
  total?: number
  burst: number
  onClose: () => void
}) {
  const showChip = typeof claimed === 'number' && typeof total === 'number' && total > 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0.55rem 0.35rem 0.6rem 0.55rem' }}>
      <p className="font-pirata" style={{ fontSize: '1.5rem', letterSpacing: '0.03em', color: '#f0dcae', flexShrink: 0 }}>
        {title}
      </p>
      {showChip && (
        <span style={{
          position: 'relative', overflow: 'hidden',
          display: 'inline-flex', alignItems: 'baseline', gap: 4,
          padding: '0.2rem 0.5rem', borderRadius: 999,
          background: 'rgba(201,160,245,0.12)', border: '1px solid rgba(201,160,245,0.3)',
        }}>
          <span className="font-karla font-800" style={{ fontSize: '0.8rem', color: '#f0e6fb', ...TNUM }}>
            {claimed}<span style={{ color: '#9d8fb0' }}>/{total}</span>
          </span>
          <span className="font-karla font-800" style={{ fontSize: '0.72rem', color: GEM_COLOR }}>{GEM}</span>
          {/* The flare rides the chip now that the bar it used to cross is gone. */}
          <AnimatePresence>
            {burst > 0 && (
              <motion.span
                key={burst}
                initial={{ x: '-140%', opacity: 0.9 }} animate={{ x: '170%', opacity: 0 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                aria-hidden
                style={{
                  position: 'absolute', top: 0, bottom: 0, left: 0, width: '60%',
                  background: `linear-gradient(90deg, transparent, ${GEM_COLOR}55, transparent)`,
                  pointerEvents: 'none',
                }}
              />
            )}
          </AnimatePresence>
        </span>
      )}
      <button type="button" onClick={onClose} aria-label="Close"
        style={{
          marginLeft: 'auto', flexShrink: 0, width: 30, height: 30, borderRadius: '50%', padding: 0,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
          color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
    </div>
  )
}

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
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7, whiteSpace: 'nowrap' }}>
          {/* Points sit beside the prize because they are paid by the same act.
              Small: the gems are why you do it today, the points are why you
              come back, and only one of those needs to shout. */}
          <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: b.claimed ? '#6d675d' : '#8fa6c4', ...TNUM }}>
            +{BOUNTY_POINTS[b.tier]} pt{BOUNTY_POINTS[b.tier] === 1 ? '' : 's'}
          </span>
          <span className="font-cinzel font-800" style={{
            fontSize: '1.15rem', lineHeight: 1,
            color: b.claimed ? '#6d675d' : GEM_COLOR, ...TNUM,
          }}>
            {b.gems} {GEM}
          </span>
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


export default function BountiesPanel({ onGems, onClose }: {
  onGems?: (n: number) => void
  /** The panel owns the title row now, so it owns the close button with it. */
  onClose: () => void
}) {
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
      <>
        <BoardHeader title="Bounties" burst={0} onClose={onClose} />
        <p className="font-karla font-600 uppercase tracking-[0.16em]"
          style={{ fontSize: '0.66rem', color: '#8d7f66', padding: '2.5rem 0', textAlign: 'center' }}>
          Reading the board…
        </p>
      </>
    )
  }

  if (!board.unlocked) {
    return (
      <>
      <BoardHeader title="Bounties" burst={0} onClose={onClose} />
      <div style={{ textAlign: 'center', padding: '1.5rem 1.5rem 2.5rem' }}>
        <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#c9b68a', marginBottom: 8 }}>
          The board is empty
        </p>
        <p className="font-karla font-400" style={{ fontSize: '0.78rem', color: '#8d7f66', lineHeight: 1.55, maxWidth: 300, margin: '0 auto' }}>
          The harbourmaster posts work for captains who have made a name. Put
          Captain Krust on the bottom of the sea and there will be orders here
          every morning after that.
        </p>
      </div>
      </>
    )
  }

  function handleClaim(b: BountyView) {
    setBusy(b.id)
    claimBounty(b.id).then(res => {
      setBusy(null)
      if ('error' in res) { setToast(res.error); return }
      hapticReward()
      setToast(res.sweep ? `+${res.gems} ${GEM} and ${res.points} points, board cleared` : `+${res.gems} ${GEM} · +${res.points} pt${res.points === 1 ? '' : 's'}`)
      setBurst(n => n + 1)
      onGems?.(res.total)
      window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.total }))
      load()
    })
  }

  function handleMilestone() {
    setBusy('__ms')
    claimBountyMilestone().then(res => {
      setBusy(null)
      if ('error' in res) { setToast(res.error); return }
      hapticReward()
      setToast(res.colorId ? `${res.label}. Corsair unlocked.` : `+${res.label}`)
      setBurst(n => n + 1)
      if (res.gems) window.dispatchEvent(new CustomEvent('gems-changed'))
      if (res.doubloons) window.dispatchEvent(new CustomEvent('doubloons-changed'))
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
      <BoardHeader
        title="Bounties"
        claimed={board.rungMax - board.remaining}
        total={board.rungMax}
        burst={burst}
        onClose={onClose}
      />

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

      {/* THE LADDER. Under the board rather than above it: the orders are
          today's business and this is the long game. */}
      <div style={{
        marginTop: 10, padding: '0.6rem 0.75rem', borderRadius: 11,
        background: 'linear-gradient(180deg, rgba(30,27,22,0.96) 0%, rgba(18,16,12,0.97) 100%)',
        border: `1px solid ${board.milestonesReady > 0 ? 'rgba(201,160,245,0.45)' : 'rgba(255,255,255,0.08)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.54rem', color: '#8fa6c4' }}>
            Bounty points
          </span>
          <span className="font-cinzel font-800" style={{ fontSize: '1.05rem', color: '#f2ede2', ...TNUM }}>
            {board.points.toLocaleString()}
          </span>
        </div>

        {board.nextMilestone && (
          <>
            <div style={{ height: 4, borderRadius: 3, background: 'rgba(255,255,255,0.09)', overflow: 'hidden', marginTop: 6 }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: `${Math.min(100, (board.points / board.nextMilestone.points) * 100)}%`,
                background: 'linear-gradient(90deg, #8fa6c4, #c9a0f5)',
              }} />
            </div>
            <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#a49c8e', marginTop: 5 }}>
              {board.nextMilestone.points - board.points > 0
                ? `${(board.nextMilestone.points - board.points).toLocaleString()} more for ${board.nextMilestone.label}`
                : `${board.nextMilestone.label} is waiting`}
              {board.pointsToday > 0 && ` · ${board.pointsToday} still on today's board`}
            </p>
          </>
        )}

        {board.milestonesReady > 0 && (
          <button type="button" onClick={handleMilestone} disabled={busy === '__ms'} className="font-karla font-800 tap"
            style={{
              width: '100%', marginTop: 7, padding: '0.46rem', borderRadius: 9, fontSize: '0.78rem',
              background: 'rgba(201,160,245,0.18)', border: '1px solid rgba(201,160,245,0.6)', color: '#f0e6fb',
              cursor: busy === '__ms' ? 'wait' : 'pointer', WebkitTapHighlightColor: 'transparent',
            }}>
            {busy === '__ms' ? '…' : `Collect ${board.nextMilestone?.label ?? 'your milestone'}`}
          </button>
        )}
        {!board.nextMilestone && (
          <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#a49c8e', marginTop: 5 }}>
            Every milestone collected. The Corsair colours are yours.
          </p>
        )}
      </div>

      <p className="font-karla font-400" style={{ fontSize: '0.64rem', color: '#8d7f66', marginTop: 10, textAlign: 'center', lineHeight: 1.5 }}>
        {board.rerollUsed
          ? 'New orders posted every morning.'
          : 'One swap a day, for an order you cannot take. New orders every morning.'}
        {board.next && (
          <>
            <br />
            <span style={{ color: '#c4ab80' }}>
              Beat {board.next.boss} to post another, worth {board.next.gems} {GEM} a day.
            </span>
          </>
        )}
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
