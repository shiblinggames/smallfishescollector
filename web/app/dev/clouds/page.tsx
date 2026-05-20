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
  deep:         0,
  abyss:        0,
  ancient_deep: 0,
}

export default function CloudsTunerPage() {
  const [zone, setZone] = useState<ZoneKey>('shallows')
  const [horizon, setHorizon] = useState<Record<ZoneKey, number>>(INITIAL_HORIZON)
  // Shared (non-per-zone) overlay properties.
  const [cloudHeightPx, setCloudHeightPx] = useState(260)
  const [driftSec, setDriftSec]     = useState(480)
  const [opacity, setOpacity]       = useState(0.7)
  const [maskStartPct, setMaskStart] = useState(70)   // where bottom fade begins (% of cloud band)
  const [posOffsetPx, setPosOffset] = useState(0)     // background-position-x phase offset
  // Preview frame size — test mobile vs desktop without resizing window.
  const [previewW, setPreviewW] = useState(448)
  const [previewH, setPreviewH] = useState(720)

  const horizonPct = horizon[zone]
  const showCloud  = horizonPct > 0

  const generatedCss = `.fishing-clouds-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  pointer-events: none;
  background-image: url(/clouds1.png);
  background-repeat: repeat-x;
  background-position: ${posOffsetPx}px top;
  background-size: auto ${cloudHeightPx}px;
  opacity: ${opacity.toFixed(2)};
  animation: cloudsDrift ${driftSec}s linear infinite;
  -webkit-mask-image: linear-gradient(to bottom, black ${maskStartPct}%, transparent 100%);
          mask-image: linear-gradient(to bottom, black ${maskStartPct}%, transparent 100%);
}`

  const generatedHorizon = `const ZONE_HORIZON_PCT: Record<string, number> = {
  shallows:     ${horizon.shallows},
  open_waters:  ${horizon.open_waters},
  deep:         ${horizon.deep},
  abyss:        ${horizon.abyss},
  ancient_deep: ${horizon.ancient_deep},
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

            {/* Cloud overlay — applies the tunable values inline */}
            {showCloud && (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0,
                  height: `${horizonPct}%`,
                  pointerEvents: 'none',
                  backgroundImage: 'url(/clouds1.png)',
                  backgroundRepeat: 'repeat-x',
                  backgroundPosition: `${posOffsetPx}px top`,
                  backgroundSize: `auto ${cloudHeightPx}px`,
                  opacity,
                  animation: `cloudsDriftTuner ${driftSec}s linear infinite`,
                  WebkitMaskImage: `linear-gradient(to bottom, black ${maskStartPct}%, transparent 100%)`,
                  maskImage: `linear-gradient(to bottom, black ${maskStartPct}%, transparent 100%)`,
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

          <Section title="Cloud appearance (shared across zones)">
            <Slider label="Cloud height" value={cloudHeightPx} min={80} max={600} step={5} unit="px" onChange={setCloudHeightPx} />
            <Slider label="Drift speed"  value={driftSec}      min={60} max={1200} step={10} unit="s loop" onChange={setDriftSec} />
            <Slider label="Opacity"      value={opacity}       min={0} max={1} step={0.05} onChange={setOpacity} />
            <Slider label="Mask start"   value={maskStartPct}  min={20} max={100} step={1} unit="%" onChange={setMaskStart} />
            <Slider label="Pos offset"   value={posOffsetPx}   min={-8000} max={0} step={20} unit="px" onChange={setPosOffset} />
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
      <pre style={{
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
