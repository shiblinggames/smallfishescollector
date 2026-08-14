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
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ctaPill } from '@/lib/uiTokens'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { vibrate } from '@/lib/haptics'
import { lockBodyScroll } from '@/lib/bodyScrollLock'
import {
  FORGE_RECIPES, getRaidItem, getForgeRecipe, cacheComponentsMissing,
  forgeComponentIds, recipesUsingComponent, forgeOpportunityCost,
  recipeNeedsGauntlet2, GAUNTLET2_BASE_ITEM_IDS, isAbyssalForgedItem,
  planForgeBuild, buildForgeTrees, isConvertibleEpic, legendaryForEpic, type ForgeRecipe, type ForgeTreeNode,
} from '@/lib/raidItems'
import LoadoutSummary from './LoadoutSummary'
import ItemEffectLines from '@/components/ItemEffectLines'
import { raidSourceForItem } from '@/lib/raidMap'
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
export type ForgeTab = 2 | 3 | 'accel'

const TABS = [
  { tier: 2 as const,       label: 'The Forge',              sub: 'Tier II',  abyssal: false, accel: false },
  { tier: 3 as const,       label: 'The Abyssal Forge',      sub: 'Tier III', abyssal: true,  accel: false },
  { tier: 'accel' as const, label: 'The Accelerator',        sub: 'Tier III', abyssal: true,  accel: true  },
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
  convertBusy = false, claimBusy = false, onStartConvert, onClaimConvert, onTabChange,
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
  /** Reports which bench is showing so the page hero can match it. */
  onTabChange?: (tab: ForgeTab) => void
}) {
  const router = useRouter()
  // GO AND GET IT. A leaf of a build tree names where it drops; this makes that
  // name somewhere you can actually go. A campaign drop opens its boss card on
  // the hub (so you read the odds and records before committing), a Gauntlet
  // drop goes straight to the descent, since a run has no boss card to open.
  //
  // The forge is its own route, so this is a plain navigation. No handoff to
  // the raid section, no drawer to close.
  const goToSource = (itemId: string) => {
    const link = raidSourceForItem(itemId)
    if (!link) return
    vibrate([0, 14])
    router.push(link.kind === 'boss' ? `/expeditions?boss=${link.nodeId}` : link.route!)
  }
  // Which forge you're looking at. The Abyssal (tier-3) tab only becomes a real
  // destination once you own the Abyssal Forge; before that it's a locked teaser.
  const [tab, setTab] = useState<ForgeTab>(2)
  // Tapping a part you hold filters the board to what it can become.
  const [filterPart, setFilterPart] = useState<string | null>(null)
  // "Plan a Build" mode. Pick the pieces you are chasing — from EITHER bench —
  // and see the whole recursive farm instead of the recipe-by-recipe view.
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
  const accelTab = tab === 'accel'
  // The parent owns the page hero (icon + title), so it needs to know which
  // bench is showing. Fired on mount too, so the hero is right on first paint.
  useEffect(() => { onTabChange?.(tab) }, [tab, onTabChange])

  // A part selected on one tab means nothing on the other — clear it on switch.
  useEffect(() => { setFilterPart(null) }, [tab])

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
  // The Accelerator tab is not a recipe bench, so it has no rows at all.
  const tierRows = accelTab ? [] : rows.filter(r => (r.recipe.tier === 3) === abyssalTab)
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
      {/* Shown on EVERY bench, the Accelerator included. It tracks the whole
          forged collection rather than the tab you happen to be on, and
          hiding it on one tab made the header height jump as you switched. */}
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

      {/* ── "Plan a Build". It used to be a toggle buried on the Abyssal tab,
             which put a tool that spans BOTH benches inside one of them, and
             read as a mode you fell into rather than a place you went. It sits
             above the bench picker now because that is what it is: a step back
             from the benches, not a third one. ─────────────────────────────── */}
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
          {planning ? 'Back to the benches' : 'Plan a Build'}
        </span>
      </button>

      {/* ── The two benches, as tabs. Tier II (gold) and the Abyssal Tier III
             (molten ember). The Abyssal tab is a dimmed, locked teaser until you
             own the Abyssal Forge — so a player always knows the endgame bench
             exists, and knows at a glance whether it's theirs yet. ──────────── */}
      {!planning && (
      <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 15, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '1.15rem' }}>
        {TABS.map(t => {
            const active = tab === t.tier
            const locked = t.accel ? !acceleratorUnlocked : (t.abyssal && !abyssalUnlocked)
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
      )}

      {planning ? (
        <ForgePlanner
          recipes={rows.map(r => r.recipe)}
          ownedRaidItems={ownedRaidItems}
          learnedRecipes={learnedRecipes}
          fathomsNow={fathomsNow}
          raidItemSlots={raidItemSlots}
          targets={planTargets}
          onToggleTarget={id => { vibrate([0, 12]); setPlanTargets(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }}
          onClear={() => { vibrate([0, 10]); setPlanTargets(new Set()) }}
          onOpenRecipe={id => setOpen(id)}
          onGoToSource={goToSource}
        />
      ) : (<>
      {/* ── The Abyssal Accelerator — its OWN bench now, not a panel bolted
             to the bottom of the Abyssal tab. It is a different action (convert
             one item over 24h) from fusing two, and it earns its own tab. ──── */}
      {accelTab && (
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
                    // READY is the only one of these you can act on, so it gets
                    // the pill and the rest stay as plain counts. The CARD keeps
                    // its tint: a grid of solid gold plates would be the garish
                    // case the no-solid-fills rule is actually about.
                    state === 'ready' ? (
                      <span className="font-karla font-800 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.1em', padding: '0.1rem 0.5rem', borderRadius: 999, ...ctaPill(false) }}>
                        Ready
                      </span>
                    ) : (
                      <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: accent }}>
                        {`${have}/${recipe.components.length} parts`}
                      </span>
                    )
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
        onOpenRecipe={id => setOpen(id)}
        onGoToSource={goToSource}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ── THE ABYSSAL ACCELERATOR ──────────────────────────────────────────────────
// Epic→legendary transmutation bench (a Don's Permanent Upgrades unlock). Lives on the
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
      {/* The bench itself, painted in the same idiom as the boons. AccelCore
          below still carries the live state; this just gives the panel a face. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/forge/accelerator.png" alt="" aria-hidden decoding="async"
        style={{ width: 52, height: 52, objectFit: 'contain', display: 'block', margin: '0 auto 4px', opacity: unlocked ? 1 : 0.55, filter: unlocked ? undefined : 'grayscale(0.8)' }} />
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
            Transmute an epic boss drop into its legendary chase version. Unlock <span style={{ color: '#ffcdb8', fontWeight: 700 }}>The Abyssal Accelerator</span> in Don’s Gauntlet (Permanent Upgrades).
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

/** THE FULL BREAKDOWN — everything under a recipe, not just the two things it
 *  fuses. A tier-3 Abyssal is two tier-2 fusions of two drops each, so "Fused
 *  From" naming two items you also do not have was, for the recipes that matter
 *  most, an answer that only raised the same question one level down.
 *
 *  Its own component because the sheet body is an IIFE, which cannot hold state. */
function FullBreakdown({ resultId, ownedRaidItems, onOpenRecipe, onGoToSource }: {
  resultId: string
  ownedRaidItems: string[]
  onOpenRecipe?: (id: string) => void
  onGoToSource?: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const tree = useMemo(() => buildForgeTrees([resultId], ownedRaidItems)[0], [resultId, ownedRaidItems])
  // Nothing to expand when every component is a base drop — the list above
  // already IS the whole tree.
  const deep = tree.children.some(c => c.children.length > 0)
  if (!deep) return null
  const st = treeStats(tree)
  return (
    <div style={{ marginTop: 11 }}>
      <button type="button" onClick={() => { vibrate([0, 12]); setOpen(v => !v) }} aria-expanded={open} className="tap"
        style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '0.5rem 0.55rem', borderRadius: 10, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.09)', font: 'inherit', textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation' }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8a8480" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden
          style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s' }}><path d="M9 18l6-6-6-6" /></svg>
        <span className="font-karla font-700" style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', color: '#c8c2b8' }}>Full breakdown</span>
        <span className="font-karla" style={{ flexShrink: 0, fontSize: '0.62rem', color: '#6f6a63' }}>
          {st.find > 0 ? `${st.find} to find · ` : ''}{st.forge} forge{st.forge === 1 ? '' : 's'}
        </span>
      </button>
      {open && (
        <div style={{ marginLeft: 10, paddingLeft: 11, borderLeft: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
          {tree.children.map((c, k) => (
            <TreeBranch key={`${c.id}-${k}`} node={c} onOpenRecipe={id => onOpenRecipe?.(id)} onGoToSource={onGoToSource} />
          ))}
        </div>
      )}
    </div>
  )
}

function RecipeSheet({
  resultId, onClose, ownedRaidItems, state, fathomsNow,
  forging, forgeArmed, learning, learnArmed, onForgeTap, onLearnTap, onOpenRecipe, onGoToSource,
}: {
  resultId: string | null
  onClose: () => void
  ownedRaidItems: string[]
  /** Drill into a sub-recipe from the breakdown, swapping the sheet's subject. */
  onOpenRecipe?: (id: string) => void
  onGoToSource?: (id: string) => void
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

              <div style={{ marginTop: 12 }}><ItemEffectLines def={result} size={0.86} /></div>

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
                  <FullBreakdown resultId={resultId} ownedRaidItems={ownedRaidItems} onOpenRecipe={onOpenRecipe} onGoToSource={onGoToSource} />
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
// THE BUILD PLANNER — target-first, not recipe-first.
//
// The bench answers "what can I forge right now?" one recipe at a time. This
// answers the question a bench can never answer: "I want THESE pieces, so what
// is actually standing between me and all of them?"
//
// Three things it has to do, in this order, because it is the order you think
// in: what would I END UP with, what does it COST, and how is each one MADE.
// The old version only ever did the middle one, which is why a screen full of
// correct numbers still read as noise — it quoted a price without ever showing
// the thing being bought.
//
// It spans BOTH benches. A tier-2 fusion is a perfectly reasonable thing to
// chase, and chasing one alongside an Abyssal that eats it is the single case
// where the destructive-forge maths actually bites you.

/** An omitted tier means the ordinary forge — normalise once so sorting and
 *  grouping cannot quietly drop the recipes that leave it off. */
const tierOf = (r: ForgeRecipe) => r.tier ?? 2

/** What one branch still costs, folded the same way the plan folds it. */
function treeStats(n: ForgeTreeNode): { find: number; forge: number; have: number } {
  if (n.status === 'have') return { find: 0, forge: 0, have: 1 }
  if (n.status === 'find') return { find: 1, forge: 0, have: 0 }
  return n.children.reduce((a, c) => {
    const t = treeStats(c)
    return { find: a.find + t.find, forge: a.forge + t.forge, have: a.have + t.have }
  }, { find: 0, forge: 1, have: 0 })
}

const NODE_META = {
  have:  { label: 'Aboard', color: GREEN },
  forge: { label: 'Forge',  color: EMBER },
  find:  { label: 'Find',   color: GOLD },
} as const

/** One node and everything beneath it. Recursive, so a future fusion-of-fusion
 *  tier draws itself with no changes here. */
function TreeBranch({ node, onOpenRecipe, onGoToSource }: {
  node: ForgeTreeNode
  onOpenRecipe: (id: string) => void
  /** Take me to where this drops. Only ever offered on a leaf. */
  onGoToSource?: (id: string) => void
}) {
  const def = getRaidItem(node.id)
  const meta = NODE_META[node.status]
  // Only a recipe has a sheet to open. A base drop has nothing behind it.
  const canOpen = !!getForgeRecipe(node.id)
  // A leaf you still have to find, and somewhere to go for it.
  const source = node.status === 'find' && onGoToSource ? raidSourceForItem(node.id) : null
  return (
    <div>
      {canOpen ? (
        <button type="button" onClick={() => { vibrate([0, 12]); onOpenRecipe(node.id) }} className="tap"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0,
            padding: '0.32rem 0.4rem', borderRadius: 8, textAlign: 'left', font: 'inherit',
            background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)',
            cursor: 'pointer', touchAction: 'manipulation',
            opacity: node.status === 'have' ? 0.72 : 1,
          }}>
          <ItemArt id={node.id} size={20} dim={node.status === 'have'} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="font-karla font-700" style={{ display: 'block', fontSize: '0.78rem', color: '#e6e1d6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {def?.name ?? node.id}
            </span>
          </span>
          <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ flexShrink: 0, fontSize: '0.53rem', color: meta.color }}>
            {meta.label}
          </span>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#6f6a63" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" /></svg>
        </button>
      ) : source ? (
        <button type="button" onClick={() => onGoToSource!(node.id)} className="tap"
          aria-label={`${def?.name ?? node.id}, drops from ${source.label}. Tap to go there.`}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0,
            padding: '0.32rem 0.4rem', borderRadius: 8, textAlign: 'left', font: 'inherit',
            background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)',
            cursor: 'pointer', touchAction: 'manipulation',
          }}>
          <ItemArt id={node.id} size={20} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="font-karla font-700" style={{ display: 'block', fontSize: '0.78rem', color: '#e6e1d6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {def?.name ?? node.id}
            </span>
            {/* The source doubles as the button's label: the row says where it
                drops AND is the way there, rather than naming a place and
                leaving you to go find it. */}
            <span className="font-karla" style={{ display: 'block', fontSize: '0.6rem', color: '#8fa9b6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {source.label}
            </span>
          </span>
          <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ flexShrink: 0, fontSize: '0.53rem', color: NODE_META.find.color }}>
            {meta.label}
          </span>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#6f6a63" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" /></svg>
        </button>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0,
          padding: '0.32rem 0.4rem', opacity: node.status === 'have' ? 0.72 : 1,
        }}>
          <ItemArt id={node.id} size={20} dim={node.status === 'have'} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="font-karla font-700" style={{ display: 'block', fontSize: '0.78rem', color: '#e6e1d6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {def?.name ?? node.id}
            </span>
            {/* Where it drops, on the leaves only. It is the one thing you need
                to know about a part you do not have, and hunting for it in a
                separate list was most of why that list felt like homework. */}
            {node.status === 'find' && node.source && (
              <span className="font-karla" style={{ display: 'block', fontSize: '0.6rem', color: '#8fa9b6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {node.source}
              </span>
            )}
          </span>
          <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ flexShrink: 0, fontSize: '0.53rem', color: meta.color }}>
            {meta.label}
          </span>
        </div>
      )}
      {node.children.length > 0 && (
        <div style={{ marginLeft: 10, paddingLeft: 11, borderLeft: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: 3, marginTop: 3 }}>
          {node.children.map((c, k) => (
            <TreeBranch key={`${c.id}-${k}`} node={c} onOpenRecipe={onOpenRecipe} onGoToSource={onGoToSource} />
          ))}
        </div>
      )}
    </div>
  )
}

/** One target, its cost line, and its tree behind a chevron. */
function TreeCard({ node, startOpen, onOpenRecipe, onGoToSource }: {
  node: ForgeTreeNode
  startOpen: boolean
  onOpenRecipe: (id: string) => void
  onGoToSource?: (id: string) => void
}) {
  const [open, setOpen] = useState(startOpen)
  const def = getRaidItem(node.id)
  const st = treeStats(node)
  const abyssal = getForgeRecipe(node.id)?.tier === 3
  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden',
      background: 'rgba(0,0,0,0.22)',
      border: `1px solid ${abyssal ? `${EMBER}33` : 'rgba(255,255,255,0.09)'}`,
    }}>
      <button type="button" onClick={() => { vibrate([0, 12]); setOpen(v => !v) }} aria-expanded={open} className="tap"
        style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '0.6rem 0.65rem', background: 'none', border: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation' }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8a8480" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden
          style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s' }}><path d="M9 18l6-6-6-6" /></svg>
        <ItemArt id={node.id} size={28} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="font-cinzel font-700" style={{ display: 'block', fontSize: '0.86rem', lineHeight: 1.15, color: abyssal ? '#ffcdb8' : '#f0ede8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {def?.name ?? node.id}
          </span>
          <span className="font-karla" style={{ display: 'block', fontSize: '0.63rem', color: '#8a8480', marginTop: 2 }}>
            {st.find > 0 ? `${st.find} to find · ` : ''}{st.forge} forge{st.forge === 1 ? '' : 's'}{st.have > 0 ? ` · ${st.have} aboard` : ''}
          </span>
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 0.65rem 0.6rem' }}>
          <div style={{ marginLeft: 10, paddingLeft: 11, borderLeft: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {node.children.map((c, k) => (
              <TreeBranch key={`${c.id}-${k}`} node={c} onOpenRecipe={onOpenRecipe} onGoToSource={onGoToSource} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ForgePlanner({
  recipes, ownedRaidItems, learnedRecipes, fathomsNow, raidItemSlots,
  targets, onToggleTarget, onClear, onOpenRecipe, onGoToSource,
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
  onGoToSource?: (id: string) => void
}) {
  const owned = useMemo(() => new Set(ownedRaidItems), [ownedRaidItems])
  // Tier ascending, so a fusion you already hold settles the SIMPLER goal first
  // and the Abyssal that eats it is the one told to farm another. A fixed order
  // also means the plan cannot change because of the order you tapped things in.
  const ordered = useMemo(() => [...recipes].sort((a, b) => tierOf(a) - tierOf(b)), [recipes])
  /** Everything you are chasing, forged or not. This is the BUILD. */
  const targeted = useMemo(() => ordered.filter(r => targets.has(r.result)).map(r => r.result), [ordered, targets])
  /** The subset still to build. Anything already aboard is off the farm list. */
  const chosen = useMemo(() => targeted.filter(id => !owned.has(id)), [targeted, owned])

  // Ownership-aware: the plan prunes any branch already aboard, so the numbers
  // answer "what is LEFT" rather than "what would this cost from zero". Without
  // it a half-built player was quoted the full farm every visit, parts in hand
  // included, which is the single biggest reason this panel read as noise.
  const plan = useMemo(() => planForgeBuild(chosen, learnedRecipes, ownedRaidItems), [chosen, learnedRecipes, ownedRaidItems])
  const baseLeft = plan.baseTotal - plan.baseHave

  const abyssalCount = chosen.filter(id => getForgeRecipe(id)?.tier === 3).length
  const t2 = plan.forgeTotal - abyssalCount
  const shared = Object.entries(plan.forgeCount)
    .filter(([, c]) => c > 1)
    .map(([id, c]) => `${getRaidItem(id)?.name} ×${c}`)
  const overMount = targeted.length > raidItemSlots

  // The picker, split by bench. Two labelled groups read faster than one grid of
  // seventeen medallions where the tier is something you have to already know.
  const tierGroups = [
    { tier: 2, label: 'The Forge', sub: 'Tier II', hue: GOLD },
    { tier: 3, label: 'The Abyssal Forge', sub: 'Tier III', hue: EMBER },
  ].map(t => ({ ...t, items: ordered.filter(r => tierOf(r) === t.tier) })).filter(t => t.items.length > 0)

  return (
    <div>
      <p className="font-karla" style={{ fontSize: '0.86rem', color: '#b4ada2', lineHeight: 1.5, marginBottom: 12 }}>
        Pick the pieces you&apos;re chasing, from either bench, and this totals everything still standing between you and all of them. Parts already aboard are counted off.
      </p>

      {/* Selectable medallions, grouped by bench */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginBottom: '1.15rem' }}>
        {tierGroups.map(g => (
          <div key={g.tier}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 8 }}>
              <span className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.6rem', color: g.hue }}>{g.label}</span>
              <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#6f6a63' }}>{g.sub}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {g.items.map(r => {
                const def = getRaidItem(r.result)!
                const forged = owned.has(r.result)
                const on = targets.has(r.result)
                return (
                  <motion.button key={r.result} type="button"
                    onClick={() => { vibrate([0, 12]); onToggleTarget(r.result) }}
                    whileTap={{ scale: 0.95 }}
                    className="tap"
                    aria-pressed={on}
                    style={{
                      position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                      padding: '0.6rem 0.35rem 0.5rem', borderRadius: 13, minWidth: 0,
                      cursor: 'pointer', touchAction: 'manipulation',
                      background: on ? `${g.hue}22` : 'rgba(255,255,255,0.035)',
                      border: `1px solid ${on ? `${g.hue}aa` : 'rgba(255,255,255,0.1)'}`,
                      transition: 'background 0.14s, border-color 0.14s',
                    }}>
                    <ItemArt id={r.result} size={40} dim={forged && !on} />
                    <span className="font-cinzel font-700" style={{ fontSize: '0.72rem', lineHeight: 1.18, textAlign: 'center', minHeight: '1.7rem', color: on ? '#f4ecd8' : '#e9e4da' }}>
                      {def.name}
                    </span>
                    {/* A forged piece stays pickable: it still counts toward what
                        the build FLIES, it just costs nothing more to get. */}
                    {forged ? (
                      <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.55rem', color: GREEN }}>Forged</span>
                    ) : (
                      <span aria-hidden style={{
                        width: 17, height: 17, borderRadius: '50%', display: 'grid', placeItems: 'center',
                        border: `1.5px solid ${on ? g.hue : 'rgba(255,255,255,0.18)'}`,
                        background: on ? g.hue : 'transparent', color: on ? '#1a1410' : 'transparent',
                      }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      </span>
                    )}
                  </motion.button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {targeted.length === 0 ? (
        <p className="font-karla" style={{ fontSize: '0.84rem', color: '#8a8480', lineHeight: 1.5, textAlign: 'center', padding: '1.2rem 0.5rem' }}>
          Tap a piece above to see what it takes to forge, and what it flies once you have it.
        </p>
      ) : (
        <>
          {/* ── WHAT YOU END UP WITH. The payoff goes first: every other number
                 on this screen is a price, and a price means nothing until you
                 have seen the thing it buys. Same fold as the battle loadout,
                 because a build that reads one way here and another way in the
                 hold is worse than no summary at all. ────────────────────── */}
          <LoadoutSummary
            equippedIds={targeted}
            accent={EMBER}
            title="What This Build Flies"
            emptyText="These pieces grant no combat effects on their own."
            defaultOpen
          />

          {/* Summary tiles */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {[
              // Every tile is a REMAINING count. "6+2" used to sit here under
              // "Tier-2 + Abyssal forges", which read as arithmetic nobody could
              // resolve — it is now one number with the split spelled out under it.
              { v: `${baseLeft}`, l: 'Drops still to find', sub: plan.baseHave > 0 ? `${plan.baseHave} of ${plan.baseTotal} aboard` : undefined },
              { v: `${plan.forgeTotal}`, l: 'Forges to run', sub: abyssalCount > 0 && t2 > 0 ? `${t2} tier-2, then ${abyssalCount} abyssal` : abyssalCount > 0 ? `${abyssalCount} abyssal` : `${t2} tier-2` },
              { v: `${plan.fathomCost}`, l: 'Fathoms to spend', sub: plan.learnRecipeIds.length > 0 ? `${plan.learnRecipeIds.length} recipe${plan.learnRecipeIds.length > 1 ? 's' : ''} to learn` : 'all learned' },
            ].map(st => (
              <div key={st.l} style={{ flex: '1 1 108px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 11, padding: '0.6rem 0.7rem' }}>
                <p className="font-cinzel font-800" style={{ fontSize: '1.4rem', lineHeight: 1, color: '#ffcdb8' }}>{st.v}</p>
                <p className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.54rem', color: '#8a8480', marginTop: 5 }}>{st.l}</p>
                {st.sub && <p className="font-karla" style={{ fontSize: '0.58rem', color: '#6f6a63', marginTop: 3 }}>{st.sub}</p>}
              </div>
            ))}
          </div>

          {/* Fathom affordability + mount check */}
          {chosen.length > 0 && (
            <p className="font-karla" style={{ fontSize: '0.76rem', color: fathomsNow >= plan.fathomCost ? GREEN : AMBER, marginBottom: 8 }}>
              {plan.fathomCost === 0 ? 'Every recipe already learned — just the drops to go.'
                : fathomsNow >= plan.fathomCost ? `You hold ${fathomsNow} Fathoms — enough to learn all ${plan.learnRecipeIds.length} recipe${plan.learnRecipeIds.length > 1 ? 's' : ''}.`
                : `Learning the ${plan.learnRecipeIds.length} recipe${plan.learnRecipeIds.length > 1 ? 's' : ''} costs ${plan.fathomCost} Fathoms; you have ${fathomsNow}.`}
            </p>
          )}
          <p className="font-karla" style={{ fontSize: '0.78rem', lineHeight: 1.5, color: overMount ? AMBER : GREEN, marginBottom: shared.length ? 8 : 14 }}>
            {overMount
              ? `⚑ ${targeted.length} pieces but only ${raidItemSlots} mounts — build them all, you'll just swap which ${raidItemSlots} you fly per fight.`
              : `✓ All ${targeted.length} fit your ${raidItemSlots} mounts — the whole set can ride at once.`}
          </p>
          {shared.length > 0 && (
            <p className="font-karla" style={{ fontSize: '0.78rem', lineHeight: 1.5, color: AMBER, background: `${AMBER}12`, border: `1px solid ${AMBER}3a`, borderRadius: 9, padding: '0.55rem 0.7rem', marginBottom: 14 }}>
              ⚑ Two of your picks want the same part. You&apos;ll need to build {shared.join(' and ')} — the forge consumes what it fuses, so each one needs its own copy, farmed separately.
            </p>
          )}

          {/* ── HOW EACH ONE IS MADE. The recipe on the bench names two
                 components and stops, so an Abyssal never once admitted to the
                 four drops actually behind it. Open a branch to walk it all the
                 way down to the sea floor. ──────────────────────────────── */}
          {plan.trees.length > 0 && (
            <>
              <p className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.68rem', color: EMBER, marginBottom: 4 }}>
                How they&apos;re made
              </p>
              <p className="font-karla" style={{ fontSize: '0.72rem', color: '#8a8480', lineHeight: 1.45, marginBottom: 11 }}>
                Open one to walk its parts down to the drops. Tap a fusion to read its recipe, or a drop to go where it falls.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                {plan.trees.map((t, k) => (
                  <TreeCard key={`${t.id}-${k}`} node={t} startOpen={plan.trees.length === 1} onOpenRecipe={onOpenRecipe} onGoToSource={onGoToSource} />
                ))}
              </div>
            </>
          )}

          <button type="button" onClick={onClear} className="font-karla font-700 tap"
            style={{ width: '100%', marginTop: 18, padding: '0.6rem', background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#8a8480', fontSize: '0.82rem', cursor: 'pointer' }}>
            Clear selection
          </button>
        </>
      )}
    </div>
  )
}
