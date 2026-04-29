'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  takeCombatAction, makeEventChoice, buyShopItem, leaveShop, claimZoneReward,
  type CombatActionResult, type EventChoiceResult,
} from '../actions'
import {
  ENEMIES, EXPEDITION_SHIP_STATS, ZONES, EXPEDITION_ITEMS, RARITY_COLORS,
  computeTotalCrewStats,
  type Expedition, type NodeType, type CombatAction, type CombatRoundLog,
  type EventNodeDef, type ShopOption, type ZoneLoot, type RunBuff, type ShipStats, type EnemyDef,
} from '@/lib/expeditions'

const IMG_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/card-arts/'

interface Props {
  expedition: Expedition
  nodeType: NodeType
  currentEvent: EventNodeDef | null
  shopOptions: ShopOption[] | null
  zoneName: string
  zoneIcon: string
}

type Phase =
  | { type: 'idle' }
  | { type: 'resolving' }
  | { type: 'round_result'; log: CombatRoundLog }
  | { type: 'zone_complete' }
  | { type: 'failed' }
  | { type: 'event' }
  | { type: 'event_result'; result: EventChoiceResult }
  | { type: 'shop' }
  | { type: 'claiming_loot' }
  | { type: 'loot_result'; loot: ZoneLoot }

export default function VoyagePage({ expedition: initExp, nodeType: initNodeType, currentEvent: initEvent, shopOptions, zoneName, zoneIcon }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [exp, setExp] = useState(initExp)
  const [nodeType, setNodeType] = useState<NodeType>(initNodeType)
  const [phase, setPhase] = useState<Phase>(
    initNodeType === 'event' ? { type: 'event' }
    : initNodeType === 'shop'  ? { type: 'shop'  }
    : { type: 'idle' }
  )
  const [showCrewSheet, setShowCrewSheet] = useState(false)

  const ship = EXPEDITION_SHIP_STATS[exp.ship_tier] ?? EXPEDITION_SHIP_STATS[0]
  const runBuffs: RunBuff[] = exp.run_buffs ?? []
  const durabilityBuff = runBuffs.filter(b => b.effect === 'durability').reduce((s, b) => s + b.value, 0)
  const maxDurability = ship.durability + durabilityBuff
  const currentDurability = Math.max(0, maxDurability - (exp.hull_damage ?? 0))
  const crew = computeTotalCrewStats(exp.crew_loadout ?? [])
  const cs = exp.combat_state
  const enemy: EnemyDef | null = cs ? ENEMIES[cs.enemyId] ?? null : null

  const zone = ZONES[exp.zone]
  const totalNodes = zone.nodes.length
  const progressPct = Math.min((exp.current_node / totalNodes) * 100, 100)

  function advanceToNextNode(nextNodeIndex: number, zoneComplete: boolean) {
    if (zoneComplete) {
      setPhase({ type: 'zone_complete' })
      return
    }
    const nextNode = zone.nodes[nextNodeIndex]
    setNodeType(nextNode?.type ?? 'fight')
    setPhase(
      nextNode?.type === 'event' ? { type: 'event' } :
      nextNode?.type === 'shop'  ? { type: 'shop'  } :
      { type: 'idle' }
    )
  }

  function handleCombatAction(action: CombatAction) {
    if (isPending || (phase.type !== 'idle' && phase.type !== 'round_result')) return
    setPhase({ type: 'resolving' })
    startTransition(async () => {
      const result = await takeCombatAction(exp.id, action)
      if ('error' in result) { setPhase({ type: 'idle' }); return }

      setExp(prev => ({
        ...prev,
        hull_damage: maxDurability - result.newDurability,
        combat_state: result.combatOver ? null : result.newCombatState,
        current_node: result.combatOver && !result.expeditionFailed
          ? prev.current_node + 1
          : prev.current_node,
        status: result.expeditionFailed ? 'failed' : prev.status,
      }))

      setPhase({ type: 'round_result', log: result.roundLog })

      if (result.combatOver) {
        await new Promise(r => setTimeout(r, 1600))
        if (result.expeditionFailed) {
          setPhase({ type: 'failed' })
        } else {
          advanceToNextNode(exp.current_node + 1, result.zoneComplete)
        }
      }
    })
  }

  function handleNextRound() {
    setPhase({ type: 'idle' })
  }

  function handleEventChoice(choiceIndex: number) {
    if (isPending) return
    startTransition(async () => {
      const result = await makeEventChoice(exp.id, choiceIndex)
      if ('error' in result) return
      setExp(prev => ({
        ...prev,
        current_node: result.newCurrentNode,
        hull_damage: result.newDurability !== undefined ? maxDurability - result.newDurability : prev.hull_damage,
        run_buffs: result.buff ? [...(prev.run_buffs ?? []), result.buff] : prev.run_buffs,
      }))
      setPhase({ type: 'event_result', result })
    })
  }

  function handleEventContinue(result: EventChoiceResult) {
    advanceToNextNode(result.newCurrentNode, result.zoneComplete)
  }

  function handleLeaveShop() {
    if (isPending) return
    startTransition(async () => {
      const result = await leaveShop(exp.id)
      if ('error' in result) return
      setExp(prev => ({ ...prev, current_node: result.newCurrentNode }))
      advanceToNextNode(result.newCurrentNode, result.zoneComplete)
    })
  }

  function handleClaimLoot() {
    setPhase({ type: 'claiming_loot' })
    startTransition(async () => {
      const loot = await claimZoneReward(exp.id)
      if ('error' in loot) return
      window.dispatchEvent(new CustomEvent('doubloons-changed'))
      setPhase({ type: 'loot_result', loot })
    })
  }

  return (
    <main className="min-h-screen pb-24 sm:pb-0 pt-5" style={{ position: 'relative', zIndex: 1 }}>
      <div className="px-5 max-w-lg mx-auto">

        {/* Progress header */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '0.9rem' }}>{zoneIcon}</span>
              <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: '#6a6764' }}>{zoneName}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowCrewSheet(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.52rem', color: '#6a6764' }}
                className="font-karla font-600 uppercase tracking-[0.08em]"
              >
                ⚓ Crew
              </button>
              <div className="flex items-center gap-1.5">
                <div style={{ width: 44, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(currentDurability / maxDurability) * 100}%`,
                    background: currentDurability / maxDurability < 0.3 ? '#f87171' : currentDurability / maxDurability < 0.6 ? '#f0c040' : '#60a5fa',
                    borderRadius: 2, transition: 'width 0.4s ease, background 0.4s ease',
                  }} />
                </div>
                <p className="font-karla" style={{ fontSize: '0.58rem', color: '#6a6764' }}>{currentDurability}/{maxDurability}</p>
              </div>
              <p className="font-karla" style={{ fontSize: '0.58rem', color: '#6a6764' }}>{exp.current_node + 1}/{totalNodes}</p>
            </div>
          </div>
          <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progressPct}%`, background: '#f0c040', borderRadius: 2, transition: 'width 0.4s ease' }} />
          </div>
        </div>

        {/* Combat */}
        {(nodeType === 'fight' || nodeType === 'boss') && enemy && cs && (
          <CombatView
            enemy={enemy}
            cs={cs}
            phase={phase}
            crew={crew}
            ship={ship}
            runBuffs={runBuffs}
            isBoss={nodeType === 'boss'}
            isPending={isPending}
            onAction={handleCombatAction}
            onNextRound={handleNextRound}
          />
        )}

        {/* Event */}
        {nodeType === 'event' && (phase.type === 'event' || phase.type === 'event_result') && initEvent && (
          <EventView
            event={initEvent}
            phase={phase}
            isPending={isPending}
            onChoice={handleEventChoice}
            onContinue={handleEventContinue}
          />
        )}

        {/* Shop */}
        {nodeType === 'shop' && phase.type === 'shop' && shopOptions && (
          <ShopView
            options={shopOptions}
            expeditionId={exp.id}
            isPending={isPending}
            onLeave={handleLeaveShop}
          />
        )}

        {/* Zone complete */}
        {phase.type === 'zone_complete' && (
          <ZoneCompleteView onClaim={handleClaimLoot} isPending={isPending} />
        )}

        {/* Claiming */}
        {phase.type === 'claiming_loot' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.2rem' }}>Counting the haul...</p>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(240,192,64,0.3)', borderTopColor: '#f0c040', animation: 'spin 1s linear infinite' }} />
          </div>
        )}

        {/* Loot result */}
        {phase.type === 'loot_result' && (
          <LootResultView loot={(phase as { type: 'loot_result'; loot: ZoneLoot }).loot} onDone={() => router.push('/expeditions')} />
        )}

        {/* Failed */}
        {phase.type === 'failed' && (
          <FailedView onDone={() => router.push('/expeditions')} />
        )}

      </div>

      {showCrewSheet && (
        <CrewSheet
          expedition={exp}
          ship={ship}
          crew={crew}
          maxDurability={maxDurability}
          currentDurability={currentDurability}
          runBuffs={runBuffs}
          onClose={() => setShowCrewSheet(false)}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  )
}

