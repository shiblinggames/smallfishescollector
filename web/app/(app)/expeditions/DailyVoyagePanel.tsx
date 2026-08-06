'use client'

import { useState, useTransition, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react'
import CloseButton from '@/components/CloseButton'
import { motion, AnimatePresence } from 'framer-motion'
import { hapticTap } from '@/lib/haptics'
import { createPortal } from 'react-dom'
import { lockBodyScroll } from '@/lib/bodyScrollLock'
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
import { IconMap, IconSwords, IconBolt, IconWave, IconGull, IconHourglass, IconCrate, IconSkull, IconLock, IconWarning, IconCheck } from '@/components/GameIcons'

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

// Percentage positions on voyagemap.png — tweak to reposition nodes
const ROUTE_NODES: Record<VoyageRoute, { x: number; y: number }> = {
  coastal:  { x: 20, y: 17 },
  open:     { x: 63, y: 32 },
  deep:     { x: 28, y: 43 },
  triangle: { x: 45, y: 59 },
  // Far edge of the chart — sits past the Triangle to read as
  // "beyond the maps". Adjust if it collides with another node visually.
  shroud:   { x: 68, y: 75 },
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
  const [selectedRoute, setSelectedRoute] = useState<VoyageRoute | null>(null)
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

  useEffect(() => {
    if (!selectedRoute) return
    return lockBodyScroll()
  }, [selectedRoute])
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
  const [expandedDropKey, setExpandedDropKey] = useState<string | null>(null)
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
  const minCrew = selectedRoute === 'coastal' ? 1 : Math.min(2, shipStats.crewSlots)
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

  const handleSend = useCallback(() => {
    if (savedCrew.length === 0 || !selectedRoute) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await sendDailyVoyage(selectedRoute)
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
  }, [savedCrew, selectedRoute, router])

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
              Save a crew in your roster above to send them on a daily voyage.
            </p>
          ) : (
            <>
              {/* The blurb that used to sit here is gone — the map says "pick a
                  route" better than a paragraph did, and everything it explained
                  is in the "?" (now pinned to the map's top corner). */}

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
                        [<IconMap key="i" size={18} />, 'Pick a route', 'Tap a location on the map. Riskier routes pay more, but your crew might not make it back.'],
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

              {/* ── Voyage map ── */}
              {/* No background of its own. The chart is a torn parchment with
                  alpha all round its deckled edge, and what shows through is the
                  MODAL's dusk-sea plate. Giving this box its own copy would put a
                  second, differently-scaled crop of the same art right up against
                  the first and seam along the tear. */}
              <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', marginBottom: '0.75rem' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/voyagemap.png" alt="Voyage map" loading="lazy" decoding="async" style={{ width: '100%', display: 'block' }} />

                <button
                  onClick={() => setInfoOpen(true)}
                  style={{
                    position: 'absolute', top: 8, right: 8, zIndex: 5,
                    width: 24, height: 24, borderRadius: '50%',
                    // Opaque-ish base: this one sits on painted art, not a panel.
                    background: 'rgba(10,7,3,0.72)', border: '1px solid rgba(200,170,100,0.35)',
                    color: '#c8aa6a', fontSize: '0.74rem', fontWeight: 700,
                    cursor: 'pointer', lineHeight: 1, touchAction: 'manipulation',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  aria-label="How voyages work"
                >?</button>

                {/* Clickable route nodes */}
                {(() => {
                  const expeditionLevel = getLevelFromXP(expeditionXP)
                  return (Object.keys(ROUTE_CONFIGS) as VoyageRoute[]).map(routeKey => {
                    const rco = ROUTE_CONFIGS[routeKey]
                    const node = ROUTE_NODES[routeKey]
                    const isSelected = selectedRoute === routeKey
                    const minLevel = rco.minLevel
                    const levelLocked = expeditionLevel < minLevel
                    const shipLocked  = shipTier < rco.minShipTier
                    const comingSoon  = COMING_SOON_ROUTES.has(routeKey)
                    const locked      = levelLocked || shipLocked || comingSoon
                    return (
                      <button
                        key={routeKey}
                        onClick={() => setSelectedRoute(isSelected ? null : routeKey)}
                        style={{
                          position: 'absolute',
                          left: `${node.x}%`, top: `${node.y}%`,
                          transform: 'translate(-50%, -50%)',
                          background: 'none', border: 'none',
                          cursor: 'pointer',
                          // The dot used to BE the button, so the tap target was
                          // 16px. Padding makes the hit area ~48px without
                          // changing what is drawn; touchAction stops a tap on
                          // the map being read as the start of a scroll.
                          // Selected sits above its siblings so the bigger dot and
                          // its label are never painted over by a later node.
                          padding: 13, zIndex: isSelected ? 4 : 3, touchAction: 'manipulation',
                        }}
                      >
                        {/* Ping and dot share a wrapper sized to the DOT. Without
                            it the ping's inset:-5 would resolve against the
                            button's padding box and bloom to ~58px. */}
                        <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {!isSelected && !locked && (
                          <span className="animate-ping" style={{
                            position: 'absolute', inset: -5, borderRadius: '50%',
                            background: rco.color, opacity: 0.30, display: 'block',
                          }} />
                        )}
                        <span style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: isSelected ? 28 : 22, height: isSelected ? 28 : 22,
                          borderRadius: '50%',
                          background: locked ? 'rgba(30,22,14,0.85)' : isSelected ? rco.color : `${rco.color}cc`,
                          border: locked ? '2px solid rgba(160,120,60,0.45)' : isSelected ? '2.5px solid rgba(255,255,255,0.95)' : '2px solid rgba(255,255,255,0.55)',
                          boxShadow: locked ? 'none' : isSelected
                            ? `0 0 0 4px ${rco.color}44, 0 0 14px ${rco.color}`
                            : `0 0 7px ${rco.color}99`,
                          transition: 'all 0.15s',
                          position: 'relative',
                          fontSize: locked ? '0.44rem' : undefined,
                        }}>
                          {locked && <span style={{ color: '#c8a060', display: 'flex' }}><IconLock size={10} /></span>}
                        </span>
                        </span>
                        <span style={{
                          position: 'absolute', top: '100%', left: '50%',
                          // -7 cancels the button's new 13px padding and keeps the
                          // label the same 6px under the dot it always sat at.
                          transform: 'translateX(-50%)', marginTop: -7,
                          whiteSpace: 'nowrap', pointerEvents: 'none',
                          background: locked ? 'rgba(8,4,2,0.92)' : isSelected ? 'rgba(4,2,0,0.92)' : 'rgba(4,2,0,0.80)',
                          borderRadius: 6,
                          padding: '0.12rem 0.3rem 0.1rem',
                          border: locked
                            ? '1px solid rgba(160,120,60,0.35)'
                            : `1px solid ${isSelected ? rco.color + '66' : 'rgba(255,255,255,0.12)'}`,
                          boxShadow: isSelected ? `0 0 10px ${rco.color}33` : 'none',
                        }}>
                          <span className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: locked ? '#a08858' : isSelected ? rco.color : '#d4c8a8', display: 'block', lineHeight: 1.2 }}>
                            {rco.name}
                          </span>
                          <span className="font-karla uppercase tracking-[0.06em]" style={{ fontSize: '0.56rem', color: locked ? '#c8a060' : isSelected ? `${rco.color}bb` : '#6a5a40', display: 'block', textAlign: 'center', marginTop: 1, fontWeight: locked ? 700 : undefined }}>
                            {comingSoon ? 'Coming soon' : shipLocked ? 'Requires a Sloop' : levelLocked ? `Unlock at Lv ${minLevel}` : rco.riskLabel}
                          </span>
                        </span>
                      </button>
                    )
                  })
                })()}

                {/* The route sheet is a PORTAL modal, rendered below rather than
                    an overlay inside this box. It used to live in the chart,
                    clamped to 72% of the map's height, and that ceiling was what
                    forced every number on it down to 0.7rem. Out here it takes
                    the raid boss card's shape instead: a painted header band,
                    the route name at a size you can read across a room, and a
                    body with room to breathe. */}

              </div>
      {/* ── ROUTE SHEET ───────────────────────────────────────────────────
          Shaped after the raid boss card, which is the treatment that works on
          this screen: a painted band you read the place off, the name over it
          at size, then the numbers. Portalled to the body because the chart box
          is `overflow: hidden` and would clip it, and because a fixed sheet is
          not bound by how tall the map happens to render. */}
      {/* No AnimatePresence: it cannot see through a portal boundary to run an
          exit, and every other sheet on this screen (see RaidsSection) portals
          bare for the same reason. The sheet animates IN and closes at once. */}
      {selectedRoute && mounted && createPortal(
          (() => {
            const expeditionLevel = getLevelFromXP(expeditionXP)
            const rco = ROUTE_CONFIGS[selectedRoute]
            const minLevel = rco.minLevel
            const levelLockedRoute = expeditionLevel < minLevel
            const shipLockedRoute  = shipTier < rco.minShipTier
            const comingSoonRoute  = COMING_SOON_ROUTES.has(selectedRoute)
            const routeLocked = levelLockedRoute || shipLockedRoute || comingSoonRoute
            const est = stats ? computeRouteEstimate(stats, savedCrew.length, selectedRoute, safeVoyages) : null
            return (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: 0.16 }}
                onClick={() => setSelectedRoute(null)}
                style={{
                  position: 'fixed', inset: 0, zIndex: 2200,
                  background: 'rgba(0,0,0,0.62)',
                  backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '1.1rem',
                }}
              >
                <motion.div
                  onClick={e => e.stopPropagation()}
                  initial={{ opacity: 0, scale: 0.96, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: [0.2, 0.8, 0.3, 1] }}
                  style={{
                    width: '100%', maxWidth: 430, maxHeight: '88vh',
                    display: 'flex', flexDirection: 'column',
                    // Solid base, not a tint: this sheet floats over painted art
                    // and a translucent panel would read as a grey film.
                    background: '#0a0704',
                    borderRadius: 16, overflow: 'hidden',
                    border: `1px solid ${rco.color}44`,
                    boxShadow: `0 26px 64px rgba(0,0,0,0.72), 0 0 44px ${rco.color}1c`,
                  }}
                >
                  {/* ── The band ──
                      The art is 9:16 PORTRAIT, painted to the campaign's own
                      format (820x1468, horizon high, near-black foot), so a wide
                      band shows a horizontal slice of it. Position at 24% to
                      land on the part that carries the place: the horizon, its
                      focal landmark and the tops of the framing rocks. */}
                  <div style={{ position: 'relative', height: 220, flexShrink: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={rco.image} alt="" aria-hidden
                      style={{
                        position: 'absolute', inset: 0, width: '100%', height: '100%',
                        objectFit: 'cover', objectPosition: 'center 24%',
                        filter: routeLocked ? 'grayscale(0.85) brightness(0.5)' : undefined,
                      }}
                    />
                    {/* Scrim to the sheet's own base, so the band has no seam
                        where it meets the body. */}
                    <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,7,4,0.12) 0%, rgba(10,7,4,0.10) 46%, rgba(10,7,4,0.86) 82%, #0a0704 100%)' }} />
                    <button
                      type="button" onClick={() => setSelectedRoute(null)} aria-label="Close"
                      style={{
                        position: 'absolute', top: 11, right: 11, width: 32, height: 32,
                        borderRadius: '50%', padding: 0, cursor: 'pointer',
                        background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.2)',
                        color: '#e6e0d4', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        touchAction: 'manipulation',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                    <span
                      className="font-karla font-800 uppercase tracking-[0.12em]"
                      style={{
                        position: 'absolute', top: 14, left: 14,
                        fontSize: '0.56rem', padding: '0.3rem 0.62rem', borderRadius: 999,
                        color: routeLocked ? '#c8b28a' : rco.color,
                        background: routeLocked ? 'rgba(0,0,0,0.5)' : `${rco.color}22`,
                        border: `1px solid ${routeLocked ? 'rgba(200,178,138,0.4)' : `${rco.color}77`}`,
                        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
                      }}
                    >
                      {comingSoonRoute ? 'Coming soon' : routeLocked ? 'Locked' : rco.riskLabel}
                    </span>
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 1.15rem 0.75rem' }}>
                      <p className="font-cinzel font-800" style={{ fontSize: '1.5rem', lineHeight: 1.08, color: '#fff', textShadow: `0 2px 12px rgba(0,0,0,0.92), 0 0 22px ${rco.color}33` }}>
                        {rco.name}
                      </p>
                      <p className="font-karla" style={{ fontSize: '0.9rem', color: '#b0a08a', lineHeight: 1.4, marginTop: 4 }}>
                        {rco.tagline}
                      </p>
                    </div>
                  </div>

                  {/* ── The numbers (scrolls) ── */}
                  <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '0.95rem 1.15rem 0.6rem' }}>
            {/* Stats row */}
            {stats && (() => {
              const expLevel = getLevelFromXP(expeditionXP)
              // Swift Sails (Locker Upgrade) shortens the actual voyage,
              // so the preview reflects it too.
              // Duration uses the RAW crew dodge, not the scorePct-boosted stats above.
              // The server computes it from raw dodge when it stamps duration_ms, so
              // feeding the boosted figure here showed anyone with Pathfinder, Shanty
              // Singer or Flagship a shorter voyage than they actually got.
              const rawDodge = resolvedDeployed?.totals.dodge ?? 0
              const estMs = Math.round(computeVoyageDurationMs(expLevel, rawDodge, selectedRoute ?? undefined) * voyageSpeedMult)
              const riskPct = est?.crewRiskPct ?? 0
              const crewRiskPct = riskPct
              const riskColor = riskPct >= 15 ? '#f87171' : riskPct >= 8 ? '#f0c040' : '#6a8a6a'
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.42rem', marginBottom: '0.85rem' }}>
                  {/* Payout + time */}
                  {est && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span className="font-karla font-700" style={{ fontSize: '1.05rem', color: '#c8aa6a' }}>
                        ~{est.lootMin.toLocaleString()}–{est.lootMax.toLocaleString()} ⟡
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.7rem' }}>·</span>
                      <span className="font-karla" style={{ fontSize: '0.92rem', color: '#5a7aaa' }}>
                        {est.xpMin.toLocaleString()}–{est.xpMax.toLocaleString()} XP
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.7rem' }}>·</span>
                      <span className="font-karla" style={{ fontSize: '0.92rem', color: '#7a6848' }}>
                        <IconHourglass size={11} /> {formatDuration(estMs)}
                      </span>
                      {voyageSpeedMult < 1 && (
                        <span className="font-karla font-600" style={{ fontSize: '0.8rem', color: '#46c0a0' }}>
                          Swift Sails
                        </span>
                      )}
                    </div>
                  )}

                  {/* THE 1-IN-100 IS ADVERTISED.
                      It used to exist only after it fired, so a player had no
                      idea it was possible and the first one would have read as
                      a confusing big number rather than a win. A chance nobody
                      knows about cannot create any anticipation, which is the
                      entire point of having one. */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '0.3rem 0.5rem', borderRadius: 8,
                    background: 'rgba(240,192,64,0.07)',
                    border: '1px solid rgba(240,192,64,0.22)',
                  }}>
                    <span className="font-karla font-800 uppercase" style={{
                      fontSize: '0.5rem', letterSpacing: '0.14em', color: '#f0c040', flexShrink: 0,
                    }}>
                      1 in 100
                    </span>
                    <span className="font-karla" style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.35 }}>
                      Massive Booty: ten times the coin and gems.
                    </span>
                  </div>

                  {/* WHAT EACH STAT ACTUALLY DOES.
                      Three cause-and-effect lines rather than three bare
                      numbers. A player can read "Power 60 -> 63% triumph" and
                      learn the rule; they cannot learn anything from a lone
                      "63%" sitting under the word Triumph, and they certainly
                      cannot learn it from a haul multiplier that never names
                      the stat driving it.

                      Every figure here is live, so swapping a hand moves the
                      right line and the connection teaches itself. */}
                  {est && stats && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {([
                        {
                          stat: 'Power', value: stats.power, tint: '#e8a0a0',
                          effect: `${est.triumphPct}% triumph`,
                          detail: `${est.setbackPct}% setback`,
                          detailTint: undefined,
                          why: `Decides how the voyage goes. A triumph pays ${OUTCOME_MULT.triumph}x, a setback ${OUTCOME_MULT.setback}x.`,
                        },
                        {
                          stat: 'Fortune', value: stats.fortune, tint: '#f0c040',
                          effect: `haul ×${fortuneScale(stats.fortune).toFixed(2)}`,
                          // Carries the crew-risk read AND the target to beat.
                          // This used to be two more rows further down the panel
                          // saying the same thing in a sentence.
                          detail: safeVoyages ? 'Safe Passage'
                                : crewRiskPct > 0 ? `${crewRiskPct}% risk · safe at ${rco.minLevel}`
                                : 'no crew risk',
                          // Permadeath must not read as grey footnote text.
                          detailTint: safeVoyages ? '#4ade80'
                                    : crewRiskPct >= 8 ? riskColor
                                    : crewRiskPct > 0 ? '#c8aa6a'
                                    : '#6a8a6a',
                          why: `Scales everything you bring home, and buys down the chance of losing a hand. This route is risk-free at ${rco.minLevel} total Fortune.`,
                        },
                        {
                          stat: 'Nav', value: rawDodge, tint: '#7dd3fc',
                          effect: formatDuration(estMs),
                          detail: `from ${formatDuration(ROUTE_VOYAGE_MS[selectedRoute ?? 'open'])}`,
                          detailTint: undefined,
                          why: 'Shortens the voyage. Caps at 10% off, and your Nav level takes another 10%.',
                        },
                      ] as const).map(row => (
                        <div key={row.stat} title={row.why} style={{
                          display: 'flex', alignItems: 'baseline', gap: 8,
                          padding: '0.32rem 0.5rem', borderRadius: 8,
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                        }}>
                          <span className="font-karla font-800 uppercase" style={{
                            fontSize: '0.52rem', letterSpacing: '0.14em',
                            color: 'rgba(255,255,255,0.4)', width: 46, flexShrink: 0,
                          }}>
                            {row.stat}
                          </span>
                          <span className="font-cinzel font-700 tabular-nums" style={{
                            fontSize: '0.85rem', color: row.tint, width: 34, flexShrink: 0,
                          }}>
                            {row.value}
                          </span>
                          <span aria-hidden style={{ color: 'rgba(255,255,255,0.22)', fontSize: '0.7rem', flexShrink: 0 }}>→</span>
                          <span className="font-karla font-700" style={{
                            fontSize: '0.76rem', color: '#e8e4de', whiteSpace: 'nowrap',
                          }}>
                            {row.effect}
                          </span>
                          <span className="font-karla font-600" style={{
                            fontSize: '0.62rem',
                            color: row.detailTint ?? 'rgba(255,255,255,0.34)',
                            marginLeft: 'auto', whiteSpace: 'nowrap',
                          }}>
                            {row.detail}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* A slotted crew that's away on a trawl can't sail —
                      say so explicitly so Set Sail never feels broken. */}
                  {trawlingAssigned.length > 0 && (
                    <span className="font-karla font-600" style={{ fontSize: '0.88rem', color: '#46c0a0', lineHeight: 1.4 }}>
                      {trawlingAssigned.map(c => c.name).join(', ')} {trawlingAssigned.length === 1 ? 'is' : 'are'} out on a trawl and can&apos;t sail until {trawlingAssigned.length === 1 ? 'it returns' : 'they return'}. Swap in another crew or collect the trawl first.
                    </span>
                  )}
                  {/* Only the BLOCKER stays. The crew-risk read moved up into
                      the Fortune row, which already had a slot for it: it used
                      to spend two full rows here restating a number that was
                      six pixels away, and a whole sentence teaching a target
                      that now sits in the same line as the risk itself.
                      A high risk still shouts, in red, on that row. */}
                  {savedCrew.length < minCrew && (
                    <span className="font-karla font-600" style={{ fontSize: '0.92rem', color: '#c87a4a' }}>
                      <IconWarning size={12} /> {minCrew === 1 ? 'Need at least 1 crew to set sail' : `Need at least ${minCrew} crew to set sail`}
                    </span>
                  )}
                </div>
              )
            })()}

            {/* Drops */}
            {(() => {
              const drops = est?.drops ?? ROUTE_DROPS[selectedRoute]
              if (!drops.length) return null
              return (
                <div style={{ borderTop: `0.5px solid ${rco.color}22`, paddingTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '0.7rem' }}>
                  <span className="font-karla uppercase tracking-[0.06em]" style={{ fontSize: '0.68rem', color: '#5a5248' }}>
                    possible drops
                  </span>
                  {drops.map(drop => {
                    const specialDef = drop.kind === 'special' ? getSpecialItem(drop.id) : null
                    const dropKey = drop.kind === 'bait' ? drop.type : drop.id
                    const color   = specialDef ? specialDef.color : getBait((drop as { type: string }).type).color
                    const name    = specialDef ? specialDef.name : getBait((drop as { type: string }).type).name
                    const image   = specialDef?.image ?? (drop.kind === 'bait' ? getBait((drop as { type: string }).type).imageUrl ?? null : null)
                    // One word. The pill says what KIND of drop this is and
                    // nothing more: the name is already on the row above it and
                    // the effect is spelled out in the detail line beside it, so
                    // "Special item · Doubles your next catch" was saying the
                    // same thing twice at twice the width.
                    const label   = specialDef ? 'Special' : 'Bait'
                    const detail  = specialDef
                      ? specialDef.description
                      : (() => {
                          const b = getBait((drop as { type: string }).type) as import('@/lib/bait').BaitDef
                          const parts: string[] = []
                          if (b.waitMult < 1) parts.push(`${Math.round((1 - b.waitMult) * 100)}% faster bite`)
                          if (b.catchZoneBonus > 0) parts.push(`+${b.catchZoneBonus}° catch zone`)
                          return parts.join(' · ')
                        })()
                    const isExpanded = expandedDropKey === dropKey
                    return (
                      <div key={dropKey}>
                        <button
                          onClick={() => setExpandedDropKey(isExpanded ? null : dropKey)}
                          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.45rem' }}
                        >
                          {image
                            ? <img src={image} alt={name} loading="lazy" decoding="async" style={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0, filter: `drop-shadow(0 1px 4px ${color}66)` }} />
                            : <span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: drop.kind === 'bait' ? '2px' : '50%', background: color, flexShrink: 0, boxShadow: `0 0 4px ${color}88` }} />
                          }
                          <span className="font-karla font-700" style={{ fontSize: '0.98rem', color, flex: 1 }}>{name}</span>
                          <span className="font-karla font-700" style={{ fontSize: '0.86rem', color: '#a89878' }}>{drop.rate}</span>
                          <span style={{ fontSize: '0.62rem', color: '#5a4a30', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>▼</span>
                        </button>
                        {isExpanded && (
                          <div style={{ paddingLeft: image ? '1.8rem' : '1.1rem', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span className="font-karla uppercase tracking-[0.05em]" style={{ fontSize: '0.68rem', color: `${color}99`, background: `${color}18`, borderRadius: 3, padding: '0.08rem 0.28rem' }}>
                              {label}
                            </span>
                            <span className="font-karla" style={{ fontSize: '0.84rem', color: '#6a5a40', lineHeight: 1.4 }}>
                              {detail}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* Error */}
            {error && (
              <p className="font-karla" style={{ fontSize: '0.9rem', color: '#f87171', marginBottom: '0.45rem' }}>{error}</p>
            )}
                  </div>


            {/* Set Sail / Lock — always visible at bottom */}
            <div style={{ padding: '0.75rem 1.15rem 1rem', flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(8,6,3,0.96)' }}>
              {routeLocked ? (
                <div style={{
                  width: '100%', background: 'rgba(160,120,60,0.06)',
                  border: '1px solid rgba(160,120,60,0.22)', borderRadius: 8,
                  padding: '0.62rem 1rem', textAlign: 'center',
                }}>
                  <span className="font-cinzel font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.9rem', color: '#a08858' }}>
                    <IconLock size={12} /> {comingSoonRoute ? 'Coming soon' : shipLockedRoute ? 'Requires a Sloop or better' : `Unlocks at Expedition Lv ${minLevel}`}
                  </span>
                </div>
              ) : (() => {
                // Three clearly-distinct states so a READY button never
                // reads as disabled: a bold filled CTA when you can sail,
                // a dimmed "working" fill while sending, a muted slab only
                // when the crew genuinely can't go.
                const ready = !isPending && savedCrew.length >= minCrew
                return (
                  <motion.button
                    onClick={handleSend}
                    disabled={isPending || savedCrew.length < minCrew}
                    whileTap={ready ? { scale: 0.96 } : undefined}
                    animate={ready ? { boxShadow: [
                      `0 3px 13px ${rco.color}3d, inset 0 1px 0 rgba(255,255,255,0.35)`,
                      `0 4px 22px ${rco.color}82, inset 0 1px 0 rgba(255,255,255,0.35)`,
                      `0 3px 13px ${rco.color}3d, inset 0 1px 0 rgba(255,255,255,0.35)`,
                    ] } : {}}
                    transition={ready ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : {}}
                    style={{
                      width: '100%', borderRadius: 10, padding: '0.78rem 1rem',
                      transition: 'background 0.15s, opacity 0.15s, border-color 0.15s',
                      ...(ready
                        ? { background: `linear-gradient(180deg, ${rco.color} 0%, ${rco.color}d0 100%)`, border: `1px solid ${rco.color}`, color: '#0d1410', cursor: 'pointer' }
                        : isPending
                          ? { background: `linear-gradient(180deg, ${rco.color}aa 0%, ${rco.color}70 100%)`, border: `1px solid ${rco.color}88`, color: 'rgba(13,20,16,0.72)', cursor: 'default', boxShadow: 'none' }
                          : { background: 'rgba(80,100,120,0.10)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.34)', cursor: 'default', boxShadow: 'none' }),
                    }}
                    className="font-cinzel font-800 uppercase tracking-[0.12em]"
                  >
                    <span style={{ fontSize: '1rem' }}>{isPending ? 'Sending…' : 'Set Sail'}</span>
                  </motion.button>
                )
              })()}
      </div>
                </motion.div>
              </motion.div>
            )
          })(),
        document.body,
      )}

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
