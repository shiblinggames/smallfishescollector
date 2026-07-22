// Doubloon payout for completing a zone's fish collection. The reward scales
// with how many times the player has prestiged THAT zone (+20% per level,
// capped at P5 = 2× base). Players claim the reward each prestige loop, so
// this is the per-claim amount, not a one-time bounty.

// Prestige caps here ("Max Prestige" = 5 stars). Both rewards stop scaling at
// this level. Past it, further wipes no longer raise the level — instead each
// one grants a small permanent GOLDEN BOOST to that zone's golden (shiny) catch
// odds. Shared by the server action + UI.
export const PRESTIGE_MAX = 5

// Each wipe past Max Prestige lifts this zone's golden odds by +10% (relative to
// the base rate). Small on its own, an evergreen chase in aggregate. Tune here.
export const GOLDEN_BOOST_PER_WIPE = 0.10

/** Multiplier applied to the base golden (shiny) roll for a zone with this many
 *  post-max wipes. 0 wipes → 1× (unchanged). */
export function goldenBoostMult(wipes: number): number {
  return 1 + Math.max(0, wipes) * GOLDEN_BOOST_PER_WIPE
}

/** The golden boost as a whole-number percent for display ("+30%"). */
export function goldenBoostPct(wipes: number): number {
  return Math.round(Math.max(0, wipes) * GOLDEN_BOOST_PER_WIPE * 100)
}

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
