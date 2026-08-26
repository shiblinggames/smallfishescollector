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
// The gate is OPEN as of the beta. It stays in the code as one switch rather
// than four scattered checks, so shutting the sea again is one line if the beta
// turns up something that needs it.

/**
 * OPEN BETA. Everybody.
 *
 * The list is kept rather than deleted because it is the re-gating switch: set
 * OPEN to false and the sea shuts to everyone except admins and the names here,
 * without having to remember which four routes were involved.
 */
const OPEN = true

/** Captains who keep access if OPEN is ever turned back off. */
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
  if (OPEN) return true
  if (profile.is_admin === true) return true
  const name = (profile.username ?? '').trim().toLowerCase()
  return name.length > 0 && CREW.includes(name)
}
