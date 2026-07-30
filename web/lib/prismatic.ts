import type { CSSProperties } from 'react'

// Prismatic (iridescent) treatment for forged combination items — deliberately
// set apart from the flat rarity colors (epic purple / legendary orange). Used
// on the item's border + name across the inventory, loadout and the Forge.
export const PRISMATIC = 'linear-gradient(115deg, #ff6b8b 0%, #ffd36b 22%, #7be0a3 44%, #5fb3ff 66%, #c58bff 85%, #ff6b8b 100%)'

// A gradient BORDER that keeps rounded corners: fill on padding-box, the
// prismatic sweep on border-box, revealed through a transparent border.
export const prismaticBorder = (fill: string): CSSProperties => ({
  background: `linear-gradient(${fill}, ${fill}) padding-box, ${PRISMATIC} border-box`,
  border: '1.5px solid transparent',
})

export const PRISMATIC_TEXT: CSSProperties = {
  backgroundImage: PRISMATIC,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
}

// Muted iridescence for the item treatment itself (inventory / loadout / forged
// trophy cards) — a gentle sheen, not a loud rainbow. The bold PRISMATIC above
// stays for the celebration moments + the Forge page title.
export const PRISMATIC_SOFT = 'linear-gradient(115deg, #d7aebb 0%, #ddcca6 26%, #abd0bd 52%, #a9c3dd 74%, #c4b2dc 100%)'

export const prismaticBorderSoft = (fill: string): CSSProperties => ({
  background: `linear-gradient(${fill}, ${fill}) padding-box, ${PRISMATIC_SOFT} border-box`,
  border: '1.5px solid transparent',
})

// Soft pearlescent text — pale so it reads clearly on dark, with only a hint of
// color (much subtler than the full-saturation PRISMATIC_TEXT).
export const PRISMATIC_TEXT_SOFT: CSSProperties = {
  backgroundImage: 'linear-gradient(105deg, #e6dcef, #dde9f4, #efe6d6)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
}

// ── ABYSSAL (tier 3) ────────────────────────────────────────────────────────
// The Abyssal Forge's fusions sit ABOVE the prismatic tier-2 treatment, so they
// need to read as a clear step up at a glance. Two deliberate differences from
// PRISMATIC: a deep-sea palette (abyss green into gold into violet, rather than
// the pastel rainbow) and a GLOW, which the prismatic border never has. Kept
// STATIC — these render in inventory/forge lists, and an animated sheen there
// would repaint per row for no real gain.
export const ABYSSAL = 'linear-gradient(115deg, #0e5c48 0%, #3fbf82 16%, #ffd98a 34%, #f5c451 48%, #6ee7c0 66%, #9d7bff 84%, #0e5c48 100%)'

/** Gradient border + abyssal aura. Same padding-box/border-box trick as
 *  prismaticBorder, with a green-gold glow to mark the higher tier. */
export const abyssalBorder = (fill: string): CSSProperties => ({
  background: `linear-gradient(${fill}, ${fill}) padding-box, ${ABYSSAL} border-box`,
  border: '2px solid transparent',
  boxShadow: '0 0 16px rgba(63,191,130,0.34), inset 0 0 12px rgba(245,196,81,0.10)',
})

export const ABYSSAL_TEXT: CSSProperties = {
  backgroundImage: ABYSSAL,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
}

// Muted abyssal for the item treatment itself (inventory / loadout rows), the
// mirror of PRISMATIC_SOFT — still unmistakably the deeper tier, just quieter.
export const ABYSSAL_SOFT = 'linear-gradient(115deg, #2f7d68 0%, #7fcfae 26%, #e8d3a0 52%, #86d8c4 74%, #b9a8dc 100%)'

export const abyssalBorderSoft = (fill: string): CSSProperties => ({
  background: `linear-gradient(${fill}, ${fill}) padding-box, ${ABYSSAL_SOFT} border-box`,
  border: '2px solid transparent',
  boxShadow: '0 0 12px rgba(63,191,130,0.22)',
})

export const ABYSSAL_TEXT_SOFT: CSSProperties = {
  backgroundImage: 'linear-gradient(105deg, #d8ecdf, #f0e6c8, #dde8f4)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
}

