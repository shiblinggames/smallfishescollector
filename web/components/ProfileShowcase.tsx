'use client'

// Shared "show off to the world" showcase pieces for the profile pages
// (owner /profile + public /u/[username]). Both render these so the flex
// reads identically everywhere.
//
//  - RarestCatchesByZone: your top-3 rarest catches in EACH zone, laid out as a
//    trophy room organized by depth on quiet uniform cards (the #1 catch mounted
//    biggest). Sorted within a zone by rarity, then sell value.
//  - FeaturedCrew / RaidArsenal / GoldenMounts: art-forward ShowcaseRails —
//    one sideways-scrolling row of big images each. These were grids, which
//    meant every image shrank to fit three or four across and the column grew
//    taller with every relic; a rail keeps one row and lets the art be seen.
//    (An older strip was scrapped for being cramped — the fix was bigger tiles,
//    not going back to grids.)

import { CrewPortrait, type ShowcaseCrew } from '@/components/CrewShowcase'
import { getRaidItem, isAbyssalForgedItem, type RaidItemDef } from '@/lib/raidItems'
import { SPECIAL_ITEMS, type SpecialItemDef } from '@/lib/specialItems'
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
// Cap raised with the move to a rail: a grid had to stop at 9 or it grew into
// a wall, but a rail just gets longer, so a real trophy collection can show.
export function GoldenMounts({ fish, cap = 24 }: { fish: GoldenMount[]; cap?: number }) {
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
      <ShowcaseRail>
        {shown.map(f => (
          <div key={f.id} style={{
            flex: '0 0 auto', width: 118, scrollSnapAlign: 'start',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            padding: '0.7rem 0.4rem 0.6rem', borderRadius: 13, textAlign: 'center',
            background: `linear-gradient(180deg, ${GOLD}18, rgba(0,0,0,0.3))`,
            border: `1px solid ${GOLD}44`, boxShadow: `inset 0 1px 0 ${GOLD}33`,
          }}>
            {/* A golden is a one-in-a-thousand catch; the auto-fill grid was
                rendering it at 50px. On a rail it gets to be a trophy. */}
            <div style={{ height: 84, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fishImageUrl(f.name)} alt={`Golden ${f.name}`} loading="lazy" decoding="async"
                style={{ maxWidth: 104, maxHeight: 82, objectFit: 'contain', filter: SHINY_FISH_FILTER }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            </div>
            <p className="font-cinzel font-700" style={{
              display: 'block', width: '100%',
              fontSize: '0.66rem', color: SHINY_THEME.text, lineHeight: 1.15,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{f.name}</p>
            {f.size_in != null && f.size_in > 0 && (
              <span className="font-karla font-700" style={{ fontSize: '0.56rem', color: GOLD_DEEP, fontVariantNumeric: 'tabular-nums' }}>{f.size_in.toFixed(1)} in</span>
            )}
          </div>
        ))}
        {more > 0 && (
          <div style={{
            flex: '0 0 auto', width: 118, scrollSnapAlign: 'start',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 13, background: `${GOLD}0f`, border: `1px dashed ${GOLD}4a`,
          }}>
            <span className="font-karla font-800" style={{ fontSize: '0.85rem', color: GOLD }}>+{more}</span>
          </div>
        )}
      </ShowcaseRail>
    </div>
  )
}

/** THE SHOWCASE RAIL. One fixed-height row that scrolls sideways, shared by
 *  every showcase section so they read as one language: a player with two
 *  relics and a player with twenty get the same shape, and neither reflows the
 *  column into a taller and taller wall of small tiles. Art leads; the grids
 *  these replaced had to shrink every image to fit three or four across.
 *
 *  No negative-margin bleed here, unlike the boss-drop rail: these sit inside a
 *  centred 540px column whose padding lives on the page, so a fixed bleed would
 *  hang the rail outside the column on wide screens. */
function ShowcaseRail({ children }: { children: React.ReactNode }) {
  return (
    <div className="scrollbar-hide" style={{
      display: 'flex', gap: 10,
      overflowX: 'auto', overflowY: 'hidden',
      scrollSnapType: 'x proximity',
      WebkitOverflowScrolling: 'touch',
      paddingBottom: 2,
    }}>
      {children}
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
// No orange stop in here: #ffb37a came straight out of abyssal's palette and
// pulled the label back toward looking like one. Bone -> crimson -> bone.
const ANCIENT_GRADIENT = 'linear-gradient(90deg, #f4e3c4, #e0455a, #ded3b4, #c0203c)'
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
    <ShowcaseRail>
      {defs.map(it => {
        const ancient = it.rarity === 'ancient'
        const abyssal = !ancient && isAbyssalForgedItem(it.id)
        const forged = !ancient && !abyssal && isForged(it)
        const glowClass = ancient ? 'rod-glow-ancient' : abyssal ? 'rod-glow-abyssal' : forged ? 'rod-glow-prismatic' : undefined
        const c = ITEM_RARITY_COLOR[it.rarity] ?? '#94a3b8'
        return (
          <div key={it.id} style={{
            flex: '0 0 auto', width: 124, scrollSnapAlign: 'start',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            padding: '0.75rem 0.5rem 0.6rem', borderRadius: 13, textAlign: 'center',
            background: ancient ? ANCIENT_BG : abyssal ? ABYSSAL_BG : forged ? FORGED_BG : `${c}0e`,
            border: `1px solid ${ancient ? ANCIENT_BORDER : abyssal ? ABYSSAL_BORDER : forged ? FORGED_BORDER : `${c}33`}`,
            // Ancient's tile halo is BONE, not red. The crimson border stays (that is the
            // rarity's identity, and it matches the drop tiles), but a red outer glow
            // beside abyssal's red outer glow was half of why the two blurred together.
            boxShadow: ancient ? '0 0 22px rgba(236,227,205,0.16)' : abyssal ? '0 0 16px rgba(255,90,60,0.14)' : 'none',
          }}>
            {/* Roughly double the old 46px box — the grid had to shrink every
                relic to fit three across; a rail can let them be seen. */}
            <div style={{ height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {it.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={it.image} alt={it.name} loading="lazy" decoding="async"
                    className={glowClass}
                    style={{ maxWidth: 86, maxHeight: 86, objectFit: 'contain', ...(glowClass ? {} : { filter: `drop-shadow(0 3px 10px ${c}66)` }) }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                : <span aria-hidden className={glowClass} style={{ fontSize: '3rem', ...(glowClass ? {} : { filter: `drop-shadow(0 3px 9px ${c}55)` }) }}>{it.emoji}</span>}
            </div>
            {/* Clipped, never wrapped: a two-line name would make one tile
                taller than its neighbours and break the rail's line. */}
            <p className="font-karla font-600" style={{
              display: 'block', width: '100%',
              fontSize: '0.66rem', color: '#e8e4dc', lineHeight: 1.15,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{it.name}</p>
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
    </ShowcaseRail>
  )
}

/** THE TACKLE — fishing special items, the fishing-side twin of the Arsenal.
 *  Same rail, same tile, so the two tabs read as one collection split across
 *  two trades rather than two unrelated designs. Owned ids in, art out; the
 *  equipped one wears a marker since only one can be seated at a time.
 *
 *  The Primeval Eye lands here rather than in the Arsenal: it is a fishing
 *  special, and this is where fishing gear lives. It gets the ancient
 *  treatment, same as the Maw does on the raid side. */
export function SpecialTackle({ items, equippedIds = [] }: { items: string[]; equippedIds?: (string | null)[] }) {
  // Two slots can be seated at once (the ordinary special, plus the Sunken
  // Hand's second slot), so this is a set, not one id.
  const seated = new Set(equippedIds.filter(Boolean) as string[])
  const owned = new Set(items)
  const defs = [...new Set(items)]
    .map(id => SPECIAL_ITEMS.find(s => s.id === id))
    .filter((s): s is SpecialItemDef => !!s)
    // A tier upgrade and its base are ONE item: once the upgrade is owned the
    // base card leaves the rail, and equipping the base counts as the upgrade
    // being seated (equip rows write the base id).
    .filter(s => !SPECIAL_ITEMS.some(u => u.upgradeOf === s.id && owned.has(u.id)))
    // Ancient first, mirroring the Arsenal's ranking; then the seated one, so
    // what you are actually fishing with is never buried.
    .sort((a, b) =>
      Number(!!b.finaleSlotOnly) - Number(!!a.finaleSlotOnly)
      || Number(seated.has(b.id)) - Number(seated.has(a.id)))
  if (defs.length === 0) return null
  return (
    <ShowcaseRail>
      {defs.map(it => {
        // finaleSlotOnly is the Sunken Hand spoil — the one ancient in the set.
        const ancient = !!it.finaleSlotOnly
        const equipped = seated.has(it.id) || (!!it.upgradeOf && seated.has(it.upgradeOf))
        const c = ancient ? ITEM_RARITY_COLOR.ancient : it.color
        return (
          <div key={it.id} style={{
            flex: '0 0 auto', width: 124, scrollSnapAlign: 'start',
            position: 'relative',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            padding: '0.75rem 0.5rem 0.6rem', borderRadius: 13, textAlign: 'center',
            background: ancient ? ANCIENT_BG : `${c}0e`,
            border: `1px solid ${ancient ? ANCIENT_BORDER : `${c}33`}`,
            boxShadow: ancient ? '0 0 22px rgba(236,227,205,0.16)' : 'none',
          }}>
            <div style={{ height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {it.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={it.image} alt={it.name} loading="lazy" decoding="async"
                    className={ancient ? 'rod-glow-ancient' : undefined}
                    style={{ maxWidth: 86, maxHeight: 86, objectFit: 'contain', ...(ancient ? {} : { filter: `drop-shadow(0 3px 10px ${c}66)` }) }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                : <span aria-hidden style={{ width: 56, height: 56, borderRadius: 12, background: `${c}22`, border: `1px solid ${c}44` }} />}
            </div>
            <p className="font-karla font-600" style={{
              display: 'block', width: '100%',
              fontSize: '0.66rem', color: '#e8e4dc', lineHeight: 1.15,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{it.name}</p>
            {ancient
              ? <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.16em', backgroundImage: ANCIENT_GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Ancient</span>
              : <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.1em', color: equipped ? '#7fd49a' : `${c}bb` }}>{equipped ? 'Equipped' : 'Special'}</span>}
            {equipped && ancient && (
              <span className="font-karla font-700 uppercase" style={{ position: 'absolute', top: 6, right: 7, fontSize: '0.44rem', letterSpacing: '0.08em', color: '#7fd49a' }}>Seated</span>
            )}
          </div>
        )
      })}
    </ShowcaseRail>
  )
}

/** The player's RAID PARTY, in seat order, as a rail of posters. Both profiles
 *  feed this straight off user_crew.raid_slot — there is no curated pick any
 *  more, so it is always the crew they actually fight with. */
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
  return (
    <div>
      {/* One rail rather than a flagship over a 2-up grid. The old split made
          every hand after the first read as a runner-up at roughly half the
          size; on a rail they are all posters at the same scale, and the
          showcase stays one row however many are featured. */}
      <ShowcaseRail>
        {crew.map(c => (
          <div key={c.id} style={{ flex: '0 0 auto', width: 172, scrollSnapAlign: 'start' }}>
            <CrewPortrait crew={c} fill hideStats />
          </div>
        ))}
      </ShowcaseRail>
      {onEdit && (
        <button onClick={onEdit} className="font-karla font-700 tap" style={{
          marginTop: 14, fontSize: '0.68rem', padding: '0.4rem 0.85rem', borderRadius: 8,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
        }}>Edit Showcase</button>
      )}
    </div>
  )
}
