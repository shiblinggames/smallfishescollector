'use client'

// Looping in-picker preview of each ultimate weapon, so a captain knows exactly
// what they're committing 750k + 24h to. It plays the REAL combat FX (imported
// from the raid engine's megaFx module) on a tiny broadside diorama — your gun
// lower-left, a target hull upper-right, same orientation as a real fight — so the
// preview IS the animation that fires in battle, not a lookalike.

import { useEffect, useMemo, useRef, useState } from 'react'
import { RailgunBeam, NukeMissile, NukeBlast, ImpactBurst, MegaSplats } from '@/app/(app)/raids/megaFx'
import type { ShipAugmentId } from '@/lib/shipAugments'

const STAGE_H = 132
// Time between replays. The FX themselves run ~0.7s (railgun) to ~2s (nuke);
// the rest is deliberate calm water between shots so the loop doesn't strobe.
const LOOP: Record<ShipAugmentId, number> = { railgun: 4500, barrage: 5000, nuke: 6200 }
const NUKE_FLIGHT = 850

// Positions as fractions of the stage. MUZZLE (where the shot launches) sits on
// the player's deck — up and forward of the hull's center — so the beam/missile
// doesn't appear to fire from under the boat. TARGET is the enemy hull + impact
// point, parked hard against the right edge (the tighter nuke blast box below
// keeps the fireball mostly in frame; a clipped shockwave at the border is fine).
const PLAYER = { x: 0.15, y: 0.60 }   // where the player hull is drawn
const MUZZLE = { x: 0.21, y: 0.52 }   // where the shot launches from (the deck)
const TARGET = { x: 0.87, y: 0.42 }   // enemy hull + impact point (far right)

interface Geo { x1: number; y1: number; x2: number; y2: number; len: number; angle: number }

