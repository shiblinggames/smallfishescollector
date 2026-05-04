// ── Types ─────────────────────────────────────────────────────────────────────

export type ZoneKey = 'coral_run' | 'bertuna_triangle' | 'sunken_reach' | 'davy_jones_locker'
export type ExpeditionStatus = 'active' | 'completed' | 'failed'
export type CombatAction = 'reload' | 'fire' | 'fire_heavy' | 'defend'
export type NodeType = 'fight' | 'event' | 'shop' | 'boss'

export interface ShipStats {
  name: string
  image: string
  durability: number
  speed: number
  armor: number
  crewSlots: number
  minDamage: number
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
  count: number
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
  enemyDodged: boolean
  critHit: boolean
  enemyCrit: boolean
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
  captains_log: string | null
  log_generated_at: string | null
}

// ── Ship stats ────────────────────────────────────────────────────────────────

export const EXPEDITION_SHIP_STATS: Record<number, ShipStats> = {
  0: { name: 'Rowboat',    image: '/models/rowboat.png',    durability: 20, speed: 2,  armor: 1, crewSlots: 1, minDamage: 1 },
  1: { name: 'Dinghy',     image: '/models/dinghy.png',     durability: 27, speed: 3,  armor: 1, crewSlots: 1, minDamage: 2 },
  2: { name: 'Sloop',      image: '/models/sloop.png',      durability: 35, speed: 4,  armor: 2, crewSlots: 2, minDamage: 3 },
  3: { name: 'Schooner',   image: '/models/schooner.png',   durability: 45, speed: 5,  armor: 3, crewSlots: 2, minDamage: 4 },
  4: { name: 'Brigantine', image: '/models/brigantine.png', durability: 55, speed: 6,  armor: 4, crewSlots: 3, minDamage: 6 },
  5: { name: 'Galleon',    image: '/models/galleon.png',    durability: 70, speed: 8,  armor: 5, crewSlots: 4, minDamage: 8 },
  6: { name: 'Man-o-War',  image: '/models/man-o-war.png',  durability: 90, speed: 11, armor: 8, crewSlots: 5, minDamage: 11 },
}

// ── Crew stats ────────────────────────────────────────────────────────────────

const MYTHIC_VARIANTS = new Set(['Kraken', 'Davy Jones', 'Golden Age', 'Wanted', 'Maelstrom', 'GOD'])

export function applyVariantBoosts(
  base: { power: number; dodge: number; fortune: number },
  variantName: string,
  mythic: { power: number; dodge: number; fortune: number },
): { power: number; dodge: number; fortune: number } {
  if (MYTHIC_VARIANTS.has(variantName)) return { ...mythic }

  const result = { ...base }
  type S = 'power' | 'dodge' | 'fortune'
  const [primary, secondary, tertiary] = (['power', 'dodge', 'fortune'] as S[])
    .sort((a, b) => base[b] - base[a])

  switch (variantName) {
    case 'Gold':
      result[primary] += 4
      break
    case 'Pearl':
      result[primary] += 4
      result[secondary] += 3
      break
    case 'Holographic':
      result[secondary] += 4
      result[tertiary] += 3
      break
    case 'Ghost':
      result.power += 5; result.dodge += 4; result.fortune += 3
      break
    case 'Shadow':
      result.power += 4; result.dodge += 4; result.fortune += 4
      break
    case 'Prismatic':
      result.power += 3; result.dodge += 4; result.fortune += 5
      break
  }

  return result
}

export function computeTotalCrewStats(crew: CrewCard[]): TotalCrewStats {
  return crew.reduce(
    (totals, card, i) => {
      const mult = i === 0 ? 1.0 : 0.8
      return {
        count:   totals.count   + 1,
        power:   totals.power   + Math.round(card.power   * mult),
        dodge:   totals.dodge   + Math.round(card.dodge   * mult),
        fortune: totals.fortune + Math.round(card.fortune * mult),
      }
    },
    { count: 0, power: 0, dodge: 0, fortune: 0 },
  )
}

// ── Enemies ───────────────────────────────────────────────────────────────────

export interface LootEntry {
  itemId: string
  weight: number
}

export interface EnemyLootTable {
  type: 'run' | 'permanent'  // run = applied this fight, not kept; permanent = goes to inventory
  dropChance: number          // 0–1
  pool: LootEntry[]
}

