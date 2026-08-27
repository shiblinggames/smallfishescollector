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
  { slot: 'rod',   label: 'Rod',   at: { x: 20, y: 25.5 }, chip: { x: 13, y: 80 } },
  { slot: 'hat',   label: 'Hat',   at: { x: 50, y: 18 },   chip: { x: 40, y: 80 } },
  { slot: 'skin',  label: 'Skin',  at: { x: 50, y: 34.5 }, chip: { x: 68, y: 80 } },
  { slot: 'boat',  label: 'Boat',  at: { x: 48, y: 64.5 }, chip: { x: 26, y: 93 } },
  { slot: 'pet',   label: 'Pet',   at: { x: 74, y: 52.5 }, chip: { x: 66, y: 93 } },
]
