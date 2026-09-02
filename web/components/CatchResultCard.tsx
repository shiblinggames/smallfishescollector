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
import { motion } from 'framer-motion'
import type { FishSpecies } from '@/app/(app)/fishing/actions'
import { vigilNumeral } from '@/lib/ancientVigil'
import { formatFishLength, tierShowsPill, TIER_COLOR, TIER_LABEL, type FishSizeTier } from '@/lib/fishSize'
import { SHINY_FISH_FILTER, SHINY_THEME, pickShinyMessage } from '@/lib/shiny'

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

/**
 * ── THE CATCH, IN AS LITTLE ROOM AS IT TAKES ────────────────────────────────
 *
 * This was a four-hundred-pixel panel and it had two problems that were really
 * one problem.
 *
 * IT COVERED THE THING IT WAS ABOUT. The sea underneath is full of shoals now,
 * a fish breaks the surface on every catch, and the dial burns behind it on a
 * streak. All of that happens and then a card lands on top of it. The most
 * repeated screen in the game was occluding the most repeated moment.
 *
 * AND NOTHING ON IT WAS QUIET. Every surface carried a gradient AND a border
 * AND a `0 0 Npx` glow, and on top of those sat a light shaft, an outer glow
 * ring, two to five burst rings, a colour bloom, a glow halo, a gold overlay,
 * two shimmer sweeps, a three-part flash sequence behind the fish, fifteen
 * sparkle particles and a second ring of sparkles in polar coordinates. Every
 * one of them was defensible alone. Together, in different hues, on top of each
 * other, they had nowhere to sit: that is what "the gradients do not coexist"
 * is describing, and no amount of retuning any single layer fixes it.
 *
 * ── ONE LIT SURFACE ─────────────────────────────────────────────────────────
 *
 * The rule this is rebuilt on. The FISH is lit; it is what you caught and the
 * only thing on here that earns a glow. Everything else is flat and opaque: one
 * background colour, one rarity-coloured hairline, hairline rules between the
 * numbers, and no gradient anywhere. A card where one thing glows has a
 * subject. A card where everything glows has a mood.
 *
 * ── AND IT CARRIES FOUR THINGS ──────────────────────────────────────────────
 *
 * The fish, its name, its size, and what it paid. The size RANGE BAR, the
 * percentile needle, the PB ribbon overlay, the ornate divider and the verdict
 * line are all gone: the first three are a second, quieter story about a number
 * that is already on the card, and the verdict is redundant now that the dial
 * behind it is visibly on fire.
 *
 * The rare states survive as ONE FLAT LINE each rather than as a theme: a new
 * species, a Golden, an Ancient's tally, a Vigil rank. They change the accent
 * colour and they say what happened, which is the whole of what they need to
 * do while the splash and the card's own landing carry the drama.
 */
