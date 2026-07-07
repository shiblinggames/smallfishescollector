'use client'

// Per-chase-skin SIGNATURE effect, rendered as an overlay that fills its
// (position:relative) parent and sits directly over the crew ART. One reusable
// component for every surface: pass the skin id + accent colour and a variant.
//   variant 'ambient'  — subtle continuous loop on card surfaces (roster card,
//                        showcase poster, skin tile, detail portrait).
//   variant 'summon'   — bolder pass over the big summoned character in raids.
// The parent clips the overlay on card surfaces (overflow/clip-path); the
// summon lets it spill past the character. Keyframes live in globals.css.

type Variant = 'ambient' | 'summon'

// The overlay always CLIPS to its parent (the crew-art box) so every signature
// effect stays around the art and never spills onto the rest of the screen. No
// z-index — it layers by DOM order (above the art image it follows, beneath any
// chrome placed after it: frame lines, nameplates, badges, captions).
const wrap = (_summon: boolean): React.CSSProperties => ({
  position: 'absolute', inset: 0, pointerEvents: 'none',
  overflow: 'hidden',
})

// A forked lightning bolt radiating from near the centre toward `ang` (degrees)
// to length `len`, in the 0-100 viewBox. Sharp, many-segment jitter (barely
// tapered) so it looks like a real jagged strike, plus 1-2 branch forks. Returns
// all polyline point-strings (main first). Deterministic (seeded).
function makeBolt(ang: number, len: number, seed: number): string[] {
  let s = seed >>> 0
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  const rad = (ang * Math.PI) / 180
  const dx = Math.cos(rad), dy = Math.sin(rad), px = -dy, py = dx
  const cx = 50, cy = 50, start = 6, segs = 9
  const cl: { x: number; y: number }[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const r = start + t * (len - start)
    const taper = Math.pow(Math.sin(t * Math.PI), 0.5)   // stays jagged along most of its length
    const j = (rnd() * 2 - 1) * 17 * taper
    cl.push({ x: cx + dx * r + px * j, y: cy + dy * r + py * j })
  }
  const toStr = (arr: { x: number; y: number }[]) => arr.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const parts = [toStr(cl)]
  const branches = 1 + (rnd() > 0.5 ? 1 : 0)
  for (let b = 0; b < branches; b++) {
    const ki = 3 + Math.floor(rnd() * 4)
    const bp = cl[Math.min(ki, segs)]
    const fa = rad + (rnd() * 2 - 1) * 1.0
    const fdx = Math.cos(fa), fdy = Math.sin(fa), fpx = -fdy, fpy = fdx
    const flen = len * (0.25 + 0.22 * rnd()), fseg = 4
    const fl: { x: number; y: number }[] = []
    for (let i = 0; i <= fseg; i++) {
      const t = i / fseg
      const taper = Math.pow(Math.sin(t * Math.PI), 0.5)
      const j = (rnd() * 2 - 1) * 9 * taper
      fl.push({ x: bp.x + fdx * (t * flen) + fpx * j, y: bp.y + fdy * (t * flen) + fpy * j })
    }
    parts.push(toStr(fl))
  }
  return parts
}

