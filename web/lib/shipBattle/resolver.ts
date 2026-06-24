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
// Scope: reload / fire / volley / dodge + the aim crit + speed order +
// raidDamageProfile, with ship/crew/class/item stats pre-baked into the frozen
// loadout snapshot. Plus the crew-ability "Specials" slice (the 5 base classes:
// Mender / Sharpshot / Snare / Anchor / Navigator) + a once-per-duel repair kit
// — mirroring how Specials work in the PvE raids, but applied here on the
// server. No tides / affixes / phase-2 / procs / legendary signatures.

import { raidDamageProfile } from '@/lib/expeditions'
import {
  CLASSES, currentMilestone, type CrewClass,
  type MenderMilestone, type NavigatorMilestone, type SnareMilestone, type AnchorMilestone,
  type AbyssalTideMilestone, type LeviathanMilestone, type BlitzMilestone,
} from '@/lib/crewClasses'

export const MAX_CHARGES = 3
// Incendiary burn — mirrors RaidCombat (2 turns at 30% of the igniting hit).
const BURN_TURNS = 2
const BURN_TICK_PCT = 0.30

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
  // ── Crew raid mods + on-hit item procs (all optional so pre-existing
  //    snapshots still resolve as before). ──
  firstStrike?: boolean       // crew First Strike — always acts first
  damageTakenPct?: number     // crew bulwark/soft_shell (+ = takes MORE; raid convention)
  parryChance?: number        // Astrolabe — chance, on a full dodge, to reflect
  parryReflectPct?: number    // …this fraction of the dodged shot's damage roll
  burnChance?: number         // Incendiary — chance each hit to set the foe ablaze
  freezeChance?: number       // Frozen — chance each hit to freeze the foe a turn
  startChargeChance?: number  // First Cut — handled at battle init (actions), not here
  rampDamagePerTurn?: number  // extra damage fraction per round elapsed
  maxCharges?: number         // cannonball cap = 3 + Extra Cannonball Rack slots
  // ── Crew Specials slice — the firing player's usable abilities, frozen at
  //    accept-time. Only crew mapping to one of the 5 base classes AND already
  //    Lv 10+ (ability unlocked) are listed. repairKit is the equipped kit's
  //    Fortune-baked heal range; null = none equipped. Optional so battles
  //    snapshotted before this shipped still resolve (no abilities). ──
  crew?: BattleCrew[]
  repairKit?: { name: string; healMin: number; healMax: number } | null
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

/** One firing player's crew ability card (one of the 5 base classes). The
 *  milestone is re-derived from `level` at resolve via currentMilestone(). */
export interface BattleCrew {
  id: number
  name: string
  classId: CrewClass
  level: number
}

/** A free crew/repair ability fired alongside a move (at most one per round). */
export type BattleAbility =
  | { kind: 'crew'; crewId: number }
  | { kind: 'repair' }

/** A player's choice for one round. aimResult is required for fire/volley;
 *  `ability` is an optional free Special on top of the cannon action. */
export interface BattleMove {
  action: BattleAction
  aimResult?: ShotResult
  ability?: BattleAbility
}

/** Per-side ability/status state carried on the battle row (JSONB). */
export interface BattleFx {
  /** Crew ids whose ability has fired (once per duel). */
  used: number[]
  /** Repair kit already spent this duel. */
  usedRepair: boolean
  /** This side's dodge is jammed (Snare) for this many more rounds. */
  dodgeJammed: number
  /** This side's pending next-incoming-hit reduction (Anchor brace), 0–1. */
  anchorPct: number
  /** The pending brace also soaks crits (Anchor Lv 100). */
  anchorAbsorbsCrit?: boolean
  /** Incendiary burn: remaining DoT turns + per-turn damage (ticks at round start). */
  burnTurns?: number
  burnDmg?: number
  /** Frozen: a freeze proc'd last round → this side skips its next round. */
  frozen?: boolean
  /** Tidecaller shield buffer — soaks damage before HP, persists until spent. */
  shield?: number
}

