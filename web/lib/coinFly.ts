// Coin-burst → Nav purse flight, as a shared imperative helper.
//
// The pattern was born in AchievementsClient (React-state coins + portal); this
// is the portable version: plain DOM nodes + WAAPI animations appended to
// <body>, so ANY client surface can celebrate a payout in one call —
// no portal, no state, no re-renders. Visuals match the Achievements coins.
//
// flyCoinsToPurse(from, amount, onLand?):
//   - spawns a small staggered burst of gold coins at `from` (viewport coords)
//   - arcs them into the visible Nav doubloon pill ([data-doubloon-pill])
//   - pops the pill + fires `onLand` as they arrive (fire the purse-tick event
//     there so the count rolls up in sync with the landing)
//   - if no pill is visible, fires onLand immediately (no silent drop)
//
// ── AND GEMS, THE SAME WAY (2026-09-23) ────────────────────────────────────
//
// Kong: every claim should pay out the same way, gems included. A doubloon
// claim flew coins to the purse; a gem claim just changed a number, so the
// rarer currency felt like the cheaper one. flyGemsToPurse is the same flight
// with violet diamonds into [data-gem-pill]. `flyPayout` does both from one
// place (a claim that pays both sends both, gems a beat behind) and takes the
// pressed element or its rect, which is what every claim handler has to hand.

import { hapticReward } from './haptics'

type Kind = 'doubloons' | 'gems'
const PILL: Record<Kind, string> = { doubloons: '[data-doubloon-pill]', gems: '[data-gem-pill]' }

function pillTarget(kind: Kind): { x: number; y: number } | null {
  if (typeof document === 'undefined') return null
  const pills = Array.from(document.querySelectorAll(PILL[kind])) as HTMLElement[]
  const vis = pills.find(p => { const r = p.getBoundingClientRect(); return r.width > 0 && r.top >= -10 && r.top < window.innerHeight })
  if (!vis) return null
  const r = vis.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

function popPill(kind: Kind): void {
  (Array.from(document.querySelectorAll(PILL[kind])) as HTMLElement[])
    .forEach(p => p.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.16)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'ease-out' }))
}

const COIN_CSS = [
  'width:15px;height:15px;margin-left:-7.5px;margin-top:-7.5px;border-radius:50%;',
  'background:radial-gradient(circle at 35% 30%, #ffe79a, #e6b948 65%, #c4922f);',
  'border:1px solid #b9892e;box-shadow:0 0 8px rgba(240,192,64,0.6);',
].join('')
// A cut stone, not a coin: a small square turned on its point, violet, lit
// from the top left like the coins are.
const GEM_CSS = [
  'width:12px;height:12px;margin-left:-6px;margin-top:-6px;border-radius:2px;',
  'background:linear-gradient(135deg, #f1e4ff 0%, #c9a0f5 38%, #8b5cf6 100%);',
  'border:1px solid #7c4ddb;box-shadow:0 0 9px rgba(167,139,250,0.75);',
].join('')

function fly(kind: Kind, from: { x: number; y: number }, amount: number, onLand?: () => void): void {
  const to = pillTarget(kind)
  if (!to || typeof document === 'undefined') { onLand?.(); return }
  const n = kind === 'gems'
    ? Math.min(14, Math.max(5, Math.round(amount / 10) + 4))
    : Math.min(16, Math.max(6, Math.round(amount / 1200) + 5))
  hapticReward()
  const overlay = document.createElement('div')
  overlay.setAttribute('aria-hidden', 'true')
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9500;pointer-events:none;'
  document.body.appendChild(overlay)

  const DUR = 620
  const STAGGER = 45
  const base = kind === 'gems' ? 'rotate(45deg) ' : ''
  for (let i = 0; i < n; i++) {
    const bit = document.createElement('div')
    bit.style.cssText = `position:absolute;opacity:0;${kind === 'gems' ? GEM_CSS : COIN_CSS}left:${from.x}px;top:${from.y}px;`
    overlay.appendChild(bit)
    const toX = to.x + (Math.random() * 18 - 9)
    const toY = to.y + (Math.random() * 8 - 4)
    const midX = (from.x + toX) / 2
    const arcY = Math.min(from.y, toY) - 46
    bit.animate([
      { left: `${from.x}px`, top: `${from.y}px`, opacity: 0, transform: `${base}scale(0.4)` },
      { left: `${midX}px`, top: `${arcY}px`, opacity: 1, transform: `${base}scale(1)` },
      { left: `${toX}px`, top: `${toY}px`, opacity: 0, transform: `${base}scale(0.5)` },
    ], { duration: DUR, delay: i * STAGGER, easing: 'ease-in-out', fill: 'forwards' })
  }

  const flightMs = 560 + n * STAGGER
  setTimeout(() => { onLand?.(); popPill(kind) }, Math.max(280, flightMs - 220))
  setTimeout(() => overlay.remove(), flightMs + DUR)
}

export function flyCoinsToPurse(from: { x: number; y: number }, amount: number, onLand?: () => void): void {
  fly('doubloons', from, amount, onLand)
}

export function flyGemsToPurse(from: { x: number; y: number }, amount: number, onLand?: () => void): void {
  fly('gems', from, amount, onLand)
}

type Origin = Element | DOMRect | { x: number; y: number } | null | undefined

/** The centre of whatever the claim was pressed on. Null origin (a claim with
 *  no button in hand) starts from the middle of the screen, never nowhere. */
function centreOf(o: Origin): { x: number; y: number } {
  // The element is read when the payout lands, after the server answered. A
  // button the claim already swapped for a tick is detached by then and would
  // measure as 0,0, flinging the coins from the top-left corner.
  if (o && 'getBoundingClientRect' in o) o = o.isConnected ? o.getBoundingClientRect() : null
  if (o && 'width' in o) return { x: o.left + o.width / 2, y: o.top + o.height / 2 }
  if (o && 'x' in o) return o
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
}

/** THE ONE CALL A CLAIM MAKES. Doubloons fly to the gold pill, gems to the
 *  violet one, a claim paying both sends both with the gems a beat behind.
 *  Zero or missing amounts are skipped. */
export function flyPayout(from: Origin, pay: { doubloons?: number | null; gems?: number | null }): void {
  if (typeof window === 'undefined') return
  const at = centreOf(from)
  const d = Math.max(0, Math.round(pay.doubloons ?? 0))
  const g = Math.max(0, Math.round(pay.gems ?? 0))
  if (d > 0) fly('doubloons', at, d)
  if (g > 0) {
    if (d > 0) setTimeout(() => fly('gems', at, g), 180)
    else fly('gems', at, g)
  }
}
