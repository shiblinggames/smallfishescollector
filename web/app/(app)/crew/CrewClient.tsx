'use client'

import { useState, useEffect, useRef, useTransition, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  rerollBoard, recruitCrew, dismissCrew, getCrewGraveyard,
  assignToVoyage, assignToRaid, benchCrew,
  type CrewState, type BoardCandidate, type CrewMember, type CrewActionResult, type FallenCrew,
} from './actions'
import { crewAssignment } from '@/lib/crewAssignment'
import { RARITY_NAMES, RARITY_COLORS, type CrewRarity } from '@/lib/crewGen'
import { resolveEffects, applyCrewEffects, effectSummary, SCOPE_META, CREW_EFFECTS } from '@/lib/crewEffects'
import { useReveal, BoardReveal, RevealFlash, RevealBanner } from './boardReveal'
import { ROUTE_CONFIGS, type VoyageRoute } from '@/lib/voyageRoutes'
import { crewLevelFromXP, crewXPProgress, levelStatBonuses, CREW_MAX_LEVEL } from '@/lib/crewLevel'
import { classForSlug, CLASSES, currentMilestone, nextMilestone, CLASS_UNLOCK_LEVEL, type AnyClassDef } from '@/lib/crewClasses'
import TickingNumber from '@/components/TickingNumber'

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const artSrc = (filename: string) => `${SUPA}/storage/v1/object/public/card-arts/${filename}`

const STAT_COLOR = { power: '#f87171', dodge: '#60a5fa', fortune: '#f0c040' }
const STAT_LABEL = { power: 'PWR', dodge: 'AGI', fortune: 'FTN' }

// Section accents so the two boards read as visually distinct regions.
const SECTION_RECRUIT = '#c9a24a' // warm gold "new arrivals"
const SECTION_ROSTER = '#6fa8c9'  // cool steel "your manifest"

// Panel tones: warm brown wood for the board, cool slate for your own crew, so
// the two are obviously different at a glance.
// Card panels were tinted warm-brown (recruits) and cool-slate (roster) to
// distinguish the two regions, but with class chips, assignment pips, and
// rarity-bordered portraits all carrying color now, the panel tints were
// adding noise without adding signal. Both panels go neutral charcoal so
// the colored elements pop against a calm backdrop. Same gradient shape so
// the card silhouette doesn't change.
const PANEL_BG     = 'linear-gradient(157deg, #1c1c1e 0%, #0d0d0f 100%)'
const PANEL_BORDER = '#2e2e32'
// Aliases kept so existing prop default + detail-modal references compile
// unchanged. Both point at the same neutral now.
const RECRUIT_PANEL_BG = PANEL_BG
const RECRUIT_PANEL_BORDER = PANEL_BORDER
const ROSTER_PANEL_BG = PANEL_BG
const ROSTER_PANEL_BORDER = PANEL_BORDER

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
function ClockIcon() {
  return (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg>)
}

// Compact round action buttons (inline with the stats, no dedicated row).
const ROUND_BTN: React.CSSProperties = {
  width: 34, height: 34, borderRadius: '50%', flexShrink: 0, padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  boxShadow: '0 2px 5px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.14)', transition: 'filter 0.15s',
}
const ROUND_DISMISS: React.CSSProperties = { ...ROUND_BTN, background: 'linear-gradient(180deg, rgba(212,84,84,0.34), rgba(150,46,46,0.2))', border: '1px solid rgba(228,114,114,0.6)', color: '#f8d2d2' }
const ROUND_CONFIRM: React.CSSProperties = { ...ROUND_BTN, width: 30, height: 30, background: 'linear-gradient(180deg, rgba(74,200,130,0.46), rgba(46,140,92,0.28))', border: '1px solid rgba(122,226,162,0.72)', color: '#dcf8e7' }
const ROUND_CANCEL: React.CSSProperties = { ...ROUND_BTN, width: 30, height: 30, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.22)', color: 'rgba(255,255,255,0.7)' }

// Assignment toggle palette — Voyage = teal anchor, Raid = crimson swords,
// Bench = muted slate. Active state fills; inactive is a thin outline so the
// 3-button row reads as a segmented control at a glance.
const ASSIGN_VOYAGE = '#5fa8c9'
const ASSIGN_RAID   = '#e07c7c'
const ASSIGN_BENCH  = '#7a7a7a'

