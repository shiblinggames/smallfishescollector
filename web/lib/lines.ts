export interface LineDef {
  tier: number
  name: string
  description: string
  color: string
  imageUrl?: string
  // Multiplier on penalty zone size (lower = smaller penalty zones = more forgiving)
  penaltyMultiplier: number
  // Number of unique species caught required to unlock (tier 0 is always unlocked)
  unlockAt: number
}

export const LINES: LineDef[] = [
  {
    tier: 0,
    name: 'Monofilament',
    description: 'Standard line. Snags happen.',
    color: '#a07858',
    imageUrl: '/monofilament.png',
    penaltyMultiplier: 1.00,
    unlockAt: 0,
  },
  {
    tier: 1,
    name: 'Braided Line',
    description: 'Stronger weave. Fewer snags.',
    color: '#60a5fa',
    imageUrl: '/braidedline.png',
    penaltyMultiplier: 0.82,
    unlockAt: 20,
  },
  {
    tier: 2,
    name: 'Copolymer',
    description: 'Blended nylon. More give, less break.',
    color: '#34d399',
    imageUrl: '/copolymer.png',
    penaltyMultiplier: 0.67,
    unlockAt: 40,
  },
  {
    tier: 3,
    name: 'Fluorocarbon',
    description: 'Nearly invisible underwater. Very snag-resistant.',
    color: '#4ade80',
    imageUrl: '/fluorocarbon.png',
    penaltyMultiplier: 0.54,
    unlockAt: 60,
  },
  {
    tier: 4,
    name: 'Titanium Wire',
    description: 'Near-zero stretch. Cuts through current like nothing.',
    color: '#94a3b8',
    imageUrl: '/titaniumwire.png',
    penaltyMultiplier: 0.42,
    unlockAt: 80,
  },
  {
    tier: 5,
    name: 'Deep Sea Line',
    description: 'Built for the abyss. Almost nothing breaks it.',
    color: '#a78bfa',
    imageUrl: '/deepsealine.png',
    penaltyMultiplier: 0.30,
    unlockAt: 100,
  },
]

export function getLine(tier: number): LineDef {
  return LINES[Math.min(Math.max(tier, 0), LINES.length - 1)]
}

export function getLineForSpeciesCount(uniqueSpeciesCaught: number): LineDef {
  const earned = [...LINES].reverse().find(l => uniqueSpeciesCaught >= l.unlockAt)
  return earned ?? LINES[0]
}