export interface EnemyDef {
  id: string
  name: string
  image: string | null  // portrait filename in enemy-arts bucket (circular avatar)
  tier: number          // determines which boat image is shown in combat (enemytier{N}.png)
  maxHp: number
  minDamage: number  // minimum damage per shot
  damage: number     // maximum damage per shot
  dodge: number   // same scale as crew dodge: dodge*5 = dodge%
  armor: number   // flat damage reduction on incoming player shots
  fortune: number // fortune*4 = crit%
  speed: number   // same scale as ship speed
  goldReward: number
  pattern: CombatAction[]
  elite: boolean
  lootTable: EnemyLootTable | null
}

export function rollLootTable(table: EnemyLootTable): string | null {
  if (Math.random() >= table.dropChance) return null
  const total = table.pool.reduce((s, e) => s + e.weight, 0)
  let roll = Math.random() * total
  for (const entry of table.pool) {
    roll -= entry.weight
    if (roll <= 0) return entry.itemId
  }
  return table.pool[table.pool.length - 1]?.itemId ?? null
}

export const ENEMIES: Record<string, EnemyDef> = {
  brute: {
    id: 'brute',
    name: 'Reef Raider',
    image: null,
    tier: 1,
    maxHp: 20,
    minDamage: 2,
    damage: 4,
    dodge: 0,
    armor: 0,
    fortune: 0,
    speed: 3,
    goldReward: 25,
    pattern: ['reload', 'fire', 'reload', 'fire'],
    elite: false,
    lootTable: null,
  },
  sniper: {
    id: 'sniper',
    name: "Crow's Nest Marksman",
    image: null,
    tier: 1,
    maxHp: 25,
    minDamage: 1,
    damage: 12,
    dodge: 2,
    armor: 0,
    fortune: 3,
    speed: 2,
    goldReward: 30,
    pattern: ['reload', 'reload', 'reload', 'fire'],
    elite: false,
    lootTable: null,
  },
  corsair: {
    id: 'corsair',
    name: 'Saltwater Corsair',
    image: null,
    tier: 1,
    maxHp: 35,
    minDamage: 3,
    damage: 9,
    dodge: 2,
    armor: 1,
    fortune: 2,
    speed: 4,
    goldReward: 45,
    pattern: ['reload', 'fire', 'defend', 'reload', 'fire'],
    elite: true,
    lootTable: {
      type: 'run',
      dropChance: 0.30,
      pool: [
        { itemId: 'repair_kit',       weight: 3 },
        { itemId: 'gunpowder_cache',  weight: 2 },
        { itemId: 'iron_bolts',       weight: 2 },
      ],
    },
  },
  barnacle_pete: {
    id: 'barnacle_pete',
    name: 'Barnacle Pete',
    image: 'barnacle_pete.png',
    tier: 1,
    maxHp: 50,
    minDamage: 4,
    damage: 12,
    dodge: 1,
    armor: 3,
    fortune: 2,
    speed: 4,
    goldReward: 60,
    pattern: ['reload', 'fire', 'reload', 'fire', 'reload', 'reload', 'fire'],
    elite: true,
    lootTable: {
      type: 'permanent',
      dropChance: 0.60,
      pool: [
        { itemId: 'powder_keg',   weight: 3 },
        { itemId: 'patched_hull', weight: 3 },
        { itemId: 'anchor_chain', weight: 2 },
        { itemId: 'bait_barrel',  weight: 2 },
        { itemId: 'lucky_lure',   weight: 2 },
      ],
    },
  },
}

// ── Combat resolution ─────────────────────────────────────────────────────────

