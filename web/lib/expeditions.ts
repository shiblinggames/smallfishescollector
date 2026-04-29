// ── Types ─────────────────────────────────────────────────────────────────────

export type ZoneKey = 'coral_run' | 'bertuna_triangle' | 'sunken_reach' | 'davy_jones_locker'
export type ExpeditionStatus = 'active' | 'completed' | 'failed'
export type CombatAction = 'reload' | 'fire' | 'defend'
export type NodeType = 'fight' | 'event' | 'shop' | 'boss'

export interface ShipStats {
  name: string
  durability: number
  speed: number
  armor: number
  crewSlots: number
}

export interface CrewCard {
  collectionId: number
  cardId: number
  variantId: number
  name: string
  slug: string
  filename: string
  rarity: string
  power: number
  dodge: number
  fortune: number
}

export interface TotalCrewStats {
  power: number
  dodge: number
  fortune: number
}

export interface RunBuff {
  source: string
  effect: 'power' | 'dodge' | 'fortune' | 'armor' | 'durability'
  value: number
}

export interface CombatRoundLog {
  round: number
  playerAction: CombatAction
  playerChargesBefore: number
  enemyAction: CombatAction
  enemyChargesBefore: number
  playerFirst: boolean
  playerDamageDealt: number
  playerDamageTaken: number
  playerDodged: boolean
  critHit: boolean
  enemyHpAfter: number
  playerDurabilityAfter: number
}

export interface CombatState {
  enemyId: string
  enemyHp: number
  enemyCharges: number
  enemyPatternIndex: number
  playerCharges: number
  round: number
  log: CombatRoundLog[]
}

export interface NodeResult {
  nodeIndex: number
  type: NodeType
  outcome: 'win' | 'lose' | 'skipped' | 'event' | 'shop'
  details?: Record<string, unknown>
}

export interface ZoneLoot {
  doubloons: number
  itemDropped: string | null
}

export interface Expedition {
  id: number
  user_id: string
  zone: ZoneKey
  ship_tier: number
  status: ExpeditionStatus
  current_node: number
  crew_loadout: CrewCard[]
  events: NodeResult[]
  hull_damage: number
  run_gold: number
  combat_state: CombatState | null
  equipped_item: string | null
  run_buffs: RunBuff[]
  loot: ZoneLoot | null
  expedition_date: string
  started_at: string
  completed_at: string | null
}

// ── Ship stats ────────────────────────────────────────────────────────────────

export const EXPEDITION_SHIP_STATS: Record<number, ShipStats> = {
  0: { name: 'Rowboat',    durability: 20, speed: 2,  armor: 1, crewSlots: 1 },
  1: { name: 'Sloop',      durability: 35, speed: 4,  armor: 2, crewSlots: 2 },
  2: { name: 'Brigantine', durability: 55, speed: 6,  armor: 4, crewSlots: 3 },
  3: { name: 'Galleon',    durability: 80, speed: 9,  armor: 6, crewSlots: 4 },
}

// ── Crew stats ────────────────────────────────────────────────────────────────

const CREW_BASE_STATS: Record<string, { power: number; dodge: number; fortune: number }> = {
  common:    { power: 2, dodge: 2, fortune: 1 },
  uncommon:  { power: 3, dodge: 2, fortune: 2 },
  rare:      { power: 4, dodge: 3, fortune: 2 },
  epic:      { power: 5, dodge: 4, fortune: 3 },
  legendary: { power: 7, dodge: 5, fortune: 5 },
  mythic:    { power: 10, dodge: 7, fortune: 7 },
}

export function getCrewStats(rarity: string): { power: number; dodge: number; fortune: number } {
  return CREW_BASE_STATS[rarity.toLowerCase()] ?? CREW_BASE_STATS.common
}

export function computeTotalCrewStats(crew: CrewCard[]): TotalCrewStats {
  return crew.reduce(
    (totals, card) => ({
      power:   totals.power   + card.power,
      dodge:   totals.dodge   + card.dodge,
      fortune: totals.fortune + card.fortune,
    }),
    { power: 0, dodge: 0, fortune: 0 },
  )
}

// ── Enemies ───────────────────────────────────────────────────────────────────

export interface EnemyDef {
  id: string
  name: string
  maxHp: number
  damage: number
  goldReward: number
  pattern: CombatAction[]
}

export const ENEMIES: Record<string, EnemyDef> = {
  brute: {
    id: 'brute',
    name: 'Reef Raider',
    maxHp: 20,
    damage: 6,
    goldReward: 25,
    pattern: ['reload', 'fire', 'reload', 'fire'],
  },
  sniper: {
    id: 'sniper',
    name: "Crow's Nest Marksman",
    maxHp: 25,
    damage: 14,
    goldReward: 30,
    pattern: ['reload', 'reload', 'reload', 'fire'],
  },
  barnacle_pete: {
    id: 'barnacle_pete',
    name: 'Barnacle Pete',
    maxHp: 50,
    damage: 10,
    goldReward: 60,
    pattern: ['reload', 'fire', 'reload', 'fire', 'reload', 'reload', 'fire'],
  },
}

