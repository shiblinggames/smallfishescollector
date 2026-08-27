'use client'

// DRAG THE CUTWATER, WATCH THE WAKE, COPY THE TABLE.
//
// The wake has to be MOVING to be judged. A static dot on a hull tells you
// nothing about whether the V opens from the stem or from somewhere behind it,
// which is the entire question — so this runs the real thing: the same mark
// buffer, the same spread easing, the same fade, the same constants, with the
// boat held still and the water going past it.
//
// Anything imported from the sea map would drag the whole chart in with it, so
// the handful of numbers below are duplicated. They are commented as such in
// both places; if one moves, move the other.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { SHIPS, getShip } from '@/lib/ships'
import FisherPose from '@/components/FisherPose'

// ── KEPT IN STEP WITH SeaMap BY HAND ──────────────────────────────────────
// Importing them would pull a 7,000-line client component into an admin page.
const GROUND = 0.58
const WAKE_EVERY = 95
const WAKE_LIFE = 1900
const WAKE_PAIRS = 22
const WAKE_MARKS = WAKE_PAIRS * 2
const WAKE_SPREAD = 62
const SKIPPER_W = 210
const WARSHIP_W = 340
const FISHING_HULL_W = 210 * 0.55

/** Every boat the sea draws, in one list, because the fishing boat needs its
 *  cutwater placed too and it is the one that is not in SHIPS. */
type Boat = { id: string; label: string; box: number; scale: number; art: string | null }
const BOATS: Boat[] = [
  { id: 'fishing', label: 'Fishing boat', box: SKIPPER_W, scale: 1, art: null },
  ...SHIPS.map(s => ({
    id: String(s.tier),
    label: s.name,
    box: WARSHIP_W,
    scale: (WARSHIP_W * (s.seaBeam ?? 0.6)) / FISHING_HULL_W,
    art: s.seaImageUrl ?? null,
  })),
]

const DEFAULTS: Record<string, { x: number; y: number }> = {
  fishing: { x: 0.719, y: 0.662 },
  ...Object.fromEntries(SHIPS.map(s => [String(s.tier), { ...(s.seaBow ?? { x: 0.8, y: 0.75 }) }])),
}

const round = (n: number) => Math.round(n * 1000) / 1000
const clamp = (n: number) => Math.max(0, Math.min(1, n))

