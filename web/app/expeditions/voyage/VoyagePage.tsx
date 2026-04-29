'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  takeCombatAction, makeEventChoice, buyShopItem, leaveShop, claimZoneReward,
  type CombatActionResult, type EventChoiceResult,
} from '../actions'
import {
  ENEMIES, EXPEDITION_SHIP_STATS, ZONES, EXPEDITION_ITEMS, RARITY_COLORS,
  CORAL_RUN_EVENTS, CORAL_RUN_SHOP,
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
  const [currentEvent, setCurrentEvent] = useState<EventNodeDef | null>(initEvent)
  const [activeShopOptions, setActiveShopOptions] = useState<ShopOption[] | null>(shopOptions)
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
    const nextType = nextNode?.type ?? 'fight'
    setNodeType(nextType)
    if (nextType === 'event') {
      const pool = CORAL_RUN_EVENTS
      const idx = (exp.id * 997 + nextNodeIndex * 31) % pool.length
      setCurrentEvent(pool[idx])
      setPhase({ type: 'event' })
    } else if (nextType === 'shop') {
      setActiveShopOptions(CORAL_RUN_SHOP)
      setPhase({ type: 'shop' })
    } else {
      setPhase({ type: 'idle' })
    }
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
        // Keep old cs alive so the arena stays visible during the round-result delay
        combat_state: result.combatOver ? prev.combat_state : result.newCombatState,
        current_node: result.combatOver && !result.expeditionFailed
          ? prev.current_node + 1
          : prev.current_node,
        status: result.expeditionFailed ? 'failed' : prev.status,
        run_gold: result.combatOver && result.goldEarned > 0
          ? (prev.run_gold ?? 0) + result.goldEarned
          : prev.run_gold,
      }))

      setPhase({ type: 'round_result', log: result.roundLog })

      if (result.combatOver) {
        await new Promise(r => setTimeout(r, 1600))
        if (result.expeditionFailed) {
          setPhase({ type: 'failed' })
        } else {
          // Apply next node's combat state (new enemy, or null for event/shop)
          setExp(prev => ({ ...prev, combat_state: result.newCombatState }))
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
        run_gold: result.goldBonus ? (prev.run_gold ?? 0) + result.goldBonus : prev.run_gold,
      }))
      setPhase({ type: 'event_result', result })
    })
  }

  function handleEventContinue(result: EventChoiceResult) {
    setExp(prev => ({ ...prev, combat_state: result.newCombatState }))
    advanceToNextNode(result.newCurrentNode, result.zoneComplete)
  }

  function handleLeaveShop() {
    if (isPending) return
    startTransition(async () => {
      const result = await leaveShop(exp.id)
      if ('error' in result) return
      setExp(prev => ({ ...prev, current_node: result.newCurrentNode, combat_state: result.newCombatState }))
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
              <p className="font-karla font-700" style={{ fontSize: '0.62rem', color: '#f0c040' }}>
                ✦ {exp.run_gold ?? 0}
              </p>
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
            currentDurability={currentDurability}
            maxDurability={maxDurability}
            onAction={handleCombatAction}
            onNextRound={handleNextRound}
          />
        )}

        {/* Event */}
        {nodeType === 'event' && (phase.type === 'event' || phase.type === 'event_result') && currentEvent && (
          <EventView
            event={currentEvent}
            phase={phase}
            isPending={isPending}
            onChoice={handleEventChoice}
            onContinue={handleEventContinue}
          />
        )}

        {/* Shop */}
        {nodeType === 'shop' && phase.type === 'shop' && activeShopOptions && (
          <ShopView
            options={activeShopOptions}
            expeditionId={exp.id}
            runGold={exp.run_gold ?? 0}
            onRunGoldChange={(newGold) => setExp(prev => ({ ...prev, run_gold: newGold }))}
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

const ENEMY_AVATAR: Record<string, string> = {
  brute:          '⚔',
  sniper:         '🔭',
  barnacle_pete:  '🐡',
}

function CombatView({ enemy, cs, phase, crew, ship, runBuffs, isBoss, isPending, currentDurability, maxDurability, onAction, onNextRound }: {
  enemy: EnemyDef
  cs: NonNullable<Expedition['combat_state']>
  phase: Phase
  crew: { power: number; dodge: number; fortune: number }
  ship: ShipStats
  runBuffs: RunBuff[]
  isBoss: boolean
  isPending: boolean
  currentDurability: number
  maxDurability: number
  onAction: (a: CombatAction) => void
  onNextRound: () => void
}) {
  const resolving = phase.type === 'resolving'
  const showResult = phase.type === 'round_result'
  const log = showResult ? (phase as { type: 'round_result'; log: CombatRoundLog }).log : null
  const buttonsDisabled = resolving || isPending || showResult

  const buffPower = runBuffs.filter(b => b.effect === 'power').reduce((s, b) => s + b.value, 0)
  const buffArmor = runBuffs.filter(b => b.effect === 'armor').reduce((s, b) => s + b.value, 0)
  const effectivePower = crew.power + buffPower
  const effectiveArmor = ship.armor + buffArmor
  const dodgeChance = Math.min(crew.dodge * 5, 70)

  const playerHpPct = maxDurability > 0 ? (currentDurability / maxDurability) * 100 : 0
  const enemyHpPct = (cs.enemyHp / enemy.maxHp) * 100
  const playerHpColor = playerHpPct < 30 ? '#f87171' : playerHpPct < 60 ? '#f0c040' : '#60a5fa'
  const enemyColor = isBoss ? '#f87171' : '#a78bfa'
  const enemyHpColor = enemyHpPct < 30 ? '#f87171' : enemyColor

  const fireMultLabel = cs.playerCharges === 0 ? '—' : cs.playerCharges === 1 ? '×1' : cs.playerCharges === 2 ? '×2.5' : '×5'

  return (
    <div>
      {isBoss && (
        <p className="font-karla font-700 uppercase tracking-[0.14em] mb-2 text-center" style={{ fontSize: '0.5rem', color: '#f87171', letterSpacing: '0.2em' }}>
          ⚠ Boss Encounter ⚠
        </p>
      )}

      {/* Arena — two combatants side by side */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${isBoss ? 'rgba(248,113,113,0.18)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 16,
        padding: '0.875rem',
        marginBottom: '0.625rem',
      }}>
        <div style={{ display: 'flex', gap: '0.625rem', marginBottom: '0.75rem' }}>

          {/* Player panel */}
          <div style={{ flex: 1, background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.18)', borderRadius: 12, padding: '0.75rem 0.625rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.42rem', color: '#4a6a8a' }}>Your Ship</p>
            <div style={{ fontSize: '2.2rem', lineHeight: 1, padding: '0.25rem 0' }}>⚓</div>
            <p className="font-cinzel font-700 text-center" style={{ fontSize: '0.65rem', color: '#f0ede8', lineHeight: 1.2 }}>{ship.name}</p>
            {/* HP bar */}
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <p className="font-karla" style={{ fontSize: '0.42rem', color: '#4a6a8a' }}>HP</p>
                <p className="font-karla font-600" style={{ fontSize: '0.48rem', color: playerHpColor }}>{currentDurability}/{maxDurability}</p>
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${playerHpPct}%`, background: playerHpColor, borderRadius: 3, transition: 'width 0.4s ease, background 0.4s ease' }} />
              </div>
            </div>
            {/* Charge dots */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i < cs.playerCharges ? '#f0c040' : 'rgba(255,255,255,0.1)', transition: 'background 0.3s' }} />
              ))}
              <p className="font-karla font-600" style={{ fontSize: '0.48rem', color: '#f0c040', marginLeft: 2 }}>{fireMultLabel}</p>
            </div>
          </div>

          {/* VS */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: 20 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '0.55rem', color: '#2a2825' }}>VS</p>
          </div>

          {/* Enemy panel */}
          <div style={{ flex: 1, background: `${enemyColor}0a`, border: `1px solid ${enemyColor}22`, borderRadius: 12, padding: '0.75rem 0.625rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.42rem', color: enemyColor, opacity: 0.7 }}>{isBoss ? 'Boss' : 'Enemy'}</p>
            <div style={{ fontSize: '2.2rem', lineHeight: 1, padding: '0.25rem 0' }}>{ENEMY_AVATAR[cs.enemyId] ?? '☠'}</div>
            <p className="font-cinzel font-700 text-center" style={{ fontSize: '0.65rem', color: '#f0ede8', lineHeight: 1.2 }}>{enemy.name}</p>
            {/* HP bar */}
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <p className="font-karla" style={{ fontSize: '0.42rem', color: '#4a4845' }}>HP</p>
                <p className="font-karla font-600" style={{ fontSize: '0.48rem', color: enemyHpColor }}>{cs.enemyHp}/{enemy.maxHp}</p>
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${enemyHpPct}%`, background: enemyHpColor, borderRadius: 3, transition: 'width 0.4s ease, background 0.4s ease' }} />
              </div>
            </div>
            {/* Enemy charge dots */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i < cs.enemyCharges ? enemyColor : 'rgba(255,255,255,0.1)' }} />
              ))}
              <p className="font-karla" style={{ fontSize: '0.42rem', color: '#4a4845', marginLeft: 2 }}>{enemy.damage} dmg</p>
            </div>
          </div>
        </div>

        {/* Stat strip */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-around' }}>
          {[
            { label: 'PWR', val: effectivePower,        color: '#f87171' },
            { label: 'DGE', val: `${dodgeChance}%`,     color: '#60a5fa' },
            { label: 'FTN', val: crew.fortune,           color: '#f0c040' },
            { label: 'ARM', val: effectiveArmor,         color: '#4ade80' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.75rem', color: s.color }}>{s.val}</p>
              <p className="font-karla" style={{ fontSize: '0.4rem', color: '#4a4845', marginTop: 1 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Round result strip */}
      {showResult && log && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 10, padding: '0.625rem 0.875rem', marginBottom: '0.625rem',
        }}>
          {/* Actions taken */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.44rem', color: '#4a4845' }}>Round {log.round + 1}</p>
            <p className="font-karla" style={{ fontSize: '0.44rem', color: '#4a4845' }}>·</p>
            <p className="font-karla" style={{ fontSize: '0.44rem', color: '#6a6764' }}>
              You: <span style={{ color: '#f0ede8' }}>{log.playerAction === 'reload' ? 'Reloaded' : log.playerAction === 'fire' ? `Fired (${log.playerChargesBefore} charge${log.playerChargesBefore !== 1 ? 's' : ''})` : 'Defended'}</span>
              {' '}·{' '}
              Enemy: <span style={{ color: '#f0ede8' }}>{log.enemyAction === 'reload' ? 'Reloaded' : log.enemyAction === 'fire' ? 'Fired' : 'Defended'}</span>
            </p>
          </div>
          {/* Outcomes */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {log.playerDamageDealt > 0 && (
              <p className="font-karla" style={{ fontSize: '0.65rem', color: log.critHit ? '#f0c040' : '#a78bfa' }}>
                {log.critHit ? '⚡ Crit! ' : ''}Hit for <strong>{log.playerDamageDealt}</strong>
              </p>
            )}
            {log.playerDodged && (
              <p className="font-karla" style={{ fontSize: '0.65rem', color: '#4ade80' }}>Dodged!</p>
            )}
            {log.playerDamageTaken > 0 && (
              <p className="font-karla" style={{ fontSize: '0.65rem', color: '#f87171' }}>
                Took <strong>{log.playerDamageTaken}</strong>
              </p>
            )}
            {log.playerDamageDealt === 0 && !log.playerDodged && log.playerDamageTaken === 0 && (
              <p className="font-karla" style={{ fontSize: '0.65rem', color: '#4a4845' }}>Both sides repositioned</p>
            )}
          </div>
        </div>
      )}

      {/* Action buttons or Next Round */}
      {showResult ? (
        <button
          onClick={onNextRound}
          disabled={isPending}
          style={{ width: '100%', padding: '0.875rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, cursor: 'pointer' }}
          className="font-karla font-700 uppercase tracking-[0.1em]"
        >
          <span style={{ fontSize: '0.72rem', color: '#a0a09a' }}>Next Round →</span>
        </button>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
          {([
            { action: 'reload' as const, icon: '⚙',  label: 'Reload',  sublabel: '+1 charge',      color: '#60a5fa' },
            { action: 'fire'   as const, icon: '💥', label: 'Fire',    sublabel: cs.playerCharges === 0 ? 'no charges' : `${fireMultLabel} dmg`, color: cs.playerCharges === 0 ? '#4a4845' : '#f87171', dim: cs.playerCharges === 0 },
            { action: 'defend' as const, icon: '🛡',  label: 'Defend',  sublabel: `${dodgeChance}% dodge`, color: '#4ade80' },
          ] as const).map(btn => (
            <button
              key={btn.action}
              onClick={() => !buttonsDisabled && onAction(btn.action)}
              disabled={buttonsDisabled}
              style={{
                padding: '0.75rem 0.375rem',
                background: buttonsDisabled ? 'rgba(255,255,255,0.03)' : `${btn.color}12`,
                border: `1px solid ${buttonsDisabled ? 'rgba(255,255,255,0.07)' : `${btn.color}35`}`,
                borderRadius: 12,
                cursor: buttonsDisabled ? 'default' : 'pointer',
                textAlign: 'center',
                opacity: ('dim' in btn && btn.dim && !buttonsDisabled) ? 0.4 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              <p style={{ fontSize: '1.25rem', marginBottom: 3 }}>{btn.icon}</p>
              <p className="font-karla font-700" style={{ fontSize: '0.62rem', color: buttonsDisabled ? '#4a4845' : btn.color, lineHeight: 1.2 }}>{btn.label}</p>
              <p className="font-karla" style={{ fontSize: '0.48rem', color: '#4a4845', marginTop: 2 }}>{btn.sublabel}</p>
            </button>
          ))}
        </div>
      )}

      {resolving && (
        <p className="font-karla text-center mt-3" style={{ fontSize: '0.6rem', color: '#4a4845' }}>Resolving...</p>
      )}
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
            {result.effectType === 'gold' && (result.goldBonus ?? 0) > 0 && <p className="font-karla" style={{ fontSize: '0.78rem', color: '#f0c040' }}>✦ +{result.goldBonus} Gold found</p>}
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

function ShopView({ options, expeditionId, runGold, onRunGoldChange, isPending, onLeave }: {
  options: ShopOption[]
  expeditionId: number
  runGold: number
  onRunGoldChange: (newGold: number) => void
  isPending: boolean
  onLeave: () => void
}) {
  const [, startTransition] = useTransition()
  const [purchased, setPurchased] = useState<string[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)

  function buy(itemId: string, cost: number) {
    startTransition(async () => {
      const result = await buyShopItem(expeditionId, itemId)
      if ('error' in result) { setFeedback(result.error); return }
      setPurchased(prev => [...prev, itemId])
      setFeedback(null)
      onRunGoldChange(runGold - cost)
    })
  }

  return (
    <div>
      <p className="font-karla font-700 uppercase tracking-[0.12em] mb-2" style={{ fontSize: '0.52rem', color: '#4ade80' }}>⚓ Port Stop</p>
      <div className="flex items-center justify-between mb-1">
        <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.15rem' }}>Supply Shop</p>
        <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#f0c040' }}>✦ {runGold} Gold</p>
      </div>
      <p className="font-karla mb-5" style={{ fontSize: '0.72rem', color: '#6a6764' }}>Spend your run gold to prepare for what lies ahead.</p>
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
                  onClick={() => buy(opt.id, opt.cost)}
                  disabled={isPending || runGold < opt.cost}
                  style={{ flexShrink: 0, padding: '0.4rem 0.75rem', background: runGold < opt.cost ? 'rgba(255,255,255,0.04)' : 'rgba(240,192,64,0.1)', border: `1px solid ${runGold < opt.cost ? 'rgba(255,255,255,0.08)' : 'rgba(240,192,64,0.25)'}`, borderRadius: 8, cursor: runGold < opt.cost ? 'default' : 'pointer', fontSize: '0.65rem', color: runGold < opt.cost ? '#4a4845' : '#f0c040', opacity: runGold < opt.cost ? 0.5 : 1 }}
                  className="font-karla font-700"
                >
                  ✦ {opt.cost}
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
