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
