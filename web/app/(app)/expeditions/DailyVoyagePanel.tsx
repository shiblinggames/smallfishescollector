'use client'

import { useState, useTransition, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'
import { resolveDeployedCrew, type DeployedCrew } from '@/lib/crewResolve'
import { RARITY_COLORS as CREW_RARITY_COLORS } from '@/lib/crewGen'
import type { CrewMember } from '@/app/(app)/crew/actions'
import type { VoyageEvent } from '@/lib/voyageRoutes'
import { ROUTE_CONFIGS, COMING_SOON_ROUTES, effectiveCrewLossChance, type VoyageRoute } from '@/lib/voyageRoutes'
import { hasSafeVoyages, gauntletVoyageSpeedMult } from '@/lib/gauntletUpgrades'
import { getBait } from '@/lib/bait'
import { getSpecialItem } from '@/lib/specialItems'
import { sendDailyVoyage, revealVoyageResults, getTrawlingCrewIds, type DailyVoyage } from './voyageActions'
import { getLevelFromXP, ROUTE_BASE_XP, VOYAGE_XP_MULT } from '@/lib/expeditionLevel'
import { BASE_VOYAGE_MS, computeVoyageDurationMs } from '@/lib/voyage'
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
  const rc = ROUTE_CONFIGS[route]
  const fortuneScale = 1 + stats.fortune / 55
  const powerScale   = 1 + stats.power   / 60
  const pDiscovery   = Math.min(1, stats.fortune / 45)
  const pWin         = Math.min(1, stats.power   / 30)

  const enc = route === 'shroud' ? 4 : route === 'triangle' ? 3 : route === 'deep' ? (crewCount >= 2 ? 5 : 4) : route === 'open' ? 2 : 0
  const dng = route === 'shroud' ? 4 : route === 'triangle' ? 3 : route === 'deep' ? 2 : route === 'open' ? (crewCount >= 2 ? 2 : 1) : 0
  const dis = route === 'shroud' ? 5 : route === 'triangle' ? 4 : 2

  const expected =
    dis * pDiscovery * 120 * fortuneScale * rc.payoutScale +
    enc * pWin * 55 * powerScale * rc.payoutScale +
    0.30 * 0.35 * 35 * rc.payoutScale

  const lootMin = Math.round(rc.baseDoubloons + expected * 0.4)
  const lootMax = Math.round(rc.baseDoubloons + expected * 1.9)

  // Flat per-voyage crew-loss chance, scaled down by total crew fortune —
  // fully zeroed once fortune matches the route's minLevel (see
  // effectiveCrewLossChance in lib/voyageRoutes). One-decimal precision so
  // partially-mitigated values don't get overstated by whole-% rounding.
  const crewRiskPct = safeVoyages
    ? 0
    : crewCount >= 2
      ? Math.round(effectiveCrewLossChance(route, stats.fortune) * 1000) / 10
      : 0

  // XP estimate — same event counts, best/worst case outcomes. Base + crew +
  // event values MUST track lib/expeditionLevel.voyageXP (single source), incl.
  // the ×VOYAGE_XP_MULT payout lift, or this preview drifts from the real grant.
  const xpBase      = ROUTE_BASE_XP[route] ?? 150
  const xpCrewBonus = crewCount * 12
  const xpMin = Math.round((xpBase + xpCrewBonus + enc * 5  + dng * 3  + dis * 4)  * VOYAGE_XP_MULT)
  const xpMax = Math.round((xpBase + xpCrewBonus + enc * 18 + dng * 14 + dis * 12) * VOYAGE_XP_MULT)

  return { lootMin, lootMax, crewRiskPct, drops: ROUTE_DROPS[route], xpMin, xpMax }
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

  const handleClaim = useCallback(() => {
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
      setPanelState('done')
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
              {/* ── Always-visible: description + info ── */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <p className="font-karla" style={{ fontSize: '0.72rem', color: '#8a7860', lineHeight: 1.55, flex: 1 }}>
                  Send your crew on a daily voyage. They return with doubloons, rare drops, and stories — but risky routes can cost you crew permanently.
                </p>
                <button
                  onClick={() => setInfoOpen(true)}
                  style={{
                    flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                    background: 'rgba(200,170,100,0.10)', border: '1px solid rgba(200,170,100,0.25)',
                    color: '#a08860', fontSize: '0.72rem', fontWeight: 700,
                    cursor: 'pointer', lineHeight: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  aria-label="How voyages work"
                >?</button>
              </div>

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
                      <button onClick={() => setInfoOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6a5a40', fontSize: '1rem', lineHeight: 1 }}>✕</button>
                    </div>
                    {/* The one thing this explainer never said, and the whole point of the
                        mode: you do not PLAY a voyage. The Campaign is where you fight. */}
                    <p className="font-karla" style={{ fontSize: '0.8rem', color: '#d8cdb4', lineHeight: 1.5, marginBottom: '0.9rem' }}>
                      Voyages are <strong style={{ color: '#f0c040' }}>passive income</strong>. You do not play them: your crew sail off on their own and come back with doubloons, gems and Nav XP whether you are here or not. The <strong style={{ color: '#dca494' }}>Campaign</strong> is the opposite, and it is where you fight the battles yourself.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      {([
                        [<IconMap key="i" size={18} />, 'Pick a route', 'Tap a location on the map. Riskier routes pay more, but your crew might not make it back.'],
                        [<IconHourglass key="i" size={18} />, 'They sail (up to 3 hours)', 'Events unfold along the way. Higher Nav and expedition level reduce voyage time. Check back to watch the story.'],
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
              <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', marginBottom: '0.75rem' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/voyagemap.png" alt="Voyage map" loading="lazy" decoding="async" style={{ width: '100%', display: 'block' }} />

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
                          padding: 0, zIndex: 3,
                        }}
                      >
                        {!isSelected && !locked && (
                          <span className="animate-ping" style={{
                            position: 'absolute', inset: -5, borderRadius: '50%',
                            background: rco.color, opacity: 0.30, display: 'block',
                          }} />
                        )}
                        <span style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: isSelected ? 22 : 16, height: isSelected ? 22 : 16,
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
                          {locked && <span style={{ color: '#c8a060', display: 'flex' }}><IconLock size={8} /></span>}
                        </span>
                        <span style={{
                          position: 'absolute', top: '100%', left: '50%',
                          transform: 'translateX(-50%)', marginTop: 6,
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

                {/* Overlay panel — fades up from the bottom when a route is selected */}
                {selectedRoute && (() => {
                  const expeditionLevel = getLevelFromXP(expeditionXP)
                  const rco = ROUTE_CONFIGS[selectedRoute]
                  const minLevel = rco.minLevel
                  const levelLockedRoute = expeditionLevel < minLevel
                  const shipLockedRoute  = shipTier < rco.minShipTier
                  const comingSoonRoute  = COMING_SOON_ROUTES.has(selectedRoute)
                  const routeLocked = levelLockedRoute || shipLockedRoute || comingSoonRoute
                  const est = stats ? computeRouteEstimate(stats, savedCrew.length, selectedRoute, safeVoyages) : null
                  return (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: 'linear-gradient(to bottom, transparent 0%, rgba(6,4,2,0.97) 18%)',
                      zIndex: 4,
                      maxHeight: '72%',
                      display: 'flex', flexDirection: 'column',
                    }}>
                      {/* Scrollable content */}
                      <div style={{ overflowY: 'auto', flex: 1, padding: '2.5rem 0.9rem 0.5rem' }}>
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem', gap: '0.5rem' }}>
                        <div>
                          <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: rco.color, lineHeight: 1.2 }}>
                            {rco.name}
                          </p>
                          <p className="font-karla" style={{ fontSize: '0.76rem', color: '#8a7860', lineHeight: 1.4, marginTop: 3 }}>
                            {rco.tagline}
                          </p>
                        </div>
                        <button
                          onClick={() => setSelectedRoute(null)}
                          style={{
                            flexShrink: 0, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
                            borderRadius: 6, width: 26, height: 26, cursor: 'pointer',
                            color: '#a09070', fontSize: '0.8rem', lineHeight: 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginTop: 2,
                          }}
                          aria-label="Close"
                        >✕</button>
                      </div>

                      {/* Stats row */}
                      {stats && (() => {
                        const expLevel = getLevelFromXP(expeditionXP)
                        // Swift Sails (Locker Upgrade) shortens the actual voyage,
                        // so the preview reflects it too.
                        const estMs = Math.round(computeVoyageDurationMs(expLevel, stats.dodge) * voyageSpeedMult)
                        const riskPct = est?.crewRiskPct ?? 0
                        const riskColor = riskPct >= 15 ? '#f87171' : riskPct >= 8 ? '#f0c040' : '#6a8a6a'
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.6rem' }}>
                            {/* Payout + time */}
                            {est && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#c8aa6a' }}>
                                  ~{est.lootMin}–{est.lootMax} ⟡
                                </span>
                                <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.7rem' }}>·</span>
                                <span className="font-karla" style={{ fontSize: '0.76rem', color: '#5a7aaa' }}>
                                  {est.xpMin}–{est.xpMax} XP
                                </span>
                                <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.7rem' }}>·</span>
                                <span className="font-karla" style={{ fontSize: '0.76rem', color: '#7a6848' }}>
                                  <IconHourglass size={11} /> {formatDuration(estMs)}
                                </span>
                                {voyageSpeedMult < 1 && (
                                  <span className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#46c0a0' }}>
                                    Swift Sails
                                  </span>
                                )}
                              </div>
                            )}
                            {/* A slotted crew that's away on a trawl can't sail —
                                say so explicitly so Set Sail never feels broken. */}
                            {trawlingAssigned.length > 0 && (
                              <span className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#46c0a0', lineHeight: 1.4 }}>
                                {trawlingAssigned.map(c => c.name).join(', ')} {trawlingAssigned.length === 1 ? 'is' : 'are'} out on a trawl and can&apos;t sail until {trawlingAssigned.length === 1 ? 'it returns' : 'they return'}. Swap in another crew or collect the trawl first.
                              </span>
                            )}
                            {/* Crew risk / crew count */}
                            {savedCrew.length < minCrew ? (
                              <span className="font-karla font-600" style={{ fontSize: '0.74rem', color: '#c87a4a' }}>
                                <IconWarning size={12} /> {minCrew === 1 ? 'Need at least 1 crew to set sail' : `Need at least ${minCrew} crew to set sail`}
                              </span>
                            ) : safeVoyages ? (
                              <span className="font-karla font-600" style={{ fontSize: '0.74rem', color: '#4ade80' }}>
                                <IconCheck size={12} /> No crew risk — Safe Passage keeps your crew safe on every route.
                              </span>
                            ) : riskPct > 0 ? (
                              <>
                                <span className="font-karla font-600" style={{ fontSize: '0.74rem', color: riskColor }}>
                                  {riskPct >= 15 ? <IconSkull size={12} /> : <IconWarning size={12} />} {riskPct}% chance crew is lost permanently
                                </span>
                                {/* Teach the mitigation: noobs should know Fortune is the
                                    survival stat, and vets should see what theirs is doing. */}
                                <span className="font-karla" style={{ fontSize: '0.66rem', color: '#7a6f5a' }}>
                                  {stats.fortune > 0
                                    ? `Your crew's ${stats.fortune} Fortune trimmed this from ${Math.round(rco.baseCrewLossChance * 100)}%. Risk-free at ${rco.minLevel} Fortune.`
                                    : `Crew Fortune trims this risk. Risk-free at ${rco.minLevel} total Fortune.`}
                                </span>
                              </>
                            ) : rco.baseCrewLossChance > 0 && savedCrew.length >= 2 ? (
                              <span className="font-karla font-600" style={{ fontSize: '0.74rem', color: '#4ade80' }}>
                                <IconCheck size={12} /> No crew risk. Your crew&apos;s {stats.fortune} Fortune covers these waters.
                              </span>
                            ) : (
                              <span className="font-karla" style={{ fontSize: '0.74rem', color: '#5a7a5a' }}>No crew risk</span>
                            )}
                          </div>
                        )
                      })()}

                      {/* Drops */}
                      {(() => {
                        const drops = est?.drops ?? ROUTE_DROPS[selectedRoute]
                        if (!drops.length) return null
                        return (
                          <div style={{ borderTop: `0.5px solid ${rco.color}22`, paddingTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.32rem', marginBottom: '0.65rem' }}>
                            <span className="font-karla uppercase tracking-[0.06em]" style={{ fontSize: '0.60rem', color: '#5a5248' }}>
                              possible drops
                            </span>
                            {drops.map(drop => {
                              const specialDef = drop.kind === 'special' ? getSpecialItem(drop.id) : null
                              const dropKey = drop.kind === 'bait' ? drop.type : drop.id
                              const color   = specialDef ? specialDef.color : getBait((drop as { type: string }).type).color
                              const name    = specialDef ? specialDef.name : getBait((drop as { type: string }).type).name
                              const image   = specialDef?.image ?? (drop.kind === 'bait' ? getBait((drop as { type: string }).type).imageUrl ?? null : null)
                              const label   = specialDef ? `Special item · ${specialDef.effectLabel}` : 'Fishing bait'
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
                                      ? <img src={image} alt={name} loading="lazy" decoding="async" style={{ width: 22, height: 22, objectFit: 'contain', flexShrink: 0, filter: `drop-shadow(0 1px 4px ${color}66)` }} />
                                      : <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: drop.kind === 'bait' ? '2px' : '50%', background: color, flexShrink: 0, boxShadow: `0 0 4px ${color}88` }} />
                                    }
                                    <span className="font-karla font-700" style={{ fontSize: '0.80rem', color, flex: 1 }}>{name}</span>
                                    <span className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#a89878' }}>{drop.rate}</span>
                                    <span style={{ fontSize: '0.52rem', color: '#5a4a30', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>▼</span>
                                  </button>
                                  {isExpanded && (
                                    <div style={{ paddingLeft: image ? '1.8rem' : '1.1rem', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                      <span className="font-karla uppercase tracking-[0.05em]" style={{ fontSize: '0.58rem', color: `${color}99`, background: `${color}18`, borderRadius: 3, padding: '0.08rem 0.28rem' }}>
                                        {label}
                                      </span>
                                      <span className="font-karla" style={{ fontSize: '0.70rem', color: '#6a5a40', lineHeight: 1.3 }}>
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
                        <p className="font-karla" style={{ fontSize: '0.78rem', color: '#f87171', marginBottom: '0.45rem' }}>{error}</p>
                      )}
                      </div>{/* end scrollable content */}

                      {/* Set Sail / Lock — always visible at bottom */}
                      <div style={{ padding: '0.4rem 0.9rem 0.75rem', flexShrink: 0 }}>
                        {routeLocked ? (
                          <div style={{
                            width: '100%', background: 'rgba(160,120,60,0.06)',
                            border: '1px solid rgba(160,120,60,0.22)', borderRadius: 8,
                            padding: '0.45rem 1rem', textAlign: 'center',
                          }}>
                            <span className="font-cinzel font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.78rem', color: '#a08858' }}>
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
                                width: '100%', borderRadius: 10, padding: '0.62rem 1rem',
                                transition: 'background 0.15s, opacity 0.15s, border-color 0.15s',
                                ...(ready
                                  ? { background: `linear-gradient(180deg, ${rco.color} 0%, ${rco.color}d0 100%)`, border: `1px solid ${rco.color}`, color: '#0d1410', cursor: 'pointer' }
                                  : isPending
                                    ? { background: `linear-gradient(180deg, ${rco.color}aa 0%, ${rco.color}70 100%)`, border: `1px solid ${rco.color}88`, color: 'rgba(13,20,16,0.72)', cursor: 'default', boxShadow: 'none' }
                                    : { background: 'rgba(80,100,120,0.10)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.34)', cursor: 'default', boxShadow: 'none' }),
                              }}
                              className="font-cinzel font-800 uppercase tracking-[0.12em]"
                            >
                              <span style={{ fontSize: '0.85rem' }}>{isPending ? 'Sending…' : 'Set Sail'}</span>
                            </motion.button>
                          )
                        })()}
                      </div>
                    </div>
                  )
                })()}
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

    const visibleEvents = events.filter((_, i) =>
      elapsed >= ((i + 1) / events.length) * voyageDurationMs
    )

    const nextIdx = visibleEvents.length
    const msToNext = !isComplete && nextIdx < events.length
      ? Math.max(0, ((nextIdx + 1) / events.length) * voyageDurationMs - elapsed)
      : null

    const awayCrew = activeVoyage.crew_variant_ids
      .map(id => byId.get(id)).filter(Boolean) as CrewMember[]

    const lootSoFar = visibleEvents.reduce((sum, e) => sum + (e.doubloonDelta ?? 0), 0)

    const routeCfg = activeVoyage.route ? ROUTE_CONFIGS[activeVoyage.route as VoyageRoute] : null

    return (
      <div>
        <div>

          {/* ── Summary ── */}
          {isComplete ? (
            /* Loot-hero: crew returned, claim the reward. */
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

              {activeVoyage.total_doubloons > 0 || activeVoyage.total_gems > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  {activeVoyage.total_doubloons > 0 && (
                    <p className="font-cinzel font-700" style={{ fontSize: '2rem', color: '#f0c040', lineHeight: 1, textShadow: '0 0 26px rgba(240,192,64,0.35)' }}>
                      +{activeVoyage.total_doubloons.toLocaleString()} ⟡
                    </p>
                  )}
                  {activeVoyage.total_gems > 0 && (
                    <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#a78bfa', lineHeight: 1 }}>
                      +{activeVoyage.total_gems} gem{activeVoyage.total_gems !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              ) : (
                <p className="font-karla" style={{ fontSize: '0.72rem', color: '#9a8868' }}>Returned empty-handed</p>
              )}

              <div style={{ height: 1, margin: '0.9rem 0', background: 'linear-gradient(90deg, transparent, rgba(240,192,64,0.28), transparent)' }} />

              <button
                onClick={handleClaim}
                disabled={isPending}
                className="font-karla font-700 uppercase tracking-[0.12em]"
                style={{
                  width: '100%',
                  background: isPending ? 'rgba(240,192,64,0.06)' : 'rgba(240,192,64,0.16)',
                  border: '1px solid rgba(240,192,64,0.45)',
                  borderRadius: 10, padding: '0.8rem 1rem',
                  color: '#f0c040', cursor: isPending ? 'default' : 'pointer',
                  opacity: isPending ? 0.5 : 1, fontSize: '0.74rem',
                }}
              >
                {isPending ? 'Claiming…' : 'Claim Loot →'}
              </button>
              {error && <p className="font-karla" style={{ fontSize: '0.62rem', color: '#f87171', marginTop: 6 }}>{error}</p>}

              {visibleEvents.length > 0 && (
                <button
                  onClick={() => setLogExpanded(v => !v)}
                  style={{ background: 'none', border: 'none', padding: 0, marginTop: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <span className="font-karla" style={{ fontSize: '0.66rem', color: '#6a7890' }}>
                    {logExpanded ? 'Hide log' : `View log · ${visibleEvents.length} event${visibleEvents.length !== 1 ? 's' : ''}`}
                  </span>
                  <span style={{ fontSize: '0.55rem', color: '#5a6880', transform: logExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▼</span>
                </button>
              )}
            </div>
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
                  {msToNext !== null && (
                    <div>
                      <p className="font-karla font-600 uppercase tracking-[0.07em]" style={{ fontSize: '0.44rem', color: '#4a5a7a', marginBottom: 2 }}>Next event</p>
                      <p className="font-cinzel font-700" style={{ fontSize: '1.0rem', color: '#5a7090', lineHeight: 1 }}>
                        {formatCountdown(msToNext)}
                      </p>
                    </div>
                  )}
                  {lootSoFar > 0 && (
                    <div>
                      <p className="font-karla font-600 uppercase tracking-[0.07em]" style={{ fontSize: '0.44rem', color: '#4a5a7a', marginBottom: 2 }}>Collected</p>
                      <p className="font-cinzel font-700" style={{ fontSize: '1.0rem', color: '#c8aa6a', lineHeight: 1 }}>
                        +{lootSoFar} ⟡
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
                      {logExpanded ? 'Hide log' : `View log · ${visibleEvents.length} event${visibleEvents.length !== 1 ? 's' : ''}`}
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
              <div className="app-card" style={{ padding: '0.5rem 0.9rem' }}>
                {crewXP.map(c => {
                  const leveled = c.newLevel > c.oldLevel
                  return (
                    <VoyageSummaryRow
                      key={c.id}
                      label={c.name}
                      value={`+${(c.newXP - c.oldXP).toLocaleString()} XP`}
                      sub={leveled ? `Lv ${c.oldLevel} → ${c.newLevel}` : undefined}
                      valueColor={leveled ? '#f0c040' : '#a78a5a'}
                      strong={leveled}
                    />
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
