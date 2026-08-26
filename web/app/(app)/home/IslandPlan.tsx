'use client'

// THE ISLAND, AND MOVING THINGS ABOUT ON IT.
//
// This preview used to be a green radial gradient with the buildings floating
// on it. That was fine while the positions were fixed and the picture was only
// ever "here is roughly what you own". It stops being fine the moment a captain
// can drag: you cannot aim at land you cannot see, and the actual coast is a
// ragged 160-point outline with headlands and bays, nothing like an ellipse.
//
// So the island is drawn the way the chart draws it — the same `coastClip` from
// lib/islandShape, on the same nested boxes — and the SCRUB, which is the part
// you may build on, is the ring that gets the rim. What you drag onto here is
// what your building stands on out on the water.
//
// THE SERVER STILL DECIDES. `moveBuilding` re-checks every drop against the
// same geometry; this is the part that makes the rule visible, not the part
// that enforces it.

import { useCallback, useRef, useState } from 'react'
import { coastClip, coastline, standsOnLand, BUILDABLE, GRASS } from '@/lib/islandShape'
import { HOTSPOTS, homeBuildings, type Homestead, type HotspotId } from '@/lib/homestead'
import { vibrate } from '@/lib/haptics'

/** The widest thing that can ever stand on each spot. A position is judged
 *  against THIS, not against whatever is there today — otherwise a lean-to
 *  parked on a headland becomes an Estate standing in the sea. */
const WIDEST: Record<string, number> = Object.fromEntries(
  HOTSPOTS.map(s => [s.id, Math.max(...s.builds.map(b => b.scale))]),
)

const RS = coastline('home')
const CLIP = coastClip('home')

