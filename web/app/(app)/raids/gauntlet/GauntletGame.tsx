'use client'

// Davy Jones Gauntlet host. Owns the push-your-luck meta-loop (depth, pot,
// cash-out vs push-on, the daily gate) and mounts the existing RaidCombat
// engine one fight at a time. No combat rewrite: RaidCombat fights a single
// generated enemy, hands back the player's remaining HP, and we carry it into
// the next fight. Bosses / elites fire on the randomized guardrails in
// lib/gauntlet; boons + curses are the run-modifier layer (Tides are raids-only).
// The pot is only banked on cash-out; a wipe loses everything.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import RaidCombat from '../RaidCombat'
import { getShipSkin } from '@/lib/shipSkins'
import type { RaidMods } from '@/lib/expeditions'
import type { RaidCrewMember } from '../actions'
import { classForSlug, CLASSES, currentMilestone } from '@/lib/crewClasses'
import { crewLevelFromXP } from '@/lib/crewLevel'
import {
  generateFight, advanceRollState, chestForDepth,
  isCurseDepth, drawCurse, curseEffects, curseHpDrain, curseSilenceCount, curseTierLabel, GAUNTLET_CURSES,
  isBoonDepth, drawBoons, boonEffects, boonTierLabel, GAUNTLET_BOONS, BOON_RARITY_META, boonRarity,
  REPRIEVE_MIN_DEPTH, REPRIEVE_CHANCE, drawReprieve, type Reprieve,
  DROWNED_FILTER, bandForDepth, davyTaunt,
  GAUNTLET_COOLDOWN_HOURS,
  CHEST_TIERS, chestCannonDropChance,
  type GauntletFight, type GauntletRollState, type CurseOffer, type BoonOffer, type GauntletRunSnapshot,
} from '@/lib/gauntlet'
import { startGauntletRun, cashOutGauntlet, resolveGauntletDeath, getGauntletUpgradeState, claimGauntletUpgrade, markGauntletIntroSeen, recordGauntletHit } from './actions'
import { GAUNTLET_UPGRADES, bonusChargeSlots, gauntletRunHpMult, gauntletSkipsFirstCurse, gauntletSkipOffset, gauntletDamageTakenMod, gauntletDamageMod, gauntletKillHealPct, gauntletHasSoundingLine, gauntletBoonLuck, gauntletBoonRerolls, gauntletCurseRerolls } from '@/lib/gauntletUpgrades'
import { type ShipAugment } from '@/lib/shipAugments'
import { getSpecialItem } from '@/lib/specialItems'
import { buySpecialItem } from '@/app/(app)/fishing/actions'
import { getRaidItem, getActiveEffects } from '@/lib/raidItems'
import LeaderboardModal from '@/components/LeaderboardModal'
import { vibrate } from '@/lib/haptics'
import { getXPProgress, MAX_LEVEL } from '@/lib/expeditionLevel'

type Phase = 'intro' | 'usedup' | 'descending' | 'fighting' | 'curse' | 'boon' | 'between' | 'reward' | 'dead'

type CashResult = Awaited<ReturnType<typeof cashOutGauntlet>>

const GOLD = '#f0c040'
const TEAL = '#5eead4'

// Davy Jones himself — the gauntlet's face. Drives both the intro centerpiece
// and the descent transition.
const MAW_IMG = '/davyjones.png'

function fmt(n: number) { return Math.round(n).toLocaleString() }

// The deep gets heavier the further you fall. RaidCombat's sky/water palette
// shifts with depth: murk (fog) → cold gloom (overcast) → the blood-dark
// bottom (sunset). Depth 12 also unlocks tier-2 Curses, so the dread palette
// lands exactly when the run turns truly dangerous.
function atmosphereForDepth(depth: number): 'fog' | 'overcast' | 'sunset' {
  if (depth >= 12) return 'sunset'
  if (depth >= 6) return 'overcast'
  return 'fog'
}

export interface GauntletGameProps {
  shipImageUrl: string
  shipName: string
  username: string | null
  playerHPMax: number
  shipMinDamage: number
  shipSpeed: number
  totalPower: number
  totalDodge: number
  totalFortune: number
  crewMembers: RaidCrewMember[]
  equippedShipSkin: string | null
  equippedItems: string[]
  classDamageMult: number
  classDoubloonMult: number
  shipClasses: Record<string, string>
  equippedRepairKit: string
  playerCharacterColor: string | null
  playerEquippedHat: string | null
  playerAvatarBg: string | null
  playerAvatarBorder: string | null
  raidMods: RaidMods
  /** Extra player cannonball slots from claimed Locker Upgrades. */
  bonusChargeSlots: number
  /** Man-o-War volley augment (or null) — the Mega attack. */
  manowarAugment: ShipAugment | null
  /** Claimed Locker Upgrade ids — drives the run-scoped perks (Diving Bell,
   *  Calm Before…). */
  gauntletUpgrades: string[]
  deepest: number
  /** Snapshot of the deepest run (boons/curses/tides) for the home recap. */
  deepestRun: GauntletRunSnapshot | null
  /** Fathoms balance — the Gauntlet's meta-currency, spent in the Locker. */
  fathoms: number
  available: boolean
  /** ISO time the next run unlocks (cooldown), or null when available now. */
  nextAt: string | null
  /** Whether the player has seen the first-time explainer. */
  hasSeenIntro: boolean
  /** #1 deepest cashed-out descender across all captains, or null if none yet. */
  topDescender: { name: string; depth: number } | null
}

