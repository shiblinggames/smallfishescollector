// Route-level Suspense fallback for /fishing.
//
// This page has no Suspense boundaries of its own, so it holds every pixel
// until the slowest of fourteen queries lands, and it is the screen players
// open more than any other. That wait gets a moment rather than a grey
// skeleton. The scene itself lives in SoundingScene.
//
// IT ALSO DOES THE FETCHING. The seconds this is on screen are seconds the
// browser is otherwise idle, waiting on the server, so it spends them pulling
// down the art the hub is about to need. By the time the page swaps in, the
// tiles are already decoded and simply appear with it.
//
// This replaced an overlay that held the scene up past the Suspense boundary
// until the same images had decoded. That version was worse in both
// directions: it painted a black frame going in, and its fade-out left the
// loading animation sitting on top of the finished page on the way out.
// Preloading gets the same result with no overlay, no JavaScript, and nothing
// that can flash or linger. If more art starts popping in, add it to this list
// rather than reaching for a gate again.
//
// Not preloaded: the per-zone tile backdrop. Which zone that is comes out of
// the very query this is waiting on, so it cannot be known here, and pulling
// all five to cover the guess would be ~300KB of pictures nobody is looking at.
// It is one image, it is the same one every visit for a given captain, and it
// is cached after the first.

import SoundingScene from './SoundingScene'

/** The hub's tile art. Small (about 57KB together) and always the same three. */
const PRELOAD = ['/fish-market.jpg', '/fish-tackle.jpg', '/fish-bestiary.jpg']

export default function Loading() {
  return (
    <main aria-label="Loading">
      {/* Hoisted into <head> by React. The backdrop is not here because
          SoundingScene renders it directly, which fetches it just as early. */}
      {PRELOAD.map(href => (
        <link key={href} rel="preload" as="image" href={href} />
      ))}
      <SoundingScene />
    </main>
  )
}
