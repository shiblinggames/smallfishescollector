'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { castLine } from './actions'
import { MAX_CASTS } from './constants'
import { HOOKS } from '@/lib/hooks'

type Phase = 'ready' | 'active' | 'reeling' | 'result'

interface CastResult {
  quality: number
  earned: number
  castsUsed: number
}

function qualityLabel(q: number) {
  if (q >= 15) return 'Great catch!'
  if (q >= 8) return 'Good catch'
  return 'Tiny catch'
}

function qualityColor(q: number) {
  if (q >= 15) return '#4ade80'
  if (q >= 8) return '#f0c040'
  return '#f87171'
}

function zoneColor(pos: number) {
  if (pos >= 70) return '#4ade80'
  if (pos >= 35) return '#f0c040'
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
  const [result, setResult] = useState<CastResult | null>(null)
  const [castsUsed, setCastsUsed] = useState(initialCastsUsed)
  const [isPending, startTransition] = useTransition()

  const posRef = useRef(50)
  const dirRef = useRef(1)
  const speedRef = useRef(45)
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const hook = HOOKS[Math.min(hookTier, HOOKS.length - 1)]
  const castsLeft = MAX_CASTS - castsUsed

  useEffect(() => {
    if (phase === 'active' || phase === 'reeling') {
      animRef.current = setInterval(() => {
        posRef.current += dirRef.current * (speedRef.current / 20)
        if (posRef.current >= 100) {
          posRef.current = 100
          dirRef.current = -1
        } else if (posRef.current <= 0) {
          posRef.current = 0
          dirRef.current = 1
        }
        setPosition(posRef.current)
      }, 50)
    } else {
      if (animRef.current) clearInterval(animRef.current)
    }
    return () => {
      if (animRef.current) clearInterval(animRef.current)
    }
  }, [phase])

  function handleCast() {
    if (castsLeft <= 0 || phase !== 'ready') return
    posRef.current = 20 + Math.random() * 60
    dirRef.current = Math.random() > 0.5 ? 1 : -1
    speedRef.current = 30 + Math.random() * 40
    setPosition(posRef.current)
    setResult(null)
    setPhase('active')
  }

  function handleReelIn() {
    if (phase !== 'active' || isPending) return
    setPhase('reeling')
    startTransition(async () => {
      const res = await castLine()
      if ('error' in res) {
        setPhase('ready')
        return
      }
      const targetPos = (res.quality / 20) * 100
      posRef.current = targetPos
      setPosition(targetPos)
      setResult({ quality: res.quality, earned: res.earned, castsUsed: res.castsUsed })
      setCastsUsed(res.castsUsed)
      setPhase('result')
    })
  }

  function handleNext() {
    setPhase('ready')
  }

  const barColor = phase === 'result' && result
    ? qualityColor(result.quality)
    : zoneColor(position)

  return (
    <div className="flex flex-col items-center gap-5 max-w-sm mx-auto px-6 py-4">

      {/* Hook + casts */}
      <div className="w-full flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: '0.9rem' }}>🪝</span>
          <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: hook.color }}>
            {hook.name}
          </p>
        </div>
        <p className="font-karla" style={{ fontSize: '0.68rem', color: castsLeft > 0 ? '#a0a09a' : '#4a4845' }}>
          {castsLeft > 0 ? `${castsLeft} / ${MAX_CASTS} casts left` : 'All done today'}
        </p>
      </div>

      {/* Water surface + rod visual */}
      <div className="w-full flex flex-col items-center gap-1">
        <div style={{
          width: 2,
          height: phase === 'ready' ? 32 : 56,
          background: phase === 'ready' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.35)',
          borderRadius: 1,
          transition: 'height 0.3s ease, background 0.3s ease',
        }} />
        <div style={{
          width: '100%',
          height: 2,
          background: 'linear-gradient(90deg, rgba(96,165,250,0.1), rgba(96,165,250,0.25), rgba(96,165,250,0.1))',
          borderRadius: 1,
        }} />
      </div>

      {/* Quality bar */}
      {(phase === 'active' || phase === 'reeling' || phase === 'result') && (
        <div className="w-full">
          <div style={{
            position: 'relative',
            height: 36,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            {/* Zone backgrounds */}
            <div style={{ position: 'absolute', left: 0, top: 0, width: '35%', height: '100%', background: 'rgba(248,113,113,0.1)' }} />
            <div style={{ position: 'absolute', left: '35%', top: 0, width: '35%', height: '100%', background: 'rgba(240,192,64,0.08)' }} />
            <div style={{ position: 'absolute', left: '70%', top: 0, width: '30%', height: '100%', background: 'rgba(74,222,128,0.1)' }} />

            {/* Glowing cursor */}
            <div style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${position}%`,
              width: 3,
              transform: 'translateX(-50%)',
              background: barColor,
              boxShadow: `0 0 8px ${barColor}`,
              borderRadius: 2,
              transition: phase === 'result' ? 'left 0.5s ease-out, background 0.3s' : 'background 0.1s',
            }} />

            {/* Fish emoji */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: `${position}%`,
              transform: `translate(-50%, -50%) scaleX(${dirRef.current})`,
              fontSize: '1.1rem',
              lineHeight: 1,
              transition: phase === 'result' ? 'left 0.5s ease-out' : 'none',
              userSelect: 'none',
            }}>
              🐟
            </div>
          </div>

          {/* Zone labels */}
          <div className="flex justify-between mt-1 px-1">
            <p className="font-karla" style={{ fontSize: '0.5rem', color: '#f87171' }}>Weak</p>
            <p className="font-karla" style={{ fontSize: '0.5rem', color: '#f0c040' }}>Good</p>
            <p className="font-karla" style={{ fontSize: '0.5rem', color: '#4ade80' }}>Great</p>
          </div>
        </div>
      )}

      {/* Result card */}
      {phase === 'result' && result && (
        <div style={{
          width: '100%',
          background: `${qualityColor(result.quality)}10`,
          border: `1px solid ${qualityColor(result.quality)}30`,
          borderRadius: 12,
          padding: '1rem',
          textAlign: 'center',
        }}>
          <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.55rem', color: qualityColor(result.quality), marginBottom: 4 }}>
            {qualityLabel(result.quality)}
          </p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: '#f0c040', lineHeight: 1 }}>
            +{result.earned} ⟡
          </p>
        </div>
      )}

      {/* Buttons */}
      {phase === 'ready' && castsLeft > 0 && (
        <button
          onClick={handleCast}
          className="w-full font-karla font-700 uppercase tracking-[0.12em]"
          style={{
            padding: '0.875rem',
            background: 'rgba(96,165,250,0.1)',
            border: '1px solid rgba(96,165,250,0.25)',
            borderRadius: 12,
            cursor: 'pointer',
            fontSize: '0.72rem',
            color: '#60a5fa',
          }}
        >
          Cast Line
        </button>
      )}

      {phase === 'active' && (
        <button
          onClick={handleReelIn}
          className="w-full font-karla font-700 uppercase tracking-[0.12em]"
          style={{
            padding: '0.875rem',
            background: `${zoneColor(position)}18`,
            border: `1px solid ${zoneColor(position)}50`,
            borderRadius: 12,
            cursor: 'pointer',
            fontSize: '0.72rem',
            color: zoneColor(position),
            transition: 'background 0.1s, border-color 0.1s, color 0.1s',
          }}
        >
          Reel In!
        </button>
      )}

      {phase === 'reeling' && (
        <button
          disabled
          className="w-full font-karla font-700 uppercase tracking-[0.12em]"
          style={{
            padding: '0.875rem',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            fontSize: '0.72rem',
            color: '#4a4845',
            cursor: 'default',
          }}
        >
          Reeling...
        </button>
      )}

      {phase === 'result' && (
        <button
          onClick={handleNext}
          className="w-full font-karla font-700 uppercase tracking-[0.12em]"
          style={{
            padding: '0.875rem',
            background: castsLeft > 1 ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${castsLeft > 1 ? 'rgba(96,165,250,0.25)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 12,
            cursor: 'pointer',
            fontSize: '0.72rem',
            color: castsLeft > 1 ? '#60a5fa' : '#4a4845',
          }}
        >
          {castsLeft > 1 ? 'Cast Again' : 'No casts remaining'}
        </button>
      )}

      {phase === 'ready' && castsLeft <= 0 && (
        <p className="font-karla text-center" style={{ fontSize: '0.78rem', color: '#4a4845', padding: '1rem 0' }}>
          All casts used today. Come back tomorrow.
        </p>
      )}

      {/* Hook upgrade hint */}
      {hookTier < HOOKS.length - 1 && (
        <p className="font-karla text-center" style={{ fontSize: '0.62rem', color: '#4a4845' }}>
          Upgrade your hook at the{' '}
          <a href="/marketplace/tackle-shop" style={{ color: '#6a6764', textDecoration: 'underline' }}>
            Tackle Shop
          </a>{' '}
          to earn more per cast
        </p>
      )}

    </div>
  )
}
