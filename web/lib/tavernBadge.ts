'use client'

type Listener = (badge: number) => void
const listeners = new Set<Listener>()

export function onTavernBadge(fn: Listener) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export async function refreshTavernBadge() {
  try {
    const res = await fetch('/api/daily-status', { cache: 'no-store' })
    const { badge } = await res.json()
    listeners.forEach(fn => fn(badge ?? 0))
  } catch {}
}
