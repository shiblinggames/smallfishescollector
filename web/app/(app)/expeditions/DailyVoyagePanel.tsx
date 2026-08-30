'use client'

import { useState, useTransition, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react'
import CloseButton from '@/components/CloseButton'
import { motion, AnimatePresence } from 'framer-motion'
import { hapticTap } from '@/lib/haptics'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'
import { resolveDeployedCrew, type DeployedCrew } from '@/lib/crewResolve'
import { crewXPProgress, isStatTickLevel, CREW_MAX_LEVEL } from '@/lib/crewLevel'
import { RARITY_COLORS as CREW_RARITY_COLORS } from '@/lib/crewGen'
import type { CrewMember } from '@/app/(app)/crew/actions'
import type { VoyageEvent } from '@/lib/voyageRoutes'
import { ROUTE_CONFIGS, COMING_SOON_ROUTES, effectiveCrewLossChance, type VoyageRoute } from '@/lib/voyageRoutes'
import { expectedVoyageLoot, outcomeChances, fortuneScale, meanOutcomeMult, OUTCOME_MULT } from '@/lib/voyageRoll'
import { hasSafeVoyages, gauntletVoyageSpeedMult } from '@/lib/gauntletUpgrades'
import { getBait } from '@/lib/bait'
import { getSpecialItem } from '@/lib/specialItems'
import { sendDailyVoyage, revealVoyageResults, getTrawlingCrewIds, type DailyVoyage } from './voyageActions'
import { getLevelFromXP, ROUTE_BASE_XP, VOYAGE_XP_MULT } from '@/lib/expeditionLevel'
import { BASE_VOYAGE_MS, ROUTE_VOYAGE_MS, computeVoyageDurationMs } from '@/lib/voyage'
import VoyageHistory, { type VoyageHistoryEntry } from './VoyageHistory'
import NavLevelUpOverlay, { NavLevelUpInfo } from '@/components/NavLevelUpOverlay'
import { IconMap, IconSwords, IconBolt, IconWave, IconGull, IconHourglass, IconCrate, IconSkull, IconLock, IconCheck } from '@/components/GameIcons'

type PanelState = 'idle' | 'away' | 'returned' | 'done'

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

const EVENT_ICONS: Record<string, ReactNode> = {
  discovery: <IconMap />,
  encounter: <IconSwords />,
  danger:    <IconBolt />,
  weather:   <IconWave />,
  peaceful:  <IconGull />,
}

const OUTCOME_STYLES: Record<string, { label: string; bg: string; color: string; border: string }> = {
  success: { label: 'Success',    bg: 'rgba(74,222,128,0.07)',   color: '#4ade80', border: '#4ade8033' },
  failure: { label: 'Setback',    bg: 'rgba(248,113,113,0.07)', color: '#f87171', border: '#f8717133' },
  neutral: { label: 'Uneventful', bg: 'rgba(161,155,135,0.06)', color: '#857460', border: '#85746033' },
}

function rarityColor(rarity: number): string {
  return CREW_RARITY_COLORS[rarity as 1 | 2 | 3 | 4] ?? '#8a8880'
}

function formatCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const mm = m.toString().padStart(2, '0')
  const ss = s.toString().padStart(2, '0')
  return h > 0 ? `${h}h ${mm}m ${ss}s` : `${mm}m ${ss}s`
}

type DropEntry =
  | { kind: 'bait';    type: string;   rate: string }
  | { kind: 'special'; id: 'tide_turner' | 'phantom_hook' | 'perfected_sigil'; rate: string }

// Rate labels are the per-voyage marginal odds of seeing at least one of
// that lure. Coastal ~10% / open ~20% / deep ~30% / triangle ~40% /
// shroud ~50% are the COMBINED odds of getting either lure on the
// voyage — the per-lure splits below sum to slightly more than the
// combined (independent events) but are close enough for the rate card.
// See LURE_RATE_PER_EVENT in lib/voyageEvents.ts for the math.
const ROUTE_DROPS: Record<VoyageRoute, DropEntry[]> = {
  coastal: [
    { kind: 'bait', type: 'luminous',        rate: '~7%' },
    { kind: 'bait', type: 'golden',          rate: '~3%' },
  ],
  open: [
    { kind: 'bait', type: 'luminous',        rate: '~14%' },
    { kind: 'bait', type: 'golden',          rate: '~6%' },
  ],
  deep: [
    { kind: 'bait',    type: 'luminous',     rate: '~22%' },
    { kind: 'bait',    type: 'golden',       rate: '~10%' },
    { kind: 'special', id: 'tide_turner',    rate: '~2%' },
  ],
  triangle: [
    { kind: 'bait',    type: 'luminous',     rate: '~29%' },
    { kind: 'bait',    type: 'golden',       rate: '~14%' },
    { kind: 'special', id: 'phantom_hook',   rate: '~2%' },
  ],
  // Shrouded Reach — fishing-only loot. Voyages are the passive perk
  // loop for players who skip raids, so this route's drops shouldn't
  // pull from raid pools.
  shroud: [
    { kind: 'bait',    type: 'luminous',         rate: '~38%' },
    { kind: 'bait',    type: 'golden',           rate: '~18%' },
    { kind: 'special', id: 'perfected_sigil',    rate: '~2%' },
  ],
}

function computeRouteEstimate(
  stats: { power: number; dodge: number; fortune: number },
  crewCount: number,
  route: VoyageRoute,
  safeVoyages = false,
) {
  // Straight from lib/voyageRoll, the same module the server rolls with. This
  // used to model the OLD six-event voyage by hand, counting notional
  // encounters and discoveries per route, and it was never updated when a
  // voyage became one event and one loot roll. Every number it produced had
  // been wrong since that change.
  const expected = expectedVoyageLoot(route, stats.power, stats.fortune)
  const chances  = outcomeChances(stats.power, route)

  // The band is the two outcomes the crew can actually land on, read straight
  // off OUTCOME_MULT rather than retyped, so retuning the spread moves this
  // with it.
  const meanOm = meanOutcomeMult(stats.power, route)
  const perOutcome = expected.doubloons / meanOm
  const lootMin = Math.round(perOutcome * OUTCOME_MULT.setback)
  const lootMax = Math.round(perOutcome * OUTCOME_MULT.triumph)
  const xpMin = Math.round((expected.xp / meanOm) * OUTCOME_MULT.setback)
  const xpMax = Math.round((expected.xp / meanOm) * OUTCOME_MULT.triumph)

  // Flat per-voyage crew-loss chance, scaled down by total crew fortune —
  // fully zeroed once fortune matches the route's minLevel (see
  // effectiveCrewLossChance in lib/voyageRoutes). One-decimal precision so
  // partially-mitigated values don't get overstated by whole-% rounding.
  const crewRiskPct = safeVoyages
    ? 0
    : crewCount >= 2
      ? Math.round(effectiveCrewLossChance(route, stats.fortune) * 1000) / 10
      : 0

  return {
    lootMin, lootMax, crewRiskPct, drops: ROUTE_DROPS[route], xpMin, xpMax,
    gems: expected.gems,
    triumphPct: Math.round(chances.triumph * 100),
    setbackPct: Math.round(chances.setback * 100),
  }
}

/**
 * ONE ROUTE, AS A CARD YOU CAN SEND FROM.
 *
 * Everything the old route sheet said, on a face you do not have to open: the
 * painted band the place is recognised by, the pay, the time, the odds, what
 * it costs a crew, and what might drop. The five sit in a column and are
 * comparable at a glance, which a chart with five identical dots on it could
 * never be.
 *
 * ONE TAP, AND IT IS THE ONE THAT SENDS. The old flow was tap a dot, read a
 * sheet, press Set Sail, and the middle step existed only because the dot
 * could not say anything.
 *
 * A LOCKED ROUTE IS STILL DRAWN, greyed, with the reason where the button
 * goes. Seeing the Shroud sitting there is most of the reason to level toward
 * it, and a route that is simply absent teaches nobody anything.
 */
