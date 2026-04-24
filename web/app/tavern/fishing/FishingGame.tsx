'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { castLine } from './actions'
import { MAX_CASTS } from './constants'
import { HOOKS } from '@/lib/hooks'
import Link from 'next/link'

type Phase = 'ready' | 'active' | 'result'

interface ZoneDef {
  from: number
  to: number
  quality: number
  label: string
  color: string
  bg: string
  isPerfect?: boolean
}

const ZONES: ZoneDef[] = [
  { from:  0, to: 14, quality:  3, label: 'Weak',    color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
  { from: 14, to: 18, quality: 20, label: 'Perfect!', color: '#fde68a', bg: 'rgba(253,230,138,0.55)', isPerfect: true },
  { from: 18, to: 82, quality: 14, label: 'Great',    color: '#4ade80', bg: 'rgba(74,222,128,0.13)'  },
  { from: 82, to: 86, quality: 20, label: 'Perfect!', color: '#fde68a', bg: 'rgba(253,230,138,0.55)', isPerfect: true },
  { from: 86, to:100, quality:  3, label: 'Weak',     color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
]

function getZone(pos: number): ZoneDef {
  return ZONES.find(z => pos >= z.from && pos < z.to) ?? ZONES[0]
}

function catchLabel(quality: number, isPerfect: boolean): string {
  if (isPerfect) return 'Perfect ✦'
  if (quality >= 14) return 'Great catch'
  return 'Tiny catch'
}

function catchColor(quality: number, isPerfect: boolean): string {
  if (isPerfect) return '#fde68a'
  if (quality >= 14) return '#4ade80'
  return '#f87171'
}

const ZONE_LEGEND = [
  { label: 'Weak',       color: '#f87171', desc: 'Poor catch'     },
  { label: 'Great',      color: '#4ade80', desc: 'Good haul'      },
  { label: 'Perfect ✦',  color: '#fde68a', desc: 'Maximum reward' },
]

export default function FishingGame({
  initialCastsUsed,
  hookTier,
}: {
  initialCastsUsed: number
  hookTier: number
}) {
  const [phase, setPhase] = useState<Phase>('ready')
  const [position, setPosition] = useState(50)
  const [result, setResult] = useState<{ quality: number; earned: number; castsUsed: number; isPerfect: boolean } | null>(null)
  const [castsUsed, setCastsUsed] = useState(initialCastsUsed)
  const [, startTransition] = useTransition()

  const posRef   = useRef(50)
  const dirRef   = useRef(1)
  const speedRef = useRef(100)
  const phaseRef = useRef<Phase>('ready')
  const animRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  const hook = HOOKS[Math.min(hookTier, HOOKS.length - 1)]
  const castsLeft = MAX_CASTS - castsUsed

  const minEarn = Math.max(1, Math.floor(3  * hook.multiplier))
  const maxEarn = Math.max(1, Math.floor(20 * hook.multiplier))

  useEffect(() => { phaseRef.current = phase }, [phase])

  useEffect(() => {
    if (phase !== 'active') {
      if (animRef.current) { clearInterval(animRef.current); animRef.current = null }
      return
    }
    animRef.current = setInterval(() => {
      if (phaseRef.current !== 'active') return
      posRef.current += dirRef.current * (speedRef.current / 20)
      if (posRef.current >= 100) {
        posRef.current = 100; dirRef.current = -1; speedRef.current = 90 + Math.random() * 60
      } else if (posRef.current <= 0) {
        posRef.current = 0; dirRef.current = 1; speedRef.current = 90 + Math.random() * 60
      }
      setPosition(posRef.current)
    }, 50)
    return () => { if (animRef.current) { clearInterval(animRef.current); animRef.current = null } }
  }, [phase])

  function handleCast() {
    if (castsLeft <= 0 || (phase !== 'ready' && phase !== 'result')) return
    posRef.current   = 15 + Math.random() * 70
    dirRef.current   = Math.random() > 0.5 ? 1 : -1
    speedRef.current = 90 + Math.random() * 60
    setPosition(posRef.current)
    setResult(null)
    setPhase('active')
  }

  function handleReelIn() {
    if (phase !== 'active') return
    phaseRef.current = 'result'
    if (animRef.current) { clearInterval(animRef.current); animRef.current = null }
    const zone      = getZone(posRef.current)
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

  const currentZone    = getZone(position)
  const indicatorColor = phase === 'result' && result
    ? catchColor(result.quality, result.isPerfect)
    : currentZone.color

  return (
    <div className="flex flex-col gap-4 max-w-sm mx-auto px-4 py-2">

      {/* Hook + casts header */}
      <div
        className="w-full flex items-center justify-between rounded-xl px-4 py-3"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ background: `${hook.color}18`, border: `1px solid ${hook.color}35` }}>
            <span style={{ fontSize: '1rem' }}>🪝</span>
          </div>
          <div>
            <p className="font-karla font-700 leading-none" style={{ fontSize: '0.82rem', color: hook.color }}>
              {hook.name}
            </p>
            <p className="font-karla font-600 leading-none mt-1" style={{ fontSize: '0.68rem', color: '#6a6764' }}>
              {minEarn}–{maxEarn} ⟡ per cast
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

      {/* Ready state */}
      <AnimatePresence mode="wait">
        {phase === 'ready' && (
          <motion.div
            key="instructions"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}
            className="w-full flex flex-col gap-3"
          >
            {/* Water visual */}
            <div className="w-full flex flex-col items-center gap-1.5 py-2">
              <div style={{ width: 2, height: 36, background: 'rgba(255,255,255,0.2)', borderRadius: 1 }} />
              <div style={{ width: '100%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(96,165,250,0.3), rgba(96,165,250,0.15), transparent)' }} />
              <p className="font-karla" style={{ fontSize: '0.7rem', color: '#3a5a7a', letterSpacing: '0.15em', marginTop: 2 }}>
                ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
              </p>
            </div>

            {/* How to play */}
            <div className="rounded-xl px-4 py-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="font-karla font-700 uppercase tracking-[0.12em] mb-3" style={{ fontSize: '0.62rem', color: '#6a6764' }}>
                How to play
              </p>
              <p className="font-karla font-600 leading-relaxed mb-3" style={{ fontSize: '0.82rem', color: '#b0afa8' }}>
                The fish drifts back and forth — tap <span style={{ color: '#f0ede8' }}>Reel In</span> when it lands where you want.
              </p>

              {/* Perfect callout */}
              <div className="rounded-lg px-3 py-3 mb-3 flex items-start gap-2.5"
                style={{ background: 'rgba(253,230,138,0.07)', border: '1px solid rgba(253,230,138,0.22)' }}>
                <span style={{ fontSize: '0.8rem', color: '#fde68a', lineHeight: 1, marginTop: 2, flexShrink: 0 }}>✦</span>
                <p className="font-karla font-600 leading-relaxed" style={{ fontSize: '0.78rem', color: '#c9b87a' }}>
                  <span style={{ color: '#fde68a' }}>Target the ✦ Perfect strips</span> — the thin gold lines at the edges. They pay the most. Everything else earns much less.
                </p>
              </div>

              {/* Zone legend */}
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
              <div className="flex flex-col items-center py-1">
                <motion.button
                  onClick={handleCast}
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
                >
                  Cast Line
                </motion.button>
              </div>
            ) : (
              <p className="font-karla font-600 text-center py-3" style={{ fontSize: '0.82rem', color: '#4a4845' }}>
                All casts used today. Come back tomorrow.
              </p>
            )}
          </motion.div>
        )}

        {/* Active + result state */}
        {(phase === 'active' || phase === 'result') && (
          <motion.div
            key="game"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            className="w-full flex flex-col gap-4"
          >
            {/* Water line */}
            <div className="w-full flex flex-col items-center gap-1">
              <div style={{
                width: 2, height: 52,
                background: `linear-gradient(to bottom, rgba(255,255,255,0.25), ${indicatorColor}80)`,
                borderRadius: 1,
              }} />
              <div style={{ width: '100%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(96,165,250,0.3), transparent)' }} />
            </div>

            {/* Zone label */}
            <div className="text-center" style={{ minHeight: '1.6rem' }}>
              <AnimatePresence mode="wait">
                <motion.p
                  key={phase === 'active' ? currentZone.label : (result ? catchLabel(result.quality, result.isPerfect) : '')}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
                  className="font-cinzel font-700 uppercase tracking-[0.18em]"
                  style={{ fontSize: '0.88rem', color: indicatorColor }}
                >
                  {phase === 'active' ? currentZone.label : (result ? catchLabel(result.quality, result.isPerfect) : '')}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* ✦ Perfect zone markers above bar */}
            <div style={{ position: 'relative', height: 20 }}>
              {ZONES.filter(z => z.isPerfect).map((zone, i) => (
                <motion.span
                  key={i}
                  animate={{ opacity: [0.45, 1, 0.45] }}
                  transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.45, ease: 'easeInOut' }}
                  style={{
                    position: 'absolute',
                    left: `${(zone.from + zone.to) / 2}%`,
                    transform: 'translateX(-50%)',
                    fontSize: '0.7rem',
                    color: zone.color,
                    lineHeight: 1,
                    userSelect: 'none',
                  }}
                >
                  ✦
                </motion.span>
              ))}
            </div>

            {/* The bar */}
            <div style={{
              position: 'relative', height: 60,
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14, overflow: 'hidden',
              boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.4)',
            }}>
              {ZONES.map((zone, i) => (
                <div key={i} style={{
                  position: 'absolute', left: `${zone.from}%`, width: `${zone.to - zone.from}%`,
                  top: 0, bottom: 0, background: zone.bg,
                  ...(zone.isPerfect ? { boxShadow: `inset 0 0 10px ${zone.color}60` } : {}),
                }} />
              ))}
              {[14, 18, 82, 86].map(pos => (
                <div key={pos} style={{
                  position: 'absolute', left: `${pos}%`, top: 0, bottom: 0,
                  width: 1, background: 'rgba(255,255,255,0.06)',
                }} />
              ))}
              <div style={{
                position: 'absolute', top: 0, bottom: 0, left: `${position}%`, width: 32,
                transform: 'translateX(-50%)',
                background: `radial-gradient(ellipse at center, ${indicatorColor}25 0%, transparent 70%)`,
                pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute', top: 4, bottom: 4, left: `${position}%`, width: 3,
                transform: 'translateX(-50%)',
                background: indicatorColor,
                boxShadow: `0 0 10px ${indicatorColor}, 0 0 20px ${indicatorColor}60`,
                borderRadius: 2,
              }} />
              <div style={{
                position: 'absolute', top: '50%', left: `${position}%`,
                transform: `translate(-50%, -50%) scaleX(${dirRef.current})`,
                fontSize: '1.3rem', lineHeight: 1, userSelect: 'none',
                filter: phase === 'active' ? `drop-shadow(0 0 4px ${currentZone.color}80)` : 'none',
                transition: 'filter 0.1s',
              }}>🐟</div>
            </div>

            {/* Zone labels below bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
              {(['Weak', 'Great', 'Weak'] as const).map((l, i) => (
                <p key={i} className="font-karla font-600" style={{
                  fontSize: '0.62rem',
                  color: l === 'Weak' ? 'rgba(248,113,113,0.5)' : 'rgba(74,222,128,0.5)',
                }}>
                  {l}
                </p>
              ))}
            </div>

            {/* Result card */}
            <AnimatePresence>
              {phase === 'result' && result && (
                <div style={{ position: 'relative' }}>
                  {result.isPerfect && result.earned > 0 && [...Array(8)].map((_, i) => {
                    const angle = (i / 8) * Math.PI * 2
                    return (
                      <motion.div key={i}
                        initial={{ opacity: 1, x: 0, y: 0, scale: 1.2 }}
                        animate={{ opacity: 0, x: Math.cos(angle) * 55, y: Math.sin(angle) * 55, scale: 0 }}
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
                    transition={result.isPerfect
                      ? { type: 'spring', stiffness: 280, damping: 14 }
                      : { duration: 0.2, ease: [0.32, 0.72, 0, 1] }
                    }
                    className="w-full rounded-2xl text-center"
                    style={{
                      background: `linear-gradient(135deg, ${catchColor(result.quality, result.isPerfect)}12, ${catchColor(result.quality, result.isPerfect)}06)`,
                      border: `1px solid ${catchColor(result.quality, result.isPerfect)}${result.isPerfect ? '50' : '25'}`,
                      padding: '1.25rem 1rem',
                      boxShadow: result.isPerfect ? `0 0 28px ${catchColor(result.quality, result.isPerfect)}20` : 'none',
                    }}
                  >
                    {result.isPerfect && (
                      <motion.p
                        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: 0.08 }}
                        className="font-karla font-700 uppercase tracking-[0.16em] mb-1"
                        style={{ fontSize: '0.72rem', color: catchColor(result.quality, result.isPerfect) }}
                      >
                        ✦ Perfect catch
                      </motion.p>
                    )}
                    <motion.p
                      initial={{ scale: result.isPerfect ? 0.5 : 1, opacity: result.isPerfect ? 0 : 1 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 14, delay: result.isPerfect ? 0.12 : 0 }}
                      className="font-cinzel font-700"
                      style={{ fontSize: '2.4rem', color: result.isPerfect ? catchColor(result.quality, result.isPerfect) : '#f0c040', lineHeight: 1, letterSpacing: '0.02em' }}
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
              <div className="flex flex-col items-center py-1">
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
                >
                  Reel In
                </motion.button>
              </div>
            )}

            {/* Cast again */}
            {phase === 'result' && (
              <div className="flex flex-col items-center py-1">
                {castsLeft > 0 ? (
                  <motion.button
                    onClick={handleCast}
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
                  >
                    Cast Again
                  </motion.button>
                ) : (
                  <p className="font-karla font-600 text-center py-3" style={{ fontSize: '0.82rem', color: '#4a4845' }}>
                    No casts remaining
                  </p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hook upgrade nudge */}
      {hookTier < HOOKS.length - 1 && (
        <p className="font-karla font-600 text-center" style={{ fontSize: '0.7rem', color: '#4a4845' }}>
          <Link href="/marketplace/tackle-shop" style={{ color: '#5a5956', textDecoration: 'underline' }}>
            Upgrade your hook
          </Link>
          {' '}to earn more per cast
        </p>
      )}

    </div>
  )
}
