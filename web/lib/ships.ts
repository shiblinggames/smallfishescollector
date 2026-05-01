export interface ShipDef {
  tier: number
  name: string
  cost: number
  description: string
  holdCapacity: number
  color: string
  imageUrl?: string
}

export const SHIPS: ShipDef[] = [
  {
    tier: 0, name: 'Rowboat', cost: 0,
    description: 'A humble start on the open sea.',
    holdCapacity: 15, color: '#a07858', imageUrl: '/models/rowboat.png',
  },
  {
    tier: 1, name: 'Dinghy', cost: 500,
    description: 'Small but reliable. More room for haul.',
    holdCapacity: 25, color: '#9ca3af', imageUrl: '/models/dinghy.png',
  },
  {
    tier: 2, name: 'Sloop', cost: 1500,
    description: 'A single-masted workhorse of the seas.',
    holdCapacity: 40, color: '#60a5fa', imageUrl: '/models/sloop.png',
  },
  {
    tier: 3, name: 'Schooner', cost: 5000,
    description: 'Twin masts and a steady hull. Earning starts here.',
    holdCapacity: 70, color: '#4ade80', imageUrl: '/models/schooner.png',
  },
  {
    tier: 4, name: 'Brigantine', cost: 15000,
    description: 'Fast and capable. A merchant\'s best friend.',
    holdCapacity: 120, color: '#f0c040', imageUrl: '/models/brigantine.png',
  },
  {
    tier: 5, name: 'Galleon', cost: 40000,
    description: 'A grand vessel. The sea respects your presence.',
    holdCapacity: 180, color: '#a78bfa', imageUrl: '/models/galleon.png',
  },
  {
    tier: 6, name: 'Man-o-War', cost: 100000,
    description: 'The most feared ship on the water.',
    holdCapacity: 250, color: '#ff6b35', imageUrl: '/models/man-o-war.png',
  },
]

export function getShip(tier: number): ShipDef {
  return SHIPS[Math.min(Math.max(tier, 0), SHIPS.length - 1)]
}