/** PER ROUTE, not per selection. The Inner Sea is the safe introduction and any
 *  boat can sail it with a single hand aboard; everything else wants a real
 *  party. Module scope so the card and anything else that needs it read one
 *  rule — this used to be derived from the selected route, and with five cards
 *  and no selection it would otherwise have been written out five times. */
function minCrewFor(route: VoyageRoute, slots: number): number {
  return route === 'coastal' ? 1 : Math.min(2, slots)
}

function RouteCard({
  route, stats, rawDodge, crewCount, crewSlots, expeditionXP, shipTier,
  safeVoyages, voyageSpeedMult, sending, onSail,
}: {
  route: VoyageRoute
  stats: { power: number; dodge: number; fortune: number } | null
  rawDodge: number
  crewCount: number
  crewSlots: number
  expeditionXP: number
  shipTier: number
  safeVoyages: boolean
  voyageSpeedMult: number
  sending: boolean
  onSail: () => void
}) {
  const rco = ROUTE_CONFIGS[route]
  const expLevel = getLevelFromXP(expeditionXP)
  const levelLocked = expLevel < rco.minLevel
  const shipLocked = shipTier < rco.minShipTier
  const comingSoon = COMING_SOON_ROUTES.has(route)
  const locked = levelLocked || shipLocked || comingSoon

  const est = stats ? computeRouteEstimate(stats, crewCount, route, safeVoyages) : null
  // The RAW dodge, not the scorePct-boosted figure. The server stamps
  // duration_ms from raw dodge, so feeding the boosted one here showed anybody
  // with Pathfinder, Shanty Singer or Flagship a shorter voyage than they got.
  const estMs = Math.round(computeVoyageDurationMs(expLevel, rawDodge, route) * voyageSpeedMult)
  const riskPct = est?.crewRiskPct ?? 0
  const riskColor = riskPct >= 15 ? '#f87171' : riskPct >= 8 ? '#f0c040' : '#6a8a6a'
  const minCrew = minCrewFor(route, crewSlots)
  const short = crewCount < minCrew
  const ready = !locked && !short && !sending
  const drops = est?.drops ?? ROUTE_DROPS[route]

  return (
    <div style={{
      borderRadius: 14, overflow: 'hidden',
      // A SOLID base. These sit on the modal's painted dusk-sea plate, and a
      // translucent card over art reads as a smear.
      background: '#0a0704',
      border: `1px solid ${locked ? 'rgba(160,120,60,0.22)' : `${rco.color}3d`}`,
      boxShadow: locked ? 'none' : `0 0 18px ${rco.color}12`,
      opacity: locked ? 0.72 : 1,
    }}>
      {/* ── The band ──
          The art is 9:16 portrait painted to the campaign's format, so a wide
          strip is a horizontal slice of it. 24% down lands on the part that
          carries the place: the horizon, its landmark, the tops of the rocks. */}
      <div style={{ position: 'relative', height: 96 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={rco.image} alt="" aria-hidden loading="lazy" decoding="async"
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center 24%',
            filter: locked ? 'grayscale(0.85) brightness(0.5)' : undefined,
          }} />
        <div aria-hidden style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(10,7,4,0.10) 0%, rgba(10,7,4,0.30) 44%, rgba(10,7,4,0.88) 84%, #0a0704 100%)',
        }} />
        <span className="font-karla font-800 uppercase tracking-[0.12em]" style={{
          position: 'absolute', top: 9, left: 10,
          fontSize: '0.5rem', padding: '0.24rem 0.5rem', borderRadius: 999,
          color: locked ? '#c8b28a' : rco.color,
          background: locked ? 'rgba(0,0,0,0.55)' : `${rco.color}22`,
          border: `1px solid ${locked ? 'rgba(200,178,138,0.4)' : `${rco.color}77`}`,
        }}>
          {comingSoon ? 'Coming soon' : locked ? 'Locked' : rco.riskLabel}
        </span>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 0.85rem 0.45rem' }}>
          <p className="font-cinzel font-800" style={{
            fontSize: '1.12rem', lineHeight: 1.1, color: '#fff',
            textShadow: `0 2px 12px rgba(0,0,0,0.92), 0 0 22px ${rco.color}33`,
          }}>{rco.name}</p>
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#b0a08a', lineHeight: 1.35, marginTop: 2 }}>
            {rco.tagline}
          </p>
        </div>
      </div>

      <div style={{ padding: '0.6rem 0.85rem 0.75rem' }}>
        {/* WHAT IT PAYS AND WHAT IT COSTS. Live off the crew actually aboard,
            so swapping a hand moves these and the connection teaches itself. */}
        {est && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', flexWrap: 'wrap', marginBottom: 5 }}>
            <span className="font-karla font-700" style={{ fontSize: '0.95rem', color: '#c8aa6a' }}>
              ~{est.lootMin.toLocaleString()}–{est.lootMax.toLocaleString()} ⟡
            </span>
            <span aria-hidden style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.66rem' }}>·</span>
            <span className="font-karla" style={{ fontSize: '0.8rem', color: '#5a7aaa' }}>
              {est.xpMin.toLocaleString()}–{est.xpMax.toLocaleString()} XP
            </span>
            <span aria-hidden style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.66rem' }}>·</span>
            <span className="font-karla" style={{ fontSize: '0.8rem', color: '#7a6848' }}>
              <IconHourglass size={10} /> {formatDuration(estMs)}
            </span>
            {voyageSpeedMult < 1 && (
              <span className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#46c0a0' }}>Swift Sails</span>
            )}
          </div>
        )}

        {est && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', flexWrap: 'wrap', marginBottom: 7 }}>
            <span className="font-karla font-600" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.44)' }}>
              {est.triumphPct}% triumph · {est.setbackPct}% setback
            </span>
            <span aria-hidden style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.66rem' }}>·</span>
            {/* PERMADEATH IS NOT GREY FOOTNOTE TEXT. It carries the target to
                beat with it, so the number and the way out of it are one line. */}
            <span className="font-karla font-700" style={{
              fontSize: '0.72rem',
              color: safeVoyages ? '#4ade80' : riskPct >= 8 ? riskColor : riskPct > 0 ? '#c8aa6a' : '#6a8a6a',
            }}>
              {safeVoyages ? 'Safe Passage'
                : riskPct > 0 ? `${riskPct}% crew risk · safe at ${rco.minLevel} Fortune`
                : 'no crew risk'}
            </span>
          </div>
        )}

        {/* WHAT MIGHT COME BACK WITH THEM. Icons and rates only: the name and
            the effect were an expandable row on the old sheet, and on a card
            that is a disclosure nobody opens. The lures are recognisable by
            their art, which is the whole reason they have any. */}
        {drops.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 9 }}>
            {drops.map(drop => {
              const special = drop.kind === 'special' ? getSpecialItem(drop.id) : null
              const key = drop.kind === 'bait' ? drop.type : drop.id
              const bait = drop.kind === 'bait' ? getBait(drop.type) : null
              const color = special ? special.color : bait!.color
              const name = special ? special.name : bait!.name
              const image = special?.image ?? bait?.imageUrl ?? null
              return (
                <span key={key} title={name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {image
                    ? /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={image} alt={name} loading="lazy" decoding="async"
                        style={{ width: 22, height: 22, objectFit: 'contain', filter: `drop-shadow(0 1px 4px ${color}66)` }} />
                    : <span aria-hidden style={{
                        width: 9, height: 9, borderRadius: drop.kind === 'bait' ? 2 : '50%',
                        background: color, boxShadow: `0 0 4px ${color}88`,
                      }} />}
                  <span className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#a89878' }}>{drop.rate}</span>
                </span>
              )
            })}
          </div>
        )}

        {locked ? (
          <div style={{
            width: '100%', borderRadius: 9, padding: '0.5rem 0.8rem', textAlign: 'center',
            background: 'rgba(160,120,60,0.06)', border: '1px solid rgba(160,120,60,0.22)',
          }}>
            <span className="font-cinzel font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.78rem', color: '#a08858' }}>
              <IconLock size={11} /> {comingSoon ? 'Coming soon'
                : shipLocked ? 'Requires a Sloop or better'
                : `Unlocks at Expedition Lv ${rco.minLevel}`}
            </span>
          </div>
        ) : (
          <motion.button
            onClick={onSail}
            disabled={!ready}
            whileTap={ready ? { scale: 0.97 } : undefined}
            className="font-cinzel font-800 uppercase tracking-[0.12em]"
            style={{
              width: '100%', borderRadius: 9, padding: '0.6rem 0.9rem',
              transition: 'background 0.15s, opacity 0.15s, border-color 0.15s',
              ...(ready
                ? { background: `linear-gradient(180deg, ${rco.color} 0%, ${rco.color}d0 100%)`, border: `1px solid ${rco.color}`, color: '#0d1410', cursor: 'pointer', boxShadow: `0 3px 13px ${rco.color}3d, inset 0 1px 0 rgba(255,255,255,0.35)` }
                : sending
                  ? { background: `linear-gradient(180deg, ${rco.color}aa 0%, ${rco.color}70 100%)`, border: `1px solid ${rco.color}88`, color: 'rgba(13,20,16,0.72)', cursor: 'default' }
                  : { background: 'rgba(80,100,120,0.10)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.34)', cursor: 'default' }),
            }}
          >
            <span style={{ fontSize: '0.88rem' }}>
              {sending ? 'Sending…'
                : short ? (minCrew === 1 ? 'Need 1 crew aboard' : `Need ${minCrew} crew aboard`)
                : 'Set Sail'}
            </span>
          </motion.button>
        )}
      </div>
    </div>
  )
}