// ── Combat resolution ─────────────────────────────────────────────────────────

export const FIRE_MULTIPLIERS: Record<number, number> = { 0: 0, 1: 1, 2: 2.5, 3: 5 }
const ENEMY_BASE_SPEED = 3

export interface RoundResolution {
  newState: CombatState
  newDurability: number
  roundLog: CombatRoundLog
  combatOver: boolean
  playerWon: boolean
}

export function resolveRound(
  state: CombatState,
  playerAction: CombatAction,
  crew: TotalCrewStats,
  ship: ShipStats,
  currentDurability: number,
  runBuffs: RunBuff[],
): RoundResolution {
  const enemy = ENEMIES[state.enemyId]
  const rawEnemyAction = enemy.pattern[state.enemyPatternIndex % enemy.pattern.length]

  // Buffed stats
  const buffPower   = runBuffs.filter(b => b.effect === 'power').reduce((s, b) => s + b.value, 0)
  const buffArmor   = runBuffs.filter(b => b.effect === 'armor').reduce((s, b) => s + b.value, 0)
  const effectivePower  = crew.power   + buffPower
  const effectiveArmor  = ship.armor   + buffArmor

  // Can fire?
  const playerCanFire = playerAction === 'fire' && state.playerCharges > 0
  const enemyCanFire  = rawEnemyAction === 'fire' && state.enemyCharges > 0
  // Enemy falls back to reload if it tries to fire with no charges
  const enemyAction: CombatAction = rawEnemyAction === 'fire' && !enemyCanFire ? 'reload' : rawEnemyAction

  // New charge counts
  let newPlayerCharges = state.playerCharges
  if (playerAction === 'reload') newPlayerCharges = Math.min(state.playerCharges + 1, 3)
  else if (playerCanFire)        newPlayerCharges = 0
  // defend: unchanged; attempted fire with 0 charges acts as reload
  else if (playerAction === 'fire') newPlayerCharges = Math.min(state.playerCharges + 1, 3)

  let newEnemyCharges = state.enemyCharges
  if (enemyAction === 'reload') newEnemyCharges = Math.min(state.enemyCharges + 1, 3)
  else if (enemyCanFire)        newEnemyCharges = 0

  // Compute player shot damage
  let playerDamageDealt = 0
  let critHit = false
  if (playerCanFire) {
    const mult = FIRE_MULTIPLIERS[state.playerCharges] ?? 1
    const base = Math.max(1, Math.floor(effectivePower * mult))
    const critChance = Math.min(crew.fortune * 4, 60)
    critHit = Math.random() * 100 < critChance
    playerDamageDealt = critHit ? Math.floor(base * 2) : base
  }

  // Compute enemy shot damage (before armor/dodge)
  const enemyShotDamage = enemyCanFire ? enemy.damage : 0

  // Speed roll (only matters if both fire)
  const playerSpeedRoll = Math.floor(Math.random() * 20) + 1 + ship.speed
  const enemySpeedRoll  = Math.floor(Math.random() * 20) + 1 + ENEMY_BASE_SPEED
  const playerFirst = playerSpeedRoll >= enemySpeedRoll

  // Resolve in order
  let enemyHpAfter = state.enemyHp
  let newDurability = currentDurability
  let playerDamageTaken = 0
  let playerDodged = false

  function applyPlayerShot() {
    enemyHpAfter = Math.max(0, enemyHpAfter - playerDamageDealt)
  }

  function applyEnemyShot() {
    if (!enemyCanFire) return
    if (playerAction === 'defend') {
      const dodgeChance = Math.min(crew.dodge * 5, 70)
      if (Math.random() * 100 < dodgeChance) { playerDodged = true; return }
      // Defending: 50% bonus reduction on top of armor
      const reduced = Math.floor(enemyShotDamage * 0.5)
      playerDamageTaken = Math.max(1, reduced - effectiveArmor)
    } else {
      playerDamageTaken = Math.max(1, enemyShotDamage - effectiveArmor)
    }
    newDurability = Math.max(0, newDurability - playerDamageTaken)
  }

  if (playerCanFire && enemyCanFire) {
    if (playerFirst) {
      applyPlayerShot()
      if (enemyHpAfter > 0) applyEnemyShot()
    } else {
      applyEnemyShot()
      if (newDurability > 0) applyPlayerShot()
    }
  } else {
    applyPlayerShot()
    applyEnemyShot()
  }

  const roundLog: CombatRoundLog = {
    round: state.round,
    playerAction: playerCanFire ? 'fire' : (playerAction === 'fire' ? 'reload' : playerAction),
    playerChargesBefore: state.playerCharges,
    enemyAction,
    enemyChargesBefore: state.enemyCharges,
    playerFirst: playerCanFire && enemyCanFire ? playerFirst : true,
    playerDamageDealt,
    playerDamageTaken,
    playerDodged,
    critHit,
    enemyHpAfter,
    playerDurabilityAfter: newDurability,
  }

  const newState: CombatState = {
    ...state,
    enemyHp: enemyHpAfter,
    enemyCharges: newEnemyCharges,
    enemyPatternIndex: state.enemyPatternIndex + 1,
    playerCharges: newPlayerCharges,
    round: state.round + 1,
    log: [...state.log, roundLog],
  }

  return {
    newState,
    newDurability,
    roundLog,
    combatOver: enemyHpAfter <= 0 || newDurability <= 0,
    playerWon: enemyHpAfter <= 0,
  }
}

