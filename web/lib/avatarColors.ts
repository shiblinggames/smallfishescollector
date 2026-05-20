// Shared palette + defaults for the player avatar's background and border
// colors. Each player can customize from /profile (tap the avatar). The
// avatar shows up in the desktop nav, /profile, leaderboard rows, and the
// in-raid player nameplate — all read from these defaults when the player
// hasn't set a value.
//
// The special hex 'none' means transparent (no gradient / no border).
// Gold border is gated to premium members; validate server-side in
// updateAvatarColors.

export const NONE_VALUE = 'none' as const

/** Backwards-compatible defaults — null in the DB resolves to these. */
export const DEFAULT_AVATAR_BG_COLOR     = 'none'
export const DEFAULT_AVATAR_BORDER_COLOR = 'none'

export interface AvatarColorOption {
  id: string
  label: string
  /** CSS color value. Special: 'none' renders transparent. */
  hex: string
  /** Premium-locked option. Server validates this against profiles.is_premium
   *  before saving. */
  premiumOnly?: boolean
}

/** Shared base palette — 12 visually distinct swatches that cover neutrals
 *  + the rainbow. Used for both the bg and the border pickers (the border
 *  picker also includes AVATAR_BORDER_EXTRAS below).
 *  Roughly half the colors are flagged premiumOnly — the showier hues
 *  (red, orange, yellow, cyan, purple, pink) so non-premium players still
 *  have a decent selection of neutrals + foundational colors. */
export const AVATAR_PALETTE: AvatarColorOption[] = [
  // Free tier (6) — neutrals + foundational
  { id: 'none',   label: 'None',   hex: NONE_VALUE },
  { id: 'black',  label: 'Black',  hex: '#0a0a0a' },
  { id: 'white',  label: 'White',  hex: '#f5f5f0' },
  { id: 'slate',  label: 'Slate',  hex: '#64748b' },
  { id: 'blue',   label: 'Blue',   hex: '#2563eb' },
  { id: 'green',  label: 'Green',  hex: '#16a34a' },
  // Premium tier (6) — vivid accent hues
  { id: 'red',    label: 'Red',    hex: '#dc2626', premiumOnly: true },
  { id: 'orange', label: 'Orange', hex: '#f97316', premiumOnly: true },
  { id: 'yellow', label: 'Yellow', hex: '#facc15', premiumOnly: true },
  { id: 'cyan',   label: 'Cyan',   hex: '#06b6d4', premiumOnly: true },
  { id: 'purple', label: 'Purple', hex: '#9333ea', premiumOnly: true },
  { id: 'pink',   label: 'Pink',   hex: '#db2777', premiumOnly: true },
]

/** Special sentinel: an animated rotating-prismatic ring (not a color).
 *  CharacterAvatar renders it as the `.avatar-aurora` ring; pickers must
 *  special-case the swatch. Premium-only flex cosmetic. */
export const AURORA_VALUE = 'aurora' as const

/** Gem-purchasable animated specials. Each renders via a dedicated CSS class
 *  in CharacterAvatar; pickers special-case the preview swatch.
 *  Borders are 300 ◆, backgrounds are 500 ◆. */
export const EMBER_VALUE  = 'ember'  as const  // border — rotating fire ring
export const TIDE_VALUE   = 'tide'   as const  // border — flowing blue/cyan
export const SUNSET_VALUE = 'sunset' as const  // bg — panning orange→pink→purple
export const NEBULA_VALUE = 'nebula' as const  // bg — slow purple/blue swirl
export const BIOLUM_VALUE = 'biolum' as const  // bg — deep blue + floating shimmer

export interface AvatarSpecial {
  id: string
  label: string
  hex: string
  kind: 'border' | 'bg'
  /** Gems required to unlock. */
  gemPrice: number
  /** CSS class that renders the animation on the preview swatch. */
  cssClass: string
}

export const AVATAR_SPECIALS: AvatarSpecial[] = [
  { id: 'ember',  label: 'Ember',         hex: EMBER_VALUE,  kind: 'border', gemPrice: 300, cssClass: 'avatar-ember' },
  { id: 'tide',   label: 'Tide',          hex: TIDE_VALUE,   kind: 'border', gemPrice: 300, cssClass: 'avatar-tide' },
  { id: 'sunset', label: 'Sunset',        hex: SUNSET_VALUE, kind: 'bg',     gemPrice: 500, cssClass: 'avatar-bg-sunset' },
  { id: 'nebula', label: 'Nebula',        hex: NEBULA_VALUE, kind: 'bg',     gemPrice: 500, cssClass: 'avatar-bg-nebula' },
  { id: 'biolum', label: 'Bioluminescent',hex: BIOLUM_VALUE, kind: 'bg',     gemPrice: 500, cssClass: 'avatar-bg-biolum' },
]

export function getAvatarSpecial(hex: string | null | undefined): AvatarSpecial | undefined {
  if (!hex) return undefined
  return AVATAR_SPECIALS.find(s => s.hex === hex)
}

/** Border-only extras — border-only options that aren't plain colors.
 *  Auto-included in ALLOWED_BORDER_HEXES + isPremiumBorder. */
export const AVATAR_BORDER_EXTRAS: AvatarColorOption[] = [
  { id: 'aurora', label: 'Aurora', hex: AURORA_VALUE, premiumOnly: true },
]

/** All allowed bg values: free/premium palette + animated bg specials. */
export const ALLOWED_BG_HEXES: string[] = [
  ...AVATAR_PALETTE.map(c => c.hex),
  ...AVATAR_SPECIALS.filter(s => s.kind === 'bg').map(s => s.hex),
]
/** All allowed border values: palette + premium aurora + animated border specials. */
export const ALLOWED_BORDER_HEXES: string[] = [
  ...AVATAR_PALETTE.map(c => c.hex),
  ...AVATAR_BORDER_EXTRAS.map(c => c.hex),
  ...AVATAR_SPECIALS.filter(s => s.kind === 'border').map(s => s.hex),
]

/** True if this border hex requires a premium membership to use. */
export function isPremiumBorder(hex: string | null | undefined): boolean {
  if (!hex) return false
  const all = [...AVATAR_PALETTE, ...AVATAR_BORDER_EXTRAS]
  return all.some(c => c.hex === hex && c.premiumOnly)
}

/** True if this bg hex requires a premium membership to use. */
export function isPremiumBg(hex: string | null | undefined): boolean {
  if (!hex) return false
  return AVATAR_PALETTE.some(c => c.hex === hex && c.premiumOnly)
}

/** Resolve a stored color (may be null) to a usable CSS string. Falls back
 *  to the default; 'none' stays 'none' (CharacterAvatar handles it). */
export function resolveAvatarBg(saved: string | null | undefined): string {
  return saved ?? DEFAULT_AVATAR_BG_COLOR
}
export function resolveAvatarBorder(saved: string | null | undefined): string {
  return saved ?? DEFAULT_AVATAR_BORDER_COLOR
}
