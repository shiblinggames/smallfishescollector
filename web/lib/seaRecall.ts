// The free recall home: its cycle and where each side's lands. Plain module so
// the chart and the server action read the same numbers.


export type RecallSide = 'fishing' | 'expedition'

/** One recall per side per sea day/night cycle (lib/seaClock's 48 minutes). */
export const RECALL_MS = 48 * 60_000

/**
 * WHERE EACH LANDS.
 *   fishing: just off the Homestead to the south, on the channel side: the
 *     landing its old portal berth used (retired 2026-09-23), already checked
 *     clear of the painted coast, and well away from the portal's well
 *     (arriving in a portal opens its sheet).
 *   expedition: the Gunwharf's own portal landing, a short pull off the wharf
 *     in the water the expedition way home already uses.
 */
export const RECALL_TO: Record<RecallSide, { x: number; y: number; accent: string; name: string }> = {
  fishing: { x: 1500, y: 520, accent: '#7fd6a0', name: 'the Homestead' },
  expedition: { x: -500, y: -5150, accent: '#a78bfa', name: 'the Gunwharf' },
}
