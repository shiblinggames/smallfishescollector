// The Pixi spike. A bench, like /sea/boundary and /sea/waterline — nothing on
// the chart imports it and nothing links to it. See PixiBench for what it is
// trying to find out.
//
// IMPORTED DIRECTLY, not through `next/dynamic` with `ssr: false`. That is not
// allowed from a Server Component in this version of Next, and it is not needed
// either: PixiBench is a Client Component whose first render is a couple of
// empty divs, and Pixi itself is `await import`ed inside the effect. Nothing
// touches `window` or WebGL on the server.

import { adminOnlyPage } from '@/lib/adminGate'
import PixiBench from './PixiBench'

export const metadata = { title: 'Pixi spike' }

// Admin only, like the other two benches it names. It was the one of the
// three without the guard.
export default async function PixiSpikePage() {
  await adminOnlyPage()
  return <PixiBench />
}
