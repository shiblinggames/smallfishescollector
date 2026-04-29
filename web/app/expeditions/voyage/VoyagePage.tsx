'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  takeCombatAction, makeEventChoice, buyShopItem, leaveShop, abandonExpedition,
  type CombatActionResult, type EventChoiceResult,
} from '../actions'
import {
  ENEMIES, EXPEDITION_SHIP_STATS, ZONES, EXPEDITION_ITEMS, RUN_ITEMS, RARITY_COLORS,
  CORAL_RUN_EVENTS, CORAL_RUN_SHOP,
  computeTotalCrewStats,
  type Expedition, type NodeType, type CombatAction, type CombatRoundLog,
  type EventNodeDef, type ShopOption, type ZoneLoot, type RunBuff, type ShipStats, type EnemyDef,
  type CombatState,
} from '@/lib/expeditions'

const IMG_BASE       = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/card-arts/'
const ENEMY_IMG_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/enemy-arts/'

interface Props {
  expedition: Expedition
  nodeType: NodeType
  currentEvent: EventNodeDef | null
  shopOptions: ShopOption[] | null
  zoneName: string
  zoneIcon: string
  playerAvatarUrl: string | null
}

type Phase =
  | { type: 'idle' }
  | { type: 'resolving' }
  | { type: 'round_result'; log: CombatRoundLog }
  | { type: 'enemy_defeated'; goldEarned: number; runItemDropped: string | null; permItemDropped: string | null; enemyName: string; newCombatState: CombatState | null; nextNodeIndex: number; zoneComplete: boolean }
  | { type: 'zone_complete' }
  | { type: 'failed' }
  | { type: 'event' }
  | { type: 'event_result'; result: EventChoiceResult }
  | { type: 'shop' }
  | { type: 'claiming_loot' }
  | { type: 'loot_result'; loot: ZoneLoot }

