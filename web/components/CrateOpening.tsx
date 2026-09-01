'use client'

/**
 * THE CRATE MOMENT. One implementation, every crate in the game.
 *
 * This exists because there were three of them. The fishing reel-in crate had
 * a 220x64 strip that spun for 2200ms; the Tavern's weekly crate had its own
 * hand-copied 96x82 strip at 2300ms with its own filler pool and its own tile
 * renderer (its comment literally said "mirrors the in-water fishing crate
 * feel", which is the tell); and the Master daily challenge crate had no
 * moment at all, just a line of text naming what dropped. Same loot roller
 * underneath, three different feels on top, and the two animated ones drifted
 * a little further apart every time either was touched.
 *
 * So the whole moment lives here now: the closed crate, the spin, the landing
 * and the payoff. Hosts hand it a tier and the loot and get told when it is
 * done. It owns no grant logic on purpose. The reward has already been paid by
 * the server before this ever mounts, which is why it is safe to unmount
 * mid-spin (backgrounded tab, closed drawer) without the player losing
 * anything.
 *
 * Three rules hold the feel together:
 *
 *  1. TIER IS VISIBLE. Wooden and Diamond used to look identical apart from
 *     the crate sprite. Each tier now owns an accent that runs through the
 *     frame, the spin window and the landing, so pulling a Diamond reads as an
 *     event before the strip even stops.
 *  2. THE SPIN LANDS ON THE TRUTH. The reward is always the final tile, so the
 *     strip decelerates onto the real thing rather than ticking randomly and
 *     hard-swapping at the end. Inherited from the fishing version, which had
 *     it right.
 *  3. THE PAYOFF SCALES. Doubloons and bait resolve clean and quick because
 *     they are most of what a crate gives. A cosmetic or a pet gets rays, a
 *     NEW flag and a bigger read, because that is the drop worth stopping for.
 *
 * Perf: transform and opacity only. No animated box-shadow or filter loops
 * (SpinReel's blur is a one-shot transition, not a loop), and the idle bob on
 * the closed crate is a transform keyframe so it composites.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import SpinReel from './SpinReel'
import CrateFx from './CrateFx'
import { getBait } from '@/lib/bait'
import { hapticTap, vibrate } from '@/lib/haptics'

export type CrateTierId = 'wooden' | 'metal' | 'gold' | 'diamond' | 'ancient'

/** The loot shapes a crate can produce. Mirrors CrateLoot in lib/crateLoot. */
export type CrateLootView = (
  | { type: 'doubloons'; amount: number }
  | { type: 'bait';      baitType: string; baitName: string; quantity: number }
  | { type: 'skin';      skinId: string;   skinName: string }
  | { type: 'hat';       hatId?: string;   hatName: string;  hatImageUrl: string  }
  | { type: 'boat';      boatId?: string;  boatName: string; boatImageUrl: string }
  | { type: 'pet';       petId?: string;   petName: string;  petImageUrl: string; petAccent: string }
) & {
  /** A pet roll that hit one already aboard. The crate paid its normal outcome
   *  instead, so this is shown as a footnote on that reward rather than being a
   *  result of its own. */
  dupePet?: { petId: string; petName: string; petImageUrl: string; petAccent: string }
}

/** Tier identity. The accent is the whole point: it is what makes a Diamond
 *  crate feel unlike a Wooden one before a single tile has scrolled. */
export const CRATE_TIERS: Record<CrateTierId, {
  label: string; accent: string; rgb: string
  /** Filename stem in /public, minus the closed/open suffix. */
  art: string
}> = {
  wooden:  { label: 'Wooden Crate',  accent: '#c08a5a', rgb: '192,138,90',  art: 'crate'        },
  metal:   { label: 'Metal Crate',   accent: '#b8c4d0', rgb: '184,196,208', art: 'metalcrate'   },
  gold:    { label: 'Gold Crate',    accent: '#f0c040', rgb: '240,192,64',  art: 'goldcrate'    },
  diamond: { label: 'Diamond Crate', accent: '#7dd3fc', rgb: '125,211,252', art: 'diamondcrate' },
  // Pale carved stone with an eye on the lock. The accent is the warm bone of
  // the banding rather than the darker stone body, so it still reads as an
  // accent against the drawer's near-black rather than disappearing into it.
  ancient: { label: 'Ancient Chest', accent: '#d8cfbb', rgb: '216,207,187', art: 'ancientcrate' },
}

