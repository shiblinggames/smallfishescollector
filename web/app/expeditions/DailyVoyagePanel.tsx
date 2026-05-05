'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { EXPEDITION_SHIP_STATS, RARITY_COLORS, computeTotalCrewStats, type CrewCard } from '@/lib/expeditions'
import type { VoyageEvent } from '@/lib/voyageEvents'
import { ROUTE_CONFIGS, type VoyageRoute } from '@/lib/voyageEvents'
import { getRingSkin, type RingSkinId } from '@/lib/ringSkins'
import { getBait } from '@/lib/bait'
import { sendDailyVoyage, revealVoyageResults, fetchVoyageCaptainsLog, type DailyVoyage } from './voyageActions'
import { getLevelFromXP } from '@/lib/expeditionLevel'

type PanelState = 'idle' | 'away' | 'returned' | 'done'

const VOYAGE_DURATION_MS = 6 * 60 * 60 * 1000

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
  coastal: { x: 20, y: 17 },
  open:    { x: 63, y: 37 },
  deep:    { x: 28, y: 43 },
}

type DropEntry = { kind: 'skin'; id: RingSkinId; rate: string } | { kind: 'bait'; type: string; rate: string }

const ROUTE_DROPS: Record<VoyageRoute, DropEntry[]> = {
  coastal: [
    { kind: 'skin', id: 'whale_bone',        rate: '~5%' },
  ],
  open: [
    { kind: 'skin', id: 'coral_spire',       rate: '~5%' },
    { kind: 'skin', id: 'navigators_silver', rate: '~2%' },
    { kind: 'bait', type: 'luminous',        rate: '~10%' },
  ],
  deep: [
    { kind: 'skin', id: 'gilded_compass',    rate: '~8%' },
    { kind: 'skin', id: 'abyssal_sigil',     rate: '~3%' },
    { kind: 'bait', type: 'luminous',        rate: '~25%' },
    { kind: 'bait', type: 'golden',          rate: '~5%' },
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

  const enc = route === 'deep' ? (crewCount >= 2 ? 5 : 4) : route === 'open' ? 2 : 0
  const dng = route === 'deep' ? 2 : route === 'open' ? (crewCount >= 2 ? 2 : 1) : 0
  const dis = 2

  const expected =
    dis * pDiscovery * 120 * fortuneScale * rc.payoutScale +
    enc * pWin * 55 * powerScale * rc.payoutScale +
    0.30 * 0.35 * 35 * rc.payoutScale

  const lootMin = Math.round(expected * 0.4)
  const lootMax = Math.round(expected * 1.9)

  let crewRiskPct = 0
  if (crewCount >= 2) {
    const encRisk = enc * (1 - pWin) * Math.min(1, Math.max(0.10, 0.5 - stats.power / 60) * rc.crewLossScale)
    const dngRisk = dng * (1 - pDodge) * Math.min(1, 0.18 * rc.crewLossScale)
    crewRiskPct = Math.round(Math.min(95, (encRisk + dngRisk) * 100))
  }

  // XP estimate — same event counts, best/worst case outcomes
  const XP_BASE: Record<VoyageRoute, number> = { coastal: 30, open: 55, deep: 90 }
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
  const [captainsLog, setCaptainsLog] = useState<string | null>(null)
  const [liveCrewIds, setLiveCrewIds] = useState<number[]>(savedCrewVariantIds)
  const [expandedDropKey, setExpandedDropKey] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
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
    ? new Date(activeVoyage.created_at).getTime() + VOYAGE_DURATION_MS
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
                  Send your crew on a 6-hour voyage. They return with stories — and sometimes something worth keeping.
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
                        ['⏳', 'They sail for 6 hours', 'Events unfold along the way. Check back to watch the story as it happens.'],
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

              {/* Crew stats */}
              {stats && (
                <div style={{ display: 'flex', gap: '1.1rem', marginBottom: '0.9rem' }}>
                  {([['PWR', stats.power], ['DGE', stats.dodge], ['FTN', stats.fortune]] as [string, number][]).map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
                      <span className="font-karla" style={{ fontSize: '0.72rem', color: '#8a7860', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
                      <span className="font-karla font-700" style={{ fontSize: '0.95rem', color: '#c8aa6a' }}>{val}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Voyage map ── */}
              <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', marginBottom: '0.75rem' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/voyagemap.png" alt="Voyage map" style={{ width: '100%', display: 'block' }} />

                {/* Clickable route nodes */}
                {(Object.keys(ROUTE_CONFIGS) as VoyageRoute[]).map(routeKey => {
                  const rco = ROUTE_CONFIGS[routeKey]
                  const node = ROUTE_NODES[routeKey]
                  const isSelected = selectedRoute === routeKey
                  return (
                    <button
                      key={routeKey}
                      onClick={() => setSelectedRoute(isSelected ? null : routeKey)}
                      style={{
                        position: 'absolute',
                        left: `${node.x}%`, top: `${node.y}%`,
                        transform: 'translate(-50%, -50%)',
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        zIndex: 3,
                      }}
                    >
                      {!isSelected && (
                        <span className="animate-ping" style={{
                          position: 'absolute', inset: -5, borderRadius: '50%',
                          background: rco.color, opacity: 0.30, display: 'block',
                        }} />
                      )}
                      <span style={{
                        display: 'block',
                        width: isSelected ? 22 : 16, height: isSelected ? 22 : 16,
                        borderRadius: '50%',
                        background: isSelected ? rco.color : `${rco.color}cc`,
                        border: isSelected ? '2.5px solid rgba(255,255,255,0.95)' : '2px solid rgba(255,255,255,0.55)',
                        boxShadow: isSelected
                          ? `0 0 0 4px ${rco.color}44, 0 0 14px ${rco.color}`
                          : `0 0 7px ${rco.color}99`,
                        transition: 'all 0.15s',
                        position: 'relative',
                      }} />
                      <span style={{
                        position: 'absolute', top: '100%', left: '50%',
                        transform: 'translateX(-50%)', marginTop: 6,
                        whiteSpace: 'nowrap', pointerEvents: 'none',
                        background: isSelected ? 'rgba(4,2,0,0.92)' : 'rgba(4,2,0,0.80)',
                        borderRadius: 6,
                        padding: '0.12rem 0.3rem 0.1rem',
                        border: `1px solid ${isSelected ? rco.color + '66' : 'rgba(255,255,255,0.12)'}`,
                        boxShadow: isSelected ? `0 0 10px ${rco.color}33` : 'none',
                      }}>
                        <span className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: isSelected ? rco.color : '#d4c8a8', display: 'block', lineHeight: 1.2 }}>
                          {rco.name}
                        </span>
                        <span className="font-karla uppercase tracking-[0.06em]" style={{ fontSize: '0.56rem', color: isSelected ? `${rco.color}bb` : '#6a5a40', display: 'block', textAlign: 'center', marginTop: 1 }}>
                          {rco.riskLabel}
                        </span>
                      </span>
                    </button>
                  )
                })}

                {/* Overlay panel — fades up from the bottom when a route is selected */}
                {selectedRoute && stats && (() => {
                  const rco = ROUTE_CONFIGS[selectedRoute]
                  const est = computeRouteEstimate(stats, savedCrew.length, selectedRoute)
                  return (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: 'linear-gradient(to bottom, transparent 0%, rgba(6,4,2,0.97) 18%)',
                      padding: '2.5rem 0.9rem 0.85rem',
                      zIndex: 4,
                      maxHeight: '72%',
                      overflowY: 'auto',
                    }}>
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.2rem', gap: '0.5rem' }}>
                        <div>
                          <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: rco.color, lineHeight: 1.2 }}>
                            {rco.name}
                          </p>
                          <span className="font-karla font-700 uppercase tracking-[0.07em]" style={{ fontSize: '0.62rem', color: `${rco.color}bb` }}>
                            {rco.riskLabel}
                          </span>
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
                      <p className="font-karla" style={{ fontSize: '0.78rem', color: '#8a7860', lineHeight: 1.4, marginBottom: '0.65rem' }}>
                        {rco.tagline}
                      </p>

                      {/* Recommended crew score */}
                      {(() => {
                        const REC: Record<string, number> = { coastal: 20, open: 45, deep: 75 }
                        const rec = REC[selectedRoute] ?? 0
                        const crewScore = stats.power + stats.dodge + Math.round(stats.fortune * 0.5)
                        const met = crewScore >= rec
                        const close = !met && crewScore >= rec * 0.75
                        const color = met ? '#4ade80' : close ? '#f0c040' : '#f87171'
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
                            <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>{met ? '✓' : '⚠'}</span>
                            <span className="font-karla font-600" style={{ fontSize: '0.8rem', color }}>
                              {met ? `Your score of ${crewScore} meets the recommended ${rec}+` : `Recommended score: ${rec}+ (yours: ${crewScore})`}
                            </span>
                          </div>
                        )
                      })()}

                      {/* Estimates */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                        <span className="font-karla font-700" style={{ fontSize: '0.84rem', color: '#c8aa6a' }}>
                          Est. payout: ~{est.lootMin}–{est.lootMax} ⟡
                        </span>
                        <span className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#5a7aaa' }}>
                          ~{est.xpMin}–{est.xpMax} XP
                        </span>
                        {savedCrew.length >= 2 ? (
                          <span className="font-karla" style={{ fontSize: '0.80rem', color: est.crewRiskPct >= 40 ? '#f87171cc' : est.crewRiskPct > 0 ? '#c8906a' : '#6a8a6a' }}>
                            {est.crewRiskPct === 0 ? 'No crew risk' : `${est.crewRiskPct}% crew risk`}
                          </span>
                        ) : (
                          <span className="font-karla" style={{ fontSize: '0.80rem', color: '#c87a4a' }}>Need 1 more crew</span>
                        )}
                      </div>

                      {/* Crew risk warning */}
                      {savedCrew.length >= 2 && est.crewRiskPct > 50 && (
                        <div style={{ background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 7, padding: '0.4rem 0.6rem', marginBottom: '0.5rem' }}>
                          <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: '#f87171', lineHeight: 1.5 }}>
                            ⚠ {est.crewRiskPct}% chance a crew member is lost permanently.
                          </p>
                        </div>
                      )}

                      {/* Drops */}
                      {est.drops.length > 0 && (
                        <div style={{ borderTop: `0.5px solid ${rco.color}22`, paddingTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.32rem', marginBottom: '0.65rem' }}>
                          <span className="font-karla uppercase tracking-[0.06em]" style={{ fontSize: '0.60rem', color: '#5a5248' }}>
                            possible drops
                          </span>
                          {est.drops.map(drop => {
                            const dropKey = drop.kind === 'skin' ? drop.id : drop.type
                            const def    = drop.kind === 'skin' ? getRingSkin(drop.id) : getBait(drop.type)
                            const color  = def.color
                            const name   = def.name
                            const label  = drop.kind === 'skin' ? 'Ring cosmetic' : 'Fishing bait'
                            const detail = drop.kind === 'skin'
                              ? def.description
                              : (() => {
                                  const b = def as import('@/lib/bait').BaitDef
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
                                  <span style={{
                                    display: 'inline-block', width: 8, height: 8,
                                    borderRadius: drop.kind === 'skin' ? '50%' : '2px',
                                    background: color, flexShrink: 0,
                                    boxShadow: `0 0 4px ${color}88`,
                                  }} />
                                  <span className="font-karla font-700" style={{ fontSize: '0.80rem', color, flex: 1 }}>{name}</span>
                                  <span className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#a89878' }}>{drop.rate}</span>
                                  <span style={{ fontSize: '0.52rem', color: '#5a4a30', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>▼</span>
                                </button>
                                {isExpanded && (
                                  <div style={{ paddingLeft: '1.1rem', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
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
                      )}

                      {/* Error */}
                      {error && (
                        <p className="font-karla" style={{ fontSize: '0.78rem', color: '#f87171', marginBottom: '0.45rem' }}>{error}</p>
                      )}

                      {/* Set Sail */}
                      <button
                        onClick={handleSend}
                        disabled={isPending || savedCrew.length < 2}
                        style={{
                          width: '100%',
                          background: isPending || savedCrew.length < 2 ? 'rgba(240,192,64,0.05)' : 'rgba(240,192,64,0.18)',
                          border: `1px solid ${savedCrew.length >= 2 ? 'rgba(240,192,64,0.45)' : 'rgba(240,192,64,0.15)'}`,
                          borderRadius: 10, padding: '0.6rem 1rem',
                          color: isPending || savedCrew.length < 2 ? 'rgba(240,192,64,0.30)' : '#f0c040',
                          cursor: isPending || savedCrew.length < 2 ? 'default' : 'pointer',
                          transition: 'all 0.15s',
                        }}
                        className="font-cinzel font-700 uppercase tracking-[0.12em]"
                      >
                        <span style={{ fontSize: '0.92rem' }}>{isPending ? 'Sending…' : 'Set Sail'}</span>
                      </button>
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

  // ── Away / Returned: live activity log ────────────────────────────────────
  if ((panelState === 'away' || panelState === 'returned') && activeVoyage) {
    const events = activeVoyage.events as VoyageEvent[]
    const elapsed = VOYAGE_DURATION_MS - msRemaining
    const isComplete = msRemaining === 0

    // Event i reveals at (i+1)/total * voyageDuration — evenly spaced, last at voyage end
    const visibleEvents = events.filter((_, i) =>
      elapsed >= ((i + 1) / events.length) * VOYAGE_DURATION_MS
    )

    // Time until next event
    const nextIdx = visibleEvents.length
    const msToNext = !isComplete && nextIdx < events.length
      ? Math.max(0, ((nextIdx + 1) / events.length) * VOYAGE_DURATION_MS - elapsed)
      : null

    const awayCrew = activeVoyage.crew_variant_ids
      .map(id => byVariantId.get(id)).filter(Boolean) as CrewCard[]

    return (
      <div>
        <div style={{
          background: 'linear-gradient(135deg, rgba(16,22,36,0.80) 0%, rgba(12,18,30,0.88) 100%)',
          border: `1px solid ${isComplete ? 'rgba(240,192,64,0.35)' : 'rgba(96,132,210,0.20)'}`,
          borderRadius: 16, padding: '1.05rem 1.1rem',
          transition: 'border-color 0.4s',
        }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.8rem' }}>
            <div>
              <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: isComplete ? '#f0e8cc' : '#b0bee0', lineHeight: 1.2, transition: 'color 0.4s' }}>
                {isComplete ? 'Crew has returned' : 'Voyage underway'}
              </p>
              {activeVoyage.route && (() => {
                const routeCfg = ROUTE_CONFIGS[activeVoyage.route as VoyageRoute]
                return routeCfg ? (
                  <p className="font-karla" style={{ fontSize: '0.56rem', color: routeCfg.color, marginTop: 2 }}>
                    {routeCfg.name}
                  </p>
                ) : null
              })()}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: 5 }}>
                {awayCrew.map((c, i) => {
                  const rc = rarityColor(c.rarity)
                  return (
                    <div key={c.variantId} style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                      <span className="font-karla font-700 uppercase tracking-[0.07em]" style={{ fontSize: '0.44rem', color: '#6a7890', width: 42, flexShrink: 0 }}>
                        {i === 0 ? 'Captain' : 'Crew'}
                      </span>
                      <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: rc }}>{c.name}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: isComplete ? '#f0c040' : '#6080b0', opacity: 0.7 }} />
          </div>

          {/* Activity log */}
          {visibleEvents.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '0.8rem' }}>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: e.narrative ? '0.25rem' : 0 }}>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#e8d4b0', flex: 1 }}>{e.title}</p>
                      {(e.doubloonDelta > 0 || e.gemDelta > 0) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                          {e.doubloonDelta > 0 && (
                            <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#f0c040' }}>
                              +{e.doubloonDelta} ⟡
                            </p>
                          )}
                          {e.gemDelta > 0 && (
                            <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#a78bfa' }}>
                              +{e.gemDelta} gem{e.gemDelta !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                      )}
                      {isCrewLoss && (
                        <span className="font-karla font-700" style={{ fontSize: '0.44rem', color: '#f87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.22)', borderRadius: 4, padding: '0.12rem 0.35rem', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
                          Crew Lost
                        </span>
                      )}
                    </div>
                    {e.narrative.split('\n\n').map((para, pi) => (
                      <p key={pi} className="font-karla" style={{
                        fontSize: '0.62rem',
                        color: pi === 0 ? '#a09070' : '#7a6a50',
                        lineHeight: 1.55,
                        fontStyle: pi > 0 ? 'italic' : 'normal',
                        marginTop: pi > 0 ? '0.3rem' : 0,
                      }}>
                        {para}
                      </p>
                    ))}
                    {isCrewLoss && lostCard && (
                      <p className="font-karla font-700" style={{ fontSize: '0.58rem', color: '#c06060', marginTop: '0.3rem' }}>
                        {lostCard.name} — lost at sea.
                      </p>
                    )}
                    {e.ringSkinDrop && (() => {
                      const skin = getRingSkin(e.ringSkinDrop)
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.3rem' }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid ${skin.stroke}`, flexShrink: 0 }} />
                          <p className="font-karla font-700" style={{ fontSize: '0.58rem', color: skin.color }}>
                            Ring skin found: {skin.name}
                          </p>
                        </div>
                      )
                    })()}
                    {e.baitDrop && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.3rem' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: e.baitDrop === 'golden' ? '#fde68a' : '#4ade80', flexShrink: 0 }} />
                        <p className="font-karla font-700" style={{ fontSize: '0.58rem', color: e.baitDrop === 'golden' ? '#fde68a' : '#4ade80' }}>
                          {e.baitDrop === 'golden' ? 'Golden Lure found!' : 'Luminous Lure found!'}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer: countdown / next-event / claim */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.7rem' }}>
            {isComplete ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                <div>
                  {activeVoyage.total_doubloons > 0 || activeVoyage.total_gems > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
                      {activeVoyage.total_doubloons > 0 && (
                        <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#f0c040', lineHeight: 1 }}>
                          +{activeVoyage.total_doubloons} ⟡
                        </p>
                      )}
                      {activeVoyage.total_gems > 0 && (
                        <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#a78bfa', lineHeight: 1 }}>
                          +{activeVoyage.total_gems} gems
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="font-karla" style={{ fontSize: '0.65rem', color: '#9a8868' }}>
                      Returned empty-handed
                    </p>
                  )}
                  {error && <p className="font-karla" style={{ fontSize: '0.6rem', color: '#f87171', marginTop: 4 }}>{error}</p>}
                </div>
                <button
                  onClick={handleClaim}
                  disabled={isPending}
                  style={{
                    flexShrink: 0,
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
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
                {msToNext !== null ? (
                  <p className="font-karla" style={{ fontSize: '0.58rem', color: '#6a7890' }}>
                    Next event in <span style={{ color: '#7090c0', fontWeight: 700 }}>{formatCountdown(msToNext)}</span>
                  </p>
                ) : (
                  <div />
                )}
                <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#7090b0', letterSpacing: '0.03em' }}>
                  {formatCountdown(msRemaining)}
                </p>
              </div>
            )}
          </div>

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
                    <div style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid ${skin.stroke}`, flexShrink: 0 }} />
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