export default function GauntletGame(props: GauntletGameProps) {
  const router = useRouter()
  const shipFilter = props.equippedShipSkin ? getShipSkin(props.equippedShipSkin)?.filter ?? 'none' : 'none'
  // Diving Bell (Run Upgrade) lifts the player's max HP for the whole run; every
  // HP reference below uses this boosted ceiling rather than the raw stat.
  const hpMax = Math.round(props.playerHPMax * gauntletRunHpMult(props.gauntletUpgrades))
  // Veteran's Start: combat depth = cleared + 1 + skipOffset (enemies, boon/curse
  // cadence, displayed depth). Rewards stay on the cleared count, so the head
  // start never inflates pot / chests / Fathoms / record.
  const skipOffset = gauntletSkipOffset(props.gauntletUpgrades)
  // Run Upgrades that fold into the combat mods: Iron Hide (−damage taken) +
  // Gunner's Eye (+damage dealt).
  const runRaidMods = {
    ...props.raidMods,
    damageTakenPct: (props.raidMods.damageTakenPct ?? 0) + gauntletDamageTakenMod(props.gauntletUpgrades),
    damagePct: (props.raidMods.damagePct ?? 0) + gauntletDamageMod(props.gauntletUpgrades),
  }

  const [phase, setPhase] = useState<Phase>(props.available ? 'intro' : 'usedup')
  const [starting, setStarting] = useState(false)
  // When the next run unlocks (cooldown). Set from props, or refreshed if a
  // start attempt races the cooldown.
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(props.nextAt)
  // Ticks the cooldown countdown on the locked screen (every 30s is plenty).
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    if (phase !== 'usedup') return
    const t = setInterval(() => setNowTick(Date.now()), 30000)
    return () => clearInterval(t)
  }, [phase])

  // Run state
  const [playerHP, setPlayerHP] = useState(hpMax)
  const [pot, setPot] = useState(0)
  const [bossesDefeated, setBossesDefeated] = useState(0)
  const [fight, setFight] = useState<GauntletFight | null>(null)
  // Sounding Line: the next fight, pre-rolled at the breather so it can be
  // revealed before the player commits — and CONSUMED on push, so the reveal is
  // the actual fight, not a separate (lying) roll. State drives the reveal, the
  // ref is the source of truth pushOn reads.
  const [peekFight, setPeekFight] = useState<GauntletFight | null>(null)
  const peekFightRef = useRef<GauntletFight | null>(null)
  const [usedAbilityIds, setUsedAbilityIds] = useState<Set<number>>(new Set())
  // Dead Hands curse — crew ids the deep has silenced. They stay in the used set
  // through every refresh, so their ability never comes back. Reconciled to the
  // active curse count whenever a curse is imposed or cleansed.
  const silencedCrewIdsRef = useRef<number[]>([])
  // Crew that actually have a usable ability (a wired class + an unlocked
  // milestone at their level) — the only ones worth silencing.
  function abilityCrewIds(): number[] {
    return props.crewMembers
      .filter(c => { const cls = classForSlug(c.slug); return !!cls && !!currentMilestone(CLASSES[cls], crewLevelFromXP(c.xp)) })
      .map(c => c.id)
  }
  // Reconcile the silenced set to the active Dead Hands count: lock newly
  // silenced crew into the used set now, and free any a cleanse just released.
  function reconcileSilence() {
    const before = silencedCrewIdsRef.current
    const count = curseSilenceCount(curseTiersRef.current)
    const valid = abilityCrewIds()
    const keep = before.filter(id => valid.includes(id))
    const pool = valid.filter(id => !keep.includes(id))
    while (keep.length < Math.min(count, valid.length) && pool.length) {
      keep.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
    }
    const next = keep.slice(0, Math.min(count, valid.length))
    silencedCrewIdsRef.current = next
    const freed = before.filter(id => !next.includes(id))
    setUsedAbilityIds(prev => {
      const s = new Set(prev)
      next.forEach(id => s.add(id))      // lock the silenced
      freed.forEach(id => s.delete(id))  // a cleanse refreshed these
      return s
    })
  }
  // Reprieve — an optional one-time relief card (heal / crew refresh) that can
  // surface alongside the boons in later rounds. Taking it means forgoing the
  // boon draft (give up upgrade potential for immediate relief).
  const [pendingReprieve, setPendingReprieve] = useState<Reprieve | null>(null)
  // Second Cast: rerolls left on the CURRENT boon draft (set when it opens).
  const [rerollsLeft, setRerollsLeft] = useState(0)
  // Salt Ward: rerolls left on the CURRENT imposed curse (set when it appears).
  const [curseRerollsLeft, setCurseRerollsLeft] = useState(0)
  // Depth the current curse was drawn at — so a Salt Ward reroll redraws at the
  // same depth (keeps the tier-2 gate honest).
  const curseDepthRef = useRef(0)
  // Calm Before: spent once it has waved off the player's FIRST curse milestone
  // (whatever depth that is — Veteran's Start can move it off depth 4).
  const calmBeforeUsedRef = useRef(false)
  // True for the fight that OPENS right after crew abilities were restored (a
  // boss kill or a Beat to Quarters reprieve) — drives the obvious in-combat
  // "abilities restored" banner. crewRefreshedRef accumulates between fights;
  // pushOn snapshots it into the state the next fight reads.
  const [fightOpensRefreshed, setFightOpensRefreshed] = useState(false)
  const crewRefreshedRef = useRef(false)
  // Curses — the Locker's escalating, permanent run modifiers.
  // Active curses as id -> tier (1 or 2), mirroring the boon system. Tier 2
  // deepens a curse already on you (from CURSE_TIER2_DEPTH). The ref backs the
  // tight-deps reads (draw + hp drain).
  const [curseTiers, setCurseTiers] = useState<Record<string, number>>({})
  const [pendingCurse, setPendingCurse] = useState<CurseOffer | null>(null)
  const curseTiersRef = useRef<Record<string, number>>({})
  // Boons — drafted as TIERS (family id → highest tier owned, 1..3). Drafting a
  // higher tier replaces the lower; no infinite single-boon stacking.
  const [boonTiers, setBoonTiers] = useState<Record<string, number>>({})
  const [pendingBoons, setPendingBoons] = useState<BoonOffer[] | null>(null)
  // Boon-draft fanfare — a "stop the room" reveal when a Rare/Legendary surfaces.
  const [boonFanfare, setBoonFanfare] = useState<'legendary' | 'rare' | null>(null)
  // Tapped boon/curse on the breather screen → details popup.
  const [detailEffect, setDetailEffect] = useState<
    { kind: 'boon' | 'curse'; name: string; desc: string; detail: string; flavor: string; count: number; maxTier?: number } | null
  >(null)
  const [reward, setReward] = useState<CashResult | null>(null)
  const [resolving, setResolving] = useState(false)
  // Fathoms salvaged from a sunk run (the meta-currency still pays for the dive).
  const [deathFathoms, setDeathFathoms] = useState(0)
  // The Locker — two separate shops, each opened to its own section:
  // 'run' = perks for the descent itself, 'shore' = upgrades for the wider game.
  const [shopSection, setShopSection] = useState<'run' | 'shore' | null>(null)
  const [haulOpen, setHaulOpen] = useState(false)
  // Deepest-run recap modal (boons/curses/tides of the record dive).
  const [deepestRunOpen, setDeepestRunOpen] = useState(false)
  // Mid-fight bail-out guard. The ← button is easy to mis-tap, and leaving a
  // live run forfeits the whole pot — so confirm first.
  const [confirmLeave, setConfirmLeave] = useState(false)
  // First-timer explainer. Auto-opens once (server flag), reopenable via the
  // "How it works" link.
  const [introOpen, setIntroOpen] = useState(!props.hasSeenIntro)

  // Guardrail counters live in refs (read inside combat callbacks).
  const rollStateRef = useRef<GauntletRollState>({ cleared: 0, prevWasBoss: false, roundsSinceBoss: 0 })
  const playerHPRef = useRef(hpMax)
  const potRef = useRef(0)
  // Powder Hoard carryover: cannonballs to seed the next fight with (set at each
  // kill from the leftover charges, capped by the boon tier). Reset each run.
  const carriedChargesRef = useRef(0)
  // Where a guard-intercepted exit should go once the player confirms the
  // abandon (the tapped nav link, or /expeditions for a Back press).
  const pendingNavRef = useRef<(() => void) | null>(null)
  // Biggest single blow landed this descent — fed to the Biggest Hit board the
  // moment it's beaten (persists even on death). Reset each run in begin().
  const runMaxHitRef = useRef(0)
  // Lethal-save charges (Quartermaster's Anchor etc.) — a per-RUN pool that
  // survives the per-fight RaidCombat remounts, decremented when one fires.
  // Reset each run in begin().
  const anchorSavesLeftRef = useRef(
    getActiveEffects(props.equippedItems).filter(e => e.type === 'lethal_save').reduce((a, e) => a + e.value, 0),
  )
  // Extra cannonball slots from claimed Locker Upgrades. Seeded from the server
  // prop but kept in state so a purchase mid-session applies without a refresh.
  const [bonusSlots, setBonusSlots] = useState(props.bonusChargeSlots)

  // ── Mid-run exit guard ─────────────────────────────────────────────────────
  // Same shape as RaidGame's: any attempt to leave a live descent (tab bar, nav
  // link, browser Back) is intercepted and routed through the abandon confirm
  // instead of silently forfeiting the pot. beforeunload covers a hard refresh /
  // tab close with the browser's native prompt. Active across the whole run
  // (every in-fight + interstitial phase) so the Back sentinel is pushed once.
  const runLive = phase === 'descending' || phase === 'fighting'
    || phase === 'curse' || phase === 'boon' || phase === 'between'
  useEffect(() => {
    if (!runLive) return
    window.history.pushState(null, '', window.location.href) // Back sentinel
    const signal = (nav: () => void) => { pendingNavRef.current = nav; setConfirmLeave(true) }
    const onClickCapture = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest('a')
      if (!a) return
      const tgt = a.getAttribute('target')
      if (tgt && tgt !== '_self') return
      const href = a.getAttribute('href')
      if (!href || !href.startsWith('/')) return                 // same-app routes only
      if (href.split(/[?#]/)[0] === window.location.pathname) return // same page
      e.preventDefault()
      e.stopPropagation()
      signal(() => router.push(href))
    }
    const onPop = () => {
      window.history.pushState(null, '', window.location.href)   // re-arm; stay put
      signal(() => router.push('/expeditions'))
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    document.addEventListener('click', onClickCapture, true)
    window.addEventListener('popstate', onPop)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('click', onClickCapture, true)
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [runLive, router])

  // Body-scroll lock in installed PWA only, and ONLY during combat (keeps the
  // action buttons reachable — same reasoning as RaidGame). The meta screens
  // (intro/cooldown/between/reward/dead) are taller and must stay scrollable.
  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (!standalone) return
    if (phase !== 'fighting') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [phase])

  function dismissIntro() {
    setIntroOpen(false)
    if (!props.hasSeenIntro) markGauntletIntroSeen().catch(() => {})
  }

  function begin() {
    if (starting) return
    setStarting(true)
    startGauntletRun().then(res => {
      if (!res.started) { if (res.nextAt) setCooldownUntil(res.nextAt); setPhase('usedup'); setStarting(false); return }
      // Fresh run.
      rollStateRef.current = { cleared: 0, prevWasBoss: false, roundsSinceBoss: 0 }
      playerHPRef.current = hpMax
      potRef.current = 0
      carriedChargesRef.current = 0
      runMaxHitRef.current = 0
      setPlayerHP(hpMax)
      setPot(0)
      setBossesDefeated(0)
      setUsedAbilityIds(new Set())
      setCurseTiers({}); curseTiersRef.current = {}
      setPendingCurse(null)
      setBoonTiers({}); setPendingBoons(null); setPendingReprieve(null)
      peekFightRef.current = null; setPeekFight(null)
      crewRefreshedRef.current = false; setFightOpensRefreshed(false)
      calmBeforeUsedRef.current = false
      anchorSavesLeftRef.current = getActiveEffects(props.equippedItems)
        .filter(e => e.type === 'lethal_save').reduce((a, e) => a + e.value, 0)
      setFight(generateFight(rollStateRef.current, skipOffset))
      setPhase('descending')
      setStarting(false)
    })
  }

  // After a run ends, return to the Gauntlet's own intro (not all the way out to
  // the expeditions map) with fresh server data, ready to descend again. begin()
  // fully resets the run state, so we just flip back to 'intro' + refetch.
  function backToIntro() {
    setReward(null)
    setDeathFathoms(0)
    setPhase('intro')
    router.refresh()
  }

  // Pre-roll the next fight the moment the breather opens, so Sounding Line can
  // reveal it AND pushOn fights the very same roll (no re-roll = no lie). The
  // roll state doesn't change between here and the push, so this is consistent.
  useEffect(() => {
    if (phase !== 'between') return
    const nf = generateFight(rollStateRef.current, skipOffset)
    peekFightRef.current = nf
    setPeekFight(nf)
  }, [phase, skipOffset])

  // The descent beat: a short fall-into-the-dark interstitial before each fight
  // so dropping deeper reads as a real plunge, not a hard cut. Fight is already
  // generated by the time we land here; we just hold the cut for a moment.
  useEffect(() => {
    if (phase !== 'descending') return
    // Hold longer on depths where Davy speaks, so his taunt is readable.
    const hasTaunt = fight ? davyTaunt(fight.depth) !== null : false
    const t = setTimeout(() => setPhase('fighting'), hasTaunt ? 3000 : 1350)
    return () => clearTimeout(t)
  }, [phase, fight])

  // Boon-draft fanfare — when the draft surfaces a Rare/Legendary, fire a
  // reveal beat (gold burst + banner + treasure sting + haptic) so a good roll
  // lands like a moment. Plays once as the draft screen opens.
  useEffect(() => {
    if (phase !== 'boon' || !pendingBoons) { setBoonFanfare(null); return }
    const tier = pendingBoons.some(b => b.rarity === 'legendary') ? 'legendary'
               : pendingBoons.some(b => b.rarity === 'rare') ? 'rare' : null
    setBoonFanfare(tier)
    if (tier === 'legendary') {
      vibrate([0, 50, 40, 70, 40, 110])
      import('@/lib/fishingMusic').then(m => m.playChestSfx(true)).catch(() => {})
    } else if (tier === 'rare') {
      vibrate([0, 35, 45, 55])
      import('@/lib/fishingMusic').then(m => m.playChestSfx(false)).catch(() => {})
    }
    const t = setTimeout(() => setBoonFanfare(null), 1500)
    return () => clearTimeout(t)
  }, [phase, pendingBoons])

  function handleEnemyDefeated(remainingHp: number, leftoverCharges = 0) {
    const f = fight
    if (!f) return
    // Powder Hoard boon: carry unfired cannonballs into the next fight, up to
    // the boon's cap. Stored here and fed to the next RaidCombat as initialCharges.
    const carryEffect = boonEffects(boonTiers).find(e => e.kind === 'chargeCarryover')
    carriedChargesRef.current = carryEffect && carryEffect.kind === 'chargeCarryover'
      ? Math.max(0, Math.min(leftoverCharges, carryEffect.cap))
      : 0
    // Vigor (Run Upgrade): patch up a slice of max HP for every ship you sink.
    const vigorHeal = Math.round(hpMax * gauntletKillHealPct(props.gauntletUpgrades))
    const healedHp = vigorHeal > 0 ? Math.min(hpMax, remainingHp + vigorHeal) : remainingHp
    playerHPRef.current = healedHp
    setPlayerHP(healedHp)
    potRef.current += f.potContribution
    setPot(potRef.current)
    if (f.isBoss) setBossesDefeated(b => b + 1)

    rollStateRef.current = advanceRollState(rollStateRef.current, f)
    const clearedNow = rollStateRef.current.cleared

    // Crew abilities refresh after each BOSS kill (a natural "catch your breath"
    // beat) plus at run start. Keys off the actual fight, not a depth counter,
    // so Veteran's Start can't desync it. The on-demand Reprieve fills the gaps.
    // Refresh everyone EXCEPT crew the deep has silenced (Dead Hands) — they
    // stay spent through the refresh.
    if (f.isBoss) { setUsedAbilityIds(new Set(silencedCrewIdsRef.current)); crewRefreshedRef.current = true }

    // Curse milestone (descend INTO a CURSE_DEPTH) and boon draft (INTO a
    // BOON_DEPTH). They sit on different depths so the run alternates toll and
    // gift. Calm Before lets the FIRST curse milestone pass uncursed — the
    // player descends curse-free until the second. The curse/boon both-fire
    // branch below is kept defensive in case the two ever share a depth.
    // Combat depth (Veteran's Start shifts the boon/curse cadence up too).
    const nextDepth = clearedNow + 1 + skipOffset
    // isCurseDepth / isBoonDepth carry the cadence PAST the fixed schedule
    // (every few depths forever) so deep runs keep stacking rules.
    const atCurseDepth = isCurseDepth(nextDepth)
    // Calm Before waves off the FIRST curse milestone the player actually hits,
    // not a hardcoded depth — so it still works under Veteran's Start, which
    // starts past depth 4. Spent the moment it fires.
    const skipFirstCurse = atCurseDepth && !calmBeforeUsedRef.current && gauntletSkipsFirstCurse(props.gauntletUpgrades)
    if (skipFirstCurse) calmBeforeUsedRef.current = true
    const curse = (atCurseDepth && !skipFirstCurse)
      ? drawCurse(curseTiersRef.current, nextDepth)   // null once the curse pool is spent
      : null
    // Draw the boons up front so an exhausted pool ([] when every family is
    // maxed) falls through to the breather instead of an empty draft screen.
    const boons = isBoonDepth(nextDepth)
      ? drawBoons(3, boonTiers, gauntletBoonLuck(props.gauntletUpgrades))
      : []
    if (curse || boons.length > 0) {
      // Set the boon draft now even on a curse round, so applyCurse can hand off
      // to the boon screen (it routes to 'boon' whenever pendingBoons is set).
      if (boons.length > 0) {
        setPendingBoons(boons)
        setRerollsLeft(gauntletBoonRerolls(props.gauntletUpgrades))
        // Reprieve: in later rounds, sometimes a one-time relief card surfaces
        // alongside the boons (replacing the old random heal-tide's job, but as
        // a deliberate choice). Taking it forgoes the boon draft.
        setPendingReprieve(nextDepth >= REPRIEVE_MIN_DEPTH && Math.random() < REPRIEVE_CHANCE
          ? drawReprieve({ curseCount: Object.keys(curseTiersRef.current).length })
          : null)
      }
      if (curse) { curseDepthRef.current = nextDepth; setPendingCurse(curse); setCurseRerollsLeft(gauntletCurseRerolls(props.gauntletUpgrades)); setPhase('curse') }
      else setPhase('boon')
      return
    }

    setPhase('between')
  }

  // Record a freshly-imposed curse (or its tier-2 deepening) at its tier, then
  // drop into the breather. Effects are resolved live from curseTiers via
  // curseEffects() and threaded into the combat pipeline, so nothing is pushed
  // into the tide channel here (mirrors how boons work).
  function applyCurse(offer: CurseOffer) {
    const next = { ...curseTiersRef.current, [offer.id]: offer.tier }
    curseTiersRef.current = next
    setCurseTiers(next)
    // Dead Hands: lock the freshly-silenced crew into the used set right away.
    if (offer.silenceCrew) reconcileSilence()
    setPendingCurse(null)
    // If a boon was drawn for this same depth (Calm Before lands a curse on a
    // boon depth), show it next instead of dropping straight to the breather.
    setPhase(pendingBoons ? 'boon' : 'between')
  }

  // Claim a drafted boon — its effect rides the active-effect channel (run-wide,
  // so it persists + stacks), then drop into the breather.
  // Claim a drafted boon TIER — records it as the family's highest tier (a higher
  // tier replaces the lower). Effects are derived from boonTiers and fed to
  // RaidCombat each fight, so they persist for free without piling into the tide
  // channel (where an upgrade would otherwise double-apply the old tier).
  function applyBoon(offer: BoonOffer) {
    setBoonTiers(prev => ({ ...prev, [offer.id]: offer.tier }))
    setPendingBoons(null)
    setPendingReprieve(null) // chose the boon over the relief
    setPhase('between')
  }

  // Second Cast: throw the offered boons back and draw three fresh ones.
  function rerollBoons() {
    if (rerollsLeft <= 0) return
    setPendingBoons(drawBoons(3, boonTiers, gauntletBoonLuck(props.gauntletUpgrades)))
    setRerollsLeft(r => r - 1)
  }

  // Salt Ward: throw the imposed curse back and draw a different one. Tries a few
  // times to land a curse that isn't the same one you just shrugged off; if the
  // pool is thin it may repeat (and an exhausted pool just keeps the current one).
  function rerollCurse() {
    if (curseRerollsLeft <= 0 || !pendingCurse) return
    const depth = curseDepthRef.current
    let next = drawCurse(curseTiersRef.current, depth)
    for (let i = 0; i < 6 && next && next.id === pendingCurse.id && next.tier === pendingCurse.tier; i++) {
      next = drawCurse(curseTiersRef.current, depth)
    }
    if (next) setPendingCurse(next)
    setCurseRerollsLeft(r => r - 1)
  }

  // Take the Reprieve instead of a boon — apply its one-time effect now and
  // forgo the draft entirely (the give-up-upgrade-potential trade).
  function applyReprieve(r: Reprieve) {
    if (r.kind === 'heal') {
      const healed = Math.min(hpMax, Math.round(playerHPRef.current + hpMax * r.amount))
      playerHPRef.current = healed
      setPlayerHP(healed)
    } else if (r.kind === 'crew') {
      // Loads every ability fresh — but Dead Hands holds its silenced crew down.
      setUsedAbilityIds(new Set(silencedCrewIdsRef.current))
      crewRefreshedRef.current = true
    } else if (r.kind === 'charges') {
      // Open the next fight with the gun deck run out (carryover plumbing).
      carriedChargesRef.current = 3 + bonusChargeSlots(props.gauntletUpgrades)
    } else if (r.kind === 'cleanse') {
      // Shed one random active curse.
      const owned = Object.keys(curseTiersRef.current)
      if (owned.length > 0) {
        const drop = owned[Math.floor(Math.random() * owned.length)]
        const next = { ...curseTiersRef.current }
        delete next[drop]
        curseTiersRef.current = next
        setCurseTiers(next)
        // If Dead Hands was the curse shed, free the crew it had silenced.
        if (drop === 'dead_hands') reconcileSilence()
      }
    }
    setPendingReprieve(null)
    setPendingBoons(null)
    setPhase('between')
  }

  // Snapshot the run's boons + curses for the deepest-run recap. The server
  // stamps the real depth + time and only keeps it on a new record.
  function buildRunSnapshot(): GauntletRunSnapshot {
    return {
      depth: rollStateRef.current.cleared + skipOffset,
      boons: boonTiers,
      curses: curseTiers,
    }
  }

  function handlePlayerDefeated() {
    if (resolving) return
    setResolving(true)
    resolveGauntletDeath(rollStateRef.current.cleared, rollStateRef.current.cleared > 0 ? rollStateRef.current.cleared + skipOffset : 0, buildRunSnapshot()).then(res => {
      if (res?.ok) setDeathFathoms(res.earnedFathoms)
    }).finally(() => {
      setResolving(false)
      setPhase('dead')
    })
  }

  function pushOn() {
    // Crushing Depth (and any future drain curse): the hull sheds a slice of
    // max HP before each new fight. Clamped to leave at least 1 — the curse
    // squeezes how deep you can go, but the sea never lands the kill itself.
    const drainPct = curseHpDrain(curseTiersRef.current)
    if (drainPct > 0) {
      const drained = Math.max(1, Math.round(playerHPRef.current - hpMax * drainPct))
      playerHPRef.current = drained
      setPlayerHP(drained)
    }
    // Fight the fight Sounding Line pre-rolled at the breather (fallback-roll if
    // somehow unset). Clear the peek so the next breather rolls fresh.
    const next = peekFightRef.current ?? generateFight(rollStateRef.current, skipOffset)
    peekFightRef.current = null
    setPeekFight(null)
    // Snapshot whether this fight opens with freshly restored abilities, then
    // clear the accumulator for the next stretch.
    setFightOpensRefreshed(crewRefreshedRef.current)
    crewRefreshedRef.current = false
    setFight(next)
    setPhase('descending')
  }

  function cashOut() {
    if (resolving) return
    setResolving(true)
    cashOutGauntlet(rollStateRef.current.cleared, rollStateRef.current.cleared + skipOffset, potRef.current, buildRunSnapshot()).then(res => {
      setResolving(false)
      setReward(res)
      setPhase('reward')
      // NOTE: the purse tick (doubloons-changed / gems-changed) is deliberately
      // NOT fired here — it fires when the player cracks the chest open, so the
      // top purse counts up in sync with the chest reveal (see GauntletReward).
    })
  }

  // Abandon-run confirm, shared across every live-run phase (it portals to
  // body, so one element dropped into each return covers the whole descent).
  const exitModal = confirmLeave ? (
    <AbandonRunModal
      pot={potRef.current}
      onStay={() => { pendingNavRef.current = null; setConfirmLeave(false) }}
      onAbandon={() => {
        setConfirmLeave(false)
        const go = pendingNavRef.current ?? (() => router.push('/expeditions'))
        pendingNavRef.current = null
        resolveGauntletDeath(rollStateRef.current.cleared, rollStateRef.current.cleared > 0 ? rollStateRef.current.cleared + skipOffset : 0, buildRunSnapshot()).finally(go)
      }}
    />
  ) : null

  // Plain-English explainer for a tapped power/curse. Shared by the breather
  // tallies AND the boon-draft "learn more" buttons (it portals via fixed
  // position, so one element dropped into either screen covers both).
  const detailModal = (
    <AnimatePresence>
      {detailEffect && (() => {
        const isBoon = detailEffect.kind === 'boon'
        const accent = isBoon ? TEAL : '#f87171'
        const fg = isBoon ? '#aef3e6' : '#fca5a5'
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
            onClick={() => setDetailEffect(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(2,6,12,0.82)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
           <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
            <motion.div initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ type: 'spring', stiffness: 280, damping: 24 }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 360, borderRadius: 18, padding: '1.2rem 1.15rem 1.1rem', textAlign: 'center', background: 'linear-gradient(180deg, rgba(14,22,34,0.99), rgba(7,13,22,0.99))', border: `1px solid ${accent}55`, boxShadow: `0 0 44px ${accent}22, 0 18px 50px rgba(0,0,0,0.6)` }}>
              <p className="font-karla font-800 uppercase tracking-[0.22em]" style={{ fontSize: '0.58rem', color: `${accent}cc` }}>
                {isBoon ? 'Your Power' : 'The Locker’s Curse'}
              </p>
              <p className="font-cinzel font-800" style={{ fontSize: '1.45rem', color: '#f5f2ec', lineHeight: 1.12, marginTop: 6 }}>
                {detailEffect.name}
              </p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 11, padding: '0.36rem 0.9rem', borderRadius: 999, background: `${accent}20`, border: `1px solid ${accent}5e` }}>
                <span aria-hidden style={{ fontSize: '0.78rem', color: accent }}>{isBoon ? '▲' : '▼'}</span>
                <span className="font-karla font-800" style={{ fontSize: '0.86rem', color: fg }}>{detailEffect.desc}</span>
              </div>
              <p className="font-karla" style={{ fontSize: '0.92rem', lineHeight: 1.55, color: 'rgba(245,242,236,0.85)', marginTop: 13 }}>
                {detailEffect.detail}
              </p>
              {isBoon && (() => {
                const max = detailEffect.maxTier ?? 3
                return (
                  <p className="font-karla font-700" style={{ fontSize: '0.76rem', color: accent, marginTop: 9 }}>
                    {detailEffect.count >= max ? `Tier ${detailEffect.count} of ${max} — fully upgraded.` : `Tier ${detailEffect.count} of ${max} — draft it again to upgrade.`}
                  </p>
                )
              })()}
              <p className="font-karla" style={{ fontSize: '0.82rem', fontStyle: 'italic', color: 'rgba(245,242,236,0.52)', lineHeight: 1.5, marginTop: 13 }}>
                {detailEffect.flavor}
              </p>
              <button onClick={() => setDetailEffect(null)} className="font-karla font-700 uppercase tracking-[0.1em] tap"
                style={{ marginTop: 16, width: '100%', padding: '0.75rem', borderRadius: 12, fontSize: '0.72rem', background: `${accent}1c`, border: `1px solid ${accent}55`, color: fg, cursor: 'pointer' }}>
                Got It
              </button>
            </motion.div>
           </div>
          </motion.div>
        )
      })()}
    </AnimatePresence>
  )

  // ── Intro ──────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <>
        <AbyssBackdrop />
        <div style={{
          position: 'relative', zIndex: 1, maxWidth: 460, margin: '0 auto',
          padding: '6px 0.85rem', textAlign: 'center',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
        }}>
          {/* Title */}
          <h1 className="font-cinzel font-800" style={{ fontSize: '1.95rem', color: '#f3ead2', lineHeight: 1.08, marginTop: 8, textShadow: '0 0 26px rgba(240,192,64,0.32)' }}>
            Davy Jones Gauntlet
          </h1>

          {/* The maw — the hole you drop into */}
          <div style={{ position: 'relative', width: 196, height: 196, margin: '14px auto 4px' }}>
            <div style={{ position: 'absolute', inset: -26, borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,192,64,0.26) 0%, rgba(94,234,212,0.12) 42%, transparent 70%)', animation: 'gauntPulse 4.2s ease-in-out infinite' }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MAW_IMG} alt="" loading="eager" decoding="async"
              style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 10px 32px rgba(0,0,0,0.75))', animation: 'gauntDrift 6s ease-in-out infinite' }} />
          </div>

          {/* Deepest descent — the record to beat. Tap to recap that run's
              boons / curses / tides (once a record with a snapshot exists). */}
          {(() => {
            const hasRecap = !!props.deepestRun && props.deepest > 0
            return (
              <button
                type="button"
                onClick={hasRecap ? () => setDeepestRunOpen(true) : undefined}
                aria-label={hasRecap ? 'Recap your deepest run' : 'Deepest descent'}
                className={hasRecap ? 'tap' : undefined}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 6,
                  padding: '0.45rem 1.1rem', borderRadius: 999,
                  background: 'rgba(240,192,64,0.08)', border: `1px solid ${GOLD}3a`,
                  cursor: hasRecap ? 'pointer' : 'default',
                }}>
                <span className="font-karla font-700 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.18em', color: '#9a948a' }}>Deepest Descent</span>
                <span className="font-cinzel font-800" style={{ fontSize: '0.95rem', color: GOLD, lineHeight: 1 }}>
                  {props.deepest > 0 ? `Depth ${props.deepest}` : 'Uncharted'}
                </span>
                {hasRecap && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ opacity: 0.85 }}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>
                )}
              </button>
            )
          })()}

          {/* The name to beat — #1 deepest cashed-out descender of all. */}
          {props.topDescender && (
            <p className="font-karla" style={{ fontSize: '0.7rem', color: '#9a948a', marginTop: 9 }}>
              Deepest of all captains: <span className="font-700" style={{ color: TEAL }}>{props.topDescender.name}</span>, Depth {props.topDescender.depth}
            </p>
          )}

          {/* Leaderboard — deepest cashed-out descent + biggest single blow. */}
          <div style={{ marginTop: props.topDescender ? 6 : 9 }}>
            <LeaderboardModal boards={['gauntletDepth', 'gauntletBigHit']} title="The Gauntlet" label="View the Ranks" />
          </div>

          {/* Descend — the start. Big and obvious. */}
          <button onClick={begin} disabled={starting} className="font-cinzel font-800 uppercase tracking-[0.08em] tap"
            style={{
              marginTop: 20, width: '100%', padding: '1.05rem', borderRadius: 14, fontSize: '1.05rem',
              color: GOLD, background: `linear-gradient(180deg, ${GOLD}2a, ${GOLD}10)`,
              border: `1px solid ${GOLD}70`, cursor: starting ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              boxShadow: `0 0 22px ${GOLD}22`,
              animation: starting ? 'none' : 'gauntCta 2.6s ease-in-out infinite',
            }}>
            {starting ? 'Diving…' : (
              <>Descend
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 5l6 6 6-6" /><path d="M6 13l6 6 6-6" /></svg>
              </>
            )}
          </button>
          {GAUNTLET_COOLDOWN_HOURS > 0 && (
            <p className="font-karla" style={{ fontSize: '0.66rem', color: '#7a766e', marginTop: 8 }}>
              Each descent starts the {GAUNTLET_COOLDOWN_HOURS}-hour cooldown.
            </p>
          )}

          {/* Fathoms purse — the shop currency, sitting right above the shops. */}
          <div style={{ marginTop: 22, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 7 }}>
            <span className="font-cinzel font-800" style={{ fontSize: '1.15rem', color: TEAL, lineHeight: 1 }}>{fmt(props.fathoms)}</span>
            <span className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.16em', color: '#8aa39e' }}>Fathoms to spend</span>
          </div>

          {/* Secondary doors: the rewards guide + the two Fathoms shops. */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <ActionTile
              color={TEAL}
              onClick={() => setHaulOpen(true)}
              label="The Haul"
              line="What you earn"
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5 4 7a1.6 1.6 0 0 1 1.5-1h13A1.6 1.6 0 0 1 20 7l1 2.5" /><rect x="3" y="9.5" width="18" height="9.5" rx="1.6" /><path d="M3 13.2h18" /><rect x="10.5" y="11.4" width="3" height="3.6" rx="0.6" fill="currentColor" stroke="none" /></svg>}
            />
            <ActionTile
              color="#c4a0e8"
              onClick={() => setShopSection('run')}
              label="Run Upgrades"
              line="For the descent"
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4l6 6 6-6" /><path d="M6 12l6 6 6-6" /></svg>}
            />
            <ActionTile
              color={GOLD}
              onClick={() => setShopSection('shore')}
              label="Ship & Shore"
              line="Beyond the Gauntlet"
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v15" /><path d="M5 11l7-4 7 4" /><path d="M4 14c1.6 2.5 4.5 4 8 4s6.4-1.5 8-4" /><path d="M9 5.5h6" /></svg>}
            />
          </div>

          {/* Active run perks — only the gauntlet-scoped upgrades that change a
              descent. Global Ship & Shore unlocks (cannonball rack, etc.) live
              out in the world, so listing them here would just confuse. */}
          {(() => {
            const owned = GAUNTLET_UPGRADES.filter(u => u.scope === 'gauntlet' && props.gauntletUpgrades.includes(u.id))
            if (owned.length === 0) return null
            return (
              <div style={{ marginTop: 18 }}>
                <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: '#7a8e8a', marginBottom: 7 }}>Active Run Perks · {owned.length}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                  {owned.map(u => (
                    <span key={u.id} title={u.description} className="font-karla font-700" style={{ fontSize: '0.56rem', color: `${TEAL}dd`, background: `${TEAL}12`, border: `1px solid ${TEAL}30`, borderRadius: 999, padding: '0.2rem 0.6rem' }}>
                      ✓ {u.name}
                    </span>
                  ))}
                </div>
              </div>
            )
          })()}

          <button onClick={() => setIntroOpen(true)} className="font-karla font-600 tap"
            style={{ marginTop: 14, background: 'none', border: 'none', color: '#8a8480', fontSize: '0.7rem', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            How it works
          </button>

          <BackLink router={router} label="Not today" />
        </div>
        {introOpen && <GauntletIntroModal onClose={dismissIntro} firstTime={!props.hasSeenIntro} />}
        {haulOpen && <HaulModal onClose={() => setHaulOpen(false)} />}
        {deepestRunOpen && props.deepestRun && <DeepestRunModal run={props.deepestRun} onClose={() => setDeepestRunOpen(false)} />}
        {shopSection && <LockerUpgradesModal section={shopSection} onClose={() => setShopSection(null)} onClaimed={(owned) => setBonusSlots(bonusChargeSlots(owned))} />}
      </>
    )
  }

  if (phase === 'usedup') {
    const untilMs = cooldownUntil ? new Date(cooldownUntil).getTime() : 0
    const remMs = Math.max(0, untilMs - nowTick)
    const h = Math.floor(remMs / 3_600_000)
    const m = Math.floor((remMs % 3_600_000) / 60_000)
    const remLabel = h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`
    const ready = remMs <= 0
    return (
      <Shell>
        <Title sub={ready ? 'The deep is ready for you again.' : 'The Locker won’t take you again so soon.'}>
          {ready ? 'Back to the Brink' : 'Catch Your Breath'}
        </Title>
        <p className="font-karla" style={{ fontSize: '0.85rem', color: '#c9c3b8', lineHeight: 1.5 }}>
          {ready
            ? <>The sea has settled. Drop in again whenever you’re ready. Deepest so far: depth {props.deepest}.</>
            : <>You braved the Locker recently. Another descent unlocks in <strong style={{ color: '#e8c879' }}>{remLabel}</strong>. Deepest so far: depth {props.deepest}.</>
          }
        </p>
        {ready ? (
          <button
            onClick={begin}
            disabled={starting}
            className="font-cinzel font-700 uppercase tracking-[0.08em] tap"
            style={{ width: '100%', padding: '0.9rem', borderRadius: 12, fontSize: '1rem', background: 'rgba(232,200,121,0.2)', border: '1px solid rgba(232,200,121,0.55)', color: '#e8c879', cursor: 'pointer' }}
          >
            {starting ? 'Descending…' : 'Descend Again →'}
          </button>
        ) : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={() => setShopSection('run')} className="font-cinzel font-700 uppercase tracking-[0.07em] tap"
            style={{ flex: 1, padding: '0.8rem', borderRadius: 13, fontSize: '0.74rem', color: TEAL, background: `${TEAL}14`, border: `1px solid ${TEAL}55`, cursor: 'pointer' }}>
            Run Upgrades
          </button>
          <button onClick={() => setShopSection('shore')} className="font-cinzel font-700 uppercase tracking-[0.07em] tap"
            style={{ flex: 1, padding: '0.8rem', borderRadius: 13, fontSize: '0.74rem', color: GOLD, background: `${GOLD}14`, border: `1px solid ${GOLD}55`, cursor: 'pointer' }}>
            Ship & Shore
          </button>
        </div>
        <BackLink router={router} label="Back to the map" primary={!ready} />
        {shopSection && <LockerUpgradesModal section={shopSection} onClose={() => setShopSection(null)} onClaimed={(owned) => setBonusSlots(bonusChargeSlots(owned))} />}
      </Shell>
    )
  }

  // ── Reward (cash out) ───────────────────────────────────────────────────
  if (phase === 'reward') {
    const r = reward
    if (!r || !r.ok) {
      return (
        <Shell>
          <Title sub="Nothing banked.">Run Over</Title>
          <BackLink router={router} label="Back to the map" primary onClick={backToIntro} />
        </Shell>
      )
    }
    return <GauntletReward r={r} recap={{ shipsSunk: rollStateRef.current.cleared, maxHit: runMaxHitRef.current, boonTiers, curseTiers }} onBack={backToIntro} />
  }

  // ── Dead ────────────────────────────────────────────────────────────────
  if (phase === 'dead') {
    const cleared = rollStateRef.current.cleared
    // Combat depth: the deepest you cleared (reached) and the depth you fell at.
    // A death does NOT set the deepest record — that belongs to cash-outs — so
    // there is no "new deepest" celebration here, only the standing record.
    const reached = cleared + skipOffset
    const diedAt = reached + 1
    const lost = potRef.current
    const CRIMSON = '#ef4444'
    return (
      <>
        <AbyssBackdrop />
        {/* Crimson death wash bleeding up from the deep, over the abyss. */}
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: `radial-gradient(ellipse 120% 75% at 50% 112%, ${CRIMSON}24 0%, ${CRIMSON}10 34%, transparent 66%)` }} />
        <div style={{
          position: 'relative', zIndex: 1, maxWidth: 440, margin: '0 auto',
          padding: '10px 0.95rem', textAlign: 'center',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
        }}>
          {/* Davy claims it — drowned, looming, sinking in from above. */}
          <motion.div
            initial={{ opacity: 0, y: -24, scale: 0.86 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: 'relative', width: 188, height: 188, margin: '14px auto 2px' }}
          >
            <div style={{ position: 'absolute', inset: -22, borderRadius: '50%', background: `radial-gradient(circle, ${CRIMSON}30 0%, rgba(120,20,20,0.14) 42%, transparent 70%)`, animation: 'gauntPulse 3.4s ease-in-out infinite' }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <motion.img src={MAW_IMG} alt="" loading="eager" decoding="async"
              animate={{ y: [0, -5, 0] }} transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
              style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: `${DROWNED_FILTER} drop-shadow(0 10px 30px rgba(0,0,0,0.8)) drop-shadow(0 0 22px ${CRIMSON}40)` }} />
          </motion.div>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.32em', color: CRIMSON }}>
            The Locker Takes It
          </motion.p>
          <motion.h1 initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.24, type: 'spring', stiffness: 240, damping: 18 }}
            className="font-cinzel font-800" style={{ fontSize: '1.95rem', color: '#f3d6d6', lineHeight: 1.08, marginTop: 6, textShadow: `0 0 26px ${CRIMSON}3a` }}>
            You Sank
          </motion.h1>
          <p className="font-karla" style={{ fontSize: '0.78rem', color: '#9a948a', marginTop: 6 }}>
            Dragged under at depth {diedAt} · {cleared} {cleared === 1 ? 'round' : 'rounds'} deep
          </p>

          {/* The pot lost — the cost of pushing too far. */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34, duration: 0.4 }}
            style={{ marginTop: 16, padding: '1rem 1rem 0.95rem', borderRadius: 16, background: `radial-gradient(ellipse at 50% 0%, ${CRIMSON}14 0%, rgba(8,13,22,0.5) 74%)`, border: `1px solid ${CRIMSON}40`, boxShadow: `inset 0 0 24px ${CRIMSON}0e, 0 14px 40px rgba(0,0,0,0.45)` }}
          >
            <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: `${CRIMSON}cc` }}>Gone to the Deep</p>
            <p className="font-cinzel font-800" style={{ fontSize: '1.7rem', color: '#e08a8a', lineHeight: 1.05, marginTop: 5, textShadow: `0 0 18px ${CRIMSON}33` }}>
              {fmt(lost)} <span style={{ fontSize: '1.1rem' }}>⟡</span>
            </p>
            <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#8a8480', marginTop: 4 }}>
              and as much Nav XP, sunk with your ship.
            </p>
          </motion.div>

          {/* Silver lining — the Fathoms you salvaged. Your deepest record is
              unchanged: only surviving and cashing out sets it. */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} style={{ marginTop: 14 }}>
            <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#7a766e' }}>Deepest run: depth {props.deepest}</p>
            {deathFathoms > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 10, padding: '0.36rem 0.85rem', borderRadius: 999, background: `${TEAL}0e`, border: `1px solid ${TEAL}3a` }}>
                <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#8aa39e' }}>Salvaged</span>
                <span className="font-cinzel font-800" style={{ fontSize: '0.85rem', color: TEAL }}>+{fmt(deathFathoms)} Fathoms</span>
              </div>
            )}
            <p className="font-karla" style={{ fontSize: '0.66rem', color: '#8a8480', marginTop: 8, lineHeight: 1.45 }}>
              The pot is lost, but how deep you reached is not. The Fathoms you earned and any depth unlocks you tore loose are yours to keep.
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.62, duration: 0.4 }}>
            <RunRecap depth={reached} shipsSunk={cleared} maxHit={runMaxHitRef.current} boonTiers={boonTiers} curseTiers={curseTiers} />
          </motion.div>

          <div style={{ marginTop: 22 }}>
            <BackLink router={router} label="Back to the map" primary onClick={backToIntro} />
          </div>
        </div>
      </>
    )
  }

  // ── Between rounds: cash out or push on ──────────────────────────────────
  if (phase === 'between') {
    const cleared = rollStateRef.current.cleared
    // Display depth is the COMBAT depth (Veteran's Start shifts it up); chest +
    // pot stay on `cleared` so the head start is no reward shortcut.
    const combatDepth = cleared + skipOffset
    const nextDepth = combatDepth + 1
    const chest = chestForDepth(cleared)
    const previewDoubloons = Math.round(pot * chest.potMult * props.classDoubloonMult)
    const previewXp = Math.round(pot * chest.potMult)
    const hpPct = Math.max(0, Math.min(100, Math.round((playerHP / hpMax) * 100)))
    const hpColor = hpPct < 30 ? '#f87171' : hpPct < 60 ? GOLD : '#4ade80'
    const band = bandForDepth(combatDepth)
    const ownedBoons = GAUNTLET_BOONS
      .map(fam => ({ fam, tier: boonTiers[fam.id] ?? 0 }))
      .filter(x => x.tier >= 1)
    const ownedCurses = GAUNTLET_CURSES
      .map(c => ({ c, tier: curseTiers[c.id] ?? 0 }))
      .filter(x => x.tier >= 1)
    // A line of voice for the breather, keyed to the run's state — bleeding hull,
    // a fat haul, a record depth, or just the quiet before the next gun.
    const breathLine =
      hpPct < 30          ? 'Your hull groans. The deep can smell blood in the water.'
      : combatDepth >= 14 ? 'Few ships sail this deep. Fewer ever sail back.'
      : previewDoubloons >= 5000 ? "A captain's ransom rides in your hold now."
      : combatDepth <= 2  ? 'Early yet. The Locker is only just stirring below.'
      :                   'The water stills. The Locker waits on your nerve.'
    // Sounding Line — read what waits at the next depth before committing.
    const sounding = (gauntletHasSoundingLine(props.gauntletUpgrades) && peekFight)
      ? peekFight.isBoss
        ? { label: 'A BOSS lies below', sub: peekFight.enemy.name, color: '#f87171' }
        : peekFight.isElite
          ? { label: peekFight.affix ? `An Elite below · ${peekFight.affix.name}` : 'An Elite lies below', sub: peekFight.enemy.name, color: '#c084fc' }
          : { label: 'Open water below · a lone hull', sub: peekFight.enemy.name, color: TEAL }
      : null
    return (
      <>
        <AbyssBackdrop />
        <div style={{
          position: 'relative', zIndex: 1, maxWidth: 440, margin: '0 auto',
          padding: '10px 0.95rem', textAlign: 'center',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
        }}>
          <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="font-karla font-800 uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.34em', color: TEAL, marginTop: 12, textShadow: `0 0 14px ${TEAL}44` }}>
            Catch Your Breath
          </motion.p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#ece5d7', marginTop: 8, lineHeight: 1.1 }}>
            Depth {combatDepth} · {band.name}
          </p>
          {/* A line of voice so the breather has a pulse, keyed to how the run's going. */}
          <p className="font-karla" style={{ fontSize: '0.88rem', fontStyle: 'italic', color: 'rgba(150,205,194,0.82)', lineHeight: 1.45, marginTop: 9, maxWidth: 350, marginInline: 'auto' }}>
            &ldquo;{breathLine}&rdquo;
          </p>

          {/* The haul on the line — the push-your-luck centerpiece. */}
          <div style={{
            marginTop: 18, padding: '1.35rem 1rem 1.2rem', borderRadius: 20,
            background: `radial-gradient(ellipse at 50% 0%, ${GOLD}24 0%, rgba(8,13,22,0.6) 76%)`,
            border: `1px solid ${GOLD}4a`,
            boxShadow: `inset 0 0 32px ${GOLD}12, 0 14px 44px rgba(0,0,0,0.5)`,
          }}>
            <p className="font-karla font-800 uppercase tracking-[0.2em]" style={{ fontSize: '0.6rem', color: `${GOLD}cc` }}>
              Your Haul If You Bank Now
            </p>
            <p className="font-cinzel font-800" style={{ fontSize: '2.6rem', color: GOLD, lineHeight: 1.0, marginTop: 6, textShadow: `0 0 30px ${GOLD}55` }}>
              {fmt(previewDoubloons)} <span style={{ fontSize: '1.5rem' }}>⟡</span>
            </p>
            <p className="font-karla font-600" style={{ fontSize: '0.8rem', color: '#b0a890', marginTop: 8 }}>
              +{fmt(previewXp)} Nav XP{chest.gems > 0 ? ` · +${chest.gems} ◆` : ''} · {chest.label}{chest.potMult > 1 ? ` ×${chest.potMult} chest` : ''}
            </p>
            <button onClick={cashOut} disabled={resolving} className="font-cinzel font-800 uppercase tracking-[0.05em] tap"
              style={{ width: '100%', marginTop: 16, padding: '1.05rem', borderRadius: 14, fontSize: '1.05rem', color: '#f5d98a', background: `linear-gradient(180deg, ${GOLD}2a, ${GOLD}0e)`, border: `1px solid ${GOLD}77`, cursor: resolving ? 'wait' : 'pointer', boxShadow: `0 0 22px ${GOLD}1e` }}>
              {resolving ? '…' : 'Claim Now and Leave'}
            </button>
          </div>

          {/* Hull bar */}
          <div style={{ marginTop: 16, textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span className="font-karla font-800 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#9a988e' }}>Hull</span>
              <span className="font-cinzel font-700" style={{ fontSize: '0.98rem', color: hpColor }}>{playerHP} / {hpMax}</span>
            </div>
            <div style={{ height: 12, borderRadius: 6, background: 'rgba(0,0,0,0.5)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
              <motion.div initial={{ width: `${hpPct}%` }} animate={{ width: `${hpPct}%` }} transition={{ duration: 0.4 }}
                style={{ height: '100%', background: `linear-gradient(90deg, ${hpColor}aa, ${hpColor})`, boxShadow: `0 0 10px ${hpColor}88` }} />
            </div>
          </div>

          {/* Powers + Curses tallies — each chip taps to a plain-English detail. */}
          {(ownedBoons.length > 0 || ownedCurses.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 16, textAlign: 'left' }}>
              {ownedBoons.length > 0 && (
                <div>
                  <p className="font-karla font-800 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: TEAL, marginBottom: 6 }}>
                    Powers · {ownedBoons.length} <span style={{ color: 'rgba(255,255,255,0.34)', letterSpacing: 0, fontWeight: 600 }}>· tap to read</span>
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ownedBoons.map(({ fam, tier }) => {
                      const t = fam.tiers[tier - 1]
                      const rc = BOON_RARITY_META[boonRarity(fam)].color
                      return (
                        <button key={fam.id} className="font-karla font-700 tap"
                          onClick={() => setDetailEffect({ kind: 'boon', name: `${fam.name} ${boonTierLabel(tier)}`, desc: t.desc, detail: t.detail, flavor: fam.flavor, count: tier, maxTier: fam.tiers.length })}
                          style={{ cursor: 'pointer', fontSize: '0.68rem', padding: '0.28rem 0.66rem', borderRadius: 999, background: `${rc}20`, border: `1px solid ${rc}66`, color: rc }}>
                          {fam.name} {boonTierLabel(tier)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {ownedCurses.length > 0 && (
                <div>
                  <p className="font-karla font-800 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#f87171', marginBottom: 6 }}>
                    Curses · {ownedCurses.length} <span style={{ color: 'rgba(255,255,255,0.34)', letterSpacing: 0, fontWeight: 600 }}>· tap to read</span>
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ownedCurses.map(({ c, tier }) => {
                      const t = c.tiers[tier - 1]
                      const label = curseTierLabel(tier)
                      return (
                        <button key={c.id} className="font-karla font-700 tap"
                          onClick={() => setDetailEffect({ kind: 'curse', name: label ? `${c.name} ${label}` : c.name, desc: t.desc, detail: t.detail, flavor: c.flavor, count: tier, maxTier: c.tiers.length })}
                          style={{ cursor: 'pointer', fontSize: '0.68rem', padding: '0.28rem 0.66rem', borderRadius: 999, background: 'rgba(248,113,113,0.14)', border: '1px solid rgba(248,113,113,0.42)', color: '#fca5a5' }}>
                          {c.name}{label ? ` ${label}` : ''}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sounding Line — the next depth, read before the gamble. */}
          {sounding && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 18, padding: '0.6rem 0.9rem', borderRadius: 12, background: `${sounding.color}12`, border: `1px solid ${sounding.color}44` }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={sounding.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 2v20" /><path d="M5 9l7-7 7 7" /><path d="M8 16h8" /></svg>
              <div style={{ textAlign: 'left', minWidth: 0 }}>
                <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.46rem', color: `${sounding.color}cc` }}>The Sounding Line</p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.86rem', color: sounding.color, lineHeight: 1.15 }}>{sounding.label}</p>
              </div>
            </motion.div>
          )}

          {/* Push deeper — the gamble against the banked haul above. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 22 }}>
            <button onClick={pushOn} disabled={resolving} className="font-cinzel font-700 uppercase tracking-[0.05em] tap"
              style={{ width: '100%', padding: '1.05rem', borderRadius: 15, fontSize: '1.05rem', background: `${TEAL}1e`, border: `1px solid ${TEAL}77`, color: TEAL, cursor: resolving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              Risk It · Dive to Depth {nextDepth}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <p className="font-karla font-600" style={{ fontSize: '0.76rem', color: '#9a857a', marginTop: 3, lineHeight: 1.4 }}>
              Sink on the next dive and all <span style={{ color: '#d8a14a' }}>{fmt(previewDoubloons)} ⟡</span> goes down with you.
            </p>
          </div>
        </div>

        {detailModal}
        {exitModal}
      </>
    )
  }

  // ── Curse interstitial — the Locker imposes a permanent run modifier ────────
  if (phase === 'curse' && pendingCurse) {
    const c = pendingCurse
    const CRIM = '#ef4444'
    // For the "N curses upon you" tally: a brand-new curse adds one; a tier-2
    // deepening (isUpgrade) just intensifies one you already carry.
    const curseCount = Object.keys(curseTiers).length
    const curseTotalAfter = c.isUpgrade ? curseCount : curseCount + 1
    return (
      <>
        <AbyssBackdrop />
        {/* Crimson dread, bleeding up from the deep and breathing slowly. */}
        <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: [0.55, 0.9, 0.55] }} transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: `radial-gradient(ellipse 135% 95% at 50% 112%, ${CRIM}26 0%, ${CRIM}0d 40%, transparent 68%)` }} />
        <div style={{
          position: 'relative', zIndex: 1, maxWidth: 440, margin: '0 auto',
          padding: '12px 0.95rem', textAlign: 'center',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
        }}>
          <motion.p initial={{ opacity: 0, letterSpacing: '0.5em' }} animate={{ opacity: 1, letterSpacing: '0.34em' }} transition={{ duration: 0.9 }}
            className="font-karla font-800 uppercase" style={{ fontSize: '0.72rem', color: CRIM, marginTop: 16, textShadow: `0 0 18px ${CRIM}66` }}>
            {c.isUpgrade ? 'The Locker Tightens Its Grip' : 'The Locker Curses You'}
          </motion.p>

          {/* Skull sigil, sinking in from above like it's surfacing for you. */}
          <motion.div initial={{ opacity: 0, y: -32, scale: 0.7 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: 'relative', width: 150, height: 150, margin: '18px auto 8px' }}>
            <div style={{ position: 'absolute', inset: -24, borderRadius: '50%', background: `radial-gradient(circle, ${CRIM}3c 0%, transparent 64%)`, animation: 'gauntPulse 3s ease-in-out infinite' }} />
            <svg width="150" height="150" viewBox="0 0 24 24" fill={CRIM} style={{ position: 'relative', filter: `drop-shadow(0 8px 28px ${CRIM}66)` }} aria-hidden>
              <path d="M12 2a8 8 0 0 0-8 8c0 2.5 1.2 4.2 2.8 5.4.4.3.7.8.7 1.3V18a1.6 1.6 0 0 0 1.6 1.6h.4l.5-1.6h-1l-.4-1.4h1.6L11 18l.5 1.6h1L13 18l.4-1.4H15l-.4 1.4h-1l.5 1.6h.4A1.6 1.6 0 0 0 16.1 18v-1.3c0-.5.3-1 .7-1.3C18.4 14.2 20 12.5 20 10a8 8 0 0 0-8-8Z" />
              <circle cx="9" cy="10.5" r="1.7" fill="#0a0e16" />
              <circle cx="15" cy="10.5" r="1.7" fill="#0a0e16" />
            </svg>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 220, damping: 18 }}
            className="font-cinzel font-800" style={{ fontSize: '2.2rem', color: '#fdecec', lineHeight: 1.06, marginTop: 8, textShadow: `0 0 30px ${CRIM}55` }}>
            {c.name}{c.isUpgrade ? ' II' : ''}
          </motion.h1>
          {c.isUpgrade && (
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.56rem', color: `${CRIM}cc`, marginTop: 6 }}>
              The curse deepens
            </p>
          )}
          {/* What it does, plain and loud — the headline, not buried in flavor. */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 14, padding: '0.42rem 1rem', borderRadius: 999, background: `${CRIM}22`, border: `1px solid ${CRIM}66` }}>
            <span aria-hidden style={{ fontSize: '0.85rem', color: CRIM }}>▼</span>
            <span className="font-karla font-800" style={{ fontSize: '0.96rem', color: '#fca5a5' }}>{c.desc}</span>
          </div>
          <p className="font-karla" style={{ fontSize: '0.92rem', lineHeight: 1.55, color: 'rgba(253,236,236,0.78)', marginTop: 14, padding: '0 0.3rem' }}>
            {c.detail}
          </p>
          <p className="font-karla" style={{ fontSize: '0.86rem', lineHeight: 1.5, color: 'rgba(253,236,236,0.5)', fontStyle: 'italic', marginTop: 12, padding: '0 0.3rem' }}>
            {c.flavor}
          </p>
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: '#c98a8a', marginTop: 16 }}>
            It holds for the rest of the dive · {curseTotalAfter} {curseTotalAfter === 1 ? 'curse' : 'curses'} upon you
          </p>

          <button onClick={() => applyCurse(c)} className="font-cinzel font-800 uppercase tracking-[0.08em] tap"
            style={{
              marginTop: 22, width: '100%', padding: '1.1rem', borderRadius: 14, fontSize: '1.12rem',
              color: '#ffe0e0', background: `linear-gradient(180deg, ${CRIM}33, ${CRIM}10)`,
              border: `1px solid ${CRIM}77`, cursor: 'pointer',
              boxShadow: `0 0 28px ${CRIM}2e`,
            }}>
            Bear It · Descend
          </button>
          {curseRerollsLeft > 0 && (
            <button onClick={rerollCurse} className="font-karla font-700 uppercase tracking-[0.1em] tap"
              style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0.55rem 1.1rem', borderRadius: 999, fontSize: '0.64rem', color: '#fca5a5', background: `${CRIM}14`, border: `1px solid ${CRIM}55`, cursor: 'pointer' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
              Salt Ward · Reroll Curse · {curseRerollsLeft} left
            </button>
          )}
        </div>
        {exitModal}
      </>
    )
  }

  // ── Boon draft — claim one of three powers ──────────────────────────────────
  if (phase === 'boon' && pendingBoons) {
    const RELIEF = '#e7b667' // warm amber — distinct from the boon rarity palette
    return (
      <>
        <AbyssBackdrop />
        {/* Teal "treasure surfacing" wash — the whole screen should read as a reward. */}
        <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
          style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: `radial-gradient(ellipse 120% 66% at 50% 6%, ${TEAL}24 0%, ${TEAL}08 38%, transparent 64%)` }} />
        {/* Rare / Legendary fanfare — a burst + banner that stops the room when a
            good roll surfaces. Plays once on draft open (see the effect above). */}
        {boonFanfare && (() => {
          const isLeg = boonFanfare === 'legendary'
          const col = isLeg ? '#f5b94a' : '#8b9cff'
          return (
            <div key={boonFanfare} aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <motion.div initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: 3.2, opacity: 0 }} transition={{ duration: 0.9, ease: 'easeOut' }}
                style={{ position: 'absolute', width: 320, height: 320, borderRadius: '50%', background: `radial-gradient(circle, ${col}cc 0%, ${col}33 38%, transparent 70%)` }} />
              <motion.div initial={{ scale: 0.3, opacity: 0.85 }} animate={{ scale: 2.7, opacity: 0 }} transition={{ duration: 0.8, ease: 'easeOut' }}
                style={{ position: 'absolute', width: 210, height: 210, borderRadius: '50%', border: `2px solid ${col}`, boxShadow: `0 0 32px ${col}` }} />
              {isLeg && (
                <motion.div initial={{ scale: 0.4, opacity: 0.7 }} animate={{ scale: 4, opacity: 0 }} transition={{ duration: 1.1, delay: 0.12, ease: 'easeOut' }}
                  style={{ position: 'absolute', width: 160, height: 160, borderRadius: '50%', border: `1.5px solid ${col}aa` }} />
              )}
              <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1.1, 1, 1] }} transition={{ duration: 1.5, times: [0, 0.16, 0.78, 1], ease: 'easeOut' }}
                style={{ position: 'relative', textAlign: 'center' }}>
                <p className="font-cinzel font-800 uppercase" style={{ fontSize: '1.55rem', letterSpacing: '0.1em', color: col, textShadow: `0 0 30px ${col}, 0 0 12px ${col}` }}>
                  {isLeg ? 'Legendary' : 'Rare Find'}
                </p>
                <p className="font-karla font-700 uppercase tracking-[0.28em]" style={{ fontSize: '0.54rem', color: `${col}cc`, marginTop: 5 }}>
                  {isLeg ? 'surfaces from the deep' : 'breaks the surface'}
                </p>
              </motion.div>
            </div>
          )
        })()}
        <div style={{
          position: 'relative', zIndex: 1, maxWidth: 470, margin: '0 auto',
          padding: '12px 0.9rem', textAlign: 'center',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
        }}>
          <motion.p initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="font-karla font-800 uppercase" style={{ fontSize: '0.72rem', letterSpacing: '0.36em', color: TEAL, marginTop: 10, textShadow: `0 0 16px ${TEAL}66` }}>
            Plunder of the Deep
          </motion.p>
          <motion.h1 initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 17 }}
            className="font-cinzel font-800" style={{ fontSize: 'clamp(1.6rem, 8vw, 2.2rem)', whiteSpace: 'nowrap', color: '#eafffb', lineHeight: 1.04, marginTop: 9, textShadow: `0 0 32px ${TEAL}55` }}>
            Choose a Power
          </motion.h1>
          <p className="font-karla font-600" style={{ fontSize: '0.95rem', color: '#b6c7c2', marginTop: 9, marginBottom: 20, lineHeight: 1.4 }}>
            Three powers surface. One is yours for the rest of the dive.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {pendingBoons.map((b, idx) => {
              const rm = BOON_RARITY_META[b.rarity]
              const legendary = b.rarity === 'legendary'
              const rare = b.rarity === 'rare'
              const maxTier = GAUNTLET_BOONS.find(f => f.id === b.id)?.tiers.length ?? 3
              return (
                <motion.button
                  key={b.id}
                  initial={{ opacity: 0, y: 22, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.12 + idx * 0.13, type: 'spring', stiffness: 300, damping: 19 }}
                  whileTap={{ scale: 0.945 }}
                  whileHover={{ scale: 1.015 }}
                  onClick={() => applyBoon(b)}
                  className="tap"
                  style={{
                    position: 'relative', textAlign: 'left', overflow: 'hidden',
                    padding: '0.9rem 1rem 0.9rem 1.2rem', borderRadius: 16,
                    background: `linear-gradient(180deg, ${rm.color}28 0%, rgba(8,14,22,0.62) 74%)`,
                    border: `1.5px solid ${rm.color}${legendary ? 'dd' : rare ? '99' : '66'}`,
                    color: '#eef7f4', cursor: 'pointer',
                    boxShadow: legendary ? `0 0 40px ${rm.color}5a, inset 0 0 38px ${rm.color}1c`
                             : rare       ? `0 0 24px ${rm.color}36`
                             : `0 0 14px ${rm.color}20`,
                  }}
                >
                  {/* Rarity edge */}
                  <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, background: `linear-gradient(180deg, ${rm.color}, ${rm.color}33)`, boxShadow: `0 0 16px ${rm.color}` }} />
                  {/* Moving sheen on rare/legendary */}
                  {(legendary || rare) && (
                    <motion.span aria-hidden
                      initial={{ x: '-130%' }}
                      animate={{ x: '180%' }}
                      transition={{ duration: legendary ? 2.2 : 3, repeat: Infinity, repeatDelay: legendary ? 0.9 : 2.2, ease: 'easeInOut' }}
                      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '45%', background: `linear-gradient(100deg, transparent, ${rm.color}33, transparent)`, pointerEvents: 'none' }}
                    />
                  )}
                  {/* Breathing inner glow — a quiet "tap me" pulse (inset so the
                      card's overflow:hidden doesn't clip it). */}
                  <motion.span aria-hidden
                    animate={{ opacity: [0.25, 0.7, 0.25] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: idx * 0.3 }}
                    style={{ position: 'absolute', inset: 0, borderRadius: 16, boxShadow: `inset 0 0 20px ${rm.color}66`, pointerEvents: 'none' }}
                  />
                  {/* Row 1 — name + tier, rarity pill inline, learn-more */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p className="font-cinzel font-700" style={{ flex: 1, minWidth: 0, fontSize: '1.06rem', color: '#f4fbf9', lineHeight: 1.16 }}>
                      {b.name} <span style={{ color: rm.color }}>{boonTierLabel(b.tier)}</span>
                    </p>
                    <span className="font-karla font-800 uppercase" style={{ flexShrink: 0, fontSize: '0.52rem', letterSpacing: '0.13em', color: legendary ? '#1a1206' : rm.color, background: legendary ? rm.color : `${rm.color}26`, border: `1px solid ${rm.color}`, borderRadius: 999, padding: '0.2rem 0.55rem', boxShadow: legendary ? `0 0 12px ${rm.color}88` : 'none' }}>
                      {rm.label}
                    </span>
                    <span
                      role="button" tabIndex={0} aria-label={`What ${b.name} does`}
                      onClick={(e) => { e.stopPropagation(); setDetailEffect({ kind: 'boon', name: `${b.name} ${boonTierLabel(b.tier)}`, desc: b.desc, detail: b.detail, flavor: b.flavor, count: b.tier, maxTier }) }}
                      className="font-cinzel font-700 tap"
                      style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.22)', color: 'rgba(255,255,255,0.72)', cursor: 'pointer', fontSize: '0.82rem', fontStyle: 'italic', lineHeight: 1 }}>
                      i
                    </span>
                  </div>
                  {/* Row 2 — the power gained, green + clear (with the upgrade tag inline) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7, flexWrap: 'wrap' }}>
                    <span aria-hidden style={{ fontSize: '0.92rem', color: '#86efac', lineHeight: 1 }}>▲</span>
                    <span className="font-cinzel font-800" style={{ fontSize: '1.12rem', color: '#aef5c4', lineHeight: 1.1, textShadow: '0 0 14px rgba(74,222,128,0.4)' }}>
                      {b.desc}
                    </span>
                    {b.upgrade && (
                      <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.1em', color: '#f0d79a', background: 'rgba(217,176,102,0.18)', border: '1px solid rgba(217,176,102,0.55)', borderRadius: 999, padding: '0.16rem 0.45rem' }}>
                        ↑ Upgrade
                      </span>
                    )}
                  </div>
                  {/* Row 3 — flavor */}
                  <p className="font-karla" style={{ fontSize: '0.8rem', color: 'rgba(231,246,242,0.6)', lineHeight: 1.4, fontStyle: 'italic', marginTop: 6 }}>
                    {b.flavor}
                  </p>
                </motion.button>
              )
            })}

            {/* Reprieve — an optional one-time relief, taken INSTEAD of a boon.
                Surfaces in later rounds; the warm amber + "you forgo the draft"
                cue keep the trade clear. */}
            {pendingReprieve && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 2px' }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
                  <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.2em', color: '#8a8480' }}>or take a reprieve</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
                </div>
                <motion.button
                  initial={{ opacity: 0, y: 22, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.12 + pendingBoons.length * 0.13, type: 'spring', stiffness: 300, damping: 19 }}
                  whileTap={{ scale: 0.945 }}
                  whileHover={{ scale: 1.015 }}
                  onClick={() => applyReprieve(pendingReprieve)}
                  className="tap"
                  style={{
                    position: 'relative', textAlign: 'left', overflow: 'hidden',
                    padding: '0.9rem 1rem 0.9rem 1.2rem', borderRadius: 16,
                    background: `linear-gradient(180deg, ${RELIEF}26 0%, rgba(8,14,22,0.62) 74%)`,
                    border: `1.5px solid ${RELIEF}88`, color: '#f6efe2', cursor: 'pointer',
                    boxShadow: `0 0 20px ${RELIEF}2e`,
                  }}
                >
                  <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, background: `linear-gradient(180deg, ${RELIEF}, ${RELIEF}33)`, boxShadow: `0 0 16px ${RELIEF}` }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p className="font-cinzel font-700" style={{ flex: 1, minWidth: 0, fontSize: '1.06rem', color: '#f8f1e4', lineHeight: 1.16 }}>{pendingReprieve.name}</p>
                    <span className="font-karla font-800 uppercase" style={{ flexShrink: 0, fontSize: '0.52rem', letterSpacing: '0.13em', color: RELIEF, background: `${RELIEF}22`, border: `1px solid ${RELIEF}`, borderRadius: 999, padding: '0.2rem 0.55rem' }}>Reprieve</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7 }}>
                    <span aria-hidden style={{ fontSize: '0.92rem', color: RELIEF, lineHeight: 1 }}>✦</span>
                    <span className="font-cinzel font-800" style={{ fontSize: '1.12rem', color: '#f3d9a6', lineHeight: 1.1, textShadow: `0 0 14px ${RELIEF}55` }}>{pendingReprieve.desc}</span>
                  </div>
                  <p className="font-karla" style={{ fontSize: '0.8rem', color: 'rgba(246,239,226,0.6)', lineHeight: 1.4, fontStyle: 'italic', marginTop: 6 }}>{pendingReprieve.flavor}</p>
                  <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.1em', color: '#b89a6a', marginTop: 7 }}>You forgo the draft</p>
                </motion.button>
              </>
            )}
          </div>

          {/* Second Cast — reroll the offered boons (limited per draft). */}
          {rerollsLeft > 0 && (
            <button onClick={rerollBoons} className="font-karla font-700 uppercase tracking-[0.1em] tap"
              style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0.55rem 1.1rem', borderRadius: 999, fontSize: '0.64rem', color: TEAL, background: `${TEAL}14`, border: `1px solid ${TEAL}55`, cursor: 'pointer' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
              Reroll · {rerollsLeft} left
            </button>
          )}
        </div>
        {detailModal}
        {exitModal}
      </>
    )
  }

  // ── Descent transition ─────────────────────────────────────────────────────
  if (phase === 'descending') {
    const d = fight?.depth ?? 1
    const band = bandForDepth(d)
    const taunt = davyTaunt(d)
    return (
      <>
        <AbyssBackdrop />
        <div style={{
          position: 'relative', zIndex: 1, minHeight: '60vh',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: '2rem 1rem',
        }}>
          <motion.div initial={{ opacity: 0, y: -22, scale: 0.86 }} animate={{ opacity: 0.92, y: 0, scale: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MAW_IMG} alt="" loading="eager" decoding="async"
              style={{ width: 104, height: 104, objectFit: 'contain', filter: 'drop-shadow(0 8px 26px rgba(0,0,0,0.7))' }} />
          </motion.div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12, duration: 0.4 }}
            className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.34em', color: TEAL, marginTop: 16 }}>
            {d === 1 ? 'Into the Locker' : 'Deeper Still'}
          </motion.p>
          <motion.p initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.18, type: 'spring', stiffness: 230, damping: 18 }}
            className="font-cinzel font-800" style={{ fontSize: '2.4rem', color: GOLD, lineHeight: 1, marginTop: 8, textShadow: '0 0 28px rgba(240,192,64,0.4)' }}>
            Depth {d}
          </motion.p>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.45 }}
            className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#cfc9bf', marginTop: 7, letterSpacing: '0.02em' }}>
            {band.name}
          </motion.p>
          {taunt && (
            <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.5 }}
              className="font-karla" style={{ maxWidth: 320, fontSize: '0.78rem', fontStyle: 'italic', color: 'rgba(94,234,212,0.82)', lineHeight: 1.5, marginTop: 16 }}>
              &ldquo;{taunt}&rdquo;
              <span className="font-karla font-700 uppercase tracking-[0.16em]" style={{ display: 'block', fontSize: '0.5rem', color: 'rgba(94,234,212,0.5)', marginTop: 6 }}>Davy Jones</span>
            </motion.p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, marginTop: 18 }}>
            {[0, 1, 2].map(i => (
              <motion.svg key={i} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                initial={{ opacity: 0.12 }} animate={{ opacity: [0.12, 0.85, 0.12] }} transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.16 }}>
                <path d="M6 9l6 6 6-6" />
              </motion.svg>
            ))}
          </div>
        </div>
        {exitModal}
      </>
    )
  }

  // ── Fighting ──────────────────────────────────────────────────────────────
  if (phase === 'fighting' && fight) {
    // The deep presses in harder the further you fall — a cold gloom that creeps
    // into the edges of the fight as depth climbs (edge-only so the action stays
    // readable). Caps so it never blacks the stage out.
    const gloom = Math.min(0.46, Math.max(0, (fight.depth - 3) * 0.016))
    return (
      <div className="raid-combat-region flex flex-col items-center gap-2 select-none"
        style={{ position: 'relative', userSelect: 'none', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 48px)' }}>
        {gloom > 0.02 && (
          <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
            background: `radial-gradient(ellipse 116% 96% at 50% 44%, transparent 56%, rgba(3,9,18,${gloom}) 100%)` }} />
        )}
        <div style={{ width: '100%', flexShrink: 0, marginBottom: 2 }}>
          <DepthBar depth={fight.depth} pot={pot} isBoss={fight.isBoss} isElite={fight.isElite} affixName={fight.affix?.name} curses={Object.keys(curseTiers).length} />
        </div>
        <div style={{ width: '100%' }}>
          <RaidCombat
            key={`gauntlet-r${fight.depth}`}
            enemy={fight.enemy}
            atmosphere={atmosphereForDepth(fight.depth)}
            enemyArtFilter={DROWNED_FILTER}
            bonusChargeSlots={bonusSlots}
            anchorSaveAvailable={anchorSavesLeftRef.current > 0}
            onAnchorSave={() => { anchorSavesLeftRef.current = Math.max(0, anchorSavesLeftRef.current - 1) }}
            affix={fight.affix}
            isElite={fight.isElite}
            isBoss={fight.isBoss}
            shipImageUrl={props.shipImageUrl}
            shipFilter={shipFilter}
            shipName={props.shipName}
            playerLabel={props.username ?? props.shipName}
            playerCharacterColor={props.playerCharacterColor}
            playerEquippedHat={props.playerEquippedHat}
            playerAvatarBg={props.playerAvatarBg}
            playerAvatarBorder={props.playerAvatarBorder}
            playerHpMax={hpMax}
            playerHp={playerHP}
            shipMinDamage={props.shipMinDamage}
            shipSpeed={props.shipSpeed}
            totalPower={props.totalPower}
            totalNavigation={props.totalDodge}
            totalFortune={props.totalFortune}
            equippedRaidItems={props.equippedItems}
            classDamageMult={props.classDamageMult}
            shipClasses={props.shipClasses}
            equippedRepairKit={props.equippedRepairKit}
            onEnemyDefeated={handleEnemyDefeated}
            initialCharges={carriedChargesRef.current}
            onPlayerDefeated={handlePlayerDefeated}
            onPlayerHit={(d) => { if (d > runMaxHitRef.current) { runMaxHitRef.current = d; recordGauntletHit(d).catch(() => {}) } }}
            onLeave={() => setConfirmLeave(true)}
            raidMods={runRaidMods}
            tideEffects={[...boonEffects(boonTiers), ...curseEffects(curseTiers)]}
            crewMembers={props.crewMembers}
            usedAbilityIds={usedAbilityIds}
            megaAugment={props.manowarAugment}
            abilitiesRefreshed={fightOpensRefreshed}
            onAbilityFired={(crewId) => setUsedAbilityIds(prev => {
              if (prev.has(crewId)) return prev
              const next = new Set(prev); next.add(crewId); return next
            })}
            usedAbilitySub="Used — back soon."
            openingNote={rollStateRef.current.prevWasBoss ? 'Your crew catch their breath. Abilities refreshed.' : undefined}
          />
        </div>
        {exitModal}
      </div>
    )
  }

  return null
}

// ── Cash-out chest reveal ─────────────────────────────────────────────────────
// Hauling up is the payoff of the whole push-your-luck loop, so it gets a real
// chest-opening moment: the depth-tiered crate sits closed, you tap to crack it,
// a burst of light + haptic + SFX fires, and the haul counts up out of it.
type RewardOk = Extract<CashResult, { ok: true }>

// One chest sprite for the whole Locker (Davy's chest); the tiers are told
// apart by the reveal EFFECTS, not the art — `color` tints the glow/rays and
// the tier number drives how big the burst gets (see ChestOpenFx).
const DAVY_CHEST = { closed: '/davychestclosed.png', open: '/davychestopen.png' }
const CHEST_ART: Record<number, { closed: string; open: string; color: string }> = {
  1: { ...DAVY_CHEST, color: '#c08a4e' },
  2: { ...DAVY_CHEST, color: '#9fb0bf' },
  3: { ...DAVY_CHEST, color: '#f0c040' },
  4: { ...DAVY_CHEST, color: '#7fdce8' },
  5: { ...DAVY_CHEST, color: '#a78bfa' },
}

// rAF count-up for the reward numbers (easeOutCubic). Holds at 0 until `run`
// flips true, so the chest can reveal first and THEN the numbers tick up.
function CountUp({ to, dur = 850, run = true }: { to: number; dur?: number; run?: boolean }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!run || to <= 0) { setN(0); return }
    let raf = 0, start = 0
    const tick = (t: number) => {
      if (!start) start = t
      const p = Math.min(1, (t - start) / dur)
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, dur, run])
  return <>{n.toLocaleString()}</>
}

function RewardLine({ label, to, suffix = '', color, delay, run }: { label: string; to: number; suffix?: string; color: string; delay: number; run: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.35 }}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0.45rem 0.3rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.56rem', color: '#9a948a' }}>{label}</span>
      <span className="font-cinzel font-800" style={{ fontSize: '1.2rem', color }}>+<CountUp to={to} run={run} />{suffix}</span>
    </motion.div>
  )
}

// Tier-scaled chest-open effect. Same chest sprite at every tier; the richer
// chests open louder — more mote spray, rotating light rays from tier 2, and a
// second shock ring from tier 4. Deterministic (no random) so it reads the same
// every haul. Sits absolutely inside the 200x200 chest box.
function ChestOpenFx({ tier, color }: { tier: number; color: string }) {
  const count = tier * 4
  const motes = Array.from({ length: count }, (_, n) => {
    const ang = (Math.PI * 2 * n) / count + (n % 2) * 0.32
    const dist = 64 + (n % 4) * 18
    return { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, size: 3 + (n % 3), dur: 0.6 + (n % 4) * 0.1, delay: (n % 3) * 0.04 }
  })
  return (
    <>
      {/* Rotating rays — appear from tier 2, brighter/denser up the ladder */}
      {tier >= 2 && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.5, rotate: 0 }}
          animate={{ opacity: [0, Math.min(0.7, 0.32 + tier * 0.09), 0], scale: 1.5, rotate: 80 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          style={{
            position: 'absolute', inset: -34, borderRadius: '50%', pointerEvents: 'none', mixBlendMode: 'screen',
            background: `conic-gradient(from 0deg, ${color}00, ${color}66, ${color}00, ${color}66, ${color}00, ${color}66, ${color}00${tier >= 4 ? `, ${color}66, ${color}00, ${color}66, ${color}00` : ''})`,
          }}
        />
      )}
      {/* Mote spray — count scales with tier */}
      {motes.map((m, n) => (
        <motion.div
          key={n}
          aria-hidden
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: m.x, y: m.y, opacity: 0, scale: 0.3 }}
          transition={{ duration: m.dur, delay: m.delay, ease: 'easeOut' }}
          style={{ position: 'absolute', left: '50%', top: '50%', width: m.size, height: m.size, marginLeft: -m.size / 2, marginTop: -m.size / 2, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}`, pointerEvents: 'none' }}
        />
      ))}
      {/* Second shock ring — only the richest chests (tier 4-5) */}
      {tier >= 4 && (
        <motion.div
          aria-hidden
          initial={{ scale: 0.3, opacity: 0.85 }}
          animate={{ scale: 2.7, opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.12, ease: 'easeOut' }}
          style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${color}`, boxShadow: `0 0 24px ${color}`, pointerEvents: 'none' }}
        />
      )}
    </>
  )
}

// How long the chest "reveals" before the haul starts ticking into your purse.
const REVEAL_DELAY = 900
// The wind-up beat before the lid bursts — chest rattles + creaks, glow builds.
const ANTICIPATION_MS = 750

function GauntletReward({ r, recap, onBack }: { r: RewardOk; recap: { shipsSunk: number; maxHit: number; boonTiers: Record<string, number>; curseTiers: Record<string, number> }; onBack: () => void }) {
  // Three beats: closed -> opening (a wind-up rattle + creak) -> open (burst +
  // reveal). The anticipation phase makes the crack land as a payoff.
  const [opening, setOpening] = useState(false)
  const [opened, setOpened] = useState(false)
  // Counting starts a beat AFTER opening: chest cracks + reveals, then the
  // doubloons / XP increment (count-up + purse tick + bar fill).
  const [counting, setCounting] = useState(false)
  const art = CHEST_ART[r.chest.tier] ?? CHEST_ART[1]
  const newBest = r.depth >= r.deepest

  // Nav level + XP bar — the banked XP visibly flows into the bar as the chest
  // opens. Old XP is derived (new total minus this haul's gain).
  const oldXp = Math.max(0, r.newExpeditionXP - r.bankedXp)
  const oldProg = getXPProgress(oldXp)
  const newProg = getXPProgress(r.newExpeditionXP)
  const leveledUp = newProg.level > oldProg.level
  const barEnd = newProg.level >= MAX_LEVEL ? 1 : newProg.progress
  // Bar fill: before counting it sits at the pre-haul progress. On counting it
  // sweeps forward; on a level-up it fills the old level to full, snaps to
  // empty, then fills into the new level (so it never visually runs backwards).
  const barAnimate = !counting
    ? { width: `${Math.round(oldProg.progress * 100)}%` }
    : leveledUp
      ? { width: [`${Math.round(oldProg.progress * 100)}%`, '100%', '0%', `${Math.round(barEnd * 100)}%`] }
      : { width: `${Math.round(barEnd * 100)}%` }
  const barTransition = counting && leveledUp
    ? { duration: 1.7, times: [0, 0.4, 0.42, 1], ease: 'easeOut' as const }
    : { duration: 1, ease: 'easeOut' as const }

  function open() {
    if (opening || opened) return
    const grand = r.chest.tier >= 4    // the richest chests open louder
    // Beat 1 — the wind-up: a building rattle + wooden creak while the lid strains.
    setOpening(true)
    vibrate([0, 10, 28, 14, 34, 18])
    import('@/lib/fishingMusic').then(m => m.playChestCreakSfx()).catch(() => {})
    window.setTimeout(() => {
      // Beat 2 — the crack: burst, open art, the reward sting.
      setOpened(true)
      vibrate(grand ? [0, 40, 35, 70, 35, 95] : [0, 30, 55, 45])
      import('@/lib/fishingMusic').then(m => m.playChestSfx(grand)).catch(() => {})
      // Beat 3 — let the chest reveal first, THEN start everything incrementing:
      // the count-ups, the purse tick (the Nav listens), and the XP bar.
      window.setTimeout(() => {
        setCounting(true)
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.newDoubloons }))
        if (r.gems > 0) window.dispatchEvent(new CustomEvent('gems-changed', { detail: r.newGems }))
        // A second haptic punch when the bar reaches the new level.
        if (leveledUp) window.setTimeout(() => vibrate([0, 45, 70, 45]), 1000)
      }, REVEAL_DELAY)
    }, ANTICIPATION_MS)
  }

  return (
    <>
      <AbyssBackdrop />
      <div style={{
        position: 'relative', zIndex: 1, maxWidth: 440, margin: '0 auto',
        padding: '10px 0.95rem', textAlign: 'center',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
      }}>
        {!opened ? (
          <>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.3em', color: TEAL, marginTop: 16 }}>
              You Climbed Back Into the Light
            </p>
            <div style={{ position: 'relative', width: 200, height: 200, margin: '20px auto 6px' }}>
              <div style={{ position: 'absolute', inset: -10, borderRadius: '50%', background: `radial-gradient(circle, ${art.color}33 0%, transparent 68%)`, animation: 'gauntPulse 3.6s ease-in-out infinite' }} />
              {/* Building glow as the lid strains in the wind-up beat. */}
              {opening && (
                <motion.div aria-hidden initial={{ opacity: 0, scale: 0.75 }} animate={{ opacity: [0, 0.95], scale: [0.75, 1.45] }} transition={{ duration: ANTICIPATION_MS / 1000, ease: 'easeIn' }}
                  style={{ position: 'absolute', inset: -22, borderRadius: '50%', background: `radial-gradient(circle, ${art.color}77 0%, transparent 70%)`, pointerEvents: 'none' }} />
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <motion.img src={art.closed} alt="" loading="eager" decoding="async"
                animate={opening
                  ? { x: [0, -4, 4, -4, 4, -3, 3, -2, 2, 0], rotate: [0, -2, 2, -2, 2, -1.5, 1.5, 0], scale: [1, 1.05, 1.04, 1.08, 1.12] }
                  : { y: [0, -6, 0] }}
                transition={opening
                  ? { duration: ANTICIPATION_MS / 1000, ease: 'easeInOut' }
                  : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: `drop-shadow(0 8px 22px rgba(0,0,0,0.6)) drop-shadow(0 0 26px ${art.color}44)` }} />
            </div>
            <p className="font-cinzel font-800" style={{ fontSize: '1.35rem', color: art.color, lineHeight: 1.1, marginTop: 4, textShadow: `0 0 22px ${art.color}44` }}>
              {r.chest.label}
            </p>
            <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#9a948a', marginTop: 5 }}>
              Hauled up from depth {r.depth}{r.chest.potMult > 1 ? ` · ×${r.chest.potMult} haul` : ''}
            </p>
            <button onClick={open} disabled={opening} className="font-cinzel font-800 uppercase tracking-[0.08em] tap"
              style={{ marginTop: 24, width: '100%', padding: '1.05rem', borderRadius: 14, fontSize: '1.05rem', color: GOLD, background: `linear-gradient(180deg, ${GOLD}26, ${GOLD}0f)`, border: `1px solid ${GOLD}66`, cursor: opening ? 'default' : 'pointer', opacity: opening ? 0.55 : 1, boxShadow: `0 0 20px ${GOLD}1f` }}>
              {opening ? 'Prising It Open…' : 'Crack It Open'}
            </button>
          </>
        ) : (
          <>
            <div style={{ position: 'relative', width: 200, height: 200, margin: '16px auto 4px' }}>
              {/* Burst of light on open — bigger for the richer chests */}
              <motion.div aria-hidden initial={{ scale: 0.2, opacity: 0.85 }} animate={{ scale: 2.4 + r.chest.tier * 0.4, opacity: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }}
                style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle, ${art.color}cc 0%, ${art.color}33 35%, transparent 70%)` }} />
              <div style={{ position: 'absolute', inset: -10, borderRadius: '50%', background: `radial-gradient(circle, ${art.color}33 0%, transparent 68%)`, animation: 'gauntPulse 3.6s ease-in-out infinite' }} />
              {/* Tier-scaled spray / rays / shock ring */}
              <ChestOpenFx tier={r.chest.tier} color={art.color} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <motion.img src={art.open} alt="" loading="eager" decoding="async"
                initial={{ scale: 0.55 }} animate={{ scale: [0.55, 1.16, 1] }} transition={{ duration: 0.5, ease: 'easeOut' }}
                style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: `drop-shadow(0 8px 22px rgba(0,0,0,0.6)) drop-shadow(0 0 30px ${art.color}66)` }} />
            </div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
              className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.32em', color: TEAL }}>
              Hauled Up
            </motion.p>
            <motion.p initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.18, type: 'spring', stiffness: 240, damping: 18 }}
              className="font-cinzel font-800" style={{ fontSize: '1.4rem', color: art.color, lineHeight: 1.1, marginTop: 4, textShadow: `0 0 22px ${art.color}44` }}>
              {r.chest.label}
            </motion.p>

            <div style={{ marginTop: 16, textAlign: 'left', background: 'rgba(0,0,0,0.3)', border: `1px solid ${GOLD}26`, borderRadius: 14, padding: '0.5rem 0.85rem 0.7rem' }}>
              <RewardLine label="Doubloons" to={r.bankedDoubloons} suffix=" ⟡" color={GOLD} delay={0.2} run={counting} />
              <RewardLine label="Nav XP" to={r.bankedXp} color="#4ade80" delay={0.32} run={counting} />
              {r.gems > 0 && <RewardLine label="Gems" to={r.gems} suffix=" ◆" color="#a78bfa" delay={0.44} run={counting} />}
              {r.earnedFathoms > 0 && <RewardLine label="Fathoms" to={r.earnedFathoms} suffix=" Fathoms" color={TEAL} delay={0.56} run={counting} />}
            </div>

            {/* Nav level + XP bar — the banked Nav XP flows into the bar as the
                chest opens, and the level pops if you crossed one. */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.35 }}
              style={{ marginTop: 14, textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
                <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.52rem', color: '#7fa8d8' }}>Navigation</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                  {leveledUp && counting && (
                    <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.85, type: 'spring', stiffness: 320, damping: 16 }}
                      className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.5rem', color: '#cfe2ff', background: 'rgba(96,165,250,0.2)', border: '1px solid rgba(96,165,250,0.55)', borderRadius: 999, padding: '0.12rem 0.45rem', boxShadow: '0 0 12px rgba(96,165,250,0.35)' }}>
                      Level Up · {oldProg.level} → {newProg.level}
                    </motion.span>
                  )}
                  <span className="font-cinzel font-800" style={{ fontSize: '0.85rem', color: '#cfe2ff' }}>Lv {counting ? newProg.level : oldProg.level}</span>
                </div>
              </div>
              <div style={{ height: 9, borderRadius: 5, background: 'rgba(0,0,0,0.5)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
                <motion.div initial={{ width: `${Math.round(oldProg.progress * 100)}%` }} animate={barAnimate} transition={barTransition}
                  style={{ height: '100%', background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', boxShadow: '0 0 8px rgba(96,165,250,0.7)' }} />
              </div>
              <p className="font-karla" style={{ fontSize: '0.56rem', color: '#7a766e', marginTop: 4 }}>
                {newProg.level >= MAX_LEVEL ? 'Max level' : counting ? `${Math.round(newProg.progress * 100)}% to Lv ${newProg.level + 1}` : `${Math.round(oldProg.progress * 100)}% to Lv ${oldProg.level + 1}`}
              </p>
            </motion.div>

            {newBest && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: TEAL, marginTop: 12 }}>
                New deepest descent — depth {r.depth}.
              </motion.p>
            )}

            {/* Davy cannon chest drops — the rare chase. */}
            {r.droppedItems.map((id, i) => {
              const item = getRaidItem(id)
              if (!item) return null
              return (
                <motion.div key={id} initial={{ opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.7 + i * 0.15, type: 'spring', stiffness: 260, damping: 18 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 10, padding: '0.7rem 0.8rem', borderRadius: 12, background: 'rgba(232,200,121,0.10)', border: '1px solid rgba(232,200,121,0.55)', boxShadow: '0 0 22px rgba(232,200,121,0.18)' }}>
                  {item.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={item.image} alt="" style={{ width: 42, height: 42, objectFit: 'contain', flexShrink: 0 }} />
                    : null}
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#e8c879' }}>Rare drop · equip from Manage Ship</p>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f5ecd6', lineHeight: 1.1 }}>{item.name}</p>
                    <p className="font-karla" style={{ fontSize: '0.66rem', color: '#b0aaa0', lineHeight: 1.35, marginTop: 1 }}>{item.description}</p>
                  </div>
                </motion.div>
              )
            })}

            {/* Depth-milestone unlocks earned by SURVIVING to this depth. Shown
                here, in the moment, instead of a piece of mail after the fact. */}
            {r.unlockedThisRun.map((u, i) => (
              <motion.div key={u.name} initial={{ opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.7 + i * 0.15, type: 'spring', stiffness: 260, damping: 18 }}
                style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 10, padding: '0.7rem 0.8rem', borderRadius: 12, background: `${TEAL}12`, border: `1px solid ${TEAL}55`, boxShadow: `0 0 22px ${TEAL}1c` }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M7 11V7a5 5 0 0 1 10 0v4" /><rect x="3" y="11" width="18" height="11" rx="2" /></svg>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: TEAL }}>Depth unlocked · {u.where}</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#eaf5f2', lineHeight: 1.1 }}>{u.name}</p>
                  <p className="font-karla" style={{ fontSize: '0.66rem', color: '#a8b6b2', lineHeight: 1.35, marginTop: 1 }}>{u.blurb}</p>
                </div>
              </motion.div>
            ))}

            {counting && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.4 }}>
                <RunRecap depth={r.depth} shipsSunk={recap.shipsSunk} maxHit={recap.maxHit} boonTiers={recap.boonTiers} curseTiers={recap.curseTiers} />
              </motion.div>
            )}

            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
              onClick={onBack} className="font-karla font-600 tap"
              style={{ marginTop: 18, width: '100%', padding: '0.85rem', borderRadius: 12, fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: '#cfc9bf', cursor: 'pointer' }}>
              Back to the map
            </motion.button>
          </>
        )}
      </div>
    </>
  )
}

