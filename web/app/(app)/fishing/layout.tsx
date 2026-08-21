// Layout for /fishing, and it exists for exactly one reason.
//
// A layout mounts when the route is entered and SURVIVES the swap from
// loading.tsx to page.tsx. That is the only place a component can sit and keep
// showing the waiting scene past the Suspense boundary, which is what it takes
// to stop the hub's tile art popping in one picture at a time after the loading
// screen has already gone. See FishingAssetGate.
//
// Server component. The gate is the only client code here, and it renders its
// overlay during SSR so the very first paint already has it.

import type { ReactNode } from 'react'
import FishingAssetGate from './FishingAssetGate'

export default function FishingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <FishingAssetGate />
      {children}
    </>
  )
}
