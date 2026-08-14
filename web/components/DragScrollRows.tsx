'use client'

// MOUSE DRAG-TO-SCROLL FOR EVERY HORIZONTAL ROW. Mounted once in the root
// layout; renders nothing.
//
// The game's rails (cosmetic rows in the gear drawer, the profile showcase,
// the crew strip, the almanac shelves) scroll horizontally, which strands them
// on desktop: the wheel scrolls vertically, there is no finger to swipe with,
// and half the rows hide their scrollbar for the mobile look, removing the one
// hint that content continues off-edge. A Windows player cannot tell the boat
// row scrolls at all, let alone how.
//
// One DELEGATED handler instead of a wrapper component on purpose: it walks up
// from the press target to the nearest element whose computed overflow-x says
// it scrolls and that actually overflows, so every current and future rail is
// covered with zero markup changes. (v1 keyed off the .scrollbar-hide class;
// that missed every rail that shows its scrollbar — the profile crew strip,
// the colorway rows — which are exactly as wheel-stranded on desktop.)
//
// Rules:
//  • MOUSE ONLY (pointerType check). Touch already scrolls these rows
//    natively — intercepting it would fight momentum scrolling.
//  • HORIZONTAL OVERFLOW ONLY. Vertical scrollers wheel fine; the
//    scrollWidth check skips them.
//  • Drag starts on the first real MOVE (4px), not on pointerdown, so a plain
//    click on a thumb stays a plain click with native focus behaviour. On the
//    first real move the row takes pointer capture, releasing any child
//    button's press state.
//  • After a real drag, the click the browser fires on release is swallowed
//    in the capture phase — dragging across a row of buy buttons must never
//    buy a boat. The flag also clears on the next pointerdown, because a
//    release outside the row produces no click at all.
//
// NATIVE DRAGSTART IS SUPPRESSED GLOBALLY, and it is load-bearing: the rails
// are walls of <img> cards, and a mouse press-and-move on an image starts the
// browser's own drag (a translucent ghost of the artwork) which CANCELS the
// pointer stream before the 4px threshold ever engages — on art-heavy rows
// the drag never worked without this. It also kills the drag ghost everywhere
// else (dial art, fish cards, links), which reads as game-app behaviour, the
// same stance as the global user-select: none. The game has no native
// drag-and-drop feature — every puzzle drags via pointer events — so nothing
// legitimate is lost. If one ever ships, opt it back in here by tag.

import { useEffect } from 'react'

export default function DragScrollRows() {
  useEffect(() => {
    let row: HTMLElement | null = null
    let pid = -1
    let startX = 0
    let startLeft = 0
    let moved = false
    let swallowClick = false

    const findRow = (t: EventTarget | null): HTMLElement | null => {
      let el: Element | null = t instanceof Element ? t : null
      while (el) {
        if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 4) {
          const ox = getComputedStyle(el).overflowX
          if (ox === 'auto' || ox === 'scroll') return el
        }
        el = el.parentElement
      }
      return null
    }

    const down = (e: PointerEvent) => {
      swallowClick = false
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      row = findRow(e.target)
      if (!row) return
      pid = e.pointerId
      startX = e.clientX
      startLeft = row.scrollLeft
      moved = false
    }
    const move = (e: PointerEvent) => {
      if (!row || e.pointerId !== pid) return
      const dx = e.clientX - startX
      if (!moved) {
        if (Math.abs(dx) < 4) return
        moved = true
        try { row.setPointerCapture(pid) } catch { /* row unmounted mid-drag */ }
      }
      row.scrollLeft = startLeft - dx
    }
    const up = (e: PointerEvent) => {
      if (!row || e.pointerId !== pid) return
      swallowClick = moved
      row = null
      pid = -1
    }
    const clickCapture = (e: MouseEvent) => {
      if (!swallowClick) return
      swallowClick = false
      e.preventDefault()
      e.stopPropagation()
    }
    const dragstart = (e: DragEvent) => e.preventDefault()

    document.addEventListener('pointerdown', down)
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
    document.addEventListener('click', clickCapture, { capture: true })
    document.addEventListener('dragstart', dragstart)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
      document.removeEventListener('click', clickCapture, { capture: true })
      document.removeEventListener('dragstart', dragstart)
    }
  }, [])

  return null
}
