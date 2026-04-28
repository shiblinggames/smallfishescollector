'use server'

// Ship bonus removed — ships now provide fish hold capacity, not daily doubloons.
export async function claimShipBonus(): Promise<{ claimed: boolean }> {
  return { claimed: false }
}
