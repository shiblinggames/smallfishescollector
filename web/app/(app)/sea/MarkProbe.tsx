'use client'

/**
 * ── WHY IS THERE NO SHIP THERE ──────────────────────────────────────────────
 *
 * A readout for one question and no others: a captain is standing in a bay and
 * the hulls are not on the water. Everything that question could turn on has
 * now been checked from the outside and come back clean — the encounters
 * resolve, the art is served, the statuses say cleared, the bay claims its own
 * water — so what is left is what happens in the browser, and that is the one
 * place I cannot look.
 *
 * So it asks the page directly, in this order, because each answer makes the
 * next one meaningful:
 *
 *   1. WHICH BAY the chart thinks you are in. If this is not the bay you are
 *      looking at, nothing below it matters and the cull is the bug.
 *   2. WHETHER THE MARK IS MOUNTED. Found by looking for the actual <img> in
 *      the document rather than by re-deriving it, so this cannot agree with a
 *      broken renderer out of politeness.
 *   3. WHERE IT IS ON THE SCREEN, from its own bounding box. A hull that is
 *      mounted and sitting at x=14000 is a camera bug and not a missing ship.
 *   4. WHETHER THE FILE LOADED, from naturalWidth on the element the page is
 *      really using, plus an independent fetch of the same URL.
 *
 * Off unless asked for: add ?probe=1 to the sea's URL. It is deliberately not
 * a dev-only build flag, because the machine this needs to run on is a phone
 * in somebody else's hand.
 */

import { useEffect, useState } from 'react'
import { ENCOUNTERS, BEATS, CACHES, hullFor, encounterAt } from './raidWaters'

type Row = {
  node: string
  hull: string | null
  /** Is there an <img> for this hull in the document at all? */
  mounted: boolean
  /** Did the element the page is actually using decode a picture? */
  decoded: boolean
  /** Where its box lands, in screen px. */
  box: string
  /** An independent load of the same URL, so a mounted-but-blank image can be
   *  told apart from a URL the browser will not fetch. */
  fetched: 'ok' | 'failed' | '...'
  /** How far the player is from it, in world px. */
  away: number
}

export default function MarkProbe({ bay, pos }: {
  bay: string | null
  pos: React.RefObject<{ x: number; y: number }>
}) {
  const [on, setOn] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [counts, setCounts] = useState('')
  const [fetches, setFetches] = useState<Record<string, 'ok' | 'failed'>>({})

  useEffect(() => {
    setOn(new URLSearchParams(window.location.search).has('probe'))
  }, [])

  // Load every hull in this bay independently of the chart. This is the only
  // check here that does not depend on the renderer being right.
  useEffect(() => {
    if (!on) return
    for (const e of ENCOUNTERS) {
      if (e.bay !== bay) continue
      const src = hullFor(e)
      if (!src || fetches[src]) continue
      const img = new Image()
      img.onload = () => setFetches(f => ({ ...f, [src]: 'ok' }))
      img.onerror = () => setFetches(f => ({ ...f, [src]: 'failed' }))
      img.src = src
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, bay])

  useEffect(() => {
    if (!on) return
    const tick = () => {
      const p = pos.current ?? { x: 0, y: 0 }
      const next: Row[] = []
      for (const e of ENCOUNTERS) {
        if (e.bay !== bay) continue
        const hull = hullFor(e)
        const at = encounterAt(e)
        // THE ELEMENT THE PAGE IS REALLY USING. Attribute selector on the src,
        // because that is the one thing the mark and this probe agree on
        // without sharing any code.
        const el = hull
          ? document.querySelector<HTMLImageElement>(`img[src="${CSS.escape(hull)}"]`)
          : null
        const r = el?.getBoundingClientRect()
        next.push({
          node: e.node,
          hull,
          mounted: !!el,
          decoded: !!el && el.naturalWidth > 0,
          box: r ? `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}` : '-',
          fetched: hull ? (fetches[hull] ?? '...') : 'failed',
          away: at ? Math.round(Math.hypot(at.x - p.x, at.y - p.y)) : -1,
        })
      }
      setRows(next)
      setCounts(
        `${ENCOUNTERS.filter(x => x.bay === bay).length} ships, `
        + `${BEATS.filter(x => x.bay === bay).length} beats, `
        + `${CACHES.filter(x => x.bay === bay).length} caches`,
      )
    }
    tick()
    const id = window.setInterval(tick, 600)
    return () => window.clearInterval(id)
  }, [on, bay, pos, fetches])

  if (!on) return null

  return (
    <div style={{
      position: 'fixed', left: 6, bottom: 6, zIndex: 99999,
      maxWidth: 'calc(100vw - 12px)', maxHeight: '46vh', overflow: 'auto',
      background: 'rgba(6,12,18,0.92)', border: '1px solid rgba(190,214,232,0.35)',
      borderRadius: 6, padding: '7px 9px', pointerEvents: 'none',
      font: '11px/1.45 ui-monospace, Menlo, Consolas, monospace',
      color: '#dbe7f0', whiteSpace: 'pre-wrap',
    }}>
      <div style={{ color: '#f0c040', fontWeight: 700 }}>MARK PROBE</div>
      <div>bay drawn: {bay ?? 'NONE (nothing will be drawn)'}</div>
      <div>in that bay: {counts}</div>
      {rows.length === 0 && <div style={{ color: '#e28a78' }}>no ships listed for this bay</div>}
      {rows.map(r => (
        <div key={r.node} style={{ marginTop: 4 }}>
          <span style={{ color: '#f0c040' }}>{r.node}</span> {r.away}px away
          {'\n'}art {r.hull ?? 'NONE ASSIGNED'}
          {'\n'}mounted {r.mounted ? 'yes' : 'NO'} · decoded {r.decoded ? 'yes' : 'NO'}
          {' '}· fetch {r.fetched}
          {'\n'}on screen {r.box}
        </div>
      ))}
    </div>
  )
}