export function defaultFx(): BattleFx {
  return { used: [], usedRepair: false, dodgeJammed: 0, anchorPct: 0, anchorAbsorbsCrit: false, burnTurns: 0, burnDmg: 0, frozen: false, shield: 0 }
}
function normFx(fx: Partial<BattleFx> | null | undefined): BattleFx {
  return {
    used: fx?.used ?? [],
    usedRepair: fx?.usedRepair ?? false,
    dodgeJammed: fx?.dodgeJammed ?? 0,
    anchorPct: fx?.anchorPct ?? 0,
    anchorAbsorbsCrit: fx?.anchorAbsorbsCrit ?? false,
    burnTurns: fx?.burnTurns ?? 0,
    burnDmg: fx?.burnDmg ?? 0,
    frozen: fx?.frozen ?? false,
    shield: fx?.shield ?? 0,
  }
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
  /** This step is a free crew/repair Special cast, not a cannon action. */
  ability?: boolean
  /** A status beat (not a cannon action): the damage/effect lands on the ACTOR
   *  side. 'burn' = DoT tick, 'freeze' = lost turn, 'parry' = reflected shot. */
  fx?: 'burn' | 'freeze' | 'parry'
  /** HP restored by a heal Special (drives the green heal splat). */
  heal?: number
  /** Resulting HP/charges/shield AFTER this step, for both sides. */
  challengerHp: number
  opponentHp: number
  challengerCharges: number
  opponentCharges: number
  challengerShield: number
  opponentShield: number
  log: string
}

