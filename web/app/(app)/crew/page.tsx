import { redirect } from 'next/navigation'

// ── /crew IS A DOOR ON THE SEA NOW ──────────────────────────────────────────
//
// This was Crew Management: a page with five tabs, its own column and its own
// title. All of it moved onto the water. Four painted cards in the crew panel
// (see sea/CrewHub) hold Assign, Recruit, Roster and Skins, and the hall
// building, its Drills and Stores ladder and its bunks are ashore at the Crew
// Hall island (sea/HallSheet), which is where a building belongs.
//
// The route stays because about thirty links point at it — every crew badge on
// the badges page, the captain's orders, the gauntlet's "sign more hands on" —
// and a dead link is a worse outcome than a redirect.
//
// AND THE TAB THEY ASKED FOR SURVIVES IT. Those links do not say "the crew
// page", they say `?tab=recruits`: go and sign somebody on. Dropping the tab
// would land every one of them on the four cards with the errand unstated, so
// the old tab is carried across as the card to open.
//
// `CrewClient` is NOT deleted. It is the same component both new doors mount,
// in embedded mode; only the page around it is gone.
const CARD: Record<string, string> = {
  assign: 'assign',
  recruits: 'recruits',
  roster: 'roster',
  // The Fallen is a toggle inside the manifest now, so a link to it opens the
  // manifest and the way in is one press from there.
  graveyard: 'roster',
  wardrobe: 'wardrobe',
  // `hall` has no card: the building is ashore at the island, and a URL cannot
  // sail you there. The panel opens on its four doors instead.
}

export default async function CrewPage({ searchParams }: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const card = tab ? CARD[tab] : undefined
  redirect(card ? `/sea?open=crew&card=${card}` : '/sea?open=crew')
}