export default function VoyagePage({ expedition: initExp, nodeType: initNodeType, currentEvent: initEvent, shopOptions, zoneName, zoneIcon, playerAvatarUrl }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [exp, setExp] = useState(initExp)
  const [nodeType, setNodeType] = useState<NodeType>(initNodeType)
  const [phase, setPhase] = useState<Phase>(() => {
    if (initNodeType === 'event') return { type: 'event' }
    if (initNodeType === 'shop')  return { type: 'shop'  }
    // If current_node is past all nodes the boss was beaten but reward not yet claimed
    if (initExp.current_node >= ZONES[initExp.zone].nodes.length) return { type: 'zone_complete' }
    return { type: 'idle' }
  })
  const [currentEvent, setCurrentEvent] = useState<EventNodeDef | null>(initEvent)
  const [activeShopOptions, setActiveShopOptions] = useState<ShopOption[] | null>(shopOptions)
  const [showCrewSheet, setShowCrewSheet] = useState(false)
  const [abandonConfirm, setAbandonConfirm] = useState(false)

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
        run_buffs: result.combatOver && result.runItemBuff
          ? [...(prev.run_buffs ?? []), result.runItemBuff]
          : prev.run_buffs,
      }))

      setPhase({ type: 'round_result', log: result.roundLog })

      await new Promise(r => setTimeout(r, 1500))

      if (result.combatOver) {
        if (result.expeditionFailed) {
          setPhase({ type: 'failed' })
        } else {
          setPhase({
            type: 'enemy_defeated',
            goldEarned: result.goldEarned,
            runItemDropped: result.runItemDropped,
            permItemDropped: result.permItemDropped,
            enemyName: ENEMIES[cs?.enemyId ?? '']?.name ?? 'Enemy',
            newCombatState: result.newCombatState,
            nextNodeIndex: exp.current_node + 1,
            zoneComplete: result.zoneComplete,
          })
        }
      } else {
        setPhase({ type: 'idle' })
      }
    })
  }

  function handleEnemyDefeatedContinue() {
    if (phase.type !== 'enemy_defeated') return
    const p = phase
    setExp(prev => ({ ...prev, combat_state: p.newCombatState }))
    advanceToNextNode(p.nextNodeIndex, p.zoneComplete)
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
    // Navigate hard — results page claims the reward server-side on load
    window.location.href = `/expeditions/results?id=${exp.id}`
  }

  function handleAbandon() {
    startTransition(async () => {
      await abandonExpedition(exp.id)
      window.location.href = '/expeditions'
    })
  }

  return (
    <main className="pb-24 sm:pb-0 pt-5 sm:[zoom:1.4]" style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div className="px-5 max-w-lg mx-auto w-full" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* Progress header */}
        <div style={{ marginBottom: '1.25rem', flexShrink: 0 }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '0.9rem' }}>{zoneIcon}</span>
              <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: '#6a6764' }}>{zoneName}</p>
              {exp.equipped_item && EXPEDITION_ITEMS[exp.equipped_item] && (
                <span className="font-karla font-600" style={{ fontSize: '0.48rem', color: '#a78bfa', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 4, padding: '0.1rem 0.35rem' }}>
                  ⚗ {EXPEDITION_ITEMS[exp.equipped_item].name}
                </span>
              )}
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
              {phase.type !== 'failed' && phase.type !== 'zone_complete' && phase.type !== 'loot_result' && (
                abandonConfirm ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span className="font-karla" style={{ fontSize: '0.48rem', color: '#f87171' }}>Abandon?</span>
                    <button
                      onClick={handleAbandon}
                      disabled={isPending}
                      style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.35)', borderRadius: 5, padding: '0.15rem 0.4rem', cursor: 'pointer', fontSize: '0.48rem', color: '#f87171' }}
                      className="font-karla font-700"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setAbandonConfirm(false)}
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5, padding: '0.15rem 0.4rem', cursor: 'pointer', fontSize: '0.48rem', color: '#6a6764' }}
                      className="font-karla font-700"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAbandonConfirm(true)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.52rem', color: '#6a3a3a' }}
                    className="font-karla font-600 uppercase tracking-[0.08em]"
                  >
                    Abandon
                  </button>
                )
              )}
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
        {(nodeType === 'fight' || nodeType === 'boss') && enemy && cs && phase.type !== 'failed' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <CombatView
              enemy={enemy}
              cs={cs}
              phase={phase}
              crew={crew}
              crewLoadout={exp.crew_loadout ?? []}
              ship={ship}
              runBuffs={runBuffs}
              isBoss={nodeType === 'boss'}
              isPending={isPending}
              currentDurability={currentDurability}
              maxDurability={maxDurability}
              playerAvatarUrl={playerAvatarUrl}
              onAction={handleCombatAction}
            />
          </div>
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

      {/* Enemy defeated modal */}
      {phase.type === 'enemy_defeated' && (
        <EnemyDefeatedModal
          enemyName={phase.enemyName}
          goldEarned={phase.goldEarned}
          runItemDropped={phase.runItemDropped}
          permItemDropped={phase.permItemDropped}
          onContinue={handleEnemyDefeatedContinue}
        />
      )}

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

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes hitsplat-pop {
          0%   { opacity: 0; transform: translateX(-50%) translateY(-10%) scale(0.2) rotate(-12deg); }
          55%  { opacity: 1; transform: translateX(-50%) translateY(-65%) scale(1.3) rotate(4deg); }
          100% { opacity: 1; transform: translateX(-50%) translateY(-58%) scale(1) rotate(0deg); }
        }
        @keyframes combat-enemy-hit {
          0%,100% { transform: translateX(0); }
          20%     { transform: translateX(-5px) rotate(-1.5deg); }
          40%     { transform: translateX(5px)  rotate(1.5deg); }
          60%     { transform: translateX(-3px); }
          80%     { transform: translateX(3px); }
        }
        @keyframes combat-defend-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(74,222,128,0.5); }
          50%  { box-shadow: 0 0 0 8px rgba(74,222,128,0.1); }
          100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); }
        }
        @keyframes combat-reload-flash {
          0%,100% { opacity: 1; }
          40%     { opacity: 0.55; filter: brightness(1.6) hue-rotate(30deg); }
        }
        .combat-btn {
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
          outline: none;
          transition: transform 0.08s ease, opacity 0.2s ease;
        }
        .combat-btn:not(:disabled):active {
          transform: scale(0.93) translateY(1px);
        }
        @keyframes cannon-shot-l {
          0%   { opacity: 0; transform: translate(-28px, 8px) scale(0.2) rotate(-25deg); }
          28%  { opacity: 1; transform: translate(0) scale(1.15) rotate(6deg); }
          65%  { opacity: 0.75; transform: translate(5px, -6px) scale(0.95); }
          100% { opacity: 0; transform: translate(14px, -12px) scale(0.35); }
        }
        @keyframes cannon-shot-r {
          0%   { opacity: 0; transform: translate(28px, 8px) scale(0.2) rotate(25deg); }
          28%  { opacity: 1; transform: translate(0) scale(1.15) rotate(-6deg); }
          65%  { opacity: 0.75; transform: translate(-5px, -6px) scale(0.95); }
          100% { opacity: 0; transform: translate(-14px, -12px) scale(0.35); }
        }
        @keyframes combat-recoil {
          0%   { transform: translateX(0) rotate(0deg); }
          18%  { transform: translateX(-10px) rotate(-3deg); }
          48%  { transform: translateX(5px) rotate(1.5deg); }
          100% { transform: translateX(0) rotate(0deg); }
        }
      `}</style>
    </main>
  )
}

// ── Combat ────────────────────────────────────────────────────────────────────

const ENEMY_AVATAR: Record<string, string> = {
  brute:          '⚔',
  sniper:         '🔭',
  corsair:        '🏴‍☠️',
  barnacle_pete:  '🐡',
}

function Hitsplat({ text, color, big, animKey }: { text: string; color: string; big?: boolean; animKey?: string | number }) {
  return (
    <div key={animKey} style={{
      position: 'absolute', top: '50%', left: '50%',
      animation: 'hitsplat-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards',
      pointerEvents: 'none', zIndex: 20, whiteSpace: 'nowrap',
    }}>
      <div style={{
        background: 'rgba(8,6,4,0.9)',
        border: `2px solid ${color}`,
        borderRadius: big ? 10 : 6,
        padding: big ? '0.3rem 0.7rem' : '0.18rem 0.48rem',
        boxShadow: big ? `0 0 14px ${color}88, 0 0 4px ${color}` : `0 0 6px ${color}55`,
        outline: big ? `1px solid ${color}44` : 'none',
        outlineOffset: big ? 3 : 0,
      }}>
        <p className="font-cinzel font-700" style={{
          fontSize: big ? '1.1rem' : '0.75rem',
          color, lineHeight: 1,
          textShadow: big ? `0 0 16px ${color}` : 'none',
          letterSpacing: big ? '0.04em' : 'normal',
        }}>{text}</p>
      </div>
    </div>
  )
}

function StatRow({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.18rem 0' }}>
      <p className="font-karla font-600 uppercase tracking-[0.06em]" style={{ fontSize: '0.44rem', color: '#4a4845' }}>{label}</p>
      <p className="font-cinzel font-700" style={{ fontSize: '0.62rem', color }}>{value}</p>
    </div>
  )
}

function CircleAvatar({ src, fallback, size, borderColor }: { src: string | null; fallback: string; size: number; borderColor: string }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', border: `1.5px solid ${borderColor}`, flexShrink: 0, background: 'rgba(0,0,0,0.4)' }}>
      {src
        ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: size * 0.42 }}>{fallback}</span>
          </div>
      }
    </div>
  )
}

function CombatView({ enemy, cs, phase, crew, crewLoadout, ship, runBuffs, isBoss, isPending, currentDurability, maxDurability, playerAvatarUrl, onAction }: {
  enemy: EnemyDef
  cs: NonNullable<Expedition['combat_state']>
  phase: Phase
  crew: { count: number; power: number; dodge: number; fortune: number }
  crewLoadout: import('@/lib/expeditions').CrewCard[]
  ship: ShipStats
  runBuffs: RunBuff[]
  isBoss: boolean
  isPending: boolean
  currentDurability: number
  maxDurability: number
  playerAvatarUrl: string | null
  onAction: (a: CombatAction) => void
}) {
  const resolving = phase.type === 'resolving'
  const showResult = phase.type === 'round_result'
  const log = showResult ? (phase as { type: 'round_result'; log: CombatRoundLog }).log : null
  const buttonsDisabled = resolving || isPending || showResult

  const buffPower = runBuffs.filter(b => b.effect === 'power').reduce((s, b) => s + b.value, 0)
  const buffArmor = runBuffs.filter(b => b.effect === 'armor').reduce((s, b) => s + b.value, 0)
  const effectivePower = crew.power + buffPower
  const effectiveArmor = ship.armor + buffArmor
  const dodgeChance = Math.min(50 + Math.floor(crew.dodge / 2), 100)
  const dodgeBonus  = dodgeChance - 50

  const playerHpPct = maxDurability > 0 ? (currentDurability / maxDurability) * 100 : 0
  const enemyHpPct = (cs.enemyHp / enemy.maxHp) * 100
  const playerHpColor = playerHpPct < 30 ? '#f87171' : playerHpPct < 60 ? '#f0c040' : '#60a5fa'
  const enemyColor = isBoss ? '#f87171' : '#a78bfa'
  const enemyHpColor = enemyHpPct < 30 ? '#f87171' : enemyColor

  const canLightFire   = cs.playerCharges >= 1
  const canHeavyFire   = cs.playerCharges === 3
  const fireMultLabel  = cs.playerCharges === 3 ? '×2 rdy' : cs.playerCharges >= 1 ? '×1' : ''
  const dmgRange = crew.count >= effectivePower ? String(effectivePower) : `${crew.count}–${effectivePower}`

  const enemyHitAnim = showResult && log && (log.playerAction === 'fire' || log.playerAction === 'fire_heavy') && log.playerDamageDealt > 0
    ? 'combat-enemy-hit 0.45s ease' : 'none'
  const playerPanelAnim = showResult && log && log.playerAction === 'defend'
    ? 'combat-defend-pulse 0.7s ease' : 'none'
  const playerImgAnim = showResult && log
    ? log.playerAction === 'reload'     ? 'combat-reload-flash 0.5s ease'
    : log.playerAction === 'fire_heavy' ? 'combat-recoil 0.55s ease'
    : 'none' : 'none'
  const showCannonHit = showResult && log && (log.playerAction === 'fire' || log.playerAction === 'fire_heavy') && log.playerDamageDealt > 0
  const isVolley      = !!(showResult && log?.playerAction === 'fire_heavy' && log.playerDamageDealt > 0)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>

      {isBoss && (
        <p className="font-karla font-700 uppercase tracking-[0.14em] text-center" style={{ fontSize: '0.5rem', color: '#f87171', letterSpacing: '0.2em', flexShrink: 0 }}>
          ⚠ Boss Encounter ⚠
        </p>
      )}

      {/* Two panels side by side */}
      <div style={{ display: 'flex', gap: '0.625rem', flexShrink: 0 }}>

        {/* Player panel */}
        <div style={{ flex: 1, background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.16)', borderRadius: 14, padding: '0.75rem 0.625rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', animation: playerPanelAnim }}>
          <CircleAvatar src={playerAvatarUrl} fallback="⚓" size={36} borderColor="rgba(96,165,250,0.35)" />
          <div style={{ position: 'relative', animation: playerImgAnim }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ship.image} alt={ship.name} style={{ width: '100%', height: 88, objectFit: 'contain', objectPosition: 'bottom', display: 'block' }} />
            {showResult && log && !log.playerDodged && log.playerDamageTaken > 0 && (
              <span style={{ position: 'absolute', right: '18%', top: '38%', fontSize: '0.95rem', animation: 'cannon-shot-r 0.55s ease forwards', pointerEvents: 'none', zIndex: 10 }}>💥</span>
            )}
            {showResult && log && log.playerDamageTaken > 0 && (
              <Hitsplat
                text={log.enemyCrit ? `⚡ ${log.playerDamageTaken}` : `-${log.playerDamageTaken}`}
                color={log.enemyCrit ? '#f0c040' : '#f87171'}
                big={!!log.enemyCrit}
                animKey={log.round}
              />
            )}
            {showResult && log && log.playerDodged && (
              <Hitsplat text="DODGED!" color="#4ade80" animKey={log.round} />
            )}
          </div>
          <p className="font-cinzel font-700 text-center" style={{ fontSize: '0.62rem', color: '#f0ede8', lineHeight: 1.2 }}>{ship.name}</p>
          {/* HP bar */}
          <div>
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
          {/* Ship stats */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '0.3rem', marginTop: '0.05rem', display: 'flex', flexDirection: 'column' }}>
            <StatRow label="DMG" value={dmgRange} color="#f87171" />
            <StatRow label="DGE" value={`+${dodgeBonus}%`} color="#60a5fa" />
            <StatRow label="FTN" value={crew.fortune} color="#f0c040" />
            <StatRow label="ARM" value={effectiveArmor} color="#4ade80" />
          </div>
          {/* Crew portraits */}
          {crewLoadout.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '0.3rem', marginTop: '0.05rem', display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
              <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.38rem', color: '#4a4845' }}>Crew</p>
              {crewLoadout.map((card, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={IMG_BASE + card.filename} alt={card.name} style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255,255,255,0.15)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="font-karla font-600 truncate" style={{ fontSize: '0.42rem', color: '#c0bdb8', lineHeight: 1.2 }}>{card.name}</p>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <span className="font-cinzel font-700" style={{ fontSize: '0.4rem', color: '#f87171' }}>{card.power}</span>
                      <span className="font-karla" style={{ fontSize: '0.38rem', color: '#4a4845' }}>PWR</span>
                      <span className="font-cinzel font-700" style={{ fontSize: '0.4rem', color: '#60a5fa' }}>{card.dodge}</span>
                      <span className="font-karla" style={{ fontSize: '0.38rem', color: '#4a4845' }}>DGE</span>
                      <span className="font-cinzel font-700" style={{ fontSize: '0.4rem', color: '#f0c040' }}>{card.fortune}</span>
                      <span className="font-karla" style={{ fontSize: '0.38rem', color: '#4a4845' }}>FTN</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Enemy panel */}
        <div style={{ flex: 1, background: `${enemyColor}08`, border: `1px solid ${enemyColor}20`, borderRadius: 14, padding: '0.75rem 0.625rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <CircleAvatar
            src={enemy.image ? ENEMY_IMG_BASE + enemy.image : null}
            fallback={ENEMY_AVATAR[cs.enemyId] ?? '☠'}
            size={36}
            borderColor={`${enemyColor}55`}
          />
          <div style={{ position: 'relative', height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: enemyHitAnim }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${ENEMY_IMG_BASE}enemytier${enemy.tier}.png`}
              alt={enemy.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', display: 'block' }}
            />
            {showCannonHit && log && (
              <>
                <span style={{ position: 'absolute', left: '18%', top: '38%', fontSize: isVolley ? '1.4rem' : '0.95rem', animation: 'cannon-shot-l 0.55s ease forwards', pointerEvents: 'none', zIndex: 10, filter: isVolley ? 'brightness(1.6)' : 'none' }}>💥</span>
                {isVolley && (
                  <span style={{ position: 'absolute', left: '42%', top: '20%', fontSize: '1.7rem', animation: 'cannon-shot-l 0.65s 0.1s ease forwards', pointerEvents: 'none', zIndex: 10 }}>🔥</span>
                )}
              </>
            )}
            {showResult && log && log.enemyDodged && (
              <Hitsplat text="DODGED!" color="#4ade80" animKey={log.round} />
            )}
            {showResult && log && !log.enemyDodged && log.playerDamageDealt > 0 && (
              <Hitsplat
                text={log.critHit ? `⚡ ${log.playerDamageDealt}` : `-${log.playerDamageDealt}`}
                color={log.critHit ? '#f0c040' : '#f87171'}
                big={!!log.critHit}
                animKey={log.round}
              />
            )}
          </div>
          <p className="font-cinzel font-700 text-center" style={{ fontSize: '0.68rem', color: '#f0ede8', lineHeight: 1.2 }}>{enemy.name}</p>
          {/* HP bar */}
          <div>
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
          </div>
          {/* Enemy stats — mirrors player panel */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '0.3rem', marginTop: '0.05rem', display: 'flex', flexDirection: 'column' }}>
            <StatRow label="DMG" value={`1–${enemy.damage}`} color="#f87171" />
            <StatRow label="DGE" value={`${Math.min(enemy.dodge * 5, 70)}%`} color="#60a5fa" />
            <StatRow label="FTN" value={enemy.fortune} color="#f0c040" />
            <StatRow label="ARM" value={enemy.armor} color="#4ade80" />
            <StatRow label="SPD" value={enemy.speed} color="#a78bfa" />
          </div>
        </div>
      </div>

      {/* Active buffs */}
      {runBuffs.length > 0 && (
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', flexShrink: 0 }}>
          {runBuffs.map((buff, i) => (
            <span key={i} className="font-karla font-600" style={{ fontSize: '0.46rem', color: '#4ade80', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.18)', borderRadius: 4, padding: '0.12rem 0.38rem' }}>
              +{buff.value} {buff.effect.charAt(0).toUpperCase() + buff.effect.slice(1)}
            </span>
          ))}
        </div>
      )}

      {/* Spacer + round result anchored to bottom of spacer */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 0 }}>
        {showResult && log && (
          <p className="font-karla text-center" style={{ fontSize: '0.48rem', color: '#4a4845' }}>
            <span style={{ color: '#6a6764' }}>Round {log.round + 1}</span>
            {' · '}
            You: <span style={{ color: '#a0a09a' }}>{log.playerAction === 'reload' ? 'Reloaded' : log.playerAction === 'fire' ? 'Fired ×1' : log.playerAction === 'fire_heavy' ? 'Volley ×2' : 'Defended'}</span>
            {' · '}
            Enemy: <span style={{ color: '#a0a09a' }}>{log.enemyAction === 'reload' ? 'Reloaded' : log.enemyAction === 'fire' ? 'Fired' : 'Defended'}</span>
          </p>
        )}
        {resolving && (
          <p className="font-karla text-center" style={{ fontSize: '0.6rem', color: '#4a4845' }}>Resolving...</p>
        )}
      </div>

      {/* Action buttons — 2×2 grid */}
      <div style={{ flexShrink: 0, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
          {([
            { action: 'reload'     as const, icon: '⚙',  label: 'Reload',  sublabel: '+1 charge',            color: '#60a5fa', dim: false },
            { action: 'fire'       as const, icon: '💥', label: 'Fire',    sublabel: '×1 dmg  ·  1 charge',  color: '#f87171', dim: !canLightFire },
            { action: 'defend'     as const, icon: '🛡',  label: 'Defend',  sublabel: `+${dodgeBonus}% dodge`, color: '#4ade80', dim: false },
            { action: 'fire_heavy' as const, icon: '🔥', label: 'Volley',  sublabel: '×2 dmg  ·  3 charges', color: '#f0c040', dim: !canHeavyFire },
          ] as const).map(btn => {
            const enabled = !buttonsDisabled && !btn.dim
            return (
              <button
                key={btn.action}
                className="combat-btn"
                onClick={() => enabled && onAction(btn.action)}
                disabled={buttonsDisabled || btn.dim}
                style={{
                  padding: 'clamp(0.5rem, 2.2vh, 0.85rem) 0.25rem',
                  background: enabled
                    ? `linear-gradient(160deg, ${btn.color}1e 0%, ${btn.color}08 100%)`
                    : 'rgba(255,255,255,0.025)',
                  border: `1px solid ${enabled ? btn.color + '50' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: 14,
                  cursor: enabled ? 'pointer' : 'default',
                  textAlign: 'center',
                  opacity: btn.dim && !buttonsDisabled ? 0.28 : 1,
                  boxShadow: enabled ? `0 2px 14px ${btn.color}14, inset 0 1px 0 ${btn.color}28` : 'none',
                }}
              >
                <p style={{ fontSize: 'clamp(1.1rem, 4.5vw, 1.35rem)', lineHeight: 1, marginBottom: 2 }}>{btn.icon}</p>
                <p className="font-karla font-700" style={{ fontSize: 'clamp(0.55rem, 2.4vw, 0.66rem)', color: enabled ? btn.color : '#3a3835', lineHeight: 1.15 }}>{btn.label}</p>
                <p className="font-karla" style={{ fontSize: 'clamp(0.38rem, 1.6vw, 0.46rem)', color: enabled ? '#6a6764' : '#2a2825', marginTop: 1 }}>{btn.sublabel}</p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Enemy defeated modal ──────────────────────────────────────────────────────

function EnemyDefeatedModal({ enemyName, goldEarned, runItemDropped, permItemDropped, onContinue }: {
  enemyName: string
  goldEarned: number
  runItemDropped: string | null
  permItemDropped: string | null
  onContinue: () => void
}) {
  const runItem  = runItemDropped  ? RUN_ITEMS[runItemDropped]        : null
  const permItem = permItemDropped ? EXPEDITION_ITEMS[permItemDropped] : null
  const hasLoot  = !!(runItem || permItem)
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 40,
      background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem',
    }}>
      <div style={{
        background: '#0f0e0c',
        border: `1px solid ${hasLoot ? 'rgba(167,139,250,0.35)' : 'rgba(240,192,64,0.25)'}`,
        borderRadius: 18,
        padding: '1.75rem 1.5rem',
        width: '100%',
        maxWidth: 320,
        textAlign: 'center',
        boxShadow: hasLoot
          ? '0 0 40px rgba(167,139,250,0.12), 0 8px 32px rgba(0,0,0,0.6)'
          : '0 0 40px rgba(240,192,64,0.08), 0 8px 32px rgba(0,0,0,0.6)',
      }}>
        <p style={{ fontSize: '2rem', marginBottom: '0.6rem' }}>⚔️</p>
        <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.48rem', color: '#4ade80', marginBottom: '0.4rem' }}>
          Enemy Defeated
        </p>
        <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8', marginBottom: '1.25rem', lineHeight: 1.2 }}>
          {enemyName}
        </p>
        <div style={{
          background: 'rgba(240,192,64,0.07)',
          border: '1px solid rgba(240,192,64,0.2)',
          borderRadius: 12,
          padding: '0.875rem',
          marginBottom: hasLoot ? '0.75rem' : '1.25rem',
        }}>
          <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.44rem', color: '#6a6764', marginBottom: '0.35rem' }}>Gold Earned</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: '#f0c040', lineHeight: 1 }}>
            +{goldEarned} ✦
          </p>
        </div>

        {/* Run item — applied this fight, not kept */}
        {runItem && (
          <div style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 12, padding: '0.875rem', marginBottom: '0.75rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.44rem', color: '#60a5fa', marginBottom: '0.35rem' }}>Supplies Found</p>
            <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#f0ede8', marginBottom: 3, lineHeight: 1.2 }}>{runItem.name}</p>
            <p className="font-karla" style={{ fontSize: '0.58rem', color: '#6a6764' }}>{runItem.effectDescription}</p>
            <p className="font-karla" style={{ fontSize: '0.48rem', color: '#4a4845', marginTop: 4, fontStyle: 'italic' }}>Applied this run — not kept</p>
          </div>
        )}

        {/* Permanent item — goes to inventory */}
        {permItem && (
          <div style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.28)', borderRadius: 12, padding: '0.875rem', marginBottom: '0.75rem' }}>
            <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.44rem', color: '#a78bfa', marginBottom: '0.35rem' }}>Rare Drop!</p>
            <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#f0ede8', marginBottom: 3, lineHeight: 1.2 }}>{permItem.name}</p>
            <p className="font-karla" style={{ fontSize: '0.58rem', color: '#6a6764' }}>{permItem.effectDescription}</p>
            <p className="font-karla" style={{ fontSize: '0.48rem', color: '#4a4845', marginTop: 4, fontStyle: 'italic' }}>Added to your inventory</p>
          </div>
        )}

        <button
          onClick={onContinue}
          style={{
            width: '100%', marginTop: hasLoot ? 0 : undefined,
            padding: '0.875rem',
            background: 'rgba(240,192,64,0.12)',
            border: '1px solid rgba(240,192,64,0.3)',
            borderRadius: 12,
            cursor: 'pointer',
          }}
          className="font-karla font-700 uppercase tracking-[0.12em]"
        >
          <span style={{ fontSize: '0.72rem', color: '#f0c040' }}>Continue →</span>
        </button>
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
  crew: { count: number; power: number; dodge: number; fortune: number }
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
