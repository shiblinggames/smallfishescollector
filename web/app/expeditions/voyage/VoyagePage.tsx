'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resolveChoice, resolveFinalLoot, abandonExpedition } from '../actions'
import {
  STATS, STAT_LABELS, STAT_ICONS, STAT_DESCRIPTIONS, RARITY_COLORS, EXPEDITION_SHIP_STATS, HULL_POINTS,
  type Expedition, type DailyExpeditionRow, type EventNode, type EventResult, type LootResult, type ExpeditionShipStats,
} from '@/lib/expeditions'

type Phase =
  | { type: 'event' }
  | { type: 'rolling'; choiceIndex: number }
  | { type: 'result'; result: EventResult }
  | { type: 'loot-rolling' }
  | { type: 'loot-result'; loot: LootResult }
  | { type: 'failed'; reason: string }
  | { type: 'abandon-confirm' }

interface Props {
  expedition: Expedition
  dailyContent: DailyExpeditionRow
  zoneName: string
  zoneIcon: string
  totalEvents: number
}

function RollingDie({ finalRoll, rolling }: { finalRoll: number; rolling: boolean }) {
  const [display, setDisplay] = useState(finalRoll)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!rolling) { setDisplay(finalRoll); return }
    setDisplay(Math.floor(Math.random() * 20) + 1)
    intervalRef.current = setInterval(() => {
      setDisplay(Math.floor(Math.random() * 20) + 1)
    }, 80)
    const timeout = setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      setDisplay(finalRoll)
    }, 900)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      clearTimeout(timeout)
    }
  }, [rolling, finalRoll])

  return (
    <div style={{
      width: 64, height: 64,
      background: 'rgba(240,192,64,0.1)',
      border: `2px solid ${rolling ? 'rgba(240,192,64,0.4)' : 'rgba(240,192,64,0.2)'}`,
      borderRadius: 14,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'border-color 0.3s',
    }}>
      <span className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: '#f0c040' }}>
        {display}
      </span>
    </div>
  )
}

const IMG_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/card-arts/'

