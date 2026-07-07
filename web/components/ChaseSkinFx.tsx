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
      {/* Lightning flash lighting the character — bright white core. THE effect.
          No blend mode in the summon: mix-blend-mode breaks the summon's opacity
          fade-out (the blended layer won't fade with everything else). */}
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 44%, #ffffffdd 0%, ${color}aa 26%, ${color}44 52%, transparent 74%)`, mixBlendMode: summon ? undefined : 'screen', opacity: 0, animation: `chase-storm-flash ${summon ? 2.6 : 4}s ease-out infinite` }} />
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
          borderRadius: '50%', background: `radial-gradient(circle, ${color}66 0%, transparent 70%)`, filter: 'blur(7px)', mixBlendMode: summon ? undefined : 'screen', opacity: 0,
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

// Galaxy (Catfish) — galactic / ethereal. A drifting nebula haze in cosmic
// hues, a field of twinkling stars, and rare shooting stars streaking across —
// so the crew looks like it's swimming through deep space.
const GALAXY_STARS: [number, number, number][] = [
  // left%, top%, size multiplier
  [22, 24, 1], [70, 20, 1.3], [44, 40, 0.8], [80, 52, 1], [16, 56, 1.1],
  [58, 66, 0.9], [34, 80, 1.2], [86, 36, 0.8], [12, 40, 1], [64, 88, 1],
  [50, 30, 0.7], [30, 62, 0.9],
]
const GALAXY_NEBULA = [
  { l: 38, t: 30, s: 72, hue: '#8b7bf0', d: 0 },
  { l: 66, t: 52, s: 60, hue: '#4dc9ff', d: 2.2 },
  { l: 46, t: 72, s: 64, hue: '#b17dff', d: 4 },
]
function GalaxyFx({ color, summon }: { color: string; summon: boolean }) {
  return (
    <div className="chase-skin-fx" style={wrap(summon)}>
      {/* Nebula haze drifting behind the crew. */}
      {GALAXY_NEBULA.map((n, i) => (
        <div key={`neb-${i}`} style={{
          position: 'absolute', left: `${n.l}%`, top: `${n.t}%`, width: n.s, height: n.s, marginLeft: -n.s / 2, marginTop: -n.s / 2,
          borderRadius: '50%', background: `radial-gradient(circle, ${n.hue}66 0%, transparent 70%)`, filter: 'blur(8px)',
          mixBlendMode: summon ? undefined : 'screen', opacity: 0,
          animation: `chase-caustic ${summon ? 4.5 : 8}s ${n.d}s ease-in-out infinite`,
        }} />
      ))}
      {/* Twinkling starfield. */}
      {GALAXY_STARS.map(([l, t, sm], i) => {
        const sz = (summon ? 5 : 3.2) * sm
        return (
          <div key={`star-${i}`} style={{
            position: 'absolute', left: `${l}%`, top: `${t}%`, width: sz, height: sz, marginLeft: -sz / 2, marginTop: -sz / 2,
            background: '#ffffff', borderRadius: 1, opacity: 0,
            boxShadow: `0 0 3px #fff, 0 0 7px ${color}, 0 0 12px ${color}`,
            animation: `chase-star-twinkle ${((summon ? 1.6 : 2.8) + (i % 4) * 0.5).toFixed(2)}s ${(i * 0.24).toFixed(2)}s ease-in-out infinite`,
          }} />
        )
      })}
      {/* Rare shooting stars streaking across. */}
      {[{ top: 22, dur: summon ? 3 : 7, delay: summon ? 0.5 : 2 }, { top: 58, dur: summon ? 3.6 : 8.5, delay: summon ? 1.7 : 5 }].map((s, i) => (
        <div key={`shoot-${i}`} style={{
          position: 'absolute', left: 0, top: `${s.top}%`, width: '40%', height: 2, borderRadius: 2, opacity: 0,
          background: `linear-gradient(90deg, transparent, ${color}cc, #ffffff)`,
          boxShadow: `0 0 6px ${color}`,
          animation: `chase-shooting-star ${s.dur}s ${s.delay}s ease-out infinite`,
        }} />
      ))}
    </div>
  )
}

