'use client'

import { useState, useEffect, useTransition, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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

// Section accents so the two boards read as visually distinct regions.
const SECTION_RECRUIT = '#c9a24a' // warm gold "new arrivals"
const SECTION_ROSTER = '#6fa8c9'  // cool steel "your manifest"

// Panel tones: warm brown wood for the board, cool slate for your own crew, so
// the two are obviously different at a glance.
const RECRUIT_PANEL_BG = 'linear-gradient(157deg, #271d12 0%, #150e08 100%)'
const RECRUIT_PANEL_BORDER = '#46341f'
const ROSTER_PANEL_BG = 'linear-gradient(157deg, #1a2331 0%, #0a0f16 100%)'
const ROSTER_PANEL_BORDER = '#324453'

// Shared action-button look: gradient fill, soft shadow, uppercase label.
const BTN_BASE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%',
  padding: '0.6rem 0.7rem', borderRadius: 9, fontSize: '0.84rem',
  letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer',
  boxShadow: '0 2px 7px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)',
  transition: 'filter 0.15s',
}
const BTN_RECRUIT: React.CSSProperties = {
  ...BTN_BASE,
  background: 'linear-gradient(180deg, rgba(74,200,130,0.36) 0%, rgba(46,140,92,0.2) 100%)',
  border: '1px solid rgba(122,226,162,0.6)', color: '#dcf8e7', textShadow: '0 1px 2px rgba(0,0,0,0.5)',
}
const BTN_DISMISS: React.CSSProperties = {
  ...BTN_BASE,
  background: 'linear-gradient(180deg, rgba(212,84,84,0.3) 0%, rgba(150,46,46,0.16) 100%)',
  border: '1px solid rgba(228,114,114,0.55)', color: '#f8d2d2', textShadow: '0 1px 2px rgba(0,0,0,0.5)',
}
const BTN_NEUTRAL: React.CSSProperties = {
  ...BTN_BASE,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.035) 100%)',
  border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.78)',
}
const BTN_STATIC: React.CSSProperties = { ...BTN_BASE, cursor: 'default', boxShadow: 'none' }

function AnchorIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2.5" /><line x1="12" y1="22" x2="12" y2="7.5" /><path d="M5 12H2a10 10 0 0 0 20 0h-3" /></svg>)
}
function XIcon() {
  return (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>)
}
function CheckIcon() {
  return (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>)
}
function RefreshIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>)
}

// Compact round action buttons (inline with the stats, no dedicated row).
const ROUND_BTN: React.CSSProperties = {
  width: 34, height: 34, borderRadius: '50%', flexShrink: 0, padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  boxShadow: '0 2px 5px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.14)', transition: 'filter 0.15s',
}
const ROUND_RECRUIT: React.CSSProperties = { ...ROUND_BTN, background: 'linear-gradient(180deg, rgba(74,200,130,0.4), rgba(46,140,92,0.24))', border: '1px solid rgba(122,226,162,0.65)', color: '#dcf8e7' }
const ROUND_DISMISS: React.CSSProperties = { ...ROUND_BTN, background: 'linear-gradient(180deg, rgba(212,84,84,0.34), rgba(150,46,46,0.2))', border: '1px solid rgba(228,114,114,0.6)', color: '#f8d2d2' }
const ROUND_CONFIRM: React.CSSProperties = { ...ROUND_BTN, width: 30, height: 30, background: 'linear-gradient(180deg, rgba(74,200,130,0.46), rgba(46,140,92,0.28))', border: '1px solid rgba(122,226,162,0.72)', color: '#dcf8e7' }
const ROUND_CANCEL: React.CSSProperties = { ...ROUND_BTN, width: 30, height: 30, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.22)', color: 'rgba(255,255,255,0.7)' }
const ROUND_STATIC: React.CSSProperties = { ...ROUND_BTN, cursor: 'default', boxShadow: 'none' }

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

