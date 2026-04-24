'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { castLine } from './actions'
import { MAX_CASTS } from './constants'
import { HOOKS } from '@/lib/hooks'
import Link from 'next/link'

type Phase = 'ready' | 'active' | 'result'

interface ZoneDef {
  from: number      // start angle in degrees (0 = top / 12 o'clock, clockwise)
  to: number
  quality: number
  label: string
  color: string
  isPerfect?: boolean
}

// 0° = 12 o'clock, clockwise
// Weak at top (danger) → Perfect strips → Good → Great (bottom, safe) → Good → Perfect → Weak
const ZONES: ZoneDef[] = [
  { from:   0, to:  47, quality:  3, label: 'Weak',    color: '#f87171' },
  { from:  47, to:  61, quality: 20, label: 'Perfect!', color: '#fde68a', isPerfect: true },
  { from:  61, to: 119, quality:  9, label: 'Good',     color: '#f0c040' },
  { from: 119, to: 241, quality: 14, label: 'Great',    color: '#4ade80' },
  { from: 241, to: 299, quality:  9, label: 'Good',     color: '#f0c040' },
  { from: 299, to: 313, quality: 20, label: 'Perfect!', color: '#fde68a', isPerfect: true },
  { from: 313, to: 360, quality:  3, label: 'Weak',     color: '#f87171' },
]

// SVG layout
const CX = 110, CY = 110
const OUTER_R = 96, INNER_R = 66
const GAP = 1.0 // degrees of gap between arc segments

function polar(r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180)
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

