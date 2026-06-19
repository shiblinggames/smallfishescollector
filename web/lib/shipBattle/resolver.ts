// ── Async Ship PvP — server-authoritative round resolver ──────────────────
//
// The raid combat (web/app/(app)/raids/RaidCombat.tsx) rolls EVERYTHING on the
// client and trusts it — fine vs an AI boss, unsafe vs a human. For PvP every
// RNG roll (speed order, damage, dodge, crit-upgrade) happens HERE on the
// server, and the rolled numbers are written into the battle's round log so
// BOTH clients animate identical outcomes. The only thing trusted from the
// client is the player's aim RESULT (the skill input) — there's no currency at
// stake, matching the [[project-ship-pvp-decision]] "don't over-engineer
// anti-cheat" call.
//
// v1 scope: reload / fire / volley / dodge + the aim crit + speed order +
// raidDamageProfile, with ship/crew/class/item stats pre-baked into the frozen
// loadout snapshot. No active abilities / tides / affixes / phase-2 / procs.

import { raidDamageProfile } from '@/lib/expeditions'

export const MAX_CHARGES = 3

export type BattleAction = 'reload' | 'fire' | 'volley' | 'dodge'
export type ShotResult = 'critical' | 'hit' | 'graze' | 'miss'

/** Frozen at accept-time (lib/shipBattle/loadout.ts) so mid-battle gear swaps
 *  never change an in-flight duel. Class/item HP + speed are already baked into
 *  hpMax / shipSpeed; the damage/defense mults below apply per shot. */
export interface BattleLoadout {
  username: string
  shipImageUrl: string
  shipTier: number
  hpMax: number
  shipMinDamage: number
  shipSpeed: number
  totalPower: number
  navigation: number          // = totalDodge (the dodge/speed roll stat)
  damagePct: number           // crew raid-damage net modifier (raidDamageProfile)
  critPct: number             // chance a 'hit' aim upgrades to 'critical'
  classDamageMult: number     // ship-class outgoing damage multiplier
  critDamageMult: number      // product of crit_damage_mult raid items
  noncritDamageMult: number   // product of noncrit_damage_mult raid items
  incomingDamageMult: number  // product of incoming_damage_mult raid items (defense)
  navSpeedBonusPct: number    // Navigator's Compass speed_roll_nav_pct
  // ── Cosmetic / display only (resolver ignores these) — drives the
  //    tap-to-view stats popup: avatar, equipped items, class picks. Optional
  //    so battles snapshotted before these were added still resolve. ──
  characterColor?: string | null
  equippedHat?: string | null
  avatarBgColor?: string | null
  avatarBorderColor?: string | null
  equippedRaidItems?: string[]
  shipClasses?: Record<string, string>
}

/** A player's choice for one round. aimResult is required for fire/volley. */
export interface BattleMove {
  action: BattleAction
  aimResult?: ShotResult
}

/** Live HP + charges carried between rounds (lives on the battle row). */
export interface BattleSide {
  hp: number
  charges: number
}

/** One animatable beat in a resolved round — the client replays these with the
 *  exact numbers the server rolled. */
export interface RoundStep {
  actor: 'challenger' | 'opponent'
  action: BattleAction
  aimResult?: ShotResult
  /** Damage dealt to the OTHER side (0 for reload/dodge/whiffed). */
  damage: number
  /** Defender successfully (fully) dodged this shot. */
  dodged: boolean
  /** Shot landed as a critical (after the crit-upgrade roll). */
  crit: boolean
  /** Resulting HP/charges AFTER this step, for both sides. */
  challengerHp: number
  opponentHp: number
  challengerCharges: number
  opponentCharges: number
  log: string
}

export interface ResolvedRound {
  steps: RoundStep[]
  challenger: BattleSide
  opponent: BattleSide
  /** 'challenger' | 'opponent' when someone hit 0 HP this round, else null. */
  winner: 'challenger' | 'opponent' | null
}

/** The side's action in the most recent round it acted — used to enforce the
 *  raid's "no dodge two turns in a row" rule. Null on round 1. */
export function lastActionOf(rounds: { steps: RoundStep[] }[], side: 'challenger' | 'opponent'): BattleAction | null {
  for (let i = rounds.length - 1; i >= 0; i--) {
    const step = rounds[i].steps.find(s => s.actor === side)
    if (step) return step.action
  }
  return null
}

const d = (n: number) => Math.floor(Math.random() * n) + 1
const d20 = () => d(20)

// ── Roll helpers — ported verbatim from RaidCombat so combat stays identical ──
function rollSpeed(shipSpeed: number, navigation: number) {
  return d(30) + shipSpeed + Math.floor(navigation / 10)
}
function rollDodge(shipSpeed: number, navigation: number) {
  return d20() + shipSpeed + navigation
}
function rollAttackerVsDodge(attackerSpeed: number) {
  return d20() + attackerSpeed
}
function rollShotDamage(res: ShotResult, shipMinDamage: number, totalPower: number, damagePct: number): number {
  if (res === 'miss') return 0
  const { hitMin, powerMax, critMax } = raidDamageProfile(totalPower, shipMinDamage, damagePct)
  if (res === 'critical') {
    const min = shipMinDamage * 2
    return Math.floor(Math.random() * (critMax - min + 1)) + min
  }
  if (res === 'hit') {
    return Math.floor(Math.random() * (powerMax - hitMin + 1)) + hitMin
  }
  const grazeMax = Math.max(1, Math.ceil(powerMax * 0.4))
  return Math.floor(Math.random() * grazeMax) + 1
}

