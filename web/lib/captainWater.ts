// ── CAPTAIN'S WATER ─────────────────────────────────────────────────────────
//
// Plain module, NOT 'use server': that directive drops non-async exports and
// everything here is a pure function or a string.
//
// ── THE DECISION (2026-09-16) ───────────────────────────────────────────────
//
// Gate the deep end, never the rates. The house rule is no pay-to-win, and a
// lifetime $9.99 is closer to buying the game than to a subscription, so the
// honest shape is a demo and a full game: a free captain gets the whole first
// act of both loops at full strength, and a Captain gets the water past it.
// Nothing about how fast anybody fishes, fights or earns changes with the
// badge. What changes is where they may sail.
//
// ── WHERE THE LINE FALLS ────────────────────────────────────────────────────
//
// Both loops already hinge on the Quartermaster. Clearing Chapter III is what
// opens the Ancient Deep, and everything after it is the endgame in all but
// name. So that is the door, and it is ONE door:
//
//   the Ancient Deep and the six giants (and so the Completionist Rod)
//   Chapter IV, the finale and the Vigil
//   Don's Gauntlet, Hardcore, Davy's Terms and Blood Gems
//   Renown, the post-100 progression
//
// The Abyssal Forge is not gated here on purpose: it is bought inside Don's
// Gauntlet, so it is behind the door already, and a second lock on it would
// only ever catch somebody who had bought it before the door existed.
//
// ── AND THE DOOR HAS NO KEY FOR RATES ───────────────────────────────────────
//
// The one perk that touched a number, the Fish Market's three percent cut for
// non-Captains, was removed the same day. Not folded into this, removed: it
// was confusing on the receipt and it was the wrong kind of perk.
//
// ── GRANDFATHERED BY STATE ──────────────────────────────────────────────────
//
// Every gate takes a `held` argument: whether this captain ALREADY holds
// progress in that water (the Ancient Deep flag, a Chapter IV node cleared, a
// Don's descent on record, points spent in Renown). Somebody who was already
// through when the door went up keeps what they had. That is the level-unlock
// rule (grant on state, not on crossing) applied to a lock, and it means the
// door can go up before the fleet wipe without taking anything off anybody.

import { isPremiumActive, type PremiumProfileRow } from './premium'

export type CaptainWaterRow = PremiumProfileRow & { is_admin?: boolean | null }

/** Admins always: they have to be able to look at what they are shipping. */
export function inCaptainsWater(profile: CaptainWaterRow | null | undefined): boolean {
  if (!profile) return false
  if (profile.is_admin === true) return true
  return isPremiumActive(profile)
}

/** The gate proper: through if a Captain, or if already in this water. */
export function captainsWaterOpen(profile: CaptainWaterRow | null | undefined, held: boolean): boolean {
  return held || inCaptainsWater(profile)
}

/** The lock's name, wherever a lock is printed. Two words, the same two
 *  everywhere, so a captain learns once what the gold register means. */
export const CAPTAIN_WATER = "Captain's water"

/**
 * WHAT A REFUSAL SAYS. Plain and literal, the way a mechanic is explained
 * anywhere in this game; Kip on the Mainland is where the terms are read,
 * so every one of these points there.
 */
export const CAPTAIN_WATER_SAYS = {
  ancient: "The Ancient Deep is Captain's water. Kip on the Mainland has the terms.",
  chapter4: "The Last Fathom is Captain's water. Kip on the Mainland has the terms.",
  dons: "Don's Gauntlet is Captain's water. Kip on the Mainland has the terms.",
  hardcore: "The Hardcore descent is Captain's water. Kip on the Mainland has the terms.",
  renown: "Renown is Captain's water. Kip on the Mainland has the terms.",
} as const