// ── Modal scrim ───────────────────────────────────────────────────────────────
// One backdrop for the popup modals. PORTALED to <body> so it escapes any
// transformed ancestor (PageTransition / Nav) — otherwise `position: fixed`
// anchors to that ancestor instead of the viewport and the overflow scroll
// can't reach the bottom (see [[feedback-transform-breaks-fixed-positioning]]).
// Centers content when it fits and scrolls from the top when it's taller than
// the screen (the min-height wrapper sidesteps the flexbox centered-overflow
// clip). Respects iOS safe areas + momentum scroll. Click the scrim to close.
function ModalScrim({ zIndex, onClose, bg = 'rgba(2,6,12,0.85)', blur = 'blur(4px)', children }: {
  zIndex: number; onClose: () => void; bg?: string; blur?: string; children: React.ReactNode
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex, background: bg, backdropFilter: blur, WebkitBackdropFilter: blur, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem', paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}>
        {children}
      </div>
    </div>,
    document.body,
  )
}

// ── Abandon-run confirm ───────────────────────────────────────────────────────
// The mid-fight ← is one mis-tap from wiping a whole descent. Make the player
// say so out loud, and spell out exactly what sinks with the ship.
function AbandonRunModal({ pot, onStay, onAbandon }: { pot: number; onStay: () => void; onAbandon: () => void }) {
  const CRIMSON = '#ef4444'
  return (
    <ModalScrim zIndex={1400} onClose={onStay}>
      <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 280, damping: 24 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 380, borderRadius: 18, background: 'linear-gradient(180deg, rgba(22,12,14,0.99), rgba(10,7,9,0.99))', border: `1px solid ${CRIMSON}44`, boxShadow: `0 0 44px ${CRIMSON}22, 0 18px 50px rgba(0,0,0,0.6)`, padding: '1.3rem 1.2rem 1.15rem', textAlign: 'center' }}>
        <p className="font-karla font-700 uppercase tracking-[0.24em]" style={{ fontSize: '0.52rem', color: `${CRIMSON}cc` }}>Abandon the Dive?</p>
        <p className="font-cinzel font-800" style={{ fontSize: '1.45rem', color: '#f3d6d6', lineHeight: 1.12, marginTop: 6 }}>
          Leave Now and You Sink
        </p>
        <p className="font-karla" style={{ fontSize: '0.82rem', color: '#c9c3b8', lineHeight: 1.5, marginTop: 10 }}>
          {pot > 0
            ? <>Walk away from this run and the <strong style={{ color: '#e08a8a' }}>{fmt(pot)} ⟡</strong> you&apos;ve hauled up, along with the Nav XP and any depth unlocks, goes down with the ship. Nothing is banked until you cash out.</>
            : <>Walk away now and this descent is over for the day. Your one run is spent — there&apos;s no picking it back up.</>}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 18 }}>
          <button onClick={onStay} className="font-cinzel font-700 uppercase tracking-[0.07em] tap"
            style={{ width: '100%', padding: '0.85rem', borderRadius: 12, fontSize: '0.92rem', background: 'rgba(94,234,212,0.16)', border: `1px solid ${TEAL}55`, color: TEAL, cursor: 'pointer' }}>
            Stay in the Fight
          </button>
          <button onClick={onAbandon} className="font-karla font-700 tap"
            style={{ width: '100%', padding: '0.6rem', borderRadius: 11, fontSize: '0.74rem', background: 'none', border: `1px solid ${CRIMSON}40`, color: `${CRIMSON}dd`, cursor: 'pointer' }}>
            Abandon and lose it all
          </button>
        </div>
      </motion.div>
    </ModalScrim>
  )
}

