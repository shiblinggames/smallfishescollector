'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { castLine } from './actions'
import { MAX_CASTS } from './constants'
import { DEPTHS, buildZones, type ZoneDef, type ZoneType } from './depths'
import { HOOKS } from '@/lib/hooks'
import Link from 'next/link'

type Phase = 'ready' | 'active' | 'result'

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

function getZone(zones: ZoneDef[], deg: number, rotation = 0): ZoneDef {
  const a = (((deg - rotation) % 360) + 360) % 360
  return zones.find(z => a >= z.from && a < z.to) ?? zones[0]
}

const ZONE_LEGEND = [
  { label: 'Perfect ✦', color: '#fde68a', desc: 'Bonus doubloons' },
  { label: 'Catch',     color: '#4ade80', desc: 'Earn doubloons'  },
  { label: 'Snag!',     color: '#f87171', desc: '2 casts wasted'  },
  { label: 'Miss',      color: '#64748b', desc: '1 cast wasted'   },
]

function DialSVG({
  zones,
  angle,
  rotation = 0,
  needleColor,
  zoneOpacityFn,
  fish = true,
}: {
  zones: ZoneDef[]
  angle: number
  rotation?: number
  needleColor: string
  zoneOpacityFn: (z: ZoneDef) => number
  fish?: boolean
}) {
  const needleTipY = CY - (INNER_R - 8)
  const perfectZone  = zones.find(z => z.type === 'perfect')
  const penaltyZones = zones.filter(z => z.type === 'penalty')

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 240, margin: '0 auto' }}>
      <svg viewBox="0 0 220 220" width="100%" style={{ display: 'block' }}>
        <circle cx={CX} cy={CY} r={OUTER_R + 6} fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
        {/* Zone ring rotated by random offset each cast */}
        <g transform={`rotate(${rotation}, ${CX}, ${CY})`}>
          {zones.map((zone, i) => (
            <path key={i} d={arcPath(zone.from, zone.to)} fill={zone.color}
              fillOpacity={zoneOpacityFn(zone)} style={{ transition: 'fill-opacity 0.08s' }} />
          ))}
          {perfectZone && (() => {
            const mid = polar(OUTER_R + 14, (perfectZone.from + perfectZone.to) / 2)
            return <text x={mid.x.toFixed(2)} y={mid.y.toFixed(2)} textAnchor="middle" dominantBaseline="central" fill={perfectZone.color} fontSize="10" opacity="0.95">✦</text>
          })()}
          {penaltyZones.map((pz, i) => {
            const mid = polar(OUTER_R + 14, (pz.from + pz.to) / 2)
            return <text key={i} x={mid.x.toFixed(2)} y={mid.y.toFixed(2)} textAnchor="middle" dominantBaseline="central" fill={pz.color} fontSize="9" opacity="0.85">✕</text>
          })}
        </g>
        <circle cx={CX} cy={CY} r={INNER_R - 2} fill="rgba(0,0,0,0.55)" />
        <g transform={`rotate(${angle}, ${CX}, ${CY})`}>
          <line x1={CX} y1={CY} x2={CX} y2={needleTipY} stroke={needleColor} strokeWidth="10" strokeOpacity="0.12" strokeLinecap="round" />
          <line x1={CX} y1={CY} x2={CX} y2={needleTipY} stroke={needleColor} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx={CX} cy={needleTipY} r="5" fill={needleColor} />
        </g>
        <circle cx={CX} cy={CY} r="8" fill="rgba(10,10,10,0.9)" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      </svg>
      {fish && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: '1.6rem', lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }}>
          🐟
        </div>
      )}
    </div>
  )
}

