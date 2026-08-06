// Pure helpers for the Almanac. Kept out of bestiaryActions.ts because a
// 'use server' file silently drops every non-async export, so a constant
// declared there would just vanish at runtime.

/** bite_rarity 1-5 as a word. The fishing screen already speaks in these
 *  terms on the catch banner, so the Almanac uses the same ladder. */
export const RARITY_LABEL: Record<number, string> = {
  1: 'Common',
  2: 'Uncommon',
  3: 'Rare',
  4: 'Epic',
  5: 'Legendary',
}

export const RARITY_COLOR: Record<number, string> = {
  1: '#9aa3ad',
  2: '#4ade80',
  3: '#60a5fa',
  4: '#c084fc',
  5: '#f0c040',
}

/** Species art for GRID views, from /public/fish-tile/.
 *
 *  Not /public/fish/. Those sprites were cut from many sheets and agree on
 *  nothing: canvases run 421x424 to 675x1295, and the fish inside fills
 *  anywhere from 47% to 100% of it. Dropped into a fixed box they each render
 *  at a different apparent size, off different optical centres, and object-fit
 *  cannot help because it fits the CANVAS, transparent padding and all.
 *
 *  normalize-fish-tiles.mjs trims every sprite to its real pixels and centres
 *  it on one 192px square at a fixed fill, so a grid of them lines up. Same
 *  filename rule either way: lowercase, spaces to hyphens. */
export function fishArt(name: string): string {
  return '/fish-tile/' + name.toLowerCase().replace(/\s+/g, '-') + '.png'
}

/** Pet art for GRID views, from /public/pet-tile/.
 *
 *  Same reason as fishArt. The pet sprites are 1024x576 LANDSCAPE canvases
 *  holding a small upright animal that fills 22% to 42% of the width, so
 *  contained into a tile a parrot drew about 18x24 and the room that should be
 *  the most art-forward in the book was a grid of stamps. normalize-tiles.mjs
 *  centres each on one 192px square at a fixed fill.
 *
 *  Takes the registry's restImageUrl ('/parrot_red.png') and keeps the
 *  filename, so a new pet needs nothing here. */
export function petArt(restImageUrl: string): string {
  return '/pet-tile/' + restImageUrl.replace(/^\//, '')
}

/** The Ancient Deep giants are the only species worth nothing at market,
 *  because they are mounts rather than stock. That is what makes them the
 *  Giants room instead of six more rows in the Collection. */
export function isGiant(sellValue: number, habitat: string): boolean {
  return habitat === 'ancient_deep' && sellValue === 0
}

/** "12 Aug 2026" — short, unambiguous, no locale surprises in the grid. */
export function shortDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** Big numbers, short. 12,400 -> "12.4k", 1,240,000 -> "1.24M". */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 2)}M`
  if (n >= 10_000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return n.toLocaleString()
}