// ── Combat ────────────────────────────────────────────────────────────────────

function CombatView({ enemy, cs, phase, crew, ship, runBuffs, isBoss, isPending, onAction, onNextRound }: {
  enemy: EnemyDef
  cs: NonNullable<Expedition['combat_state']>
  phase: Phase
  crew: { power: number; dodge: number; fortune: number }
  ship: ShipStats
  runBuffs: RunBuff[]
  isBoss: boolean
  isPending: boolean
  onAction: (a: CombatAction) => void
  onNextRound: () => void
}) {
  const resolving = phase.type === 'resolving'
  const showResult = phase.type === 'round_result'
  const log = showResult ? (phase as { type: 'round_result'; log: CombatRoundLog }).log : null
  const buttonsDisabled = resolving || isPending || showResult

  const buffPower = runBuffs.filter(b => b.effect === 'power').reduce((s, b) => s + b.value, 0)
  const effectivePower = crew.power + buffPower

  const chargeLabel = cs.playerCharges === 0 ? null
    : cs.playerCharges === 1 ? '1×'
    : cs.playerCharges === 2 ? '2.5×'
    : '5×'

  const actions: { action: CombatAction; label: string; sublabel: string; color: string; icon: string; dim?: boolean }[] = [
    {
      action: 'reload',
      label: 'Reload',
      sublabel: 'Load 1 charge · Open to attack this round',
      color: '#60a5fa',
      icon: '⚙',
    },
    {
      action: 'fire',
      label: cs.playerCharges === 0
        ? 'Fire (no charges — acts as reload)'
        : `Fire · ${cs.playerCharges} charge${cs.playerCharges > 1 ? 's' : ''} · ${chargeLabel} dmg`,
      sublabel: 'Spend all charges · Open to attack this round',
      color: '#f87171',
      icon: '💥',
      dim: cs.playerCharges === 0,
    },
    {
      action: 'defend',
      label: 'Defend',
      sublabel: `${Math.min(crew.dodge * 5, 70)}% dodge · Bonus dmg reduction if hit`,
      color: '#4ade80',
      icon: '🛡',
    },
  ]

  return (
    <div>
      {isBoss && (
        <p className="font-karla font-700 uppercase tracking-[0.12em] mb-2" style={{ fontSize: '0.52rem', color: '#f87171' }}>⚠ Boss Encounter</p>
      )}

      {/* Enemy card */}
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${isBoss ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 14, padding: '1rem', marginBottom: '1rem',
      }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>{enemy.name}</p>
            <p className="font-karla" style={{ fontSize: '0.6rem', color: '#6a6764', marginTop: 1 }}>
              {cs.enemyCharges > 0 ? `${cs.enemyCharges} charge${cs.enemyCharges > 1 ? 's' : ''} loaded` : 'Cannons empty'} · {enemy.damage} dmg/shot
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: cs.enemyHp / enemy.maxHp < 0.3 ? '#f87171' : '#f0ede8' }}>
              {cs.enemyHp}<span style={{ fontSize: '0.65rem', color: '#4a4845' }}>/{enemy.maxHp}</span>
            </p>
          </div>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${(cs.enemyHp / enemy.maxHp) * 100}%`,
            background: cs.enemyHp / enemy.maxHp < 0.3 ? '#f87171' : '#a78bfa',
            borderRadius: 2, transition: 'width 0.4s ease',
          }} />
        </div>
        <div className="flex gap-1.5 mt-2.5 items-center">
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i < cs.enemyCharges ? '#a78bfa' : 'rgba(255,255,255,0.08)' }} />
          ))}
          <p className="font-karla" style={{ fontSize: '0.5rem', color: '#4a4845', marginLeft: 4 }}>Enemy charges</p>
        </div>
      </div>

      {/* Round result */}
      {showResult && log && <RoundResultCard log={log} />}

      {/* Player charges */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '0.75rem', padding: '0.625rem 0.875rem',
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10,
      }}>
        <div>
          <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#6a6764', marginBottom: 3 }}>Your Cannons</p>
          <div className="flex gap-1.5 items-center">
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: i < cs.playerCharges ? '#f0c040' : 'rgba(255,255,255,0.08)', transition: 'background 0.3s' }} />
            ))}
            {chargeLabel && (
              <p className="font-cinzel font-700" style={{ fontSize: '0.7rem', color: '#f0c040', marginLeft: 6 }}>{chargeLabel}</p>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#6a6764', marginBottom: 2 }}>Power</p>
          <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#f87171' }}>
            {effectivePower}
            {buffPower > 0 && <span style={{ fontSize: '0.55rem', color: '#4ade80' }}> +{buffPower}</span>}
          </p>
        </div>
      </div>

      {/* Action buttons or Next Round */}
      {showResult ? (
        <button
          onClick={onNextRound}
          disabled={isPending}
          style={{ width: '100%', padding: '0.875rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, cursor: 'pointer', fontSize: '0.72rem', color: '#a0a09a' }}
          className="font-karla font-700 uppercase tracking-[0.1em]"
        >
          Next Round →
        </button>
      ) : (
        <div className="flex flex-col gap-2.5">
          {actions.map(btn => (
            <button
              key={btn.action}
              onClick={() => onAction(btn.action)}
              disabled={buttonsDisabled}
              style={{
                padding: '0.875rem 1rem',
                background: buttonsDisabled ? 'rgba(255,255,255,0.03)' : `${btn.color}10`,
                border: `1px solid ${buttonsDisabled ? 'rgba(255,255,255,0.07)' : `${btn.color}35`}`,
                borderRadius: 12,
                cursor: buttonsDisabled ? 'default' : 'pointer',
                textAlign: 'left',
                opacity: (btn.dim && !buttonsDisabled) ? 0.55 : 1,
                transition: 'opacity 0.2s, background 0.2s',
              }}
            >
              <p className="font-karla font-600" style={{ fontSize: '0.82rem', color: buttonsDisabled ? '#6a6764' : btn.color }}>
                {btn.icon} {btn.label}
              </p>
              <p className="font-karla" style={{ fontSize: '0.6rem', color: '#4a4845', marginTop: 2 }}>{btn.sublabel}</p>
            </button>
          ))}
        </div>
      )}

      {resolving && (
        <p className="font-karla text-center mt-4" style={{ fontSize: '0.65rem', color: '#6a6764' }}>Resolving...</p>
      )}
    </div>
  )
}

// ── Round result card ─────────────────────────────────────────────────────────

function RoundResultCard({ log }: { log: CombatRoundLog }) {
  const actionLabel = (a: CombatAction, charges: number) =>
    a === 'reload' ? 'Reloaded' : a === 'fire' ? `Fired (${charges}×)` : 'Defended'

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 12, padding: '0.875rem 1rem', marginBottom: '0.875rem',
    }}>
      <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#6a6764', marginBottom: '0.5rem' }}>
        Round {log.round + 1}
      </p>
      <div className="flex gap-4 mb-3">
        <div style={{ flex: 1 }}>
          <p className="font-karla" style={{ fontSize: '0.58rem', color: '#6a6764', marginBottom: 2 }}>You</p>
          <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#f0ede8' }}>{actionLabel(log.playerAction, log.playerChargesBefore)}</p>
        </div>
        <div style={{ flex: 1 }}>
          <p className="font-karla" style={{ fontSize: '0.58rem', color: '#6a6764', marginBottom: 2 }}>Enemy</p>
          <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#f0ede8' }}>{actionLabel(log.enemyAction, log.enemyChargesBefore)}</p>
        </div>
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '0.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {log.playerDamageDealt > 0 && (
          <p className="font-karla" style={{ fontSize: '0.65rem', color: '#a78bfa' }}>
            {log.critHit ? '⚡ Crit! ' : ''}You dealt <strong>{log.playerDamageDealt}</strong>
          </p>
        )}
        {log.playerDodged && (
          <p className="font-karla" style={{ fontSize: '0.65rem', color: '#4ade80' }}>Dodged!</p>
        )}
        {log.playerDamageTaken > 0 && (
          <p className="font-karla" style={{ fontSize: '0.65rem', color: '#f87171' }}>
            You took <strong>{log.playerDamageTaken}</strong>
          </p>
        )}
        {log.playerDamageDealt === 0 && !log.playerDodged && log.playerDamageTaken === 0 && (
          <p className="font-karla" style={{ fontSize: '0.65rem', color: '#4a4845' }}>Stalemate</p>
        )}
      </div>
    </div>
  )
}

// ── Event ─────────────────────────────────────────────────────────────────────

function EventView({ event, phase, isPending, onChoice, onContinue }: {
  event: EventNodeDef
  phase: Phase
  isPending: boolean
  onChoice: (i: number) => void
  onContinue: (r: EventChoiceResult) => void
}) {
  const showResult = phase.type === 'event_result'
  const result = showResult ? (phase as { type: 'event_result'; result: EventChoiceResult }).result : null

  return (
    <div>
      <p className="font-karla font-700 uppercase tracking-[0.12em] mb-2" style={{ fontSize: '0.52rem', color: '#f0c040' }}>Event</p>
      <p className="font-cinzel font-700 text-[#f0ede8] mb-4" style={{ fontSize: '1.15rem', lineHeight: 1.25 }}>{event.name}</p>
      <p className="font-karla mb-5" style={{ fontSize: '0.78rem', color: '#a0a09a', lineHeight: 1.65 }}>{event.flavor}</p>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginBottom: '1rem' }} />
      {!showResult ? (
        <div className="flex flex-col gap-2.5">
          {event.choices.map((choice, i) => (
            <button
              key={i}
              onClick={() => !isPending && onChoice(i)}
              disabled={isPending}
              style={{ padding: '0.875rem 1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, cursor: isPending ? 'default' : 'pointer', textAlign: 'left', opacity: isPending ? 0.6 : 1 }}
            >
              <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: '#f0ede8' }}>{choice.label}</p>
            </button>
          ))}
        </div>
      ) : result ? (
        <div>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '0.875rem 1rem', marginBottom: '1rem' }}>
            {result.effectType === 'heal'      && result.value > 0      && <p className="font-karla" style={{ fontSize: '0.78rem', color: '#4ade80' }}>✦ Hull repaired (+{result.value} Durability)</p>}
            {result.effectType === 'damage'    && result.value > 0      && <p className="font-karla" style={{ fontSize: '0.78rem', color: '#f87171' }}>⚠ Hull damaged (−{result.value} Durability)</p>}
            {result.effectType === 'doubloons' && (result.doubloonBonus ?? 0) > 0 && <p className="font-karla" style={{ fontSize: '0.78rem', color: '#f0c040' }}>✦ +{result.doubloonBonus} ⟡ found</p>}
            {result.effectType === 'buff'      && result.buff           && <p className="font-karla" style={{ fontSize: '0.78rem', color: '#a78bfa' }}>✦ +{result.buff.value} {result.buff.effect} for this run</p>}
            {result.effectType === 'nothing'   && <p className="font-karla" style={{ fontSize: '0.78rem', color: '#6a6764' }}>You press on.</p>}
          </div>
          <button
            onClick={() => onContinue(result)}
            style={{ width: '100%', padding: '0.875rem', background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.2)', borderRadius: 12, cursor: 'pointer', fontSize: '0.72rem', color: '#f0c040' }}
            className="font-karla font-700 uppercase tracking-[0.1em]"
          >
            Continue →
          </button>
        </div>
      ) : null}
    </div>
  )
}

// ── Shop ──────────────────────────────────────────────────────────────────────

function ShopView({ options, expeditionId, isPending, onLeave }: {
  options: ShopOption[]
  expeditionId: number
  isPending: boolean
  onLeave: () => void
}) {
  const [, startTransition] = useTransition()
  const [purchased, setPurchased] = useState<string[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)

  function buy(itemId: string) {
    startTransition(async () => {
      const result = await buyShopItem(expeditionId, itemId)
      if ('error' in result) { setFeedback(result.error); return }
      setPurchased(prev => [...prev, itemId])
      setFeedback(null)
      window.dispatchEvent(new CustomEvent('doubloons-changed'))
    })
  }

  return (
    <div>
      <p className="font-karla font-700 uppercase tracking-[0.12em] mb-2" style={{ fontSize: '0.52rem', color: '#4ade80' }}>⚓ Port Stop</p>
      <p className="font-cinzel font-700 text-[#f0ede8] mb-1" style={{ fontSize: '1.15rem' }}>Supply Shop</p>
      <p className="font-karla mb-5" style={{ fontSize: '0.72rem', color: '#6a6764' }}>Spend doubloons to prepare for what lies ahead.</p>
      <div className="flex flex-col gap-2.5 mb-4">
        {options.map(opt => {
          const bought = purchased.includes(opt.id)
          return (
            <div key={opt.id} style={{
              padding: '0.875rem 1rem',
              background: bought ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${bought ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: bought ? '#4ade80' : '#f0ede8' }}>{opt.label}</p>
                <p className="font-karla" style={{ fontSize: '0.6rem', color: '#6a6764', marginTop: 1 }}>{opt.description}</p>
              </div>
              {bought ? (
                <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#4ade80', flexShrink: 0 }}>✓ Bought</p>
              ) : (
                <button
                  onClick={() => buy(opt.id)}
                  disabled={isPending}
                  style={{ flexShrink: 0, padding: '0.4rem 0.75rem', background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.25)', borderRadius: 8, cursor: 'pointer', fontSize: '0.65rem', color: '#f0c040' }}
                  className="font-karla font-700"
                >
                  {opt.cost} ⟡
                </button>
              )}
            </div>
          )
        })}
      </div>
      {feedback && <p className="font-karla mb-3" style={{ fontSize: '0.65rem', color: '#f87171' }}>{feedback}</p>}
      <button
        onClick={onLeave}
        disabled={isPending}
        style={{ width: '100%', padding: '0.875rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, cursor: 'pointer', fontSize: '0.72rem', color: '#a0a09a' }}
        className="font-karla font-700 uppercase tracking-[0.1em]"
      >
        Set Sail →
      </button>
    </div>
  )
}

// ── Zone complete ─────────────────────────────────────────────────────────────

function ZoneCompleteView({ onClaim, isPending }: { onClaim: () => void; isPending: boolean }) {
  return (
    <div className="text-center py-8">
      <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚓</p>
      <p className="font-cinzel font-700 text-[#f0ede8] mb-2" style={{ fontSize: '1.3rem' }}>Zone Clear!</p>
      <p className="font-karla mb-6" style={{ fontSize: '0.78rem', color: '#a0a09a', lineHeight: 1.6 }}>
        You&apos;ve defeated Barnacle Pete and claimed these waters.
      </p>
      <button
        onClick={onClaim}
        disabled={isPending}
        style={{ width: '100%', padding: '0.875rem', background: 'rgba(240,192,64,0.15)', border: '1px solid rgba(240,192,64,0.3)', borderRadius: 12, cursor: 'pointer', fontSize: '0.78rem', color: '#f0c040' }}
        className="font-karla font-700 uppercase tracking-[0.1em]"
      >
        {isPending ? 'Collecting...' : 'Claim Reward →'}
      </button>
    </div>
  )
}

// ── Loot result ───────────────────────────────────────────────────────────────

function LootResultView({ loot, onDone }: { loot: ZoneLoot; onDone: () => void }) {
  const item = loot.itemDropped ? EXPEDITION_ITEMS[loot.itemDropped] : null
  return (
    <div className="py-4">
      <p className="font-karla font-700 uppercase tracking-[0.12em] mb-3" style={{ fontSize: '0.52rem', color: '#f0c040' }}>Zone Reward</p>
      <div style={{ background: 'rgba(240,192,64,0.06)', border: '1px solid rgba(240,192,64,0.15)', borderRadius: 14, padding: '1.25rem', marginBottom: '0.75rem', textAlign: 'center' }}>
        <p className="font-karla font-600 uppercase tracking-[0.1em] mb-1" style={{ fontSize: '0.52rem', color: '#6a6764' }}>Doubloons Earned</p>
        <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '2rem' }}>+{loot.doubloons.toLocaleString()} ⟡</p>
      </div>
      {item && (
        <div style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 14, padding: '1rem', marginBottom: '0.75rem' }}>
          <p className="font-karla font-600 uppercase tracking-[0.1em] mb-1" style={{ fontSize: '0.52rem', color: '#a78bfa' }}>Rare Drop!</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0ede8', marginBottom: 2 }}>{item.name}</p>
          <p className="font-karla" style={{ fontSize: '0.65rem', color: '#6a6764' }}>{item.effectDescription}</p>
        </div>
      )}
      <button
        onClick={onDone}
        style={{ width: '100%', padding: '0.875rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, cursor: 'pointer', fontSize: '0.72rem', color: '#a0a09a' }}
        className="font-karla font-700 uppercase tracking-[0.1em]"
      >
        Return to Port
      </button>
    </div>
  )
}

// ── Failed ────────────────────────────────────────────────────────────────────

function FailedView({ onDone }: { onDone: () => void }) {
  return (
    <div className="text-center py-8">
      <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>💀</p>
      <p className="font-cinzel font-700 text-[#f0ede8] mb-3" style={{ fontSize: '1.1rem' }}>Ship Destroyed</p>
      <p className="font-karla text-[#a0a09a] mb-6" style={{ fontSize: '0.78rem', lineHeight: 1.6 }}>
        Your hull couldn&apos;t take any more. You limp back to port.
      </p>
      <button
        onClick={onDone}
        style={{ width: '100%', padding: '0.875rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, cursor: 'pointer', fontSize: '0.72rem', color: '#a0a09a' }}
        className="font-karla font-700 uppercase tracking-[0.1em]"
      >
        Return to Port
      </button>
    </div>
  )
}

// ── Crew sheet ────────────────────────────────────────────────────────────────

function CrewSheet({ expedition, ship, crew, maxDurability, currentDurability, runBuffs, onClose }: {
  expedition: Expedition
  ship: ShipStats
  crew: { power: number; dodge: number; fortune: number }
  maxDurability: number
  currentDurability: number
  runBuffs: RunBuff[]
  onClose: () => void
}) {
  const buffPower = runBuffs.filter(b => b.effect === 'power').reduce((s, b) => s + b.value, 0)
  const buffArmor = runBuffs.filter(b => b.effect === 'armor').reduce((s, b) => s + b.value, 0)
  const buffDodge = runBuffs.filter(b => b.effect === 'dodge').reduce((s, b) => s + b.value, 0)

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0f0f0e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.9rem' }}>{ship.name} — Run Stats</p>
          <button onClick={onClose} style={{ color: '#6a6764', background: 'none', border: 'none', cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">
          <div>
            <p className="font-karla font-600 uppercase tracking-[0.1em] mb-2" style={{ fontSize: '0.52rem', color: '#6a6764' }}>Ship</p>
            <div className="flex gap-5">
              {[
                { label: 'Durability', val: `${currentDurability}/${maxDurability}`, color: '#60a5fa' },
                { label: 'Speed',      val: String(ship.speed),                       color: '#f0c040' },
                { label: 'Armor',      val: String(ship.armor + buffArmor),            color: '#4ade80' },
              ].map(s => (
                <div key={s.label}>
                  <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.48rem', color: '#6a6764', marginBottom: 2 }}>{s.label}</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: s.color }}>{s.val}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="font-karla font-600 uppercase tracking-[0.1em] mb-2" style={{ fontSize: '0.52rem', color: '#6a6764' }}>Crew Totals</p>
            <div className="flex gap-5">
              {[
                { label: 'Power',   val: crew.power + buffPower,   color: '#f87171' },
                { label: 'Dodge',   val: crew.dodge + buffDodge,   color: '#60a5fa' },
                { label: 'Fortune', val: crew.fortune,              color: '#f0c040' },
              ].map(s => (
                <div key={s.label}>
                  <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.48rem', color: '#6a6764', marginBottom: 2 }}>{s.label}</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: s.color }}>{s.val}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="font-karla font-600 uppercase tracking-[0.1em] mb-2" style={{ fontSize: '0.52rem', color: '#6a6764' }}>Crew</p>
            <div className="flex flex-col gap-2">
              {(expedition.crew_loadout ?? []).map((card, i) => (
                <div key={i} className="flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0.5rem 0.625rem' }}>
                  <img src={IMG_BASE + card.filename} alt={card.name} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#f0ede8' }}>{card.name}</p>
                    <p className="font-karla" style={{ fontSize: '0.55rem', color: RARITY_COLORS[card.rarity.toLowerCase()] ?? '#6a6764' }}>{card.rarity}</p>
                  </div>
                  <div className="flex gap-3">
                    {[{ v: card.power, c: '#f87171', l: 'PWR' }, { v: card.dodge, c: '#60a5fa', l: 'DGE' }, { v: card.fortune, c: '#f0c040', l: 'FTN' }].map(s => (
                      <div key={s.l} style={{ textAlign: 'center' }}>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: s.c }}>{s.v}</p>
                        <p className="font-karla" style={{ fontSize: '0.42rem', color: '#4a4845' }}>{s.l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {runBuffs.length > 0 && (
            <div>
              <p className="font-karla font-600 uppercase tracking-[0.1em] mb-2" style={{ fontSize: '0.52rem', color: '#6a6764' }}>Active Buffs</p>
              <div className="flex flex-col gap-1.5">
                {runBuffs.map((buff, i) => (
                  <p key={i} className="font-karla" style={{ fontSize: '0.65rem', color: '#4ade80' }}>
                    ✦ +{buff.value} {buff.effect} ({buff.source.replace(/_/g, ' ')})
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