/** Art lives per-tier in CRATE_TIERS because the filenames are not uniform
 *  (wooden has no prefix) and a pending sprite can be swapped in one place. */
export function crateArt(tier: CrateTierId, open: boolean): string {
  return `/${CRATE_TIERS[tier].art}${open ? 'open' : 'closed'}.png`
}

/** Cosmetics and pets are the drops worth an escalated payoff. */
export function isRareLoot(loot: CrateLootView): boolean {
  return loot.type === 'skin' || loot.type === 'hat' || loot.type === 'boat' || loot.type === 'pet'
}

// One tile size for every crate in the game. 220 fits the narrowest host (the
// daily challenge drawer at ~328px on a small phone) with room to spare.
const TILE_W = 220
const TILE_H = 72
const LAND_MS = 760

/**
 * HOW LONG THE STRIP RUNS, per tier.
 *
 * The other half of the juice ladder (the particles are in CrateFx). A single
 * 1500ms spin for every crate meant a Wooden took exactly as long to resolve as
 * an Ancient, which is backwards twice over: the common one is the one you open
 * dozens of times and want out of the way, and the rare one is the only one
 * anybody wants drawn out.
 *
 * Wooden is now well under a second. Ancient is more than twice that, and the
 * charge field building around it the whole way is what makes the extra time
 * read as tension rather than as lag.
 */
const SPIN_MS: Record<CrateTierId, number> = {
  wooden: 850, metal: 1100, gold: 1400, diamond: 1750, ancient: 2200,
}

/** How hard each tier MOVES. Feeds the crate's shake, its landing pop and the
 *  haptic together, so a tier cannot end up looking heavy and feeling light. */
const SHAKE: Record<CrateTierId, number> = {
  wooden: 0.55, metal: 0.75, gold: 1, diamond: 1.25, ancient: 1.5,
}

/** What the strip flashes past on the way to the reward.
 *
 *  Doubloons and bait only. Teasing cosmetics as filler makes an ordinary
 *  landing feel like a near miss, and most landings are ordinary. When the
 *  real reward IS a cosmetic it is the final tile, so the spin still arrives
 *  on it. */
const FILLERS: CrateLootView[] = [
  { type: 'doubloons', amount: 75 },
  { type: 'doubloons', amount: 150 },
  { type: 'doubloons', amount: 250 },
  { type: 'doubloons', amount: 350 },
  { type: 'doubloons', amount: 500 },
  { type: 'bait', baitType: 'worm',            baitName: 'Worms',            quantity: 5 },
  { type: 'bait', baitType: 'minnow',          baitName: 'Minnow',           quantity: 5 },
  { type: 'bait', baitType: 'night_crawler',   baitName: 'Night Crawler',    quantity: 5 },
  { type: 'bait', baitType: 'chum',            baitName: 'Chum',             quantity: 5 },
  { type: 'bait', baitType: 'anglers_formula', baitName: "Angler's Formula", quantity: 5 },
]

function lootArt(loot: CrateLootView): string {
  switch (loot.type) {
    case 'doubloons': return '/smallpile.png'
    case 'bait':      return getBait(loot.baitType).imageUrl ?? '/worms.png'
    case 'hat':       return loot.hatImageUrl
    case 'boat':      return loot.boatImageUrl
    case 'pet':       return loot.petImageUrl
    default:          return ''
  }
}

function lootTint(loot: CrateLootView): string {
  switch (loot.type) {
    case 'doubloons': return '#fbbf24'
    case 'bait':      return '#86efac'
    case 'pet':       return loot.petAccent
    default:          return '#4ade80'
  }
}

function lootTitle(loot: CrateLootView): string {
  switch (loot.type) {
    case 'doubloons': return `${loot.amount.toLocaleString()} ⟡`
    case 'bait':      return `${loot.quantity}× ${loot.baitName}`
    case 'skin':      return loot.skinName
    case 'hat':       return loot.hatName
    case 'boat':      return loot.boatName
    case 'pet':       return loot.petName
  }
}