// fire = light attack (1 charge, ×1). fire_heavy = volley (3 charges, ×2).
export const FIRE_MULTIPLIERS = { light: 1, heavy: 2 } as const

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
  const playerIsLightFire = playerAction === 'fire'       && state.playerCharges >= 1
  const playerIsHeavyFire = playerAction === 'fire_heavy' && state.playerCharges === 3
  const playerCanFire = playerIsLightFire || playerIsHeavyFire
  const enemyCanFire  = rawEnemyAction === 'fire' && state.enemyCharges > 0
  // Enemy falls back to reload if it tries to fire with no charges
  const enemyAction: CombatAction = rawEnemyAction === 'fire' && !enemyCanFire ? 'reload' : rawEnemyAction

  // New charge counts
  let newPlayerCharges = state.playerCharges
  if (playerAction === 'reload') {
    newPlayerCharges = Math.min(state.playerCharges + 1, 3)
  } else if (playerIsLightFire) {
    newPlayerCharges = state.playerCharges - 1  // spend exactly 1
  } else if (playerIsHeavyFire) {
    newPlayerCharges = 0                         // spend all 3
  } else if (playerAction === 'fire' || playerAction === 'fire_heavy') {
    newPlayerCharges = Math.min(state.playerCharges + 1, 3)  // invalid fire → reload
  }
  // defend: unchanged

  let newEnemyCharges = state.enemyCharges
  if (enemyAction === 'reload') newEnemyCharges = Math.min(state.enemyCharges + 1, 3)
  else if (enemyCanFire)        newEnemyCharges = 0

  // Player shot damage — roll between crewCount (min) and effectivePower*mult (max)
  let playerDamageDealt = 0
  let critHit = false
  let enemyDodged = false
  if (playerCanFire) {
    const mult = playerIsHeavyFire ? FIRE_MULTIPLIERS.heavy : FIRE_MULTIPLIERS.light
    const maxDmg = Math.max(1, Math.floor(effectivePower * mult))
    const minDmg = ship.minDamage
    const base = minDmg >= maxDmg ? maxDmg : Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg
    const critChance = Math.min(crew.fortune / 2, 50)
    critHit = Math.random() * 100 < critChance
    const raw = critHit ? Math.floor(base * 2) : base
    // Enemy dodge
    const enemyDodgeChance = Math.min(enemy.dodge * 5, 70)
    enemyDodged = Math.random() * 100 < enemyDodgeChance
    playerDamageDealt = enemyDodged ? 0 : Math.max(0, raw - enemy.armor)
    if (enemyDodged) critHit = false
  }

  // Enemy shot damage — roll 1 to enemy.damage, possible crit
  let enemyShotDamage = 0
  let enemyCrit = false
  if (enemyCanFire) {
    const base = Math.floor(Math.random() * (enemy.damage - enemy.minDamage + 1)) + enemy.minDamage
    const enemyCritChance = Math.min(enemy.fortune * 4, 60)
    enemyCrit = Math.random() * 100 < enemyCritChance
    enemyShotDamage = enemyCrit ? Math.floor(base * 2) : base
  }

  // Speed roll
  const playerSpeedRoll = Math.floor(Math.random() * 20) + 1 + ship.speed
  const enemySpeedRoll  = Math.floor(Math.random() * 20) + 1 + enemy.speed
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
      const dodgeChance = Math.min(50 + crew.dodge / 2, 100)
      if (Math.random() * 100 < dodgeChance) { playerDodged = true; return }
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
    playerAction: playerCanFire
      ? (playerIsHeavyFire ? 'fire_heavy' : 'fire')
      : (playerAction === 'fire' || playerAction === 'fire_heavy') ? 'reload' : playerAction,
    playerChargesBefore: state.playerCharges,
    enemyAction,
    enemyChargesBefore: state.enemyCharges,
    playerFirst: playerCanFire && enemyCanFire ? playerFirst : true,
    playerDamageDealt,
    playerDamageTaken,
    playerDodged,
    enemyDodged,
    critHit,
    enemyCrit,
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
    fightEnemyPool: ['brute', 'sniper', 'corsair'],
    bossId: 'barnacle_pete',
    itemDropPool: ['powder_keg', 'patched_hull', 'anchor_chain', 'bait_barrel', 'lucky_lure'],
    itemDropChance: 0.30,
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

// ── Run items (dropped mid-expedition, applied immediately, not kept) ─────────

export interface RunItemDef {
  id: string
  name: string
  effectDescription: string
  effect: EventEffect
}

export const RUN_ITEMS: Record<string, RunItemDef> = {
  repair_kit: {
    id: 'repair_kit',
    name: 'Repair Kit',
    effectDescription: 'Restore 12 hull durability',
    effect: { type: 'heal', value: 12 },
  },
  gunpowder_cache: {
    id: 'gunpowder_cache',
    name: 'Gunpowder Cache',
    effectDescription: '+2 Power for this run',
    effect: { type: 'buff', buff: { source: 'gunpowder_cache', effect: 'power', value: 2 } },
  },
  iron_bolts: {
    id: 'iron_bolts',
    name: 'Iron Bolts',
    effectDescription: '+1 Armor for this run',
    effect: { type: 'buff', buff: { source: 'iron_bolts', effect: 'armor', value: 1 } },
  },
}

// ── Items (permanent — equip before run, persisted to inventory) ──────────────

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
