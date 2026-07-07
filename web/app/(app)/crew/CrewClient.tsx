'use client'

import { useState, useEffect, useRef, useTransition, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  rerollBoard, recruitCrew, dismissCrew, getCrewGraveyard,
  assignToVoyage, assignToRaid, benchCrew, promoteToCaptain, renameCrew,
  upgradeCrewHall, buyCrewSkin, equipCrewSkin,
  type CrewState, type BoardCandidate, type CrewMember, type CrewActionResult, type FallenCrew,
} from './actions'
import { crewSkinsForSlug, getCrewSkin, getCrewSkinByFilename } from '@/lib/crewSkins'
import { hallTierDef, nextHallTier, CREW_HALL_MAX_TIER } from '@/lib/crewHall'
import { crewAssignment } from '@/lib/crewAssignment'
import { RARITY_NAMES, RARITY_COLORS, type CrewRarity } from '@/lib/crewGen'
import { applyCrewEffects, netTraitStats, traitLabel, traitKind } from '@/lib/crewEffects'
import { useReveal, BoardReveal, RevealFlash, RevealBanner } from './boardReveal'
import { ROUTE_CONFIGS, type VoyageRoute } from '@/lib/voyageRoutes'
import { crewLevelFromXP, crewXPProgress, levelStatBonuses, CREW_MAX_LEVEL } from '@/lib/crewLevel'
import { classForSlug, CLASSES, currentMilestone, nextMilestone, CLASS_UNLOCK_LEVEL, type AnyClassDef } from '@/lib/crewClasses'
import { vibrate } from '@/lib/haptics'
// TickingNumber + the local Stat helper were used by the removed
// gems/nav/roster pill row in the header. Dropped along with them.

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const artSrc = (filename: string) => `${SUPA}/storage/v1/object/public/card-arts/${filename}`

const STAT_COLOR = { power: '#f87171', dodge: '#60a5fa', fortune: '#f0c040' }
const STAT_LABEL = { power: 'PWR', dodge: 'SAV', fortune: 'FTN' }

