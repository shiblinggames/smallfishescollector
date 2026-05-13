// Shared palette + defaults for the player avatar circle's background and
// border colors. Each player can pick their own values from /profile (tap
// the avatar). Everywhere the avatar renders (Nav, /profile, leaderboard
// rows, in-raid nameplate) reads from these defaults when the player
// hasn't set a value.

/** Background gradient color when no per-user choice is saved. */
export const DEFAULT_AVATAR_BG_COLOR = '#1e3a5f'   // deep navy
/** Outer ring color when no per-user choice is saved. */
export const DEFAULT_AVATAR_BORDER_COLOR = '#3a5a7a' // steel blue

/** Picker palette — twelve curated colors covering warm/cool/neutral so
 *  every player can find something. Both the background and border pickers
 *  use the same set. */
export const AVATAR_PALETTE: { id: string; label: string; hex: string }[] = [
  { id: 'navy',     label: 'Navy',     hex: '#1e3a5f' },
  { id: 'steel',    label: 'Steel',    hex: '#3a5a7a' },
  { id: 'teal',     label: 'Teal',     hex: '#0e7490' },
  { id: 'emerald',  label: 'Emerald',  hex: '#0d9488' },
  { id: 'forest',   label: 'Forest',   hex: '#3f6212' },
  { id: 'amber',    label: 'Amber',    hex: '#b45309' },
  { id: 'crimson',  label: 'Crimson',  hex: '#9f1239' },
  { id: 'magenta',  label: 'Magenta',  hex: '#be185d' },
  { id: 'violet',   label: 'Violet',   hex: '#7c3aed' },
  { id: 'indigo',   label: 'Indigo',   hex: '#3730a3' },
  { id: 'slate',    label: 'Slate',    hex: '#475569' },
  { id: 'gold',     label: 'Gold',     hex: '#a16207' },
]

/** Resolve a stored color (may be null) to a usable hex string with fallback. */
export function resolveAvatarBg(saved: string | null | undefined): string {
  return saved ?? DEFAULT_AVATAR_BG_COLOR
}
export function resolveAvatarBorder(saved: string | null | undefined): string {
  return saved ?? DEFAULT_AVATAR_BORDER_COLOR
}