function arcPath(startDeg: number, endDeg: number): string {
  const s0 = startDeg + GAP, e0 = endDeg - GAP
  const span = e0 - s0
  if (span <= 0) return ''
  const la = span > 180 ? 1 : 0
  const p1 = polar(OUTER_R, s0), p2 = polar(OUTER_R, e0)
  const p3 = polar(INNER_R, e0), p4 = polar(INNER_R, s0)
  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${OUTER_R} ${OUTER_R} 0 ${la} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${INNER_R} ${INNER_R} 0 ${la} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

function getZone(deg: number): ZoneDef {
  const a = ((deg % 360) + 360) % 360
  return ZONES.find(z => a >= z.from && a < z.to) ?? ZONES[0]
}

function catchLabel(quality: number, isPerfect: boolean): string {
  if (isPerfect) return 'Perfect ✦'
  if (quality >= 14) return 'Great catch'
  if (quality >= 9) return 'Good catch'
  return 'Tiny catch'
}

function catchColor(quality: number, isPerfect: boolean): string {
  if (isPerfect) return '#fde68a'
  if (quality >= 14) return '#4ade80'
  if (quality >= 9) return '#f0c040'
  return '#f87171'
}

const ZONE_LEGEND = [
  { label: 'Weak',       color: '#f87171', desc: 'Poor catch'     },
  { label: 'Good',       color: '#f0c040', desc: 'Decent haul'    },
  { label: 'Great',      color: '#4ade80', desc: 'Strong pull'    },
  { label: 'Perfect ✦',  color: '#fde68a', desc: 'Maximum reward' },
]

export default function FishingGame({
  initialCastsUsed,
  hookTier,
}: {
  initialCastsUsed: number
  hookTier: number
}) {
  const [phase, setPhase]   = useState<Phase>('ready')
  const [angle, setAngle]   = useState(270) // start pointing left (in Weak zone visually off-screen)
  const [result, setResult] = useState<{ quality: number; earned: number; castsUsed: number; isPerfect: boolean } | null>(null)
  const [castsUsed, setCastsUsed] = useState(initialCastsUsed)
  const [, startTransition] = useTransition()

  const angleRef    = useRef(270)
  const speedRef    = useRef(80)    // degrees per second
  const phaseRef    = useRef<Phase>('ready')
  const animRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef     = useRef(0)
  const nextChgRef  = useRef(40)

  const hook      = HOOKS[Math.min(hookTier, HOOKS.length - 1)]
  const castsLeft = MAX_CASTS - castsUsed
  const minEarn   = Math.max(1, Math.floor(3  * hook.multiplier))
  const maxEarn   = Math.max(1, Math.floor(20 * hook.multiplier))

  useEffect(() => { phaseRef.current = phase }, [phase])

  useEffect(() => {
    if (phase !== 'active') {
      if (animRef.current) { clearInterval(animRef.current); animRef.current = null }
      return
    }
    animRef.current = setInterval(() => {
      if (phaseRef.current !== 'active') return
      angleRef.current = (angleRef.current + speedRef.current / 20) % 360
      tickRef.current++
      if (tickRef.current >= nextChgRef.current) {
        speedRef.current = 55 + Math.random() * 55
        nextChgRef.current = tickRef.current + 25 + Math.floor(Math.random() * 25)
      }
      setAngle(angleRef.current)
    }, 50)
    return () => { if (animRef.current) { clearInterval(animRef.current); animRef.current = null } }
  }, [phase])

  function handleCast() {
    if (castsLeft <= 0 || (phase !== 'ready' && phase !== 'result')) return
    angleRef.current = Math.random() * 360
    speedRef.current = 65 + Math.random() * 45
    tickRef.current = 0
    nextChgRef.current = 30 + Math.floor(Math.random() * 20)
    setAngle(angleRef.current)
    setResult(null)
    setPhase('active')
  }

  function handleReelIn() {
    if (phase !== 'active') return
    phaseRef.current = 'result'
    if (animRef.current) { clearInterval(animRef.current); animRef.current = null }
    const zone      = getZone(angleRef.current)
    const quality   = zone.quality
    const isPerfect = zone.isPerfect ?? false
    setCastsUsed(prev => prev + 1)
    setResult({ quality, earned: 0, castsUsed: castsUsed + 1, isPerfect })
    setPhase('result')
    startTransition(async () => {
      const res = await castLine(quality)
      if (!('error' in res)) {
        setResult({ quality, earned: res.earned, castsUsed: res.castsUsed, isPerfect })
        setCastsUsed(res.castsUsed)
      }
    })
  }

  const currentZone    = getZone(angle)
  const needleColor    = phase === 'result' && result ? catchColor(result.quality, result.isPerfect) : currentZone.color
  // tip of needle — stops just before the inner ring
  const needleTipY     = CY - (INNER_R - 8)

  // Arc fill opacity per phase
  function zoneOpacity(zone: ZoneDef): number {
    if (phase === 'ready') return 0.28
    if (phase === 'active') return currentZone === zone ? 0.72 : 0.22
    // result: highlight the zone that was hit
    if (result) {
      const hitZone = getZone(angleRef.current)
      return hitZone === zone ? 0.78 : 0.1
    }
    return 0.22
  }

  return (
    <div className="flex flex-col gap-4 max-w-sm mx-auto px-4 py-2">

      {/* Hook + casts header */}
      <div className="w-full flex items-center justify-between rounded-xl px-4 py-3"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ background: `${hook.color}18`, border: `1px solid ${hook.color}35` }}>
            <span style={{ fontSize: '1rem' }}>🪝</span>
          </div>
          <div>
            <p className="font-karla font-700 leading-none" style={{ fontSize: '0.82rem', color: hook.color }}>{hook.name}</p>
            <p className="font-karla font-600 leading-none mt-1" style={{ fontSize: '0.68rem', color: '#6a6764' }}>{minEarn}–{maxEarn} ⟡ per cast</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-karla font-700 leading-none" style={{ fontSize: '0.82rem', color: castsLeft > 0 ? '#c0bfba' : '#4a4845' }}>
            {castsLeft > 0 ? `${castsLeft} / ${MAX_CASTS}` : 'Done'}
          </p>
          <p className="font-karla font-600 leading-none mt-1" style={{ fontSize: '0.68rem', color: '#6a6764' }}>
            {castsLeft > 0 ? 'casts left today' : 'come back tomorrow'}
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait">

        {/* ── READY ── */}
        {phase === 'ready' && (
          <motion.div key="ready"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}
            className="flex flex-col gap-3"
          >
            {/* Idle dial preview */}
            <div className="flex justify-center py-2">
              <div style={{ position: 'relative', width: '100%', maxWidth: 220 }}>
                <svg viewBox="0 0 220 220" width="100%" style={{ display: 'block' }}>
                  <circle cx={CX} cy={CY} r={OUTER_R + 6} fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  {ZONES.map((zone, i) => (
                    <path key={i} d={arcPath(zone.from, zone.to)} fill={zone.color} fillOpacity={0.28} />
                  ))}
                  {/* Perfect ✦ labels */}
                  {ZONES.filter(z => z.isPerfect).map((zone, i) => {
                    const mid = polar(OUTER_R + 14, (zone.from + zone.to) / 2)
                    return <text key={i} x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central" fill={zone.color} fontSize="9" opacity="0.7">✦</text>
                  })}
                  <circle cx={CX} cy={CY} r={INNER_R - 2} fill="rgba(0,0,0,0.5)" />
                  <circle cx={CX} cy={CY} r="7" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                </svg>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '1.8rem', pointerEvents: 'none', opacity: 0.5 }}>🐟</div>
              </div>
            </div>

            {/* How to play */}
            <div className="rounded-xl px-4 py-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="font-karla font-700 uppercase tracking-[0.12em] mb-3" style={{ fontSize: '0.62rem', color: '#6a6764' }}>How to play</p>
              <p className="font-karla font-600 leading-relaxed mb-3" style={{ fontSize: '0.82rem', color: '#b0afa8' }}>
                The needle sweeps around the dial. Tap <span style={{ color: '#f0ede8' }}>Reel In</span> when it lands in the zone you want.
              </p>
              <div className="rounded-lg px-3 py-3 mb-3 flex items-start gap-2.5"
                style={{ background: 'rgba(253,230,138,0.07)', border: '1px solid rgba(253,230,138,0.22)' }}>
                <span style={{ fontSize: '0.8rem', color: '#fde68a', lineHeight: 1, marginTop: 2, flexShrink: 0 }}>✦</span>
                <p className="font-karla font-600 leading-relaxed" style={{ fontSize: '0.78rem', color: '#c9b87a' }}>
                  <span style={{ color: '#fde68a' }}>Target the ✦ Perfect strips</span> — the thin arcs near the Weak zone. Highest risk, highest reward.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {ZONE_LEGEND.map(z => (
                  <div key={z.label} className="flex items-center gap-2.5">
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: z.color, flexShrink: 0 }} />
                    <span className="font-karla font-700" style={{ fontSize: '0.76rem', color: z.color }}>{z.label}</span>
                    <span className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#5a5956' }}>— {z.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {castsLeft > 0 ? (
              <div className="flex justify-center py-1">
                <motion.button onClick={handleCast}
                  className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
                  style={{
                    width: 88, height: 88, borderRadius: '50%',
                    background: 'radial-gradient(ellipse at 40% 35%, rgba(96,165,250,0.28), rgba(96,165,250,0.09))',
                    border: '1px solid rgba(96,165,250,0.4)', cursor: 'pointer',
                    fontSize: '0.72rem', color: '#93c5fd', touchAction: 'manipulation',
                    boxShadow: '0 6px 0 rgba(0,0,0,0.5), 0 0 22px rgba(96,165,250,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
                  }}
                  whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.5), 0 0 22px rgba(96,165,250,0.22), inset 0 1px 0 rgba(255,255,255,0.1)' }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                >Cast Line</motion.button>
              </div>
            ) : (
              <p className="font-karla font-600 text-center py-3" style={{ fontSize: '0.82rem', color: '#4a4845' }}>
                All casts used today. Come back tomorrow.
              </p>
            )}
          </motion.div>
        )}

        {/* ── ACTIVE + RESULT ── */}
        {(phase === 'active' || phase === 'result') && (
          <motion.div key="game"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            className="flex flex-col gap-4 items-center"
          >
            {/* Zone label */}
            <div style={{ minHeight: '1.6rem' }}>
              <AnimatePresence mode="wait">
                <motion.p
                  key={phase === 'active' ? currentZone.label : (result ? catchLabel(result.quality, result.isPerfect) : '')}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
                  className="font-cinzel font-700 uppercase tracking-[0.18em]"
                  style={{ fontSize: '0.88rem', color: needleColor }}
                >
                  {phase === 'active' ? currentZone.label : (result ? catchLabel(result.quality, result.isPerfect) : '')}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Circular dial */}
            <div style={{ position: 'relative', width: '100%', maxWidth: 240, margin: '0 auto' }}>
              <svg viewBox="0 0 220 220" width="100%" style={{ display: 'block' }}>
                {/* Outer background circle */}
                <circle cx={CX} cy={CY} r={OUTER_R + 6} fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />

                {/* Zone arcs */}
                {ZONES.map((zone, i) => (
                  <path
                    key={i}
                    d={arcPath(zone.from, zone.to)}
                    fill={zone.color}
                    fillOpacity={zoneOpacity(zone)}
                    style={{ transition: 'fill-opacity 0.08s' }}
                  />
                ))}

                {/* Perfect ✦ markers outside ring */}
                {ZONES.filter(z => z.isPerfect).map((zone, i) => {
                  const mid = polar(OUTER_R + 14, (zone.from + zone.to) / 2)
                  return (
                    <text key={i} x={mid.x.toFixed(2)} y={mid.y.toFixed(2)}
                      textAnchor="middle" dominantBaseline="central"
                      fill={zone.color} fontSize="10" opacity="0.9">✦</text>
                  )
                })}

                {/* Inner dark circle (center area) */}
                <circle cx={CX} cy={CY} r={INNER_R - 2} fill="rgba(0,0,0,0.55)" />

                {/* Needle glow (wide, transparent) */}
                <g transform={`rotate(${angle}, ${CX}, ${CY})`}>
                  <line x1={CX} y1={CY} x2={CX} y2={needleTipY}
                    stroke={needleColor} strokeWidth="10" strokeOpacity="0.12" strokeLinecap="round" />
                  <line x1={CX} y1={CY} x2={CX} y2={needleTipY}
                    stroke={needleColor} strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx={CX} cy={needleTipY} r="5" fill={needleColor} />
                </g>

                {/* Center pivot */}
                <circle cx={CX} cy={CY} r="8" fill="rgba(10,10,10,0.9)" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
              </svg>

              {/* Fish in center (HTML overlay) */}
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: '1.6rem', lineHeight: 1, pointerEvents: 'none',
                userSelect: 'none',
              }}>🐟</div>
            </div>

            {/* Result card */}
            <AnimatePresence>
              {phase === 'result' && result && (
                <div style={{ position: 'relative', width: '100%' }}>
                  {result.isPerfect && result.earned > 0 && [...Array(8)].map((_, i) => {
                    const angle2 = (i / 8) * Math.PI * 2
                    return (
                      <motion.div key={i}
                        initial={{ opacity: 1, x: 0, y: 0, scale: 1.2 }}
                        animate={{ opacity: 0, x: Math.cos(angle2) * 55, y: Math.sin(angle2) * 55, scale: 0 }}
                        transition={{ duration: 0.65, ease: 'easeOut', delay: i * 0.03 }}
                        style={{
                          position: 'absolute', top: '50%', left: '50%',
                          width: 6, height: 6, borderRadius: '50%',
                          background: '#fde68a', pointerEvents: 'none', zIndex: 10,
                        }}
                      />
                    )
                  })}
                  <motion.div
                    initial={{ opacity: 0, scale: result.isPerfect ? 0.75 : 0.95, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={result.isPerfect ? { type: 'spring', stiffness: 280, damping: 14 } : { duration: 0.2 }}
                    className="w-full rounded-2xl text-center"
                    style={{
                      background: `linear-gradient(135deg, ${catchColor(result.quality, result.isPerfect)}12, ${catchColor(result.quality, result.isPerfect)}06)`,
                      border: `1px solid ${catchColor(result.quality, result.isPerfect)}${result.isPerfect ? '50' : '25'}`,
                      padding: '1.25rem 1rem',
                      boxShadow: result.isPerfect ? `0 0 28px ${catchColor(result.quality, result.isPerfect)}20` : 'none',
                    }}
                  >
                    {result.isPerfect && (
                      <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.08 }}
                        className="font-karla font-700 uppercase tracking-[0.16em] mb-1"
                        style={{ fontSize: '0.72rem', color: catchColor(result.quality, result.isPerfect) }}>
                        ✦ Perfect catch
                      </motion.p>
                    )}
                    <motion.p
                      initial={{ scale: result.isPerfect ? 0.5 : 1, opacity: result.isPerfect ? 0 : 1 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 14, delay: result.isPerfect ? 0.12 : 0 }}
                      className="font-cinzel font-700"
                      style={{ fontSize: '2.4rem', color: result.isPerfect ? catchColor(result.quality, result.isPerfect) : '#f0c040', lineHeight: 1 }}
                    >
                      {result.earned > 0 ? `+${result.earned}` : '…'}
                    </motion.p>
                    {result.earned > 0 && (
                      <p className="font-karla font-600" style={{ fontSize: '0.76rem', color: '#7a7974', marginTop: '0.35rem' }}>
                        doubloons earned
                      </p>
                    )}
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* Reel In */}
            {phase === 'active' && (
              <motion.button
                onPointerDown={e => { e.preventDefault(); handleReelIn() }}
                className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
                style={{
                  width: 88, height: 88, borderRadius: '50%',
                  background: 'radial-gradient(ellipse at 40% 35%, rgba(240,192,64,0.28), rgba(240,192,64,0.08))',
                  border: '1px solid rgba(240,192,64,0.4)', cursor: 'pointer',
                  fontSize: '0.72rem', color: '#f0c040', touchAction: 'manipulation',
                  boxShadow: '0 6px 0 rgba(0,0,0,0.5), 0 0 22px rgba(240,192,64,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
                }}
                whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.5), 0 0 22px rgba(240,192,64,0.22), inset 0 1px 0 rgba(255,255,255,0.1)' }}
                transition={{ type: 'spring', stiffness: 600, damping: 22 }}
              >Reel In</motion.button>
            )}

            {/* Cast again */}
            {phase === 'result' && (
              castsLeft > 0 ? (
                <motion.button onClick={handleCast}
                  className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
                  style={{
                    width: 88, height: 88, borderRadius: '50%',
                    background: 'radial-gradient(ellipse at 40% 35%, rgba(96,165,250,0.28), rgba(96,165,250,0.09))',
                    border: '1px solid rgba(96,165,250,0.4)', cursor: 'pointer',
                    fontSize: '0.72rem', color: '#93c5fd', touchAction: 'manipulation',
                    boxShadow: '0 6px 0 rgba(0,0,0,0.5), 0 0 22px rgba(96,165,250,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
                  }}
                  whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.5), 0 0 22px rgba(96,165,250,0.22), inset 0 1px 0 rgba(255,255,255,0.1)' }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                >Cast Again</motion.button>
              ) : (
                <p className="font-karla font-600 text-center py-3" style={{ fontSize: '0.82rem', color: '#4a4845' }}>
                  No casts remaining
                </p>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hook upgrade nudge */}
      {hookTier < HOOKS.length - 1 && (
        <p className="font-karla font-600 text-center" style={{ fontSize: '0.7rem', color: '#4a4845' }}>
          <Link href="/marketplace/tackle-shop" style={{ color: '#5a5956', textDecoration: 'underline' }}>
            Upgrade your hook
          </Link>{' '}to earn more per cast
        </p>
      )}
    </div>
  )
}