/** A small stylised hull silhouette. `foe` flips it + tints it dark. */
function Hull({ foe, color }: { foe?: boolean; color: string }) {
  return (
    <svg width="48" height="32" viewBox="0 0 46 30" fill="none"
      style={{ transform: foe ? 'scaleX(-1)' : undefined, filter: foe ? 'none' : `drop-shadow(0 0 6px ${color}55)` }}>
      <path d="M4 18 H42 L37 27 H9 Z" fill={foe ? '#2a3240' : '#3b4655'} stroke={foe ? '#455266' : color} strokeWidth="1.2" />
      <path d="M23 18 V4" stroke={foe ? '#556277' : color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M23 5 Q33 9 31 16 L23 15 Z" fill={foe ? '#37414f' : `${color}44`} stroke={foe ? '#4a586c' : `${color}88`} strokeWidth="1" />
    </svg>
  )
}

export default function UltimatePreview({ id, color }: { id: ShipAugmentId; color: string }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [geo, setGeo] = useState<Geo | null>(null)
  const [shot, setShot] = useState(0)        // increments each loop, keys a fresh play
  const [blastKey, setBlastKey] = useState(0) // nuke detonation, fires after the missile lands
  const [hits, setHits] = useState<number[]>([]) // barrage's staggered impacts

  // Measure the stage so the beam / missile geometry connects the two real ship
  // positions (pixels). offsetWidth/offsetHeight (NOT getBoundingClientRect):
  // the layout size, immune to any in-flight entrance transform on an ancestor
  // (a rect taken mid-scale once put every landing point past the boat while
  // the percent-positioned hull stayed correct).
  const measureNow = () => {
    const el = stageRef.current
    if (!el) return
    const W = el.offsetWidth, H = el.offsetHeight
    if (!W || !H) return
    const x1 = W * MUZZLE.x, y1 = H * MUZZLE.y   // launch point (player deck)
    const x2 = W * TARGET.x, y2 = H * TARGET.y   // enemy hull
    const dx = x2 - x1, dy = y2 - y1
    setGeo(g => (g && Math.abs(g.x1 - x1) < 0.5 && Math.abs(g.y1 - y1) < 0.5 && Math.abs(g.x2 - x2) < 0.5 && Math.abs(g.y2 - y2) < 0.5)
      ? g
      : { x1, y1, x2, y2, len: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) * 180 / Math.PI })
  }
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    measureNow()
    const ro = new ResizeObserver(measureNow)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Loop driver — replay the shot every LOOP ms. Re-measure right before each
  // shot so the geometry always reflects the settled layout of the moment.
  useEffect(() => {
    const period = LOOP[id]
    let t: ReturnType<typeof setTimeout>
    const run = () => { measureNow(); setShot(s => s + 1); t = setTimeout(run, period) }
    t = setTimeout(run, 450)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Nuke — the detonation fires when the lobbed missile lands.
  useEffect(() => {
    if (id !== 'nuke' || shot === 0) return
    const t = setTimeout(() => setBlastKey(shot), NUKE_FLIGHT)
    return () => clearTimeout(t)
  }, [shot, id])

  // Barrage — four impacts land in a rapid stagger, same rhythm as combat.
  useEffect(() => {
    if (id !== 'barrage' || shot === 0) return
    const delays = [0, 110, 220, 330]
    const timers = delays.map((d, k) => setTimeout(() => setHits(h => [...h, shot * 10 + k]), d))
    timers.push(setTimeout(() => setHits([]), 1050))
    return () => timers.forEach(clearTimeout)
  }, [shot, id])

  // Barrage splat numbers — mirrors combat's split (total × [0.40,0.25,0.18,0.17],
  // first biggest). Illustrative values off a nominal shot so the four falling
  // numbers read the way they do in a real fight.
  const splatItems = useMemo(() => {
    const total = 840
    const fr = [0.40, 0.25, 0.18, 0.17]
    let used = 0
    return fr.map((f, k) => {
      const v = k === fr.length - 1 ? total - used : Math.round(total * f)
      used += v
      return { id: k, text: `-${v}`, size: 1.5 - k * 0.22, dx: (k - 1.5) * 18, dy: -k * 6, delay: k * 0.07 }
    })
  }, [])

  return (
    <div ref={stageRef} style={{
      position: 'relative', width: '100%', height: STAGE_H, borderRadius: 12, overflow: 'hidden',
      background: 'linear-gradient(180deg, #0a1420 0%, #0c1a2a 55%, #071019 100%)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* horizon shimmer */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: '58%', height: 1, background: `linear-gradient(90deg, transparent, ${color}33, transparent)` }} />
      {/* player gun (lower-left) + target hull (right-of-center) */}
      <div style={{ position: 'absolute', left: `${PLAYER.x * 100}%`, top: `${PLAYER.y * 100}%`, transform: 'translate(-50%,-50%)' }}><Hull color={color} /></div>
      <div style={{ position: 'absolute', left: `${TARGET.x * 100}%`, top: `${TARGET.y * 100}%`, transform: 'translate(-50%,-50%)' }}><Hull foe color={color} /></div>

      {/* Geometry-driven FX render straight into the stage (pixel coords). */}
      {geo && id === 'railgun' && shot > 0 && (
        <RailgunBeam key={shot} color={color} x1={geo.x1} y1={geo.y1} len={geo.len} angle={geo.angle} />
      )}
      {geo && id === 'nuke' && shot > 0 && (
        <NukeMissile key={shot} color={color} x1={geo.x1} y1={geo.y1} x2={geo.x2} y2={geo.y2} dur={NUKE_FLIGHT} />
      )}

      {/* Percent-based FX (blast, impacts, splats) live in a box centered on the
          target hull, matching how they sit over the enemy ship in combat. It's
          anchored by the SAME percent constants that place the hull (not the
          measured pixel geometry), so the landing always sits exactly on the
          boat. The nuke's fireball scales off the box, so its box is tighter
          to keep the blast in frame with the target parked at the right edge. */}
      <div style={{ position: 'absolute', left: `${TARGET.x * 100}%`, top: `${TARGET.y * 100}%`, width: id === 'nuke' ? 62 : 92, height: 70, marginLeft: id === 'nuke' ? -31 : -46, marginTop: -35, overflow: 'visible', pointerEvents: 'none' }}>
        {id === 'nuke' && blastKey > 0 && <NukeBlast key={blastKey} color={color} />}
        {id === 'barrage' && hits.map(k => <ImpactBurst key={k} kind="crit" />)}
        {id === 'barrage' && shot > 0 && <MegaSplats key={shot} color={color} items={splatItems} />}
      </div>
    </div>
  )
}
