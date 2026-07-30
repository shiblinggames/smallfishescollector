import { Suspense } from 'react'
import ShipHeroSection from '../ShipHeroSection'

// Its own route rather than a tab, so it gets a URL, a back button, and does
// not pull the whole hub in behind it. The section fetches exactly what the
// hub's ship screen fetches, so the two can never drift.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ShipHeroSection focus="ship" />
    </Suspense>
  )
}
