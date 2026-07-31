'use client'

// Shared "show off to the world" showcase pieces for the profile pages
// (owner /profile + public /u/[username]). Both render these so the flex
// reads identically everywhere.
//
//  - RarestCatchesByZone: your top-3 rarest catches in EACH zone, laid out as a
//    trophy room organized by depth on quiet uniform cards (the #1 catch mounted
//    biggest). Sorted within a zone by rarity, then sell value.
//  - FeaturedCrew: your flagship crew large up top, the rest as a gallery grid
//    (no more cramped horizontal scroll strip).

import { CrewPortrait, type ShowcaseCrew } from '@/components/CrewShowcase'
import { getRaidItem, isAbyssalForgedItem, type RaidItemDef } from '@/lib/raidItems'
import { SHINY_THEME, SHINY_FISH_FILTER } from '@/lib/shiny'
import { PRESTIGE_MAX } from '@/lib/zoneRewards'

// Prestige badge chrome — translucent tinted gold (no solid fill; max is set
// apart by a brighter gold + soft glow, staying in theme with the rest).
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V']

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
  sell_value?: number
}

function fishImageUrl(name: string) {
  return `/fish/${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.png`
}

/** Rarity accent + label, with the Ancient Deep giants getting their own violet. */
function rarityMeta(fish: RarestFish): { color: string; label: string; ancient: boolean } {
  if (fish.habitat === 'ancient_deep') return { color: '#a78bfa', label: 'Ancient', ancient: true }
  return { color: RARITY_COLOR[fish.bite_rarity] ?? '#94a3b8', label: RARITY_LABEL[fish.bite_rarity] ?? 'Common', ancient: false }
}

// Zones ordered by descending depth. Uniform card chrome — no per-zone accent
// or backdrop (kept deliberately quiet); the rarity-colored fish carry the color.
const ZONE_LABEL: Record<string, string> = {
  shallows: 'Shallows', open_waters: 'Open Waters', deep: 'Deep', abyss: 'Abyss', ancient_deep: 'Ancient Deep',
}
const ZONE_ORDER = ['shallows', 'open_waters', 'deep', 'abyss', 'ancient_deep']

