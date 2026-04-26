export interface LineDef {
  tier: number
  name: string
  description: string
  color: string
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
    penaltyMultiplier: 1.0,
    unlockAt: 0,
  },
  {
    tier: 1,
    name: 'Braided Line',
    description: 'Stronger weave. Fewer snags.',
    color: '#60a5fa',
    penaltyMultiplier: 0.80,
    unlockAt: 10,
  },
  {
    tier: 2,
    name: 'Fluorocarbon',
    description: 'Nearly invisible underwater. Very snag-resistant.',
    color: '#4ade80',
    penaltyMultiplier: 0.62,
    unlockAt: 25,
  },
  {
    tier: 3,
    name: 'Deep Sea Line',
    description: 'Built for the abyss. Almost nothing breaks it.',
    color: '#a78bfa',
    penaltyMultiplier: 0.44,
    unlockAt: 45,
  },
]

export function getLine(tier: number): LineDef {
  return LINES[Math.min(Math.max(tier, 0), LINES.length - 1)]
}

export function getLineForSpeciesCount(uniqueSpeciesCaught: number): LineDef {
  const earned = [...LINES].reverse().find(l => uniqueSpeciesCaught >= l.unlockAt)
  return earned ?? LINES[0]
}
