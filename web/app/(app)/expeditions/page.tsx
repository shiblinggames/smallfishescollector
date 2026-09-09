import { redirect } from 'next/navigation'

// ── THE EXPEDITIONS HUB IS THE SEA NOW ──────────────────────────────────────
//
// This was a page of tiles: a ship hero, four hub cards, a campaign node map
// behind an overlay, and prep modals in front of each of them. Every one of
// those is somewhere on the water instead.
//
//   the campaign  → water you sail, one stop at a time (sea/raidWaters)
//   voyages       → the Charterhouse (sea/VoyageBoard)
//   bounties      → the Posting House (BountyBoardModal, pinned over the sea)
//   the gauntlets → two maelstroms you descend into
//   your ship     → the Gunwharf, and the Battle Loadout disc in the HUD
//   the forge     → the Forge island
//   the crew      → the crew disc, and the Crew Hall ashore
//   farming a boss you have beaten → the Wargate
//
// The rule this finishes is the one the anchorage was built on: expeditions'
// management should be somewhere you GO, not a tab you open. A page of tiles is
// the opposite of that by construction, and while it existed every one of those
// places had two doors — one you sailed to and one you clicked.
//
// ── IT REDIRECTS, IT IS NOT DELETED ─────────────────────────────────────────
//
// The URL has been real for months: bookmarks, a mail message, the badges page
// and every raid's way out all pointed here. Those are repointed, but a dead
// link is a worse outcome than a hop, and the same is true of /expeditions/ship,
// /forge and /items.
//
// THE FOLDER STAYS, and that is not an oversight. The sea imports twenty-odd
// modules from it — ShipHero, the puzzle boards, DailyVoyagePanel, the boss
// card, raidMapActions, StoryScene — because the water was built to REACH the
// hub's own components rather than to reimplement them. This directory is a
// component library with no page on it now.
export default function Page() {
  redirect('/sea')
}
