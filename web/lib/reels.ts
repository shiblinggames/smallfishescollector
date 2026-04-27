export interface ReelDef {
  tier: number
  name: string
  cost: number
  description: string
  color: string
  needleSpeedMultiplier: number  // lower = slower needle = more time to react
}

export const REELS: ReelDef[] = [
  {
    tier: 0, name: 'Basic Reel', cost: 0,
    description: 'Gets the job done. The needle moves fast though.',
    color: '#a07858', needleSpeedMultiplier: 1.00,
  },
  {
    tier: 1, name: 'Spinning Reel', cost: 1500,
    description: 'Smoother drag. A little more time to react.',
    color: '#9ca3af', needleSpeedMultiplier: 0.93,
  },
  {
    tier: 2, name: 'Baitcasting Reel', cost: 3000,
    description: 'Precision drag control. The needle slows noticeably.',
    color: '#60a5fa', needleSpeedMultiplier: 0.85,
  },
  {
    tier: 3, name: 'Saltwater Reel', cost: 6000,
    description: 'Built for the open sea. Solid drag, steady needle.',
    color: '#34d399', needleSpeedMultiplier: 0.78,
  },
  {
    tier: 4, name: 'Precision Reel', cost: 12000,
    description: 'Tournament-grade. You feel every twitch of the line.',
    color: '#4ade80', needleSpeedMultiplier: 0.70,
  },
  {
    tier: 5, name: 'Tournament Reel', cost: 22000,
    description: 'Competition-spec drag. The needle moves like it has something to prove.',
    color: '#a78bfa', needleSpeedMultiplier: 0.63,
  },
  {
    tier: 6, name: 'Deep Sea Reel', cost: 40000,
    description: 'Engineered for the deep. The needle barely hurries.',
    color: '#38bdf8', needleSpeedMultiplier: 0.55,
  },
  {
    tier: 7, name: "Kraken's Grip", cost: 70000,
    description: 'Forged to hold something ancient. The needle drifts, almost lazy.',
    color: '#f87171', needleSpeedMultiplier: 0.48,
  },
  {
    tier: 8, name: "Tidecaller's Reel", cost: 150000,
    description: 'Time itself seems to slow when you reel. Almost unfair.',
    color: '#f0c040', needleSpeedMultiplier: 0.40,
  },
]

export function getReel(tier: number): ReelDef {
  return REELS[Math.min(Math.max(tier, 0), REELS.length - 1)]
}