export function initCombatState(enemyId: string, equippedItem: string | null): CombatState {
  const startCharges = equippedItem === 'powder_keg' ? 1 : 0
  return {
    enemyId,
    enemyHp: ENEMIES[enemyId].maxHp,
    enemyCharges: 0,
    enemyPatternIndex: 0,
    playerCharges: startCharges,
    round: 0,
    log: [],
  }
}

// ── Zone events ───────────────────────────────────────────────────────────────

export type EventEffectType = 'heal' | 'damage' | 'gold' | 'buff' | 'nothing'

export interface EventEffect {
  type: EventEffectType
  value?: number
  buff?: RunBuff
}

export interface EventChoice {
  label: string
  effect: EventEffect
}

export interface EventNodeDef {
  id: string
  name: string
  flavor: string
  choices: EventChoice[]
}

export const CORAL_RUN_EVENTS: EventNodeDef[] = [
  {
    id: 'calm_waters',
    name: 'Calm Waters',
    flavor: 'The reef stretches ahead in glassy stillness. Your crew spots a freshwater spring on a nearby rock — a rare find in these salty shallows.',
    choices: [
      { label: 'Collect fresh water and patch the hull (+8 Durability)', effect: { type: 'heal', value: 8 } },
      { label: 'Press on — no time to stop', effect: { type: 'nothing' } },
    ],
  },
  {
    id: 'squall',
    name: 'Sudden Squall',
    flavor: 'A short but vicious storm rises from nowhere. Waves crash over the deck and splinter a section of hull before you can brace.',
    choices: [
      { label: 'Brace for impact (−6 Durability)', effect: { type: 'damage', value: 6 } },
    ],
  },
  {
    id: 'abandoned_wreck',
    name: 'Abandoned Wreck',
    flavor: 'A half-sunken merchant sloop drifts ahead. Could be salvage. Could be a trap.',
    choices: [
      { label: 'Board and salvage (+20 Gold)', effect: { type: 'gold', value: 20 } },
      { label: "Leave it — something's not right", effect: { type: 'nothing' } },
    ],
  },
  {
    id: 'powder_stash',
    name: 'Stockpiled Powder',
    flavor: "Your bosun found a forgotten crate of gunpowder wedged in the hold. Enough to load the cannons right now.",
    choices: [
      { label: 'Load the cannons (+2 Power for this run)', effect: { type: 'buff', buff: { source: 'powder_stash', effect: 'power', value: 2 } } },
      { label: 'Toss it overboard — too risky', effect: { type: 'nothing' } },
    ],
  },
  {
    id: 'fortify_hull',
    name: 'Floating Timber',
    flavor: 'A raft of loose timber drifts alongside you — must have fallen off a logging ship. Your carpenter eyes it greedily.',
    choices: [
      { label: 'Patch the hull with the timber (+10 Durability)', effect: { type: 'heal', value: 10 } },
      { label: 'No time for carpentry', effect: { type: 'nothing' } },
    ],
  },
]

// ── Shop ──────────────────────────────────────────────────────────────────────

export interface ShopOption {
  id: string
  label: string
  description: string
  cost: number
  effect: EventEffect
}

export const CORAL_RUN_SHOP: ShopOption[] = [
  {
    id: 'repair_small',
    label: 'Hull Repair',
    description: 'Patch up the ship (+12 Durability)',
    cost: 20,
    effect: { type: 'heal', value: 12 },
  },
  {
    id: 'sharpen_powder',
    label: 'Fine-Ground Powder',
    description: 'Better gunpowder for the rest of the run (+3 Power)',
    cost: 30,
    effect: { type: 'buff', buff: { source: 'fine_powder', effect: 'power', value: 3 } },
  },
  {
    id: 'iron_plating',
    label: 'Iron Plating',
    description: 'Bolt iron sheets to the hull (+2 Armor)',
    cost: 35,
    effect: { type: 'buff', buff: { source: 'iron_plating', effect: 'armor', value: 2 } },
  },
]

