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

/** One crew portrait tile (effective stats shown). */
export function CrewPortrait({ crew, w = 100, dimmed }: { crew: ShowcaseCrew; w?: number; dimmed?: boolean }) {
  // An equipped legendary skin themes the whole tile in its accent color (this
  // is where other players see your skin); else the rarity color.
  const color = getCrewSkinByFilename(crew.filename)?.color ?? RARITY_COLORS[(crew.rarity as CrewRarity)] ?? '#8a857c'
  const eff = applyCrewEffects({ power: crew.power, dodge: crew.dodge, fortune: crew.fortune }, crew.effects, crew.xp ?? 0)
  const level = crewLevelFromXP(crew.xp ?? 0)
  return (
    <div style={{
      width: w, flexShrink: 0, borderRadius: 10, overflow: 'hidden',
      background: 'linear-gradient(160deg, #1b1622 0%, #0d0b12 100%)',
      border: `1.5px solid ${color}`, boxShadow: `0 4px 12px rgba(0,0,0,0.4), 0 0 12px ${color}33`,
      opacity: dimmed ? 0.4 : 1, transition: 'opacity 0.15s',
    }}>
      <div style={{ position: 'relative', width: '100%', height: w, background: `radial-gradient(ellipse at 50% 32%, ${color}26 0%, #070504 74%)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artSrc(crew.filename)} alt={crew.name} loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} />
        {/* Lv chip — always shown, top-right corner of the portrait. Reads
            as bragging surface on visit-by-anyone profiles ("oh damn this
            player has a Lv 47 Doby"); also clarifies for Lv 1 that the
            system is universal, not "only veterans have levels". */}
        <span className="font-cinzel font-700" style={{
          position: 'absolute', top: 4, right: 4,
          fontSize: '0.52rem', letterSpacing: '0.06em',
          color: '#f0c040', background: 'rgba(7,5,4,0.85)',
          border: '1px solid rgba(240,192,64,0.5)',
          padding: '0.1rem 0.32rem', borderRadius: 3, lineHeight: 1,
        }}>
          Lv {level}
        </span>
      </div>
      <div style={{ padding: '0.3rem 0.4rem 0.42rem' }}>
        <p className="font-pirata" style={{ fontSize: '0.92rem', color: '#ecdcbd', lineHeight: 1, textAlign: 'center' }}>{crew.name}</p>
        <p className="font-cinzel font-700" style={{ fontSize: '0.48rem', letterSpacing: '0.1em', textTransform: 'uppercase', color, textAlign: 'center', marginTop: 3 }}>
          {RARITY_NAMES[(crew.rarity as CrewRarity)] ?? 'Common'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
          {STAT.map(s => (
            <div key={s.k} style={{ textAlign: 'center' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.7rem', color: s.c, lineHeight: 1 }}>{eff[s.k]}</p>
              <p style={{ fontSize: '0.38rem', color: '#5a5858', lineHeight: 1, marginTop: 2 }}>{s.l}</p>
            </div>
          ))}
        </div>
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
