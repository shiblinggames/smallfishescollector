// Ship Repair Kits — per-battle consumable healing used from the
// Special action button. Distinct from `raid_items`: single-equip,
// consumed once per battle, everyone owns the Basic kit by default.
// Upgrades are a doubloon-bought, Nav-gated ladder (buy in tier order).
// Heal range is `[baseMin, baseMax + floor(totalFortune *
// FORTUNE_HEAL_SCALE)]`, so the kit sets the floor + base ceiling and
// Fortune luck-scales the ceiling.

export interface RepairKitDef {
  id: string
  /** Upgrade-ladder position. Kits must be bought in tier order. */
  tier: number
  name: string
  description: string
  /** Roll floor — heals never drop below this. */
  baseMin: number
  /** Base ceiling before Fortune adds to it. */
  baseMax: number
  /** Doubloons to buy. 0 = granted free (the Basic kit). */
  cost: number
  /** Nav level required to buy. 0 = no gate. */
  navLevelReq: number
  emoji: string
  image: string | null
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  source: string
}

// Single tuning knob — Fortune's contribution to the max heal roll.
// 0.25 means a Fortune-40 crew lifts the Basic Kit's ceiling from 10
// to 20. Floor never moves.
export const FORTUNE_HEAL_SCALE = 0.25

export const BASIC_REPAIR_KIT_ID = 'basic_repair_kit'

// ── Upgrade ladder ───────────────────────────────────────────────────────────
// Doubloon-bought, in tier order, each gated behind a Nav level so kit power
// tracks expedition progress (and can't be rushed straight to the top). Heals
// are flat HP (Fortune scales the ceiling via repairKitRange) and deliberately
// modest — a sustain tool, not a full reset — climbing 1-10 → 15-30 across the
// five tiers. Consumed once per battle from the Special action.
export const REPAIR_KITS: RepairKitDef[] = [
  {
    id: BASIC_REPAIR_KIT_ID,
    tier: 0,
    name: 'Basic Repair Kit',
    description: 'Hammer, nails, a roll of pitch. The patch every captain learns to make. Once per battle.',
    baseMin: 1,
    baseMax: 10,
    cost: 0,
    navLevelReq: 0,
    emoji: '🛠️',
    image: '/basicrepair.png',
    rarity: 'common',
    source: 'Every captain starts with one.',
  },
  {
    id: 'reinforced_repair_kit',
    tier: 1,
    name: 'Reinforced Repair Kit',
    description: 'Bolted iron plates and tar-soaked canvas. Holds a hull together far better than nails alone. Once per battle.',
    baseMin: 5,
    baseMax: 15,
    cost: 4_000,
    navLevelReq: 6,
    emoji: '🛠️',
    image: null,
    rarity: 'uncommon',
    source: 'Bought at the shipyard.',
  },
  {
    id: 'shipwrights_kit',
    tier: 2,
    name: 'Shipwright’s Kit',
    description: 'A master shipwright’s satchel of clamps, oakum and copper sheeting. Serious repairs in the thick of a fight. Once per battle.',
    baseMin: 8,
    baseMax: 20,
    cost: 12_000,
    navLevelReq: 12,
    emoji: '🛠️',
    image: null,
    rarity: 'rare',
    source: 'Bought at the shipyard.',
  },
  {
    id: 'drydock_kit',
    tier: 3,
    name: 'Drydock Kit',
    description: 'A full drydock’s worth of timber and iron, somehow crammed into a chest. Mends deep hull wounds on the open sea. Once per battle.',
    baseMin: 12,
    baseMax: 25,
    cost: 30_000,
    navLevelReq: 20,
    emoji: '🛠️',
    image: null,
    rarity: 'epic',
    source: 'Bought at the shipyard.',
  },
  {
    id: 'ironclad_kit',
    tier: 4,
    name: 'Ironclad Kit',
    description: 'Plated iron and a master’s forge, hauled aboard in a single chest. The sturdiest patch on the seven seas. Once per battle.',
    baseMin: 15,
    baseMax: 30,
    cost: 65_000,
    navLevelReq: 30,
    emoji: '🛠️',
    image: null,
    rarity: 'legendary',
    source: 'Bought at the shipyard.',
  },
]

export function getRepairKit(id: string | null | undefined): RepairKitDef | undefined {
  if (!id) return undefined
  return REPAIR_KITS.find(k => k.id === id)
}

/** The next kit on the upgrade path — lowest tier the player doesn't own yet.
 *  Returns undefined once every kit is owned. */
export function nextRepairKit(owned: string[] | null | undefined): RepairKitDef | undefined {
  const have = new Set(owned ?? [])
  return [...REPAIR_KITS].sort((a, b) => a.tier - b.tier).find(k => !have.has(k.id))
}

/** Resolve the effective heal range for a kit given the player's
 *  total Fortune. Min stays fixed; max gets a Fortune bonus on top. */
export function repairKitRange(kit: RepairKitDef, totalFortune: number): { min: number; max: number } {
  const bonus = Math.floor(Math.max(0, totalFortune) * FORTUNE_HEAL_SCALE)
  return { min: kit.baseMin, max: kit.baseMax + bonus }
}

/** Roll a single heal value from a kit + Fortune. Inclusive range. */
export function rollRepairKitHeal(kit: RepairKitDef, totalFortune: number): number {
  const { min, max } = repairKitRange(kit, totalFortune)
  return min + Math.floor(Math.random() * (max - min + 1))
}
