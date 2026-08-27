// THE OLD HOOK SHOP, now a signpost.
//
// This route predates the Tackle Shop, which sells hooks alongside everything
// else. Nothing in the app has linked here for a long time — the sweep that
// retired it found zero references — but a route is an address, and addresses
// outlive their links: bookmarks, browser autocomplete, an old screenshot.
// A dead page at a live address reads as the shop having vanished.
//
// The redirect is the whole page. HookShop.tsx went with it. actions.ts
// STAYS — it looked orphaned and is not: FishingGame, the Tackle Shop and the
// Shipyard all import buy actions from it. The lesson from deleting it and
// getting three build errors is that a route being dead says nothing about the
// files beside it.
import { redirect } from 'next/navigation'

export default function HooksPage() {
  redirect('/marketplace/tackle-shop')
}
