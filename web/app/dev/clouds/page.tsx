'use client'

// Live tuner for the fishing scene's ambient cloud overlay. Dial in the
// per-zone horizon position, cloud render size, drift speed, opacity,
// and mask fade, then copy the final values out of the "Apply" block
// at the top into ZONE_HORIZON_PCT (FishingGame.tsx) + the
// .fishing-clouds-overlay rule (globals.css). No auth, no DB writes,
// pure preview — same shape as /dev/avatar.

import { useState } from 'react'

const ZONES = ['shallows', 'open_waters', 'deep', 'abyss', 'ancient_deep'] as const
type ZoneKey = (typeof ZONES)[number]

const ZONE_BG: Record<ZoneKey, string> = {
  shallows:     '/shallows.jpg',
  open_waters:  '/openwaters.jpg',
  deep:         '/deep.jpg',
  abyss:        '/abyss.jpg',
  ancient_deep: '/ancient.jpg',
}

const ZONE_LABEL: Record<ZoneKey, string> = {
  shallows:     'Shallows',
  open_waters:  'Open Waters',
  deep:         'Deep',
  abyss:        'Abyss',
  ancient_deep: 'Ancient Deep',
}

// Initial values mirror what's live in code right now (FishingGame.tsx
// + globals.css as of 2026-05-19). Edit here and your tweaks become the
// new starting point on reload.
const INITIAL_HORIZON: Record<ZoneKey, number> = {
  shallows:     34,
  open_waters:  34,
  deep:         38,
  abyss:        40,
  ancient_deep: 0,
}

type CloudVariant = 'day' | 'sunset' | 'night' | 'none'
const ZONE_VARIANT: Record<ZoneKey, CloudVariant> = {
  shallows:     'day',
  open_waters:  'day',
  deep:         'sunset',
  abyss:        'night',
  ancient_deep: 'none',
}
// Mirror of the variant filters in globals.css so the tuner's
// inline-styled cloud overlay tints the same way the live game will.
const CLOUD_FILTER: Record<CloudVariant, string> = {
  day:    'none',
  sunset: 'sepia(0.8) hue-rotate(335deg) saturate(2.3) brightness(0.93)',
  night:  'sepia(0.7) hue-rotate(208deg) saturate(2.4) brightness(0.36) contrast(1.05)',
  none:   'none',
}
// Variants that override the base opacity in globals.css. Keep in sync
// so the tuner reflects the live look (e.g. night clouds are more
// translucent to let the dark sky show through).
const CLOUD_OPACITY_OVERRIDE: Partial<Record<CloudVariant, number>> = {
  night: 0.42,
}

