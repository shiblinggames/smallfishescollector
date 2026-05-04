'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { EXPEDITION_SHIP_STATS, RARITY_COLORS, computeTotalCrewStats, type CrewCard } from '@/lib/expeditions'
import type { VoyageEvent } from '@/lib/voyageEvents'
import { ROUTE_CONFIGS, type VoyageRoute } from '@/lib/voyageEvents'
import { getRingSkin, type RingSkinId } from '@/lib/ringSkins'
import { sendDailyVoyage, revealVoyageResults, type DailyVoyage } from './voyageActions'

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

const ROUTE_SKINS: Record<VoyageRoute, RingSkinId[]> = {
  coastal: ['whale_bone'],
  open:    ['coral_spire', 'navigators_silver'],
  deep:    ['gilded_compass', 'abyssal_sigil'],
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

  return { lootMin, lootMax, crewRiskPct, skinIds: ROUTE_SKINS[route] }
}

interface Props {
  savedCrewVariantIds: number[]
  collection: CrewCard[]
  shipTier: number
  todayVoyage: DailyVoyage | null
  readyVoyage: DailyVoyage | null
  raidActive?: boolean
}

export default function DailyVoyagePanel({
  savedCrewVariantIds,
  collection,
  shipTier,
  todayVoyage,
  readyVoyage,
  raidActive = false,
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
  const [liveCrewIds, setLiveCrewIds] = useState<number[]>(savedCrewVariantIds)

  useEffect(() => {
    const handler = (e: Event) => setLiveCrewIds((e as CustomEvent<number[]>).detail)
    window.addEventListener('crew-changed', handler)
    return () => window.removeEventListener('crew-changed', handler)
  }, [])

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
              <p className="font-karla" style={{ fontSize: '0.66rem', color: '#a09070', lineHeight: 1.5, marginBottom: '0.85rem' }}>
                Send your crew on a 6-hour voyage. They return with stories — and sometimes something worth keeping.
              </p>

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
                      <span className="font-karla" style={{ fontSize: '0.56rem', color: '#8a7860', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
                      <span className="font-karla font-700" style={{ fontSize: '0.75rem', color: '#c8aa6a' }}>{val}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Route selection */}
              <div style={{ marginBottom: '0.85rem' }}>
                <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.46rem', color: '#7a6848', marginBottom: '0.45rem' }}>
                  Choose a route
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {(Object.keys(ROUTE_CONFIGS) as VoyageRoute[]).map(routeKey => {
                    const rco = ROUTE_CONFIGS[routeKey]
                    const isSelected = selectedRoute === routeKey
                    const est = stats ? computeRouteEstimate(stats, savedCrew.length, routeKey) : null
                    return (
                      <button
                        key={routeKey}
                        onClick={() => setSelectedRoute(routeKey)}
                        style={{
                          background: isSelected ? `${rco.color}14` : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${isSelected ? rco.color + '55' : 'rgba(255,255,255,0.10)'}`,
                          borderRadius: 9, padding: '0.55rem 0.7rem',
                          cursor: 'pointer', textAlign: 'left',
                          transition: 'background 0.12s, border-color 0.12s',
                        }}
                      >
                        {/* Top row: name + risk label */}
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.76rem', color: isSelected ? rco.color : '#c0b8a8', lineHeight: 1.2 }}>
                            {rco.name}
                          </p>
                          <p className="font-karla font-700 uppercase tracking-[0.07em]" style={{ fontSize: '0.44rem', color: isSelected ? rco.color : '#6a6460', flexShrink: 0 }}>
                            {rco.riskLabel}
                          </p>
                        </div>

                        {/* Tagline */}
                        <p className="font-karla" style={{ fontSize: '0.58rem', color: '#8a7860', lineHeight: 1.4, marginTop: 2 }}>
                          {rco.tagline}
                        </p>

                        {/* Estimates row */}
                        {est && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.45rem', flexWrap: 'wrap' }}>
                            {/* Loot range */}
                            <span className="font-karla font-600" style={{ fontSize: '0.60rem', color: isSelected ? '#c8aa6a' : '#7a6848' }}>
                              ~{est.lootMin}–{est.lootMax} ⟡
                            </span>

                            {/* Crew risk */}
                            {savedCrew.length >= 2 ? (
                              <span className="font-karla" style={{ fontSize: '0.58rem', color: est.crewRiskPct >= 40 ? '#f87171cc' : est.crewRiskPct > 0 ? '#c8906a' : '#6a8a6a' }}>
                                {est.crewRiskPct === 0 ? 'No crew risk' : `${est.crewRiskPct}% crew risk`}
                              </span>
                            ) : (
                              <span className="font-karla" style={{ fontSize: '0.58rem', color: '#6a6460' }}>
                                Solo voyage
                              </span>
                            )}

                            {/* Ring skin drops */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: 'auto' }}>
                              {est.skinIds.map(id => {
                                const skin = getRingSkin(id)
                                return (
                                  <div
                                    key={id}
                                    title={skin.name}
                                    style={{
                                      width: 8, height: 8, borderRadius: '50%',
                                      background: skin.color,
                                      opacity: isSelected ? 0.9 : 0.5,
                                      boxShadow: skin.glow ? `0 0 4px ${skin.color}88` : 'none',
                                    }}
                                  />
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* High crew risk warning */}
              {(() => {
                const est = selectedRoute && stats ? computeRouteEstimate(stats, savedCrew.length, selectedRoute) : null
                if (!est || savedCrew.length < 2 || est.crewRiskPct <= 50) return null
                return (
                  <div style={{
                    background: 'rgba(248,113,113,0.07)',
                    border: '1px solid rgba(248,113,113,0.25)',
                    borderRadius: 9, padding: '0.55rem 0.7rem',
                    marginBottom: '0.6rem',
                  }}>
                    <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#f87171', lineHeight: 1.5 }}>
                      ⚠ {est.crewRiskPct}% chance a crew member is lost permanently on this voyage.
                    </p>
                  </div>
                )
              })()}

              {error && (
                <p className="font-karla" style={{ fontSize: '0.62rem', color: '#f87171', marginBottom: '0.5rem' }}>{error}</p>
              )}
              <button
                onClick={handleSend}
                disabled={isPending || !selectedRoute}
                style={{
                  width: '100%',
                  background: isPending || !selectedRoute ? 'rgba(240,192,64,0.05)' : 'rgba(240,192,64,0.18)',
                  border: `1px solid ${selectedRoute ? 'rgba(240,192,64,0.45)' : 'rgba(240,192,64,0.15)'}`,
                  borderRadius: 10, padding: '0.65rem 1rem',
                  color: isPending || !selectedRoute ? 'rgba(240,192,64,0.25)' : '#f0c040',
                  cursor: isPending || !selectedRoute ? 'default' : 'pointer',
                  transition: 'all 0.15s',
                }}
                className="font-cinzel font-700 uppercase tracking-[0.12em]"
              >
                <span style={{ fontSize: '0.72rem' }}>{isPending ? 'Sending…' : 'Set Sail'}</span>
              </button>
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
                    <p className="font-karla" style={{ fontSize: '0.62rem', color: '#a09070', lineHeight: 1.55 }}>
                      {e.narrative}
                    </p>
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

          {lostCards.length > 0 && (
            <div style={{
              background: 'rgba(20,10,10,0.60)',
              border: '1px solid rgba(180,40,40,0.22)',
              borderRadius: 8, padding: '0.55rem 0.8rem',
              display: 'flex', alignItems: 'center', gap: '0.6rem',
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