// Tempest (Mako) — thunder god. Real forked lightning STRIKES crack around the
// crew from random directions: a bolt flashes on one side, holds dark, another
// snaps out elsewhere. Slow, staggered cycles — not a fast constant strobe.
const TEMPEST_BOLTS: [number, number][] = [
  [18, 46], [60, 40], [100, 44], [145, 41], [190, 45], [232, 40], [270, 44], [312, 41], [340, 46],
]
function TempestFx({ color, summon }: { color: string; summon: boolean }) {
  const sw = summon ? 1.2 : 0.85
  return (
    <div className="chase-skin-fx" style={wrap(summon)}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
        {TEMPEST_BOLTS.map(([ang, len], i) => {
          const parts = makeBolt(ang, len, i * 131 + 7)
          const dur = (summon ? 2.8 : 4.2) + (i % 5) * 0.6
          const delay = ((i * 0.83) % dur).toFixed(2)
          return (
            <g key={i} style={{ opacity: 0, filter: `drop-shadow(0 0 1.5px ${color}) drop-shadow(0 0 5px ${color}) drop-shadow(0 0 10px ${color})`, animation: `chase-lightning ${dur.toFixed(2)}s ${delay}s infinite` }}>
              {parts.map((pts, j) => (
                <polyline key={j} points={pts} fill="none" stroke="#ffffff" strokeWidth={j === 0 ? sw : sw * 0.6} strokeLinejoin="round" strokeLinecap="round" />
              ))}
            </g>
          )
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 48%, ${color}26 0%, transparent 60%)`, mixBlendMode: 'screen', animation: `chase-electric-pulse ${(summon ? 2.8 : 4.2).toFixed(1)}s ease-in-out infinite` }} />
    </div>
  )
}

// A tapering, curling tentacle as a filled outline in the 0-100 viewBox, rising
// from (baseX, baseY) pointing `startAngleDeg` and curling by `curlDeg` (curl
// tightens toward the tip). Returns the fill path + sucker dots down its length.
function makeTentacle(baseX: number, baseY: number, startAngleDeg: number, curlDeg: number, length: number, maxW: number) {
  const N = 16
  let x = baseX, y = baseY, ang = (startAngleDeg * Math.PI) / 180
  const curlRad = (curlDeg * Math.PI) / 180
  const step = length / N
  const center: { x: number; y: number }[] = []
  for (let i = 0; i <= N; i++) {
    center.push({ x, y })
    const t = i / N
    x += Math.cos(ang) * step
    y += Math.sin(ang) * step
    ang += (curlRad * (0.35 + 1.3 * t)) / N     // curl tightens toward the tip
  }
  const left: string[] = [], right: string[] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const hw = maxW * Math.pow(1 - t, 0.9) + 0.15   // taper to a point
    const p0 = center[Math.max(0, i - 1)], p1 = center[Math.min(N, i + 1)]
    const tx = p1.x - p0.x, ty = p1.y - p0.y
    const tl = Math.hypot(tx, ty) || 1
    const nx = -ty / tl, ny = tx / tl
    const c = center[i]
    left.push(`${(c.x + nx * hw).toFixed(1)},${(c.y + ny * hw).toFixed(1)}`)
    right.push(`${(c.x - nx * hw).toFixed(1)},${(c.y - ny * hw).toFixed(1)}`)
  }
  const d = `M${left.join(' L')} L${right.reverse().join(' L')} Z`
  const suckers: { x: number; y: number; r: number }[] = []
  for (let i = 3; i < N - 1; i += 2) {
    const c = center[i]
    suckers.push({ x: +c.x.toFixed(1), y: +c.y.toFixed(1), r: +Math.max(0.5, maxW * Math.pow(1 - i / N, 0.9) * 0.4).toFixed(1) })
  }
  return { d, suckers }
}

// Kraken Hunter (Dole) — the deep. Tapering, sucker-lined tentacles curl up and
// wrap around the character; bubbles rise past it.
const KRAKEN_TENTS = [
  { bx: 13, ang: -78, curl: 95, len: 74, w: 6.5 },
  { bx: 87, ang: -102, curl: -95, len: 74, w: 6.5 },
  { bx: 30, ang: -86, curl: 62, len: 62, w: 5 },
  { bx: 70, ang: -94, curl: -62, len: 62, w: 5 },
  { bx: 50, ang: -90, curl: 34, len: 54, w: 4.3 },
]
function KrakenFx({ color, summon }: { color: string; summon: boolean }) {
  const count = summon ? 12 : 8
  return (
    <div className="chase-skin-fx" style={wrap(summon)}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
        {KRAKEN_TENTS.map((t, i) => {
          const { d, suckers } = makeTentacle(t.bx, 104, t.ang, t.curl, t.len, t.w * (summon ? 1.12 : 1))
          return (
            <g key={i} style={{ transformOrigin: '50% 100%', transformBox: 'fill-box', animation: `chase-tentacle-sway ${((summon ? 2.2 : 3.8) + (i % 3) * 0.5).toFixed(1)}s ${(i * 0.3).toFixed(1)}s ease-in-out infinite`, opacity: summon ? 0.9 : 0.5 }}>
              <path d={d} fill={color} fillOpacity={0.6} style={{ filter: `drop-shadow(0 0 4px ${color}bb)` }} />
              {suckers.map((s, j) => (
                <circle key={j} cx={s.x} cy={s.y} r={s.r} fill="#eafffb" fillOpacity={0.55} />
              ))}
            </g>
          )
        })}
      </svg>
      {Array.from({ length: count }).map((_, i) => {
        const left = 8 + ((i * 83) / count) % 84
        const dur = (summon ? 1.7 : 3.1) + (i % 3) * 0.6
        const size = 3 + (i % 3) * 2
        return (
          <div key={i} style={{ position: 'absolute', left: `${left}%`, top: '108%', width: size, height: size, borderRadius: '50%', border: `1px solid ${color}bb`, background: `${color}22`, boxShadow: `0 0 4px ${color}88`, animation: `chase-bubble-rise ${dur}s ${(i * 0.34).toFixed(2)}s linear infinite`, opacity: summon ? 0.9 : 0.5 }} />
        )
      })}
    </div>
  )
}

// Prismatic (Catfish) — spectrum gem-sparkles twinkle across the art, each in
// a different hue so the whole thing reads as refracted light.
const PRISM_HUES = ['#ff4d6d', '#ff9f43', '#ffe14d', '#4dff9e', '#4dc9ff', '#b17dff', '#ff6ad5']
const PRISM_PTS = [
  { l: 26, t: 30 }, { l: 68, t: 26 }, { l: 45, t: 50 }, { l: 80, t: 58 }, { l: 16, t: 60 },
  { l: 57, t: 74 }, { l: 34, t: 84 }, { l: 84, t: 40 }, { l: 12, t: 42 }, { l: 62, t: 90 },
]
function PrismaticFx({ summon }: { summon: boolean }) {
  const dur = summon ? 1.1 : 2.4
  const sz = summon ? 12 : 7
  return (
    <div className="chase-skin-fx" style={wrap(summon)}>
      {PRISM_PTS.map((p, i) => {
        const h = PRISM_HUES[i % PRISM_HUES.length]
        return (
          <div key={i} style={{
            position: 'absolute', left: `${p.l}%`, top: `${p.t}%`, width: sz, height: sz, marginLeft: -sz / 2, marginTop: -sz / 2,
            background: '#ffffff', borderRadius: 1, opacity: 0,
            boxShadow: `0 0 4px #fff, 0 0 9px ${h}, 0 0 15px ${h}`,
            animation: `chase-prism-twinkle ${dur}s ${(i * 0.26).toFixed(2)}s ease-in-out infinite`,
          }} />
        )
      })}
    </div>
  )
}