function AssignToggleBtn({
  label, Icon, active, accent, disabled, onClick,
}: {
  label: string
  Icon: React.FC<{ size?: number; color?: string }>
  active: boolean
  accent: string
  disabled: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  const fg = active ? '#0a0a0a' : accent
  return (
    <button
      title={active ? `${label} (current)` : `Assign to ${label}`}
      onClick={onClick}
      disabled={disabled || active}
      style={{
        width: 34, height: 34, borderRadius: '50%', flexShrink: 0, padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: active ? 'default' : 'pointer',
        background: active ? accent : 'rgba(255,255,255,0.04)',
        border: `1.5px solid ${accent}${active ? '' : '88'}`,
        boxShadow: active
          ? `0 2px 8px ${accent}44, inset 0 1px 0 rgba(255,255,255,0.25)`
          : 'inset 0 1px 0 rgba(255,255,255,0.05)',
        transition: 'all 0.18s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon size={15} color={fg} />
    </button>
  )
}

// ── Assignment icons — simple inline SVGs so the badges look like part of
// the UI rather than emoji. Sized to fit the 22-26px corner pips. Anchor
// for Voyage, crossed swords for Raid, horizontal line for Bench.
function AnchorIconSvg({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="5" r="2.2" />
      <line x1="12" y1="22" x2="12" y2="7.2" />
      <path d="M5 12H3a9 9 0 0 0 18 0h-2" />
      <line x1="8" y1="9.5" x2="16" y2="9.5" />
    </svg>
  )
}
function CrossedSwordsIconSvg({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
      <path d="m13 19 6-6" />
      <path d="m16 16 4 4" />
      <path d="m19 21 2-2" />
      <path d="M9.5 17.5 21 6V3h-3L6.5 14.5" />
      <path d="m11 19-6-6" />
      <path d="m8 16-4 4" />
      <path d="m5 21-2-2" />
    </svg>
  )
}
function BenchIconSvg({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" aria-hidden>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
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
  if (k === 'dodge') return (<svg {...common}><path d="M9.59 4.59A2 2 0 1 1 11 8H2" /><path d="M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2" /><path d="M12.59 19.41A2 2 0 1 0 14 16H2" /></svg>)
  return (<svg {...common}><path d="m12 3-1.9 5.8-5.8 1.9 5.8 1.9L12 18l1.9-5.8 5.8-1.9-5.8-1.9z" /></svg>)
}

// A single recruit/roster entry, styled like a Darkest Dungeon stagecoach
// manifest line: arched portrait in a carved frame, name + class + quirks
// laid out beside it on aged wood.
function CrewPanel({
  name, filename, rarity, base, effects, xp = 0, slug = '', assignment, locked = false, dimmed, hint, frameAccent = '#5c5c63',
  bg = RECRUIT_PANEL_BG, border = RECRUIT_PANEL_BORDER, onClick, children,
}: {
  name: string
  filename: string
  rarity: number
  base: { power: number; dodge: number; fortune: number }
  effects: string[]
  xp?: number
  /** Species slug. Drives the class nameplate on the portrait. Optional so
   *  the BoardReveal placeholder cards still compile; passing '' falls back
   *  to the Neutral chip. */
  slug?: string
  /** Where this crew is currently assigned. Drives the prominent banner
   *  overlay across the top of the portrait. Omit on board recruits
   *  (they're pre-assignment). */
  assignment?: 'voyage' | 'raid' | 'bench'
  /** True when this crew is at sea on an in-progress voyage and can't be
   *  reassigned. Greys the card out and disables the toggle buttons. */
  locked?: boolean
  dimmed?: boolean
  hint?: boolean
  frameAccent?: string
  bg?: string
  border?: string
  onClick?: () => void
  children?: ReactNode
}) {
  const color = RARITY_COLORS[(rarity as CrewRarity)] ?? '#8a857c'
  const eff = applyCrewEffects(base, effects, xp)

  const corner = (pos: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute', width: 9, height: 9, opacity: 0.6, pointerEvents: 'none', ...pos,
  })
  const b = `1.5px solid ${frameAccent}`

  // Rarity color now lives ONLY on the portrait niche border so the roster
  // grid reads as calm and uniform; the card root keeps its plain section
  // styling regardless of tier. (Previously the whole card carried a
  // tinted wash + tinted border + outer glow that grew with tier, which
  // made the roster look visually loud once five rarities were on screen.)
  const cardShadow = `inset 0 0 0 1px ${frameAccent}22, inset 0 1px 0 rgba(255,255,255,0.05), 0 6px 16px rgba(0,0,0,0.55)`

  return (
    <motion.div
      onClick={onClick}
      whileTap={onClick && !locked ? { scale: 0.965 } : undefined}
      whileHover={onClick && !locked ? { y: -2 } : undefined}
      transition={{ type: 'spring', stiffness: 460, damping: 26 }}
      style={{
        position: 'relative', display: 'flex', gap: '0.7rem', padding: '0.7rem',
        borderRadius: 7,
        background: bg,
        border: `1px solid ${border}`,
        boxShadow: cardShadow,
        opacity: dimmed ? 0.5 : locked ? 0.55 : 1,
        cursor: onClick ? 'pointer' : 'default',
        filter: locked ? 'grayscale(0.65) brightness(0.85)' : undefined,
      }}>
      {/* "Has traits — tap to view" glow. Uses a neutral gold instead of
          the rarity color so a Rare crew (whose rarity is bright blue)
          doesn't get a blue halo around its whole card. The gold reads as
          "there's something to discover here" — a treasure cue rather
          than a tier signal. Cleared once the card's been opened. */}
      {hint && (
        <div className="crew-trait-hint" aria-hidden style={{
          position: 'absolute', inset: -1, borderRadius: 8, pointerEvents: 'none',
          boxShadow: '0 0 10px 1px rgba(240,192,64,0.55)',
        }} />
      )}
      {/* Carved corner brackets */}
      <span style={corner({ top: 4, left: 4, borderTop: b, borderLeft: b })} />
      <span style={corner({ top: 4, right: 4, borderTop: b, borderRight: b })} />
      <span style={corner({ bottom: 4, left: 4, borderBottom: b, borderLeft: b })} />
      <span style={corner({ bottom: 4, right: 4, borderBottom: b, borderRight: b })} />

      {/* Portrait wrapper — position:relative + overflow:visible so corner
          badges can hang at the top corners without being clipped by the
          arched niche below (which needs overflow:hidden for image
          clipping). Niche keeps its own clip mask; badges sit on top. */}
      <div style={{
        position: 'relative', width: 102, height: 112,
        flexShrink: 0, alignSelf: 'flex-start',
      }}>
        {/* Arched portrait niche */}
        <div style={{
          position: 'absolute', inset: 0,
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
        {/* Class nameplate — replaces the old trait teaser. Class is now the
            bigger identity decision (species-locked, drives the raid Special
            ability), so the portrait reads as the role at a glance: "Mender",
            "Sharpshot", etc. Trait count is still shown on the rarity line
            below as a small counter so trait info isn't lost. Falls back to
            a muted "Crew" chip when the species hasn't been mapped to a
            class yet. */}
        {(() => {
          const cls = classForSlug(slug)
          const def = cls ? CLASSES[cls] : null
          const tint = def?.color ?? 'rgba(150,150,150,0.85)'
          const text = def?.color ?? '#c8c8c8'
          return (
            <div className="font-karla font-700" style={{
              position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)',
              maxWidth: 'calc(100% - 10px)',
              fontSize: '0.5rem', letterSpacing: '0.08em', textTransform: 'uppercase',
              color: text, background: 'rgba(7,5,3,0.88)', border: `1px solid ${tint}`,
              padding: '0.12rem 0.42rem', borderRadius: 3, whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {def && <span aria-hidden style={{ fontSize: '0.55rem', lineHeight: 1 }}>{def.emoji}</span>}
              <span>{def?.name ?? 'Crew'}</span>
            </div>
          )
        })()}
        </div>{/* end arched niche */}

        {/* Status badges sit on the WRAPPER (overflow:visible), so they
            can hang at the top corners without being clipped by the
            niche's arch + overflow:hidden. Tucked just outside the niche
            border so they read as decals attached to the portrait. */}
        {assignment && assignment !== 'bench' && (() => {
          const accent  = assignment === 'voyage' ? ASSIGN_VOYAGE : ASSIGN_RAID
          const label   = assignment === 'voyage' ? 'On Voyage' : 'On Raid'
          const Icon    = assignment === 'voyage' ? AnchorIconSvg : CrossedSwordsIconSvg
          return (
            <div
              title={label}
              aria-label={label}
              style={{
                position: 'absolute', top: -6, right: -6,
                width: 26, height: 26, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `radial-gradient(circle at 35% 30%, ${accent}ff 0%, ${accent}d0 70%)`,
                border: `1.5px solid ${accent}`,
                boxShadow: `0 2px 7px rgba(0,0,0,0.6), 0 0 12px ${accent}66, inset 0 1px 0 rgba(255,255,255,0.3)`,
                pointerEvents: 'none',
                zIndex: 2,
              }}
            >
              <Icon size={14} color="#0a0a0a" />
            </div>
          )
        })()}
        {locked && (
          <div
            title="This crew is currently at sea on a voyage."
            style={{
              position: 'absolute', top: -6, left: -6,
              width: 26, height: 26, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(7,5,3,0.94)',
              border: '1.5px solid rgba(255,180,90,0.7)',
              boxShadow: '0 2px 7px rgba(0,0,0,0.6), 0 0 10px rgba(255,180,90,0.4)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffd8a3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="4.5" y="11" width="15" height="9.5" rx="1.5" />
              <path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11" />
            </svg>
          </div>
        )}
      </div>{/* end portrait wrapper */}

      {/* Manifest detail */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <p className="font-pirata" style={{ fontSize: '1.18rem', color: '#ecdcbd', lineHeight: 1, letterSpacing: '0.02em', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </p>
            {/* Level chip. Always shown so players can scan their roster by
                progression at a glance — a fresh Lv 1 recruit reads as
                clearly as a veteran Lv 47. Gold tone matches the loot
                economy. (CrewPanel is also used for board candidates where
                xp is undefined → defaults to 0 → renders "Lv 1", which is
                accurate since recruits join at Lv 1.) */}
            <span className="font-cinzel font-700" style={{
              flexShrink: 0,
              fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase',
              color: '#f0c040', background: 'rgba(240,192,64,0.12)',
              border: '1px solid rgba(240,192,64,0.42)',
              padding: '0.12rem 0.42rem', borderRadius: 4, lineHeight: 1.2,
            }}>
              Lv {crewLevelFromXP(xp)}
            </span>
          </div>
          <p className="font-cinzel font-700" style={{ fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color, marginTop: 3, textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
            {RARITY_NAMES[(rarity as CrewRarity)] ?? 'Common'}
            {effects.length > 0 && (
              <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 6, letterSpacing: '0.08em' }}>
                · {effects.length} trait{effects.length === 1 ? '' : 's'}
              </span>
            )}
          </p>
        </div>

        {/* Engraved stats — three stat blocks left-aligned. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.15rem 0' }}>
          {(['power', 'dodge', 'fortune'] as const).map(k => (
            <div key={k} title={STAT_LABEL[k]} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <StatIcon k={k} color={STAT_COLOR[k]} />
              <span className="font-cinzel font-700" style={{ fontSize: '0.98rem', lineHeight: 1, color: '#ecdcbd' }}>
                {eff[k]}
              </span>
            </div>
          ))}
        </div>

        {/* Footer: action button on its own row. The old "View N traits"
            link was redundant once the portrait nameplate started teasing
            the headline trait — players now click the whole card naturally,
            and the action gets full breathing room so it can't spill off
            the edge regardless of label length ("Roster Full" / "Aboard"). */}
        {children && (
          <div style={{ marginTop: 'auto', paddingTop: '0.4rem', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>{children}</div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── In Memoriam panel ────────────────────────────────────────────────────────
// Compact sepia-toned memorial card for fallen crew. No actions — these are
// gone. Portrait is desaturated, palette is weathered parchment, name sits
// above a "fell on [route] · [date]" line and trait initials below.

const GRAVE_BG = 'linear-gradient(157deg, #2a221b 0%, #150f0a 100%)'
const GRAVE_BORDER = '#4a3b2a'

const ROUTE_LABEL: Record<string, string> = Object.fromEntries(
  (Object.keys(ROUTE_CONFIGS) as VoyageRoute[]).map(k => [k, ROUTE_CONFIGS[k].name])
)

function formatFallDate(iso: string): string {
  const now = new Date()
  const then = new Date(iso)
  const ms = now.getTime() - then.getTime()
  const day = 86_400_000
  const days = Math.floor(ms / day)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function SkullIcon({ size = 12, color = '#8a7758' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a8 8 0 0 0-8 8v3l-1 3 1 1v3h3v-2h2v2h6v-2h2v2h3v-3l1-1-1-3v-3a8 8 0 0 0-8-8z" />
      <circle cx="9" cy="12" r="1.4" fill={color} />
      <circle cx="15" cy="12" r="1.4" fill={color} />
    </svg>
  )
}

function FallenPanel({ crew }: { crew: FallenCrew }) {
  const color = RARITY_COLORS[(crew.rarity as CrewRarity)] ?? '#8a857c'
  // Mute the rarity color toward sepia so even Legendary cards read as
  // "remembered" rather than triumphant. Mix with parchment tone.
  const routeName = crew.diedOnRoute ? (ROUTE_LABEL[crew.diedOnRoute] ?? crew.diedOnRoute) : 'an unknown voyage'
  // Lifetime stat distribution + final level — surfaced here as the eulogy
  // since players don't see per-level distribution during play. Affinity is
  // the crew's own rolled stats (same signal applyLevelBonuses uses), so
  // the memorial faithfully reproduces what the crew earned in life.
  const finalLevel = crewLevelFromXP(crew.xp)
  const lifetimeBonus = levelStatBonuses(finalLevel, { power: crew.power, dodge: crew.dodge, fortune: crew.fortune })
  const hasLevel = finalLevel > 1
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      style={{
        position: 'relative', display: 'flex', gap: '0.65rem', padding: '0.65rem 0.7rem',
        borderRadius: 7,
        background: GRAVE_BG,
        border: `1px solid ${GRAVE_BORDER}`,
        boxShadow: 'inset 0 1px 0 rgba(255,225,170,0.04), 0 6px 16px rgba(0,0,0,0.55)',
      }}>
      {/* Portrait — desaturated sepia */}
      <div style={{
        position: 'relative', width: 86, flexShrink: 0, alignSelf: 'flex-start', height: 96,
        borderRadius: '40px 40px 4px 4px', overflow: 'hidden',
        border: `1.5px solid ${color}88`,
        boxShadow: `inset 0 -12px 20px rgba(0,0,0,0.7), 0 0 8px ${color}22`,
        background: `radial-gradient(ellipse at 50% 30%, ${color}1c 0%, #050403 74%)`,
        filter: 'sepia(0.45) saturate(0.7)',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artSrc(crew.filename)} alt={crew.name} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'contain', objectPosition: 'center 20%', padding: 2,
          opacity: 0.82,
        }} />
        <div style={{ position: 'absolute', inset: 3, borderRadius: '38px 38px 3px 3px', border: '1px solid rgba(255,225,170,0.12)', pointerEvents: 'none' }} />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
            <p className="font-pirata" style={{ fontSize: '1.05rem', color: '#d6c4a3', lineHeight: 1, letterSpacing: '0.02em', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {crew.name}
            </p>
            {hasLevel && (
              <span className="font-cinzel font-700" style={{
                flexShrink: 0,
                fontSize: '0.56rem', letterSpacing: '0.08em',
                color: '#c8a060', background: 'rgba(200,160,96,0.12)',
                border: '1px solid rgba(200,160,96,0.35)',
                padding: '0.1rem 0.36rem', borderRadius: 3, lineHeight: 1.1,
              }}>
                Lv {finalLevel}
              </span>
            )}
          </div>
          <p className="font-cinzel font-700" style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: `${color}cc`, marginTop: 3 }}>
            {RARITY_NAMES[(crew.rarity as CrewRarity)] ?? 'Common'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <SkullIcon />
          <p className="font-karla" style={{ fontSize: '0.7rem', color: 'rgba(214,196,163,0.78)', lineHeight: 1.3 }}>
            Fell on <span style={{ color: '#e6d2a8' }}>{routeName}</span>
            <span style={{ color: 'rgba(214,196,163,0.5)' }}> · {formatFallDate(crew.diedAt)}</span>
          </p>
        </div>

        {/* Lifetime stat distribution — the eulogy line. Only shown if the
            crew actually leveled (no point reading "+0 +0 +0" on a fresh
            Lv 1 loss). Pokemon-like reveal: hidden during play, surfaced
            after death so each fallen crew has a "what they earned" stat
            sheet on their memorial. */}
        {hasLevel && (lifetimeBonus.power + lifetimeBonus.dodge + lifetimeBonus.fortune > 0) && (
          <p className="font-karla italic" style={{ fontSize: '0.62rem', color: 'rgba(214,196,163,0.55)', lineHeight: 1.3 }}>
            Earned <span style={{ color: STAT_COLOR.power }}>+{lifetimeBonus.power} PWR</span>
            {' · '}<span style={{ color: STAT_COLOR.dodge }}>+{lifetimeBonus.dodge} AGI</span>
            {' · '}<span style={{ color: STAT_COLOR.fortune }}>+{lifetimeBonus.fortune} FTN</span>
          </p>
        )}

        {crew.effects.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
            {crew.effects.slice(0, 4).map(eid => {
              const e = CREW_EFFECTS[eid]
              if (!e) return null
              const buff = e.kind === 'buff'
              return (
                <span key={eid} className="font-karla font-700" style={{
                  fontSize: '0.5rem', letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: buff ? '#9cc7a8' : '#c79c9c',
                  background: buff ? 'rgba(60,120,80,0.18)' : 'rgba(140,60,60,0.18)',
                  border: `1px solid ${buff ? 'rgba(120,180,140,0.4)' : 'rgba(180,110,110,0.4)'}`,
                  borderRadius: 3, padding: '0.12rem 0.4rem',
                }}>{e.name}</span>
              )
            })}
            {crew.effects.length > 4 && (
              <span className="font-karla font-700" style={{ fontSize: '0.5rem', color: 'rgba(214,196,163,0.5)', padding: '0.12rem 0.2rem' }}>+{crew.effects.length - 4}</span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CrewClient({ initial }: { initial: CrewState }) {
  const [state, setState] = useState<CrewState>(initial)
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<number | 'reroll' | null>(null)
  const [confirmDismiss, setConfirmDismiss] = useState<number | null>(null)
  // Inline glossary toggle on the crew detail modal — explains what
  // each stat actually does in raids + voyages. Reset when the modal
  // closes so it starts collapsed for the next card.
  const [statsGlossaryOpen, setStatsGlossaryOpen] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ kind: 'board' | 'roster'; item: BoardCandidate | CrewMember } | null>(null)
  // Cards with traits glow until the player opens them once (a "look here" nudge).
  const [viewed, setViewed] = useState<Set<string>>(new Set())
  // Crew Management top-level tabs — Roster is the main focus and default;
  // Recruit Board moves behind its own tab so it doesn't dominate the page
  // for players who are mostly managing their existing crew; Graveyard
  // stays as the memorial tab. The graveyard fetch is lazy (first time the
  // tab is opened) so the page-load cost stays the same for players who
  // never click it.
  // Deep-link support — Expedition hub cards link to /crew?tab=roster
  // &filter=raid|voyage so tapping a crew portrait there lands the player
  // on the right view. Read once on mount; any value not in the allow-set
  // falls back to the default.
  const searchParams = useSearchParams()
  const initialTab    = (() => {
    const t = searchParams?.get('tab')
    return t === 'recruits' || t === 'graveyard' || t === 'roster' ? t : 'roster'
  })() as 'roster' | 'recruits' | 'graveyard'
  const initialFilter = (() => {
    const f = searchParams?.get('filter')
    return f === 'raid' || f === 'voyage' || f === 'bench' || f === 'all' ? f : 'all'
  })() as 'all' | 'raid' | 'voyage' | 'bench'
  const [activeTab, setActiveTab] = useState<'roster' | 'recruits' | 'graveyard'>(initialTab)
  // Roster sub-filter — Full shows everything, Raid shows just the raid
  // party, Voyage shows just the voyage party, Bench shows unassigned
  // crew (neither track). Raid leads because raids take precedence over
  // voyages in the player's loadout decisions.
  const [rosterFilter, setRosterFilter] = useState<'all' | 'raid' | 'voyage' | 'bench'>(initialFilter)
  const [graveyard, setGraveyard] = useState<FallenCrew[] | null>(null)
  const [graveyardLoading, setGraveyardLoading] = useState(false)
  const reveal = useReveal()
  const crewSectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeTab !== 'graveyard' || graveyard !== null || graveyardLoading) return
    setGraveyardLoading(true)
    getCrewGraveyard()
      .then(rows => setGraveyard(rows))
      .finally(() => setGraveyardLoading(false))
  }, [activeTab, graveyard, graveyardLoading])

  const rosterFull = state.roster.length >= state.capacity

  /** Pick the lowest empty slot on the target track. Returns 0 (captain
   *  slot — server will bench the previous occupant) if all slots are
   *  already filled, so the toggle never blocks on a full party. */
  function nextOpenSlot(track: 'voyage' | 'raid'): number {
    const taken = new Set<number>()
    for (const c of state.roster) {
      const s = track === 'voyage' ? c.voyageSlot : c.raidSlot
      if (s !== null) taken.add(s)
    }
    for (let i = 0; i < state.shipCrewSlots; i++) {
      if (!taken.has(i)) return i
    }
    return 0
  }

  const scrollToCrew = () => crewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // Open the detail modal: clear the card's hint glow + a light tactile tick.
  function openDetail(kind: 'board' | 'roster', item: BoardCandidate | CrewMember) {
    const key = `${kind}:${item.id}`
    setViewed(prev => (prev.has(key) ? prev : new Set(prev).add(key)))
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(8)
    setDetail({ kind, item })
  }

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

  // Reroll runs the action, swaps the board underneath, then plays the reveal
  // over the top so the new recruits flip in with pack-opening flair.
  function handleReroll() {
    if (pending || reveal.revealing) return // no re-roll mid-action or mid-reveal
    setErr(null)
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(14)
    setBusyId('reroll')
    startTransition(async () => {
      const res = await rerollBoard()
      if ('error' in res) setErr(res.error)
      else {
        setState(res.state)
        // Keep the Nav-bar gem total in sync (it has its own displayGems state).
        window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.state.gems }))
        reveal.startReveal(res.state.board)
      }
      setBusyId(null)
    })
  }

  // Recruit / Dismiss action. `round` = compact icon button for the card stats
  // row; otherwise a full labelled button for the detail modal.
  function renderAction(kind: 'board' | 'roster', item: BoardCandidate | CrewMember, opts?: { onDone?: () => void; round?: boolean }) {
    const onDone = opts?.onDone
    const round = opts?.round

    if (kind === 'board') {
      const c = item as BoardCandidate
      const recruit = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(14)
        run(() => recruitCrew(c.id), c.id, onDone)
      }
      if (round) {
        const STATIC_PILL: React.CSSProperties = {
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.36rem 0.72rem',
          borderRadius: 999, fontSize: '0.66rem', letterSpacing: '0.07em', textTransform: 'uppercase', whiteSpace: 'nowrap',
        }
        if (c.recruited) return <span className="font-karla font-700" style={{ ...STATIC_PILL, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', color: 'rgba(220,248,231,0.72)' }}><CheckIcon /> Aboard</span>
        if (rosterFull) return <span className="font-karla font-700" style={{ ...STATIC_PILL, background: 'rgba(220,90,90,0.1)', border: '1px solid rgba(220,90,90,0.32)', color: '#f2b0b0' }}>Roster Full</span>
        return (
          <motion.button
            title="Recruit" onClick={recruit} disabled={pending}
            whileTap={{ scale: 0.88 }}
            transition={{ type: 'spring', stiffness: 520, damping: 18 }}
            className="font-karla font-700"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '0.45rem 1rem', borderRadius: 999, fontSize: '0.78rem', letterSpacing: '0.07em', textTransform: 'uppercase', whiteSpace: 'nowrap',
              background: 'linear-gradient(180deg, #4cc483 0%, #2e9a5c 100%)',
              border: '1px solid rgba(150,235,185,0.85)', color: '#04160d',
              boxShadow: '0 2px 10px rgba(46,170,100,0.5), inset 0 1px 0 rgba(255,255,255,0.35)',
              cursor: pending ? 'not-allowed' : 'pointer', opacity: pending && busyId === c.id ? 0.6 : 1,
            }}
          >
            <AnchorIcon /><span>{busyId === c.id ? '…' : 'Recruit'}</span>
          </motion.button>
        )
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
      // Roster card inline action — 3-way Voyage / Raid / Bench toggle.
      // Dismiss moved into the detail modal so the card's primary affordance
      // is "where does this crew sail?" not "are they fired?".
      // Picking voyage/raid finds the lowest empty slot on that track and
      // assigns; tapping the currently-active option no-ops. Crew currently
      // at sea (in a pending voyage) are locked — toggle disabled.
      const assignment = crewAssignment(m)
      const isLocked = state.lockedCrewIds.includes(m.id)
      const onPickVoyage = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (assignment === 'voyage' || isLocked) return
        const slot = nextOpenSlot('voyage')
        if (slot === null) return
        run(() => assignToVoyage(m.id, slot), m.id, onDone)
      }
      const onPickRaid = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (assignment === 'raid' || isLocked) return
        const slot = nextOpenSlot('raid')
        if (slot === null) return
        run(() => assignToRaid(m.id, slot), m.id, onDone)
      }
      const onPickBench = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (assignment === 'bench' || isLocked) return
        run(() => benchCrew(m.id), m.id, onDone)
      }
      // Order: Raid → Voyage → Bench. Raid leads because raids take
      // precedence over voyages in the player's loadout decisions, and
      // the order mirrors the Full / Raid / Voyage / Bench sub-filter above.
      return (
        <div className="flex" style={{ gap: 5 }}>
          <AssignToggleBtn label="Raid"   Icon={CrossedSwordsIconSvg} active={assignment === 'raid'}   accent={ASSIGN_RAID}   disabled={pending || isLocked} onClick={onPickRaid} />
          <AssignToggleBtn label="Voyage" Icon={AnchorIconSvg}        active={assignment === 'voyage'} accent={ASSIGN_VOYAGE} disabled={pending || isLocked} onClick={onPickVoyage} />
          <AssignToggleBtn label="Bench"  Icon={BenchIconSvg}         active={assignment === 'bench'}  accent={ASSIGN_BENCH}  disabled={pending || isLocked} onClick={onPickBench} />
        </div>
      )
    }

    // Detail-modal action (round=false) — Dismiss stays here as the primary
    // destructive action. Assignment lives on the card itself.
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
        <div className="flex items-start justify-between flex-wrap gap-3" style={{ marginBottom: '1.1rem' }}>
          <div>
            <h1 className="font-pirata" style={{ fontSize: '1.7rem', letterSpacing: '0.03em' }}>Crew Management</h1>
            <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
              Build your roster, assign crew to voyages or raids, remember the fallen.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Stat label="Gems" value={<><TickingNumber value={state.gems} /> ◆</>} accent="#a78bfa" />
            <Stat label="Nav Level" value={String(state.navLevel)} />
            <Stat label="Roster" value={`${state.roster.length} / ${state.capacity}`} accent={rosterFull ? '#f08a8a' : '#5fd38a'} />
          </div>
        </div>

        {err && (
          <div className="font-karla font-600" style={{ fontSize: '0.74rem', color: '#f2b0b0', background: 'rgba(200,70,70,0.12)', border: '1px solid rgba(220,90,90,0.3)', borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: '1rem' }}>
            {err}
          </div>
        )}

        {/* Top-level tabs — Roster is the default + primary focus. Recruit
            Board (shortened to "Recruits" so 3 tabs fit on one row at
            narrow phone widths) sits behind its own tab so its reroll-
            heavy UI doesn't crowd the page. Counts drop inline next to
            the label as a dim "· N" suffix instead of a separate pill —
            same information density, half the horizontal footprint. */}
        {(() => {
          const tabs = [
            { id: 'roster' as const,    label: 'Roster',   accent: SECTION_ROSTER,  count: state.roster.length },
            { id: 'recruits' as const,  label: 'Recruits', accent: SECTION_RECRUIT, count: state.board.filter(c => !c.recruited).length },
            { id: 'graveyard' as const, label: 'Graves',   accent: '#9c8055',       count: graveyard?.length ?? null },
          ]
          return (
            <div role="tablist" className="flex items-center" style={{
              gap: 3, marginBottom: '1.2rem',
              background: 'rgba(0,0,0,0.25)', padding: 3, borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.08)',
              flexWrap: 'nowrap',
              overflowX: 'auto',
            }}>
              {tabs.map(t => {
                const active = activeTab === t.id
                return (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(t.id)}
                    className="font-cinzel font-700 uppercase"
                    style={{
                      flex: '1 1 0',
                      minWidth: 0,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      padding: '0.5rem 0.45rem', borderRadius: 7,
                      fontSize: '0.7rem', letterSpacing: '0.06em',
                      background: active ? `${t.accent}26` : 'transparent',
                      border: `1px solid ${active ? `${t.accent}88` : 'transparent'}`,
                      color: active ? t.accent : 'rgba(255,255,255,0.55)',
                      cursor: 'pointer', transition: 'all 0.18s',
                      whiteSpace: 'nowrap',
                    }}>
                    <span>{t.label}</span>
                    {t.count !== null && t.count > 0 && (
                      <span className="font-karla font-700" style={{
                        fontSize: '0.62rem',
                        color: active ? `${t.accent}cc` : 'rgba(255,255,255,0.4)',
                        opacity: 0.9,
                      }}>· {t.count}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })()}

        {/* Recruit board — warm gold "new arrivals" region */}
        {activeTab === 'recruits' && (
        <div style={{ borderRadius: 12, border: `1px solid ${SECTION_RECRUIT}33`, background: `linear-gradient(180deg, ${SECTION_RECRUIT}12 0%, rgba(0,0,0,0) 55%)`, padding: '0.85rem 0.85rem 1rem', marginBottom: '1.4rem' }}>
          {/* Title with the free-refresh countdown riding inline beside it */}
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5" style={{ marginBottom: '0.9rem' }}>
            <span style={{ width: 4, height: 22, borderRadius: 2, background: SECTION_RECRUIT, flexShrink: 0 }} />
            <h2 className="font-cinzel font-700 uppercase" style={{ fontSize: '1rem', letterSpacing: '0.08em', color: SECTION_RECRUIT }}>Recruit Board</h2>
            <span className="font-karla font-600" style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
              fontSize: '0.7rem', color: 'rgba(255,255,255,0.62)',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 999, padding: '0.2rem 0.62rem',
            }}>
              <ClockIcon /> Free reroll in <FreeRollCountdown />
            </span>
          </div>

          {/* Centered reroll CTA */}
          {(() => {
            const cannot = pending || reveal.revealing || state.gems < state.rerollCost
            return (
              <div className="flex justify-center" style={{ marginBottom: '1.1rem' }}>
                <motion.button
                  onClick={handleReroll}
                  disabled={cannot}
                  title="Spend gems for 3 brand-new recruits"
                  whileTap={cannot ? undefined : { scale: 0.94 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 18 }}
                  className="font-cinzel font-700 uppercase"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 9,
                    padding: '0.66rem 1.6rem', borderRadius: 999,
                    fontSize: '0.86rem', letterSpacing: '0.07em',
                    background: cannot ? 'linear-gradient(180deg, #2a2114 0%, #19120a 100%)' : 'linear-gradient(180deg, #d9b563 0%, #a8842f 100%)',
                    border: `1px solid ${cannot ? 'rgba(201,162,74,0.28)' : 'rgba(240,214,150,0.85)'}`,
                    color: cannot ? 'rgba(240,220,168,0.45)' : '#2a1c08',
                    boxShadow: cannot ? 'none' : '0 4px 16px rgba(201,162,74,0.42), inset 0 1px 0 rgba(255,240,200,0.5)',
                    textShadow: cannot ? 'none' : '0 1px 1px rgba(255,238,200,0.4)',
                    cursor: cannot ? 'not-allowed' : 'pointer',
                  }}
                >
                  <RefreshIcon />
                  <span>{busyId === 'reroll' || reveal.revealing ? 'Rerolling…' : 'Reroll'}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, fontSize: '0.82rem', letterSpacing: 0 }}>{state.rerollCost}<span style={{ color: cannot ? 'rgba(90,63,184,0.45)' : '#4f2fb0' }}>◆</span></span>
                </motion.button>
              </div>
            )
          })()}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.8rem' }}>
            {state.board.map((c: BoardCandidate) => {
              const panel = (
                <CrewPanel name={c.name} filename={c.filename} rarity={c.rarity}
                  base={{ power: c.power, dodge: c.dodge, fortune: c.fortune }} effects={c.effects} slug={c.slug} dimmed={c.recruited}
                  hint={c.effects.length > 0 && !c.recruited && !viewed.has(`board:${c.id}`)}
                  onClick={() => openDetail('board', c)}>
                  {renderAction('board', c, { round: true })}
                </CrewPanel>
              )
              const phase = reveal.phases[c.id]
              // Climax: dim/desaturate the rest of the board and spotlight the
              // finale (rarest) card so the best pull lands as an event.
              const dim = reveal.climaxActive && c.id !== reveal.climaxId
              const spotlight = reveal.climaxActive && c.id === reveal.climaxId
              return (
                <div key={c.id} style={{
                  position: 'relative', borderRadius: 8,
                  transition: 'opacity 0.45s ease, filter 0.45s ease, transform 0.45s ease, box-shadow 0.45s ease',
                  opacity: dim ? 0.34 : 1,
                  filter: dim ? 'grayscale(0.7) brightness(0.62)' : undefined,
                  transform: spotlight ? 'scale(1.045)' : undefined,
                  zIndex: spotlight ? 3 : undefined,
                  boxShadow: spotlight ? '0 0 30px rgba(255,221,130,0.22)' : undefined,
                }}>
                  {phase
                    ? <BoardReveal card={c} phase={phase} onTap={() => reveal.tapCard(c)}>{panel}</BoardReveal>
                    : panel}
                </div>
              )
            })}
            {state.board.length === 0 && (
              <p className="font-karla" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>No recruits on the board.</p>
            )}
          </div>
        </div>
        )}

        {/* Roster / Graveyard — cool steel "your manifest" region. The sub-
            tab strip was promoted to top-level tabs (Roster / Recruit Board
            / Graveyard); this section now renders only when one of the two
            non-recruits tabs is active. */}
        {(activeTab === 'roster' || activeTab === 'graveyard') && (() => {
          const isGraveyard = activeTab === 'graveyard'
          const sectionAccent = isGraveyard ? '#9c8055' : SECTION_ROSTER
          return (
        <div ref={crewSectionRef} style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)', padding: '0.85rem 0.85rem 1rem', scrollMarginTop: 70 }}>
          {/* Section heading + count — sub-tabs are gone, top-level tabs
              own that role now. Kept the count so players can scan total
              roster size without doing the math. */}
          <div className="flex items-center justify-between flex-wrap gap-y-2" style={{ marginBottom: '0.9rem' }}>
            <div className="flex items-center gap-2.5">
              <span style={{ width: 4, alignSelf: 'stretch', minHeight: 30, borderRadius: 2, background: sectionAccent, transition: 'background 0.3s' }} />
              <h2 className="font-cinzel font-700 uppercase" style={{ fontSize: '0.92rem', letterSpacing: '0.1em', color: sectionAccent }}>
                {isGraveyard ? 'In Memoriam' : 'Roster'}
              </h2>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {isGraveyard ? (
                <>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', lineHeight: 1.05, color: '#d6c4a3' }}>{graveyard?.length ?? '—'}</p>
                  <p className="font-karla font-600 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.08em', color: 'rgba(214,196,163,0.6)', marginTop: 1 }}>Lost at sea</p>
                </>
              ) : (
                <>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', lineHeight: 1.05, color: rosterFull ? '#f08a8a' : '#dfe9e3' }}>{state.roster.length} / {state.capacity}</p>
                  <p className="font-karla font-600 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.08em', color: rosterFull ? '#f08a8a' : 'rgba(255,255,255,0.5)', marginTop: 1 }}>{rosterFull ? 'Crew full' : 'Crew slots'}</p>
                </>
              )}
            </div>
          </div>

          {/* Active panel */}
          {!isGraveyard ? (
            <>
              {/* Roster sub-filter — Full / Raid / Voyage. Raid sits FIRST
                  because raids take precedence over voyages in the player's
                  loadout decisions, mirroring the toggle button order. */}
              {state.roster.length > 0 && (() => {
                const counts = {
                  all:    state.roster.length,
                  raid:   state.roster.filter(c => c.raidSlot   !== null).length,
                  voyage: state.roster.filter(c => c.voyageSlot !== null).length,
                  bench:  state.roster.filter(c => c.raidSlot === null && c.voyageSlot === null).length,
                }
                const filters = [
                  { id: 'all'    as const, label: 'Full',    accent: SECTION_ROSTER },
                  { id: 'raid'   as const, label: 'Raid',    accent: ASSIGN_RAID    },
                  { id: 'voyage' as const, label: 'Voyage',  accent: ASSIGN_VOYAGE  },
                  { id: 'bench'  as const, label: 'Bench',   accent: ASSIGN_BENCH   },
                ]
                return (
                  <div role="tablist" className="flex items-center" style={{
                    gap: 3, padding: 3, borderRadius: 8,
                    background: 'rgba(0,0,0,0.22)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    marginBottom: '0.7rem',
                    flexWrap: 'nowrap',
                    overflowX: 'auto',
                  }}>
                    {filters.map(f => {
                      const active = rosterFilter === f.id
                      return (
                        <button
                          key={f.id}
                          role="tab"
                          aria-selected={active}
                          onClick={() => setRosterFilter(f.id)}
                          className="font-cinzel font-700 uppercase"
                          style={{
                            flex: '1 1 0',
                            minWidth: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            padding: '0.34rem 0.32rem', borderRadius: 6,
                            fontSize: '0.6rem', letterSpacing: '0.06em',
                            background: active ? `${f.accent}26` : 'transparent',
                            border: `1px solid ${active ? `${f.accent}88` : 'transparent'}`,
                            color: active ? f.accent : 'rgba(255,255,255,0.5)',
                            cursor: 'pointer', transition: 'all 0.18s',
                            whiteSpace: 'nowrap',
                          }}>
                          <span>{f.label}</span>
                          <span style={{
                            fontSize: '0.56rem',
                            color: active ? `${f.accent}cc` : 'rgba(255,255,255,0.4)',
                            opacity: 0.9,
                          }}>· {counts[f.id]}</span>
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
              <p className="font-karla" style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.7rem' }}>You unlock a new slot every 10 Nav levels.</p>
              {state.roster.length === 0 ? (
                <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', padding: '1rem 0' }}>
                  No crew yet. Recruit from the board.
                </p>
              ) : (() => {
                const visibleRoster = state.roster.filter(c =>
                  rosterFilter === 'all'    ? true :
                  rosterFilter === 'raid'   ? c.raidSlot   !== null :
                  rosterFilter === 'voyage' ? c.voyageSlot !== null :
                                              c.raidSlot === null && c.voyageSlot === null
                )
                if (visibleRoster.length === 0) {
                  const label =
                    rosterFilter === 'raid'   ? 'raid loadout' :
                    rosterFilter === 'voyage' ? 'voyage party' :
                                                'bench'
                  return (
                    <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', padding: '1rem 0' }}>
                      {rosterFilter === 'bench'
                        ? 'No unassigned crew — everyone\'s out there earning their keep.'
                        : `No crew in your ${label}. Use the toggle on a card to assign them.`}
                    </p>
                  )
                }
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.8rem' }}>
                    {visibleRoster.map((m: CrewMember) => (
                      <CrewPanel key={m.id} name={m.name} filename={m.filename} rarity={m.rarity}
                        bg={ROSTER_PANEL_BG} border={ROSTER_PANEL_BORDER}
                        base={{ power: m.power, dodge: m.dodge, fortune: m.fortune }} effects={m.effects} xp={m.xp} slug={m.slug}
                        assignment={crewAssignment(m)}
                        locked={state.lockedCrewIds.includes(m.id)}
                        hint={m.effects.length > 0 && !viewed.has(`roster:${m.id}`)}
                        onClick={() => openDetail('roster', m)}>
                        {renderAction('roster', m, { round: true })}
                      </CrewPanel>
                    ))}
                  </div>
                )
              })()}
            </>
          ) : (
            <>
              <p className="font-karla italic" style={{ fontSize: '0.74rem', color: 'rgba(214,196,163,0.6)', marginBottom: '0.7rem' }}>
                In memory of those who sailed and never returned.
              </p>
              {graveyardLoading && graveyard === null ? (
                <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', padding: '1rem 0' }}>Reading the register…</p>
              ) : (graveyard?.length ?? 0) === 0 ? (
                <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(214,196,163,0.45)', padding: '1rem 0' }}>
                  No fallen crew. Sail the riskier routes and your manifest will fill.
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.7rem' }}>
                  {graveyard!.map(g => <FallenPanel key={g.id} crew={g} />)}
                </div>
              )}
            </>
          )}
        </div>
          )
        })()}
      </div>

      {/* Reroll reveal — the board's own cards flip open in place */}
      <RevealFlash flash={reveal.flash} />
      <RevealBanner banner={reveal.banner} />

      {/* Detail modal — full stat breakdown + traits, opened by tapping a card */}
      <AnimatePresence>
        {detail && (() => {
          const it = detail.item
          const dColor = RARITY_COLORS[(it.rarity as CrewRarity)] ?? '#8a857c'
          const dBase = { power: it.power, dodge: it.dodge, fortune: it.fortune }
          // Board candidates haven't been recruited yet so they're always
          // pre-XP (effectively Lv 1). Roster members carry their xp.
          const dXp  = 'xp' in it ? it.xp : 0
          const dEff = applyCrewEffects(dBase, it.effects, dXp)
          const dResolved = resolveEffects(it.effects)
          const close = () => { setConfirmDismiss(null); setDetail(null); setStatsGlossaryOpen(false) }
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
                <p className="font-cinzel font-700" style={{ textAlign: 'center', fontSize: '0.7rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: dColor }}>{RARITY_NAMES[(it.rarity as CrewRarity)] ?? 'Common'}</p>

                {/* Level + XP bar — only shown for roster crew (board recruits
                    are pre-XP so the bar would be meaningless). Hidden when
                    Lv 100 — show a "Master" badge instead. The next-tick
                    distribution stays hidden by design (player surprise at
                    each milestone) — graveyard memorials surface the
                    full lifetime distribution after the fact. */}
                {dXp >= 0 && 'xp' in it && (() => {
                  const prog = crewXPProgress(dXp)
                  const atMax = prog.level >= CREW_MAX_LEVEL
                  return (
                    <div style={{ marginTop: '0.7rem' }}>
                      <div className="flex items-baseline justify-between" style={{ marginBottom: 4 }}>
                        <span className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#f0c040', letterSpacing: '0.06em' }}>
                          {atMax ? 'Lv 100 · Master' : `Lv ${prog.level}`}
                        </span>
                        <span className="font-karla" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.5)' }}>
                          {atMax ? 'Fully trained' : `${prog.xpInLevel.toLocaleString()} / ${prog.xpForLevel.toLocaleString()} XP`}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: 6, background: 'rgba(0,0,0,0.4)', borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(240,192,64,0.18)' }}>
                        <div style={{
                          height: '100%', width: `${Math.round(prog.progress * 100)}%`,
                          background: 'linear-gradient(90deg, #f0c040 0%, #d9b563 100%)',
                          boxShadow: '0 0 6px rgba(240,192,64,0.4)',
                          transition: 'width 0.5s ease',
                        }} />
                      </div>
                    </div>
                  )
                })()}

                {/* Class section — species-locked active ability surfaced
                    in raid combat through the Special chooser. Always
                    shown for crew with a class (recruits + roster +
                    fallen). Sub-Lv-10 crew get a "Unlocks at Lv 10" hint
                    instead of an effect line so players understand WHY
                    they don't see an ability yet. */}
                {(() => {
                  const cls = classForSlug(it.slug)
                  if (!cls) return null
                  const def: AnyClassDef = CLASSES[cls]
                  const lv = crewLevelFromXP(dXp)
                  const cur = currentMilestone(def, lv)
                  const next = nextMilestone(def, lv)
                  const accent = def.color
                  return (
                    <div style={{
                      marginTop: '0.9rem',
                      padding: '0.65rem 0.75rem 0.7rem',
                      background: `${accent}0e`,
                      border: `1px solid ${accent}44`,
                      borderRadius: 9,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span aria-hidden style={{ color: accent, fontSize: '0.95rem', lineHeight: 1 }}>{def.emoji}</span>
                          <p className="font-cinzel font-700 uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.1em', color: accent, lineHeight: 1 }}>{def.name}</p>
                        </div>
                        <p className="font-karla font-700" style={{ fontSize: '0.56rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
                          Active · once per raid
                        </p>
                      </div>
                      <p className="font-karla italic" style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.5rem', lineHeight: 1.35 }}>
                        {def.blurb}
                      </p>
                      {cur ? (
                        <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#ecdcbd', lineHeight: 1.35 }}>
                          <span style={{ color: accent, marginRight: 6 }}>Lv {cur.unlockLevel}:</span>
                          {cur.desc}
                        </p>
                      ) : (
                        <p className="font-karla" style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.35 }}>
                          Unlocks at Lv {CLASS_UNLOCK_LEVEL}.
                        </p>
                      )}
                      {next && (
                        <p className="font-karla" style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.4)', marginTop: 5, lineHeight: 1.3 }}>
                          <span style={{ color: 'rgba(255,255,255,0.5)' }}>Next at Lv {next.unlockLevel}:</span> {next.desc}
                        </p>
                      )}
                    </div>
                  )
                })()}

                {/* Stats header + ? toggle. Inline glossary below
                    explains what each stat actually does in raids +
                    voyages — match the Traits header styling above. */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.9rem', marginBottom: 6 }}>
                  <p className="font-cinzel font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)' }}>Stats</p>
                  <button
                    type="button"
                    onClick={() => setStatsGlossaryOpen(v => !v)}
                    aria-label={statsGlossaryOpen ? 'Hide stat glossary' : 'What do these mean?'}
                    aria-expanded={statsGlossaryOpen}
                    style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: statsGlossaryOpen ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.16)',
                      color: 'rgba(255,255,255,0.65)',
                      fontFamily: 'serif', fontSize: '0.8rem', lineHeight: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', padding: 0,
                    }}
                  >?</button>
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', gap: 8, marginBottom: '0.6rem' }}>
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

                {/* Trained-from-levels breakdown — shown only when there's
                    something to show (the crew has crossed at least one stat
                    milestone). Players can see exactly which stats their
                    leveling has invested in, mirroring the graveyard
                    eulogy format so the same shape appears in life + death. */}
                {(() => {
                  if (!('xp' in it) || dXp <= 0) return null
                  const bonus = levelStatBonuses(crewLevelFromXP(dXp), dBase)
                  const total = bonus.power + bonus.dodge + bonus.fortune
                  if (total <= 0) return null
                  return (
                    <p className="font-karla italic" style={{
                      fontSize: '0.7rem', color: 'rgba(240,192,64,0.78)',
                      background: 'rgba(240,192,64,0.05)',
                      border: '1px solid rgba(240,192,64,0.2)',
                      borderRadius: 7, padding: '0.42rem 0.6rem',
                      marginBottom: '0.9rem', lineHeight: 1.4,
                    }}>
                      <span style={{ color: 'rgba(255,255,255,0.45)', fontStyle: 'normal', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.56rem', marginRight: 8 }}>Trained</span>
                      <span style={{ color: STAT_COLOR.power }}>+{bonus.power} PWR</span>
                      {' · '}<span style={{ color: STAT_COLOR.dodge }}>+{bonus.dodge} AGI</span>
                      {' · '}<span style={{ color: STAT_COLOR.fortune }}>+{bonus.fortune} FTN</span>
                    </p>
                  )
                })()}

                {/* Inline glossary — collapsed by default. One sentence
                    per stat covering raid + voyage usage. Colors match
                    the stat-tile icons above so the eye links them. */}
                <AnimatePresence initial={false}>
                  {statsGlossaryOpen && (
                    <motion.div
                      key="stats-glossary"
                      initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginBottom: '0.9rem' }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{
                        padding: '0.6rem 0.7rem',
                        background: 'rgba(255,255,255,0.025)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 9,
                        display: 'flex', flexDirection: 'column', gap: 6,
                      }}>
                        {([
                          { k: 'power' as const,   text: 'Damage your shots deal in raids. Drives encounter events on voyages.' },
                          { k: 'dodge' as const,   text: 'Dodge chance against enemy hits in raids. Slips past danger events on voyages.' },
                          { k: 'fortune' as const, text: 'Better loot and repair-kit rolls in raids. Drives discovery payouts on voyages.' },
                        ]).map(({ k, text }) => (
                          <p key={k} className="font-karla" style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                            <span className="font-cinzel font-700" style={{ color: STAT_COLOR[k], letterSpacing: '0.06em', marginRight: 6 }}>{STAT_LABEL[k]}</span>
                            {text}
                          </p>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Traits */}
                <p className="font-cinzel font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)', marginBottom: '0.45rem' }}>Traits</p>
                {dResolved.length === 0 ? (
                  <p className="font-karla" style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.42)', marginBottom: '0.9rem' }}>No traits.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '0.95rem' }}>
                    {dResolved.map(e => {
                      const buff = e.kind === 'buff'
                      const scope = SCOPE_META[e.scope]
                      const summary = effectSummary(e)
                      return (
                        <div key={e.id} style={{ background: buff ? 'rgba(60,180,110,0.1)' : 'rgba(200,70,70,0.1)', border: `1px solid ${buff ? 'rgba(80,200,130,0.3)' : 'rgba(220,90,90,0.3)'}`, borderRadius: 8, padding: '0.5rem 0.6rem' }}>
                          <div className="flex items-center justify-between" style={{ gap: 6 }}>
                            <div className="flex items-center" style={{ gap: 6, minWidth: 0 }}>
                              <span className="font-cinzel font-700" style={{ fontSize: '0.84rem', color: buff ? '#bfe8cf' : '#f0bcbc', fontStyle: 'italic', whiteSpace: 'nowrap' }}>{e.name}</span>
                              <span className="font-karla font-700" style={{ flexShrink: 0, fontSize: '0.46rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: scope.color, border: `1px solid ${scope.color}66`, borderRadius: 4, padding: '0.08rem 0.3rem' }}>{scope.label}</span>
                            </div>
                            {summary && <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: buff ? '#7fdfa3' : '#f08a8a', whiteSpace: 'nowrap', textAlign: 'right' }}>{summary}</span>}
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

function Stat({ label, value, accent, onClick }: { label: string; value: ReactNode; accent?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      style={{
        background: 'rgba(255,255,255,0.05)', borderRadius: 9, padding: '0.45rem 0.8rem', textAlign: 'center',
        border: `1px solid ${onClick ? 'rgba(95,211,138,0.3)' : 'rgba(255,255,255,0.1)'}`,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <p className="font-cinzel font-700" style={{ fontSize: '1rem', lineHeight: 1.1, color: accent ?? '#f0ede8' }}>{value}</p>
      <p className="font-karla font-600 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{label}</p>
    </div>
  )
}