function lootSubtitle(loot: CrateLootView): string {
  switch (loot.type) {
    case 'doubloons': return 'Doubloons'
    case 'bait':      return 'Bait'
    case 'skin':      return 'Character colorway'
    case 'hat':       return 'Bandana'
    case 'boat':      return 'Boat'
    case 'pet':       return 'New pet'
  }
}

/** A skin has no standalone icon: the sprite is cropped out of a larger sheet. */
function SkinSwatch({ skinId, size, ring }: { skinId: string; size: number; ring: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.22, overflow: 'hidden',
      backgroundImage: `url(/fishing_${skinId}_rest.png)`,
      backgroundSize: '420% auto', backgroundPosition: '60% 68%',
      backgroundRepeat: 'no-repeat',
      border: `1px solid ${ring}`,
      flexShrink: 0,
    }} />
  )
}

/** One tile in the spin strip. */
function CrateTile({ loot }: { loot: CrateLootView }) {
  const tint = lootTint(loot)
  return (
    <div style={{
      width: TILE_W, height: TILE_H,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      padding: '0 14px',
    }}>
      {loot.type === 'skin'
        ? <SkinSwatch skinId={loot.skinId} size={36} ring="rgba(74,222,128,0.35)" />
        : <img src={lootArt(loot)} alt="" width={36} height={36}
            style={{ height: 36, width: 36, objectFit: 'contain', flexShrink: 0 }} />}
      <p className="font-cinzel font-700" style={{
        fontSize: '1rem', color: tint, lineHeight: 1,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {lootTitle(loot)}
      </p>
    </div>
  )
}

/** THE RARE MOMENT. Full screen, rotating rays, tap anywhere to dismiss.
 *
 *  This was the Tavern weekly crate's alone, and it was comfortably the best
 *  crate payoff in the game. Pulling a pet off a reeled crate got a slightly
 *  bigger inline card; pulling one off the Tavern crate stopped the world. Now
 *  every crate stops the world, because a cosmetic or a pet is a handful of
 *  drops a month and it should land like one.
 *
 *  Portaled to document.body: an ancestor with a transform makes position
 *  fixed anchor to that ancestor instead of the viewport, and both the fishing
 *  result card and the challenge drawer are inside animated wrappers. */
function RareReveal({ loot, onClose }: { loot: CrateLootView; onClose: () => void }) {
  const accent = lootTint(loot)
  const isPet = loot.type === 'pet'
  const eyebrow = isPet ? 'Pet unlocked' : 'Rare find'
  const sub =
    loot.type === 'pet'  ? 'Equip it from your Appearance loadout.'
    : loot.type === 'skin' ? 'New character color unlocked.'
    : loot.type === 'hat'  ? 'New bandana unlocked.'
    :                        'New boat unlocked.'

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      data-any-key
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(2,4,8,0.86)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
      }}
    >
      <motion.div aria-hidden
        initial={{ opacity: 0, scale: 0.6, rotate: 0 }}
        animate={{ opacity: 0.5, scale: 1, rotate: 360 }}
        transition={{ opacity: { duration: 0.5 }, scale: { duration: 0.6 }, rotate: { duration: 24, repeat: Infinity, ease: 'linear' } }}
        style={{
          position: 'absolute', width: 460, height: 460, borderRadius: '50%', pointerEvents: 'none',
          background: `conic-gradient(from 0deg, ${accent}00, ${accent}33, ${accent}00, ${accent}33, ${accent}00, ${accent}33, ${accent}00)`,
        }}
      />
      <motion.div
        initial={{ scale: 0.85, y: 12 }} animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        onClick={e => e.stopPropagation()}
        style={{ position: 'relative', width: '100%', maxWidth: 320, textAlign: 'center' }}
      >
        <p className="font-karla font-700 uppercase tracking-[0.22em]"
          style={{ fontSize: '0.6rem', color: accent, marginBottom: 14 }}>
          {eyebrow}
        </p>
        <motion.div
          initial={{ scale: 0.4, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 14, delay: 0.1 }}
          style={{ width: 150, height: 150, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {loot.type === 'skin'
            ? <SkinSwatch skinId={loot.skinId} size={120} ring={`${accent}66`} />
            : <img src={lootArt(loot)} alt="" width={150} height={150}
                style={{ width: 150, height: 150, objectFit: 'contain', filter: `drop-shadow(0 0 28px ${accent}88)` }} />}
        </motion.div>
        <p className="font-cinzel font-800" style={{
          fontSize: '1.55rem', color: accent, lineHeight: 1.1, textShadow: `0 0 24px ${accent}80`,
        }}>
          {lootTitle(loot)}
        </p>
        <p className="font-karla" style={{ fontSize: '0.74rem', color: '#a8a29a', marginTop: 8 }}>{sub}</p>
        <button onClick={onClose} className="font-cinzel font-700 uppercase tracking-[0.1em]"
          style={{
            marginTop: 20, padding: '0.7rem 2rem', borderRadius: 12,
            background: `${accent}22`, border: `1px solid ${accent}66`,
            color: accent, fontSize: '0.78rem', cursor: 'pointer', touchAction: 'manipulation',
          }}>
          Nice
        </button>
      </motion.div>
    </motion.div>
  )
}

export default function CrateOpening({
  tier,
  loot,
  headline = 'You hauled up a',
  autoOpenMs,
  hostOwnsOpenButton = false,
  openSignal = false,
  onOpened,
  onSettled,
  footer,
  framed = true,
}: {
  tier: CrateTierId
  /** The already-granted loot. The spin lands on this. */
  loot: CrateLootView
  /** Eyebrow above the tier name while the crate is still shut. */
  headline?: string
  /** Hide the built-in "Pry it open" button because the host already has an
   *  open control of its own. The fishing screen does: its crate button lives
   *  in the bottom action row, the same slot as Cast and Reel, so the action
   *  never moves between phases. Two open buttons on one screen would undo
   *  that. The crate art stays tappable either way. */
  hostOwnsOpenButton?: boolean
  /** Flip to true to open from the host's own control. */
  openSignal?: boolean
  /** Fired the moment the spin starts, so a host driving its own action row
   *  can swap that button out of its "open" state. */
  onOpened?: () => void
  /** Open itself after this delay instead of waiting for a tap. For the Auto
   *  Caster, which steps through the taps so the player only has to enjoy the
   *  spin. The player still sees the closed beat first. */
  autoOpenMs?: number
  /** Fired once the reward is fully revealed. */
  onSettled?: () => void
  /** Host-supplied action row (Claim, Close), shown only after the reveal. */
  footer?: React.ReactNode
  /**
   * Draw the card surface, or sit bare inside the host's own panel.
   *
   * True out on the water, where this IS the card and has to match the one
   * every fish lands on. False in the Tavern, where it is already inside the
   * Weekly Crate panel and a second frame would be a card in a card. The
   * particles run either way; only the background, border and padding are
   * conditional.
   */
  framed?: boolean
}) {
  const [phase, setPhase] = useState<'closed' | 'rolling' | 'revealed'>('closed')
  const [showRare, setShowRare] = useState(false)
  // Portals need the DOM. Without this guard the first client render disagrees
  // with the server's and React throws a hydration mismatch.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const t = CRATE_TIERS[tier]
  const rare = isRareLoot(loot)
  /** Bumped once, on the frame the strip settles. CrateFx watches it rather
   *  than the phase, so the burst fires exactly when the lid gives. */
  const [landKey, setLandKey] = useState(0)
  /** How hard this tier moves, 0.5 to 1.5. One number so the shake, the pop and
   *  the spin blur cannot drift apart per tier. */
  const shake = SHAKE[tier]

  // 17 fillers then the reward, so the strip decelerates onto the real thing.
  const [strip] = useState<CrateLootView[]>(() => {
    const f: CrateLootView[] = []
    for (let i = 0; i < 17; i++) f.push(FILLERS[Math.floor(Math.random() * FILLERS.length)])
    return [...f, loot]
  })

  function open() {
    if (phase !== 'closed') return
    hapticTap()
    setPhase('rolling')
    onOpened?.()
  }

  useEffect(() => {
    if (autoOpenMs == null || phase !== 'closed') return
    const t = setTimeout(open, autoOpenMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenMs, phase])

  useEffect(() => {
    if (openSignal) open()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal])

  return (
    // ── THE SAME SURFACE THE CATCH CARD USES ────────────────────────────
    //
    // This was `rgba(6,14,22,0.96)` with a white hairline, which is a DIFFERENT
    // card from the one every fish lands on, on the same screen, seconds apart.
    // Flat, opaque, one hairline in the crate's own accent: the fish card's
    // rule, and the reason it reads as part of the game rather than as a
    // drawer that happened to open.
    //
    // `position: relative` because the FX layer fills it. The particles are
    // behind the content and inside the rounded corners, so a burst lights the
    // panel rather than spraying over the sea.
    <div style={{
      position: 'relative', width: '100%', textAlign: 'center',
      ...(framed ? {
        borderRadius: 16,
        // The particles stay inside the corners rather than spraying over
        // whatever the card is sitting on, which out on the water is the sea.
        overflow: 'hidden',
        background: '#080e15',
        border: `1px solid ${t.accent}55`,
        padding: '0.9rem 0.85rem 0.85rem',
      } : { paddingTop: '0.5rem' }),
    }}>
      <CrateFx tier={tier} phase={phase} landKey={landKey} box={92} />

      {/* Everything above the particles. */}
      <div style={{ position: 'relative', zIndex: 1 }}>
      {/* The crate. One fixed slot across all three phases so the art never
          jumps when the content below it changes height. */}
      <div style={{ height: 92, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.6rem' }}>
        <motion.img
          src={crateArt(tier, phase === 'revealed')}
          alt=""
          width={92}
          height={92}
          onClick={phase === 'closed' ? open : undefined}
          // THE SHAKE IS ON THE LADDER TOO. A Wooden box rattles; an Ancient
          // chest fights the lid. Same keyframes scaled by one number, so the
          // tiers cannot drift into having different motions.
          animate={
            phase === 'rolling'  ? { rotate: [-5 * shake, 5 * shake, -4 * shake, 4 * shake, -3 * shake, 3 * shake, 0], scale: [1, 1 + 0.05 * shake, 1] }
            : phase === 'revealed' ? { scale: [0.85, 1 + 0.12 * shake, 1], rotate: 0 }
            // Idle bob while shut. Transform only, so it composites and costs
            // nothing per frame.
            : { y: [0, -4, 0], rotate: 0, scale: 1 }
          }
          transition={
            phase === 'rolling'  ? { duration: 0.34 - 0.06 * shake, repeat: Infinity, ease: 'easeInOut' }
            : phase === 'revealed' ? { duration: 0.42, ease: [0.34, 1.56, 0.64, 1] }
            : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
          }
          style={{
            height: 92, width: 92, objectFit: 'contain',
            cursor: phase === 'closed' ? 'pointer' : 'default',
            touchAction: 'manipulation',
          }}
        />
      </div>

      {/* Phase slot. minHeight rather than a fixed height: the common rewards
          are short and the rare ones are tall, and forcing one height either
          strands empty space under a doubloon drop or crops a pet. */}
      <div style={{ minHeight: 104, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <AnimatePresence mode="wait">
          {phase === 'closed' && (
            <motion.div key="closed"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}>
              <p className="font-karla font-700 uppercase" style={{
                fontSize: '0.58rem', letterSpacing: '0.18em',
                color: 'rgba(255,255,255,0.42)', marginBottom: 4,
              }}>
                {headline}
              </p>
              <p className="font-cinzel font-700" style={{
                fontSize: '1.1rem', color: t.accent, marginBottom: 10,
              }}>
                {t.label}
              </p>
              {!hostOwnsOpenButton && (
                <motion.button
                  type="button"
                  onClick={open}
                  whileTap={{ scale: 0.94 }}
                  transition={{ type: 'spring', stiffness: 620, damping: 26 }}
                  className="font-karla font-800 uppercase"
                  style={{
                    fontSize: '0.7rem', letterSpacing: '0.12em',
                    padding: '0.55rem 1.4rem', borderRadius: 10,
                    background: `rgba(${t.rgb},0.16)`,
                    border: `1px solid rgba(${t.rgb},0.6)`,
                    color: t.accent,
                    cursor: 'pointer', touchAction: 'manipulation',
                  }}
                >
                  Pry it open
                </motion.button>
              )}
            </motion.div>
          )}

          {phase === 'rolling' && (
            <motion.div key="rolling"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{
                width: TILE_W, height: TILE_H, overflow: 'hidden', borderRadius: 12,
                border: `1px solid rgba(${t.rgb},0.3)`,
                background: 'rgba(0,0,0,0.38)',
                // Side fades so tiles ease in and out of the window instead of
                // slamming against the border.
                maskImage: 'linear-gradient(to right, transparent 0%, #000 14%, #000 86%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 14%, #000 86%, transparent 100%)',
              }}
            >
              <SpinReel
                items={strip}
                landedIndex={strip.length - 1}
                renderItem={(item) => <CrateTile loot={item} />}
                tileMain={TILE_W}
                tileCross={TILE_H}
                spinMs={SPIN_MS[tier]}
                landMs={LAND_MS}
                onSettle={() => {
                  // The landing gets its own haptic, longer for a rare drop,
                  // and scaled by the tier so the phone agrees with the screen.
                  vibrate(Math.round((rare ? 30 : 12) * shake))
                  setLandKey(k => k + 1)
                  setPhase('revealed')
                  // A cosmetic or a pet takes over the screen. The inline card
                  // still resolves underneath, so dismissing the overlay leaves
                  // the player looking at what they got.
                  if (rare) setShowRare(true)
                  onSettled?.()
                }}
              />
            </motion.div>
          )}

          {phase === 'revealed' && (
            <motion.div key="revealed"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24 }}
              style={{ position: 'relative', width: '100%' }}>

              {rare && (
                <p className="font-karla font-800 uppercase" style={{
                  fontSize: '0.55rem', letterSpacing: '0.22em',
                  color: lootTint(loot), marginBottom: 6,
                }}>
                  {'Rare find'}
                </p>
              )}

              {/* THE CATCH CARD'S ANATOMY: the lit thing on the left at a
                  fixed size, the words beside it, left-aligned. It used to
                  centre the pair and swap the image between 48 and 58px, so a
                  rare drop shifted the whole row sideways as it resolved. */}
              <div style={{
                position: 'relative',
                display: 'flex', alignItems: 'center', gap: 12,
                textAlign: 'left',
              }}>
                {/* ── THE ONE LIT THING ── the reward, in the catch card's
                    86px slot, with the same soft accent pool behind it. */}
                <motion.div
                  initial={{ scale: 0.62, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 17, delay: 0.08 }}
                  style={{
                    position: 'relative', width: 66, height: 66, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <span aria-hidden style={{
                    position: 'absolute', inset: -6, borderRadius: '50%',
                    background: `radial-gradient(circle, ${lootTint(loot)}3a 0%, transparent 68%)`,
                  }} />
                  {loot.type === 'skin' ? (
                    <SkinSwatch skinId={loot.skinId} size={52} ring={`${lootTint(loot)}59`} />
                  ) : (
                    <img src={lootArt(loot)} alt="" width={66} height={66}
                      style={{
                        position: 'relative', maxWidth: '100%', maxHeight: '100%',
                        objectFit: 'contain',
                        filter: `drop-shadow(0 3px 10px ${lootTint(loot)}55)`,
                      }} />
                  )}
                </motion.div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-cinzel font-800" style={{
                    fontSize: '1.4rem',
                    color: lootTint(loot), lineHeight: 1.1,
                  }}>
                    {loot.type === 'doubloons' ? `+${lootTitle(loot)}` : lootTitle(loot)}
                  </p>
                  <p className="font-karla font-700 uppercase" style={{
                    fontSize: '0.56rem', letterSpacing: '0.16em',
                    color: 'rgba(255,255,255,0.42)', marginTop: 4,
                  }}>
                    {lootSubtitle(loot)}
                  </p>
                  {/* The pet the roll passed over. A footnote, not a result: the
                      chest still paid what it paid, and this only explains that
                      something rarer was in the water and you already had it. */}
                  {loot.dupePet && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={loot.dupePet.petImageUrl} alt="" width={16} height={16}
                        style={{ height: 16, width: 16, objectFit: 'contain', flexShrink: 0, opacity: 0.7 }} />
                      <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.38)' }}>
                        {loot.dupePet.petName} surfaced too. Already aboard.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {footer && <div style={{ marginTop: '0.9rem' }}>{footer}</div>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      </div>

      {mounted && createPortal(
        <AnimatePresence>
          {showRare && <RareReveal loot={loot} onClose={() => setShowRare(false)} />}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
