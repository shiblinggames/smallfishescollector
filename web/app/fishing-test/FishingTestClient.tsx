'use client'

import { useState, useRef } from 'react'
import { RODS } from '@/lib/rods'
import { HOOKS } from '@/lib/hooks'
import { BADGES, BADGE_SLOT_POSITIONS, type BadgePos, type BadgeFrame } from '@/lib/badges'
import { BOATS } from '@/lib/boats'
import { CHARACTER_COLORS, getCharacterSprites } from '@/lib/characters'

type Frame = 'rest' | 'wait' | 'cast'


const ROD_OVERLAY: Record<Frame, { top: number; left: number; width: number; rotate: number }> = {
  rest: { top: 33, left: 12, width: 51, rotate: -1  },
  wait: { top: 24, left: 23, width: 51, rotate: -22 },
  cast: { top: 24, left: 3,  width: 51, rotate: 49  },
}

// 3-pose rod defaults — each frame is the raw source-sheet quadrant
// (rest/wait = 960×540, cast = 960×1080). The artist places the rod
// handle at a consistent x,y in every source sheet, so one set of coords
// works for every rod. Final tuned values that line up rod_carbon and
// all other rods identically.
const ROD_3POSE_DEFAULT: Record<Frame, { top: number; left: number; width: number; rotate: number }> = {
  rest: { top: 37,   left: -12, width: 107.5, rotate: 0 },
  wait: { top: 37.5, left: -8,  width: 107.5, rotate: 0 },
  cast: { top: -8.5, left: 3.5, width: 100.5, rotate: 0 },
}

// Hook overlay defaults for the new raw 1920×1080 hook uploads. Same
// canvas + consistent core position across every hook tier means one set
// of coords applies to all of them. Wait pose is hidden because the hook
// is in the water during the bite. Starting numbers are rough — tune in
// the test page and paste back.
const HOOK_OVERLAY: Record<Frame, { top: number; left: number; width: number; rotate: number; hidden?: boolean }> = {
  rest: { top: 30,  left: -20, width: 120, rotate: 0 },
  wait: { top: 30,  left: -20, width: 120, rotate: 0, hidden: true },
  cast: { top: -10, left:  10, width: 100, rotate: 0 },
}

