'use client'

import { useState, useEffect, useRef, useTransition, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  rerollBoard, recruitCrew, dismissCrew, getCrewGraveyard,
  assignToVoyage, assignToRaid, benchCrew, promoteToCaptain, renameCrew,
  upgradeCrewHall,
  type CrewState, type BoardCandidate, type CrewMember, type CrewActionResult, type FallenCrew,
} from './actions'
import { hallTierDef, nextHallTier, CREW_HALL_MAX_TIER } from '@/lib/crewHall'
import { crewAssignment } from '@/lib/crewAssignment'
import { RARITY_NAMES, RARITY_COLORS, type CrewRarity } from '@/lib/crewGen'
import { applyCrewEffects, netTraitStats, traitLabel, traitKind } from '@/lib/crewEffects'
import { useReveal, BoardReveal, RevealFlash, RevealBanner } from './boardReveal'
import { ROUTE_CONFIGS, type VoyageRoute } from '@/lib/voyageRoutes'
import { crewLevelFromXP, crewXPProgress, levelStatBonuses, CREW_MAX_LEVEL } from '@/lib/crewLevel'
import { classForSlug, CLASSES, currentMilestone, nextMilestone, CLASS_UNLOCK_LEVEL, type AnyClassDef } from '@/lib/crewClasses'
// TickingNumber + the local Stat helper were used by the removed
// gems/nav/roster pill row in the header. Dropped along with them.

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const artSrc = (filename: string) => `${SUPA}/storage/v1/object/public/card-arts/${filename}`

const STAT_COLOR = { power: '#f87171', dodge: '#60a5fa', fortune: '#f0c040' }
const STAT_LABEL = { power: 'PWR', dodge: 'AGI', fortune: 'FTN' }

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
  name, filename, rarity, base, effects, xp = 0, slug = '', assignment, isCaptain = false, locked = false, hasLevelUp = false, dimmed, hint, frameAccent = '#5c5c63',
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
  /** True when this crew is at sea on an in-progress voyage and can't be
   *  reassigned. Greys the card out and disables the toggle buttons. */
  locked?: boolean
  /** True when the crew has leveled up since the player last opened it.
   *  Drives a filled Lv chip + small NEW dot so the player knows to tap
   *  in and see what stat/ability tier they just unlocked. Tracked via
   *  localStorage 'crewSeenLevels' in the parent. */
  hasLevelUp?: boolean
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
      {/* The "has traits — tap to view" halo glow was removed entirely.
          Players asked for a quieter card silhouette with no glow around
          the whole card. Trait count is still readable on the rarity
          line ('Epic · 2 traits') and the full list surfaces when the
          card opens, so the discovery cue is preserved without coloring
          the card's perimeter. `hint` prop kept for API stability — no-op. */}
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
          const label   = (isCaptain ? 'Captain · ' : '') + (assignment === 'voyage' ? 'On Voyage' : 'On Raid')
          const Icon    = assignment === 'voyage' ? AnchorIconSvg : CrossedSwordsIconSvg
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
              {isCaptain && (
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
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate([18, 50, 26])
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
              {/* Recruit — always gold so it reads as THE action, not just
                  another view. Full gold gradient when active, gold-tinted
                  outline when resting. */}
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
                  background: recruitsActive
                    ? 'linear-gradient(180deg, #d9b563 0%, #a8842f 100%)'
                    : 'rgba(201,162,74,0.1)',
                  border: `1px solid ${recruitsActive ? 'rgba(240,214,150,0.85)' : 'rgba(201,162,74,0.5)'}`,
                  color: recruitsActive ? '#2a1c08' : '#e8c87a',
                  boxShadow: recruitsActive ? '0 3px 12px rgba(201,162,74,0.35), inset 0 1px 0 rgba(255,240,200,0.5)' : 'none',
                  textShadow: recruitsActive ? '0 1px 1px rgba(255,238,200,0.4)' : 'none',
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
          {/* Reroll row — the button used to float centered in its own row
              (a pill with dead space either side); now it fills the left of
              a single row and the free-roll countdown sits in the space to
              its right as a compact two-line block. Squarer corners so it
              reads as part of the hall panel, not a floating CTA. */}
          {(() => {
            const cannot = pending || reveal.revealing || state.gems < state.rerollCost
            return (
              <div className="flex items-center" style={{ gap: 12, marginBottom: '1.1rem' }}>
                <motion.button
                  onClick={handleReroll}
                  disabled={cannot}
                  title="Spend gems for 3 brand-new recruits"
                  whileTap={cannot ? undefined : { scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 18 }}
                  className="font-cinzel font-700 uppercase"
                  style={{
                    flex: '1 1 auto', minWidth: 0,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                    padding: '0.62rem 1rem', borderRadius: 10,
                    fontSize: '0.82rem', letterSpacing: '0.07em',
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
                  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, fontSize: '0.8rem', letterSpacing: 0 }}>{state.rerollCost}<span style={{ color: cannot ? 'rgba(90,63,184,0.45)' : '#4f2fb0' }}>◆</span></span>
                </motion.button>
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
        <div ref={crewSectionRef} style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)', padding: '0.85rem 0.85rem 1rem', scrollMarginTop: 70 }}>
          {/* Section heading + right-side count pill BOTH dropped — the
              top-level tabs ('Roster · 8' / 'Graves · 2') already carry
              both pieces of information and an accent bar + h2 + right
              pill below them was just visual noise. The roster grid is
              the focus now; sub-filter sits directly under the panel
              border. */}

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
                  { id: 'all'    as const, label: 'All',     accent: SECTION_ROSTER },
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
              {/* Slot-unlock cadence tip ('every 10 Nav levels') was here
                  but added a line of muted text new players had to read
                  before reaching the actual roster grid. Dropped — players
                  see the bump organically when they level up. */}
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
                        isCaptain={m.voyageSlot === 0 || m.raidSlot === 0}
                        locked={state.lockedCrewIds.includes(m.id)}
                        hasLevelUp={(seenLevels[m.id] ?? crewLevelFromXP(m.xp)) < crewLevelFromXP(m.xp)}
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
          const close = () => { setConfirmDismiss(null); setDetail(null); setStatsGlossaryOpen(false); setClassExpanded(false); setRenameOpen(false); setRenameErr(null) }
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
                    <button
                      type="button"
                      onClick={() => setClassExpanded(v => !v)}
                      aria-expanded={classExpanded}
                      aria-label={classExpanded ? 'Hide full ability progression' : 'Show full ability progression'}
                      style={{
                        marginTop: '0.9rem',
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

                {/* Trait — under the new system each crew has at most one
                    stat-only trait (a {power,dodge,fortune} delta with
                    each value in [-3,+3]). Show the generated label as
                    the row title and a compact stat line ('+2 PWR · -1
                    AGI') as the summary; buff/flaw/neutral color tracks
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

                {/* Make Captain — only for roster crew that are on a track
                    but not already at slot 0. The track they're on doesn't
                    need to be picked separately; promoteToCaptain figures
                    it out from voyage_slot / raid_slot on the row. Sits
                    just above Dismiss so the destructive action stays at
                    the bottom of the modal. */}
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