// ── ABYSSAL FORGE — PAGE THEME (molten red/black) ────────────────────────────
// The Abyssal Forge STATION chrome (tab title, icon, glow) runs a hotter, darker
// prismatic than anything else: molten crimson bleeding into black. This is page
// dressing that announces "you are standing in the endgame forge" — deliberately
// separate from the ABYSSAL item treatment above (green/gold/violet), which stays
// the rarity mark on the fused items themselves. Two jobs, two palettes.
export const ABYSSAL_EMBER = 'linear-gradient(120deg, #24060c 0%, #b21734 16%, #ff5a3c 34%, #14040a 50%, #e0284a 66%, #7a0f1f 84%, #24060c 100%)'

/** Gradient border + a red furnace glow — the icon ring on the Abyssal tab. */
export const abyssalEmberBorder = (fill: string): CSSProperties => ({
  background: `linear-gradient(${fill}, ${fill}) padding-box, ${ABYSSAL_EMBER} border-box`,
  border: '2px solid transparent',
  boxShadow: '0 0 20px rgba(224,40,74,0.42), inset 0 0 12px rgba(255,90,60,0.14)',
})

// Text sweep for the "The Abyssal Forge" title — kept BRIGHT (no near-black stops)
// so every letter stays legible on the dark page; the black lives in the border
// and glow, not the letterforms.
export const ABYSSAL_EMBER_TEXT: CSSProperties = {
  backgroundImage: 'linear-gradient(100deg, #ff9a6a 0%, #ff5a6a 30%, #ffb15c 52%, #ff4d55 74%, #ff7a5c 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
}

// ── Abyssal ITEM treatment (molten red) ──────────────────────────────────────
// The tile/row treatment for a tier-3 Abyssal item wherever it renders — forge
// board, ship loadout, profile arsenal. Deliberately the SAME everywhere: an
// ember border + a soft red glow, paired with the rod-glow-abyssal art pulse and
// ABYSSAL_EMBER_TEXT name. (Replaces the old green/gold/violet ABYSSAL_SOFT look;
// the red identity now runs through every surface.)
export const ABYSSAL_ITEM_GLOW = '0 0 15px rgba(255,90,60,0.16)'
export const abyssalItemSoft = (fill: string): CSSProperties => ({
  background: fill,
  border: '1px solid rgba(255,90,60,0.45)',
  boxShadow: ABYSSAL_ITEM_GLOW,
})

// ── Tier-aware pickers ──────────────────────────────────────────────────────
// Every forged item renders through these, so a call site just passes whether
// it's the Abyssal tier instead of nesting a ternary per style object.
export const forgedBorderSoft = (fill: string, abyssal = false): CSSProperties =>
  (abyssal ? abyssalItemSoft(fill) : prismaticBorderSoft(fill))

export const forgedTextSoft = (abyssal = false): CSSProperties =>
  (abyssal ? ABYSSAL_EMBER_TEXT : PRISMATIC_TEXT_SOFT)

// ── PRIMEVAL (The Sunken Hand) ───────────────────────────────────────────────
// The two slots Finn's spoils live in: the hull MOUNT and the second fishing
// SPECIAL. Neither takes an ordinary item, so neither should look like an
// ordinary slot sitting empty. Same padding-box/border-box trick as the forge
// treatments above, with a palette nothing else in the game spends: fossil bone
// and old brass banded into the ancient crimson (#e0455a, the rarity colour),
// well away from the prismatic pastels and the abyssal green-gold.
export const PRIMEVAL = 'linear-gradient(118deg, #6d1c2a 0%, #e0455a 16%, #f2e2c6 34%, #e0a44a 52%, #c2394f 72%, #6d1c2a 100%)'

/** The slot treatment. `dim` is the resting state for a slot that is unlocked
 *  but empty: same identity, turned down, so an unfilled one still reads as
 *  something waiting rather than something broken. */
export const primevalBorder = (fill: string, dim = false): CSSProperties => ({
  background: `linear-gradient(${fill}, ${fill}) padding-box, ${PRIMEVAL} border-box`,
  border: '1.5px solid transparent',
  boxShadow: dim
    ? 'inset 0 0 14px rgba(224,69,90,0.10)'
    : '0 0 15px rgba(224,69,90,0.22), inset 0 0 14px rgba(224,164,74,0.10)',
})

export const PRIMEVAL_TEXT: CSSProperties = {
  backgroundImage: 'linear-gradient(105deg, #f0c9a8, #f2e2c6, #e8a0a8)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
}
