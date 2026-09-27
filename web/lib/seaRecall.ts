// The free recall home: its cycle and where each side's lands. Plain module so
// the chart and the server action read the same numbers.

import { CROSS_TO, ANCHOR_ACCENT } from './seaPortal'

export type RecallSide = 'fishing' | 'expedition'

/** One recall per side per sea day/night cycle (lib/seaClock's 48 minutes). */
export const RECALL_MS = 48 * 60_000

/**
 * WHERE EACH LANDS: at that side's home portal (Kong, 2026-09-27), the same
 * water a crossing between the two sets you down in (CROSS_TO), a short pull
 * south of the well so arriving does not open its sheet.
 *   fishing: the Homestead portal.
 *   expedition: the Anchorage portal.
 */
export const RECALL_TO: Record<RecallSide, { x: number; y: number; accent: string; name: string }> = {
  fishing: { ...CROSS_TO.fish, accent: '#7fd6a0', name: 'the Homestead Portal' },
  expedition: { ...CROSS_TO.anchor, accent: ANCHOR_ACCENT, name: 'the Anchorage Portal' },
}