export default function VoyagePage({ expedition, dailyContent, zoneName, zoneIcon, totalEvents }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [currentNode, setCurrentNode] = useState(expedition.current_node)
  const [phase, setPhase] = useState<Phase>({ type: 'event' })
  const [rollingResult, setRollingResult] = useState<EventResult | null>(null)
  const [pendingRoll, setPendingRoll] = useState<number>(1)
  const [lootResult, setLootResult] = useState<LootResult | null>(null)
  const [showStats, setShowStats] = useState(false)

  const eventSequence = dailyContent.event_sequence
  const isFinalLootNode = currentNode >= eventSequence.length
  const currentEvent: EventNode | null = isFinalLootNode ? null : eventSequence[currentNode]

  const hullMax = HULL_POINTS[expedition.ship_tier] ?? 3
  const shipStats = EXPEDITION_SHIP_STATS[expedition.ship_tier]

  // Compute current hull damage from stored events + any in-session damage
  const storedHullDamage = expedition.hull_damage ?? 0

  function handleChoiceClick(choiceIndex: number) {
    if (isPending || phase.type !== 'event') return
    setPhase({ type: 'rolling', choiceIndex })

    startTransition(async () => {
      const result = await resolveChoice(expedition.id, currentNode, choiceIndex)
      if ('error' in result) {
        setPhase({ type: 'event' })
        return
      }

      // Show the real roll on the die, then wait for animation to finish
      if (result.roll !== undefined) setPendingRoll(result.roll)
      await new Promise(r => setTimeout(r, 950))
      setRollingResult(result)
      setPhase({ type: 'result', result })

      if (result.expeditionFailed) {
        await new Promise(r => setTimeout(r, 1500))
        setPhase({ type: 'failed', reason: result.failReason ?? 'Your ship was destroyed.' })
      }
    })
  }

  function handleContinue() {
    if (phase.type !== 'result') return
    const result = (phase as { type: 'result'; result: EventResult }).result
    const nextNode = result.nodeIndex + 1
    setCurrentNode(nextNode)
    setRollingResult(null)

    if (nextNode >= eventSequence.length) {
      // Move to final loot roll
      setPhase({ type: 'loot-rolling' })
      startTransition(async () => {
        const loot = await resolveFinalLoot(expedition.id)
        if ('error' in loot) {
          setPhase({ type: 'event' })
          return
        }
        await new Promise(r => setTimeout(r, 950))
        setLootResult(loot)
        setPhase({ type: 'loot-result', loot })
      })
    } else {
      setPhase({ type: 'event' })
    }
  }

  function handleAbandon() {
    startTransition(async () => {
      await abandonExpedition(expedition.id)
      router.push('/expeditions')
    })
  }

  const progressPct = Math.min((currentNode / totalEvents) * 100, 100)

  return (
    <main className="min-h-screen pb-24 sm:pb-0 pt-6">
      <div className="px-6 max-w-2xl mx-auto">

        {/* Zone header + progress */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '1.1rem' }}>{zoneIcon}</span>
              <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.62rem', color: '#6a6764' }}>
                {zoneName}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowStats(true)}
                className="font-karla font-600 uppercase tracking-[0.08em]"
                style={{ fontSize: '0.52rem', color: '#6a6764', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                ⚓ Crew
              </button>
              {/* Hull indicator */}
              <div className="flex items-center gap-1">
                {Array.from({ length: hullMax }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: i < hullMax - storedHullDamage ? '#60a5fa' : 'rgba(255,255,255,0.1)',
                    }}
                  />
                ))}
              </div>
              <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6a6764' }}>
                {isFinalLootNode ? 'Final Haul' : `${currentNode + 1} / ${totalEvents}`}
              </p>
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progressPct}%`, background: '#f0c040', transition: 'width 0.4s ease', borderRadius: 2 }} />
          </div>
        </div>

        {/* ── EVENT PHASE ── */}
        {(phase.type === 'event' || phase.type === 'rolling') && currentEvent && (
          <EventView
            event={currentEvent}
            phase={phase}
            rollingResult={rollingResult}
            pendingRoll={pendingRoll}
            onChoice={handleChoiceClick}
            isPending={isPending}
          />
        )}

        {/* ── RESULT PHASE ── */}
        {phase.type === 'result' && currentEvent && rollingResult && (
          <ResultView
            event={currentEvent}
            result={rollingResult}
            shipTier={expedition.ship_tier}
            onContinue={handleContinue}
          />
        )}

        {/* ── LOOT ROLLING PHASE ── */}
        {phase.type === 'loot-rolling' && (
          <LootRollingView />
        )}

        {/* ── LOOT RESULT PHASE ── */}
        {phase.type === 'loot-result' && lootResult && (
          <LootResultView
            loot={lootResult}
            shipTier={expedition.ship_tier}
            onDone={() => router.push(`/expeditions/results?id=${expedition.id}`)}
          />
        )}

        {/* ── FAILED PHASE ── */}
        {phase.type === 'failed' && (
          <FailedView
            reason={(phase as { type: 'failed'; reason: string }).reason}
            expeditionId={expedition.id}
          />
        )}

        {/* ── ABANDON CONFIRM ── */}
        {phase.type === 'abandon-confirm' && (
          <div
            onClick={() => setPhase({ type: 'event' })}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1.5rem' }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ background: '#1c1917', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 18, padding: '1.5rem', width: '100%', maxWidth: '22rem' }}
            >
              <p className="font-cinzel font-700 text-[#f0ede8] mb-2" style={{ fontSize: '1rem' }}>Abandon Expedition?</p>
              <p className="font-karla text-[#a0a09a] mb-5" style={{ fontSize: '0.78rem' }}>
                You will lose your entry fee and receive no rewards. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setPhase({ type: 'event' })}
                  style={{ flex: 1, padding: '0.625rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, cursor: 'pointer', color: '#a0a09a', fontSize: '0.72rem' }}
                  className="font-karla font-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAbandon}
                  disabled={isPending}
                  style={{ flex: 1, padding: '0.625rem', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 10, cursor: 'pointer', color: '#f87171' }}
                  className="font-karla font-600"
                >
                  Abandon
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stats sheet */}
        {showStats && (
          <StatsSheet
            expedition={expedition}
            shipStats={shipStats}
            onClose={() => setShowStats(false)}
          />
        )}

        {/* Abandon link (shown during event phase) */}
        {phase.type === 'event' && (
          <button
            onClick={() => setPhase({ type: 'abandon-confirm' })}
            className="w-full mt-4 font-karla"
            style={{ fontSize: '0.62rem', color: '#4a4845', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Abandon expedition
          </button>
        )}

      </div>
    </main>
  )
}

function EventView({
  event,
  phase,
  rollingResult,
  pendingRoll,
  onChoice,
  isPending,
}: {
  event: EventNode
  phase: Phase
  rollingResult: EventResult | null
  pendingRoll: number
  onChoice: (i: number) => void
  isPending: boolean
}) {
  const rolling = phase.type === 'rolling'
  const rollingChoiceIndex = rolling ? (phase as { type: 'rolling'; choiceIndex: number }).choiceIndex : -1

  return (
    <div>
      {/* Crisis badge */}
      {event.isCrisis && (
        <p className="font-karla font-700 uppercase tracking-[0.1em] mb-2" style={{ fontSize: '0.52rem', color: '#f87171' }}>
          ⚠ Crisis Event
        </p>
      )}

      {/* Event title */}
      <p className="font-cinzel font-700 text-[#f0ede8] mb-2" style={{ fontSize: '1.15rem', lineHeight: 1.25 }}>
        {event.name}
      </p>

      {/* Flavor text */}
      <p className="font-karla text-[#a0a09a] mb-4" style={{ fontSize: '0.78rem', lineHeight: 1.6 }}>
        {event.flavor}
      </p>

      {/* Stat being checked */}
      {event.mechanics.stat && (
        <div className="flex items-center gap-1.5 mb-5">
          <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#6a6764', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Checking:
          </p>
          <p className="font-karla font-700" style={{ fontSize: '0.65rem', color: '#f0ede8' }}>
            {STAT_ICONS[event.mechanics.stat]} {STAT_LABELS[event.mechanics.stat]}
          </p>
        </div>
      )}

      {/* Choices */}
      <div className="flex flex-col gap-2.5">
        {event.choices.map((choice, i) => {
          const isThisRolling = rolling && rollingChoiceIndex === i
          return (
            <button
              key={i}
              onClick={() => !rolling && !isPending && onChoice(i)}
              disabled={rolling || isPending}
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                background: isThisRolling ? 'rgba(240,192,64,0.12)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${isThisRolling ? 'rgba(240,192,64,0.3)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 12,
                cursor: rolling || isPending ? 'default' : 'pointer',
                opacity: rolling && !isThisRolling ? 0.4 : 1,
                textAlign: 'left',
                transition: 'opacity 0.2s, border-color 0.2s',
              }}
            >
              <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: isThisRolling ? '#f0c040' : '#f0ede8' }}>
                {choice.label}
              </p>
              {choice.isNoRoll && (
                <p className="font-karla mt-0.5" style={{ fontSize: '0.6rem', color: '#6a6764' }}>
                  {choice.cost ? `Always succeeds · −${choice.cost} ⟡ from loot` : 'Always succeeds'}
                </p>
              )}
            </button>
          )
        })}
      </div>

      {/* Rolling state */}
      {rolling && rollingResult === null && (
        <div className="flex flex-col items-center gap-3 mt-6">
          <RollingDie finalRoll={pendingRoll} rolling={true} />
          <p className="font-karla" style={{ fontSize: '0.68rem', color: '#6a6764' }}>Rolling...</p>
        </div>
      )}
    </div>
  )
}

function ResultView({ event, result, shipTier, onContinue }: { event: EventNode; result: EventResult; shipTier: number; onContinue: () => void }) {
  const shipFloor = shipTier + 1
  const success = result.outcome === 'success'

  return (
    <div>
      {/* Event title */}
      <p className="font-cinzel font-700 text-[#f0ede8] mb-4" style={{ fontSize: '1.15rem' }}>
        {event.name}
      </p>

      {/* Roll breakdown */}
      {!result.noRoll && result.roll !== undefined && (
        <div
          className="flex flex-col gap-2 mb-4"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: '0.875rem 1rem',
          }}
        >
          <div className="flex items-center justify-between">
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#6a6764' }}>
              {result.stat && `${STAT_ICONS[result.stat]} ${STAT_LABELS[result.stat]}`}
            </p>
            <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: success ? '#4ade80' : '#f87171' }}>
              {success ? '✓ Success' : '✗ Failed'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div style={{ flex: 1, textAlign: 'center' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0c040' }}>{result.roll}</p>
              <p className="font-karla" style={{ fontSize: '0.55rem', color: '#6a6764' }}>Ship ({shipFloor}–{result.base})</p>
            </div>
            {(result.crewBonus ?? 0) > 0 && <>
              <p style={{ color: '#6a6764', fontSize: '0.8rem' }}>+</p>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#4ade80' }}>{result.crewRoll}</p>
                <p className="font-karla" style={{ fontSize: '0.55rem', color: '#6a6764' }}>Crew (1–{result.crewBonus})</p>
              </div>
            </>}
            <p style={{ color: '#6a6764', fontSize: '0.8rem' }}>=</p>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8' }}>{result.total}</p>
              <p className="font-karla" style={{ fontSize: '0.55rem', color: '#6a6764' }}>Total</p>
            </div>
            <p style={{ color: '#6a6764', fontSize: '0.8rem' }}>vs</p>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#a0a09a' }}>{result.threshold}</p>
              <p className="font-karla" style={{ fontSize: '0.55rem', color: '#6a6764' }}>DC</p>
            </div>
          </div>
        </div>
      )}

      {/* Result text */}
      <p className="font-karla mb-5" style={{ fontSize: '0.82rem', color: '#a0a09a', lineHeight: 1.6 }}>
        {result.text}
      </p>

      {/* Consequence */}
      {result.hullDamage && (
        <p className="font-karla mb-4" style={{ fontSize: '0.7rem', color: '#f87171' }}>
          ⚠ Hull damaged (−1)
        </p>
      )}
      {result.lootPenalty && (
        <p className="font-karla mb-4" style={{ fontSize: '0.7rem', color: '#f59e0b' }}>
          Loot reduced by 20%
        </p>
      )}
      {result.costPenalty ? (
        <p className="font-karla mb-4" style={{ fontSize: '0.7rem', color: '#f59e0b' }}>
          −{result.costPenalty} ⟡ deducted from final loot
        </p>
      ) : null}

      <button
        onClick={onContinue}
        style={{
          width: '100%',
          padding: '0.875rem',
          background: 'rgba(240,192,64,0.12)',
          border: '1px solid rgba(240,192,64,0.25)',
          borderRadius: 12,
          cursor: 'pointer',
          color: '#f0c040',
          fontSize: '0.72rem',
        }}
        className="font-karla font-700 uppercase tracking-[0.1em]"
      >
        Continue →
      </button>
    </div>
  )
}

function LootRollingView() {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.2rem' }}>Final Haul</p>
      <p className="font-karla text-[#6a6764]" style={{ fontSize: '0.75rem' }}>Rolling luck...</p>
      <RollingDie finalRoll={1} rolling={true} />
    </div>
  )
}

function LootResultView({ loot, shipTier, onDone }: { loot: LootResult; shipTier: number; onDone: () => void }) {
  const shipFloor = shipTier + 1
  const rarityColor = RARITY_COLORS[loot.lootRarity] ?? '#f0c040'

  return (
    <div>
      <p className="font-cinzel font-700 text-[#f0ede8] mb-4" style={{ fontSize: '1.2rem' }}>
        Final Haul
      </p>

      {/* Luck roll */}
      <div
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: '0.875rem 1rem',
          marginBottom: '1rem',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <p className="font-karla" style={{ fontSize: '0.68rem', color: '#6a6764' }}>🍀 Luck Roll</p>
          {loot.successBonus > 0 && (
            <p className="font-karla" style={{ fontSize: '0.62rem', color: '#4ade80' }}>+{loot.successBonus} success bonus</p>
          )}
        </div>
        <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '1.1rem' }}>
          ship {loot.roll} ({shipFloor}–{loot.base}){(loot.crewBonus ?? 0) > 0 ? ` + crew ${loot.crewRoll} (1–${loot.crewBonus})` : ''} = {loot.total} → score {loot.finalScore}
        </p>
      </div>

      {/* Doubloons */}
      <div
        style={{
          background: 'rgba(240,192,64,0.06)',
          border: '1px solid rgba(240,192,64,0.15)',
          borderRadius: 12,
          padding: '1rem',
          marginBottom: '0.75rem',
          textAlign: 'center',
        }}
      >
        <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '1.6rem' }}>
          +{loot.doubloons.toLocaleString()} ⟡
        </p>
      </div>

      <button
        onClick={onDone}
        style={{
          width: '100%',
          padding: '0.875rem',
          background: 'rgba(240,192,64,0.12)',
          border: '1px solid rgba(240,192,64,0.25)',
          borderRadius: 12,
          cursor: 'pointer',
          fontSize: '0.72rem',
          color: '#f0c040',
        }}
        className="font-karla font-700 uppercase tracking-[0.1em]"
      >
        View Full Results →
      </button>
    </div>
  )
}

function StatsSheet({ expedition, shipStats, onClose }: {
  expedition: Expedition
  shipStats: ExpeditionShipStats
  onClose: () => void
}) {
  const crew = expedition.crew_loadout

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0f0f0e',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '18px 18px 0 0',
          width: '100%',
          maxWidth: 480,
          maxHeight: '75vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.9rem' }}>
              {shipStats.name}
            </p>
            <p className="font-karla" style={{ fontSize: '0.6rem', color: '#6a6764', marginTop: 1 }}>
              {shipStats.crewSlots} crew slots
            </p>
          </div>
          <button onClick={onClose} style={{ color: '#6a6764', background: 'none', border: 'none', cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* How rolls work */}
        <div className="px-5 pt-3 pb-1">
          <p className="font-karla" style={{ fontSize: '0.68rem', color: '#6a6764', lineHeight: 1.5 }}>
            Each event tests one stat. Both your ship and crew roll randomly up to their rating — a better ship and stronger crew means higher possible scores, but nothing is guaranteed.
          </p>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-3 flex flex-col gap-3">
          {STATS.map(stat => {
            const base = shipStats[stat]
            const assigned = crew[stat] ?? []
            const crewTotal = assigned.reduce((s, c) => s + c.power, 0)
            const shipFloor = expedition.ship_tier + 1
            const minScore = shipFloor + (crewTotal > 0 ? 1 : 0)
            const maxScore = base + crewTotal

            return (
              <div key={stat} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0.75rem' }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-karla font-700" style={{ fontSize: '0.75rem', color: '#f0ede8' }}>
                      {STAT_ICONS[stat]} {STAT_LABELS[stat]}
                    </p>
                    <p className="font-karla" style={{ fontSize: '0.6rem', color: '#6a6764', marginTop: 1 }}>
                      {STAT_DESCRIPTIONS[stat]}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#f0c040' }}>{minScore}–{maxScore}</p>
                    <p className="font-karla" style={{ fontSize: '0.5rem', color: '#6a6764' }}>possible score</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div style={{ background: 'rgba(240,192,64,0.08)', border: '1px solid rgba(240,192,64,0.15)', borderRadius: 6, padding: '0.2rem 0.6rem', flexShrink: 0 }}>
                    <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#f0c040' }}>Ship {shipFloor}–{base}</p>
                  </div>
                  {assigned.map((card, i) => (
                    <div key={i} className="flex items-center gap-1.5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '0.2rem 0.5rem', minWidth: 0 }}>
                      <img src={IMG_BASE + card.filename} alt={card.name} style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <p className="font-karla truncate" style={{ fontSize: '0.58rem', color: '#f0ede8' }}>{card.name}</p>
                        <p className="font-karla" style={{ fontSize: '0.5rem', color: RARITY_COLORS[card.rarity.toLowerCase()] ?? '#6a6764' }}>up to +{card.power}</p>
                      </div>
                    </div>
                  ))}
                  {assigned.length === 0 && (
                    <p className="font-karla" style={{ fontSize: '0.62rem', color: '#4a4845' }}>No crew — ship bonus only</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FailedView({ reason, expeditionId }: { reason: string; expeditionId: number }) {
  const router = useRouter()
  return (
    <div className="text-center py-8">
      <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>💀</p>
      <p className="font-cinzel font-700 text-[#f0ede8] mb-3" style={{ fontSize: '1.1rem' }}>Expedition Failed</p>
      <p className="font-karla text-[#a0a09a] mb-6" style={{ fontSize: '0.78rem', lineHeight: 1.6 }}>{reason}</p>
      <button
        onClick={() => router.push(`/expeditions/results?id=${expeditionId}`)}
        style={{
          width: '100%',
          padding: '0.875rem',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12,
          cursor: 'pointer',
          fontSize: '0.72rem',
          color: '#a0a09a',
        }}
        className="font-karla font-700 uppercase tracking-[0.1em]"
      >
        Return to Port
      </button>
    </div>
  )
}
