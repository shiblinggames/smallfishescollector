// THE SHIPYARD, as a page.
//
// It is a SHEET on the chart now — you moor at its island and it opens where
// you are, like every other thing you can moor at. This route stays because a
// deep link to it is still a real thing (the badges wall points at it, and a
// bookmark should not stop working), and because the sheet and the page render
// the identical component from the identical read.
//
// Everything it needs comes from `shipyardState`, which the sheet calls too.
// See that file for why the gathering does not live in either surface.

import { redirect } from 'next/navigation'
import { shipyardState } from './shipyardState'
import ShipyardClient from './ShipyardClient'

export const metadata = { title: 'The Shipyard' }

export default async function ShipyardPage() {
  const state = await shipyardState()
  if ('error' in state) redirect('/tavern')
  return <ShipyardClient {...state} />
}
