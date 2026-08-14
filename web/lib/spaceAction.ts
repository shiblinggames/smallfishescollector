// DESKTOP KEYBOARD: Space presses the game's primary action button.
//
// The action row's render conditions are the single source of truth for what
// the player may do right now — FishingGame's slot alone has seven variants
// (bait, hold space, crate phase, golden trophy locks). A keydown handler that
// re-derived those conditions would drift the first time a button gained a
// guard, so Space instead PRESSES THE BUTTON THAT IS ACTUALLY RENDERED: the
// primary action carries `data-space-action`, and this handler dispatches a
// real bubbling pointerdown/pointerup pair at it — the exact events every
// action button already binds (they all use onPointerDown for tap-start
// latency; see the Reel In button's comment) — so the React handler, the
// framer-motion whileTap press, and the SFX all fire exactly as if tapped.
//
// OCCLUSION GUARD instead of state guards: if a drawer, modal or tour covers
// the button, elementFromPoint at the button's centre returns the overlay, and
// the key does nothing. One geometric check instead of threading N panel-open
// flags per screen through a dependency array — and it can't go stale when a
// new overlay ships.
//
// Space only, deliberately. Enter is the form-submit key and the browser's
// focused-button activator; giving it a second meaning invites double-fires.

/** True while the user is typing somewhere Space must keep its meaning. */
function typingInField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
}

/** Install the listener; returns the uninstaller (use as a useEffect body). */
export function installSpaceAction(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
    if (typingInField(e.target)) return

    const btn = document.querySelector<HTMLElement>('[data-space-action]')
    if (!btn) return

    // Visible and uncovered? A hidden button (display:none ancestor) has a
    // zero rect; a covered one loses the elementFromPoint test to the overlay.
    const r = btn.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    if (!hit || !(btn === hit || btn.contains(hit))) return

    // We own this keypress: stop the page-scroll default, and blur any
    // focused control so the browser's own Space-activates-focused-button
    // behaviour can't fire a second, different action on keyup.
    e.preventDefault()
    const focused = document.activeElement
    if (focused instanceof HTMLElement && focused !== document.body) focused.blur()

    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse' }))
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'mouse' }))
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
