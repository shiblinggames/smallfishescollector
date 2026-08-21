// Route-level Suspense fallback for /fishing.
//
// This page has no Suspense boundaries of its own, so it holds every pixel
// until the slowest of fourteen queries lands, and it is the screen players
// open more than any other. That wait gets a moment rather than a grey
// skeleton.
//
// It draws nothing itself. The scene lives in SoundingScene so that this and
// FishingAssetGate (which holds the same picture past this boundary, until the
// tile art has decoded) cannot drift apart and flicker at the handoff.

import SoundingScene from './SoundingScene'

export default function Loading() {
  return (
    <main aria-label="Loading">
      <SoundingScene />
    </main>
  )
}
