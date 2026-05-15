// Doubloon payout for completing a zone's fish collection. The reward scales
// with how many times the player has prestiged THAT zone (+20% per level,
// capped at P5 = 2× base). Players claim the reward each prestige loop, so
// this is the per-claim amount, not a one-time bounty.

export const ZONE_REWARD_BASE: Record<string, number> = {
  shallows:    5000,
  open_waters: 10000,
  deep:        25000,
  abyss:       50000,
}

export function zoneRewardDoubloons(zone: string, prestigeLevel: number): number {
  const base = ZONE_REWARD_BASE[zone] ?? 0
  const tier = Math.min(Math.max(prestigeLevel, 0), 5)
  return Math.round(base * (1 + 0.2 * tier))
}
