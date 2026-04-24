export type Stat = 'combat' | 'navigation' | 'durability' | 'speed' | 'luck'
export type ZoneKey = 'coral_run' | 'bertuna_triangle' | 'sunken_reach' | 'davy_jones_locker'
export type ExpeditionStatus = 'active' | 'completed' | 'failed'
export type DifficultyTier = 'easy' | 'standard' | 'crisis'

export interface ExpeditionShipStats {
  name: string
  combat: number
  navigation: number
  durability: number
  speed: number
  luck: number
  crewSlots: number
}

export interface CrewCard {
  collectionId: number
  cardId: number
  variantId: number
  name: string
  slug: string
  filename: string
  fishTier: 1 | 2 | 3
  rarity: string
  power: number
}

export type CrewLoadout = Record<Stat, CrewCard[]>

export interface EventMechanics {
  stat: Stat | null
  difficultyTier: DifficultyTier
  threshold?: number
}

export interface EventChoice {
  label: string
  successText: string
  failText: string
  isNoRoll?: boolean
  cost?: number
}

export interface EventNode {
  nodeIndex: number
  eventType: string
  name: string
  flavor: string
  isCrisis: boolean
  isPenalty?: boolean
  mechanics: EventMechanics
  choices: EventChoice[]
}

export interface EventResult {
  nodeIndex: number
  eventType: string
  choiceIndex: number
  outcome: 'success' | 'fail'
  text: string
  noRoll?: boolean
  stat?: Stat | null
  roll?: number
  crewRoll?: number
  base?: number
  crewBonus?: number
  total?: number
  threshold?: number
  hullDamage?: number
  lootPenalty?: number
  costPenalty?: number
  expeditionFailed?: boolean
  failReason?: string
  skipNextNode?: boolean
  penaltyEventIndex?: number
}

export interface LootResult {
  doubloons: number
  lootRarity: string
  roll: number
  crewRoll: number
  total: number
  base: number
  crewBonus: number
  finalScore: number
  successBonus: number
}

export interface Expedition {
  id: number
  user_id: string
  zone: ZoneKey
  ship_tier: number
  status: ExpeditionStatus
  current_node: number
  events: EventResult[]
  crew_loadout: CrewLoadout
  loot: LootResult | null
  hull_damage: number
  expedition_date: string
  started_at: string
  completed_at: string | null
}

export interface DailyExpeditionRow {
  id: number
  expedition_date: string
  zone: ZoneKey
  event_sequence: EventNode[]
}

export interface ZoneConfig {
  name: string
  icon: string
  description: string
  requiredShipTier: number
  specialCrewRequired: string[] | null
  length: number
  difficulty: Record<DifficultyTier, [number, number]>
  eventTypes: string[]
  crisisTypes: string[]
  drops: string[]
  entryCost: number
}

export const EXPEDITION_SHIP_STATS: Record<number, ExpeditionShipStats> = {
  0: { name: 'Rowboat',    combat: 3,  navigation: 3,  durability: 3,  speed: 4,  luck: 4,  crewSlots: 1  },
  1: { name: 'Dinghy',     combat: 5,  navigation: 5,  durability: 4,  speed: 6,  luck: 5,  crewSlots: 2  },
  2: { name: 'Sloop',      combat: 7,  navigation: 8,  durability: 6,  speed: 10, luck: 7,  crewSlots: 3  },
  3: { name: 'Schooner',   combat: 9,  navigation: 11, durability: 8,  speed: 13, luck: 9,  crewSlots: 4  },
  4: { name: 'Brigantine', combat: 12, navigation: 13, durability: 11, speed: 15, luck: 12, crewSlots: 5  },
  5: { name: 'Galleon',    combat: 16, navigation: 14, durability: 15, speed: 13, luck: 14, crewSlots: 7  },
  6: { name: 'Man-o-War',  combat: 20, navigation: 17, durability: 20, speed: 11, luck: 18, crewSlots: 10 },
}