export default function CloudsTunerPage() {
  const [zone, setZone] = useState<ZoneKey>('shallows')
  const [horizon, setHorizon] = useState<Record<ZoneKey, number>>(INITIAL_HORIZON)
  // Shared (non-per-zone) overlay properties. Defaults mirror the
  // values currently in globals.css's .fishing-clouds-overlay rule so
  // the tuner opens at the live state, not the pre-tuning starter set.
  const [cloudHeightPx, setCloudHeightPx] = useState(350)
  const [driftSec, setDriftSec]     = useState(1200)
  const [opacity, setOpacity]       = useState(0.65)
  const [maskStartPct, setMaskStart] = useState(68)
  const [posOffsetPx, setPosOffset] = useState(0)     // background-position-x phase offset

  // Cloud reflection on water — defaults match .fishing-clouds-reflection
  // in globals.css. Inline-overridden on the preview div so sliders are live.
  const [reflectBandPctOfScene, setReflectBandPct] = useState(14)  // band height as % of scene
  const [reflectCloudHeightPx, setReflectCloudHeight] = useState(180)
  const [reflectOpacity, setReflectOpacity] = useState(0.22)
  const [reflectDriftSec, setReflectDrift] = useState(1500)
  const [reflectMaskTop, setReflectMaskTop] = useState(25)
  const [reflectMaskBottom, setReflectMaskBottom] = useState(78)

  // Water shimmer — defaults match .fishing-water-shimmer in globals.css.
  const [shimmerBandPx, setShimmerBand] = useState(1600)
  const [shimmerDriftSec, setShimmerDrift] = useState(120)
  const [shimmerLayerOpacity, setShimmerOpacity] = useState(1.0)
  const [shimmerMaskTop, setShimmerMaskTop] = useState(18)
  const [shimmerMaskBottom, setShimmerMaskBottom] = useState(82)
  // Preview frame size — test mobile vs desktop without resizing window.
  const [previewW, setPreviewW] = useState(448)
  const [previewH, setPreviewH] = useState(720)

  const horizonPct = horizon[zone]
  const variant    = ZONE_VARIANT[zone]
  const showCloud  = horizonPct > 0 && variant !== 'none'
  const showShimmer = variant !== 'none'
  const tintSuffix =
    variant === 'sunset' ? '--sunset' :
    variant === 'night'  ? '--night'  : ''

  const generatedCss = `.fishing-clouds-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  pointer-events: none;
  background-image: url(/clouds1.webp);
  background-repeat: repeat-x;
  background-position: ${posOffsetPx}px top;
  background-size: auto ${cloudHeightPx}px;
  opacity: ${opacity.toFixed(2)};
  animation: cloudsDrift ${driftSec}s linear infinite;
  -webkit-mask-image: linear-gradient(to bottom, black ${maskStartPct}%, transparent 100%);
          mask-image: linear-gradient(to bottom, black ${maskStartPct}%, transparent 100%);
}

.fishing-clouds-reflection {
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
  background-image: url(/clouds1.webp);
  background-repeat: repeat-x;
  background-position: 0 top;
  background-size: auto ${reflectCloudHeightPx}px;
  opacity: ${reflectOpacity.toFixed(2)};
  transform: scaleY(-1);
  animation: cloudsReflectDrift ${reflectDriftSec}s linear infinite;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black ${reflectMaskTop}%, black ${reflectMaskBottom}%, transparent 100%);
          mask-image: linear-gradient(to bottom, transparent 0%, black ${reflectMaskTop}%, black ${reflectMaskBottom}%, transparent 100%);
}
/* Note: reflection band height (currently ${reflectBandPctOfScene}% of scene)
   is set inline on the div in FishingGame.tsx via the height style. */

.fishing-water-shimmer {
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
  background-image: linear-gradient(85deg,
    transparent 0%,
    rgba(255,255,255,0.08) 12%,
    transparent 22%,
    transparent 48%,
    rgba(255,255,255,0.06) 55%,
    transparent 64%,
    transparent 82%,
    rgba(255,255,255,0.05) 90%,
    transparent 100%);
  background-size: ${shimmerBandPx}px 100%;
  background-repeat: repeat-x;
  opacity: ${shimmerLayerOpacity.toFixed(2)};
  animation: waterShimmerDrift ${shimmerDriftSec}s linear infinite;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black ${shimmerMaskTop}%, black ${shimmerMaskBottom}%, transparent 100%);
          mask-image: linear-gradient(to bottom, transparent 0%, black ${shimmerMaskTop}%, black ${shimmerMaskBottom}%, transparent 100%);
}
/* Variant tints (--sunset / --night) for clouds, reflection, and shimmer
   are unchanged by the tuner — edit the filter / gradient stops directly
   in globals.css if you want to dial those. */`

  const generatedHorizon = `const ZONE_HORIZON_PCT: Record<string, number> = {
  shallows:     ${horizon.shallows},
  open_waters:  ${horizon.open_waters},
  deep:         ${horizon.deep},
  abyss:        ${horizon.abyss},
  ancient_deep: ${horizon.ancient_deep},
}

// Per-zone time-of-day tint. Drives the variant modifier class applied
// to the cloud / reflection / shimmer overlays. Unchanged by the tuner.
type CloudVariant = 'day' | 'sunset' | 'night' | 'none'
const ZONE_CLOUD_VARIANT: Record<string, CloudVariant> = {
  shallows:     'day',
  open_waters:  'day',
  deep:         'sunset',
  abyss:        'night',
  ancient_deep: 'none',
}`

  function setZoneHorizon(z: ZoneKey, v: number) {
    setHorizon(prev => ({ ...prev, [z]: v }))
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#0a1018',
      color: '#f0ede8',
      padding: '1.5rem',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Keyframe — duplicated here so the tuner doesn't depend on the
          live globals.css value (the live one is fixed by the build). */}
      <style>{`
        @keyframes cloudsDriftTuner {
          from { background-position-x: ${posOffsetPx}px; }
          to   { background-position-x: ${posOffsetPx - 8000}px; }
        }
      `}</style>

      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.25rem' }}>Clouds Tuner</h1>
      <p style={{ fontSize: '0.85rem', color: '#9a9690', marginBottom: '1.25rem' }}>
        Resize the preview, swap zones, dial values. Copy the two blocks at the bottom into the code when you&apos;re happy.
      </p>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* ── Preview ── */}
        <div style={{ flex: '0 0 auto' }}>
          <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {ZONES.map(z => (
              <button
                key={z}
                onClick={() => setZone(z)}
                style={{
                  padding: '0.35rem 0.7rem',
                  borderRadius: 8,
                  border: zone === z ? '1px solid #f0c040' : '1px solid rgba(255,255,255,0.18)',
                  background: zone === z ? 'rgba(240,192,64,0.16)' : 'rgba(255,255,255,0.04)',
                  color: zone === z ? '#f0c040' : '#cfcabf',
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                }}
              >
                {ZONE_LABEL[z]}
              </button>
            ))}
          </div>

          {/* The mock — same structure as FishingGame's scene container */}
          <div style={{
            position: 'relative',
            width: previewW,
            height: previewH,
            overflow: 'hidden',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.12)',
            background: '#000',
          }}>
            {/* Painted backdrop */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ZONE_BG[zone]}
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
            />

            {/* Cloud overlay — applies the tunable values inline. The
                variant `filter` mirrors what the live game's
                .fishing-clouds-overlay--{sunset,night} class does. */}
            {showCloud && (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0,
                  height: `${horizonPct}%`,
                  pointerEvents: 'none',
                  backgroundImage: 'url(/clouds1.webp)',
                  backgroundRepeat: 'repeat-x',
                  backgroundPosition: `${posOffsetPx}px top`,
                  backgroundSize: `auto ${cloudHeightPx}px`,
                  opacity: CLOUD_OPACITY_OVERRIDE[variant] ?? opacity,
                  animation: `cloudsDriftTuner ${driftSec}s linear infinite`,
                  filter: CLOUD_FILTER[variant],
                  WebkitMaskImage: `linear-gradient(to bottom, black ${maskStartPct}%, transparent 100%)`,
                  maskImage: `linear-gradient(to bottom, black ${maskStartPct}%, transparent 100%)`,
                }}
              />
            )}

            {/* Cloud reflection on water — className supplies the bg
                image + animation name + variant filter + scaleY flip.
                Inline overrides the tunable bits so sliders are live. */}
            {showCloud && (
              <div
                aria-hidden
                className={`fishing-clouds-reflection${tintSuffix ? ` fishing-clouds-reflection${tintSuffix}` : ''}`}
                style={{
                  top: `${horizonPct}%`,
                  height: `${reflectBandPctOfScene}%`,
                  backgroundSize: `auto ${reflectCloudHeightPx}px`,
                  opacity: reflectOpacity,
                  animationDuration: `${reflectDriftSec}s`,
                  WebkitMaskImage: `linear-gradient(to bottom, transparent 0%, black ${reflectMaskTop}%, black ${reflectMaskBottom}%, transparent 100%)`,
                  maskImage: `linear-gradient(to bottom, transparent 0%, black ${reflectMaskTop}%, black ${reflectMaskBottom}%, transparent 100%)`,
                }}
              />
            )}

            {/* Water surface shimmer — className supplies the gradient
                bands (per-variant color) + animation name. Inline
                overrides size, drift, opacity, mask. */}
            {showShimmer && (
              <div
                aria-hidden
                className={`fishing-water-shimmer${tintSuffix ? ` fishing-water-shimmer${tintSuffix}` : ''}`}
                style={{
                  top: `${horizonPct}%`,
                  bottom: 0,
                  backgroundSize: `${shimmerBandPx}px 100%`,
                  animationDuration: `${shimmerDriftSec}s`,
                  opacity: shimmerLayerOpacity,
                  WebkitMaskImage: `linear-gradient(to bottom, transparent 0%, black ${shimmerMaskTop}%, black ${shimmerMaskBottom}%, transparent 100%)`,
                  maskImage: `linear-gradient(to bottom, transparent 0%, black ${shimmerMaskTop}%, black ${shimmerMaskBottom}%, transparent 100%)`,
                }}
              />
            )}

            {/* Horizon guide line — visual reference for tuning the
                horizon %. Toggle off by setting opacity to 0 in code. */}
            <div style={{
              position: 'absolute', top: `${horizonPct}%`, left: 0, right: 0,
              borderTop: '1px dashed rgba(255,80,80,0.45)', pointerEvents: 'none',
            }} />
          </div>

          {/* Preview-size sliders */}
          <div style={{ marginTop: '0.85rem', display: 'grid', gridTemplateColumns: '90px 1fr 55px', gap: '0.5rem', alignItems: 'center', fontSize: '0.74rem' }}>
            <label>Preview W</label>
            <input type="range" min={280} max={1400} value={previewW} onChange={e => setPreviewW(+e.target.value)} />
            <span style={{ textAlign: 'right', color: '#9a9690' }}>{previewW}</span>
            <label>Preview H</label>
            <input type="range" min={400} max={1100} value={previewH} onChange={e => setPreviewH(+e.target.value)} />
            <span style={{ textAlign: 'right', color: '#9a9690' }}>{previewH}</span>
          </div>
          <p style={{ marginTop: '0.5rem', fontSize: '0.68rem', color: '#7a7674', lineHeight: 1.4 }}>
            The dashed red line is the horizon for the current zone. Adjust the per-zone horizon slider so the line matches the painted horizon, then dial cloud size/speed/opacity.
          </p>
        </div>

        {/* ── Controls ── */}
        <div style={{ flex: '1 1 320px', minWidth: 280, maxWidth: 520 }}>
          <Section title="Per-zone horizon">
            {ZONES.map(z => (
              <Slider
                key={z}
                label={ZONE_LABEL[z]}
                value={horizon[z]}
                min={0} max={70} step={1} unit="%"
                onChange={v => setZoneHorizon(z, v)}
              />
            ))}
            <p style={{ fontSize: '0.65rem', color: '#7a7674', marginTop: '0.35rem', lineHeight: 1.4 }}>
              Set a zone to 0 to hide clouds (underwater zones). Match the dashed red line to the painted horizon.
            </p>
          </Section>

          <Section title="Sky clouds (shared across zones)">
            <Slider label="Cloud height" value={cloudHeightPx} min={80} max={600} step={5} unit="px" onChange={setCloudHeightPx} />
            <Slider label="Drift speed"  value={driftSec}      min={60} max={1200} step={10} unit="s loop" onChange={setDriftSec} />
            <Slider label="Opacity"      value={opacity}       min={0} max={1} step={0.05} onChange={setOpacity} />
            <Slider label="Mask start"   value={maskStartPct}  min={20} max={100} step={1} unit="%" onChange={setMaskStart} />
            <Slider label="Pos offset"   value={posOffsetPx}   min={-8000} max={0} step={20} unit="px" onChange={setPosOffset} />
          </Section>

          <Section title="Cloud reflection (mirrored on water)">
            <Slider label="Band height"  value={reflectBandPctOfScene} min={0} max={40} step={1} unit="% of scene" onChange={setReflectBandPct} />
            <Slider label="Cloud height" value={reflectCloudHeightPx}  min={60} max={400} step={5} unit="px" onChange={setReflectCloudHeight} />
            <Slider label="Opacity"      value={reflectOpacity}        min={0} max={1} step={0.02} onChange={setReflectOpacity} />
            <Slider label="Drift speed"  value={reflectDriftSec}       min={60} max={2400} step={20} unit="s loop" onChange={setReflectDrift} />
            <Slider label="Mask top"     value={reflectMaskTop}        min={0} max={50} step={1} unit="%" onChange={setReflectMaskTop} />
            <Slider label="Mask bottom"  value={reflectMaskBottom}     min={50} max={100} step={1} unit="%" onChange={setReflectMaskBottom} />
          </Section>

          <Section title="Water shimmer (light bands sweeping the water)">
            <Slider label="Band width"   value={shimmerBandPx}       min={400} max={3000} step={20} unit="px" onChange={setShimmerBand} />
            <Slider label="Drift speed"  value={shimmerDriftSec}     min={30} max={400} step={5} unit="s loop" onChange={setShimmerDrift} />
            <Slider label="Layer opacity" value={shimmerLayerOpacity} min={0} max={1} step={0.05} onChange={setShimmerOpacity} />
            <Slider label="Mask top"     value={shimmerMaskTop}      min={0} max={50} step={1} unit="%" onChange={setShimmerMaskTop} />
            <Slider label="Mask bottom"  value={shimmerMaskBottom}   min={50} max={100} step={1} unit="%" onChange={setShimmerMaskBottom} />
            <p style={{ gridColumn: '1 / -1', fontSize: '0.62rem', color: '#7a7674', lineHeight: 1.4, marginTop: '0.2rem' }}>
              The shimmer&apos;s highlight color is set per-variant via CSS class
              (warm amber for sunset, cool blue for night). To dial the
              colors themselves, edit the linear-gradient stops in
              globals.css directly.
            </p>
          </Section>
        </div>
      </div>

      {/* ── Output ── */}
      <div style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <CodeBlock title="Paste into FishingGame.tsx (replace ZONE_HORIZON_PCT)" code={generatedHorizon} />
        <CodeBlock title="Paste into globals.css (replace .fishing-clouds-overlay rule)" code={generatedCss} />
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: '0.85rem 0.95rem',
      marginBottom: '0.85rem',
    }}>
      <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9a9690', marginBottom: '0.6rem' }}>{title}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 75px', gap: '0.45rem 0.6rem', alignItems: 'center', fontSize: '0.78rem' }}>
        {children}
      </div>
    </div>
  )
}