export default function IslandPlan({
  home, guest, arranging, onMove,
}: {
  home: Homestead
  guest: boolean
  arranging: boolean
  /** Returns false if the server refused, so the building snaps back. */
  onMove: (id: HotspotId, x: number, y: number) => Promise<boolean>
}) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  /** The spot being dragged and where it is right now, in box percent. */
  const [drag, setDrag] = useState<{ id: HotspotId; x: number; y: number; ok: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  const standing = homeBuildings(home)
  /** homeBuildings drops unbuilt spots, so line the ids back up with it. */
  const ids = HOTSPOTS
    .map(s => ({ s, b: s.builds[Math.max(0, Math.min(s.builds.length - 1, home.spots[s.id] ?? 0))] }))
    .filter(({ b }) => b.art !== null)
    .sort((a, b) =>
      ((home.layout?.[a.s.id]?.y ?? a.s.y) - (home.layout?.[b.s.id]?.y ?? b.s.y)))
    .map(({ s }) => s.id)

  const at = useCallback((e: { clientX: number; clientY: number }) => {
    const r = boxRef.current?.getBoundingClientRect()
    if (!r || r.width < 2) return null
    return {
      x: ((e.clientX - r.left) / r.width) * 100,
      // The pointer grabs the building's BASE, which is where it is anchored
      // (translate(-50%,-100%)) and the only part that has to be on the land.
      y: ((e.clientY - r.top) / r.height) * 100,
    }
  }, [])

  return (
    <div
      ref={boxRef}
      style={{
        position: 'relative', marginTop: 14,
        width: 'min(100%, 340px)', aspectRatio: '1 / 1', marginInline: 'auto',
        touchAction: arranging ? 'none' : undefined,
      }}
      onPointerMove={e => {
        if (!drag) return
        const p = at(e)
        if (!p) return
        setDrag({ ...drag, x: p.x, y: p.y, ok: standsOnLand(RS, p.x, p.y, WIDEST[drag.id]) })
      }}
      onPointerUp={async e => {
        if (!drag) return
        const d = drag
        setDrag(null)
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* fine */ }
        if (!d.ok) { vibrate(20); return }
        setSaving(true)
        vibrate(10)
        await onMove(d.id, Math.round(d.x), Math.round(d.y))
        setSaving(false)
      }}
      onPointerCancel={() => setDrag(null)}
    >
      {/* ── THE SEA UNDER IT ──────────────────────────────────────── */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, borderRadius: 16,
        background: 'radial-gradient(ellipse at 50% 55%, #17384a 0%, #102b3a 60%, #0b1e2a 100%)',
        border: '1px solid rgba(180,214,232,0.16)',
      }} />

      {/* ── THE LAND ──────────────────────────────────────────────────
          The same three boxes the chart uses, so the shape here and the shape
          out on the water are the same shape: the coast, the top face inset
          13%, and the grass inset 15% of THAT. Those two insets compound, which
          is the whole reason lib/islandShape exists. */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, clipPath: CLIP,
        background: 'linear-gradient(165deg, #cbb590 0%, #b89c72 100%)',
      }} />
      <div aria-hidden style={{
        position: 'absolute', inset: '13%', clipPath: CLIP,
        background: 'linear-gradient(165deg, #d8c49f 0%, #c2a97e 100%)',
      }} />
      {/* THE SCRUB, which is where you may build. Outlined while arranging,
          because the rule is "on the land" and this band IS the rule — if the
          rim marked the green instead, every legal drop onto scrub would look
          like a mistake the game had let through. */}
      <div aria-hidden style={{
        position: 'absolute', inset: `${(1 - BUILDABLE) * 50}%`, clipPath: CLIP,
        background: 'linear-gradient(165deg, #9aa269 0%, #7d8850 100%)',
        outline: arranging ? '1px dashed rgba(226,244,200,0.6)' : 'none',
        outlineOffset: -1,
      }} />
      <div aria-hidden style={{
        position: 'absolute', inset: `${(1 - GRASS) * 50}%`, clipPath: CLIP,
        background: 'linear-gradient(165deg, #6f8a4e 0%, #55703c 62%, #466032 100%)',
      }} />

      {/* ── WHAT IS BUILT ───────────────────────────────────────────── */}
      {standing.map((b, i) => {
        const id = ids[i]
        const held = drag?.id === id
        const x = held ? drag.x : b.x
        const y = held ? drag.y : b.y
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={id}
            src={b.art}
            alt=""
            draggable={false}
            onPointerDown={e => {
              if (!arranging || guest || saving) return
              e.preventDefault()
              e.stopPropagation()
              try { (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId) } catch { /* fine */ }
              const p = at(e)
              if (!p) return
              vibrate(8)
              setDrag({ id, x: p.x, y: p.y, ok: standsOnLand(RS, p.x, p.y, WIDEST[id]) })
            }}
            style={{
              position: 'absolute', left: `${x}%`, top: `${y}%`,
              width: `${b.scale * 100}%`, maxWidth: 'none',
              transform: 'translate(-50%, -100%)',
              cursor: arranging && !guest ? (held ? 'grabbing' : 'grab') : 'default',
              touchAction: arranging ? 'none' : undefined,
              // RED WHILE IT WOULD NOT STAND. Saying no on drop and springing
              // back is a worse lesson than saying no the whole way, because by
              // then the captain has already decided where it goes.
              filter: held
                ? (drag.ok
                    ? 'drop-shadow(0 6px 14px rgba(0,0,0,0.6)) brightness(1.08)'
                    : 'drop-shadow(0 6px 14px rgba(0,0,0,0.6)) sepia(1) saturate(6) hue-rotate(-30deg)')
                : 'drop-shadow(0 4px 10px rgba(0,0,0,0.45))',
              opacity: saving && held ? 0.6 : 1,
              transition: held ? 'none' : 'left 160ms ease-out, top 160ms ease-out',
            }}
          />
        )
      })}

      {arranging && !guest && (
        <p className="font-karla" style={{
          position: 'absolute', left: 0, right: 0, bottom: 8, textAlign: 'center',
          fontSize: '0.72rem', color: 'rgba(226,244,200,0.85)', margin: 0,
          textShadow: '0 1px 8px rgba(0,0,0,0.9)', pointerEvents: 'none',
        }}>
          {drag ? (drag.ok ? 'Let go to leave it there' : 'Not on the grass') : 'Drag a building to move it'}
        </p>
      )}

      {!arranging && standing.length <= 2 && (
        <p className="font-karla" style={{
          position: 'absolute', left: 0, right: 0, bottom: 8, textAlign: 'center',
          fontSize: '0.74rem', color: 'rgba(226,238,246,0.7)', margin: 0,
          textShadow: '0 1px 8px rgba(0,0,0,0.9)', pointerEvents: 'none',
        }}>{guest ? 'Not much on it yet.' : 'Six places to build on. Most of them are still rock.'}</p>
      )}
    </div>
  )
}
