// ── WHERE THE CREW, FISH AND ENEMY ART IS SERVED FROM (2026-09-28) ─────────────
//
// It was the Supabase storage buckets `card-arts` and `enemy-arts`, addressed
// by hard-coded storage URLs in 22 files: 184 MB of PNG, a second origin for
// every portrait, and art a packaged (Steam / offline) build could not carry.
// It is public/card-arts and public/enemy-arts now, converted to WebP (16 MB),
// brought in by scripts/pull-bucket-art.mts.
//
// The database still names the files with their old .png extension
// (cards.filename, crew skins, card variants), and that is fine: these map a
// stored name to the served file. Every portrait goes through here, so the
// next move (a CDN, a packed atlas, a binary's asset folder) is one edit.
//
// NEW ART GOES IN public/, NEVER INTO A BUCKET.

const toWebp = (f: string) => f.replace(/\.(png|jpe?g)$/i, '.webp')

/** Already a full URL or a root path: leave it alone. */
const isUrl = (f: string) => /^(https?:)?\/\//.test(f) || f.startsWith('/') || f.startsWith('data:')

/** A crew card, crew skin, fish card or other card-arts file, by its stored name. */
export function cardArt(filename: string | null | undefined): string {
  if (!filename) return ''
  return isUrl(filename) ? filename : `/card-arts/${toWebp(filename)}`
}

/** An enemy portrait from the old enemy-arts bucket, by its stored name. */
export function enemyArt(filename: string | null | undefined): string {
  if (!filename) return ''
  return isUrl(filename) ? filename : `/enemy-arts/${toWebp(filename)}`
}
