'use client'

// DRAG BOTH ENDS, THEN COPY THE TABLE.
//
// Every position here is a percentage of the preview box, which is why the box
// is the shared <PreviewStage> and not a copy of it: numbers tuned against a
// different rectangle would be wrong on the real page in a way that looks like
// a bad eye rather than a bad box.
//
// Nothing is saved. The bench prints ./callouts.ts and a person pastes it in.
// A settings row in the database would put the layout of a screen somewhere no
// diff would ever show it.

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import PreviewStage, { type PoseKit } from '@/components/PreviewStage'
import { CalloutChip, CalloutLines } from '../CalloutLayer'
import { CALLOUTS, type Callout } from '../callouts'
import { BOATS, getBoat } from '@/lib/boats'
import { HATS, getHat } from '@/lib/hats'
import { PETS, getPet } from '@/lib/pets'
import { RODS } from '@/lib/rods'
import { CHARACTER_COLORS } from '@/lib/characters'

/** Which end of which callout the pointer has hold of. */
type Grip = { i: number; end: 'at' | 'chip' }

const round = (n: number) => Math.round(n * 10) / 10
const clamp = (n: number) => Math.max(0, Math.min(100, n))

/** The two widths the shipyard column actually takes. The type scale switches
 *  at 768px and the chips are the one thing here whose size does not scale with
 *  the box, so checking both is the difference between a table that reads and
 *  one that overlaps on a phone. */
const WIDTHS = [{ label: 'Phone', px: 360 }, { label: 'Wide', px: 560 }]

