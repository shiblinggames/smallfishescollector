// ── WHERE MORE COMES FROM ───────────────────────────────────────────────────
//
// One plain line per loadout slot, shown at the top of that slot's picker on
// both loadouts: the fishing screen's GearScreen and the sea's GearSheet. A
// picker full of what you own says nothing about how the rest is got, and a
// captain who has just found the loadout has no way of knowing that rods are
// bought, lines are earned, pets come out of crates and badges out of
// achievements. Said once, up top, in the same words on both.
//
// Its own file so the sea's sheet does not have to import the fishing
// screen's four-thousand-line module to read eleven sentences.
//
// KEEP IT TRUE. When a source changes (a new way to earn hats, a pet that is
// sold), this is the sentence a captain reads.

import type { SlotKey } from '@/app/(app)/fishing/GearScreen'

export const HOW_TO_GET: Record<SlotKey, string> = {
  rod: 'Buy new rods at the Tackle Shop. Stronger ones unlock as your Fishing level climbs.',
  reel: 'Upgrade your reel at the Tackle Shop.',
  hook: 'Upgrade your hook at the Tackle Shop.',
  line: 'Lines are earned by catching new species. Nothing to buy.',
  special: 'Special tackle is sold at the Tackle Shop. Some pieces are only earned.',
  special2: 'Finn hands these out as his campaign goes on.',
  badge: 'Badges are earned through achievements.',
  skin: 'Skins are bought with doubloons or gems, earned by levels and achievements, or found in crates.',
  hat: 'Hats are bought with doubloons. A few only come out of crates.',
  boat: 'Boats are bought with doubloons or gems, earned by levels and achievements, or found in crates.',
  pet: 'Pets come out of supply crates.',
}
