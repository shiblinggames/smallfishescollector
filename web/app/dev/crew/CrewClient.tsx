'use client'

import { useState, useEffect, useTransition, type ReactNode } from 'react'
import {
  rerollBoard, recruitCrew, dismissCrew,
  type CrewState, type BoardCandidate, type CrewMember, type CrewActionResult,
} from './actions'
import { RARITY_NAMES, RARITY_COLORS, type CrewRarity } from '@/lib/crewGen'
import { resolveEffects, applyCrewEffects, type CrewEffect } from '@/lib/crewEffects'

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const artSrc = (filename: string) => `${SUPA}/storage/v1/object/public/card-arts/${filename}`

const STAT_COLOR = { power: '#f87171', dodge: '#60a5fa', fortune: '#f0c040' }
const STAT_LABEL = { power: 'PWR', dodge: 'DGE', fortune: 'FTN' }

function modSummary(e: CrewEffect): string {
  return (['power', 'dodge', 'fortune'] as const)
    .filter(k => e.mods[k])
    .map(k => `${e.mods[k]! > 0 ? '+' : ''}${e.mods[k]} ${STAT_LABEL[k]}`)
    .join(' · ')
}

// ── Countdown to the next UTC midnight (free board refresh) ──────────────────
function FreeRollCountdown() {
  const [label, setLabel] = useState('')
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
      const ms = next.getTime() - now.getTime()
      const h = Math.floor(ms / 3_600_000)
      const m = Math.floor((ms % 3_600_000) / 60_000)
      setLabel(`${h}h ${m}m`)
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])
  return <>{label}</>
}

