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

function RollingDie({ finalRoll, rolling, color = '#f0c040' }: { finalRoll: number; rolling: boolean; color?: string }) {
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
      background: `${color}15`,
      border: `2px solid ${rolling ? `${color}65` : `${color}30`}`,
      borderRadius: 14,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'border-color 0.3s',
    }}>
      <span className="font-cinzel font-700" style={{ fontSize: '1.6rem', color }}>
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
  const [pendingRoll, setPendingRoll] = useState<number>(1)
  const [pendingCrewRoll, setPendingCrewRoll] = useState<number>(0)
  const [pendingLootRoll, setPendingLootRoll] = useState<number>(1)
  const [lootResult, setLootResult] = useState<LootResult | null>(null)
  const [showStats, setShowStats] = useState(false)

  const eventSequence = dailyContent.event_sequence
  const isFinalLootNode = currentNode >= eventSequence.length
  const currentEvent: EventNode | null = isFinalLootNode ? null : eventSequence[currentNode]

  const currentStat = currentEvent?.mechanics.stat ?? null
  const crewBonusForStat = currentStat
    ? (expedition.crew_loadout[currentStat] ?? []).reduce((s, c) => s + c.power, 0)
    : 0

  const hullMax = HULL_POINTS[expedition.ship_tier] ?? 3
  const shipStats = EXPEDITION_SHIP_STATS[expedition.ship_tier]
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

      // Let the die settle, then linger on the final number before showing result
      if (result.roll !== undefined) setPendingRoll(result.roll)
      if (result.crewRoll !== undefined) setPendingCrewRoll(result.crewRoll ?? 0)
      await new Promise(r => setTimeout(r, 1600))
      setPhase({ type: 'result', result })

      if (result.expeditionFailed) {
        await new Promise(r => setTimeout(r, 1800))
        setPhase({ type: 'failed', reason: result.failReason ?? 'Your ship was destroyed.' })
      }
    })
  }

  function handleContinue() {
    if (phase.type !== 'result') return
    const result = (phase as { type: 'result'; result: EventResult }).result
    const nextNode = result.nodeIndex + 1
    setCurrentNode(nextNode)

    if (nextNode >= eventSequence.length) {
      setPhase({ type: 'loot-rolling' })
      startTransition(async () => {
        const loot = await resolveFinalLoot(expedition.id)
        if ('error' in loot) {
          setPhase({ type: 'event' })
          return
        }
        setPendingLootRoll(loot.roll)
        await new Promise(r => setTimeout(r, 1600))
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
  const activeResult = phase.type === 'result' ? (phase as { type: 'result'; result: EventResult }).result : null

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
          <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progressPct}%`, background: '#f0c040', transition: 'width 0.4s ease', borderRadius: 2 }} />
          </div>
        </div>

        {/* ── EVENT / ROLLING / RESULT (inline) ── */}
        {(phase.type === 'event' || phase.type === 'rolling' || phase.type === 'result') && currentEvent && (
          <EventCard
            event={currentEvent}
            phase={phase}
            result={activeResult}
            pendingRoll={pendingRoll}
            pendingCrewRoll={pendingCrewRoll}
            crewBonusForStat={crewBonusForStat}
            shipTier={expedition.ship_tier}
            onChoice={handleChoiceClick}
            onContinue={handleContinue}
            isPending={isPending}
          />
        )}

        {/* ── LOOT ROLLING ── */}
        {phase.type === 'loot-rolling' && <LootRollingView pendingLootRoll={pendingLootRoll} />}

        {/* ── LOOT RESULT ── */}
        {phase.type === 'loot-result' && lootResult && (
          <LootResultView
            loot={lootResult}
            shipTier={expedition.ship_tier}
            settledRoll={pendingLootRoll}
            onDone={() => router.push(`/expeditions/results?id=${expedition.id}`)}
          />
        )}

        {/* ── FAILED ── */}
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

        {/* Abandon link */}
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

function formatFlavorText(flavor: string): string[] {
  const sentences = flavor.match(/[^.!?]+[.!?]+/g) ?? [flavor]
  const paragraphs: string[] = []
  let current: string[] = []
  for (const sentence of sentences) {
    const isDialogue = sentence.includes('"') || sentence.includes('“') || sentence.includes('”')
    if (isDialogue) {
      if (current.length) { paragraphs.push(current.join(' ')); current = [] }
      paragraphs.push(sentence.trim())
    } else {
      current.push(sentence.trim())
      if (current.length >= 2) { paragraphs.push(current.join(' ')); current = [] }
    }
  }
  if (current.length) paragraphs.push(current.join(' '))
  return paragraphs.filter(p => p.length > 0)
}

function EventCard({
  event, phase, result, pendingRoll, pendingCrewRoll, crewBonusForStat, shipTier, onChoice, onContinue, isPending,
}: {
  event: EventNode
  phase: Phase
  result: EventResult | null
  pendingRoll: number
  pendingCrewRoll: number
  crewBonusForStat: number
  shipTier: number
  onChoice: (i: number) => void
  onContinue: () => void
  isPending: boolean
}) {
  const rolling = phase.type === 'rolling'
  const showResult = phase.type === 'result'
  const rollingChoiceIndex = rolling ? (phase as { type: 'rolling'; choiceIndex: number }).choiceIndex : -1
  const success = result?.outcome === 'success'
  const shipBase = event.mechanics.stat ? EXPEDITION_SHIP_STATS[shipTier][event.mechanics.stat] : 0

  return (
    <div>
      {/* Crisis badge */}
      {event.isCrisis && (
        <p className="font-karla font-700 uppercase tracking-[0.1em] mb-2" style={{ fontSize: '0.52rem', color: '#f87171' }}>
          ⚠ Crisis Event
        </p>
      )}

      {/* Event title */}
      <p className="font-cinzel font-700 text-[#f0ede8] mb-4" style={{ fontSize: '1.2rem', lineHeight: 1.25 }}>
        {event.name}
      </p>

      {/* Flavor text — paragraphs with dialogue pulled out */}
      <div className="flex flex-col gap-3 mb-5">
        {formatFlavorText(event.flavor).map((para, i) => {
          const isDialogue = para.includes('"') || para.includes('"') || para.includes('"')
          return isDialogue ? (
            <p
              key={i}
              className="font-karla"
              style={{
                fontSize: '0.78rem',
                lineHeight: 1.6,
                color: '#e0ddd8',
                fontStyle: 'italic',
                paddingLeft: '0.875rem',
                borderLeft: '2px solid rgba(255,255,255,0.15)',
              }}
            >
              {para}
            </p>
          ) : (
            <p
              key={i}
              className="font-karla"
              style={{ fontSize: '0.78rem', lineHeight: 1.65, color: '#a0a09a' }}
            >
              {para}
            </p>
          )
        })}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginBottom: '1rem' }} />

      {/* Stat + threshold — hide once result is in */}
      {event.mechanics.stat && !showResult && (
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#6a6764', marginBottom: 3 }}>
              Checking
            </p>
            <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#f0ede8' }}>
              {STAT_ICONS[event.mechanics.stat]} {STAT_LABELS[event.mechanics.stat]}
            </p>
            <p className="font-karla" style={{ fontSize: '0.58rem', color: '#4a4845', marginTop: 2 }}>
              Ship {shipBase}{crewBonusForStat > 0 ? ` + Crew up to ${crewBonusForStat}` : ''}
            </p>
          </div>
          {event.mechanics.threshold !== undefined && (
            <div style={{ textAlign: 'right' }}>
              <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.52rem', color: '#6a6764', marginBottom: 3 }}>Need to beat</p>
              <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0c040' }}>
                {event.mechanics.threshold}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Choices */}
      <div className="flex flex-col gap-2.5">
        {event.choices.map((choice, i) => {
          const isChosen = showResult && result?.choiceIndex === i
          const isThisRolling = rolling && rollingChoiceIndex === i

          let bg = 'rgba(255,255,255,0.05)'
          let border = 'rgba(255,255,255,0.1)'
          let opacity = 1
          let textColor = '#f0ede8'

          if (showResult) {
            if (isChosen) {
              bg = success ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)'
              border = success ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.25)'
              textColor = success ? '#4ade80' : '#f87171'
            } else {
              bg = 'rgba(255,255,255,0.02)'
              border = 'rgba(255,255,255,0.05)'
              opacity = 0.25
              textColor = '#6a6764'
            }
          } else if (rolling) {
            if (isThisRolling) {
              bg = 'rgba(240,192,64,0.12)'
              border = 'rgba(240,192,64,0.3)'
              textColor = '#f0c040'
            } else {
              opacity = 0.4
            }
          }

          return (
            <button
              key={i}
              onClick={() => !rolling && !isPending && !showResult && onChoice(i)}
              disabled={rolling || isPending || showResult}
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                background: bg,
                border: `1px solid ${border}`,
                borderRadius: 12,
                cursor: rolling || isPending || showResult ? 'default' : 'pointer',
                opacity,
                textAlign: 'left',
                transition: 'opacity 0.3s, border-color 0.3s, background 0.3s',
              }}
            >
              <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: textColor }}>
                {choice.label}
              </p>
              {isChosen && showResult && (
                <p className="font-karla mt-0.5" style={{ fontSize: '0.6rem', color: textColor, opacity: 0.8 }}>
                  {success ? '✓ This worked' : '✗ This failed'}
                </p>
              )}
              {choice.isNoRoll && !showResult && (
                <p className="font-karla mt-0.5" style={{ fontSize: '0.6rem', color: '#6a6764' }}>
                  {choice.cost ? `Always succeeds · −${choice.cost} ⟡ from loot` : 'Always succeeds'}
                </p>
              )}
            </button>
          )
        })}
      </div>

      {/* Dice — shown while rolling */}
      {rolling && (
        <div className="flex flex-col items-center gap-3 mt-6">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-1.5">
              <RollingDie finalRoll={pendingRoll} rolling={true} color="#f0c040" />
              <p className="font-karla font-600" style={{ fontSize: '0.52rem', color: '#6a6764', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ship</p>
            </div>
            {crewBonusForStat > 0 && (
              <>
                <p style={{ color: '#4a4845', fontSize: '1.1rem', paddingBottom: '1.4rem' }}>+</p>
                <div className="flex flex-col items-center gap-1.5">
                  <RollingDie finalRoll={pendingCrewRoll} rolling={true} color="#60a5fa" />
                  <p className="font-karla font-600" style={{ fontSize: '0.52rem', color: '#6a6764', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Crew</p>
                </div>
              </>
            )}
          </div>
          <p className="font-karla" style={{ fontSize: '0.68rem', color: '#6a6764' }}>Rolling...</p>
        </div>
      )}

      {/* Inline result card */}
      {showResult && result && (
        <ResultCard result={result} shipTier={shipTier} />
      )}

      {/* Continue button */}
      {showResult && (
        <button
          onClick={onContinue}
          style={{
            width: '100%',
            marginTop: '1rem',
            padding: '0.875rem',
            background: success ? 'rgba(74,222,128,0.1)' : 'rgba(240,192,64,0.1)',
            border: `1px solid ${success ? 'rgba(74,222,128,0.25)' : 'rgba(240,192,64,0.2)'}`,
            borderRadius: 12,
            cursor: 'pointer',
            color: success ? '#4ade80' : '#f0c040',
            fontSize: '0.72rem',
          }}
          className="font-karla font-700 uppercase tracking-[0.1em]"
        >
          Continue →
        </button>
      )}
    </div>
  )
}

function ResultCard({ result, shipTier }: { result: EventResult; shipTier: number }) {
  const success = result.outcome === 'success'
  const shipFloor = shipTier + 1
  const accent = success ? '#4ade80' : '#f87171'
  const bg = success ? 'rgba(74,222,128,0.05)' : 'rgba(248,113,113,0.05)'
  const border = success ? 'rgba(74,222,128,0.18)' : 'rgba(248,113,113,0.18)'
  const hasRoll = !result.noRoll && result.roll !== undefined
  const margin = hasRoll
    ? success ? (result.total ?? 0) - (result.threshold ?? 0) : (result.threshold ?? 0) - (result.total ?? 0)
    : null

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, overflow: 'hidden', marginTop: '1.25rem' }}>

      {/* Header */}
      <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {success ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          )}
          <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: accent }}>
            {success ? 'Success' : 'Failed'}
          </p>
          {result.stat && (
            <p className="font-karla" style={{ fontSize: '0.65rem', color: '#6a6764' }}>
              · {STAT_ICONS[result.stat]} {STAT_LABELS[result.stat]}
            </p>
          )}
        </div>
        {margin !== null && (
          <p className="font-karla" style={{ fontSize: '0.6rem', color: accent, opacity: 0.75 }}>
            {success ? `beat by ${margin}` : `short by ${margin}`}
          </p>
        )}
      </div>

      {/* Roll numbers */}
      {hasRoll && (
        <div style={{ padding: '0.875rem 1rem', borderBottom: `1px solid ${border}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <div style={{ textAlign: 'center' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: '#f0c040', lineHeight: 1 }}>{result.roll}</p>
              <p className="font-karla font-600" style={{ fontSize: '0.55rem', color: '#6a6764', marginTop: 3 }}>Ship</p>
              <p className="font-karla" style={{ fontSize: '0.48rem', color: '#4a4845' }}>{shipFloor}–{result.base}</p>
            </div>
            {(result.crewBonus ?? 0) > 0 && (
              <>
                <p style={{ color: '#4a4845', fontSize: '1rem', paddingBottom: '1.1rem' }}>+</p>
                <div style={{ textAlign: 'center' }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: '#60a5fa', lineHeight: 1 }}>{result.crewRoll}</p>
                  <p className="font-karla font-600" style={{ fontSize: '0.55rem', color: '#6a6764', marginTop: 3 }}>Crew</p>
                  <p className="font-karla" style={{ fontSize: '0.48rem', color: '#4a4845' }}>1–{result.crewBonus}</p>
                </div>
              </>
            )}
            <p style={{ color: '#4a4845', fontSize: '1rem', paddingBottom: '1.1rem' }}>=</p>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: accent, lineHeight: 1 }}>{result.total}</p>
              <p className="font-karla font-600" style={{ fontSize: '0.55rem', color: '#6a6764', marginTop: 3 }}>Total</p>
            </div>
            <p style={{ color: '#4a4845', fontSize: '1rem', paddingBottom: '1.1rem' }}>vs</p>
            <div style={{ textAlign: 'center' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: '#a0a09a', lineHeight: 1 }}>{result.threshold}</p>
              <p className="font-karla font-600" style={{ fontSize: '0.55rem', color: '#6a6764', marginTop: 3 }}>Needed</p>
            </div>
          </div>
        </div>
      )}

      {/* Outcome text + consequences */}
      <div style={{ padding: '0.875rem 1rem' }}>
        <p className="font-karla" style={{ fontSize: '0.82rem', color: '#c0bdb8', lineHeight: 1.65 }}>
          {result.text}
        </p>
        {result.hullDamage ? (
          <p className="font-karla" style={{ fontSize: '0.68rem', color: '#f87171', marginTop: 10 }}>
            ⚠ Hull damaged (−1)
          </p>
        ) : null}
        {result.lootPenalty ? (
          <p className="font-karla" style={{ fontSize: '0.68rem', color: '#f59e0b', marginTop: 8 }}>
            ⚠ Loot penalty applied
          </p>
        ) : null}
        {result.costPenalty ? (
          <p className="font-karla" style={{ fontSize: '0.68rem', color: '#f59e0b', marginTop: 8 }}>
            ⟡ −{result.costPenalty} from final loot
          </p>
        ) : null}
      </div>
    </div>
  )
}