interface Props {
  roster: CrewMember[]
  shipTier: number
  todayVoyage: DailyVoyage | null
  readyVoyage: DailyVoyage | null
  raidActive?: boolean
  expeditionXP?: number
  voyages?: VoyageHistoryEntry[]
  /** Claimed Gauntlet Locker Upgrade ids — surfaces Safe Passage / Swift Sails. */
  gauntletUpgrades?: string[]
}

export default function DailyVoyagePanel({
  roster,
  shipTier,
  todayVoyage,
  readyVoyage,
  raidActive = false,
  expeditionXP = 0,
  voyages = [],
  gauntletUpgrades = [],
}: Props) {
  const router = useRouter()
  // Gauntlet Locker Upgrades that change voyages — surfaced truthfully below.
  const safeVoyages = hasSafeVoyages(gauntletUpgrades)
  const voyageSpeedMult = gauntletVoyageSpeedMult(gauntletUpgrades)
  const [isPending, startTransition] = useTransition()

  const initialState: PanelState =
    todayVoyage ? 'away'
    : readyVoyage ? 'returned'
    : 'idle'

  const [panelState, setPanelState] = useState<PanelState>(initialState)
  const [activeVoyage, setActiveVoyage] = useState<DailyVoyage | null>(readyVoyage ?? todayVoyage)
  const [error, setError] = useState<string | null>(null)
  // THE RETURN IS SEALED until the player opens it.
  //
  // The haul used to be printed above the Claim button, so by the time anyone
  // pressed it they had already read the number. The button acknowledged a
  // receipt rather than revealing anything, which is a poor trade for what is
  // now the rarest moment in the game: a Shroud voyage runs up to nine hours,
  // so most players see one or two of these a day.
  //
  //   sealed  -> the ship is home, the manifest is shut
  //   outcome -> how it went, which is what the crew choice earned
  //   haul    -> the numbers
  const [reveal, setReveal] = useState<'sealed' | 'outcome' | 'haul'>('sealed')
  // MASSIVE BOOTY takes over the screen. A caption on the card is not enough
  // for something a player might see once a month.
  const [bootyOverlay, setBootyOverlay] = useState(false)
  // The route sheet portals to document.body, which does not exist during the
  // server render. Gate on a mount flag rather than a bare `typeof document`
  // check so the first client render matches the server's and React does not
  // report a hydration mismatch.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  // iOS treats overflow:hidden on body as a suggestion, so the sheet uses the
  // shared lock (see lib/bodyScrollLock) or the page scrolls behind it.
  // A new voyage arrives sealed, even if the previous one was opened.
  useEffect(() => { setReveal('sealed') }, [activeVoyage?.id])

  const [claimedBait, setClaimedBait] = useState<{ type: string; qty: number }[]>([])
  const [crewXP, setCrewXP] = useState<{ id: number; name: string; oldXP: number; newXP: number; oldLevel: number; newLevel: number }[]>([])
  const [claimedTideTurner, setClaimedTideTurner] = useState(false)
  const [claimedPhantomHook, setClaimedPhantomHook] = useState(false)
  const [claimedPerfectedSigil, setClaimedPerfectedSigil] = useState(false)
  const [claimedSkinId, setClaimedSkinId] = useState<string | null>(null)
  const [liveCrewIds, setLiveCrewIds] = useState<number[]>(() =>
    roster
      .filter(c => c.voyageSlot != null)
      .sort((a, b) => (a.voyageSlot ?? 0) - (b.voyageSlot ?? 0))
      .map(c => c.id)
  )
  // Remember every crew we've seen so lost (deleted) crew can still be named
  // in the voyage results.
  const knownCrew = useRef(new Map<number, CrewMember>())
  for (const c of roster) knownCrew.current.set(c.id, c)
  const [infoOpen, setInfoOpen] = useState(false)
  const [logExpanded, setLogExpanded] = useState(false)
  const [xpEarned, setXpEarned] = useState(0)
  const [levelUp, setLevelUp] = useState<{ from: number; to: number } | null>(null)
  // Big celebration overlay (fishing-style ring bursts + stat-delta breakdown).
  // Separate from the small inline summary line above, which stays in the
  // voyage-results card for reference; this fires once on reveal and is
  // tap-dismissable.
  const [levelUpOverlay, setLevelUpOverlay] = useState<NavLevelUpInfo | null>(null)

  useEffect(() => {
    const handler = (e: Event) => setLiveCrewIds((e as CustomEvent<number[]>).detail)
    window.addEventListener('crew-changed', handler)
    return () => window.removeEventListener('crew-changed', handler)
  }, [])

  // Crew out on a trawl are locked from voyages (the server drops them). Track
  // them so the panel stops counting them and can say WHY a slotted crew can't
  // sail — otherwise Set Sail looked like it did nothing.
  const [trawlingIds, setTrawlingIds] = useState<number[]>([])
  useEffect(() => {
    let alive = true
    const load = () => { getTrawlingCrewIds().then(ids => { if (alive) setTrawlingIds(ids) }).catch(() => {}) }
    load()
    window.addEventListener('crew-changed', load)
    return () => { alive = false; window.removeEventListener('crew-changed', load) }
  }, [])
  const trawlingSet = useMemo(() => new Set(trawlingIds), [trawlingIds])

  const returnTime = activeVoyage
    ? new Date(activeVoyage.created_at).getTime() + (activeVoyage.duration_ms ?? BASE_VOYAGE_MS)
    : null
  const [msRemaining, setMsRemaining] = useState<number>(() =>
    returnTime ? Math.max(0, returnTime - Date.now()) : 0
  )

  useEffect(() => {
    if (!returnTime || panelState !== 'away') return
    const tick = () => {
      const ms = Math.max(0, returnTime - Date.now())
      setMsRemaining(ms)
      if (ms === 0) setPanelState('returned')
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [returnTime, panelState])

  const shipStats = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]
  // Minimum crew needed to set sail. The Inner Sea (coastal) is the safe intro
  // route — any boat can sail it with a single crew member aboard. Other routes
  // need a real party of two.
  const byId = knownCrew.current
  // A slotted crew that's out on a trawl can't sail — drop it from the
  // deployable party (so the count is honest) and name it below so the player
  // isn't left wondering why Set Sail does nothing.
  const slottedIds = liveCrewIds.slice(0, shipStats.crewSlots)
  const savedCrew: CrewMember[] = slottedIds
    .filter(id => !trawlingSet.has(id))
    .map(id => byId.get(id))
    .filter(Boolean) as CrewMember[]
  const trawlingAssigned: CrewMember[] = slottedIds
    .filter(id => trawlingSet.has(id))
    .map(id => byId.get(id))
    .filter(Boolean) as CrewMember[]

  const resolvedDeployed = savedCrew.length > 0
    ? resolveDeployedCrew(savedCrew.map((c, i): DeployedCrew => ({ id: c.id, slot: i, rarity: c.rarity, power: c.power, dodge: c.dodge, fortune: c.fortune, effects: c.effects, xp: c.xp, slug: c.slug })))
    : null
  // scorePct (Pathfinder / Shanty Singer / Flagship) lifts the displayed estimate,
  // matching how the voyage is rolled at send time.
  const voyageScoreMult = resolvedDeployed ? 1 + resolvedDeployed.voyage.scorePct / 100 : 1
  const stats = resolvedDeployed
    ? {
        power: Math.round(resolvedDeployed.totals.power * voyageScoreMult),
        dodge: Math.round(resolvedDeployed.totals.dodge * voyageScoreMult),
        fortune: Math.round(resolvedDeployed.totals.fortune * voyageScoreMult),
      }
    : null

  const handleSend = useCallback((route: VoyageRoute) => {
    if (savedCrew.length === 0) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await sendDailyVoyage(route)
        if ('error' in res) { setError(res.error); return }
        setActiveVoyage(res.voyage)
        setPanelState('away')
        // The panel knows the crew has sailed. The VOYAGE CARD up in HubCards does
        // not: it reads todayVoyage/readyVoyage as SERVER props, so nothing short of
        // a server re-render can move it off "Ready to Set Sail". Local state cannot
        // reach it. Without this the card sat there lying until you tabbed away and
        // back, which is the only reason it ever looked correct.
        // (handleClaim below has always done this. Only the launch path forgot.)
        router.refresh()
      } catch (e) {
        // Never let a thrown action leave the button stuck on "Sending…"
        // with no feedback — surface it and clear the pending state.
        console.error('[voyage] set sail failed:', e)
        setError('Could not set sail. Please try again.')
      }
    })
  }, [savedCrew, router])

  /** Banks the voyage. `advance` is false while the sealed-manifest reveal is
   *  playing: the server work happens immediately so the numbers are real and
   *  the balances update, but the panel stays put until the player has actually
   *  seen the reveal and tapped through it. */
  const handleClaim = useCallback((advance = true) => {
    if (!activeVoyage) return
    setError(null)
    startTransition(async () => {
      try {
      const res = await revealVoyageResults(activeVoyage.id)
      if ('error' in res) { setError(res.error); return }
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloonTotal }))
      if (res.earnedGems > 0) window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.newGemTotal }))
      setClaimedBait(res.earnedBait)
      setCrewXP(res.crewXP)
      if (res.newTideTurner) setClaimedTideTurner(true)
      if (res.newPhantomHook) setClaimedPhantomHook(true)
      if (res.newPerfectedSigil) setClaimedPerfectedSigil(true)
      if (res.unlockedSkinId) setClaimedSkinId(res.unlockedSkinId)
      setXpEarned(res.xpEarned)
      if (res.newExpeditionLevel > res.oldExpeditionLevel) {
        setLevelUp({ from: res.oldExpeditionLevel, to: res.newExpeditionLevel })
        setLevelUpOverlay({ fromLevel: res.oldExpeditionLevel, toLevel: res.newExpeditionLevel })
      }
      if (advance) setPanelState('done')
      router.refresh()
      } catch (e) {
        console.error('[voyage] claim failed:', e)
        setError('Could not claim the voyage. Please try again.')
      }
    })
  }, [activeVoyage, router])

  // ── Idle: send voyage ──────────────────────────────────────────────────────
  if (panelState === 'idle') {
    const hasCrew = savedCrew.length > 0
    return (
      <div>
        <div>
          {raidActive ? (
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#9a8868', lineHeight: 1.5 }}>
              Your crew is on a raid. Finish the raid before sending them on a voyage.
            </p>
          ) : !hasCrew ? (
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#9a8868', lineHeight: 1.5 }}>
              No hands in the voyage seats. Fill them from your ship&apos;s loadout and they can sail.
            </p>
          ) : (
            <>
              {/* No blurb. The cards say what a paragraph about routes would,
                  and everything they do not say is behind the "?" on the crew
                  strip. */}

              {/* Info modal */}
              {infoOpen && (
                <div
                  onClick={() => setInfoOpen(false)}
                  style={{
                    position: 'fixed', inset: 0, zIndex: 50,
                    background: 'rgba(0,0,0,0.72)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1.5rem',
                  }}
                >
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      background: 'linear-gradient(135deg, rgba(22,16,8,0.98) 0%, rgba(14,10,4,0.99) 100%)',
                      border: '1px solid rgba(200,170,100,0.22)',
                      borderRadius: 16, padding: '1.4rem 1.3rem',
                      maxWidth: 360, width: '100%',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                      <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#c8aa6a' }}>How Voyages Work</p>
                      <CloseButton onClick={() => setInfoOpen(false)} size={28} />
                    </div>
                    {/* The one thing this explainer never said, and the whole point of the
                        mode: you do not PLAY a voyage. The Campaign is where you fight. */}
                    <p className="font-karla" style={{ fontSize: '0.8rem', color: '#d8cdb4', lineHeight: 1.5, marginBottom: '0.9rem' }}>
                      Voyages are <strong style={{ color: '#f0c040' }}>passive income</strong>. You do not play them: your crew sail off on their own and come back with doubloons, gems and Nav XP whether you are here or not. The <strong style={{ color: '#dca494' }}>Campaign</strong> is the opposite, and it is where you fight the battles yourself.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      {([
                        [<IconMap key="i" size={18} />, 'Pick a route', 'Riskier routes pay more, but your crew might not make it back.'],
                        [<IconHourglass key="i" size={18} />, 'They sail (up to 9 hours)', 'One thing befalls them along the way. Higher Nav and expedition level cut the time. Check back to see how it went.'],
                        [<IconCrate key="i" size={18} />, 'Claim your loot', 'When they return, collect doubloons, gems, rare drops and Nav XP. All of it earned while you were doing something else.'],
                        [<IconSkull key="i" size={18} />, 'Crew can die', 'On dangerous routes, crew members can be lost at sea — permanently. Crew Fortune cuts the risk, all the way to zero. Deeper routes need more Fortune to sail safe.'],
                      ] as [ReactNode, string, string][]).map(([icon, title, desc]) => (
                        <div key={title} style={{ display: 'flex', gap: '0.75rem' }}>
                          <span style={{ fontSize: '1.1rem', flexShrink: 0, marginTop: 1, color: '#c8aa6a' }}>{icon}</span>
                          <div>
                            <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#d4c8a0', marginBottom: '0.2rem' }}>{title}</p>
                            <p className="font-karla" style={{ fontSize: '0.76rem', color: '#7a6a50', lineHeight: 1.5 }}>{desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── WHERE TO SEND THEM ──────────────────────────────────
                  FIVE CARDS, NOT A MAP WITH FIVE PINS ON IT.

                  The picker used to be a painted chart with a dot on each
                  route: tap a dot, a full-screen sheet came up, read it, press
                  Set Sail. Two things were wrong with that. The chart was a
                  different drawing from every other piece of art in the game
                  and read as a prop borrowed from somewhere else, and the dot
                  told you NOTHING — every route looked the same until you had
                  opened it, so choosing between five of them meant opening
                  five sheets and remembering the numbers.

                  A card can say what the sheet said. The pay, the time, the
                  risk and the drops are all on the face of it, so the five are
                  side by side and comparable without a single tap, and the tap
                  you do make is the one that sends the crew. */}

              {/* THE CREW, ONCE, ABOVE ALL FIVE. Power, Fortune and Nav are the
                  same hands whichever way you send them — what changes per
                  route is what those numbers BUY, and that is on each card.
                  Printing all three on every card would be the same figures
                  five times over. */}
              {stats && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '0.5rem 0.7rem', borderRadius: 10, marginBottom: '0.7rem',
                  background: 'rgba(8,6,3,0.55)', border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <span className="font-karla font-800 uppercase" style={{
                    fontSize: '0.5rem', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.38)', flexShrink: 0,
                  }}>
                    {savedCrew.length} aboard
                  </span>
                  {([
                    ['Power', stats.power, '#e8a0a0'],
                    ['Fortune', stats.fortune, '#f0c040'],
                    ['Nav', resolvedDeployed?.totals.dodge ?? 0, '#7dd3fc'],
                  ] as const).map(([label, value, tint]) => (
                    <span key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span className="font-karla font-700 uppercase" style={{
                        fontSize: '0.5rem', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.34)',
                      }}>{label}</span>
                      <span className="font-cinzel font-700 tabular-nums" style={{ fontSize: '0.86rem', color: tint }}>
                        {value}
                      </span>
                    </span>
                  ))}
                  <button
                    onClick={() => setInfoOpen(true)}
                    style={{
                      marginLeft: 'auto', width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      background: 'rgba(200,170,100,0.10)', border: '1px solid rgba(200,170,100,0.32)',
                      color: '#c8aa6a', fontSize: '0.7rem', fontWeight: 700,
                      cursor: 'pointer', lineHeight: 1, touchAction: 'manipulation',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    aria-label="How voyages work"
                  >?</button>
                </div>
              )}

              {/* THE 1-IN-100 IS ADVERTISED, and it belongs above the cards
                  because it is true of all five. It used to exist only after it
                  fired, so nobody knew it was possible and the first one read
                  as a confusing big number rather than a win. */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.7rem',
                padding: '0.3rem 0.55rem', borderRadius: 8,
                background: 'rgba(240,192,64,0.07)', border: '1px solid rgba(240,192,64,0.22)',
              }}>
                <span className="font-karla font-800 uppercase" style={{
                  fontSize: '0.5rem', letterSpacing: '0.14em', color: '#f0c040', flexShrink: 0,
                }}>1 in 100</span>
                <span className="font-karla" style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.35 }}>
                  Massive Booty: ten times the coin and gems, on any route.
                </span>
              </div>

              {/* A slotted crew that is away on a trawl cannot sail — said once,
                  above, so it is read before a route is chosen rather than
                  discovered on a card that will not send. */}
              {trawlingAssigned.length > 0 && (
                <p className="font-karla font-600" style={{ fontSize: '0.76rem', color: '#46c0a0', lineHeight: 1.4, marginBottom: '0.6rem' }}>
                  {trawlingAssigned.map(c => c.name).join(', ')} {trawlingAssigned.length === 1 ? 'is' : 'are'} out on a trawl and cannot sail until {trawlingAssigned.length === 1 ? 'it returns' : 'they return'}. Swap in another crew or collect the trawl first.
                </p>
              )}

              {error && (
                <p className="font-karla" style={{ fontSize: '0.84rem', color: '#f87171', marginBottom: '0.5rem' }}>{error}</p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.9rem' }}>
                {(Object.keys(ROUTE_CONFIGS) as VoyageRoute[]).map(routeKey => (
                  <RouteCard
                    key={routeKey}
                    route={routeKey}
                    stats={stats}
                    rawDodge={resolvedDeployed?.totals.dodge ?? 0}
                    crewCount={savedCrew.length}
                    crewSlots={shipStats.crewSlots}
                    expeditionXP={expeditionXP}
                    shipTier={shipTier}
                    safeVoyages={safeVoyages}
                    voyageSpeedMult={voyageSpeedMult}
                    sending={isPending}
                    onSail={() => handleSend(routeKey)}
                  />
                ))}
              </div>
            </>
          )}
          <VoyageHistory voyages={voyages} />
        </div>
      </div>
    )
  }

  // ── Away / Returned: collapsed summary with expandable log ──────────────
  if ((panelState === 'away' || panelState === 'returned') && activeVoyage) {
    const events = activeVoyage.events as VoyageEvent[]
    const voyageDurationMs = activeVoyage.duration_ms ?? BASE_VOYAGE_MS
    const elapsed = voyageDurationMs - msRemaining
    const isComplete = msRemaining === 0

    // A voyage is ONE event now, so this is no longer a drip-feed. The event
    // surfaces at 60% elapsed as a hook for anyone checking mid-trip; the loot
    // stays hidden until the crew is actually home. Revealing it at 100% would
    // mean nothing to look at for the entire voyage, and revealing it at 0%
    // would give the whole trip away the moment you set sail.
    const TEASE_AT = 0.6
    const visibleEvents = events.filter(() => elapsed >= TEASE_AT * voyageDurationMs)

    // Time until that single event surfaces, NOT a gap between events. Named
    // msToNext back when a voyage drip-fed several.
    const msToTease = !isComplete && visibleEvents.length === 0
      ? Math.max(0, TEASE_AT * voyageDurationMs - elapsed)
      : null

    const awayCrew = activeVoyage.crew_variant_ids
      .map(id => byId.get(id)).filter(Boolean) as CrewMember[]

    const routeCfg = activeVoyage.route ? ROUTE_CONFIGS[activeVoyage.route as VoyageRoute] : null

    return (
      <div>
        <div>

          {/* ── Summary ── */}
          {isComplete ? (
            /* Sealed return. Open it, see how it went, THEN see the haul. */
            (() => {
              const ev = events[0] as (VoyageEvent & { booty?: boolean; jackpot?: boolean }) | undefined
              // `jackpot` is the pre-rename field; rows written before it still pay off.
              const booty = !!(ev?.booty ?? ev?.jackpot)
              // The single event's outcome IS the voyage's outcome. It is what
              // the crew's Power earned and it swings the haul, so it leads
              // the reveal instead of hiding in the log.
              const won  = ev?.outcome === 'success'
              const lost = ev?.outcome === 'failure'
              const tone = booty ? '#f0c040' : won ? '#7fd49a' : lost ? '#e0888a' : '#c8aa6a'
              const verdict = booty ? 'The hold will not shut'
                            : won     ? 'They pulled it off'
                            : lost    ? 'It went badly'
                            :           'They made it back'
              return (
            <div style={{ textAlign: 'center' }}>
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.2em', color: '#c8aa6a' }}>
                Crew has returned
              </p>
              {routeCfg && (
                <p className="font-karla" style={{ fontSize: '0.66rem', color: routeCfg.color, marginTop: 3 }}>
                  {routeCfg.name}
                </p>
              )}

              <div style={{ height: 1, margin: '0.9rem 0', background: 'linear-gradient(90deg, transparent, rgba(240,192,64,0.28), transparent)' }} />

              {/* Fixed-height stage so opening the manifest never resizes the
                  panel under the player's thumb. */}
              <div style={{ minHeight: 142, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <AnimatePresence mode="wait">
                  {reveal === 'sealed' ? (
                    <motion.div key="sealed"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                      <motion.img
                        src="/crateclosed.png" alt="" width={78} height={78}
                        animate={{ y: [0, -5, 0] }}
                        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ width: 78, height: 78, objectFit: 'contain' }}
                      />
                      <p className="font-karla" style={{ fontSize: '0.72rem', color: '#9a8868' }}>
                        The manifest is still sealed.
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div key="opened"
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.26 }}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%' }}>
                      <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: tone, lineHeight: 1.15 }}>
                        {verdict}
                      </p>
                      {ev?.narrative && (
                        <p className="font-karla" style={{ fontSize: '0.68rem', color: '#9a8868', lineHeight: 1.45, maxWidth: 300 }}>
                          {ev.narrative}
                        </p>
                      )}
                      <AnimatePresence>
                        {reveal === 'haul' && (
                          <motion.div key="haul"
                            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, marginTop: 4 }}>
                            {booty && (
                              <p className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.22em', color: '#f0c040' }}>
                                Massive booty
                              </p>
                            )}
                            {activeVoyage.total_doubloons > 0 && (
                              <p className="font-cinzel font-700" style={{ fontSize: '2rem', color: '#f0c040', lineHeight: 1, textShadow: '0 0 26px rgba(240,192,64,0.35)' }}>
                                +{activeVoyage.total_doubloons.toLocaleString()} &#10209;
                              </p>
                            )}
                            {activeVoyage.total_gems > 0 && (
                              <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#a78bfa', lineHeight: 1 }}>
                                +{activeVoyage.total_gems} gem{activeVoyage.total_gems !== 1 ? 's' : ''}
                              </p>
                            )}
                            {activeVoyage.total_doubloons <= 0 && activeVoyage.total_gems <= 0 && (
                              <p className="font-karla" style={{ fontSize: '0.72rem', color: '#9a8868' }}>Returned empty-handed</p>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div style={{ height: 1, margin: '0.9rem 0', background: 'linear-gradient(90deg, transparent, rgba(240,192,64,0.28), transparent)' }} />

              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 620, damping: 26 }}
                onClick={() => {
                  if (reveal === 'sealed') {
                    // The press answers instantly and the verdict sits for a
                    // beat before the number lands. The server call rides along
                    // with it, so the reveal never waits on the network.
                    hapticTap()
                    setReveal('outcome')
                    window.setTimeout(() => {
                      setReveal('haul')
                      if (booty) {
                        // Longer buzz for the rare one, and the overlay lands
                        // WITH the number rather than before it, so the card
                        // still does its job underneath.
                        hapticTap()
                        setBootyOverlay(true)
                      }
                    }, 900)
                    handleClaim(false)
                    return
                  }
                  if (reveal === 'haul') setPanelState('done')
                }}
                disabled={reveal === 'outcome'}
                className="font-karla font-700 uppercase tracking-[0.12em]"
                style={{
                  width: '100%',
                  background: reveal === 'outcome' ? 'rgba(240,192,64,0.06)' : 'rgba(240,192,64,0.16)',
                  border: '1px solid rgba(240,192,64,0.45)',
                  borderRadius: 10, padding: '0.8rem 1rem',
                  color: '#f0c040',
                  cursor: reveal === 'outcome' ? 'default' : 'pointer',
                  opacity: reveal === 'outcome' ? 0.5 : 1, fontSize: '0.74rem',
                  touchAction: 'manipulation',
                }}
              >
                {reveal === 'sealed' ? 'Open the manifest' : reveal === 'outcome' ? '\u2026' : 'Take the haul \u2192'}
              </motion.button>
              {error && <p className="font-karla" style={{ fontSize: '0.62rem', color: '#f87171', marginTop: 6 }}>{error}</p>}

              {visibleEvents.length > 0 && (
                <button
                  onClick={() => setLogExpanded(v => !v)}
                  style={{ background: 'none', border: 'none', padding: 0, marginTop: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <span className="font-karla" style={{ fontSize: '0.66rem', color: '#6a7890' }}>
                    {logExpanded ? 'Hide log' : visibleEvents.length === 1 ? 'View log' : `View log · ${visibleEvents.length} events`}
                  </span>
                  <span style={{ fontSize: '0.55rem', color: '#5a6880', transform: logExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▼</span>
                </button>
              )}
            </div>
              )
            })()
          ) : (
            /* In-progress summary row. */
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#b0bee0', lineHeight: 1.2 }}>
                  Voyage underway
                </p>
                {routeCfg && (
                  <p className="font-karla" style={{ fontSize: '0.68rem', color: routeCfg.color, marginTop: 2, marginBottom: 10 }}>
                    {routeCfg.name}
                  </p>
                )}

                <div style={{ display: 'flex', gap: '1.25rem', marginBottom: 10, flexWrap: 'wrap' }}>
                  <div>
                    <p className="font-karla font-600 uppercase tracking-[0.07em]" style={{ fontSize: '0.44rem', color: '#4a5a7a', marginBottom: 2 }}>Returns in</p>
                    <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#7090b0', lineHeight: 1 }}>
                      {formatCountdown(msRemaining)}
                    </p>
                  </div>
                  {msToTease !== null && (
                    <div>
                      <p className="font-karla font-600 uppercase tracking-[0.07em]" style={{ fontSize: '0.44rem', color: '#4a5a7a', marginBottom: 2 }}>Word in</p>
                      <p className="font-cinzel font-700" style={{ fontSize: '1.0rem', color: '#5a7090', lineHeight: 1 }}>
                        {formatCountdown(msToTease)}
                      </p>
                    </div>
                  )}
                </div>

                {visibleEvents.length > 0 && (
                  <button
                    onClick={() => setLogExpanded(v => !v)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                  >
                    <span className="font-karla" style={{ fontSize: '0.68rem', color: '#4a5a70' }}>
                      {logExpanded ? 'Hide log' : visibleEvents.length === 1 ? 'View log' : `View log · ${visibleEvents.length} events`}
                    </span>
                    <span style={{ fontSize: '0.55rem', color: '#3a4a60', transform: logExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▼</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Expandable log ── */}
          {logExpanded && (
            <div style={{ marginTop: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem' }}>

              {/* Crew list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.75rem' }}>
                {awayCrew.map((c, i) => {
                  const rc = rarityColor(c.rarity)
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                      <span className="font-karla font-700 uppercase tracking-[0.07em]" style={{ fontSize: '0.52rem', color: '#6a7890', width: 46, flexShrink: 0 }}>
                        {i === 0 ? 'Captain' : 'Crew'}
                      </span>
                      <span className="font-karla font-700" style={{ fontSize: '0.82rem', color: rc }}>{c.name}</span>
                    </div>
                  )
                })}
              </div>

              {/* Event log */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {visibleEvents.map((e, i) => {
                  const isCrewLoss = e.crewVariantLost != null
                  const lostCard = isCrewLoss ? byId.get(e.crewVariantLost as number) : null
                  const s = isCrewLoss
                    ? OUTCOME_STYLES.failure
                    : (OUTCOME_STYLES[e.outcome] ?? OUTCOME_STYLES.neutral)
                  return (
                    <div key={i} style={{
                      background: s.bg,
                      border: `1px solid ${s.border}`,
                      borderLeft: `2px solid ${s.color}`,
                      borderRadius: 8, padding: '0.55rem 0.7rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: e.narrative ? '0.3rem' : 0 }}>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#e8d4b0', flex: 1 }}>{e.title}</p>
                        {(e.doubloonDelta > 0 || e.gemDelta > 0) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                            {e.doubloonDelta > 0 && (
                              <p className="font-karla font-700" style={{ fontSize: '0.76rem', color: '#f0c040' }}>+{e.doubloonDelta} ⟡</p>
                            )}
                            {e.gemDelta > 0 && (
                              <p className="font-karla font-700" style={{ fontSize: '0.74rem', color: '#a78bfa' }}>+{e.gemDelta} gem{e.gemDelta !== 1 ? 's' : ''}</p>
                            )}
                          </div>
                        )}
                        {isCrewLoss && (
                          <span className="font-karla font-700" style={{ fontSize: '0.52rem', color: '#f87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.22)', borderRadius: 4, padding: '0.12rem 0.35rem', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
                            Crew Lost
                          </span>
                        )}
                      </div>
                      <p className="font-karla" style={{ fontSize: '0.74rem', color: '#a09070', lineHeight: 1.6 }}>
                        {e.narrative.split('\n\n')[0]}
                      </p>
                      {isCrewLoss && lostCard && (
                        <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#c06060', marginTop: '0.3rem' }}>
                          {lostCard.name} — lost at sea.
                        </p>
                      )}
                      {e.baitDrop && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.3rem' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: e.baitDrop === 'golden' ? '#fde68a' : '#4ade80', flexShrink: 0 }} />
                          <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: e.baitDrop === 'golden' ? '#fde68a' : '#4ade80' }}>
                            {e.baitDrop === 'golden' ? 'Golden Lure found!' : 'Luminous Lure found!'}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <VoyageHistory voyages={voyages} />
        </div>
      </div>
    )
  }

  // ── Done: reward confirmed ────────────────────────────────────────────────
  if (panelState === 'done' && activeVoyage) {
    const earned = activeVoyage.total_doubloons
    const doneRoute = activeVoyage.route ? ROUTE_CONFIGS[activeVoyage.route as VoyageRoute] : null
    const lostCards = activeVoyage.crew_lost
      .map(id => byId.get(id))
      .filter(Boolean) as CrewMember[]

    return (
      <>
      {/* ── MASSIVE BOOTY ──────────────────────────────────────────────────
          One voyage in a hundred. Portaled to body because this panel sits
          inside transformed wrappers, and a transform ancestor makes position
          fixed anchor to the ancestor instead of the viewport.
          Transform and opacity only: the rays spin, they do not repaint. */}
      {mounted && createPortal(
        <AnimatePresence>
          {bootyOverlay && (
            <motion.div
              key="voyage-booty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setBootyOverlay(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 1300,
                background: 'rgba(4,3,1,0.88)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
              }}
            >
              <motion.div aria-hidden
                initial={{ opacity: 0, scale: 0.5, rotate: 0 }}
                animate={{ opacity: 0.55, scale: 1, rotate: 360 }}
                transition={{ opacity: { duration: 0.5 }, scale: { duration: 0.6 }, rotate: { duration: 22, repeat: Infinity, ease: 'linear' } }}
                style={{
                  position: 'absolute', width: 520, height: 520, borderRadius: '50%', pointerEvents: 'none',
                  background: 'conic-gradient(from 0deg, #f0c04000, #f0c04044, #f0c04000, #f0c04044, #f0c04000, #f0c04044, #f0c04000)',
                }}
              />
              <motion.div
                initial={{ scale: 0.8, y: 14 }} animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                onClick={e => e.stopPropagation()}
                style={{ position: 'relative', width: '100%', maxWidth: 340, textAlign: 'center' }}
              >
                <p className="font-karla font-800 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.26em', color: '#f0c040', marginBottom: 12 }}>
                  Massive booty
                </p>
                <motion.img
                  src="/goldcrateopen.png" alt="" width={150} height={150}
                  initial={{ scale: 0.4, opacity: 0, y: 18 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
                  style={{ width: 150, height: 150, objectFit: 'contain', margin: '0 auto 14px', display: 'block' }}
                />
                <p className="font-cinzel font-800" style={{ fontSize: '1.9rem', color: '#f0c040', lineHeight: 1.05, textShadow: '0 0 26px rgba(240,192,64,0.55)' }}>
                  +{(activeVoyage?.total_doubloons ?? 0).toLocaleString()} \u27E1
                </p>
                {(activeVoyage?.total_gems ?? 0) > 0 && (
                  <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#c4b5fd', marginTop: 4 }}>
                    +{activeVoyage?.total_gems} gems
                  </p>
                )}
                <p className="font-karla" style={{ fontSize: '0.72rem', color: '#a8a29a', marginTop: 10, lineHeight: 1.5 }}>
                  Ten times the haul. One voyage in a hundred seas the booty.
                </p>
                <button onClick={() => setBootyOverlay(false)} className="font-cinzel font-700 uppercase tracking-[0.1em]"
                  style={{
                    marginTop: 20, padding: '0.7rem 2rem', borderRadius: 12,
                    background: 'rgba(240,192,64,0.16)', border: '1px solid rgba(240,192,64,0.6)',
                    color: '#f0c040', fontSize: '0.78rem', cursor: 'pointer', touchAction: 'manipulation',
                  }}>
                  Haul it aboard
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <NavLevelUpOverlay info={levelUpOverlay} onDismiss={() => setLevelUpOverlay(null)} />
      <div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {/* Loot-hero header */}
          <div style={{ textAlign: 'center' }}>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.2em', color: '#c8aa6a' }}>
              Voyage Complete
            </p>
            {doneRoute && (
              <p className="font-karla" style={{ fontSize: '0.66rem', color: doneRoute.color, marginTop: 3 }}>{doneRoute.name}</p>
            )}
            <div style={{ height: 1, margin: '0.7rem 0 0.85rem', background: 'linear-gradient(90deg, transparent, rgba(240,192,64,0.28), transparent)' }} />
            {/* ── 1. THE HAUL ── The two numbers every voyage pays, together
                   at the top. Gems used to sit up here beside the doubloons,
                   which put a 3-gem trickle next to a five-figure payout as if
                   they were the same kind of reward; Nav XP was buried in a
                   list below with the crew's. Doubloons and XP are what the
                   run was FOR, so they lead. */}
            {earned > 0 || xpEarned > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                {earned > 0 && (
                  <p className="font-cinzel font-700" style={{ fontSize: '2rem', color: '#f0c040', lineHeight: 1, textShadow: '0 0 26px rgba(240,192,64,0.35)' }}>
                    +{earned.toLocaleString()} ⟡
                  </p>
                )}
                {xpEarned > 0 && (
                  <p className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: '#7fa0d0', lineHeight: 1 }}>
                    +{xpEarned.toLocaleString()} XP
                  </p>
                )}
                {levelUp && (
                  <span className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.14em', color: '#f0c040' }}>
                    Navigation Lv {levelUp.from} → {levelUp.to}
                  </span>
                )}
              </div>
            ) : (
              <p className="font-karla" style={{ fontSize: '0.72rem', color: '#9a8868' }}>The crew returned empty-handed.</p>
            )}
          </div>

          {/* ── 2. SPOILS ── Gems and anything else that dropped, in one place:
                 gems, recovered bait, and the special items. These were
                 scattered across the hero, the summary list and a run of loose
                 unlabelled rows. */}
          {(activeVoyage.total_gems > 0 || claimedBait.length > 0 || claimedTideTurner || claimedPhantomHook || claimedPerfectedSigil || claimedSkinId) && (
            <div>
              <VoyageGroupLabel color="#a78bfa">Spoils</VoyageGroupLabel>
              {(activeVoyage.total_gems > 0 || claimedBait.length > 0) && (
                <div className="app-card" style={{ padding: '0.5rem 0.9rem' }}>
                  {activeVoyage.total_gems > 0 && (
                    <VoyageSummaryRow
                      label="Gems"
                      value={`+${activeVoyage.total_gems}`}
                      valueColor="#a78bfa"
                    />
                  )}
                  {claimedBait.map(({ type, qty }) => (
                    <VoyageSummaryRow
                      key={type}
                      label="Bait recovered"
                      value={`${type === 'golden' ? 'Golden Lure' : 'Luminous Lure'} ×${qty}`}
                      valueColor={type === 'golden' ? '#fde68a' : '#7bdca0'}
                    />
                  ))}
                </div>
              )}

              {claimedTideTurner && (
                <VoyageItemRow img="/tideturner.png" accent="#a78bfa" name="Tide Turner" desc="Skip a hooked fish without breaking your perfect streak. 3 a day." />
              )}

              {claimedPhantomHook && (
                <VoyageItemRow img="/phantomhook.png" accent="#5eead4" name="Phantom Hook" desc="25% chance to save your bait on every cast." />
              )}

              {claimedPerfectedSigil && (
                <VoyageItemRow img="/perfectedsigil.png" accent="#cbd5e1" name="Perfected Sigil" desc="A bonus +10 ⟡ on every Perfect catch." />
              )}

              {claimedSkinId && (() => {
                const SKIN_NAMES: Record<string, string> = { default: 'Green', gray: 'Gray', blue: 'Blue', pink: 'Pink', sand: 'Sand', sky: 'Sky', golden: 'Golden', forest: 'Forest', mint: 'Mint' }
                const skinName = SKIN_NAMES[claimedSkinId] ?? claimedSkinId
                const prefix = claimedSkinId === 'default' ? 'fishing' : `fishing_${claimedSkinId}`
                return (
                  <VoyageItemRow
                    spriteBg={`url(/${prefix}_rest.png)`}
                    accent="#4ade80"
                    name={`${skinName} skin`}
                    desc="New character color unlocked."
                    tag="Skin unlocked · equip from profile"
                  />
                )
              })()}
            </div>
          )}

          {/* ── 3. CREW ── Their XP, on its own. It was interleaved with the
                 captain's Nav XP and the bait, so a six-hand crew buried
                 everything else in the card. */}
          {crewXP.length > 0 && (
            <div>
              <VoyageGroupLabel color="#c8aa6a">Crew</VoyageGroupLabel>
              <div className="app-card" style={{ padding: '0.6rem 0.9rem', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {crewXP.map(c => {
                  const leveled = c.newLevel > c.oldLevel
                  const prog = crewXPProgress(c.newXP)
                  const maxed = c.newLevel >= CREW_MAX_LEVEL
                  // A stat tick is the level-up a player should actually care
                  // about: it is the one that makes the hand measurably better
                  // rather than just a bigger number.
                  const tick = leveled && isStatTickLevel(c.newLevel)
                  // How much of this level the voyage itself covered, so the bar
                  // shows what THIS trip did rather than only where they landed.
                  const gainedFrac = prog.xpForLevel > 0
                    ? Math.min(prog.progress, (c.newXP - c.oldXP) / prog.xpForLevel)
                    : 0
                  return (
                    <div key={c.id}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span className="font-cinzel font-700" style={{
                          fontSize: '0.8rem', color: '#e8e4de', minWidth: 0,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {c.name}
                        </span>
                        {leveled && (
                          <span className="font-karla font-800 uppercase" style={{
                            fontSize: '0.5rem', letterSpacing: '0.14em', flexShrink: 0,
                            padding: '0.1rem 0.32rem', borderRadius: 4,
                            background: tick ? 'rgba(240,192,64,0.18)' : 'rgba(127,212,154,0.15)',
                            border: `1px solid ${tick ? 'rgba(240,192,64,0.55)' : 'rgba(127,212,154,0.45)'}`,
                            color: tick ? '#f0c040' : '#7fd49a',
                          }}>
                            {tick ? `Lv ${c.newLevel} · stat up` : `Lv ${c.newLevel}`}
                          </span>
                        )}
                        <span className="font-karla font-700 tabular-nums" style={{
                          fontSize: '0.72rem', color: leveled ? '#f0c040' : '#a78a5a',
                          marginLeft: 'auto', flexShrink: 0,
                        }}>
                          +{(c.newXP - c.oldXP).toLocaleString()} XP
                        </span>
                      </div>

                      {/* WHERE THAT XP GOT THEM. A bare "+1,440 XP" means
                          nothing on a curve where Lv 100 is a million: the bar
                          is what turns it into progress you can see. The lighter
                          segment is the part THIS voyage added. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
                        <div style={{
                          position: 'relative', flex: 1, height: 5, borderRadius: 3,
                          background: 'rgba(0,0,0,0.4)', overflow: 'hidden',
                          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
                        }}>
                          <div style={{
                            position: 'absolute', inset: 0, width: `${prog.progress * 100}%`,
                            background: leveled ? 'rgba(240,192,64,0.5)' : 'rgba(167,138,90,0.5)',
                          }} />
                          <div style={{
                            position: 'absolute', top: 0, bottom: 0,
                            left: `${Math.max(0, prog.progress - gainedFrac) * 100}%`,
                            width: `${gainedFrac * 100}%`,
                            background: leveled ? '#f0c040' : '#c8aa6a',
                          }} />
                        </div>
                        <span className="font-karla tabular-nums" style={{
                          fontSize: '0.58rem', color: 'rgba(255,255,255,0.36)', flexShrink: 0, whiteSpace: 'nowrap',
                        }}>
                          {maxed ? 'Max level' : `${prog.xpToNextLevel.toLocaleString()} to Lv ${prog.level + 1}`}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Crew lost — clear red callout, deliberately outside the three
              reward groups: it is not a reward. */}
          {lostCards.length > 0 && (
            <div style={{
              background: 'rgba(30,12,12,0.55)',
              border: '1px solid rgba(192,80,80,0.30)',
              borderRadius: 12, padding: '0.55rem 0.9rem',
            }}>
              <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.52rem', color: '#d07a7a', marginBottom: '0.25rem' }}>
                Lost at sea
              </p>
              {lostCards.map(c => (
                <p key={c.id} className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#e08a8a', lineHeight: 1.4 }}>
                  {c.name}
                </p>
              ))}
            </div>
          )}

          {/* Done — full-width footer action */}
          <button
            onClick={() => setPanelState('idle')}
            className="font-karla font-700 uppercase tracking-[0.12em] tap"
            style={{
              width: '100%',
              background: 'rgba(240,192,64,0.12)',
              border: '1px solid rgba(240,192,64,0.35)',
              borderRadius: 11, padding: '0.8rem 1rem',
              color: '#e0c078', cursor: 'pointer', fontSize: '0.74rem',
            }}
          >
            Done
          </button>
        </div>
      </div>
      </>
    )
  }

  return null
}

// ── Voyage-result helpers ─────────────────────────────────────────────────────
// Group heading for the result screen's three sections (Haul / Spoils / Crew).
// The screen used to be one undifferentiated list, so a long crew roster buried
// the bait and the gems sat up in the hero pretending to be the payout.
function VoyageGroupLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{
      fontSize: '0.52rem', color, marginBottom: '0.4rem', paddingLeft: '0.1rem',
    }}>{children}</p>
  )
}

// One consistent label↔value row for the rewards summary (Nav XP, crew XP,
// bait) so the result screen reads at a glance instead of as a stack of
// differently-styled blocks.
function VoyageSummaryRow({ label, value, sub, valueColor, strong = false }: {
  label: string
  value: string
  sub?: string
  valueColor: string
  strong?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '0.34rem 0' }}>
      <span className="font-karla font-600" style={{ fontSize: '0.74rem', color: '#9aa0ac', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexShrink: 0 }}>
        {sub && (
          <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: strong ? '#f0c040' : '#6a7280', textShadow: strong ? '0 0 8px rgba(240,192,64,0.45)' : 'none' }}>{sub}</span>
        )}
        <span className="font-cinzel font-700" style={{ fontSize: '0.84rem', color: valueColor }}>{value}</span>
      </span>
    </div>
  )
}

// A compact accent-tinted card for a rare permanent drop (Tide Turner, Phantom
// Hook, Perfected Sigil) or an unlocked skin — replaces the old full-height
// ornate cards so several can stack without dominating the screen.
function VoyageItemRow({ accent, name, desc, img, spriteBg, tag = 'Rare find · equip from gear' }: {
  accent: string
  name: string
  desc: string
  img?: string
  spriteBg?: string
  tag?: string
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 11,
      background: `${accent}10`, border: `1px solid ${accent}44`,
      borderRadius: 12, padding: '0.6rem 0.75rem',
    }}>
      <div style={{
        width: 42, height: 42, flexShrink: 0, borderRadius: 10,
        border: `1px solid ${accent}55`, boxShadow: `0 0 12px ${accent}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        ...(spriteBg
          ? { backgroundImage: spriteBg, backgroundSize: '420% auto', backgroundPosition: '60% 68%', backgroundRepeat: 'no-repeat' }
          : { background: 'rgba(0,0,0,0.25)' }),
      }}>
        {img && <img src={img} alt="" style={{ width: 32, height: 32, objectFit: 'contain', filter: `drop-shadow(0 0 6px ${accent}99)` }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.46rem', color: accent, marginBottom: 1 }}>{tag}</p>
        <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#f0ede8', lineHeight: 1.1 }}>{name}</p>
        <p className="font-karla" style={{ fontSize: '0.66rem', color: '#9aa0ac', lineHeight: 1.35, marginTop: 1 }}>{desc}</p>
      </div>
    </div>
  )
}
