'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { castLine } from './actions'
import { MAX_CASTS } from './constants'
import { HOOKS } from '@/lib/hooks'
import Link from 'next/link'

type Phase = 'ready' | 'active' | 'result'
type ZoneType = 'miss' | 'catch' | 'perfect' | 'penalty'

interface ZoneDef {
  from: number
  to: number
  type: ZoneType
  label: string
  color: string
}

// 0° = 12 o'clock, clockwise
// Catch zone spans 90°, with Perfect (15°) nested in its center
const ZONES: ZoneDef[] = [
  { from:   0, to:  45, type: 'miss',    label: 'Miss',     color: '#64748b' },
  { from:  45, to:  90, type: 'catch',   label: 'Catch',    color: '#4ade80' },
  { from:  90, to: 105, type: 'perfect', label: 'Perfect!', color: '#fde68a' },
  { from: 105, to: 150, type: 'catch',   label: 'Catch',    color: '#4ade80' },
  { from: 150, to: 235, type: 'miss',    label: 'Miss',     color: '#64748b' },
  { from: 235, to: 290, type: 'penalty', label: 'Snag!',    color: '#f87171' },
  { from: 290, to: 360, type: 'miss',    label: 'Miss',     color: '#64748b' },
]

const CX = 110, CY = 110
const OUTER_R = 96, INNER_R = 66
const GAP = 1.0

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

const ZONE_LEGEND = [
  { label: 'Perfect ✦', color: '#fde68a', desc: 'Bonus doubloons' },
  { label: 'Catch',     color: '#4ade80', desc: 'Earn doubloons'  },
  { label: 'Snag!',     color: '#f87171', desc: '2 casts wasted'  },
  { label: 'Miss',      color: '#64748b', desc: '1 cast wasted'   },
]