const CREW_POWER_TABLE: Record<string, Record<number, number>> = {
  common:    { 1: 1,  2: 2,  3: 3  },
  uncommon:  { 1: 2,  2: 3,  3: 4  },
  rare:      { 1: 3,  2: 4,  3: 6  },
  epic:      { 1: 5,  2: 6,  3: 8  },
  legendary: { 1: 7,  2: 9,  3: 11 },
  mythic:    { 1: 10, 2: 12, 3: 15 },
  divine:    { 1: 14, 2: 17, 3: 20 },
}

export function getCrewPower(rarity: string, fishTier: number): number {
  return CREW_POWER_TABLE[rarity.toLowerCase()]?.[fishTier] ?? 1
}

export const HULL_POINTS: Record<number, number> = { 0: 3, 1: 4, 2: 5, 3: 6, 4: 8, 5: 10, 6: 14 }

export const ZONES: Record<ZoneKey, ZoneConfig> = {
  coral_run: {
    name: 'The Coral Run',
    icon: '🌊',
    description: 'Familiar coastlines and reef passages. Safe enough for new crews.',
    requiredShipTier: 0,
    specialCrewRequired: null,
    length: 4,
    difficulty: { easy: [2, 3], standard: [4, 6], crisis: [7, 10] },
    eventTypes: ['rival_pirates', 'mild_storm', 'merchant_vessel', 'stranded_ship', 'fog', 'fishing_spot', 'hidden_cove'],
    crisisTypes: ['storm', 'sea_creature'],
    drops: ['common', 'uncommon', 'rare'],
    entryCost: 25,
  },
  bertuna_triangle: {
    name: 'The Bertuna Triangle',
    icon: '🧭',
    description: 'The stretch where ships go missing. Rival pirates, sea fog, cursed winds.',
    requiredShipTier: 2,
    specialCrewRequired: null,
    length: 6,
    difficulty: { easy: [5, 8], standard: [9, 13], crisis: [15, 20] },
    eventTypes: ['rival_pirates', 'ghost_ship', 'whirlpool', 'storm', 'sea_creature', 'cursed_cargo', 'merchant_vessel'],
    crisisTypes: ['ghost_ship', 'rival_pirates'],
    drops: ['uncommon', 'rare', 'epic'],
    entryCost: 75,
  },
  sunken_reach: {
    name: 'The Sunken Reach',
    icon: '🌑',
    description: 'Below the known charts. Sea monsters, shipwrecks, pressure that cracks lesser hulls.',
    requiredShipTier: 4,
    specialCrewRequired: null,
    length: 8,
    difficulty: { easy: [8, 12], standard: [13, 18], crisis: [20, 26] },
    eventTypes: ['sea_monster', 'shipwreck_salvage', 'rival_pirates', 'cursed_ship', 'storm', 'whirlpool'],
    crisisTypes: ['kraken_warning', 'sea_monster'],
    drops: ['rare', 'epic', 'legendary'],
    entryCost: 200,
  },
  davy_jones_locker: {
    name: "Davy Jones' Locker",
    icon: '💀',
    description: 'No charts exist. Only Catfish and Doby Mick know the way.',
    requiredShipTier: 6,
    specialCrewRequired: ['Catfish', 'Doby_Mick'],
    length: 10,
    difficulty: { easy: [12, 16], standard: [18, 24], crisis: [26, 32] },
    eventTypes: ['kraken_attack', 'ghost_armada', 'cursed_treasure', 'abyss_creature', 'void_storm', 'davy_jones_encounter'],
    crisisTypes: ['kraken_attack', 'davy_jones_encounter'],
    drops: ['legendary', 'mythic', 'divine'],
    entryCost: 500,
  },
}