// Fossil (Laz) — ancient living-fossil leviathan. Warm SEPIA / aged-parchment
// (wanted-poster feel): two counter-rotating rings of runic glyphs (his stone
// astrolabe-relic), a sepia/cream haze, and glowing primordial motes rising
// UPWARD (his inverted drips) through drifting deep-sea light.
const FOSSIL_AMBER = '#ead6a6'
function FossilFx({ color, summon }: { color: string; summon: boolean }) {
  const amber = FOSSIL_AMBER
  const moteN = summon ? 16 : 11
  return (
    <div className="chase-skin-fx" style={wrap(summon)}>
      {/* Orbiting glyph rings — the ancient astrolabe-relic slowly turning. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <g style={{ transformOrigin: '50% 50%', animation: `chase-reticle-spin ${summon ? 13 : 26}s linear infinite`, opacity: summon ? 0.5 : 0.32 }}>
          <circle cx="50" cy="50" r="39" fill="none" stroke={amber} strokeWidth="0.6" strokeDasharray="2 5" />
          {Array.from({ length: 12 }).map((_, k) => (
            <line key={k} x1="50" y1="7" x2="50" y2="13" stroke={k % 2 ? amber : color} strokeWidth="1.1" transform={`rotate(${k * 30} 50 50)`} />
          ))}
        </g>
        <g style={{ transformOrigin: '50% 50%', animation: `chase-reticle-spin ${summon ? 9 : 18}s linear infinite reverse`, opacity: summon ? 0.5 : 0.3 }}>
          <circle cx="50" cy="50" r="29" fill="none" stroke={color} strokeWidth="0.5" strokeDasharray="1 6" />
          {Array.from({ length: 8 }).map((_, k) => (
            <line key={k} x1="50" y1="19" x2="50" y2="24" stroke={k % 2 ? color : amber} strokeWidth="1" transform={`rotate(${k * 45} 50 50)`} />
          ))}
        </g>
      </svg>
      {/* Jade + amber bioluminescent haze. */}
      {[{ c: color, l: 42, t: 42, s: 72, d: 0 }, { c: amber, l: 60, t: 58, s: 58, d: 2.6 }].map((h, i) => (
        <div key={`hz-${i}`} style={{
          position: 'absolute', left: `${h.l}%`, top: `${h.t}%`, width: h.s, height: h.s, marginLeft: -h.s / 2, marginTop: -h.s / 2,
          borderRadius: '50%', background: `radial-gradient(circle, ${h.c}55 0%, transparent 70%)`, filter: 'blur(9px)',
          mixBlendMode: summon ? undefined : 'screen', opacity: 0,
          animation: `chase-caustic ${summon ? 5 : 9}s ${h.d}s ease-in-out infinite`,
        }} />
      ))}
      {/* Primordial motes rising upward (inverted drips), jade + amber. */}
      {Array.from({ length: moteN }).map((_, i) => {
        const left = 8 + ((i * 77) / moteN) % 84
        const c = i % 2 ? amber : color
        const dur = (summon ? 2.4 : 4.2) + (i % 4) * 0.8
        const size = 2 + (i % 3)
        return (
          <div key={`mote-${i}`} style={{
            position: 'absolute', left: `${left}%`, top: '108%', width: size, height: size, borderRadius: '50%',
            background: c, boxShadow: `0 0 4px ${c}, 0 0 9px ${c}`, opacity: 0,
            animation: `chase-bubble-rise ${dur.toFixed(2)}s ${(i * 0.32).toFixed(2)}s linear infinite`,
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
    case 'catfish_galaxy':    return <GalaxyFx color={color} summon={summon} />
    case 'coelacanth_fossil': return <FossilFx color={color} summon={summon} />
    case 'doby_huntersbane':  return <HuntersBaneFx color={color} summon={summon} />
    default: return null
  }
}
