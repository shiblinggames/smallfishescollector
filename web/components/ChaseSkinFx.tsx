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

// Tempest (Mako) — electric storm. A lightning FLASH lights the character and
// bright sparks crackle erratically around it. No drawn bolts.
const SPARK_PTS: [number, number][] = [
  [30, 30], [70, 40], [46, 62], [22, 52], [64, 74],
]
function TempestFx({ color, summon }: { color: string; summon: boolean }) {
  const sz = summon ? 3 : 2
  return (
    <div className="chase-skin-fx" style={wrap(summon)}>
      {/* Lightning flash lighting the character — bright white core. THE effect. */}
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 44%, #ffffffdd 0%, ${color}aa 26%, ${color}44 52%, transparent 74%)`, mixBlendMode: 'screen', opacity: 0, animation: `chase-storm-flash ${summon ? 2.6 : 4}s ease-out infinite` }} />
      {/* Rare, subtle sparks — occasional accents, not the focus. */}
      {SPARK_PTS.map(([l, t], i) => (
        <div key={i} style={{
          position: 'absolute', left: `${l}%`, top: `${t}%`, width: sz, height: sz, marginLeft: -sz / 2, marginTop: -sz / 2,
          borderRadius: '50%', background: color, boxShadow: `0 0 2px ${color}, 0 0 5px ${color}`, opacity: 0,
          animation: `chase-spark-crackle ${((summon ? 3 : 4.6) + (i % 5) * 0.7).toFixed(2)}s ${(i * 0.9).toFixed(2)}s infinite`,
        }} />
      ))}
    </div>
  )
}

// Kraken Hunter (Dole) — the abyss. Rising bubbles + slow drifting caustic light
// (dappled underwater glow). No tentacles.
const CAUSTICS: { l: number; t: number; s: number; d: number }[] = [
  { l: 34, t: 26, s: 68, d: 0 }, { l: 66, t: 44, s: 58, d: 1.7 }, { l: 50, t: 66, s: 62, d: 3.1 },
]
function KrakenFx({ color, summon }: { color: string; summon: boolean }) {
  const count = summon ? 15 : 10
  return (
    <div className="chase-skin-fx" style={wrap(summon)}>
      {/* Dappled underwater light drifting behind the crew. */}
      {CAUSTICS.map((c, i) => (
        <div key={`c${i}`} style={{
          position: 'absolute', left: `${c.l}%`, top: `${c.t}%`, width: c.s, height: c.s, marginLeft: -c.s / 2, marginTop: -c.s / 2,
          borderRadius: '50%', background: `radial-gradient(circle, ${color}66 0%, transparent 70%)`, filter: 'blur(7px)', mixBlendMode: 'screen', opacity: 0,
          animation: `chase-caustic ${summon ? 4 : 7}s ${c.d}s ease-in-out infinite`,
        }} />
      ))}
      {/* Bubbles rising past the crew. */}
      {Array.from({ length: count }).map((_, i) => {
        const left = 6 + ((i * 79) / count) % 88
        const dur = (summon ? 1.9 : 3.4) + (i % 4) * 0.7
        const size = 2 + (i % 4) * 1.7
        return (
          <div key={i} style={{ position: 'absolute', left: `${left}%`, top: '108%', width: size, height: size, borderRadius: '50%', border: `1px solid ${color}bb`, background: `${color}22`, boxShadow: `0 0 4px ${color}99`, animation: `chase-bubble-rise ${dur.toFixed(2)}s ${(i * 0.3).toFixed(2)}s linear infinite`, opacity: summon ? 0.85 : 0.5 }} />
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
