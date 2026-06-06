// Ship metadata for the expedition fleet. Stats that matter in combat
// (durability, speed, crew slots, min damage) live separately in
// EXPEDITION_SHIP_STATS in lib/expeditions.ts. Fish hold is its OWN upgrade
// ladder (lib/fishHold.ts) and is no longer tied to ships at all.
export interface ShipDef {
  tier: number
  name: string
  cost: number
  description: string
  color: string
  imageUrl?: string
}

export const SHIPS: ShipDef[] = [
  {
    tier: 0, name: 'Rowboat', cost: 0,
    description: 'A humble start on the open sea.',
    color: '#a07858', imageUrl: '/models/rowboat_v2.png',
  },
  {
    tier: 1, name: 'Dinghy', cost: 500,
    description: 'Small but reliable. A step up from rowing.',
    color: '#9ca3af', imageUrl: '/models/dinghy_v2.png',
  },
  {
    tier: 2, name: 'Sloop', cost: 1500,
    description: 'A single-masted workhorse of the seas.',
    color: '#60a5fa', imageUrl: '/models/sloop_v2.png',
  },
  {
    tier: 3, name: 'Schooner', cost: 5000,
    description: 'Twin masts and a steady hull. Earning starts here.',
    color: '#4ade80', imageUrl: '/models/schooner_v2.png',
  },
  {
    tier: 4, name: 'Brigantine', cost: 22000,
    description: 'Fast and capable. A privateer\'s best friend.',
    color: '#f0c040', imageUrl: '/models/brigantine_v2.png',
  },
  {
    tier: 5, name: 'Galleon', cost: 80000,
    description: 'A grand vessel. The sea respects your presence.',
    color: '#a78bfa', imageUrl: '/models/galleon_v2.png',
  },
  {
    tier: 6, name: 'Man-o-War', cost: 200000,
    description: 'The most feared ship on the water.',
    color: '#ff6b35', imageUrl: '/models/man-o-war_v2.png',
  },
]

export function getShip(tier: number): ShipDef {
  return SHIPS[Math.min(Math.max(tier, 0), SHIPS.length - 1)]
}
