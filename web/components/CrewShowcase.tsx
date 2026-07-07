'use client'

// Shared crew showcase: the portrait tiles a player features on their profile,
// public profile, and social card. Read-only display + an optional Edit hook.

import { applyCrewEffects } from '@/lib/crewEffects'
import { RARITY_COLORS, RARITY_NAMES, type CrewRarity } from '@/lib/crewGen'
import { crewLevelFromXP } from '@/lib/crewLevel'
import { getCrewSkinByFilename } from '@/lib/crewSkins'

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const artSrc = (f: string) => `${SUPA}/storage/v1/object/public/card-arts/${f}`

const STAT = [
  { k: 'power' as const, l: 'PWR', c: '#f87171' },
  { k: 'dodge' as const, l: 'SAV', c: '#60a5fa' },
  { k: 'fortune' as const, l: 'FTN', c: '#f0c040' },
]

export type ShowcaseCrew = {
  id: number
  name: string
  filename: string
  rarity: number
  power: number
  dodge: number
  fortune: number
  effects: string[]
  xp?: number
  /** Species slug (lower-cased). Drives the crew-class chip on the showcase
   *  portrait — "Mender · Lv 47" reads as one identity. Optional for legacy
   *  callers that don't have it yet (chip just doesn't render). */
  slug?: string
}

/** One crew "poster" — borderless showcase art, meant to look like you're
 *  showing the crew off, not reading a stat card. Rarity (or equipped-skin)
 *  colour becomes a soft aura; name + rank sit on a scrim over the art; a
 *  slim stat line is the only chrome. */
export function CrewPortrait({ crew, w = 118, dimmed }: { crew: ShowcaseCrew; w?: number; dimmed?: boolean }) {
  const color = RARITY_COLORS[(crew.rarity as CrewRarity)] ?? '#8a857c'
  const skinColor = getCrewSkinByFilename(crew.filename)?.color
  const glow = skinColor ?? color
  const eff = applyCrewEffects({ power: crew.power, dodge: crew.dodge, fortune: crew.fortune }, crew.effects, crew.xp ?? 0)
  const level = crewLevelFromXP(crew.xp ?? 0)
  return (
    <div style={{ width: w, flexShrink: 0, opacity: dimmed ? 0.4 : 1, transition: 'opacity 0.15s' }}>
      {/* Borderless art hero — a poster, not a card. Aura in the rarity (or
          skin) colour; identity caption overlaid on a bottom scrim. */}
      <div style={{
        position: 'relative', width: '100%', aspectRatio: '4 / 5', borderRadius: 14, overflow: 'hidden',
        background: `radial-gradient(ellipse at 50% 34%, ${glow}30 0%, #06050a 76%)`,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artSrc(crew.filename)} alt={crew.name} loading="lazy" decoding="async"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center 34%', padding: 6, filter: skinColor ? `drop-shadow(0 0 5px ${skinColor}) drop-shadow(0 0 13px ${skinColor}bb)` : undefined }} />
        {/* Lv badge — the headline brag on a visit-by-anyone profile. */}
        <span className="font-cinzel font-700" style={{
          position: 'absolute', top: 6, right: 6,
          fontSize: '0.5rem', letterSpacing: '0.06em',
          color: '#f7e4a8', background: 'rgba(7,5,4,0.7)',
          border: '1px solid rgba(240,192,64,0.4)',
          padding: '0.12rem 0.34rem', borderRadius: 4, lineHeight: 1,
        }}>
          Lv {level}
        </span>
        {/* Identity caption over a bottom scrim. */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '1.5rem 0.5rem 0.55rem', background: 'linear-gradient(180deg, transparent 0%, rgba(6,5,10,0.86) 62%)' }}>
          <p className="font-pirata" style={{ fontSize: '1.02rem', color: '#f4ead2', lineHeight: 1.02, textAlign: 'center', textShadow: '0 1px 4px rgba(0,0,0,0.75)' }}>{crew.name}</p>
          <p className="font-cinzel font-700" style={{ fontSize: '0.46rem', letterSpacing: '0.14em', textTransform: 'uppercase', color, textAlign: 'center', marginTop: 3, textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
            {RARITY_NAMES[(crew.rarity as CrewRarity)] ?? 'Common'}
          </p>
        </div>
      </div>
      {/* Slim stat line — the three numbers to brag with, no box. */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 7 }}>
        {STAT.map(s => (
          <span key={s.k} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3 }}>
            <span className="font-cinzel font-700" style={{ fontSize: '0.76rem', color: s.c, lineHeight: 1 }}>{eff[s.k]}</span>
            <span style={{ fontSize: '0.4rem', color: 'rgba(255,255,255,0.34)', letterSpacing: '0.06em' }}>{s.l}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Read-only row of showcased crew, with an optional Edit affordance. */
export function CrewShowcase({ crew, onEdit, emptyHint }: { crew: ShowcaseCrew[]; onEdit?: () => void; emptyHint?: string }) {
  if (crew.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '1.25rem 1rem' }}>
        <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)' }}>
          {emptyHint ?? 'No crew featured yet.'}
        </p>
        {onEdit && (
          <button onClick={onEdit} className="font-karla font-700" style={{
            marginTop: '0.7rem', fontSize: '0.72rem', padding: '0.45rem 0.9rem', borderRadius: 9,
            background: 'rgba(96,165,250,0.16)', border: '1px solid rgba(96,165,250,0.5)', color: '#cfe2ff', cursor: 'pointer',
          }}>
            + Feature Crew
          </button>
        )}
      </div>
    )
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: '0.6rem', overflowX: 'auto', paddingBottom: '0.4rem' }}>
        {crew.map(c => <CrewPortrait key={c.id} crew={c} />)}
      </div>
      {onEdit && (
        <button onClick={onEdit} className="font-karla font-700" style={{
          marginTop: '0.5rem', fontSize: '0.68rem', padding: '0.4rem 0.85rem', borderRadius: 8,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
        }}>
          Edit Showcase
        </button>
      )}
    </div>
  )
}
