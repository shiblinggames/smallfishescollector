// Hard body-scroll lock for iOS combat screens.
//
// `overflow: hidden` on <body> is NOT a real scroll lock on iOS: a touch drag
// that chains out of an inner scroller (or a rubber-band pan) can still move
// the document. When that happens in an installed PWA mid-combat, the
// composited fixed Nav visually rides away with the scroll while hit-testing
// stays at layout coordinates — the header "disappears" and buttons (the aim
// bar's Lock, most painfully) only respond BELOW where they're drawn.
//
// `position: fixed` on the body makes document scrolling impossible outright.
// We pin to the top (combat screens are top-anchored and reset their scroll on
// entry) rather than the usual -scrollY dance. Returns the undo function.
export function lockBodyScroll(): () => void {
  const b = document.body.style
  const prev = {
    position: b.position, top: b.top, left: b.left, right: b.right,
    width: b.width, overflow: b.overflow,
  }
  window.scrollTo(0, 0)
  b.position = 'fixed'
  b.top = '0'
  b.left = '0'
  b.right = '0'
  b.width = '100%'
  b.overflow = 'hidden'
  return () => {
    b.position = prev.position
    b.top = prev.top
    b.left = prev.left
    b.right = prev.right
    b.width = prev.width
    b.overflow = prev.overflow
  }
}
