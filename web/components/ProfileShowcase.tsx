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
import { getRaidItem, isAbyssalForgedItem, type RaidItemDef } from '@/lib/raidItems'
import { SHINY_THEME, SHINY_FISH_FILTER } from '@/lib/shiny'

// Bite-rarity → color / label (kept in sync with the profile pages).
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

// ── Golden mounts — the gilded trophy wall ──────────────────────────────────
export interface GoldenMount {
  id: number
  name: string
  bite_rarity: number
  habitat?: string
  size_in?: number | null
}

const GOLD = SHINY_THEME.primary        // #fbcc4a
const GOLD_DEEP = SHINY_THEME.secondary // #f0a020

/** A player's MOUNTED golden catches, shown off as a gilded trophy wall. Capped
 *  to the biggest `cap`, with a "+N" tile for the rest. Renders nothing when
 *  the player has mounted no goldens. Same gold chrome as the catch moment. */
export function GoldenMounts({ fish, cap = 9 }: { fish: GoldenMount[]; cap?: number }) {
  if (!fish || fish.length === 0) return null
  const shown = fish.slice(0, cap)
  const more = fish.length - shown.length
  return (
    <div style={{
      position: 'relative', borderRadius: 18, overflow: 'hidden',
      padding: '0.95rem 0.85rem 1rem',
      background: `radial-gradient(ellipse at 50% 0%, ${GOLD}22 0%, rgba(9,7,3,0.5) 62%)`,
      border: `1px solid ${GOLD}48`,
      boxShadow: `0 0 32px ${GOLD}1c, inset 0 0 44px ${GOLD}0e`,
    }}>
      <div className="flex items-center justify-center" style={{ gap: 6, marginBottom: 13 }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill={GOLD} aria-hidden><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
        <span className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.2em', color: GOLD }}>Golden Catch</span>
        <span className="font-karla font-700" style={{ fontSize: '0.56rem', color: `${GOLD_DEEP}cc` }}>· {fish.length}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(94px, 1fr))', gap: 9 }}>
        {shown.map(f => (
          <div key={f.id} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            padding: '0.7rem 0.4rem 0.6rem', borderRadius: 13, textAlign: 'center',
            background: `linear-gradient(180deg, ${GOLD}18, rgba(0,0,0,0.3))`,
            border: `1px solid ${GOLD}44`, boxShadow: `inset 0 1px 0 ${GOLD}33`,
          }}>
            <div style={{ height: 52, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fishImageUrl(f.name)} alt={`Golden ${f.name}`} loading="lazy" decoding="async"
                style={{ maxWidth: 58, maxHeight: 50, objectFit: 'contain', filter: SHINY_FISH_FILTER }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            </div>
            <p className="font-cinzel font-700" style={{ fontSize: '0.66rem', color: SHINY_THEME.text, lineHeight: 1.15 }}>{f.name}</p>
            {f.size_in != null && f.size_in > 0 && (
              <span className="font-karla font-700" style={{ fontSize: '0.56rem', color: GOLD_DEEP, fontVariantNumeric: 'tabular-nums' }}>{f.size_in.toFixed(1)} in</span>
            )}
          </div>
        ))}
        {more > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 96,
            borderRadius: 13, background: `${GOLD}0f`, border: `1px dashed ${GOLD}4a`,
          }}>
            <span className="font-karla font-800" style={{ fontSize: '0.85rem', color: GOLD }}>+{more}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Raid-item rarity → accent + sort rank.
const ITEM_RARITY_COLOR: Record<string, string> = {
  common: '#94a3b8', uncommon: '#4ade80', rare: '#60a5fa', epic: '#c084fc', legendary: '#f0c040',
}
const ITEM_RARITY_RANK: Record<string, number> = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }
// Forge-crafted items — flagged by their `source` ("Forged from …") — display
// distinctly (a step above legendary): animated rainbow glow on the art + a
// "Forged" label in the Aurora-border spectrum. Neutral tile (NOT a purple fill).
const FORGED_BG = 'rgba(255,255,255,0.045)'
const FORGED_BORDER = 'rgba(120,180,255,0.42)'
const FORGED_GRADIENT = 'linear-gradient(90deg, #34d399, #22d3ee, #3b82f6, #8b5cf6, #ec4899)'
const isForged = (d: RaidItemDef) => /^Forged from/i.test(d.source ?? '')
// Tier-3 ABYSSAL fusions rank above everything and wear a molten red glow + an
// "Abyssal" tag, so they never read as just another legendary.
const ABYSSAL_BG = 'rgba(255,90,60,0.07)'
const ABYSSAL_BORDER = 'rgba(255,90,60,0.42)'
const ABYSSAL_GRADIENT = 'linear-gradient(90deg, #ff9a6a, #ff5a6a, #ffb15c, #ff4d55)'

