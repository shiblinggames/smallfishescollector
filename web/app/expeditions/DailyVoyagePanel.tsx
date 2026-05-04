'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { EXPEDITION_SHIP_STATS, RARITY_COLORS, computeTotalCrewStats, type CrewCard } from '@/lib/expeditions'
import type { VoyageEvent } from '@/lib/voyageEvents'
import { sendDailyVoyage, revealVoyageResults, type DailyVoyage } from './voyageActions'

type PanelState = 'idle' | 'away' | 'returned' | 'done'

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
    ? new Date(activeVoyage.created_at).getTime() + 6 * 60 * 60 * 1000
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

  const handleReveal = useCallback(() => {
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

  // ── Away: crew at sea ──────────────────────────────────────────────────────
  if (panelState === 'away') {
    const awayCrew = activeVoyage
      ? activeVoyage.crew_variant_ids.map(id => byVariantId.get(id)).filter(Boolean) as CrewCard[]
      : savedCrew
    return (
      <div>
        <div style={{
          background: 'linear-gradient(135deg, rgba(16,22,36,0.72) 0%, rgba(12,18,30,0.80) 100%)',
          border: '1px solid rgba(96,132,210,0.18)',
          borderRadius: 16, padding: '1.05rem 1.1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#b0bee0', lineHeight: 1.2 }}>
                Voyage underway
              </p>
              <p className="font-karla" style={{ fontSize: '0.62rem', color: '#4a5870', marginTop: 4 }}>
                The {shipStats.name} is at sea.
              </p>
              {msRemaining > 0 && (
                <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#6080b0', marginTop: 6, letterSpacing: '0.04em' }}>
                  {formatCountdown(msRemaining)}
                </p>
              )}
            </div>
            <span style={{ fontSize: '1.8rem', flexShrink: 0 }}>⛵</span>
          </div>

          {awayCrew.length > 0 && (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {awayCrew.map((c, i) => {
                const rc = rarityColor(c.rarity)
                return (
                  <div key={c.variantId} style={{
                    background: 'rgba(96,132,210,0.07)',
                    border: '1px solid rgba(96,132,210,0.15)',
                    borderRadius: 7, padding: '0.25rem 0.5rem',
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                  }}>
                    {i === 0 && <span style={{ fontSize: '0.55rem' }}>👑</span>}
                    <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: rc }}>{c.name}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Returned: ready to reveal ──────────────────────────────────────────────
  if (panelState === 'returned') {
    return (
      <div>
        <div style={{
          background: 'linear-gradient(135deg, rgba(28,20,10,0.72) 0%, rgba(18,14,6,0.80) 100%)',
          border: '1px solid rgba(240,192,64,0.40)',
          borderRadius: 16, padding: '1.05rem 1.1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.8rem', flexShrink: 0 }}>🏴‍☠️</span>
            <div style={{ flex: 1 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f0e8cc', lineHeight: 1.2, marginBottom: 4 }}>
                Your crew has returned
              </p>
              <p className="font-karla" style={{ fontSize: '0.62rem', color: '#857460' }}>
                The voyage is over. Read the log to find out what happened.
              </p>
            </div>
            <button
              onClick={handleReveal}
              disabled={isPending}
              style={{
                flexShrink: 0,
                background: isPending ? 'rgba(240,192,64,0.06)' : 'rgba(240,192,64,0.15)',
                border: '1px solid rgba(240,192,64,0.38)',
                borderRadius: 8, padding: '0.5rem 1rem',
                color: '#f0c040', cursor: isPending ? 'default' : 'pointer',
                opacity: isPending ? 0.5 : 1,
              }}
              className="font-karla font-700 uppercase tracking-[0.1em]"
            >
              <span style={{ fontSize: '0.62rem' }}>{isPending ? 'Loading…' : 'Read log →'}</span>
            </button>
          </div>
          {error && <p className="font-karla" style={{ fontSize: '0.62rem', color: '#f87171', marginTop: '0.5rem' }}>{error}</p>}
        </div>
      </div>
    )
  }

  // ── Done: activity log ────────────────────────────────────────────────────
  if (panelState === 'done' && activeVoyage) {
    const earned = activeVoyage.total_doubloons
    const events = activeVoyage.events as VoyageEvent[]
    const lostCards = activeVoyage.crew_lost
      .map(id => collection.find(c => c.variantId === id))
      .filter(Boolean) as CrewCard[]

    return (
      <div>
        <div style={{
          background: 'linear-gradient(135deg, rgba(18,14,6,0.88) 0%, rgba(14,10,4,0.92) 100%)',
          border: '1px solid rgba(240,192,64,0.18)',
          borderRadius: 16, padding: '1.05rem 1.1rem',
        }}>

          {/* Reward summary */}
          <div style={{
            background: earned > 0 ? 'rgba(240,192,64,0.07)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${earned > 0 ? 'rgba(240,192,64,0.22)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 10, padding: '0.75rem 1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '1rem',
          }}>
            <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#5a4c38' }}>
              Voyage complete
            </p>
            {earned > 0 ? (
              <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f0c040', lineHeight: 1 }}>
                +{earned} ⟡
              </p>
            ) : (
              <p className="font-karla" style={{ fontSize: '0.66rem', color: '#4a3c28' }}>
                Returned empty-handed
              </p>
            )}
          </div>

          {/* Activity log */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: lostCards.length > 0 ? '0.85rem' : '0.9rem' }}>
            {events.map((e, i) => {
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
                  borderRadius: 8, padding: '0.6rem 0.75rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.85rem', lineHeight: 1, flexShrink: 0 }}>{EVENT_ICONS[e.type] ?? '•'}</span>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.75rem', color: '#d4c09a', flex: 1 }}>{e.title}</p>
                    {e.doubloonDelta > 0 && (
                      <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#f0c040', flexShrink: 0 }}>
                        +{e.doubloonDelta} ⟡
                      </p>
                    )}
                    {isCrewLoss && (
                      <span className="font-karla font-700" style={{ fontSize: '0.48rem', color: '#f87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.22)', borderRadius: 4, padding: '0.15rem 0.4rem', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
                        Crew Lost
                      </span>
                    )}
                  </div>
                  <p className="font-karla" style={{ fontSize: '0.65rem', color: '#8a7a5a', lineHeight: 1.55 }}>
                    {e.narrative}
                  </p>
                  {isCrewLoss && lostCard && (
                    <p className="font-karla font-700" style={{ fontSize: '0.6rem', color: '#c06060', marginTop: '0.35rem' }}>
                      {lostCard.name} — lost at sea.
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Memorial */}
          {lostCards.length > 0 && (
            <div style={{
              background: 'rgba(20,10,10,0.60)',
              border: '1px solid rgba(180,40,40,0.22)',
              borderRadius: 8, padding: '0.6rem 0.85rem',
              marginBottom: '0.85rem',
              display: 'flex', alignItems: 'center', gap: '0.65rem',
            }}>
              <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>💀</span>
              <div>
                <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.48rem', color: '#6b2a2a', marginBottom: '0.2rem' }}>
                  Lost at sea
                </p>
                {lostCards.map(c => (
                  <p key={c.variantId} className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#c06060', lineHeight: 1.3 }}>
                    {c.name}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setPanelState('idle')}
              style={{
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
        </div>
      </div>
    )
  }

  return null
}