// ── End-of-dive recap ─────────────────────────────────────────────────────────
// A scannable "what happened this dive" panel — the run's headline stats + the
// build you carried (boon + curse chips). Shared by the death + cash-out screens
// so every dive ends on a satisfying summary, win or lose.
function RunRecap({ depth, shipsSunk, maxHit, boonTiers, curseTiers }: {
  depth: number; shipsSunk: number; maxHit: number
  boonTiers: Record<string, number>; curseTiers: Record<string, number>
}) {
  const boons = Object.entries(boonTiers)
    .map(([id, tier]) => ({ fam: GAUNTLET_BOONS.find(b => b.id === id), tier }))
    .filter((x): x is { fam: NonNullable<typeof x.fam>; tier: number } => !!x.fam && x.tier >= 1)
  const curses = Object.entries(curseTiers)
    .map(([id, tier]) => ({ c: GAUNTLET_CURSES.find(c => c.id === id), tier }))
    .filter((x): x is { c: NonNullable<typeof x.c>; tier: number } => !!x.c && x.tier >= 1)
  const Stat = ({ label, value, color }: { label: string; value: string | number; color: string }) => (
    <div style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '0.62rem 0.35rem', borderRadius: 12, background: 'rgba(125,211,252,0.05)', border: '1px solid rgba(125,211,252,0.16)', textAlign: 'center', overflow: 'hidden' }}>
      <p className="font-cinzel font-800" style={{ fontSize: 'clamp(0.95rem, 4.4vw, 1.22rem)', color, lineHeight: 1, textShadow: `0 0 16px ${color}33`, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#84939f', marginTop: 5 }}>{label}</p>
    </div>
  )
  const Chips = ({ title, color, items }: { title: string; color: string; items: { key: string; label: string; rc: string }[] }) => (
    <div style={{ marginTop: 14, textAlign: 'left' }}>
      <p className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.54rem', color, marginBottom: 7 }}>{title}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map(it => (
          <span key={it.key} className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#eef6f4', padding: '0.28rem 0.62rem', borderRadius: 999, background: `${it.rc}1a`, border: `1px solid ${it.rc}4d`, maxWidth: '100%', overflowWrap: 'anywhere' }}>
            {it.label}
          </span>
        ))}
      </div>
    </div>
  )
  return (
    <div style={{ marginTop: 18, maxWidth: '100%' }}>
      <p className="font-karla font-800 uppercase tracking-[0.22em]" style={{ fontSize: '0.52rem', color: '#7e96a8', marginBottom: 9, textAlign: 'center' }}>The Dive</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <Stat label="Depth" value={depth} color={TEAL} />
        <Stat label="Ships Sunk" value={shipsSunk} color="#f4fbf9" />
        <Stat label="Biggest Hit" value={fmt(maxHit)} color={GOLD} />
      </div>
      {boons.length > 0 && (
        <Chips title={`Powers · ${boons.length}`} color={TEAL}
          items={boons.map(({ fam, tier }) => ({ key: fam.id, label: `${fam.name} ${boonTierLabel(tier)}`.trim(), rc: BOON_RARITY_META[boonRarity(fam)].color }))} />
      )}
      {curses.length > 0 && (
        <Chips title={`Curses · ${curses.length}`} color="#f87171"
          items={curses.map(({ c, tier }) => ({ key: c.id, label: `${c.name}${curseTierLabel(tier) ? ` ${curseTierLabel(tier)}` : ''}`, rc: '#f87171' }))} />
      )}
    </div>
  )
}

