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
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { vibrate } from '@/lib/haptics'
import { lockBodyScroll } from '@/lib/bodyScrollLock'
import {
  FORGE_RECIPES, getRaidItem, getForgeRecipe, cacheComponentsMissing,
  forgeComponentIds, recipesUsingComponent, forgeOpportunityCost,
  recipeNeedsGauntlet2, GAUNTLET2_BASE_ITEM_IDS, isAbyssalForgedItem,
  planAbyssalBuild, isConvertibleEpic, legendaryForEpic, type ForgeRecipe,
} from '@/lib/raidItems'
import { PRISMATIC, forgedBorderSoft, forgedTextSoft, ABYSSAL_EMBER, ABYSSAL_EMBER_TEXT, abyssalEmberBorder } from '@/lib/prismatic'
import { ABYSSAL_ACCEL_MS, ABYSSAL_ACCEL_GEM_COST, isConversionReady, type AbyssalConversion } from '@/lib/abyssalAccelerator'

const GEM_PURPLE = '#c9a7ff'

const GOLD = '#e8c879'
const BLUE = '#7fd0ff'
const GREEN = '#7fd49a'
const AMBER = '#caa05a'
const EMBER = '#ff7a5c'

/** The two forge benches, surfaced as tabs. Abyssal (tier 3) is the endgame
 *  bench — a locked teaser until you own the Abyssal Forge. */