// ── A single crew portrait panel (recruit candidate or roster member) ────────
function CrewPanel({
  name, filename, rarity, base, effects, dimmed, children,
}: {
  name: string
  filename: string
  rarity: number
  base: { power: number; dodge: number; fortune: number }
  effects: string[]
  dimmed?: boolean
  children?: ReactNode
}) {
  const color = RARITY_COLORS[(rarity as CrewRarity)] ?? '#8a857c'
  const eff = applyCrewEffects(base, effects)
  const resolved = resolveEffects(effects)

  return (
    <div style={{
      position: 'relative', borderRadius: 14, overflow: 'hidden',
      background: 'linear-gradient(160deg, #1b1622 0%, #0d0b12 100%)',
      border: `1.5px solid ${color}`,
      boxShadow: `0 6px 18px rgba(0,0,0,0.5), 0 0 16px ${color}33`,
      display: 'flex', flexDirection: 'column',
      opacity: dimmed ? 0.55 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Rarity tag */}
      <div style={{
        position: 'absolute', top: 8, left: 8, zIndex: 3,
        fontSize: '0.5rem', letterSpacing: '0.12em', textTransform: 'uppercase',
        fontWeight: 700, color: '#0b0a0e', background: color,
        padding: '0.15rem 0.45rem', borderRadius: 5,
      }} className="font-karla">
        {RARITY_NAMES[(rarity as CrewRarity)] ?? 'Common'}
      </div>

      {/* Portrait in a reserved box */}
      <div style={{
        position: 'relative', width: '100%', height: 150,
        background: `radial-gradient(ellipse at 50% 35%, ${color}22 0%, #07060a 72%)`,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artSrc(filename)} alt={name} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'contain', objectPosition: 'center',
        }} />
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%',
          background: 'linear-gradient(to top, #0d0b12 0%, transparent 100%)',
        }} />
      </div>

      {/* Body */}
      <div style={{ padding: '0.45rem 0.7rem 0.7rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <p className="font-pirata" style={{ fontSize: '1.05rem', color: '#f0ede8', lineHeight: 1.05, letterSpacing: '0.02em' }}>
          {name}
        </p>

        {/* Effective stats (base + effects) */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['power', 'dodge', 'fortune'] as const).map(k => {
            const changed = eff[k] - base[k]
            return (
              <div key={k} style={{
                flex: 1, textAlign: 'center', background: 'rgba(0,0,0,0.35)',
                border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, padding: '0.3rem 0.1rem',
              }}>
                <p className="font-karla font-700" style={{ fontSize: '0.46rem', letterSpacing: '0.08em', color: STAT_COLOR[k] }}>
                  {STAT_LABEL[k]}
                </p>
                <p className="font-cinzel font-700" style={{
                  fontSize: '0.95rem', lineHeight: 1.1,
                  color: changed > 0 ? '#5fd38a' : changed < 0 ? '#f08a8a' : '#f0ede8',
                }}>
                  {eff[k]}
                </p>
              </div>
            )
          })}
        </div>

        {/* Effects / traits */}
        {resolved.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {resolved.map(e => {
              const buff = e.kind === 'buff'
              return (
                <div key={e.id} title={e.desc} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6,
                  background: buff ? 'rgba(60,180,110,0.12)' : 'rgba(200,70,70,0.12)',
                  border: `1px solid ${buff ? 'rgba(80,200,130,0.35)' : 'rgba(220,90,90,0.35)'}`,
                  borderRadius: 6, padding: '0.18rem 0.4rem',
                }}>
                  <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: buff ? '#9fe6bd' : '#f2b0b0' }}>
                    {e.name}
                  </span>
                  <span className="font-karla font-600" style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap' }}>
                    {modSummary(e)}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {children}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CrewClient({ initial }: { initial: CrewState }) {
  const [state, setState] = useState<CrewState>(initial)
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<number | 'reroll' | null>(null)
  const [confirmDismiss, setConfirmDismiss] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const rosterFull = state.roster.length >= state.capacity

  function run(action: () => Promise<CrewActionResult>, id: number | 'reroll') {
    setErr(null)
    setBusyId(id)
    startTransition(async () => {
      const res = await action()
      if ('error' in res) setErr(res.error)
      else setState(res.state)
      setBusyId(null)
      setConfirmDismiss(null)
    })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#07060a', color: '#f0ede8', padding: '1.25rem 1rem 4rem' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3" style={{ marginBottom: '1.25rem' }}>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-pirata" style={{ fontSize: '1.7rem', letterSpacing: '0.03em' }}>Crew Hall</h1>
              <span className="font-karla font-700" style={{ fontSize: '0.5rem', letterSpacing: '0.14em', color: '#0b0a0e', background: '#c084fc', padding: '0.15rem 0.4rem', borderRadius: 4 }}>TEST</span>
            </div>
            <p className="font-karla" style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.5)' }}>
              Recruit crew daily, reroll the board with gems, build your roster.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Stat label="Gems" value={`💎 ${state.gems.toLocaleString()}`} />
            <Stat label="Nav Level" value={String(state.navLevel)} />
            <Stat label="Roster" value={`${state.roster.length} / ${state.capacity}`} accent={rosterFull ? '#f08a8a' : '#5fd38a'} />
          </div>
        </div>

        {err && (
          <div className="font-karla font-600" style={{ fontSize: '0.74rem', color: '#f2b0b0', background: 'rgba(200,70,70,0.12)', border: '1px solid rgba(220,90,90,0.3)', borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: '1rem' }}>
            {err}
          </div>
        )}

        {/* Recruit board */}
        <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: '0.7rem' }}>
          <div>
            <h2 className="font-cinzel font-700 uppercase" style={{ fontSize: '0.9rem', letterSpacing: '0.08em' }}>Recruit Board</h2>
            <p className="font-karla" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)' }}>
              Free board refreshes in <FreeRollCountdown /> · {state.isPremium ? '3 daily (member)' : '2 daily'}
            </p>
          </div>
          <button
            onClick={() => run(() => rerollBoard(), 'reroll')}
            disabled={pending || state.gems < state.rerollCost}
            className="font-karla font-700"
            style={{
              fontSize: '0.72rem', padding: '0.55rem 0.9rem', borderRadius: 9,
              background: 'rgba(96,165,250,0.16)', border: '1px solid rgba(96,165,250,0.5)', color: '#cfe2ff',
              cursor: pending || state.gems < state.rerollCost ? 'not-allowed' : 'pointer',
              opacity: pending || state.gems < state.rerollCost ? 0.5 : 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2,
            }}
          >
            <span>{busyId === 'reroll' ? 'Rerolling…' : `Reroll · 💎 ${state.rerollCost}`}</span>
            <span style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Always 3 new crew</span>
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.8rem', marginBottom: '2rem' }}>
          {state.board.map((c: BoardCandidate) => (
            <CrewPanel key={c.id} name={c.name} filename={c.filename} rarity={c.rarity}
              base={{ power: c.power, dodge: c.dodge, fortune: c.fortune }} effects={c.effects} dimmed={c.recruited}>
              {c.recruited ? (
                <div className="font-karla font-700" style={{ textAlign: 'center', fontSize: '0.66rem', color: 'rgba(255,255,255,0.45)', padding: '0.45rem', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8 }}>
                  Recruited ✓
                </div>
              ) : rosterFull ? (
                <div className="font-karla font-700" style={{ textAlign: 'center', fontSize: '0.66rem', color: '#f2b0b0', padding: '0.45rem', border: '1px solid rgba(220,90,90,0.3)', borderRadius: 8 }}>
                  Roster Full
                </div>
              ) : (
                <button onClick={() => run(() => recruitCrew(c.id), c.id)} disabled={pending}
                  className="font-karla font-700"
                  style={{
                    fontSize: '0.72rem', padding: '0.5rem', borderRadius: 8,
                    background: 'rgba(80,200,130,0.16)', border: '1px solid rgba(80,200,130,0.5)', color: '#9fe6bd',
                    cursor: pending ? 'not-allowed' : 'pointer', opacity: pending && busyId === c.id ? 0.6 : 1,
                  }}>
                  {busyId === c.id ? 'Recruiting…' : 'Recruit'}
                </button>
              )}
            </CrewPanel>
          ))}
          {state.board.length === 0 && (
            <p className="font-karla" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>No recruits on the board.</p>
          )}
        </div>

        {/* Roster */}
        <div className="flex items-center justify-between" style={{ marginBottom: '0.7rem' }}>
          <h2 className="font-cinzel font-700 uppercase" style={{ fontSize: '0.9rem', letterSpacing: '0.08em' }}>Your Crew</h2>
          <span className="font-karla font-600" style={{ fontSize: '0.66rem', color: rosterFull ? '#f08a8a' : 'rgba(255,255,255,0.5)' }}>
            {state.roster.length} / {state.capacity} · +1 every 10 Nav levels
          </span>
        </div>

        {state.roster.length === 0 ? (
          <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', padding: '1.5rem 0' }}>
            No crew yet. Recruit from the board above.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.8rem' }}>
            {state.roster.map((m: CrewMember) => (
              <CrewPanel key={m.id} name={m.name} filename={m.filename} rarity={m.rarity}
                base={{ power: m.power, dodge: m.dodge, fortune: m.fortune }} effects={m.effects}>
                {confirmDismiss === m.id ? (
                  <div className="flex gap-1.5">
                    <button onClick={() => run(() => dismissCrew(m.id), m.id)} disabled={pending}
                      className="font-karla font-700" style={{ flex: 1, fontSize: '0.66rem', padding: '0.45rem', borderRadius: 8, background: 'rgba(220,90,90,0.2)', border: '1px solid rgba(220,90,90,0.55)', color: '#f2b0b0', cursor: 'pointer' }}>
                      {busyId === m.id ? '…' : 'Confirm'}
                    </button>
                    <button onClick={() => setConfirmDismiss(null)} disabled={pending}
                      className="font-karla font-700" style={{ flex: 1, fontSize: '0.66rem', padding: '0.45rem', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.65)', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDismiss(m.id)} disabled={pending}
                    className="font-karla font-700"
                    style={{ fontSize: '0.68rem', padding: '0.45rem', borderRadius: 8, background: 'rgba(200,70,70,0.1)', border: '1px solid rgba(220,90,90,0.3)', color: '#f2b0b0', cursor: 'pointer' }}>
                    Dismiss
                  </button>
                )}
              </CrewPanel>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, padding: '0.4rem 0.7rem', textAlign: 'center' }}>
      <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', lineHeight: 1.1, color: accent ?? '#f0ede8' }}>{value}</p>
      <p className="font-karla font-600 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{label}</p>
    </div>
  )
}
