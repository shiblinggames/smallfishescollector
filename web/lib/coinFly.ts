// Coin-burst → Nav purse flight, as a shared imperative helper.
//
// The pattern was born in AchievementsClient (React-state coins + portal); this
// is the portable version: plain DOM nodes + WAAPI animations appended to
// <body>, so ANY client surface can celebrate a doubloon payout in one call —
// no portal, no state, no re-renders. Visuals match the Achievements coins.
//
// flyCoinsToPurse(from, amount, onLand?):
//   - spawns a small staggered burst of gold coins at `from` (viewport coords)
//   - arcs them into the visible Nav doubloon pill ([data-doubloon-pill])
//   - pops the pill + fires `onLand` as they arrive (fire the purse-tick event
//     there so the count rolls up in sync with the landing)
//   - if no pill is visible, fires onLand immediately (no silent drop)

import { hapticReward } from './haptics'

function navPillTarget(): { x: number; y: number } | null {
  if (typeof document === 'undefined') return null
  const pills = Array.from(document.querySelectorAll('[data-doubloon-pill]')) as HTMLElement[]
  const vis = pills.find(p => { const r = p.getBoundingClientRect(); return r.width > 0 && r.top >= -10 && r.top < window.innerHeight })
  if (!vis) return null
  const r = vis.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

function popNavPill(): void {
  (Array.from(document.querySelectorAll('[data-doubloon-pill]')) as HTMLElement[])
    .forEach(p => p.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.16)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'ease-out' }))
}

export function flyCoinsToPurse(from: { x: number; y: number }, amount: number, onLand?: () => void): void {
  const to = navPillTarget()
  if (!to || typeof document === 'undefined') { onLand?.(); return }
  const n = Math.min(16, Math.max(6, Math.round(amount / 1200) + 5))
  hapticReward()
  const overlay = document.createElement('div')
  overlay.setAttribute('aria-hidden', 'true')
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9500;pointer-events:none;'
  document.body.appendChild(overlay)

  const DUR = 620
  const STAGGER = 45
  for (let i = 0; i < n; i++) {
    const coin = document.createElement('div')
    coin.style.cssText = [
      'position:absolute;width:15px;height:15px;margin-left:-7.5px;margin-top:-7.5px;border-radius:50%;opacity:0;',
      'background:radial-gradient(circle at 35% 30%, #ffe79a, #e6b948 65%, #c4922f);',
      'border:1px solid #b9892e;box-shadow:0 0 8px rgba(240,192,64,0.6);',
      `left:${from.x}px;top:${from.y}px;`,
    ].join('')
    overlay.appendChild(coin)
    const toX = to.x + (Math.random() * 18 - 9)
    const toY = to.y + (Math.random() * 8 - 4)
    const midX = (from.x + toX) / 2
    const arcY = Math.min(from.y, toY) - 46
    coin.animate([
      { left: `${from.x}px`, top: `${from.y}px`, opacity: 0, transform: 'scale(0.4)' },
      { left: `${midX}px`, top: `${arcY}px`, opacity: 1, transform: 'scale(1)' },
      { left: `${toX}px`, top: `${toY}px`, opacity: 0, transform: 'scale(0.5)' },
    ], { duration: DUR, delay: i * STAGGER, easing: 'ease-in-out', fill: 'forwards' })
  }

  const flightMs = 560 + n * STAGGER
  setTimeout(() => { onLand?.(); popNavPill() }, Math.max(280, flightMs - 220))
  setTimeout(() => overlay.remove(), flightMs + DUR)
}
