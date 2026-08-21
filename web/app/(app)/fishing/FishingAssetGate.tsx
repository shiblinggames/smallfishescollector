'use client'

// HOLD THE SCENE UNTIL THE ART IS ACTUALLY THERE.
//
// loading.tsx only covers the SERVER wait. The moment the queries land, Next
// swaps the fallback out and the hub paints with empty boxes where its tile art
// is still downloading, so the player watches the pictures pop in one at a time
// after the loading screen has already gone. That is the bit that reads cheap.
//
// This sits in the route's layout, so it mounts with the route and survives the
// fallback-to-page swap, and it holds the same scene on top until every tile
// image has DECODED (not merely arrived: decode() is what guarantees the next
// paint can draw it without a hitch).
//
// Four rules keep it from becoming the problem it is solving:
//   - ONCE PER SESSION. After a clean pass it steps aside for the rest of the
//     session, so tabbing back to fishing is never gated again.
//   - IT ALWAYS LETS GO. A hard timeout releases it even if an image 404s,
//     stalls, or the connection dies mid-download. Nothing here can strand a
//     player on a loading screen.
//   - A FLOOR, NOT A CEILING. Warm cache resolves in ~0ms, and vanishing after
//     one frame is its own kind of jank, so it holds a beat and fades.
//   - NO LAYOUT WORK. Fixed overlay, painted over whatever is behind it, so the
//     page underneath lays out and hydrates normally while it waits.

import { useEffect, useState } from 'react'
import { ZONE_BG } from './zoneData'
import SoundingScene from './SoundingScene'

/** Same key FishingPageClient restores from, so the gate waits on the zone the
 *  player is actually about to see rather than a guess. */
const LAST_ZONE_KEY = 'fishing_last_zone'
const SESSION_KEY = 'fishing_art_ready'

/** The hub's fixed furniture. Four files, about 115KB together. Deliberately
 *  NOT every zone backdrop (that would be ~300KB for four pictures the player
 *  is not looking at) and deliberately not fish sprites, of which there are
 *  hundreds. */
const HUB_ART = [
  '/fishing-zones-bg.jpg',
  '/fish-market.jpg',
  '/fish-tackle.jpg',
  '/fish-bestiary.jpg',
]

/** Longest this may ever hold. Past it the page shows regardless, art or no
 *  art: a picture that pops is a blemish, a loading screen that never leaves is
 *  a broken game. */
const MAX_HOLD_MS = 4500
/** Shortest it may show once it has decided to show at all. Zero: the route's
 *  own fallback has been showing this identical scene up to this moment, so
 *  there is nothing to strobe against and a warm cache should cost nothing. */
const MIN_HOLD_MS = 0
const FADE_MS = 400

function decoded(src: string): Promise<void> {
  return new Promise(resolve => {
    const img = new Image()
    // Every path resolves. A failed image is not worth holding the game for,
    // and it will fail the same way in the page whether we waited or not.
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = src
    // decode() rejects on a decoding failure and on some browsers for an image
    // that is already complete; onload/onerror above are the backstop either way.
    img.decode?.().then(() => resolve(), () => resolve())
  })
}

export default function FishingAssetGate() {
  // Starts UP, and server-renders that way, so the overlay is in the very first
  // paint rather than appearing a frame after hydration.
  const [holding, setHolding] = useState(true)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    // Already done this session: step aside without a frame of overlay.
    let seen = false
    try { seen = sessionStorage.getItem(SESSION_KEY) === '1' } catch { /* private mode */ }
    if (seen) { setHolding(false); return }

    let done = false
    const started = Date.now()
    const timers: ReturnType<typeof setTimeout>[] = []

    const release = () => {
      if (done) return
      done = true
      try { sessionStorage.setItem(SESSION_KEY, '1') } catch { /* private mode */ }
      // Hold the floor, then fade, then unmount. Two timers rather than a
      // transitionend, which never fires if the tab is backgrounded mid-fade.
      const wait = Math.max(0, MIN_HOLD_MS - (Date.now() - started))
      timers.push(setTimeout(() => {
        setFading(true)
        timers.push(setTimeout(() => setHolding(false), FADE_MS))
      }, wait))
    }

    let zone: string | null = null
    try { zone = localStorage.getItem(LAST_ZONE_KEY) } catch { /* private mode */ }
    const art = [...HUB_ART, ...(zone && ZONE_BG[zone] ? [ZONE_BG[zone]] : [ZONE_BG.shallows])]

    Promise.all(art.map(decoded)).then(release)
    timers.push(setTimeout(release, MAX_HOLD_MS))

    return () => { done = true; timers.forEach(clearTimeout) }
  }, [])

  if (!holding) return null

  return (
    <div
      aria-label="Loading"
      style={{
        // UNDER THE CHROME, over the page. The Nav and tab bar sit at z-50 and
        // stay visible the whole time, exactly as they do under loading.tsx, so
        // the chrome never blinks in and out across the handoff -- and so there
        // is always a way off this screen if the hold ever runs long.
        position: 'fixed', inset: 0, zIndex: 45,
        // NO BACKGROUND OF ITS OWN. It used to carry an opaque #02080e, which
        // painted a frame of pure black before the scene inside it composited:
        // a black flash on the way into every fishing visit, which is worse
        // than the popping this was built to stop. SoundingScene brings its own
        // ground, so a frame where that has not painted yet shows the page
        // underneath rather than a hole.
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
        // Deliberately DOES eat taps. The hub underneath is live and hydrated
        // while this is up, and letting a tap through would navigate the player
        // somewhere off a tile they cannot see.
      }}
    >
      <SoundingScene />
    </div>
  )
}
