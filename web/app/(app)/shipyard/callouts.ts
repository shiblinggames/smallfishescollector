// WHERE THE PREVIEW'S LABELS SIT, and what each one points at.
//
// Two coordinates per callout, both PERCENTAGES OF THE HERO PANEL — the
// bordered box the boat is drawn in. One coordinate space for the whole thing,
// which is what lets a person drag either end around and read the numbers off.
//
//   `at`   the dot on the picture: the hat, the rod, the hull.
//   `chip` where the name sits. Free, not a column in a strip — a boat is not
//          laid out in even quarters and neither are the things on it.
//
// TUNED BY HAND, on /shipyard/calibrate. Placing these by reading numbers is
// hopeless: the sprite is a composite whose overlays differ per hat and per
// boat, so the only honest way is to look at it. That page drags both ends and
// prints this table.

export type Callout = {
  slot: 'rod' | 'hat' | 'skin' | 'boat' | 'pet'
  label: string
  at: { x: number; y: number }
  chip: { x: number; y: number }
}

export const CALLOUTS: Callout[] = [
  { slot: 'rod',   label: 'Rod',   at: { x: 37.8, y: 32.8 }, chip: { x: 44.2, y: 13 } },
  { slot: 'hat',   label: 'Hat',   at: { x: 64.4, y: 24.5 }, chip: { x: 86.8, y: 14.1 } },
  { slot: 'skin',  label: 'Skin',  at: { x: 68.5, y: 41.8 }, chip: { x: 47.8, y: 88 } },
  { slot: 'boat',  label: 'Boat',  at: { x: 56.2, y: 64.9 }, chip: { x: 23.4, y: 81.2 } },
  { slot: 'pet',   label: 'Pet',   at: { x: 81.4, y: 55.7 }, chip: { x: 74.1, y: 84.5 } },
]
