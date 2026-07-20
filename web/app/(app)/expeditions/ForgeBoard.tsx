'use client'

// ── THE FORGE ────────────────────────────────────────────────────────────────
// The forge used to be seventeen tall cards stacked in a column. Two problems with
// that, and the scrolling was the smaller one.
//
// The real problem: the forge is a CONTESTED GRAPH. Seventeen recipes draw on only
// thirteen components, and eleven of those thirteen feed two or more recipes.
// Davy's Hand Cannon alone feeds four. Forging is destructive, so spending it on the
// Grand Cannon quietly kills your path to the Siege, the Sharpshooter and the
// Marauder until you refarm one. That trade is the only really interesting decision
// the forge offers, and a flat list of recipes never once mentioned it.
//
// So this is built around the component, not the recipe:
//
//   1. READY shelf   — what you can forge RIGHT NOW, pinned at the top. Most visits
//                      to the forge are asking exactly this one question.
//   2. YOUR PARTS    — the components you actually hold, each tagged with how many
//                      recipes it feeds. Tap one to filter the board to what it can
//                      become. (Terraria's Guide, and the answer to our graph.)
//   3. THE BOARD     — every recipe as a medallion, grouped by state, so the whole
//                      collection reads at a glance and forged pieces become a
//                      trophy shelf instead of entries buried down a list.
//   4. THE COST      — open a recipe and it tells you, plainly, what forging it
//                      spends and what that closes off.
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { vibrate } from '@/lib/haptics'
import { lockBodyScroll } from '@/lib/bodyScrollLock'
import {
  FORGE_RECIPES, getRaidItem, getForgeRecipe, cacheComponentsMissing,
  forgeComponentIds, recipesUsingComponent, forgeOpportunityCost,
  recipeNeedsGauntlet2, GAUNTLET2_BASE_ITEM_IDS,
} from '@/lib/raidItems'
import { PRISMATIC, forgedBorderSoft, forgedTextSoft, ABYSSAL, ABYSSAL_TEXT, abyssalBorder } from '@/lib/prismatic'

const GOLD = '#e8c879'
const BLUE = '#7fd0ff'
const GREEN = '#7fd49a'
const AMBER = '#caa05a'
const VIOLET = '#b9a8dc'

/** The board is split into these two tiers so the Abyssal (tier-3) fusions read
 *  as a clearly separate shelf below the standard forge. */
const TIER_SECTIONS = [
  { tier: 2 as const, label: 'The Forge',         sub: 'Tier II',  abyssal: false },
  { tier: 3 as const, label: 'The Abyssal Forge', sub: 'Tier III', abyssal: true },
]

/** The four states a recipe can be in, in the order the player cares about them. */
type State = 'ready' | 'gathering' | 'locked' | 'forged'

const STATE_META: Record<State, { label: string; accent: string; blurb: string }> = {
  ready:     { label: 'Ready to Forge', accent: GOLD,  blurb: 'Every part aboard. Say the word.' },
  gathering: { label: 'Gathering Parts', accent: GREEN, blurb: 'Learned. Still hunting components.' },
  locked:    { label: 'Not Yet Learned', accent: BLUE,  blurb: 'Spend Fathoms to learn the recipe.' },
  forged:    { label: 'Forged',          accent: '#c9a7ff', blurb: 'Done. Hanging on the wall.' },
}

function IconCrate({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8l9-5 9 5v8l-9 5-9-5z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" />
    </svg>
  )
}

/** An item's art, or the crate fallback. Never an emoji. */
function ItemArt({ id, size, dim = false }: { id: string; size: number; dim?: boolean }) {
  const def = getRaidItem(id)
  if (def?.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={def.image} alt="" loading="lazy" decoding="async"
      style={{ width: size, height: size, objectFit: 'contain', opacity: dim ? 0.4 : 1, filter: dim ? 'grayscale(1)' : 'none' }} />
  }
  return <span style={{ color: '#c4a96a', opacity: dim ? 0.4 : 1, display: 'flex' }}><IconCrate size={Math.round(size * 0.7)} /></span>
}

