'use client'

// ─── THE CATCH RESULT CARD ───────────────────────────────────────────────────
// Lifted verbatim out of FishingGame so the SEA MAP can show the exact same
// card. Nothing about it changed in the move.
//
// The map casts through the same two server actions the fishing screen does, so
// it gets back the same payload — the size roll, the PB, shiny, the streak, the
// vigil, all of it. It was rendering a one-line text button instead, which meant
// landing a personal best on the map looked exactly like landing a tiddler. The
// card IS the reward; there is no version of fishing that skips it.
//
// RARITY, fishImageUrl, FishImg and TrophyMark came along because they are the
// only things it reached for outside its own body. FishingGame imports all of
// them back from here, so there is still exactly one of each.

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { FishSpecies } from '@/app/(app)/fishing/actions'
import { vigilNumeral, VIGIL_MAX_RANK, VIGIL_FRAME } from '@/lib/ancientVigil'
import { IconFlame, IconStar, IconTrophy } from '@/components/GameIcons'
import { polar } from '@/components/FishingDial'
import { formatFishLength, tierShowsPill, TIER_COLOR, TIER_LABEL, type FishSizeTier } from '@/lib/fishSize'
import { SHINY_FISH_FILTER, SHINY_THEME, SHINY_SELL_MULT, pickShinyMessage } from '@/lib/shiny'

export const RARITY: Record<number, { label: string; color: string; hookedText: string }> = {
  1: { label: 'Common',    color: '#94a3b8', hookedText: "Something's on the line…" },
  2: { label: 'Uncommon',  color: '#4ade80', hookedText: "You've got a bite!" },
  3: { label: 'Rare',      color: '#60a5fa', hookedText: "Something strong is pulling!" },
  4: { label: 'Epic',      color: '#c084fc', hookedText: "A big one! Hold tight!" },
  5: { label: 'Legendary', color: '#f59e0b', hookedText: "SOMETHING MASSIVE IS ON THE LINE!" },
}

export function fishImageUrl(name: string) {
  return `/fish/${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.png`
}

export function FishImg({ name, style }: { name: string; style?: React.CSSProperties }) {
  return (
    <img
      src={fishImageUrl(name)}
      alt={name}
      style={style}
      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
    />
  )
}

/** The trophy mark: a drawn cup, so it lives in the same visual language as the rest of
 *  the UI and never leans on an emoji. Sits on the collection card's corner and beside
 *  the personal best. */
export function TrophyMark({ size = 10, color = '#fbbf24' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M6 4h12v4a6 6 0 0 1-12 0z" />
      <path d="M6 6H4a2 2 0 0 0 2 4M18 6h2a2 2 0 0 1-2 4" />
      <path d="M12 14v4M9 20h6" />
    </svg>
  )
}

