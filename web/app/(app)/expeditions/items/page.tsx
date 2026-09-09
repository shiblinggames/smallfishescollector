import { redirect } from 'next/navigation'

// ── THE BATTLE LOADOUT IS A DOOR ON THE SEA NOW ─────────────────────────────
//
// This was a route: a full page wearing /items-bg.jpg with ShipHero's own
// header on top of it, reachable only by leaving the chart. What you mount on
// the hull is a BETWEEN-FIGHTS decision, and between fights you are on the
// water — so it is a disc in the expedition side's HUD row, opening the same
// slots in the sea's own modal language (see sea/ShipSheet, focus="items").
//
// The route stays as a redirect rather than being deleted: it has been a real
// URL for months, and a dead link is a worse outcome than a hop.
//
// NOTHING WAS REWRITTEN. `ShipHero` still draws the slots, the picker, the item
// sheets and the effects breakdown; only the shell around it changed, and the
// hub's launch-prep drawer still mounts the same component the same way.
export default function Page() {
  redirect('/sea?open=loadout')
}