export default function WakeBench({ characterColor, equippedBoat, equippedHat }: {
  characterColor: string
  equippedBoat: string | null
  equippedHat: string | null
}) {
  const [bows, setBows] = useState<Record<string, { x: number; y: number }>>(DEFAULTS)
  const [pick, setPick] = useState('6')
  const [speed, setSpeed] = useState(0.85)
  const [running, setRunning] = useState(true)
  const [copied, setCopied] = useState(false)

  const boat = BOATS.find(b => b.id === pick) ?? BOATS[0]
  const bow = bows[pick] ?? { x: 0.8, y: 0.75 }

  const stage = useRef<HTMLDivElement | null>(null)
  const marks = useRef<HTMLDivElement[]>([])
  const held = useRef(false)

  // Live values for the loop, so dragging retunes the wake without restarting
  // it and without the loop depending on React state.
  const live = useRef({ bow, scale: boat.scale, box: boat.box, speed, running })
  live.current = { bow, scale: boat.scale, box: boat.box, speed, running }

  /**
   * THE SAME LOOP THE SEA RUNS, with the boat standing still.
   *
   * On the chart the marks are laid at the bow in world coordinates and the
   * camera follows the hull, so the water appears to stream past. Here there is
   * no camera, so the marks are laid at the bow and then MOVE aft themselves at
   * the speed the boat would have been making. Identical picture, and it means
   * the origin is the only thing being judged.
   */
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    let next = 0
    const at = Array.from({ length: WAKE_MARKS }, () => ({
      x: 0, y: 0, born: -9999, side: 1 as 1 | -1, scale: 1,
    }))

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(64, now - last)
      last = now
      const L = live.current
      // SPEED IS IN SPRITE WIDTHS PER SECOND, so the drift reads the same on a
      // Sloop and a Man-o-War instead of the big hull looking becalmed.
      const px = L.speed * L.box * (dt / 1000)

      for (const m of at) if (m.born > -9999) m.x -= px

      if (L.running) {
        acc += dt
        while (acc > WAKE_EVERY) {
          acc -= WAKE_EVERY
          const ox = (L.bow.x - 0.5) * L.box
          const oy = (L.bow.y - 0.5) * L.box
          for (const side of [-1, 1] as const) {
            const i = next; next = (next + 1) % WAKE_MARKS
            // Barely off the centreline: the apex is a point. Matches the sea.
            at[i] = { x: ox, y: oy + side * 3 * L.scale, born: now, side, scale: L.scale }
          }
        }
      }

      for (let i = 0; i < WAKE_MARKS; i++) {
        const el = marks.current[i]
        const m = at[i]
        if (!el) continue
        const age = (now - m.born) / WAKE_LIFE
        if (age >= 1 || age < 0) { if (el.style.opacity !== '0') el.style.opacity = '0'; continue }
        // The V, and the fade, and the stretch — all as the sea does them. The
        // heading is due east here, so the perpendicular is simply y.
        const out = WAKE_SPREAD * Math.sqrt(m.scale) * (1 - Math.pow(1 - age, 2.2))
        el.style.opacity = String(Math.pow(1 - age, 1.7) * 0.42)
        const along = (0.55 + age * 0.7) * m.scale
        const across = (0.3 + age * 1.5) * m.scale
        // GROUND is the ground plane's squash. The sea gets it from the world
        // layer's scaleY; here it is applied to the mark's own offset.
        el.style.transform =
          `translate3d(${m.x}px, ${(m.y + m.side * out) * GROUND}px, 0) translate(-50%, -50%) `
          + `scale(${along}, ${across})`
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const move = useCallback((e: React.PointerEvent) => {
    const r = stage.current?.getBoundingClientRect()
    if (!r || !r.width) return
    // The stage is one BOX wide and one box tall, centred, so a pointer
    // position maps straight onto the sprite's own fractions.
    setBows(prev => ({
      ...prev,
      [pick]: {
        x: round(clamp((e.clientX - r.left) / r.width)),
        y: round(clamp((e.clientY - r.top) / r.height)),
      },
    }))
  }, [pick])

  const nudge = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.01 : 0.002
    const d = e.key === 'ArrowLeft' ? [-step, 0] : e.key === 'ArrowRight' ? [step, 0]
      : e.key === 'ArrowUp' ? [0, -step] : e.key === 'ArrowDown' ? [0, step] : null
    if (!d) return
    e.preventDefault()
    setBows(prev => ({
      ...prev,
      [pick]: { x: round(clamp(bow.x + d[0])), y: round(clamp(bow.y + d[1])) },
    }))
  }

  const source = useMemo(() => {
    const f = bows.fishing
    const lines = SHIPS.map(s => {
      const b = bows[String(s.tier)]
      return `  ${s.name.padEnd(11)} seaBow: { x: ${b.x}, y: ${b.y} },`
    }).join('\n')
    return `// lib/ships.ts — one seaBow per hull\n${lines}\n\n`
      + `// SeaMap.tsx\nconst FISHING_BOW = { x: ${f.x}, y: ${f.y} }\n`
  }, [bows])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true); setTimeout(() => setCopied(false), 1600)
    } catch { /* the block below is selectable either way */ }
  }

  return (
    <div className="page-col" style={{ paddingTop: '1rem', paddingBottom: '4rem', color: '#e6e2dc' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h1 className="font-pirata" style={{ fontSize: '1.9rem' }}>Wake bench</h1>
        <Link href="/sea" className="font-karla font-700" style={{ fontSize: '0.9rem', color: '#8fb8cf' }}>
          To the sea
        </Link>
      </div>
      <p className="font-karla" style={{
        fontSize: '0.9rem', color: 'rgba(198,216,230,0.72)', lineHeight: 1.6, margin: '4px 0 14px',
      }}>
        Drag the ring to where the hull actually parts the water. The wake runs live from
        wherever you put it, so judge it moving rather than by the dot. Arrow keys nudge,
        shift for a bigger step. Copy the table into <code>lib/ships.ts</code>.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {BOATS.map(b => (
          <button key={b.id} type="button" onClick={() => setPick(b.id)}
            className="tap font-karla font-700"
            style={{
              padding: '0.4rem 0.7rem', borderRadius: 10, cursor: 'pointer', fontSize: '0.8rem',
              background: pick === b.id ? 'rgba(240,192,64,0.16)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${pick === b.id ? 'rgba(240,192,64,0.5)' : 'rgba(255,255,255,0.14)'}`,
              color: pick === b.id ? '#f6dfa0' : '#cfe0ec',
            }}>
            {b.label}
          </button>
        ))}
      </div>

      {/* THE WATER. A flat ground in the open sea's own colour, because a wake
          judged against a page background is a wake judged against the wrong
          thing — these marks are pale and translucent and only read correctly
          over water. */}
      <div style={{
        position: 'relative', height: 420, borderRadius: 16, overflow: 'hidden',
        background: 'linear-gradient(180deg, #0e2231 0%, #0b1a24 60%, #081420 100%)',
        border: '1px solid rgba(150,196,222,0.2)',
        touchAction: 'none',
      }}>
        {/* The marks. Behind the boat, exactly as on the chart, which is a good
            part of why the foam at the prow reads as being split. */}
        <div style={{ position: 'absolute', left: '50%', top: '50%', zIndex: 1 }}>
          {Array.from({ length: WAKE_MARKS }, (_, i) => (
            <div key={i} aria-hidden className="sea-wake"
              ref={el => { if (el) marks.current[i] = el }} />
          ))}
        </div>

        {/* The boat, held at the centre and drawn at its true sea size. */}
        <div ref={stage}
          onPointerDown={e => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            held.current = true; move(e)
          }}
          onPointerMove={e => { if (held.current) move(e) }}
          onPointerUp={() => { held.current = false }}
          onPointerCancel={() => { held.current = false }}
          style={{
            position: 'absolute', left: '50%', top: '50%', zIndex: 2,
            width: boat.box, height: boat.box, transform: 'translate(-50%, -50%)',
            cursor: 'crosshair', touchAction: 'none',
          }}>
          {boat.art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={boat.art} alt="" draggable={false} width={640} height={640}
              style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />
          ) : (
            // The fishing boat is a composite, so it is the real component. Its
            // sprite carries the same translate the sea gives it, or the hull
            // would sit somewhere else here than it does on the water.
            <div style={{ transform: 'translate(-8%, -26%)', pointerEvents: 'none' }}>
              <FisherPose
                characterColor={characterColor}
                equippedHat={equippedHat} equippedBoat={equippedBoat}
                equippedPet={null} rodTier={0} reelTier={0} hookTier={0} noGlow />
            </div>
          )}

          {/* THE CUTWATER. A ring, so the thing you are placing it on stays
              visible through the middle of it. */}
          <div aria-hidden style={{
            position: 'absolute', left: `${bow.x * 100}%`, top: `${bow.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            width: 22, height: 22, borderRadius: '50%',
            border: '2px solid #f0c040', boxShadow: '0 0 0 3px rgba(240,192,64,0.22)',
            pointerEvents: 'none',
          }} />
        </div>

        {/* Keyboard access to the same handle. Focusable, invisible, and it is
            what the arrow keys are attached to. */}
        <button type="button" aria-label={`${boat.label} cutwater`} onKeyDown={nudge}
          style={{
            position: 'absolute', left: 10, bottom: 10, zIndex: 3,
            padding: '0.35rem 0.6rem', borderRadius: 9, cursor: 'pointer', fontSize: '0.72rem',
            background: 'rgba(6,14,22,0.8)', border: '1px solid rgba(180,214,232,0.3)', color: '#cfe0ec',
          }} className="font-karla font-700">
          Focus, then arrow keys
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0' }}>
        <label className="font-karla font-700" style={{ fontSize: '0.78rem', color: 'rgba(190,212,228,0.7)' }}>
          Way on
        </label>
        <input type="range" min={0.15} max={2} step={0.05} value={speed}
          onChange={e => setSpeed(Number(e.target.value))} style={{ flex: 1 }} />
        <button type="button" onClick={() => setRunning(r => !r)} className="tap font-karla font-700"
          style={{
            padding: '0.4rem 0.7rem', borderRadius: 10, fontSize: '0.78rem', cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', color: '#d8e2ea',
          }}>
          {running ? 'Stop laying' : 'Lay wake'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button type="button" onClick={copy} className="tap font-karla font-700"
          style={{
            flex: 1, padding: '0.65rem', borderRadius: 12, fontSize: '0.88rem', cursor: 'pointer',
            background: 'rgba(240,192,64,0.16)', border: '1px solid rgba(240,192,64,0.5)', color: '#f6dfa0',
          }}>
          {copied ? 'Copied' : 'Copy the table'}
        </button>
        <button type="button" onClick={() => setBows(DEFAULTS)} className="tap font-karla font-700"
          style={{
            padding: '0.65rem 0.9rem', borderRadius: 12, fontSize: '0.88rem', cursor: 'pointer',
            background: 'rgba(6,14,22,0.6)', border: '1px solid rgba(180,214,232,0.26)', color: '#cfe0ec',
          }}>
          Back to shipped
        </button>
      </div>

      <pre className="font-karla" style={{
        fontSize: '0.8rem', lineHeight: 1.7, color: '#cfe0ec', margin: 0,
        padding: '0.75rem', borderRadius: 12, overflowX: 'auto',
        background: 'rgba(4,10,16,0.7)', border: '1px solid rgba(180,214,232,0.18)',
      }}>{source}</pre>
    </div>
  )
}