export default function FishingGame({
  initialCastsUsed,
  hookTier,
}: {
  initialCastsUsed: number
  hookTier: number
}) {
  const [phase, setPhase] = useState<Phase>('ready')
  const [angle, setAngle] = useState(270)
  const [result, setResult] = useState<{
    type: ZoneType
    earned: number
    castsUsed: number
  } | null>(null)
  const [castsUsed, setCastsUsed] = useState(initialCastsUsed)
  const [, startTransition] = useTransition()

  const angleRef   = useRef(270)
  const speedRef   = useRef(80)
  const phaseRef   = useRef<Phase>('ready')
  const animRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef    = useRef(0)
  const nextChgRef = useRef(40)

  const hook      = HOOKS[Math.min(hookTier, HOOKS.length - 1)]
  const castsLeft = MAX_CASTS - castsUsed
  const catchEarn = Math.max(1, Math.floor(8  * hook.multiplier))
  const perfEarn  = Math.max(1, Math.floor(20 * hook.multiplier))

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
    const zone = getZone(angleRef.current)
    const castsToConsume = zone.type === 'penalty' ? Math.min(2, MAX_CASTS - castsUsed) : 1
    const newLocalCasts = Math.min(castsUsed + castsToConsume, MAX_CASTS)
    setCastsUsed(newLocalCasts)
    setResult({ type: zone.type, earned: 0, castsUsed: newLocalCasts })
    setPhase('result')
    startTransition(async () => {
      const res = await castLine(zone.type as 'perfect' | 'catch' | 'miss' | 'penalty')
      if (!('error' in res)) {
        setResult({ type: zone.type, earned: res.earned, castsUsed: res.castsUsed })
        setCastsUsed(res.castsUsed)
      }
    })
  }

  const currentZone = getZone(angle)
  const needleColor = phase === 'result' && result ? result.type === 'miss' ? '#64748b' : ZONES.find(z => z.type === result.type)?.color ?? '#888' : currentZone.color

  function zoneOpacity(zone: ZoneDef): number {
    if (phase === 'ready') return zone.type === 'perfect' ? 0.55 : zone.type === 'penalty' ? 0.38 : 0.22
    if (phase === 'active') return currentZone === zone ? 0.82 : zone.type === 'perfect' ? 0.45 : zone.type === 'penalty' ? 0.32 : 0.18
    if (result) {
      const hitZone = getZone(angleRef.current)
      return hitZone === zone ? 0.85 : 0.1
    }
    return 0.22
  }

  function resultTitle(): string {
    if (!result) return ''
    if (result.type === 'perfect') return '✦ Perfect catch!'
    if (result.type === 'catch') return 'Fish on!'
    if (result.type === 'penalty') return 'Snagged!'
    return 'No catch'
  }

  function resultSubtitle(): string {
    if (!result) return ''
    if (result.type === 'perfect' || result.type === 'catch') {
      return result.earned > 0 ? `+${result.earned} doubloons` : '…'
    }
    if (result.type === 'penalty') return '2 casts wasted'
    return '1 cast wasted'
  }

  function resultColor(): string {
    if (!result) return '#888'
    if (result.type === 'perfect') return '#fde68a'
    if (result.type === 'catch') return '#4ade80'
    if (result.type === 'penalty') return '#f87171'
    return '#475569'
  }

  const isPerfect = result?.type === 'perfect'
  const isCatch   = result?.type === 'catch' || isPerfect

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
            <p className="font-karla font-600 leading-none mt-1" style={{ fontSize: '0.68rem', color: '#6a6764' }}>
              {catchEarn}–{perfEarn} ⟡ per catch
            </p>
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
                    <path key={i} d={arcPath(zone.from, zone.to)} fill={zone.color}
                      fillOpacity={zone.type === 'perfect' ? 0.55 : zone.type === 'penalty' ? 0.38 : 0.22} />
                  ))}
                  {/* ✦ marker at Perfect zone midpoint */}
                  {(() => {
                    const pz = ZONES.find(z => z.type === 'perfect')!
                    const mid = polar(OUTER_R + 14, (pz.from + pz.to) / 2)
                    return <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central" fill={pz.color} fontSize="9" opacity="0.8">✦</text>
                  })()}
                  {/* ⚠ marker at Penalty zone midpoint */}
                  {(() => {
                    const pz = ZONES.find(z => z.type === 'penalty')!
                    const mid = polar(OUTER_R + 14, (pz.from + pz.to) / 2)
                    return <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central" fill={pz.color} fontSize="8" opacity="0.7">✕</text>
                  })()}
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
                The needle sweeps around the dial. Tap <span style={{ color: '#f0ede8' }}>Reel In</span> to stop it.
              </p>
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
                  key={phase === 'active' ? currentZone.type : result?.type ?? ''}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.1 }}
                  className="font-cinzel font-700 uppercase tracking-[0.18em]"
                  style={{ fontSize: '0.88rem', color: needleColor }}
                >
                  {phase === 'active' ? currentZone.label : resultTitle()}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Circular dial */}
            <div style={{ position: 'relative', width: '100%', maxWidth: 240, margin: '0 auto' }}>
              <svg viewBox="0 0 220 220" width="100%" style={{ display: 'block' }}>
                <circle cx={CX} cy={CY} r={OUTER_R + 6} fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />

                {ZONES.map((zone, i) => (
                  <path key={i} d={arcPath(zone.from, zone.to)} fill={zone.color}
                    fillOpacity={zoneOpacity(zone)} style={{ transition: 'fill-opacity 0.08s' }} />
                ))}

                {/* ✦ marker at Perfect zone */}
                {(() => {
                  const pz = ZONES.find(z => z.type === 'perfect')!
                  const mid = polar(OUTER_R + 14, (pz.from + pz.to) / 2)
                  return <text x={mid.x.toFixed(2)} y={mid.y.toFixed(2)} textAnchor="middle" dominantBaseline="central" fill={pz.color} fontSize="10" opacity="0.95">✦</text>
                })()}

                {/* ✕ marker at Penalty zone */}
                {(() => {
                  const pz = ZONES.find(z => z.type === 'penalty')!
                  const mid = polar(OUTER_R + 14, (pz.from + pz.to) / 2)
                  return <text x={mid.x.toFixed(2)} y={mid.y.toFixed(2)} textAnchor="middle" dominantBaseline="central" fill={pz.color} fontSize="9" opacity="0.85">✕</text>
                })()}

                <circle cx={CX} cy={CY} r={INNER_R - 2} fill="rgba(0,0,0,0.55)" />

                {/* Needle */}
                <g transform={`rotate(${angle}, ${CX}, ${CY})`}>
                  <line x1={CX} y1={CY} x2={CX} y2={CY - (INNER_R - 8)}
                    stroke={needleColor} strokeWidth="10" strokeOpacity="0.12" strokeLinecap="round" />
                  <line x1={CX} y1={CY} x2={CX} y2={CY - (INNER_R - 8)}
                    stroke={needleColor} strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx={CX} cy={CY - (INNER_R - 8)} r="5" fill={needleColor} />
                </g>

                <circle cx={CX} cy={CY} r="8" fill="rgba(10,10,10,0.9)" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
              </svg>

              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: '1.6rem', lineHeight: 1, pointerEvents: 'none', userSelect: 'none',
              }}>🐟</div>
            </div>

            {/* Result card */}
            <AnimatePresence>
              {phase === 'result' && result && (
                <div style={{ position: 'relative', width: '100%' }}>
                  {/* Spark burst for perfect */}
                  {isPerfect && result.earned > 0 && [...Array(8)].map((_, i) => {
                    const a2 = (i / 8) * Math.PI * 2
                    return (
                      <motion.div key={i}
                        initial={{ opacity: 1, x: 0, y: 0, scale: 1.2 }}
                        animate={{ opacity: 0, x: Math.cos(a2) * 55, y: Math.sin(a2) * 55, scale: 0 }}
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
                    initial={{ opacity: 0, scale: isCatch ? (isPerfect ? 0.75 : 0.92) : 0.96, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={isPerfect ? { type: 'spring', stiffness: 280, damping: 14 } : { duration: 0.2 }}
                    className="w-full rounded-2xl text-center"
                    style={{
                      background: `linear-gradient(135deg, ${resultColor()}12, ${resultColor()}06)`,
                      border: `1px solid ${resultColor()}${isCatch ? '45' : '20'}`,
                      padding: '1.25rem 1rem',
                      boxShadow: isPerfect ? `0 0 28px ${resultColor()}20` : 'none',
                    }}
                  >
                    <p className="font-cinzel font-700 tracking-[0.12em]"
                      style={{ fontSize: isCatch ? '1.5rem' : '1.1rem', color: resultColor(), lineHeight: 1.2, marginBottom: '0.4rem' }}>
                      {resultTitle()}
                    </p>
                    <p className="font-karla font-600"
                      style={{ fontSize: isCatch ? '1rem' : '0.82rem', color: isCatch ? resultColor() : '#4a4845' }}>
                      {resultSubtitle()}
                    </p>
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
          </Link>{' '}to earn more per catch
        </p>
      )}
    </div>
  )
}
