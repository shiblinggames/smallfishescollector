'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * ── LIFT A CARD OVER THE PANEL'S EDGE ──────────────────────────────────────
 *
 * Kong: when you reroll, the card grows as it lands and the modal cuts it off.
 * It should surface over the edge and take precedence in that moment.
 *
 * The board lives inside the Crew Hall's scroll box, and a scroll box clips
 * everything in it; no z-index gets a child out. So while `active`, the card
 * is drawn in a layer on <body> instead, pinned every frame to the spot its
 * placeholder holds on the board. The placeholder keeps the card's size, so
 * the grid never moves.
 *
 * NOT FREE TO ROAM. The layer is clipped to the scroll box grown by `spill`
 * pixels, so a pop can break over the rim but a card scrolled far out of
 * view (the bottom of a phone's single column) does not float over the rest
 * of the screen.
 *
 * Only switch it on across a span where the card remounts anyway (the reveal
 * swaps the swipe card for the reveal card): moving between the board and the
 * layer is a remount, which restarts any animation in the card.
 */
export function LiftOver({ active, spill = 56, z = 9000, children }: {
  active: boolean; spill?: number; z?: number; children: ReactNode
}) {
  const holdRef = useRef<HTMLDivElement>(null)
  const clipRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!active) { setHeight(null); return }
    const hold = holdRef.current
    if (!hold) return
    // The nearest ancestor that scrolls is the thing doing the clipping.
    let box: HTMLElement | null = hold.parentElement
    while (box && box !== document.body) {
      const oy = getComputedStyle(box).overflowY
      if (oy === 'auto' || oy === 'scroll' || oy === 'hidden') break
      box = box.parentElement
    }
    if (box === document.body) box = null
    let raf = 0
    const tick = () => {
      const r = hold.getBoundingClientRect()
      const card = cardRef.current, clip = clipRef.current
      if (card) {
        card.style.left = r.left + 'px'
        card.style.top = r.top + 'px'
        card.style.width = r.width + 'px'
      }
      if (clip) {
        if (box) {
          const b = box.getBoundingClientRect()
          const t = Math.max(0, b.top - spill), l = Math.max(0, b.left - spill)
          const bt = Math.max(0, innerHeight - b.bottom - spill), rt = Math.max(0, innerWidth - b.right - spill)
          clip.style.clipPath = `inset(${t}px ${rt}px ${bt}px ${l}px)`
        } else clip.style.clipPath = 'none'
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [active, spill])

  // Hold the card's height on the board while it is drawn elsewhere.
  useLayoutEffect(() => {
    if (!active || !cardRef.current) return
    const ro = new ResizeObserver(() => { if (cardRef.current) setHeight(cardRef.current.offsetHeight) })
    ro.observe(cardRef.current)
    setHeight(cardRef.current.offsetHeight)
    return () => ro.disconnect()
  }, [active])

  if (!active || typeof document === 'undefined') return <>{children}</>

  return (
    <>
      <div ref={holdRef} aria-hidden style={{ height: height ?? undefined, minHeight: height == null ? 240 : undefined }} />
      {createPortal(
        <div ref={clipRef} style={{ position: 'fixed', inset: 0, zIndex: z, pointerEvents: 'none' }}>
          <div ref={cardRef}
            // The card is outside the scroll box now, so a wheel over it would
            // scroll nothing. Hand it back.
            onWheel={e => { let b: HTMLElement | null = holdRef.current?.parentElement ?? null; while (b && b.scrollHeight <= b.clientHeight) b = b.parentElement; b?.scrollBy({ top: e.deltaY }) }}
            style={{ position: 'fixed', pointerEvents: 'auto' }}>
            {children}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