/** Arsenal — the raid + forge items a player has collected, as a rarity-sorted
 *  grid of relic tiles (Abyssal first, then forged/prismatic, then rarest). Uses
 *  the raid_items ids already on the profile; unknown ids are dropped. */
export function RaidArsenal({ items }: { items: string[] }) {
  const rankOf = (d: RaidItemDef) => (isAbyssalForgedItem(d.id) ? 7 : isForged(d) ? 6 : (ITEM_RARITY_RANK[d.rarity] ?? 0))
  const defs = [...new Set(items)]
    .map(id => getRaidItem(id))
    .filter((d): d is RaidItemDef => !!d)
    .sort((a, b) => rankOf(b) - rankOf(a))
  if (defs.length === 0) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {defs.map(it => {
        const abyssal = isAbyssalForgedItem(it.id)
        const forged = !abyssal && isForged(it)
        const glowClass = abyssal ? 'rod-glow-abyssal' : forged ? 'rod-glow-prismatic' : undefined
        const c = ITEM_RARITY_COLOR[it.rarity] ?? '#94a3b8'
        return (
          <div key={it.id} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            padding: '0.75rem 0.5rem 0.6rem', borderRadius: 13, textAlign: 'center',
            background: abyssal ? ABYSSAL_BG : forged ? FORGED_BG : `${c}0e`,
            border: `1px solid ${abyssal ? ABYSSAL_BORDER : forged ? FORGED_BORDER : `${c}33`}`,
            boxShadow: abyssal ? '0 0 16px rgba(255,90,60,0.14)' : 'none',
          }}>
            <div style={{ height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {it.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={it.image} alt={it.name} loading="lazy" decoding="async"
                    className={glowClass}
                    style={{ maxWidth: 44, maxHeight: 44, objectFit: 'contain', ...(glowClass ? {} : { filter: `drop-shadow(0 2px 7px ${c}66)` }) }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                : <span aria-hidden className={glowClass} style={{ fontSize: '1.7rem', ...(glowClass ? {} : { filter: `drop-shadow(0 2px 6px ${c}55)` }) }}>{it.emoji}</span>}
            </div>
            <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#e8e4dc', lineHeight: 1.15 }}>{it.name}</p>
            {abyssal
              ? <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.14em', backgroundImage: ABYSSAL_GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Abyssal</span>
              : forged
              ? <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.12em', backgroundImage: FORGED_GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Forged</span>
              : <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.1em', color: c }}>{it.rarity}</span>}
          </div>
        )
      })}
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
  return (
    <div>
      {/* Flagship — one bigger poster on its own... */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 220, maxWidth: '72%' }}>
          <CrewPortrait crew={flag} fill hideStats />
        </div>
      </div>
      {/* ...then the rest in a tidy 2-up grid beneath (a full showcase reads as
          1 on top + a 2x2). Constrained so the grid cards stay smaller than
          the flagship. */}
      {rest.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 320, margin: '14px auto 0' }}>
          {rest.map(c => <CrewPortrait key={c.id} crew={c} fill hideStats />)}
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
