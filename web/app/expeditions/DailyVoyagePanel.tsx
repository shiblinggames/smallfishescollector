'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { EXPEDITION_SHIP_STATS, RARITY_COLORS, computeTotalCrewStats, type CrewCard } from '@/lib/expeditions'
import type { VoyageEvent } from '@/lib/voyageRoutes'
import { ROUTE_CONFIGS, type VoyageRoute } from '@/lib/voyageRoutes'
import { getRingSkin, type RingSkinId } from '@/lib/ringSkins'
import { getBait } from '@/lib/bait'
import { getSpecialItem } from '@/lib/specialItems'
import { sendDailyVoyage, revealVoyageResults, fetchVoyageCaptainsLog, type DailyVoyage } from './voyageActions'
import { getLevelFromXP } from '@/lib/expeditionLevel'

type PanelState = 'idle' | 'away' | 'returned' | 'done'

const BASE_VOYAGE_MS = 6 * 60 * 60 * 1000

function computeVoyageDurationMs(expeditionLevel: number, totalNav: number): number {
  const levelReductionMs = 90 * Math.pow(expeditionLevel / 100, 2) * 60 * 1000
  const navReductionMs = Math.min(90 * 60 * 1000, 90 * Math.pow(totalNav / 75, 2) * 60 * 1000)
  return Math.max(BASE_VOYAGE_MS * 0.5, BASE_VOYAGE_MS - levelReductionMs - navReductionMs)
}

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

const EVENT_ICONS: Record<string, string> = {
  discovery: '🗺️',
  encounter: '⚔️',
  danger:    '⚡',
  weather:   '🌊',
  peaceful:  '🕊️',
}

const OUTCOME_STYLES: Record<string, { label: string; bg: string; color: string; border: string }> = {
  success: { label: 'Success',    bg: 'rgba(74,222,128,0.07)',   color: '#4ade80', border: '#4ade8033' },
  failure: { label: 'Setback',    bg: 'rgba(248,113,113,0.07)', color: '#f87171', border: '#f8717133' },
  neutral: { label: 'Uneventful', bg: 'rgba(161,155,135,0.06)', color: '#857460', border: '#85746033' },
}

function rarityColor(rarity: string): string {
  return RARITY_COLORS[(rarity ?? 'common').toLowerCase()] ?? '#8a8880'
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
}

type DropEntry =
  | { kind: 'skin';    id: RingSkinId; rate: string }
  | { kind: 'bait';    type: string;   rate: string }
  | { kind: 'special'; id: 'tide_turner' | 'phantom_hook'; rate: string }

const ROUTE_DROPS: Record<VoyageRoute, DropEntry[]> = {
  coastal: [
    { kind: 'skin', id: 'whale_bone',        rate: '~5%' },
    { kind: 'bait', type: 'luminous',        rate: '~5%' },
  ],
  open: [
    { kind: 'bait', type: 'luminous',        rate: '~10%' },
    { kind: 'bait', type: 'golden',          rate: '~5%' },
    { kind: 'skin', id: 'navigators_silver', rate: '~2%' },
  ],
  deep: [
    { kind: 'special', id: 'tide_turner',    rate: '~2%' },
    { kind: 'skin',    id: 'coral_spire',    rate: '~5%' },
    { kind: 'bait',    type: 'golden',       rate: '~8%' },
  ],
  triangle: [
    { kind: 'bait',    type: 'luminous',       rate: '~20%' },
    { kind: 'skin',    id: 'abyssal_sigil',    rate: '~5%' },
    { kind: 'special', id: 'phantom_hook',     rate: '~2%' },
  ],
}

