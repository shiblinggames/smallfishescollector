// Ship Repair Kits — per-battle consumable healing used from the
// Special action button. Distinct from `raid_items`: single-equip,
// consumed once per battle, everyone owns the Basic kit by default,
// and upgrades will be granted later. Heal range is `[baseMin,
// baseMax + floor(totalFortune * FORTUNE_HEAL_SCALE)]`, so the kit
// sets the floor + base ceiling and Fortune luck-scales the ceiling.

export interface RepairKitDef {
  id: string
  name: string
  description: string
  /** Roll floor — heals never drop below this. */
  baseMin: number
  /** Base ceiling before Fortune adds to it. */
  baseMax: number
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

export const REPAIR_KITS: RepairKitDef[] = [
  {
    id: BASIC_REPAIR_KIT_ID,
    name: 'Basic Repair Kit',
    description: 'Hammer, nails, a roll of pitch. Patches the hull for 1 to 10 HP, more with Fortune. Once per battle.',
    baseMin: 1,
    baseMax: 10,
    emoji: '🛠️',
    image: null,
    rarity: 'common',
    source: 'Every captain starts with one.',
  },
]

export function getRepairKit(id: string | null | undefined): RepairKitDef | undefined {
  if (!id) return undefined
  return REPAIR_KITS.find(k => k.id === id)
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