export const EVENT_MECHANICS: Record<string, EventMechanics> = {
  rival_pirates:         { stat: 'combat',      difficultyTier: 'standard' },
  mild_storm:            { stat: 'durability',  difficultyTier: 'easy'     },
  storm:                 { stat: 'durability',  difficultyTier: 'standard' },
  ghost_ship:            { stat: 'combat',      difficultyTier: 'standard' },
  merchant_vessel:       { stat: 'luck',        difficultyTier: 'easy'     },
  stranded_ship:         { stat: null,          difficultyTier: 'easy'     },
  fog:                   { stat: 'navigation',  difficultyTier: 'easy'     },
  fishing_spot:          { stat: 'luck',        difficultyTier: 'easy'     },
  hidden_cove:           { stat: 'navigation',  difficultyTier: 'easy'     },
  whirlpool:             { stat: 'navigation',  difficultyTier: 'standard' },
  sea_creature:          { stat: 'combat',      difficultyTier: 'standard' },
  cursed_cargo:          { stat: 'luck',        difficultyTier: 'standard' },
  cursed_ship:           { stat: 'navigation',  difficultyTier: 'standard' },
  sea_monster:           { stat: 'combat',      difficultyTier: 'crisis'   },
  shipwreck_salvage:     { stat: 'luck',        difficultyTier: 'standard' },
  kraken_warning:        { stat: 'speed',       difficultyTier: 'crisis'   },
  kraken_attack:         { stat: 'combat',      difficultyTier: 'crisis'   },
  ghost_armada:          { stat: 'combat',      difficultyTier: 'crisis'   },
  cursed_treasure:       { stat: 'luck',        difficultyTier: 'standard' },
  abyss_creature:        { stat: 'combat',      difficultyTier: 'crisis'   },
  void_storm:            { stat: 'durability',  difficultyTier: 'crisis'   },
  davy_jones_encounter:  { stat: 'luck',        difficultyTier: 'crisis'   },
}

export interface RollResult {
  base: number
  crewBonus: number
  crewRoll: number
  roll: number
  total: number
}

export function rollStat(stat: Stat, crewAssigned: CrewCard[], shipTier: number): RollResult {
  const stats = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]
  const base = stats[stat]
  const crewBonus = crewAssigned.reduce((sum, card) => sum + card.power, 0)
  // Floor = shipTier + 1, so higher-tier ships can't roll embarrassingly low
  const floor = shipTier + 1
  const roll = floor + Math.floor(Math.random() * Math.max(1, base - floor + 1))
  const crewRoll = crewBonus > 0 ? Math.floor(Math.random() * crewBonus) + 1 : 0
  return { base, crewBonus, roll, crewRoll, total: roll + crewRoll }
}

export const STAT_LABELS: Record<Stat, string> = {
  combat:     'Combat',
  navigation: 'Navigation',
  durability: 'Durability',
  speed:      'Speed',
  luck:       'Luck',
}

export const STAT_ICONS: Record<Stat, string> = {
  combat:     '⚔️',
  navigation: '🧭',
  durability: '🛡️',
  speed:      '💨',
  luck:       '🍀',
}

export const STAT_DESCRIPTIONS: Record<Stat, string> = {
  combat:     'Used when fighting rival pirates or sea creatures',
  navigation: 'Used to navigate fog, whirlpools, and tricky waters',
  durability: 'Used to weather storms and take damage without sinking',
  speed:      'Used to outrun threats and escape danger',
  luck:       'Used on treasure finds — and determines your final loot',
}

export const RARITY_COLORS: Record<string, string> = {
  common:    '#8a8880',
  uncommon:  '#4ade80',
  rare:      '#60a5fa',
  epic:      '#a78bfa',
  legendary: '#f0c040',
  mythic:    '#ff3838',
  divine:    '#fffdf0',
}

export const BASE_DOUBLOONS: Record<ZoneKey, number> = {
  coral_run:          80,
  bertuna_triangle:   200,
  sunken_reach:       500,
  davy_jones_locker:  1200,
}

export const ZONE_ORDER: ZoneKey[] = ['coral_run', 'bertuna_triangle', 'sunken_reach', 'davy_jones_locker']

export const STATS: Stat[] = ['combat', 'navigation', 'durability', 'speed', 'luck']