const TABS = [
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

/** An item's art, or the crate fallback. Never an emoji. Tier-3 Abyssal items
 *  carry the same molten red glow they wear on the profile arsenal. */
function ItemArt({ id, size, dim = false }: { id: string; size: number; dim?: boolean }) {
  const def = getRaidItem(id)
  const abyssalGlow = !dim && isAbyssalForgedItem(id)
  if (def?.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={def.image} alt="" loading="lazy" decoding="async"
      className={abyssalGlow ? 'rod-glow-abyssal' : undefined}
      style={{ width: size, height: size, objectFit: 'contain', opacity: dim ? 0.4 : 1, ...(abyssalGlow ? {} : { filter: dim ? 'grayscale(1)' : 'none' }) }} />
  }
  return <span style={{ color: '#c4a96a', opacity: dim ? 0.4 : 1, display: 'flex' }}><IconCrate size={Math.round(size * 0.7)} /></span>
}

export default function ForgeBoard({
  ownedRaidItems, learnedRecipes, fathomsNow,
  forging, forgeArmed, learning, learnArmed,
  onForgeTap, onLearnTap, abyssalUnlocked = false, raidItemSlots = 4,
  acceleratorUnlocked = false, conversion = null, gemsNow = 0,
  convertBusy = false, claimBusy = false, onStartConvert, onClaimConvert,
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
  /** How many raid items the captain can equip at once — the planner's mount
   *  check. Purely informational: you can BUILD every Abyssal regardless. */
  raidItemSlots?: number
  /** The Abyssal Accelerator (epic→legendary transmutation bench) unlock + slot. */
  acceleratorUnlocked?: boolean
  conversion?: AbyssalConversion | null
  gemsNow?: number
  convertBusy?: boolean
  claimBusy?: boolean
  onStartConvert?: (epicId: string) => void
  onClaimConvert?: () => void
}) {
  // Which forge you're looking at. The Abyssal (tier-3) tab only becomes a real
  // destination once you own the Abyssal Forge; before that it's a locked teaser.
  const [tab, setTab] = useState<2 | 3>(2)
  // Tapping a part you hold filters the board to what it can become.
  const [filterPart, setFilterPart] = useState<string | null>(null)
  // Abyssal tab only: "Plan a Build" mode. Pick target Abyssals and see the
  // whole recursive farm (base drops by source, forges, Fathoms, mount check)
  // instead of the recipe-by-recipe bench.
  const [planning, setPlanning] = useState(false)
  const [planTargets, setPlanTargets] = useState<Set<string>>(new Set())
  // Remember the last plan between visits — a build plan is a long-horizon farm,
  // so losing it on every page load is friction. localStorage (not a DB column)
  // because it's a private, device-local convenience, not shared game state.
  const PLAN_KEY = 'abyssalPlanTargets'
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLAN_KEY)
      if (raw) { const ids = JSON.parse(raw); if (Array.isArray(ids)) setPlanTargets(new Set(ids.filter((x): x is string => typeof x === 'string'))) }
    } catch { /* private mode / disabled storage — just start empty */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(PLAN_KEY, JSON.stringify([...planTargets])) } catch { /* ignore */ }
  }, [planTargets])
  // The open recipe. Everything a recipe has to say lives in here, so the board
  // itself stays a clean wall of medallions.
  const [open, setOpen] = useState<string | null>(null)
  const abyssalTab = tab === 3

  // A part selected on one tab means nothing on the other — clear it on switch.
  // Plan mode is Abyssal-only, so drop it when you leave that bench.
  useEffect(() => { setFilterPart(null); if (tab !== 3) setPlanning(false) }, [tab])

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

  // Progress reads for the WHOLE collection (both tiers), so the top bar always
  // shows how far the entire forge is, regardless of which tab is open.
  const forgedCount = rows.filter(r => r.state === 'forged').length

  // Everything below scopes to the ACTIVE tab's tier — the two forges are
  // genuinely separate benches (Abyssal fuses forged tier-2 items).
  const tierRows = rows.filter(r => (r.recipe.tier === 3) === abyssalTab)
  const ready = tierRows.filter(r => r.state === 'ready')

  // The parts you hold that THIS tier's unforged recipes want, sorted by how
  // contested they are — a part feeding four recipes is the one to think about.
  const parts = useMemo(() => forgeComponentIds()
    .filter(id => owned.has(id))
    .map(id => ({ id, feeds: recipesUsingComponent(id).filter(r => !owned.has(r.result) && (r.tier === 3) === abyssalTab).length }))
    .filter(p => p.feeds > 0)
    .sort((a, b) => b.feeds - a.feeds), [ownedRaidItems, abyssalTab])   // eslint-disable-line react-hooks/exhaustive-deps

  const visible = filterPart
    ? tierRows.filter(r => r.recipe.components.includes(filterPart))
    : tierRows

  // Within the tier, group by state so it reads as "what can I do / what's next /
  // what's done" rather than an arbitrary ordering.
  const stateGroups = (items: typeof rows): { state: State; items: typeof rows }[] =>
    (['ready', 'gathering', 'locked', 'forged'] as State[])
      .map(s => ({ state: s, items: items.filter(r => r.state === s) }))
      .filter(g => g.items.length > 0)
  const groups = stateGroups(visible)

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
          style={{ height: '100%', borderRadius: 999, background: abyssalUnlocked ? ABYSSAL_EMBER : PRISMATIC }} />
      </div>

      {/* ── The two benches, as tabs. Tier II (gold) and the Abyssal Tier III
             (molten ember). The Abyssal tab is a dimmed, locked teaser until you
             own the Abyssal Forge — so a player always knows the endgame bench
             exists, and knows at a glance whether it's theirs yet. ──────────── */}
      <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 15, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '1.15rem' }}>
        {TABS.map(t => {
          const active = tab === t.tier
          const locked = t.abyssal && !abyssalUnlocked
          return (
            <motion.button key={t.tier} type="button"
              onClick={() => { if (locked || active) return; vibrate([0, 16]); setTab(t.tier) }}
              whileTap={locked || active ? undefined : { scale: 0.96 }}
              className="tap"
              aria-pressed={active}
              style={{ position: 'relative', flex: 1, padding: '0.62rem 0.4rem', borderRadius: 12, border: 'none', background: 'transparent', cursor: locked ? 'not-allowed' : active ? 'default' : 'pointer', opacity: locked ? 0.55 : 1 }}>
              {active && (
                <motion.span layoutId="forgeTabHighlight" transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  aria-hidden
                  style={{ position: 'absolute', inset: 0, borderRadius: 12,
                    ...(t.abyssal
                      ? abyssalEmberBorder('rgba(28,8,12,0.92)')
                      : { background: 'linear-gradient(180deg, rgba(232,200,121,0.22), rgba(232,200,121,0.06))', border: `1px solid ${GOLD}88`, boxShadow: `0 0 16px ${GOLD}1c` }) }} />
              )}
              <span style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <span className="font-cinzel font-800" style={{ fontSize: '0.86rem', lineHeight: 1,
                  ...(active ? (t.abyssal ? ABYSSAL_EMBER_TEXT : { color: '#f4dd9d' }) : { color: '#8a8480' }) }}>
                  {t.label}
                </span>
                <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.5rem', color: active ? (t.abyssal ? EMBER : '#a08a5e') : '#6f6a63' }}>
                  {locked && (
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  )}
                  {locked ? 'Locked' : t.sub}
                </span>
              </span>
            </motion.button>
          )
        })}
      </div>

      {/* ── Abyssal-only: the "Plan a Build" toggle. The bench answers "what
             can I forge now?"; the planner answers "what does building THESE
             Abyssals actually take?" ─────────────────────────────────────── */}
      {abyssalTab && (
        <button type="button"
          onClick={() => { vibrate([0, 14]); setPlanning(p => !p) }}
          className="tap"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', marginBottom: '1.15rem', padding: '0.7rem', borderRadius: 12, cursor: 'pointer',
            background: planning ? 'rgba(255,255,255,0.04)' : 'linear-gradient(180deg, rgba(255,90,60,0.16), rgba(120,20,40,0.05))',
            border: `1px solid ${planning ? 'rgba(255,255,255,0.16)' : `${EMBER}77`}`,
            color: planning ? '#c8c2b8' : '#ffcdb8',
          }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {planning
              ? <path d="M19 12H5M12 19l-7-7 7-7" />
              : <><path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4" /><path d="M12 8v8M8 12h8" /></>}
          </svg>
          <span className="font-cinzel font-700" style={{ fontSize: '0.92rem' }}>
            {planning ? 'Back to the bench' : 'Plan a Build'}
          </span>
        </button>
      )}

      {abyssalTab && planning ? (
        <AbyssalPlanner
          recipes={tierRows.map(r => r.recipe)}
          ownedRaidItems={ownedRaidItems}
          learnedRecipes={learnedRecipes}
          fathomsNow={fathomsNow}
          raidItemSlots={raidItemSlots}
          targets={planTargets}
          onToggleTarget={id => { vibrate([0, 12]); setPlanTargets(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }}
          onClear={() => { vibrate([0, 10]); setPlanTargets(new Set()) }}
          onOpenRecipe={id => setOpen(id)}
        />
      ) : (<>
      {/* ── The Abyssal Accelerator — epic→legendary transmutation bench ──── */}
      {abyssalTab && (
        <AbyssalAcceleratorPanel
          unlocked={acceleratorUnlocked}
          ownedRaidItems={ownedRaidItems}
          conversion={conversion}
          gemsNow={gemsNow}
          convertBusy={convertBusy}
          claimBusy={claimBusy}
          onStartConvert={onStartConvert}
          onClaimConvert={onClaimConvert}
        />
      )}
      {/* ── 1. READY — the question most visits are actually asking ───────── */}
      {ready.length > 0 && (
        <div style={{ marginBottom: '1.2rem' }}>
          <p className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.72rem', color: abyssalTab ? EMBER : GOLD, marginBottom: 9 }}>
            Ready to Forge
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ready.map(({ recipe }) => {
              const result = getRaidItem(recipe.result)!
              // Abyssal-ready rows wear the molten tier-3 accent so they never
              // masquerade as a standard gold forge.
              const abyssal = recipe.tier === 3
              const AC = abyssal ? '#ff6a4d' : GOLD
              return (
                <motion.button key={recipe.result} type="button" onClick={() => { vibrate([0, 14]); setOpen(recipe.result) }}
                  whileTap={{ scale: 0.985 }}
                  className="tap"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                    padding: '0.75rem 0.8rem', borderRadius: 14, cursor: 'pointer',
                    background: abyssal ? 'linear-gradient(180deg, rgba(255,90,60,0.16), rgba(120,20,40,0.05))' : 'linear-gradient(180deg, rgba(232,200,121,0.16), rgba(232,200,121,0.05))',
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

      {/* ── 3. THE BOARD — the active bench's recipes, grouped by state ─────── */}
      {groups.length === 0 ? (
        <p className="font-karla" style={{ fontSize: '0.82rem', color: '#8a8480', lineHeight: 1.5, textAlign: 'center', padding: '1.4rem 0.5rem' }}>
          {abyssalTab
            ? 'No Abyssal recipes match. Forge tier-2 relics first — the Abyssal bench fuses two forged pieces into one.'
            : 'Nothing here yet.'}
        </p>
      ) : groups.map(g => (
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
                        ? { background: state === 'ready' ? 'rgba(255,90,60,0.12)' : 'rgba(255,90,60,0.045)', border: `1px solid ${state === 'ready' ? 'rgba(255,106,77,0.6)' : 'rgba(255,106,77,0.22)'}` }
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
      </>)}

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
// ── THE ABYSSAL ACCELERATOR ──────────────────────────────────────────────────
// Epic→legendary transmutation bench (a Don's Ship & Shore unlock). Lives on the
// Abyssal tab. Three states: idle picker, charging (24h countdown), ready-to-claim.
const GEM_GLYPH = '◆'

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'ready'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

/** The accelerator's molten core — an ember orb with a turning ring + orbiting
 *  motes, optionally with an item suspended inside. `intensity` scales the life. */
function AccelCore({ size, intensity, art }: { size: number; intensity: 'idle' | 'active' | 'ready'; art?: string | null }) {
  const active = intensity !== 'idle'
  const motes = active ? 8 : 0
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <motion.div
        animate={active ? { scale: [1, 1.12, 1], opacity: [0.8, 1, 0.8] } : { scale: [1, 1.05, 1], opacity: [0.5, 0.68, 0.5] }}
        transition={{ duration: intensity === 'ready' ? 1.1 : active ? 1.6 : 2.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle, #ffffff 0%, ${EMBER}cc 26%, ${EMBER}44 52%, transparent 74%)`, boxShadow: `0 0 ${active ? 26 : 12}px ${EMBER}${active ? 'aa' : '55'}` }}
      />
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: intensity === 'ready' ? 6 : 15, repeat: Infinity, ease: 'linear' }}
        style={{ position: 'absolute', inset: size * 0.09, borderRadius: '50%', border: `1.5px dashed ${EMBER}88`, opacity: active ? 0.7 : 0.38 }}
      />
      {Array.from({ length: motes }).map((_, i) => (
        <motion.div key={i}
          initial={{ rotate: (i / motes) * 360 }}
          animate={{ rotate: (i / motes) * 360 + 360 }}
          transition={{ duration: 3 + (i % 3), repeat: Infinity, ease: 'linear' }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <div style={{ position: 'absolute', left: '50%', top: '3%', width: 4, height: 4, marginLeft: -2, borderRadius: '50%', background: EMBER, boxShadow: `0 0 6px ${EMBER}` }} />
        </motion.div>
      ))}
      {art && (
        <motion.img src={art} alt="" aria-hidden decoding="async"
          animate={active ? { y: [0, -3, 0], scale: intensity === 'ready' ? [1, 1.06, 1] : [1, 1.02, 1] } : {}}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', inset: '22%', width: '56%', height: '56%', objectFit: 'contain', filter: `drop-shadow(0 0 8px ${EMBER}bb)`, zIndex: 1 }}
        />
      )}
    </div>
  )
}

function AbyssalAcceleratorPanel({ unlocked, ownedRaidItems, conversion, gemsNow, convertBusy, claimBusy, onStartConvert, onClaimConvert }: {
  unlocked: boolean
  ownedRaidItems: string[]
  conversion: AbyssalConversion | null
  gemsNow: number
  convertBusy: boolean
  claimBusy: boolean
  onStartConvert?: (epicId: string) => void
  onClaimConvert?: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [picked, setPicked] = useState<string | null>(null)
  const convertibleEpics = useMemo(() => ownedRaidItems.filter(isConvertibleEpic), [ownedRaidItems])
  const ready = conversion ? isConversionReady(conversion, now) : false

  // Tick the countdown once a second while a conversion is charging.
  useEffect(() => {
    if (!conversion || ready) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [conversion, ready])
  // Drop a picked epic that's no longer owned (e.g. after a refresh).
  useEffect(() => { if (picked && !convertibleEpics.includes(picked)) setPicked(null) }, [convertibleEpics, picked])

  const shell = (children: ReactNode) => (
    <div style={{ marginBottom: '1.3rem', borderRadius: 16, padding: '0.95rem', position: 'relative', overflow: 'hidden', ...abyssalEmberBorder('rgba(14,7,9,0.94)') }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 120% 80% at 50% -10%, ${EMBER}18, transparent 60%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  )

  const Header = (
    <div style={{ textAlign: 'center', marginBottom: 12 }}>
      <p className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.28em', color: `${EMBER}cc` }}>Tier III · Transmutation</p>
      <p className="font-cinzel font-800" style={{ fontSize: '1.15rem', lineHeight: 1.1, marginTop: 3, ...ABYSSAL_EMBER_TEXT }}>The Abyssal Accelerator</p>
    </div>
  )

  // Locked teaser.
  if (!unlocked) {
    return shell(
      <>
        {Header}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, opacity: 0.74 }}>
          <AccelCore size={42} intensity="idle" />
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#cbb6a2', lineHeight: 1.45 }}>
            Transmute an epic boss drop into its legendary chase version. Unlock <span style={{ color: '#ffcdb8', fontWeight: 700 }}>The Abyssal Accelerator</span> in Don’s Gauntlet (Ship &amp; Shore).
          </p>
        </div>
      </>
    )
  }

  // A conversion is in flight — charging or ready.
  if (conversion) {
    const epic = getRaidItem(conversion.epicId)
    const legendary = getRaidItem(conversion.legendaryId)
    const remain = new Date(conversion.completesAt).getTime() - now
    const progress = Math.max(0, Math.min(1, 1 - remain / ABYSSAL_ACCEL_MS))
    return shell(
      <>
        {Header}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ opacity: 0.4 }}><ItemArt id={conversion.epicId} size={38} dim /></div>
            <AccelCore size={92} intensity={ready ? 'ready' : 'active'} art={legendary?.image ?? null} />
            <div style={{ opacity: ready ? 1 : 0.5 }}><ItemArt id={conversion.legendaryId} size={38} /></div>
          </div>
          {ready ? (
            <>
              <p className="font-cinzel font-800" style={{ fontSize: '0.95rem', color: '#ffe0b0', textShadow: `0 0 14px ${EMBER}66` }}>Transmutation complete</p>
              <motion.button type="button" disabled={claimBusy} onClick={() => { vibrate([0, 20, 40, 60]); onClaimConvert?.() }} className="tap"
                animate={{ boxShadow: [`0 0 0px ${EMBER}00`, `0 0 22px ${EMBER}66`, `0 0 0px ${EMBER}00`] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: '100%', padding: '0.8rem', borderRadius: 12, cursor: claimBusy ? 'default' : 'pointer', background: `linear-gradient(180deg, ${EMBER}33, ${EMBER}14)`, border: `1px solid ${EMBER}99`, color: '#ffe6d2' }}>
                <span className="font-cinzel font-800" style={{ fontSize: '0.95rem' }}>{claimBusy ? 'Claiming…' : `Claim ${legendary?.name ?? 'the legendary'}`}</span>
              </motion.button>
            </>
          ) : (
            <>
              <div style={{ width: '100%', height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ width: `${progress * 100}%`, height: '100%', background: `linear-gradient(90deg, ${EMBER}, #ffd0a0)`, boxShadow: `0 0 8px ${EMBER}`, transition: 'width 1s linear' }} />
              </div>
              <p className="font-karla font-700" style={{ fontSize: '0.76rem', color: '#e8c9b4', textAlign: 'center' }}>
                Transmuting {epic?.name ?? 'the item'} → <span style={{ color: '#ffe0b0' }}>{legendary?.name ?? 'legendary'}</span>
              </p>
              <p className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.62rem', color: `${EMBER}dd` }}>Ready in {fmtCountdown(remain)}</p>
            </>
          )}
        </div>
      </>
    )
  }

  // Idle — pick an epic to charge.
  const canAfford = gemsNow >= ABYSSAL_ACCEL_GEM_COST
  const pickedLegendaryId = picked ? legendaryForEpic(picked) : null
  return shell(
    <>
      {Header}
      <p className="font-karla" style={{ fontSize: '0.68rem', color: '#b7a596', textAlign: 'center', lineHeight: 1.45, marginBottom: 12 }}>
        Charge it with gems and feed it an epic boss drop. In 24 hours, claim that item’s legendary chase version.
      </p>
      {convertibleEpics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}><AccelCore size={54} intensity="idle" /></div>
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#a99a8c', marginTop: 8 }}>No epic boss drops to transmute. Land one from a raid, then bring it here.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
            {convertibleEpics.map(id => {
              const sel = picked === id
              const item = getRaidItem(id)
              return (
                <button key={id} type="button" onClick={() => { vibrate([0, 10]); setPicked(sel ? null : id) }} className="tap"
                  style={{ flexShrink: 0, width: 66, padding: '0.5rem 0.3rem', borderRadius: 12, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    background: sel ? `${EMBER}1e` : 'rgba(255,255,255,0.04)', border: `1px solid ${sel ? `${EMBER}88` : 'rgba(255,255,255,0.1)'}`, boxShadow: sel ? `0 0 14px ${EMBER}33` : 'none' }}>
                  <ItemArt id={id} size={34} />
                  <span className="font-karla font-600" style={{ fontSize: '0.5rem', color: sel ? '#ffcdb8' : '#b0a698', textAlign: 'center', lineHeight: 1.1, height: '1.7em', overflow: 'hidden' }}>{item?.name}</span>
                </button>
              )
            })}
          </div>
          {picked && pickedLegendaryId ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 11 }}>
                <ItemArt id={picked} size={44} />
                <AccelCore size={58} intensity="idle" />
                <div style={{ opacity: 0.9 }}><ItemArt id={pickedLegendaryId} size={44} /></div>
              </div>
              <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#e8c9b4', textAlign: 'center', marginBottom: 10 }}>
                {getRaidItem(picked)?.name} → <span style={{ color: '#ffe0b0' }}>{getRaidItem(pickedLegendaryId)?.name}</span>
              </p>
              <button type="button" disabled={!canAfford || convertBusy} onClick={() => { vibrate([0, 16, 40, 24]); onStartConvert?.(picked) }} className="tap"
                style={{ width: '100%', padding: '0.78rem', borderRadius: 12, cursor: canAfford && !convertBusy ? 'pointer' : 'default',
                  background: canAfford ? `linear-gradient(180deg, ${EMBER}2e, ${EMBER}12)` : 'rgba(255,255,255,0.05)', border: `1px solid ${canAfford ? `${EMBER}88` : 'rgba(255,255,255,0.12)'}`, color: canAfford ? '#ffe0cc' : '#8a8078' }}>
                <span className="font-cinzel font-800" style={{ fontSize: '0.92rem' }}>
                  {convertBusy ? 'Charging…' : canAfford
                    ? <>Charge · <span style={{ color: GEM_PURPLE }}>{ABYSSAL_ACCEL_GEM_COST} {GEM_GLYPH}</span></>
                    : <>Need {ABYSSAL_ACCEL_GEM_COST} <span style={{ color: GEM_PURPLE }}>{GEM_GLYPH}</span></>}
                </span>
              </button>
              <p className="font-karla" style={{ fontSize: '0.56rem', color: '#8f8378', textAlign: 'center', marginTop: 7 }}>Consumes the epic · takes 24 hours · one at a time</p>
            </>
          ) : (
            <p className="font-karla" style={{ fontSize: '0.64rem', color: '#8f8378', textAlign: 'center' }}>Tap an epic above to transmute it.</p>
          )}
        </>
      )}
    </>
  )
}

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
        // Once you're looking at an Abyssal (tier-3) recipe, the whole sheet wears
        // the molten ember theme — border, icon ring, state label and the primary
        // action all shift off the standard gold/blue chrome.
        const themeAccent = abyssal ? EMBER : accent

        return (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onClose}
              style={{ position: 'fixed', inset: 0, zIndex: 1400, background: abyssal ? 'rgba(10,3,6,0.76)' : 'rgba(4,7,12,0.72)', backdropFilter: 'blur(3px)' }} />
            <motion.div
              initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 26 }}
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              style={{
                position: 'fixed', zIndex: 1401, left: 0, right: 0, bottom: 0,
                maxHeight: '86dvh', overflowY: 'auto', overscrollBehavior: 'contain',
                borderTopLeftRadius: 20, borderTopRightRadius: 20,
                padding: '1.1rem 1rem calc(env(safe-area-inset-bottom, 0px) + 1.2rem)',
                background: abyssal ? 'linear-gradient(180deg, #1d0b11 0%, #08050a 100%)' : 'linear-gradient(180deg, #141a24 0%, #0b0f16 100%)',
                borderTop: `1px solid ${abyssal ? `${EMBER}77` : `${accent}55`}`,
                boxShadow: abyssal ? '0 -10px 34px -10px rgba(255,90,60,0.3)' : 'none',
              }}>
              {/* grab handle */}
              <div aria-hidden style={{ width: 38, height: 4, borderRadius: 999, background: abyssal ? 'rgba(255,120,90,0.45)' : 'rgba(255,255,255,0.18)', margin: '0 auto 12px' }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ flexShrink: 0, width: 58, height: 58, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  ...(state === 'forged' ? forgedBorderSoft('rgba(16,20,28,0.95)', abyssal) : { background: abyssal ? 'rgba(255,90,60,0.08)' : 'rgba(255,255,255,0.05)', border: `1px solid ${themeAccent}55` }) }}>
                  <ItemArt id={resultId} size={44} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-cinzel font-800" style={{ fontSize: '1.35rem', lineHeight: 1.12, ...(state === 'forged' ? forgedTextSoft(abyssal) : { color: abyssal ? '#ffe4d6' : '#f7efd8' }) }}>{result.name}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
                    <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.66rem', color: abyssal ? themeAccent : accent }}>{STATE_META[state].label}</p>
                    {abyssal && (
                      <span className="font-karla font-800 uppercase tracking-[0.12em]" style={{ fontSize: '0.5rem', color: EMBER, background: `${EMBER}1c`, border: `1px solid ${EMBER}55`, borderRadius: 999, padding: '0.14rem 0.42rem' }}>Abyssal · Tier III</span>
                    )}
                  </div>
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
                      background: !canAfford ? 'rgba(255,255,255,0.04)'
                        : armedLearn ? 'linear-gradient(180deg, rgba(248,140,90,0.34), rgba(196,90,60,0.16))'
                        : abyssal ? 'linear-gradient(180deg, rgba(255,90,60,0.26), rgba(120,20,40,0.12))'
                        : 'linear-gradient(180deg, rgba(127,208,255,0.26), rgba(90,150,196,0.12))',
                      border: `1px solid ${!canAfford ? 'rgba(255,255,255,0.16)' : armedLearn ? 'rgba(248,140,90,0.7)' : abyssal ? `${EMBER}99` : `${BLUE}8c`}`,
                      color: !canAfford ? '#8a8480' : armedLearn ? '#ffd0b0' : abyssal ? '#ffd8c8' : '#cfeaff',
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
                      background: armed ? (abyssal ? 'linear-gradient(180deg, rgba(255,120,80,0.42), rgba(196,50,40,0.2))' : 'linear-gradient(180deg, rgba(248,140,90,0.34), rgba(196,90,60,0.16))')
                        : abyssal ? 'linear-gradient(180deg, rgba(255,90,60,0.28), rgba(80,12,24,0.14))'
                        : 'linear-gradient(180deg, rgba(232,200,121,0.3), rgba(196,169,106,0.14))',
                      border: `1px solid ${armed ? (abyssal ? 'rgba(255,120,80,0.8)' : 'rgba(248,140,90,0.7)') : abyssal ? `${EMBER}aa` : `${GOLD}99`}`,
                      color: armed ? '#ffd0b0' : abyssal ? '#ffcdb8' : '#f0d695', cursor: busy ? 'default' : 'pointer' }}>
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