// Hunter's Bane (Doby) — assassin. A targeting reticle slowly turns and the
// lock brackets pulse in on the mark. No sweep — it's a scope settling on prey.
function HuntersBaneFx({ color, summon }: { color: string; summon: boolean }) {
  const bw = summon ? 2.5 : 1.6                 // bracket arm thickness (px)
  const arm = summon ? '24%' : '26%'            // bracket arm length
  const corners: React.CSSProperties[] = [
    { top: 0, left: 0, borderTop: `${bw}px solid ${color}`, borderLeft: `${bw}px solid ${color}` },
    { top: 0, right: 0, borderTop: `${bw}px solid ${color}`, borderRight: `${bw}px solid ${color}` },
    { bottom: 0, left: 0, borderBottom: `${bw}px solid ${color}`, borderLeft: `${bw}px solid ${color}` },
    { bottom: 0, right: 0, borderBottom: `${bw}px solid ${color}`, borderRight: `${bw}px solid ${color}` },
  ]
  return (
    <div className="chase-skin-fx" style={wrap(summon)}>
      {/* Slow-turning reticle rings + tick marks. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <g style={{ transformOrigin: '50% 50%', animation: `chase-reticle-spin ${summon ? 9 : 18}s linear infinite`, opacity: summon ? 0.6 : 0.35 }}>
          <circle cx="50" cy="50" r="37" fill="none" stroke={color} strokeWidth="0.7" strokeDasharray="3 4" />
          <circle cx="50" cy="50" r="26" fill="none" stroke={color} strokeWidth="0.5" />
          {[0, 90, 180, 270].map(a => (
            <line key={a} x1="50" y1="7" x2="50" y2="16" stroke={color} strokeWidth="1" transform={`rotate(${a} 50 50)`} />
          ))}
        </g>
      </svg>
      {/* Lock brackets that pulse in on the target. */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: '58%', height: '58%', marginLeft: '-29%', marginTop: '-29%', transformOrigin: '50% 50%', animation: `chase-reticle-lock ${summon ? 1.7 : 3.2}s ease-in-out infinite`, filter: `drop-shadow(0 0 3px ${color})` }}>
        {corners.map((c, i) => (
          <div key={i} style={{ position: 'absolute', width: arm, height: arm, ...c }} />
        ))}
      </div>
    </div>
  )
}

export function ChaseSkinFx({ skinId, color, variant = 'ambient' }: { skinId: string | null | undefined; color: string; variant?: Variant }) {
  const summon = variant === 'summon'
  switch (skinId) {
    case 'mako_tempest':     return <TempestFx color={color} summon={summon} />
    case 'dole_krakenhunter': return <KrakenFx color={color} summon={summon} />
    case 'catfish_prismatic': return <PrismaticFx summon={summon} />
    case 'doby_huntersbane':  return <HuntersBaneFx color={color} summon={summon} />
    default: return null
  }
}
