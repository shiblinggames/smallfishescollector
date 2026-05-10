export interface ReelDef {
  tier: number
  name: string
  cost: number
  description: string
  color: string
  needleSpeedMultiplier: number  // lower = slower needle = more time to react
  imageUrl?: string
}

export const REELS: ReelDef[] = [
  {
    tier: 0, name: 'Basic Reel', cost: 0,
    description: 'Gets the job done. The needle moves fast though.',
    color: '#a07858', needleSpeedMultiplier: 1.00,
    imageUrl: '/basicreel.png',
  },
  {
    tier: 1, name: 'Spinning Reel', cost: 1500,
    description: 'Smoother drag. A little more time to react.',
    color: '#9ca3af', needleSpeedMultiplier: 0.94,
    imageUrl: '/spinningreel.png',
  },
  {
    tier: 2, name: 'Baitcasting Reel', cost: 3000,
    description: 'Precision drag control. The needle slows noticeably.',
    color: '#60a5fa', needleSpeedMultiplier: 0.88,
    imageUrl: '/baitcastingreel.png',
  },
  {
    tier: 3, name: 'Saltwater Reel', cost: 6000,
    description: 'Built for the open sea. Solid drag, steady needle.',
    color: '#34d399', needleSpeedMultiplier: 0.82,
    imageUrl: '/saltwaterreel.png',
  },
  {
    tier: 4, name: 'Precision Reel', cost: 12000,
    description: 'Tournament-grade. You feel every twitch of the line.',
    color: '#4ade80', needleSpeedMultiplier: 0.75,
    imageUrl: '/precisionreel.png',
  },
  {
    tier: 5, name: 'Tournament Reel', cost: 22000,
    description: 'Competition-spec drag. The needle moves like it has something to prove.',
    color: '#a78bfa', needleSpeedMultiplier: 0.69,
    imageUrl: '/tournamentreel.png',
  },
  {
    tier: 6, name: 'Deep Sea Reel', cost: 40000,
    description: 'Engineered for the deep. The needle barely hurries.',
    color: '#38bdf8', needleSpeedMultiplier: 0.62,
    imageUrl: '/deepseareel.png',
  },
  {
    tier: 7, name: "Kraken's Grip", cost: 70000,
    description: 'Forged to hold something ancient. The needle drifts, almost lazy.',
    color: '#f87171', needleSpeedMultiplier: 0.56,
    imageUrl: '/krakensgrip.png',
  },
  {
    tier: 8, name: "Tidecaller's Reel", cost: 150000,
    description: 'Time itself seems to slow when you reel. Almost unfair.',
    color: '#f0c040', needleSpeedMultiplier: 0.50,
    imageUrl: '/tidecallersreel.png',
  },
]

export function getReel(tier: number): ReelDef {
  return REELS[Math.min(Math.max(tier, 0), REELS.length - 1)]
}
