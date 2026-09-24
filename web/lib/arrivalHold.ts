// ── ONE BLACK FROM THE WELCOME TO THE SEA ──────────────────────────────────
//
// Kong: the step from making a captain to the first sight of the sea did not
// feel smooth, and a loading screen appeared on some runs and not on others.
//
// The welcome ended with a FULL page load of /sea. A full load streams the
// route, and the route has a loading screen (a different dark, with "Casting
// off" on it) that shows only when the server is slow to answer: hence
// sometimes and not others. Then the chart put up its own black curtain and
// lifted it. Three blacks, and one of them was a lottery.
//
// Now the welcome refreshes the route IN PLACE (router.refresh), which never
// shows the loading screen, and holds this curtain over everything while it
// does. It is a plain DOM node on <body>, not React, so it survives the
// layout dropping the welcome modal underneath it. The chart releases it on
// mount: its own curtain is the same colour and already up, so the hand-over
// cannot be seen, and the chart lifts its curtain when its sprites are warm,
// exactly as before.
//
// If the refresh never lands (a network fault), the old full load is the
// fallback, after a few seconds, rather than a black screen for ever.

const ID = 'arrival-hold'
/** The chart's own curtain colour (SeaMap). They must match. */
const BLACK = '#04090f'
let fallback: number | null = null

export function holdCurtain(fadeMs = 360): void {
  if (typeof document === 'undefined' || document.getElementById(ID)) return
  const el = document.createElement('div')
  el.id = ID
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText = `position:fixed;inset:0;z-index:2000;background:${BLACK};opacity:0;pointer-events:none;transition:opacity ${fadeMs}ms ease-out`
  document.body.appendChild(el)
  requestAnimationFrame(() => { el.style.opacity = '1' })
  fallback = window.setTimeout(() => { window.location.assign('/sea') }, 12000)
}

/** Called by the chart when it has mounted with its own curtain up. */
export function releaseCurtain(): void {
  if (typeof document === 'undefined') return
  if (fallback != null) { window.clearTimeout(fallback); fallback = null }
  document.getElementById(ID)?.remove()
}
