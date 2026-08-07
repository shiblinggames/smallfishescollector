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
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { getBountyBoard, claimBounty, rerollBounty, claimBountyMilestone, type BountyBoard, type BountyView } from './bountyActions'
import { BOUNTY_POINTS, BOUNTY_MILESTONES } from '@/lib/bounties'
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
function BoardHeader({ title, claimed, total, points, pointsReady, burst, onPoints, onClose }: {
  title: string
  claimed?: number
  total?: number
  /** Lifetime bounty points. Undefined on the locked and loading states. */
  points?: number
  /** A milestone is sitting there uncollected. */
  pointsReady?: boolean
  burst: number
  onPoints?: () => void
  onClose: () => void
}) {
  const showChip = typeof claimed === 'number' && typeof total === 'number' && total > 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0.55rem 0.35rem 0.6rem 0.55rem' }}>
      <p className="font-pirata" style={{
        fontSize: '1.5rem', letterSpacing: '0.03em', color: '#f5e3b8', flexShrink: 0,
        // The lantern in the plate is directly behind this row, so it is the
        // brightest wood on the board and the worst place for thin type.
        textShadow: '0 1px 3px rgba(0,0,0,0.85), 0 0 12px rgba(0,0,0,0.5)',
      }}>
        {title}
      </p>
      {showChip && (
        <span style={{
          position: 'relative', overflow: 'hidden',
          display: 'inline-flex', alignItems: 'baseline', gap: 4,
          padding: '0.22rem 0.55rem', borderRadius: 999,
          // OPAQUE. Both pills sit on a painted, lantern-lit board, and a 12%
          // wash over timber is a smear rather than a chip. Solid base, the
          // accent kept in the border and the type.
          background: 'rgba(14,11,18,0.92)', border: `1px solid ${GEM_COLOR}77`,
          boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
        }}>
          <span className="font-karla font-800" style={{ fontSize: '0.8rem', color: '#f4ecff', ...TNUM }}>
            {claimed}<span style={{ color: '#a89aba' }}>/{total}</span>
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
      {/* THE LADDER, as a pill. It was a strip under the notices, which put
          the long game below the fold on a board of four. Up here it is a
          number you can see without scrolling and a door you can open when you
          care; the detail lives behind it rather than in the way. */}
      {typeof points === 'number' && onPoints && (
        <button type="button" onClick={onPoints} className="tap"
          style={{
            position: 'relative', marginLeft: 'auto', flexShrink: 0,
            display: 'inline-flex', alignItems: 'baseline', gap: 4,
            padding: '0.22rem 0.58rem', borderRadius: 999,
            background: 'rgba(12,14,19,0.92)',
            border: `1px solid ${pointsReady ? 'rgba(201,160,245,0.75)' : 'rgba(180,196,216,0.45)'}`,
            boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
            color: '#dfe6f0', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}>
          <span className="font-karla font-800" style={{ fontSize: '0.8rem', ...TNUM }}>{points.toLocaleString()}</span>
          <span className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#a7b2c2' }}>pts</span>
          {pointsReady && (
            <span aria-label="milestone ready" style={{
              position: 'absolute', top: -3, right: -3, width: 7, height: 7, borderRadius: 999,
              background: GEM_COLOR, boxShadow: `0 0 7px ${GEM_COLOR}`,
            }} />
          )}
        </button>
      )}

      <button type="button" onClick={onClose} aria-label="Close"
        style={{
          flexShrink: 0, width: 30, height: 30, borderRadius: '50%', padding: 0, marginLeft: 8,
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


/** A sheet over the board. Portaled to body: the panel already lives inside
 *  PopupShell, and a nested overlay positioned inside it would be trapped by
 *  that stacking context. */
function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={label} onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 140,
        background: 'rgba(4,6,10,0.86)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
        display: 'flex', padding: '1.1rem', overflowY: 'auto',
      }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        onClick={e => e.stopPropagation()}
        style={{
          margin: 'auto', width: '100%', maxWidth: 380,
          background: 'linear-gradient(180deg, rgba(26,23,18,0.99) 0%, rgba(12,11,8,0.99) 100%)',
          border: '1px solid rgba(190,146,92,0.45)', borderRadius: 16,
          padding: '1rem 1.05rem 1.05rem',
        }}>
        {children}
      </motion.div>
    </div>,
    document.body,
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
  const [ladderOpen, setLadderOpen] = useState(false)
  /** The order awaiting a swap confirmation. A swap is one a day and cannot be
   *  undone, which is exactly the shape of thing that should ask first. */
  const [swapping, setSwapping] = useState<BountyView | null>(null)
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
      setToast(res.shipSkinId ? `${res.label}. Fly it on the Man-o-War.` : `+${res.label}`)
      setBurst(n => n + 1)
      if (res.gems) window.dispatchEvent(new CustomEvent('gems-changed'))
      if (res.doubloons) window.dispatchEvent(new CustomEvent('doubloons-changed'))
      load()
    })
  }

  function handleSwap(b: BountyView) {
    setSwapping(null)
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
        points={board.points}
        pointsReady={board.milestonesReady > 0}
        burst={burst}
        onPoints={() => setLadderOpen(true)}
        onClose={onClose}
      />

      {/* Full width and short. Two columns gave each notice about 190px to
          carry a tier, a prize, a title, a description, a bar and two controls,
          and nothing legible fits in 190px. Four of these stack in roughly the
          height three of the squares took, with the board showing between. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {board.bounties.map(b => (
          <BountyCard key={b.id} b={b} rerollUsed={board.rerollUsed} busy={busy === b.id}
            onClaim={() => handleClaim(b)} onSwap={() => setSwapping(b)} />
        ))}
      </div>

      <p className="font-karla font-400" style={{ fontSize: '0.64rem', color: '#8d7f66', marginTop: 10, textAlign: 'center', lineHeight: 1.5 }}>
        New orders posted every morning.
        {board.next && (
          <>
            <br />
            <span style={{ color: '#c4ab80' }}>
              Beat {board.next.boss} to post another, worth {board.next.gems} {GEM} a day.
            </span>
          </>
        )}
      </p>

      {/* THE LADDER, in full. Every rung, what it pays, and which are behind
          you: the pill up top is the number, this is the map. */}
      {ladderOpen && (
        <Sheet label="Bounty points" onClose={() => setLadderOpen(false)}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 3 }}>
            <p className="font-pirata" style={{ fontSize: '1.35rem', letterSpacing: '0.03em', color: '#f0dcae' }}>Bounty Points</p>
            <p className="font-cinzel font-800" style={{ fontSize: '1.35rem', color: '#f2ede2', ...TNUM }}>{board.points.toLocaleString()}</p>
          </div>
          <p className="font-karla font-400" style={{ fontSize: '0.7rem', color: '#8d7f66', lineHeight: 1.45, marginBottom: 11 }}>
            Every order pays points by tier, and clearing the whole board pays 3 more.
            {board.pointsToday > 0 && ` ${board.pointsToday} are still on today's board.`}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: '46vh', overflowY: 'auto' }}>
            {BOUNTY_MILESTONES.map((m, i) => {
              const done = i < board.milestonesClaimed
              const ready = i === board.milestonesClaimed && board.points >= m.points
              const pct = Math.min(1, board.points / m.points)
              return (
                <div key={m.points} style={{
                  padding: '0.5rem 0.6rem', borderRadius: 10,
                  background: ready ? 'rgba(201,160,245,0.14)' : 'rgba(255,255,255,0.035)',
                  border: `1px solid ${ready ? 'rgba(201,160,245,0.55)' : 'rgba(255,255,255,0.08)'}`,
                  opacity: done ? 0.5 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: done ? '#7d7466' : '#e8e0d2' }}>
                      {m.label}
                    </span>
                    <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: done ? '#7d7466' : '#9aa3b2', ...TNUM }}>
                      {done ? 'collected' : `${m.points.toLocaleString()} pts`}
                    </span>
                  </div>
                  {!done && !ready && (
                    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 5 }}>
                      <div style={{ height: '100%', borderRadius: 2, width: `${pct * 100}%`, background: 'linear-gradient(90deg,#8fa6c4,#c9a0f5)' }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {board.milestonesReady > 0 ? (
            <button type="button" onClick={handleMilestone} disabled={busy === '__ms'} className="font-karla font-800 tap"
              style={{
                width: '100%', marginTop: 11, padding: '0.6rem', borderRadius: 10, fontSize: '0.82rem',
                background: 'rgba(201,160,245,0.2)', border: '1px solid rgba(201,160,245,0.65)', color: '#f0e6fb',
                cursor: busy === '__ms' ? 'wait' : 'pointer', WebkitTapHighlightColor: 'transparent',
              }}>
              {busy === '__ms' ? '…' : `Collect ${board.nextMilestone?.label ?? 'your milestone'}`}
            </button>
          ) : (
            <button type="button" onClick={() => setLadderOpen(false)} className="font-karla font-600"
              style={{ width: '100%', marginTop: 11, padding: '0.5rem', background: 'none', border: 'none', color: '#8d7f66', fontSize: '0.78rem', cursor: 'pointer' }}>
              Close
            </button>
          )}
        </Sheet>
      )}

      {/* A swap is one a day and cannot be taken back, so it asks. */}
      {swapping && (
        <Sheet label="Swap this order" onClose={() => setSwapping(null)}>
          <p className="font-pirata" style={{ fontSize: '1.3rem', letterSpacing: '0.03em', color: '#f0dcae', marginBottom: 4 }}>Swap this order?</p>
          <p className="font-karla font-400" style={{ fontSize: '0.78rem', color: '#a49c8e', lineHeight: 1.5 }}>
            <span style={{ color: '#e8e0d2' }}>{swapping.name}</span> goes back on the
            board and the harbourmaster posts another of the same tier. You get
            one swap a day and this is yours.
          </p>
          <button type="button" onClick={() => handleSwap(swapping)} className="font-karla font-800 tap"
            style={{
              width: '100%', marginTop: 13, padding: '0.6rem', borderRadius: 10, fontSize: '0.82rem',
              background: 'rgba(240,220,174,0.14)', border: '1px solid rgba(240,220,174,0.5)', color: '#f4ecd8',
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}>
            Swap it
          </button>
          <button type="button" onClick={() => setSwapping(null)} className="font-karla font-600"
            style={{ width: '100%', marginTop: 6, padding: '0.45rem', background: 'none', border: 'none', color: '#8d7f66', fontSize: '0.78rem', cursor: 'pointer' }}>
            Keep it
          </button>
        </Sheet>
      )}

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
