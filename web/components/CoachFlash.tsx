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

/**
 * ── WHAT STAYS LIVE WHILE A TOUR HOLDS THE WHEEL ────────────────────────────
 *
 * The card's own buttons, and the three controls the lock has always left
 * alone: the helm, the Fish button and the level bar. Steering is not a door,
 * and a wheel that stops answering is a game that looks broken.
 */
const ALWAYS = '[data-tour-card],[data-coach="helm"],[data-coach="fish"],[data-coach="level"]'
/**
 * AND WHAT COUNTS AS A PRESS WORTH BLOCKING.
 *
 * Only things that are actually controls. A tap on open water is how you steer
 * on a desktop and a drag on a list is how you read it, so a blanket block
 * would take the game away rather than the distractions — and `pointer-events:
 * none` on a subtree, the obvious way to do this, stops touch scrolling dead.
 * Swallowing the CLICK on a control leaves both alone.
 */
const CONTROL = 'button,a,input,select,textarea,label,[role="button"],[role="link"],[role="tab"],[data-coach]'
/**
 * ── AND WHAT OPENED ON TOP OF IT ────────────────────────────────────────────
 *
 * The control a tour points at often opens something the tour does not model:
 * press the empty seat it lit and a picker full of your crew comes up, and not
 * one row of it is the flashed element. Blocking those is worse than not
 * blocking at all — it is a sheet the tour told you to open and will not let
 * you use, which is a dead end with the wheel still held.
 *
 * So a press is allowed when it lands in a layer ABOVE the one the lit control
 * lives in. `layerOf` is the largest z-index on an element's positioned
 * ancestors, which is what "on top of" means here; the floor keeps the nav and
 * the chart's own furniture, which sit low, on the blocked side of the line.
 */
const OVERLAY_FLOOR = 100
const layerOf = (el: Element | null): number => {
  let z = 0
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    const cs = getComputedStyle(n)
    if (cs.position === 'static') continue
    const v = parseInt(cs.zIndex, 10)
    if (Number.isFinite(v) && v > z) z = v
  }
  return z
}

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
    /** Whether a tour is holding the wheel, and whether the beat it is on is
     *  one that only asks to be READ (in which case even the lit control is
     *  inert — see `.sea-tour-read`). Refreshed on the same scan as the rings. */
    let locked = false
    let readOnly = false
    /** The layer the lit control sits in — see layerOf. Measured on the scan
     *  rather than per press: a control does not change layers while it is up,
     *  and a press should not pay for a walk of the whole tree twice. */
    let flashLayer = 0

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
      locked = !!document.querySelector('.sea-tour-lock')
      readOnly = !!document.querySelector('.sea-tour-read')
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
      flashLayer = 0
      for (const el of rings.keys()) flashLayer = Math.max(flashLayer, layerOf(el))
      if (rings.size > 0 && raf === 0) { tick() }
      else if (rings.size === 0 && raf !== 0) { cancelAnimationFrame(raf); raf = 0 }
    }

    /**
     * ── AND NOTHING ELSE IS PRESSABLE ─────────────────────────────────────
     *
     * A tour that dims the other controls is still a tour you can wander out
     * of: the dimming only ever covered the handful of things carrying a
     * `data-coach`, so the Daily Haul's other Claim buttons, the panel's x, the
     * nav and every sheet behind them stayed live. A captain could claim their
     * gems, shut the haul and walk off mid-beat, and every lock-out reported so
     * far started with exactly that kind of step sideways.
     *
     * So every press on the page is swallowed in the CAPTURE phase unless it
     * lands on the control the tour is pointing at, or on the card itself.
     * Scrolling and steering are untouched: the block is on `click` and the
     * presses that stand in for it, never on the pointer stream a drag is made
     * of, and only when the target is a control in the first place.
     *
     * IT TURNS ITSELF OFF when the tour has nothing to point at. That is the
     * same safety valve `pointing` is in SeaGateTour, in the one place that
     * could otherwise take the whole screen away: a beat with no lit control
     * and no read-mode is a beat that cannot be answered, and a blocked screen
     * is the worst possible answer to it.
     */
    const swallow = (e: Event) => {
      if (!locked) return
      if (!readOnly && rings.size === 0) return
      const t = e.target as Element | null
      if (!t || typeof t.closest !== 'function') return
      if (t.closest(ALWAYS)) return
      if (!readOnly && t.closest('.coach-flash')) return
      // Not a control at all: open water, a scroll box, a line of text.
      if (!t.closest(CONTROL)) return
      // Something opened on top of what the tour pointed at — see layerOf.
      const z = layerOf(t)
      if (z >= OVERLAY_FLOOR && z > flashLayer) return
      e.stopPropagation()
      if (e.type === 'click' || e.type === 'dblclick' || e.type === 'keydown') e.preventDefault()
    }
    // Capture, so it runs before anything React has bound at the root. Pointer
    // and mouse presses are only STOPPED, never prevented: preventing them
    // would take focus and touch-scrolling with them.
    const kinds = ['pointerdown', 'mousedown', 'click', 'dblclick', 'keydown'] as const
    for (const k of kinds) document.addEventListener(k, swallow, true)

    scan()
    const id = window.setInterval(scan, SCAN_MS)
    return () => {
      window.clearInterval(id)
      for (const k of kinds) document.removeEventListener(k, swallow, true)
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
