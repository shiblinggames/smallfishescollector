'use client'

import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { EXPEDITION_SHIP_STATS, RARITY_COLORS, computeTotalCrewStats, type CrewCard } from '@/lib/expeditions'
import type { VoyageEvent } from '@/lib/voyageEvents'
import { sendDailyVoyage, revealVoyageResults, type DailyVoyage } from './voyageActions'

type PanelState = 'idle' | 'away' | 'returned' | 'revealing' | 'done'

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

interface Props {
  savedCrewVariantIds: number[]
  collection: CrewCard[]
  shipTier: number
  todayVoyage: DailyVoyage | null
  readyVoyage: DailyVoyage | null
}

export default function DailyVoyagePanel({
  savedCrewVariantIds,
  collection,
  shipTier,
  todayVoyage,
  readyVoyage,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const initialState: PanelState =
    todayVoyage ? 'away'
    : readyVoyage ? 'returned'
    : 'idle'

  const [panelState, setPanelState] = useState<PanelState>(initialState)
  const [activeVoyage, setActiveVoyage] = useState<DailyVoyage | null>(readyVoyage ?? todayVoyage)
  const [revealIndex, setRevealIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)

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
      setRevealIndex(0)
      setPanelState('revealing')
      router.refresh()
    })
  }, [activeVoyage, router])

  const handleNextEvent = useCallback(() => {
    if (!activeVoyage) return
    if (revealIndex + 1 >= activeVoyage.events.length) {
      setPanelState('done')
    } else {
      setRevealIndex(i => i + 1)
    }
  }, [activeVoyage, revealIndex])

  // ── Section label ──────────────────────────────────────────────────────────
  const sectionLabel = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
      <span style={{ fontSize: '0.75rem' }}>⚓</span>
      <p className="font-karla font-700 uppercase tracking-[0.13em]" style={{ fontSize: '0.52rem', color: '#6b5c44' }}>
        Daily Crew Voyage
      </p>
    </div>
  )

  // ── Idle: send voyage ──────────────────────────────────────────────────────
  if (panelState === 'idle') {
    const hasCrew = savedCrew.length > 0
    return (
      <div style={{ marginBottom: '1.25rem' }}>
        {sectionLabel}
        <div style={{
          background: 'linear-gradient(135deg, rgba(28,20,10,0.72) 0%, rgba(18,14,6,0.80) 100%)',
          border: '1px solid rgba(240,192,64,0.18)',
          borderRadius: 16, padding: '1.05rem 1.1rem',
        }}>
          {!hasCrew ? (
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#5a4c38', lineHeight: 1.5 }}>
              Save a crew in your roster above to send them on a daily voyage.
            </p>
          ) : (
            <>
              <p className="font-karla" style={{ fontSize: '0.66rem', color: '#7a6a52', lineHeight: 1.5, marginBottom: '0.85rem' }}>
                Send your crew out once a day. They return with stories — and sometimes something worth keeping.
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
      <div style={{ marginBottom: '1.25rem' }}>
        {sectionLabel}
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
                The {shipStats.name} is at sea. Check back tomorrow for the log.
              </p>
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
      <div style={{ marginBottom: '1.25rem' }}>
        {sectionLabel}
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

  // ── Revealing: event-by-event ──────────────────────────────────────────────
  if (panelState === 'revealing' && activeVoyage) {
    const event = activeVoyage.events[revealIndex] as VoyageEvent
    const isLast = revealIndex + 1 >= activeVoyage.events.length
    const isCrewLoss = event.crewVariantLost != null
    const style = isCrewLoss
      ? { label: 'Crew Lost', bg: 'rgba(180,20,20,0.09)', color: '#f87171', border: 'rgba(220,38,38,0.30)' }
      : (OUTCOME_STYLES[event.outcome] ?? OUTCOME_STYLES.neutral)

    const lostCrewCard = isCrewLoss
      ? collection.find(c => c.variantId === event.crewVariantLost)
      : null

    return (
      <div style={{ marginBottom: '1.25rem' }}>
        {sectionLabel}
        <div style={{
          background: 'linear-gradient(135deg, rgba(18,14,6,0.88) 0%, rgba(14,10,4,0.92) 100%)',
          border: '1px solid rgba(240,192,64,0.18)',
          borderRadius: 16, padding: '1.05rem 1.1rem',
        }}>
          {/* Progress */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.9rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#4a3c28' }}>
              Voyage Log
            </p>
            <div style={{ flex: 1, height: 2, background: 'rgba(240,192,64,0.08)', borderRadius: 1, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 1,
                background: 'rgba(240,192,64,0.35)',
                width: `${((revealIndex + 1) / activeVoyage.events.length) * 100}%`,
                transition: 'width 0.3s ease',
              }} />
            </div>
            <p className="font-karla" style={{ fontSize: '0.5rem', color: '#4a3c28' }}>
              {revealIndex + 1}/{activeVoyage.events.length}
            </p>
          </div>

          {/* Event card */}
          <div style={{
            background: style.bg,
            border: `1px solid ${style.border}`,
            borderLeft: `3px solid ${style.color}`,
            borderRadius: 10, padding: '0.9rem 1rem',
            marginBottom: '0.85rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.55rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>{EVENT_ICONS[event.type] ?? '•'}</span>
                <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#d4c09a' }}>{event.title}</p>
              </div>
              <span style={{
                flexShrink: 0, fontSize: '0.48rem', padding: '0.22rem 0.5rem', borderRadius: 4,
                background: `${style.color}18`, color: style.color,
                fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              }} className="font-karla">
                {style.label}
              </span>
            </div>

            <p className="font-karla" style={{ fontSize: '0.7rem', color: '#9a8a6a', lineHeight: 1.6 }}>
              {event.narrative}
            </p>

            {event.doubloonDelta > 0 && (
              <p className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#f0c040', marginTop: '0.6rem' }}>
                +{event.doubloonDelta} ⟡
              </p>
            )}

            {/* Crew loss — dramatic block */}
            {isCrewLoss && lostCrewCard && (
              <div style={{
                marginTop: '0.8rem',
                background: 'rgba(180,20,20,0.12)',
                border: '1px solid rgba(220,38,38,0.22)',
                borderRadius: 8, padding: '0.7rem 0.85rem',
                display: 'flex', alignItems: 'center', gap: '0.75rem',
              }}>
                <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>💀</span>
                <div>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f87171', lineHeight: 1.2 }}>
                    {lostCrewCard.name}
                  </p>
                  <p className="font-karla" style={{ fontSize: '0.6rem', color: '#8b3a3a', marginTop: 3 }}>
                    Lost at sea — permanently removed from your crew.
                  </p>
                </div>
              </div>
            )}

            {/* Crew loss but card not in collection (shouldn't happen) */}
            {isCrewLoss && !lostCrewCard && (
              <div style={{ marginTop: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.2rem' }}>💀</span>
                <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#f87171' }}>
                  A crew member was lost at sea.
                </p>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleNextEvent}
              style={{
                background: 'rgba(240,192,64,0.10)',
                border: '1px solid rgba(240,192,64,0.26)',
                borderRadius: 8, padding: '0.45rem 1rem',
                color: '#f0c040', cursor: 'pointer',
              }}
              className="font-karla font-700 uppercase tracking-[0.1em]"
            >
              <span style={{ fontSize: '0.62rem' }}>{isLast ? 'See summary →' : 'Continue →'}</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Done: summary ──────────────────────────────────────────────────────────
  if (panelState === 'done' && activeVoyage) {
    const earned = activeVoyage.total_doubloons
    const lostCards = activeVoyage.crew_lost
      .map(id => collection.find(c => c.variantId === id))
      .filter(Boolean) as CrewCard[]

    return (
      <div style={{ marginBottom: '1.25rem' }}>
        {sectionLabel}
        <div style={{
          background: 'linear-gradient(135deg, rgba(28,20,10,0.72) 0%, rgba(18,14,6,0.80) 100%)',
          border: '1px solid rgba(240,192,64,0.18)',
          borderRadius: 16, padding: '1.05rem 1.1rem',
        }}>
          <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: '#c4a96a', marginBottom: '0.9rem' }}>
            Voyage complete
          </p>

          {/* Earned */}
          <div style={{ marginBottom: lostCards.length > 0 ? '0.9rem' : '1rem' }}>
            <p className="font-karla" style={{ fontSize: '0.56rem', color: '#5a4c38', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Earned
            </p>
            {earned > 0 ? (
              <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f0c040', lineHeight: 1 }}>
                +{earned} ⟡
              </p>
            ) : (
              <p className="font-karla" style={{ fontSize: '0.72rem', color: '#4a3c28' }}>
                The crew returned empty-handed.
              </p>
            )}
          </div>

          {/* Memorial */}
          {lostCards.length > 0 && (
            <div style={{
              background: 'rgba(20,10,10,0.60)',
              border: '1px solid rgba(180,40,40,0.20)',
              borderRadius: 10, padding: '0.7rem 0.85rem',
              marginBottom: '0.9rem',
            }}>
              <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#6b2a2a', marginBottom: '0.5rem' }}>
                Lost at sea
              </p>
              {lostCards.map(c => (
                <div key={c.variantId} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ fontSize: '0.8rem' }}>✝</span>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#c06060' }}>{c.name}</p>
                </div>
              ))}
            </div>
          )}

          {/* Event recap chips */}
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
            {(activeVoyage.events as VoyageEvent[]).map((e, i) => {
              const s = e.crewVariantLost
                ? { color: '#f87171', bg: 'rgba(248,113,113,0.10)' }
                : e.doubloonDelta > 0
                  ? { color: '#f0c040', bg: 'rgba(240,192,64,0.10)' }
                  : { color: '#5a4c38', bg: 'rgba(255,255,255,0.03)' }
              return (
                <div key={i} style={{
                  background: s.bg, border: `1px solid ${s.color}22`,
                  borderRadius: 5, padding: '0.18rem 0.4rem',
                  display: 'flex', alignItems: 'center', gap: '0.22rem',
                }}>
                  <span style={{ fontSize: '0.6rem' }}>{EVENT_ICONS[e.type]}</span>
                  <span className="font-karla" style={{ fontSize: '0.54rem', color: s.color }}>{e.title}</span>
                  {e.doubloonDelta > 0 && (
                    <span className="font-karla font-700" style={{ fontSize: '0.52rem', color: '#f0c040' }}>+{e.doubloonDelta}</span>
                  )}
                </div>
              )
            })}
          </div>

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
