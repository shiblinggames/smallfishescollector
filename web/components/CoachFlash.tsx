'use client'

// ── THE HIGHLIGHT THAT CANNOT BE CLIPPED ────────────────────────────────────
//
// Every tour in the game points at a real control by adding `.coach-flash` to
// it: the first voyage, the anchorage tour, the sea's cues, the market's beat,
// the lobby guide, the crew and loadout tabs. Six call sites, one class.
//
// THE CLASS USED TO DRAW THE RING ITSELF — an outline with an offset and a
// `scale(1.06)` pulse — and both of those reach OUTSIDE the element's own box,
// which means both are at the mercy of whatever the control happens to live
// in. Three separate faults, all the same fault:
//
//   A CARD IN A GRID had the right-hand side of its ring shaved off by the
//   panel it sits in, and the one on the other side of the grid lost its left.
//
//   A BUTTON IN A SCROLLING LIST grew past the bottom of that list, and a
//   transformed box counts toward scrollable overflow — so a scrollbar
//   appeared on the recruit sheet for no reason a player could see, and
//   flickered as the pulse breathed.
//
//   AND NOTHING COULD BE DONE ABOUT IT from the class, because the clipping
//   ancestor is a different element every time and it is usually clipping on
//   purpose.
//
// So the ring is drawn HERE instead: one fixed-position box per flashed
// element, in a layer over the whole document, tracking the element's rect on
// every frame. Nothing about the control changes — no outline, no transform,
// no layout, no overflow — and the ring is outside every scroll box and every
// rounded card in the app by construction.
//
// The class stays exactly as it was for the six callers. They add it; this
// notices.

import { useEffect, useRef } from 'react'

/** How often the document is asked who is flashing. Cheap — a class selector
 *  over a document that almost never has one — and far less often than a
 *  frame. The tours re-apply theirs on a 250ms poll of their own, so this is
 *  never the slow half. */
const SCAN_MS = 200

export default function CoachFlash() {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    /** The element being pointed at, and the ring drawn over it. */
    const rings = new Map<Element, HTMLDivElement>()
    let raf = 0

    // THE RECTS, EVERY FRAME. A control can move under a ring: a panel
    // scrolls, a sheet resizes, the sea's HUD reflows on a rotate. One
    // getBoundingClientRect per flashed element, and there is never more than
    // a handful — the loop does not run at all when nothing is flashing.
    const tick = () => {
      raf = requestAnimationFrame(tick)
      for (const [el, ring] of rings) {
        const r = el.getBoundingClientRect()
        // A control that has been unmounted or hidden measures zero. Its ring
        // waits rather than collapsing to a dot in the corner.
        if (r.width < 1 || r.height < 1) { ring.style.opacity = '0'; continue }
        ring.style.opacity = '1'
        ring.style.left = `${r.left}px`
        ring.style.top = `${r.top}px`
        ring.style.width = `${r.width}px`
        ring.style.height = `${r.height}px`
      }
    }

    const scan = () => {
      const want = new Set<Element>(document.querySelectorAll('.coach-flash'))
      for (const [el, ring] of rings) {
        if (want.has(el) && el.isConnected) continue
        ring.remove()
        rings.delete(el)
      }
      for (const el of want) {
        if (rings.has(el)) continue
        const ring = document.createElement('div')
        ring.className = 'coach-ring' + (el.classList.contains('coach-flash-gold') ? ' coach-ring-gold' : '')
        // The control's own corner, so the ring is the shape of the thing it
        // is pointing at rather than a rectangle over a pill. Read once: a
        // border-radius does not change while a tour beat is up, and reading
        // computed style on every frame is a forced layout per element.
        const radius = getComputedStyle(el).borderRadius
        if (radius && radius !== '0px') ring.style.borderRadius = radius
        host.appendChild(ring)
        rings.set(el, ring)
      }
      if (rings.size > 0 && raf === 0) { tick() }
      else if (rings.size === 0 && raf !== 0) { cancelAnimationFrame(raf); raf = 0 }
    }

    scan()
    const id = window.setInterval(scan, SCAN_MS)
    return () => {
      window.clearInterval(id)
      if (raf !== 0) cancelAnimationFrame(raf)
      for (const ring of rings.values()) ring.remove()
    }
  }, [])

  return (
    <div ref={hostRef} aria-hidden style={{
      // Under the badge toast and over everything else, including the crew
      // panel the tour spends half its beats inside.
      position: 'fixed', inset: 0, zIndex: 99990, pointerEvents: 'none',
    }} />
  )
}