// Small engraved stat glyphs (sword / shield / sparkle) so the line reads as a
// recruitment manifest, not a stat-block card.
function StatIcon({ k, color }: { k: 'power' | 'dodge' | 'fortune'; color: string }) {
  const common = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (k === 'power') return (<svg {...common}><path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6" /><path d="m16 16 4 4" /><path d="m19 21 2-2" /></svg>)
  if (k === 'dodge') return (<svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>)
  return (<svg {...common}><path d="m12 3-1.9 5.8-5.8 1.9 5.8 1.9L12 18l1.9-5.8 5.8-1.9-5.8-1.9z" /></svg>)
}

// A single recruit/roster entry, styled like a Darkest Dungeon stagecoach
// manifest line: arched portrait in a carved frame, name + class + quirks
// laid out beside it on aged wood.
function CrewPanel({
  name, filename, rarity, base, effects, dimmed, frameAccent = '#b08d4f',
  bg = RECRUIT_PANEL_BG, border = RECRUIT_PANEL_BORDER, onClick, children,
}: {
  name: string
  filename: string
  rarity: number
  base: { power: number; dodge: number; fortune: number }
  effects: string[]
  dimmed?: boolean
  frameAccent?: string
  bg?: string
  border?: string
  onClick?: () => void
  children?: ReactNode
}) {
  const color = RARITY_COLORS[(rarity as CrewRarity)] ?? '#8a857c'
  const eff = applyCrewEffects(base, effects)

  const corner = (pos: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute', width: 9, height: 9, opacity: 0.6, pointerEvents: 'none', ...pos,
  })
  const b = `1.5px solid ${frameAccent}`

  return (
    <div onClick={onClick} style={{
      position: 'relative', display: 'flex', gap: '0.7rem', padding: '0.7rem',
      borderRadius: 7,
      background: bg,
      border: `1px solid ${border}`,
      boxShadow: `inset 0 0 0 1px ${frameAccent}22, inset 0 1px 0 rgba(255,255,255,0.05), 0 6px 16px rgba(0,0,0,0.55)`,
      opacity: dimmed ? 0.5 : 1,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'opacity 0.2s',
    }}>
      {/* Carved corner brackets */}
      <span style={corner({ top: 4, left: 4, borderTop: b, borderLeft: b })} />
      <span style={corner({ top: 4, right: 4, borderTop: b, borderRight: b })} />
      <span style={corner({ bottom: 4, left: 4, borderBottom: b, borderLeft: b })} />
      <span style={corner({ bottom: 4, right: 4, borderBottom: b, borderRight: b })} />

      {/* Arched portrait niche */}
      <div style={{
        position: 'relative', width: 102, flexShrink: 0, alignSelf: 'flex-start', height: 112,
        borderRadius: '46px 46px 5px 5px', overflow: 'hidden',
        border: `2px solid ${color}`,
        boxShadow: `inset 0 -12px 20px rgba(0,0,0,0.65), 0 0 10px ${color}33`,
        background: `radial-gradient(ellipse at 50% 30%, ${color}26 0%, #070504 74%)`,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artSrc(filename)} alt={name} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'contain', objectPosition: 'center 20%', padding: 2,
        }} />
        {/* inner frame line */}
        <div style={{ position: 'absolute', inset: 3, borderRadius: '44px 44px 4px 4px', border: '1px solid rgba(255,225,170,0.18)', pointerEvents: 'none' }} />
        {/* rarity nameplate */}
        <div className="font-karla font-700" style={{
          position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)',
          fontSize: '0.46rem', letterSpacing: '0.1em', textTransform: 'uppercase',
          color, background: 'rgba(7,5,3,0.82)', border: `1px solid ${color}aa`,
          padding: '0.1rem 0.4rem', borderRadius: 3, whiteSpace: 'nowrap',
        }}>
          {RARITY_NAMES[(rarity as CrewRarity)] ?? 'Common'}
        </div>
      </div>

      {/* Manifest detail */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        <div>
          <p className="font-pirata" style={{ fontSize: '1.18rem', color: '#ecdcbd', lineHeight: 1, letterSpacing: '0.02em' }}>
            {name}
          </p>
          <p className="font-cinzel font-700" style={{ fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color, marginTop: 3, textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
            {RARITY_NAMES[(rarity as CrewRarity)] ?? 'Common'} Crew
          </p>
        </div>

        {/* Engraved stats + inline round action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.15rem 0' }}>
          {(['power', 'dodge', 'fortune'] as const).map(k => (
            <div key={k} title={STAT_LABEL[k]} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <StatIcon k={k} color={STAT_COLOR[k]} />
              <span className="font-cinzel font-700" style={{ fontSize: '0.98rem', lineHeight: 1, color: '#ecdcbd' }}>
                {eff[k]}
              </span>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>{children}</div>
        </div>

        {/* Footer: trait count + tap-for-details hint */}
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingTop: '0.3rem' }}>
          <span className="font-karla font-600" style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.42)' }}>
            {effects.length > 0 ? `${effects.length} trait${effects.length === 1 ? '' : 's'}` : 'No traits'}
          </span>
          <span className="font-karla font-700" style={{ fontSize: '0.64rem', color: frameAccent }}>Details ›</span>
        </div>
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
  const [detail, setDetail] = useState<{ kind: 'board' | 'roster'; item: BoardCandidate | CrewMember } | null>(null)

  const rosterFull = state.roster.length >= state.capacity

  function run(action: () => Promise<CrewActionResult>, id: number | 'reroll', onDone?: () => void) {
    setErr(null)
    setBusyId(id)
    startTransition(async () => {
      const res = await action()
      if ('error' in res) setErr(res.error)
      else setState(res.state)
      setBusyId(null)
      setConfirmDismiss(null)
      onDone?.()
    })
  }

  // Recruit / Dismiss action. `round` = compact icon button for the card stats
  // row; otherwise a full labelled button for the detail modal.
  function renderAction(kind: 'board' | 'roster', item: BoardCandidate | CrewMember, opts?: { onDone?: () => void; round?: boolean }) {
    const onDone = opts?.onDone
    const round = opts?.round

    if (kind === 'board') {
      const c = item as BoardCandidate
      const recruit = (e: React.MouseEvent) => { e.stopPropagation(); run(() => recruitCrew(c.id), c.id, onDone) }
      if (round) {
        if (c.recruited) return <div title="Recruited" style={{ ...ROUND_STATIC, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.5)' }}><CheckIcon /></div>
        if (rosterFull) return <div title="Roster full" style={{ ...ROUND_STATIC, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.3)' }}><AnchorIcon /></div>
        return <button title="Recruit" onClick={recruit} disabled={pending} style={{ ...ROUND_RECRUIT, opacity: pending && busyId === c.id ? 0.6 : 1, cursor: pending ? 'not-allowed' : 'pointer' }}><AnchorIcon /></button>
      }
      if (c.recruited) return <div className="font-karla font-700" style={{ ...BTN_STATIC, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.55)' }}>Recruited ✓</div>
      if (rosterFull) return <div className="font-karla font-700" style={{ ...BTN_STATIC, background: 'rgba(220,90,90,0.1)', border: '1px solid rgba(220,90,90,0.35)', color: '#f2b0b0' }}>Roster Full</div>
      return (
        <button onClick={recruit} disabled={pending} className="font-karla font-700" style={{ ...BTN_RECRUIT, cursor: pending ? 'not-allowed' : 'pointer', opacity: pending && busyId === c.id ? 0.6 : 1 }}>
          <AnchorIcon /><span>{busyId === c.id ? 'Recruiting…' : 'Recruit'}</span>
        </button>
      )
    }

    const m = item as CrewMember
    const arm = (e: React.MouseEvent) => { e.stopPropagation(); setConfirmDismiss(m.id) }
    const confirm = (e: React.MouseEvent) => { e.stopPropagation(); run(() => dismissCrew(m.id), m.id, onDone) }
    const cancel = (e: React.MouseEvent) => { e.stopPropagation(); setConfirmDismiss(null) }
    const armed = confirmDismiss === m.id

    if (round) {
      if (armed) {
        return (
          <div className="flex" style={{ gap: 5 }}>
            <button title="Confirm dismiss" onClick={confirm} disabled={pending} style={ROUND_CONFIRM}><CheckIcon /></button>
            <button title="Cancel" onClick={cancel} disabled={pending} style={ROUND_CANCEL}><XIcon /></button>
          </div>
        )
      }
      return <button title="Dismiss" onClick={arm} disabled={pending} style={ROUND_DISMISS}><XIcon /></button>
    }

    if (armed) {
      return (
        <div className="flex gap-1.5">
          <button onClick={confirm} disabled={pending} className="font-karla font-700" style={{ ...BTN_DISMISS, flex: 1, padding: '0.55rem' }}>{busyId === m.id ? '…' : 'Confirm'}</button>
          <button onClick={cancel} disabled={pending} className="font-karla font-700" style={{ ...BTN_NEUTRAL, flex: 1, padding: '0.55rem' }}>Cancel</button>
        </div>
      )
    }
    return (
      <button onClick={arm} disabled={pending} className="font-karla font-700" style={BTN_DISMISS}>
        <XIcon /><span>Dismiss</span>
      </button>
    )
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
            <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
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

        {/* Recruit board — warm gold "new arrivals" region */}
        <div style={{ borderRadius: 12, border: `1px solid ${SECTION_RECRUIT}33`, background: `linear-gradient(180deg, ${SECTION_RECRUIT}12 0%, rgba(0,0,0,0) 55%)`, padding: '0.85rem 0.85rem 1rem', marginBottom: '1.4rem' }}>
          <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: '0.85rem' }}>
            <div className="flex items-center gap-2.5">
              <span style={{ width: 4, alignSelf: 'stretch', minHeight: 30, borderRadius: 2, background: SECTION_RECRUIT }} />
              <div>
                <h2 className="font-cinzel font-700 uppercase" style={{ fontSize: '1rem', letterSpacing: '0.08em', color: SECTION_RECRUIT }}>Recruit Board</h2>
                <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.58)', marginTop: 1 }}>
                  Free board refreshes in <FreeRollCountdown /> · {state.isPremium ? '3 daily (member)' : '2 daily'}
                </p>
              </div>
            </div>
            <button
              onClick={() => run(() => rerollBoard(), 'reroll')}
              disabled={pending || state.gems < state.rerollCost}
              title="Spend gems for 3 brand-new recruits"
              className="font-karla font-700"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '0.5rem 0.9rem', borderRadius: 999,
                fontSize: '0.8rem', letterSpacing: '0.02em',
                background: 'linear-gradient(180deg, #2c3a58 0%, #1a2336 100%)',
                border: '1px solid rgba(126,164,232,0.5)', color: '#dbe7ff',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
                cursor: pending || state.gems < state.rerollCost ? 'not-allowed' : 'pointer',
                opacity: pending || state.gems < state.rerollCost ? 0.5 : 1,
              }}
            >
              <RefreshIcon />
              <span>{busyId === 'reroll' ? 'Rerolling…' : 'Reroll'}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(0,0,0,0.32)', borderRadius: 999, padding: '0.12rem 0.5rem', fontSize: '0.72rem', color: '#cfe0ff' }}>💎 {state.rerollCost}</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.8rem' }}>
            {state.board.map((c: BoardCandidate) => (
              <CrewPanel key={c.id} name={c.name} filename={c.filename} rarity={c.rarity} frameAccent={SECTION_RECRUIT}
                base={{ power: c.power, dodge: c.dodge, fortune: c.fortune }} effects={c.effects} dimmed={c.recruited}
                onClick={() => setDetail({ kind: 'board', item: c })}>
                {renderAction('board', c, { round: true })}
              </CrewPanel>
            ))}
            {state.board.length === 0 && (
              <p className="font-karla" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>No recruits on the board.</p>
            )}
          </div>
        </div>

        {/* Roster — cool steel "your manifest" region */}
        <div style={{ borderRadius: 12, border: `1px solid ${SECTION_ROSTER}33`, background: `linear-gradient(180deg, ${SECTION_ROSTER}12 0%, rgba(0,0,0,0) 55%)`, padding: '0.85rem 0.85rem 1rem' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: '0.85rem' }}>
            <div className="flex items-center gap-2.5">
              <span style={{ width: 4, alignSelf: 'stretch', minHeight: 30, borderRadius: 2, background: SECTION_ROSTER }} />
              <div>
                <h2 className="font-cinzel font-700 uppercase" style={{ fontSize: '1rem', letterSpacing: '0.08em', color: SECTION_ROSTER }}>Your Crew</h2>
                <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.58)', marginTop: 1 }}>Hands enlisted to your ship</p>
              </div>
            </div>
            <span className="font-karla font-600" style={{ fontSize: '0.76rem', color: rosterFull ? '#f08a8a' : 'rgba(255,255,255,0.6)' }}>
              {state.roster.length} / {state.capacity} · +1 every 10 Nav levels
            </span>
          </div>

          {state.roster.length === 0 ? (
            <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', padding: '1rem 0' }}>
              No crew yet. Recruit from the board above.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.8rem' }}>
              {state.roster.map((m: CrewMember) => (
                <CrewPanel key={m.id} name={m.name} filename={m.filename} rarity={m.rarity} frameAccent={SECTION_ROSTER}
                  bg={ROSTER_PANEL_BG} border={ROSTER_PANEL_BORDER}
                  base={{ power: m.power, dodge: m.dodge, fortune: m.fortune }} effects={m.effects}
                  onClick={() => setDetail({ kind: 'roster', item: m })}>
                  {renderAction('roster', m, { round: true })}
                </CrewPanel>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail modal — full stat breakdown + traits, opened by tapping a card */}
      <AnimatePresence>
        {detail && (() => {
          const it = detail.item
          const dColor = RARITY_COLORS[(it.rarity as CrewRarity)] ?? '#8a857c'
          const dBase = { power: it.power, dodge: it.dodge, fortune: it.fortune }
          const dEff = applyCrewEffects(dBase, it.effects)
          const dResolved = resolveEffects(it.effects)
          const close = () => { setConfirmDismiss(null); setDetail(null) }
          return (
            <motion.div key="crew-detail-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
              onClick={close}
              style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,2,5,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}>
              <motion.div key="crew-detail" initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }} transition={{ duration: 0.18, ease: 'easeOut' }}
                onClick={e => e.stopPropagation()}
                style={{
                  width: '100%', maxWidth: 360, maxHeight: '85vh', overflowY: 'auto', borderRadius: 14,
                  background: detail.kind === 'board' ? RECRUIT_PANEL_BG : ROSTER_PANEL_BG,
                  border: `1.5px solid ${dColor}`, boxShadow: `0 20px 50px rgba(0,0,0,0.6), 0 0 24px ${dColor}33`,
                  padding: '1rem 1.1rem 1.1rem',
                }}>
                <div className="flex justify-end" style={{ marginBottom: '-0.4rem' }}>
                  <button onClick={close} aria-label="Close" style={{ color: 'rgba(255,255,255,0.45)', fontSize: '1.2rem', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.3rem' }}>✕</button>
                </div>

                {/* Portrait */}
                <div style={{ position: 'relative', width: 150, height: 158, margin: '0 auto', borderRadius: '70px 70px 6px 6px', overflow: 'hidden', border: `2px solid ${dColor}`, boxShadow: `inset 0 -14px 24px rgba(0,0,0,0.65), 0 0 14px ${dColor}33`, background: `radial-gradient(ellipse at 50% 30%, ${dColor}26 0%, #070504 74%)` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={artSrc(it.filename)} alt={it.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center 20%', padding: 4 }} />
                </div>
                <p className="font-pirata" style={{ textAlign: 'center', fontSize: '1.7rem', color: '#ecdcbd', lineHeight: 1.05, marginTop: '0.6rem' }}>{it.name}</p>
                <p className="font-cinzel font-700" style={{ textAlign: 'center', fontSize: '0.7rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: dColor }}>{RARITY_NAMES[(it.rarity as CrewRarity)] ?? 'Common'} Crew</p>

                {/* Stats */}
                <div style={{ display: 'flex', gap: 8, margin: '0.9rem 0' }}>
                  {(['power', 'dodge', 'fortune'] as const).map(k => {
                    const ch = dEff[k] - dBase[k]
                    return (
                      <div key={k} style={{ flex: 1, textAlign: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, padding: '0.5rem 0.2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}><StatIcon k={k} color={STAT_COLOR[k]} /></div>
                        <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', lineHeight: 1, color: ch > 0 ? '#7fdfa3' : ch < 0 ? '#f08a8a' : '#ecdcbd' }}>{dEff[k]}</p>
                        <p className="font-karla font-700" style={{ fontSize: '0.52rem', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>{STAT_LABEL[k]}{ch !== 0 ? ` · base ${dBase[k]}` : ''}</p>
                      </div>
                    )
                  })}
                </div>

                {/* Traits */}
                <p className="font-cinzel font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)', marginBottom: '0.45rem' }}>Traits</p>
                {dResolved.length === 0 ? (
                  <p className="font-karla" style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.42)', marginBottom: '0.9rem' }}>No traits.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '0.95rem' }}>
                    {dResolved.map(e => {
                      const buff = e.kind === 'buff'
                      return (
                        <div key={e.id} style={{ background: buff ? 'rgba(60,180,110,0.1)' : 'rgba(200,70,70,0.1)', border: `1px solid ${buff ? 'rgba(80,200,130,0.3)' : 'rgba(220,90,90,0.3)'}`, borderRadius: 8, padding: '0.5rem 0.6rem' }}>
                          <div className="flex items-center justify-between">
                            <span className="font-cinzel font-700" style={{ fontSize: '0.84rem', color: buff ? '#bfe8cf' : '#f0bcbc', fontStyle: 'italic' }}>{e.name}</span>
                            <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: buff ? '#7fdfa3' : '#f08a8a' }}>{modSummary(e)}</span>
                          </div>
                          <p className="font-karla" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>{e.desc}</p>
                        </div>
                      )
                    })}
                  </div>
                )}

                {renderAction(detail.kind, it, { onDone: close })}
              </motion.div>
            </motion.div>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, padding: '0.45rem 0.8rem', textAlign: 'center' }}>
      <p className="font-cinzel font-700" style={{ fontSize: '1rem', lineHeight: 1.1, color: accent ?? '#f0ede8' }}>{value}</p>
      <p className="font-karla font-600 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{label}</p>
    </div>
  )
}