// ── Haul modal ────────────────────────────────────────────────────────────────
// ── Deepest-run recap ─────────────────────────────────────────────────────────
// Tapping the "Deepest Descent" chip opens this: the boons, curses, and tides
// the player carried on their record dive, resolved from the stored id→tier
// snapshot against the live boon/curse tables.
function DeepestRunModal({ run, onClose }: { run: GauntletRunSnapshot; onClose: () => void }) {
  const boons = Object.entries(run.boons ?? {})
    .map(([id, tier]) => ({ fam: GAUNTLET_BOONS.find(b => b.id === id), tier }))
    .filter((x): x is { fam: NonNullable<typeof x.fam>; tier: number } => !!x.fam && x.tier >= 1)
  const curses = Object.entries(run.curses ?? {})
    .map(([id, tier]) => ({ c: GAUNTLET_CURSES.find(c => c.id === id), tier }))
    .filter((x): x is { c: NonNullable<typeof x.c>; tier: number } => !!x.c && x.tier >= 1)
  const tides = (run.tides ?? []).filter(t => t && t.title)

  const Section = ({ title, color, children }: { title: string; color: string; children: React.ReactNode }) => (
    <div style={{ marginTop: 16, textAlign: 'left' }}>
      <p className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.6rem', color, marginBottom: 7 }}>{title}</p>
      {children}
    </div>
  )

  return (
    <ModalScrim zIndex={1300} onClose={onClose}>
      <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 440, borderRadius: 18, background: 'linear-gradient(180deg, rgba(14,22,34,0.99), rgba(7,13,22,0.99))', border: `1px solid ${GOLD}3a`, boxShadow: `0 0 44px ${GOLD}1f, 0 18px 50px rgba(0,0,0,0.6)`, padding: '1.3rem 1.15rem 1.1rem', textAlign: 'center' }}>
        <p className="font-karla font-800 uppercase tracking-[0.24em]" style={{ fontSize: '0.54rem', color: `${GOLD}cc` }}>Your Deepest Dive</p>
        <p className="font-cinzel font-800" style={{ fontSize: '1.9rem', color: GOLD, lineHeight: 1.05, marginTop: 5, textShadow: `0 0 24px ${GOLD}33` }}>
          Depth {run.depth}
        </p>

        {boons.length > 0 && (
          <Section title={`Powers · ${boons.length}`} color={TEAL}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {boons.map(({ fam, tier }) => {
                const t = fam.tiers[Math.min(tier, fam.tiers.length) - 1]
                const rc = BOON_RARITY_META[boonRarity(fam)].color
                return (
                  <div key={fam.id} style={{ padding: '0.55rem 0.7rem', borderRadius: 11, background: `${rc}14`, border: `1px solid ${rc}40` }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.86rem', color: '#f4fbf9', lineHeight: 1.2 }}>{fam.name} <span style={{ color: rc }}>{boonTierLabel(tier)}</span></p>
                    <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#8fb6ad', marginTop: 2 }}>{t?.desc}</p>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {curses.length > 0 && (
          <Section title={`Curses · ${curses.length}`} color="#f87171">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {curses.map(({ c, tier }) => {
                const t = c.tiers[Math.min(tier, c.tiers.length) - 1]
                const label = curseTierLabel(tier)
                return (
                  <div key={c.id} style={{ padding: '0.55rem 0.7rem', borderRadius: 11, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.34)' }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.86rem', color: '#fdecec', lineHeight: 1.2 }}>{c.name}{label ? ` ${label}` : ''}</p>
                    <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#d99', marginTop: 2 }}>{t?.desc}</p>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {tides.length > 0 && (
          <Section title={`Tides · ${tides.length}`} color="#bae6fd">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {tides.map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '0.42rem 0.65rem', borderRadius: 9, background: 'rgba(125,211,252,0.08)', border: '1px solid rgba(125,211,252,0.22)' }}>
                  <span className="font-karla font-700" style={{ fontSize: '0.74rem', color: '#cbe9f8' }}>{t.title}</span>
                  <span className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#8fb6c8', textAlign: 'right' }}>{t.choice}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {boons.length === 0 && curses.length === 0 && tides.length === 0 && (
          <p className="font-karla" style={{ fontSize: '0.82rem', color: '#8a8480', marginTop: 16, lineHeight: 1.5 }}>
            No powers, curses, or tides were logged on that dive.
          </p>
        )}

        <button onClick={onClose} className="font-karla font-700 uppercase tracking-[0.1em] tap"
          style={{ marginTop: 18, width: '100%', padding: '0.8rem', borderRadius: 12, fontSize: '0.74rem', background: `${GOLD}18`, border: `1px solid ${GOLD}55`, color: '#f5d98a', cursor: 'pointer' }}>
          Close
        </button>
      </motion.div>
    </ModalScrim>
  )
}

// "What's down there" — a popup on the intro so a player can see the chest
// ladder, a rough doubloon/XP estimate for their reach, and the named-item chase
// BEFORE committing a descent (and burning the cooldown).
function HaulModal({ onClose }: { onClose: () => void }) {
  const cannons = ['davys_heavy_cannon', 'davys_hand_cannon']
    .map(getRaidItem)
    .filter((it): it is NonNullable<ReturnType<typeof getRaidItem>> => !!it)
  const shallowOdds = Math.round(chestCannonDropChance(1) * 1000) / 10
  const deepOdds = Math.round(chestCannonDropChance(5) * 100)

  return (
    <ModalScrim zIndex={1300} onClose={onClose}>
      <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 440, borderRadius: 18, background: 'linear-gradient(180deg, rgba(14,22,34,0.99), rgba(7,13,22,0.99))', border: `1px solid ${TEAL}3a`, boxShadow: `0 0 44px ${TEAL}1f, 0 18px 50px rgba(0,0,0,0.6)`, padding: '1.2rem 1.1rem 1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.24em]" style={{ fontSize: '0.52rem', color: `${TEAL}cc` }}>What&apos;s Down There</p>
            <p className="font-cinzel font-800" style={{ fontSize: '1.35rem', color: '#eafffb', lineHeight: 1.1, marginTop: 3 }}>The Haul</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', padding: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div style={{ marginTop: 12, textAlign: 'left' }}>
              {/* Plain-English intro — the whole loop in one breath. */}
              <p className="font-karla" style={{ fontSize: '0.76rem', color: '#b8b2a6', lineHeight: 1.5 }}>
                Every ship you sink grows <span style={{ color: GOLD, fontWeight: 700 }}>one pot</span>. Cash out at any depth to bank it as doubloons, plus the same amount in Nav XP. The deeper you go, the bigger it gets — but sink first and you lose the lot.
              </p>

              {/* Fathoms — the always-earned half, distinct from the gambled pot. */}
              <div style={{ marginTop: 11, padding: '0.6rem 0.7rem', borderRadius: 10, background: `${TEAL}0c`, border: `1px solid ${TEAL}30` }}>
                <p className="font-karla" style={{ fontSize: '0.72rem', color: '#b8b2a6', lineHeight: 1.5 }}>
                  Every dive also pays <span style={{ color: TEAL, fontWeight: 700 }}>Fathoms</span>, one for each enemy ship you sink, <span style={{ color: TEAL, fontWeight: 700 }}>kept even if you go down</span>. Spend them in the Locker&apos;s two shops on permanent upgrades.
                </p>
              </div>

              {/* The cash-out chest ladder. Keyed to SHIPS SUNK (= the chest
                  tier's minDepth threshold), which is what actually drives the
                  reward — so it stays accurate even with Veteran's Start, where
                  combat depth runs ahead of ships sunk. The chest multiplies the
                  pot you've built; richer tiers also drop gems. */}
              <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#8a8480', marginTop: 15, marginBottom: 3 }}>The cash-out chest</p>
              <p className="font-karla" style={{ fontSize: '0.68rem', color: '#9a948a', lineHeight: 1.45, marginBottom: 7 }}>
                The more ships you sink, the richer the chest that multiplies your pot.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {CHEST_TIERS.map(c => (
                  <div key={c.tier} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0.46rem 0.6rem', borderRadius: 9, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                      <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.06em', color: '#7a766e', flexShrink: 0, width: 56, whiteSpace: 'nowrap' }}>{c.minDepth === 0 ? 'From start' : `Sink ${c.minDepth}`}</span>
                      <span className="font-cinzel font-700" style={{ fontSize: '0.76rem', color: '#f0ede8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexShrink: 0, whiteSpace: 'nowrap' }}>
                      <span className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: c.potMult > 1 ? GOLD : '#9a948a' }}>×{c.potMult.toFixed(2)}</span>
                      {c.gems > 0 && <span className="font-karla font-700" style={{ fontSize: '0.58rem', color: '#a78bfa' }}>+{c.gems} ◆</span>}
                    </div>
                  </div>
                ))}
              </div>
              <p className="font-karla" style={{ fontSize: '0.6rem', color: '#7a766e', marginTop: 5, lineHeight: 1.4 }}>
                The pot itself grows with every ship; the chest multiplies it the moment you cash out.
              </p>

              {/* The named chase */}
              <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#8a8480', marginTop: 12, marginBottom: 6 }}>The Chase — rare from any chest</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cannons.map(it => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0.45rem 0.55rem', borderRadius: 9, background: 'rgba(140,90,210,0.08)', border: '1px solid rgba(150,110,220,0.28)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.image ?? undefined} alt="" loading="lazy" decoding="async" style={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.5))' }} />
                    <div style={{ minWidth: 0 }}>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.76rem', color: '#e9ddff', lineHeight: 1.1 }}>{it.name}</p>
                      <p className="font-karla" style={{ fontSize: '0.62rem', color: '#9a93a8', lineHeight: 1.3, marginTop: 1 }}>{it.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="font-karla" style={{ fontSize: '0.64rem', color: '#8a8480', marginTop: 7, lineHeight: 1.4 }}>
                Each can drop from any chest you crack, from about {shallowOdds}% up shallow to {deepOdds}% in Davy Jones&apos; Locker. Land both and forge them into the Grand Cannon.
              </p>
        </div>
      </motion.div>
    </ModalScrim>
  )
}

// ── Action tile ───────────────────────────────────────────────────────────────
// The three intro choices. `primary` (Descend) carries the gold pulse so it
// reads as the start button; the others open their panels.
function ActionTile({ color, icon, label, line, primary, disabled, onClick }: {
  color: string; icon: React.ReactNode; label: string; line: string; primary?: boolean; disabled?: boolean; onClick: () => void
}) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} className="tap"
      style={{
        flex: 1, minWidth: 0, padding: '0.95rem 0.25rem 0.8rem', borderRadius: 14,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, textAlign: 'center',
        cursor: disabled ? 'wait' : 'pointer',
        background: primary ? `linear-gradient(180deg, ${color}2e, ${color}10)` : `${color}10`,
        border: `1px solid ${color}${primary ? '70' : '38'}`,
        boxShadow: primary ? `0 0 22px ${color}1f` : 'none',
        animation: primary && !disabled ? 'gauntCta 2.6s ease-in-out infinite' : 'none',
      }}>
      <span style={{ color }}>{icon}</span>
      <span className="font-cinzel font-800 uppercase" style={{ fontSize: '0.76rem', letterSpacing: '0.02em', color: primary ? color : '#f0ede8', lineHeight: 1, whiteSpace: 'nowrap' }}>{label}</span>
      <span className="font-karla" style={{ fontSize: '0.58rem', color: '#9a948a', lineHeight: 1.25 }}>{line}</span>
    </button>
  )
}

// ── First-time explainer ──────────────────────────────────────────────────────
// A short, noob-proof "how this works" for the Gauntlet. Auto-opens once;
// reopenable via "How it works".
function GauntletIntroModal({ onClose, firstTime }: { onClose: () => void; firstTime: boolean }) {
  const steps: { color: string; title: string; text: string; icon: React.ReactNode }[] = [
    { color: TEAL, title: 'Descend the Locker', text: 'Fight ship after ship. Every depth hits harder than the last.', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 5l6 6 6-6" /><path d="M6 13l6 6 6-6" /></svg> },
    { color: '#8b9cff', title: 'Powers and curses', text: 'Between fights you draft a boon that lasts the whole dive. Deeper down, the Locker forces curses on you too. Now and then you can take a one-time reprieve, a heal or crew refresh, instead of a boon.', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l2.1 5.6L20 9.2l-4.4 3.6L17 19l-5-3.4L7 19l1.4-6.2L4 9.2l5.9-1.6z" /></svg> },
    { color: GOLD, title: 'One pot grows', text: 'Every ship you sink swells a single pot of doubloons and Nav XP.', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="6.5" rx="7" ry="2.6" /><path d="M5 6.5v5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-5" /><path d="M5 11.5v5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-5" /></svg> },
    { color: '#f87171', title: 'Cash out or sink', text: 'Bank the pot any time you like. Go under first and it all sinks with you.', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a8 8 0 0 0-8 8c0 4 3 7 7 8 4-1 7-4 7-8a8 8 0 0 0-8-8z" /><circle cx="9" cy="10" r="1.4" fill="#120a12" /><circle cx="15" cy="10" r="1.4" fill="#120a12" /></svg> },
    { color: TEAL, title: 'Earn Fathoms', text: 'Every dive pays Fathoms, one per ship you sink. You keep them win or lose.', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M7 10.6c1.2-1 2.3-1 3.5 0s2.3 1 3.5 0 2.1-0.9 2.8-0.4" /><path d="M7 14c1.2-1 2.3-1 3.5 0s2.3 1 3.5 0 2.1-0.9 2.8-0.4" /></svg> },
    { color: GOLD, title: 'Spend them in two shops', text: 'Run Upgrades sharpen your dives. Ship & Shore buys permanent power for raids, voyages, and fishing.', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="6" rx="6.5" ry="2.4" /><path d="M5.5 6v4c0 1.3 2.9 2.4 6.5 2.4S18.5 11.3 18.5 10V6" /><path d="M5.5 10v4c0 1.3 2.9 2.4 6.5 2.4s6.5-1.1 6.5-2.4v-4" /><path d="M5.5 14v4c0 1.3 2.9 2.4 6.5 2.4s6.5-1.1 6.5-2.4v-4" /></svg> },
  ]
  return (
    <ModalScrim zIndex={1400} onClose={onClose} bg="rgba(2,6,12,0.88)" blur="blur(5px)">
      <motion.div initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 250, damping: 23 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 420, borderRadius: 20, background: 'linear-gradient(180deg, rgba(12,18,30,0.99), rgba(6,9,16,0.99))', border: `1px solid ${TEAL}3a`, boxShadow: `0 0 50px ${TEAL}22, 0 18px 50px rgba(0,0,0,0.65)`, padding: '1.3rem 1.15rem 1.15rem', textAlign: 'center' }}>
        <div style={{ position: 'relative', width: 92, height: 92, margin: '0 auto 6px' }}>
          <div style={{ position: 'absolute', inset: -14, borderRadius: '50%', background: `radial-gradient(circle, ${GOLD}22 0%, ${TEAL}12 45%, transparent 72%)`, animation: 'gauntPulse 3.6s ease-in-out infinite' }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MAW_IMG} alt="" loading="eager" decoding="async" style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.7))' }} />
        </div>
        <p className="font-karla font-700 uppercase" style={{ fontSize: '0.55rem', letterSpacing: '0.3em', color: TEAL }}>The Davy Jones Gauntlet</p>
        <p className="font-cinzel font-800" style={{ fontSize: '1.4rem', color: '#f3ead2', lineHeight: 1.1, marginTop: 5 }}>How the descent works</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16, textAlign: 'left' }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0.6rem 0.7rem', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, background: `${s.color}1c`, border: `1px solid ${s.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color }}>{s.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#f3f0ea', lineHeight: 1.15 }}>{s.title}</p>
                <p className="font-karla" style={{ fontSize: '0.74rem', color: '#a8a299', lineHeight: 1.45, marginTop: 2 }}>{s.text}</p>
              </div>
            </div>
          ))}
        </div>

        <button onClick={onClose} className="font-cinzel font-800 uppercase tracking-[0.08em] tap"
          style={{ marginTop: 18, width: '100%', padding: '0.95rem', borderRadius: 13, fontSize: '0.95rem', color: GOLD, background: `linear-gradient(180deg, ${GOLD}26, ${GOLD}0f)`, border: `1px solid ${GOLD}66`, cursor: 'pointer' }}>
          {firstTime ? 'Into the Locker' : 'Got it'}
        </button>
      </motion.div>
    </ModalScrim>
  )
}