export default function CalibrateClient(kit0: PoseKit) {
  const [list, setList] = useState<Callout[]>(CALLOUTS)
  const [kit, setKit] = useState<PoseKit>(kit0)
  const [width, setWidth] = useState(WIDTHS[1].px)
  const [grip, setGrip] = useState<Grip | null>(null)
  const [held, setHeld] = useState<Grip | null>(null)
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLDivElement | null>(null)

  const move = useCallback((e: React.PointerEvent, g: Grip) => {
    const r = box.current?.getBoundingClientRect()
    if (!r || !r.width || !r.height) return
    const x = round(clamp(((e.clientX - r.left) / r.width) * 100))
    const y = round(clamp(((e.clientY - r.top) / r.height) * 100))
    setList(prev => prev.map((c, i) => (i === g.i ? { ...c, [g.end]: { x, y } } : c)))
  }, [])

  /** Arrow keys nudge by a tenth. Dragging gets a label roughly where it
   *  belongs; the last half-percent that makes a line land ON the hat rather
   *  than beside it is not something a thumb can do. */
  const nudge = useCallback((e: React.KeyboardEvent, g: Grip) => {
    const step = e.shiftKey ? 1 : 0.1
    const d = e.key === 'ArrowLeft' ? [-step, 0]
      : e.key === 'ArrowRight' ? [step, 0]
        : e.key === 'ArrowUp' ? [0, -step]
          : e.key === 'ArrowDown' ? [0, step] : null
    if (!d) return
    e.preventDefault()
    setList(prev => prev.map((c, i) => (i === g.i
      ? { ...c, [g.end]: { x: round(clamp(c[g.end].x + d[0])), y: round(clamp(c[g.end].y + d[1])) } }
      : c)))
  }, [])

  const nameFor = useCallback((k: Callout['slot']) => (
    k === 'rod' ? (RODS.find(r => r.tier === kit.rodTier)?.name ?? 'Rod')
      : k === 'hat' ? (getHat(kit.equippedHat)?.name ?? 'No hat')
        : k === 'skin' ? (CHARACTER_COLORS.find(c => c.id === kit.characterColor)?.name ?? kit.characterColor)
          : k === 'pet' ? (getPet(kit.equippedPet)?.name ?? 'No pet')
            : (getBoat(kit.equippedBoat)?.name ?? 'No boat')
  ), [kit])

  const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length))

  const source = useMemo(() => (
    'export const CALLOUTS: Callout[] = [\n'
    + list.map(c => `  { slot: ${pad(`'${c.slot}',`, 8)} label: ${pad(`'${c.label}',`, 8)} `
      + `at: { x: ${c.at.x}, y: ${c.at.y} }, chip: { x: ${c.chip.x}, y: ${c.chip.y} } },`).join('\n')
    + '\n]\n'
  ), [list])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* the block below is selectable either way */ }
  }

  const handle = (i: number, end: 'at' | 'chip') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      setGrip({ i, end })
      setHeld({ i, end })
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (held?.i === i && held.end === end) move(e, { i, end })
    },
    onPointerUp: () => setHeld(null),
    onPointerCancel: () => setHeld(null),
    onFocus: () => setGrip({ i, end }),
    onKeyDown: (e: React.KeyboardEvent) => nudge(e, { i, end }),
  })

  const lit = (i: number, end: 'at' | 'chip') => grip?.i === i && grip.end === end

  return (
    <div className="sea-shipyard" style={{ padding: '1rem 1rem 4rem', maxWidth: '46rem', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <h1 className="font-cinzel font-700" style={{ fontSize: 'var(--sy-7)', color: '#e6e2dc' }}>
          Callout bench
        </h1>
        <Link href="/shipyard" className="font-karla font-700" style={{ fontSize: 'var(--sy-3)', color: '#8fb8cf' }}>
          To the shipyard
        </Link>
      </div>
      <p className="font-karla" style={{
        fontSize: 'var(--sy-3)', color: 'rgba(198,216,230,0.72)', lineHeight: 1.6, marginBottom: 14,
      }}>
        Drag a ring to move where a line points. Drag a name to move where it sits.
        Arrow keys nudge a tenth of a percent, hold shift for a whole one. When it
        looks right, copy the table into app/(app)/shipyard/callouts.ts.
      </p>

      {/* ── THE BENCH SETTINGS ─────────────────────────────────────────────
          Swapping the kit matters as much as the dragging: an anchor that sits
          on the tricorn and floats above the bandana has not been placed, it
          has been placed once. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <Picker label="Boat" value={kit.equippedBoat ?? ''}
          options={[{ v: '', n: 'None' }, ...BOATS.map(b => ({ v: b.id, n: b.name }))]}
          onChange={v => setKit(k => ({ ...k, equippedBoat: v || null }))} />
        <Picker label="Hat" value={kit.equippedHat ?? ''}
          options={[{ v: '', n: 'None' }, ...HATS.map(h => ({ v: h.id, n: h.name }))]}
          onChange={v => setKit(k => ({ ...k, equippedHat: v || null }))} />
        <Picker label="Pet" value={kit.equippedPet ?? ''}
          options={[{ v: '', n: 'None' }, ...PETS.map(p => ({ v: p.id, n: p.name }))]}
          onChange={v => setKit(k => ({ ...k, equippedPet: v || null }))} />
        <Picker label="Rod" value={String(kit.rodTier)}
          options={RODS.map(r => ({ v: String(r.tier), n: r.name }))}
          onChange={v => setKit(k => ({ ...k, rodTier: Number(v) }))} />
        <Picker label="Skin" value={kit.characterColor}
          options={CHARACTER_COLORS.map(c => ({ v: c.id, n: c.name }))}
          onChange={v => setKit(k => ({ ...k, characterColor: v }))} />
        <Picker label="Width" value={String(width)}
          options={WIDTHS.map(w => ({ v: String(w.px), n: `${w.label}, ${w.px}px` }))}
          onChange={v => setWidth(Number(v))} />
      </div>

      {/* The stage is held to a fixed pixel width rather than filling the page:
          "does this table survive a phone" is a question about the BOX being
          narrow, not about the browser being narrow. */}
      <div ref={box} style={{
        width, maxWidth: '100%', margin: '0 auto', position: 'relative', touchAction: 'none',
      }}>
        <PreviewStage kit={kit}>
          <div style={{ position: 'absolute', inset: 0, zIndex: 3 }}>
            <CalloutLines list={list} />

            {list.map((c, i) => (
              <div key={c.slot}>
                {/* THE ANCHOR. A ring rather than a filled dot, so the thing it
                    is being placed on stays visible through the middle of it.
                    A solid handle over a hat brim hides the brim. */}
                <button type="button" aria-label={`${c.label} anchor`} {...handle(i, 'at')}
                  style={{
                    position: 'absolute', left: `${c.at.x}%`, top: `${c.at.y}%`,
                    transform: 'translate(-50%, -50%)',
                    width: 26, height: 26, borderRadius: '50%', padding: 0,
                    background: 'rgba(6,14,22,0.3)',
                    border: `2px solid ${lit(i, 'at') ? '#f0c040' : 'rgba(220,238,246,0.85)'}`,
                    boxShadow: lit(i, 'at') ? '0 0 0 3px rgba(240,192,64,0.25)' : 'none',
                    cursor: 'grab', touchAction: 'none',
                  }} />

                <button type="button" aria-label={`${c.label} name`} {...handle(i, 'chip')}
                  style={{
                    position: 'absolute', left: `${c.chip.x}%`, top: `${c.chip.y}%`,
                    transform: 'translate(-50%, -50%)',
                    padding: 0, background: 'none', border: 'none',
                    cursor: 'grab', touchAction: 'none',
                  }}>
                  <CalloutChip label={c.label} name={nameFor(c.slot)} dim={lit(i, 'chip')} />
                </button>
              </div>
            ))}
          </div>
        </PreviewStage>
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '14px 0 8px' }}>
        <button type="button" onClick={copy} className="tap font-karla font-700"
          style={{
            flex: 1, padding: '0.6rem', borderRadius: 12, fontSize: 'var(--sy-3)',
            background: 'rgba(240,192,64,0.16)', border: '1px solid rgba(240,192,64,0.5)',
            color: '#f6dfa0', cursor: 'pointer',
          }}>
          {copied ? 'Copied' : 'Copy the table'}
        </button>
        <button type="button" onClick={() => setList(CALLOUTS)} className="tap font-karla font-700"
          style={{
            padding: '0.6rem 0.9rem', borderRadius: 12, fontSize: 'var(--sy-3)',
            background: 'rgba(6,14,22,0.6)', border: '1px solid rgba(180,214,232,0.26)',
            color: '#cfe0ec', cursor: 'pointer',
          }}>
          Back to shipped
        </button>
      </div>

      <pre className="font-karla" style={{
        fontSize: 'var(--sy-2)', lineHeight: 1.7, color: '#cfe0ec', margin: 0,
        padding: '0.75rem', borderRadius: 12, overflowX: 'auto',
        background: 'rgba(4,10,16,0.7)', border: '1px solid rgba(180,214,232,0.18)',
      }}>{source}</pre>
    </div>
  )
}

function Picker({ label, value, options, onChange }: {
  label: string
  value: string
  options: { v: string; n: string }[]
  onChange: (v: string) => void
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="font-karla font-700 uppercase" style={{
        fontSize: 'var(--sy-1)', letterSpacing: '0.1em', color: 'rgba(190,212,228,0.6)',
      }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="font-karla" style={{
          fontSize: 'var(--sy-3)', padding: '0.3rem 0.4rem', borderRadius: 8,
          background: 'rgba(6,14,22,0.8)', border: '1px solid rgba(180,214,232,0.26)',
          color: '#e6e2dc',
        }}>
        {options.map(o => <option key={o.v} value={o.v}>{o.n}</option>)}
      </select>
    </label>
  )
}