// Reel: 1920×1080 raw uploads — same canvas across every tier so a single
// set of position coords works for all of them. Decorations on higher-tier
// reels (kraken, tidecaller) live inside the canvas padding without
// shifting where the reel core lands on screen.
const REEL_NAMES = [
  'reel_basic',
  'reel_spinning',
  'reel_baitcasting',
  'reel_saltwater',
  'reel_precision',
  'reel_tournament',
  'reel_deepsea',
  'reel_kraken',
  'reel_tidecaller',
] as const
const REEL_DEFAULT: Record<Frame, { top: number; left: number; width: number; rotate: number }> = {
  rest: { top: 15,   left: -10.3, width: 222,   rotate: -18   },
  wait: { top: -5.2, left:  -3.1, width: 222,   rotate: -36.5 },
  cast: { top: 38.9, left: -42,   width: 219.5, rotate:  46.5 },
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

// Boat overlay — per-frame because the character bobs/shifts across rest/wait/cast.
// Defaults sourced from the BOATS registry so the test page mirrors production.
const BOAT_DEFAULT: Record<Frame, { top: number; left: number; width: number; rotate: number }> = BOATS[0].positions

// Hat overlay — rest+wait share the rest sprite, cast uses the cast sprite.
// Positions are starting guesses; tune via the sliders.
const HAT_REST_SRC = '/hatblue_rest.png'
const HAT_CAST_SRC = '/hatblue_cast.png'
const HAT_DEFAULT: Record<Frame, { top: number; left: number; width: number; rotate: number }> = {
  rest: { top: 53,   left: 57.1, width: 21.8, rotate: 0 },
  wait: { top: 49.1, left: 64.6, width: 21.6, rotate: 0 },
  cast: { top: 53,   left: 63.8, width: 21.5, rotate: 0 },
}

function Slider({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void
}) {
  const display = step < 1 ? value.toFixed(step < 0.1 ? 2 : 1) : String(Math.round(value))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ width: 60, fontSize: 11, color: '#aaa', textAlign: 'right' }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} style={{ flex: 1 }} />
      <span style={{ width: 44, fontSize: 11, color: '#fff', textAlign: 'right' }}>{display}</span>
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
  // 3-pose rod mode: render a separate sprite per frame (rest/wait/cast)
  // baked at the correct pose, instead of a single rotated sprite. New
  // rod uploads use this format — currently only Bamboo has the sliced
  // sprites in /public, so this is gated on the bamboo source files.
  const [rodThreePose, setRodThreePose] = useState(false)
  const [rodThreePoseName, setRodThreePoseName] = useState('rod_bamboo')
  const [rodCfg, setRodCfg] = useState(ROD_OVERLAY)
  const [rodThreePoseCfg, setRodThreePoseCfg] = useState(ROD_3POSE_DEFAULT)
  const [reelEnabled, setReelEnabled] = useState(false)
  const [reelName, setReelName] = useState<typeof REEL_NAMES[number]>('reel_basic')
  const [reelCfg, setReelCfg] = useState(REEL_DEFAULT)
  const [hookCfg, setHookCfg] = useState(HOOK_OVERLAY)
  const [charCfg, setCharCfg] = useState(CHAR_DEFAULT)
  const [badgeCfg, setBadgeCfg] = useState(BADGE_SLOT_POSITIONS)
  const [boatCfg, setBoatCfg] = useState(BOAT_DEFAULT)
  const [boatEnabled, setBoatEnabled] = useState(true)
  const [hatCfg, setHatCfg] = useState(HAT_DEFAULT)
  const [hatEnabled, setHatEnabled] = useState(true)
  const [showLegacyControls, setShowLegacyControls] = useState(false)
  const [characterColor, setCharacterColor] = useState('default')
  const FRAMES = getCharacterSprites(characterColor) as Record<Frame, string>
  const [activeSlot, setActiveSlot] = useState(0)
  // per-slot selected badge id (null = empty)
  const [slotBadges, setSlotBadges] = useState<(string | null)[]>([
    BADGES[0].id, BADGES[1].id, BADGES[2].id,
  ])
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
  // Rod controls bind to whichever config is active so tuning a 3-pose
  // rod doesn't overwrite legacy positions and vice versa.
  const activeRodCfg = rodThreePose ? rodThreePoseCfg : rodCfg
  const setActiveRodCfg = rodThreePose ? setRodThreePoseCfg : setRodCfg
  const rc = activeRodCfg[frame]
  const hc = hookCfg[frame]
  const cp = charCfg[frame]

  function setChar(key: keyof typeof cp, val: number) {
    setCharCfg(prev => ({ ...prev, [frame]: { ...prev[frame], [key]: val } }))
  }
  function setRod(key: keyof typeof rc, val: number) {
    setActiveRodCfg(prev => ({ ...prev, [frame]: { ...prev[frame], [key]: val } }))
  }
  function setHook(key: keyof typeof hc, val: number) {
    setHookCfg(prev => ({ ...prev, [frame]: { ...prev[frame], [key]: val } }))
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

          {/* Character container — mirrors real game: position:absolute inset:0 with drop-shadow filter
              applied to all descendant overlays (char, boat, rod, hook, badges). */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', filter: 'drop-shadow(0 8px 14px rgba(0,15,35,0.6))' }}>
          <div style={{
            position: 'absolute',
            bottom: `${cp.bottom}%`,
            left: `${cp.left}%`,
            width: `${cp.width}%`,
          }}>
            <img src={FRAMES[frame]} alt="" style={{ width: '100%', display: 'block' }} />

            {hatEnabled && (
              <img
                src={frame === 'cast' ? HAT_CAST_SRC : HAT_REST_SRC}
                alt="hat"
                style={{
                  position: 'absolute',
                  top: `${hatCfg[frame].top}%`,
                  left: `${hatCfg[frame].left}%`,
                  width: `${hatCfg[frame].width}%`,
                  transform: `rotate(${hatCfg[frame].rotate}deg)`,
                  transformOrigin: 'center center',
                  pointerEvents: 'none',
                }}
              />
            )}

            {boatEnabled && (
              <img src={frame === 'cast' ? BOATS[0].castImageUrl : BOATS[0].restImageUrl} alt="boat" style={{
                position: 'absolute',
                top: `${boatCfg[frame].top}%`, left: `${boatCfg[frame].left}%`,
                width: `${boatCfg[frame].width}%`,
                transform: `rotate(${boatCfg[frame].rotate}deg)`,
                transformOrigin: 'center center',
                pointerEvents: 'none',
              }} />
            )}

            {rodThreePose ? (
              <img
                src={`/${rodThreePoseName}_${frame}.png`}
                alt="rod"
                style={{
                  position: 'absolute', top: `${rc.top}%`, left: `${rc.left}%`,
                  width: `${rc.width}%`, transform: `rotate(${rc.rotate}deg)`,
                  // Each 3-pose sprite already has the right pose baked in,
                  // so rotation around the visual center reads cleanly. The
                  // legacy single-sprite path uses bottom-right because the
                  // rod is rotated through ~70° between rest and cast there.
                  transformOrigin: 'center center', pointerEvents: 'none',
                  // Tailwind preflight applies img { max-width: 100% }, which
                  // silently caps the rod at 100% of its parent. Raw-quadrant
                  // canvases need values much higher than that.
                  maxWidth: 'none',
                }}
              />
            ) : rod.imageUrl && (
              <img src={rod.imageUrl} alt="rod" className={rod.glow ? 'rod-glow' : undefined} style={{
                position: 'absolute', top: `${rc.top}%`, left: `${rc.left}%`,
                width: `${rc.width}%`, transform: `rotate(${rc.rotate}deg)`,
                transformOrigin: 'bottom right', pointerEvents: 'none',
                maxWidth: 'none',
                ...(rod.glow ? { ['--rod-glow-color' as string]: rod.color } : {}),
              } as React.CSSProperties} />
            )}

            {reelEnabled && (
              <img
                src={`/${reelName}.png`}
                alt="reel"
                style={{
                  position: 'absolute',
                  top: `${reelCfg[frame].top}%`,
                  left: `${reelCfg[frame].left}%`,
                  width: `${reelCfg[frame].width}%`,
                  transform: `rotate(${reelCfg[frame].rotate}deg)`,
                  transformOrigin: 'center center',
                  pointerEvents: 'none',
                  // Same Tailwind preflight override the rod img needs:
                  // raw-quadrant canvases often want width past 100%.
                  maxWidth: 'none',
                }}
              />
            )}

            {hook.imageUrl && !hc.hidden && (
              <img src={hook.imageUrl} alt="hook" className={hook.glow ? 'rod-glow' : undefined} style={{
                position: 'absolute', top: `${hc.top}%`, left: `${hc.left}%`,
                width: `${hc.width}%`, transform: `rotate(${hc.rotate}deg)`,
                transformOrigin: 'center center', pointerEvents: 'none',
                maxWidth: 'none',
                ...(hook.glow ? { ['--rod-glow-color' as string]: hook.color } : {}),
              } as React.CSSProperties} />
            )}

            {[0, 1, 2].map(slot => {
              const bp = badgeCfg[slot]?.[frame as BadgeFrame]
              const badgeId = slotBadges[slot]
              const badge = badgeId ? BADGES.find(b => b.id === badgeId) : null
              if (!bp) return null
              return badge ? (
                <img key={slot} src={badge.imageUrl} alt={badge.name} style={{
                  position: 'absolute', top: `${bp.top}%`, left: `${bp.left}%`,
                  width: `${bp.width}%`, transform: `rotate(${bp.rotate}deg)`,
                  transformOrigin: 'center center', pointerEvents: 'none',
                  outline: slot === activeSlot ? '2px solid #fbbf24' : 'none',
                  outlineOffset: 2,
                }} />
              ) : (
                <div key={slot} style={{
                  position: 'absolute', top: `${bp.top}%`, left: `${bp.left}%`,
                  width: `${bp.width}%`, transform: `rotate(${bp.rotate}deg)`,
                  transformOrigin: 'center center', pointerEvents: 'none',
                  background: slot === activeSlot ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.1)',
                  borderRadius: 4, aspectRatio: '1',
                  border: slot === activeSlot ? '1px solid #fbbf24' : '1px dashed rgba(255,255,255,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>{slot + 1}</span>
                </div>
              )
            })}
          </div>
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

        {/* Character color picker */}
        <p style={{ fontWeight: 700, marginBottom: 6, color: '#fff' }}>Character color</p>
        <select
          value={characterColor}
          onChange={e => setCharacterColor(e.target.value)}
          style={{ width: '100%', marginBottom: 14, padding: '4px 6px', background: '#1e2d3e', color: '#fff', border: '1px solid #334', borderRadius: 6 }}
        >
          {CHARACTER_COLORS.map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.id === 'default' ? ' (default)' : ''}</option>
          ))}
        </select>

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

        {/* Boat overlay */}
        <p style={{ fontWeight: 700, marginBottom: 6, color: '#fff' }}>
          Boat overlay
          <button onClick={() => setBoatEnabled(!boatEnabled)} style={{
            marginLeft: 8, padding: '2px 8px', fontSize: 10, borderRadius: 4,
            background: boatEnabled ? '#16a34a' : 'rgba(255,255,255,0.08)',
            border: 'none', color: '#fff', cursor: 'pointer',
          }}>{boatEnabled ? 'On' : 'Off'}</button>
        </p>
        {boatEnabled && (
          <>
            <p style={{ fontWeight: 600, marginBottom: 4, color: '#fb923c' }}>Boat overlay ({frame})</p>
            <Slider label="top %"    value={boatCfg[frame].top}    min={-20} max={120} onChange={v => setBoatCfg(p => ({ ...p, [frame]: { ...p[frame], top: v } }))} />
            <Slider label="left %"   value={boatCfg[frame].left}   min={-50} max={100} onChange={v => setBoatCfg(p => ({ ...p, [frame]: { ...p[frame], left: v } }))} />
            <Slider label="width %"  value={boatCfg[frame].width}  min={20}  max={200} onChange={v => setBoatCfg(p => ({ ...p, [frame]: { ...p[frame], width: v } }))} />
            <Slider label="rotate °" value={boatCfg[frame].rotate} min={-30} max={30}  onChange={v => setBoatCfg(p => ({ ...p, [frame]: { ...p[frame], rotate: v } }))} />
            <button onClick={() => setBoatCfg(p => ({ rest: p[frame], wait: p[frame], cast: p[frame] }))} style={{
              width: '100%', padding: '4px 0', borderRadius: 6, cursor: 'pointer', marginTop: 6,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#94a3b8', fontWeight: 600, fontSize: 10,
            }}>Copy {frame} → all frames</button>
          </>
        )}

        {/* Hat overlay */}
        <p style={{ fontWeight: 700, marginTop: 16, marginBottom: 6, color: '#fff' }}>
          Hat overlay
          <button onClick={() => setHatEnabled(!hatEnabled)} style={{
            marginLeft: 8, padding: '2px 8px', fontSize: 10, borderRadius: 4,
            background: hatEnabled ? '#16a34a' : 'rgba(255,255,255,0.08)',
            border: 'none', color: '#fff', cursor: 'pointer',
          }}>{hatEnabled ? 'On' : 'Off'}</button>
        </p>
        {hatEnabled && (
          <>
            <p style={{ fontWeight: 600, marginBottom: 4, color: '#60a5fa' }}>
              Hat overlay ({frame} — using {frame === 'cast' ? 'hatblue_cast.png' : 'hatblue_rest.png'})
            </p>
            <Slider label="top %"    value={hatCfg[frame].top}    min={-40} max={100} step={0.1} onChange={v => setHatCfg(p => ({ ...p, [frame]: { ...p[frame], top: v } }))} />
            <Slider label="left %"   value={hatCfg[frame].left}   min={-40} max={100} step={0.1} onChange={v => setHatCfg(p => ({ ...p, [frame]: { ...p[frame], left: v } }))} />
            <Slider label="width %"  value={hatCfg[frame].width}  min={5}   max={120} step={0.1} onChange={v => setHatCfg(p => ({ ...p, [frame]: { ...p[frame], width: v } }))} />
            <Slider label="rotate °" value={hatCfg[frame].rotate} min={-90} max={90}  step={0.5} onChange={v => setHatCfg(p => ({ ...p, [frame]: { ...p[frame], rotate: v } }))} />
            <button onClick={() => setHatCfg(p => ({ rest: p[frame], wait: p[frame], cast: p[frame] }))} style={{
              width: '100%', padding: '4px 0', borderRadius: 6, cursor: 'pointer', marginTop: 6,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#94a3b8', fontWeight: 600, fontSize: 10,
            }}>Copy {frame} → all frames</button>
          </>
        )}

        {/* 3-pose rod tuner — new upload format (top-left rest,
            bottom-left wait, right cast). Picks a fully-baked sprite
            per frame so rotation is only a fine adjustment. */}
        <p style={{ fontWeight: 700, marginTop: 16, marginBottom: 6, color: '#fff' }}>
          3-pose rod
          <button onClick={() => setRodThreePose(v => !v)} style={{
            marginLeft: 8, padding: '2px 8px', fontSize: 10, borderRadius: 4,
            background: rodThreePose ? '#16a34a' : 'rgba(255,255,255,0.08)',
            border: 'none', color: '#fff', cursor: 'pointer',
          }}>{rodThreePose ? 'On' : 'Off'}</button>
        </p>
        {rodThreePose && (
          <>
            <p style={{ fontSize: 10, color: '#6b7280', marginBottom: 6 }}>
              Sprite base: <span style={{ color: '#e8c84a' }}>/{rodThreePoseName}_{`{rest,wait,cast}`}.png</span>
            </p>
            <select
              value={rodThreePoseName}
              onChange={e => setRodThreePoseName(e.target.value)}
              style={{ width: '100%', marginBottom: 10, padding: '4px 6px', background: '#1e2d3e', color: '#fff', border: '1px solid #334', borderRadius: 6 }}
            >
              <option value="rod_bamboo">rod_bamboo</option>
              <option value="rod_driftwood">rod_driftwood</option>
              <option value="rod_fiberglass">rod_fiberglass</option>
              <option value="rod_reefguard">rod_reefguard</option>
              <option value="rod_telescoping">rod_telescoping</option>
              <option value="rod_moonwood">rod_moonwood</option>
              <option value="rod_graphite">rod_graphite</option>
              <option value="rod_navigators">rod_navigators</option>
              <option value="rod_carbon">rod_carbon</option>
              <option value="rod_deepdiver">rod_deepdiver</option>
              <option value="rod_legendary">rod_legendary</option>
              <option value="rod_twinstrike">rod_twinstrike</option>
              <option value="rod_secondwind">rod_secondwind</option>
              <option value="rod_millionaires">rod_millionaires</option>
              <option value="rod_yolo">rod_yolo</option>
            </select>
            <p style={{ fontWeight: 600, marginBottom: 4, color: '#e8c84a' }}>3-pose overlay ({frame})</p>
            {/* Generous ranges: the raw-quadrant canvas (960x540, 960x1080)
                is much larger than the rod silhouette inside it, so width
                often needs to push past 100% and top/left can go strongly
                negative to anchor the visible rod portion on screen. */}
            <Slider label="top %"    value={rc.top}    min={-200} max={200} step={0.5} onChange={v => setRod('top',    v)} />
            <Slider label="left %"   value={rc.left}   min={-200} max={200} step={0.5} onChange={v => setRod('left',   v)} />
            <Slider label="width %"  value={rc.width}  min={1}    max={500} step={0.5} onChange={v => setRod('width',  v)} />
            <Slider label="rotate °" value={rc.rotate} min={-90}  max={90}  step={0.5} onChange={v => setRod('rotate', v)} />
            <button onClick={() => setRodThreePoseCfg(p => ({ rest: p[frame], wait: p[frame], cast: p[frame] }))} style={{
              width: '100%', padding: '4px 0', borderRadius: 6, cursor: 'pointer', marginTop: 6,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#94a3b8', fontWeight: 600, fontSize: 10,
            }}>Copy {frame} → all frames</button>
          </>
        )}

        {/* Reel overlay — one trimmed sprite (reel_basic.png) positioned
            per frame. Sits on the rod near the handle. */}
        <p style={{ fontWeight: 700, marginTop: 16, marginBottom: 6, color: '#fff' }}>
          Reel
          <button onClick={() => setReelEnabled(v => !v)} style={{
            marginLeft: 8, padding: '2px 8px', fontSize: 10, borderRadius: 4,
            background: reelEnabled ? '#16a34a' : 'rgba(255,255,255,0.08)',
            border: 'none', color: '#fff', cursor: 'pointer',
          }}>{reelEnabled ? 'On' : 'Off'}</button>
        </p>
        {reelEnabled && (
          <>
            <p style={{ fontSize: 10, color: '#6b7280', marginBottom: 6 }}>
              Sprite: <span style={{ color: '#a3e635' }}>/{reelName}.png</span>
            </p>
            <select
              value={reelName}
              onChange={e => setReelName(e.target.value as typeof REEL_NAMES[number])}
              style={{ width: '100%', marginBottom: 10, padding: '4px 6px', background: '#1e2d3e', color: '#fff', border: '1px solid #334', borderRadius: 6 }}
            >
              {REEL_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <p style={{ fontWeight: 600, marginBottom: 4, color: '#a3e635' }}>Reel overlay ({frame})</p>
            {/* Reels are raw 1920×1080 uploads, so the slider ranges match
                the rod ones — width often past 100%, top/left negative to
                anchor the visible reel onto the rod handle. */}
            <Slider label="top %"    value={reelCfg[frame].top}    min={-200} max={200} step={0.1} onChange={v => setReelCfg(p => ({ ...p, [frame]: { ...p[frame], top:    v } }))} />
            <Slider label="left %"   value={reelCfg[frame].left}   min={-200} max={200} step={0.1} onChange={v => setReelCfg(p => ({ ...p, [frame]: { ...p[frame], left:   v } }))} />
            <Slider label="width %"  value={reelCfg[frame].width}  min={1}    max={500} step={0.5} onChange={v => setReelCfg(p => ({ ...p, [frame]: { ...p[frame], width:  v } }))} />
            <Slider label="rotate °" value={reelCfg[frame].rotate} min={-180} max={180} step={0.5} onChange={v => setReelCfg(p => ({ ...p, [frame]: { ...p[frame], rotate: v } }))} />
            <button onClick={() => setReelCfg(p => ({ rest: p[frame], wait: p[frame], cast: p[frame] }))} style={{
              width: '100%', padding: '4px 0', borderRadius: 6, cursor: 'pointer', marginTop: 6,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#94a3b8', fontWeight: 600, fontSize: 10,
            }}>Copy {frame} → all frames</button>
          </>
        )}

        {/* Toggle for production-tuned controls */}
        <button onClick={() => setShowLegacyControls(s => !s)} style={{
          width: '100%', padding: '6px 0', borderRadius: 6, cursor: 'pointer',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
          color: '#94a3b8', fontWeight: 600, fontSize: 11, marginTop: 16, marginBottom: 14,
        }}>
          {showLegacyControls ? '▾ Hide' : '▸ Show'} character / rod / hook / badge controls
        </button>

        {showLegacyControls && (<>

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
        {/* Raw 1920×1080 hook canvases — same wide ranges as rod/reel
            because the hook core is a tiny portion of the canvas. */}
        <Slider label="top %"    value={hc.top}    min={-200} max={200} step={0.5} onChange={v => setHook('top',    v)} />
        <Slider label="left %"   value={hc.left}   min={-200} max={200} step={0.5} onChange={v => setHook('left',   v)} />
        <Slider label="width %"  value={hc.width}  min={1}    max={500} step={0.5} onChange={v => setHook('width',  v)} />
        <Slider label="rotate °" value={hc.rotate} min={-180} max={180} step={0.5} onChange={v => setHook('rotate', v)} />

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

        {/* Badge image picker for active slot */}
        <p style={{ fontWeight: 600, marginBottom: 6, color: '#fbbf24', fontSize: 11 }}>Badge in slot {activeSlot + 1}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {BADGES.map(b => {
            const selected = slotBadges[activeSlot] === b.id
            return (
              <button key={b.id} onClick={() => setSlotBadges(prev => { const next = [...prev]; next[activeSlot] = selected ? null : b.id; return next })}
                title={b.name}
                style={{
                  width: 36, height: 36, padding: 2, borderRadius: 6, cursor: 'pointer',
                  background: selected ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.05)',
                  border: selected ? '2px solid #fbbf24' : '1px solid rgba(255,255,255,0.15)',
                }}>
                <img src={b.imageUrl} alt={b.name} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
              </button>
            )
          })}
        </div>

        <p style={{ fontWeight: 600, marginBottom: 4, color: '#fbbf24' }}>Slot {activeSlot + 1} position ({frame})</p>
        <Slider label="top %"    value={bc.top}    min={-20} max={120}  onChange={v => setBadge('top',    v)} />
        <Slider label="left %"   value={bc.left}   min={-20} max={100}  onChange={v => setBadge('left',   v)} />
        <Slider label="width %"  value={bc.width}  min={2}   max={60}   onChange={v => setBadge('width',  v)} />
        <Slider label="rotate °" value={bc.rotate} min={-180} max={180} onChange={v => setBadge('rotate', v)} />

        </>)}

        {/* Config dump */}
        <p style={{ fontWeight: 700, marginTop: 18, marginBottom: 6, color: '#fff' }}>Current config</p>
        <pre className="select-text" style={{ fontSize: 9, color: '#94a3b8', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '8px', overflowX: 'auto', whiteSpace: 'pre-wrap', cursor: 'text' }}>
{`HAT:\n${JSON.stringify(hatCfg, null, 2)}\n\nBOAT:\n${JSON.stringify(boatCfg, null, 2)}${rodThreePose ? `\n\nROD (${rodThreePoseName}):\n${JSON.stringify(rodThreePoseCfg, null, 2)}` : ''}${reelEnabled ? `\n\nREEL:\n${JSON.stringify(reelCfg, null, 2)}` : ''}${showLegacyControls ? `\n\nCHAR:\n${JSON.stringify(charCfg, null, 2)}\n\nROD (legacy):\n${JSON.stringify(rodCfg, null, 2)}\n\nHOOK:\n${JSON.stringify(hookCfg, null, 2)}\n\nBADGES:\n${JSON.stringify(badgeCfg, null, 2)}` : ''}`}
        </pre>
      </div>
    </div>
  )
}