function computeRouteEstimate(
  stats: { power: number; dodge: number; fortune: number },
  crewCount: number,
  route: VoyageRoute,
) {
  const rc = ROUTE_CONFIGS[route]
  const fortuneScale = 1 + stats.fortune / 55
  const powerScale   = 1 + stats.power   / 60
  const pDiscovery   = Math.min(1, stats.fortune / 45)
  const pWin         = Math.min(1, stats.power   / 30)
  const pDodge       = Math.min(1, stats.dodge   / 28)

  const enc = route === 'triangle' ? 3 : route === 'deep' ? (crewCount >= 2 ? 5 : 4) : route === 'open' ? 2 : 0
  const dng = route === 'triangle' ? 3 : route === 'deep' ? 2 : route === 'open' ? (crewCount >= 2 ? 2 : 1) : 0
  const dis = route === 'triangle' ? 4 : 2

  const expected =
    dis * pDiscovery * 120 * fortuneScale * rc.payoutScale +
    enc * pWin * 55 * powerScale * rc.payoutScale +
    0.30 * 0.35 * 35 * rc.payoutScale

  const lootMin = Math.round(rc.baseDoubloons + expected * 0.4)
  const lootMax = Math.round(rc.baseDoubloons + expected * 1.9)

  let crewRiskPct = 0
  if (crewCount >= 2) {
    const encRisk = enc * (1 - pWin) * Math.min(1, Math.max(0.10, 0.5 - stats.power / 60) * rc.crewLossScale)
    const dngRisk = dng * (1 - pDodge) * Math.min(1, 0.18 * rc.crewLossScale)
    crewRiskPct = Math.round(Math.min(95, (encRisk + dngRisk) * 100))
  }

  // XP estimate — same event counts, best/worst case outcomes
  const XP_BASE: Record<VoyageRoute, number> = { coastal: 30, open: 55, deep: 90, triangle: 140 }
  const xpBase      = XP_BASE[route]
  const xpCrewBonus = crewCount * 12
  const xpMin = xpBase + xpCrewBonus + enc * 5  + dng * 3  + dis * 4
  const xpMax = xpBase + xpCrewBonus + enc * 18 + dng * 14 + dis * 12

  return { lootMin, lootMax, crewRiskPct, drops: ROUTE_DROPS[route], xpMin, xpMax }
}

interface Props {
  savedCrewVariantIds: number[]
  collection: CrewCard[]
  shipTier: number
  todayVoyage: DailyVoyage | null
  readyVoyage: DailyVoyage | null
  raidActive?: boolean
  expeditionXP?: number
}

