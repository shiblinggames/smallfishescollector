'use client'

import { useState, useEffect, useMemo, useRef, useTransition, type ReactNode } from 'react'
import CloseButton from '@/components/CloseButton'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  rerollBoard, recruitCrew, dismissCrew, getCrewGraveyard,
  assignToVoyage, assignToRaid, benchCrew, clearParty, promoteToCaptain, renameCrew,
  upgradeCrewHall, buyCrewSkin, equipCrewSkin, gambleBloodSkin, markCrewGuideSeen,
  type CrewState, type BoardCandidate, type CrewMember, type CrewActionResult, type FallenCrew,
} from './actions'
import { BLOOD_REROLL_TIERS, BLOOD_SKIN_GAMBLE_COST } from '@/lib/gauntlet'
import { crewSkinsForSlug, getCrewSkin, getCrewSkinByFilename, skinArtGlow, CREW_SKINS } from '@/lib/crewSkins'
import { ChaseSkinFx } from '@/components/ChaseSkinFx'
import { XP_TABLE as NAV_XP_TABLE, MAX_LEVEL as NAV_MAX_LEVEL } from '@/lib/expeditionLevel'
import { hallTierDef, nextHallTier, hallUpgradeBlocker, CREW_HALL_MAX_TIER, CREW_HALL_TIERS, type CrewHallTierNum } from '@/lib/crewHall'
import { hallRosterBonus, capacityBreakdown, crewCapacity } from '@/lib/crewCapacity'
import { bunkRatePerHour, storesCapHours, stintDone, tierNumeral, nextDrillCost, nextStoresCost, ladderHallLocked, isLeviathanSlot, DRILL_MAX_LEVEL, LEVIATHAN_COLOR, bunkCount } from '@/lib/crewBunks'
import { crewAssignment } from '@/lib/crewAssignment'
import { CREW_PANEL_BG, CREW_PANEL_BORDER } from '@/lib/crewPanel'
import HallBunks from './HallBunks'
import { bunkCrew, collectBunk, buyDrill, buyStores } from './bunkActions'
import { RARITY_NAMES, RARITY_COLORS, groupForSlug, crewDisplayName, GEM_WEIGHTS, type CrewRarity } from '@/lib/crewGen'
import { applyCrewEffects, decodeTraitStats, isDivineTrait, netTraitStats, traitLabel, traitKind, type TraitStats } from '@/lib/crewEffects'
import AssignBoard from './AssignBoard'
import AssignPicker from './AssignPicker'
import { useReveal, BoardReveal, RevealFlash, RevealBanner } from './boardReveal'
import { ROUTE_CONFIGS, type VoyageRoute } from '@/lib/voyageRoutes'
import { crewLevelFromXP, crewXPProgress, levelStatBonuses, CREW_MAX_LEVEL, XP_TABLE as CREW_XP_TABLE } from '@/lib/crewLevel'

/** Total XP at the crew level ceiling. Drives the Potential sort, which judges
 *  every hand at Lv 100 rather than wherever it happens to be today. */
const MAX_LEVEL_XP = CREW_XP_TABLE[CREW_MAX_LEVEL - 1]
import { classForSlug, CLASSES, currentMilestone, nextMilestone, CLASS_UNLOCK_LEVEL, type AnyClassDef } from '@/lib/crewClasses'
import { vibrate, hapticTap } from '@/lib/haptics'
import SwipeAction from '@/components/SwipeAction'
import { playChestSfx } from '@/lib/fishingMusic'
import GuideCoach from '@/components/GuideCoach'
import { GUIDES } from '@/lib/onboardingScenes'
import Link from 'next/link'

// First-time Crew Hall guide — walks the tabs and says plainly what each is
// for. Blood offerings live inside Recruit and Skins now, and the fallen are a
// button inside Roster, so neither needs a step.
//
// ASSIGN LEADS, because it is the first tab and the one that actually changes
// how you perform: a full roster does nothing until somebody is in a seat. The
// guide used to open on Recruit and tell players they assign crew from the
// Roster, which has not been true since Assign was split out.
//
// The order is the STORY, not the tab bar: seat them, sign more on, see what
// you have, put the spare ones to work, then dress the legends. (Recruit
// therefore comes before Roster even though the bar puts Roster first.)
//
// Every tab in the bar needs a step here or the feature is invisible to a new
// player. Hall shipped without one, which is what this list is for.
const CREW_GUIDE: { tab: 'assign' | 'recruits' | 'roster' | 'hall' | 'wardrobe'; portrait: string; speaker: string; text: string }[] = [
  { tab: 'assign',   portrait: GUIDES.kat.portrait,  speaker: 'Kat',  text: "This is your Crew Hall. *Assign* is where you seat your crew: a raid party and a voyage party. Empty seats are wasted crew, so fill them." },
  { tab: 'assign',   portrait: GUIDES.doby.portrait, speaker: 'Doby', text: "Each party totals up the power, savvy and fortune of everyone seated. A hand can only be in one place at a time, so choose." },
  { tab: 'recruits', portrait: GUIDES.doby.portrait, speaker: 'Doby', text: "Sign on new hands in the *Recruit* tab. You get free picks that refresh over time." },
  { tab: 'roster',   portrait: GUIDES.kat.portrait,  speaker: 'Kat',  text: "Your *Roster* is every hand you own. They level up from raids and voyages, and this is where you check what you have got." },
  { tab: 'hall',     portrait: GUIDES.kat.portrait,  speaker: 'Kat',  text: "The *Hall* is where hands you are not sailing with still earn their keep. Bunk one and they train on their own while you are away." },
  { tab: 'hall',     portrait: GUIDES.doby.portrait, speaker: 'Doby', text: "A bunk is a commitment. They are in for the whole stint with no early way out, so come back when the clock is up and collect the XP." },
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
/** Counts a number up on collect. Same curve and duration as the trawl haul
 *  reveal's, so a payout animates identically wherever it lands. */
function CountUp({ to, prefix = '', className, style }: { to: number; prefix?: string; className?: string; style?: React.CSSProperties }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0; const start = performance.now(); const dur = 700
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur)
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return <span className={className} style={style}>{prefix}{v.toLocaleString()}</span>
}

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
// What each stat actually does, per place it does it.
//
// A LIST, not a sentence. This is the one screen where a new player asks a
// direct question ("what is Fortune for?") and it used to answer with a single
// run-on line covering two systems, which is hard to scan and was quietly
// wrong: it had not been updated for the Gauntlet, for trawls, or for the fact
// that Fortune is what keeps crew ALIVE on a voyage.
//
// Keep one line per place. If a stat starts doing something new somewhere,
// it gets a row here or players will never find out.
const STAT_ABOUT: Record<'power' | 'dodge' | 'fortune', { lead: string; rows: [string, string][] }> = {
  power: {
    lead: 'How hard your hands hit.',
    rows: [
      ['Raids',   'More damage on every shot you land.'],
      ['Voyages', 'Wins the fights your crew runs into.'],
    ],
  },
  dodge: {
    lead: 'How well your hands read trouble coming.',
    rows: [
      ['Raids',   'Slip enemy shots, and act first more often.'],
      ['Voyages', 'Slips past danger out at sea.'],
      ['Trawls',  'More fishing XP from every haul.'],
    ],
  },
  fortune: {
    lead: 'Plain luck, and the quietest stat worth stacking.',
    rows: [
      ['Voyages',  'Keeps crew alive. Enough of it makes a route risk free.'],
      ['Raids',    'Better drop odds, and repair kits heal for more.'],
      ['Gauntlet', 'Better chest odds, up to double at 150 Fortune.'],
      ['Trawls',   'More doubloons, and a better shot at a bumper haul.'],
    ],
  },
}

const STAT_COLOR = { power: '#f87171', dodge: '#60a5fa', fortune: '#f0c040' }

/** Roster orderings. Level leads and is the default; the server's own
 *  recruited_at order is no longer offered, so newly signed hands sort by
 *  merit like everyone else rather than sitting at the top. */
const ROSTER_SORTS = [
  // OVERALL leads because it answers the question the roster is usually open
  // for: who is actually carrying this crew, and therefore who is safe to let
  // go. Players were doing this sum by hand, card by card, to decide who to
  // dismiss. Level alone rewards whoever has been aboard longest; the stat
  // sorts each answer a third of the question.
  //
  // Every entry here is usable as EITHER key, which is why none of them carry
  // their own private tie-break any more: the second dropdown is the tie-break,
  // and a key that also sorted by something else behind the player's back would
  // make the pair of dropdowns a lie.
  { k: 'overall' as const, label: 'Overall', color: '#f0ede8' },
  // POTENTIAL answers the other half of the dismiss question. Overall ranks who
  // is carrying the crew TODAY, which buries a promising hand for the crime of
  // being new. This ranks what each hand becomes at Lv 100, so a fresh recruit
  // and a veteran are judged on the same footing and the roster can say "this
  // Lv 1 outgrows that Lv 17" without anyone doing the arithmetic. Pairs
  // naturally with Level as the second key: best ceiling, least distance left.
  { k: 'potential' as const, label: 'Potential', color: '#c9a7f5' },
  { k: 'level'   as const, label: 'Level',   color: '#7fdfa3' },
  { k: 'name'    as const, label: 'Name',    color: '#bcb29a' },
  { k: 'rarity'  as const, label: 'Rarity',  color: '#a78bfa' },
  { k: 'power'   as const, label: 'Power',   color: '#f87171' },
  { k: 'dodge'   as const, label: 'Savvy',   color: '#60a5fa' },
  { k: 'fortune' as const, label: 'Fortune', color: '#f0c040' },
]
type RosterSort = typeof ROSTER_SORTS[number]['k']
const STAT_LABEL = { power: 'PWR', dodge: 'SAV', fortune: 'FTN' }

// Section accents so the two boards read as visually distinct regions.
const SECTION_ROSTER = '#6fa8c9'  // cool steel "your manifest"
const SECTION_NEUTRAL = '#9aa3b1'  // a plain manifest, not a track