function Slider({ label, value, min, max, step = 1, unit = '', onChange }: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (v: number) => void
}) {
  return (
    <>
      <label style={{ color: '#cfcabf' }}>{label}</label>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(+e.target.value)}
        style={{ width: '100%' }}
      />
      <span style={{ textAlign: 'right', color: '#9a9690', fontVariantNumeric: 'tabular-nums' }}>
        {step < 1 ? value.toFixed(2) : value}{unit && ` ${unit}`}
      </span>
    </>
  )
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem' }}>
        <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9a9690' }}>{title}</p>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code).then(
              () => { setCopied(true); setTimeout(() => setCopied(false), 1400) },
              () => {},
            )
          }}
          style={{
            fontSize: '0.62rem',
            padding: '0.25rem 0.55rem',
            borderRadius: 6,
            border: '1px solid rgba(240,192,64,0.45)',
            background: copied ? 'rgba(74,222,128,0.16)' : 'rgba(240,192,64,0.12)',
            color: copied ? '#4ade80' : '#f0c040',
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {/* select-text: globals.css sets user-select: none app-wide, so a bare
          <pre> is unhighlightable. The Copy button above is the main path;
          this makes hand-picking a few lines possible too. */}
      <pre className="select-text" style={{
        background: '#04080e',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding: '0.7rem 0.85rem',
        fontSize: '0.72rem',
        color: '#cfe1f5',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        margin: 0,
        fontFamily: 'ui-monospace, Menlo, monospace',
      }}>{code}</pre>
    </div>
  )
}
