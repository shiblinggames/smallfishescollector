export interface ReelDef {
  tier: number
  name: string
  cost: number
  description: string
  color: string
  // Multiplier on needle speed in the catch game (lower = slower needle = easier)
  needleSpeedMultiplier: number
}

export const REELS: ReelDef[] = [
  {
    tier: 0,
    name: 'Basic Reel',
    cost: 0,
    description: 'Gets the job done. The needle moves fast though.',
    color: '#a07858',
    needleSpeedMultiplier: 1.0,
  },
  {
    tier: 1,
    name: 'Spinning Reel',
    cost: 400,
    description: 'Smoother drag. A little more time to react.',
    color: '#9ca3af',
    needleSpeedMultiplier: 0.88,
  },
  {
    tier: 2,
    name: 'Baitcasting Reel',
    cost: 1200,
    description: 'Precision drag control. The needle slows noticeably.',
    color: '#60a5fa',
    needleSpeedMultiplier: 0.76,
  },
  {
    tier: 3,
    name: 'Precision Reel',
    cost: 3000,
    description: 'Tournament-grade. You feel every twitch of the line.',
    color: '#4ade80',
    needleSpeedMultiplier: 0.64,
  },
  {
    tier: 4,
    name: 'Master Reel',
    cost: 9000,
    description: 'Hand-crafted. The needle almost seems to wait for you.',
    color: '#f0c040',
    needleSpeedMultiplier: 0.50,
  },
]

export function getReel(tier: number): ReelDef {
  return REELS[Math.min(Math.max(tier, 0), REELS.length - 1)]
}
