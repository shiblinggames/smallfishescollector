'use client'

// The World Chart — the Chart Room's evergreen map collectible. Lifetime
// puzzle_points burn the fog off a painted sea, landmark by landmark; each
// discovery is celebrated (fog-burn porthole + name flourish) and pays escalating
// gems on claim, with a 2000-gem bonus for charting the whole sea. Reveal derives
// from points; the gem claim is server-authoritative.

import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { GEM_GLYPH } from '@/lib/bossRaids'
import {
  landmarkViews, gemsBanked, nextLandmark, isFullyCharted, LANDMARKS,
  WORLD_CHART_FULL_POINTS, WORLD_CHART_GRAND_TOTAL,
  type LandmarkView,
} from '@/lib/worldChart'
import { claimLandmark } from '../worldChartActions'

const GOLD = '#f0c040'
const GEM = '#c084fc'
const MAP_AR = 1649 / 2048          // width / height of /chartingmap.webp
const VB_H = 100 / MAP_AR           // fog SVG viewBox height that keeps circles round

function vibrate(p: number | number[]) {
  try { navigator.vibrate?.(p) } catch { /* unsupported */ }
}

type Paid = { gems: number; bonus: number; completed: boolean }

export default function WorldChartClient({ points, claimed: claimed0 }: { points: number; claimed: number[] }) {
  const router = useRouter()
  const [claimed, setClaimed] = useState<number[]>(claimed0)
  const [active, setActive] = useState<LandmarkView | null>(null)   // the discovery being celebrated
  const [claimingId, setClaimingId] = useState<number | null>(null)
  const [paid, setPaid] = useState<Paid | null>(null)               // gems just paid → drives the cascade
  const [info, setInfo] = useState<LandmarkView | null>(null)       // a charted landmark tapped to re-read

  const views = useMemo(() => landmarkViews(points, claimed), [points, claimed])
  const pending = useMemo(() => views.filter(v => v.claimable), [views])
  const foundCount = views.filter(v => v.revealed).length
  const gemsHave = gemsBanked(claimed)
  const next = nextLandmark(points)
  const fullyCharted = isFullyCharted(claimed)

  useEffect(() => {
    if (!active && paid == null && pending.length > 0) setActive(pending[0])
  }, [active, paid, pending])

  const doClaim = useCallback(async (lm: LandmarkView) => {
    if (claimingId != null) return
    setClaimingId(lm.id)
    vibrate([0, 30, 40, 90])
    const res = await claimLandmark(lm.id)
    if ('ok' in res && res.ok) {
      setPaid({ gems: res.awarded - res.bonus, bonus: res.bonus, completed: res.completed })
      vibrate(res.completed ? [0, 40, 60, 120, 60, 200] : [0, 20, 30, 60, 30, 140])
      try { window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.gems })) } catch { /* noop */ }
      const nextClaimed = res.claimed
      setTimeout(() => {
        setClaimed(nextClaimed)
        setPaid(null)
        setClaimingId(null)
        const stillPending = landmarkViews(points, nextClaimed).filter(v => v.claimable)
        setActive(stillPending[0] ?? null)
      }, res.completed ? 3200 : 1750)
    } else {
      setClaimingId(null)
      setActive(null)
    }
  }, [claimingId, points])

  return (
    <main className="min-h-screen" style={{ background: 'radial-gradient(ellipse at 50% -10%, #16202e 0%, #0a0f16 60%)' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0.9rem 0.9rem calc(env(safe-area-inset-bottom) + 5rem)' }}>

        {/* Top bar */}
        <div className="flex items-center gap-2" style={{ marginBottom: 14 }}>
          <button onClick={() => router.push('/tavern/chart-room')} className="font-karla font-700 tap"
            style={{ padding: '0.5rem 0.7rem', borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', color: '#d4cec2', fontSize: '0.82rem' }}>
            ‹ Chart Room
          </button>
          <div style={{ flex: 1 }} />
          <span className="font-karla font-800" style={{ fontSize: '0.92rem', color: GEM, fontVariantNumeric: 'tabular-nums' }}>{GEM_GLYPH} {gemsHave.toLocaleString()} / {WORLD_CHART_GRAND_TOTAL.toLocaleString()}</span>
        </div>

        {/* ── Hero header ── */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <p className="font-karla font-800 uppercase" style={{ fontSize: '0.66rem', letterSpacing: '0.3em', color: GOLD, textShadow: `0 0 18px ${GOLD}55` }}>The Chart Room</p>
          <h1 className="font-cinzel font-800" style={{ fontSize: '2.5rem', color: '#f6eeda', lineHeight: 1.02, marginTop: 4, textShadow: `0 2px 14px rgba(0,0,0,0.6), 0 0 30px ${GOLD}22` }}>The World Chart</h1>
          <p className="font-karla" style={{ fontSize: '0.92rem', color: 'rgba(206,218,228,0.72)', marginTop: 6, lineHeight: 1.45, maxWidth: 420, marginInline: 'auto' }}>
            {fullyCharted
              ? 'Every fathom charted. You sail as a Master Cartographer.'
              : 'Solve the Chart Room puzzles to burn back the fog and uncover the sea.'}
          </p>
        </div>

        {/* ── Progress ── */}
        <div style={{ padding: '0.85rem 1rem', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', marginBottom: 16 }}>
          <div className="flex items-baseline justify-between" style={{ marginBottom: 8 }}>
            <span className="font-cinzel font-800" style={{ fontSize: '1.1rem', color: '#f4ecd8' }}>{foundCount} <span style={{ color: '#8a857c', fontSize: '0.86rem' }}>/ {LANDMARKS.length} landmarks</span></span>
            <span className="font-karla font-800" style={{ fontSize: '0.92rem', color: GOLD, fontVariantNumeric: 'tabular-nums' }}>
              {next ? `${points} / ${next.threshold} pts` : `${points} pts`}
            </span>
          </div>
          <div style={{ height: 12, borderRadius: 999, background: 'rgba(0,0,0,0.4)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ width: `${Math.min(100, (points / WORLD_CHART_FULL_POINTS) * 100)}%`, height: '100%', background: `linear-gradient(90deg, ${GOLD}, #ffe9a8)`, boxShadow: `0 0 14px ${GOLD}aa` }} />
          </div>
          {next && (
            <p className="font-karla font-600" style={{ textAlign: 'center', fontSize: '0.74rem', color: 'rgba(206,218,228,0.6)', marginTop: 8 }}>
              {next.threshold - points} more point{next.threshold - points === 1 ? '' : 's'} to reach <span style={{ color: GOLD }}>uncharted water</span>
            </p>
          )}
        </div>

        {/* ── The map ── */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: `${MAP_AR}`, margin: '0 auto', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/chartingmap.webp" alt="The World Chart" draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />

          {/* Fog of war — the WHOLE sea starts fogged; each CHARTED landmark burns a
              clear window into the mist (feathered). Undiscovered water stays hidden. */}
          <svg viewBox={`0 0 100 ${VB_H}`} preserveAspectRatio="none" aria-hidden
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <defs>
              <filter id="fogSoft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.4" /></filter>
              <mask id="fogReveal">
                <rect x="0" y="0" width="100" height={VB_H} fill="white" />
                <g filter="url(#fogSoft)">
                  {views.filter(v => v.claimed).map(v => (
                    <ellipse key={v.id} cx={v.x * 100} cy={v.y * VB_H} rx={v.r * 100} ry={v.r * 100} fill="black" />
                  ))}
                </g>
              </mask>
            </defs>
            <rect x="0" y="0" width="100" height={VB_H} fill="#b3c2d0" opacity="0.9" mask="url(#fogReveal)" />
            <rect x="0" y="0" width="100" height={VB_H} fill="#8fa4bb" opacity="0.28" mask="url(#fogReveal)" />
          </svg>

          {/* Markers over the fog */}
          <div style={{ position: 'absolute', inset: 0 }}>
            {views.map(v => {
              const cx = `${v.x * 100}%`, cy = `${v.y * 100}%`
              if (v.claimed) {
                // Charted: a gold ring framing the cleared window + a name plate.
                return (
                  <button key={v.id} onClick={() => setInfo(v)} className="tap" aria-label={v.name}
                    style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%,-50%)', width: `${v.r * 170}%`, aspectRatio: '1', borderRadius: '50%', cursor: 'pointer', padding: 0,
                      background: 'none', border: `2px solid ${GOLD}`, boxShadow: `0 0 14px ${GOLD}88, inset 0 0 14px ${GOLD}33` }}>
                    <span className="font-cinzel font-700" style={{ position: 'absolute', left: '50%', top: 'calc(100% + 3px)', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: '0.6rem', color: '#fff6df', textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.9)', letterSpacing: '0.02em' }}>{v.name}</span>
                  </button>
                )
              }
              if (v.claimable) {
                // Discovered but unclaimed: a bright beacon over the fog inviting the chart.
                return (
                  <button key={v.id} onClick={() => { if (claimingId == null) setActive(v) }} className="tap" aria-label={`Chart ${v.name}`}
                    style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%,-50%)', width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                    <motion.span aria-hidden animate={{ scale: [1, 1.7, 1], opacity: [0.75, 0, 0.75] }} transition={{ duration: 1.7, repeat: Infinity }}
                      style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2.5px solid ${GOLD}`, boxShadow: `0 0 16px ${GOLD}` }} />
                    <span aria-hidden style={{ position: 'absolute', inset: 15, borderRadius: '50%', background: GOLD, boxShadow: `0 0 14px ${GOLD}` }} />
                  </button>
                )
              }
              return null   // undiscovered: hidden under the fog
            })}
          </div>
        </div>

        <p className="font-karla" style={{ textAlign: 'center', fontSize: '0.72rem', color: 'rgba(206,218,228,0.5)', marginTop: 12 }}>
          Tap a charted landmark to revisit it. The fog lifts as you earn charting points.
        </p>
      </div>

      {/* ── Discovery cinematic ── */}
      <AnimatePresence>
        {active && (
          <DiscoveryCinematic
            key={active.id}
            lm={active}
            claiming={claimingId === active.id}
            paid={claimingId === active.id ? paid : null}
            onClaim={() => doClaim(active)}
          />
        )}
      </AnimatePresence>

      {/* ── Charted-landmark info popup ── */}
      <AnimatePresence>
        {info && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setInfo(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(4,7,11,0.72)', padding: '0 0.9rem calc(env(safe-area-inset-bottom) + 1rem)' }}>
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 460, borderRadius: 20, overflow: 'hidden', border: `1px solid ${GOLD}55`, background: 'linear-gradient(180deg, rgba(24,30,40,0.98), rgba(12,16,22,0.98))', boxShadow: `0 -10px 40px rgba(0,0,0,0.6)` }}>
              <Porthole lm={info} />
              <div style={{ padding: '1rem 1.2rem 1.35rem', textAlign: 'center' }}>
                <p className="font-karla font-800 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.22em', color: GOLD }}>Charted</p>
                <h2 className="font-cinzel font-800" style={{ fontSize: '1.6rem', color: '#f4ecd8', marginTop: 4 }}>{info.name}</h2>
                <p className="font-karla" style={{ fontSize: '0.92rem', fontStyle: 'italic', color: 'rgba(206,218,228,0.8)', lineHeight: 1.5, marginTop: 10 }}>&ldquo;{info.lore}&rdquo;</p>
                <span className="font-karla font-800" style={{ display: 'inline-block', marginTop: 14, fontSize: '0.78rem', color: GEM }}>{GEM_GLYPH} {info.gems} claimed</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}

// A porthole cropping the landmark straight from the map art.
function Porthole({ lm }: { lm: LandmarkView }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: 190, overflow: 'hidden', background: '#0b0f15' }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/chartingmap.webp)', backgroundSize: '460%', backgroundPosition: `${lm.x * 100}% ${lm.y * 100}%` }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 45%, transparent 42%, rgba(6,10,16,0.85) 100%)' }} />
    </div>
  )
}

function DiscoveryCinematic({ lm, claiming, paid, onClaim }: { lm: LandmarkView; claiming: boolean; paid: Paid | null; onClaim: () => void }) {
  const [burning, setBurning] = useState(true)
  const [showClaim, setShowClaim] = useState(false)
  useEffect(() => {
    vibrate([0, 40, 60, 120])
    const t1 = setTimeout(() => setBurning(false), 1500)
    const t2 = setTimeout(() => setShowClaim(true), 1300)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'radial-gradient(ellipse at 50% 40%, rgba(12,18,26,0.94), rgba(4,6,10,0.98))' }}>
      <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
        <motion.p initial={{ opacity: 0, letterSpacing: '0.5em' }} animate={{ opacity: 1, letterSpacing: '0.32em' }} transition={{ duration: 0.7 }}
          className="font-karla font-800 uppercase" style={{ fontSize: '0.7rem', color: GOLD, textShadow: `0 0 16px ${GOLD}66`, marginBottom: 14 }}>
          Landmark Charted
        </motion.p>

        <motion.div initial={{ scale: 0.86, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{ position: 'relative', width: 210, height: 210, margin: '0 auto', borderRadius: '50%', overflow: 'hidden', border: `3px solid ${GOLD}`, boxShadow: `0 0 50px ${GOLD}55, inset 0 0 30px rgba(0,0,0,0.5)` }}>
          <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/chartingmap.webp)', backgroundSize: '520%', backgroundPosition: `${lm.x * 100}% ${lm.y * 100}%` }} />
          <AnimatePresence>
            {burning && (
              <motion.div aria-hidden initial={{ opacity: 1, scale: 1 }} animate={{ opacity: 0, scale: 1.5 }} transition={{ duration: 1.5, ease: 'easeIn' }}
                style={{ position: 'absolute', inset: '-20%', background: 'radial-gradient(circle, rgba(224,230,238,0.98) 34%, rgba(214,224,232,0.72) 60%, transparent 80%)' }} />
            )}
          </AnimatePresence>
          {burning && (
            <motion.div aria-hidden initial={{ rotate: 0, opacity: 0.8 }} animate={{ rotate: 360, opacity: 0 }} transition={{ duration: 1.5, ease: 'easeOut' }}
              style={{ position: 'absolute', inset: 0, background: `conic-gradient(from 0deg, transparent 0deg, ${GOLD}66 20deg, transparent 40deg)` }} />
          )}
        </motion.div>

        <motion.h1 initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.9, type: 'spring', stiffness: 220, damping: 16 }}
          className="font-cinzel font-800" style={{ fontSize: '2.1rem', color: '#f6eeda', lineHeight: 1.05, marginTop: 18, textShadow: `0 0 26px ${GOLD}44` }}>
          {lm.name}
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.15 }}
          className="font-karla" style={{ fontSize: '0.92rem', fontStyle: 'italic', color: 'rgba(206,218,228,0.82)', lineHeight: 1.5, marginTop: 10, padding: '0 0.5rem' }}>
          &ldquo;{lm.lore}&rdquo;
        </motion.p>

        <div style={{ position: 'relative', minHeight: 84, marginTop: 22 }}>
          <AnimatePresence mode="wait">
            {paid != null ? (
              <motion.div key="paid" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {Array.from({ length: 14 }).map((_, i) => (
                  <motion.span key={i} aria-hidden initial={{ opacity: 1, x: 0, y: 0, scale: 0.6 }}
                    animate={{ opacity: 0, x: Math.cos((i / 14) * Math.PI * 2) * 130, y: Math.sin((i / 14) * Math.PI * 2) * 90 - 10, scale: 1.1 }}
                    transition={{ duration: 1.1, ease: 'easeOut' }}
                    style={{ position: 'absolute', fontSize: '1.15rem', color: GEM, textShadow: `0 0 10px ${GEM}` }}>{GEM_GLYPH}</motion.span>
                ))}
                <motion.span initial={{ scale: 0.5 }} animate={{ scale: [0.5, 1.25, 1] }} transition={{ duration: 0.6 }}
                  className="font-cinzel font-800" style={{ fontSize: '2.1rem', color: GEM, textShadow: `0 0 22px ${GEM}` }}>
                  +{paid.gems} {GEM_GLYPH}
                </motion.span>
                {paid.completed && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} style={{ textAlign: 'center' }}>
                    <p className="font-karla font-800 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.18em', color: GOLD, marginTop: 4 }}>The Whole Sea Charted</p>
                    <p className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: GOLD, textShadow: `0 0 20px ${GOLD}`, marginTop: 2 }}>+{paid.bonus} {GEM_GLYPH}</p>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: '#fff6df', marginTop: 2 }}>Master Cartographer</p>
                  </motion.div>
                )}
              </motion.div>
            ) : showClaim ? (
              <motion.button key="claim" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} disabled={claiming}
                whileTap={{ scale: 0.96 }} onClick={onClaim} className="font-cinzel font-800 uppercase tracking-[0.08em] tap"
                style={{ position: 'absolute', inset: 0, width: '100%', borderRadius: 14, fontSize: '1.15rem', color: '#1a1030',
                  background: `linear-gradient(180deg, ${GEM}, #9a5fe0)`, border: `1px solid ${GEM}`, cursor: claiming ? 'default' : 'pointer',
                  boxShadow: `0 4px 22px ${GEM}66, inset 0 1px 0 rgba(255,255,255,0.35)`, opacity: claiming ? 0.7 : 1 }}>
                {claiming ? 'Claiming…' : `Claim ${lm.gems} ${GEM_GLYPH}`}
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