// Visual for the Extra Cannonball Rack — the raid cannonball pips (same gold
// dots as the in-combat ChargesRow) going from the standard 3 to 4, with the
// new reserve pip pulsing teal so the gain is obvious at a glance.
function CannonballRackDemo() {
  function Pip({ extra }: { extra?: boolean }) {
    return (
      <motion.div
        aria-hidden
        animate={extra ? { scale: [1, 1.16, 1], boxShadow: [`0 0 6px rgba(251,191,36,0.5)`, `0 0 12px ${TEAL}, 0 0 7px rgba(251,191,36,0.85)`, `0 0 6px rgba(251,191,36,0.5)`] } : undefined}
        transition={extra ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : undefined}
        style={{ width: 14, height: 14, borderRadius: '50%', background: '#fbbf24', border: `1px solid ${extra ? TEAL : '#fbbf24'}`, boxShadow: extra ? `0 0 10px ${TEAL}` : '0 0 6px rgba(251,191,36,0.5)' }}
      />
    )
  }
  return (
    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '0.7rem 0.5rem', borderRadius: 10, background: 'rgba(4,8,14,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>{[0, 1, 2].map(i => <Pip key={i} />)}</div>
        <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.44rem', color: '#8a8480', marginTop: 7 }}>Standard · 3</p>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8a8480" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>{[0, 1, 2].map(i => <Pip key={i} />)}<Pip extra /></div>
        <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.44rem', color: TEAL, marginTop: 7 }}>With Rack · 4</p>
      </div>
    </div>
  )
}

