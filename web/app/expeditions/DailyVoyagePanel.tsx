'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { EXPEDITION_SHIP_STATS, RARITY_COLORS, computeTotalCrewStats, type CrewCard } from '@/lib/expeditions'
import type { VoyageEvent } from '@/lib/voyageEvents'
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
  const savedCrew: CrewCard[] = savedCrewVariantIds
    .slice(0, shipStats.crewSlots)
    .map(id => byVariantId.get(id))
    .filter(Boolean) as CrewCard[]

  const stats = savedCrew.length > 0 ? computeTotalCrewStats(savedCrew) : null

  const handleSend = useCallback(() => {
    if (savedCrew.length === 0) return
    setError(null)
    startTransition(async () => {
      const res = await sendDailyVoyage(savedCrew.map(c => c.variantId))
      if ('error' in res) { setError(res.error); return }
      setActiveVoyage(res.voyage)
      setPanelState('away')
    })
  }, [savedCrew])

  const handleClaim = useCallback(() => {
    if (!activeVoyage) return
    setError(null)
    startTransition(async () => {
      const res = await revealVoyageResults(activeVoyage.id)
      if ('error' in res) { setError(res.error); return }
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
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#5a4c38', lineHeight: 1.5 }}>
              Your crew is on a raid. Finish the raid before sending them on a voyage.
            </p>
          ) : !hasCrew ? (
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#5a4c38', lineHeight: 1.5 }}>
              Save a crew in your roster above to send them on a daily voyage.
            </p>
          ) : (
            <>
              <p className="font-karla" style={{ fontSize: '0.66rem', color: '#7a6a52', lineHeight: 1.5, marginBottom: '0.85rem' }}>
                Send your crew on a 6-hour voyage. They return with stories — and sometimes something worth keeping.
              </p>

              {/* Crew pills */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.65rem' }}>
                {savedCrew.map((c, i) => {
                  const rc = rarityColor(c.rarity)
                  return (
                    <div key={c.variantId} style={{
                      background: `${rc}11`,
                      border: `1px solid ${rc}30`,
                      borderRadius: 7, padding: '0.28rem 0.55rem',
                      display: 'flex', alignItems: 'center', gap: '0.3rem',
                    }}>
                      {i === 0 && <span style={{ fontSize: '0.58rem' }}>👑</span>}
                      <span className="font-karla font-700" style={{ fontSize: '0.64rem', color: rc }}>{c.name}</span>
                    </div>
                  )
                })}
              </div>

              {/* Crew stats */}
              {stats && (
                <div style={{ display: 'flex', gap: '1.1rem', marginBottom: '0.9rem' }}>
                  {([['PWR', stats.power], ['DGE', stats.dodge], ['FTN', stats.fortune]] as [string, number][]).map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
                      <span className="font-karla" style={{ fontSize: '0.56rem', color: '#5a4c38', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
                      <span className="font-karla font-700" style={{ fontSize: '0.75rem', color: '#b89a5a' }}>{val}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {error
                  ? <p className="font-karla" style={{ fontSize: '0.62rem', color: '#f87171' }}>{error}</p>
                  : <div />}
                <button
                  onClick={handleSend}
                  disabled={isPending}
                  style={{
                    background: isPending ? 'rgba(240,192,64,0.05)' : 'rgba(240,192,64,0.13)',
                    border: '1px solid rgba(240,192,64,0.28)',
                    borderRadius: 8, padding: '0.45rem 1rem',
                    color: '#f0c040', cursor: isPending ? 'default' : 'pointer',
                    opacity: isPending ? 0.5 : 1, transition: 'opacity 0.15s',
                  }}
                  className="font-karla font-700 uppercase tracking-[0.1em]"
                >
                  <span style={{ fontSize: '0.62rem' }}>{isPending ? 'Sending…' : 'Set Sail →'}</span>
                </button>
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
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                {awayCrew.map((c, i) => {
                  const rc = rarityColor(c.rarity)
                  return (
                    <div key={c.variantId} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      {i === 0 && <span style={{ fontSize: '0.5rem' }}>👑</span>}
                      <span className="font-karla font-700" style={{ fontSize: '0.58rem', color: rc }}>{c.name}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <span style={{ fontSize: '1.6rem', flexShrink: 0 }}>{isComplete ? '🏴‍☠️' : '⛵'}</span>
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
                      <span style={{ fontSize: '0.8rem', lineHeight: 1, flexShrink: 0 }}>{EVENT_ICONS[e.type] ?? '•'}</span>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#d4c09a', flex: 1 }}>{e.title}</p>
                      {e.doubloonDelta > 0 && (
                        <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#f0c040', flexShrink: 0 }}>
                          +{e.doubloonDelta} ⟡
                        </p>
                      )}
                      {isCrewLoss && (
                        <span className="font-karla font-700" style={{ fontSize: '0.44rem', color: '#f87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.22)', borderRadius: 4, padding: '0.12rem 0.35rem', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
                          Crew Lost
                        </span>
                      )}
                    </div>
                    <p className="font-karla" style={{ fontSize: '0.62rem', color: '#7a6a4a', lineHeight: 1.55 }}>
                      {e.narrative}
                    </p>
                    {isCrewLoss && lostCard && (
                      <p className="font-karla font-700" style={{ fontSize: '0.58rem', color: '#c06060', marginTop: '0.3rem' }}>
                        {lostCard.name} — lost at sea.
                      </p>
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
                  {activeVoyage.total_doubloons > 0 ? (
                    <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#f0c040', lineHeight: 1 }}>
                      +{activeVoyage.total_doubloons} ⟡
                    </p>
                  ) : (
                    <p className="font-karla" style={{ fontSize: '0.65rem', color: '#4a3c28' }}>
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
                  <p className="font-karla" style={{ fontSize: '0.58rem', color: '#3a4860' }}>
                    Next event in <span style={{ color: '#5070a0', fontWeight: 700 }}>{formatCountdown(msToNext)}</span>
                  </p>
                ) : (
                  <div />
                )}
                <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#4a5870', letterSpacing: '0.03em' }}>
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
              <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#5a4c38', marginBottom: 4 }}>
                Voyage complete
              </p>
              {earned > 0 ? (
                <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f0c040', lineHeight: 1 }}>
                  +{earned} ⟡
                </p>
              ) : (
                <p className="font-karla" style={{ fontSize: '0.7rem', color: '#4a3c28' }}>
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
                color: '#6b5c44', cursor: 'pointer',
              }}
              className="font-karla font-700 uppercase tracking-[0.1em]"
            >
              <span style={{ fontSize: '0.58rem' }}>Done</span>
            </button>
          </div>

          {lostCards.length > 0 && (
            <div style={{
              background: 'rgba(20,10,10,0.60)',
              border: '1px solid rgba(180,40,40,0.22)',
              borderRadius: 8, padding: '0.55rem 0.8rem',
              display: 'flex', alignItems: 'center', gap: '0.6rem',
            }}>
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>💀</span>
              <div>
                <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.46rem', color: '#6b2a2a', marginBottom: '0.2rem' }}>
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