// ─────────────────────────────────────────────────────────────────────────────
// THE ABYSSAL PLANNER — target-first, not recipe-first. Pick the Abyssals you're
// chasing; it expands each one down to its four base drops and totals the whole
// farm (grouped by where the drops come from), the forges, and the Fathoms.
function AbyssalPlanner({
  recipes, ownedRaidItems, learnedRecipes, fathomsNow, raidItemSlots,
  targets, onToggleTarget, onClear, onOpenRecipe,
}: {
  recipes: ForgeRecipe[]
  ownedRaidItems: string[]
  learnedRecipes: string[]
  fathomsNow: number
  raidItemSlots: number
  targets: Set<string>
  onToggleTarget: (id: string) => void
  onClear: () => void
  onOpenRecipe: (id: string) => void
}) {
  const owned = useMemo(() => new Set(ownedRaidItems), [ownedRaidItems])
  // A forged Abyssal is already yours, so it drops out of the farm even if it
  // lingered in a saved plan — the totals only count what you still have to build.
  const chosen = useMemo(() => recipes.filter(r => targets.has(r.result) && !owned.has(r.result)).map(r => r.result), [recipes, targets, owned])

  // Long-press a medallion to open its full recipe sheet; a short tap toggles it
  // into the plan (or, for a forged one, just opens the sheet). Tracked on a ref
  // so the press timer and the "fired" guard survive re-renders.
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean; x: number; y: number }>({ timer: null, fired: false, x: 0, y: 0 })
  const endPress = () => { if (press.current.timer) { clearTimeout(press.current.timer); press.current.timer = null } }
  const startPress = (id: string, e: React.PointerEvent) => {
    press.current.fired = false; press.current.x = e.clientX; press.current.y = e.clientY
    press.current.timer = setTimeout(() => { press.current.fired = true; vibrate([0, 24]); onOpenRecipe(id) }, 450)
  }
  const movePress = (e: React.PointerEvent) => {
    if (press.current.timer && (Math.abs(e.clientX - press.current.x) > 10 || Math.abs(e.clientY - press.current.y) > 10)) endPress()
  }
  const plan = useMemo(() => planAbyssalBuild(chosen, learnedRecipes), [chosen, learnedRecipes])

  // Base drops grouped by where they drop. Key normalises "The X" / "X" so a
  // single source doesn't split into two headers.
  const norm = (s: string) => s.replace(/^the\s+/i, '').toLowerCase()
  const groups = useMemo(() => {
    const g: Record<string, { label: string; items: { id: string; qty: number }[] }> = {}
    for (const [id, qty] of Object.entries(plan.baseQty)) {
      const raw = getRaidItem(id)?.source ?? 'Unknown source'
      const k = norm(raw)
      if (!g[k]) g[k] = { label: raw, items: [] }
      g[k].items.push({ id, qty })
    }
    const total = (o: { items: { qty: number }[] }) => o.items.reduce((a, b) => a + b.qty, 0)
    return Object.values(g)
      .map(o => ({ ...o, total: total(o), items: o.items.sort((a, b) => b.qty - a.qty || (getRaidItem(a.id)?.name ?? '').localeCompare(getRaidItem(b.id)?.name ?? '')) }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
  }, [plan])

  const maxQ = Math.max(1, ...Object.values(plan.baseQty))
  const t3 = chosen.length
  const t2 = plan.forgeTotal - t3
  const shared = Object.entries(plan.forgeCount)
    .filter(([, c]) => c > 1)
    .map(([id, c]) => `${getRaidItem(id)?.name} ×${c}`)
  const overMount = t3 > raidItemSlots

  return (
    <div>
      <p className="font-karla" style={{ fontSize: '0.86rem', color: '#b4ada2', lineHeight: 1.5, marginBottom: 12 }}>
        Pick the Abyssals you&apos;re chasing. Every one stacks in a loadout, so there are no bad combos — the planner just totals the whole farm behind them. <span style={{ color: '#8a8480' }}>Tap to add, hold to inspect the recipe.</span>
      </p>

      {/* Selectable Abyssal medallions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: '1.1rem' }}>
        {recipes.map(r => {
          const def = getRaidItem(r.result)!
          const forged = owned.has(r.result)
          const on = targets.has(r.result) && !forged
          return (
            <motion.button key={r.result} type="button"
              onPointerDown={e => startPress(r.result, e)}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              onPointerCancel={endPress}
              onPointerMove={movePress}
              onClick={() => {
                // A long-press already fired — swallow the trailing click so it
                // doesn't also toggle the target.
                if (press.current.fired) { press.current.fired = false; return }
                if (forged) { onOpenRecipe(r.result); return }
                onToggleTarget(r.result)
              }}
              whileTap={{ scale: 0.95 }}
              className="tap"
              aria-pressed={on}
              style={{
                position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                padding: '0.6rem 0.35rem 0.5rem', borderRadius: 13, minWidth: 0,
                cursor: 'pointer', opacity: forged ? 0.62 : 1, touchAction: 'manipulation',
                background: on ? 'rgba(255,90,60,0.14)' : 'rgba(255,255,255,0.035)',
                border: `1px solid ${on ? `${EMBER}aa` : 'rgba(255,255,255,0.1)'}`,
                transition: 'background 0.14s, border-color 0.14s',
              }}>
              <ItemArt id={r.result} size={40} dim={forged && !on} />
              <span className="font-cinzel font-700" style={{ fontSize: '0.72rem', lineHeight: 1.18, textAlign: 'center', minHeight: '1.7rem', color: on ? '#ffcdb8' : '#e9e4da' }}>
                {def.name}
              </span>
              {forged ? (
                <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.55rem', color: '#7be0a3' }}>Forged</span>
              ) : (
                <span aria-hidden style={{
                  width: 17, height: 17, borderRadius: '50%', display: 'grid', placeItems: 'center',
                  border: `1.5px solid ${on ? EMBER : 'rgba(255,255,255,0.18)'}`,
                  background: on ? EMBER : 'transparent', color: on ? '#2a0d08' : 'transparent',
                }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                </span>
              )}
            </motion.button>
          )
        })}
      </div>

      {chosen.length === 0 ? (
        <p className="font-karla" style={{ fontSize: '0.84rem', color: '#8a8480', lineHeight: 1.5, textAlign: 'center', padding: '1.2rem 0.5rem' }}>
          Tap an Abyssal above to see exactly what it takes to forge.
        </p>
      ) : (
        <>
          {/* Summary tiles */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {[
              { v: `${t3}`, l: 'Abyssals' },
              { v: `${plan.baseTotal}`, l: 'Drops to farm' },
              { v: `${t2}+${t3}`, l: 'Tier-2 + Abyssal forges' },
              { v: `${plan.fathomCost}`, l: 'Fathoms to learn' },
            ].map(s => (
              <div key={s.l} style={{ flex: '1 1 108px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 11, padding: '0.6rem 0.7rem' }}>
                <p className="font-cinzel font-800" style={{ fontSize: '1.4rem', lineHeight: 1, color: '#ffcdb8' }}>{s.v}</p>
                <p className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.54rem', color: '#8a8480', marginTop: 5 }}>{s.l}</p>
              </div>
            ))}
          </div>

          {/* Fathom affordability + mount check */}
          <p className="font-karla" style={{ fontSize: '0.76rem', color: fathomsNow >= plan.fathomCost ? GREEN : AMBER, marginBottom: overMount || shared.length ? 8 : 14 }}>
            {plan.fathomCost === 0 ? 'Every recipe already learned — just the drops to go.'
              : fathomsNow >= plan.fathomCost ? `You hold ${fathomsNow} Fathoms — enough to learn all ${plan.learnRecipeIds.length} recipe${plan.learnRecipeIds.length > 1 ? 's' : ''}.`
              : `Learning the ${plan.learnRecipeIds.length} recipe${plan.learnRecipeIds.length > 1 ? 's' : ''} costs ${plan.fathomCost} Fathoms; you have ${fathomsNow}.`}
          </p>
          <p className="font-karla" style={{ fontSize: '0.78rem', lineHeight: 1.5, color: overMount ? AMBER : '#7be0a3', marginBottom: shared.length ? 8 : 14 }}>
            {overMount
              ? `⚑ ${t3} Abyssals but only ${raidItemSlots} mounts — build them all, you'll just swap which ${raidItemSlots} you fly per fight.`
              : `✓ All ${t3} fit your ${raidItemSlots} mounts — the whole set can ride at once.`}
          </p>
          {shared.length > 0 && (
            <p className="font-karla" style={{ fontSize: '0.78rem', lineHeight: 1.5, color: AMBER, background: `${AMBER}12`, border: `1px solid ${AMBER}3a`, borderRadius: 9, padding: '0.55rem 0.7rem', marginBottom: 14 }}>
              ⚑ {shared.join(', ')} forged more than once — a shared parent means a fresh copy per Abyssal, farmed from scratch each time.
            </p>
          )}

          {/* Drops to farm, grouped by source */}
          <p className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.68rem', color: EMBER, marginBottom: 11 }}>
            Drops to farm — {plan.baseTotal} total
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            {groups.map(g => (
              <div key={g.label}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, paddingBottom: 5, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className="font-karla font-700" style={{ fontSize: '0.76rem', color: '#a9d0dd' }}>{g.label}</span>
                  <span className="font-karla" style={{ fontSize: '0.62rem', color: '#6f6a63', marginLeft: 'auto' }}>{g.total} drop{g.total > 1 ? 's' : ''}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {g.items.map(({ id, qty }) => {
                    const def = getRaidItem(id)
                    const have = owned.has(id)
                    return (
                      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#ffce8a', background: 'rgba(232,200,121,0.1)', border: `1px solid ${GOLD}44`, borderRadius: 7, padding: '2px 8px', minWidth: 36, textAlign: 'center' }}>×{qty}</span>
                        <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)' }}>
                          <ItemArt id={id} size={20} />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#e6e1d6', display: 'flex', alignItems: 'baseline', gap: 7 }}>
                            {def?.name}
                            {have && <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.56rem', color: GREEN }}>aboard</span>}
                          </p>
                          <div style={{ height: 4, borderRadius: 3, background: 'rgba(0,0,0,0.4)', overflow: 'hidden', marginTop: 4 }}>
                            <div style={{ height: '100%', width: `${Math.round(qty / maxQ * 100)}%`, borderRadius: 3, background: `linear-gradient(90deg, ${GOLD}88, ${GOLD})` }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={onClear} className="font-karla font-700 tap"
            style={{ width: '100%', marginTop: 18, padding: '0.6rem', background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#8a8480', fontSize: '0.82rem', cursor: 'pointer' }}>
            Clear selection
          </button>
        </>
      )}
    </div>
  )
}