/** One zone's trophy plaque: the 3 rarest catches, #1 mounted biggest. */
function TrophyTile({ fish, rank }: { fish: RarestFish; rank: number }) {
  const m = rarityMeta(fish)
  const c = m.color
  const top = rank === 1
  return (
    <div style={{
      position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      padding: `${top ? '0.9rem' : '0.75rem'} 0.4rem 0.6rem`, borderRadius: 12, textAlign: 'center',
      background: top ? `linear-gradient(180deg, ${c}26, rgba(0,0,0,0.32))` : `${c}10`,
      border: `1px solid ${top ? `${c}66` : `${c}30`}`,
      boxShadow: top ? `0 0 18px ${c}30, inset 0 1px 0 ${c}33` : 'none',
    }}>
      {/* rank chip — encodes the rarity→sell ordering; #1 wears gold */}
      <span className="font-karla font-800" aria-hidden style={{
        position: 'absolute', top: 5, left: 5, width: 15, height: 15, borderRadius: 999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', lineHeight: 1,
        color: top ? '#ffdb7a' : '#cbd3df',
        background: top ? 'rgba(240,200,80,0.18)' : 'rgba(255,255,255,0.1)',
        border: `1px solid ${top ? 'rgba(240,200,80,0.6)' : 'rgba(255,255,255,0.18)'}`,
      }}>{rank}</span>
      <div style={{ height: top ? 64 : 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fishImageUrl(fish.name)} alt={fish.name} loading="lazy" decoding="async"
          style={{ maxWidth: top ? 80 : 58, maxHeight: top ? 60 : 46, objectFit: 'contain', filter: `drop-shadow(0 3px 10px ${c}80)` }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
      </div>
      <p className="font-cinzel font-700" style={{ fontSize: top ? '0.76rem' : '0.64rem', color: '#f0ebe1', lineHeight: 1.12 }}>{fish.name}</p>
      <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.1em', color: c }}>{m.label}</span>
      {fish.sell_value != null && fish.sell_value > 0 && (
        <span className="font-karla font-700" style={{ fontSize: '0.54rem', color: '#e8c96a', fontVariantNumeric: 'tabular-nums' }}>⟡ {fish.sell_value.toLocaleString()}</span>
      )}
    </div>
  )
}

/** A single zone card: uniform neutral chrome + the ranked podium. Shows the
 *  player's prestige level for the zone (gold pill, "Max Prestige" at the cap). */
function ZoneTrophyCard({ label, prestige, top }: { label: string; prestige: number; top: RarestFish[] }) {
  const maxed = prestige >= PRESTIGE_MAX
  return (
    <div style={{
      borderRadius: 16, padding: '0.8rem 0.8rem 0.9rem',
      background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.09)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <p className="font-cinzel font-700" style={{ fontSize: '1.02rem', color: '#f2ede3', lineHeight: 1 }}>{label}</p>
        {prestige >= 1 && (
          <span className="font-karla font-800 uppercase" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
            padding: '0.2rem 0.5rem', borderRadius: 999, fontSize: '0.5rem', letterSpacing: '0.12em',
            color: maxed ? '#ffdb7a' : '#f0d68a',
            background: maxed ? 'rgba(240,200,80,0.2)' : 'rgba(240,200,80,0.13)',
            border: `1px solid ${maxed ? 'rgba(240,200,80,0.7)' : 'rgba(240,200,80,0.4)'}`,
            boxShadow: maxed ? '0 0 10px rgba(240,200,80,0.28)' : 'none',
          }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill={maxed ? '#ffdb7a' : '#f0d68a'} aria-hidden><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
            {maxed ? 'Max Prestige' : `Prestige ${ROMAN[prestige] ?? prestige}`}
          </span>
        )}
      </div>
      {/* podium — #1 biggest, then runners-up */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${top.length}, 1fr)`, gap: 8, alignItems: 'end' }}>
        {top.map((f, i) => <TrophyTile key={f.id} fish={f} rank={i + 1} />)}
      </div>
    </div>
  )
}

/** Top-3 rarest catches in EACH zone the player has fished — a trophy room by
 *  depth. Within a zone, sorted by rarity, then doubloon sell value. Zones with
 *  no catches are omitted. Pass the player's FULL caught-fish list. */
export function RarestCatchesByZone({ fish, prestige }: { fish: RarestFish[]; prestige?: Record<string, number> }) {
  if (!fish || fish.length === 0) return null
  const byZone: Record<string, RarestFish[]> = {}
  for (const f of fish) {
    const z = f.habitat ?? ''
    if (!ZONE_LABEL[z]) continue
    ;(byZone[z] ||= []).push(f)
  }
  const zones = ZONE_ORDER
    .filter(z => byZone[z]?.length)
    .map(z => ({
      zone: z,
      label: ZONE_LABEL[z],
      level: prestige?.[z] ?? 0,
      top: byZone[z]
        .slice()
        .sort((x, y) => (y.bite_rarity - x.bite_rarity) || ((y.sell_value ?? 0) - (x.sell_value ?? 0)))
        .slice(0, 3),
    }))
  if (zones.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {zones.map(({ zone, label, level, top }) => <ZoneTrophyCard key={zone} label={label} prestige={level} top={top} />)}
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
  ancient: '#e0455a', cosmetic: '#2dd4bf',
}
const ITEM_RARITY_RANK: Record<string, number> = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }
// ANCIENT — the two Primeval spoils off The Sunken Hand, and the only things in
// the game that rank above an Abyssal fusion. They sort FIRST and wear a bone
// core over a crimson bloom: deliberately NOT abyssal's molten orange, because
// two red-ish top tiers side by side would read as the same thing. The pulse is
// slower too (4.2s vs 2.6s) — old and patient rather than hot.
const ANCIENT_BG = 'rgba(224,69,90,0.08)'
const ANCIENT_BORDER = 'rgba(224,69,90,0.5)'
const ANCIENT_GRADIENT = 'linear-gradient(90deg, #f4e3c4, #e0455a, #ffb37a, #c0203c)'
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
  // Ancient outranks everything, including an Abyssal fusion. (Only the Maw
  // reaches here — the Eye is a fishing special, not a raid item.)
  const rankOf = (d: RaidItemDef) =>
    (d.rarity === 'ancient' ? 8 : isAbyssalForgedItem(d.id) ? 7 : isForged(d) ? 6 : (ITEM_RARITY_RANK[d.rarity] ?? 0))
  const defs = [...new Set(items)]
    .map(id => getRaidItem(id))
    .filter((d): d is RaidItemDef => !!d)
    .sort((a, b) => rankOf(b) - rankOf(a))
  if (defs.length === 0) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {defs.map(it => {
        const ancient = it.rarity === 'ancient'
        const abyssal = !ancient && isAbyssalForgedItem(it.id)
        const forged = !ancient && !abyssal && isForged(it)
        const glowClass = ancient ? 'rod-glow-ancient' : abyssal ? 'rod-glow-abyssal' : forged ? 'rod-glow-prismatic' : undefined
        const c = ITEM_RARITY_COLOR[it.rarity] ?? '#94a3b8'
        return (
          <div key={it.id} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            padding: '0.75rem 0.5rem 0.6rem', borderRadius: 13, textAlign: 'center',
            background: ancient ? ANCIENT_BG : abyssal ? ABYSSAL_BG : forged ? FORGED_BG : `${c}0e`,
            border: `1px solid ${ancient ? ANCIENT_BORDER : abyssal ? ABYSSAL_BORDER : forged ? FORGED_BORDER : `${c}33`}`,
            boxShadow: ancient ? '0 0 20px rgba(224,69,90,0.20)' : abyssal ? '0 0 16px rgba(255,90,60,0.14)' : 'none',
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
            {ancient
              ? <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.16em', backgroundImage: ANCIENT_GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Ancient</span>
              : abyssal
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