export default function DailyVoyagePanel({
  savedCrewVariantIds,
  collection,
  shipTier,
  todayVoyage,
  readyVoyage,
  raidActive = false,
  expeditionXP = 0,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const initialState: PanelState =
    todayVoyage ? 'away'
    : readyVoyage ? 'returned'
    : 'idle'

  const [panelState, setPanelState] = useState<PanelState>(initialState)
  const [activeVoyage, setActiveVoyage] = useState<DailyVoyage | null>(readyVoyage ?? todayVoyage)
  const [error, setError] = useState<string | null>(null)
  const [selectedRoute, setSelectedRoute] = useState<VoyageRoute | null>(null)
  const [claimedRingSkins, setClaimedRingSkins] = useState<string[]>([])
  const [claimedBait, setClaimedBait] = useState<{ type: string; qty: number }[]>([])
  const [claimedTideTurner, setClaimedTideTurner] = useState(false)
  const [claimedPhantomHook, setClaimedPhantomHook] = useState(false)
  const [captainsLog, setCaptainsLog] = useState<string | null>(null)
  const [liveCrewIds, setLiveCrewIds] = useState<number[]>(savedCrewVariantIds)
  const [expandedDropKey, setExpandedDropKey] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [logExpanded, setLogExpanded] = useState(false)
  const [xpEarned, setXpEarned] = useState(0)
  const [levelUp, setLevelUp] = useState<{ from: number; to: number } | null>(null)

  useEffect(() => {
    const handler = (e: Event) => setLiveCrewIds((e as CustomEvent<number[]>).detail)
    window.addEventListener('crew-changed', handler)
    return () => window.removeEventListener('crew-changed', handler)
  }, [])

  // Poll for captain's log after claiming — it's generated async so may take a few seconds
  useEffect(() => {
    if (panelState !== 'done' || !activeVoyage || captainsLog) return
    let attempts = 0
    const poll = async () => {
      if (attempts >= 5) return
      attempts++
      const res = await fetchVoyageCaptainsLog(activeVoyage.id)
      if ('log' in res && res.log) {
        setCaptainsLog(res.log)
      } else {
        setTimeout(poll, 3000)
      }
    }
    const id = setTimeout(poll, 2000)
    return () => clearTimeout(id)
  }, [panelState, activeVoyage, captainsLog])

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
  const byVariantId = new Map(collection.map(c => [c.variantId, c]))
  const savedCrew: CrewCard[] = liveCrewIds
    .slice(0, shipStats.crewSlots)
    .map(id => byVariantId.get(id))
    .filter(Boolean) as CrewCard[]

  const stats = savedCrew.length > 0 ? computeTotalCrewStats(savedCrew) : null

  const handleSend = useCallback(() => {
    if (savedCrew.length === 0 || !selectedRoute) return
    setError(null)
    startTransition(async () => {
      const res = await sendDailyVoyage(savedCrew.map(c => c.variantId), selectedRoute)
      if ('error' in res) { setError(res.error); return }
      setActiveVoyage(res.voyage)
      setPanelState('away')
    })
  }, [savedCrew, selectedRoute])

  const handleClaim = useCallback(() => {
    if (!activeVoyage) return
    setError(null)
    startTransition(async () => {
      const res = await revealVoyageResults(activeVoyage.id)
      if ('error' in res) { setError(res.error); return }
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloonTotal }))
      if (res.earnedGems > 0) window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.newGemTotal }))
      setClaimedRingSkins(res.newRingSkins)
      setClaimedBait(res.earnedBait)
      if (res.newTideTurner) setClaimedTideTurner(true)
      if (res.newPhantomHook) setClaimedPhantomHook(true)
      setXpEarned(res.xpEarned)
      if (res.newExpeditionLevel > res.oldExpeditionLevel) setLevelUp({ from: res.oldExpeditionLevel, to: res.newExpeditionLevel })
      setPanelState('done')
      router.refresh()
    })
  }, [activeVoyage, router])

  // ── Idle: send voyage ──────────────────────────────────────────────────────
  if (panelState === 'idle') {
    const hasCrew = savedCrew.length > 0
    return (
      <div>
        <div style={{
          background: 'linear-gradient(135deg, rgba(28,20,10,0.72) 0%, rgba(18,14,6,0.80) 100%)',
          border: '1px solid rgba(240,192,64,0.18)',
          borderRadius: 16, padding: '1.05rem 1.1rem',
        }}>
          {shipTier < 2 ? (
            <div>
              <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#9a8868', lineHeight: 1.5 }}>
                🔒 Requires a Sloop
              </p>
              <p className="font-karla" style={{ fontSize: '0.6rem', color: '#6a5a40', lineHeight: 1.5, marginTop: 4 }}>
                Upgrade your ship to send voyages. A solo rowboat isn&apos;t going far.
              </p>
            </div>
          ) : raidActive ? (
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#9a8868', lineHeight: 1.5 }}>
              Your crew is on a raid. Finish the raid before sending them on a voyage.
            </p>
          ) : !hasCrew ? (
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#9a8868', lineHeight: 1.5 }}>
              Save a crew in your roster above to send them on a daily voyage.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <p className="font-karla" style={{ fontSize: '0.84rem', color: '#a09070', lineHeight: 1.5, flex: 1 }}>
                  Send your crew on a voyage. They return with stories — and sometimes something worth keeping. Higher Nav and expedition level reduce the time.
                </p>
                <button
                  onClick={() => setInfoOpen(true)}
                  style={{
                    flexShrink: 0, marginTop: 2,
                    width: 22, height: 22, borderRadius: '50%',
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

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      {([
                        ['🗺️', 'Pick a route', 'Tap a location on the map. Riskier routes pay more — but your crew might not make it back.'],
                        ['⏳', 'They sail (up to 6 hours)', 'Events unfold along the way. Higher Nav and expedition level reduce voyage time. Check back to watch the story.'],
                        ['💰', 'Claim your loot', 'When they return, collect doubloons, gems, and rare drops.'],
                        ['☠️', 'Crew can die', 'On dangerous routes, crew members can be lost at sea — permanently. Choose wisely.'],
                      ] as [string, string, string][]).map(([icon, title, desc]) => (
                        <div key={title} style={{ display: 'flex', gap: '0.75rem' }}>
                          <span style={{ fontSize: '1.1rem', flexShrink: 0, marginTop: 1 }}>{icon}</span>
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

              {/* Crew list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.75rem' }}>
                {savedCrew.map((c, i) => {
                  const rc = rarityColor(c.rarity)
                  return (
                    <div key={c.variantId} style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                      <span className="font-karla font-700 uppercase tracking-[0.07em]" style={{ fontSize: '0.48rem', color: '#7a6848', width: 42, flexShrink: 0 }}>
                        {i === 0 ? 'Captain' : 'Crew'}
                      </span>
                      <span className="font-karla font-700" style={{ fontSize: '0.78rem', color: rc }}>{c.name}</span>
                    </div>
                  )
                })}
              </div>

              {/* Crew score */}
              {stats && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.9rem' }}>
                  <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.62rem', color: '#8a7860' }}>Score</span>
                  <span className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f0ede8', lineHeight: 1 }}>
                    {stats.power + stats.dodge + Math.round(stats.fortune * 0.5)}
                  </span>
                </div>
              )}

              {/* ── Voyage map ── */}
              <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', marginBottom: '0.75rem' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/voyagemap.png" alt="Voyage map" style={{ width: '100%', display: 'block' }} />

                {/* Clickable route nodes */}
                {(() => {
                  const expeditionLevel = getLevelFromXP(expeditionXP)
                  const ROUTE_MIN_LEVELS: Record<VoyageRoute, number> = { coastal: 1, open: 5, deep: 15, triangle: 25 }
                  const REC_SCORES: Record<VoyageRoute, number> = { coastal: 20, open: 20, deep: 40, triangle: 50 }
                  return (Object.keys(ROUTE_CONFIGS) as VoyageRoute[]).map(routeKey => {
                    const rco = ROUTE_CONFIGS[routeKey]
                    const node = ROUTE_NODES[routeKey]
                    const isSelected = selectedRoute === routeKey
                    const minLevel = ROUTE_MIN_LEVELS[routeKey]
                    const locked = expeditionLevel < minLevel
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
                          {locked && '🔒'}
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
                            {locked ? `Unlock at Lv ${minLevel}` : `${REC_SCORES[routeKey]}+ score`}
                          </span>
                        </span>
                      </button>
                    )
                  })
                })()}

                {/* Overlay panel — fades up from the bottom when a route is selected */}
                {selectedRoute && (() => {
                  const expeditionLevel = getLevelFromXP(expeditionXP)
                  const ROUTE_MIN_LEVELS_OVL: Record<VoyageRoute, number> = { coastal: 1, open: 5, deep: 15, triangle: 25 }
                  const minLevel = ROUTE_MIN_LEVELS_OVL[selectedRoute]
                  const routeLocked = expeditionLevel < minLevel
                  const rco = ROUTE_CONFIGS[selectedRoute]
                  const est = stats ? computeRouteEstimate(stats, savedCrew.length, selectedRoute) : null
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
                        const REC: Record<string, number> = { coastal: 20, open: 20, deep: 40, triangle: 50 }
                        const rec = REC[selectedRoute] ?? 0
                        const crewScore = stats.power + stats.dodge + Math.round(stats.fortune * 0.5)
                        const met = crewScore >= rec
                        const close = !met && crewScore >= rec * 0.75
                        const scoreColor = met ? '#4ade80' : close ? '#f0c040' : '#f87171'
                        const expLevel = getLevelFromXP(expeditionXP)
                        const estMs = computeVoyageDurationMs(expLevel, stats.dodge)
                        const riskColor = est && est.crewRiskPct >= 50 ? '#f87171' : est && est.crewRiskPct > 20 ? '#f0c040' : '#6a8a6a'
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.6rem' }}>
                            {/* Score */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ fontSize: '0.8rem', lineHeight: 1, color: scoreColor }}>{met ? '✓' : '⚠'}</span>
                              <span className="font-karla font-600" style={{ fontSize: '0.76rem', color: scoreColor }}>
                                {met
                                  ? `Score ${crewScore} — you're ready`
                                  : `Score ${crewScore} of ${rec}+ recommended`}
                              </span>
                            </div>
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
                                  ⏳ {formatDuration(estMs)}
                                </span>
                              </div>
                            )}
                            {/* Crew risk / crew count */}
                            {savedCrew.length < 2 ? (
                              <span className="font-karla font-600" style={{ fontSize: '0.74rem', color: '#c87a4a' }}>
                                ⚠ Need at least 2 crew to set sail
                              </span>
                            ) : est && est.crewRiskPct > 0 ? (
                              <span className="font-karla font-600" style={{ fontSize: '0.74rem', color: riskColor }}>
                                {est.crewRiskPct >= 50 ? '☠' : '⚠'} {est.crewRiskPct}% chance crew is lost permanently
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
                              const dropKey = drop.kind === 'skin' ? drop.id : drop.kind === 'bait' ? drop.type : drop.id
                              const color   = specialDef ? specialDef.color : drop.kind === 'skin' ? getRingSkin(drop.id).color : getBait((drop as { type: string }).type).color
                              const name    = specialDef ? specialDef.name : drop.kind === 'skin' ? getRingSkin(drop.id).name : getBait((drop as { type: string }).type).name
                              const image   = specialDef?.image ?? (drop.kind === 'skin' ? getRingSkin(drop.id).imageUrl ?? null : drop.kind === 'bait' ? getBait((drop as { type: string }).type).imageUrl ?? null : null)
                              const label   = specialDef ? `Special item · ${specialDef.effectLabel}` : drop.kind === 'skin' ? 'Ring cosmetic' : 'Fishing bait'
                              const detail  = specialDef
                                ? specialDef.description
                                : drop.kind === 'skin'
                                  ? getRingSkin(drop.id).description
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
                                      ? <img src={image} alt={name} style={{ width: 22, height: 22, objectFit: 'contain', flexShrink: 0, filter: `drop-shadow(0 1px 4px ${color}66)` }} />
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
                              🔒 Unlocks at Expedition Lv {minLevel}
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={handleSend}
                            disabled={isPending || savedCrew.length < 2}
                            style={{
                              width: '100%',
                              background: isPending || savedCrew.length < 2
                                ? 'rgba(80,100,160,0.08)'
                                : `linear-gradient(135deg, ${rco.color}33 0%, ${rco.color}18 100%)`,
                              border: `1px solid ${savedCrew.length >= 2 ? rco.color + '66' : 'rgba(255,255,255,0.08)'}`,
                              borderRadius: 8, padding: '0.45rem 1rem',
                              color: isPending || savedCrew.length < 2 ? 'rgba(255,255,255,0.18)' : rco.color,
                              cursor: isPending || savedCrew.length < 2 ? 'default' : 'pointer',
                              transition: 'all 0.15s',
                              boxShadow: savedCrew.length >= 2 && !isPending ? `0 0 12px ${rco.color}22` : 'none',
                            }}
                            className="font-cinzel font-700 uppercase tracking-[0.12em]"
                          >
                            <span style={{ fontSize: '0.78rem' }}>{isPending ? 'Sending…' : 'Set Sail'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </>
          )}
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
      .map(id => byVariantId.get(id)).filter(Boolean) as CrewCard[]

    const lootSoFar = visibleEvents.reduce((sum, e) => sum + (e.doubloonDelta ?? 0), 0)

    const routeCfg = activeVoyage.route ? ROUTE_CONFIGS[activeVoyage.route as VoyageRoute] : null

    return (
      <div>
        <div style={{
          background: 'linear-gradient(135deg, rgba(16,22,36,0.80) 0%, rgba(12,18,30,0.88) 100%)',
          border: `1px solid ${isComplete ? 'rgba(240,192,64,0.35)' : 'rgba(96,132,210,0.20)'}`,
          borderRadius: 16, padding: '1.05rem 1.1rem',
          transition: 'border-color 0.4s',
        }}>

          {/* ── Always-visible summary row ── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>

              {/* Title + route */}
              <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: isComplete ? '#f0e8cc' : '#b0bee0', lineHeight: 1.2, transition: 'color 0.4s' }}>
                {isComplete ? 'Crew has returned' : 'Voyage underway'}
              </p>
              {routeCfg && (
                <p className="font-karla" style={{ fontSize: '0.68rem', color: routeCfg.color, marginTop: 2, marginBottom: 10 }}>
                  {routeCfg.name}
                </p>
              )}

              {/* Key metrics */}
              {isComplete ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: visibleEvents.length > 0 ? 10 : 0 }}>
                  {activeVoyage.total_doubloons > 0 && (
                    <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: '#f0c040', lineHeight: 1 }}>
                      +{activeVoyage.total_doubloons} ⟡
                    </p>
                  )}
                  {activeVoyage.total_gems > 0 && (
                    <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#a78bfa', lineHeight: 1 }}>
                      +{activeVoyage.total_gems} gems
                    </p>
                  )}
                  {activeVoyage.total_doubloons === 0 && activeVoyage.total_gems === 0 && (
                    <p className="font-karla" style={{ fontSize: '0.65rem', color: '#9a8868' }}>Returned empty-handed</p>
                  )}
                </div>
              ) : (
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
              )}

              {/* Log toggle */}
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

            {/* Claim button — right side, always visible when complete */}
            {isComplete && (
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <button
                  onClick={handleClaim}
                  disabled={isPending}
                  style={{
                    background: isPending ? 'rgba(240,192,64,0.06)' : 'rgba(240,192,64,0.16)',
                    border: '1px solid rgba(240,192,64,0.40)',
                    borderRadius: 8, padding: '0.5rem 1.1rem',
                    color: '#f0c040', cursor: isPending ? 'default' : 'pointer',
                    opacity: isPending ? 0.5 : 1,
                  }}
                  className="font-karla font-700 uppercase tracking-[0.1em]"
                >
                  <span style={{ fontSize: '0.62rem' }}>{isPending ? 'Claiming…' : 'Claim Loot →'}</span>
                </button>
                {error && <p className="font-karla" style={{ fontSize: '0.6rem', color: '#f87171' }}>{error}</p>}
              </div>
            )}
          </div>

          {/* ── Expandable log ── */}
          {logExpanded && (
            <div style={{ marginTop: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem' }}>

              {/* Crew list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.75rem' }}>
                {awayCrew.map((c, i) => {
                  const rc = rarityColor(c.rarity)
                  return (
                    <div key={c.variantId} style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
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
                  const lostCard = isCrewLoss ? collection.find(c => c.variantId === e.crewVariantLost) : null
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
                      {e.narrative.split('\n\n').map((para, pi) => (
                        <p key={pi} className="font-karla" style={{
                          fontSize: '0.74rem',
                          color: pi === 0 ? '#a09070' : '#7a6a50',
                          lineHeight: 1.6,
                          fontStyle: pi > 0 ? 'italic' : 'normal',
                          marginTop: pi > 0 ? '0.3rem' : 0,
                        }}>
                          {para}
                        </p>
                      ))}
                      {isCrewLoss && lostCard && (
                        <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#c06060', marginTop: '0.3rem' }}>
                          {lostCard.name} — lost at sea.
                        </p>
                      )}
                      {e.ringSkinDrop && (() => {
                        const skin = getRingSkin(e.ringSkinDrop)
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.3rem' }}>
                            {skin.imageUrl
                              ? <img src={skin.imageUrl} alt={skin.name} style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0 }} />
                              : <div style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid ${skin.stroke}`, flexShrink: 0 }} />
                            }
                            <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: skin.color }}>
                              Ring skin found: {skin.name}
                            </p>
                          </div>
                        )
                      })()}
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

        </div>
      </div>
    )
  }

  // ── Done: reward confirmed ────────────────────────────────────────────────
  if (panelState === 'done' && activeVoyage) {
    const earned = activeVoyage.total_doubloons
    const lostCards = activeVoyage.crew_lost
      .map(id => collection.find(c => c.variantId === id))
      .filter(Boolean) as CrewCard[]

    return (
      <div>
        <div style={{
          background: 'linear-gradient(135deg, rgba(28,20,10,0.72) 0%, rgba(18,14,6,0.80) 100%)',
          border: '1px solid rgba(240,192,64,0.18)',
          borderRadius: 16, padding: '1.05rem 1.1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: lostCards.length > 0 ? '0.85rem' : 0 }}>
            <div>
              <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#9a8868', marginBottom: 4 }}>
                Voyage complete
              </p>
              {earned > 0 || activeVoyage.total_gems > 0 ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
                  {earned > 0 && (
                    <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f0c040', lineHeight: 1 }}>
                      +{earned} ⟡
                    </p>
                  )}
                  {activeVoyage.total_gems > 0 && (
                    <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#a78bfa', lineHeight: 1 }}>
                      +{activeVoyage.total_gems} gems
                    </p>
                  )}
                </div>
              ) : (
                <p className="font-karla" style={{ fontSize: '0.7rem', color: '#9a8868' }}>
                  The crew returned empty-handed.
                </p>
              )}
            </div>
            <button
              onClick={() => setPanelState('idle')}
              style={{
                flexShrink: 0,
                background: 'rgba(240,192,64,0.07)',
                border: '1px solid rgba(240,192,64,0.16)',
                borderRadius: 8, padding: '0.38rem 0.85rem',
                color: '#a08860', cursor: 'pointer',
              }}
              className="font-karla font-700 uppercase tracking-[0.1em]"
            >
              <span style={{ fontSize: '0.58rem' }}>Done</span>
            </button>
          </div>

          {claimedRingSkins.length > 0 && (
            <div style={{
              background: 'rgba(74,154,154,0.07)',
              border: '1px solid rgba(74,154,154,0.22)',
              borderRadius: 8, padding: '0.55rem 0.8rem',
            }}>
              <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.44rem', color: '#4a9a9a', marginBottom: '0.3rem' }}>
                New cosmetic{claimedRingSkins.length > 1 ? 's' : ''} unlocked
              </p>
              {claimedRingSkins.map(id => {
                const skin = getRingSkin(id)
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                    {skin.imageUrl
                      ? <img src={skin.imageUrl} alt={skin.name} style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />
                      : <div style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid ${skin.stroke}`, flexShrink: 0 }} />
                    }
                    <p className="font-cinzel font-700" style={{ fontSize: '0.75rem', color: skin.color, lineHeight: 1.3 }}>
                      {skin.name}
                    </p>
                  </div>
                )
              })}
            </div>
          )}

          {claimedBait.length > 0 && (
            <div style={{
              background: 'rgba(74,222,128,0.05)',
              border: '1px solid rgba(74,222,128,0.2)',
              borderRadius: 8, padding: '0.55rem 0.8rem',
            }}>
              <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.44rem', color: '#4ade80', marginBottom: '0.3rem' }}>
                Bait recovered
              </p>
              {claimedBait.map(({ type, qty }) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: type === 'golden' ? '#fde68a' : '#4ade80', flexShrink: 0 }} />
                  <p className="font-cinzel font-700" style={{ fontSize: '0.75rem', color: type === 'golden' ? '#fde68a' : '#4ade80', lineHeight: 1.3 }}>
                    {type === 'golden' ? 'Golden Lure' : 'Luminous Lure'} ×{qty}
                  </p>
                </div>
              ))}
            </div>
          )}

          {claimedTideTurner && (
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 20, delay: 0.15 }}
              style={{
                position: 'relative', overflow: 'hidden',
                background: 'linear-gradient(135deg, rgba(109,40,217,0.22) 0%, rgba(139,92,246,0.12) 60%, rgba(76,29,149,0.18) 100%)',
                border: '1px solid rgba(167,139,250,0.5)',
                borderRadius: 16,
                padding: '1.1rem 1.1rem 1rem',
                boxShadow: '0 0 32px rgba(139,92,246,0.25), inset 0 1px 0 rgba(255,255,255,0.07)',
              }}
            >
              {/* Background glow orb */}
              <div style={{
                position: 'absolute', top: -30, right: -20,
                width: 120, height: 120, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(139,92,246,0.35) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />

              <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.52rem', color: '#c4b5fd', marginBottom: '0.65rem', letterSpacing: '0.2em' }}>
                ✦ Rare find ✦
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <motion.img
                  src="/tideturner.png"
                  alt="Tide Turner"
                  initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 16, delay: 0.3 }}
                  style={{
                    width: 64, height: 64, objectFit: 'contain', flexShrink: 0,
                    filter: 'drop-shadow(0 0 16px rgba(167,139,250,0.8)) drop-shadow(0 0 32px rgba(139,92,246,0.5))',
                  }}
                />
                <div style={{ flex: 1 }}>
                  <motion.p
                    className="font-cinzel font-700"
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    style={{ fontSize: '1.05rem', color: '#e9d5ff', lineHeight: 1.1, marginBottom: 4, textShadow: '0 0 20px rgba(167,139,250,0.6)' }}
                  >
                    Tide Turner
                  </motion.p>
                  <motion.p
                    className="font-karla font-300"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: 0.55 }}
                    style={{ fontSize: '0.7rem', color: '#a78bfa', lineHeight: 1.45 }}
                  >
                    Skip a hooked fish during the catch phase without breaking your perfect streak. Grants 3 skips per day.
                  </motion.p>
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: 0.7 }}
                    style={{ marginTop: 6 }}
                  >
                    <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.54rem', color: '#7c3aed', background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 4, padding: '0.15rem 0.45rem' }}>
                      Permanent · Equip from gear
                    </span>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}

          {claimedPhantomHook && (
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 20, delay: 0.15 }}
              style={{
                position: 'relative', overflow: 'hidden',
                background: 'linear-gradient(135deg, rgba(13,100,96,0.22) 0%, rgba(45,212,191,0.10) 60%, rgba(6,78,59,0.18) 100%)',
                border: '1px solid rgba(45,212,191,0.45)',
                borderRadius: 16,
                padding: '1.1rem 1.1rem 1rem',
                boxShadow: '0 0 32px rgba(45,212,191,0.20), inset 0 1px 0 rgba(255,255,255,0.07)',
              }}
            >
              <div style={{
                position: 'absolute', top: -30, right: -20,
                width: 120, height: 120, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(45,212,191,0.28) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />

              <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.52rem', color: '#5eead4', marginBottom: '0.65rem', letterSpacing: '0.2em' }}>
                ✦ Rare find ✦
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <motion.img
                  src="/phantomhook.png"
                  alt="Phantom Hook"
                  initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 16, delay: 0.3 }}
                  style={{
                    width: 64, height: 64, objectFit: 'contain', flexShrink: 0,
                    filter: 'drop-shadow(0 0 16px rgba(45,212,191,0.8)) drop-shadow(0 0 32px rgba(13,188,155,0.5))',
                  }}
                />
                <div style={{ flex: 1 }}>
                  <motion.p
                    className="font-cinzel font-700"
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    style={{ fontSize: '1.05rem', color: '#ccfbf1', lineHeight: 1.1, marginBottom: 4, textShadow: '0 0 20px rgba(45,212,191,0.5)' }}
                  >
                    Phantom Hook
                  </motion.p>
                  <motion.p
                    className="font-karla font-300"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: 0.55 }}
                    style={{ fontSize: '0.7rem', color: '#5eead4', lineHeight: 1.45 }}
                  >
                    25% chance to save your bait on every cast. Stacks with perfect-catch saves.
                  </motion.p>
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: 0.7 }}
                    style={{ marginTop: 6 }}
                  >
                    <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.54rem', color: '#0d9488', background: 'rgba(45,212,191,0.12)', border: '1px solid rgba(45,212,191,0.28)', borderRadius: 4, padding: '0.15rem 0.45rem' }}>
                      Permanent · Equip from gear
                    </span>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}

          {/* XP earned */}
          {xpEarned > 0 && (() => {
            const newXP = expeditionXP + xpEarned
            const currentLevel = getLevelFromXP(newXP)
            return (
              <div style={{
                background: 'rgba(70,90,140,0.10)', border: '1px solid rgba(112,144,192,0.22)',
                borderRadius: 8, padding: '0.6rem 0.8rem',
                marginTop: '0.55rem',
                display: 'flex', alignItems: 'center', gap: '0.6rem',
              }}>
                <div style={{ flexShrink: 0, textAlign: 'center' }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#7090c0', lineHeight: 1 }}>{currentLevel}</p>
                  <p className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.42rem', color: '#4a5a7a', marginTop: 1 }}>Nav</p>
                </div>
                <div style={{ flex: 1 }}>
                  {levelUp && (
                    <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#7090c0', marginBottom: 3 }}>
                      Level up! {levelUp.from} → {levelUp.to}
                    </p>
                  )}
                  <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#5a7aaa' }}>+{xpEarned} expedition XP</p>
                </div>
              </div>
            )
          })()}

          {/* Captain's log */}
          <div style={{
            background: 'rgba(16,12,6,0.55)',
            border: '1px solid rgba(160,140,90,0.18)',
            borderRadius: 8, padding: '0.65rem 0.8rem',
            marginTop: '0.55rem',
          }}>
            <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.44rem', color: '#7a6848', marginBottom: '0.35rem' }}>
              Captain&apos;s Log
            </p>
            {captainsLog ? (
              <p className="font-karla" style={{ fontSize: '0.64rem', color: '#c8b890', lineHeight: 1.7, fontStyle: 'italic' }}>
                &ldquo;{captainsLog}&rdquo;
              </p>
            ) : (
              <p className="font-karla" style={{ fontSize: '0.60rem', color: '#4a4030', lineHeight: 1.5, fontStyle: 'italic' }}>
                The captain is still writing…
              </p>
            )}
          </div>

          {lostCards.length > 0 && (
            <div style={{
              background: 'rgba(20,10,10,0.60)',
              border: '1px solid rgba(180,40,40,0.22)',
              borderRadius: 8, padding: '0.55rem 0.8rem',
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              marginTop: '0.55rem',
            }}>
              <div>
                <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.46rem', color: '#9a4848', marginBottom: '0.2rem' }}>
                  Lost at sea
                </p>
                {lostCards.map(c => (
                  <p key={c.variantId} className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#c06060', lineHeight: 1.3 }}>
                    {c.name}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}
