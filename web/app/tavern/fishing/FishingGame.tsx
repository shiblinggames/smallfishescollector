'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { castLine } from './actions'
import { MAX_CASTS } from './constants'
import { HOOKS } from '@/lib/hooks'

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

// Symmetric layout: Weak | P-Weak | Good | P-Good | Great | P-Good | Good | P-Weak | Weak
// Perfect zones are the tiny high-risk/high-reward strips between colour zones
// P-Weak (quality 20) is highest reward because missing it means landing in Weak
// P-Good (quality 17) is middle reward; missing means Good
const ZONES: ZoneDef[] = [
  { from:  0, to: 14, quality:  3, label: 'Weak',    color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  { from: 14, to: 18, quality: 20, label: 'Perfect!', color: '#fde68a', bg: 'rgba(253,230,138,0.45)', isPerfect: true },
  { from: 18, to: 35, quality:  9, label: 'Good',     color: '#f0c040', bg: 'rgba(240,192,64,0.1)'  },
  { from: 35, to: 39, quality: 17, label: 'Perfect!', color: '#86efac', bg: 'rgba(134,239,172,0.4)', isPerfect: true },
  { from: 39, to: 61, quality: 14, label: 'Great',    color: '#4ade80', bg: 'rgba(74,222,128,0.13)' },
  { from: 61, to: 65, quality: 17, label: 'Perfect!', color: '#86efac', bg: 'rgba(134,239,172,0.4)', isPerfect: true },
  { from: 65, to: 82, quality:  9, label: 'Good',     color: '#f0c040', bg: 'rgba(240,192,64,0.1)'  },
  { from: 82, to: 86, quality: 20, label: 'Perfect!', color: '#fde68a', bg: 'rgba(253,230,138,0.45)', isPerfect: true },
  { from: 86, to: 100, quality: 3, label: 'Weak',     color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
]

function getZone(pos: number): ZoneDef {
  return ZONES.find(z => pos >= z.from && pos < z.to) ?? ZONES[0]
}

function catchLabel(quality: number, isPerfect: boolean): string {
  if (isPerfect && quality === 20) return 'Perfect! ✦'
  if (isPerfect) return 'Perfect!'
  if (quality >= 14) return 'Great catch'
  if (quality >= 9) return 'Good catch'
  return 'Tiny catch'
}

function catchColor(quality: number, isPerfect: boolean): string {
  if (isPerfect && quality === 20) return '#fde68a'
  if (isPerfect) return '#86efac'
  if (quality >= 14) return '#4ade80'
  if (quality >= 9) return '#f0c040'
  return '#f87171'
}

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

  useEffect(() => { phaseRef.current = phase }, [phase])

  useEffect(() => {
    if (phase !== 'active') {
      if (animRef.current) { clearInterval(animRef.current); animRef.current = null }
      return
    }
    animRef.current = setInterval(() => {
      if (phaseRef.current !== 'active') return
      posRef.current += dirRef.current * (speedRef.current / 20) // 50 ms ticks
      if (posRef.current >= 100) {
        posRef.current = 100
        dirRef.current = -1
        speedRef.current = 90 + Math.random() * 60
      } else if (posRef.current <= 0) {
        posRef.current = 0
        dirRef.current = 1
        speedRef.current = 90 + Math.random() * 60
      }
      setPosition(posRef.current)
    }, 50)
    return () => { if (animRef.current) { clearInterval(animRef.current); animRef.current = null } }
  }, [phase])

  function handleCast() {
    if (castsLeft <= 0 || (phase !== 'ready' && phase !== 'result')) return
    posRef.current  = 15 + Math.random() * 70
    dirRef.current  = Math.random() > 0.5 ? 1 : -1
    speedRef.current = 90 + Math.random() * 60
    setPosition(posRef.current)
    setResult(null)
    setPhase('active')
  }

  function handleReelIn() {
    if (phase !== 'active') return

    // Freeze immediately at click position
    phaseRef.current = 'result'
    if (animRef.current) { clearInterval(animRef.current); animRef.current = null }

    const zone = getZone(posRef.current)
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

  const currentZone = getZone(position)

  return (
    <div className="flex flex-col items-center gap-5 max-w-sm mx-auto px-6 py-4">

      {/* Hook + cast counter */}
      <div className="w-full flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: '0.9rem' }}>🪝</span>
          <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: hook.color }}>{hook.name}</p>
        </div>
        <p className="font-karla" style={{ fontSize: '0.68rem', color: castsLeft > 0 ? '#a0a09a' : '#4a4845' }}>
          {castsLeft > 0 ? `${castsLeft} / ${MAX_CASTS} casts left` : 'All done today'}
        </p>
      </div>

      {/* Rod / water visual */}
      <div className="w-full flex flex-col items-center gap-1">
        <div style={{
          width: 2, height: phase === 'ready' ? 32 : 56,
          background: phase === 'ready' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.35)',
          borderRadius: 1, transition: 'height 0.3s ease',
        }} />
        <div style={{ width: '100%', height: 2, background: 'linear-gradient(90deg, rgba(96,165,250,0.1), rgba(96,165,250,0.25), rgba(96,165,250,0.1))', borderRadius: 1 }} />
      </div>

      {/* Quality bar — shown while active or after result */}
      {(phase === 'active' || phase === 'result') && (
        <div className="w-full">

          {/* Live zone label */}
          <p
            className="font-karla font-700 text-center mb-2 uppercase tracking-[0.1em]"
            style={{ fontSize: '0.58rem', color: phase === 'active' ? currentZone.color : (result ? catchColor(result.quality, result.isPerfect) : '#a0a09a'), minHeight: '1em' }}
          >
            {phase === 'active' ? currentZone.label : (result ? catchLabel(result.quality, result.isPerfect) : '')}
          </p>

          <div style={{ position: 'relative', height: 42, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>

            {/* Zone backgrounds */}
            {ZONES.map((zone, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: `${zone.from}%`,
                width: `${zone.to - zone.from}%`,
                top: 0, bottom: 0,
                background: zone.bg,
                ...(zone.isPerfect ? { boxShadow: `inset 0 0 6px ${zone.color}50` } : {}),
              }} />
            ))}

            {/* Moving cursor line */}
            <div style={{
              position: 'absolute',
              top: 0, bottom: 0,
              left: `${position}%`,
              width: 3,
              transform: 'translateX(-50%)',
              background: phase === 'result' && result ? catchColor(result.quality, result.isPerfect) : currentZone.color,
              boxShadow: `0 0 8px ${phase === 'result' && result ? catchColor(result.quality, result.isPerfect) : currentZone.color}`,
              borderRadius: 2,
            }} />

            {/* Fish indicator */}
            <div style={{
              position: 'absolute',
              top: '50%', left: `${position}%`,
              transform: `translate(-50%, -50%) scaleX(${dirRef.current})`,
              fontSize: '1.1rem', lineHeight: 1, userSelect: 'none',
            }}>🐟</div>
          </div>

          {/* Zone labels */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, padding: '0 2px' }}>
            {['Weak','Good','Great','Good','Weak'].map((l, i) => (
              <p key={i} className="font-karla" style={{ fontSize: '0.48rem', color: l === 'Weak' ? '#f87171' : l === 'Good' ? '#f0c040' : '#4ade80' }}>{l}</p>
            ))}
          </div>
        </div>
      )}

      {/* Earned result */}
      {phase === 'result' && result && (
        <div style={{
          width: '100%',
          background: `${catchColor(result.quality, result.isPerfect)}0d`,
          border: `1px solid ${catchColor(result.quality, result.isPerfect)}30`,
          borderRadius: 12, padding: '1rem', textAlign: 'center',
        }}>
          <p className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: '#f0c040', lineHeight: 1 }}>
            {result.earned > 0 ? `+${result.earned} ⟡` : '…'}
          </p>
        </div>
      )}

      {/* Cast button */}
      {phase === 'ready' && castsLeft > 0 && (
        <button onClick={handleCast} className="w-full font-karla font-700 uppercase tracking-[0.12em]"
          style={{ padding: '0.875rem', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 12, cursor: 'pointer', fontSize: '0.72rem', color: '#60a5fa' }}>
          Cast Line
        </button>
      )}

      {/* Reel In — onPointerDown fires immediately on touch (no 300ms tap delay) */}
      {phase === 'active' && (
        <button
          onPointerDown={e => { e.preventDefault(); handleReelIn() }}
          className="w-full font-karla font-700 uppercase tracking-[0.12em]"
          style={{ padding: '0.875rem', background: `${currentZone.color}15`, border: `1px solid ${currentZone.color}45`, borderRadius: 12, cursor: 'pointer', fontSize: '0.72rem', color: currentZone.color, transition: 'background 0.05s, border-color 0.05s, color 0.05s', touchAction: 'manipulation' }}>
          Reel In!
        </button>
      )}

      {/* Next cast / done */}
      {phase === 'result' && (
        <button onClick={castsLeft > 0 ? handleCast : undefined} className="w-full font-karla font-700 uppercase tracking-[0.12em]"
          style={{ padding: '0.875rem', background: castsLeft > 0 ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${castsLeft > 0 ? 'rgba(96,165,250,0.25)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, cursor: castsLeft > 0 ? 'pointer' : 'default', fontSize: '0.72rem', color: castsLeft > 0 ? '#60a5fa' : '#4a4845' }}>
          {castsLeft > 0 ? 'Cast Again' : 'No casts remaining'}
        </button>
      )}

      {phase === 'ready' && castsLeft <= 0 && (
        <p className="font-karla text-center" style={{ fontSize: '0.78rem', color: '#4a4845', padding: '1rem 0' }}>
          All casts used today. Come back tomorrow.
        </p>
      )}

      {hookTier < HOOKS.length - 1 && (
        <p className="font-karla text-center" style={{ fontSize: '0.62rem', color: '#4a4845' }}>
          Upgrade your hook at the{' '}
          <a href="/marketplace/tackle-shop" style={{ color: '#6a6764', textDecoration: 'underline' }}>Tackle Shop</a>
          {' '}to earn more per cast
        </p>
      )}

    </div>
  )
}