export function ResultCard({ fish, baitSaved, isNewSpecies, isPerfect, xpGained, doubleCatch, gemEarned, perfectStreak = 1, streakBonusXP = 0, jackpotMultiplier, perfectXpMult = 1, lockedStage = 0, catchQty = 1, ancientCount = 0, ancientTotal = 6, sizeIn, sizeMin, sizeMax, sizeTier, isPB, previousBest, isShiny = false, deepStirs = false, vigilRankUp = null }: {
  fish: FishSpecies
  baitSaved: boolean
  isNewSpecies: boolean
  /** THE LONG VIGIL — set when this catch banked a rank. */
  vigilRankUp?: { from: number; to: number } | null
  isPerfect: boolean
  xpGained: number
  doubleCatch?: boolean
  gemEarned?: boolean
  perfectStreak?: number
  streakBonusXP?: number
  jackpotMultiplier?: number
  perfectXpMult?: number
  /** Locked-In Rod active stage this catch (0 base · 1 speed · 2 +triple · 3 LOCKED IN). */
  lockedStage?: number
  /** Fish actually banked this catch (3 on a Locked-In triple). */
  catchQty?: number
  ancientCount?: number
  ancientTotal?: number
  // ── Per-catch size variance (lib/fishSize) ──
  sizeIn: number
  sizeMin?: number
  sizeMax?: number
  sizeTier?: FishSizeTier
  isPB: boolean
  previousBest: number | null
  /** Pokémon-style ultra-rare gold variant — gated server-side on a
   *  Perfect catch + 1/SHINY_ODDS roll. When true, the card swaps to
   *  the gold/amber palette and the fish image gets the SHINY_FISH_FILTER
   *  so the entire result moment reads as premium. */
  isShiny?: boolean
  /** Ancient Deep: rare, subtle omen line nudging toward a rarer lure without
   *  naming it — shown only on a common-bait catch while trophies remain. */
  deepStirs?: boolean
}) {
  // 'Ancient' card treatment is the red boss palette + heavy
  // burst / ominous chrome reserved for the 6 trophies. The 12 new
  // ancient_deep regulars added 2026-06-10 are still ancient-zone catches
  // but read as "regular high-value fish", not boss reveals, so they
  // fall back to the standard bite_rarity treatment (rare blue / epic
  // purple / legendary gold). Discriminator: sell_value 0 = trophy,
  // matches the trophy/inventory routing split server-side.
  const isAncient = fish.habitat === 'ancient_deep' && (fish.sell_value ?? 0) === 0
  const rarity = fish.bite_rarity ?? 1
  const baseR = RARITY[rarity] ?? RARITY[1]

  // ── Size readout count-up ─────────────────────────────────────────────────
  // Slot-machine roll: the size number ticks from 0 up to the rolled length
  // over ~700ms with an ease-out curve, then locks. Single rAF loop; no state
  // outside this component touched. Animated value drives the rendered string
  // but the underlying sizeIn stays canonical for math.
  const hasSize = sizeIn > 0
  // Shiny suppresses ALL size-related UI: hero readout, range bar,
  // trophy/large pill, PB ribbon. Shinies are always Trophy-tier by
  // design (server forces max length), so the size info is redundant
  // and just crowds the moment. The gold fish IS the celebration.
  const showRange = hasSize && !isAncient && !isShiny && sizeMin != null && sizeMax != null && sizeMax > sizeMin
  const [displaySize, setDisplaySize] = useState(0)
  useEffect(() => {
    if (!hasSize) return
    let raf = 0
    let start = 0
    const dur = 550
    const target = sizeIn
    const tick = (t: number) => {
      if (!start) start = t
      const elapsed = t - start
      const p = Math.min(1, elapsed / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplaySize(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [sizeIn, hasSize])
  const sizePercentile = showRange ? Math.max(0, Math.min(1, (sizeIn - sizeMin!) / (sizeMax! - sizeMin!))) : 0.5
  const isPBMoment = !isAncient && !isShiny && isPB
  // LARGE / TROPHY pill. tierShowsPill has always said these two earn a
  // callout and the card comments have always claimed one renders, but none
  // ever did: sizeTier was destructured and never read, so a 3%-roll Trophy
  // looked exactly like a 47% Average except for where the needle sat.
  // Gated on showRange because a tier is meaningless without the species
  // range behind it, and off shinies (always Trophy by design, and the gold
  // fish is already the celebration).
  const tierPill = !isShiny && !isAncient && showRange && sizeTier && tierShowsPill(sizeTier) ? sizeTier : null
  const isTrophyCatch = tierPill === 'trophy'
  // Shiny copy — picked once per catch (memoised on fish.id) so it
  // doesn't reshuffle on every re-render. Empty string when not shiny.
  const shinyMessage = useMemo(
    () => (isShiny ? pickShinyMessage(fish.name) : ''),
    [isShiny, fish.name],
  )

  // PB overlay is transient — sits over the fish image like a victory ribbon
  // for ~2.6s, then fades out so the rest of the card can be inspected. Stays
  // mounted long enough for the count-up to land and the player to register
  // the moment without freezing the celebration on screen forever.
  const [pbOverlayVisible, setPbOverlayVisible] = useState(isPBMoment)
  useEffect(() => {
    if (!isPBMoment) return
    setPbOverlayVisible(true)
    const t = setTimeout(() => setPbOverlayVisible(false), 2600)
    return () => clearTimeout(t)
  }, [isPBMoment])

  // Ancient deep gets its own palette + label, overriding the gold legendary look.
  // Shiny ("Golden" in player-facing copy — the internal variable name is kept
  // as isShiny to avoid touching every reference) overrides BOTH (rarity +
  // ancient) with the premium gold theme so the moment reads as the headline
  // reward of the catch, not a sub-modifier.
  const r = isShiny
    ? { label: 'Golden ✦', color: SHINY_THEME.primary, hookedText: baseR.hookedText }
    : isAncient
      ? { label: 'Ancient', color: '#e11d48', hookedText: baseR.hookedText }
      : baseR
  const isLegendary = rarity === 5 && !isAncient
  const isEpicPlus  = isShiny || rarity >= 4

  // Inset-only halos so the scrollable parent (overflowY:auto on the
  // catching area at line ~4797) can't clip the glow to a rectangle.
  // Same blur radii / alphas as the prior outer-shadow recipe — the
  // effect now reads as "lit from within" instead of "halo around"
  // but the saturation + brightness budget is the same, so each
  // rarity still tiers up visibly. The longest insets on rarity 5
  // extend well past the card's interior so the gradient continues
  // to fade through the whole card body.
  const glowShadow: Record<number, string> = {
    1: 'none',
    2: `inset 0 0 10px ${r.color}40, inset 0 0 28px ${r.color}22`,
    3: `inset 0 0 18px ${r.color}55, inset 0 0 44px ${r.color}30`,
    4: `inset 0 0 26px ${r.color}70, inset 0 0 60px ${r.color}3a`,
    5: `inset 0 0 32px ${r.color}88, inset 0 0 80px ${r.color}4a, inset 0 0 130px ${r.color}28`,
  }
  const borderOpMap: Record<number, string> = { 1: '55', 2: '70', 3: '88', 4: 'aa', 5: 'cc' }
  // Shiny matches the Treasure premium avatar background exactly:
  // bright cream-yellow center → warm amber → deep espresso edges.
  // Combined with the slow rotating blurred sunburst overlay below
  // (also lifted from .avatar-bg-treasure in globals.css), this gives
  // the same "premium glowing gold" feel as the Treasure avatar bg
  // that the player called out as the best-looking gold treatment.
  const cardBg = isShiny
    ? 'radial-gradient(circle at 50% 45%, #fde68a 0%, #b45309 55%, #4a2007 100%)'
    : 'rgba(6,16,26,0.82)'
  // Subtle warm inset glow only around the edges — gives the gold
  // border a soft "framed" depth like polished metal catching light.
  // Kept low-alpha so it doesn't reach the center and wash out the
  // fish or body text.
  const shinyGlow: string | undefined = 'inset 0 0 22px rgba(200,140,40,0.18), inset 0 0 1px rgba(255,225,140,0.55)'
  // Sparkles are now concentrated AROUND the fish (not the whole
  // card) so they reinforce the fish-is-the-wow framing. Positions
  // are roughly bounded to the central fish image area; sizes
  // vary so the field has texture without a uniform grid look.
  const shinySparkles = useMemo(
    () => Array.from({ length: 8 }, () => ({
      // Polar around center, biased to a halo radius so the sparkles
      // ring the fish without sitting directly on it.
      angle: Math.random() * Math.PI * 2,
      radius: 38 + Math.random() * 32,        // % from center
      size: 3 + Math.random() * 4,            // 3–7px
      delay: Math.random() * 2.5,
      duration: 1.8 + Math.random() * 1.4,
    })),
    [],
  )

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 330, margin: '0 auto' }}>

      {/* Ancient One discovery banner */}
      {isAncient && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 240, damping: 16, delay: 0.05 }}
          className="mb-2"
          style={{
            position: 'relative',
            padding: '0.7rem 0.95rem',
            borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(50,8,18,0.96) 0%, rgba(20,6,8,0.98) 70%, rgba(40,18,4,0.96) 100%)',
            border: '1px solid rgba(225,29,72,0.5)',
            boxShadow: '0 0 30px rgba(225,29,72,0.32), inset 0 1px 0 rgba(255,255,255,0.06)',
            overflow: 'hidden',
          }}
        >
          {/* Slow shimmer sweep across the banner */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '220%' }}
            transition={{ duration: 2.4, delay: 0.4, ease: 'easeOut', repeat: Infinity, repeatDelay: 4 }}
            style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(105deg, transparent 30%, rgba(225,29,72,0.24) 50%, rgba(253,230,138,0.22) 60%, transparent 75%)',
              pointerEvents: 'none',
            }}
          />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.26em', color: '#fde68a', marginBottom: 3 }}>
                Ancient One Discovered
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#fee2e2', lineHeight: 1.1, textShadow: '0 0 14px rgba(225,29,72,0.5)' }}>
                A relic from the deep
              </p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.35rem', color: '#e11d48', lineHeight: 1, textShadow: '0 0 12px rgba(225,29,72,0.55)' }}>
                {ancientCount}<span style={{ color: '#7a2030' }}>/{ancientTotal}</span>
              </p>
              <p className="font-karla font-600 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.15em', color: '#be123c', marginTop: 2 }}>
                Revealed
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Compact banner row — perfect / double / jackpot / gem / trophy /
          large / PB all collapse into a single flex-wrap row of slim pills
          so they never push the cast button or bottom nav off the screen.
          Each pill keeps its own accent color + the same gradient + top-
          accent chrome as before, just at ~32px tall instead of ~80px.
          Size-tier pills (Trophy / Large) and the PB pill render first so
          they catch the eye on the dopamine moments. */}
      {(tierPill || isPerfect || (jackpotMultiplier && jackpotMultiplier > 1) || doubleCatch || gemEarned || lockedStage > 0 || catchQty > 1) && (
        <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5">
          {/* Size tier leads the row — it is the rarest thing on most cards. */}
          {tierPill && (() => {
            const tc = TIER_COLOR[tierPill]
            const rgb = isTrophyCatch ? '251,191,36' : '96,165,250'
            return (
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                {/* Trophy alone gets the burst. Large is common enough (15%)
                    that ringing it every time would cheapen both. */}
                {isTrophyCatch && [0, 0.1, 0.2].map((delay, i) => (
                  <motion.div key={i}
                    initial={{ scale: 0.85, opacity: 0.75 - i * 0.2 }}
                    animate={{ scale: 2.3 - i * 0.25, opacity: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut', delay }}
                    style={{ position: 'absolute', inset: 0, borderRadius: 999,
                      border: `${1.5 - i * 0.3}px solid rgba(${rgb},${0.75 - i * 0.2})`, pointerEvents: 'none' }} />
                ))}
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className="font-karla font-700 uppercase"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: `linear-gradient(180deg, rgba(${rgb},0.22) 0%, rgba(${rgb},0.06) 100%), #0d1320`,
                    border: `1px solid rgba(${rgb},0.5)`,
                    borderTop: `1px solid rgba(${rgb},0.8)`,
                    borderRadius: 999,
                    boxShadow: isTrophyCatch ? `0 0 16px rgba(${rgb},0.4)` : `0 0 9px rgba(${rgb},0.24)`,
                    padding: '0.36rem 0.72rem',
                    fontSize: '0.62rem', letterSpacing: '0.14em', color: tc,
                  }}>
                  {isTrophyCatch && <TrophyMark size={11} color={tc} />}
                  {TIER_LABEL[tierPill]}
                </motion.div>
              </div>
            )
          })()}
          {isPerfect && (() => {
            const isOnFire = perfectStreak >= 3
            const isIgnition = perfectStreak === 3
            const s = Math.min(perfectStreak, 6)
            const accent = isOnFire ? '#fb923c' : '#fbbf24'
            const accentRgb = isOnFire ? '251,146,60' : '251,191,36'
            const glow = `0 0 ${10 + (s - 1) * 3}px rgba(${accentRgb},${0.30 + (s - 1) * 0.04})`
            return (
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                {/* Ignition burst rings — fire on first time hitting streak 3 */}
                {isIgnition && [0, 0.1, 0.2].map((delay, i) => (
                  <motion.div key={i}
                    initial={{ scale: 0.85, opacity: 0.7 - i * 0.2 }}
                    animate={{ scale: 2.2 - i * 0.25, opacity: 0 }}
                    transition={{ duration: 0.55, ease: 'easeOut', delay }}
                    style={{
                      position: 'absolute', inset: 0, borderRadius: 999,
                      border: `${1.5 - i * 0.3}px solid rgba(251,146,60,${0.7 - i * 0.2})`,
                      pointerEvents: 'none',
                    }}
                  />
                ))}
                <motion.div
                  key={perfectStreak}
                  initial={{ opacity: 0, y: -6, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className="font-karla font-700 uppercase"
                  style={{
                    background: `linear-gradient(180deg, rgba(${accentRgb},0.22) 0%, rgba(${accentRgb},0.06) 100%), #0d1320`,
                    border: `1px solid rgba(${accentRgb},0.48)`,
                    borderTop: `1px solid rgba(${accentRgb},0.78)`,
                    borderRadius: 999,
                    boxShadow: glow,
                    padding: '0.36rem 0.72rem',
                    fontSize: '0.62rem',
                    letterSpacing: '0.14em',
                    color: accent,
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ display: 'flex' }}>{isOnFire ? <IconFlame size={12} /> : <IconStar size={12} />}</span>
                  <span>{isOnFire ? 'On Fire' : 'Perfect'}</span>
                  {perfectStreak >= 2 && (
                    <span style={{ color: accent, letterSpacing: 0, textShadow: `0 0 8px rgba(${accentRgb},0.6)` }}>×{perfectStreak}</span>
                  )}
                  {baitSaved && <span style={{ color: '#86efac', letterSpacing: 0 }}>+bait</span>}
                </motion.div>
              </div>
            )
          })()}

          {/* Perfect Rod — ×N XP callout so the doubled-XP bonus is visible
              (only shows on a Perfect, which is the only time it applies). */}
          {isPerfect && perfectXpMult > 1 && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              className="font-karla font-700 uppercase"
              style={{
                background: 'linear-gradient(180deg, rgba(147,197,253,0.22) 0%, rgba(147,197,253,0.06) 100%), #0a1020',
                border: '1px solid rgba(147,197,253,0.5)',
                borderTop: '1px solid rgba(147,197,253,0.8)',
                borderRadius: 999, padding: '0.36rem 0.72rem', fontSize: '0.62rem',
                letterSpacing: '0.12em', color: '#bfe3ff',
                display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                boxShadow: '0 0 12px rgba(147,197,253,0.28)',
              }}
            >
              ×{perfectXpMult} XP
            </motion.div>
          )}

          {/* Locked-In Rod — the active stage this catch. Cyan (speed) → gold
              (triple) → prismatic (LOCKED IN), matching the rod glow. */}
          {lockedStage > 0 && (() => {
            const c = lockedStage >= 3 ? '#e879f9' : lockedStage === 2 ? '#f0c040' : '#22d3ee'
            const rgb = lockedStage >= 3 ? '232,121,249' : lockedStage === 2 ? '240,192,64' : '34,211,238'
            const label = lockedStage >= 3 ? 'Locked In' : lockedStage === 2 ? 'Locked In · Triple' : 'Locked In · Fast'
            return (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                className="font-karla font-700 uppercase"
                style={{
                  background: `linear-gradient(180deg, rgba(${rgb},0.22) 0%, rgba(${rgb},0.06) 100%), #0d1320`,
                  border: `1px solid rgba(${rgb},0.5)`, borderTop: `1px solid rgba(${rgb},0.82)`,
                  borderRadius: 999, padding: '0.36rem 0.72rem', fontSize: '0.62rem',
                  letterSpacing: '0.14em', color: c,
                  display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                  boxShadow: `0 0 ${8 + lockedStage * 4}px rgba(${rgb},0.32)`,
                }}
              >
                <IconFlame size={11} /> {label}
              </motion.div>
            )
          })()}

          {/* Locked-In triple haul (guaranteed ×3 at streak 5+). */}
          {catchQty > 1 && !doubleCatch && (!jackpotMultiplier || jackpotMultiplier <= 1) && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              className="font-karla font-700 uppercase"
              style={{
                background: 'linear-gradient(180deg, rgba(240,192,64,0.22) 0%, rgba(240,192,64,0.06) 100%), #1a1304',
                border: '1px solid rgba(240,192,64,0.5)', borderTop: '1px solid rgba(240,192,64,0.82)',
                borderRadius: 999, padding: '0.36rem 0.72rem', fontSize: '0.62rem',
                letterSpacing: '0.12em', color: '#f0c040',
                display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                boxShadow: '0 0 12px rgba(240,192,64,0.24)',
              }}
            >
              ×{catchQty} Haul
            </motion.div>
          )}

          {doubleCatch && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              className="font-karla font-700 uppercase"
              style={{
                background: 'linear-gradient(180deg, rgba(251,191,36,0.22) 0%, rgba(251,191,36,0.06) 100%), #1a1304',
                border: '1px solid rgba(251,191,36,0.50)',
                borderTop: '1px solid rgba(251,191,36,0.80)',
                borderRadius: 999,
                boxShadow: '0 0 12px rgba(251,191,36,0.22)',
                padding: '0.36rem 0.72rem',
                fontSize: '0.62rem',
                letterSpacing: '0.14em',
                color: '#fbbf24',
                display: 'inline-flex', alignItems: 'center', gap: 7,
                whiteSpace: 'nowrap',
              }}
            >
              <span>✦</span>
              <span>Double</span>
              <span style={{ color: '#fde68a', letterSpacing: 0, textShadow: '0 0 8px rgba(251,191,36,0.55)' }}>×2</span>
            </motion.div>
          )}

          {jackpotMultiplier && jackpotMultiplier > 1 && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 18 }}
              className="font-karla font-700 uppercase"
              style={{
                background: 'linear-gradient(180deg, rgba(249,115,22,0.24) 0%, rgba(249,115,22,0.06) 100%), #1a0c04',
                border: '1px solid rgba(249,115,22,0.55)',
                borderTop: '1px solid rgba(249,115,22,0.85)',
                borderRadius: 999,
                boxShadow: '0 0 14px rgba(249,115,22,0.32)',
                padding: '0.36rem 0.72rem',
                fontSize: '0.62rem',
                letterSpacing: '0.14em',
                color: '#fb923c',
                display: 'inline-flex', alignItems: 'center', gap: 7,
                whiteSpace: 'nowrap',
              }}
            >
              <span>★</span>
              <span>Jackpot</span>
              <span style={{ color: '#fdba74', letterSpacing: 0, textShadow: '0 0 8px rgba(249,115,22,0.55)' }}>×{jackpotMultiplier}</span>
            </motion.div>
          )}

          {gemEarned && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22, delay: 0.15 }}
              className="font-karla font-700 uppercase"
              style={{
                background: 'linear-gradient(180deg, rgba(99,226,183,0.20) 0%, rgba(99,226,183,0.04) 100%), #04141a',
                border: '1px solid rgba(99,226,183,0.50)',
                borderTop: '1px solid rgba(99,226,183,0.78)',
                borderRadius: 999,
                boxShadow: '0 0 12px rgba(99,226,183,0.22)',
                padding: '0.36rem 0.72rem',
                fontSize: '0.62rem',
                letterSpacing: '0.14em',
                color: '#63e2b7',
                display: 'inline-flex', alignItems: 'center', gap: 7,
                whiteSpace: 'nowrap',
              }}
            >
              <span>◆</span>
              <span>Challenge</span>
              <span style={{ color: '#9af3cf', letterSpacing: 0 }}>+1 Gem</span>
            </motion.div>
          )}
        </div>
      )}

      {/* Card + all its effects in one relative container */}
      <div style={{ position: 'relative' }}>

        {/* ── Cinematic golden light shaft (shiny only) ──────────────
            A tall, narrow column of warm light that drops down behind
            the card during the reveal — like the heavens cracking open
            on a trophy pull. Starts above the card, sweeps down past
            the bottom over ~1.2s, peaks in opacity around the moment
            the fish punches in. Soft blur + wide gradient edges so it
            reads as light, not a shape. */}
        {isShiny && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0, y: -80, scaleY: 0.6 }}
            animate={{ opacity: [0, 0.7, 0.5, 0], y: [-80, -20, 20, 60], scaleY: [0.6, 1.05, 1.1, 1.2] }}
            transition={{ duration: 1.4, ease: 'easeOut', delay: 0.1, times: [0, 0.4, 0.65, 1] }}
            style={{
              position: 'absolute', top: '-30%', left: '50%',
              width: 220, height: '160%',
              marginLeft: -110,
              background: 'linear-gradient(180deg, transparent 0%, rgba(255,235,160,0.35) 12%, rgba(255,210,90,0.55) 38%, rgba(255,225,140,0.45) 62%, rgba(255,210,90,0.25) 82%, transparent 100%)',
              filter: 'blur(10px)',
              pointerEvents: 'none',
              zIndex: 0,
              mixBlendMode: 'screen',
            }}
          />
        )}

        {/* ── Outer glow ring — shockwave that radiates outward from
            behind the card as it lands. Single expanding ring, gold,
            heavily blurred — the "impact" pulse. Fires once at delay
            0.16s so it coincides with the card's spring-overshoot
            apex. */}
        {isShiny && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0.75, scale: 0.6 }}
            animate={{ opacity: 0, scale: 2.4 }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.16 }}
            style={{
              position: 'absolute', inset: 0,
              borderRadius: '50%',
              border: '4px solid rgba(255,225,140,0.85)',
              boxShadow: '0 0 40px rgba(255,210,90,0.7), inset 0 0 24px rgba(255,235,160,0.6)',
              filter: 'blur(2px)',
              pointerEvents: 'none', zIndex: 0,
            }}
          />
        )}

        {/* Burst rings — epic gets 2, legendary 3, ancient 5 */}
        {isEpicPlus && (isAncient ? [0, 0.1, 0.22, 0.36, 0.52] : [0, 0.09, ...(isLegendary ? [0.18] : [])]).map((delay, i) => (
          <motion.div key={i}
            initial={{ scale: 0.86, opacity: isAncient ? 0.85 - i * 0.13 : isLegendary ? 0.75 - i * 0.18 : 0.55 - i * 0.15 }}
            animate={{ scale: isAncient ? 2.2 - i * 0.18 : isLegendary ? 1.9 - i * 0.18 : 1.55 - i * 0.12, opacity: 0 }}
            transition={{ duration: isAncient ? 0.95 : isLegendary ? 0.7 : 0.5, ease: 'easeOut', delay: delay + (isAncient ? 0.16 : isLegendary ? 0.12 : 0.04) }}
            style={{
              position: 'absolute', inset: 0, borderRadius: '1rem',
              border: `${isAncient ? 1.6 - i * 0.22 : isLegendary ? 1.5 - i * 0.3 : 1}px solid ${r.color}${isAncient ? 'cc' : isLegendary ? 'dd' : '99'}`,
              pointerEvents: 'none', zIndex: 2,
            }}
          />
        ))}

        {/* Legendary color bloom — suppressed for shiny (own gold treatment) */}
        {isLegendary && !isShiny && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.22, 0] }}
            transition={{ duration: 0.55, delay: 0.1, ease: 'easeOut' }}
            style={{
              position: 'absolute', inset: -24, borderRadius: '2rem',
              background: `radial-gradient(ellipse at 50% 55%, ${r.color}60 0%, transparent 68%)`,
              pointerEvents: 'none', zIndex: 0,
            }}
          />
        )}

        {/* Ancient color bloom — violet to cyan iridescent */}
        {isAncient && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.32, 0.18, 0] }}
            transition={{ duration: 1.2, delay: 0.1, ease: 'easeOut' }}
            style={{
              position: 'absolute', inset: -32, borderRadius: '2.4rem',
              background: 'radial-gradient(ellipse at 50% 55%, rgba(225,29,72,0.55) 0%, rgba(253,230,138,0.28) 40%, transparent 75%)',
              pointerEvents: 'none', zIndex: 0,
            }}
          />
        )}

        {/* Glow halo previously sat as a separate motion.div behind the
            card (inset:-1, boxShadow: outer rarity glow). Moved onto
            the card itself as inset shadows below — the scrollable
            parent (overflowY:auto on the catching area) was clipping
            the outer halo to a rectangle on every rarity, losing the
            rounded corners. Insets render inside the card's bounds so
            the rounding is preserved. Pulse for epic+ became a soft
            opacity oscillation on a separate radial-gradient overlay
            so the highlight still breathes. */}
        {rarity >= 2 && !isShiny && isEpicPlus && (
          <motion.div
            animate={{ opacity: [0.45, 0.85, 0.45] }}
            transition={{ duration: isLegendary ? 1.2 : 1.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', inset: 0, borderRadius: '1rem',
              background: `radial-gradient(ellipse at 50% 55%, ${r.color}28 0%, transparent 70%)`,
              pointerEvents: 'none', zIndex: 1,
            }}
          />
        )}

      {/* Card. Shiny punches in faster + bigger overshoot — a real
          spring snap rather than the slow settle the legendary uses.
          Combined with the burst + particle explosion below this is
          the "dopamine shot" moment when the card lands.
          When shiny, the background-position also continuously drifts
          to create the holographic foil shimmer across the iridescent
          jewel-tone gradient. background-size on the style is 300%
          300% so the gradient has room to travel without exposing the
          repeat seam. */}
      <motion.div
        initial={{ opacity: 0, y: isShiny ? -90 : isAncient ? 48 : isLegendary ? 40 : isEpicPlus ? 24 : 16, scale: isShiny ? 0.42 : isAncient ? 0.78 : isLegendary ? 0.84 : isEpicPlus ? 0.91 : 0.96, rotate: isShiny ? -22 : 0 }}
        animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: isShiny ? 200 : isAncient ? 110 : isLegendary ? 140 : isEpicPlus ? 210 : 280, damping: isShiny ? 12 : isAncient ? 10 : isLegendary ? 11 : isEpicPlus ? 16 : 22, delay: isShiny ? 0.12 : isAncient ? 0.18 : isLegendary ? 0.1 : 0 }}
        className={isShiny ? 'overflow-hidden' : 'rounded-2xl overflow-hidden'}
        style={{
          // Shiny gets strongly rounded corners (2.5rem) for a
          // polished treasure-chest-trim / coin-slab silhouette
          // that reads distinct from the standard rounded-2xl
          // (~1rem) used by every other catch card.
          border: isShiny
            ? '2px solid rgba(228,188,108,0.85)'
            : `1px solid ${r.color}${borderOpMap[rarity] ?? '55'}`,
          borderRadius: isShiny ? '2.5rem' : undefined,
          background: cardBg,
          // Non-shiny cards are translucent; a light frosted blur keeps the
          // text crisp over the fishing scene behind.
          ...(isShiny ? {} : { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }),
          position: 'relative', zIndex: 1,
          // Shiny → its own gold inset glow; everything else → the
          // rarity-tiered inset halo (replaces the prior outer halo
          // motion.div that was getting clipped by the scrollable
          // parent). Rarity-1 commons get no glow as before.
          boxShadow: isShiny ? shinyGlow : (rarity >= 2 ? glowShadow[rarity] : undefined),
        }}
      >
        {/* ── Treasure-style gold overlay for shiny ─────────────────
            Lifted directly from .avatar-bg-treasure in globals.css —
            the same premium golden bg the player loves on the avatar.
            A slow-rotating blurred conic-gradient creates a soft
            sunburst of light that drifts across the gold surface
            (14s per rotation). Sits on top of the radial gold base
            (cardBg above) but below the content (zIndex 1).
            All pointer-events: none so it doesn't intercept taps. */}
        {isShiny && (
          <motion.div
            aria-hidden
            animate={{ rotate: 360 }}
            transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
            style={{
              position: 'absolute', inset: '-30%',
              background: `conic-gradient(from 0deg,
                rgba(255, 248, 200, 0.55), rgba(255, 248, 200, 0) 22%,
                rgba(255, 248, 200, 0.45), rgba(255, 248, 200, 0) 50%,
                rgba(255, 248, 200, 0.55), rgba(255, 248, 200, 0) 78%,
                rgba(255, 248, 200, 0.55))`,
              filter: 'blur(4px)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        )}

        {/* Legendary shimmer sweep */}
        {isLegendary && !isShiny && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '220%' }}
            transition={{ duration: 1.5, delay: 0.6, ease: 'easeOut', repeat: Infinity, repeatDelay: 3.5 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
              background: 'linear-gradient(105deg, transparent 25%, rgba(255,210,80,0.30) 50%, transparent 75%)',
            }}
          />
        )}

        {/* Ancient iridescent sweep — slower, dual-tone */}
        {isAncient && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '220%' }}
            transition={{ duration: 2.2, delay: 0.7, ease: 'easeOut', repeat: Infinity, repeatDelay: 3.0 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
              background: 'linear-gradient(105deg, transparent 22%, rgba(225,29,72,0.32) 48%, rgba(253,230,138,0.28) 56%, transparent 78%)',
            }}
          />
        )}

        {/* Header band — rarity tag + "New Species" if applicable. Hidden
            entirely on common catches that aren't new species: that's the
            most-frequent path, and the band was a whole row of chrome just
            to say "yeah, normal one." Epic+ rarity gets the band (chrome
            reinforces the moment); a common first-catch gets the band so
            the New badge has a home. Zone label dropped long ago. */}
        {/* Rarity band. The big "SHINY" hero was removed (the fish is
            the wow now) — but the small "Shiny ✦" label here still
            tells the player what just happened, sitting alongside any
            "New ✦" pill. Shiny uses cream-on-dark instead of gold-on-
            gold (which had no contrast). */}
        {(rarity >= 2 || isNewSpecies || isShiny) && (
          <div className="px-4 py-2 flex items-center justify-center gap-2"
            style={{
              position: 'relative', zIndex: 2,
              // Warm dark amber band for shiny — matches the trophy-
              // plaque card chrome. Bottom edge gets a soft gold line
              // to echo the outer gold border.
              background: isShiny ? 'rgba(34,22,8,0.62)' : `${r.color}28`,
              borderBottom: isShiny ? '1px solid rgba(200,160,90,0.4)' : `1px solid ${r.color}45`,
            }}>
            <span className="font-karla font-700 uppercase tracking-[0.18em]"
              style={{
                fontSize: '0.58rem',
                color: isShiny ? '#fff2cc' : r.color,
                background: isShiny ? 'rgba(80,52,18,0.5)' : `${r.color}1c`,
                border: isShiny ? '1px solid rgba(218,178,98,0.65)' : `1px solid ${r.color}45`,
                padding: '0.18rem 0.6rem', borderRadius: '2rem',
                textShadow: isShiny ? '0 0 8px rgba(251,204,74,0.55)' : 'none',
              }}>
              {r.label}{!isShiny && rarity >= 4 ? ' ✦' : ''}
            </span>
            {isNewSpecies && (
              <motion.span
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.2 }}
                className="font-karla font-700 uppercase tracking-[0.18em]"
                style={{ fontSize: '0.58rem', color: '#fde68a',
                  background: 'rgba(253,230,138,0.15)', border: '1px solid rgba(253,230,138,0.4)',
                  padding: '0.18rem 0.6rem', borderRadius: '2rem' }}
              >New ✦</motion.span>
            )}
            {/* THE RANK YOU JUST TOOK, on the card itself. Without it the
                hardest catch in the game reads identically to an ordinary one
                until the Mounting arrives a beat and a half later. */}
            {vigilRankUp && (() => {
              const vf = VIGIL_FRAME[vigilRankUp.to]
              return (
                <motion.span
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 16, delay: 0.28 }}
                  className="font-karla font-800 uppercase tracking-[0.18em]"
                  style={{ fontSize: '0.58rem', color: vf.accent,
                    background: `${vf.accent}1e`, border: `1px solid ${vf.accent}70`,
                    padding: '0.18rem 0.6rem', borderRadius: '2rem',
                    textShadow: `0 0 10px ${vf.glow}` }}
                >{vigilRankUp.to >= VIGIL_MAX_RANK ? 'Mastered ★' : `Rank ${vigilNumeral(vigilRankUp.to)}`}</motion.span>
              )
            })()}
          </div>
        )}

        {/* Body — fish is the hero, but the card has to fit on screen
            without scrolling. Tight top/bottom padding + a shrunken image
            keep the whole result block in view even with the Ancient
            banner + 4 pills above on a small phone. */}
        <div style={{ position: 'relative', zIndex: 2, padding: isShiny ? '0.35rem 0.85rem 0.55rem' : '0.5rem 0.6rem 0.65rem' }}>
          {/* Fish image — entrance bounce so it FEELS like a reveal.
              Wrapped in a position:relative so the transient PB ribbon can
              overlay directly on top of the fish (auto-dismisses ~2.6s
              after the catch). Height intentionally compact so the card
              fits a tall result phase without scrolling. */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.04 }}
            style={{
              position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              // Shiny hugs the fish — no minHeight padding, tighter
              // marginBottom — so the bigger sprite fills the card chrome
              // without empty halo space around it.
              marginBottom: isShiny ? '0.05rem' : '0.1rem',
            }}
          >
            {/* DOPAMINE-SHOT v2 — layered burst sequence on entry. */}
            {isShiny && (
              <>
                {/* 1) Bright white-cored flash. Punches the catch with a
                       hard pop of light before settling into the warmer
                       burst beneath it. */}
                <div aria-hidden style={{
                  position: 'absolute', top: '50%', left: '50%',
                  width: 160, height: 160,
                  marginLeft: -80, marginTop: -80,
                  pointerEvents: 'none', zIndex: 1,
                }}>
                  <motion.div
                    initial={{ opacity: 1, scale: 0 }}
                    animate={{ opacity: 0, scale: 3.6 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
                    style={{
                      width: '100%', height: '100%',
                      borderRadius: '50%',
                      background: 'radial-gradient(circle, rgba(255,255,255,0.96) 0%, rgba(255,235,150,0.75) 28%, rgba(255,200,80,0.4) 55%, transparent 75%)',
                    }}
                  />
                </div>

                {/* 2) Warm gold burst — lingers a little longer than the
                       white flash, fading from scale 0 to 4.5 over 0.95s. */}
                <div aria-hidden style={{
                  position: 'absolute', top: '50%', left: '50%',
                  width: 200, height: 200,
                  marginLeft: -100, marginTop: -100,
                  pointerEvents: 'none', zIndex: 1,
                }}>
                  <motion.div
                    initial={{ opacity: 0.85, scale: 0 }}
                    animate={{ opacity: 0, scale: 4.5 }}
                    transition={{ duration: 0.95, ease: 'easeOut', delay: 0.22 }}
                    style={{
                      width: '100%', height: '100%',
                      borderRadius: '50%',
                      background: 'radial-gradient(circle, rgba(255,225,140,0.9) 0%, rgba(255,200,80,0.6) 26%, rgba(251,191,36,0.22) 55%, transparent 75%)',
                    }}
                  />
                </div>

                {/* 3) Concentric ring waves — 3 expanding gold rings,
                       staggered by 150ms each. Reads like the catch
                       is sending pulses of energy outward. Each ring
                       is just a border with no fill, so they read as
                       sharp pulses rather than soft blooms. */}
                {[0, 0.15, 0.3].map((extraDelay, i) => (
                  <div key={`ring-${i}`} aria-hidden style={{
                    position: 'absolute', top: '50%', left: '50%',
                    width: 70, height: 70,
                    marginLeft: -35, marginTop: -35,
                    pointerEvents: 'none', zIndex: 1,
                  }}>
                    <motion.div
                      initial={{ scale: 0, opacity: 0.95 }}
                      animate={{ scale: 4.2, opacity: 0 }}
                      transition={{ duration: 1.1, ease: 'easeOut', delay: 0.28 + extraDelay }}
                      style={{
                        width: '100%', height: '100%',
                        borderRadius: '50%',
                        border: '2px solid rgba(255,225,140,0.85)',
                        boxShadow: '0 0 16px rgba(255,210,90,0.85), inset 0 0 12px rgba(255,235,160,0.55)',
                      }}
                    />
                  </div>
                ))}
              </>
            )}

            {/* Particle burst — 15 sparkles now (was 10), flying farther
                (110-160px instead of 75-110), with a tiny random rotation
                tumble during travel. Wraps each in a static-positioned
                span so framer-motion's x/y animation doesn't fight a
                centering transform. */}
            {isShiny && (
              <div aria-hidden style={{ position: 'absolute', top: '50%', left: '50%', width: 0, height: 0, pointerEvents: 'none', zIndex: 3 }}>
                {Array.from({ length: 15 }).map((_, i) => {
                  const angle = (i / 15) * Math.PI * 2 + Math.random() * 0.25
                  const distance = 110 + Math.random() * 50
                  const tumble = (Math.random() - 0.5) * 180
                  return (
                    <motion.span
                      key={i}
                      initial={{ opacity: 1, x: 0, y: 0, scale: 0.4, rotate: 0 }}
                      animate={{
                        opacity: [1, 1, 0],
                        x: Math.cos(angle) * distance,
                        y: Math.sin(angle) * distance,
                        scale: [0.4, 1.2, 0.6],
                        rotate: tumble,
                      }}
                      transition={{ duration: 1.0, ease: 'easeOut', delay: 0.24 + i * 0.008, times: [0, 0.55, 1] }}
                      style={{
                        position: 'absolute',
                        top: -4, left: -4,
                        width: 8, height: 8,
                        borderRadius: '50%',
                        background: '#fff8dc',
                        boxShadow: '0 0 10px #fbcc4a, 0 0 22px rgba(251,204,74,0.85)',
                      }}
                    />
                  )
                })}
              </div>
            )}

            {/* Radial halo behind the fish removed — even with
                border-radius:50% and no filter:blur, the radial
                gradient div's 220×220 bounds rendered as a visible
                rectangle against the warm card background (the
                circular fade blended into the surrounding warmth
                and the element's square footprint showed through).
                The fish's own gold rim drop-shadow + the entrance
                burst + the orbiting sparkles supply all the ambient
                gold light without needing a static halo div behind. */}

            {/* Sparkles ringing the fish in polar coords from center.
                Same wrapper-split as the halo above: outer span owns
                the static polar position + the translate(-50%,-50%)
                centering, inner motion.span owns the scale/opacity
                animation. Without the split, framer-motion's scale
                animation overwrote the centering translate and the
                sparkle dot slid off-position by half its size on each
                animation frame. */}
            {isShiny && (
              <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
                {shinySparkles.map((s, i) => (
                  <span
                    key={i}
                    style={{
                      position: 'absolute',
                      left: `calc(50% + ${Math.cos(s.angle) * s.radius}%)`,
                      top:  `calc(50% + ${Math.sin(s.angle) * s.radius}%)`,
                      width: s.size, height: s.size,
                      transform: 'translate(-50%, -50%)',
                      display: 'block',
                    }}
                  >
                    <motion.span
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: [0, 1, 0], scale: [0, 1.2, 0] }}
                      transition={{ duration: s.duration, delay: s.delay, repeat: Infinity, repeatDelay: 0.8, ease: 'easeOut' }}
                      style={{
                        display: 'block',
                        width: '100%', height: '100%',
                        borderRadius: '50%',
                        background: '#fffbe6',
                        boxShadow: `0 0 ${s.size * 3}px #fbcc4a, 0 0 ${s.size * 7}px rgba(251,204,74,0.65)`,
                      }}
                    />
                  </span>
                ))}
              </div>
            )}

            {/* Fish image — double-wrap for shiny:
                  outer motion.div: punch-in animation (one-shot).
                    scale 0 → 1.25 (big overshoot) → 0.95 → 1.0 over
                    ~0.65s with a spring-like ease, so the fish
                    literally PUNCHES INTO the card after the burst.
                  inner motion.div: breathing animation (infinite),
                    delayed until after the punch-in lands so the
                    two never conflict.
                Earlier 68% / 190px / 108px size kept; the entrance
                drama comes from the punch-in motion, not raw size. */}
            <motion.div
              initial={isShiny ? { scale: 0, opacity: 0 } : false}
              animate={isShiny ? { scale: [0, 1.25, 0.92, 1.04, 1], opacity: 1 } : undefined}
              transition={isShiny ? { duration: 0.65, ease: 'easeOut', delay: 0.32, times: [0, 0.45, 0.65, 0.85, 1] } : undefined}
              style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <motion.div
                animate={isShiny ? { y: [0, -2.5, 0], scale: [1, 1.022, 1] } : undefined}
                transition={isShiny ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 1.1 } : undefined}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <FishImg
                  name={fish.name}
                  style={{
                    // Shiny gets a noticeably bigger fish so it dominates
                    // the card like a SIR full-art (the art is meant to
                    // BE the card, not be framed by the chrome). Tuned
                    // up to 138px with the surrounding container hugging
                    // tight (no minHeight padding) so the bigger sprite
                    // gains presence without the card itself growing.
                    // Normal catches got bumped too (was 62%/170/92) — the
                    // fish was swimming in empty padding; now it fills the
                    // card width and stands taller as the hero art.
                    width: isShiny ? '88%' : '86%',
                    maxWidth: isShiny ? 240 : 250,
                    // Box height hugs the (wide) art so there's no dead
                    // vertical space above/below — width is the constraint at
                    // this size, so trimming height doesn't shrink the fish.
                    height: isShiny ? 138 : 104,
                    objectFit: 'contain',
                    // Shiny stacks the gold filter (lib/shiny.ts) on top
                    // of a warm drop-shadow for the "hovering metal" feel.
                    filter: isShiny
                      ? `${SHINY_FISH_FILTER} drop-shadow(0 8px 18px rgba(120,70,8,0.55))`
                      : `drop-shadow(0 6px 14px ${r.color}55)${isEpicPlus ? ` drop-shadow(0 0 22px ${r.color}40)` : ''}`,
                  }}
                />
              </motion.div>
            </motion.div>

            {/* PB ribbon — overlays the fish on a personal-best catch, then
                fades out so the rest of the card can be read. Plain-English
                copy ("Your biggest yet!") for non-jargon clarity.
                The outer wrapper handles centering (translate -50%/-50%)
                statically because framer-motion's y/scale animations write
                the whole transform property and would clobber a static
                translate, shifting the ribbon off-center. AnimatePresence
                lives inside the centering shell. */}
            {isPBMoment && (
              <div style={{
                position: 'absolute', top: '38%', left: '50%',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none', zIndex: 5,
              }}>
                <AnimatePresence>
                  {pbOverlayVisible && (
                    <motion.div
                      key="pb-ribbon"
                      initial={{ opacity: 0, y: 8, scale: 0.85 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 340, damping: 18, delay: 0.45 }}
                      className="font-karla font-700 uppercase"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        padding: '0.4rem 0.85rem', borderRadius: 999,
                        fontSize: '0.66rem', letterSpacing: '0.16em',
                        color: '#5eead4',
                        // Translucent so the fish still reads through the ribbon
                        // instead of being hidden behind a solid card.
                        background: 'linear-gradient(180deg, rgba(15,30,28,0.5) 0%, rgba(8,18,18,0.5) 100%)',
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                        border: '1px solid rgba(94,234,212,0.55)',
                        boxShadow: '0 0 18px rgba(94,234,212,0.45), 0 6px 22px rgba(0,0,0,0.45)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span aria-hidden style={{ fontSize: '0.84rem', display: 'flex' }}><IconTrophy size={13} /></span>
                      <span>Your biggest yet!</span>
                      {previousBest != null && (
                        <span style={{ color: '#99f6e4', letterSpacing: 0 }}>+{(sizeIn - previousBest).toFixed(1)} in</span>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

          </motion.div>

          {/* Name. Shiny gets bigger, more ornate Cinzel + a wide
              gold gradient text with a soft warm shadow — reads as the
              centerpiece of the holographic card. Regular catches keep
              the standard size. Shiny also prefixes the species name
              with "Golden" so the card actually reads as e.g.
              "Golden Pickerel" instead of just "Pickerel". */}
          <p className="font-cinzel font-700 text-center"
            style={isShiny ? {
              fontSize: '1.55rem',
              letterSpacing: '0.06em',
              lineHeight: 1.1,
              marginBottom: '0.5rem',
              background: 'linear-gradient(180deg, #ffeec0 0%, #e6b85a 55%, #a87a2e 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 1px 0 rgba(60,30,4,0.7)) drop-shadow(0 0 18px rgba(251,191,36,0.55))',
            } : {
              fontSize: '1.25rem',
              color: r.color,
              lineHeight: 1.1,
              marginBottom: hasSize ? '0.35rem' : '0.55rem',
            }}>
            {isShiny ? `Golden ${fish.name}` : fish.name}
          </p>

          {/* Ancient Deep breadcrumb — a rare, faint omen on a common-bait catch
              while giants remain. Deliberately vague: it never names the lure,
              only that something down there did not rise. Pairs with the lures'
              own "the oldest things rise for its shine" flavor. */}
          {deepStirs && (
            <p className="font-karla italic text-center" style={{ fontSize: '0.62rem', color: 'rgba(192,132,252,0.72)', lineHeight: 1.4, marginTop: '-0.15rem', marginBottom: '0.5rem' }}>
              Something vast stirred in the black below, and did not rise.
            </p>
          )}

          {/* Ornate gold divider — only on shiny. Reads as a holographic
              card's section break with two flanking diamond dots. */}
          {isShiny && (
            <div aria-hidden style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, marginBottom: '0.5rem',
            }}>
              <div style={{ width: 38, height: 1, background: 'linear-gradient(90deg, transparent, rgba(228,188,108,0.85), transparent)' }} />
              <span style={{ width: 5, height: 5, transform: 'rotate(45deg)', background: 'rgba(228,188,108,0.95)', boxShadow: '0 0 6px rgba(251,191,36,0.7)' }} />
              <div style={{ width: 38, height: 1, background: 'linear-gradient(90deg, transparent, rgba(228,188,108,0.85), transparent)' }} />
            </div>
          )}

          {/* ── Size readout — the new hero of the card ──
              Big counter that ticks up from 0 over ~700ms; range bar below
              shows where this catch landed in the species's range. Large and
              Trophy tint the bar, the needle and the length itself. Ancients
              get just the canonical number — no range bar (single defined
              catch, nothing to compare to). */}
          {hasSize && !isShiny && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, delay: 0.1 }}
              style={{ textAlign: 'center', marginBottom: '0.5rem' }}
            >
              {/* Sell ⟡ + XP are the headline row now (skipped for ancients —
                  trophies have no sale). The catch length drops down into the
                  range labels under the bar so it reads in the context of the
                  species's min/max. */}
              {!isAncient && (
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 12 }}>
                  <span className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f0c040', lineHeight: 1, textShadow: '0 0 11px rgba(240,192,64,0.32)', fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' }}>
                    {fish.sell_value.toLocaleString()}<span style={{ fontSize: '0.95rem', marginLeft: 3 }}>⟡</span>
                  </span>
                  {xpGained > 0 && (
                    <>
                      <span style={{ color: '#3a3835', fontSize: '0.8rem' }}>·</span>
                      <span className="font-karla font-700" style={{ fontSize: '0.95rem', color: '#86efac', lineHeight: 1, whiteSpace: 'nowrap' }}>
                        +{xpGained} XP
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Length stands alone (centered) only when there's no range bar
                  to host it — ancients and any fish without a real range. */}
              {!showRange && (
                <span
                  className="font-cinzel font-700"
                  style={{
                    display: 'inline-block',
                    marginTop: isAncient ? 0 : '0.35rem',
                    fontSize: '1.85rem', lineHeight: 1,
                    color: '#f0ede8',
                    textShadow: '0 0 12px rgba(255,255,255,0.18)',
                    fontFeatureSettings: '"tnum"',
                    letterSpacing: '0.01em',
                  }}
                >
                  {formatFishLength(displaySize)}
                </span>
              )}

              {/* Range bar — only when there's a real range. Slim track with
                  a glowing needle at the catch's percentile. Labels at the
                  ends so the player learns the species's natural scale. */}
              {showRange && (
                <div style={{ marginTop: 8, padding: '0 0.3rem' }}>
                  <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'visible' }}>
                    {/* Fill from min up to the needle so the catch's spot in
                        the range reads at a glance. */}
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${sizePercentile * 100}%`,
                      // The bar carries the tier too, so the cue is where the
                      // player is already looking to judge the catch.
                      background: tierPill
                        ? `linear-gradient(90deg, ${TIER_COLOR[tierPill]}22 0%, ${TIER_COLOR[tierPill]} 100%)`
                        : 'linear-gradient(90deg, rgba(176,141,79,0.12) 0%, rgba(176,141,79,0.55) 100%)',
                      borderRadius: 3,
                    }} />
                    {/* Needle */}
                    <motion.div
                      initial={{ left: 0, opacity: 0 }}
                      animate={{ left: `${sizePercentile * 100}%`, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.45 }}
                      style={{
                        position: 'absolute', top: '50%',
                        width: 3, height: 14,
                        marginLeft: -1.5, marginTop: -7,
                        borderRadius: 2,
                        background: tierPill ? TIER_COLOR[tierPill] : '#f0ede8',
                        boxShadow: tierPill
                          ? `0 0 ${isTrophyCatch ? 12 : 8}px ${TIER_COLOR[tierPill]}`
                          : '0 0 6px rgba(255,255,255,0.35)',
                      }}
                    />
                  </div>
                  {/* Min — the caught length (the hero, brighter & larger) —
                      max. Putting the catch between its bounds, right under
                      the needle, reads in context of where it landed. */}
                  <div className="flex justify-between items-baseline" style={{ marginTop: 9 }}>
                    <span style={{ fontSize: '0.5rem', color: '#5a5856', letterSpacing: '0.18em', textTransform: 'uppercase' }}>{formatFishLength(sizeMin!)}</span>
                    <span className="font-cinzel font-700" style={{ fontSize: isTrophyCatch ? '1.25rem' : '1.05rem', color: tierPill ? TIER_COLOR[tierPill] : '#f0ede8', lineHeight: 1, textShadow: tierPill ? `0 0 12px ${TIER_COLOR[tierPill]}88` : '0 0 10px rgba(255,255,255,0.18)', fontFeatureSettings: '"tnum"' }}>{formatFishLength(displaySize)}</span>
                    <span style={{ fontSize: '0.5rem', color: '#5a5856', letterSpacing: '0.18em', textTransform: 'uppercase' }}>{formatFishLength(sizeMax!)}</span>
                  </div>
                </div>
              )}
              {/* "Largest you've caught" caption removed — the collection
                  drawer now owns per-species PB display. Result card stays
                  focused on THIS catch. */}
            </motion.div>
          )}

          {/* Shiny (and any sizeless catch) skips the flanked length row, so
              its sale + XP show on a compact centered line here instead. */}
          {!isAncient && (isShiny || !hasSize) && (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 12, marginBottom: '0.5rem' }}>
              <span className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0c040', lineHeight: 1, textShadow: '0 0 10px rgba(240,192,64,0.32)' }}>
                {(isShiny ? fish.sell_value * SHINY_SELL_MULT : fish.sell_value).toLocaleString()}<span style={{ fontSize: '0.78rem', marginLeft: 3 }}>⟡</span>
              </span>
              {xpGained > 0 && (
                <>
                  <span style={{ color: '#3a3835', fontSize: '0.7rem' }}>·</span>
                  <span className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#86efac' }}>+{xpGained} XP</span>
                </>
              )}
            </div>
          )}

          {/* Trophy badge — ancient catches go on display, no sell price. */}
          {isAncient && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.22 }}
              className="font-karla font-700 uppercase text-center"
              style={{
                fontSize: '0.7rem', letterSpacing: '0.22em',
                color: r.color,
                background: `${r.color}14`, border: `1px solid ${r.color}45`,
                borderRadius: 999, padding: '0.4rem 1rem',
                marginBottom: '0.7rem',
                alignSelf: 'center', display: 'inline-block',
                textShadow: `0 0 10px ${r.color}66`,
                marginLeft: '50%', transform: 'translateX(-50%)',
              }}
            >
              ★ Trophy
            </motion.div>
          )}

          {/* A captain's-log style message ONLY on shiny catches — a
              moment-of-record. The fun fact used to show here for normal
              catches, but nobody read it; it now lives in the collection log
              (each fish's Captain's Note), which keeps this card compact. */}
          {isShiny && (
            <p className="text-center" style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: '0.74rem',
              fontStyle: 'italic',
              fontWeight: 500,
              color: 'rgba(238,210,150,0.92)',
              lineHeight: 1.4,
              padding: '0 0.4rem',
              textShadow: '0 0 12px rgba(245,205,110,0.25)',
            }}>
              &ldquo;{shinyMessage}&rdquo;
            </p>
          )}
        </div>
      </motion.div>
    </div>
    </div>
  )
}
