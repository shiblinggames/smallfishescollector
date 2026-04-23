export interface ShipDef {
  tier: number
  name: string
  cost: number
  description: string
  dailyBonus: number
  color: string
}

export const SHIPS: ShipDef[] = [
  {
    tier: 0, name: 'Rowboat', cost: 0,
    description: 'A humble start on the open sea.',
    dailyBonus: 0, color: '#a07858',
  },
  {
    tier: 1, name: 'Dinghy', cost: 150,
    description: 'Small but reliable. More room for haul.',
    dailyBonus: 10, color: '#9ca3af',
  },
  {
    tier: 2, name: 'Sloop', cost: 400,
    description: 'A single-masted workhorse of the seas.',
    dailyBonus: 20, color: '#60a5fa',
  },
  {
    tier: 3, name: 'Schooner', cost: 1000,
    description: 'Twin masts and a steady hull. Earning starts here.',
    dailyBonus: 35, color: '#4ade80',
  },
  {
    tier: 4, name: 'Brigantine', cost: 2500,
    description: 'Fast and capable. A merchant\'s best friend.',
    dailyBonus: 55, color: '#f0c040',
  },
  {
    tier: 5, name: 'Galleon', cost: 6000,
    description: 'A grand vessel. The sea respects your presence.',
    dailyBonus: 80, color: '#a78bfa',
  },
  {
    tier: 6, name: 'Man-o-War', cost: 18000,
    description: 'The most feared ship on the water.',
    dailyBonus: 125, color: '#ff6b35',
  },
]

export function getShip(tier: number): ShipDef {
  return SHIPS[Math.min(Math.max(tier, 0), SHIPS.length - 1)]
}