export interface ResolvedRound {
  steps: RoundStep[]
  challenger: BattleSide
  opponent: BattleSide
  /** Updated ability/status state to persist on the row. */
  challengerFx: BattleFx
  opponentFx: BattleFx
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
  cFx?: Partial<BattleFx> | null,
  oFx?: Partial<BattleFx> | null,
  roundIndex = 0,   // 0-based; drives ramp_damage_per_turn (round 1 = +0)
): ResolvedRound {
  const sides = {
    challenger: { l: challenger, s: { ...cState }, m: cMove },
    opponent:   { l: opponent,   s: { ...oState }, m: oMove },
  }
  const fx = { challenger: normFx(cFx), opponent: normFx(oFx) }
  type Who = 'challenger' | 'opponent'
  const other = (w: Who): Who => (w === 'challenger' ? 'opponent' : 'challenger')

  // Turn order — First Strike (crew) trumps the speed roll; if both or neither
  // have it, higher speed roll acts first, tie → challenger (the caller).
  const cFirst = !!challenger.firstStrike
  const oFirst = !!opponent.firstStrike
  let order: Who[]
  if (cFirst && !oFirst) order = ['challenger', 'opponent']
  else if (oFirst && !cFirst) order = ['opponent', 'challenger']
  else {
    const cRoll = speedRollFor(challenger)
    const oRoll = speedRollFor(opponent)
    order = cRoll >= oRoll ? ['challenger', 'opponent'] : ['opponent', 'challenger']
  }

  const steps: RoundStep[] = []
  let winner: Who | null = null

  const snapshot = (over: Partial<RoundStep>): RoundStep => ({
    actor: 'challenger', action: 'reload', damage: 0, dodged: false, crit: false,
    challengerHp: sides.challenger.s.hp, opponentHp: sides.opponent.s.hp,
    challengerCharges: sides.challenger.s.charges, opponentCharges: sides.opponent.s.charges,
    challengerShield: fx.challenger.shield ?? 0, opponentShield: fx.opponent.shield ?? 0,
    log: '', ...over,
  })

  // Apply damage to a side, depleting any Tidecaller shield first. Returns the
  // HP actually lost + how much the shield soaked (for the log).
  const dealDamage = (targetWho: Who, amount: number): { hpDmg: number; absorbed: number } => {
    let dmg = Math.max(0, amount)
    let absorbed = 0
    const tf = fx[targetWho]
    if ((tf.shield ?? 0) > 0 && dmg > 0) {
      absorbed = Math.min(tf.shield!, dmg)
      tf.shield = (tf.shield ?? 0) - absorbed
      dmg -= absorbed
    }
    sides[targetWho].s.hp = Math.max(0, sides[targetWho].s.hp - dmg)
    return { hpDmg: dmg, absorbed }
  }

  // ── Pass 0: start-of-round statuses carried in from last round ──────────
  // Freeze consumes the side's whole turn (special + action) THIS round; burn
  // ticks now so a hit's DoT starts next round, not the round it landed.
  const frozenThisRound: Record<Who, boolean> = { challenger: fx.challenger.frozen!, opponent: fx.opponent.frozen! }
  fx.challenger.frozen = false
  fx.opponent.frozen = false
  for (const who of order) {
    const me = sides[who]
    const meFx = fx[who]
    if ((meFx.burnTurns ?? 0) > 0 && me.s.hp > 0) {
      const { hpDmg } = dealDamage(who, meFx.burnDmg ?? 0)
      meFx.burnTurns = (meFx.burnTurns ?? 0) - 1
      steps.push(snapshot({ actor: who, fx: 'burn', damage: hpDmg, log: `${me.l.username}'s ship is ablaze — ${hpDmg} burn damage.` }))
      if (me.s.hp <= 0) { winner = other(who); break }
    }
  }

  // ── Pass 1: free Specials (heal / charges / snare / brace / steady aim) ──
  // Applied BEFORE any cannon fire so a brace soaks this round's incoming hit
  // and a snare jams this round's dodge. At most one per side (the move carries
  // a single `ability`). Mirrors the raid "abilities are free actions" rule.
  for (const who of order) {
    if (winner) break
    if (frozenThisRound[who]) continue // frozen → loses special + action this round
    const me = sides[who]
    const ab = me.m.ability
    if (!ab) continue
    const meFx = fx[who]
    const foeWho2 = other(who)
    const foe2 = sides[foeWho2]
    const foeFx = fx[foeWho2]

    if (ab.kind === 'repair') {
      if (!me.l.repairKit || meFx.usedRepair) continue
      const { healMin, healMax } = me.l.repairKit
      const heal = Math.min(me.l.hpMax - me.s.hp, healMin + Math.floor(Math.random() * (healMax - healMin + 1)))
      me.s.hp += Math.max(0, heal)
      meFx.usedRepair = true
      steps.push(snapshot({ actor: who, ability: true, heal: Math.max(0, heal), log: `${me.l.username} patches the hull (+${Math.max(0, heal)} HP).` }))
      continue
    }

    const crew = (me.l.crew ?? []).find(c => c.id === ab.crewId)
    if (!crew || meFx.used.includes(crew.id)) continue
    const def = CLASSES[crew.classId]
    const m = currentMilestone(def, crew.level)
    if (!m) continue
    meFx.used.push(crew.id)

    switch (crew.classId) {
      case 'mender': {
        const heal = Math.min(me.l.hpMax - me.s.hp, Math.floor((m as MenderMilestone).pctMaxHp * me.l.hpMax))
        me.s.hp += Math.max(0, heal)
        steps.push(snapshot({ actor: who, ability: true, heal: Math.max(0, heal), log: `${crew.name} mends the hull (+${Math.max(0, heal)} HP).` }))
        break
      }
      case 'navigator': {
        const mm = m as NavigatorMilestone
        let gain = 0
        if (Math.random() < mm.oneChargeChance) gain = 1
        if (Math.random() < mm.twoChargeChance) gain = 2
        me.s.charges = Math.min(me.l.maxCharges ?? MAX_CHARGES, me.s.charges + gain)
        steps.push(snapshot({ actor: who, ability: true, log: gain > 0 ? `${crew.name} works the reload — +${gain} charge${gain > 1 ? 's' : ''}.` : `${crew.name} works the reload, but the powder won't catch.` }))
        break
      }
      case 'snare': {
        const turns = (m as SnareMilestone).disableDodgeTurns
        foeFx.dodgeJammed = turns === 'rest_of_fight' ? 999 : turns
        steps.push(snapshot({ actor: who, ability: true, log: `${crew.name} fouls ${foe2.l.username}'s helm — their dodge is jammed.` }))
        break
      }
      case 'anchor': {
        const mm = m as AnchorMilestone
        meFx.anchorPct = mm.pctReduction
        meFx.anchorAbsorbsCrit = !!mm.absorbsCrits
        steps.push(snapshot({ actor: who, ability: true, log: `${crew.name} braces the hull for the next blow.` }))
        break
      }
      case 'sharpshot': {
        // Effect is client-side (the firing player's crit zone widens on their
        // shot this round); the server just records the cast for the log.
        steps.push(snapshot({ actor: who, ability: true, log: `${crew.name} steadies the gunners' aim.` }))
        break
      }
      // ── Legendary signatures ───────────────────────────────────────────
      case 'abyssal_tide': {
        // Tidecaller — heal + a persistent damage shield (soaks before HP).
        const mm = m as AbyssalTideMilestone
        const heal = Math.min(me.l.hpMax - me.s.hp, Math.floor(mm.pctMaxHp * me.l.hpMax))
        me.s.hp += Math.max(0, heal)
        const shieldAmt = Math.floor(mm.shieldPctMaxHp * me.l.hpMax)
        meFx.shield = (meFx.shield ?? 0) + shieldAmt
        steps.push(snapshot({ actor: who, ability: true, heal: Math.max(0, heal), log: `${crew.name} calls the tide — +${Math.max(0, heal)} HP and a ${shieldAmt}-pt shield.` }))
        break
      }
      case 'leviathan': {
        // Leviathan — one heavy extra cannon shot (guaranteed hit, autocrits at
        // the capstone). A free salvo on top of the player's move.
        const mm = m as LeviathanMilestone
        const isCrit = !!mm.autoCrit
        const res: ShotResult = isCrit ? 'critical' : 'hit'
        const itemMult = isCrit ? me.l.critDamageMult : me.l.noncritDamageMult
        const foeTakenMult = foe2.l.incomingDamageMult * (1 + (foe2.l.damageTakenPct ?? 0) / 100)
        const rampMult = 1 + (me.l.rampDamagePerTurn ?? 0) * roundIndex
        const raw = rollShotDamage(res, me.l.shipMinDamage, me.l.totalPower, me.l.damagePct)
        const outgoing = Math.max(1, Math.floor(raw * me.l.classDamageMult * itemMult * foeTakenMult * rampMult * mm.dmgMult))
        const { hpDmg, absorbed } = dealDamage(foeWho2, outgoing)
        steps.push(snapshot({ actor: who, action: 'fire', damage: hpDmg, crit: isCrit, log: `${crew.name} looses a Heavy Salvo for ${hpDmg}${isCrit ? ' (critical!)' : ''}${absorbed ? ` (${absorbed} soaked)` : ''}.` }))
        if (foe2.s.hp <= 0) winner = who
        break
      }
      case 'blitz': {
        // Apex — fires, then chains more shots until a roll fails (10-shot cap).
        const mm = m as BlitzMilestone
        const isCrit = !!mm.autoCrit
        const res: ShotResult = isCrit ? 'critical' : 'hit'
        const itemMult = isCrit ? me.l.critDamageMult : me.l.noncritDamageMult
        const foeTakenMult = foe2.l.incomingDamageMult * (1 + (foe2.l.damageTakenPct ?? 0) / 100)
        const rampMult = 1 + (me.l.rampDamagePerTurn ?? 0) * roundIndex
        let shots = 0
        do {
          shots++
          const raw = rollShotDamage(res, me.l.shipMinDamage, me.l.totalPower, me.l.damagePct)
          const outgoing = Math.max(1, Math.floor(raw * me.l.classDamageMult * itemMult * foeTakenMult * rampMult))
          const { hpDmg, absorbed } = dealDamage(foeWho2, outgoing)
          steps.push(snapshot({ actor: who, action: 'fire', damage: hpDmg, crit: isCrit, log: `${crew.name} frenzies — shot ${shots} hits for ${hpDmg}${isCrit ? ' (crit!)' : ''}${absorbed ? ` (${absorbed} soaked)` : ''}.` }))
          if (foe2.s.hp <= 0) { winner = who; break }
        } while (shots < 10 && Math.random() < mm.chainChance)
        break
      }
    }
  }

  for (const who of order) {
    if (winner) break
    const me = sides[who]
    const foeWho = other(who)
    const foe = sides[foeWho]
    const foeFx = fx[foeWho]
    if (me.s.hp <= 0) continue // killed earlier this round — forfeits their action
    if (frozenThisRound[who]) {
      steps.push(snapshot({ actor: who, fx: 'freeze', log: `${me.l.username} is frozen solid and loses the turn.` }))
      continue
    }

    const action = me.m.action

    if (action === 'reload') {
      me.s.charges = Math.min(me.l.maxCharges ?? MAX_CHARGES, me.s.charges + 1)
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
    const cost = action === 'volley' ? MAX_CHARGES : 1 // volley still costs 3
    if (me.s.charges < cost) {
      me.s.charges = Math.min(me.l.maxCharges ?? MAX_CHARGES, me.s.charges + 1)
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

    // Defender dodging? full dodge on success, 50% on a failed evade — unless
    // their dodge is jammed by a Snare, in which case it fails outright.
    let dodged = false
    let dodgeMult = 1
    let dodgeJammed = false
    if (foe.m.action === 'dodge' && result !== 'miss') {
      if (foeFx.dodgeJammed > 0) {
        dodgeJammed = true // jammed — no evasion, full damage
      } else {
        const def = rollDodge(foe.l.shipSpeed, foe.l.navigation)
        const atk = rollAttackerVsDodge(me.l.shipSpeed)
        if (def >= atk) { dodged = true; dodgeMult = 0 }
        else dodgeMult = 0.5
      }
    }

    const itemMult = crit ? me.l.critDamageMult : me.l.noncritDamageMult
    const volleyMult = action === 'volley' ? 2 : 1
    // Defender's incoming-damage chain: item incoming mult × crew damageTakenPct
    // (raid convention: positive = takes MORE). Attacker's ramp scales with the
    // round elapsed.
    const foeTakenMult = foe.l.incomingDamageMult * (1 + (foe.l.damageTakenPct ?? 0) / 100)
    const rampMult = 1 + (me.l.rampDamagePerTurn ?? 0) * roundIndex
    const raw = rollShotDamage(result, me.l.shipMinDamage, me.l.totalPower, me.l.damagePct)
    // The shot's full damage had it landed clean — used both for the actual hit
    // (× dodgeMult) and for a parry reflect on a full dodge.
    const wouldHit = Math.floor(raw * volleyMult * me.l.classDamageMult * itemMult * foeTakenMult * rampMult)
    let dmg = Math.floor(wouldHit * dodgeMult)

    // Brace (Anchor): soak the next incoming hit. Crits bypass unless the
    // brace is the Lv 100 crit-absorbing tier. Consumed on use.
    let braced = false
    if (dmg > 0 && foeFx.anchorPct > 0 && (!crit || foeFx.anchorAbsorbsCrit)) {
      dmg = Math.floor(dmg * (1 - foeFx.anchorPct))
      foeFx.anchorPct = 0
      foeFx.anchorAbsorbsCrit = false
      braced = true
    }

    // Route through any Tidecaller shield; hpDmg is what actually hit HP.
    const { hpDmg, absorbed } = dealDamage(foeWho, dmg)

    // Incendiary / Frozen on-hit procs — only on a landed hit (the shot
    // connected, even if a shield ate it) that didn't sink them. Burn refreshes
    // to a fresh 2 turns (ticks at round start); freeze flags their NEXT round.
    let igniteNote = ''
    if (dmg > 0 && foe.s.hp > 0) {
      if ((me.l.burnChance ?? 0) > 0 && Math.random() < (me.l.burnChance ?? 0)) {
        const tick = Math.max(1, Math.round(dmg * BURN_TICK_PCT))
        foeFx.burnTurns = BURN_TURNS
        foeFx.burnDmg = tick
        igniteNote += ` ${foe.l.username}'s hull catches fire (${tick}/turn).`
      }
      if ((me.l.freezeChance ?? 0) > 0 && Math.random() < (me.l.freezeChance ?? 0)) {
        foeFx.frozen = true
        igniteNote += ` ${foe.l.username} ices over and loses next turn.`
      }
    }

    const shieldNote = absorbed > 0 ? ` (${absorbed} soaked by shield)` : ''
    const verb = action === 'volley' ? 'unloads a volley' : 'fires'
    const log = dodged
      ? `${me.l.username} ${verb} — ${foe.l.username} evades!`
      : dodgeJammed
        ? `${me.l.username} ${verb} for ${hpDmg} — ${foe.l.username}'s dodge is jammed!${shieldNote}`
        : result === 'miss'
          ? `${me.l.username} ${verb} and misses.`
          : `${me.l.username} ${verb} for ${hpDmg}${crit ? ' (critical!)' : ''}${braced ? ' — braced!' : ''}.${shieldNote}${igniteNote}`
    steps.push(snapshot({ actor: who, action, aimResult: result, damage: hpDmg, dodged, crit, log }))

    if (foe.s.hp <= 0) { winner = who; continue }

    // Astrolabe parry — on a FULL dodge, the dodger turns a slice of the shot
    // they slipped back onto the attacker (a separate beat that lands on the
    // attacker, i.e. the actor of THIS parry step). Unmitigated; mirrors PvE.
    if (dodged && (foe.l.parryChance ?? 0) > 0 && (foe.l.parryReflectPct ?? 0) > 0 && wouldHit > 0 && Math.random() < (foe.l.parryChance ?? 0)) {
      const reflect = Math.max(1, Math.floor(wouldHit * (foe.l.parryReflectPct ?? 0)))
      const { hpDmg: reflectHp } = dealDamage(who, reflect)
      steps.push(snapshot({ actor: who, fx: 'parry', damage: reflectHp, log: `${foe.l.username} parries and turns the shot back for ${reflectHp}!` }))
      if (me.s.hp <= 0) winner = foeWho
    }
  }

  // Snare ticks down at round end (the round it was cast counts as turn 1).
  fx.challenger.dodgeJammed = Math.max(0, fx.challenger.dodgeJammed - 1)
  fx.opponent.dodgeJammed = Math.max(0, fx.opponent.dodgeJammed - 1)

  return {
    steps,
    challenger: sides.challenger.s,
    opponent: sides.opponent.s,
    challengerFx: fx.challenger,
    opponentFx: fx.opponent,
    winner,
  }
}