function speedRollFor(l: BattleLoadout): number {
  return rollSpeed(l.shipSpeed, l.navigation) + Math.floor(l.navigation * l.navSpeedBonusPct)
}

/** Resolve one WeGo round: both sides have already locked an action (+ aim).
 *  Returns the new HP/charges, the animatable step list, and any winner.
 *  Deterministic from the rolls captured inside — call ONCE on the server. */
export function resolveRound(
  challenger: BattleLoadout,
  opponent: BattleLoadout,
  cState: BattleSide,
  oState: BattleSide,
  cMove: BattleMove,
  oMove: BattleMove,
): ResolvedRound {
  const sides = {
    challenger: { l: challenger, s: { ...cState }, m: cMove },
    opponent:   { l: opponent,   s: { ...oState }, m: oMove },
  }
  type Who = 'challenger' | 'opponent'
  const other = (w: Who): Who => (w === 'challenger' ? 'opponent' : 'challenger')

  // Turn order — higher speed roll acts first; tie → challenger (the caller).
  const cRoll = speedRollFor(challenger)
  const oRoll = speedRollFor(opponent)
  const order: Who[] = cRoll >= oRoll ? ['challenger', 'opponent'] : ['opponent', 'challenger']

  const steps: RoundStep[] = []
  let winner: Who | null = null

  const snapshot = (over: Partial<RoundStep>): RoundStep => ({
    actor: 'challenger', action: 'reload', damage: 0, dodged: false, crit: false,
    challengerHp: sides.challenger.s.hp, opponentHp: sides.opponent.s.hp,
    challengerCharges: sides.challenger.s.charges, opponentCharges: sides.opponent.s.charges,
    log: '', ...over,
  })

  for (const who of order) {
    if (winner) break
    const me = sides[who]
    const foeWho = other(who)
    const foe = sides[foeWho]
    if (me.s.hp <= 0) continue // killed earlier this round — forfeits their action

    const action = me.m.action

    if (action === 'reload') {
      me.s.charges = Math.min(MAX_CHARGES, me.s.charges + 1)
      steps.push(snapshot({ actor: who, action, log: `${me.l.username} reloads.` }))
      continue
    }
    if (action === 'dodge') {
      // Defensive stance — its effect is rolled when the FOE fires this round.
      steps.push(snapshot({ actor: who, action, log: `${me.l.username} braces to evade.` }))
      continue
    }

    // fire / volley — guard charges (server is authoritative; a malformed move
    // that can't pay simply whiffs into a reload).
    const cost = action === 'volley' ? MAX_CHARGES : 1
    if (me.s.charges < cost) {
      me.s.charges = Math.min(MAX_CHARGES, me.s.charges + 1)
      steps.push(snapshot({ actor: who, action: 'reload', log: `${me.l.username} has no charge — reloads.` }))
      continue
    }
    me.s.charges -= cost

    // Crit-upgrade: a clean 'hit' can become 'critical' (crew crit chance).
    let result: ShotResult = me.m.aimResult ?? 'miss'
    let crit = result === 'critical'
    if (result === 'hit' && me.l.critPct > 0 && Math.random() < me.l.critPct / 100) {
      result = 'critical'
      crit = true
    }

    // Defender dodging? full dodge on success, 50% on a failed evade.
    let dodged = false
    let dodgeMult = 1
    if (foe.m.action === 'dodge' && result !== 'miss') {
      const def = rollDodge(foe.l.shipSpeed, foe.l.navigation)
      const atk = rollAttackerVsDodge(me.l.shipSpeed)
      if (def >= atk) { dodged = true; dodgeMult = 0 }
      else dodgeMult = 0.5
    }

    const itemMult = crit ? me.l.critDamageMult : me.l.noncritDamageMult
    const volleyMult = action === 'volley' ? 2 : 1
    const raw = rollShotDamage(result, me.l.shipMinDamage, me.l.totalPower, me.l.damagePct)
    const dmg = Math.floor(raw * volleyMult * me.l.classDamageMult * itemMult * foe.l.incomingDamageMult * dodgeMult)

    foe.s.hp = Math.max(0, foe.s.hp - dmg)

    const verb = action === 'volley' ? 'unloads a volley' : 'fires'
    const log = dodged
      ? `${me.l.username} ${verb} — ${foe.l.username} evades!`
      : result === 'miss'
        ? `${me.l.username} ${verb} and misses.`
        : `${me.l.username} ${verb} for ${dmg}${crit ? ' (critical!)' : ''}.`
    steps.push(snapshot({ actor: who, action, aimResult: result, damage: dmg, dodged, crit, log }))

    if (foe.s.hp <= 0) winner = who
  }

  return {
    steps,
    challenger: sides.challenger.s,
    opponent: sides.opponent.s,
    winner,
  }
}