// ── Zone config ───────────────────────────────────────────────────────────────

export interface ZoneNodeConfig {
  type: NodeType
  enemyPool?: string[]
}

export interface ZoneConfig {
  name: string
  icon: string
  description: string
  requiredShipTier: number
  entryCost: number
  baseDoubloons: number
  nodes: ZoneNodeConfig[]
  fightEnemyPool: string[]
  bossId: string
  itemDropPool: string[]
  itemDropChance: number
}

export const ZONES: Record<ZoneKey, ZoneConfig> = {
  coral_run: {
    name: 'The Coral Run',
    icon: '🌊',
    description: 'Familiar coastlines and reef passages. Safe enough for new crews.',
    requiredShipTier: 0,
    entryCost: 25,
    baseDoubloons: 80,
    nodes: [
      { type: 'fight' },
      { type: 'event' },
      { type: 'fight' },
      { type: 'shop' },
      { type: 'boss' },
    ],
    fightEnemyPool: ['brute', 'sniper'],
    bossId: 'barnacle_pete',
    itemDropPool: ['powder_keg', 'patched_hull', 'anchor_chain', 'bait_barrel', 'lucky_lure'],
    itemDropChance: 0.25,
  },
  bertuna_triangle: {
    name: 'The Bertuna Triangle',
    icon: '🧭',
    description: 'The stretch where ships go missing.',
    requiredShipTier: 2,
    entryCost: 75,
    baseDoubloons: 200,
    nodes: [
      { type: 'fight' },
      { type: 'event' },
      { type: 'fight' },
      { type: 'fight' },
      { type: 'shop' },
      { type: 'boss' },
    ],
    fightEnemyPool: ['brute', 'sniper'],
    bossId: 'barnacle_pete',
    itemDropPool: [],
    itemDropChance: 0,
  },
  sunken_reach: {
    name: 'The Sunken Reach',
    icon: '🌑',
    description: 'Below the known charts.',
    requiredShipTier: 4,
    entryCost: 200,
    baseDoubloons: 500,
    nodes: [
      { type: 'fight' },
      { type: 'event' },
      { type: 'fight' },
      { type: 'fight' },
      { type: 'shop' },
      { type: 'boss' },
    ],
    fightEnemyPool: ['brute', 'sniper'],
    bossId: 'barnacle_pete',
    itemDropPool: [],
    itemDropChance: 0,
  },
  davy_jones_locker: {
    name: "Davy Jones' Locker",
    icon: '💀',
    description: 'No charts exist.',
    requiredShipTier: 6,
    entryCost: 500,
    baseDoubloons: 1200,
    nodes: [
      { type: 'fight' },
      { type: 'event' },
      { type: 'fight' },
      { type: 'fight' },
      { type: 'shop' },
      { type: 'boss' },
    ],
    fightEnemyPool: ['brute', 'sniper'],
    bossId: 'barnacle_pete',
    itemDropPool: [],
    itemDropChance: 0,
  },
}

export const ZONE_ORDER: ZoneKey[] = ['coral_run', 'bertuna_triangle', 'sunken_reach', 'davy_jones_locker']

// ── Items ─────────────────────────────────────────────────────────────────────

export interface ExpeditionItem {
  id: string
  name: string
  description: string
  effectDescription: string
}

export const EXPEDITION_ITEMS: Record<string, ExpeditionItem> = {
  powder_keg: {
    id: 'powder_keg',
    name: 'Powder Keg',
    description: 'A pre-loaded keg ready to go.',
    effectDescription: 'Start each run with 1 charge already loaded',
  },
  patched_hull: {
    id: 'patched_hull',
    name: 'Patched Hull',
    description: 'Pre-voyage repairs to weak spots.',
    effectDescription: 'Start each run with +10 Durability',
  },
  anchor_chain: {
    id: 'anchor_chain',
    name: 'Anchor Chain',
    description: 'Heavy iron links bolted to the hull.',
    effectDescription: '+2 Armor for the entire run',
  },
  bait_barrel: {
    id: 'bait_barrel',
    name: 'Bait Barrel',
    description: 'A fresh barrel of premium bait.',
    effectDescription: '+5 free worms per day',
  },
  lucky_lure: {
    id: 'lucky_lure',
    name: 'Lucky Lure',
    description: 'Carved from a sailor\'s lucky coin.',
    effectDescription: 'Improved catch rates when fishing',
  },
}

// ── Rarity colors (kept for shared use) ──────────────────────────────────────

export const RARITY_COLORS: Record<string, string> = {
  common:    '#8a8880',
  uncommon:  '#4ade80',
  rare:      '#60a5fa',
  epic:      '#a78bfa',
  legendary: '#f0c040',
  mythic:    '#ff3838',
}
