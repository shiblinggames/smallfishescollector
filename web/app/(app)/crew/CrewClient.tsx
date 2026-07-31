'use client'

import { useState, useEffect, useRef, useTransition, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  rerollBoard, recruitCrew, dismissCrew, getCrewGraveyard,
  assignToVoyage, assignToRaid, benchCrew, promoteToCaptain, renameCrew,
  upgradeCrewHall, buyCrewSkin, equipCrewSkin, gambleBloodSkin, markCrewGuideSeen,
  type CrewState, type BoardCandidate, type CrewMember, type CrewActionResult, type FallenCrew,
} from './actions'
import { BLOOD_REROLL_TIERS, BLOOD_SKIN_GAMBLE_COST } from '@/lib/gauntlet'
import { crewSkinsForSlug, getCrewSkin, getCrewSkinByFilename, skinArtGlow, CREW_SKINS } from '@/lib/crewSkins'
import { ChaseSkinFx } from '@/components/ChaseSkinFx'
import { hallTierDef, nextHallTier, CREW_HALL_MAX_TIER } from '@/lib/crewHall'
import { crewAssignment } from '@/lib/crewAssignment'
import { RARITY_NAMES, RARITY_COLORS, groupForSlug, crewDisplayName, GEM_WEIGHTS, type CrewRarity } from '@/lib/crewGen'
import { applyCrewEffects, netTraitStats, traitLabel, traitKind } from '@/lib/crewEffects'
import AssignBoard from './AssignBoard'
import AssignPicker from './AssignPicker'
import { useReveal, BoardReveal, RevealFlash, RevealBanner } from './boardReveal'
import { ROUTE_CONFIGS, type VoyageRoute } from '@/lib/voyageRoutes'
import { crewLevelFromXP, crewXPProgress, levelStatBonuses, CREW_MAX_LEVEL } from '@/lib/crewLevel'
import { classForSlug, CLASSES, currentMilestone, nextMilestone, CLASS_UNLOCK_LEVEL, type AnyClassDef } from '@/lib/crewClasses'
import { vibrate, hapticTap } from '@/lib/haptics'
import SwipeAction from '@/components/SwipeAction'
import { playChestSfx } from '@/lib/fishingMusic'
import GuideCoach from '@/components/GuideCoach'
import { GUIDES } from '@/lib/onboardingScenes'
import Link from 'next/link'

// First-time Crew Hall guide — flashes each tab in the order the tab bar shows
// them and says plainly what it's for. Blood offerings live inside Recruit and
// Skins now, and the fallen are a button inside Roster, so neither needs a step.
//
// ASSIGN LEADS, because it is the first tab and the one that actually changes
// how you perform: a full roster does nothing until somebody is in a seat. The
// guide used to open on Recruit and tell players they assign crew from the
// Roster, which has not been true since Assign was split out.
const CREW_GUIDE: { tab: 'assign' | 'recruits' | 'roster' | 'wardrobe'; portrait: string; speaker: string; text: string }[] = [
  { tab: 'assign',   portrait: GUIDES.kat.portrait,  speaker: 'Kat',  text: "This is your Crew Hall. *Assign* is where you seat your crew: a raid party and a voyage party. Empty seats are wasted crew, so fill them." },
  { tab: 'assign',   portrait: GUIDES.doby.portrait, speaker: 'Doby', text: "Each party totals up the power, savvy and fortune of everyone seated. A hand can only be in one place at a time, so choose." },
  { tab: 'recruits', portrait: GUIDES.doby.portrait, speaker: 'Doby', text: "Sign on new hands in the *Recruit* tab. You get free picks that refresh over time." },
  { tab: 'roster',   portrait: GUIDES.kat.portrait,  speaker: 'Kat',  text: "Your *Roster* is every hand you own. They level up from raids and voyages, and this is where you check what you have got." },
  { tab: 'wardrobe', portrait: GUIDES.doby.portrait, speaker: 'Doby', text: "The *Skins* tab has cosmetic looks for your legendary crew. Purely for style." },
]
// TickingNumber + the local Stat helper were used by the removed
// gems/nav/roster pill row in the header. Dropped along with them.

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const artSrc = (filename: string) => `${SUPA}/storage/v1/object/public/card-arts/${filename}`

// Blood Gem accent + glyph (Hardcore Gauntlet premium currency).
const BLOOD = '#d1394b'

// Per-reroll odds from a set of per-candidate C/R/E/L weights (3 candidates a
// reroll). Used to show players the Epic % / Legendary 1-in-N a tier buys.
const perRerollPct = (perCandPct: number) => 1 - Math.pow(1 - perCandPct / 100, 3)
const rerollEpicPct = (w: readonly number[]) => Math.round(perRerollPct(w[2]) * 100)
const rerollLegOdds = (w: readonly number[]) => Math.max(1, Math.round(1 / perRerollPct(w[3])))
// "How many times better than a plain reroll" — the noob-friendly benefit (e.g.
// 5× Epic). idx 2 = Epic, 3 = Legendary. Base = GEM_WEIGHTS.
const rerollMult = (w: readonly number[], idx: 2 | 3, base: readonly number[]) => Math.max(2, Math.round(perRerollPct(w[idx]) / perRerollPct(base[idx])))
function BloodDrop({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ filter: `drop-shadow(0 0 2.5px ${BLOOD}99)`, flexShrink: 0 }}>
      <path d="M12 2s7 8.6 7 13a7 7 0 1 1-14 0c0-4.4 7-13 7-13z" fill={BLOOD} />
      <path d="M9.2 12.4a3.4 3.4 0 0 0-.2 4.2" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  )
}

// Bars are drawn against a FIXED ceiling, not each crew's own best stat, so a
// bar means the same thing on every card and two recruits can be compared by
// glancing at them.
//
// The ceiling is the BASE-ROLL top, not the level-100 top. The bar's job is
// "how good is this one", and the surface where that is an actual decision is
// the recruit board: three candidates, always level 1. Against a level-100
// ceiling (58) every fresh card landed between 5% and 40%, squashing the whole
// comparison into the bottom third of the track. Against the base ceiling each
// rarity gets its own band - measured over 20k rolls of the live generator,
// median peak stat by rarity is 6 / 10 / 15 / 22, with legendary topping out
// at 28.
//
// 30 leaves headroom for trait bonuses on top of the roll. Levelled crew simply
// peg full, which is fine: "maxed" is useful for a bar to say, and the printed
// number beside it still separates one maxed crew from another.
const STAT_BAR_MAX = 30
const STAT_ABOUT: Record<'power' | 'dodge' | 'fortune', string> = {
  power:   'Damage your shots deal in raids. Drives encounter events on voyages.',
  dodge:   'Dodge chance against enemy hits in raids. Slips past danger events on voyages.',
  fortune: 'Better loot and repair-kit rolls in raids. Drives discovery payouts on voyages.',
}

const STAT_COLOR = { power: '#f87171', dodge: '#60a5fa', fortune: '#f0c040' }
const STAT_LABEL = { power: 'PWR', dodge: 'SAV', fortune: 'FTN' }

// Section accents so the two boards read as visually distinct regions.
const SECTION_ROSTER = '#6fa8c9'  // cool steel "your manifest"
const SECTION_NEUTRAL = '#9aa3b1'  // a plain manifest, not a track

// Panel tones: warm brown wood for the board, cool slate for your own crew, so
// the two are obviously different at a glance.
// Card panels were tinted warm-brown (recruits) and cool-slate (roster),
// then flattened to neutral charcoal so the colored elements could pop.
// 2026-07 warmth pass: the charcoal read as an app dashboard, so the panels
// shift to a QUIET dark timber — same calm-backdrop property (colored chips
// still pop; this is far more muted than the badges-page brown), but the
// temperature is the ship's, not a settings screen's.
const PANEL_BG     = 'linear-gradient(157deg, #201a10 0%, #100c07 100%)'
const PANEL_BORDER = '#3a3122'
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

// Raid / Voyage accents, handed to AssignBoard. The third (Bench) went with
// the roster cards' quick-assign toggles, as did AssignToggleBtn and the
// anchor/swords/bench icons that only that control used - assignment is the
// Assign tab's job now.
const ASSIGN_VOYAGE = '#5fa8c9'
const ASSIGN_RAID   = '#e07c7c'

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