export default function FishingGame({
  initialCastsUsed,
  hookTier,
}: {
  initialCastsUsed: number
  hookTier: number
}) {
  const [phase, setPhase]           = useState<Phase>('ready')
  const [selectedDepth, setSelectedDepth] = useState(0)
  const [angle, setAngle]           = useState(270)
  const [result, setResult]         = useState<{ type: ZoneType; earned: number; castsUsed: number } | null>(null)
  const [castsUsed, setCastsUsed]   = useState(initialCastsUsed)
  const [, startTransition]         = useTransition()

  const angleRef        = useRef(270)
  const speedRef        = useRef(80)
  const dirRef          = useRef(1)   // 1 = clockwise, -1 = counter-clockwise
  const phaseRef        = useRef<Phase>('ready')
  const animRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef         = useRef(0)
  const nextChgRef      = useRef(40)
  const castDepthRef    = useRef(0)
  const castRotationRef = useRef(0)

  const [zoneRotation, setZoneRotation] = useState(0)

  const hook      = HOOKS[Math.min(hookTier, HOOKS.length - 1)]
  const castsLeft = MAX_CASTS - castsUsed

  const previewZones = buildZones(DEPTHS[selectedDepth])
  const activeZones  = buildZones(DEPTHS[castDepthRef.current])

  function earnRange(depthId: number) {
    const d = DEPTHS[depthId]
    const lo = Math.max(1, Math.floor(d.catchQuality   * hook.multiplier))
    const hi = Math.max(1, Math.floor(d.perfectQuality * hook.multiplier))
    return `${lo}–${hi} ⟡`
  }

  useEffect(() => { phaseRef.current = phase }, [phase])

  useEffect(() => {
    if (phase !== 'active') {
      if (animRef.current) { clearInterval(animRef.current); animRef.current = null }
      return
    }
    animRef.current = setInterval(() => {
      if (phaseRef.current !== 'active') return
      angleRef.current = ((angleRef.current + dirRef.current * speedRef.current / 20) % 360 + 360) % 360
      tickRef.current++
      if (tickRef.current >= nextChgRef.current) {
        const d = DEPTHS[castDepthRef.current]
        speedRef.current = d.speedMin + Math.random() * (d.speedMax - d.speedMin)
        if (Math.random() < d.reverseChance) dirRef.current *= -1
        nextChgRef.current = tickRef.current + d.changeMin + Math.floor(Math.random() * (d.changeMax - d.changeMin))
      }
      setAngle(angleRef.current)
    }, 50)
    return () => { if (animRef.current) { clearInterval(animRef.current); animRef.current = null } }
  }, [phase])

  function handleCast() {
    if (castsLeft <= 0 || (phase !== 'ready' && phase !== 'result')) return
    castDepthRef.current = selectedDepth
    const d   = DEPTHS[selectedDepth]
    const rot = Math.floor(Math.random() * 360)
    castRotationRef.current = rot
    setZoneRotation(rot)
    angleRef.current   = Math.random() * 360
    speedRef.current   = d.speedMin + Math.random() * (d.speedMax - d.speedMin)
    dirRef.current     = 1
    tickRef.current    = 0
    nextChgRef.current = d.changeMin + Math.floor(Math.random() * (d.changeMax - d.changeMin))
    setAngle(angleRef.current)
    setResult(null)
    setPhase('active')
  }

  function handleReelIn() {
    if (phase !== 'active') return
    phaseRef.current = 'result'
    if (animRef.current) { clearInterval(animRef.current); animRef.current = null }
    const zone = getZone(activeZones, angleRef.current, castRotationRef.current)
    const castsToConsume = zone.type === 'penalty' ? Math.min(2, MAX_CASTS - castsUsed) : 1
    const newLocalCasts  = Math.min(castsUsed + castsToConsume, MAX_CASTS)
    setCastsUsed(newLocalCasts)
    setResult({ type: zone.type, earned: 0, castsUsed: newLocalCasts })
    setPhase('result')
    startTransition(async () => {
      const res = await castLine(zone.type as 'perfect' | 'catch' | 'miss' | 'penalty', castDepthRef.current)
      if (!('error' in res)) {
        setResult({ type: zone.type, earned: res.earned, castsUsed: res.castsUsed })
        setCastsUsed(res.castsUsed)
      }
    })
  }

  const currentZone  = getZone(activeZones, angle, castRotationRef.current)
  const resultZone   = result ? DEPTHS.find(() => true) : null // only for type narrowing
  void resultZone

  function activeNeedleColor(): string {
    if (phase === 'result' && result) {
      if (result.type === 'miss') return '#64748b'
      return activeZones.find(z => z.type === result.type)?.color ?? '#888'
    }
    return currentZone.color
  }

  function zoneOpacity(zone: ZoneDef): number {
    if (phase === 'active') return currentZone === zone ? 0.82 : zone.type === 'perfect' ? 0.45 : zone.type === 'penalty' ? 0.32 : 0.18
    if (phase === 'result' && result) {
      const hitZone = getZone(activeZones, angleRef.current, castRotationRef.current)
      return hitZone === zone ? 0.85 : 0.1
    }
    return 0.22
  }

  function previewOpacity(zone: ZoneDef): number {
    return zone.type === 'perfect' ? 0.55 : zone.type === 'penalty' ? 0.38 : 0.22
  }

  function resultTitle(): string {
    if (!result) return ''
    if (result.type === 'perfect') return '✦ Perfect catch!'
    if (result.type === 'catch')   return 'Fish on!'
    if (result.type === 'penalty') return 'Snagged!'
    return 'No catch'
  }

  function resultColor(): string {
    if (!result) return '#888'
    if (result.type === 'perfect') return '#fde68a'
    if (result.type === 'catch')   return '#4ade80'
    if (result.type === 'penalty') return '#f87171'
    return '#475569'
  }

  const isCatch   = result?.type === 'catch' || result?.type === 'perfect'
  const isPerfect = result?.type === 'perfect'

  function DepthSelector({ compact = false }: { compact?: boolean }) {
    return (
      <div className="flex gap-1.5 w-full">
        {DEPTHS.map(d => (
          <button key={d.id}
            onClick={() => phase !== 'active' && setSelectedDepth(d.id)}
            style={{
              flex: 1, minWidth: 0,
              padding: compact ? '0.35rem 0.2rem' : '0.5rem 0.25rem',
              borderRadius: '0.55rem',
              border: `1px solid ${selectedDepth === d.id ? d.color + '55' : 'rgba(255,255,255,0.06)'}`,
              background: selectedDepth === d.id ? d.color + '12' : 'rgba(255,255,255,0.02)',
              cursor: phase === 'active' ? 'default' : 'pointer',
              textAlign: 'center',
              transition: 'border-color 0.15s, background 0.15s',
            }}>
            <p className="font-karla font-700 truncate"
              style={{ fontSize: '0.62rem', color: selectedDepth === d.id ? d.color : '#7a7974' }}>
              {d.name}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 2, margin: '0.18rem 0' }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{ width: 4, height: 4, borderRadius: '50%',
                  background: i <= d.id ? (selectedDepth === d.id ? d.color : d.color + '80') : 'rgba(255,255,255,0.1)' }} />
              ))}
            </div>
            {!compact && (
              <p className="font-karla font-600" style={{ fontSize: '0.58rem', color: selectedDepth === d.id ? d.color + 'bb' : '#4a4845' }}>
                {earnRange(d.id)}
              </p>
            )}
          </button>
        ))}
      </div>
    )
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
            <p className="font-karla font-600 leading-none mt-1" style={{ fontSize: '0.68rem', color: '#6a6764' }}>
              {earnRange(selectedDepth)} per catch
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
            <DepthSelector />

            <div className="flex justify-center py-1">
              <DialSVG
                zones={previewZones}
                angle={270}
                needleColor="rgba(255,255,255,0.15)"
                zoneOpacityFn={previewOpacity}
              />
            </div>

            {/* Zone legend */}
            <div className="rounded-xl px-4 py-3"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="font-karla font-600 leading-relaxed mb-2.5" style={{ fontSize: '0.78rem', color: '#b0afa8' }}>
                Stop the needle in the <span style={{ color: '#4ade80' }}>Catch</span> zone to earn. Hit the <span style={{ color: '#fde68a' }}>✦ Perfect</span> strip inside for a bonus. Avoid the <span style={{ color: '#f87171' }}>Snag</span>.
              </p>
              <div className="flex flex-col gap-1.5">
                {ZONE_LEGEND.map(z => (
                  <div key={z.label} className="flex items-center gap-2.5">
                    <div style={{ width: 9, height: 9, borderRadius: 2, background: z.color, flexShrink: 0 }} />
                    <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: z.color }}>{z.label}</span>
                    <span className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#5a5956' }}>— {z.desc}</span>
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

        {/* ── ACTIVE + RESULT (shared layout so button never moves) ── */}
        {(phase === 'active' || phase === 'result') && (
          <motion.div key="game"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            className="flex flex-col gap-4 items-center"
          >
            {/* Zone label */}
            <div style={{ minHeight: '1.6rem' }}>
              <AnimatePresence mode="wait">
                <motion.p key={phase === 'active' ? currentZone.type : result?.type ?? 'idle'}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.1 }}
                  className="font-cinzel font-700 uppercase tracking-[0.18em]"
                  style={{ fontSize: '0.88rem', color: activeNeedleColor() }}>
                  {phase === 'active' ? currentZone.label : resultTitle()}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Dial with result overlaid inside the inner circle */}
            <div style={{ position: 'relative', width: '100%', maxWidth: 240 }}>
              <DialSVG zones={activeZones} angle={angle} rotation={zoneRotation} needleColor={activeNeedleColor()} zoneOpacityFn={zoneOpacity} />

              {/* Result overlay — sits over the inner circle, no layout impact */}
              <AnimatePresence>
                {phase === 'result' && result && (
                  <motion.div
                    initial={{ opacity: 0, scale: isPerfect ? 0.6 : 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={isPerfect ? { type: 'spring', stiffness: 300, damping: 16 } : { duration: 0.18 }}
                    style={{
                      position: 'absolute', top: '50%', left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '52%', textAlign: 'center', pointerEvents: 'none',
                    }}
                  >
                    {/* Spark burst for perfect */}
                    {isPerfect && result.earned > 0 && [...Array(8)].map((_, i) => {
                      const a2 = (i / 8) * Math.PI * 2
                      return (
                        <motion.div key={i}
                          initial={{ opacity: 1, x: 0, y: 0, scale: 1.2 }}
                          animate={{ opacity: 0, x: Math.cos(a2) * 52, y: Math.sin(a2) * 52, scale: 0 }}
                          transition={{ duration: 0.6, ease: 'easeOut', delay: i * 0.03 }}
                          style={{ position: 'absolute', top: '50%', left: '50%', width: 6, height: 6, borderRadius: '50%', background: '#fde68a', pointerEvents: 'none' }}
                        />
                      )
                    })}
                    <p className="font-cinzel font-700"
                      style={{ fontSize: isCatch ? '1.3rem' : '0.85rem', color: resultColor(), lineHeight: 1.1 }}>
                      {isCatch ? (result.earned > 0 ? `+${result.earned}` : '…') : result.type === 'penalty' ? '−2' : '✕'}
                    </p>
                    <p className="font-karla font-600"
                      style={{ fontSize: '0.58rem', color: isCatch ? resultColor() + 'bb' : '#4a4845', marginTop: 2 }}>
                      {isCatch ? 'doubloons' : result.type === 'penalty' ? 'casts lost' : 'no catch'}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Button — always in this exact DOM position */}
            <AnimatePresence mode="wait">
              {phase === 'active' ? (
                <motion.button key="reel"
                  onPointerDown={e => { e.preventDefault(); handleReelIn() }}
                  className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
                  style={{
                    width: 88, height: 88, borderRadius: '50%',
                    background: 'radial-gradient(ellipse at 40% 35%, rgba(240,192,64,0.28), rgba(240,192,64,0.08))',
                    border: '1px solid rgba(240,192,64,0.4)', cursor: 'pointer',
                    fontSize: '0.72rem', color: '#f0c040', touchAction: 'manipulation',
                    boxShadow: '0 6px 0 rgba(0,0,0,0.5), 0 0 22px rgba(240,192,64,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
                  }}
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                  whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.5), 0 0 22px rgba(240,192,64,0.22), inset 0 1px 0 rgba(255,255,255,0.1)' }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                >Reel In</motion.button>
              ) : castsLeft > 0 ? (
                <motion.button key="cast"
                  onClick={handleCast}
                  className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
                  style={{
                    width: 88, height: 88, borderRadius: '50%',
                    background: 'radial-gradient(ellipse at 40% 35%, rgba(96,165,250,0.28), rgba(96,165,250,0.09))',
                    border: '1px solid rgba(96,165,250,0.4)', cursor: 'pointer',
                    fontSize: '0.72rem', color: '#93c5fd', touchAction: 'manipulation',
                    boxShadow: '0 6px 0 rgba(0,0,0,0.5), 0 0 22px rgba(96,165,250,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
                  }}
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                  whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.5), 0 0 22px rgba(96,165,250,0.22), inset 0 1px 0 rgba(255,255,255,0.1)' }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                >Cast Again</motion.button>
              ) : (
                <motion.p key="done"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="font-karla font-600 text-center py-3"
                  style={{ fontSize: '0.82rem', color: '#4a4845' }}>
                  No casts remaining
                </motion.p>
              )}
            </AnimatePresence>

            {/* Depth selector — below button so it never shifts button position */}
            <AnimatePresence>
              {phase === 'result' && (
                <motion.div key="ds" style={{ width: '100%' }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}>
                  <DepthSelector compact />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

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
