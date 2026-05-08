'use client'

import { useState, useRef } from 'react'
import { RODS } from '@/lib/rods'
import { HOOKS } from '@/lib/hooks'
import { BAITS } from '@/lib/bait'
import { BADGE_SLOT_POSITIONS, type BadgePos, type BadgeFrame } from '@/lib/badges'

type Frame = 'rest' | 'wait' | 'cast'

const FRAMES: Record<Frame, string> = {
  rest: '/fishing_rest.png',
  wait: '/fishing_wait.png',
  cast: '/fishing_cast.png',
}

const ROD_OVERLAY: Record<Frame, { top: number; left: number; width: number; rotate: number }> = {
  rest: { top: 33, left: 12, width: 51, rotate: -1  },
  wait: { top: 24, left: 23, width: 51, rotate: -22 },
  cast: { top: 24, left: 3,  width: 51, rotate: 49  },
}

const HOOK_OVERLAY: Record<Frame, { top: number; left: number; width: number; rotate: number; hidden?: boolean }> = {
  rest: { top: 81, left: 9,  width: 16, rotate: -30 },
  wait: { top: 58, left: -4, width: 25, rotate: 0,   hidden: true },
  cast: { top: 18, left: 6,  width: 16, rotate: 8   },
}

const ZONE_BG: Record<string, string> = {
  shallows:    '/fishingbackground1.jpeg',
  open_waters: '/fishingbackground2.jpeg',
  deep:        '/fishingbackground3.jpeg',
  abyss:       '/fishingbackground4.jpeg',
}

const CHAR_DEFAULT: Record<Frame, { bottom: number; left: number; width: number }> = {
  rest: { bottom: 60, left: 31, width: 70 },
  wait: { bottom: 57, left: 26, width: 70 },
  cast: { bottom: 60, left: 26, width: 70 },
}

const BAITS_WITH_IMAGES = BAITS.filter(b => b.imageUrl)

// Default base position for all baits (tune per-bait)
const makeBaitBase = () => ({ top: 78, left: 30, width: 10, rotate: 0 })
const BAIT_BASE_DEFAULT: Record<string, { top: number; left: number; width: number; rotate: number }> =
  Object.fromEntries(BAITS_WITH_IMAGES.map(b => [b.type, makeBaitBase()]))

// Per-frame delta applied on top of base (same for all baits)
const BAIT_FRAME_OFFSET_DEFAULT: Record<Frame, { dTop: number; dLeft: number }> = {
  rest: { dTop: 0,  dLeft: 0  },
  wait: { dTop: 0,  dLeft: 0  },
  cast: { dTop: 0,  dLeft: 0  },
}

