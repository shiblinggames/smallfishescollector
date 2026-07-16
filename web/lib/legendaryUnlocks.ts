// Campaign-gated legendary crew (2026-07-16).
//
// The 6 legendary crew are earned through the campaign, not all handed to
// everyone from day one:
//   - Catfish + Doby Mick are the two ORIGINAL legendaries — always in the
//     recruit pool, no campaign progress required.
//   - Mako / Dole / Laz / Mira each unlock when a specific REQUIRED story node
//     in their chapter is cleared. That node is also where they debut as the
//     chapter's guide (see the node's `scene` in lib/raidMap.ts). Until then
//     they are filtered out of the gem-reroll / free recruit board.
//
// The gate nodes are all on the required main chain (each chapter's boss
// `requiresNode` its gate node), so a player who has progressed PAST the gate
// necessarily has it in `raid_node_progress.cleared[]` — which is exactly how
// the backfill migration seeds `profiles.legendary_unlocks` for existing
// players (that, OR they already own the card). Nobody loses a legendary they
// had. New clears grant the slug in `markStoryNodeRead`.
//
// NOTE: this maps slug -> node id only. It intentionally does NOT import
// raidMap (kept dependency-light so both the recruit action and the raid-map
// action can import it without a cycle).

/** The two originals — never gated, always recruitable. */
export const ALWAYS_UNLOCKED_LEGENDARIES = new Set(['catfish', 'doby_mick'])

/** Gated legendary slug -> the required story node whose clear unlocks it
 *  (and where the legendary debuts as that chapter's guide). */
export const LEGENDARY_GATE: Record<string, string> = {
  mako:         'syndicate',      // Chapter I  — The Loose Thread
  dole:         'scout_debt',     // Chapter II — The Sunken Hand
  coelacanth:   'coffers_ledger', // Chapter III — The Coffers (Laz)
  moorish_idol: 'dons_fall',      // Chapter IV — The Last Fathom (Mira)
}

/** Reverse map: story node id -> the legendary slug it unlocks. Used by
 *  markStoryNodeRead to grant + celebrate when a gate node is cleared. */
export const GATE_NODE_TO_LEGENDARY: Record<string, string> =
  Object.fromEntries(Object.entries(LEGENDARY_GATE).map(([slug, node]) => [node, slug]))

/** Payload surfaced to the client when a gate node clear unlocks a legendary,
 *  so it can fire the "now recruitable" celebration with the crew's art. */
export interface UnlockedLegendary {
  slug: string
  name: string
  filename: string
}

/** Lowercase gate slug (e.g. `moorish_idol`) -> the Title_Case `cards.slug`
 *  (e.g. `Moorish_Idol`). Underscore-delimited, each word capitalized. */
export function slugToCardKey(slug: string): string {
  return slug.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('_')
}

/** Is this legendary slug currently LOCKED out of the recruit pool for a
 *  player with the given unlock list? Non-gated slugs (the two originals, and
 *  any non-legendary card) are never locked. */
export function isLegendaryLocked(slug: string, unlocks: readonly string[]): boolean {
  const s = slug.toLowerCase()
  if (ALWAYS_UNLOCKED_LEGENDARIES.has(s)) return false
  if (!(s in LEGENDARY_GATE)) return false // not a gated legendary
  return !unlocks.some(u => u.toLowerCase() === s)
}