// Section accents so the two boards read as visually distinct regions.
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
function GraveIcon() {
  // Simple tombstone — the Graveyard entry point shrank from a full tab to
  // this icon-only button, so the silhouette has to read at a glance.
  return (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 20V10a6 6 0 0 1 12 0v10" /><line x1="4" y1="20" x2="20" y2="20" /><line x1="12" y1="9" x2="12" y2="15" /><line x1="9.5" y1="11.5" x2="14.5" y2="11.5" /></svg>)
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
// Trawl net / creel — used on the assignment pip when a crew is away on a
// trawl (so it reads as a net, not the voyage anchor or raid swords).
function NetIconSvg({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5h16l-2.3 13a3 3 0 0 1-3 2.5H9.3a3 3 0 0 1-3-2.5L4 5Z" />
      <path d="M9 5l.8 15M15 5l-.8 15M4.7 11h14.6M5.6 16h12.8" />
    </svg>
  )
}

// ── Station group header — the labelled "who's where" sections that replaced
//    the old All/Raid/Voyage/Bench filter chips. Icon + name + count so a
//    casual player reads the whole picture without tab-switching. ─────────────
function StationHeader({ Icon, label, color, count, max, sub }: {
  Icon: (p: { size?: number; color?: string }) => React.JSX.Element
  label: string; color: string; count: number; max?: number; sub?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
      <span style={{ display: 'inline-flex', width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', background: `${color}22`, border: `1px solid ${color}59`, flexShrink: 0 }}>
        <Icon size={14} color={color} />
      </span>
      <span className="font-cinzel font-700" style={{ fontSize: '0.98rem', color: '#f0ede8' }}>{label}</span>
      <span className="font-karla font-700" style={{ fontSize: '0.74rem', color }}>{max != null ? `${count}/${max}` : count}</span>
      {sub && <span className="font-karla font-500" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', marginLeft: 'auto', textAlign: 'right' }}>{sub}</span>}
    </div>
  )
}

// Collapsible, accent-coded party card. Each station (Raid / Voyage / etc.)
// gets its own bordered card tinted to its colour so you instantly read which
// group is which. The whole header toggles collapse (chevron + tap), and the
// collapsed state shows just the crew names + open-seat count — the important
// info at a glance.
function PartySection({ accent, Icon, label, sub, count, max, members, collapsed, onToggle, children }: {
  accent: string
  Icon: (p: { size?: number; color?: string }) => React.JSX.Element
  label: string
  sub?: string
  count: number
  max?: number
  members: CrewMember[]
  collapsed: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div style={{
      borderRadius: 16,
      border: `1px solid ${accent}40`,
      background: `linear-gradient(180deg, ${accent}12 0%, rgba(255,255,255,0.012) 55%, rgba(0,0,0,0.05) 100%)`,
      overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        className="tap"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 9,
          padding: '0.72rem 0.85rem', background: `${accent}10`, textAlign: 'left',
          border: 'none', borderBottom: collapsed ? 'none' : `1px solid ${accent}22`, cursor: 'pointer',
        }}
      >
        <span style={{ display: 'inline-flex', width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', background: `${accent}26`, border: `1px solid ${accent}66`, flexShrink: 0 }}>
          <Icon size={14} color={accent} />
        </span>
        <span className="font-cinzel font-700" style={{ fontSize: '0.98rem', color: '#f0ede8' }}>{label}</span>
        <span className="font-karla font-700" style={{ fontSize: '0.74rem', color: accent }}>{max != null ? `${count}/${max}` : count}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 9 }}>
          {sub && <span className="font-karla font-500" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)' }}>{sub}</span>}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.18s', flexShrink: 0 }} aria-hidden><path d="M6 9l6 6 6-6" /></svg>
        </div>
      </button>
      {collapsed ? (
        <div style={{ padding: '0.55rem 0.85rem 0.7rem', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {members.length === 0 ? (
            <span className="font-karla font-500" style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.42)', fontStyle: 'italic' }}>
              No crew posted{max != null ? ` · ${max} open seat${max === 1 ? '' : 's'}` : ''}
            </span>
          ) : (
            members.map(m => (
              <span key={m.id} className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#e0dccc', background: `${accent}1c`, border: `1px solid ${accent}3a`, borderRadius: 999, padding: '0.16rem 0.55rem' }}>
                {m.name}
              </span>
            ))
          )}
        </div>
      ) : (
        <div style={{ padding: '0.75rem 0.85rem 0.9rem' }}>{children}</div>
      )}
    </div>
  )
}

// Bright dashed "open seat" tile in the Raid / Voyage parties so capacity (and
// the way to fill it) reads at a glance. A gentle pulse draws the eye; tapping
// opens the assign modal.
function EmptySlotTile({ color, onClick }: { color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="font-karla font-700" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7,
      minHeight: 92, borderRadius: 14, cursor: 'pointer', width: '100%',
      background: `linear-gradient(180deg, ${color}24 0%, ${color}0d 100%)`,
      border: `2px dashed ${color}b0`,
      boxShadow: `inset 0 0 22px ${color}24, 0 0 14px ${color}22`,
      color,
      letterSpacing: '0.06em',
      animation: 'crewSeatPulse 2.2s ease-in-out infinite',
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, borderRadius: '50%',
        background: `${color}33`, border: `1.5px solid ${color}`,
        fontSize: '1.3rem', lineHeight: 1,
      }}>+</span>
      <span className="uppercase" style={{ fontSize: '0.62rem' }}>Open seat · tap to add</span>
    </button>
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
  name, filename, rarity, base, effects, xp = 0, slug = '', assignment, isCaptain = false, locked = false, lockKind = 'voyage', lockLabel = 'This crew is currently at sea on a voyage.', hasLevelUp = false, dimmed, hint, frameAccent = '#5c5c63',
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
  /** True when the crew sits at slot 0 of their assigned track. Renders
   *  a small crown above the assignment pip so the captain is obvious at
   *  a glance. No-op for benched crew. */
  isCaptain?: boolean
  /** True when this crew is at sea (voyage OR trawl) and can't be reassigned.
   *  Greys the card out and disables the toggle buttons. */
  locked?: boolean
  /** Which kind of lock this is — drives the badge colour + the visible
   *  "at sea" / "on a trawl" caption so the two read apart at a glance
   *  (the tooltip alone is invisible on mobile). */
  lockKind?: 'voyage' | 'trawl'
  /** Tooltip on the lock badge — distinguishes voyage vs trawl. */
  lockLabel?: string
  /** True when the crew has leveled up since the player last opened it.
   *  Drives a whole-card gold breathing halo + brightened Lv chip + small
   *  NEW dot so the player knows to tap in and see what stat/ability tier
   *  they just unlocked. Tracked via localStorage 'crewSeenLevels' in the
   *  parent. */
  hasLevelUp?: boolean
  dimmed?: boolean
  hint?: boolean
  frameAccent?: string
  bg?: string
  border?: string
  onClick?: () => void
  children?: ReactNode
}) {
  // Frame stays the rarity color; an equipped skin makes the ART glow instead.
  const color = RARITY_COLORS[(rarity as CrewRarity)] ?? '#8a857c'
  const skinGlow = getCrewSkinByFilename(filename)?.color
  const skinGlowFilter = skinGlow ? `drop-shadow(0 0 5px ${skinGlow}) drop-shadow(0 0 12px ${skinGlow}bb)` : undefined
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
      {/* The "has traits — tap to view" halo glow was removed entirely.
          Players asked for a quieter card silhouette with no glow around
          the whole card. Trait count is still readable on the rarity
          line ('Epic · 2 traits') and the full list surfaces when the
          card opens, so the discovery cue is preserved without coloring
          the card's perimeter. `hint` prop kept for API stability — no-op. */}
      {/* Level-up halo — gold breathing border over the whole card while a
          level-up is unseen. Unlike the removed trait halo this one is
          TRANSIENT (it clears the moment the player opens the card), so at
          most a couple of cards glow at once and the roster stays calm.
          Overlay div instead of restyling the card root so it never fights
          the inline cardShadow/border. */}
      {hasLevelUp && (
        <span aria-hidden className="crew-levelup-halo" style={{
          position: 'absolute', inset: -1, borderRadius: 7,
          border: '1px solid rgba(255,217,106,0.6)',
          pointerEvents: 'none', zIndex: 1,
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
          <img src={artSrc(filename)} alt={name} loading="lazy" decoding="async" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'contain', objectPosition: 'center 20%', padding: 2,
            filter: skinGlowFilter,
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
        {/* A trawling crew has its voyage/raid slot freed on deploy, so it
            reads as benched — but it's actually away at sea. Show a teal net
            pip (lockKind === 'trawl') so an at-sea crew never looks idle; the
            voyage/raid pip still draws for crew genuinely in a party. */}
        {(lockKind === 'trawl' || (assignment && assignment !== 'bench')) && (() => {
          const isTrawl = lockKind === 'trawl'
          const accent  = isTrawl ? '#3fc8aa' : assignment === 'voyage' ? ASSIGN_VOYAGE : ASSIGN_RAID
          const label   = isTrawl ? 'Out on a trawl' : (isCaptain ? 'Captain · ' : '') + (assignment === 'voyage' ? 'On Voyage' : 'On Raid')
          const Icon    = isTrawl ? NetIconSvg : assignment === 'voyage' ? AnchorIconSvg : CrossedSwordsIconSvg
          return (
            <>
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
              {/* Captain crown sits above the assignment pip — tiny gold
                  silhouette so the player can tell at a glance who's
                  going to anchor the slot-0 captain seat on this track. */}
              {isCaptain && !isTrawl && (
                <div
                  aria-hidden
                  style={{
                    position: 'absolute', top: -19, right: -2,
                    width: 18, height: 14,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none',
                    zIndex: 3,
                  }}
                >
                  <svg width="18" height="14" viewBox="0 0 24 24" fill="#f0c040" stroke="#1a1206" strokeWidth="1.3" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.75))' }}>
                    <path d="M5 17h14l1-9-5 3.5L12 5 9 11.5 4 8z" />
                  </svg>
                </div>
              )}
            </>
          )
        })()}
        {locked && (
          <div
            title={lockLabel}
            style={{
              position: 'absolute', top: -6, left: -6,
              width: 26, height: 26, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(7,5,3,0.94)',
              border: `1.5px solid ${lockKind === 'trawl' ? 'rgba(70,200,170,0.78)' : 'rgba(255,180,90,0.7)'}`,
              boxShadow: lockKind === 'trawl'
                ? '0 2px 7px rgba(0,0,0,0.6), 0 0 10px rgba(70,200,170,0.42)'
                : '0 2px 7px rgba(0,0,0,0.6), 0 0 10px rgba(255,180,90,0.4)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={lockKind === 'trawl' ? '#9fe6d4' : '#ffd8a3'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
            {/* Level — plain text alongside the name. Cinzel font (matches
                the stats/rarity treatment elsewhere) reads cleanly at small
                sizes; pirata had the right vibe but its calligraphic 'L'
                + 'v' kerned into something that read as 'lvl' or 'lwl'.
                Small uppercase 'LV' separator with a slightly larger
                number after, both in the same warm gold so the whole
                token reads as one unit. */}
            <span style={{
              position: 'relative', flexShrink: 0,
              display: 'inline-flex', alignItems: 'baseline', gap: 4,
              color: hasLevelUp ? '#ffd96a' : '#d9b563',
              textShadow: hasLevelUp ? '0 0 10px rgba(255,217,106,0.55)' : '0 1px 2px rgba(0,0,0,0.6)',
              transition: 'color 0.18s, text-shadow 0.18s',
            }}>
              <span className="font-cinzel font-700" style={{
                fontSize: '0.6rem', letterSpacing: '0.15em', opacity: 0.85,
              }}>LV</span>
              <span className="font-cinzel font-700" style={{
                fontSize: '1.05rem', lineHeight: 1,
              }}>{crewLevelFromXP(xp)}</span>
              {hasLevelUp && (
                <span aria-label="Unseen level-up" title="New level — tap to view" style={{
                  position: 'absolute', top: -2, right: -8,
                  width: 7, height: 7, borderRadius: '50%',
                  background: '#fff5d0',
                  border: '1.5px solid rgba(0,0,0,0.65)',
                  boxShadow: '0 0 6px rgba(255,245,200,0.85)',
                }} />
              )}
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
  // Where they fell: the Hardcore Gauntlet ("Davy Jones's Locker, depth N") or,
  // for the usual voyage deaths, the route they were lost on.
  const fellHardcore = crew.diedHardcoreDepth != null
  const routeName = fellHardcore
    ? "Davy Jones's Locker"
    : crew.diedOnRoute ? (ROUTE_LABEL[crew.diedOnRoute] ?? crew.diedOnRoute) : 'an unknown voyage'
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
        <img src={artSrc(crew.filename)} alt={crew.name} loading="lazy" decoding="async" style={{
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
            Fell {fellHardcore ? 'in' : 'on'} <span style={{ color: '#e6d2a8' }}>{routeName}</span>
            {fellHardcore && <span style={{ color: '#e6d2a8' }}> · depth {crew.diedHardcoreDepth}</span>}
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
            {' · '}<span style={{ color: STAT_COLOR.dodge }}>+{lifetimeBonus.dodge} SAV</span>
            {' · '}<span style={{ color: STAT_COLOR.fortune }}>+{lifetimeBonus.fortune} FTN</span>
          </p>
        )}

        {(() => {
          // New trait system: each crew has at most one stat-only trait.
          // Show the generated label as a single sepia-tinted chip.
          const t = netTraitStats(crew.effects)
          const label = traitLabel(t)
          if (!label) return null
          const kind = traitKind(t)
          const buff = kind === 'buff'
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
              <span className="font-karla font-700" style={{
                fontSize: '0.5rem', letterSpacing: '0.06em', textTransform: 'uppercase',
                color: buff ? '#9cc7a8' : '#c79c9c',
                background: buff ? 'rgba(60,120,80,0.18)' : 'rgba(140,60,60,0.18)',
                border: `1px solid ${buff ? 'rgba(120,180,140,0.4)' : 'rgba(180,110,110,0.4)'}`,
                borderRadius: 3, padding: '0.12rem 0.4rem',
              }}>{label}</span>
            </div>
          )
        })()}
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
  // expandedTrait state used to exist for the old per-trait description
  // expander; the simplified one-row Trait section doesn't need it.

  // Class section expander — collapsed by default the detail modal shows
  // current-tier effect + next-tier preview; expanded it lists every
  // milestone (Lv 10 / 25 / 40 / 75 / 100) so the player can see what
  // they're working toward. Reset on modal close.
  const [classExpanded, setClassExpanded] = useState(false)

  // Which tab of the crew detail modal is showing. Falls back to Stats when the
  // active tab isn't available for the viewed crew (e.g. Skins on a non-skin
  // crew). Reset on modal close.
  const [detailTab, setDetailTab] = useState<'stats' | 'ability' | 'skins'>('stats')

  // Crew skins (legendary-only) — the tile the player is previewing in the
  // detail modal's Skins tab. undefined = show the currently equipped skin;
  // null = the Original; a string = that skin id. Reset on modal close.
  const [previewSkin, setPreviewSkin] = useState<string | null | undefined>(undefined)
  const [skinBusy, setSkinBusy] = useState<string | null>(null)
  // Buy / equip a crew skin, then sync state + the Nav-bar gem total.
  function runSkinAction(tag: string, action: () => Promise<CrewActionResult>) {
    if (skinBusy) return
    setErr(null)
    setSkinBusy(tag)
    startTransition(async () => {
      const res = await action()
      if ('error' in res) setErr(res.error)
      else {
        setState(res.state)
        window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.state.gems }))
      }
      setSkinBusy(null)
    })
  }

  // One-shot rename state — when the player taps the pencil next to their
  // crew's name in the detail modal, an inline input appears; saving fires
  // renameCrew (server-side guard rejects if nickname is already set). All
  // state resets on modal close.
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameErr, setRenameErr] = useState<string | null>(null)
  const [renameSaving, setRenameSaving] = useState(false)
  function startRename(currentName: string) {
    setRenameDraft(currentName)
    setRenameErr(null)
    setRenameOpen(true)
  }
  function cancelRename() {
    setRenameOpen(false)
    setRenameErr(null)
  }
  async function commitRename(crewId: number) {
    const clean = renameDraft.trim()
    if (clean.length < 1) { setRenameErr('Pick a name first.'); return }
    if (clean.length > 30) { setRenameErr('Name must be 30 characters or fewer.'); return }
    setRenameSaving(true)
    setRenameErr(null)
    try {
      const res = await renameCrew(crewId, clean)
      if ('error' in res) { setRenameErr(res.error); return }
      setState(res.state)
      // Pull the freshly-renamed crew row back into the detail modal so
      // the name update lands without reopening the card.
      const updated = res.state.roster.find(c => c.id === crewId)
      if (updated) setDetail({ kind: 'roster', item: updated })
      setRenameOpen(false)
    } finally {
      setRenameSaving(false)
    }
  }
  const [err, setErr] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ kind: 'board' | 'roster'; item: BoardCandidate | CrewMember } | null>(null)
  // Crew Hall upgrade flow — confirm modal + the one-shot celebration
  // overlay that plays over the recruit board after a successful upgrade
  // (the board's theme swaps underneath it, so the moment of change is
  // an event rather than a silent restyle).
  const [hallUpgradeOpen, setHallUpgradeOpen] = useState(false)
  const [hallBusy, setHallBusy] = useState(false)
  const [hallCelebrate, setHallCelebrate] = useState<{ name: string; startLevel: number; accent: string } | null>(null)
  useEffect(() => {
    if (!hallCelebrate) return
    const id = setTimeout(() => setHallCelebrate(null), 3000)
    return () => clearTimeout(id)
  }, [hallCelebrate])
  function handleHallUpgrade() {
    if (hallBusy || pending) return
    setErr(null)
    setHallBusy(true)
    startTransition(async () => {
      const res = await upgradeCrewHall()
      if ('error' in res) {
        setErr(res.error)
        setHallUpgradeOpen(false)
      } else {
        const def = hallTierDef(res.state.hallTier)
        setState(res.state)
        setHallUpgradeOpen(false)
        // Keep the Nav-bar doubloon total in sync (same pattern as repair).
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.state.doubloons }))
        vibrate([18, 50, 26])
        setHallCelebrate({ name: def.name, startLevel: def.startLevel, accent: def.accent })
      }
      setHallBusy(false)
    })
  }
  // Cards with traits glow until the player opens them once (a "look here" nudge).
  const [viewed, setViewed] = useState<Set<string>>(new Set())

  // Level-up indicator state — for each crew id, the level the player last
  // saw when they opened the detail modal. If the crew's current level is
  // higher, the card shows a small gold "NEW" dot on the Lv chip. Persisted
  // to localStorage so the indicator stays put across navigations, and
  // initialised lazily on first observation so existing crew aren't flagged
  // as "new" on the first page load — only level-ups going forward surface.
  const [seenLevels, setSeenLevels] = useState<Record<number, number>>({})
  const [seenLevelsLoaded, setSeenLevelsLoaded] = useState(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('crewSeenLevels')
      if (raw) setSeenLevels(JSON.parse(raw))
    } catch {}
    setSeenLevelsLoaded(true)
  }, [])
  useEffect(() => {
    if (!seenLevelsLoaded) return
    // Seed any unseen crew with their CURRENT level so first-load is calm;
    // genuine level-ups (current level > seed level) light up afterwards.
    let next: Record<number, number> | null = null
    for (const c of state.roster) {
      if (seenLevels[c.id] === undefined) {
        if (!next) next = { ...seenLevels }
        next[c.id] = crewLevelFromXP(c.xp)
      }
    }
    if (next) {
      setSeenLevels(next)
      try { localStorage.setItem('crewSeenLevels', JSON.stringify(next)) } catch {}
    }
  }, [seenLevelsLoaded, state.roster, seenLevels])
  function markCrewSeen(crewId: number, currentLevel: number) {
    setSeenLevels(prev => {
      if ((prev[crewId] ?? 0) >= currentLevel) return prev
      const next = { ...prev, [crewId]: currentLevel }
      try { localStorage.setItem('crewSeenLevels', JSON.stringify(next)) } catch {}
      return next
    })
  }
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
  const [activeTab, setActiveTab] = useState<'roster' | 'recruits' | 'graveyard'>(initialTab)
  const [graveyard, setGraveyard] = useState<FallenCrew[] | null>(null)
  const [graveyardLoading, setGraveyardLoading] = useState(false)
  const reveal = useReveal()
  const crewSectionRef = useRef<HTMLDivElement>(null)
  const availableRef = useRef<HTMLDivElement>(null)
  const scrollToAvailable = () => availableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  // Collapsed station cards (by id). All expanded by default.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  // Which open seat the assign modal is filling (the track), or null.
  const [assignTrack, setAssignTrack] = useState<'raid' | 'voyage' | null>(null)

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

  // Open the detail modal: clear the card's hint glow + a light tactile
  // tick. For roster crew, also stamp the seen level so the new-level
  // dot on the Lv chip clears once the player has acknowledged the
  // level-up by tapping in.
  function openDetail(kind: 'board' | 'roster', item: BoardCandidate | CrewMember) {
    const key = `${kind}:${item.id}`
    setViewed(prev => (prev.has(key) ? prev : new Set(prev).add(key)))
    if (kind === 'roster') {
      const m = item as CrewMember
      markCrewSeen(m.id, crewLevelFromXP(m.xp))
    }
    vibrate(8)
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
    vibrate(14)
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
        vibrate(14)
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
      const isLocked = state.lockedCrewIds.includes(m.id) || state.trawlingCrewIds.includes(m.id)
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

        {/* Header — title + roster count chip. Gems + Nav level live in
            the Nav bar already, so the roster fill is the one fact worth
            surfacing here ("N / cap") — it's the cap the rest of the page
            keeps butting up against (Recruit gates, Roster Full pills).
            Goes red when full so the player notices the wall before they
            try to claim another recruit and get bounced. */}
        <div style={{ marginBottom: '1.1rem', display: 'flex', alignItems: 'baseline', gap: '0.7rem', flexWrap: 'wrap' }}>
          <h1 className="font-pirata" style={{ fontSize: '1.7rem', letterSpacing: '0.03em' }}>Crew Management</h1>
          {(() => {
            const filled = state.roster.length
            const cap = state.capacity
            const isFull = filled >= cap
            return (
              <span className="font-karla font-700" style={{
                fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase',
                color: isFull ? '#f2b0b0' : '#c8b890',
                background: isFull ? 'rgba(220,90,90,0.10)' : 'rgba(200,170,100,0.08)',
                border: `1px solid ${isFull ? 'rgba(220,90,90,0.32)' : 'rgba(200,170,100,0.24)'}`,
                padding: '0.18rem 0.5rem', borderRadius: 5, lineHeight: 1.2,
                whiteSpace: 'nowrap',
              }}>
                {filled} / {cap} Crew
              </span>
            )
          })()}
        </div>

        {err && (
          <div className="font-karla font-600" style={{ fontSize: '0.74rem', color: '#f2b0b0', background: 'rgba(200,70,70,0.12)', border: '1px solid rgba(220,90,90,0.3)', borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: '1rem' }}>
            {err}
          </div>
        )}

        {/* Top-level navigation — deliberately NOT three identical tabs.
            Roster is the quiet "view your manifest" tab; Recruit always
            wears the gold action treatment so new players immediately know
            it's the way to get new crew; the Graveyard shrank to a small
            tombstone icon button on the right (a memorial doesn't need a
            full-width slot in the main nav). Counts stay as dim "· N"
            suffixes on the two text tabs. */}
        {(() => {
          const boardCount = state.board.filter(c => !c.recruited).length
          const rosterActive = activeTab === 'roster'
          const recruitsActive = activeTab === 'recruits'
          const gravesActive = activeTab === 'graveyard'
          return (
            <div role="tablist" className="flex items-center" style={{ gap: 6, marginBottom: '1.2rem' }}>
              {/* Roster — standard quiet tab */}
              <button
                role="tab"
                aria-selected={rosterActive}
                onClick={() => setActiveTab('roster')}
                className="font-cinzel font-700 uppercase"
                style={{
                  flex: '1 1 0', minWidth: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  padding: '0.55rem 0.45rem', borderRadius: 9,
                  fontSize: '0.7rem', letterSpacing: '0.06em',
                  background: rosterActive ? `${SECTION_ROSTER}26` : 'rgba(0,0,0,0.25)',
                  border: `1px solid ${rosterActive ? `${SECTION_ROSTER}88` : 'rgba(255,255,255,0.1)'}`,
                  color: rosterActive ? SECTION_ROSTER : 'rgba(255,255,255,0.55)',
                  cursor: 'pointer', transition: 'all 0.18s', whiteSpace: 'nowrap',
                }}>
                <span>Roster</span>
                {state.roster.length > 0 && (
                  <span className="font-karla font-700" style={{ fontSize: '0.62rem', opacity: 0.85 }}>· {state.roster.length}</span>
                )}
              </button>
              {/* Recruit — neutral at rest (matches Roster), gold tint only
                  when active. Earlier always-gold treatments (gradient fill,
                  then permanent gold outline) both proved too loud. */}
              <button
                role="tab"
                aria-selected={recruitsActive}
                onClick={() => setActiveTab('recruits')}
                className="font-cinzel font-700 uppercase"
                style={{
                  flex: '1 1 0', minWidth: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  padding: '0.55rem 0.45rem', borderRadius: 9,
                  fontSize: '0.7rem', letterSpacing: '0.06em',
                  background: recruitsActive ? 'rgba(201,162,74,0.24)' : 'rgba(0,0,0,0.25)',
                  border: `1px solid ${recruitsActive ? 'rgba(240,214,150,0.8)' : 'rgba(255,255,255,0.1)'}`,
                  color: recruitsActive ? '#f0d696' : 'rgba(255,255,255,0.55)',
                  cursor: 'pointer', transition: 'all 0.18s', whiteSpace: 'nowrap',
                }}>
                <span>Recruit</span>
                {boardCount > 0 && (
                  <span className="font-karla font-700" style={{ fontSize: '0.62rem', opacity: 0.85 }}>· {boardCount}</span>
                )}
              </button>
              {/* Graveyard — icon-only memorial entry */}
              <button
                role="tab"
                aria-selected={gravesActive}
                aria-label="Graveyard"
                title="Graveyard"
                onClick={() => setActiveTab('graveyard')}
                style={{
                  flexShrink: 0, width: 38, height: 38,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 9,
                  background: gravesActive ? 'rgba(156,128,85,0.22)' : 'rgba(0,0,0,0.25)',
                  border: `1px solid ${gravesActive ? 'rgba(156,128,85,0.7)' : 'rgba(255,255,255,0.1)'}`,
                  color: gravesActive ? '#c8ab7d' : 'rgba(255,255,255,0.45)',
                  cursor: 'pointer', transition: 'all 0.18s',
                }}>
                <GraveIcon />
              </button>
            </div>
          )
        })()}

        {/* Recruit board — themed by the player's Crew Hall tier
            (lib/crewHall.ts): the panel's accent, glow, and header all
            upgrade with the building, so paying for a new hall visibly
            changes the room the recruits stand in. Hall header carries
            the name + tier pips + start-level perk + the Upgrade CTA. */}
        {activeTab === 'recruits' && (() => {
          const hall = hallTierDef(state.hallTier)
          const nextTier = nextHallTier(state.hallTier)
          return (
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, border: `1px solid ${hall.accent}44`, background: `linear-gradient(180deg, ${hall.accent}16 0%, rgba(0,0,0,0) 55%)`, boxShadow: hall.glow ? `0 0 26px ${hall.glow}` : undefined, padding: '0.85rem 0.85rem 1rem', marginBottom: '1.4rem' }}>
          {/* Hall header — building identity row. Name + tier pips on
              the left, Upgrade CTA (or MAX chip) on the right, perk +
              flavor caption underneath. */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: hall.accent, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {hall.name}
                </p>
                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }} aria-label={`Crew Hall tier ${state.hallTier} of ${CREW_HALL_MAX_TIER}`}>
                  {Array.from({ length: CREW_HALL_MAX_TIER }, (_, i) => (
                    <span key={i} aria-hidden style={{
                      width: 6, height: 6, borderRadius: 6,
                      background: i < state.hallTier ? hall.accent : 'rgba(255,255,255,0.14)',
                      boxShadow: i < state.hallTier ? `0 0 5px ${hall.accent}88` : undefined,
                    }} />
                  ))}
                </div>
              </div>
              {nextTier ? (
                <button
                  onClick={() => setHallUpgradeOpen(true)}
                  className="font-karla font-700 uppercase active:scale-95"
                  style={{
                    flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '0.34rem 0.7rem', borderRadius: 999,
                    fontSize: '0.62rem', letterSpacing: '0.08em',
                    background: 'rgba(96,165,250,0.14)',
                    border: '1px solid rgba(96,165,250,0.45)',
                    color: '#cfe2ff', cursor: 'pointer',
                    transition: 'transform 0.08s',
                  }}
                >
                  Upgrade
                </button>
              ) : (
                <span className="font-karla font-700 uppercase" style={{
                  flexShrink: 0, padding: '0.34rem 0.7rem', borderRadius: 999,
                  fontSize: '0.62rem', letterSpacing: '0.08em',
                  background: `${hall.accent}1a`, border: `1px solid ${hall.accent}55`,
                  color: hall.accent,
                }}>
                  Max
                </span>
              )}
            </div>
            <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.62)', marginTop: 4 }}>
              Recruits start at <span style={{ color: hall.accent }}>Lv {hall.startLevel}</span>
            </p>
            <p className="font-karla" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', marginTop: 2 }}>
              {hall.flavor}
            </p>
          </div>
          {/* Reroll row — fills the left of a single row, free-roll
              countdown in the space to its right. Styled to MATCH the hall
              header's Upgrade pill (blue tint, karla uppercase, pill
              radius) so the panel's two actions read as one family — the
              old gold-gradient version clashed with everything around it. */}
          {(() => {
            const cannot = pending || reveal.revealing || state.gems < state.rerollCost
            return (
              <div className="flex items-center" style={{ gap: 12, marginBottom: '1.1rem' }}>
                <button
                  onClick={handleReroll}
                  disabled={cannot}
                  title="Spend gems for 3 brand-new recruits"
                  className="font-karla font-700 uppercase active:scale-95"
                  style={{
                    flex: '1 1 auto', minWidth: 0,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    padding: '0.55rem 1rem', borderRadius: 999,
                    fontSize: '0.7rem', letterSpacing: '0.08em',
                    background: 'rgba(96,165,250,0.14)',
                    border: '1px solid rgba(96,165,250,0.45)',
                    color: '#cfe2ff',
                    opacity: cannot ? 0.45 : 1,
                    cursor: cannot ? 'not-allowed' : 'pointer',
                    transition: 'transform 0.08s, opacity 0.18s',
                  }}
                >
                  <RefreshIcon />
                  <span>{busyId === 'reroll' || reveal.revealing ? 'Rerolling…' : 'Reroll'}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, letterSpacing: 0 }}>{state.rerollCost}<span style={{ color: '#a78bfa' }}>◆</span></span>
                </button>
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <span className="font-karla font-700 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)' }}>
                    Free reroll
                  </span>
                  <span className="font-karla font-600" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)',
                  }}>
                    <ClockIcon /> <FreeRollCountdown />
                  </span>
                </div>
              </div>
            )
          })()}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.8rem' }}>
            {state.board.map((c: BoardCandidate) => {
              const panel = (
                <CrewPanel name={c.name} filename={c.filename} rarity={c.rarity}
                  base={{ power: c.power, dodge: c.dodge, fortune: c.fortune }} effects={c.effects} slug={c.slug} dimmed={c.recruited}
                  // Board candidates carry the hall XP seed stamped when
                  // their board was ROLLED — preview the level (and stat
                  // bonuses) they'll actually arrive at. Upgrading the hall
                  // mid-board doesn't touch these; only the next roll does.
                  xp={c.startXp}
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

          {/* Upgrade celebration — fires once after a confirmed purchase.
              Lives INSIDE the hall panel (position:relative + overflow:
              hidden above) so the effect stays localized to the room that
              changed, per juice-subtlety: an expanding accent ring + the
              new hall's name over a brief dark veil. Tap or 3s timeout
              dismisses (auto-dismiss effect lives next to the state). */}
          <AnimatePresence>
            {hallCelebrate && (
              <motion.div
                key="hall-celebrate"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                onClick={() => setHallCelebrate(null)}
                style={{
                  position: 'absolute', inset: 0, zIndex: 5,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 6, background: 'rgba(8,6,3,0.82)', borderRadius: 12,
                  cursor: 'pointer',
                }}
              >
                {/* Expanding ring in the new tier's accent — the "something
                    just leveled up" beat without any screen-wide flash. */}
                <motion.span
                  aria-hidden
                  initial={{ scale: 0.2, opacity: 0.9 }}
                  animate={{ scale: 3.4, opacity: 0 }}
                  transition={{ duration: 1.1, ease: 'easeOut' }}
                  style={{
                    position: 'absolute', width: 90, height: 90, borderRadius: 999,
                    border: `2px solid ${hallCelebrate.accent}`,
                    boxShadow: `0 0 24px ${hallCelebrate.accent}66`,
                  }}
                />
                <motion.p
                  className="font-karla font-700 uppercase"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.35 }}
                  style={{ fontSize: '0.6rem', letterSpacing: '0.22em', color: 'rgba(255,255,255,0.55)' }}
                >
                  Hall Upgraded
                </motion.p>
                <motion.p
                  className="font-cinzel font-700"
                  initial={{ opacity: 0, scale: 0.82 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.25, type: 'spring', stiffness: 320, damping: 20 }}
                  style={{
                    fontSize: '1.25rem', color: hallCelebrate.accent, textAlign: 'center',
                    textShadow: `0 0 18px ${hallCelebrate.accent}55`, padding: '0 1rem',
                  }}
                >
                  {hallCelebrate.name}
                </motion.p>
                <motion.p
                  className="font-karla font-600"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.4 }}
                  style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)' }}
                >
                  Recruits now start at <span style={{ color: hallCelebrate.accent }}>Lv {hallCelebrate.startLevel}</span>
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
          )
        })()}

        {/* Hall upgrade confirm modal — fixed overlay (CrewClient mounts at
            page level, not inside Nav, so no portal needed). Recomputes the
            next tier from state so it always reflects the live tier even if
            the panel's IIFE consts are stale. */}
        {hallUpgradeOpen && (() => {
          const next = nextHallTier(state.hallTier)
          if (!next) return null
          const canAfford = state.doubloons >= next.cost
          return (
            <div
              onClick={() => { if (!hallBusy) setHallUpgradeOpen(false) }}
              style={{
                position: 'fixed', inset: 0, zIndex: 80,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.62)', padding: '1.2rem',
              }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  width: '100%', maxWidth: 380,
                  background: 'linear-gradient(180deg, #1c1610 0%, #120d08 100%)',
                  border: `1px solid ${next.accent}55`,
                  borderRadius: 14, padding: '1.2rem 1.1rem 1.05rem',
                  boxShadow: `0 10px 40px rgba(0,0,0,0.6), 0 0 30px ${next.accent}22`,
                }}
              >
                <p className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
                  Upgrade Crew Hall
                </p>
                <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: next.accent, marginBottom: 6 }}>
                  {next.name}
                </p>
                <p className="font-karla" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)', fontStyle: 'italic', marginBottom: 10, lineHeight: 1.45 }}>
                  {next.flavor}
                </p>
                <p className="font-karla font-600" style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.78)', marginBottom: 14 }}>
                  New recruits will start at <span style={{ color: next.accent }}>Lv {next.startLevel}</span>
                </p>
                <div className="flex items-center justify-between" style={{
                  padding: '0.55rem 0.75rem', borderRadius: 9,
                  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
                  marginBottom: 14,
                }}>
                  <span className="font-karla font-600" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)' }}>Cost</span>
                  <span className="font-karla font-700" style={{ fontSize: '0.82rem', color: canAfford ? '#e8c87a' : '#f2b0b0' }}>
                    {next.cost.toLocaleString()} <span style={{ color: '#e8c87a' }}>⟡</span>
                  </span>
                </div>
                <p className="font-karla" style={{ fontSize: '0.64rem', color: canAfford ? 'rgba(255,255,255,0.4)' : '#f2b0b0', marginBottom: 12 }}>
                  Your doubloons: {state.doubloons.toLocaleString()} ⟡
                </p>
                <div className="flex" style={{ gap: 8 }}>
                  <button
                    onClick={() => setHallUpgradeOpen(false)}
                    disabled={hallBusy}
                    className="font-karla font-700"
                    style={{
                      flex: 1, padding: '0.6rem', borderRadius: 9, fontSize: '0.78rem',
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                      color: 'rgba(255,255,255,0.7)', cursor: hallBusy ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleHallUpgrade}
                    disabled={!canAfford || hallBusy}
                    className="font-karla font-700 active:scale-95"
                    style={{
                      flex: 1.4, padding: '0.6rem', borderRadius: 9, fontSize: '0.78rem',
                      background: 'rgba(96,165,250,0.16)',
                      border: '1px solid rgba(96,165,250,0.5)',
                      color: '#cfe2ff',
                      opacity: (!canAfford || hallBusy) ? 0.45 : 1,
                      cursor: (!canAfford || hallBusy) ? 'not-allowed' : 'pointer',
                      transition: 'transform 0.08s',
                    }}
                  >
                    {hallBusy ? 'Upgrading…' : `Upgrade · ${next.cost.toLocaleString()} ⟡`}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Roster / Graveyard — cool steel "your manifest" region. The sub-
            tab strip was promoted to top-level tabs (Roster / Recruit Board
            / Graveyard); this section now renders only when one of the two
            non-recruits tabs is active. */}
        {(activeTab === 'roster' || activeTab === 'graveyard') && (() => {
          const isGraveyard = activeTab === 'graveyard'
          // sectionAccent used to color the heading bar + h2; both went
          // away with the heading cleanup so this constant did too.
          return (
        <div ref={crewSectionRef} style={{ scrollMarginTop: 70 }}>
          {/* Section heading + right-side count pill BOTH dropped — the
              top-level tabs ('Roster · 8' / 'Graves · 2') already carry
              both pieces of information and an accent bar + h2 + right
              pill below them was just visual noise. The roster grid is
              the focus now; sub-filter sits directly under the panel
              border. */}

          {/* Active panel */}
          {!isGraveyard ? (
            <>
              {/* Stations board — crew grouped by what they're actually doing
                  (Raid party / Voyage party / Out trawling / Available) so a
                  casual player reads "who's where" at a glance with no
                  filtering. Replaced the All/Raid/Voyage/Bench filter chips. */}
              {state.roster.length === 0 ? (
                <div style={{ padding: '1.2rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
                    No crew yet. Sign your first hands from the Recruit board.
                  </p>
                  <button onClick={() => setActiveTab('recruits')} className="font-cinzel font-700 uppercase tracking-[0.1em]"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.7rem 1.4rem', borderRadius: 12, background: 'linear-gradient(180deg, rgba(76,196,131,0.18), rgba(46,154,92,0.09))', border: '1px solid rgba(76,196,131,0.45)', color: '#7fdca6', fontSize: '0.74rem', cursor: 'pointer' }}>
                    <AnchorIcon /> Recruit Crew
                  </button>
                </div>
              ) : (() => {
                const maxSlots = state.shipCrewSlots
                const trawlSet = new Set(state.trawlingCrewIds)
                const voyageLockSet = new Set(state.lockedCrewIds)
                const raidParty   = state.roster.filter(c => c.raidSlot   != null).sort((a, b) => (a.raidSlot!   - b.raidSlot!))
                const voyageParty = state.roster.filter(c => c.voyageSlot != null).sort((a, b) => (a.voyageSlot! - b.voyageSlot!))
                const trawling    = state.roster.filter(c => trawlSet.has(c.id) && c.raidSlot == null && c.voyageSlot == null)
                const available   = state.roster.filter(c => c.raidSlot == null && c.voyageSlot == null && !trawlSet.has(c.id))
                const voyageAtSea = voyageParty.some(c => voyageLockSet.has(c.id))

                const card = (m: CrewMember) => (
                  <CrewPanel key={m.id} name={m.name} filename={m.filename} rarity={m.rarity}
                    bg={ROSTER_PANEL_BG} border={ROSTER_PANEL_BORDER}
                    base={{ power: m.power, dodge: m.dodge, fortune: m.fortune }} effects={m.effects} xp={m.xp} slug={m.slug}
                    assignment={crewAssignment(m)}
                    isCaptain={m.voyageSlot === 0 || m.raidSlot === 0}
                    locked={voyageLockSet.has(m.id) || trawlSet.has(m.id)}
                    lockKind={trawlSet.has(m.id) ? 'trawl' : 'voyage'}
                    lockLabel={trawlSet.has(m.id) ? 'This crew is out on a trawl. Collect it to free them up.' : 'This crew is currently at sea on a voyage.'}
                    hasLevelUp={(seenLevels[m.id] ?? crewLevelFromXP(m.xp)) < crewLevelFromXP(m.xp)}
                    hint={m.effects.length > 0 && !viewed.has(`roster:${m.id}`)}
                    onClick={() => openDetail('roster', m)}>
                    {renderAction('roster', m, { round: true })}
                  </CrewPanel>
                )
                const grid = (members: CrewMember[], empties: number, accent: string, onEmpty?: () => void) => (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.7rem' }}>
                    {members.map(card)}
                    {Array.from({ length: Math.max(0, empties) }).map((_, i) => (
                      <EmptySlotTile key={`empty-${i}`} color={accent} onClick={onEmpty ?? scrollToAvailable} />
                    ))}
                  </div>
                )

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <PartySection accent={ASSIGN_RAID} Icon={CrossedSwordsIconSvg} label="Raid Party" sub="fights at your side" count={raidParty.length} max={maxSlots} members={raidParty} collapsed={collapsed.has('raid')} onToggle={() => toggleCollapse('raid')}>
                      {grid(raidParty, maxSlots - raidParty.length, ASSIGN_RAID, () => setAssignTrack('raid'))}
                    </PartySection>

                    <PartySection accent={ASSIGN_VOYAGE} Icon={AnchorIconSvg} label="Voyage Party" sub={voyageAtSea ? 'at sea now' : 'sails for loot'} count={voyageParty.length} max={maxSlots} members={voyageParty} collapsed={collapsed.has('voyage')} onToggle={() => toggleCollapse('voyage')}>
                      {grid(voyageParty, maxSlots - voyageParty.length, ASSIGN_VOYAGE, () => setAssignTrack('voyage'))}
                    </PartySection>

                    {trawling.length > 0 && (
                      <PartySection accent="#3fc8aa" Icon={NetIconSvg} label="Out Trawling" sub="fishing — back soon" count={trawling.length} members={trawling} collapsed={collapsed.has('trawling')} onToggle={() => toggleCollapse('trawling')}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.7rem' }}>
                          {trawling.map(card)}
                        </div>
                      </PartySection>
                    )}

                    <div ref={availableRef} style={{ scrollMarginTop: 80 }}>
                      <PartySection accent={SECTION_ROSTER} Icon={BenchIconSvg} label="Available" sub="ready to assign" count={available.length} members={available} collapsed={collapsed.has('available')} onToggle={() => toggleCollapse('available')}>
                        {available.length === 0 ? (
                          <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', padding: '0.1rem 0 0.3rem' }}>
                            Every crew has a post. Recruit more to grow your fleet.
                          </p>
                        ) : grid(available, 0, SECTION_ROSTER)}
                      </PartySection>
                    </div>

                    <button onClick={() => setActiveTab('recruits')} className="font-cinzel font-700 uppercase tracking-[0.1em]"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0.8rem', borderRadius: 12, background: 'linear-gradient(180deg, rgba(76,196,131,0.16), rgba(46,154,92,0.08))', border: '1px solid rgba(76,196,131,0.4)', color: '#7fdca6', fontSize: '0.72rem', cursor: 'pointer' }}>
                      <AnchorIcon /> Recruit New Crew
                    </button>

                    {/* Assign modal — fill an open Raid/Voyage seat from the bench
                        without scrolling. Bottom sheet, accent-coded to the track. */}
                    {assignTrack && typeof document !== 'undefined' && createPortal((() => {
                      const accent = assignTrack === 'raid' ? ASSIGN_RAID : ASSIGN_VOYAGE
                      const HeaderIcon = assignTrack === 'raid' ? CrossedSwordsIconSvg : AnchorIconSvg
                      const label = assignTrack === 'raid' ? 'Raid Party' : 'Voyage Party'
                      return (
                        <div onClick={() => setAssignTrack(null)} style={{ position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(2,6,12,0.7)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}>
                          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: 'rgba(8,14,22,0.99)', borderTop: `2px solid ${accent}`, borderRadius: '18px 18px 0 0', boxShadow: '0 -12px 44px rgba(0,0,0,0.6)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '1rem 1rem 0.75rem' }}>
                              <span style={{ display: 'inline-flex', width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', background: `${accent}22`, border: `1px solid ${accent}66`, flexShrink: 0 }}>
                                <HeaderIcon size={16} color={accent} />
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.52rem', color: accent }}>Fill an open seat</p>
                                <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0ede8', lineHeight: 1.1 }}>Assign to {label}</p>
                              </div>
                              <button onClick={() => setAssignTrack(null)} aria-label="Close" className="tap" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e0ddd8', cursor: 'pointer' }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                              </button>
                            </div>
                            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '0 1rem 1.4rem' }}>
                              {available.length === 0 ? (
                                <p className="font-karla text-center" style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.55, padding: '1.4rem 0.5rem' }}>
                                  No crew on the bench. Free someone from another post, or recruit more hands.
                                </p>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                  {available.map(m => {
                                    const busy = busyId === m.id
                                    const rColor = RARITY_COLORS[(m.rarity as CrewRarity)] ?? 'rgba(255,255,255,0.12)'
                                    const art = m.filename ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-arts/${m.filename}` : ''
                                    return (
                                      <button
                                        key={m.id}
                                        disabled={pending}
                                        onClick={() => {
                                          const slot = nextOpenSlot(assignTrack)
                                          run(() => (assignTrack === 'raid' ? assignToRaid(m.id, slot) : assignToVoyage(m.id, slot)), m.id, () => setAssignTrack(null))
                                        }}
                                        className="tap"
                                        style={{
                                          display: 'flex', alignItems: 'center', gap: 11,
                                          padding: '0.55rem 0.65rem', borderRadius: 12, textAlign: 'left',
                                          background: busy ? `${accent}1e` : 'rgba(255,255,255,0.04)',
                                          border: `1px solid ${busy ? accent + '99' : 'rgba(255,255,255,0.1)'}`,
                                          cursor: pending ? 'default' : 'pointer', opacity: pending && !busy ? 0.5 : 1,
                                        }}
                                      >
                                        <div style={{ width: 42, height: 42, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: 'rgba(0,0,0,0.3)', border: `1px solid ${rColor}` }}>
                                          {art ? <img src={art} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <p className="font-pirata" style={{ fontSize: '0.98rem', color: '#f0ede8', lineHeight: 1.1 }}>{m.name}</p>
                                          <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.5)' }}>PWR {m.power} · AGI {m.dodge} · FTN {m.fortune}</p>
                                        </div>
                                        <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.62rem', color: accent, flexShrink: 0 }}>{busy ? '…' : 'Assign'}</span>
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })(), document.body)}
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
          // Skins (roster legendaries only). The portrait reflects the previewed
          // (or equipped) skin; the tab below lets the player preview/buy/equip.
          const dm = detail.kind === 'roster' ? (it as CrewMember) : null
          const skinList = dm ? crewSkinsForSlug(dm.slug) : []
          // Tab strip: Stats always, Ability if the crew has a class, Skins for a
          // legendary that has skins. activeTab falls back to Stats if the stored
          // tab isn't valid for this crew.
          const hasAbility = !!classForSlug(it.slug)
          const hasSkins = !!dm && skinList.length > 0
          const detailTabs = [
            { id: 'stats' as const, label: 'Stats' },
            ...(hasAbility ? [{ id: 'ability' as const, label: 'Ability' }] : []),
            ...(hasSkins ? [{ id: 'skins' as const, label: 'Skins' }] : []),
          ]
          const activeTab = detailTabs.some(t => t.id === detailTab) ? detailTab : 'stats'
          const equippedSkinId = dm ? (state.equippedCrewSkins[dm.slug] ?? null) : null
          const shownSkinId = previewSkin === undefined ? equippedSkinId : previewSkin
          const portraitFilename = dm
            ? (shownSkinId ? (getCrewSkin(shownSkinId)?.filename ?? dm.baseFilename) : dm.baseFilename)
            : it.filename
          // Frame stays the rarity color; the shown skin makes the ART glow via
          // an inner overlay that follows the arch shape (a drop-shadow on the
          // rectangular art poked past the arch curve — this stays inside it).
          const portraitSkin = shownSkinId ? getCrewSkin(shownSkinId)?.color : null
          const dBase = { power: it.power, dodge: it.dodge, fortune: it.fortune }
          // Board candidates haven't been recruited yet (no xp field) —
          // preview the hall XP seed stamped on their board row at roll
          // time, so the modal shows their true arrival level + stat
          // bonuses. Roster members carry their real xp.
          const dXp  = 'xp' in it ? it.xp : it.startXp
          const dEff = applyCrewEffects(dBase, it.effects, dXp)
          // Net trait stats — simplified system has one trait per crew, a
          // stat triple in [-3,+3] per stat. label/kind drive the row.
          const dTrait = netTraitStats(it.effects)
          const dTraitLabel = traitLabel(dTrait)
          const dTraitKind = traitKind(dTrait)
          const close = () => { setConfirmDismiss(null); setDetail(null); setStatsGlossaryOpen(false); setClassExpanded(false); setRenameOpen(false); setRenameErr(null); setPreviewSkin(undefined); setDetailTab('stats') }
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

                {/* Portrait — rarity frame; a shown skin makes the ART itself glow
                    in its color (drop-shadow aura on the image). clip-path keeps
                    the glow inside the arch so it never spills past the frame.
                    On the Skins tab it's a pure skin preview (no trait pill below
                    it), so the art centers + fills the frame to close the dead
                    space; other tabs keep the top-anchored framing. */}
                <div style={{ position: 'relative', width: 150, height: activeTab === 'skins' ? 150 : 158, margin: '0 auto', borderRadius: '70px 70px 6px 6px', overflow: 'hidden', clipPath: 'inset(0 round 70px 70px 6px 6px)', border: `2px solid ${dColor}`, boxShadow: `inset 0 -14px 24px rgba(0,0,0,0.65), 0 0 14px ${dColor}33`, background: `radial-gradient(ellipse at 50% ${activeTab === 'skins' ? 40 : 30}%, ${(portraitSkin ?? dColor)}26 0%, #070504 74%)` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={artSrc(portraitFilename)} alt={it.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: activeTab === 'skins' ? 'center' : 'center 20%', padding: activeTab === 'skins' ? 8 : 6, filter: portraitSkin ? `drop-shadow(0 0 6px ${portraitSkin}) drop-shadow(0 0 16px ${portraitSkin})` : undefined, transition: 'filter 0.25s' }} />
                </div>
                {/* Crew name + one-shot rename. Roster crew with no
                    nickname yet get a small pencil next to the name; tap
                    to swap into an inline input. Already-named or board
                    recruits just show the static name. */}
                {(() => {
                  const isRoster = detail.kind === 'roster'
                  const m = isRoster ? (it as CrewMember) : null
                  const canRename = isRoster && m && m.nickname === null
                  if (renameOpen && canRename && m) {
                    return (
                      <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={e => setRenameDraft(e.target.value)}
                          maxLength={30}
                          placeholder={it.name}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); commitRename(m.id) }
                            if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
                          }}
                          className="font-pirata"
                          style={{
                            width: '100%', maxWidth: 240,
                            textAlign: 'center', fontSize: '1.5rem',
                            color: '#ecdcbd', background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(240,192,64,0.55)',
                            borderRadius: 8, padding: '0.3rem 0.6rem',
                            outline: 'none',
                          }}
                        />
                        <p className="font-karla" style={{ fontSize: '0.6rem', color: 'rgba(240,192,64,0.7)', textAlign: 'center', lineHeight: 1.35 }}>
                          You can only name a crew member once.
                        </p>
                        {renameErr && (
                          <p className="font-karla" style={{ fontSize: '0.66rem', color: '#f2b0b0', textAlign: 'center' }}>{renameErr}</p>
                        )}
                        <div className="flex" style={{ gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => commitRename(m.id)}
                            disabled={renameSaving}
                            className="font-karla font-700 uppercase"
                            style={{
                              padding: '0.4rem 1rem', fontSize: '0.66rem', letterSpacing: '0.08em',
                              background: 'linear-gradient(180deg, rgba(74,200,130,0.36), rgba(46,140,92,0.2))',
                              border: '1px solid rgba(122,226,162,0.6)', color: '#dcf8e7',
                              borderRadius: 7, cursor: renameSaving ? 'not-allowed' : 'pointer',
                              opacity: renameSaving ? 0.6 : 1,
                            }}
                          >{renameSaving ? 'Saving…' : 'Save'}</button>
                          <button
                            type="button"
                            onClick={cancelRename}
                            disabled={renameSaving}
                            className="font-karla font-700 uppercase"
                            style={{
                              padding: '0.4rem 1rem', fontSize: '0.66rem', letterSpacing: '0.08em',
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.7)',
                              borderRadius: 7, cursor: 'pointer',
                            }}
                          >Cancel</button>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, marginTop: '0.6rem' }}>
                      <p className="font-pirata" style={{ textAlign: 'center', fontSize: '1.7rem', color: '#ecdcbd', lineHeight: 1.05 }}>{it.name}</p>
                      {canRename && (
                        <button
                          type="button"
                          onClick={() => startRename(it.name)}
                          aria-label="Rename this crew (one time only)"
                          title="Rename · once only"
                          className="font-karla font-700 uppercase"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '0.35rem 0.8rem',
                            fontSize: '0.62rem', letterSpacing: '0.1em',
                            color: '#f0c040',
                            background: 'rgba(240,192,64,0.1)',
                            border: '1px solid rgba(240,192,64,0.5)',
                            borderRadius: 999, cursor: 'pointer',
                            boxShadow: '0 0 10px rgba(240,192,64,0.18)',
                            transition: 'background 0.15s, box-shadow 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(240,192,64,0.18)'; e.currentTarget.style.boxShadow = '0 0 14px rgba(240,192,64,0.28)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(240,192,64,0.1)';  e.currentTarget.style.boxShadow = '0 0 10px rgba(240,192,64,0.18)' }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
                          </svg>
                          <span>Name them</span>
                          <span style={{ color: 'rgba(240,192,64,0.55)', fontSize: '0.52rem', letterSpacing: '0.06em' }}>· 1×</span>
                        </button>
                      )}
                    </div>
                  )
                })()}
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

                {/* Tab strip — splits the detail into Stats / Ability / Skins so
                    it isn't a wall of info. Only shows tabs that apply. */}
                {detailTabs.length > 1 && (
                  <div style={{ display: 'flex', gap: 5, marginTop: '0.95rem', padding: 4, background: 'rgba(0,0,0,0.28)', borderRadius: 11, border: '1px solid rgba(255,255,255,0.06)' }}>
                    {detailTabs.map(t => {
                      const on = activeTab === t.id
                      return (
                        <button key={t.id} type="button"
                          onClick={() => { vibrate(5); setDetailTab(t.id) }}
                          className="font-karla font-700 uppercase"
                          style={{
                            flex: 1, padding: '0.5rem 0.3rem', borderRadius: 8,
                            fontSize: '0.62rem', letterSpacing: '0.09em',
                            background: on ? `${dColor}26` : 'transparent',
                            border: `1px solid ${on ? dColor + '88' : 'transparent'}`,
                            color: on ? '#f4ecd8' : 'rgba(255,255,255,0.5)',
                            boxShadow: on ? `0 0 12px ${dColor}33` : 'none',
                            cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                          }}>
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Fixed-min-height tab body so the modal doesn't jump between
                    tabs. Only grows past this if the player expands the ability
                    milestones or the stat glossary (both opt-in). */}
                <div style={{ minHeight: 292 }}>

                {/* ── ABILITY tab — species-locked active ability surfaced in raid
                    combat through the Special chooser. Sub-Lv-10 crew get an
                    "Unlocks at Lv 10" hint instead of an effect line. */}
                {activeTab === 'ability' && (
                <motion.div key="tab-ability" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }} style={{ marginTop: '0.7rem' }}>
                {(() => {
                  const cls = classForSlug(it.slug)
                  if (!cls) return null
                  const def: AnyClassDef = CLASSES[cls]
                  const lv = crewLevelFromXP(dXp)
                  const cur = currentMilestone(def, lv)
                  const next = nextMilestone(def, lv)
                  const accent = def.color
                  return (
                    <button
                      type="button"
                      onClick={() => setClassExpanded(v => !v)}
                      aria-expanded={classExpanded}
                      aria-label={classExpanded ? 'Hide full ability progression' : 'Show full ability progression'}
                      style={{
                        padding: '0.65rem 0.75rem 0.7rem',
                        background: `${accent}0e`,
                        border: `1px solid ${accent}44`,
                        borderRadius: 9,
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        display: 'block',
                        transition: 'background 0.18s, border-color 0.18s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span aria-hidden style={{ color: accent, fontSize: '0.95rem', lineHeight: 1 }}>{def.emoji}</span>
                          <p className="font-cinzel font-700 uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.1em', color: accent, lineHeight: 1 }}>{def.name}</p>
                        </div>
                        <div className="flex items-baseline" style={{ gap: 6 }}>
                          <p className="font-karla font-700" style={{ fontSize: '0.56rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
                            Active · once per raid
                          </p>
                          <span aria-hidden style={{
                            fontSize: '0.5rem', color: `${accent}99`,
                            transform: classExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s',
                            display: 'inline-block',
                          }}>▼</span>
                        </div>
                      </div>
                      {!classExpanded ? (
                        <>
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
                          <p className="font-karla font-600" style={{ fontSize: '0.56rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: `${accent}99`, marginTop: 6 }}>
                            Tap to see all milestones →
                          </p>
                        </>
                      ) : (
                        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {def.milestones.map(m => {
                            const unlocked = lv >= m.unlockLevel
                            const isCurrent = cur && cur.unlockLevel === m.unlockLevel
                            return (
                              <div key={m.unlockLevel} style={{
                                display: 'flex', alignItems: 'baseline', gap: 8,
                                padding: '0.4rem 0.5rem',
                                background: isCurrent ? `${accent}1f` : 'transparent',
                                border: isCurrent ? `1px solid ${accent}66` : '1px solid transparent',
                                borderRadius: 6,
                                opacity: unlocked ? 1 : 0.55,
                              }}>
                                <span className="font-cinzel font-700" style={{
                                  flexShrink: 0,
                                  fontSize: '0.6rem', letterSpacing: '0.08em',
                                  color: unlocked ? accent : 'rgba(255,255,255,0.4)',
                                  minWidth: 30,
                                }}>
                                  Lv {m.unlockLevel}
                                </span>
                                <span className="font-karla" style={{
                                  fontSize: '0.72rem', lineHeight: 1.35,
                                  color: unlocked ? '#ecdcbd' : 'rgba(255,255,255,0.45)',
                                  fontWeight: isCurrent ? 700 : 400,
                                }}>
                                  {m.desc}
                                </span>
                                {isCurrent && (
                                  <span aria-hidden className="font-karla font-700" style={{
                                    flexShrink: 0,
                                    fontSize: '0.46rem', letterSpacing: '0.1em', textTransform: 'uppercase',
                                    color: accent, marginLeft: 'auto',
                                  }}>Now</span>
                                )}
                              </div>
                            )
                          })}
                          <p className="font-karla font-600" style={{ fontSize: '0.56rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                            Tap to collapse ▲
                          </p>
                        </div>
                      )}
                    </button>
                  )
                })()}
                </motion.div>
                )}

                {/* ── SKINS tab — legendary crew only. Preview (tap a tile), unlock
                    with gems, equip. The equipped skin shows everywhere in-game. */}
                {activeTab === 'skins' && dm && skinList.length > 0 && (
                <motion.div key="tab-skins" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }} style={{ marginTop: '0.7rem' }}>
                {(() => {
                  const owned = state.ownedCrewSkins
                  const tiles: { id: string | null; name: string; file: string; cost: number; color: string; chase?: boolean }[] = [
                    { id: null, name: 'Original', file: dm.baseFilename, cost: 0, color: dColor },
                    ...skinList.map(s => ({ id: s.id, name: s.name, file: s.filename, cost: s.gemCost, color: s.color, chase: s.chase })),
                  ]
                  const selName = shownSkinId ? (getCrewSkin(shownSkinId)?.name ?? 'Skin') : 'Original'
                  const selOwned = shownSkinId === null || owned.includes(shownSkinId)
                  const selEquipped = shownSkinId === equippedSkinId
                  const selCost = shownSkinId ? (getCrewSkin(shownSkinId)?.gemCost ?? 0) : 0
                  const canAfford = state.gems >= selCost
                  return (
                    <div>
                      <div className="flex items-baseline justify-between" style={{ marginBottom: 8 }}>
                        <p className="font-cinzel font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)' }}>Skins</p>
                        <p className="font-karla font-400" style={{ fontSize: '0.54rem', color: 'rgba(255,255,255,0.32)' }}>tap an owned skin to equip</p>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
                        {tiles.map(t => {
                          const isSel = shownSkinId === t.id
                          const isEquipped = (t.id ?? null) === equippedSkinId
                          const isOwned = t.id === null || owned.includes(t.id)
                          return (
                            <button key={t.id ?? 'original'} type="button"
                              onClick={() => {
                                vibrate(6)
                                setPreviewSkin(t.id)
                                // Owned skin → tapping equips it straight away (no
                                // separate button step). Locked skins just preview,
                                // surfacing the Unlock action below.
                                if (isOwned && !isEquipped) runSkinAction(`equip:${t.id ?? 'base'}`, () => equipCrewSkin(dm.slug, t.id))
                              }}
                              style={{
                                position: 'relative', padding: 0, borderRadius: 10, overflow: 'visible', cursor: 'pointer',
                                border: `2px solid ${isSel ? t.color : 'rgba(255,255,255,0.14)'}`,
                                background: '#0a0806', aspectRatio: '1 / 1',
                                opacity: isOwned ? 1 : 0.9,
                              }}>
                              {/* The skin ART itself glows — a drop-shadow aura in the
                                  skin color (like the summon). objectFit contain leaves
                                  a letterbox so the glow shows even though the tile clips. */}
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={artSrc(t.file)} alt={t.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center 28%', padding: 7, filter: t.id === null ? undefined : `drop-shadow(0 0 5px ${t.color}) drop-shadow(0 0 13px ${t.color}${isSel ? 'ee' : 'aa'})` }} />
                              {t.chase && !isEquipped && (
                                <span className="font-karla font-800" style={{ position: 'absolute', top: 3, left: 3, background: t.color, color: '#0a0806', fontSize: '0.42rem', letterSpacing: '0.06em', borderRadius: 4, padding: '1px 3px', lineHeight: 1 }}>CHASE</span>
                              )}
                              {isEquipped && (
                                <span style={{ position: 'absolute', top: 3, right: 3, width: 15, height: 15, borderRadius: '50%', background: t.color, color: '#0a0806', fontSize: '0.6rem', fontWeight: 800, display: 'grid', placeItems: 'center', lineHeight: 1 }}>✓</span>
                              )}
                              {!isOwned && (
                                <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(3,2,5,0.78)', color: '#c9b6f5', fontSize: '0.52rem', fontWeight: 700, textAlign: 'center', padding: '2px 0' }}>{t.cost} <span style={{ color: '#a78bfa' }}>◆</span></span>
                              )}
                            </button>
                          )
                        })}
                      </div>

                      {/* Selected-skin name + action */}
                      <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#eae4da', textAlign: 'center', marginTop: 9 }}>{selName}</p>
                      {shownSkinId && getCrewSkin(shownSkinId)?.blurb && (
                        <p className="font-karla font-400" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.42)', textAlign: 'center', marginTop: 1 }}>{getCrewSkin(shownSkinId)!.blurb}</p>
                      )}
                      <div style={{ marginTop: 9 }}>
                        {selEquipped ? (
                          <p className="font-karla font-700 uppercase tracking-[0.08em] text-center" style={{ padding: '0.5rem', fontSize: '0.6rem', color: '#8fd39a', letterSpacing: '0.08em' }}>✓ Equipped · shows everywhere</p>
                        ) : selOwned ? (
                          <button type="button" disabled={!!skinBusy}
                            onClick={() => runSkinAction(`equip:${shownSkinId ?? 'base'}`, () => equipCrewSkin(dm.slug, shownSkinId))}
                            className="font-karla font-700 uppercase tracking-[0.08em] w-full"
                            style={{ padding: '0.6rem', borderRadius: 11, fontSize: '0.64rem', background: 'rgba(96,165,250,0.16)', border: '1px solid rgba(96,165,250,0.55)', color: '#cfe2ff', cursor: 'pointer', opacity: skinBusy ? 0.5 : 1 }}>
                            {skinBusy ? '…' : 'Equip'}
                          </button>
                        ) : (
                          <button type="button" disabled={!!skinBusy || !canAfford}
                            onClick={() => runSkinAction(`buy:${shownSkinId}`, () => buyCrewSkin(shownSkinId as string))}
                            className="font-karla font-700 uppercase tracking-[0.08em] w-full"
                            style={{ padding: '0.6rem', borderRadius: 11, fontSize: '0.64rem', background: canAfford ? 'rgba(240,192,64,0.16)' : 'rgba(255,255,255,0.04)', border: `1px solid ${canAfford ? 'rgba(240,192,64,0.6)' : 'rgba(255,255,255,0.12)'}`, color: canAfford ? '#f7e6b0' : 'rgba(255,255,255,0.4)', cursor: canAfford ? 'pointer' : 'default', opacity: skinBusy ? 0.5 : 1 }}>
                            {skinBusy ? '…' : canAfford ? `Unlock · ${selCost} ◆` : `Need ${selCost} ◆`}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })()}
                </motion.div>
                )}

                {/* ── STATS tab — stat grid, trained-from breakdown, glossary, trait. */}
                {activeTab === 'stats' && (
                <motion.div key="tab-stats" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }} style={{ marginTop: '0.7rem' }}>
                {/* Stats header + ? toggle. Inline glossary below
                    explains what each stat actually does in raids +
                    voyages — match the Traits header styling above. */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
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
                      {' · '}<span style={{ color: STAT_COLOR.dodge }}>+{bonus.dodge} SAV</span>
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

                {/* Trait — under the new system each crew has at most one
                    stat-only trait (a {power,dodge,fortune} delta with
                    each value in [-3,+3]). Show the generated label as
                    the row title and a compact stat line ('+2 PWR · -1
                    SAV') as the summary; buff/flaw/neutral color tracks
                    the net direction. No description to expand any more
                    — the line IS the description. */}
                {dTraitLabel && (
                  <>
                    <p className="font-cinzel font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', marginBottom: '0.3rem' }}>Trait</p>
                    <div style={{
                      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                      gap: 8, padding: '0.4rem 0', marginBottom: '0.6rem',
                    }}>
                      <span className="font-cinzel font-700" style={{
                        fontSize: '0.86rem', fontStyle: 'italic',
                        color: dTraitKind === 'buff' ? '#9fd9b1' : dTraitKind === 'flaw' ? '#e09a9a' : 'rgba(255,255,255,0.6)',
                      }}>
                        {dTraitLabel}
                      </span>
                      <span className="font-karla font-700" style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', fontSize: '0.7rem' }}>
                        {(['power','dodge','fortune'] as const).map(k => {
                          const v = dTrait[k]
                          if (v === 0) return null
                          return (
                            <span key={k} style={{ color: v > 0 ? '#7fdfa3' : '#f08a8a', whiteSpace: 'nowrap' }}>
                              {v > 0 ? '+' : ''}{v} {STAT_LABEL[k]}
                            </span>
                          )
                        })}
                      </span>
                    </div>
                  </>
                )}
                </motion.div>
                )}

                </div>{/* end fixed-min-height tab body */}

                {/* ── Actions (always visible below the tabs) ────────────────────
                    Make Captain — only for roster crew on a track but not already
                    at slot 0. promoteToCaptain figures the track from the row. Sits
                    just above Dismiss so the destructive action stays at the bottom. */}
                {detail.kind === 'roster' && (() => {
                  const m = it as CrewMember
                  const onVoyage = m.voyageSlot !== null
                  const onRaid   = m.raidSlot   !== null
                  const isCap    = m.voyageSlot === 0 || m.raidSlot === 0
                  if (isCap) return null
                  if (!onVoyage && !onRaid) return null  // benched — nothing to promote within
                  const trackLabel = onVoyage ? 'Voyage' : 'Raid'
                  const accent = onVoyage ? ASSIGN_VOYAGE : ASSIGN_RAID
                  return (
                    <button
                      type="button"
                      onClick={() => run(() => promoteToCaptain(m.id), m.id, close)}
                      disabled={pending}
                      className="font-karla font-700"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        width: '100%', padding: '0.55rem',
                        borderRadius: 9, marginBottom: 8,
                        fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase',
                        background: `linear-gradient(180deg, ${accent}28 0%, ${accent}10 100%)`,
                        border: `1px solid ${accent}88`,
                        color: '#1a1206',
                        cursor: pending ? 'not-allowed' : 'pointer',
                        opacity: pending ? 0.6 : 1,
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#f0c040" stroke="#1a1206" strokeWidth="1.2" strokeLinejoin="round">
                        <path d="M5 17h14l1-9-5 3.5L12 5 9 11.5 4 8z" />
                      </svg>
                      <span style={{ color: accent, textShadow: '0 1px 1px rgba(0,0,0,0.4)' }}>
                        Make Captain ({trackLabel})
                      </span>
                    </button>
                  )
                })()}

                {renderAction(detail.kind, it, { onDone: close })}
              </motion.div>
            </motion.div>
          )
        })()}
      </AnimatePresence>
    </div>
  )
}

// Local Stat pill component was used by the gems/nav/roster header
// strip. That strip was dropped to declutter the top of the page
// (gems + nav level live in the Nav, roster count repeats in the tab
// label + the section header). Component removed.