export default function ForgeBoard({
  ownedRaidItems, learnedRecipes, fathomsNow,
  forging, forgeArmed, learning, learnArmed,
  onForgeTap, onLearnTap, abyssalUnlocked = false,
}: {
  /** Owns Don's Abyssal Forge? Tier-3 recipes are hidden entirely until then. */
  abyssalUnlocked?: boolean
  ownedRaidItems: string[]
  learnedRecipes: string[]
  fathomsNow: number
  forging: string | null
  forgeArmed: string | null
  learning: string | null
  learnArmed: string | null
  onForgeTap: (resultId: string) => void
  onLearnTap: (resultId: string, cost: number) => void
}) {
  // Tapping a part you hold filters the board to what it can become.
  const [filterPart, setFilterPart] = useState<string | null>(null)
  // The open recipe. Everything a recipe has to say lives in here, so the board
  // itself stays a clean wall of medallions.
  const [open, setOpen] = useState<string | null>(null)

  const owned = useMemo(() => new Set(ownedRaidItems), [ownedRaidItems])
  const learned = useMemo(() => new Set(learnedRecipes), [learnedRecipes])

  function stateOf(resultId: string): State {
    if (owned.has(resultId)) return 'forged'
    const recipe = getForgeRecipe(resultId)!
    if (!learned.has(resultId)) return 'locked'
    return recipe.components.every(c => owned.has(c)) ? 'ready' : 'gathering'
  }

  // Has the player any path to Don's-Gauntlet components? (owns one, or has the
  // Abyssal Forge). Live/Don's-locked players don't — so recipes needing a Don's
  // item stay hidden and can't spoil unreleased content.
  const hasDonsAccess = abyssalUnlocked || ownedRaidItems.some(id => GAUNTLET2_BASE_ITEM_IDS.includes(id))
  const rows = useMemo(() => FORGE_RECIPES
    // Tier-3 Abyssal recipes stay invisible until Don's Abyssal Forge is owned,
    // so the board never shows recipes the player has no path to learn.
    .filter(r => r.tier !== 3 || abyssalUnlocked)
    // Recipes consuming a Don's-Gauntlet item stay hidden until Don's is reachable.
    .filter(r => !recipeNeedsGauntlet2(r.result) || hasDonsAccess)
    .map(r => ({
      recipe: r,
      state: stateOf(r.result),
      have: r.components.filter(c => owned.has(c)).length,
    })), [ownedRaidItems, learnedRecipes, abyssalUnlocked])   // eslint-disable-line react-hooks/exhaustive-deps

  const ready = rows.filter(r => r.state === 'ready')
  const forgedCount = rows.filter(r => r.state === 'forged').length

  // The parts you actually hold that the forge wants. Sorted by how contested they
  // are, because a part that feeds four recipes is the one worth thinking about.
  const parts = useMemo(() => forgeComponentIds()
    .filter(id => owned.has(id))
    .map(id => ({ id, feeds: recipesUsingComponent(id).filter(r => !owned.has(r.result)).length }))
    .filter(p => p.feeds > 0)
    .sort((a, b) => b.feeds - a.feeds), [ownedRaidItems])   // eslint-disable-line react-hooks/exhaustive-deps

  const visible = filterPart
    ? rows.filter(r => r.recipe.components.includes(filterPart))
    : rows

  // Within a tier, group by state so it reads as "what can I do / what's next /
  // what's done" rather than an arbitrary ordering.
  const stateGroups = (items: typeof rows): { state: State; items: typeof rows }[] =>
    (['ready', 'gathering', 'locked', 'forged'] as State[])
      .map(s => ({ state: s, items: items.filter(r => r.state === s) }))
      .filter(g => g.items.length > 0)

  return (
    <>
      {/* ── The pulse: how far along the whole collection is ─────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.72rem', color: '#b9b2a6' }}>
          Forged <span style={{ color: '#ffce8a' }}>{forgedCount}</span> / {rows.length}
        </span>
        <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.72rem', color: '#8fb6d6' }}>
          Fathoms <span style={{ color: BLUE }}>{fathomsNow}</span>
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: '1.1rem' }}>
        <motion.div initial={false} animate={{ width: `${Math.round((forgedCount / rows.length) * 100)}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 30 }}
          style={{ height: '100%', borderRadius: 999, background: PRISMATIC }} />
      </div>

      {/* ── Abyssal Forge status — plainly, do you have the tier-3 upgrade? ── */}
      {abyssalUnlocked ? (
        <div style={{ ...abyssalBorder('rgba(13,18,26,0.7)'), borderRadius: 12, padding: '0.6rem 0.8rem', marginBottom: '1.1rem', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flexShrink: 0, display: 'flex', color: '#7be0a3' }} aria-hidden>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-cinzel font-800" style={{ fontSize: '0.94rem', lineHeight: 1.1, ...ABYSSAL_TEXT }}>Abyssal Forge Unlocked</p>
            <p className="font-karla" style={{ fontSize: '0.74rem', color: '#a79fb8', lineHeight: 1.4, marginTop: 2 }}>Tier-3 fusion active — combine two forged items into one Abyssal mount.</p>
          </div>
        </div>
      ) : (
        <div style={{ background: 'rgba(157,123,255,0.06)', border: '1px solid rgba(157,123,255,0.22)', borderRadius: 12, padding: '0.6rem 0.8rem', marginBottom: '1.1rem', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flexShrink: 0, display: 'flex', color: VIOLET }} aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', lineHeight: 1.1, color: VIOLET }}>Abyssal Forge Locked</p>
            <p className="font-karla" style={{ fontSize: '0.74rem', color: '#8a8480', lineHeight: 1.4, marginTop: 2 }}>Claim the Abyssal Forge in Don’s Gauntlet Locker to unlock tier-3 fusion.</p>
          </div>
        </div>
      )}

      {/* ── 1. READY — the question most visits are actually asking ───────── */}
      {ready.length > 0 && (
        <div style={{ marginBottom: '1.2rem' }}>
          <p className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.72rem', color: GOLD, marginBottom: 9 }}>
            Ready to Forge
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ready.map(({ recipe }) => {
              const result = getRaidItem(recipe.result)!
              // Abyssal-ready rows wear the tier-3 accent so they never masquerade
              // as a standard gold forge.
              const abyssal = recipe.tier === 3
              const AC = abyssal ? '#9d7bff' : GOLD
              return (
                <motion.button key={recipe.result} type="button" onClick={() => { vibrate([0, 14]); setOpen(recipe.result) }}
                  whileTap={{ scale: 0.985 }}
                  className="tap"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                    padding: '0.75rem 0.8rem', borderRadius: 14, cursor: 'pointer',
                    background: abyssal ? 'linear-gradient(180deg, rgba(157,123,255,0.16), rgba(63,191,130,0.05))' : 'linear-gradient(180deg, rgba(232,200,121,0.16), rgba(232,200,121,0.05))',
                    border: `1px solid ${AC}88`, boxShadow: `0 0 22px ${AC}1f`,
                  }}>
                  <span style={{ position: 'relative', flexShrink: 0, width: 44, height: 44, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.28)', border: `1px solid ${AC}55` }}>
                    <ItemArt id={recipe.result} size={34} />
                    {/* A slow shimmer so a forgeable item feels alive and asks to be tapped. */}
                    <motion.span aria-hidden
                      animate={{ opacity: [0.15, 0.5, 0.15] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                      style={{ position: 'absolute', inset: -1, borderRadius: 11, border: `1px solid ${AC}`, pointerEvents: 'none' }} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="font-cinzel font-700 truncate" style={{ display: 'block', fontSize: '1.15rem', color: '#f7edd4' }}>{result.name}</span>
                    <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ display: 'block', fontSize: '0.64rem', color: AC, marginTop: 3 }}>
                      {abyssal ? 'Abyssal · every part aboard' : 'Every part aboard'}
                    </span>
                  </span>
                  <span className="font-cinzel font-700" style={{ flexShrink: 0, fontSize: '0.92rem', color: AC }}>Forge ›</span>
                </motion.button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 2. YOUR PARTS — tap one to see what it can become ─────────────── */}
      {parts.length > 0 && (
        <div style={{ marginBottom: '1.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
            <p className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.72rem', color: '#b9b2a6' }}>
              Your Parts
            </p>
            {filterPart && (
              <button type="button" onClick={() => { vibrate([0, 10]); setFilterPart(null) }}
                className="font-karla font-700 tap" style={{ background: 'none', border: 'none', color: BLUE, fontSize: '0.8rem', cursor: 'pointer' }}>
                Show all
              </button>
            )}
          </div>
          {/* A horizontal rail: parts are a shelf you browse, not a list you read. */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch' }}>
            {parts.map(p => {
              const def = getRaidItem(p.id)!
              const on = filterPart === p.id
              return (
                <button key={p.id} type="button"
                  onClick={() => { vibrate([0, 12]); setFilterPart(on ? null : p.id) }}
                  className="tap"
                  style={{
                    flexShrink: 0, width: 106, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    padding: '0.65rem 0.45rem 0.55rem', borderRadius: 12, cursor: 'pointer',
                    background: on ? 'rgba(127,208,255,0.14)' : 'rgba(255,255,255,0.035)',
                    border: `1px solid ${on ? `${BLUE}99` : 'rgba(255,255,255,0.1)'}`,
                    transition: 'background 0.16s, border-color 0.16s',
                  }}>
                  <ItemArt id={p.id} size={34} />
                  <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: on ? '#dcefff' : '#cfc9bf', lineHeight: 1.25, textAlign: 'center' }}>
                    {def.name}
                  </span>
                  {/* The number that makes the graph visible: how many roads lead out of this part. */}
                  <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.6rem', color: p.feeds > 1 ? AMBER : '#7a7470' }}>
                    {p.feeds > 1 ? `Feeds ${p.feeds}` : 'Feeds 1'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 3. THE BOARD — split by tier (Tier II vs the Abyssal Tier III),
             then grouped by state within each tier ────────────────────────── */}
      {TIER_SECTIONS.map(sec => {
        const tierItems = visible.filter(r => (r.recipe.tier === 3) === sec.abyssal)
        if (tierItems.length === 0) return null
        const tierForged = tierItems.filter(r => r.state === 'forged').length
        return (
          <div key={sec.tier} style={{ marginBottom: '1.3rem' }}>
            {/* Tier header — the divider that separates standard forge from Abyssal. */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 11, paddingBottom: 7, borderBottom: `1px solid ${sec.abyssal ? 'rgba(157,123,255,0.3)' : 'rgba(232,200,121,0.28)'}` }}>
              <span className="font-cinzel font-800" style={{ fontSize: '1.02rem', lineHeight: 1, ...(sec.abyssal ? ABYSSAL_TEXT : { color: GOLD }) }}>{sec.label}</span>
              <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.58rem', color: sec.abyssal ? VIOLET : '#a08a5e' }}>{sec.sub}</span>
              <span className="font-karla font-700" style={{ marginLeft: 'auto', fontSize: '0.68rem', color: '#6f6a63' }}>{tierForged}/{tierItems.length}</span>
            </div>
            {stateGroups(tierItems).map(g => (
              <div key={g.state} style={{ marginBottom: '1.1rem' }}>
                <p className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.72rem', color: STATE_META[g.state].accent, marginBottom: 9 }}>
                  {STATE_META[g.state].label} <span style={{ color: '#6f6a63' }}>{g.items.length}</span>
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {g.items.map(({ recipe, state, have }) => {
                    const result = getRaidItem(recipe.result)!
                    const accent = STATE_META[state].accent
                    const dim = state === 'locked'
                    const abyssal = recipe.tier === 3
                    return (
                      <motion.button key={recipe.result} type="button"
                        onClick={() => { vibrate([0, 12]); setOpen(recipe.result) }}
                        whileTap={{ scale: 0.95 }}
                        className="tap"
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                          padding: '0.65rem 0.35rem 0.55rem', borderRadius: 13, cursor: 'pointer', minWidth: 0,
                          ...(state === 'forged'
                            ? forgedBorderSoft('rgba(14,18,26,0.92)', abyssal)
                            : abyssal
                              ? { background: state === 'ready' ? 'rgba(157,123,255,0.12)' : 'rgba(157,123,255,0.05)', border: `1px solid ${state === 'ready' ? 'rgba(157,123,255,0.6)' : 'rgba(157,123,255,0.24)'}` }
                              : { background: state === 'ready' ? 'rgba(232,200,121,0.1)' : 'rgba(255,255,255,0.035)', border: `1px solid ${state === 'ready' ? `${GOLD}77` : 'rgba(255,255,255,0.1)'}` }),
                        }}>
                        <ItemArt id={recipe.result} size={44} dim={dim} />
                        <span className="font-cinzel font-700" style={{ fontSize: '0.76rem', lineHeight: 1.2, textAlign: 'center', minHeight: '1.8rem',
                          ...(state === 'forged' ? forgedTextSoft(abyssal) : { color: dim ? '#8a8480' : '#f0ede8' }) }}>
                          {result.name}
                        </span>
                        {/* One glance tells you where this one stands. */}
                        {state === 'forged' ? (
                          <span style={{ display: 'flex', color: abyssal ? '#7be0a3' : '#c9a7ff' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                          </span>
                        ) : state === 'locked' ? (
                          <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: BLUE }}>{recipe.fathomCost} Fathoms</span>
                        ) : (
                          <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: accent }}>
                            {state === 'ready' ? 'Ready' : `${have}/${recipe.components.length} parts`}
                          </span>
                        )}
                      </motion.button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      })}

      {/* ── 4. THE RECIPE SHEET — and what forging it costs you ───────────── */}
      <RecipeSheet
        resultId={open}
        onClose={() => setOpen(null)}
        ownedRaidItems={ownedRaidItems}
        state={open ? stateOf(open) : 'locked'}
        fathomsNow={fathomsNow}
        forging={forging} forgeArmed={forgeArmed}
        learning={learning} learnArmed={learnArmed}
        onForgeTap={onForgeTap} onLearnTap={onLearnTap}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function RecipeSheet({
  resultId, onClose, ownedRaidItems, state, fathomsNow,
  forging, forgeArmed, learning, learnArmed, onForgeTap, onLearnTap,
}: {
  resultId: string | null
  onClose: () => void
  ownedRaidItems: string[]
  state: State
  fathomsNow: number
  forging: string | null
  forgeArmed: string | null
  learning: string | null
  learnArmed: string | null
  onForgeTap: (resultId: string) => void
  onLearnTap: (resultId: string, cost: number) => void
}) {
  // The page behind a bottom sheet must not scroll. On iOS overflow:hidden is not
  // a lock on its own, so this uses the project's position-fixed lock.
  useEffect(() => {
    if (!resultId) return
    return lockBodyScroll()
  }, [resultId])

  if (typeof document === 'undefined') return null

  const recipe = resultId ? getForgeRecipe(resultId) : undefined
  const result = resultId ? getRaidItem(resultId) : undefined

  return createPortal(
    <AnimatePresence>
      {resultId && recipe && result && (() => {
        const owned = new Set(ownedRaidItems)
        const comps = recipe.components.map(id => ({ id, def: getRaidItem(id), owned: owned.has(id) }))
        const missing = new Map(cacheComponentsMissing(recipe.components, ownedRaidItems).map(m => [m.id, m]))
        // What this forge SPENDS, and what that closes off. The forge's real decision.
        const cost = forgeOpportunityCost(resultId, ownedRaidItems)
        const armed = forgeArmed === resultId
        const busy = forging === resultId
        const isLearning = learning === resultId
        const armedLearn = learnArmed === resultId
        const canAfford = fathomsNow >= recipe.fathomCost
        const accent = STATE_META[state].accent
        const abyssal = recipe.tier === 3

        return (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onClose}
              style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(4,7,12,0.72)', backdropFilter: 'blur(3px)' }} />
            <motion.div
              initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 26 }}
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              style={{
                position: 'fixed', zIndex: 1401, left: 0, right: 0, bottom: 0,
                maxHeight: '86dvh', overflowY: 'auto', overscrollBehavior: 'contain',
                borderTopLeftRadius: 20, borderTopRightRadius: 20,
                padding: '1.1rem 1rem calc(env(safe-area-inset-bottom, 0px) + 1.2rem)',
                background: 'linear-gradient(180deg, #141a24 0%, #0b0f16 100%)',
                borderTop: `1px solid ${accent}55`,
              }}>
              {/* grab handle */}
              <div aria-hidden style={{ width: 38, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.18)', margin: '0 auto 12px' }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ flexShrink: 0, width: 58, height: 58, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  ...(state === 'forged' ? forgedBorderSoft('rgba(16,20,28,0.95)', abyssal) : { background: 'rgba(255,255,255,0.05)', border: `1px solid ${accent}55` }) }}>
                  <ItemArt id={resultId} size={44} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-cinzel font-800" style={{ fontSize: '1.35rem', lineHeight: 1.12, ...(state === 'forged' ? forgedTextSoft(abyssal) : { color: '#f7efd8' }) }}>{result.name}</p>
                  <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.66rem', color: accent, marginTop: 4 }}>{STATE_META[state].label}</p>
                </div>
              </div>

              <p className="font-karla" style={{ fontSize: '0.92rem', color: '#c8c2b8', lineHeight: 1.5, marginTop: 12 }}>{result.description}</p>

              {/* The parts, and where to get the ones you lack. */}
              {state !== 'forged' && (
                <div style={{ marginTop: 14 }}>
                  <p className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.68rem', color: '#8a8480', marginBottom: 8 }}>Fused From</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {comps.map(c => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0.55rem 0.6rem', borderRadius: 11,
                        background: c.owned ? 'rgba(127,212,154,0.08)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${c.owned ? 'rgba(127,212,154,0.35)' : 'rgba(255,255,255,0.1)'}` }}>
                        <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)' }}>
                          <ItemArt id={c.id} size={24} dim={!c.owned} />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="font-karla font-700" style={{ fontSize: '0.88rem', color: c.owned ? '#e6e1d6' : '#9a948a' }}>{c.def?.name}</p>
                          {!c.owned && (
                            <p className="font-karla" style={{ fontSize: '0.74rem', lineHeight: 1.4, marginTop: 2, color: missing.has(c.id) ? AMBER : '#7a9ec4' }}>
                              {missing.has(c.id)
                                ? 'Not aboard. The Quartermaster’s Ghost still holds it.'
                                : c.def?.source ? `Find it: ${c.def.source}` : 'Not aboard.'}
                            </p>
                          )}
                        </div>
                        <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ flexShrink: 0, fontSize: '0.62rem', color: c.owned ? GREEN : '#7a7470' }}>
                          {c.owned ? 'Aboard' : 'Needed'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── WHAT IT COSTS YOU ──────────────────────────────────────
                  The whole reason this redesign exists. The forge is destructive
                  and the parts are shared, so forging this shuts other doors. Say
                  so BEFORE they tap, not after. Informational, never a block: once
                  a player knows the graph, being nagged about it is just friction.
                  The two-tap confirm already carries the weight. */}
              {state === 'ready' && cost.length > 0 && (
                <div style={{ marginTop: 13, padding: '0.7rem 0.75rem', borderRadius: 12, background: `${AMBER}12`, border: `1px solid ${AMBER}44` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <span style={{ display: 'flex', color: AMBER }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                    </span>
                    <p className="font-karla font-800 uppercase tracking-[0.12em]" style={{ fontSize: '0.68rem', color: AMBER }}>This Closes Doors</p>
                  </div>
                  {cost.map(c => (
                    <p key={c.component} className="font-karla" style={{ fontSize: '0.84rem', color: '#d8c39a', lineHeight: 1.5, marginTop: 3 }}>
                      Spends your <strong style={{ color: '#f0e2c2' }}>{getRaidItem(c.component)?.name}</strong>, which also feeds{' '}
                      {c.alsoFeeds.map((id, i) => (
                        <span key={id}>
                          {i > 0 && (i === c.alsoFeeds.length - 1 ? ' and ' : ', ')}
                          <strong style={{ color: '#f0e2c2' }}>{getRaidItem(id)?.name}</strong>
                        </span>
                      ))}
                      . You would have to farm another.
                    </p>
                  ))}
                </div>
              )}

              {/* ── The one action ────────────────────────────────────────── */}
              <div style={{ marginTop: 15 }}>
                {state === 'forged' ? (
                  <div className="font-cinzel font-700 uppercase tracking-[0.06em]" style={{ width: '100%', padding: '0.9rem', borderRadius: 12, textAlign: 'center', fontSize: '1rem', ...forgedBorderSoft('rgba(16,20,28,0.9)', abyssal), ...forgedTextSoft(abyssal) }}>
                    Forged
                  </div>
                ) : state === 'locked' ? (
                  <button type="button" onClick={() => onLearnTap(resultId, recipe.fathomCost)} disabled={!canAfford || isLearning}
                    className="font-cinzel font-700 uppercase tracking-[0.08em] tap"
                    style={{ width: '100%', padding: '0.95rem', borderRadius: 12, fontSize: '1rem',
                      background: !canAfford ? 'rgba(255,255,255,0.04)' : armedLearn ? 'linear-gradient(180deg, rgba(248,140,90,0.34), rgba(196,90,60,0.16))' : 'linear-gradient(180deg, rgba(127,208,255,0.26), rgba(90,150,196,0.12))',
                      border: `1px solid ${!canAfford ? 'rgba(255,255,255,0.16)' : armedLearn ? 'rgba(248,140,90,0.7)' : `${BLUE}8c`}`,
                      color: !canAfford ? '#8a8480' : armedLearn ? '#ffd0b0' : '#cfeaff',
                      cursor: (!canAfford || isLearning) ? 'default' : 'pointer' }}>
                    {isLearning ? 'Learning…'
                      : !canAfford ? `Need ${recipe.fathomCost} Fathoms, you have ${fathomsNow}`
                      : armedLearn ? 'Tap again to confirm'
                      : `Learn Recipe, ${recipe.fathomCost} Fathoms`}
                  </button>
                ) : state === 'ready' ? (
                  <button type="button" onClick={() => { onForgeTap(resultId); if (armed) onClose() }} disabled={busy}
                    className="font-cinzel font-700 uppercase tracking-[0.08em] tap"
                    style={{ width: '100%', padding: '0.95rem', borderRadius: 12, fontSize: '1rem',
                      background: armed ? 'linear-gradient(180deg, rgba(248,140,90,0.34), rgba(196,90,60,0.16))' : 'linear-gradient(180deg, rgba(232,200,121,0.3), rgba(196,169,106,0.14))',
                      border: `1px solid ${armed ? 'rgba(248,140,90,0.7)' : `${GOLD}99`}`,
                      color: armed ? '#ffd0b0' : '#f0d695', cursor: busy ? 'default' : 'pointer' }}>
                    {busy ? 'Forging…' : armed ? 'Tap again to spend the parts' : `Forge ${result.name}`}
                  </button>
                ) : (
                  <p className="font-karla" style={{ fontSize: '0.86rem', color: '#8a8480', lineHeight: 1.5, textAlign: 'center' }}>
                    Recipe learned. Bring every part aboard and the forge will take them.
                  </p>
                )}
              </div>

              <button type="button" onClick={onClose} className="font-karla font-700 tap"
                style={{ width: '100%', marginTop: 10, padding: '0.65rem', background: 'none', border: 'none', color: '#7a7470', fontSize: '0.88rem', cursor: 'pointer' }}>
                Close
              </button>
            </motion.div>
          </>
        )
      })()}
    </AnimatePresence>,
    document.body,
  )
}
