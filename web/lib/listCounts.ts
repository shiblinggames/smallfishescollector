// Lists that may hold COPIES (raid items, since the item system's stage 3).
// Kept apart from lib/items so a screen or a core that only counts a list does
// not load the whole catalogue.

/** A list that may hold copies, once each, in first-seen order. For screens
 *  that draw one card per thing owned. */
export function distinctIds(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

/** How many copies of each id a list holds. */
export function idCounts(ids: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of ids) out[id] = (out[id] ?? 0) + 1
  return out
}
