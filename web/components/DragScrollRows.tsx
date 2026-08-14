'use client'

// MOUSE DRAG-TO-SCROLL FOR EVERY HIDDEN-SCROLLBAR ROW. Mounted once in the
// root layout; renders nothing.
//
// The cosmetic rails (boats / hats / pets in the gear drawer, the profile
// showcase) hide their scrollbars for the mobile look, which strands them on
// desktop: the wheel scrolls vertically, there is no finger to swipe with,
// nothing is draggable, and the hidden scrollbar removes the one hint that
// more content exists off-edge. A Windows player cannot tell the boat row
// scrolls at all, let alone how.
//
// One DELEGATED handler instead of a wrapper component on purpose: the rows
// already share an identity — the .scrollbar-hide class — so keying off it
// covers every current and future row with zero markup changes, the same way
// the class itself already styles them all from one place. Walks up from the
// press target to the nearest .scrollbar-hide element that actually overflows
// horizontally and drags that.
//
// Rules:
//  • MOUSE ONLY (pointerType check). Touch already scrolls these rows
//    natively — intercepting it would fight momentum scrolling.
//  • HORIZONTAL OVERFLOW ONLY. The vertical .scrollbar-hide drawers (crew
//    pickers, gear list) scroll fine with the wheel; they are skipped by the
//    scrollWidth check.
//  • Drag starts on the first real MOVE (4px), not on pointerdown, so a plain
//    click on a thumb stays a plain click with native focus behaviour. On the
//    first real move the row takes pointer capture, releasing any child
//    button's press state.
//  • After a real drag, the click the browser fires on release is swallowed
//    in the capture phase — dragging across a row of buy buttons must never
//    buy a boat. The flag also clears on the next pointerdown, because a
//    release outside the row produces no click at all.

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
        if (el instanceof HTMLElement && el.classList.contains('scrollbar-hide')
          && el.scrollWidth > el.clientWidth + 4) return el
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

    document.addEventListener('pointerdown', down)
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
    document.addEventListener('click', clickCapture, { capture: true })
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
      document.removeEventListener('click', clickCapture, { capture: true })
    }
  }, [])

  return null
}