// Panel tones: warm brown wood for the board, cool slate for your own crew, so
// the two are obviously different at a glance.
// Card panels were tinted warm-brown (recruits) and cool-slate (roster),
// then flattened to neutral charcoal so the colored elements could pop.
// Now lives in lib/crewPanel so the assign board can wear the SAME plate as the
// roster card rather than a second copy of the same two hexes.
const PANEL_BG     = CREW_PANEL_BG
const PANEL_BORDER = CREW_PANEL_BORDER
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
  name, filename, rarity, base, effects, xp = 0, slug = '', assignment, isCaptain = false, locked = false, lockKind = 'voyage', lockLabel = 'This crew is currently at sea on a voyage.', hasLevelUp = false, aboard = false, bunked = false, bunkLocked = false, dimmed, hint,
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
   *  "at sea" / "on a trawl" / "training" caption so they read apart at a
   *  glance (the tooltip alone is invisible on mobile).
   *
   *  `bunk` is a real lock like the other two: a hand mid-stint in the Crew
   *  Hall cannot be assigned, trawled or dismissed (assertCanReassign refuses
   *  all three). It used to set only the duty TAG, so a training crew read at
   *  full brightness beside a greyed-out trawling one and still offered a
   *  swipe-to-dismiss that the server bounced. */
  lockKind?: 'voyage' | 'trawl' | 'bunk'
  /** Tooltip on the lock badge — distinguishes voyage vs trawl. */
  lockLabel?: string
  /** Holding a bunk in the Crew Hall. */
  bunked?: boolean
  /** Mid-stint, so hard-locked: cannot be assigned, trawled or dismissed until
   *  it finishes. A finished stint is only waiting to be collected. */
  bunkLocked?: boolean
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

  // Rarity color now lives ONLY on the portrait niche border so the roster
  // grid reads as calm and uniform; the card root keeps its plain section
  // styling regardless of tier. (Previously the whole card carried a
  // tinted wash + tinted border + outer glow that grew with tier, which
  // made the roster look visually loud once five rarities were on screen.)
  // One soft drop and nothing else. This used to stack three: an inset hairline
  // that doubled the border, an inset top-highlight that was a glossy bevel, and
  // the drop. The bevel in particular is what made the card look a decade old.
  const cardShadow = '0 2px 10px rgba(0,0,0,0.38)'

  // What this hand is currently DOING. `assignment` has been passed on every
  // roster card since the party sections were removed but nothing rendered it,
  // so a crew's duty was invisible on the roster.
  //
  // Priority is where they physically are first, then what they are rostered
  // for: a raid-party hand who is out on a trawl reads "Trawling", because that
  // is the thing stopping you using them right now.
  const duty =
    locked && lockKind === 'trawl' ? { label: 'Trawling', color: '#3fc8aa' }
    // Before the generic `locked` branch, or a bunked hand reads "At sea".
    : (locked && lockKind === 'bunk') || bunkLocked ? { label: 'Training', color: '#f0c040' }
    : locked ? { label: 'At sea', color: '#ffb45a' }
    : bunked ? { label: 'Stint done', color: '#7fdfa3' }
    : assignment === 'raid' ? { label: 'Raid party', color: '#e07c7c' }
    : assignment === 'voyage' ? { label: 'Voyage party', color: '#5fa8c9' }
    : null

  return (
    <motion.div
      onClick={onClick}
      whileTap={onClick && !locked ? { scale: 0.965 } : undefined}
      whileHover={onClick && !locked ? { y: -2 } : undefined}
      transition={{ type: 'spring', stiffness: 460, damping: 26 }}
      style={{
        position: 'relative', display: 'flex', gap: '0.85rem', padding: '0.85rem',
        borderRadius: 14,
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
      {/* The four carved corner brackets that used to sit here are gone. A HUD
          frame around every card in a grid is noise, and it was the detail that
          read oldest. */}

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
        {/* One rounded rect, one ring. This was a tombstone arch wearing TWO
            frames (a 2px rarity ring with a gold hairline inset inside it),
            which is what made the portrait read as an inventory slot rather
            than a character. */}
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: 12, overflow: 'hidden',
          clipPath: 'inset(0 round 12px)',
          border: `1px solid ${color}88`,
          boxShadow: 'inset 0 -14px 22px rgba(0,0,0,0.55)',
          background: `linear-gradient(180deg, ${color}1f 0%, #070504 78%)`,
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
          {/* The inner gold hairline that used to sit here, the second of the
              portrait's two frames, is gone. */}
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

        {/* The net pip that used to sit here is gone: the duty tag below the
            name says "Trawling" in words, and the lock badge already covers
            "cannot be reassigned". Three marks for one fact was too many. */}
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
              // One colour per lock, matching that lock's duty tag below, so the
              // badge and the tag never say different things.
              border: `1.5px solid ${lockKind === 'trawl' ? 'rgba(70,200,170,0.78)' : lockKind === 'bunk' ? 'rgba(240,192,64,0.72)' : 'rgba(255,180,90,0.7)'}`,
              boxShadow: lockKind === 'trawl'
                ? '0 2px 7px rgba(0,0,0,0.6), 0 0 10px rgba(70,200,170,0.42)'
                : lockKind === 'bunk'
                  ? '0 2px 7px rgba(0,0,0,0.6), 0 0 10px rgba(240,192,64,0.38)'
                  : '0 2px 7px rgba(0,0,0,0.6), 0 0 10px rgba(255,180,90,0.4)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={lockKind === 'trawl' ? '#9fe6d4' : lockKind === 'bunk' ? '#ffe7ad' : '#ffd8a3'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
          {/* Rarity, then the trait BY NAME. This line used to read
              "EPIC · 1 trait", which spent the width on a number that is
              always 1 under the current system and told you nothing about
              the crew. The name is the fact worth showing, and it is what
              players compare cards on.

              Flex rather than inline text so the rarity never truncates: only
              the trait ellipsises, and only when a long one like GLASS CANNON
              genuinely runs out of room on a 300px card. */}
          {(() => {
            const t = netTraitStats(effects)
            const label = traitLabel(t)
            const divine = isDivineTrait(t)
            const kind = traitKind(t)
            return (
              <p className="font-cinzel font-700" style={{
                display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0,
                fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase',
                color, marginTop: 3, textShadow: '0 1px 2px rgba(0,0,0,0.6)', whiteSpace: 'nowrap',
              }}>
                <span style={{ flexShrink: 0 }}>{RARITY_NAMES[(rarity as CrewRarity)] ?? 'Common'}</span>
                {label && (
                  <>
                    <span aria-hidden style={{ flexShrink: 0, color: 'rgba(255,255,255,0.28)' }}>·</span>
                    <span
                      className={divine ? 'trait-divine' : undefined}
                      title={label}
                      style={{
                        minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.08em',
                        // Divine paints itself through .trait-divine, so it must
                        // not be handed a colour to override the clipped gradient.
                        ...(divine ? {} : {
                          color: kind === 'buff' ? 'rgba(159,217,177,0.85)'
                            : kind === 'flaw' ? 'rgba(224,154,154,0.85)'
                            : 'rgba(255,255,255,0.45)',
                        }),
                      }}>
                      {label}
                    </span>
                  </>
                )}
              </p>
            )
          })()}
        </div>

        {/* Duty tag. Its own row rather than crowded onto the rarity line,
            which already carries "LEGENDARY · GLASS CANNON" and has no width to
            spare on a 300px card. Costs no height: the column was centred
            precisely because it had ~43px of slack under the stats. */}
        {duty && (
          <span className="font-karla font-700 uppercase" style={{
            alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '0.14rem 0.44rem', borderRadius: 5,
            fontSize: '0.56rem', letterSpacing: '0.09em',
            background: `${duty.color}1c`, border: `1px solid ${duty.color}55`, color: duty.color,
          }}>
            <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: duty.color, flexShrink: 0 }} />
            {duty.label}
          </span>
        )}

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
        position: 'relative', display: 'flex', gap: '0.85rem', padding: '0.85rem',
        borderRadius: 14,
        background: GRAVE_BG,
        border: `1px solid ${GRAVE_BORDER}`,
        boxShadow: '0 2px 10px rgba(0,0,0,0.38)',
      }}>
      {/* Portrait — desaturated sepia */}
      <div style={{
        position: 'relative', width: 86, flexShrink: 0, alignSelf: 'flex-start', height: 96,
        borderRadius: 12, overflow: 'hidden',
        border: `1px solid ${color}66`,
        boxShadow: 'inset 0 -14px 22px rgba(0,0,0,0.6)',
        background: `linear-gradient(180deg, ${color}18 0%, #050403 78%)`,
        filter: 'sepia(0.45) saturate(0.7)',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artSrc(crew.filename)} alt={crew.name} loading="lazy" decoding="async" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'contain', objectPosition: 'center 20%', padding: 2,
          opacity: 0.82,
        }} />
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
          const divine = isDivineTrait(t)
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
              <span className={`font-karla font-700${divine ? ' trait-divine' : ''}`} style={{
                fontSize: '0.5rem', letterSpacing: '0.06em', textTransform: 'uppercase',
                // Divine takes its own colour from .trait-divine (a clipped
                // gradient), so leave `color` off it or the class has nothing
                // to show through.
                ...(divine ? {} : { color: buff ? '#9cc7a8' : '#c79c9c' }),
                background: divine ? 'rgba(63,214,196,0.14)' : buff ? 'rgba(60,120,80,0.18)' : 'rgba(140,60,60,0.18)',
                border: `1px solid ${divine ? 'rgba(63,214,196,0.55)' : buff ? 'rgba(120,180,140,0.4)' : 'rgba(180,110,110,0.4)'}`,
                borderRadius: 3, padding: '0.12rem 0.4rem',
              }}>{label}</span>
            </div>
          )
        })()}
      </div>
    </motion.div>
  )
}

/** A trait's three stats as one compact line ("+2 PWR / -1 DGE"). Zeroes are
 *  dropped, so a single-stat trait reads as one number rather than two blanks
 *  padding it out. Returns "even" for a fully neutral trait. */