// `isPerfect`, `perfectStreak`, `sizeMin`, `sizeMax` and `lockedStage` are
// deliberately NOT destructured. They stay in the type because they are what
// reelIn returns and the caller is right to hand over the whole payload; the
// card simply no longer draws them. Perfect and the streak are said far more
// loudly by the dial burning behind this card, and the two size bounds only
// ever fed the range bar.
export function ResultCard({ fish, baitSaved, isNewSpecies, xpGained, doubleCatch, gemEarned, streakBonusXP = 0, jackpotMultiplier, perfectXpMult = 1, catchQty = 1, ancientCount = 0, ancientTotal = 6, sizeIn, sizeTier, isPB, previousBest, isShiny = false, deepStirs = false, vigilRankUp = null }: {
  fish: FishSpecies
  baitSaved: boolean
  isNewSpecies: boolean
  isPerfect: boolean
  vigilRankUp?: { from: number; to: number } | null
  xpGained: number
  doubleCatch?: boolean
  gemEarned?: boolean
  perfectStreak?: number
  streakBonusXP?: number
  jackpotMultiplier?: number
  perfectXpMult?: number
  lockedStage?: number
  catchQty?: number
  ancientCount?: number
  ancientTotal?: number
  sizeIn: number
  sizeMin?: number
  sizeMax?: number
  sizeTier?: FishSizeTier
  isPB: boolean
  previousBest: number | null
  isShiny?: boolean
  deepStirs?: boolean
}) {
  // The six trophies, told apart from the twelve regulars that share their
  // water by having no sell value. Same discriminator the server routes on.
  const isAncient = fish.habitat === 'ancient_deep' && (fish.sell_value ?? 0) === 0
  const rarity = fish.bite_rarity ?? 1
  const baseR = RARITY[rarity] ?? RARITY[1]

  /** THE ONE ACCENT. Everything coloured on this card reads it, so the card
   *  cannot end up wearing three hues at once the way it used to. */
  const accent = isShiny ? SHINY_THEME.primary
    : isAncient ? '#e11d48'
    : baseR.color
  const label = isShiny ? 'Golden' : isAncient ? 'Ancient' : baseR.label

  // Size ticks up from zero, which is the one animated number worth keeping:
  // it is the measurement, and watching it settle is the measurement happening.
  const hasSize = sizeIn > 0
  const [displaySize, setDisplaySize] = useState(0)
  useEffect(() => {
    if (!hasSize) return
    let raf = 0
    let start = 0
    const dur = 550
    const tick = (t: number) => {
      if (!start) start = t
      const k = Math.min(1, (t - start) / dur)
      setDisplaySize(sizeIn * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [sizeIn, hasSize])

  const tier = !isShiny && !isAncient && sizeTier && tierShowsPill(sizeTier) ? sizeTier : null
  const shinyMessage = useMemo(() => (isShiny ? pickShinyMessage(fish.name) : ''), [isShiny, fish.name])

  // ── THE LEDGER ── everything that is a number, in one row.
  const tally: { v: string; l: string; c: string }[] = []
  if (!isAncient) tally.push({ v: fish.sell_value.toLocaleString(), l: 'Sell ⟡', c: '#f0c040' })
  if (xpGained > 0) tally.push({ v: `+${xpGained}`, l: 'XP', c: '#86efac' })
  if (doubleCatch) tally.push({ v: '×2', l: 'Double', c: '#fbbf24' })
  else if (catchQty > 1 && (!jackpotMultiplier || jackpotMultiplier <= 1)) {
    tally.push({ v: `×${catchQty}`, l: 'Haul', c: '#f0c040' })
  }
  if (jackpotMultiplier && jackpotMultiplier > 1) tally.push({ v: `×${jackpotMultiplier}`, l: 'Jackpot', c: '#fb923c' })
  if (perfectXpMult > 1) tally.push({ v: `×${perfectXpMult}`, l: 'XP mult', c: '#bfe3ff' })
  // The streak's own XP is granted SEPARATELY from the catch's, so folding it
  // into the figure above would be quietly wrong about both.
  if (streakBonusXP > 0) tally.push({ v: `+${streakBonusXP}`, l: 'Streak', c: '#fbbf24' })
  if (gemEarned) tally.push({ v: '◆1', l: 'Challenge', c: '#63e2b7' })

  // ── THE NOTES ── the rare states, one flat line each. Never more than two
  // on a card in practice, and stacked rather than themed.
  const notes: { text: string; c: string }[] = []
  if (isNewSpecies) notes.push({ text: 'New species. Logged.', c: '#7dd3fc' })
  if (isAncient) notes.push({ text: `Ancient ${ancientCount} of ${ancientTotal} revealed.`, c: '#e11d48' })
  if (vigilRankUp) notes.push({ text: `Vigil ${vigilNumeral(vigilRankUp.to)}. Rank ${vigilRankUp.from} to ${vigilRankUp.to}.`, c: '#c4b5fd' })
  if (isShiny && shinyMessage) notes.push({ text: shinyMessage, c: SHINY_THEME.primary })
  if (baitSaved) notes.push({ text: 'The bait survived.', c: 'rgba(255,255,255,0.42)' })
  if (deepStirs) notes.push({ text: 'Something deeper stirs. It wants better bait.', c: 'rgba(196,181,253,0.75)' })

  return (
    <div style={{
      width: '100%', borderRadius: 16, overflow: 'hidden',
      // FLAT AND OPAQUE. One colour, one hairline in the catch's own accent.
      // This sits over painted, moving water and anything translucent reads as
      // a smear; anything gradient reads as another light source.
      background: '#080e15',
      border: `1px solid ${accent}66`,
    }}>
      {/* ── STACKED AND CENTRED ────────────────────────────────────────
          It was a row: the fish at a fixed 86px on the left and the words in a
          flex:1 column beside it, hard against the left edge. The card's own
          tally strip underneath has been centred all along, so the head was the
          one part of it reading as a list item — and a reveal is not a list
          item. The fish is the subject; it belongs in the middle with its name
          under it. */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        padding: '0.85rem 0.85rem 0.8rem', textAlign: 'center',
      }}>
        {/* ── THE ONE LIT THING ── */}
        <motion.div
          initial={{ scale: 0.62, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 17 }}
          style={{
            position: 'relative', width: 86, height: 86, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <span aria-hidden style={{
            position: 'absolute', inset: -6, borderRadius: '50%',
            background: `radial-gradient(circle, ${accent}3a 0%, transparent 68%)`,
          }} />
          <FishImg name={fish.name} style={{
            position: 'relative', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
            filter: isShiny ? SHINY_FISH_FILTER : `drop-shadow(0 3px 10px ${accent}55)`,
          }} />
        </motion.div>

        <div style={{ width: '100%', minWidth: 0 }}>
          <p className="font-cinzel font-800" style={{
            fontSize: '1.12rem', lineHeight: 1.12, color: '#f2ece0',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{fish.name}</p>

          <p className="font-karla font-700 uppercase" style={{
            fontSize: '0.56rem', letterSpacing: '0.16em', color: accent, marginTop: 3,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 6, flexWrap: 'wrap',
          }}>
            <span>{label}</span>
            {tier && (
              <>
                <span aria-hidden style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
                <span style={{ color: TIER_COLOR[tier], display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  {tier === 'trophy' && <TrophyMark size={9} color={TIER_COLOR[tier]} />}
                  {TIER_LABEL[tier]}
                </span>
              </>
            )}
          </p>

          {hasSize && !isShiny && (
            <p style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'center',
              gap: 7, marginTop: 5,
            }}>
              <span className="font-cinzel font-700 tabular-nums" style={{
                fontSize: '1.28rem', lineHeight: 1, color: '#f0ede8',
              }}>{formatFishLength(displaySize)}</span>
              {/* A PERSONAL BEST IS A NUMBER, not a ribbon over the fish. It
                  says what it beat, which the ribbon never did. */}
              {isPB && !isAncient && (
                <span className="font-karla font-700 uppercase" style={{
                  fontSize: '0.54rem', letterSpacing: '0.14em', color: '#5eead4',
                }}>
                  Best{previousBest != null ? ` · +${(sizeIn - previousBest).toFixed(1)} in` : ''}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {tally.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'stretch',
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}>
          {tally.map((t, i) => (
            <div key={t.l} style={{
              flex: 1, minWidth: 0, textAlign: 'center', padding: '0.45rem 0.2rem',
              borderLeft: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.07)',
            }}>
              <p className="font-cinzel font-800 tabular-nums" style={{
                fontSize: '0.95rem', lineHeight: 1.05, color: t.c,
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{t.v}</p>
              <p className="font-karla font-700 uppercase" style={{
                fontSize: '0.48rem', letterSpacing: '0.14em',
                color: 'rgba(255,255,255,0.32)', marginTop: 2,
              }}>{t.l}</p>
            </div>
          ))}
        </div>
      )}

      {notes.length > 0 && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.07)',
          padding: '0.5rem 0.85rem 0.55rem',
          display: 'flex', flexDirection: 'column', gap: 3,
        }}>
          {notes.map(n => (
            <p key={n.text} className="font-karla font-600" style={{
              fontSize: '0.7rem', lineHeight: 1.35, color: n.c,
            }}>{n.text}</p>
          ))}
        </div>
      )}
    </div>
  )
}