// ── Locker Upgrades ───────────────────────────────────────────────────────────
// Permanent perks bought with Fathoms, each gated by how deep you've gone. Split
// into two counters: "Run Upgrades" (scope 'gauntlet' — sharpen the descent) and
// "Hauled to Shore" (scope account/world + the Auto Catcher special item — power
// for the wider game). Server-validated on claim (depth + cost + prereq + no
// double); the panel just reflects state and disables what you can't take yet.
type LockerState = { deepest: number; fathoms: number; owned: string[]; hasAutoCatcher: boolean; hasAutoCaster: boolean }
/** A purchasable row in the Locker — either a Gauntlet upgrade or a special
 *  item (the Auto Catcher) — normalized so both render through one card. */
type ShopEntry = {
  id: string; name: string; description: string; depthRequired: number; cost: number
  scope: string; owned: boolean; lockNote: string | null; demo: boolean; special: boolean
  category?: 'voyages' | 'raids' | 'fishing'
}

// Ship & Shore sections, ordered, each with a small glyph for the header.
const SHORE_CATEGORIES: { id: 'voyages' | 'raids' | 'fishing'; label: string; icon: React.ReactNode }[] = [
  { id: 'voyages', label: 'Voyages', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v9" /><path d="M12 5l6 6-6 1" /><path d="M4 14h16l-1.6 4.2a2 2 0 0 1-1.9 1.3H7.5a2 2 0 0 1-1.9-1.3z" /></svg> },
  { id: 'raids', label: 'Raids', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6" /><path d="m16 16 4 4" /><path d="M9.5 6.5 21 6V3h-3L6.5 14.5" /><path d="m5 13 6 6" /><path d="m8 18-5 3" /></svg> },
  { id: 'fishing', label: 'Fishing', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12c3-4 8-5 12-3 2 1 4 3 6 3-2 0-4 2-6 3-4 2-9 1-12-3z" /><path d="m16 9.5 4-2.5v10l-4-2.5" /><circle cx="7.5" cy="11.5" r="0.7" fill="currentColor" stroke="none" /></svg> },
]

function LockerUpgradesModal({ section, onClose, onClaimed }: { section: 'run' | 'shore'; onClose: () => void; onClaimed?: (owned: string[]) => void }) {
  const [state, setState] = useState<LockerState | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { getGauntletUpgradeState().then(setState) }, [])

  async function claim(id: string, special: boolean) {
    if (claiming) return
    setClaiming(id); setErr(null)
    if (special) {
      // Special items (Auto Catcher) are bought via buySpecialItem, which sets
      // its own profile column — refetch to pick up the new owned + Fathoms.
      const res = await buySpecialItem(id)
      setClaiming(null)
      if ('error' in res) { setErr(res.error); return }
      vibrate([0, 30, 50, 40])
      const fresh = await getGauntletUpgradeState(); setState(fresh)
    } else {
      const res = await claimGauntletUpgrade(id)
      setClaiming(null)
      if ('error' in res) { setErr(res.error); return }
      setState(s => (s ? { ...s, fathoms: res.fathoms, owned: res.owned } : s))
      onClaimed?.(res.owned)
      vibrate([0, 30, 50, 40])
    }
  }

  // A shop line item for an UN-OWNED upgrade: name + description on the left,
  // a Fathoms price tag on the right, a status accent stripe, and a buy button
  // whose label spells out exactly why you can or can't take it. (Owned upgrades
  // are surfaced as chips up top, not here.)
  function Card({ e }: { e: ShopEntry }) {
    if (!state) return null
    const depthMet = state.deepest >= e.depthRequired
    const canAfford = state.fathoms >= e.cost
    const busy = claiming === e.id
    const prereqLocked = !!e.lockNote
    const claimable = depthMet && canAfford && !prereqLocked && !busy
    const accent = claimable ? GOLD : (!depthMet || prereqLocked) ? '#caa05a' : '#6a6764'
    // Compact buy control on the right: a small tinted price-button when you can
    // take it, a dim status chip when you can't. Fathoms read teal, matching the
    // wallet, so it never needs a gold fill.
    const topLabel = busy ? '' : !depthMet ? 'Locked' : prereqLocked ? 'Locked' : !canAfford ? 'Need' : 'Buy'
    const bigLabel = busy ? '…' : !depthMet ? `Lv ${e.depthRequired}` : fmt(e.cost)
    const showFathoms = !busy && depthMet
    return (
      <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 11, borderRadius: 14, padding: '0.75rem 0.85rem 0.75rem 1rem', background: 'rgba(255,255,255,0.035)', border: `1px solid ${claimable ? `${GOLD}3a` : 'rgba(255,255,255,0.1)'}`, boxShadow: claimable ? `0 0 18px ${GOLD}12` : 'none' }}>
        <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: accent }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-cinzel font-700" style={{ fontSize: '0.96rem', color: '#f0ede8', lineHeight: 1.15 }}>{e.name}</p>
          {e.depthRequired > 0 && (
            <span className="font-karla font-700 uppercase tracking-[0.07em]" style={{ fontSize: '0.5rem', color: depthMet ? '#7fd49a' : '#d8a14a' }}>
              {depthMet ? `Depth ${e.depthRequired} reached` : `Reach depth ${e.depthRequired}`}
            </span>
          )}
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#b0aaa0', lineHeight: 1.45, marginTop: 4 }}>{e.description}</p>
          {e.demo && <CannonballRackDemo />}
          {prereqLocked && <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#caa05a', marginTop: 7 }}>{e.lockNote}</p>}
        </div>
        <button
          type="button"
          onClick={claimable ? () => claim(e.id, e.special) : undefined}
          disabled={!claimable}
          className="tap"
          style={{
            flexShrink: 0, alignSelf: 'center', width: 66, padding: '0.5rem 0.4rem', borderRadius: 11,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, lineHeight: 1,
            cursor: claimable ? 'pointer' : 'default',
            color: claimable ? TEAL : '#6a6764',
            background: claimable ? `${TEAL}1c` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${claimable ? `${TEAL}66` : 'rgba(255,255,255,0.1)'}`,
          }}
        >
          {topLabel && <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.1em', opacity: 0.85 }}>{topLabel}</span>}
          <span className="font-cinzel font-800" style={{ fontSize: '1rem' }}>{bigLabel}</span>
          {showFathoms && <span className="font-karla font-700 uppercase" style={{ fontSize: '0.4rem', letterSpacing: '0.08em', opacity: 0.7 }}>Fathoms</span>}
        </button>
      </div>
    )
  }

  return (
    <ModalScrim zIndex={1300} onClose={onClose}>
      <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 440, borderRadius: 18, background: 'linear-gradient(180deg, rgba(14,22,34,0.99), rgba(7,13,22,0.99))', border: `1px solid ${TEAL}3a`, boxShadow: `0 0 44px ${TEAL}1f, 0 18px 50px rgba(0,0,0,0.6)`, padding: '1.2rem 1.1rem 1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.24em]" style={{ fontSize: '0.52rem', color: `${TEAL}cc` }}>The Locker</p>
            <p className="font-cinzel font-800" style={{ fontSize: '1.35rem', color: '#eafffb', lineHeight: 1.1, marginTop: 3 }}>{section === 'run' ? 'Run Upgrades' : 'Ship & Shore'}</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', padding: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <p className="font-karla" style={{ fontSize: '0.74rem', color: '#9a948a', marginTop: 6, lineHeight: 1.45 }}>
          {section === 'run'
            ? 'Perks that sharpen the descent itself — they only matter inside the Gauntlet. Bought with Fathoms.'
            : 'Permanent power you carry topside — into raids, voyages, and fishing. Bought with Fathoms, earned by descending.'}
        </p>

        {state === null ? (
          <p className="font-karla" style={{ fontSize: '0.8rem', color: '#7a766e', textAlign: 'center', padding: '2rem 0' }}>Reading the ledger…</p>
        ) : (() => {
            const upgrades: ShopEntry[] = GAUNTLET_UPGRADES.map(u => ({
              id: u.id, name: u.name, description: u.description, depthRequired: u.depthRequired,
              cost: u.cost, scope: u.scope, owned: state.owned.includes(u.id), lockNote: null,
              demo: u.id === 'cannonball_rack', special: false, category: u.category,
            }))
            const ac = getSpecialItem('auto_catcher')
            const autoCatcher: ShopEntry | null = ac ? {
              id: 'auto_catcher', name: ac.name, description: ac.description,
              depthRequired: ac.requiresGauntletDepth ?? 5, cost: ac.costFathoms ?? 0,
              scope: 'world', owned: state.hasAutoCatcher,
              lockNote: state.hasAutoCaster ? null : 'Buy the Auto Caster in the fishing shop first.',
              demo: false, special: true, category: 'fishing',
            } : null
            const runShop = upgrades.filter(e => e.scope === 'gauntlet')
            const shoreShop = [...upgrades.filter(e => e.scope !== 'gauntlet'), ...(autoCatcher ? [autoCatcher] : [])]
            const entries = section === 'run' ? runShop : shoreShop
            const owned = entries.filter(e => e.owned)
            const forSale = entries.filter(e => !e.owned)
            return (
          <>
            {/* Fathoms wallet — the currency you're spending, up top. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '13px 0 0', padding: '0.65rem 0.85rem', borderRadius: 12, background: `${TEAL}10`, border: `1px solid ${TEAL}33` }}>
              <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.52rem', color: `${TEAL}cc` }}>Your Fathoms</span>
              <span className="font-cinzel font-800" style={{ fontSize: '1.2rem', color: TEAL }}>{fmt(state.fathoms)}</span>
            </div>

            {/* What you already own — surfaced as chips so the loadout is obvious. */}
            {owned.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#8a8480', marginBottom: 7 }}>
                  {section === 'run' ? `Active every dive · ${owned.length}` : `Owned · ${owned.length}`}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {owned.map(e => (
                    <span key={e.id} className="font-karla font-700" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.62rem', color: '#bdeee5', background: `${TEAL}16`, border: `1px solid ${TEAL}4a`, borderRadius: 999, padding: '0.28rem 0.62rem' }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      {e.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* For sale */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '17px 0 9px' }}>
              <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#8a8480' }}>For sale</p>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
            </div>

            {forSale.length === 0 ? (
              <p className="font-karla" style={{ fontSize: '0.78rem', color: '#7a766e', textAlign: 'center', padding: '1.2rem 0' }}>
                {entries.length === 0 ? 'Nothing in this shop yet — more coming.' : 'You own everything here. Dive deeper for what comes next.'}
              </p>
            ) : section === 'run' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{forSale.map(e => <Card key={e.id} e={e} />)}</div>
            ) : (
              // Ship & Shore — grouped by what each upgrade affects.
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {SHORE_CATEGORIES.map(cat => {
                  const group = forSale.filter(e => e.category === cat.id)
                  if (group.length === 0) return null
                  return (
                    <div key={cat.id}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                        <span style={{ color: TEAL, display: 'flex' }}>{cat.icon}</span>
                        <span className="font-cinzel font-800" style={{ fontSize: '0.88rem', color: '#eafffb', letterSpacing: '0.02em' }}>{cat.label}</span>
                        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{group.map(e => <Card key={e.id} e={e} />)}</div>
                    </div>
                  )
                })}
              </div>
            )}

            {err && <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#fca5a5', textAlign: 'center', marginTop: 12 }}>{err}</p>}
          </>
            )
          })()}
      </motion.div>
    </ModalScrim>
  )
}

// ── Atmosphere ────────────────────────────────────────────────────────────────
// The Gauntlet is the endgame descent, so every meta screen sits over a living
// abyss: a dim surface glow up top fading to pitch black, drifting god-rays, and
// motes rising from the deep. CSS-only (transform/opacity) so it stays cheap on
// mobile / iOS PWA. Keyframes are injected once via the backdrop's <style>.
const ABYSS_KEYFRAMES = `
@keyframes gauntRise { 0% { transform: translateY(0); opacity: 0 } 12% { opacity: 0.55 } 88% { opacity: 0.4 } 100% { transform: translateY(-360px); opacity: 0 } }
@keyframes gauntPulse { 0%, 100% { opacity: 0.38; transform: scale(1) } 50% { opacity: 0.78; transform: scale(1.07) } }
@keyframes gauntDrift { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
@keyframes gauntShaft { 0%, 100% { opacity: 0.14 } 50% { opacity: 0.3 } }
@keyframes gauntCta { 0%, 100% { box-shadow: 0 0 0 1px rgba(240,192,64,0.5), 0 0 20px rgba(240,192,64,0.22) } 50% { box-shadow: 0 0 0 1px rgba(240,192,64,0.75), 0 0 34px rgba(240,192,64,0.42) } }
`

// Deterministic so SSR + client agree (no Math.random in render).
const MOTES = [
  { left: 12, size: 3, dur: 9,  delay: 0 },
  { left: 22, size: 2, dur: 12, delay: 2 },
  { left: 34, size: 4, dur: 8,  delay: 1 },
  { left: 45, size: 2, dur: 11, delay: 4 },
  { left: 53, size: 3, dur: 10, delay: 0.5 },
  { left: 64, size: 2, dur: 13, delay: 3 },
  { left: 72, size: 4, dur: 9,  delay: 1.5 },
  { left: 81, size: 3, dur: 11, delay: 2.5 },
  { left: 90, size: 2, dur: 10, delay: 5 },
  { left: 7,  size: 2, dur: 14, delay: 6 },
  { left: 58, size: 2, dur: 9,  delay: 7 },
]

function AbyssBackdrop() {
  return (
    <>
      <style>{ABYSS_KEYFRAMES}</style>
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden',
        background: 'radial-gradient(ellipse 130% 80% at 50% -12%, rgba(34,64,98,0.55) 0%, rgba(10,20,34,0.62) 36%, rgba(2,5,10,0.97) 76%), #02040a',
      }}>
        {/* God-rays from the surface */}
        <div style={{ position: 'absolute', top: '-12%', left: '20%', width: 130, height: '95%', transform: 'rotate(9deg)', filter: 'blur(10px)', background: 'linear-gradient(to bottom, rgba(120,180,220,0.18), transparent 68%)', animation: 'gauntShaft 7s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '-12%', left: '62%', width: 100, height: '95%', transform: 'rotate(-7deg)', filter: 'blur(10px)', background: 'linear-gradient(to bottom, rgba(120,180,220,0.13), transparent 64%)', animation: 'gauntShaft 9s ease-in-out infinite', animationDelay: '1.5s' }} />
        {/* Motes rising from the deep */}
        {MOTES.map((m, i) => (
          <div key={i} style={{
            position: 'absolute', bottom: -10, left: `${m.left}%`,
            width: m.size, height: m.size, borderRadius: '50%',
            background: 'rgba(150,200,230,0.55)', boxShadow: '0 0 6px rgba(150,200,230,0.55)',
            animation: `gauntRise ${m.dur}s linear ${m.delay}s infinite`,
          }} />
        ))}
        {/* Vignette to keep the focus center */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 42%, transparent 48%, rgba(0,0,0,0.6) 100%)' }} />
      </div>
    </>
  )
}

// ── Small presentational helpers ──────────────────────────────────────────────
function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <>
      <AbyssBackdrop />
      <div className="flex flex-col" style={{
        position: 'relative', zIndex: 1,
        maxWidth: wide ? 460 : 420, margin: '0 auto', padding: '12px 0.25rem',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
      }}>
        {/* Dark panel so copy stays legible over the abyss; slightly translucent
            now so the atmosphere bleeds through behind it. */}
        <div style={{
          background: 'linear-gradient(180deg, rgba(10,14,22,0.86) 0%, rgba(5,8,14,0.93) 100%)',
          border: `1px solid ${GOLD}33`,
          borderRadius: 18,
          padding: '1.25rem 1.2rem 1.4rem',
          boxShadow: '0 18px 54px rgba(0,0,0,0.6), inset 0 1px 0 rgba(240,192,64,0.08)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        }}>
          {children}
        </div>
      </div>
    </>
  )
}

function Title({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 14, marginTop: 8 }}>
      <h1 className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#f0ece4', letterSpacing: '0.02em' }}>{children}</h1>
      {sub && <p className="font-karla" style={{ fontSize: '0.78rem', color: '#9a948a', marginTop: 4 }}>{sub}</p>}
    </div>
  )
}

function BackLink({ router, label, primary, onClick }: { router: ReturnType<typeof useRouter>; label: string; primary?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick ?? (() => router.push('/expeditions'))} className="font-karla font-600"
      style={{
        marginTop: 16, width: '100%', padding: primary ? '0.85rem' : '0.7rem', borderRadius: 12, fontSize: '0.85rem',
        background: primary ? 'rgba(255,255,255,0.05)' : 'transparent',
        border: primary ? '1px solid rgba(255,255,255,0.14)' : 'none',
        color: primary ? '#cfc9bf' : '#8a8880', cursor: 'pointer',
      }}>
      {label}
    </button>
  )
}

function DepthBar({ depth, pot, isBoss, isElite, affixName, curses }: { depth: number; pot: number; isBoss: boolean; isElite: boolean; affixName?: string; curses: number }) {
  const tag = isBoss ? 'BOSS' : isElite ? `ELITE${affixName ? ` · ${affixName}` : ''}` : null
  const tagColor = isBoss ? '#f87171' : '#c084fc'
  return (
    <div className="flex items-center justify-between"
      style={{ background: 'rgba(4,10,18,0.72)', border: `1px solid ${GOLD}28`, borderRadius: 14, padding: '0.4rem 0.8rem' }}>
      <div className="flex items-baseline gap-1.5">
        <span className="font-karla font-600" style={{ fontSize: '0.46rem', color: GOLD + 'bb', letterSpacing: '0.1em' }}>DEPTH</span>
        <span className="font-cinzel font-800" style={{ fontSize: '1rem', color: GOLD, lineHeight: 1 }}>{depth}</span>
        {tag && <span className="font-cinzel font-700" style={{ fontSize: '0.56rem', color: tagColor, letterSpacing: '0.06em', marginLeft: 4 }}>{tag}</span>}
      </div>
      <div className="flex items-center gap-2.5">
        {curses > 0 && (
          <span className="flex items-baseline gap-1" title={`${curses} curse${curses === 1 ? '' : 's'} active`}>
            <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', color: '#f8717199', letterSpacing: '0.08em' }}>CURSED</span>
            <span className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#f87171', lineHeight: 1 }}>{curses}</span>
          </span>
        )}
        <span className="flex items-baseline gap-1">
          <span className="font-karla font-600" style={{ fontSize: '0.46rem', color: '#9a948a', letterSpacing: '0.08em' }}>POT</span>
          <span className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#e8dfc8' }}>{fmt(pot)} ⟡</span>
        </span>
      </div>
    </div>
  )
}
