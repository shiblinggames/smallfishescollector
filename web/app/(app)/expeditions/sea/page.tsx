// THE EXPEDITION SEA.
//
// The far side of the reef, and a page of its own rather than a region of the
// fishing chart. Sailing through the arch is a NAVIGATION now: you arrive on a
// new page, on the ship you actually own, with the chart drawing the other half
// of the world.
//
// The body is shared with /sea (see SeaPageBody). Everything about loading a
// captain, a chart and a sailing loop is identical; what differs is which half
// you are dropped into and what you are steering while you are there.

import { SeaPageBody } from '../../sea/page'

export const metadata = { title: 'The Expedition Sea' }

export default async function ExpeditionSeaPage() {
  return SeaPageBody({ side: 'expeditions' })
}
