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
import { rankForPoints, nextRank, rankGained, type BountyRank } from '@/lib/bountyRanks'
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

// The reward ladder as ONE prize at a time, hero-sized, not a spreadsheet of
// rungs. What you can claim right now fills the modal; the whole climb is a slim
// rail of dots beneath it. Each collect bursts before the next rung slides in.
const DOUB_COLOR = '#f0c040'
const SKIN_COLOR = '#5fd0c8'
function rewardLook(m: (typeof BOUNTY_MILESTONES)[number]) {
  if (m.shipSkinId) return { color: SKIN_COLOR, glyph: '⚓', amount: '', sub: m.label }
  if (m.gems) return { color: GEM_COLOR, glyph: GEM, amount: m.gems.toLocaleString(), sub: 'gems' }
  return { color: DOUB_COLOR, glyph: '⟡', amount: (m.doubloons ?? 0).toLocaleString(), sub: 'doubloons' }
}

// THE RANK-UP MOMENT — the new medallion, full-screen, the thing the whole
// ladder was climbing toward. Rays sweep out, sparks fly, the crest lands with a
// spring, then it fades on its own or on a tap.
function RankUpOverlay({ rank, onClose }: { rank: BountyRank | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (!rank) return
    hapticReward()
    const t = setTimeout(onClose, 3400)
    return () => clearTimeout(t)
  }, [rank, onClose])
  if (!mounted) return null
  return createPortal(
    <AnimatePresence>
      {rank && (
        <motion.div
          role="dialog" aria-modal="true" aria-label={`New rank ${rank.title}`}
          onClick={onClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'radial-gradient(circle at 50% 42%, rgba(20,16,10,0.82), rgba(4,5,8,0.95))',
            backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '2rem', textAlign: 'center',
          }}>
          <motion.p className="font-karla font-800 uppercase tracking-[0.3em]"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            style={{ fontSize: '0.72rem', color: rank.accent, marginBottom: 18 }}>
            New Rank
          </motion.p>

          <div style={{ position: 'relative', width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Sweeping rays behind the crest. */}
            <motion.div aria-hidden
              initial={{ opacity: 0, rotate: 0 }} animate={{ opacity: 0.5, rotate: 40 }}
              transition={{ duration: 3.2, ease: 'easeOut' }}
              style={{
                position: 'absolute', width: 340, height: 340, borderRadius: '50%', pointerEvents: 'none',
                background: `conic-gradient(from 0deg, transparent 0deg, ${rank.accent}44 12deg, transparent 24deg, transparent 45deg, ${rank.accent}44 57deg, transparent 69deg, transparent 90deg, ${rank.accent}44 102deg, transparent 114deg, transparent 135deg, ${rank.accent}44 147deg, transparent 159deg, transparent 180deg, ${rank.accent}44 192deg, transparent 204deg, transparent 225deg, ${rank.accent}44 237deg, transparent 249deg, transparent 270deg, ${rank.accent}44 282deg, transparent 294deg, transparent 315deg, ${rank.accent}44 327deg, transparent 339deg)`,
                maskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
                WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
              }} />
            <div aria-hidden style={{
              position: 'absolute', width: 190, height: 190, borderRadius: '50%',
              background: `radial-gradient(circle, ${rank.accent}3a 0%, transparent 66%)`, pointerEvents: 'none',
            }} />
            {/* Sparks. */}
            {Array.from({ length: 20 }).map((_, i) => {
              const a = (i / 20) * Math.PI * 2
              return (
                <motion.span key={i} aria-hidden
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{ x: Math.cos(a) * 130, y: Math.sin(a) * 130, opacity: 0, scale: 0.3 }}
                  transition={{ duration: 1.1, ease: 'easeOut', delay: 0.1 }}
                  style={{ position: 'absolute', width: 7, height: 7, borderRadius: '50%', background: rank.accent, boxShadow: `0 0 8px ${rank.accent}` }} />
              )
            })}
            <motion.img src={rank.emblem} width={150} height={150} alt=""
              initial={{ scale: 0.4, opacity: 0, rotate: -18 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.05 }}
              style={{ position: 'relative', filter: `drop-shadow(0 6px 20px ${rank.accent}66)` }} />
          </div>

          <motion.p className="font-pirata"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            style={{ fontSize: '2rem', letterSpacing: '0.02em', color: '#f6efe1', marginTop: 20 }}>
            {rank.title}
          </motion.p>
          <motion.p className="font-karla font-400 italic"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            style={{ fontSize: '0.82rem', color: '#b7ad9c', marginTop: 4, maxWidth: 280, lineHeight: 1.5 }}>
            {rank.blurb}
          </motion.p>
          <motion.p className="font-karla font-600"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
            style={{ fontSize: '0.68rem', color: '#6d675d', marginTop: 20 }}>
            Tap to continue
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function PointsLadder({ board, busy, claimFx, onClaim, onClose }: {
  board: BountyBoard
  busy: boolean
  claimFx: { kind: 'gems' | 'doubloons' | 'skin'; amount: number; label: string } | null
  onClaim: () => void
  onClose: () => void
}) {
  const total = BOUNTY_MILESTONES.length
  const idx = Math.min(board.milestonesClaimed, total - 1)
  const allDone = board.milestonesClaimed >= total
  const m = BOUNTY_MILESTONES[idx]
  const ready = board.milestonesReady > 0
  const look = allDone ? { color: DOUB_COLOR, glyph: '★', amount: '', sub: 'every reward collected' } : rewardLook(m)
  const prev = idx > 0 ? BOUNTY_MILESTONES[idx - 1].points : 0
  const span = Math.max(1, m.points - prev)
  const into = Math.min(1, Math.max(0, (board.points - prev) / span))
  const toGo = Math.max(0, m.points - board.points)

  const rank = rankForPoints(board.points)
  const upNext = nextRank(board.points)

  return (
    <div>
      {/* THE RANK — your standing and its medallion, the identity the whole
          ladder is climbing toward. Below the first rung it is a locked crest
          with the first title as the goal. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12,
        padding: '0.55rem 0.65rem', borderRadius: 13,
        background: rank ? `${rank.accent}16` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${rank ? `${rank.accent}4d` : 'rgba(255,255,255,0.09)'}`,
      }}>
        <img src={rank ? rank.emblem : '/bounty/ranks/freebooter.png'} width={52} height={52} alt=""
          style={{ flexShrink: 0, filter: rank ? `drop-shadow(0 0 7px ${rank.accent}66)` : 'grayscale(1) opacity(0.45)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.54rem', color: '#8d7f66' }}>
            {rank ? 'Your rank' : 'Unranked'}
          </p>
          <p className="font-pirata" style={{ fontSize: '1.15rem', letterSpacing: '0.02em', color: rank ? '#f2ede2' : '#b7ad9c', lineHeight: 1.15 }}>
            {rank ? rank.title : 'No standing yet'}
          </p>
          <p className="font-karla font-500" style={{ fontSize: '0.64rem', color: '#8d7f66', marginTop: 1, ...TNUM }}>
            {upNext
              ? `${(upNext.points - board.points).toLocaleString()} pts to ${upNext.title}`
              : 'Highest rank held'}
          </p>
        </div>
        <p className="font-cinzel font-800" style={{ fontSize: '1.1rem', color: '#f2ede2', flexShrink: 0, ...TNUM }}>
          {board.points.toLocaleString()}
        </p>
      </div>

      {/* THE HERO — one reward, filling the space a list used to waste. Bright
          and claimable when earned, a dimmed goal with a ring when not. */}
      <div style={{
        position: 'relative', marginTop: 12, marginBottom: 14, paddingTop: 8,
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      }}>
        {/* Ambient rays behind the emblem — faint, still; the burst does the motion. */}
        <div aria-hidden style={{
          position: 'absolute', top: -6, width: 190, height: 190, borderRadius: '50%',
          background: `radial-gradient(circle, ${look.color}${ready ? '2e' : '14'} 0%, transparent 66%)`,
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', width: 118, height: 118, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* The claim burst: an expanding ring + sparks, only while celebrating. */}
          <AnimatePresence>
            {claimFx && (
              <>
                <motion.div key="ring"
                  initial={{ scale: 0.5, opacity: 0.75 }} animate={{ scale: 2.5, opacity: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.85, ease: 'easeOut' }}
                  style={{ position: 'absolute', width: 96, height: 96, borderRadius: '50%', border: `2px solid ${look.color}`, pointerEvents: 'none' }} />
                {Array.from({ length: 16 }).map((_, i) => {
                  const a = (i / 16) * Math.PI * 2
                  return (
                    <motion.span key={i} aria-hidden
                      initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                      animate={{ x: Math.cos(a) * 78, y: Math.sin(a) * 78, opacity: 0, scale: 0.4 }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      style={{ position: 'absolute', width: 6, height: 6, borderRadius: '50%', background: look.color, boxShadow: `0 0 6px ${look.color}` }} />
                  )
                })}
              </>
            )}
          </AnimatePresence>

          <motion.div
            key={`${idx}-${ready}`}
            initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 20 }}
            style={{
              width: 96, height: 96, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `radial-gradient(circle at 50% 38%, ${look.color}${ready ? '3a' : '1c'} 0%, rgba(12,11,8,0.9) 72%)`,
              border: `2px solid ${look.color}${ready ? 'cc' : '55'}`,
              boxShadow: ready ? `0 0 26px ${look.color}44, inset 0 0 18px ${look.color}22` : 'none',
              opacity: ready || allDone ? 1 : 0.82,
            }}>
            <span className="font-cinzel font-800" style={{ fontSize: '2.6rem', lineHeight: 1, color: look.color, filter: ready ? `drop-shadow(0 0 8px ${look.color}88)` : 'none' }}>
              {look.glyph}
            </span>
          </motion.div>
        </div>

        {look.amount && (
          <p className="font-cinzel font-800" style={{ fontSize: '1.7rem', lineHeight: 1.1, color: '#f4efe4', marginTop: 10, ...TNUM }}>
            {look.amount} <span style={{ color: look.color, fontSize: '1.2rem' }}>{look.glyph}</span>
          </p>
        )}
        <p className="font-karla font-600" style={{ fontSize: '0.82rem', color: look.amount ? '#b9b1a2' : '#e8e0d2', marginTop: look.amount ? 1 : 10 }}>
          {look.sub}
        </p>
        {!allDone && (
          <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.56rem', color: ready ? look.color : '#8d7f66', marginTop: 6 }}>
            {ready ? 'Reward ready' : `Milestone ${idx + 1} of ${total}`}
          </p>
        )}

        {/* When it is still a goal, show the climb to it right under the emblem. */}
        {!ready && !allDone && (
          <div style={{ width: '78%', marginTop: 9 }}>
            <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.09)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, width: `${into * 100}%`, background: `linear-gradient(90deg, #8fa6c4, ${look.color})` }} />
            </div>
            <p className="font-karla font-500" style={{ fontSize: '0.68rem', color: '#8d7f66', marginTop: 5, ...TNUM }}>
              {toGo.toLocaleString()} more {toGo === 1 ? 'point' : 'points'} to go
            </p>
          </div>
        )}
      </div>

      {/* THE WHOLE CLIMB, as a rail of dots — the list, compressed to a glance. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', marginBottom: 13 }}>
        {BOUNTY_MILESTONES.map((mm, i) => {
          const claimed = i < board.milestonesClaimed
          const isNext = i === idx && !allDone
          const c = rewardLook(mm).color
          return (
            <div key={mm.points} title={mm.label} style={{
              width: isNext ? 11 : 8, height: isNext ? 11 : 8, borderRadius: '50%', flexShrink: 0,
              background: claimed ? c : isNext && ready ? c : 'rgba(255,255,255,0.10)',
              border: isNext ? `2px solid ${c}` : '1px solid rgba(255,255,255,0.14)',
              boxShadow: isNext && ready ? `0 0 8px ${c}` : 'none',
              opacity: claimed ? 0.85 : 1,
            }} />
          )
        })}
      </div>

      {ready && !allDone ? (
        <button type="button" onClick={onClaim} disabled={busy} className="font-karla font-800 tap"
          style={{
            width: '100%', padding: '0.72rem', borderRadius: 11, fontSize: '0.9rem',
            background: `linear-gradient(180deg, ${look.color}33, ${look.color}1c)`,
            border: `1px solid ${look.color}aa`, color: '#f6f1e8',
            boxShadow: `0 0 18px ${look.color}33`,
            cursor: busy ? 'wait' : 'pointer', WebkitTapHighlightColor: 'transparent',
          }}>
          {busy ? 'Collecting…' : 'Claim reward'}
        </button>
      ) : (
        <button type="button" onClick={onClose} className="font-karla font-600"
          style={{ width: '100%', padding: '0.5rem', background: 'none', border: 'none', color: '#8d7f66', fontSize: '0.78rem', cursor: 'pointer' }}>
          Close
        </button>
      )}
    </div>
  )
}

/** One notice. A solid slab with the tier as a spine down its left edge, the
 *  prize on the right, and the two lines that matter in between. */
/** Text with a line through it, drawn rather than declared.
 *
 *  text-decoration cannot be animated, and the whole point of striking a claimed
 *  order is watching it happen. An absolutely positioned rule over the text can
 *  be scaled from nothing, and sitting at scaleX 1 from the first frame it is
 *  indistinguishable from the real thing on every card that was claimed before
 *  this visit.
 *
 *  Single-line text only. The rule spans the whole box, so on wrapped text it
 *  would draw one line through the middle of the paragraph instead of through
 *  each line: that is why the description uses text-decoration instead. */
function Struck({ on, draw, children }: {
  on: boolean; draw: boolean; children: React.ReactNode
}) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
      {children}
      {on && (
        <motion.span aria-hidden
          initial={{ scaleX: draw ? 0 : 1 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: draw ? 0.08 : 0 }}
          style={{
            position: 'absolute', left: 0, right: 0, top: '55%',
            height: 2, borderRadius: 2,
            background: 'rgba(196,186,166,0.6)',
            transformOrigin: 'left center', pointerEvents: 'none',
          }} />
      )}
    </span>
  )
}

function BountyCard({ b, rerollUsed, busy, celebrate, onClaim, onSwap }: {
  b: BountyView
  rerollUsed: boolean
  busy: boolean
  /** This one was claimed a moment ago, so it draws its line instead of just
   *  wearing it. */
  celebrate: boolean
  onClaim: () => void
  onSwap: () => void
}) {
  const t = TIER[b.tier]
  const done = b.progress >= b.target
  const ready = done && !b.claimed
  const pct = b.target > 0 ? Math.min(1, b.progress / b.target) : 0

  return (
    <motion.div
      layout
      // A SMALL POP, once, on the card that was just paid. Localized on purpose:
      // the board does not shake, the one notice you touched does.
      animate={celebrate ? { scale: [1, 1.02, 1] } : { scale: 1 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'relative', overflow: 'hidden',
        padding: '0.6rem 0.75rem', borderRadius: 11,
        // OPAQUE. It sits on a painting, so it cannot be a wash.
        //
        // THREE STATES, not two. A finished order used to differ from an
        // unfinished one by a slightly brighter hairline, which is nothing: you
        // had to read every card to find the one holding your gems. A ready
        // notice is now lit, edged in its tier colour and topped with a marker.
        background: b.claimed
          ? 'linear-gradient(180deg, rgba(20,17,13,0.95) 0%, rgba(13,11,8,0.96) 100%)'
          : ready
            ? 'linear-gradient(180deg, rgba(44,39,29,0.98) 0%, rgba(26,23,17,0.98) 100%)'
            : 'linear-gradient(180deg, rgba(30,27,22,0.97) 0%, rgba(18,16,12,0.98) 100%)',
        border: `1px solid ${ready ? t.color + '99' : 'rgba(255,255,255,0.08)'}`,
        borderTop: `1.5px solid ${ready ? t.color : 'rgba(255,255,255,0.10)'}`,
        boxShadow: '0 3px 12px rgba(0,0,0,0.5)',
        opacity: b.claimed ? 0.82 : 1,
      }}
    >
      {/* THE SWEEP. One pass of light across the notice as it is paid, gone in
          half a second. Transform and opacity only, so it costs nothing. */}
      {celebrate && (
        <motion.span aria-hidden
          initial={{ x: '-120%', opacity: 0.9 }}
          animate={{ x: '120%', opacity: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, width: '55%',
            background: `linear-gradient(90deg, transparent, ${t.color}30, transparent)`,
            pointerEvents: 'none',
          }} />
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span className="font-karla font-700 uppercase tracking-[0.16em]"
            style={{ fontSize: '0.6rem', color: b.claimed ? '#6d675d' : t.color }}>
            {t.label}
          </span>
          {ready && (
            <span className="font-karla font-800 uppercase tracking-[0.14em]" style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: '0.54rem', color: '#0f1208',
              background: t.color, borderRadius: 999, padding: '0.1rem 0.4rem',
            }}>
              <span aria-hidden style={{
                width: 5, height: 5, borderRadius: 999, background: 'rgba(15,18,8,0.75)',
                animation: 'shop-pulse 1.6s ease-in-out infinite',
              }} />
              Ready
            </span>
          )}
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

      {/* STRUCK THROUGH once it is paid, and the line DRAWS itself on the one
          you just claimed. Rendered as a span rather than text-decoration
          because a decoration cannot be animated: this way a card claimed
          moments ago and a card claimed this morning end in the same place,
          one having got there in front of you. */}
      <p className="font-cinzel font-700" style={{
        fontSize: '1.08rem', lineHeight: 1.2, marginTop: 3,
        color: b.claimed ? '#8b8578' : '#f4efe4',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        <Struck on={b.claimed} draw={celebrate}>{b.name}</Struck>
      </p>
      {/* The description wraps, and a drawn rule cannot follow text onto a
          second line: it would sit BETWEEN the lines rather than through them.
          So the name gets the animated line and the description gets the real
          decoration, which handles wrapping properly and arrives at the same
          moment anyway. */}
      <p className="font-karla font-500" style={{
        fontSize: '0.78rem', lineHeight: 1.4, marginTop: 2,
        color: b.claimed ? '#6d675d' : '#a49c8e',
        textDecoration: b.claimed ? 'line-through' : undefined,
        textDecorationColor: 'rgba(196,186,166,0.45)',
      }}>
        {b.desc}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 8 }}>
        {b.target > 1 && !b.claimed && !ready && (
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
          // FULL WIDTH. It was a small button tucked to the right, the same size
          // as Swap, on the one row where the only thing you want to do is take
          // the money.
          <motion.button type="button" onClick={onClaim} disabled={busy} className="font-karla font-800 tap"
            whileTap={busy ? undefined : { scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 600, damping: 24 }}
            style={{
              flex: 1, width: '100%', padding: '0.55rem 0.9rem', borderRadius: 9, fontSize: '0.86rem',
              background: `linear-gradient(180deg, ${t.color}30 0%, ${t.color}18 100%)`,
              border: `1px solid ${t.color}`, color: '#f8f4ea',
              cursor: busy ? 'wait' : 'pointer', WebkitTapHighlightColor: 'transparent',
            }}>
            {busy ? 'Claiming…' : `Claim ${b.gems} ${GEM}`}
          </motion.button>
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
  // The reward just collected, held for the length of its celebration so the
  // hero can burst before the board reloads to the next rung.
  const [claimFx, setClaimFx] = useState<{ kind: 'gems' | 'doubloons' | 'skin'; amount: number; label: string } | null>(null)
  // A rank just earned, shown as a full-screen medallion moment before it fades.
  const [rankUp, setRankUp] = useState<BountyRank | null>(null)
  /** The order awaiting a swap confirmation. A swap is one a day and cannot be
   *  undone, which is exactly the shape of thing that should ask first. */
  const [swapping, setSwapping] = useState<BountyView | null>(null)
  /** The order paid a moment ago. Drives the strike drawing itself and the
   *  sweep across the notice; cleared after the animation so reopening the
   *  board does not replay it. */
  const [justClaimed, setJustClaimed] = useState<string | null>(null)
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
      setJustClaimed(b.id)
      setTimeout(() => setJustClaimed(id => (id === b.id ? null : id)), 1200)
      setToast(res.sweep ? `+${res.gems} ${GEM} and ${res.points} points, board cleared` : `+${res.gems} ${GEM} · +${res.points} pt${res.points === 1 ? '' : 's'}`)
      setBurst(n => n + 1)
      onGems?.(res.total)
      window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.total }))
      // A rank is standing, not a reward — earned the instant the points cross,
      // whether or not a milestone came with them. Its medallion gets the stage.
      const climbed = rankGained(board?.points ?? 0, (board?.points ?? 0) + (res.points ?? 0))
      if (climbed) setTimeout(() => setRankUp(climbed), 700)
      load()
    })
  }

  function handleMilestone() {
    setBusy('__ms')
    claimBountyMilestone().then(res => {
      setBusy(null)
      if ('error' in res) { setToast(res.error); return }
      hapticReward()
      // The celebration lives IN the sheet now, not in a toast that slid past
      // under it. Hold the reward for the burst, then let the reloaded board
      // reveal the next rung (or the goal state if that was the last ready one).
      setClaimFx({
        kind: res.shipSkinId ? 'skin' : res.gems ? 'gems' : 'doubloons',
        amount: res.gems || res.doubloons || 0,
        label: res.label,
      })
      setBurst(n => n + 1)
      if (res.gems) window.dispatchEvent(new CustomEvent('gems-changed'))
      if (res.doubloons) window.dispatchEvent(new CustomEvent('doubloons-changed'))
      load()
      setTimeout(() => setClaimFx(null), 1250)
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
      {/* READY FIRST, PAID LAST. The board is posted in tier order, which is the
          right order to read it in and the wrong order to work it in: the notice
          holding your gems could be fourth. Sorting by state puts the money at
          the top and the finished work out of the way, and `layout` on the card
          means they slide rather than jump when one is paid. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {[...board.bounties]
          .map((b, i) => ({ b, i, rank: b.claimed ? 2 : b.progress >= b.target ? 0 : 1 }))
          .sort((x, y) => x.rank - y.rank || x.i - y.i)
          .map(({ b }) => (
            <BountyCard key={b.id} b={b} rerollUsed={board.rerollUsed} busy={busy === b.id}
              celebrate={justClaimed === b.id}
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
          <PointsLadder
            board={board}
            busy={busy === '__ms'}
            claimFx={claimFx}
            onClaim={handleMilestone}
            onClose={() => setLadderOpen(false)}
          />
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

      <RankUpOverlay rank={rankUp} onClose={() => setRankUp(null)} />

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
