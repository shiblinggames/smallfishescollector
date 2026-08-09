// The Abyssal Accelerator — a Don's-Gauntlet Permanent Upgrades unlock that adds a
// transmutation bench to the Abyssal Forge: charge it with gems, feed it an
// owned EPIC boss-drop item, and 24h later claim that item's LEGENDARY "chase"
// counterpart. One conversion in flight at a time (a single jsonb slot on the
// profile, profiles.abyssal_conversion). Shared by the client (cost + countdown
// UI) and the server actions so the numbers never drift.

export const ABYSSAL_ACCEL_MS = 24 * 60 * 60 * 1000   // 24h transmutation
export const ABYSSAL_ACCEL_GEM_COST = 100             // gems to charge one run

export interface AbyssalConversion {
  epicId: string
  legendaryId: string
  completesAt: string   // ISO timestamp the legendary becomes claimable
}

/** Narrow-validate the profiles.abyssal_conversion jsonb into a typed slot. */
export function parseAbyssalConversion(raw: unknown): AbyssalConversion | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.epicId !== 'string' || typeof r.legendaryId !== 'string' || typeof r.completesAt !== 'string') return null
  return { epicId: r.epicId, legendaryId: r.legendaryId, completesAt: r.completesAt }
}

/** True once the 24h has elapsed and the legendary is claimable. */
export function isConversionReady(c: AbyssalConversion | null | undefined, nowMs: number): boolean {
  return !!c && new Date(c.completesAt).getTime() <= nowMs
}
