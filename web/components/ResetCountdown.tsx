'use client'

import { useEffect, useState } from 'react'

// Live "resets in HH:MM:SS" ticker. Daily rewards reset at UTC midnight; the
// weekly crate resets at the next Monday 00:00 UTC (matches kingWeekStr and the
// `new Date().toISOString().slice(0,10)` date-key convention used server-side).
// Renders nothing until mounted so SSR/client Date.now() can't mismatch.

function nextUtcMidnight(now: number): number {
  const d = new Date(now)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0)
}

function nextUtcMonday(now: number): number {
  const d = new Date(now)
  const day = d.getUTCDay()                 // 0=Sun … 6=Sat
  const daysUntilMon = ((8 - day) % 7) || 7 // next Monday, never today
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilMon, 0, 0, 0, 0)
}

function fmtDur(ms: number): string {
  const total = Math.floor(ms / 1000)
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`
}

export default function ResetCountdown({
  kind = 'daily',
  prefix = 'Resets in',
  className,
  style,
}: {
  kind?: 'daily' | 'weekly'
  prefix?: string
  className?: string
  style?: React.CSSProperties
}) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  if (now === null) return null

  const target = kind === 'weekly' ? nextUtcMonday(now) : nextUtcMidnight(now)
  const ms = Math.max(0, target - now)
  return (
    <span className={className} style={style}>
      {prefix ? `${prefix} ` : ''}{fmtDur(ms)}
    </span>
  )
}

// A self-contained status pill (clock + live countdown) for overlaying on a
// card once a daily reward is claimed / a cap is reached. Renders nothing until
// the clock mounts, so there's no empty-pill flash.
export function ResetPill({
  kind = 'daily',
  prefix = 'Resets in',
  accent = '#f0e6c8',
}: {
  kind?: 'daily' | 'weekly'
  prefix?: string
  accent?: string
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null
  return (
    <span
      className="font-karla font-700"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 999, fontSize: '0.52rem', letterSpacing: '0.04em',
        color: accent, background: 'rgba(6,12,20,0.82)', border: '1px solid rgba(255,255,255,0.18)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', whiteSpace: 'nowrap',
      }}
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 1.8" /></svg>
      <ResetCountdown kind={kind} prefix={prefix} />
    </span>
  )
}