// Bright dashed "open seat" tile in the Raid / Voyage parties so capacity (and
// the way to fill it) reads at a glance. A gentle pulse draws the eye; tapping
// opens the assign modal.
function EmptySlotTile({ color, onClick }: { color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="font-karla font-700" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7,
      minHeight: 92, borderRadius: 14, cursor: 'pointer', width: '100%',
      background: `linear-gradient(180deg, ${color}30 0%, ${color}14 100%), rgba(12,17,25,0.97)`,
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
  name, filename, rarity, base, effects, xp = 0, slug = '', assignment, isCaptain = false, locked = false, lockKind = 'voyage', lockLabel = 'This crew is currently at sea on a voyage.', hasLevelUp = false, aboard = false, dimmed, hint, frameAccent = '#5c5c63',
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
   *  Grays the card out and disables the toggle buttons. */
  locked?: boolean
  /** Which kind of lock this is — drives the badge color + the visible
   *  "at sea" / "on a trawl" caption so the two read apart at a glance
   *  (the tooltip alone is invisible on mobile). */
  lockKind?: 'voyage' | 'trawl'
  /** Tooltip on the lock badge — distinguishes voyage vs trawl. */
  lockLabel?: string
  /** Board candidate already signed on. Reads as a pip on the portrait, the
   *  same corner language the roster uses for at-sea / trawling, rather than
   *  a footer pill - board and roster cards have to read identically. */
  aboard?: boolean
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
  const skinDef = getCrewSkinByFilename(filename)
  const skinGlow = skinDef?.color
  const skinChase = !!skinDef?.chase
  const skinGlowFilter = skinGlow ? skinArtGlow(skinGlow, rarity, false) : undefined
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
        {/* Arched portrait niche. clip-path (not just overflow:hidden) so an
            equipped-skin drop-shadow glow is clipped to the arch instead of
            bleeding past the rounded top. */}
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '46px 46px 5px 5px', overflow: 'hidden',
          clipPath: 'inset(0 round 46px 46px 5px 5px)',
          border: `2px solid ${color}`,
          boxShadow: `inset 0 -12px 20px rgba(0,0,0,0.65), 0 0 10px ${color}33`,
          background: `radial-gradient(ellipse at 50% 30%, ${color}26 0%, #070504 74%)`,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={artSrc(filename)} alt={name} loading="lazy" decoding="async"
            className={skinChase ? 'chase-skin-glow' : undefined}
            style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'contain', objectPosition: 'center 20%', padding: 2,
            ...(skinChase ? { ['--chase-c']: skinGlow } : { filter: skinGlowFilter }),
          } as React.CSSProperties} />
          {skinChase && skinGlow && <ChaseSkinFx skinId={skinDef?.id} color={skinGlow} />}
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

        {/* Only the "out on a trawl" pip lives on the portrait now — raid/voyage
            assignment reads in the dedicated party sections, so those tags were
            removed from the card. A trawl is NOT a party (the crew's away
            fishing), so its pip stays. Captain crown moved next to the name. */}
        {lockKind === 'trawl' && (
          <div
            title="Out on a trawl"
            aria-label="Out on a trawl"
            style={{
              position: 'absolute', top: -6, right: -6,
              width: 26, height: 26, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'radial-gradient(circle at 35% 30%, #3fc8aaff 0%, #3fc8aad0 70%)',
              border: '1.5px solid #3fc8aa',
              boxShadow: '0 2px 7px rgba(0,0,0,0.6), 0 0 12px #3fc8aa66, inset 0 1px 0 rgba(255,255,255,0.3)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            <NetIconSvg size={14} color="#0a0a0a" />
          </div>
        )}
        {aboard && (
          <div
            title="Already signed on to your crew"
            aria-label="Aboard"
            style={{
              position: 'absolute', top: -6, right: -6,
              width: 26, height: 26, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'radial-gradient(circle at 35% 30%, #4cc483 0%, #2e9a5cd0 70%)',
              border: '1.5px solid #4cc483',
              boxShadow: '0 2px 7px rgba(0,0,0,0.6), 0 0 12px #4cc48366, inset 0 1px 0 rgba(255,255,255,0.3)',
              color: '#06341a', pointerEvents: 'none', zIndex: 2,
            }}
          >
            <CheckIcon />
          </div>
        )}
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

      {/* Manifest detail. Centred, not top-aligned: the portrait sets the card
          height, and this column is shorter than it, so top-aligning left a
          void underneath (~43px on a roster card, which carries no footer at
          all since assignment moved to the Assign tab).
          The footer below deliberately does NOT carry marginTop:auto - an auto
          margin eats the free space before justify-content can distribute it,
          which would pin recruit-card actions to the bottom and make the two
          card types read differently. Everything centres as one cluster. */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.45rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            {/* 1.18 -> 1.45rem, using the height the centred column freed up.
                lineHeight goes 1 -> 1.12 with it: the name clips to an ellipsis
                via overflow:hidden, and at 1 that box is exactly the cap height,
                so pirata's descenders (Jelly, Doby, Gar) were being shaved. */}
            <p className="font-pirata" style={{ fontSize: '1.45rem', color: '#ecdcbd', lineHeight: 1.12, letterSpacing: '0.02em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </p>
            {/* Captain crown — party captain (slot 0), now beside the name. */}
            {isCaptain && (
              <span aria-label="Captain" title="Captain" style={{ flexShrink: 0, alignSelf: 'center', display: 'inline-flex', alignItems: 'center' }}>
                <svg width="15" height="12" viewBox="0 0 24 24" fill="#f0c040" stroke="#1a1206" strokeWidth="1.3" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }}>
                  <path d="M5 17h14l1-9-5 3.5L12 5 9 11.5 4 8z" />
                </svg>
              </span>
            )}
            {/* spacer pushes the LV token to the right of name + crown */}
            <span style={{ flex: 1, minWidth: 0 }} />
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

        {/* Engraved stats — icon + number over a bar, drawn against a fixed
            ceiling (STAT_BAR_MAX) so bars are comparable card to card. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, padding: '0.15rem 0' }}>
          {(['power', 'dodge', 'fortune'] as const).map((k, i) => (
            <div key={k} title={STAT_LABEL[k]} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <StatIcon k={k} color={STAT_COLOR[k]} />
                <span className="font-cinzel font-700" style={{ fontSize: '0.98rem', lineHeight: 1, color: '#ecdcbd' }}>
                  {eff[k]}
                </span>
              </div>
              {/* scaleX on a solid fill, never width: width is layout and a
                  roster renders dozens of cards at once. Staggered so the three
                  read left to right instead of snapping together. */}
              <span aria-hidden style={{ display: 'block', width: 44, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <span className="crew-stat-fill" style={{
                  display: 'block', width: '100%', height: '100%', borderRadius: 2,
                  background: STAT_COLOR[k],
                  transform: `scaleX(${Math.min(1, Math.max(0.02, eff[k] / STAT_BAR_MAX))})`,
                  animationDelay: `${0.06 * i}s`,
                }} />
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
          <div style={{ paddingTop: '0.4rem', display: 'flex', justifyContent: 'flex-end' }}>
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
export default function CrewClient({ initial, hasSeenGuide = true }: { initial: CrewState; hasSeenGuide?: boolean }) {
  const [state, setState] = useState<CrewState>(initial)
  // Blood Gem skin gamble: null = closed, 'rolling' = suspense build-up,
  // 'revealed' = the won skin slams in. skinId set once the server returns it.
  const [skinGamble, setSkinGamble] = useState<{ phase: 'rolling' | 'revealed'; skinId?: string } | null>(null)
  // Confirm-before-spend for every Blood Market action (reroll tiers + gamble).
  const [bloodConfirm, setBloodConfirm] = useState<{ kind: 'reroll'; tierId: string } | { kind: 'gamble' } | null>(null)
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<number | string | null>(null)
  // Inline glossary toggle on the crew detail modal — explains what
  // each stat actually does in raids + voyages. Reset when the modal
  // closes so it starts collapsed for the next card.
  // Which stat's explainer sheet is open. Replaces the old shared "?" glossary
  // - each stat now carries its own numbers AND its own description.
  const [statDetail, setStatDetail] = useState<'power' | 'dodge' | 'fortune' | null>(null)
  // Which footer action is awaiting confirmation. Every one of them states
  // exactly what it is about to do before it does it.
  const [confirmAct, setConfirmAct] = useState<'swap' | 'promote' | 'remove' | 'dismiss' | null>(null)
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
  // A freshly-UNLOCKED skin id — drives the celebratory reveal overlay.
  const [skinUnlock, setSkinUnlock] = useState<string | null>(null)
  // A quick flash + light sweep over the portrait when a skin is EQUIPPED, so
  // the swap feels tactile. Keyed so each equip re-triggers it.
  const [equipFlash, setEquipFlash] = useState<{ key: number; color: string } | null>(null)
  // Skin id pending a purchase confirmation (tapping a locked skin opens it).
  const [skinBuyConfirm, setSkinBuyConfirm] = useState<string | null>(null)
  // Skin id whose full-detail splash is open (from the Trunk gallery).
  const [skinDetail, setSkinDetail] = useState<string | null>(null)
  // The Trunk filters — rarity (per-crew) + ownership (per-skin); two dropdowns.
  const [trunkRarity, setTrunkRarity] = useState<CrewRarity | 'all'>('all')
  const [trunkOwned, setTrunkOwned] = useState<'all' | 'owned' | 'missing'>('all')
  const [trunkMenu, setTrunkMenu] = useState<'rarity' | 'owned' | null>(null)
  // Buy / equip a crew skin, then sync state + the Nav-bar gem total. A BUY also
  // fires the unlock reveal so earning a new skin feels like a real moment.
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
        if (tag.startsWith('buy:')) {
          const boughtId = tag.slice(4)
          vibrate([0, 45, 55, 30])
          try { playChestSfx(true) } catch { /* audio best-effort */ }
          setSkinUnlock(boughtId)
          setTimeout(() => setSkinUnlock(id => (id === boughtId ? null : id)), 3400)
        } else if (tag.startsWith('equip:')) {
          const id = tag.slice(6)
          const color = (id !== 'base' ? getCrewSkin(id)?.color : undefined) ?? '#f0c040'
          const key = Date.now()
          vibrate(14)
          setEquipFlash({ key, color })
          setTimeout(() => setEquipFlash(f => (f && f.key === key ? null : f)), 640)
        }
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
  // Deep-link support — Captain's Orders and the hub cards link to
  // /crew?tab=assign|recruits so a player lands on the view that can
  // actually do the thing they were sent for. Read once on mount; any value
  // not in the allow-set falls back to the default.
  // (There used to be a &filter=raid|voyage companion param. Nothing reads
  //  it any more, so callers should not pass it.)
  const searchParams = useSearchParams()
  const initialTab    = (() => {
    const t = searchParams?.get('tab')
    // LEGACY: ?tab=blood was the Blood Market, folded into Recruit (the
    // blood-charged reroll) and Skins (the gamble). This comment used to
    // claim it landed on Recruit, but 'blood' was not in the allow-set, so
    // it silently fell through to Roster. Map it for real - old links and
    // bookmarks still exist.
    if (t === 'blood') return 'recruits'
    return t === 'assign' || t === 'recruits' || t === 'graveyard' || t === 'roster' || t === 'wardrobe' ? t : 'roster'
  })() as 'assign' | 'roster' | 'recruits' | 'graveyard' | 'wardrobe'
  const [activeTab, setActiveTab] = useState<'assign' | 'roster' | 'recruits' | 'graveyard' | 'wardrobe'>(initialTab)

  // First-time Crew Hall guide: step through the core tabs, switching to and
  // flashing each one. Marked seen at the end.
  const [crewGuideStep, setCrewGuideStep] = useState<number | null>(null)
  useEffect(() => { if (!hasSeenGuide) setCrewGuideStep(0) }, [hasSeenGuide])
  useEffect(() => {
    if (crewGuideStep == null) return
    const s = CREW_GUIDE[crewGuideStep]
    if (s) setActiveTab(s.tab)
  }, [crewGuideStep])
  const flashCrewTab = crewGuideStep != null ? (CREW_GUIDE[crewGuideStep]?.tab ?? null) : null
  function finishCrewGuide() {
    setCrewGuideStep(null)
    void markCrewGuideSeen().catch(() => {})
  }
  // "How the Blood Market works" help modal.
  const [showBloodHelp, setShowBloodHelp] = useState(false)
  // Blood offerings are woven into Recruit and the Trunk rather than sitting
  // in a market tab of their own. Same gate the tab used.
  const bloodMarketShown = state.hardcoreUnlocked || state.bloodGems > 0
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
  const [assignSeat, setAssignSeat] = useState<{ track: 'raid' | 'voyage'; slot: number } | null>(null)

  useEffect(() => {
    if (activeTab !== 'graveyard' || graveyard !== null || graveyardLoading) return
    setGraveyardLoading(true)
    getCrewGraveyard()
      .then(rows => setGraveyard(rows))
      .finally(() => setGraveyardLoading(false))
  }, [activeTab, graveyard, graveyardLoading])

  const rosterFull = state.roster.length >= state.capacity
  // Swipe-to-recruit teaser: auto-peek the first recruitable card ONCE per visit
  // to show the gesture, then rely on the persistent arrow. Ref (not state) so
  // flipping it never re-renders; firstRecruitHintId re-reads it each render.
  const recruitHintedRef = useRef(false)
  const firstRecruitHintId = (!recruitHintedRef.current && !rosterFull)
    ? (state.board.find(c => !c.recruited)?.id ?? null)
    : null


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
      onDone?.()
    })
  }

  // Optimistic dismiss for the swipe gesture — pull the card the instant the
  // player taps (the swipe already confirmed), then reconcile with the server in
  // the background instead of waiting on the guard queries + state reload. Locked
  // crew are gated out before this, so it effectively always succeeds; restore
  // the snapshot on the rare error.
  function dismissRoster(id: number) {
    const snapshot = state.roster
    setErr(null)
    setState(s => ({ ...s, roster: s.roster.filter(c => c.id !== id) }))
    startTransition(async () => {
      const res = await dismissCrew(id)
      if ('error' in res) { setErr(res.error); setState(s => ({ ...s, roster: snapshot })) }
      else setState(res.state)
    })
  }

  // Optimistic recruit for the swipe gesture — mark the board candidate aboard
  // the instant they tap (dims the card, disables the swipe) so it feels
  // immediate, then let the server add the crew + return the real roster.
  function recruitBoard(id: number) {
    const snapshot = state.board
    setErr(null)
    vibrate(14)
    setState(s => ({ ...s, board: s.board.map(c => c.id === id ? { ...c, recruited: true } : c) }))
    startTransition(async () => {
      const res = await recruitCrew(id)
      if ('error' in res) { setErr(res.error); setState(s => ({ ...s, board: snapshot })) }
      else setState(res.state)
    })
  }

  // Reroll runs the action, swaps the board underneath, then plays the reveal
  // over the top so the new recruits flip in with pack-opening flair.
  // bloodTierId set = a blood-charged reroll (spends Blood Gems for boosted odds).
  function handleReroll(bloodTierId?: string) {
    if (pending || reveal.revealing) return // no re-roll mid-action or mid-reveal
    setErr(null)
    vibrate(bloodTierId ? [0, 20, 40, 20] : 14)
    setBusyId(bloodTierId ? `reroll:${bloodTierId}` : 'reroll')
    // The blood-charged reroll is fired from the recruit board itself now, so
    // there is nowhere to jump to: the new candidates flip in under your thumb.
    startTransition(async () => {
      const res = await rerollBoard(bloodTierId)
      if ('error' in res) setErr(res.error)
      else {
        setState(res.state)
        // Keep the Nav-bar gem total in sync (it has its own displayGems state).
        window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.state.gems }))
        window.dispatchEvent(new CustomEvent('blood-gems-changed', { detail: res.state.bloodGems }))
        reveal.startReveal(res.state.board, !!bloodTierId)
      }
      setBusyId(null)
    })
  }

  // Blood Gem skin gamble — spend BLOOD_SKIN_GAMBLE_COST for one random unowned
  // non-legendary skin. Two-beat reveal: a suspense roll, then the skin slams in.
  function handleGambleSkin() {
    if (pending || skinGamble) return
    if (state.bloodGems < BLOOD_SKIN_GAMBLE_COST) { setErr('Not enough Blood Gems'); return }
    setErr(null)
    vibrate([0, 40, 60, 40])
    setSkinGamble({ phase: 'rolling' })
    setBusyId('gamble')
    startTransition(async () => {
      const res = await gambleBloodSkin()
      if ('error' in res) { setErr(res.error); setSkinGamble(null); setBusyId(null); return }
      setState(res.state)
      window.dispatchEvent(new CustomEvent('blood-gems-changed', { detail: res.state.bloodGems }))
      // Hold the suspense a beat so the roll reads, then reveal the win.
      setTimeout(() => {
        setSkinGamble({ phase: 'revealed', skinId: res.skinId })
        vibrate([0, 60, 40, 90])
        try { playChestSfx(true) } catch { /* audio best-effort */ }
        setBusyId(null)
      }, 1500)
    })
  }

  // Recruit button for the DETAIL MODAL. Board items only: roster crew get the
  // Swap / Promote / Remove / Dismiss row instead, which owns its own confirm
  // step, so nothing reaches this with a CrewMember any more.
  function renderRecruitAction(c: BoardCandidate, onDone?: () => void) {
    const recruit = (e: React.MouseEvent) => {
      e.stopPropagation()
      vibrate(14)
      run(() => recruitCrew(c.id), c.id, onDone)
    }
    if (c.recruited) return <div className="font-karla font-700" style={{ ...BTN_STATIC, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.55)' }}>Recruited ✓</div>
    if (rosterFull) return <div className="font-karla font-700" style={{ ...BTN_STATIC, background: 'rgba(220,90,90,0.1)', border: '1px solid rgba(220,90,90,0.35)', color: '#f2b0b0' }}>Roster Full</div>
    return (
      <button onClick={recruit} disabled={pending} className="font-karla font-700" style={{ ...BTN_RECRUIT, cursor: pending ? 'not-allowed' : 'pointer', opacity: pending && busyId === c.id ? 0.6 : 1 }}>
        <AnchorIcon /><span>{busyId === c.id ? 'Recruiting…' : 'Recruit'}</span>
      </button>
    )
  }

  return (
    // Transparent so the painted crew-quarters backdrop (ClientBackground /crew)
    // shows through. `position: relative` with NO numeric z-index lifts the page
    // above the fixed z0 backdrop via DOM order WITHOUT creating a stacking
    // context — so the inline fixed modals below (e.g. the hall-upgrade sheet)
    // still stack over the Nav exactly as before.
    <div style={{ minHeight: '100vh', background: 'transparent', position: 'relative', color: '#f0ede8', padding: '1.25rem 1rem 4rem' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>

        {/* Header — title + roster count chip. Gems + Nav level live in
            the Nav bar already, so the roster fill is the one fact worth
            surfacing here ("N / cap") — it's the cap the rest of the page
            keeps butting up against (Recruit gates, Roster Full pills).
            Goes red when full so the player notices the wall before they
            try to claim another recruit and get bounced. */}
        <div style={{ marginBottom: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
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
          {/* Back to the hub — matches the Ship / Items / Forge routes. */}
          <Link href="/expeditions" aria-label="Back to expeditions"
            style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', color: '#e0ddd8', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', textDecoration: 'none' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
          </Link>
        </div>

        {err && (
          <div className="font-karla font-600" style={{ fontSize: '0.74rem', color: '#f2b0b0', background: 'rgba(200,70,70,0.12)', border: '1px solid rgba(220,90,90,0.3)', borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: '1rem' }}>
            {err}
          </div>
        )}

        {/* First-time Crew Hall guide (Doby + Kat) — flashes each core tab. */}
        {crewGuideStep != null && CREW_GUIDE[crewGuideStep] && (
          <GuideCoach
            show
            portrait={CREW_GUIDE[crewGuideStep].portrait}
            speaker={CREW_GUIDE[crewGuideStep].speaker}
            text={CREW_GUIDE[crewGuideStep].text}
            accent="#f0c040"
            placement="bottom"
            offset="calc(env(safe-area-inset-bottom, 0px) + 90px)"
            onNext={() => { if (crewGuideStep >= CREW_GUIDE.length - 1) finishCrewGuide(); else setCrewGuideStep(s => (s ?? 0) + 1) }}
            nextLabel={crewGuideStep >= CREW_GUIDE.length - 1 ? 'Got it' : 'Next →'}
            onClose={finishCrewGuide}
          />
        )}

        {/* Top-level navigation — deliberately NOT three identical tabs.
            Roster is the quiet "view your manifest" tab; Recruit always
            wears the gold action treatment so new players immediately know
            it's the way to get new crew; the Graveyard shrank to a small
            tombstone icon button on the right (a memorial doesn't need a
            full-width slot in the main nav). Counts stay as dim "· N"
            suffixes on the two text tabs. */}
        {(() => {
          // Seats filled across BOTH parties — the number the Assign tab is about.
          const assignedCount = state.roster.filter(c => c.raidSlot != null || c.voyageSlot != null).length
          const boardCount = state.board.filter(c => !c.recruited).length
          const iconProps = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
          // Uniform icon + label tabs so every destination is self-explanatory
          // (the old icon-only Blood/Wardrobe/Graveyard tabs weren't obvious).
          const tabs: { id: typeof activeTab; label: string; accent: string; count?: number; icon: ReactNode }[] = [
            { id: 'assign',   label: 'Assign',  accent: ASSIGN_RAID, count: assignedCount || undefined,
              icon: <svg {...iconProps}><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></svg> },
            { id: 'roster',   label: 'Roster',  accent: SECTION_ROSTER, count: state.roster.length || undefined,
              icon: <svg {...iconProps}><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="3.2" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
            { id: 'recruits', label: 'Recruit', accent: '#f0d696', count: boardCount || undefined,
              icon: <svg {...iconProps}><path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="3.2" /><path d="M19 8v6M22 11h-6" /></svg> },
            { id: 'wardrobe', label: 'Skins',  accent: '#5ec8e8',
              icon: <svg {...iconProps}><path d="M12 3a2 2 0 0 0-2 2c0 1 1 1.6 2 2M3 20l9-7 9 7M3 20l9-4 9 4M3 20v-1l9-6 9 6v1" /></svg> },
          ]
          return (
            <div role="tablist" className="flex items-stretch" style={{ gap: 5, marginBottom: '1.2rem' }}>
              {tabs.map(t => {
                const active = activeTab === t.id
                return (
                  <button key={t.id} role="tab" aria-selected={active} aria-label={t.label}
                    onClick={() => setActiveTab(t.id)}
                    className={`font-cinzel font-700 uppercase${flashCrewTab === t.id ? ' coach-flash coach-flash-gold' : ''}`}
                    style={{
                      flex: '1 1 0', minWidth: 0, position: 'relative',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                      padding: '0.5rem 0.15rem', borderRadius: 10,
                      background: active ? `linear-gradient(${t.accent}33, ${t.accent}33), rgba(14,19,28,0.97)` : 'rgba(14,19,28,0.97)',
                      border: `1px solid ${active ? `${t.accent}99` : 'rgba(255,255,255,0.16)'}`,
                      color: active ? t.accent : 'rgba(255,255,255,0.72)',
                      cursor: 'pointer', transition: 'all 0.18s',
                    }}>
                    {t.icon}
                    <span style={{ fontSize: '0.5rem', letterSpacing: '0.07em', lineHeight: 1 }}>{t.label}</span>
                    {t.count != null && (
                      <span className="font-karla font-800" style={{ position: 'absolute', top: 2, right: 3, minWidth: 13, textAlign: 'center', fontSize: '0.5rem', color: '#0b0b0d', background: active ? t.accent : 'rgba(255,255,255,0.7)', borderRadius: 999, padding: '0 3px', lineHeight: 1.35 }}>{t.count}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })()}

        {/* Recruit board — themed by the player's Crew Hall tier
            (lib/crewHall.ts): the panel's accent, glow, and header all
            upgrade with the building, so paying for a new hall visibly
            changes the room the recruits stand in. Hall header carries
            the name + tier pips + start-level perk + the Upgrade CTA. */}
        {/* ── ASSIGN ── the first tab, because deciding who sails is the job
            you open this page to do. Art-forward seats rather than cards. */}
        {activeTab === 'assign' && (
          <AssignBoard
            roster={state.roster}
            shipCrewSlots={state.shipCrewSlots}
            lockedCrewIds={state.lockedCrewIds}
            trawlingCrewIds={state.trawlingCrewIds}
            artSrc={artSrc}
            onPickSeat={(track, slot) => setAssignSeat({ track, slot })}
            onTapCrew={m => setDetail({ kind: 'roster', item: m })}
            raidAccent={ASSIGN_RAID}
            voyageAccent={ASSIGN_VOYAGE}
          />
        )}

        {activeTab === 'recruits' && (() => {
          const hall = hallTierDef(state.hallTier)
          const nextTier = nextHallTier(state.hallTier)
          return (
        <>
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, border: `1px solid ${hall.accent}66`, background: `linear-gradient(180deg, ${hall.accent}24 0%, ${hall.accent}0c 58%, transparent 100%), ${hall.base}`, boxShadow: hall.glow ? `0 0 26px ${hall.glow}` : undefined, padding: '0.8rem', marginBottom: '0.9rem' }}>
          {/* Picture and identity SIDE BY SIDE. Stacked, this hero was tall and
              its picture was small at the same time - the two complaints were
              the same problem. Beside each other the building gets bigger and
              the whole block gets shorter, so more of the board is on screen
              after a reroll. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: '0.85rem' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/crew/hall_${hall.tier}.png`} alt="" aria-hidden decoding="async"
              style={{ width: 132, height: 132, flexShrink: 0, objectFit: 'contain', filter: `drop-shadow(0 4px 14px ${hall.accent}55)` }}
              onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
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
          {/* Reroll row — every way to reroll this board, side by side. The
              blood-charged tiers used to be a separate panel above the hall
              with its own header, balance strip and description, which pushed
              the board itself off the screen to sell an option that is really
              just a pricier version of the button already here. They are the
              same shape now, and cost is the only thing that differs. */}
          {(() => {
            const gemsShort = state.gems < state.rerollCost
            const baseCannot = pending || reveal.revealing || gemsShort
            const rolls: {
              key: string; name: string; busy: boolean; cannot: boolean
              onTap: () => void; boost: string | null; cost: ReactNode
            }[] = [
              {
                key: 'gem', name: 'Reroll',
                busy: busyId === 'reroll' || reveal.revealing,
                cannot: baseCannot,
                onTap: () => handleReroll(),
                boost: null,
                cost: <>{state.rerollCost}<span style={{ color: '#a78bfa' }}>◆</span></>,
              },
              ...(bloodMarketShown ? BLOOD_REROLL_TIERS.map(t => ({
                key: t.id,
                name: t.name,
                busy: busyId === `reroll:${t.id}`,
                cannot: baseCannot || state.bloodGems < t.bloodCost,
                onTap: () => setBloodConfirm({ kind: 'reroll', tierId: t.id }),
                // The one number worth the space: how much likelier a Legendary is.
                boost: `${rerollMult(t.weights, 3, GEM_WEIGHTS)}× Legendary`,
                cost: <>{t.bloodCost}<BloodDrop size={9} /> + {state.rerollCost}<span style={{ color: '#a78bfa' }}>◆</span></>,
              })) : []),
            ]
            return (
              <div style={{ marginBottom: '1.1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rolls.length}, minmax(0, 1fr))`, gap: 7 }}>
                  {rolls.map(r => {
                    const blood = r.key !== 'gem'
                    const accent = blood ? BLOOD : '#60a5fa'
                    return (
                      <button
                        key={r.key}
                        onClick={r.onTap}
                        disabled={r.cannot}
                        className="active:scale-95"
                        title={blood ? 'Spend Blood Gems for far better odds' : 'Spend gems for 3 brand-new recruits'}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                          minWidth: 0, padding: '0.55rem 0.35rem 0.5rem', borderRadius: 12,
                          // Warm opaque base, matching the hall above and the
                          // crew cards below (both already #201a10-ish). These
                          // two were the last navy left in the recruit tab.
                          background: r.cannot
                            ? `linear-gradient(180deg, ${accent}14, ${accent}0a), #17120c`
                            : `linear-gradient(180deg, ${accent}3a, ${accent}1c), #1c1610`,
                          border: `1px solid ${accent}80`,
                          opacity: r.cannot ? 0.5 : 1,
                          cursor: r.cannot ? 'not-allowed' : 'pointer',
                          transition: 'transform 0.08s, opacity 0.18s',
                        }}
                      >
                        <span className="font-cinzel font-800 uppercase" style={{ fontSize: '0.8rem', letterSpacing: '0.03em', lineHeight: 1.1, color: blood ? '#f7d0d5' : '#cfe2ff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                          {r.busy ? '…' : r.name}
                        </span>
                        {r.boost && (
                          <span className="font-cinzel font-800" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.64rem', color: '#7ee0a3', lineHeight: 1, whiteSpace: 'nowrap' }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#7ee0a3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
                            {r.boost}
                          </span>
                        )}
                        <span className="font-karla font-600" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.6rem', color: 'rgba(255,255,255,0.78)', whiteSpace: 'nowrap' }}>
                          {r.cost}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {/* The countdown keeps its clock but loses the "Free reroll"
                    label: the clock already says what it is. */}
                <div className="font-karla font-600" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 7, fontSize: '0.64rem', color: 'rgba(255,255,255,0.5)' }}>
                  <ClockIcon /> <FreeRollCountdown />
                </div>
              </div>
            )
          })()}

          {reveal.revealing && reveal.bloodied && (
            <div className="flex justify-center" style={{ marginBottom: 12 }}>
              <span className="font-cinzel font-700 uppercase" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.28rem 0.75rem', borderRadius: 999, fontSize: '0.56rem', letterSpacing: '0.16em', color: '#f3c0c6', background: `${BLOOD}1e`, border: `1px solid ${BLOOD}66`, boxShadow: `0 0 16px ${BLOOD}33` }}>
                <BloodDrop size={12} /> Blood-Charged Reroll
              </span>
            </div>
          )}
          {/* Said once, not stamped on all three cards. The per-card pill went
              with the footer, and without it a full roster silently disables
              the swipe with no reason given. */}
          {rosterFull && (
            <div className="font-karla" style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.7rem',
              padding: '0.5rem 0.7rem', borderRadius: 10,
              background: 'rgba(220,90,90,0.10)', border: '1px solid rgba(220,90,90,0.32)',
              fontSize: '0.72rem', color: '#f2b0b0', lineHeight: 1.45,
            }}>
              Your roster is full. Dismiss a hand from the Roster tab, or upgrade your ship, before signing anyone new.
            </div>
          )}
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
                  aboard={c.recruited}
                  onClick={() => openDetail('board', c)} />
              )
              const phase = reveal.phases[c.id]
              // Climax: dim/desaturate the rest of the board and spotlight the
              // finale (rarest) card so the best pull lands as an event.
              const dim = reveal.climaxActive && c.id !== reveal.climaxId
              const spotlight = reveal.climaxActive && c.id === reveal.climaxId
              // Swipe-left to recruit (same direction as dismiss) — only once the
              // card has settled (not mid-reveal) and it's actually recruitable.
              const recruitable = !c.recruited && !rosterFull && !phase && !reveal.climaxActive
              const swipeCard = (
                <SwipeAction enabled={recruitable} side="left" label="Recruit"
                  icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}
                  gradient="linear-gradient(180deg, #4cc483 0%, #2e9a5c 100%)" textColor="#06341a" glow="rgba(76,196,131,0.9)"
                  hintPeek={c.id === firstRecruitHintId} onPeeked={() => { recruitHintedRef.current = true }}
                  onAction={() => recruitBoard(c.id)}>
                  {panel}
                </SwipeAction>
              )
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
                    ? <BoardReveal card={c} phase={phase} onTap={() => reveal.tapCard(c)} bloodied={reveal.bloodied}>{panel}</BoardReveal>
                    : swipeCard}
                </div>
              )
            })}
            {state.board.length === 0 && (
              <p className="font-karla" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>No recruits on the board.</p>
            )}
          </div>

        </>
          )
        })()}

        {/* Fill-a-seat picker. Art-forward and three across, matching the
            board it opens from. */}
        {assignSeat && typeof document !== 'undefined' && createPortal(
          <AssignPicker
            track={assignSeat.track}
            // Says which it is, because the same picker now both fills an
            // empty seat and replaces an occupied one.
            label={(() => {
              const track = assignSeat.track
              const party = track === 'raid' ? 'Raid Party' : 'Voyage Party'
              const holder = state.roster.find(c => (track === 'raid' ? c.raidSlot : c.voyageSlot) === assignSeat.slot)
              return holder ? `Replace ${holder.name}` : party
            })()}
            roster={state.roster}
            lockedCrewIds={state.lockedCrewIds}
            trawlingCrewIds={state.trawlingCrewIds}
            artSrc={artSrc}
            pending={pending}
            busyId={busyId}
            accent={assignSeat.track === 'raid' ? ASSIGN_RAID : ASSIGN_VOYAGE}
            rarityColor={r => RARITY_COLORS[(r as CrewRarity)] ?? 'rgba(255,255,255,0.14)'}
            onPick={m => {
              // Explicit slot, not "next open one". applyAssignment benches
              // whoever holds the target slot first, so this doubles as swap.
              const { track, slot } = assignSeat
              run(() => (track === 'raid' ? assignToRaid(m.id, slot) : assignToVoyage(m.id, slot)), m.id, () => setAssignSeat(null))
            }}
            onClose={() => setAssignSeat(null)}
          />, document.body)}

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

        {/* ── The Trunk (Skins tab) — every crew skin, owned + unowned, grouped by crew.
             Matters now that the blood gamble hands out skins for crew you don't
             own yet: this is the only place to actually SEE them + track the
             collection. Owned + on your roster → tap to equip; owned but the crew
             isn't recruited → "recruit to wear"; unowned → silhouette + cost. ── */}
        {activeTab === 'wardrobe' && (() => {
          // The gamble pool: every NON-legendary skin. Legendaries are chase
          // items and stay out of it, same rule the Blood Market tab used.
          const nonLegSkins = CREW_SKINS.filter(s => (groupForSlug(s.slug) ?? 0) !== 4)
          const ownedNonLeg = nonLegSkins.filter(s => state.ownedCrewSkins.includes(s.id)).length
          const totalNonLeg = nonLegSkins.length
          const skinPoolEmpty = ownedNonLeg >= totalNonLeg
          const canGamble = !skinPoolEmpty && !pending && !skinGamble && state.bloodGems >= BLOOD_SKIN_GAMBLE_COST
          const owned = new Set(state.ownedCrewSkins)
          const ownedSlugs = new Set(state.roster.map(m => (m.slug ?? '').toLowerCase()).filter(Boolean))
          const ownedCount = CREW_SKINS.filter(s => owned.has(s.id)).length
          const slugs = [...new Set(CREW_SKINS.map(s => s.slug))]
          const matchOwned = (id: string) =>
            trunkOwned === 'all' ? true : trunkOwned === 'owned' ? owned.has(id) : !owned.has(id)
          const groups = slugs
            .map(slug => ({ slug, skins: CREW_SKINS.filter(s => s.slug === slug), rarity: groupForSlug(slug) ?? 0 }))
            .sort((a, b) => a.rarity - b.rarity)
            // Rarity filter is per-crew (a crew's skins share its rarity); ownership
            // filter is per-skin, so drop any crew left with nothing to show.
            .filter(g => trunkRarity === 'all' || g.rarity === trunkRarity)
            .map(g => ({ ...g, skins: g.skins.filter(s => matchOwned(s.id)) }))
            .filter(g => g.skins.length > 0)
          // One compact dropdown for a filter — a labelled trigger + a popover of
          // options, so both filters fit on a single tidy row.
          const renderDropdown = (
            id: 'rarity' | 'owned',
            current: string,
            opts: { key: string; label: string; color?: string }[],
            onPick: (key: string) => void,
          ) => {
            const open = trunkMenu === id
            const sel = opts.find(o => o.key === current) ?? opts[0]
            return (
              <div style={{ position: 'relative', flex: 1, maxWidth: 172 }}>
                <button type="button" onClick={() => setTrunkMenu(open ? null : id)} className="tap"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7, width: '100%', padding: '0.42rem 0.72rem', borderRadius: 10,
                    background: 'rgba(255,255,255,0.05)', border: `1px solid ${open ? 'rgba(94,200,232,0.6)' : 'rgba(255,255,255,0.12)'}`, cursor: 'pointer' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    {sel.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: sel.color, flexShrink: 0 }} />}
                    <span className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#dbeef4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sel.label}</span>
                  </span>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8fd7ea" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {open && (
                  <>
                    <div onClick={() => setTrunkMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
                    <div style={{ position: 'absolute', top: 'calc(100% + 5px)', left: 0, right: 0, zIndex: 20, borderRadius: 10, overflow: 'hidden', background: 'rgba(9,15,21,0.98)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 12px 28px rgba(0,0,0,0.6)' }}>
                      {opts.map(o => {
                        const active = o.key === current
                        return (
                          <button key={o.key} type="button" onClick={() => { onPick(o.key); setTrunkMenu(null) }} className="tap"
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '0.5rem 0.7rem', background: active ? 'rgba(94,200,232,0.15)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                            {o.color
                              ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: o.color, flexShrink: 0 }} />
                              : <span style={{ width: 8, flexShrink: 0 }} />}
                            <span className="font-karla font-700" style={{ fontSize: '0.68rem', color: active ? '#eaf6fa' : 'rgba(255,255,255,0.62)' }}>{o.label}</span>
                            {active && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5ec8e8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ marginLeft: 'auto' }}><path d="M20 6L9 17l-5-5" /></svg>}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )
          }
          return (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <p className="font-cinzel font-800" style={{ fontSize: '1.15rem', color: '#e8f2f5' }}>The Trunk</p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#8fd7ea', marginTop: 4 }}>{ownedCount} / {CREW_SKINS.length} collected</p>
              </div>
              {/* Skin gamble. One row rather than the panel it used to be: the
                  trunk is the point of this tab, so the gamble sits beside it
                  instead of pushing it below the fold. */}
              {bloodMarketShown && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '0.55rem 0.6rem 0.55rem 0.75rem', borderRadius: 12, background: `linear-gradient(180deg, ${BLOOD}1c, rgba(20,6,9,0.55))`, border: `1px solid ${BLOOD}4d` }}>
                  <BloodDrop size={17} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#f3c0c6', lineHeight: 1.1 }}>Skin Gamble</p>
                    <p className="font-karla" style={{ fontSize: '0.6rem', color: '#c08a90', lineHeight: 1.25 }}>
                      {skinPoolEmpty ? 'Every skin collected' : `One random skin you do not own · ${totalNonLeg - ownedNonLeg} left`}
                    </p>
                  </div>
                  <button onClick={() => setBloodConfirm({ kind: 'gamble' })} disabled={!canGamble}
                    className="font-karla font-700 uppercase tracking-[0.08em] active:scale-95"
                    style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.45rem 0.7rem', borderRadius: 10, fontSize: '0.6rem', background: !canGamble ? `${BLOOD}12` : `linear-gradient(180deg, ${BLOOD}55, rgba(140,20,32,0.6))`, border: `1px solid ${BLOOD}99`, color: !canGamble ? 'rgba(243,192,198,0.5)' : '#fce3e6', cursor: !canGamble ? 'not-allowed' : 'pointer' }}>
                    {BLOOD_SKIN_GAMBLE_COST}<BloodDrop size={11} />
                  </button>
                </div>
              )}
              {/* Filters — two compact dropdowns on ONE row. */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
                {renderDropdown('rarity', String(trunkRarity), [
                  { key: 'all', label: 'All rarities' },
                  { key: '2', label: RARITY_NAMES[2], color: RARITY_COLORS[2] },
                  { key: '3', label: RARITY_NAMES[3], color: RARITY_COLORS[3] },
                  { key: '4', label: RARITY_NAMES[4], color: RARITY_COLORS[4] },
                ], (k) => setTrunkRarity(k === 'all' ? 'all' : (Number(k) as CrewRarity)))}
                {renderDropdown('owned', trunkOwned, [
                  { key: 'all', label: 'All skins' },
                  { key: 'owned', label: 'Owned' },
                  { key: 'missing', label: 'Missing' },
                ], (k) => setTrunkOwned(k as 'all' | 'owned' | 'missing'))}
              </div>
              {groups.map(({ slug, skins, rarity }) => {
                const color = RARITY_COLORS[(rarity as CrewRarity)] ?? '#8a857c'
                const ownsCrew = ownedSlugs.has(slug)
                const groupOwned = skins.filter(s => owned.has(s.id)).length
                return (
                  <div key={slug} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color }}>
                        {crewDisplayName(slug, slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))}
                        {!ownsCrew && <span className="font-karla font-600" style={{ fontSize: '0.54rem', color: 'rgba(255,255,255,0.4)', marginLeft: 6, letterSpacing: '0.04em' }}>· NOT RECRUITED</span>}
                      </p>
                      <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: groupOwned === skins.length ? color : 'rgba(255,255,255,0.5)' }}>{groupOwned}/{skins.length}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {skins.map(s => {
                        const isOwned = owned.has(s.id)
                        const isEquipped = (state.equippedCrewSkins[slug] ?? null) === s.id
                        const canEquip = isOwned && ownsCrew && !isEquipped
                        return (
                          <button key={s.id} type="button"
                            onClick={() => setSkinDetail(s.id)}
                            style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                              padding: '0.5rem 0.35rem 0.4rem', borderRadius: 11,
                              background: isEquipped ? `${color}1e` : 'rgba(4,10,18,0.6)',
                              border: `1px solid ${isEquipped ? `${color}88` : isOwned ? `${color}33` : 'rgba(255,255,255,0.07)'}`,
                              cursor: 'pointer', textAlign: 'center',
                            }}>
                            <div style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.05), rgba(3,6,10,0.9))' }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={artSrc(s.filename)} alt={s.name} loading="lazy" decoding="async"
                                className={isOwned && s.chase ? 'chase-skin-glow' : undefined}
                                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4,
                                  // Owned: chase tiles animate (need --chase-c set), others get the
                                  // static rarity glow; unowned stay locked-grayscale.
                                  ...(isOwned && s.chase
                                    ? { ['--chase-c']: s.color }
                                    : { filter: isOwned ? skinArtGlow(s.color, rarity) : 'grayscale(1) brightness(0.62)' }) } as React.CSSProperties} />
                              {isEquipped && (
                                <span style={{ position: 'absolute', top: 3, right: 3, width: 15, height: 15, borderRadius: '50%', background: color, display: 'grid', placeItems: 'center' }}>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#0a0f14" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
                                </span>
                              )}
                              {!isOwned && (
                                <span aria-hidden style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                                </span>
                              )}
                            </div>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.62rem', color: isOwned ? '#e8e2d6' : 'rgba(255,255,255,0.42)', lineHeight: 1.1 }}>{s.name}</p>
                            <span className="font-karla font-700 uppercase" style={{ fontSize: '0.44rem', letterSpacing: '0.06em',
                              color: isEquipped ? color : canEquip ? '#4ade80' : isOwned ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.3)' }}>
                              {isEquipped ? 'Equipped' : canEquip ? 'Owned' : isOwned ? (ownsCrew ? 'Owned' : 'Recruit to wear') : `${s.gemCost.toLocaleString()} ◆`}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {groups.length === 0 && (
                <p className="font-karla" style={{ textAlign: 'center', fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', padding: '2.2rem 0' }}>
                  No skins match these filters.
                </p>
              )}
            </div>
          )
        })()}

        {/* ── The Blood Market — a dedicated crimson destination for spending
             Blood Gems (Hardcore Gauntlet spoils), styled as its own vendor room
             the way the Forge is. Two offerings: the blood-charged reroll + the
             skin gamble. ── */}

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

                const card = (m: CrewMember) => {
                  const isLocked = voyageLockSet.has(m.id) || trawlSet.has(m.id)
                  return (
                    // Swipe-left to dismiss — disabled for locked crew (at sea / trawling).
                    <SwipeAction key={m.id} enabled={!isLocked} side="left" label="Dismiss" icon={<XIcon />}
                      gradient="linear-gradient(180deg, #c6484a 0%, #a5383a 100%)" textColor="#fbe4e4" glow="rgba(224,85,90,0.9)"
                      onAction={() => dismissRoster(m.id)}>
                      <CrewPanel name={m.name} filename={m.filename} rarity={m.rarity}
                        bg={ROSTER_PANEL_BG} border={ROSTER_PANEL_BORDER}
                        base={{ power: m.power, dodge: m.dodge, fortune: m.fortune }} effects={m.effects} xp={m.xp} slug={m.slug}
                        assignment={crewAssignment(m)}
                        isCaptain={m.voyageSlot === 0 || m.raidSlot === 0}
                        locked={isLocked}
                        lockKind={trawlSet.has(m.id) ? 'trawl' : 'voyage'}
                        lockLabel={trawlSet.has(m.id) ? 'This crew is out on a trawl. Collect it to free them up.' : 'This crew is currently at sea on a voyage.'}
                        hasLevelUp={(seenLevels[m.id] ?? crewLevelFromXP(m.xp)) < crewLevelFromXP(m.xp)}
                        hint={m.effects.length > 0 && !viewed.has(`roster:${m.id}`)}
                        onClick={() => openDetail('roster', m)} />
                    </SwipeAction>
                  )
                }
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
                    {/* ONE flat manifest. The old page split the roster four
                        ways by what each hand happened to be doing, which meant
                        scanning four lists to answer "who do I have". Assigning
                        is its own tab now, so this is just the list. */}
                    {/* No container. The tab IS the roster, so wrapping it in a
                        collapsible "All Crew" panel was a box around the only
                        thing on the screen. The cards stand on the page, matching
                        the recruit board now that the hall is a hero, not a box. */}
                    {state.roster.length === 0 ? (
                      <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', padding: '0.6rem 0.1rem' }}>
                        No crew yet. Sign some hands on in the Recruit tab.
                      </p>
                    ) : grid(state.roster, 0, SECTION_NEUTRAL)}

                    {/* The Fallen lost its tab: it is a memorial you visit, not
                        a place you work, so it hangs off the manifest instead. */}
                    <button onClick={() => setActiveTab('graveyard')} className="font-cinzel font-700 uppercase tracking-[0.1em]"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0.7rem', borderRadius: 12, background: 'rgba(200,171,125,0.10)', border: '1px solid rgba(200,171,125,0.32)', color: '#c8ab7d', fontSize: '0.68rem', cursor: 'pointer' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 21V10a6 6 0 0 1 12 0v11" /><path d="M4 21h16" /><path d="M12 7.5v5M9.5 10h5" /></svg>
                      Those We Have Lost
                    </button>

                    {/* The "Recruit New Crew" button lived here and did nothing
                        the Recruit TAB does not already do, one tap away and
                        permanently on screen. A second door to the same room. */}

                    {/* Assign modal — fill an open Raid/Voyage seat from the bench
                        without scrolling. Bottom sheet, accent-coded to the track. */}
                    {/* The assign sheet moved to the component root so the new
                        Assign tab can open it too. It was scoped to the Roster. */}
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
          const portraitChase = shownSkinId ? !!getCrewSkin(shownSkinId)?.chase : false
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
          const close = () => { setConfirmAct(null); setStatDetail(null); setDetail(null); setClassExpanded(false); setRenameOpen(false); setRenameErr(null); setPreviewSkin(undefined); setDetailTab('stats') }
          return (
            <motion.div key="crew-detail-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
              onClick={close}
              style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,2,5,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}>
              <motion.div key="crew-detail" initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }} transition={{ duration: 0.18, ease: 'easeOut' }}
                onClick={e => e.stopPropagation()}
                style={{
                  // FIXED height, not max-height. The card used to grow and
                  // shrink as you moved between Stats / Ability / Skins, which
                  // made the tabs feel like they were resizing the sheet. Now
                  // the shell is constant and the body between the header and
                  // the action row is the only thing that scrolls.
                  width: '100%', maxWidth: 360, height: 'min(86vh, 620px)',
                  position: 'relative',
                  display: 'flex', flexDirection: 'column', overflow: 'hidden',
                  borderRadius: 14,
                  background: detail.kind === 'board' ? RECRUIT_PANEL_BG : ROSTER_PANEL_BG,
                  border: `1.5px solid ${dColor}`, boxShadow: `0 20px 50px rgba(0,0,0,0.6), 0 0 24px ${dColor}33`,
                }}>
                <div className="flex justify-end" style={{ flexShrink: 0, padding: '0.5rem 0.6rem 0' }}>
                  <button onClick={close} aria-label="Close" style={{ color: 'rgba(255,255,255,0.45)', fontSize: '1.2rem', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.3rem' }}>✕</button>
                </div>
                {/* minHeight:0 or this never scrolls - it just grows the shell. */}
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0.2rem 1.1rem 0.4rem' }}>

                {/* Portrait — rarity frame; a shown skin makes the ART itself glow
                    in its color (drop-shadow aura on the image). clip-path keeps
                    the glow inside the arch so it never spills past the frame.
                    Geometry is IDENTICAL on every tab. The Skins tab used to
                    shrink the frame 196 -> 186, recentre the art, repad it and
                    move the gradient, which read as the portrait jumping when
                    you tapped the tab. That was there to close dead space under
                    a shorter tab; the shell is a fixed height now, so there is
                    no dead space to close. */}
                <div style={{ position: 'relative', width: 186, height: 196, margin: '0 auto', borderRadius: '86px 86px 7px 7px', overflow: 'hidden', clipPath: 'inset(0 round 86px 86px 7px 7px)', border: `2px solid ${dColor}`, boxShadow: `inset 0 -14px 24px rgba(0,0,0,0.65), 0 0 14px ${dColor}33`, background: `radial-gradient(ellipse at 50% 30%, ${(portraitSkin ?? dColor)}26 0%, #070504 74%)` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={artSrc(portraitFilename)} alt={it.name}
                    className={portraitChase ? 'chase-skin-glow' : undefined}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center 20%', padding: 6, transition: 'filter 0.25s', ...(portraitChase ? { ['--chase-c']: portraitSkin } : { filter: portraitSkin ? skinArtGlow(portraitSkin, it.rarity, true) : undefined }) } as React.CSSProperties} />
                  {portraitChase && portraitSkin && <ChaseSkinFx skinId={shownSkinId} color={portraitSkin} />}
                  {/* Equip flash + light sweep — a tactile beat the moment a skin
                      is equipped. Clipped to the arch by the portrait's overflow. */}
                  {equipFlash && (
                    <div key={equipFlash.key} aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                      <motion.div
                        initial={{ opacity: 0.8 }} animate={{ opacity: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}
                        style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 42%, #ffffffcc 0%, ${equipFlash.color}66 38%, transparent 72%)` }} />
                      <motion.div
                        initial={{ x: '-130%' }} animate={{ x: '130%' }} transition={{ duration: 0.55, ease: 'easeInOut' }}
                        style={{ position: 'absolute', top: 0, bottom: 0, width: '55%', background: 'linear-gradient(105deg, transparent, rgba(255,255,255,0.5), transparent)' }} />
                    </div>
                  )}
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: '0.6rem' }}>
                      <p className="font-pirata" style={{ textAlign: 'center', fontSize: '1.7rem', color: '#ecdcbd', lineHeight: 1.05 }}>{it.name}</p>
                      {canRename && (
                        <button
                          type="button"
                          onClick={() => startRename(it.name)}
                          aria-label="Name this crew (one time only)"
                          title="Name them · once only"
                          style={{
                            flexShrink: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 26, height: 26, borderRadius: '50%',
                            color: '#f0c040',
                            background: 'rgba(240,192,64,0.1)',
                            border: '1px solid rgba(240,192,64,0.5)',
                            cursor: 'pointer',
                            boxShadow: '0 0 9px rgba(240,192,64,0.16)',
                            transition: 'background 0.15s, box-shadow 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(240,192,64,0.18)'; e.currentTarget.style.boxShadow = '0 0 13px rgba(240,192,64,0.28)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(240,192,64,0.1)';  e.currentTarget.style.boxShadow = '0 0 9px rgba(240,192,64,0.16)' }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )
                })()}
                {!('xp' in it) && (
                  <p className="font-cinzel font-700" style={{ textAlign: 'center', fontSize: '0.8rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: dColor }}>{RARITY_NAMES[(it.rarity as CrewRarity)] ?? 'Common'}</p>
                )}

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
                        {/* Rarity rides here instead of owning a row above.
                            The old "Master" / "Fully trained" titles are gone -
                            Lv 100 with a full bar already says it. */}
                        <span className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#f0c040', letterSpacing: '0.06em' }}>
                          Lv {prog.level}
                          <span style={{ color: 'rgba(255,255,255,0.25)', margin: '0 6px' }}>·</span>
                          <span style={{ color: dColor, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: '0.72rem' }}>
                            {RARITY_NAMES[(it.rarity as CrewRarity)] ?? 'Common'}
                          </span>
                        </span>
                        <span className="font-karla" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>
                          {atMax ? 'Max' : `${prog.xpInLevel.toLocaleString()} / ${prog.xpForLevel.toLocaleString()} XP`}
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
                            flex: 1, padding: '0.62rem 0.3rem', borderRadius: 8,
                            fontSize: '0.74rem', letterSpacing: '0.09em',
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

                {/* Tab body — flexes to each tab's own content so actions sit
                    right under it (no dead space padding the modal to a fixed
                    height). */}
                <div>

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
                          <p className="font-karla font-700" style={{ fontSize: '0.66rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.58)' }}>
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
                          <p className="font-karla font-600" style={{ fontSize: '0.66rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: `${accent}99`, marginTop: 6 }}>
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
                                    fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase',
                                    color: accent, marginLeft: 'auto',
                                  }}>Now</span>
                                )}
                              </div>
                            )
                          })}
                          <p className="font-karla font-600" style={{ fontSize: '0.66rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.58)', marginTop: 2 }}>
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
                  return (
                    <div>
                      <div className="flex items-baseline justify-between" style={{ marginBottom: 8 }}>
                        <p className="font-cinzel font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)' }}>Skins</p>
                        <p className="font-karla font-400" style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.5)' }}>tap to equip or unlock</p>
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
                                // Locked skin → open a purchase confirmation. Owned
                                // skin → tapping equips it straight away. No buttons,
                                // no shifting UI.
                                if (!isOwned) { setSkinBuyConfirm(t.id as string); return }
                                if (!isEquipped) runSkinAction(`equip:${t.id ?? 'base'}`, () => equipCrewSkin(dm.slug, t.id))
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
                              <img src={artSrc(t.file)} alt={t.name}
                                className={t.chase ? 'chase-skin-glow' : undefined}
                                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center 28%', padding: 7, ...(t.chase ? { ['--chase-c']: t.color } : { filter: t.id === null ? undefined : skinArtGlow(t.color, it.rarity, false) }) } as React.CSSProperties} />
                              {t.chase && <ChaseSkinFx skinId={t.id} color={t.color} />}
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

                      {/* Selected-skin name + blurb. Fixed min-height so nothing
                          below the grid ever shifts as you tap between skins. */}
                      <div style={{ minHeight: 42, marginTop: 9 }}>
                        <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#eae4da', textAlign: 'center' }}>{selName}</p>
                        {shownSkinId && getCrewSkin(shownSkinId)?.blurb && (
                          <p className="font-karla font-400" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.42)', textAlign: 'center', marginTop: 2 }}>{getCrewSkin(shownSkinId)!.blurb}</p>
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
                {/* Symbol + number, nothing else. Everything the old block
                    spelled out inline - base value, the trained-from-levels
                    row, and the shared "?" glossary - now lives in each stat's
                    own sheet, so this stops being the tallest thing here. */}
                <div style={{ display: 'flex', gap: 8, marginBottom: '0.7rem' }}>
                  {(['power', 'dodge', 'fortune'] as const).map(k => {
                    const ch = dEff[k] - dBase[k]
                    return (
                      <button key={k} type="button" onClick={() => { vibrate(5); setStatDetail(k) }}
                        aria-label={`${STAT_LABEL[k]} ${dEff[k]}. Tap for detail.`}
                        title={`What ${STAT_LABEL[k]} does`}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                          background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 9, padding: '0.6rem 0.3rem', cursor: 'pointer', font: 'inherit',
                          touchAction: 'manipulation',
                        }}>
                        <StatIcon k={k} color={STAT_COLOR[k]} />
                        <span className="font-cinzel font-700" style={{ fontSize: '1.4rem', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: ch > 0 ? '#7fdfa3' : ch < 0 ? '#f08a8a' : '#ecdcbd' }}>{dEff[k]}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Trait: name and effect, one row, no heading over it. */}
                {dTraitLabel && (
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: '0.15rem 0' }}>
                    <span className="font-cinzel font-700" style={{ fontSize: '0.86rem', fontStyle: 'italic', color: dTraitKind === 'buff' ? '#9fd9b1' : dTraitKind === 'flaw' ? '#e09a9a' : 'rgba(255,255,255,0.6)' }}>
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
                )}
                </motion.div>
                )}

                </div>{/* end tab body */}
                </div>{/* end scroll region */}

                {/* Actions. Pinned under the scroll region so they never move
                    with the tab content. One row: Swap / Promote / Remove /
                    Dismiss, each stating exactly what it does before doing it
                    rather than firing on the first tap. */}
                <div style={{ flexShrink: 0, padding: '0.7rem 1.1rem 1rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                {detail.kind === 'board' ? (
                  renderRecruitAction(it as BoardCandidate, close)
                ) : (() => {
                  const m = it as CrewMember
                  const isCap = m.voyageSlot === 0 || m.raidSlot === 0
                  const track: 'raid' | 'voyage' | null =
                    m.raidSlot !== null ? 'raid' : m.voyageSlot !== null ? 'voyage' : null
                  const seat = track === 'raid' ? m.raidSlot : m.voyageSlot
                  const party = track === 'raid' ? 'Raid Party' : 'Voyage Party'
                  const accent = track === 'voyage' ? ASSIGN_VOYAGE : ASSIGN_RAID
                  // At sea or trawling: the server rejects all of these
                  // (assertCanReassign), so offer none of them.
                  const isLockedM = state.lockedCrewIds.includes(m.id) || state.trawlingCrewIds.includes(m.id)
                  if (isLockedM) {
                    return (
                      <p className="font-karla font-600 italic" style={{ textAlign: 'center', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                        {state.trawlingCrewIds.includes(m.id) ? 'Out on a trawl.' : 'At sea.'} Bring them home before giving new orders.
                      </p>
                    )
                  }

                  if (confirmAct) {
                    const copy = {
                      swap:    { line: 'Take ' + m.name + ' out of the ' + party + ' and pick their replacement next. ' + m.name + ' stays in your roster.', cta: 'Swap', stark: false },
                      promote: { line: 'Make ' + m.name + ' captain of the ' + party + '. They take the lead seat, and only the captain counts at full strength.', cta: 'Promote', stark: false },
                      remove:  { line: 'Take ' + m.name + ' out of the ' + party + '. They stay in your roster and can be assigned again whenever you like.', cta: 'Remove', stark: false },
                      dismiss: { line: 'Dismiss ' + m.name + ' for good. They leave your roster permanently, and every level, stat and trait they have earned goes with them. This cannot be undone.', cta: 'Dismiss Forever', stark: true },
                    }[confirmAct]
                    const go = () => {
                      if (confirmAct === 'swap') { close(); if (track && seat !== null) setAssignSeat({ track, slot: seat }); return }
                      if (confirmAct === 'promote') return run(() => promoteToCaptain(m.id), m.id, close)
                      if (confirmAct === 'remove')  return run(() => benchCrew(m.id), m.id, close)
                      return run(() => dismissCrew(m.id), m.id, close)
                    }
                    return (
                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: 9,
                        padding: copy.stark ? '0.7rem 0.75rem' : 0,
                        borderRadius: 10,
                        background: copy.stark ? 'rgba(150,32,32,0.16)' : undefined,
                        border: copy.stark ? '1px solid rgba(228,90,90,0.55)' : undefined,
                      }}>
                        {copy.stark && (
                          <p className="font-cinzel font-700 uppercase" style={{ fontSize: '0.68rem', letterSpacing: '0.14em', color: '#ff9a9a' }}>
                            This is permanent
                          </p>
                        )}
                        <p className="font-karla" style={{ fontSize: '0.74rem', lineHeight: 1.5, color: copy.stark ? '#f6d5d5' : 'rgba(255,255,255,0.72)' }}>
                          {copy.line}
                        </p>
                        <div className="flex items-center" style={{ gap: 8 }}>
                          <button type="button" disabled={pending} onClick={() => setConfirmAct(null)}
                            className="font-karla font-700 uppercase"
                            style={{ flex: 1, padding: '0.6rem', borderRadius: 9, fontSize: '0.7rem', letterSpacing: '0.05em', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.75)', cursor: 'pointer' }}>
                            Cancel
                          </button>
                          <button type="button" disabled={pending} onClick={go}
                            className="font-karla font-700 uppercase"
                            style={{ flex: 1, padding: '0.6rem', borderRadius: 9, fontSize: '0.7rem', letterSpacing: '0.05em', cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.6 : 1,
                              background: copy.stark ? 'rgba(200,48,48,0.5)' : accent + '26',
                              border: '1px solid ' + (copy.stark ? 'rgba(255,120,120,0.8)' : accent + '77'),
                              color: copy.stark ? '#fff0f0' : accent }}>
                            {busyId === m.id ? '...' : copy.cta}
                          </button>
                        </div>
                      </div>
                    )
                  }

                  const btn = (label: string, act: 'swap' | 'promote' | 'remove' | 'dismiss', danger = false) => (
                    <button key={label} type="button" disabled={pending} onClick={() => setConfirmAct(act)}
                      className="font-karla font-700 uppercase"
                      style={{
                        flex: 1, minWidth: 0, padding: '0.6rem 0.25rem', borderRadius: 9,
                        fontSize: '0.68rem', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                        background: danger ? 'transparent' : 'rgba(255,255,255,0.05)',
                        border: '1px solid ' + (danger ? 'rgba(228,114,114,0.4)' : 'rgba(255,255,255,0.18)'),
                        color: danger ? 'rgba(232,150,150,0.9)' : 'rgba(240,236,228,0.88)',
                        cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.6 : 1,
                      }}>
                      {label}
                    </button>
                  )
                  return (
                    <div className="flex items-center" style={{ gap: 6 }}>
                      {track !== null && btn('Swap', 'swap')}
                      {track !== null && !isCap && btn('Promote', 'promote')}
                      {track !== null && btn('Remove', 'remove')}
                      {btn('Dismiss', 'dismiss', true)}
                    </div>
                  )
                })()}
                </div>

                {/* Per-stat sheet. Slides over the card rather than pushing it
                    taller, and carries everything the Stats tab used to print
                    inline for all three at once: where the number came from,
                    and what the stat actually does. */}
                <AnimatePresence>
                {statDetail && (() => {
                  const k = statDetail
                  const trained = ('xp' in it && dXp > 0) ? levelStatBonuses(crewLevelFromXP(dXp), dBase)[k] : 0
                  const fromTrait = dTrait[k]
                  const rows: [string, number | string][] = [
                    ['Base', dBase[k]],
                    ...(trained !== 0 ? [['Trained', (trained > 0 ? '+' : '') + trained] as [string, string]] : []),
                    ...(fromTrait !== 0 ? [[dTraitLabel || 'Trait', (fromTrait > 0 ? '+' : '') + fromTrait] as [string, string]] : []),
                  ]
                  return (
                    <motion.div key="stat-sheet"
                      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.16, ease: 'easeOut' }}
                      style={{
                        position: 'absolute', inset: 0, zIndex: 5,
                        background: detail.kind === 'board' ? RECRUIT_PANEL_BG : ROSTER_PANEL_BG,
                        display: 'flex', flexDirection: 'column',
                      }}>
                      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9, padding: '0.85rem 1.1rem 0.7rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        <StatIcon k={k} color={STAT_COLOR[k]} />
                        <p className="font-cinzel font-700 uppercase" style={{ fontSize: '0.86rem', letterSpacing: '0.12em', color: STAT_COLOR[k] }}>{STAT_LABEL[k]}</p>
                        <button type="button" onClick={() => setStatDetail(null)} aria-label="Back"
                          className="font-karla font-700 uppercase"
                          style={{ marginLeft: 'auto', padding: '0.35rem 0.7rem', borderRadius: 8, fontSize: '0.64rem', letterSpacing: '0.06em', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.75)', cursor: 'pointer' }}>
                          Back
                        </button>
                      </div>
                      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1rem 1.1rem 1.1rem' }}>
                        <p className="font-cinzel font-700" style={{ fontSize: '3rem', lineHeight: 1, textAlign: 'center', color: '#ecdcbd', fontVariantNumeric: 'tabular-nums' }}>{dEff[k]}</p>
                        <p className="font-karla font-700 uppercase" style={{ textAlign: 'center', fontSize: '0.6rem', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.42)', marginTop: 4, marginBottom: '1.1rem' }}>Total</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: '1.1rem' }}>
                          {rows.map(([label, val]) => (
                            <div key={label} className="flex items-baseline justify-between" style={{ padding: '0.45rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                              <span className="font-karla" style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.6)' }}>{label}</span>
                              <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#ecdcbd', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
                            </div>
                          ))}
                        </div>

                        <p className="font-karla" style={{ fontSize: '0.78rem', lineHeight: 1.55, color: 'rgba(255,255,255,0.72)' }}>
                          {STAT_ABOUT[k]}
                        </p>
                      </div>
                    </motion.div>
                  )
                })()}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          )
        })()}
      </AnimatePresence>

      {/* ── Skin unlock reveal ── a real moment when a skin is bought: the art
          bursts in on a ray-fan in the skin's color, its name slams up, and a
          chase skin plays its signature FX. Portaled so no transformed ancestor
          clips it. Auto-dismisses; tap to continue. */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {skinUnlock && (() => {
            const skin = getCrewSkin(skinUnlock)
            if (!skin) return null
            const c = skin.color
            // Reveal art glow scales with rarity too — legendary keeps the big
            // aura; rare/epic get a lighter one so it stays consistent with their
            // subtle in-game glow.
            const revealGlow = (groupForSlug(skin.slug) ?? 4) >= 4
              ? `drop-shadow(0 0 26px ${c}) drop-shadow(0 0 72px ${c}88)`
              : `drop-shadow(0 0 12px ${c}) drop-shadow(0 0 30px ${c}66)`
            return (
              <motion.div key="skin-unlock" onClick={() => setSkinUnlock(null)}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}
                style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', cursor: 'pointer', background: 'rgba(3,2,6,0.9)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}>
                {/* Ray-fan burst behind the art */}
                <motion.div aria-hidden initial={{ opacity: 0, scale: 0.35, rotate: -25 }} animate={{ opacity: [0, 0.55, 0.4], scale: [0.35, 1.15, 1.22], rotate: [-25, 15, 30] }} transition={{ duration: 2.4, ease: 'easeOut' }}
                  style={{ position: 'absolute', width: 540, height: 540, borderRadius: '50%', background: `repeating-conic-gradient(from 0deg, ${c}00 0deg, ${c}44 6deg, ${c}00 15deg)`, filter: 'blur(2px)', pointerEvents: 'none' }} />
                {/* White pop flash on arrival */}
                <motion.div aria-hidden initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: [0, 0.8, 0], scale: [0.4, 1.7, 2.1] }} transition={{ duration: 0.55, delay: 0.05, ease: 'easeOut' }}
                  style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: `radial-gradient(circle, #ffffffcc 0%, ${c}55 40%, transparent 70%)`, pointerEvents: 'none' }} />
                {/* Gems flying out — acknowledges the spend. They scatter from the
                    center and fall away as the art lands. */}
                {Array.from({ length: 11 }).map((_, i) => {
                  const ang = (i / 11) * Math.PI * 2
                  const dist = 110 + (i % 3) * 46
                  const dx = Math.cos(ang) * dist
                  const dy = Math.sin(ang) * dist
                  return (
                    <motion.span key={`gem-${i}`} aria-hidden className="font-cinzel"
                      initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
                      animate={{ opacity: [0, 1, 1, 0], x: dx, y: dy + 52, scale: [0.4, 1, 0.95, 0.7] }}
                      transition={{ duration: 1.25, delay: 0.08 + (i % 5) * 0.03, ease: 'easeOut' }}
                      style={{ position: 'absolute', fontSize: '1.05rem', color: '#a78bfa', textShadow: '0 0 10px #a78bfa', pointerEvents: 'none' }}>◆</motion.span>
                  )
                })}
                {skin.gemCost > 0 && (
                  <motion.p aria-hidden className="font-cinzel font-700"
                    initial={{ opacity: 0, y: 0 }} animate={{ opacity: [0, 1, 1, 0], y: -34 }} transition={{ duration: 1.5, delay: 0.1, ease: 'easeOut' }}
                    style={{ position: 'absolute', top: '30%', fontSize: '0.9rem', color: '#c9b6f5', textShadow: '0 0 12px #a78bfa88', pointerEvents: 'none' }}>−{skin.gemCost.toLocaleString()} ◆</motion.p>
                )}

                <motion.p className="font-cinzel font-700 uppercase" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.4 }}
                  style={{ position: 'relative', fontSize: '0.7rem', letterSpacing: '0.3em', color: c, textShadow: `0 0 18px ${c}88`, marginBottom: 16 }}>New Skin Unlocked</motion.p>

                <motion.div initial={{ opacity: 0, scale: 1.32, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.04 }}
                  style={{ position: 'relative', width: 'min(62vw, 250px)', aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {skin.chase && <ChaseSkinFx skinId={skin.id} color={c} variant="summon" />}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={artSrc(skin.filename)} alt={skin.name} style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', objectFit: 'contain', filter: revealGlow }} />
                </motion.div>

                <motion.p className="font-pirata" initial={{ opacity: 0, scale: 1.2, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.22, duration: 0.4, ease: [0.2, 1, 0.3, 1] }}
                  style={{ position: 'relative', fontSize: '2.1rem', color: '#f4ead2', marginTop: 18, textAlign: 'center', lineHeight: 1.04, textShadow: `0 0 26px ${c}aa` }}>{skin.name}</motion.p>
                {skin.blurb && (
                  <motion.p className="font-karla" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.38 }}
                    style={{ position: 'relative', fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', marginTop: 6, textAlign: 'center', maxWidth: 320, lineHeight: 1.4 }}>{skin.blurb}</motion.p>
                )}
                <motion.p className="font-karla font-700 uppercase" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
                  style={{ position: 'relative', fontSize: '0.54rem', letterSpacing: '0.16em', color: 'rgba(255,255,255,0.32)', marginTop: 22 }}>Tap to continue</motion.p>
              </motion.div>
            )
          })()}
        </AnimatePresence>,
        document.body,
      )}

      {/* ── Skin purchase confirmation ── tapping a locked skin opens this
          instead of extending a bottom button. Portaled above the detail modal. */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {skinBuyConfirm && (() => {
            const skin = getCrewSkin(skinBuyConfirm)
            if (!skin) return null
            const c = skin.color
            const canAfford = state.gems >= skin.gemCost
            return (
              <motion.div key="skin-buy-bg" onClick={() => { if (!skinBusy) setSkinBuyConfirm(null) }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
                style={{ position: 'fixed', inset: 0, zIndex: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.4rem', background: 'rgba(3,2,6,0.82)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}>
                <motion.div onClick={e => e.stopPropagation()}
                  initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 6 }} transition={{ duration: 0.18 }}
                  style={{ position: 'relative', width: '100%', maxWidth: 300, borderRadius: 18, padding: '1.1rem 1.05rem 1.15rem', background: 'rgba(10,8,14,0.98)', border: `1px solid ${c}66`, boxShadow: `0 0 40px ${c}22, 0 20px 50px rgba(0,0,0,0.6)` }}>
                  <button onClick={() => { if (!skinBusy) setSkinBuyConfirm(null) }} aria-label="Close" style={{ position: 'absolute', top: 8, right: 10, zIndex: 3, color: 'rgba(255,255,255,0.5)', fontSize: '1.2rem', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0.4rem' }}>✕</button>

                  <p className="font-cinzel font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.2em', color: c, textAlign: 'center', marginBottom: 8 }}>Unlock Skin</p>
                  <div style={{ position: 'relative', width: 118, height: 118, margin: '0 auto', borderRadius: 12, overflow: 'hidden', border: `1px solid ${c}55`, background: `radial-gradient(ellipse at 50% 38%, ${c}22 0%, #060409 74%)` }}>
                    {skin.chase && <ChaseSkinFx skinId={skin.id} color={c} />}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={artSrc(skin.filename)} alt={skin.name} className={skin.chase ? 'chase-skin-glow' : undefined}
                      style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', objectFit: 'contain', padding: 8, ...(skin.chase ? { ['--chase-c']: c } : { filter: skinArtGlow(c, groupForSlug(skin.slug) ?? 4, true) }) } as React.CSSProperties} />
                  </div>
                  <p className="font-pirata" style={{ fontSize: '1.35rem', color: '#f4ead2', textAlign: 'center', marginTop: 10, lineHeight: 1.05 }}>{skin.name}</p>
                  {skin.blurb && <p className="font-karla" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginTop: 3, lineHeight: 1.4 }}>{skin.blurb}</p>}

                  <div className="flex items-center justify-center" style={{ gap: 6, margin: '11px 0 12px' }}>
                    <span className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#c9b6f5' }}>{skin.gemCost.toLocaleString()} ◆</span>
                    <span className="font-karla" style={{ fontSize: '0.6rem', color: canAfford ? 'rgba(255,255,255,0.4)' : '#f2b0b0' }}>· you have {state.gems.toLocaleString()}</span>
                  </div>

                  <div className="flex" style={{ gap: 8 }}>
                    <button type="button" disabled={!!skinBusy} onClick={() => { if (!skinBusy) setSkinBuyConfirm(null) }}
                      className="font-karla font-700 uppercase tracking-[0.08em]" style={{ flex: 1, padding: '0.6rem', borderRadius: 11, fontSize: '0.62rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.72)', cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button type="button" disabled={!!skinBusy || !canAfford}
                      onClick={() => { if (skinBusy || !canAfford) return; const id = skin.id; setSkinBuyConfirm(null); runSkinAction(`buy:${id}`, () => buyCrewSkin(id)) }}
                      className="font-karla font-700 uppercase tracking-[0.08em]" style={{ flex: 1.4, padding: '0.6rem', borderRadius: 11, fontSize: '0.62rem', background: canAfford ? `${c}22` : 'rgba(255,255,255,0.04)', border: `1px solid ${canAfford ? c + '77' : 'rgba(255,255,255,0.12)'}`, color: canAfford ? '#fff' : 'rgba(255,255,255,0.4)', cursor: canAfford ? 'pointer' : 'default', opacity: skinBusy ? 0.5 : 1 }}>
                      {skinBusy ? '…' : canAfford ? `Unlock · ${skin.gemCost.toLocaleString()} ◆` : `Need ${(skin.gemCost - state.gems).toLocaleString()} ◆`}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )
          })()}
        </AnimatePresence>,
        document.body,
      )}

      {/* ── Trunk skin splash — full art + buy/equip, LoL-style. Opened by
          tapping any tile in the Skins gallery; handles every state. ── */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {skinDetail && (() => {
            const skin = getCrewSkin(skinDetail)
            if (!skin) return null
            const c = skin.color
            const rarity = (groupForSlug(skin.slug) ?? 4) as CrewRarity
            const owned = state.ownedCrewSkins.includes(skin.id)
            const ownsCrew = new Set(state.roster.map(m => (m.slug ?? '').toLowerCase())).has(skin.slug)
            const equipped = (state.equippedCrewSkins[skin.slug] ?? null) === skin.id
            const canAfford = state.gems >= skin.gemCost
            const crewName = crewDisplayName(skin.slug, skin.slug.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()))
            const close = () => { if (!skinBusy) setSkinDetail(null) }
            return (
              <motion.div key="skin-splash-bg" onClick={close}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
                style={{ position: 'fixed', inset: 0, zIndex: 265, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.4rem', background: 'rgba(3,2,6,0.85)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}>
                <motion.div onClick={e => e.stopPropagation()}
                  initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 6 }} transition={{ duration: 0.18 }}
                  style={{ position: 'relative', width: '100%', maxWidth: 340, borderRadius: 20, overflow: 'hidden', background: 'rgba(10,8,14,0.99)', border: `1px solid ${c}66`, boxShadow: `0 0 44px ${c}26, 0 22px 55px rgba(0,0,0,0.65)` }}>
                  <button onClick={close} aria-label="Close" style={{ position: 'absolute', top: 6, right: 12, zIndex: 4, color: 'rgba(255,255,255,0.65)', fontSize: '1.35rem', lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0.4rem' }}>✕</button>
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '1', background: `radial-gradient(ellipse at 50% 34%, ${c}2e 0%, #060409 76%)` }}>
                    {/* Chase FX + animated glow show for the preview even when UNOWNED,
                        so you see exactly what you'd buy (LoL-style). */}
                    {skin.chase && <ChaseSkinFx skinId={skin.id} color={c} />}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={artSrc(skin.filename)} alt={skin.name} className={skin.chase ? 'chase-skin-glow' : undefined}
                      style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', objectFit: 'contain', padding: 18,
                        ...(skin.chase ? { ['--chase-c']: c } : { filter: skinArtGlow(c, rarity, true) }) } as React.CSSProperties} />
                    {!owned && (
                      <span aria-hidden title="Locked" style={{ position: 'absolute', top: 9, left: 10, zIndex: 3, width: 24, height: 24, borderRadius: 7, background: 'rgba(6,4,9,0.72)', border: '1px solid rgba(255,255,255,0.16)', display: 'grid', placeItems: 'center' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                      </span>
                    )}
                  </div>
                  <div style={{ padding: '0.9rem 1.05rem 1.1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                      <span className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.12em', color: c, background: `${c}1f`, border: `1px solid ${c}55`, borderRadius: 999, padding: '0.14rem 0.5rem' }}>{RARITY_NAMES[rarity] ?? ''}</span>
                      <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.55)' }}>{crewName}</span>
                    </div>
                    <p className="font-pirata" style={{ fontSize: '1.7rem', color: '#f4ead2', lineHeight: 1.02 }}>{skin.name}</p>
                    {skin.blurb && <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginTop: 5, lineHeight: 1.45 }}>{skin.blurb}</p>}
                    <div style={{ marginTop: 13 }}>
                      {equipped ? (
                        <button type="button" disabled={!!skinBusy} onClick={() => runSkinAction(`equip:none:${skin.slug}`, () => equipCrewSkin(skin.slug, null))}
                          className="font-karla font-700 uppercase tracking-[0.08em] w-full"
                          style={{ padding: '0.75rem', borderRadius: 12, fontSize: '0.64rem', background: `${c}22`, border: `1px solid ${c}77`, color: '#fff', cursor: 'pointer', opacity: skinBusy ? 0.5 : 1 }}>
                          {skinBusy ? '…' : '✓ Equipped · tap to remove'}
                        </button>
                      ) : owned && ownsCrew ? (
                        <button type="button" disabled={!!skinBusy} onClick={() => runSkinAction(`equip:${skin.id}`, () => equipCrewSkin(skin.slug, skin.id))}
                          className="font-karla font-700 uppercase tracking-[0.08em] w-full"
                          style={{ padding: '0.75rem', borderRadius: 12, fontSize: '0.66rem', background: `${c}2a`, border: `1px solid ${c}88`, color: '#fff', cursor: 'pointer', opacity: skinBusy ? 0.5 : 1 }}>
                          {skinBusy ? '…' : 'Equip'}
                        </button>
                      ) : owned && !ownsCrew ? (
                        <div style={{ padding: '0.7rem', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', textAlign: 'center' }}>
                          <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#e8dcc8' }}>Collected</p>
                          <p className="font-karla" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Recruit {crewName} to wear it.</p>
                        </div>
                      ) : ownsCrew ? (
                        <>
                          <button type="button" disabled={!!skinBusy || !canAfford}
                            onClick={() => { if (skinBusy || !canAfford) return; const id = skin.id; runSkinAction(`buy:${id}`, () => buyCrewSkin(id)) }}
                            className="font-karla font-700 uppercase tracking-[0.08em] w-full"
                            style={{ padding: '0.75rem', borderRadius: 12, fontSize: '0.66rem', background: canAfford ? `${c}2a` : 'rgba(255,255,255,0.04)', border: `1px solid ${canAfford ? c + '88' : 'rgba(255,255,255,0.12)'}`, color: canAfford ? '#fff' : 'rgba(255,255,255,0.42)', cursor: canAfford ? 'pointer' : 'default', opacity: skinBusy ? 0.5 : 1 }}>
                            {skinBusy ? '…' : canAfford ? `Buy · ${skin.gemCost.toLocaleString()} ◆` : `Need ${(skin.gemCost - state.gems).toLocaleString()} more ◆`}
                          </button>
                          <p className="font-karla" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 6 }}>You have {state.gems.toLocaleString()} ◆ · buying equips it</p>
                        </>
                      ) : (
                        <div style={{ padding: '0.7rem', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', textAlign: 'center' }}>
                          <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#e8dcc8' }}>Recruit {crewName} to unlock</p>
                          <p className="font-karla" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{skin.gemCost.toLocaleString()} ◆ once recruited, or win it in the Blood Market gamble.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )
          })()}
        </AnimatePresence>,
        document.body,
      )}

      {/* ── Blood Market confirm-before-spend (reroll tiers + gamble) ── */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {bloodConfirm && (() => {
            const isGamble = bloodConfirm.kind === 'gamble'
            const tier = !isGamble ? BLOOD_REROLL_TIERS.find(t => t.id === bloodConfirm.tierId) : undefined
            if (!isGamble && !tier) return null
            const bloodCost = isGamble ? BLOOD_SKIN_GAMBLE_COST : tier!.bloodCost
            const gemCost = isGamble ? 0 : state.rerollCost
            const canAfford = state.bloodGems >= bloodCost && (isGamble || state.gems >= gemCost)
            const epicPct = tier ? rerollEpicPct(tier.weights) : 0
            const legOdds = tier ? rerollLegOdds(tier.weights) : 0
            return (
              <motion.div key="blood-confirm" onClick={() => setBloodConfirm(null)}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
                style={{ position: 'fixed', inset: 0, zIndex: 275, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.4rem', background: 'rgba(4,2,4,0.84)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}>
                <motion.div onClick={e => e.stopPropagation()}
                  initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 6 }} transition={{ duration: 0.18 }}
                  style={{ position: 'relative', width: '100%', maxWidth: 310, borderRadius: 18, padding: '1.15rem 1.05rem 1.1rem', background: 'linear-gradient(180deg, rgba(22,9,12,0.99), rgba(10,5,7,0.99))', border: `1px solid ${BLOOD}66`, boxShadow: `0 0 40px ${BLOOD}26, 0 20px 50px rgba(0,0,0,0.6)` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <BloodDrop size={18} />
                    <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: `${BLOOD}dd` }}>{isGamble ? 'Wager' : 'Blood-Charged Reroll'}</p>
                  </div>
                  <p className="font-cinzel font-800" style={{ fontSize: '1.25rem', color: '#f4ead2', lineHeight: 1.08 }}>{isGamble ? 'Skin Gamble' : `${tier!.name} Reroll`}</p>
                  <p className="font-karla" style={{ fontSize: '0.72rem', color: '#b0aaa0', lineHeight: 1.45, marginTop: 6 }}>
                    {isGamble
                      ? 'Roll for a random crew skin you don’t own yet. Every roll lands one you’re missing.'
                      : 'Rerolls your recruit board with boosted odds. Your new board reveals on the Recruit tab.'}
                  </p>
                  {tier && (
                    <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
                      <div style={{ flex: 1, textAlign: 'center', padding: '0.45rem', borderRadius: 9, background: `${BLOOD}10`, border: `1px solid ${BLOOD}30` }}>
                        <p className="font-cinzel font-800" style={{ fontSize: '0.9rem', color: '#f3c0c6' }}>~{epicPct}%</p>
                        <p className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.1em', color: '#9a948a', marginTop: 1 }}>Epic</p>
                      </div>
                      <div style={{ flex: 1, textAlign: 'center', padding: '0.45rem', borderRadius: 9, background: `${BLOOD}10`, border: `1px solid ${BLOOD}30` }}>
                        <p className="font-cinzel font-800" style={{ fontSize: '0.9rem', color: '#f3c0c6' }}>1-in-{legOdds}</p>
                        <p className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.1em', color: '#9a948a', marginTop: 1 }}>Legendary</p>
                      </div>
                    </div>
                  )}
                  {tier && (
                    <p className="font-karla" style={{ fontSize: '0.54rem', color: 'rgba(255,255,255,0.42)', textAlign: 'center', marginTop: 6 }}>
                      vs base ~{rerollEpicPct(GEM_WEIGHTS)}% Epic · 1-in-{rerollLegOdds(GEM_WEIGHTS)} Legendary
                    </p>
                  )}
                  <div className="flex items-center justify-center" style={{ gap: 8, margin: '12px 0 12px' }}>
                    {gemCost > 0 && <span className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#c9b6f5' }}>{gemCost} ◆</span>}
                    <span className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#f3c0c6', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{bloodCost} <BloodDrop size={13} /></span>
                    <span className="font-karla" style={{ fontSize: '0.58rem', color: canAfford ? 'rgba(255,255,255,0.4)' : '#f2b0b0' }}>· you have {state.bloodGems}</span>
                  </div>
                  <div className="flex" style={{ gap: 8 }}>
                    <button type="button" onClick={() => setBloodConfirm(null)}
                      className="font-karla font-700 uppercase tracking-[0.08em]" style={{ flex: 1, padding: '0.6rem', borderRadius: 11, fontSize: '0.62rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.72)', cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button type="button" disabled={!canAfford}
                      onClick={() => { if (!canAfford) return; const c = bloodConfirm; setBloodConfirm(null); if (c.kind === 'gamble') handleGambleSkin(); else handleReroll(c.tierId) }}
                      className="font-karla font-700 uppercase tracking-[0.08em]" style={{ flex: 1.4, padding: '0.6rem', borderRadius: 11, fontSize: '0.62rem', background: canAfford ? `${BLOOD}33` : 'rgba(255,255,255,0.04)', border: `1px solid ${canAfford ? `${BLOOD}88` : 'rgba(255,255,255,0.12)'}`, color: canAfford ? '#fff' : 'rgba(255,255,255,0.4)', cursor: canAfford ? 'pointer' : 'default' }}>
                      {isGamble ? 'Gamble' : 'Reroll'}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )
          })()}
        </AnimatePresence>,
        document.body,
      )}

      {/* ── The Blood Market "how it works" help ── */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showBloodHelp && (
            <motion.div key="blood-help" onClick={() => setShowBloodHelp(false)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
              style={{ position: 'fixed', inset: 0, zIndex: 270, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.4rem', background: 'rgba(4,2,4,0.84)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}>
              <motion.div onClick={e => e.stopPropagation()}
                initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 6 }} transition={{ duration: 0.18 }}
                style={{ position: 'relative', width: '100%', maxWidth: 340, borderRadius: 18, padding: '1.2rem 1.1rem 1.1rem', background: 'linear-gradient(180deg, rgba(22,9,12,0.99), rgba(10,5,7,0.99))', border: `1px solid ${BLOOD}55`, boxShadow: `0 0 40px ${BLOOD}26, 0 20px 50px rgba(0,0,0,0.6)` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                  <BloodDrop size={22} />
                  <p className="font-cinzel font-800" style={{ fontSize: '1.15rem', color: '#f3c0c6' }}>The Blood Market</p>
                </div>
                <p className="font-karla" style={{ fontSize: '0.74rem', color: '#b0aaa0', lineHeight: 1.5 }}>
                  Blood Gems are the spoils of the <span style={{ color: '#f0a9b1', fontWeight: 700 }}>Hardcore Gauntlet</span> — pulled from the cash-out chest, and only yours if you bring your crew home alive.
                </p>
                <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ padding: '0.55rem 0.7rem', borderRadius: 10, background: `${BLOOD}10`, border: `1px solid ${BLOOD}2e` }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: '#f0ede8' }}>Blood-Charged Reroll</p>
                    <p className="font-karla" style={{ fontSize: '0.68rem', color: '#9a948a', lineHeight: 1.45, marginTop: 2 }}>Spend them with gems to sway a recruit reroll toward Epic and Legendary.</p>
                  </div>
                  <div style={{ padding: '0.55rem 0.7rem', borderRadius: 10, background: `${BLOOD}10`, border: `1px solid ${BLOOD}2e` }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: '#f0ede8' }}>Skin Gamble</p>
                    <p className="font-karla" style={{ fontSize: '0.68rem', color: '#9a948a', lineHeight: 1.45, marginTop: 2 }}>Wager {BLOOD_SKIN_GAMBLE_COST} for a random crew skin you don&apos;t own yet.</p>
                  </div>
                </div>
                <button onClick={() => setShowBloodHelp(false)} className="font-karla font-700 uppercase tracking-[0.1em] active:scale-95"
                  style={{ marginTop: 12, width: '100%', padding: '0.62rem', borderRadius: 11, fontSize: '0.62rem', background: `${BLOOD}22`, border: `1px solid ${BLOOD}66`, color: '#fce3e6', cursor: 'pointer' }}>
                  Got it
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* ── Blood Gem skin gamble reveal ── two beats: a crimson suspense roll,
           then the won skin slams in on a shockwave. Portaled above everything. */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {skinGamble && (() => {
            const rolling = skinGamble.phase === 'rolling'
            const won = skinGamble.phase === 'revealed' && skinGamble.skinId ? getCrewSkin(skinGamble.skinId) : null
            return (
              <motion.div key="blood-gamble" onClick={() => { if (!rolling) setSkinGamble(null) }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
                style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', textAlign: 'center', cursor: rolling ? 'default' : 'pointer', overflow: 'hidden', background: 'radial-gradient(ellipse at center, rgba(52,6,12,0.95) 0%, rgba(6,2,4,0.98) 100%)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
                {/* Rotating crimson ray-fan — faster while rolling, grand on reveal. */}
                <motion.div aria-hidden
                  initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: rolling ? 0.4 : 0.6, scale: rolling ? 1 : 1.15, rotate: 360 }}
                  transition={{ opacity: { duration: 0.5 }, scale: { duration: 0.7 }, rotate: { duration: rolling ? 7 : 26, ease: 'linear', repeat: Infinity } }}
                  style={{ position: 'absolute', width: 680, height: 680, borderRadius: '50%', background: `conic-gradient(from 0deg, ${BLOOD}00, ${BLOOD}40, ${BLOOD}00, ${BLOOD}00, ${BLOOD}40, ${BLOOD}00, ${BLOOD}00, ${BLOOD}40, ${BLOOD}00)`, maskImage: 'radial-gradient(circle, transparent 24%, #000 42%, transparent 74%)', WebkitMaskImage: 'radial-gradient(circle, transparent 24%, #000 42%, transparent 74%)' }} />

                {rolling ? (
                  <>
                    <motion.div aria-hidden animate={{ scale: [1, 1.16, 1], boxShadow: [`0 0 30px ${BLOOD}88`, `0 0 64px ${BLOOD}`, `0 0 30px ${BLOOD}88`] }} transition={{ duration: 0.7, repeat: Infinity }}
                      style={{ position: 'relative', width: 116, height: 116, borderRadius: '50%', background: `radial-gradient(circle at 40% 35%, ${BLOOD}, #5f0d16)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.9, ease: 'linear', repeat: Infinity }}><BloodDrop size={42} /></motion.div>
                    </motion.div>
                    {[...Array(7)].map((_, i) => {
                      const ang = (i / 7) * Math.PI * 2
                      return (
                        <motion.span key={i} aria-hidden
                          initial={{ opacity: 0, x: 0, y: 0 }}
                          animate={{ opacity: [0, 0.9, 0], x: Math.cos(ang) * 90, y: Math.sin(ang) * 90, rotate: 360 }}
                          transition={{ duration: 1, delay: i * 0.09, repeat: Infinity }}
                          style={{ position: 'absolute' }}><BloodDrop size={11 + (i % 3) * 3} /></motion.span>
                      )
                    })}
                    <motion.p className="font-cinzel font-700 uppercase" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 0.9, repeat: Infinity }}
                      style={{ position: 'relative', marginTop: 28, fontSize: '0.8rem', letterSpacing: '0.24em', color: '#f0a9b1', textIndent: '0.24em' }}>The blood churns</motion.p>
                  </>
                ) : won ? (() => {
                  const c = won.color
                  const glow = skinArtGlow(c, groupForSlug(won.slug) ?? 3, true)
                  const ownsCrew = state.roster.some(m => m.slug === won.slug)
                  const crewName = crewDisplayName(won.slug, won.slug.replace(/_/g, ' '))
                  return (
                    <>
                      {[0, 0.1, 0.22].map((d, i) => (
                        <motion.div key={i} aria-hidden initial={{ scale: 0, opacity: 0.85 }} animate={{ scale: 4.6, opacity: 0 }} transition={{ duration: 1.25, ease: 'easeOut', delay: d }}
                          style={{ position: 'absolute', width: 130, height: 130, borderRadius: '50%', border: `2px solid ${BLOOD}`, boxShadow: `0 0 26px ${BLOOD}` }} />
                      ))}
                      <motion.p className="font-cinzel font-700 uppercase" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 0.9, y: 0 }} transition={{ delay: 0.14 }}
                        style={{ position: 'relative', fontSize: '0.66rem', letterSpacing: '0.34em', color: '#f3c0c6', marginBottom: 14, textIndent: '0.34em' }}>New Skin</motion.p>
                      <motion.div initial={{ scale: 0, opacity: 0, rotate: -8 }} animate={{ scale: [0, 1.2, 1], opacity: 1, rotate: 0 }} transition={{ duration: 0.7, ease: 'easeOut', times: [0, 0.6, 1] }}
                        style={{ position: 'relative', width: 'min(64vw, 260px)', aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={artSrc(won.filename)} alt={won.name} style={{ width: '100%', height: '100%', objectFit: 'contain', filter: glow }} />
                      </motion.div>
                      <motion.p className="font-pirata" initial={{ opacity: 0, scale: 1.2, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4, ease: [0.2, 1, 0.3, 1] }}
                        style={{ position: 'relative', fontSize: '2.2rem', color: '#f4ead2', marginTop: 16, lineHeight: 1.04, textShadow: `0 0 26px ${c}aa` }}>{won.name}</motion.p>
                      {/* Which crew the skin is for. */}
                      <motion.p className="font-cinzel font-700 uppercase" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                        style={{ position: 'relative', fontSize: '0.62rem', letterSpacing: '0.14em', color: c, marginTop: 4, textShadow: `0 0 12px ${c}66` }}>
                        {crewName}<span style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em' }}> skin</span>
                      </motion.p>
                      {won.blurb && (
                        <motion.p className="font-karla" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.36 }}
                          style={{ position: 'relative', fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', marginTop: 6, maxWidth: 320, lineHeight: 1.4 }}>{won.blurb}</motion.p>
                      )}
                      <motion.p className="font-karla font-700 uppercase" initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 1 }}
                        style={{ position: 'relative', fontSize: '0.54rem', letterSpacing: '0.16em', color: 'rgba(255,255,255,0.4)', marginTop: 22 }}>Tap to continue · {ownsCrew ? 'equip it in the Skins tab' : 'recruit its crew to wear it'}</motion.p>
                    </>
                  )
                })() : null}
              </motion.div>
            )
          })()}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}

// Local Stat pill component was used by the gems/nav/roster header
// strip. That strip was dropped to declutter the top of the page
// (gems + nav level live in the Nav, roster count repeats in the tab
// label + the section header). Component removed.