function Slider({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ width: 60, fontSize: 11, color: '#aaa', textAlign: 'right' }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} style={{ flex: 1 }} />
      <span style={{ width: 38, fontSize: 11, color: '#fff', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

const ANIM_SEQUENCE: [Frame, number][] = [
  ['cast', 600],
  ['wait', 2500],
  ['cast', 500],
  ['rest', 800],
]

export default function FishingTestClient() {
  const [frame, setFrame] = useState<Frame>('rest')
  const [zone, setZone] = useState<string>('shallows')
  const [animating, setAnimating] = useState(false)
  const [rodTier, setRodTier] = useState(0)
  const [hookTier, setHookTier] = useState(0)
  const [selectedBaitType, setSelectedBaitType] = useState(BAITS_WITH_IMAGES[0].type)
  const [rodCfg, setRodCfg] = useState(ROD_OVERLAY)
  const [hookCfg, setHookCfg] = useState(HOOK_OVERLAY)
  const [charCfg, setCharCfg] = useState(CHAR_DEFAULT)
  const [baitBase, setBaitBase] = useState(BAIT_BASE_DEFAULT)
  const [baitOffset, setBaitOffset] = useState(BAIT_FRAME_OFFSET_DEFAULT)
  const [badgeCfg, setBadgeCfg] = useState(BADGE_SLOT_POSITIONS)
  const [activeSlot, setActiveSlot] = useState(0)
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function playAnimation() {
    if (animating) return
    setAnimating(true)
    let elapsed = 0
    ANIM_SEQUENCE.forEach(([f, duration], i) => {
      animRef.current = setTimeout(() => {
        setFrame(f)
        if (i === ANIM_SEQUENCE.length - 1) setAnimating(false)
      }, elapsed)
      elapsed += duration
    })
  }

  const rod  = RODS.find(r => r.tier === rodTier) ?? RODS[0]
  const hook = HOOKS.find(h => h.tier === hookTier) ?? HOOKS[0]
  const bait = BAITS_WITH_IMAGES.find(b => b.type === selectedBaitType) ?? BAITS_WITH_IMAGES[0]
  const rc = rodCfg[frame]
  const hc = hookCfg[frame]
  const cp = charCfg[frame]
  const bb = baitBase[selectedBaitType]
  const bo = baitOffset[frame]
  const baitTop  = bb.top  + bo.dTop
  const baitLeft = bb.left + bo.dLeft

  function setChar(key: keyof typeof cp, val: number) {
    setCharCfg(prev => ({ ...prev, [frame]: { ...prev[frame], [key]: val } }))
  }
  function setRod(key: keyof typeof rc, val: number) {
    setRodCfg(prev => ({ ...prev, [frame]: { ...prev[frame], [key]: val } }))
  }
  function setHook(key: keyof typeof hc, val: number) {
    setHookCfg(prev => ({ ...prev, [frame]: { ...prev[frame], [key]: val } }))
  }
  function setBait(key: keyof typeof bb, val: number) {
    setBaitBase(prev => ({ ...prev, [selectedBaitType]: { ...prev[selectedBaitType], [key]: val } }))
  }
  function setBaitOff(key: keyof typeof bo, val: number) {
    setBaitOffset(prev => ({ ...prev, [frame]: { ...prev[frame], [key]: val } }))
  }
  function setBadge(key: keyof BadgePos, val: number) {
    setBadgeCfg(prev => ({
      ...prev,
      [activeSlot]: { ...prev[activeSlot], [frame]: { ...prev[activeSlot][frame as BadgeFrame], [key]: val } },
    }))
  }
  const bc = badgeCfg[activeSlot]?.[frame as BadgeFrame] ?? { top: 72, left: 18, width: 18, rotate: 0 }

  return (
    <div style={{ minHeight: '100vh', background: '#08121c', display: 'flex', gap: 0 }}>

      {/* ── Phone preview ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 390, height: 720, overflow: 'hidden', borderRadius: 12, boxShadow: '0 0 0 1px rgba(255,255,255,0.1)' }}>

          <img src={ZONE_BG[zone]} alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
          />

          <div style={{
            position: 'absolute',
            bottom: `${cp.bottom}%`,
            left: `${cp.left}%`,
            width: `${cp.width}%`,
          }}>
            <img src={FRAMES[frame]} alt="" style={{ width: '100%', display: 'block' }} />

            {rod.imageUrl && (
              <img src={rod.imageUrl} alt="rod" style={{
                position: 'absolute', top: `${rc.top}%`, left: `${rc.left}%`,
                width: `${rc.width}%`, transform: `rotate(${rc.rotate}deg)`,
                transformOrigin: 'bottom right', pointerEvents: 'none',
              }} />
            )}

            {hook.imageUrl && !hc.hidden && (
              <img src={hook.imageUrl} alt="hook" style={{
                position: 'absolute', top: `${hc.top}%`, left: `${hc.left}%`,
                width: `${hc.width}%`, transform: `rotate(${hc.rotate}deg)`,
                transformOrigin: 'center center', pointerEvents: 'none',
              }} />
            )}

            {bait.imageUrl && (
              <img src={bait.imageUrl} alt="bait" style={{
                position: 'absolute', top: `${baitTop}%`, left: `${baitLeft}%`,
                width: `${bb.width}%`, transform: `rotate(${bb.rotate}deg)`,
                transformOrigin: 'center center', pointerEvents: 'none',
              }} />
            )}
            {[0, 1, 2].map(slot => {
              const bp = badgeCfg[slot]?.[frame as BadgeFrame]
              if (!bp) return null
              return (
                <div key={slot} style={{
                  position: 'absolute', top: `${bp.top}%`, left: `${bp.left}%`,
                  width: `${bp.width}%`, transform: `rotate(${bp.rotate}deg)`,
                  transformOrigin: 'center center', pointerEvents: 'none',
                  background: slot === activeSlot ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.2)',
                  borderRadius: 4, aspectRatio: '1',
                  border: slot === activeSlot ? '1px solid #fbbf24' : '1px dashed rgba(255,255,255,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>{slot + 1}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={{ width: 290, background: 'rgba(0,0,0,0.8)', padding: '1.2rem', overflowY: 'auto', fontSize: 12, color: '#ccc' }}>

        {/* Zone picker */}
        <p style={{ fontWeight: 700, marginBottom: 6, color: '#fff' }}>Zone</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {Object.keys(ZONE_BG).map(z => (
            <button key={z} onClick={() => setZone(z)} style={{
              flex: 1, padding: '4px 0', borderRadius: 6, cursor: 'pointer', minWidth: 60,
              background: zone === z ? '#7c3aed' : 'rgba(255,255,255,0.08)',
              border: 'none', color: '#fff', fontWeight: zone === z ? 700 : 400, fontSize: 11,
            }}>{z.replace('_', ' ')}</button>
          ))}
        </div>

        {/* Frame picker + animate */}
        <p style={{ fontWeight: 700, marginBottom: 8, color: '#fff' }}>Frame</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {(['rest', 'wait', 'cast'] as Frame[]).map(f => (
            <button key={f} onClick={() => setFrame(f)} style={{
              flex: 1, padding: '4px 0', borderRadius: 6, cursor: 'pointer',
              background: frame === f ? '#3b82f6' : 'rgba(255,255,255,0.08)',
              border: 'none', color: '#fff', fontWeight: frame === f ? 700 : 400,
            }}>{f}</button>
          ))}
        </div>
        <button onClick={playAnimation} disabled={animating} style={{
          width: '100%', padding: '6px 0', borderRadius: 6, cursor: animating ? 'default' : 'pointer',
          background: animating ? 'rgba(255,255,255,0.04)' : '#16a34a',
          border: 'none', color: '#fff', fontWeight: 700, marginBottom: 16, fontSize: 12,
        }}>{animating ? 'casting...' : '▶ Play cast sequence'}</button>

        {/* Character position */}
        <p style={{ fontWeight: 700, marginBottom: 4, color: '#fbbf24' }}>Character position ({frame})</p>
        <Slider label="bottom %" value={cp.bottom} min={-20} max={60}  onChange={v => setChar('bottom', v)} />
        <Slider label="left %"   value={cp.left}   min={-20} max={80}  onChange={v => setChar('left',   v)} />
        <Slider label="width %"  value={cp.width}  min={20}  max={120} onChange={v => setChar('width',  v)} />

        {/* Rod picker */}
        <p style={{ fontWeight: 700, marginTop: 14, marginBottom: 6, color: '#fff' }}>Rod</p>
        <select value={rodTier} onChange={e => setRodTier(Number(e.target.value))}
          style={{ width: '100%', marginBottom: 10, padding: '4px 6px', background: '#1e2d3e', color: '#fff', border: '1px solid #334', borderRadius: 6 }}>
          {RODS.filter(r => r.imageUrl).map(r => (
            <option key={r.tier} value={r.tier}>{r.name}</option>
          ))}
        </select>
        <p style={{ fontWeight: 600, marginBottom: 4, color: '#93c5fd' }}>Rod overlay ({frame})</p>
        <Slider label="top %"    value={rc.top}    min={-80} max={100}  onChange={v => setRod('top',    v)} />
        <Slider label="left %"   value={rc.left}   min={-80} max={100}  onChange={v => setRod('left',   v)} />
        <Slider label="width %"  value={rc.width}  min={10}  max={150}  onChange={v => setRod('width',  v)} />
        <Slider label="rotate °" value={rc.rotate} min={-180} max={180} onChange={v => setRod('rotate', v)} />

        {/* Hook picker */}
        <p style={{ fontWeight: 700, marginTop: 14, marginBottom: 6, color: '#fff' }}>Hook</p>
        <select value={hookTier} onChange={e => setHookTier(Number(e.target.value))}
          style={{ width: '100%', marginBottom: 10, padding: '4px 6px', background: '#1e2d3e', color: '#fff', border: '1px solid #334', borderRadius: 6 }}>
          {HOOKS.filter(h => h.imageUrl).map(h => (
            <option key={h.tier} value={h.tier}>{h.name}</option>
          ))}
        </select>
        <p style={{ fontWeight: 600, marginBottom: 4, color: '#6ee7b7' }}>Hook overlay ({frame})</p>
        <Slider label="top %"    value={hc.top}    min={-80} max={150}  onChange={v => setHook('top',    v)} />
        <Slider label="left %"   value={hc.left}   min={-80} max={100}  onChange={v => setHook('left',   v)} />
        <Slider label="width %"  value={hc.width}  min={2}   max={60}   onChange={v => setHook('width',  v)} />
        <Slider label="rotate °" value={hc.rotate} min={-180} max={180} onChange={v => setHook('rotate', v)} />

        {/* Bait picker */}
        <p style={{ fontWeight: 700, marginTop: 14, marginBottom: 6, color: '#fff' }}>Bait</p>
        <select value={selectedBaitType} onChange={e => setSelectedBaitType(e.target.value)}
          style={{ width: '100%', marginBottom: 10, padding: '4px 6px', background: '#1e2d3e', color: '#fff', border: '1px solid #334', borderRadius: 6 }}>
          {BAITS_WITH_IMAGES.map(b => (
            <option key={b.type} value={b.type}>{b.name}</option>
          ))}
        </select>

        <p style={{ fontWeight: 600, marginBottom: 4, color: '#fca5a5' }}>Bait base ({selectedBaitType})</p>
        <Slider label="top %"    value={bb.top}    min={-20} max={120}  onChange={v => setBait('top',    v)} />
        <Slider label="left %"   value={bb.left}   min={-20} max={100}  onChange={v => setBait('left',   v)} />
        <Slider label="width %"  value={bb.width}  min={2}   max={40}   onChange={v => setBait('width',  v)} />
        <Slider label="rotate °" value={bb.rotate} min={-180} max={180} onChange={v => setBait('rotate', v)} />

        <p style={{ fontWeight: 600, marginBottom: 4, marginTop: 8, color: '#fca5a5', opacity: 0.7 }}>Frame offset ({frame})</p>
        <Slider label="dTop %"  value={bo.dTop}  min={-15} max={15} onChange={v => setBaitOff('dTop',  v)} />
        <Slider label="dLeft %" value={bo.dLeft} min={-15} max={15} onChange={v => setBaitOff('dLeft', v)} />

        {/* Badge slots */}
        <p style={{ fontWeight: 700, marginTop: 18, marginBottom: 6, color: '#fff' }}>Badges</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[0, 1, 2].map(s => (
            <button key={s} onClick={() => setActiveSlot(s)} style={{
              flex: 1, padding: '4px 0', borderRadius: 6, cursor: 'pointer',
              background: activeSlot === s ? '#fbbf24' : 'rgba(255,255,255,0.08)',
              border: 'none', color: activeSlot === s ? '#000' : '#fff',
              fontWeight: activeSlot === s ? 700 : 400, fontSize: 11,
            }}>Slot {s + 1}</button>
          ))}
        </div>
        <p style={{ fontWeight: 600, marginBottom: 4, color: '#fbbf24' }}>Slot {activeSlot + 1} ({frame})</p>
        <Slider label="top %"    value={bc.top}    min={-20} max={120}  onChange={v => setBadge('top',    v)} />
        <Slider label="left %"   value={bc.left}   min={-20} max={100}  onChange={v => setBadge('left',   v)} />
        <Slider label="width %"  value={bc.width}  min={2}   max={60}   onChange={v => setBadge('width',  v)} />
        <Slider label="rotate °" value={bc.rotate} min={-180} max={180} onChange={v => setBadge('rotate', v)} />

        {/* Config dump */}
        <p style={{ fontWeight: 700, marginTop: 18, marginBottom: 6, color: '#fff' }}>Current config</p>
        <pre style={{ fontSize: 9, color: '#94a3b8', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '8px', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
{`CHAR:\n${JSON.stringify(charCfg, null, 2)}\n\nROD:\n${JSON.stringify(rodCfg, null, 2)}\n\nHOOK:\n${JSON.stringify(hookCfg, null, 2)}\n\nBAIT_BASE:\n${JSON.stringify(baitBase, null, 2)}\n\nBAIT_OFFSET:\n${JSON.stringify(baitOffset, null, 2)}\n\nBADGES:\n${JSON.stringify(badgeCfg, null, 2)}`}
        </pre>
      </div>
    </div>
  )
}