function LootRollingView({ pendingLootRoll }: { pendingLootRoll: number }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.2rem' }}>Final Haul</p>
      <RollingDie finalRoll={pendingLootRoll} rolling={true} color="#4ade80" />
      <p className="font-karla text-[#6a6764]" style={{ fontSize: '0.75rem' }}>Rolling luck...</p>
    </div>
  )
}

function LootResultView({ loot, shipTier, settledRoll, onDone }: { loot: LootResult; shipTier: number; settledRoll: number; onDone: () => void }) {
  const shipFloor = shipTier + 1

  return (
    <div>
      <p className="font-cinzel font-700 text-[#f0ede8] mb-4" style={{ fontSize: '1.2rem' }}>Final Haul</p>

      {/* Settled die — visual continuity from the rolling phase */}
      <div className="flex justify-center mb-4">
        <RollingDie finalRoll={settledRoll} rolling={false} color="#4ade80" />
      </div>

      {/* Roll breakdown */}
      <div
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: '0.875rem 1rem',
          marginBottom: '1rem',
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.52rem', color: '#6a6764' }}>🍀 Luck Roll</p>
          {loot.successBonus > 0 && (
            <p className="font-karla" style={{ fontSize: '0.62rem', color: '#4ade80' }}>+{loot.successBonus} success bonus</p>
          )}
        </div>
        <div className="flex items-end gap-3">
          <div style={{ textAlign: 'center' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f0c040', lineHeight: 1 }}>{loot.roll}</p>
            <p className="font-karla" style={{ fontSize: '0.5rem', color: '#6a6764', marginTop: 2 }}>Ship</p>
            <p className="font-karla" style={{ fontSize: '0.44rem', color: '#4a4845' }}>{shipFloor}–{loot.base}</p>
          </div>
          {(loot.crewBonus ?? 0) > 0 && (
            <>
              <p style={{ color: '#4a4845', fontSize: '0.9rem', paddingBottom: '1rem' }}>+</p>
              <div style={{ textAlign: 'center' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#60a5fa', lineHeight: 1 }}>{loot.crewRoll}</p>
                <p className="font-karla" style={{ fontSize: '0.5rem', color: '#6a6764', marginTop: 2 }}>Crew</p>
                <p className="font-karla" style={{ fontSize: '0.44rem', color: '#4a4845' }}>1–{loot.crewBonus}</p>
              </div>
            </>
          )}
          <p style={{ color: '#4a4845', fontSize: '0.9rem', paddingBottom: '1rem' }}>=</p>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f0ede8', lineHeight: 1 }}>{loot.total}</p>
            <p className="font-karla" style={{ fontSize: '0.5rem', color: '#6a6764', marginTop: 2 }}>Total</p>
          </div>
          {loot.successBonus > 0 && (
            <>
              <p style={{ color: '#4a4845', fontSize: '0.9rem', paddingBottom: '1rem' }}>+</p>
              <div style={{ textAlign: 'center' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#4ade80', lineHeight: 1 }}>{loot.successBonus}</p>
                <p className="font-karla" style={{ fontSize: '0.5rem', color: '#6a6764', marginTop: 2 }}>Bonus</p>
              </div>
            </>
          )}
          <p style={{ color: '#4a4845', fontSize: '0.9rem', paddingBottom: '1rem' }}>=</p>
          <div style={{ textAlign: 'center' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#4ade80', lineHeight: 1 }}>{loot.finalScore}</p>
            <p className="font-karla" style={{ fontSize: '0.5rem', color: '#6a6764', marginTop: 2 }}>Score</p>
          </div>
        </div>
      </div>

      {/* Doubloons earned */}
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
        <p className="font-karla font-600 uppercase tracking-[0.1em] mb-1" style={{ fontSize: '0.52rem', color: '#6a6764' }}>Doubloons Earned</p>
        <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '1.8rem' }}>
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
