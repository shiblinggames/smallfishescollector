'use client'

// The World Chart — the Chart Room's evergreen map collectible. Lifetime
// puzzle_points burn the fog off a painted sea, landmark by landmark; each
// discovery is celebrated (fog-burn porthole + name flourish) and pays escalating
// gems on claim. Reveal derives from points; the gem claim is server-authoritative.

import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { GEM_GLYPH } from '@/lib/bossRaids'
import {
  landmarkViews, gemsClaimed, nextLandmark, LANDMARKS,
  WORLD_CHART_FULL_POINTS, WORLD_CHART_TOTAL_GEMS,
  type LandmarkView,
} from '@/lib/worldChart'
import { claimLandmark } from '../worldChartActions'

const GOLD = '#f0c040'
const GEM = '#c084fc'
const MAP_AR = 1649 / 2048   // width / height of /chartingmap.webp

function vibrate(p: number | number[]) {
  try { navigator.vibrate?.(p) } catch { /* unsupported */ }
}

export default function WorldChartClient({ points, claimed: claimed0 }: { points: number; claimed: number[] }) {
  const router = useRouter()
  const [claimed, setClaimed] = useState<number[]>(claimed0)
  const [active, setActive] = useState<LandmarkView | null>(null)   // the discovery being celebrated
  const [claimingId, setClaimingId] = useState<number | null>(null)
  const [paid, setPaid] = useState<number | null>(null)             // gems just paid → drives the cascade
  const [info, setInfo] = useState<LandmarkView | null>(null)       // a charted landmark tapped to re-read

  const views = useMemo(() => landmarkViews(points, claimed), [points, claimed])
  const pending = useMemo(() => views.filter(v => v.claimable), [views])
  const foundCount = views.filter(v => v.revealed).length
  const gemsHave = gemsClaimed(claimed)
  const next = nextLandmark(points)
  const fullyCharted = points >= WORLD_CHART_FULL_POINTS

  // On open, auto-start the celebration for the first undiscovered-but-reached
  // landmark. Claiming chains to the next, so a stack of discoveries all play.
  useEffect(() => {
    if (!active && paid == null && pending.length > 0) setActive(pending[0])
  }, [active, paid, pending])

  const doClaim = useCallback(async (lm: LandmarkView) => {
    if (claimingId != null) return
    setClaimingId(lm.id)
    vibrate([0, 30, 40, 90])
    const res = await claimLandmark(lm.id)
    if ('ok' in res && res.ok) {
      setPaid(res.awarded)
      vibrate([0, 20, 30, 60, 30, 140])
      try { window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.gems })) } catch { /* noop */ }
      const nextClaimed = res.claimed
      setTimeout(() => {
        setClaimed(nextClaimed)
        setPaid(null)
        setClaimingId(null)
        const stillPending = landmarkViews(points, nextClaimed).filter(v => v.claimable)
        setActive(stillPending[0] ?? null)
      }, 1750)
    } else {
      // Already claimed / not reached (raced): just move on.
      setClaimingId(null)
      setActive(null)
    }
  }, [claimingId, points])

  return (
    <main className="min-h-screen" style={{ background: 'radial-gradient(ellipse at 50% -10%, #16202e 0%, #0a0f16 60%)' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '1rem 0.9rem calc(env(safe-area-inset-bottom) + 5rem)' }}>

        {/* Header */}
        <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
          <button onClick={() => router.push('/tavern/chart-room')} className="font-karla font-700 tap"
            style={{ padding: '0.4rem 0.6rem', borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#c9c3b8', fontSize: '0.72rem' }}>
            ‹ Chart Room
          </button>
          <div style={{ flex: 1 }} />
          <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: GEM }}>{GEM_GLYPH} {gemsHave.toLocaleString()} / {WORLD_CHART_TOTAL_GEMS.toLocaleString()}</span>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <h1 className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#f4ecd8', letterSpacing: '0.02em' }}>The World Chart</h1>
          <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(200,214,226,0.6)', marginTop: 2 }}>
            {fullyCharted ? 'Every fathom charted. You are a Master Cartographer.' : 'Solve the Chart Room puzzles to burn back the fog.'}
          </p>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: '#9a958c', whiteSpace: 'nowrap' }}>{foundCount}/{LANDMARKS.length} landmarks</span>
          <div style={{ flex: 1, height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ width: `${Math.min(100, (points / WORLD_CHART_FULL_POINTS) * 100)}%`, height: '100%', background: `linear-gradient(90deg, ${GOLD}, #ffe9a8)`, boxShadow: `0 0 10px ${GOLD}88` }} />
          </div>
          <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: GOLD, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {next ? `${points}/${next.threshold}` : `${points} pts`}
          </span>
        </div>
        {next && (
          <p className="font-karla" style={{ textAlign: 'center', fontSize: '0.6rem', color: 'rgba(200,214,226,0.45)', marginTop: -8, marginBottom: 12 }}>
            {next.threshold - points} more point{next.threshold - points === 1 ? '' : 's'} to reach uncharted water
          </p>
        )}

        {/* ── The map ── */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: `${MAP_AR}`, margin: '0 auto', borderRadius: 14, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/chartingmap.webp" alt="The World Chart" draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />

          {/* Overlay — fog blobs, beacons, charted markers */}
          <div style={{ position: 'absolute', inset: 0 }}>
            {views.map(v => {
              const cx = `${v.x * 100}%`, cy = `${v.y * 100}%`
              if (!v.claimed) {
                // Fogged: a drifting mist patch. Claimable ones get a beacon on top.
                return (
                  <div key={v.id}>
                    <motion.div aria-hidden
                      initial={false}
                      animate={{ opacity: [0.9, 0.98, 0.9], scale: [1, 1.04, 1] }}
                      transition={{ duration: 6 + (v.id % 4), repeat: Infinity, ease: 'easeInOut' }}
                      style={{
                        position: 'absolute', left: cx, top: cy, transform: 'translate(-50%,-50%)',
                        width: `${v.r * 200}%`, aspectRatio: '1', borderRadius: '50%', pointerEvents: 'none',
                        background: 'radial-gradient(circle, rgba(214,224,232,0.94) 34%, rgba(206,218,228,0.7) 56%, rgba(206,218,228,0.28) 70%, transparent 80%)',
                      }} />
                    {v.claimable && (
                      <button onClick={() => { if (claimingId == null) setActive(v) }} className="tap" aria-label={`Chart ${v.name}`}
                        style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%,-50%)', width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                        <motion.span aria-hidden animate={{ scale: [1, 1.5, 1], opacity: [0.7, 0, 0.7] }} transition={{ duration: 1.8, repeat: Infinity }}
                          style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${GOLD}`, boxShadow: `0 0 12px ${GOLD}` }} />
                        <span aria-hidden style={{ position: 'absolute', inset: 11, borderRadius: '50%', background: GOLD, boxShadow: `0 0 10px ${GOLD}` }} />
                      </button>
                    )}
                  </div>
                )
              }
              // Charted: a small gold marker, tap to re-read the landmark.
              return (
                <button key={v.id} onClick={() => setInfo(v)} className="tap" aria-label={v.name}
                  style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%,-50%)', width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', padding: 0,
                    background: `radial-gradient(circle, ${GOLD}55, transparent 70%)`, border: `1.5px solid ${GOLD}bb`, boxShadow: `0 0 9px ${GOLD}66` }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill={GOLD} aria-hidden style={{ display: 'block', margin: '0 auto' }}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                </button>
              )
            })}
          </div>
        </div>

        <p className="font-karla" style={{ textAlign: 'center', fontSize: '0.58rem', color: 'rgba(200,214,226,0.4)', marginTop: 10 }}>
          Tap a charted landmark to revisit it. Fog lifts as you earn charting points.
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
              style={{ width: '100%', maxWidth: 440, borderRadius: 18, overflow: 'hidden', border: `1px solid ${GOLD}55`, background: 'linear-gradient(180deg, rgba(24,30,40,0.98), rgba(12,16,22,0.98))', boxShadow: `0 -10px 40px rgba(0,0,0,0.6)` }}>
              <Porthole lm={info} revealed />
              <div style={{ padding: '0.9rem 1.1rem 1.2rem', textAlign: 'center' }}>
                <p className="font-karla font-800 uppercase" style={{ fontSize: '0.52rem', letterSpacing: '0.2em', color: GOLD }}>Charted</p>
                <h2 className="font-cinzel font-800" style={{ fontSize: '1.35rem', color: '#f4ecd8', marginTop: 3 }}>{info.name}</h2>
                <p className="font-karla" style={{ fontSize: '0.82rem', fontStyle: 'italic', color: 'rgba(206,218,228,0.75)', lineHeight: 1.5, marginTop: 8 }}>&ldquo;{info.lore}&rdquo;</p>
                <span className="font-karla font-700" style={{ display: 'inline-block', marginTop: 12, fontSize: '0.68rem', color: GEM }}>{GEM_GLYPH} {info.gems} claimed</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}

// A circular porthole cropping the landmark straight from the map art.
function Porthole({ lm, revealed, burning }: { lm: LandmarkView; revealed: boolean; burning?: boolean }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: 180, overflow: 'hidden', background: '#0b0f15' }}>
      <div aria-hidden style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'url(/chartingmap.webp)', backgroundSize: '460%',
        backgroundPosition: `${lm.x * 100}% ${lm.y * 100}%`,
        filter: revealed ? 'none' : 'grayscale(0.6) brightness(0.8)',
      }} />
      {/* vignette to focus the crop */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 45%, transparent 40%, rgba(6,10,16,0.85) 100%)' }} />
      {/* burning fog that parts away on reveal */}
      <AnimatePresence>
        {burning && (
          <motion.div aria-hidden initial={{ opacity: 1 }} animate={{ opacity: 0, scale: 1.35 }} transition={{ duration: 1.5, ease: 'easeIn' }}
            style={{ position: 'absolute', inset: '-10%', background: 'radial-gradient(circle at 50% 50%, rgba(220,228,236,0.96) 30%, rgba(210,222,232,0.7) 58%, transparent 78%)' }} />
        )}
      </AnimatePresence>
    </div>
  )
}

function DiscoveryCinematic({ lm, claiming, paid, onClaim }: { lm: LandmarkView; claiming: boolean; paid: number | null; onClaim: () => void }) {
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
      style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'radial-gradient(ellipse at 50% 40%, rgba(12,18,26,0.92), rgba(4,6,10,0.97))' }}>
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <motion.p initial={{ opacity: 0, letterSpacing: '0.5em' }} animate={{ opacity: 1, letterSpacing: '0.32em' }} transition={{ duration: 0.7 }}
          className="font-karla font-800 uppercase" style={{ fontSize: '0.6rem', color: GOLD, textShadow: `0 0 16px ${GOLD}66`, marginBottom: 12 }}>
          Landmark Charted
        </motion.p>

        {/* Porthole revealing the landmark from the map as the fog burns off */}
        <motion.div initial={{ scale: 0.86, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{ position: 'relative', width: 190, height: 190, margin: '0 auto', borderRadius: '50%', overflow: 'hidden', border: `2px solid ${GOLD}`, boxShadow: `0 0 46px ${GOLD}44, inset 0 0 30px rgba(0,0,0,0.5)` }}>
          <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/chartingmap.webp)', backgroundSize: '520%', backgroundPosition: `${lm.x * 100}% ${lm.y * 100}%` }} />
          <AnimatePresence>
            {burning && (
              <motion.div aria-hidden initial={{ opacity: 1, scale: 1 }} animate={{ opacity: 0, scale: 1.5 }} transition={{ duration: 1.5, ease: 'easeIn' }}
                style={{ position: 'absolute', inset: '-20%', background: 'radial-gradient(circle, rgba(224,230,238,0.98) 34%, rgba(214,224,232,0.72) 60%, transparent 80%)' }} />
            )}
          </AnimatePresence>
          {/* compass sweep */}
          {burning && (
            <motion.div aria-hidden initial={{ rotate: 0, opacity: 0.8 }} animate={{ rotate: 360, opacity: 0 }} transition={{ duration: 1.5, ease: 'easeOut' }}
              style={{ position: 'absolute', inset: 0, background: `conic-gradient(from 0deg, transparent 0deg, ${GOLD}66 20deg, transparent 40deg)` }} />
          )}
        </motion.div>

        <motion.h1 initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.9, type: 'spring', stiffness: 220, damping: 16 }}
          className="font-cinzel font-800" style={{ fontSize: '1.9rem', color: '#f6eeda', lineHeight: 1.05, marginTop: 16, textShadow: `0 0 26px ${GOLD}44` }}>
          {lm.name}
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.15 }}
          className="font-karla" style={{ fontSize: '0.82rem', fontStyle: 'italic', color: 'rgba(206,218,228,0.78)', lineHeight: 1.5, marginTop: 8, padding: '0 0.5rem' }}>
          &ldquo;{lm.lore}&rdquo;
        </motion.p>

        {/* Claim / gem cascade */}
        <div style={{ position: 'relative', height: 74, marginTop: 20 }}>
          <AnimatePresence mode="wait">
            {paid != null ? (
              <motion.div key="paid" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* gem burst */}
                {Array.from({ length: 12 }).map((_, i) => (
                  <motion.span key={i} aria-hidden initial={{ opacity: 1, x: 0, y: 0, scale: 0.6 }}
                    animate={{ opacity: 0, x: Math.cos((i / 12) * Math.PI * 2) * 120, y: Math.sin((i / 12) * Math.PI * 2) * 90 - 10, scale: 1.1 }}
                    transition={{ duration: 1.1, ease: 'easeOut' }}
                    style={{ position: 'absolute', fontSize: '1.1rem', color: GEM, textShadow: `0 0 10px ${GEM}` }}>{GEM_GLYPH}</motion.span>
                ))}
                <motion.span initial={{ scale: 0.5 }} animate={{ scale: [0.5, 1.25, 1] }} transition={{ duration: 0.6 }}
                  className="font-cinzel font-800" style={{ fontSize: '2rem', color: GEM, textShadow: `0 0 22px ${GEM}` }}>
                  +{paid} {GEM_GLYPH}
                </motion.span>
              </motion.div>
            ) : showClaim ? (
              <motion.button key="claim" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} disabled={claiming}
                whileTap={{ scale: 0.96 }} onClick={onClaim} className="font-cinzel font-800 uppercase tracking-[0.08em] tap"
                style={{ position: 'absolute', inset: 0, width: '100%', borderRadius: 14, fontSize: '1.05rem', color: '#1a1030',
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
