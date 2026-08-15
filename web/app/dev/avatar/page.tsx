'use client'

// Live tuner for the profile avatar crop. Dial in the zoom width + focal
// point (the two CSS values that drive how much of the character + bandana
// is visible in the circular avatar) and copy the final values back into
// ProfileClient.tsx. No auth, no DB writes — pure preview.

import { useState } from 'react'
import { CHARACTER_COLORS, getCharacterSprites } from '@/lib/characters'
import { HATS, getHat } from '@/lib/hats'

export default function AvatarTunerPage() {
  const [colorId,  setColorId]  = useState('default')
  const [hatId,    setHatId]    = useState<string | null>('black')
  const [zoom,     setZoom]     = useState(420)   // matches current ProfileClient default
  const [focalX,   setFocalX]   = useState(60)
  const [focalY,   setFocalY]   = useState(68)

  const charSprites = getCharacterSprites(colorId)
  const hat = getHat(hatId)

  const previews = [
    { label: '68 px (current profile)',  size: 68  },
    { label: '46 px (color swatch)',     size: 46  },
    { label: '120 px',                   size: 120 },
    { label: '200 px',                   size: 200 },
  ]

  function renderAvatar(size: number) {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: 'radial-gradient(circle at 38% 35%, #2c4d72ee 0%, #2c4d7277 100%)',
        border: '2px solid #2c4d7255',
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute',
          width: `${zoom}%`,
          left: '50%', top: '50%',
          transform: `translate(-${focalX}%, -${focalY}%)`,
          pointerEvents: 'none',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={charSprites.rest} alt="" style={{ width: '100%', display: 'block' }} />
          {hat && (() => {
            const hp = hat.positions.rest
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hat.restImageUrl} alt="" style={{
                position: 'absolute',
                top: `${hp.top}%`,
                left: `${hp.left}%`,
                width: `${hp.width}%`,
                transform: `rotate(${hp.rotate}deg)`,
                transformOrigin: 'center center',
                pointerEvents: 'none',
              }} />
            )
          })()}
        </div>
      </div>
    )
  }

  const cssSnippet = `<div style={{
  position: 'absolute',
  width: '${zoom}%',
  left: '50%', top: '50%',
  transform: 'translate(-${focalX}%, -${focalY}%)',
  pointerEvents: 'none',
}}>`

  return (
    <main style={{
      minHeight: '100vh',
      background: '#06101c',
      color: '#f0ede8',
      padding: '2rem 1.25rem 6rem',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 4 }}>Avatar Crop Tuner</h1>
        <p style={{ fontSize: '0.85rem', color: 'rgba(240,237,232,0.6)', marginBottom: 24 }}>
          Adjust the zoom width and focal point until the bandana shows the way you want.
          Tell Claude the final three numbers (zoom · focal X · focal Y) and that&apos;ll be
          the new ProfileClient avatar crop.
        </p>

        {/* ── Picker rows ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          marginBottom: 28,
        }}>
          <Field label="Character">
            <select
              value={colorId}
              onChange={e => setColorId(e.target.value)}
              style={selectStyle}
            >
              {CHARACTER_COLORS.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Hat / Bandana">
            <select
              value={hatId ?? ''}
              onChange={e => setHatId(e.target.value || null)}
              style={selectStyle}
            >
              <option value="">(none)</option>
              {HATS.map(h => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* ── Sliders ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
          <Slider
            label="Zoom (width %)"
            value={zoom}
            min={150}
            max={700}
            step={1}
            onChange={setZoom}
            hint="lower = more body visible, higher = more zoomed on head"
          />
          <Slider
            label="Focal X %"
            value={focalX}
            min={0}
            max={100}
            step={0.5}
            onChange={setFocalX}
            hint="50 = center; 60 nudges right (face)"
          />
          <Slider
            label="Focal Y %"
            value={focalY}
            min={0}
            max={100}
            step={0.5}
            onChange={setFocalY}
            hint="lower = more of head/hat visible, higher = more body"
          />
        </div>

        {/* ── Previews ── */}
        <div style={{
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          padding: '1.25rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 24,
          alignItems: 'flex-end',
          marginBottom: 24,
        }}>
          {previews.map(p => (
            <div key={p.size} style={{ textAlign: 'center' }}>
              {renderAvatar(p.size)}
              <p style={{ fontSize: '0.7rem', color: 'rgba(240,237,232,0.5)', marginTop: 6 }}>{p.label}</p>
            </div>
          ))}
        </div>

        {/* ── Output ── */}
        <div style={{
          background: '#04080e',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: '0.9rem 1rem',
          marginBottom: 14,
        }}>
          <p style={{ fontSize: '0.65rem', color: 'rgba(240,237,232,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
            Values to use
          </p>
          <p style={{ fontSize: '1rem', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 8 }}>
            zoom <span style={{ color: '#60a5fa' }}>{zoom}%</span>
            {'  ·  '}
            focal X <span style={{ color: '#60a5fa' }}>{focalX}%</span>
            {'  ·  '}
            focal Y <span style={{ color: '#60a5fa' }}>{focalY}%</span>
          </p>
          {/* select-text: the app-wide user-select: none would otherwise make
              these coords impossible to highlight and copy. */}
          <pre className="select-text" style={{
            fontSize: '0.7rem',
            color: 'rgba(240,237,232,0.75)',
            background: 'rgba(255,255,255,0.025)',
            padding: '0.6rem 0.75rem',
            borderRadius: 8,
            overflowX: 'auto',
            whiteSpace: 'pre',
            margin: 0,
          }}>{cssSnippet}</pre>
        </div>

        <button
          type="button"
          onClick={() => { setZoom(420); setFocalX(60); setFocalY(68) }}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: '#f0ede8',
            padding: '0.55rem 1rem',
            borderRadius: 10,
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
        >
          Reset to current (420 / 60 / 68)
        </button>
      </div>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: '0.68rem', color: 'rgba(240,237,232,0.55)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      {children}
    </label>
  )
}

function Slider({ label, value, min, max, step, onChange, hint }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (n: number) => void; hint?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#60a5fa' }}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%' }}
      />
      {hint && (
        <span style={{ fontSize: '0.66rem', color: 'rgba(240,237,232,0.45)' }}>{hint}</span>
      )}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  background: '#04080e',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#f0ede8',
  padding: '0.55rem 0.7rem',
  borderRadius: 10,
  fontSize: '0.88rem',
  fontFamily: 'inherit',
}