function statLine(t: TraitStats): string {
  const parts = ([['PWR', t.power], ['DGE', t.dodge], ['FTN', t.fortune]] as const)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k}`)
  return parts.length ? parts.join(' / ') : 'even'
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
  const [clearingTrack, setClearingTrack] = useState<'raid' | 'voyage' | null>(null)
  /** Which party the captain has ASKED to empty, pending the confirm. */
  const [clearAsk, setClearAsk] = useState<'raid' | 'voyage' | null>(null)
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
  const [rosterSort, setRosterSort] = useState<RosterSort>('overall')
  // The tie-break, chosen rather than hard-coded. Overall on its own answers
  // "who is strongest", and the second key is what turns that into a decision:
  // strongest, and among equals the one with furthest to go, or the rarer one,
  // or the harder hitter.
  const [rosterSort2, setRosterSort2] = useState<RosterSort>('level')

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
  // Skins filters — rarity (per-crew) + ownership (per-skin) as dropdowns, and
  // CHASE as a toggle rather than a third dropdown: it is a yes/no cutting
  // across both of the others, and six chase skins in seventy-five is the one
  // thing a collector actually hunts for in here.
  const [trunkRarity, setTrunkRarity] = useState<CrewRarity | 'all'>('all')
  const [trunkOwned, setTrunkOwned] = useState<'all' | 'owned' | 'missing'>('all')
  const [trunkChase, setTrunkChase] = useState(false)
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
  // Drills and Stores confirm the same way the hall does. They are the same
  // shape of decision — six figures, irreversible — so it would be odd for one
  // to ask and the others to fire on the first tap.
  const [ladderConfirm, setLadderConfirm] = useState<'drill' | 'stores' | null>(null)
  const [hallBusy, setHallBusy] = useState(false)
  // Which ladder just went up, so its ART can pop IN PLACE. This used to be a
  // full-panel overlay, but the hero has overflow:hidden and the overlay's
  // image plus three lines of text did not fit inside it, so it was clipped.
  // Animating the thing you are already looking at is both seamless and
  // impossible to cut off. The words go in the existing fixed-position toast.
  const [pop, setPop] = useState<{ what: 'hall' | 'drill' | 'stores'; accent: string; n: number } | null>(null)
  // What the last bunk claim paid, for the toast. Level-ups come free of a
  // second round trip: CrewXPGrant already carries old/new level.
  // The claim reveal. A hand coming off a bunk is the payoff of the whole
  // feature, so it gets a card with their face on it rather than a line of
  // text sliding along the bottom. Mirrors the trawl haul reveal.
  //
  // `xp: 0` is a real case — a hand at the ceiling comes home having learned
  // nothing — and it still shows, rather than falling silent.
  const [bunkReveal, setBunkReveal] = useState<{
    name: string; filename: string; rarity: number
    xp: number; oldXP: number; newXP: number
    from: number; to: number
    /** What the deep improved, already applied. Present on a Leviathan collect
     *  that beat something. */
    upgrade?: {
      before: TraitStats; after: TraitStats
      beforeLabel: string; afterLabel: string
      gained: { power: boolean; dodge: boolean; fortune: boolean }
    }
  } | null>(null)
  /** A hand who just came out Divine. The rarest outcome the game has, so it
   *  gets its own screen rather than closing the offer card and leaving a chip
   *  on the roster to be noticed later. */
  const [divineMoment, setDivineMoment] = useState<{ name: string; filename: string } | null>(null)
  // What the upgrade changed, in words. Shares the bunk-claim toast's slot:
  // fixed to the viewport, pointer-events none, so it can neither be clipped
  // by an ancestor nor eat a tap.
  const [upgradeSaid, setUpgradeSaid] = useState<{ title: string; sub: string; accent: string } | null>(null)
  useEffect(() => {
    if (!upgradeSaid) return
    const id = setTimeout(() => setUpgradeSaid(null), 3000)
    return () => clearTimeout(id)
  }, [upgradeSaid])

  useEffect(() => {
    if (!pop) return
    const id = setTimeout(() => setPop(null), 1200)
    return () => clearTimeout(id)
  }, [pop])
  /** Bunk claims and unbunks return { state, grants }, so they cannot go
   *  through `run` (which only knows { state } | { error }). Both surface what
   *  was paid; both are safe to call when nothing is owed. */
  function runBunkClaim(action: () => Promise<Awaited<ReturnType<typeof collectBunk>>>) {
    if (pending) return
    setErr(null)
    startTransition(async () => {
      const res = await action()
      if ('error' in res) { setErr(res.error); return }
      setState(res.state)
      // One hand at a time now, so the reveal is about THEM. `freed` drives it
      // rather than `grants`: a crew at the ceiling still comes home and still
      // gets a card, they just learned nothing.
      const id = res.freed[0]
      if (id == null) return
      const g = res.grants.find(x => x.id === id)
      const crew = res.state.roster.find(c => c.id === id)
      if (!crew) return
      const gained = g ? g.newXP - g.oldXP : 0
      const up = res.upgrades.find(u => u.crewId === id)
      // A trait moving is rarer than a level, so it gets the longer buzz even
      // when the level did not move.
      // The long trait buzz is for a trait that MOVED. A re-cut that lost is
      // news, but it is not that kind of news.
      const upMovedHaptic = !!up && (up.gained.power || up.gained.dodge || up.gained.fortune)
      vibrate(upMovedHaptic ? [22, 50, 22, 50, 40] : g && g.newLevel > g.oldLevel ? [18, 60, 30] : 14)
      setBunkReveal({
        name: g?.name ?? crew.name,
        filename: crew.filename,
        rarity: crew.rarity,
        xp: gained,
        oldXP: g?.oldXP ?? crew.xp,
        newXP: g?.newXP ?? crew.xp,
        from: g?.oldLevel ?? crewLevelFromXP(crew.xp),
        to: g?.newLevel ?? crewLevelFromXP(crew.xp),
        upgrade: up && {
          before: up.before, after: up.after,
          beforeLabel: up.beforeLabel, afterLabel: up.afterLabel,
          gained: up.gained,
        },
      })
      // The rarest outcome in the game still gets its own screen. Gated on
      // something having MOVED, or a crew who already carries a divine trait
      // would replay the moment every time the Leviathan rolled and lost.
      if (upMovedHaptic && up && isDivineTrait(up.after)) {
        const crewNow = res.state.roster.find(c => c.id === id)
        if (crewNow) setDivineMoment({ name: crewNow.name, filename: crewNow.filename })
      }
    })
  }

  /** Buy a Drills or Stores tier and show the new art. Reads the level back
   *  off the RETURNED state rather than the current one, so the overlay shows
   *  what you just bought and not what you had. */
  function runLadderUpgrade(kind: 'drill' | 'stores') {
    if (pending) return
    setErr(null)
    // Answer the tap NOW, the way TrawlIndicator and the tackle shop already
    // do. The celebration fires on the way back; this is just the receipt for
    // the press, so a paid upgrade is not silence followed by a surprise.
    hapticTap()
    startTransition(async () => {
      const res = await (kind === 'drill' ? buyDrill() : buyStores())
      setLadderConfirm(null)
      if ('error' in res) { setErr(res.error); return }
      setState(res.state)
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.state.doubloons }))
      vibrate([18, 50, 26])
      const accent = kind === 'drill' ? '#f0c040' : '#7fc4a8'
      setPop({ what: kind, accent, n: Date.now() })
      setUpgradeSaid(kind === 'drill'
        ? {
            title: `Drills ${tierNumeral(res.state.drillLevel)}`,
            sub: `${bunkRatePerHour(res.state.drillLevel).toLocaleString()} XP an hour, every bunk`,
            accent,
          }
        : {
            title: `Stores ${tierNumeral(res.state.storesLevel)}`,
            sub: `${storesCapHours(res.state.storesLevel)}h stints`,
            accent,
          })
    })
  }

  function handleHallUpgrade() {
    if (hallBusy || pending) return
    setErr(null)
    // The hall tier is the most expensive thing on this screen, so the press
    // gets answered first. hallBusy already gives it a visual busy state; this
    // adds the tactile half.
    hapticTap()
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
        setPop({ what: 'hall', accent: def.accent, n: Date.now() })
        setUpgradeSaid({ title: def.name, sub: `Bunk ${def.bunks} is open`, accent: def.accent })
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
  /** Every living crew whose level has outrun what the ledger last saw. */
  const levelledUp = state.roster.filter(c => {
    const seen = seenLevels[c.id]
    return seen !== undefined && seen < crewLevelFromXP(c.xp)
  })

  /** Clear the lot in one go.
   *
   *  markCrewSeen only fires when a crew's detail modal is opened, so the only
   *  way to put the dots down was to open every card one at a time. After a
   *  raid that levels eight hands, that is eight modals to dismiss a
   *  decoration. The dot is a courtesy, and a courtesy you cannot decline is
   *  just a chore. */
  function markAllCrewSeen() {
    setSeenLevels(prev => {
      const next = { ...prev }
      for (const c of state.roster) next[c.id] = crewLevelFromXP(c.xp)
      try { localStorage.setItem('crewSeenLevels', JSON.stringify(next)) } catch {}
      return next
    })
  }

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
    return t === 'assign' || t === 'recruits' || t === 'graveyard' || t === 'roster' || t === 'wardrobe' || t === 'hall' ? t : 'roster'
  })() as 'assign' | 'roster' | 'recruits' | 'graveyard' | 'wardrobe' | 'hall'
  const [activeTab, setActiveTab] = useState<'assign' | 'roster' | 'recruits' | 'graveyard' | 'wardrobe' | 'hall'>(initialTab)

  /**
   * VIEWING THE ROSTER IS THE ACKNOWLEDGEMENT.
   *
   * A level-up has nothing for the player to DO, so a notice that has to be
   * dismissed by hand is asking for work in exchange for information. Crew
   * level often enough that "Mark all seen" became a recurring errand, which is
   * a bad trade for a courtesy.
   *
   * So the ledger catches up when you LEAVE the roster, not when you arrive:
   * during the visit the hands stay flagged and sorted to the top, which is what
   * makes the notice worth showing at all, and by the next visit it is spent.
   * The button stays for anyone who wants to clear it without scrolling.
   */
  const sawRosterRef = useRef(false)
  useEffect(() => {
    if (activeTab === 'roster') { sawRosterRef.current = true; return }
    if (!sawRosterRef.current) return
    sawRosterRef.current = false
    markAllCrewSeen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])
  useEffect(() => () => { if (sawRosterRef.current) markAllCrewSeen() },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [])


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
  const [capacityOpen, setCapacityOpen] = useState(false)
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

  // Sorted roster for the Roster tab. Stats sort on EFFECTIVE values, the same
  // applyCrewEffects the cards print, so the order always matches the numbers
  // on screen. Name breaks every tie so equal-ranked crew hold a stable order
  // instead of shuffling between renders.
  const sortedRoster = useMemo(() => {
    const byName = (a: CrewMember, b: CrewMember) => a.name.localeCompare(b.name)
    const eff = (c: CrewMember) => applyCrewEffects({ power: c.power, dodge: c.dodge, fortune: c.fortune }, c.effects, c.xp)
    /** What this hand would be at the level ceiling: the same resolver, with the
     *  XP dialled to Lv 100 so every crew is measured at the same point. */
    const pot = (c: CrewMember) =>
      applyCrewEffects({ power: c.power, dodge: c.dodge, fortune: c.fortune }, c.effects, MAX_LEVEL_XP)
    const total = (e: { power: number; dodge: number; fortune: number }) => e.power + e.dodge + e.fortune

    /** ONE key, compared. The roster sorts on a PRIMARY and then a SECONDARY the
     *  player picks, so every ordering has to be expressible on its own rather
     *  than as a hard-coded cascade. Name settles whatever is left, so the order
     *  never shuffles between renders. */
    const cmpBy = (k: RosterSort, a: CrewMember, b: CrewMember): number => {
      switch (k) {
        case 'name':      return byName(a, b)
        case 'level':     return crewLevelFromXP(b.xp) - crewLevelFromXP(a.xp)
        case 'rarity':    return b.rarity - a.rarity
        case 'overall':   return total(eff(b)) - total(eff(a))
        case 'potential': return total(pot(b)) - total(pot(a))
        default:          return eff(b)[k] - eff(a)[k]
      }
    }

    // LEVELLED-UP HANDS FIRST, whatever the sort. The dot told you somebody had
    // gained a level and then left you to find them by scrolling a roster of
    // thirty, which is the part that made an FYI feel like a chore. Grouping
    // them answers the notice on the same screen it appears on.
    //
    // It only regroups while they are still unseen, and unseen clears when you
    // leave the tab, so the order settles back on the next visit rather than
    // permanently fighting whichever sort was chosen.
    const isNew = (c: CrewMember) => {
      const seen = seenLevels[c.id]
      return seen !== undefined && seen < crewLevelFromXP(c.xp)
    }
    return [...state.roster].sort((a, b) =>
      (Number(isNew(b)) - Number(isNew(a)))
      || cmpBy(rosterSort, a, b)
      || cmpBy(rosterSort2, a, b)
      || byName(a, b))
  }, [state.roster, rosterSort, rosterSort2, seenLevels])
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

  // Empty a whole party. Not routed through run() because that keys its busy
  // flag by crew id, and this touches up to six seats at once.
  function handleClearParty(track: 'raid' | 'voyage') {
    setErr(null)
    setClearingTrack(track)
    startTransition(async () => {
      const res = await clearParty(track)
      if ('error' in res) setErr(res.error)
      else setState(res.state)
      setClearingTrack(null)
      // Closed HERE, not on the tap, so the sheet holds its busy state until
      // the seats are actually empty and a refusal lands on a screen the
      // captain is still looking at.
      setClearAsk(null)
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
              // Tappable, because "26 / 40" raises the question of where 40 came
              // from and the answer is two ladders deep. The chevron is there to
              // say so: a pill that reads like a label gets read like a label.
              <button
                type="button"
                onClick={() => setCapacityOpen(true)}
                aria-label={`${filled} of ${cap} crew. See how the limit is worked out and how to raise it.`}
                className="font-karla font-700 tap active:scale-95"
                style={{
                  fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: isFull ? '#f4c4c4' : '#e0cfa4',
                  // A CONTROL, NOT A CAPTION. It was a faint tinted wash with a
                  // hairline, which is how every read-only stat chip on this page
                  // is drawn, so nobody had a reason to press it. Solid ground,
                  // a full-strength border and a ringed glyph instead: the same
                  // vocabulary the page uses for things that do something.
                  background: isFull
                    ? 'linear-gradient(rgba(220,90,90,0.22), rgba(220,90,90,0.22)), rgba(14,19,28,0.97)'
                    : 'linear-gradient(rgba(200,170,100,0.18), rgba(200,170,100,0.18)), rgba(14,19,28,0.97)',
                  border: `1px solid ${isFull ? 'rgba(240,150,150,0.72)' : 'rgba(210,182,116,0.6)'}`,
                  boxShadow: `0 1px 6px rgba(0,0,0,0.45)${isFull ? ', 0 0 12px rgba(220,90,90,0.28)' : ''}`,
                  padding: '0.22rem 0.4rem 0.22rem 0.55rem', borderRadius: 7, lineHeight: 1.2,
                  whiteSpace: 'nowrap', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}>
                {filled} / {cap} Crew
                <span aria-hidden style={{
                  display: 'grid', placeItems: 'center', flexShrink: 0,
                  width: 13, height: 13, borderRadius: '50%',
                  border: '1px solid currentColor', opacity: 0.85,
                  fontSize: '0.5rem', fontStyle: 'italic', lineHeight: 1,
                }}>i</span>
              </button>
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
          // Finished stints waiting to be collected. Derived from bunkTerms
          // rather than stored, so it stays right as stints tick over.
          const readyBunks = Object.values(state.bunkTerms ?? {})
            .filter(t => stintDone(t.since, Date.now(), t.cap)).length
          // AN EMPTY BUNK IS ALSO SOMETHING TO DO, and it is the one that
          // actually costs you: a finished stint is XP already banked and
          // waiting, while an empty bunk is XP not being earned at all. The tab
          // only ever counted the finished ones, so the hall went quiet in
          // exactly the state a player most wants pointing out. Trawls have
          // always nudged on an idle zone; this is the same courtesy.
          const openBunks = Math.max(0, bunkCount(state.hallTier) - (state.bunkedCrewIds?.length ?? 0))
          const hallWaiting = readyBunks + openBunks
          const iconProps = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
          // Uniform icon + label tabs so every destination is self-explanatory
          // (the old icon-only Blood/Wardrobe/Graveyard tabs weren't obvious).
          const tabs: { id: typeof activeTab; label: string; accent: string; count?: number; pulse?: boolean; pulseLabel?: string; icon: ReactNode }[] = [
            { id: 'assign',   label: 'Assign',  accent: ASSIGN_RAID, count: assignedCount || undefined,
              icon: <svg {...iconProps}><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></svg> },
            { id: 'roster',   label: 'Roster',  accent: SECTION_ROSTER, count: state.roster.length || undefined,
              icon: <svg {...iconProps}><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="3.2" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
            { id: 'recruits', label: 'Recruit', accent: '#f0d696', count: boardCount || undefined,
              icon: <svg {...iconProps}><path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="3.2" /><path d="M19 8v6M22 11h-6" /></svg> },
            { id: 'hall',     label: 'Hall',    accent: '#f0c040', count: hallWaiting || undefined, pulse: hallWaiting > 0,
              pulseLabel: [readyBunks ? `${readyBunks} trained and waiting` : '', openBunks ? `${openBunks} bunk${openBunks === 1 ? '' : 's'} empty` : ''].filter(Boolean).join(', '),
              icon: <svg {...iconProps}><path d="M3 21h18" /><path d="M5 21V10l7-5 7 5v11" /><path d="M10 21v-5h4v5" /></svg> },
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
                      <span className={`font-karla font-800${t.pulse ? ' crew-levelup-dot' : ''}`}
                        aria-label={t.pulse ? t.pulseLabel ?? `${t.count} ready to collect` : undefined}
                        style={{ position: 'absolute', top: 2, right: 3, minWidth: 13, textAlign: 'center', fontSize: '0.5rem', color: '#0b0b0d', background: t.pulse ? '#ffd96a' : active ? t.accent : 'rgba(255,255,255,0.7)', borderRadius: 999, padding: '0 3px', lineHeight: 1.35 }}>{t.count}</span>
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
            bunkedCrewIds={state.bunkedCrewIds}
            artSrc={artSrc}
            onPickSeat={(track, slot) => setAssignSeat({ track, slot })}
            onTapCrew={m => setDetail({ kind: 'roster', item: m })}
            onClearParty={track => setClearAsk(track)}
            clearing={clearingTrack}
            raidAccent={ASSIGN_RAID}
            voyageAccent={ASSIGN_VOYAGE}
          />
        )}

        {/* THE HALL. Its own tab as of this change: the building and the
            bunks inside it are a place you invest in over months, while
            Recruit is a daily board you clear in ten seconds. Sharing a tab
            meant the thing you visit most pushed the thing you spend most on
            off the screen. */}
        {activeTab === 'hall' && (() => {
          const hall = hallTierDef(state.hallTier)
          const nextTier = nextHallTier(state.hallTier)
          // One source of truth for why the next tier is out of reach, shared
          // with the confirm sheet and the server action.
          const blocked = hallUpgradeBlocker(state.hallTier, state.navLevel, state.doubloons)
          const navShort = blocked === 'nav'
          return (
        <>
        {/* EXACTLY the roster card's background, not a tinted one of its own.
            The accent gradient over hall.base was gold on gold, which read as a
            translucent wash rather than a solid card. The tier still shows in
            the art, the name, the pips and the border. */}
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, border: `1px solid ${hall.accent}66`, background: ROSTER_PANEL_BG, boxShadow: hall.glow ? `0 0 26px ${hall.glow}` : undefined, padding: '0.8rem', marginBottom: '0.9rem' }}>
          {/* STACKED again. It was side by side to keep the block short while
              the hall shared the Recruit tab; the hall has its own tab now, so
              the building gets to be the building. The name also stops being
              truncated - it had `nowrap + ellipsis` because it was sharing a
              row with the pips and the button, and "Brassbound Hall" does not
              fit next to both. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {/* ART PENDING for tier 6 (Leviathan Hall) — hall_1..5 exist, hall_6
                does not yet. Fall back to the tier below rather than hiding,
                which left an empty hole. Self-healing: drop hall_6.png in and
                this stops firing. */}
            <motion.img src={`/crew/hall_${hall.tier}.png`} alt="" aria-hidden decoding="async"
              // Keyed on the tier so a purchase REMOUNTS it: the old building
              // leaves and the new one lands, in the same spot, with no layer
              // over the top. `pop` gates the overshoot so opening the tab is
              // a plain fade rather than a bounce.
              key={hall.tier}
              initial={pop?.what === 'hall' ? { scale: 0.62, opacity: 0, rotate: -6 } : { opacity: 0 }}
              animate={pop?.what === 'hall' ? { scale: [0.62, 1.14, 1], opacity: 1, rotate: 0 } : { opacity: 1 }}
              transition={pop?.what === 'hall'
                ? { duration: 0.66, times: [0, 0.66, 1], ease: 'easeOut' }
                : { duration: 0.25 }}
              style={{ width: 176, height: 176, objectFit: 'contain', filter: `drop-shadow(0 6px 18px ${hall.accent}66)` }}
              onError={e => {
                const img = e.target as HTMLImageElement
                if (img.dataset.fellBack) { img.style.visibility = 'hidden'; return }
                img.dataset.fellBack = '1'
                img.src = `/crew/hall_${Math.max(1, hall.tier - 1)}.png`
              }} />

            <AnimatePresence>
              {pop?.what === 'hall' && (
                <motion.span key={pop.n} aria-hidden
                  initial={{ scale: 0.3, opacity: 0.85 }}
                  animate={{ scale: 2.2, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                  style={{
                    position: 'absolute', top: 88, width: 150, height: 150, borderRadius: '50%',
                    border: `2px solid ${hall.accent}`, pointerEvents: 'none',
                  }} />
              )}
            </AnimatePresence>

            {/* Its own row, full width, no truncation. */}
            <motion.p key={`name-${hall.tier}`} className="font-cinzel font-700"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: pop?.what === 'hall' ? 0.3 : 0 }}
              style={{ fontSize: '1.35rem', color: hall.accent, lineHeight: 1.2, marginTop: 2 }}>
              {hall.name}
            </motion.p>

            <div style={{ display: 'flex', gap: 4, marginTop: 7 }} aria-label={`Crew Hall tier ${state.hallTier} of ${CREW_HALL_MAX_TIER}`}>
              {Array.from({ length: CREW_HALL_MAX_TIER }, (_, i) => (
                <span key={i} aria-hidden style={{
                  width: 7, height: 7, borderRadius: 7,
                  background: i < state.hallTier ? hall.accent : 'rgba(255,255,255,0.14)',
                  boxShadow: i < state.hallTier ? `0 0 6px ${hall.accent}88` : undefined,
                }} />
              ))}
            </div>
            <div style={{ width: '100%' }}>
            <p className="font-karla font-600" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.78)', marginTop: 5, lineHeight: 1.45 }}>
              <span style={{ color: hall.accent }}>{hall.bunks} bunks</span> for training idle crew
              {hallRosterBonus(state.hallTier) > 0 && (
                <>, and <span style={{ color: hall.accent }}>+{hallRosterBonus(state.hallTier)} roster</span></>
              )}
            </p>
            {navShort && nextTier && (
              <p className="font-karla font-600" style={{ fontSize: '0.76rem', color: '#9fc4e8', marginTop: 4, lineHeight: 1.45 }}>
                {nextTier.name} opens at Navigation {nextTier.minNav}
              </p>
            )}
            <p className="font-karla" style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.55)', fontStyle: 'italic', marginTop: 4, lineHeight: 1.45, marginBottom: '0.85rem' }}>
              {hall.flavor}
            </p>

            {/* Its own full-width row. It was a small pill squeezed onto the
                name's line, which is both the least satisfying shape for the
                one big purchase on the page and what forced the name to
                truncate. It states what it buys and what it costs, so the
                confirm sheet is a confirmation rather than the first time you
                see the price. */}
            {nextTier && navShort ? (
              <div className="font-karla font-700 uppercase" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '0.7rem', borderRadius: 11,
                fontSize: '0.78rem', letterSpacing: '0.06em',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.16)',
                color: 'rgba(255,255,255,0.55)',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <rect x="4.5" y="11" width="15" height="9.5" rx="1.5" /><path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11" />
                </svg>
                Bunk {nextTier.bunks} at Navigation {nextTier.minNav}
              </div>
            ) : nextTier ? (
              <button
                onClick={() => setHallUpgradeOpen(true)}
                className="active:scale-95"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  width: '100%', padding: '0.75rem 0.9rem', borderRadius: 11,
                  cursor: 'pointer', font: 'inherit',
                  // Tinted gradient with a lit top edge, never a solid fill.
                  background: `linear-gradient(180deg, ${nextTier.accent}2e 0%, ${nextTier.accent}12 100%)`,
                  border: `1px solid ${nextTier.accent}77`,
                  boxShadow: `inset 0 1px 0 ${nextTier.accent}44, 0 3px 12px rgba(0,0,0,0.35)`,
                  transition: 'transform 0.08s, box-shadow 0.15s',
                }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                  <span className="font-cinzel font-700 uppercase" style={{ fontSize: '0.86rem', letterSpacing: '0.08em', color: '#f4ecd8' }}>
                    Build the {nextTier.name}
                  </span>
                  {/* The reason to buy it, said plainly. "Build the Gilded Hall"
                      is a name; "opens a 4th bunk" is what you get. The last
                      one opens a bunk that is not like the others, so it says
                      so here rather than letting the surprise sit behind a
                      1,000,000 price tag. */}
                  <span className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', letterSpacing: '0.08em', color: nextTier.accent }}>
                    + Opens bunk {nextTier.bunks}
                  </span>
                  {/* The roster slots the tier also carries. Its own line, not
                      folded into the bunk one: they answer different problems,
                      and a captain sitting at a full roster is here FOR this. */}
                  <span className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', letterSpacing: '0.08em', color: nextTier.accent }}>
                    + {hallRosterBonus(nextTier.tier) - hallRosterBonus(state.hallTier)} crew you can keep
                  </span>
                  {isLeviathanSlot(nextTier.bunks - 1) && (
                    <span className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', letterSpacing: '0.08em', color: LEVIATHAN_COLOR }}>
                      + The Leviathan bunk rerolls traits
                    </span>
                  )}
                </span>
                <span className="font-cinzel font-700" style={{
                  fontSize: '0.82rem', color: nextTier.accent, fontVariantNumeric: 'tabular-nums',
                  paddingLeft: 10, borderLeft: `1px solid ${nextTier.accent}44`, marginLeft: 'auto',
                }}>
                  {nextTier.cost.toLocaleString()} ⟡
                </span>
              </button>
            ) : (
              <div className="font-cinzel font-700 uppercase" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '0.7rem', borderRadius: 11,
                fontSize: '0.82rem', letterSpacing: '0.14em',
                background: `${hall.accent}12`, border: `1px solid ${hall.accent}55`,
                color: hall.accent,
              }}>
                Hall complete
              </div>
            )}
            </div>
          </div>
          {/* Upgrade celebration — fires once after a confirmed purchase.
              Lives INSIDE the hall panel (position:relative + overflow:
              hidden above) so the effect stays localized to the room that
              changed, per juice-subtlety: an expanding accent ring + the
              new hall's name over a brief dark veil. Tap or 3s timeout
              dismisses (auto-dismiss effect lives next to the state). */}
          <AnimatePresence>
          </AnimatePresence>

          {/* The bunks live INSIDE the hero. The hall IS the building that
              houses them, so a bordered panel under a bordered panel was two
              boxes describing one place. */}
          {state.hallBunksOpen && (
            <HallBunks
              state={state}
              artSrc={artSrc}
              accent={hall.accent}
              pending={pending}
              pop={pop?.what === 'drill' || pop?.what === 'stores' ? pop.what : null}
              onBunk={(id, slot) => run(() => bunkCrew(id, slot), id)}
              onCollectOne={id => runBunkClaim(() => collectBunk(id))}
              onBuyDrill={() => setLadderConfirm('drill')}
              onBuyStores={() => setLadderConfirm('stores')}
            />
          )}
        </div>
        </>
          )
        })()}

        {/* RECRUIT. Just the board and the ways to reroll it. The hall used to
            sit on top of this; it is its own tab now. */}
        {activeTab === 'recruits' && (() => {
          return (
        <>
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
              const party = track === 'raid' ? 'Campaign Party' : 'Voyage Party'
              const holder = state.roster.find(c => (track === 'raid' ? c.raidSlot : c.voyageSlot) === assignSeat.slot)
              return holder ? `Replace ${holder.name}` : party
            })()}
            roster={state.roster}
            lockedCrewIds={state.lockedCrewIds}
            trawlingCrewIds={state.trawlingCrewIds}
            bunkedCrewIds={state.bunkLockedCrewIds}
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
        {/* THE DIVINE MOMENT. Its own layer ABOVE the claim reveal, because it
            fires as that card closes and the two must not cross-fade into each
            other. Dismissed only by the button: this is the rarest thing in
            the game and a stray tap on the backdrop should not skip it. */}
        <AnimatePresence>
          {divineMoment && (
            <motion.div key="divine-moment"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, zIndex: 9600, background: 'radial-gradient(ellipse 70% 50% at 50% 42%, rgba(24,72,68,0.65) 0%, rgba(3,7,11,0.94) 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
              <motion.div
                initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>

                {/* Three rings, staggered, so the burst reads as something
                    rising out of deep water rather than one flat pop. */}
                <div style={{ position: 'relative', width: 132, height: 132, margin: '0 auto' }}>
                  {[0, 0.22, 0.44].map((d, i) => (
                    <motion.span key={i} aria-hidden
                      initial={{ scale: 0.35, opacity: 0.85 }} animate={{ scale: 2.6, opacity: 0 }}
                      transition={{ duration: 1.6, ease: 'easeOut', delay: 0.15 + d, repeat: Infinity, repeatDelay: 0.9 }}
                      style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${LEVIATHAN_COLOR}`, pointerEvents: 'none' }} />
                  ))}
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 16, delay: 0.1 }}
                    style={{
                      position: 'relative', width: 132, height: 132, borderRadius: '50%',
                      display: 'grid', placeItems: 'center', overflow: 'hidden',
                      background: `radial-gradient(circle at 50% 30%, ${LEVIATHAN_COLOR}55, rgba(0,0,0,0.5))`,
                      border: `2px solid ${LEVIATHAN_COLOR}`,
                      boxShadow: `0 0 46px ${LEVIATHAN_COLOR}66, inset 0 0 22px rgba(0,0,0,0.45)`,
                    }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={artSrc(divineMoment.filename)} alt="" aria-hidden decoding="async"
                      style={{ width: 120, height: 120, objectFit: 'contain' }} />
                  </motion.div>
                </div>

                <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.4 }}
                  className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.28em', color: 'rgba(255,255,255,0.5)', marginTop: 20 }}>
                  The deep gives up its best
                </motion.p>
                <motion.p initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.38, type: 'spring', stiffness: 260, damping: 18 }}
                  className="trait-divine font-cinzel font-800" style={{ fontSize: '2.6rem', lineHeight: 1.1, letterSpacing: '0.06em', marginTop: 4 }}>
                  DIVINE
                </motion.p>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.4 }}
                  className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#eafaf7', marginTop: 6 }}>
                  {divineMoment.name}
                </motion.p>

                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.58, duration: 0.4 }}
                  style={{ display: 'flex', justifyContent: 'center', gap: 7, marginTop: 14 }}>
                  {['+4 PWR', '+4 DGE', '+4 FTN'].map(t => (
                    <span key={t} className="font-karla font-700" style={{
                      fontSize: '0.7rem', padding: '0.3rem 0.6rem', borderRadius: 8,
                      background: `${LEVIATHAN_COLOR}1c`, border: `1px solid ${LEVIATHAN_COLOR}77`,
                      color: '#c6e8e2', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                    }}>{t}</span>
                  ))}
                </motion.div>

                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.68, duration: 0.4 }}
                  className="font-karla" style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, marginTop: 12 }}>
                  Every stat at the ceiling. There is nothing left to roll for on this hand.
                </motion.p>

                <motion.button onClick={() => setDivineMoment(null)} whileTap={{ scale: 0.94 }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 0.3 }}
                  className="font-cinzel font-700 uppercase"
                  style={{ marginTop: 20, padding: '0.75rem 2.2rem', borderRadius: 12, letterSpacing: '0.12em', fontSize: '0.82rem', background: `${LEVIATHAN_COLOR}26`, border: `1px solid ${LEVIATHAN_COLOR}9a`, color: '#eafaf7', boxShadow: `0 0 20px ${LEVIATHAN_COLOR}33`, cursor: 'pointer' }}>
                  Magnificent
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* THE CLAIM REVEAL. The payoff of the whole feature, so it is a card
            with the hand's face on it: their XP counting up, their level bar
            filling from where it was, and a burst if it tipped a level.
            Fixed to the viewport at its own z-layer, so nothing can clip it. */}
        <AnimatePresence>
          {bunkReveal && (() => {
            const r = bunkReveal
            const levelled = r.to > r.from
            // An offer outranks a level-up for the card's identity: it is a
            // decision rather than a notification, it only happens in one bunk,
            // and the teal is the same teal that bunk wears, so the moment is
            // visibly tied to the choice that earned it.
            const up = r.upgrade
            // `up` now arrives even when the Leviathan roll lost, so every
            // downstream test has to ask whether anything MOVED, not merely
            // whether a re-cut happened.
            const upMoved = !!up && (up.gained.power || up.gained.dodge || up.gained.fortune)
            const accent = up ? LEVIATHAN_COLOR : levelled ? '#7fdfa3' : '#f0c040'
            const burst = levelled || !!up
            const prog = crewXPProgress(r.newXP)
            const atMax = r.to >= CREW_MAX_LEVEL
            // Where the bar STARTS. On a level-up it starts empty, because you
            // genuinely entered a fresh level; otherwise from where they were,
            // so the gain visibly pushes it along instead of animating from 0
            // and reading as if the collect reset their progress.
            const fromPct = levelled ? 0 : crewXPProgress(r.oldXP).progress
            return (
              <motion.div key="bunk-reveal"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setBunkReveal(null)}
                style={{ position: 'fixed', inset: 0, zIndex: 9400, background: 'rgba(4,8,14,0.86)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}>
                <motion.div
                  initial={{ scale: 0.85, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 24 }}
                  onClick={e => e.stopPropagation()}
                  style={{
                    maxWidth: 350, width: '100%', textAlign: 'center', padding: '1.7rem 1.5rem', borderRadius: 18,
                    background: [`radial-gradient(ellipse 85% 62% at 50% 18%, ${accent}26 0%, transparent 70%)`, 'linear-gradient(180deg, rgba(40,32,16,0.97) 0%, rgba(20,14,7,0.98) 100%)'].join(', '),
                    border: `1px solid ${accent}${burst ? '9a' : '5e'}`,
                    boxShadow: burst ? `0 0 40px ${accent}33, inset 0 0 28px rgba(0,0,0,0.5)` : 'inset 0 0 28px rgba(0,0,0,0.5)',
                  }}>
                  {/* The hand who did the work. A ring bursts behind them on a
                      level-up, so the big moment is felt before it is read. */}
                  <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto' }}>
                    {burst && (
                      <motion.span aria-hidden
                        initial={{ scale: 0.4, opacity: 0.9 }} animate={{ scale: 2.4, opacity: 0 }}
                        transition={{ duration: 1, ease: 'easeOut', delay: 0.25 }}
                        style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${accent}`, pointerEvents: 'none' }} />
                    )}
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 17 }}
                      style={{
                        width: 96, height: 96, borderRadius: '50%', display: 'grid', placeItems: 'center', overflow: 'hidden',
                        background: `radial-gradient(circle at 50% 32%, ${accent}3a, rgba(0,0,0,0.45))`,
                        border: `2px solid ${accent}${burst ? 'cc' : '88'}`,
                        boxShadow: burst ? `0 0 26px ${accent}66, inset 0 0 14px rgba(0,0,0,0.4)` : `0 0 12px ${accent}33, inset 0 0 14px rgba(0,0,0,0.4)`,
                      }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={artSrc(r.filename)} alt="" aria-hidden decoding="async"
                        style={{ width: 88, height: 88, objectFit: 'contain' }} />
                    </motion.div>
                  </div>

                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.35 }}
                    className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: accent, marginTop: 12, textShadow: burst ? `0 0 12px ${accent}44` : 'none' }}>
                    {/* A Leviathan stint that rolled under your current trait
                        still reports. `up` present with nothing gained means the
                        re-cut happened and lost, which is a different thing from
                        an ordinary bunk and has to read as one. */}
                    {upMoved ? `The deep sharpened ${r.name}`
                      : up ? `The deep took its measure of ${r.name}`
                      : levelled ? `${r.name} levelled up!`
                      : `${r.name} is back`}
                  </motion.p>
                  <p className="font-karla" style={{ fontSize: '0.78rem', color: '#9c917a', marginTop: 6 }}>
                    {upMoved ? 'Their trait came back better than it went in'
                      : up ? 'Nothing it rolled beat what they already had'
                      : 'Off the bunk, drilled and rested'}
                  </p>

                  {/* WHAT MOVED. This was a set of tick boxes, which implied a
                      decision that did not exist: the result is max(current,
                      rolled) per stat, so everything worth taking was always
                      pre-ticked and taking less was never right for any crew.
                      It reports now instead of asking. */}
                  {up && (
                    <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.28, type: 'spring', stiffness: 300, damping: 20 }}
                      style={{ marginTop: 14 }}>
                      <div style={{ borderRadius: 12, background: 'rgba(0,0,0,0.3)', border: `1px solid ${LEVIATHAN_COLOR}44`, padding: '0.7rem 0.75rem' }}>
                        {(['power', 'dodge', 'fortune'] as const).map(k => {
                          const lbl = k === 'power' ? 'PWR' : k === 'dodge' ? 'DGE' : 'FTN'
                          const moved = up.gained[k]
                          const fmt = (v: number) => (v > 0 ? `+${v}` : `${v}`)
                          return (
                            <div key={k} style={{ display: 'grid', gridTemplateColumns: '2.4rem 1fr 1.2rem 1fr', gap: 6, alignItems: 'center', padding: '0.22rem 0' }}>
                              <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)' }}>{lbl}</span>
                              <span className="font-karla font-700" style={{ fontSize: '0.8rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: moved ? 'rgba(255,255,255,0.3)' : '#e6dcc2' }}>
                                {fmt(up.before[k])}
                              </span>
                              <span aria-hidden style={{ textAlign: 'center', fontSize: '0.7rem', color: moved ? LEVIATHAN_COLOR : 'transparent' }}>&rarr;</span>
                              <span className="font-karla font-800" style={{ fontSize: '0.85rem', fontVariantNumeric: 'tabular-nums', color: moved ? '#7fdfa3' : 'rgba(255,255,255,0.25)' }}>
                                {moved ? fmt(up.after[k]) : 'held'}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ marginTop: 8, padding: '0.55rem 0.7rem', borderRadius: 11, background: `${LEVIATHAN_COLOR}12`, border: `1px solid ${LEVIATHAN_COLOR}4d`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                        <span className="font-karla font-700 uppercase" style={{ fontSize: '0.55rem', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.45)' }}>Now</span>
                        <span className={`font-cinzel font-700${isDivineTrait(up.after) ? ' trait-divine' : ''}`}
                          style={{ fontSize: isDivineTrait(up.after) ? '1.02rem' : '0.92rem', ...(isDivineTrait(up.after) ? {} : { color: LEVIATHAN_COLOR }) }}>
                          {up.afterLabel}
                        </span>
                        <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#c6e8e2', fontVariantNumeric: 'tabular-nums' }}>
                          {statLine(up.after)}
                        </span>
                      </div>
                    </motion.div>
                  )}

                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16, duration: 0.4 }}
                    style={{ marginTop: 16, borderRadius: 14, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(196,169,106,0.2)', padding: '0.9rem 1rem', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <span className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.16em', color: '#7fae8f' }}>Crew XP</span>
                      {r.xp > 0
                        ? <CountUp to={r.xp} prefix="+" className="font-cinzel font-800" style={{ fontSize: '1.55rem', color: '#7fdfa3', lineHeight: 1 }} />
                        : <span className="font-karla font-600" style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)' }}>Nothing left to learn</span>}
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#e6dcc2' }}>
                          Lv {r.to}
                          {levelled && <span style={{ color: accent, marginLeft: 6, fontSize: '0.68rem' }}>up from {r.from}</span>}
                        </span>
                        <span className="font-karla" style={{ fontSize: '0.62rem', color: '#8a8068' }}>
                          {atMax ? 'Max level' : `${Math.round(prog.progress * 100)}% to ${r.to + 1}`}
                        </span>
                      </div>
                      <div style={{ height: 7, borderRadius: 4, background: 'rgba(0,0,0,0.45)', overflow: 'hidden' }}>
                        <motion.div
                          initial={{ width: `${Math.round(fromPct * 100)}%` }}
                          animate={{ width: `${Math.round((atMax ? 1 : prog.progress) * 100)}%` }}
                          transition={{ delay: 0.35, duration: 0.7 }}
                          style={{ height: '100%', background: 'linear-gradient(90deg, #3fae78, #7fdfa3)' }} />
                      </div>
                    </div>
                  </motion.div>

                  <motion.button onClick={() => setBunkReveal(null)} whileTap={{ scale: 0.92 }}
                    className="font-cinzel font-700 uppercase"
                    style={{ marginTop: 18, padding: '0.7rem 2rem', borderRadius: 12, letterSpacing: '0.1em', fontSize: '0.8rem', background: '#f0c04022', border: '1px solid #f0c0407a', color: '#f4ecd8', boxShadow: '0 0 14px #f0c04022', cursor: 'pointer' }}>
                    Back to work
                  </motion.button>
                </motion.div>
              </motion.div>
            )
          })()}
        </AnimatePresence>

        <AnimatePresence>
          {upgradeSaid && (
            <motion.div key="upgrade-said"
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{ position: 'fixed', left: 0, right: 0, bottom: 92, zIndex: 300, display: 'flex', justifyContent: 'center', pointerEvents: 'none', padding: '0 1rem' }}>
              <div style={{
                maxWidth: 360, padding: '0.6rem 0.9rem', borderRadius: 11, textAlign: 'center',
                background: 'rgba(16,12,7,0.97)', border: `1px solid ${upgradeSaid.accent}88`,
                boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
              }}>
                <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: upgradeSaid.accent }}>
                  {upgradeSaid.title}
                </p>
                <p className="font-karla" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.68)', marginTop: 2 }}>
                  {upgradeSaid.sub}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Drills / Stores confirm. Same shape as the hall's sheet below, and
            like it, re-derives everything from LIVE state so it can never
            confirm a purchase the server would then refuse. */}
        {ladderConfirm && (() => {
          const isDrill = ladderConfirm === 'drill'
          const level = isDrill ? state.drillLevel : state.storesLevel
          const cost = isDrill ? nextDrillCost(level) : nextStoresCost(level)
          // Belt and braces: the button is a LockedCard when the hall is short,
          // so this should be unreachable — but the sheet re-derives from live
          // state and must never offer a buy the server would refuse.
          if (cost <= 0 || ladderHallLocked(level, state.hallTier)) return null
          const accent = isDrill ? '#f0c040' : '#7fc4a8'
          const art = isDrill
            ? `/crew/drill_${Math.min(level + 1, DRILL_MAX_LEVEL)}.png`
            : `/crew/stores_${level + 1}.png`
          const title = `${isDrill ? 'Drills' : 'Stores'} ${tierNumeral(level + 1)}`
          const now = isDrill
            ? `${bunkRatePerHour(level).toLocaleString()} XP an hour`
            : `${storesCapHours(level)}h stints`
          const next = isDrill
            ? `${bunkRatePerHour(level + 1).toLocaleString()} XP an hour`
            : `${storesCapHours(level + 1)}h stints`
          const blurb = isDrill
            ? 'Every bunk trains faster, on every stint, for good.'
            : 'Longer stints, so a hand earns more before you have to come back for them.'
          const canAfford = state.doubloons >= cost
          return (
            <div
              onClick={() => { if (!pending) setLadderConfirm(null) }}
              style={{
                position: 'fixed', inset: 0, zIndex: 80,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.62)', padding: '1.2rem',
              }}
            >
              <div onClick={e => e.stopPropagation()} style={{
                width: '100%', maxWidth: 380,
                background: 'linear-gradient(180deg, #1c1610 0%, #120d08 100%)',
                border: `1px solid ${accent}55`, borderRadius: 14,
                padding: '1.2rem 1.1rem 1.05rem',
                boxShadow: `0 10px 40px rgba(0,0,0,0.6), 0 0 30px ${accent}22`,
                textAlign: 'center',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={art} alt="" aria-hidden decoding="async"
                  style={{ display: 'block', width: 118, height: 118, margin: '0 auto 0.35rem', objectFit: 'contain', filter: `drop-shadow(0 4px 16px ${accent}66)` }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                <p className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                  Crew Hall
                </p>
                <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: accent, marginBottom: 6 }}>
                  {title}
                </p>
                <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.62)', fontStyle: 'italic', marginBottom: 14, lineHeight: 1.5 }}>
                  {blurb}
                </p>
                <div className="flex items-center justify-center" style={{
                  gap: 10, padding: '0.55rem 0.75rem', borderRadius: 9,
                  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 12,
                }}>
                  <span className="font-karla font-600" style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.6)' }}>{now}</span>
                  <span style={{ color: accent }}>&rarr;</span>
                  <span className="font-karla font-700" style={{ fontSize: '0.92rem', color: accent }}>{next}</span>
                </div>
                <div className="flex items-center justify-between" style={{
                  padding: '0.55rem 0.75rem', borderRadius: 9,
                  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 12,
                }}>
                  <span className="font-karla font-600" style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Cost</span>
                  <span className="font-karla font-700" style={{ fontSize: '0.95rem', color: canAfford ? '#e8c87a' : '#f2b0b0' }}>
                    {cost.toLocaleString()} <span style={{ color: '#e8c87a' }}>⟡</span>
                  </span>
                </div>
                <p className="font-karla" style={{ fontSize: '0.74rem', color: canAfford ? 'rgba(255,255,255,0.45)' : '#f2b0b0', marginBottom: 12 }}>
                  Your doubloons: {state.doubloons.toLocaleString()} ⟡
                </p>
                <div className="flex" style={{ gap: 8 }}>
                  <button onClick={() => setLadderConfirm(null)} disabled={pending}
                    className="font-karla font-700"
                    style={{
                      flex: 1, padding: '0.7rem', borderRadius: 9, fontSize: '0.88rem',
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                      color: 'rgba(255,255,255,0.7)', cursor: pending ? 'not-allowed' : 'pointer',
                    }}>
                    Cancel
                  </button>
                  <button onClick={() => runLadderUpgrade(ladderConfirm)} disabled={!canAfford || pending}
                    className="font-karla font-700 active:scale-95"
                    style={{
                      flex: 1.4, padding: '0.7rem', borderRadius: 9, fontSize: '0.88rem',
                      background: `linear-gradient(180deg, ${accent}2e 0%, ${accent}12 100%)`,
                      border: `1px solid ${accent}77`,
                      boxShadow: `inset 0 1px 0 ${accent}44`,
                      color: '#f4ecd8',
                      opacity: (!canAfford || pending) ? 0.45 : 1,
                      cursor: (!canAfford || pending) ? 'not-allowed' : 'pointer',
                      transition: 'transform 0.08s',
                    }}>
                    {pending ? 'Buying…' : canAfford ? 'Upgrade' : 'Not enough'}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

        {hallUpgradeOpen && (() => {
          const next = nextHallTier(state.hallTier)
          if (!next) return null
          const navShortHere = state.navLevel < next.minNav
          // canAfford now means "can actually buy": the sheet must not offer a
          // confirm the server would reject.
          const canAfford = state.doubloons >= next.cost && !navShortHere
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
                  textAlign: 'center',
                }}
              >
                {/* The building you are buying. The two ladder sheets already
                    showed their art; the hall, which is the biggest purchase of
                    the three, was the one asking for six figures sight unseen. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/crew/hall_${next.tier}.png`} alt="" aria-hidden decoding="async"
                  style={{ display: 'block', width: 118, height: 118, margin: '0 auto 0.35rem', objectFit: 'contain', filter: `drop-shadow(0 4px 16px ${next.accent}66)` }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                <p className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                  Upgrade Crew Hall
                </p>
                <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: next.accent, marginBottom: 6 }}>
                  {next.name}
                </p>
                <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.62)', fontStyle: 'italic', marginBottom: 12, lineHeight: 1.5 }}>
                  {next.flavor}
                </p>
                <p className="font-karla font-600" style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.8)', marginBottom: 14, lineHeight: 1.45 }}>
                  Opens bunk <span style={{ color: next.accent }}>{next.bunks}</span>, so {next.bunks} hands can train at once
                </p>
                {/* The top hall's second effect. Six figures deserves to know
                    exactly what it buys, so the odds and the never-worse rule
                    are both stated before the confirm, not discovered after. */}
                {isLeviathanSlot(next.bunks - 1) && (
                  <div style={{ marginBottom: 14, padding: '0.75rem 0.85rem', borderRadius: 11, background: `${LEVIATHAN_COLOR}12`, border: `1px solid ${LEVIATHAN_COLOR}4d`, textAlign: 'left' }}>
                    <p className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: LEVIATHAN_COLOR, marginBottom: 5 }}>
                      And the bunk itself is different
                    </p>
                    <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.78)', lineHeight: 1.5 }}>
                      Bunk {next.bunks} sits deepest in the hall. Every stint finished there rolls that hand a{' '}
                      <span style={{ color: LEVIATHAN_COLOR, fontWeight: 700 }}>brand new trait</span> and shows it beside
                      the one they already have. Keep it <span style={{ color: LEVIATHAN_COLOR, fontWeight: 700 }}>one stat
                      at a time</span>, so a good number is never thrown back with a bad one. It is the only place a stat
                      can reach 4, and the only road to a Divine hand.
                    </p>
                    {/* Said before the six figures, not discovered forty stints
                        in. The re-cut table is rarity-weighted, so who you send
                        down matters as much as owning the bunk. */}
                    <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginTop: 8 }}>
                      How often a 4 lands depends on the hand: a Legendary rolls one far more often than
                      an Epic, and an Epic more often than a Rare.
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between" style={{
                  padding: '0.55rem 0.75rem', borderRadius: 9,
                  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
                  marginBottom: 14,
                }}>
                  <span className="font-karla font-600" style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Cost</span>
                  <span className="font-karla font-700" style={{ fontSize: '0.95rem', color: canAfford ? '#e8c87a' : '#f2b0b0' }}>
                    {next.cost.toLocaleString()} <span style={{ color: '#e8c87a' }}>⟡</span>
                  </span>
                </div>
                {navShortHere && (
                  <p className="font-karla font-600" style={{ fontSize: '0.86rem', color: '#9fc4e8', marginBottom: 10, lineHeight: 1.45 }}>
                    Needs Navigation {next.minNav}. You are Navigation {state.navLevel}.
                  </p>
                )}
                <p className="font-karla" style={{ fontSize: '0.74rem', color: canAfford ? 'rgba(255,255,255,0.45)' : '#f2b0b0', marginBottom: 12 }}>
                  Your doubloons: {state.doubloons.toLocaleString()} ⟡
                </p>
                <div className="flex" style={{ gap: 8 }}>
                  <button
                    onClick={() => setHallUpgradeOpen(false)}
                    disabled={hallBusy}
                    className="font-karla font-700"
                    style={{
                      flex: 1, padding: '0.7rem', borderRadius: 9, fontSize: '0.88rem',
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
                      flex: 1.4, padding: '0.7rem', borderRadius: 9, fontSize: '0.88rem',
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

        {/* Unassign-all confirm. Emptying six seats at once is the one action on
            this screen that undoes a lot of deliberate work in a single tap, so
            it gets a sheet rather than an inline arm — and the sheet says how
            many are leaving and that nobody is lost, because "unassign all"
            beside a roster full of crew can read like a dismissal. */}
        {clearAsk && (() => {
          const isRaid = clearAsk === 'raid'
          const accent = isRaid ? ASSIGN_RAID : ASSIGN_VOYAGE
          const partyName = isRaid ? 'Campaign Party' : 'Voyage Party'
          const count = state.roster.filter(c => (isRaid ? c.raidSlot : c.voyageSlot) != null).length
          const busy = clearingTrack === clearAsk
          return (
            <div
              onClick={() => { if (!busy) setClearAsk(null) }}
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
                  border: `1px solid ${accent}55`,
                  borderRadius: 14, padding: '1.2rem 1.1rem 1.05rem',
                  boxShadow: `0 10px 40px rgba(0,0,0,0.6), 0 0 30px ${accent}22`,
                  textAlign: 'center',
                }}
              >
                <p className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                  Unassign all
                </p>
                <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: accent, marginBottom: 10 }}>
                  {partyName}
                </p>
                <p className="font-karla font-600" style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.8)', marginBottom: 14, lineHeight: 1.45 }}>
                  {count === 1
                    ? <>The <span style={{ color: accent }}>1 crew</span> in this party leaves their seat.</>
                    : <>All <span style={{ color: accent }}>{count} crew</span> in this party leave their seats.</>}
                </p>
                <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginBottom: 14, lineHeight: 1.5 }}>
                  They stay in your roster, keep everything they have earned, and can be assigned again whenever you like.
                </p>
                <div className="flex" style={{ gap: 8 }}>
                  <button
                    onClick={() => setClearAsk(null)}
                    disabled={busy}
                    className="font-karla font-700"
                    style={{
                      flex: 1, padding: '0.7rem', borderRadius: 9, fontSize: '0.88rem',
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                      color: 'rgba(255,255,255,0.7)', cursor: busy ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleClearParty(clearAsk)}
                    disabled={busy}
                    className="font-karla font-700 active:scale-95"
                    style={{
                      flex: 1.4, padding: '0.7rem', borderRadius: 9, fontSize: '0.88rem',
                      background: `${accent}26`,
                      border: `1px solid ${accent}88`,
                      color: accent,
                      opacity: busy ? 0.45 : 1,
                      cursor: busy ? 'not-allowed' : 'pointer',
                      transition: 'transform 0.08s',
                    }}
                  >
                    {busy ? 'Standing them down…' : 'Unassign all'}
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
            .map(g => ({ ...g, skins: g.skins.filter(s => matchOwned(s.id) && (!trunkChase || !!s.chase)) }))
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
                {/* Near-opaque base and a border you can actually find. A 5%
                    white wash over a dark timber panel is invisible until you
                    already know the control is there. */}
                <button type="button" onClick={() => setTrunkMenu(open ? null : id)} className="tap"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7, width: '100%', padding: '0.5rem 0.72rem', borderRadius: 10,
                    background: open ? 'rgba(20,38,50,0.96)' : 'rgba(13,22,30,0.94)', border: `1px solid ${open ? 'rgba(94,200,232,0.75)' : 'rgba(143,215,234,0.34)'}`, cursor: 'pointer' }}>
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
              {/* No "The Trunk" title. The tab is already called Skins, so the
                  name was a second label for the same room. The count stays,
                  because a collection screen's first job is to say how far
                  along the collection is. */}
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <p className="font-cinzel font-800" style={{ fontSize: '1.05rem', color: '#8fd7ea' }}>{ownedCount} / {CREW_SKINS.length} collected</p>
              </div>
              {/* Skin gamble. One row rather than the panel it used to be: the
                  gallery is the point of this tab, so the gamble sits beside it
                  instead of pushing it below the fold.

                  OPAQUE BASE. It was an 11%-alpha blood tint fading into a
                  55%-alpha near-black, laid over the panel's dark timber, which
                  left a row you had to hunt for. Solid dark base now, a blood
                  tint with some weight on it, and a border at nearly double. */}
              {bloodMarketShown && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '0.6rem 0.6rem 0.6rem 0.75rem', borderRadius: 12, background: `linear-gradient(180deg, ${BLOOD}3d, rgba(26,9,13,0.97))`, border: `1px solid ${BLOOD}8c` }}>
                  <BloodDrop size={17} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#f3c0c6', lineHeight: 1.1 }}>Skin Gamble</p>
                    <p className="font-karla" style={{ fontSize: '0.6rem', color: '#d9a7ad', lineHeight: 1.25 }}>
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
              {/* Filters — two dropdowns and the chase toggle, one row. */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'stretch', marginBottom: 16 }}>
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
                {/* CHASE. A toggle, not a third dropdown: it is one yes/no that
                    cuts across both of the others, and a dropdown whose two
                    options are "on" and "off" is a switch wearing a costume.
                    Wears the chase glow when lit so it says what it filters. */}
                <button type="button" onClick={() => setTrunkChase(v => !v)} aria-pressed={trunkChase} className="tap"
                  style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.7rem', borderRadius: 10, cursor: 'pointer',
                    background: trunkChase ? 'rgba(88,52,120,0.9)' : 'rgba(13,22,30,0.94)',
                    border: `1px solid ${trunkChase ? 'rgba(201,167,255,0.85)' : 'rgba(201,167,255,0.34)'}` }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill={trunkChase ? '#e6d4ff' : 'none'} stroke={trunkChase ? '#e6d4ff' : '#c9a7ff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 3l2.4 5.4 5.6.6-4.2 3.9 1.2 5.6L12 15.8 6.9 18.5l1.2-5.6L3.9 9l5.6-.6z" />
                  </svg>
                  <span className="font-karla font-700" style={{ fontSize: '0.68rem', color: trunkChase ? '#f0e6ff' : '#c9a7ff', whiteSpace: 'nowrap' }}>Chase</span>
                </button>
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
              {/* Only here when there is something to put down, and it says
                  how many so the button is worth the row it costs. */}
              {levelledUp.length > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '0.5rem 0.7rem', borderRadius: 10, marginBottom: 9,
                  background: 'rgba(240,192,64,0.10)', border: '1px solid rgba(240,192,64,0.32)',
                }}>
                  <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#f0c040' }}>
                    {levelledUp.length} {levelledUp.length === 1 ? 'hand has' : 'hands have'} levelled up
                  </span>
                  <button type="button" onClick={markAllCrewSeen} className="font-karla font-700 tap"
                    style={{
                      flexShrink: 0, padding: '0.32rem 0.7rem', borderRadius: 8, fontSize: '0.68rem',
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
                      color: '#e0d9cc', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                    }}>
                    Mark all seen
                  </button>
                </div>
              )}

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
                const voyageAtSea = voyageParty.some(c => voyageLockSet.has(c.id))

                const card = (m: CrewMember) => {
                  // A Crew Hall stint locks a hand exactly as hard as a voyage
                  // or a trawl does, so it belongs in the same flag: it drives
                  // the grey-out AND disables the swipe-to-dismiss, which was
                  // live on training crew and came back as a server error.
                  const isBunkLocked = state.bunkLockedCrewIds.includes(m.id)
                  const isLocked = voyageLockSet.has(m.id) || trawlSet.has(m.id) || isBunkLocked
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
                        lockKind={trawlSet.has(m.id) ? 'trawl' : isBunkLocked ? 'bunk' : 'voyage'}
                        lockLabel={
                          trawlSet.has(m.id) ? 'This crew is out on a trawl. Collect it to free them up.'
                          : isBunkLocked ? 'This crew is training in the Crew Hall. They are in for the whole stint.'
                          : 'This crew is currently at sea on a voyage.'}
                        bunked={state.bunkedCrewIds.includes(m.id)}
                        bunkLocked={state.bunkLockedCrewIds.includes(m.id)}
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
                    ) : (
                      <>
                        {/* SORT: a PRIMARY and a SECONDARY, both chosen.
                            Was a segmented control of six equal tracks, which
                            worked while there were six. Overall and Potential
                            took it to eight and the labels were down to 0.55rem
                            and truncating, and more importantly a single key
                            cannot express the thing players were actually doing
                            by hand: rank on one measure, break the ties on
                            another. Two selects say that outright and stay one
                            row however many keys exist.

                            Native <select> on purpose. It is the control mobile
                            already knows, it opens the OS picker with a proper
                            touch target for eight options, and it is keyboard
                            and screen-reader correct for free. */}
                        {state.roster.length > 1 && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                            {([
                              { label: 'Sort by', value: rosterSort,  set: setRosterSort,  omit: null as RosterSort | null },
                              { label: 'Then by', value: rosterSort2, set: setRosterSort2, omit: rosterSort },
                            ]).map(sel => {
                              const color = ROSTER_SORTS.find(o => o.k === sel.value)?.color ?? '#bcb29a'
                              return (
                                <label key={sel.label} style={{ display: 'block', position: 'relative' }}>
                                  <span className="font-karla font-700 uppercase" style={{ display: 'block', fontSize: '0.5rem', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.66)', textShadow: '0 1px 3px rgba(0,0,0,0.8)', marginBottom: 3, paddingLeft: 2 }}>
                                    {sel.label}
                                  </span>
                                  <select
                                    value={sel.value}
                                    onChange={e => sel.set(e.target.value as RosterSort)}
                                    className="font-karla font-700"
                                    style={{
                                      width: '100%', appearance: 'none', WebkitAppearance: 'none',
                                      padding: '0.42rem 1.5rem 0.42rem 0.6rem', borderRadius: 10,
                                      fontSize: '0.72rem', color,
                                      // SOLID BASE. The crew page is drawn over
                                      // art, so a 5% white wash read as loose
                                      // text floating on the backdrop rather
                                      // than a control. Same near-opaque ground
                                      // the tab strip above it stands on, with
                                      // the accent as a tint on top so the two
                                      // selects still carry their key's colour.
                                      background: `linear-gradient(${color}1c, ${color}1c), rgba(14,19,28,0.97)`,
                                      border: `1px solid ${color}99`,
                                      boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
                                      cursor: 'pointer', touchAction: 'manipulation',
                                    }}>
                                    {ROSTER_SORTS.filter(o => o.k !== sel.omit).map(o => (
                                      // Options are painted by the OS, so the dark
                                      // ground has to be set here or the picker
                                      // renders white-on-white in dark mode.
                                      <option key={o.k} value={o.k} style={{ background: '#0e131c', color: '#f0ede8' }}>{o.label}</option>
                                    ))}
                                  </select>
                                  <span aria-hidden style={{ position: 'absolute', right: 8, bottom: 10, pointerEvents: 'none', color, opacity: 0.7, display: 'flex' }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                        )}
                        {grid(sortedRoster, 0, SECTION_NEUTRAL)}
                      </>
                    )}

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
                  //
                  // 620 -> 500, and the header then went from stacked to side by
                  // side, which is where the room for the body actually came
                  // from. The old budget was close ~28 + portrait 196 + name ~29
                  // + level bar ~35 + tabs ~55 + actions ~61, leaving the body
                  // about 84px — too little for the Stats tab's stat row plus its
                  // trait line, so the trait fell below the fold on a short phone.
                  //
                  // Now: close ~44 + header 146 + tabs ~55 + actions ~61 leaves
                  // the body around 194. The trait is visible without scrolling
                  // and the Skins grid gets a usable window. Taller tabs still
                  // scroll, which is what the scroll region is for.
                  width: '100%', maxWidth: 360, height: 'min(82vh, 500px)',
                  position: 'relative',
                  display: 'flex', flexDirection: 'column', overflow: 'hidden',
                  borderRadius: 14,
                  background: detail.kind === 'board' ? RECRUIT_PANEL_BG : ROSTER_PANEL_BG,
                  // Rarity at the EDGE, not shouting from it. A full-strength
                  // 1.5px coloured border plus a coloured bloom made the sheet
                  // read as a rarity announcement; the portrait ring and the
                  // rarity word already say the tier twice.
                  border: `1px solid ${dColor}4d`,
                  boxShadow: `0 24px 60px rgba(0,0,0,0.62), 0 0 30px ${dColor}1c`,
                }}>
                {/* A real 32px target with a plate under it, the same close the
                    boss sheet and the voyage sheet use. A bare glyph with 5px of
                    padding is a thumb-sized miss on a phone. */}
                <div className="flex justify-end" style={{ flexShrink: 0, padding: '0.55rem 0.6rem 0' }}>
                  <button onClick={close} aria-label="Close" type="button"
                    style={{
                      width: 32, height: 32, borderRadius: '50%', padding: 0, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)',
                      color: 'rgba(255,255,255,0.6)', touchAction: 'manipulation',
                    }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
                {/* minHeight:0 or this never scrolls - it just grows the shell. */}
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0.2rem 1.1rem 0.4rem' }}>

                {/* HEADER ROW: portrait left, identity right.
                    This used to be a 186x196 portrait CENTRED in a 360 sheet with
                    the name and level bar stacked under it. That spent 260px of a
                    500px sheet on the header and left ~87px of dead space down
                    each side of the picture, which is why the Stats tab's trait
                    line fell below the fold on a short phone. Side by side the
                    same information costs ~146px and fills the width. */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem', marginTop: '0.15rem' }}>

                {/* Portrait — rarity frame; a shown skin makes the ART itself glow
                    in its color (drop-shadow aura on the image). clip-path keeps
                    the glow inside the arch so it never spills past the frame.
                    Geometry is IDENTICAL on every tab. The Skins tab used to
                    shrink the frame 196 -> 186, recentre the art, repad it and
                    move the gradient, which read as the portrait jumping when
                    you tapped the tab. That was there to close dead space under
                    a shorter tab; the shell is a fixed height now, so there is
                    no dead space to close. */}
                <div style={{ position: 'relative', width: 132, height: 146, flexShrink: 0, borderRadius: 16, overflow: 'hidden', clipPath: 'inset(0 round 16px)', border: `1px solid ${dColor}88`, boxShadow: 'inset 0 -18px 28px rgba(0,0,0,0.55)', background: `linear-gradient(180deg, ${(portraitSkin ?? dColor)}1f 0%, #070504 78%)` }}>
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
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>

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
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
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
                              borderRadius: 10, cursor: renameSaving ? 'not-allowed' : 'pointer',
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
                              borderRadius: 10, cursor: 'pointer',
                            }}
                          >Cancel</button>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <p className="font-pirata" style={{ fontSize: '1.35rem', color: '#ecdcbd', lineHeight: 1.05, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</p>
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
                  <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: dColor }}>{RARITY_NAMES[(it.rarity as CrewRarity)] ?? 'Common'}</p>
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
                    <div style={{ marginTop: '0.35rem' }}>
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

                </div>{/* end identity column */}
                </div>{/* end header row */}

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
                    <span className={`font-cinzel font-700${isDivineTrait(dTrait) ? ' trait-divine' : ''}`} style={{
                      fontSize: isDivineTrait(dTrait) ? '0.95rem' : '0.86rem', fontStyle: 'italic',
                      ...(isDivineTrait(dTrait) ? {} : { color: dTraitKind === 'buff' ? '#9fd9b1' : dTraitKind === 'flaw' ? '#e09a9a' : 'rgba(255,255,255,0.6)' }),
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
                  const party = track === 'raid' ? 'Campaign Party' : 'Voyage Party'
                  const accent = track === 'voyage' ? ASSIGN_VOYAGE : ASSIGN_RAID
                  // At sea, trawling, or mid-stint in a bunk: assertCanReassign
                  // refuses every one of these, so offer none of them. The bunk
                  // case was missing, which meant swap / remove / dismiss were
                  // all live buttons that came back with a server error.
                  const isTrawlingM = state.trawlingCrewIds.includes(m.id)
                  const isBunkedM = state.bunkLockedCrewIds.includes(m.id)
                  const isLockedM = state.lockedCrewIds.includes(m.id) || isTrawlingM || isBunkedM
                  if (isLockedM) {
                    return (
                      <p className="font-karla font-600 italic" style={{ textAlign: 'center', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                        {isBunkedM
                          ? 'Training in the hall. Their stint has to finish before they can take new orders.'
                          : `${isTrawlingM ? 'Out on a trawl.' : 'At sea.'} Bring them home before giving new orders.`}
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

                        <p className="font-karla font-700" style={{ fontSize: '0.86rem', lineHeight: 1.45, color: '#ecdcbd', marginBottom: 10 }}>
                          {STAT_ABOUT[k].lead}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          {STAT_ABOUT[k].rows.map(([where, what]) => (
                            <div key={where} style={{ display: 'grid', gridTemplateColumns: '4.6rem minmax(0, 1fr)', columnGap: 8, alignItems: 'baseline' }}>
                              <span className="font-karla font-800 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.1em', color: STAT_COLOR[k] }}>{where}</span>
                              <span className="font-karla" style={{ fontSize: '0.8rem', lineHeight: 1.45, color: 'rgba(255,255,255,0.78)' }}>{what}</span>
                            </div>
                          ))}
                        </div>
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
                  <CloseButton onClick={() => { if (!skinBusy) setSkinBuyConfirm(null) }} style={{ position: 'absolute', top: 8, right: 10, zIndex: 3 }} />

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
                  <CloseButton onClick={close} style={{ position: 'absolute', top: 6, right: 12, zIndex: 4 }} />
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

          {/* WHERE THE LIMIT CAME FROM. Two ladders feed it and neither is
              visible from this screen, so a captain at a full roster had no way
              to find out what to go and do about it. The sum shows its working,
              then names the next thing on each ladder that would move it. */}
          {capacityOpen && (() => {
            const b = capacityBreakdown(state.navLevel, state.hallTier)
            const nextHall = b.nextHallTier ? CREW_HALL_TIERS[b.nextHallTier as CrewHallTierNum] : null
            const GOLD = '#c4a96a'
            const Row = ({ label, sub, value }: { label: string; sub: string; value: number }) => (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0.5rem 0.7rem', borderRadius: 10, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="font-cinzel font-700" style={{ display: 'block', fontSize: '0.8rem', color: '#f0ede8' }}>{label}</span>
                  <span className="font-karla" style={{ display: 'block', fontSize: '0.66rem', color: '#948e84', lineHeight: 1.4, marginTop: 1 }}>{sub}</span>
                </span>
                <span className="font-cinzel font-800" style={{ fontSize: '1rem', color: GOLD, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {value > 0 ? `+${value}` : value}
                </span>
              </div>
            )
            return (
              <motion.div key="cap-help" onClick={() => setCapacityOpen(false)}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
                style={{ position: 'fixed', inset: 0, zIndex: 270, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.4rem', background: 'rgba(4,3,2,0.84)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}>
                <motion.div onClick={e => e.stopPropagation()}
                  initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 6 }} transition={{ duration: 0.18 }}
                  style={{ position: 'relative', width: '100%', maxWidth: 340, borderRadius: 18, padding: '1.2rem 1.1rem 1.1rem', background: 'linear-gradient(180deg, rgba(20,17,12,0.99), rgba(9,8,6,0.99))', border: `1px solid ${GOLD}55`, boxShadow: `0 0 40px ${GOLD}22, 0 20px 50px rgba(0,0,0,0.6)` }}>
                  <p className="font-cinzel font-800" style={{ fontSize: '1.15rem', color: '#f4ecd8', textAlign: 'center' }}>Your Crew Limit</p>
                  <p className="font-cinzel font-800" style={{ fontSize: '2.1rem', color: GOLD, textAlign: 'center', lineHeight: 1.1, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                    {b.total}
                  </p>
                  <p className="font-karla" style={{ fontSize: '0.68rem', color: '#948e84', textAlign: 'center', marginTop: 2 }}>
                    {state.roster.length} aboard, {Math.max(0, b.total - state.roster.length)} berth{b.total - state.roster.length === 1 ? '' : 's'} free
                  </p>

                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <Row label="Every captain" sub="What you start with." value={b.base} />
                    <Row label={`Navigation ${state.navLevel}`} sub={`One more for every ${b.navPerLevels} Navigation levels.`} value={b.fromNav} />
                    <Row label={`${hallTierDef(state.hallTier).name}`} sub={`${b.perHallTier} for every hall tier past the first.`} value={b.fromHall} />
                  </div>

                  {(b.nextNavLevel || nextHall) ? (
                    <div style={{ marginTop: 12, padding: '0.6rem 0.7rem', borderRadius: 10, background: `${GOLD}0f`, border: `1px solid ${GOLD}33` }}>
                      <p className="font-karla font-700 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.14em', color: '#948e84' }}>To raise it</p>
                      {/* NOT JUST WHAT, BUT HOW FAR. "Navigation 60 adds 1" is
                          a fact; "4,100 XP to go" is what a captain deciding
                          whether to dismiss a hand or wait one more level
                          actually needs. Same for the hall: the price against
                          the purse, and said plainly when the purse is short. */}
                      {b.nextNavLevel && (() => {
                        const need = Math.max(0, (NAV_XP_TABLE[b.nextNavLevel - 1] ?? 0) - state.navXp)
                        return (
                          <div style={{ marginTop: 5 }}>
                            <p className="font-karla" style={{ fontSize: '0.72rem', color: '#d8d2c6', lineHeight: 1.45 }}>
                              <span style={{ color: GOLD, fontWeight: 700 }}>+1</span> at Navigation {b.nextNavLevel}
                            </p>
                            <p className="font-karla" style={{ fontSize: '0.64rem', color: '#948e84', lineHeight: 1.4, marginTop: 1 }}>
                              {need > 0 ? `${need.toLocaleString()} Navigation XP to go` : 'Earned. It lands on your next raid or voyage.'}
                            </p>
                          </div>
                        )
                      })()}
                      {nextHall && (() => {
                        const short = Math.max(0, nextHall.cost - state.doubloons)
                        const navShortHere = state.navLevel < nextHall.minNav
                        return (
                          <div style={{ marginTop: 7 }}>
                            <p className="font-karla" style={{ fontSize: '0.72rem', color: '#d8d2c6', lineHeight: 1.45 }}>
                              <span style={{ color: GOLD, fontWeight: 700 }}>+{b.perHallTier}</span> from the {nextHall.name}, and a bunk with them
                            </p>
                            <p className="font-karla" style={{ fontSize: '0.64rem', color: !navShortHere && short === 0 ? '#9fd9b1' : '#948e84', lineHeight: 1.4, marginTop: 1 }}>
                              {navShortHere
                                ? `Opens at Navigation ${nextHall.minNav}`
                                : short > 0
                                  ? `${nextHall.cost.toLocaleString()} ⟡, you are ${short.toLocaleString()} short`
                                  : `${nextHall.cost.toLocaleString()} ⟡, and you can afford it`}
                            </p>
                          </div>
                        )
                      })()}
                      {/* The whole ladder, so "wait or dismiss" is answerable
                          past the very next rung. Nav pays a berth every five
                          levels forever, which is the part nobody can see from a
                          single next-step line. */}
                      <p className="font-karla" style={{ fontSize: '0.62rem', color: '#7d776e', lineHeight: 1.45, marginTop: 8, fontStyle: 'italic' }}>
                        Every {b.navPerLevels} Navigation levels is another berth, up to {crewCapacity(NAV_MAX_LEVEL, CREW_HALL_MAX_TIER)} with both ladders topped out.
                      </p>
                    </div>
                  ) : (
                    <p className="font-karla" style={{ fontSize: '0.72rem', color: '#d8d2c6', lineHeight: 1.5, marginTop: 12, textAlign: 'center', fontStyle: 'italic' }}>
                      Navigation maxed and the hall built out. There is no bigger crew than this one.
                    </p>
                  )}

                  <button onClick={() => setCapacityOpen(false)} className="font-karla font-700 uppercase tracking-[0.1em] active:scale-95"
                    style={{ marginTop: 12, width: '100%', padding: '0.62rem', borderRadius: 11, fontSize: '0.62rem', background: `${GOLD}22`, border: `1px solid ${GOLD}66`, color: '#f4ecd8', cursor: 'pointer' }}>
                    Got it
                  </button>
                </motion.div>
              </motion.div>
            )
          })()}
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
