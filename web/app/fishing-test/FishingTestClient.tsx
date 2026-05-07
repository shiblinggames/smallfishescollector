'use client'

import { useState, useRef } from 'react'
import { RODS } from '@/lib/rods'
import { HOOKS } from '@/lib/hooks'

type Frame = 'rest' | 'wait' | 'cast'

const FRAMES: Record<Frame, string> = {
  rest: '/fishing_rest.png',
  wait: '/fishing_wait.png',
  cast: '/fishing_cast.png',
}

// Per-frame rod/hook overlay config — % relative to the character container
const ROD_OVERLAY: Record<Frame, { top: number; left: number; width: number; rotate: number }> = {
  rest: { top: 35, left: 11, width: 51, rotate: -1  },
  wait: { top: 22, left: 22, width: 51, rotate: -22 },
  cast: { top: 28, left: 5,  width: 51, rotate: 49  },
}

const HOOK_OVERLAY: Record<Frame, { top: number; left: number; width: number; rotate: number; hidden?: boolean }> = {
  rest: { top: 84, left: 8,  width: 19, rotate: -37 },
  wait: { top: 58, left: -4, width: 25, rotate: 0,   hidden: true },
  cast: { top: 19, left: 3,  width: 19, rotate: 8   },
}

// Per-frame character position on the background — % of the phone preview container
const CHAR_DEFAULT: Record<Frame, { bottom: number; left: number; width: number }> = {
  rest: { bottom: 60, left: 31, width: 70 },
  wait: { bottom: 57, left: 26, width: 70 },
  cast: { bottom: 60, left: 26, width: 70 },
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

// Animation sequence: [frame, duration ms]
const ANIM_SEQUENCE: [Frame, number][] = [
  ['cast', 600],
  ['wait', 2500],
  ['cast', 500],
  ['rest', 800],
]

export default function FishingTestClient() {
  const [frame, setFrame] = useState<Frame>('rest')
  const [animating, setAnimating] = useState(false)
  const [rodTier, setRodTier] = useState(0)
  const [hookTier, setHookTier] = useState(0)
  const [rodCfg, setRodCfg] = useState(ROD_OVERLAY)
  const [hookCfg, setHookCfg] = useState(HOOK_OVERLAY)
  const [charCfg, setCharCfg] = useState(CHAR_DEFAULT)
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
  const rc = rodCfg[frame]
  const hc = hookCfg[frame]

  const cp = charCfg[frame]

  function setChar(key: keyof typeof cp, val: number) {
    setCharCfg(prev => ({ ...prev, [frame]: { ...prev[frame], [key]: val } }))
  }
  function setRod(key: keyof typeof rc, val: number) {
    setRodCfg(prev => ({ ...prev, [frame]: { ...prev[frame], [key]: val } }))
  }
  function setHook(key: keyof typeof hc, val: number) {
    setHookCfg(prev => ({ ...prev, [frame]: { ...prev[frame], [key]: val } }))
  }

  return (
    <div style={{ minHeight: '100vh', background: '#08121c', display: 'flex', gap: 0 }}>

      {/* ── Phone preview ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Mimic the game's max-w-md container at phone aspect ratio */}
        <div style={{ position: 'relative', width: 390, height: 720, overflow: 'hidden', borderRadius: 12, boxShadow: '0 0 0 1px rgba(255,255,255,0.1)' }}>

          {/* Zone background — fills container like the real game */}
          <img
            src="/fishingbackground1.jpeg"
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
          />

          {/* Character + overlays — positioned on background */}
          <div style={{
            position: 'absolute',
            bottom: `${cp.bottom}%`,
            left: `${cp.left}%`,
            width: `${cp.width}%`,
          }}>
            {/* Character sprite */}
            <img src={FRAMES[frame]} alt="" style={{ width: '100%', display: 'block' }} />

            {/* Rod overlay */}
            {rod.imageUrl && (
              <img src={rod.imageUrl} alt="rod" style={{
                position: 'absolute', top: `${rc.top}%`, left: `${rc.left}%`,
                width: `${rc.width}%`,
                transform: `rotate(${rc.rotate}deg)`,
                transformOrigin: 'bottom right',
                pointerEvents: 'none',
              }} />
            )}

            {/* Hook overlay */}
            {hook.imageUrl && !hc.hidden && (
              <img src={hook.imageUrl} alt="hook" style={{
                position: 'absolute', top: `${hc.top}%`, left: `${hc.left}%`,
                width: `${hc.width}%`,
                transform: `rotate(${hc.rotate}deg)`,
                transformOrigin: 'center center',
                pointerEvents: 'none',
              }} />
            )}
          </div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={{ width: 290, background: 'rgba(0,0,0,0.8)', padding: '1.2rem', overflowY: 'auto', fontSize: 12, color: '#ccc' }}>

        {/* Frame picker + animate */}
        <p style={{ fontWeight: 700, marginBottom: 8, color: '#fff' }}>Frame</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {(['rest', 'wait', 'cast'] as Frame[]).map(f => (
            <button key={f} onClick={() => { setFrame(f) }} style={{
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

        {/* Config dump */}
        <p style={{ fontWeight: 700, marginTop: 18, marginBottom: 6, color: '#fff' }}>Current config</p>
        <pre style={{ fontSize: 9, color: '#94a3b8', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '8px', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
{`CHAR:\n${JSON.stringify(charCfg, null, 2)}\n\nROD:\n${JSON.stringify(rodCfg, null, 2)}\n\nHOOK:\n${JSON.stringify(hookCfg, null, 2)}`}
        </pre>
      </div>
    </div>
  )
}
