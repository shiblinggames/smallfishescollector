'use client'

// Shared "show off to the world" showcase pieces for the profile pages
// (owner /profile + public /u/[username]). Both render these so the flex
// reads identically everywhere.
//
//  - RarestCatchesTrophy: your single rarest catch as a big HERO trophy, the
//    rest on a shelf below.
//  - FeaturedCrew: your flagship crew large up top, the rest as a gallery grid
//    (no more cramped horizontal scroll strip).

import { CrewPortrait, type ShowcaseCrew } from '@/components/CrewShowcase'

// Bite-rarity → colour / label (kept in sync with the profile pages).
const RARITY_COLOR: Record<number, string> = {
  1: '#94a3b8', 2: '#4ade80', 3: '#60a5fa', 4: '#c084fc', 5: '#f59e0b',
}
const RARITY_LABEL: Record<number, string> = {
  1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Epic', 5: 'Legendary',
}

export interface RarestFish {
  id: number
  name: string
  bite_rarity: number
  habitat?: string
}

function fishImageUrl(name: string) {
  return `/fish/${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.png`
}

/** Rarity accent + label, with the Ancient Deep giants getting their own violet. */
function rarityMeta(fish: RarestFish): { color: string; label: string; ancient: boolean } {
  if (fish.habitat === 'ancient_deep') return { color: '#a78bfa', label: 'Ancient', ancient: true }
  return { color: RARITY_COLOR[fish.bite_rarity] ?? '#94a3b8', label: RARITY_LABEL[fish.bite_rarity] ?? 'Common', ancient: false }
}

/** The rarest catch as a HERO trophy + a shelf of runners-up. */
export function RarestCatchesTrophy({ fish }: { fish: RarestFish[] }) {
  if (!fish || fish.length === 0) return null
  const [hero, ...rest] = fish
  const hm = rarityMeta(hero)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* ── Hero trophy ── */}
      <div style={{
        position: 'relative', borderRadius: 18, overflow: 'hidden', textAlign: 'center',
        padding: '0.9rem 1rem 1.15rem',
        background: `radial-gradient(ellipse at 50% 16%, ${hm.color}26 0%, rgba(6,10,18,0.55) 66%)`,
        border: `1px solid ${hm.color}4a`,
        boxShadow: `0 0 34px ${hm.color}20, inset 0 0 42px ${hm.color}0e`,
      }}>
        {/* Rarest ribbon */}
        <span className="font-karla font-800 uppercase" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 4,
          fontSize: '0.5rem', letterSpacing: '0.2em', color: hm.color,
        }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill={hm.color} stroke="none" aria-hidden><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
          Rarest Catch
        </span>
        {/* Fish */}
        <div style={{ height: 122, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '2px 0 8px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fishImageUrl(hero.name)} alt={hero.name} loading="lazy" decoding="async"
            style={{ maxWidth: 168, maxHeight: 118, objectFit: 'contain', filter: `drop-shadow(0 4px 16px ${hm.color}88)` }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>
        <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f4efe6', lineHeight: 1.08 }}>{hero.name}</p>
        <span className="font-karla font-700 uppercase" style={{
          display: 'inline-block', marginTop: 8, padding: '0.22rem 0.7rem', borderRadius: 999,
          fontSize: '0.58rem', letterSpacing: '0.14em', color: hm.color,
          background: `${hm.color}18`, border: `1px solid ${hm.color}45`,
        }}>{hm.label}</span>
      </div>

      {/* ── Shelf — runners-up ── */}
      {rest.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rest.length}, 1fr)`, gap: 8 }}>
          {rest.map(f => {
            const m = rarityMeta(f)
            return (
              <div key={f.id} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                padding: '0.7rem 0.5rem 0.6rem', borderRadius: 13, textAlign: 'center',
                background: `${m.color}0e`, border: `1px solid ${m.color}33`,
              }}>
                <div style={{ height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fishImageUrl(f.name)} alt={f.name} loading="lazy" decoding="async"
                    style={{ maxWidth: 44, maxHeight: 44, objectFit: 'contain', filter: `drop-shadow(0 2px 7px ${m.color}66)` }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                </div>
                <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#e8e4dc', lineHeight: 1.15 }}>{f.name}</p>
                <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.1em', color: m.color }}>{m.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Featured crew — flagship poster up top, the rest as a gallery grid. */
export function FeaturedCrew({ crew, onEdit, emptyHint }: { crew: ShowcaseCrew[]; onEdit?: () => void; emptyHint?: string }) {
  if (!crew || crew.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '1.25rem 1rem' }}>
        <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)' }}>{emptyHint ?? 'No crew featured yet.'}</p>
        {onEdit && (
          <button onClick={onEdit} className="font-karla font-700 tap" style={{
            marginTop: '0.7rem', fontSize: '0.72rem', padding: '0.45rem 0.9rem', borderRadius: 9,
            background: 'rgba(96,165,250,0.16)', border: '1px solid rgba(96,165,250,0.5)', color: '#cfe2ff', cursor: 'pointer',
          }}>+ Feature Crew</button>
        )}
      </div>
    )
  }
  const [flag, ...rest] = crew
  const cols = Math.min(Math.max(rest.length, 1), 3)
  return (
    <div>
      {/* Flagship */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: rest.length > 0 ? 16 : 0 }}>
        <div style={{ position: 'relative', width: 210, maxWidth: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <span className="font-karla font-800 uppercase" style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: '0.5rem', letterSpacing: '0.2em', color: '#f0c040',
              padding: '0.2rem 0.6rem', borderRadius: 999, background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.36)',
            }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="#f0c040" stroke="none" aria-hidden><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
              Flagship
            </span>
          </div>
          <CrewPortrait crew={flag} fill />
        </div>
      </div>
      {/* Gallery */}
      {rest.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
          {rest.map(c => <CrewPortrait key={c.id} crew={c} fill />)}
        </div>
      )}
      {onEdit && (
        <button onClick={onEdit} className="font-karla font-700 tap" style={{
          marginTop: 14, fontSize: '0.68rem', padding: '0.4rem 0.85rem', borderRadius: 8,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
        }}>Edit Showcase</button>
      )}
    </div>
  )
}
