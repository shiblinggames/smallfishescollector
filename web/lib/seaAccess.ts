// WHO CAN GET TO THE SEA.
//
// Plain module, NOT 'use server' — that directive silently drops non-async
// exports and both of these are pure.
//
// ── ONE LIST, FOUR DOORS ────────────────────────────────────────────────────
//
// The ocean hub is four routes, not one: /sea itself, and the three places you
// can only reach by sailing there — /home, /shipyard and /trawl-docks. Each had
// its own copy of `profile?.is_admin !== true`, which is four chances to open
// three of them and forget the fourth, and the way that fails is somebody
// standing on a chart looking at a Shipyard that redirects them to the tavern.
//
// So the rule lives here and those four call it.
//
// ── WHY AN ALLOWLIST AND NOT JUST is_admin ──────────────────────────────────
//
// Letting somebody try the sea should not mean handing them the admin flag.
// That flag gates raid nodes, SQL-adjusted test accounts and anything else
// marked adminOnly, and none of that has anything to do with wanting a look at
// the water. A username here grants exactly one thing: the sea.
//
// This is a BETA list, not a permanent tier. When the hub replaces /fishing the
// gate comes out altogether rather than growing.

/** Captains let in early, by username. Lower case; the check is too. */
const CREW: string[] = [
  'dkmuppy',
]

export type SeaProfile = { is_admin?: boolean | null; username?: string | null } | null

/**
 * Whether this captain may reach the ocean hub and everything behind it.
 *
 * Admins always can — they need to be able to look at what they are shipping.
 * Everyone else has to be on the list above.
 */
export function canSail(profile: SeaProfile): boolean {
  if (!profile) return false
  if (profile.is_admin === true) return true
  const name = (profile.username ?? '').trim().toLowerCase()
  return name.length > 0 && CREW.includes(name)
}
