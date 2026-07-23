'use client'

// The interactive rank-claim moment — the Parlor's answer to the World Chart's
// landmark cinematic. Points accrue as you play; when they cross a rank it waits
// here to be COLLECTED. Tapping opens a full-screen reveal: the rank medallion
// springs in, you claim, and the gems burst out and deposit into your purse. If
// several ranks are waiting, it chains through them one satisfying tap at a time.
//
// Portal-to-body is deliberate: a transformed ancestor breaks position:fixed
// (see feedback_transform_breaks_fixed_positioning).

import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useState, useCallback, useEffect } from 'react'
import { GEM_GLYPH } from '@/lib/bossRaids'
import { CrownIcon } from './ParlorArt'
import { claimParlorRank } from './actions'
import { nextClaimableParlorRank, claimableParlorRanks } from './constants'

const GEM = '#c084fc'

function vibrate(p: number | number[]) {
  try { navigator.vibrate?.(p) } catch { /* unsupported */ }
}

export default function ParlorClaim({ points, claimedGems }: { points: number; claimedGems: number }) {
  const [claimed, setClaimed] = useState(claimedGems)
  const [open, setOpen] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [paid, setPaid] = useState<{ gems: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  // Resync if the server prop moves (e.g. after a fresh page load).
  useEffect(() => setClaimed(claimedGems), [claimedGems])

  const next = nextClaimableParlorRank(points, claimed)
  const pending = claimableParlorRanks(points, claimed)
  const pendingGems = pending.reduce((s, r) => s + r.gems, 0)

  const doClaim = useCallback(async () => {
    if (claiming) return
    setClaiming(true)
    vibrate([0, 25, 35, 70])
    const res = await claimParlorRank()
    if ('ok' in res && res.ok) {
      setPaid({ gems: res.gemsWon })
      vibrate([0, 30, 45, 90, 45, 160])
      try { window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.newGems })) } catch { /* no-op */ }
      const more = res.moreClaimable
      const nextAwarded = res.newAwarded
      setTimeout(() => {
        setClaimed(nextAwarded)   // advances `next` to the following rank (re-reveals)
        setPaid(null)
        setClaiming(false)
        if (!more) setOpen(false)
      }, 1650)
    } else {
      setClaiming(false)
      setOpen(false)
    }
  }, [claiming])

  if (!next) return null

  const rank = next.rank

  return (
    <>
      {/* The nudge — a warm, gently pulsing collect button. */}
      <motion.button
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.97 }}
        animate={{ boxShadow: [`0 0 0px ${GEM}00`, `0 0 16px ${GEM}88`, `0 0 0px ${GEM}00`] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        className="font-cinzel font-700"
        style={{
          width: '100%', marginTop: 2, padding: '0.6rem 0.9rem', borderRadius: 12,
          border: `1px solid ${GEM}`, background: `linear-gradient(180deg, ${GEM}, #9a5fe0)`,
          color: '#160a24', fontSize: '0.82rem', letterSpacing: '0.02em', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        Collect rank reward · {pendingGems} {GEM_GLYPH}
        {pending.length > 1 && (
          <span className="font-karla font-700" style={{ fontSize: '0.62rem', background: 'rgba(22,10,36,0.28)', borderRadius: 999, padding: '0.06rem 0.4rem' }}>
            {pending.length}
          </span>
        )}
      </motion.button>

      {mounted && open && createPortal(
        <AnimatePresence>
          <motion.div
            key="parlor-claim-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { if (!claiming && !paid) setOpen(false) }}
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
              background: 'radial-gradient(ellipse 90% 70% at 50% 40%, rgba(30,16,48,0.72), rgba(6,4,12,0.92))',
              backdropFilter: 'blur(3px)',
            }}
          >
            <motion.div
              key={rank.title}   // re-mounts (and re-reveals) for each rank in a chain
              initial={{ opacity: 0, scale: 0.85, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 20 }}
              onClick={e => e.stopPropagation()}
              style={{
                position: 'relative', width: '100%', maxWidth: 340, textAlign: 'center',
                borderRadius: 22, padding: '1.6rem 1.3rem 1.4rem',
                background: 'linear-gradient(180deg, #241a12 0%, #130d08 100%)',
                border: `1px solid ${rank.color}66`,
                boxShadow: `0 24px 60px rgba(0,0,0,0.6), 0 0 40px ${rank.color}22, inset 0 1px 0 rgba(255,255,255,0.06)`,
              }}
            >
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.24em', color: '#a8a090' }}>
                New Parlor Rank
              </p>

              {/* The rank medallion — springs in with a soft coloured halo. */}
              <motion.div
                initial={{ scale: 0.4, rotate: -12 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.05 }}
                style={{ position: 'relative', width: 108, height: 108, margin: '0.85rem auto 0.5rem' }}
              >
                <motion.div
                  aria-hidden
                  animate={{ opacity: [0.5, 0.9, 0.5], scale: [1, 1.08, 1] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ position: 'absolute', inset: -10, borderRadius: '50%', background: `radial-gradient(circle, ${rank.color}55, transparent 70%)` }}
                />
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: `radial-gradient(circle at 50% 35%, ${rank.color}, #1a120a 88%)`,
                  border: `2px solid ${rank.color}`, boxShadow: `inset 0 2px 8px rgba(0,0,0,0.5), 0 0 22px ${rank.color}66`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CrownIcon size={46} color="#fff7e6" />
                </div>
              </motion.div>

              <p className="font-cinzel font-800" style={{ fontSize: '1.55rem', lineHeight: 1.1, color: rank.color, textShadow: `0 0 18px ${rank.color}66` }}>
                {rank.title}
              </p>
              <p className="font-karla" style={{ fontSize: '0.72rem', color: '#c2b9a4', marginTop: 5, lineHeight: 1.5 }}>
                You&apos;ve earned your place at the {rank.title} table. Collect your reward.
              </p>

              {/* Claim button → gem burst + deposit. */}
              <div style={{ position: 'relative', height: 66, marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AnimatePresence mode="wait">
                  {paid != null ? (
                    <motion.div
                      key="paid"
                      initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                      style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {Array.from({ length: 14 }).map((_, i) => (
                        <motion.span
                          key={i} aria-hidden
                          initial={{ opacity: 1, x: 0, y: 0, scale: 0.6 }}
                          animate={{
                            opacity: 0,
                            x: Math.cos((i / 14) * Math.PI * 2) * 130,
                            y: Math.sin((i / 14) * Math.PI * 2) * 74 - 6,
                            scale: 1.15,
                          }}
                          transition={{ duration: 1.05, ease: 'easeOut' }}
                          style={{ position: 'absolute', fontSize: '1.1rem', color: GEM, textShadow: `0 0 10px ${GEM}` }}
                        >
                          {GEM_GLYPH}
                        </motion.span>
                      ))}
                      <motion.span
                        initial={{ scale: 0.5 }} animate={{ scale: [0.5, 1.3, 1] }} transition={{ duration: 0.6 }}
                        className="font-cinzel font-800"
                        style={{ fontSize: '2.1rem', color: GEM, textShadow: `0 0 22px ${GEM}` }}
                      >
                        +{paid.gems} {GEM_GLYPH}
                      </motion.span>
                    </motion.div>
                  ) : (
                    <motion.button
                      key="claim"
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      whileTap={{ scale: 0.96 }} disabled={claiming} onClick={doClaim}
                      className="font-cinzel font-700"
                      style={{
                        padding: '0.7rem 1.6rem', borderRadius: 14, cursor: claiming ? 'default' : 'pointer',
                        border: `1px solid ${GEM}`, background: `linear-gradient(180deg, ${GEM}, #9a5fe0)`,
                        color: '#160a24', fontSize: '1rem', letterSpacing: '0.02em',
                        boxShadow: `0 8px 22px ${GEM}44`,
                      }}
                    >
                      {claiming ? 'Collecting…' : `Claim ${rank.gems} ${GEM_GLYPH}`}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              {pending.length > 1 && !paid && (
                <p className="font-karla" style={{ fontSize: '0.6rem', color: '#8a8478', marginTop: 4 }}>
                  {pending.length - 1} more rank{pending.length - 1 === 1 ? '' : 's'} waiting behind this one
                </p>
              )}
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
