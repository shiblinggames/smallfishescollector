'use client'

// Davy Jones Gauntlet host. Owns the push-your-luck meta-loop (depth, pot,
// cash-out vs push-on, the daily gate) and mounts the existing RaidCombat
// engine one fight at a time. No combat rewrite: RaidCombat fights a single
// generated enemy, hands back the player's remaining HP, and we carry it into
// the next fight. Bosses / elites fire on the randomized guardrails in
// lib/gauntlet; boons + curses are the run-modifier layer (Tides are raids-only).
// The pot is only banked on cash-out; a wipe loses everything.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import RaidCombat from '../RaidCombat'
import { getShipSkin } from '@/lib/shipSkins'
import type { RaidMods } from '@/lib/expeditions'
import { fortuneLootMult } from '@/lib/expeditions'
import type { RaidCrewMember } from '../actions'
import { classForSlug, CLASSES, currentMilestone } from '@/lib/crewClasses'
import { crewLevelFromXP } from '@/lib/crewLevel'
import {
  generateFight, advanceRollState, chestForDepth, hardcoreChestLabel, gauntletXpForDepth,
  isCurseDepth, drawCurse, curseEffects, curseHpDrain, curseSilenceCount, curseTierLabel, GAUNTLET_CURSES,
  isBoonDepth, drawBoons, boonEffects, hpBoonMult, boonTierLabel, GAUNTLET_BOONS, BOON_RARITY_META, boonRarity, pickBloodOathBoon,
  confluenceEffects, activeConfluences, eligibleConfluences, drawConfluenceOffer, confluenceLevel, confluenceDescAt, confluenceHintsFor, CONFLUENCES, inGauntletPool, type Confluence, type ConfluenceOffer,
  convergenceEffects, activeConvergences, drawConvergenceOffer, convergenceLevel, convergenceDescAt, CONVERGENCES,
  REPRIEVE_MIN_DEPTH, REPRIEVE_CHANCE, drawReprieve, type Reprieve,
  // Davy's Terms — the chosen, structural difficulty layer (hardcore only).
  DROWNED_FILTER, GHOST_FILTER, bandForDepth, gauntletTaunt, donRiseCopy, donFallCopy, donRiseIndex, DON_RISE_DEPTHS,
  GAUNTLET_COOLDOWN_HOURS, HARDCORE_RUNS_PER_DAY, HC_UNLOCK_DEPTH, GAUNTLET_REWARD_DEPTH_CAP, fathomsForDepth,
  emptyRunStats, addRunStats, coerceRunStats,
  dropOddsInfo, type DropOddsInfo,
  type GauntletFight, type GauntletRollState, type CurseOffer, type BoonOffer, type GauntletRunSnapshot, type GauntletRunState, type GauntletRunStats, chestOdds, type GauntletVariant } from '@/lib/gauntlet'
import { GAUNTLET_TERMS, TERM_GROUP_META, termsTitle, resolveTerms, termPressure, termTideEffects, pressureGemMult, pressureDepthFactor, NO_TERM_EFFECTS, PRESSURE_CAP, PRESSURE_DEPTH_FLOOR, PRESSURE_DEPTH_FULL, PRESSURE_SKIN_THRESHOLD, PRESSURE_SKIN_DEPTH, PRESSURE_SKIN_ID, MAX_AVAILABLE_PRESSURE, type SignedTerms } from '@/lib/gauntletTerms'
import GauntletTermsPanel from './GauntletTermsPanel'
import { startGauntletRun, cashOutGauntlet, resolveGauntletDeath, getGauntletUpgradeState, claimGauntletUpgrade, setGauntletUpgradeActive, markGauntletIntroSeen, recordGauntletHit, wagerGauntletFathoms, markConfluencesSeen, checkpointGauntletRun, pauseGauntletRun, resumeGauntletRun, buyBaitWithFathoms, rollDavyOffer, buyMerchantItem, claimDailyTribute } from './actions'
import { rollContractOffer, buildContractOffer, checkContract, CONTRACTS, STAKE_LABEL, describeReward, describePenalty, type ContractKind, type ContractOffer, type ContractStake, type ContractFightFacts } from '@/lib/gauntletContracts'
import { rollMarkOffer, markEffects, describeBuff, MARK_META, type ChosenMark, type MarkBuff, type MarkType } from '@/lib/gauntletMarks'
import { MERCHANT_ITEMS, rollMerchantStock, type MerchantItemKind } from '@/lib/gauntletMerchant'
import { unlockBadge } from '@/app/(app)/achievements/badgeActions'
import { offerCoinMult, offerChestMult, offerCopy, offerTakenLine, type DavyOffer } from '@/lib/gauntletOffer'
import { FATHOM_BAITS } from '@/lib/bait'
import { upgradesForVariant, getGauntletUpgrade, upgradeTierInfo, romanTier, COMING_SOON_UPGRADES, activeGauntletUpgrades, bonusChargeSlots, gauntletRunHpMult, gauntletSkipsFirstCurse, gauntletSkipOffset, gauntletDamageTakenMod, gauntletDamageMod, gauntletKillHealPct, gauntletHasSoundingLine, gauntletBoonLuck, gauntletBoonRerolls, gauntletCurseRerolls, gauntletBoonFilters, gauntletSynergyOfferMult, gauntletHasBloodOath, gauntletStartAnchorSaves, gauntletFathomsMult, DONS_DAILY_TRIBUTE_AMOUNT } from '@/lib/gauntletUpgrades'
import { type ShipAugment } from '@/lib/shipAugments'
import { getSpecialItem } from '@/lib/specialItems'
import { buySpecialItem } from '@/app/(app)/fishing/actions'
import { getRaidItem, getActiveEffects, DAVY_FORGE } from '@/lib/raidItems'
import LeaderboardModal from '@/components/LeaderboardModal'
import { vibrate, hapticTap, hapticCommit } from '@/lib/haptics'
import { lockBodyScroll } from '@/lib/bodyScrollLock'
import { getXPProgress, MAX_LEVEL } from '@/lib/expeditionLevel'
import { renownLevel } from '@/lib/renown'
import RenownUpOverlay, { type RenownUpInfo } from '@/components/RenownUpOverlay'

type Phase = 'intro' | 'usedup' | 'resume' | 'paused' | 'descending' | 'fighting' | 'curse' | 'boon' | 'shrine' | 'merchant' | 'contract' | 'contract_result' | 'don_fallen' | 'mark_choice' | 'between' | 'reward' | 'dead'

type CashResult = Awaited<ReturnType<typeof cashOutGauntlet>>

const GOLD = '#f0c040'
const TEAL = '#5eead4'
// Don's Gauntlet accent — a luminous-but-sickly kraken green (bright enough to
// stay legible on the dark UI), with a deep toxic green for atmosphere haze.
const KRAKEN = '#3fbf82'
const KRAKEN_DEEP = '#1f7a4d'
/** Hardcore's one colour. The Haul modal marks a Hardcore-only drop with this and
 *  nothing else, so "you cannot get this on a Normal dive" is a single visual fact
 *  rather than a sentence. */
const HC_RED = '#e0555a'

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

// The Gauntlet fights over the abyss backdrop (same art as the campaign's
// Chapter IV raids) but runs it through a deeper, drowned-teal filter so it
// reads as Davy's water, not the campaign's. Echoes DROWNED_FILTER's
// desaturated, teal-shifted look. Hardcore skips this (passes undefined) so
// its red blood-vignette stays clean instead of muddying against teal.
const GAUNTLET_ABYSS_FILTER = 'brightness(0.7) saturate(1.15) hue-rotate(-18deg) contrast(1.05)'

export interface GauntletGameProps {
  /** Which gauntlet this run host is driving. Defaults to Davy Jones; the Don's
   *  Gauntlet route passes 'don'. Threaded into startGauntletRun so the server
   *  tags the run + routes its records. */
  variant?: GauntletVariant
  /** Whether the OTHER gauntlet is also unlocked for this player. When true, the
   *  intro shows a switcher next to the title to hop to the other one. */
  otherGauntletUnlocked?: boolean
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
  /** Everything already owned — a chest never re-drops it, so the odds shown on the
   *  breather must know about it or they are a lie. */
  ownedRaidItems: string[]
  ownedShipSkins: string[]
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
  /** Run Upgrade ids the player has switched OFF — owned but inactive, so their
   *  effect is skipped this dive. */
  gauntletUpgradesOff: string[]
  /** Confluence ids the player has ever discovered — drives the codex fog. */
  confluencesSeen: string[]
  /** Terms signed for the currently OPEN run (restored on a resume). */
  runTerms?: SignedTerms | null
  deepest: number
  /** Snapshot of the deepest run (boons/curses/tides) for the home recap. */
  deepestRun: GauntletRunSnapshot | null
  /** Snapshot of the deepest HARDCORE run, for the Hardcore card's recap. */
  hcDeepestRun: GauntletRunSnapshot | null
  /** Snapshot of the MOST RECENT cash-out (normal + hardcore) — the recap
   *  modal's "Last" tab. Null until the first cash-out. */
  lastRun: GauntletRunSnapshot | null
  hcLastRun: GauntletRunSnapshot | null
  /** Fathoms balance — the Gauntlet's meta-currency, spent in the Locker. */
  fathoms: number
  /** Blood Gems balance — the premium Hardcore currency. */
  bloodGems: number
  available: boolean
  /** ISO time the next run unlocks (cooldown), or null when available now. */
  nextAt: string | null
  /** Whether the player has seen the first-time explainer. */
  hasSeenIntro: boolean
  /** #1 deepest cashed-out descender across all captains, or null if none yet. */
  topDescender: { name: string; depth: number } | null
  /** A saved checkpoint that can still be resumed. Present → the run offers a
   *  Resume beat before a fresh descent. */
  resumeState: GauntletRunState | null
  /** True when the resumable run was DELIBERATELY paused (unlimited resumes, no
   *  crew risk) vs a crash (one forced resume). Drives the resume screen's copy. */
  resumePaused?: boolean
  // ── Hardcore mode ──
  /** Can this player START a hardcore run right now? (admin-only pre-launch.) */
  hardcoreUnlocked: boolean
  /** Is hardcore live for everyone yet? false → non-admins see a "Coming Soon" tag. */
  hardcoreLive: boolean
  /** This player's best hardcore cash-out depth. */
  hcDeepest: number
  /** Hardcore runs left in the current UTC day (of HARDCORE_RUNS_PER_DAY). */
  hcRunsLeft: number
  /** #1 on the hardcore-only board, or null if none yet. */
  hardcoreTop: { name: string; depth: number } | null
  /** Is the currently OPEN (resumable) run a hardcore one? Keeps a resumed run's
   *  end-beats + abandon warning correct. */
  runHardcore: boolean
}

// ── The Drowned Shrine (wager node) ──────────────────────────────────────────
// A rare non-combat beat that surfaces on a plain breather depth: gamble your
// banked pot on a coin, bleed HP for a boon, or walk on for a small heal. Roll
// is arrhythmic (a chance past a min depth), capped per run, never on the same
// beat as a curse/boon. Pot/HP/boons are all client run state already trusted by
// the daily-gate + cashout-clamp model, so no server work.
// Cadence: the first shrine is due AFTER depth 7 (first eligible depth ≥ this),
// then one comes due every SHRINE_INTERVAL (+0-2 jitter) depths. That lands the
// first two before depth 25 (≈ depths 9 and 18) and keeps the same pace after.
const SHRINE_FIRST_DEPTH = 8
const SHRINE_INTERVAL    = 7
// The Black Market (Don's only) rides its own cadence, offset from the shrine so
// the two rarely land on the same depth (whichever check fires first wins that
// depth, and both only trigger on a quiet depth).
const MERCHANT_FIRST_DEPTH = 11
const MERCHANT_INTERVAL    = 9
const SHRINE_WAGER_MAX    = 10    // Davy's Coin: most Fathoms you can stake (double or nothing, server-rolled)
const SHRINE_BLOOD_HP_PCT = 0.50  // Blood Price: fraction of CURRENT HP paid for a boon (a normal draft, no skew)
const SHRINE_WALK_HEAL    = 0.05  // Walk on: fraction of MAX HP healed (deliberately small — the safe-but-weak out)

export default function GauntletGame(props: GauntletGameProps) {
  const router = useRouter()
  // Variant-aware branding + theme: Don's Gauntlet is a scary KRAKEN-GREEN abyss,
  // distinct from Davy's teal-and-gold. `AC` is the primary accent (replaces TEAL
  // on the player-facing screens); GOLD (Fathoms/treasure) stays shared. `atmoGlow`
  // tints the landing/descent haze his sickly green instead of Davy's red.
  const isDonG = props.variant === 'don'
  const heroImg = isDonG ? '/donsgauntlet.png' : MAW_IMG
  const gauntletTitle = isDonG ? "Don's Gauntlet" : 'Davy Jones Gauntlet'
  const gauntletFace = isDonG ? 'Don Finleone' : 'Davy Jones'
  const AC = isDonG ? KRAKEN : TEAL
  const atmoGlow = isDonG ? KRAKEN_DEEP : '#ef4444'
  const shipFilter = props.equippedShipSkin ? getShipSkin(props.equippedShipSkin)?.filter ?? 'none' : 'none'
  // Locker run-upgrades, mirrored into local state. The server-loaded prop only
  // refreshes on a fresh page render (tab switch / navigation), so a player who
  // BUYS an upgrade and immediately starts a run would otherwise fight with the
  // stale set — e.g. Diving Bell's +15% HP wouldn't apply until they left and
  // came back. onClaimed updates this immediately; the effect resyncs if the
  // server later sends a new prop. See [[feedback-usestate-prop-sync]].
  const [upgrades, setUpgrades] = useState(props.gauntletUpgrades)
  useEffect(() => { setUpgrades(props.gauntletUpgrades) }, [props.gauntletUpgrades])
  // Run Upgrades the player switched OFF (owned but inactive this dive). Mirrored
  // into local state like `upgrades` so a toggle in the Locker applies to the
  // very next dive without a reload; resynced if the server sends a new prop.
  const [upgradesOff, setUpgradesOff] = useState(props.gauntletUpgradesOff)
  useEffect(() => { setUpgradesOff(props.gauntletUpgradesOff) }, [props.gauntletUpgradesOff])
  // The upgrades that actually shape THIS dive — claimed minus switched-off. Every
  // run-effect helper reads this, so a disabled Run Upgrade contributes nothing.
  const activeUpgrades = useMemo(() => activeGauntletUpgrades(upgrades, upgradesOff), [upgrades, upgradesOff])
  // Diving Bell (Run Upgrade) lifts the player's max HP for the whole run. This
  // is the BASE ceiling (stat × upgrade); the LIVE ceiling `hpMax` (computed
  // below, once boons/depth exist) folds the HP-scaling boons on top.
  const baseHpMax = Math.round(props.playerHPMax * gauntletRunHpMult(activeUpgrades))
  // Veteran's Start: combat depth = cleared + 1 + skipOffset (enemies, boon/curse
  // cadence, displayed depth). Rewards stay on the cleared count, so the head
  // start never inflates pot / chests / Fathoms / record.
  const skipOffset = gauntletSkipOffset(activeUpgrades)
  // Marks of the Don — the stacking trophy for beating him at a milestone. Each
  // fall you CHOOSE one of two Marks (Shark = offense bundle / Whale = defense
  // bundle), and it rides the rest of the run. Marks emit TideEffect[] folded into
  // runEffects below, so every buff lights up its real combat hook.
  const [marks, setMarks] = useState<ChosenMark[]>([])
  const markCount = marks.length
  const markFx = useMemo(() => markEffects(marks), [marks])
  // Run Upgrades that fold into the combat mods: Iron Hide (−damage taken) +
  // Gunner's Eye (+damage dealt).
  const runRaidMods = {
    ...props.raidMods,
    damageTakenPct: (props.raidMods.damageTakenPct ?? 0) + gauntletDamageTakenMod(activeUpgrades),
    damagePct: (props.raidMods.damagePct ?? 0) + gauntletDamageMod(activeUpgrades),
  }

  // A resumable crashed run takes priority over the intro/cooldown screens — the
  // player is offered their dive back before anything else.
  const [phase, setPhase] = useState<Phase>(props.resumeState ? 'resume' : props.available ? 'intro' : 'usedup')
  const [starting, setStarting] = useState(false)
  // Hardcore: is the current run a hardcore run? Drives the death / cash-out
  // end-beats. The mode-choice popup (Descend → Normal vs Hardcore) + the stark
  // squad-at-risk confirmation gate opening a hardcore run.
  const [hardcoreRun, setHardcoreRun] = useState(props.runHardcore)
  const [modeChoiceOpen, setModeChoiceOpen] = useState(false)
  const [hcConfirmOpen, setHcConfirmOpen] = useState(false)
  // The Terms board — the hardcore pre-dive difficulty selector.
  const [termsOpen, setTermsOpen] = useState(false)
  const [hcBlockedMsg, setHcBlockedMsg] = useState<string | null>(null)
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
  const [playerHP, setPlayerHP] = useState(baseHpMax)
  const [pot, setPot] = useState(0)
  const [bossesDefeated, setBossesDefeated] = useState(0)
  // "+N ⟡" float off the header pot each kill — greed made visible.
  const [potGain, setPotGain] = useState<{ amount: number; key: number; boss: boolean } | null>(null)
  // Uncharted water: flips ON the first time this run sinks past the mode's
  // standing record (props.deepest / props.hcDeepest). recordShownRef fires
  // the descent-splash beat ONCE; `uncharted` recolors the DepthBar label for
  // the rest of the run.
  const [uncharted, setUncharted] = useState(false)
  const [recordBeat, setRecordBeat] = useState(false)
  const recordShownRef = useRef(false)
  // Run ribbon — the dive's story as depth-stamped events, drawn on the
  // reward and death screens (boon drafts, curses, boss falls, shrine stops).
  const runEventsRef = useRef<{ depth: number; kind: 'boon' | 'curse' | 'boss' | 'shrine' }[]>([])
  const [fight, setFight] = useState<GauntletFight | null>(null)
  // Sounding Line: the next fight, pre-rolled at the breather so it can be
  // revealed before the player commits — and CONSUMED on push, so the reveal is
  // the actual fight, not a separate (lying) roll. State drives the reveal, the
  // ref is the source of truth pushOn reads.
  const [peekFight, setPeekFight] = useState<GauntletFight | null>(null)
  const peekFightRef = useRef<GauntletFight | null>(null)
  const [usedAbilityIds, setUsedAbilityIds] = useState<Set<number>>(new Set())
  // Per-RUN activatable-item use (War Drum / Thunder Drum). One use for the whole
  // gauntlet run — persists across fights + boss refreshes, resets only on a new
  // run (or restore from a saved run).
  const [usedRaidItemIds, setUsedRaidItemIds] = useState<Set<string>>(new Set())
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
  // Blacklist (Don's): boons the player has banished stay gone for the whole run,
  // so the banned set lives in a ref (read by every drawBoons, survives closures).
  // `filtersLeft` is the per-RUN ban budget remaining (drives the Ban button).
  const bannedBoonsRef = useRef<Set<string>>(new Set())
  const [filtersLeft, setFiltersLeft] = useState(0)
  // Banish flow: arm the mode, then TAP a boon to pick it, then confirm. The old
  // per-card ✕ was a 24px target sat on top of a full-card draft button, so a
  // near-miss drafted the boon you were trying to bin.
  const [banArmed, setBanArmed] = useState(false)
  const [banConfirm, setBanConfirm] = useState<{ idx: number; name: string } | null>(null)
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
  // The boon Blood Oath seeded this run with (so the first descent can announce
  // it — otherwise a boon you never drafted looks like a bug in the codex).
  const [oathBoon, setOathBoon] = useState<string | null>(null)
  // ── Davy's Terms ──────────────────────────────────────────────────────────
  // Signed BEFORE a hardcore dive; they reshape the run (they are NOT curses —
  // curses stay the random mid-run layer and are untouched). termFx is the one
  // resolved knob-set every generator below reads. A resumed run restores its
  // terms from the server, or the rest of the dive would silently play on easy.
  const [signedTerms, setSignedTerms] = useState<SignedTerms>(props.runTerms ?? {})
  const signedTermsRef = useRef<SignedTerms>(props.runTerms ?? {})
  useEffect(() => { signedTermsRef.current = signedTerms }, [signedTerms])
  // The knobs only apply to a HARDCORE run — a normal dive never sees them.
  const termFx = useMemo(
    () => (hardcoreRun ? resolveTerms(signedTerms) : NO_TERM_EFFECTS),
    [hardcoreRun, signedTerms],
  )
  const termFxRef = useRef(termFx)
  useEffect(() => { termFxRef.current = termFx }, [termFx])
  const pressure = useMemo(() => termPressure(signedTerms), [signedTerms])
  const signedTermCount = useMemo(() => Object.values(signedTerms).filter(t => t >= 1).length, [signedTerms])
  // The multiplier a signed board is WORTH at full depth — the headline the dive
  // modal advertises (it ramps in with depth; the board itself explains that).
  const gemMultAtFullDepth = useMemo(() => pressureGemMult(pressure, PRESSURE_DEPTH_FULL), [pressure])
  // Short-Handed (a signed Term): a berth stays empty, so the last crew slot is
  // not manned this run. The full squad is still aboard and still drowns on a
  // hardcore death — you simply fight without one of them.
  const runCrew = useMemo(
    () => (termFx.crewSlotsLost > 0
      ? props.crewMembers.slice(0, Math.max(1, props.crewMembers.length - termFx.crewSlotsLost))
      : props.crewMembers),
    [props.crewMembers, termFx.crewSlotsLost],
  )

  // Confluences the player has DRAFTED (opportunity-cost model — a confluence
  // only applies once taken as a draft card, then scales with its boon tiers).
  const [confluencesTaken, setConfluencesTaken] = useState<string[]>([])
  // Convergences DRAFTED (Don's Gauntlet meta-tier — a synergy of two confluences,
  // drafted through the same synergy slot; see drawConvergenceOffer / applyConfluence).
  const [convergencesTaken, setConvergencesTaken] = useState<string[]>([])
  const [pendingBoons, setPendingBoons] = useState<BoonOffer[] | null>(null)
  // Bumped only when a genuinely NEW draft is dealt (fresh draw or a reroll), so
  // the seal→flip reveal fires for those but NOT for an in-place Blacklist swap
  // (which mutates pendingBoons but must not re-seal every card).
  const [draftGen, setDraftGen] = useState(0)
  // A qualifying confluence offered as a card in this draft (replaces one boon
  // slot — the Hades-duo opportunity cost). Null when none is offered.
  const [pendingConfluence, setPendingConfluence] = useState<ConfluenceOffer | null>(null)
  // How many BOON cards a draft shows. A confluence offer takes one of the slots,
  // so it is always one fewer. Derived from the Term (Scarce Powder) rather than
  // hardcoded, or a 2-pick draft would still show 2 boons alongside a confluence
  // and the term would silently do nothing on exactly the drafts that matter.
  const boonCardCount = pendingConfluence
    ? Math.max(1, termFx.boonPicks - 1)
    : termFx.boonPicks
  // Confluence ids already SURFACED as a draft card this run — drives the pity
  // in drawConfluenceOffer (a newly-qualified synergy is guaranteed once). Per
  // run only; not checkpointed (worst case on resume you re-see one, harmless).
  const offeredConfluenceIdsRef = useRef<Set<string>>(new Set())
  // Boon-draft reveal — the three powers surface like a Crew Hall recruit pull:
  // each card sits under a sealed cover that rattles, then 3D-flips open, run
  // worst -> best so the rarest is the climax. Per-card phase keyed by index.
  const [boonPhases, setBoonPhases] = useState<Record<number, 'sealed' | 'charging' | 'flipped'>>({})
  const [boonFlash, setBoonFlash] = useState(0)               // key — retriggers the legendary flash
  const [boonBanner, setBoonBanner] = useState<{ name: string; key: number } | null>(null)
  // Confluence just completed by the boon you claimed — highlighted on the next
  // breather as a "synergy unlocked" beat. Cleared when you descend.
  const [confluenceUnlocked, setConfluenceUnlocked] = useState<Confluence | null>(null)
  // A one-shot banner overlay when a confluence comes online (isNew) OR deepens a
  // level (auto-dismisses); separate from the persistent breather highlight above.
  // Resolved name + desc so the same banner serves both confluences and the
  // Don's-only convergence meta-tier (isConvergence switches the label + tint).
  const [confluenceBanner, setConfluenceBanner] = useState<{ name: string; desc: string; level: number; isNew: boolean; discovered: boolean; isConvergence?: boolean; image?: string | null; key: number } | null>(null)
  // One-shot "Curse Shed" confirmation when a Shake the Curse reprieve clears one.
  const [curseShed, setCurseShed] = useState<{ name: string; key: number } | null>(null)
  // The Drowned Shrine — a wager node on a roughly fixed cadence. nextShrineRef
  // is the next combat depth a shrine is due (first after depth 7, then ~every
  // SHRINE_INTERVAL depths so 2 always land before depth 25 and it keeps coming
  // at the same pace after). The coin state holds a resolved Davy's Coin wager.
  const nextShrineRef = useRef(SHRINE_FIRST_DEPTH)
  const [shrineCoin, setShrineCoin] = useState<{ result: 'win' | 'lose'; stake: number; fathoms: number } | null>(null)
  const [shrineFlipping, setShrineFlipping] = useState(false)
  // The Black Market (Don's only) — next combat depth a stall is due, the stock
  // rolled for the current visit, the ids already bought this visit, and the id
  // whose purchase is mid-flight (buttons lock while the server round-trips).
  const nextMerchantRef = useRef(MERCHANT_FIRST_DEPTH)
  const [merchantStock, setMerchantStock] = useState<MerchantItemKind[]>([])
  const [merchantSold, setMerchantSold] = useState<Set<MerchantItemKind>>(new Set())
  const [merchantBuying, setMerchantBuying] = useState<MerchantItemKind | null>(null)
  // The Fence spends RUN-EARNED Fathoms (this dive's haul), not the banked purse.
  // fenceSpent is the run tab, settled against the earned grant at cash-out.
  const fenceSpentRef = useRef(0)
  const [fenceSpent, setFenceSpent] = useState(0)
  // Intro-only gauntlet switcher (shown when the OTHER gauntlet is also unlocked).
  const [switcherOpen, setSwitcherOpen] = useState(false)
  // Banked Fathoms, mirrored so a shrine wager can update it live without a
  // refetch (Fathoms only change here or at cashout/Locker, all of which resync).
  const [fathomsNow, setFathomsNow] = useState(props.fathoms)
  useEffect(() => { setFathomsNow(props.fathoms) }, [props.fathoms])
  // Blood Gems balance, mirrored so a Hardcore cash-out can tick it live.
  const [bloodGemsNow, setBloodGemsNow] = useState(props.bloodGems)
  useEffect(() => { setBloodGemsNow(props.bloodGems) }, [props.bloodGems])
  // Currency info popup (tap a purse pill to learn what it's for).
  const [infoCurrency, setInfoCurrency] = useState<'fathoms' | 'blood' | null>(null)
  const [shrineStake, setShrineStake] = useState(SHRINE_WAGER_MAX)
  // Whether the current boon draft came from a shrine's Blood Price (reflavors
  // the draft header) vs a normal depth draft.
  const [boonFromShrine, setBoonFromShrine] = useState(false)
  // Tapped boon/curse/confluence on the breather screen → details popup.
  const [detailEffect, setDetailEffect] = useState<
    { kind: 'boon' | 'curse' | 'confluence'; name: string; desc: string; detail: string; flavor: string; count: number; maxTier?: number; image?: string | null
      /** The whole ladder, so the popup can show what you hold AND what the next
       *  rung buys. Built from the boon's own tiers / the confluence's levels,
       *  so a retune can never leave stale copy here. */
      rungs?: { label: string; desc: string; held: boolean; current: boolean }[] } | null
  >(null)
  const [reward, setReward] = useState<CashResult | null>(null)
  const [resolving, setResolving] = useState(false)
  // Fathoms salvaged from a sunk run (the meta-currency still pays for the dive).
  const [deathFathoms, setDeathFathoms] = useState(0)
  // The Locker — two separate shops, each opened to its own section:
  // 'run' = perks for the descent itself, 'shore' = upgrades for the wider game.
  const [shopSection, setShopSection] = useState<'run' | 'shore' | null>(null)
  // Per-mode loot guide (Normal / Hardcore), opened from under each descent card.
  const [lootMode, setLootMode] = useState<'normal' | 'hardcore' | null>(null)
  const [synergiesOpen, setSynergiesOpen] = useState(false)
  // Discovered confluences (codex fog). Mirrored so a first-ever unlock reveals
  // it live in the codex; resynced if the server sends a fresh prop.
  const [seenConfluences, setSeenConfluences] = useState<string[]>(props.confluencesSeen)
  useEffect(() => { setSeenConfluences(props.confluencesSeen) }, [props.confluencesSeen])
  // Deepest-run recap modal (boons/curses/tides of the record dive).
  // The deepest-run recap, per mode (Normal or Hardcore). Holds the snapshot to
  // show + whether it's a hardcore run (drives the modal's theming).
  const [recapRun, setRecapRun] = useState<{ hardcore: boolean } | null>(null)

  // ── Don's Contracts — chance-based "jobs" offered on the way down (Don's
  // only). The offer (3 pre-built stakes) shows on the 'contract' phase; taking
  // one stores it as the active contract that rides the NEXT fight, then its
  // combat facts are judged in resolution below (checkContract →
  // resolveContractOutcome → 'contract_result'). See lib/gauntletContracts.
  const [contractOffer, setContractOffer] = useState<{ kind: ContractKind; offers: ContractOffer[] } | null>(null)
  // The job you took, riding the next fight. The REF is the source of truth read
  // in handleEnemyDefeated (a combat callback — a ref dodges its stale closure);
  // the STATE mirror drives the live HUD chip during the contracted fight.
  const activeContractRef = useRef<ContractOffer | null>(null)
  const [contractChip, setContractChip] = useState<ContractOffer | null>(null)
  // Facts the combat engine reports the instant the contracted hull sinks
  // (onContractFacts fires just before onEnemyDefeated). Judged in resolution.
  const contractFactsRef = useRef<ContractFightFacts | null>(null)
  // The resolved job (win/loss) held for the result beat.
  const [contractResult, setContractResult] = useState<{ offer: ContractOffer; cleared: boolean } | null>(null)
  // Jobs cleared this run + the bonus each paid — shown on the battle profile
  // and the end-of-run recap. Ref is the snapshot/combat source of truth; state
  // mirror drives the profile render.
  const contractsWonRef = useRef<{ name: string; reward: string }[]>([])
  const [contractsWon, setContractsWon] = useState<{ name: string; reward: string }[]>([])
  // Run-wide max-hull multiplier a cleared hull-boost contract stacks onto. Folds
  // into hpMax below; the hpMax heal-on-increase effect tops the player up by the
  // gained ceiling for free. Reset to 1 at run start.
  const [contractHullMult, setContractHullMult] = useState(1)
  // The "Don Finleone Falls" victory beat holds the rise index it's showing. The
  // ref is set at the kill (survives the contract-first ordering) and consumed at
  // the top of proceedAfterFight so the beat runs after any contract result.
  const [donFallen, setDonFallen] = useState<number | null>(null)
  const pendingDonFallRef = useRef<number | null>(null)
  // The two Marks offered on a fall (Shark / Whale), and the sear animation state
  // (the chosen type while its brand burns in, before the run continues).
  const [markOffer, setMarkOffer] = useState<{ shark: MarkBuff[]; whale: MarkBuff[] } | null>(null)
  const [markSearing, setMarkSearing] = useState<MarkType | null>(null)
  function takeContract(offer: ContractOffer) {
    activeContractRef.current = offer
    setContractChip(offer)
    contractFactsRef.current = null
    vibrate([0, 25, 30, 25])
    setContractOffer(null)
    setPhase('descending')
  }
  function walkContract() {
    vibrate([0, 12])
    setContractOffer(null)
    setPhase('descending')
  }
  // Mid-fight bail-out guard. The ← button is easy to mis-tap, and leaving a
  // live run forfeits the whole pot — so confirm first.
  const [confirmLeave, setConfirmLeave] = useState(false)
  // Confirm before banking the haul + ending the run on the breather.
  const [confirmClaim, setConfirmClaim] = useState(false)
  // The breather's loadout (powers / synergies / curses) folds away by default. It is
  // reference material you consult, not news you need every single depth, and left
  // open it pushed the actual decision below the fold.
  const [loadoutOpen, setLoadoutOpen] = useState(false)
  // DAVY'S OFFER — the banker's bargain. Rolled and stored by the SERVER when a
  // breather opens; we are only ever told what it is. Cleared the instant we dive,
  // so it can never be carried down to a fatter pot.
  const [offer, setOffer] = useState<DavyOffer | null>(null)
  // First-timer explainer. Auto-opens once (server flag), reopenable via the
  // "How it works" link.
  const [introOpen, setIntroOpen] = useState(!props.hasSeenIntro)

  // Guardrail counters live in refs (read inside combat callbacks).
  const rollStateRef = useRef<GauntletRollState>({ cleared: 0, prevWasBoss: false, roundsSinceBoss: 0 })
  const playerHPRef = useRef(baseHpMax)
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
  // Fun run telemetry — folded from RaidCombat's onStat deltas across the dive.
  const runStatsRef = useRef<GauntletRunStats>(emptyRunStats())
  // Lethal-save charges (Quartermaster's Anchor etc.) — a per-RUN pool that
  // survives the per-fight RaidCombat remounts, decremented when one fires.
  // Reset each run in begin().
  const anchorSavesLeftRef = useRef(
    getActiveEffects(props.equippedItems).filter(e => e.type === 'lethal_save').reduce((a, e) => a + e.value, 0),
  )
  // Extra cannonball slots from claimed Locker Upgrades. Seeded from the server
  // prop but kept in state so a purchase mid-session applies without a refresh.
  const [bonusSlots, setBonusSlots] = useState(props.bonusChargeSlots)

  // ── Live max HP ────────────────────────────────────────────────────────────
  // The run's effect list (boons + confluences + curses), shared by the combat
  // props and the max-HP calc so both read one source.
  const runEffects = [
    ...boonEffects(boonTiers),
    ...confluenceEffects(boonTiers, confluencesTaken),
    ...convergenceEffects(boonTiers, confluencesTaken, convergencesTaken),
    ...curseEffects(curseTiers),
    // Marks of the Don — chosen offense/defense bundles ride the same pipeline
    // (incl. maxHpMult, which hpBoonMult below folds into the ceiling).
    ...markFx,
    // Skill terms (Nothing but Gold) are honest combat modifiers, so they ride
    // the same pipeline. Hardcore only — a normal dive never signs anything.
    ...termTideEffects(hardcoreRun ? signedTerms : {}),
  ]
  // Base ceiling × the HP-scaling boons (Deep / Salvage / Reinforced Hull), read
  // off the current depth + hulls sunk. Grows across the run; the effect below
  // heals the player by any increase, so a gained hull is a gained ceiling AND HP.
  const curDepthForHp = fight?.depth ?? (rollStateRef.current.cleared + skipOffset + 1)
  // Deep Draft (a signed Term) lowers the CEILING, so every heal tops you up to
  // the smaller number. Applied before the boon scaling.
  const hpMax = Math.max(1, Math.round(baseHpMax * termFx.maxHpPct * hpBoonMult(runEffects, curDepthForHp, rollStateRef.current.cleared) * contractHullMult))
  const prevHpMaxRef = useRef(hpMax)
  useEffect(() => {
    const delta = hpMax - prevHpMaxRef.current
    if (delta > 0) {
      playerHPRef.current = Math.min(hpMax, playerHPRef.current + delta)
      setPlayerHP(playerHPRef.current)
    } else if (delta < 0 && playerHPRef.current > hpMax) {
      // Ceiling dropped (a contract hull cut) — clamp current hull down to it.
      playerHPRef.current = hpMax
      setPlayerHP(hpMax)
    }
    prevHpMaxRef.current = hpMax
  }, [hpMax])

  // Boons / curses held this run, resolved to {name, tier, image, desc, color}
  // so the battle profile can render them as icon cards on its Effects tab.
  const runBoonsList = Object.entries(boonTiers).flatMap(([id, tier]) => {
    const fam = GAUNTLET_BOONS.find(b => b.id === id)
    if (!fam || tier < 1) return []
    return [{ id, name: fam.name, tier, image: fam.image, desc: fam.tiers[Math.min(tier, fam.tiers.length) - 1]?.desc ?? '', color: BOON_RARITY_META[boonRarity(fam)].color }]
  })
  const runCursesList = Object.entries(curseTiers).flatMap(([id, tier]) => {
    const c = GAUNTLET_CURSES.find(x => x.id === id)
    if (!c || tier < 1) return []
    return [{ id, name: c.name, tier, image: c.image, desc: c.tiers[Math.min(tier, c.tiers.length) - 1]?.desc ?? '', color: '#f08a8a' }]
  })

  // ── Mid-run exit guard ─────────────────────────────────────────────────────
  // Same shape as RaidGame's: any attempt to leave a live descent (tab bar, nav
  // link, browser Back) is intercepted and routed through the abandon confirm
  // instead of silently forfeiting the pot. beforeunload covers a hard refresh /
  // tab close with the browser's native prompt. Active across the whole run
  // (every in-fight + interstitial phase) so the Back sentinel is pushed once.
  const runLive = phase === 'descending' || phase === 'fighting'
    || phase === 'curse' || phase === 'boon' || phase === 'shrine' || phase === 'merchant' || phase === 'contract' || phase === 'contract_result' || phase === 'don_fallen' || phase === 'mark_choice' || phase === 'between'
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

  // Hardcore dread — hang an ominous blood vignette over the WHOLE viewport
  // for the duration of a hardcore run (and its death screen) so it's never in
  // doubt which mode you're in. A body class drives a fixed ::after in
  // globals.css (edge-only + a slow breathing pulse), so it survives every
  // phase's early-return render and the PageTransition/fixed pitfalls.
  useEffect(() => {
    const on = hardcoreRun && (runLive || phase === 'dead')
    document.body.classList.toggle('hardcore-gauntlet', on)
    return () => document.body.classList.remove('hardcore-gauntlet')
  }, [hardcoreRun, runLive, phase])

  // Body-scroll lock in installed PWA only, and ONLY during combat (keeps the
  // action buttons reachable — same reasoning as RaidGame). The meta screens
  // (intro/cooldown/between/reward/dead) are taller and must stay scrollable.
  // position:fixed lock (lib/bodyScrollLock), NOT overflow:hidden — on iOS the
  // overflow lock still let chained/rubber-band drags scroll the document mid-
  // fight, visually carrying the fixed header away while hit-testing stayed
  // put (the "have to tap below the Lock button" bug).
  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (!standalone) return
    if (phase !== 'fighting') return
    return lockBodyScroll()
  }, [phase])

  // Land every new screen at the top. Without this a tall body-scrolled meta
  // screen (the between/dive-deeper breather, the reward crate) could inherit a
  // scrolled-down position from the phase before it and open "locked" halfway
  // down, hiding its own header. The fixed-height fight region resets its own
  // scroll on remount, so this only matters for the document-scrolled screens.
  useEffect(() => {
    window.scrollTo(0, 0)
    document.querySelector('.raid-combat-region')?.scrollTo(0, 0)
  }, [phase])

  function dismissIntro() {
    setIntroOpen(false)
    if (!props.hasSeenIntro) markGauntletIntroSeen(props.variant).catch(() => {})
  }

  /** Tear down the pre-dive surfaces. Called only once the run's fate is known,
   *  never before the server answers — closing them early leaves the idle home
   *  screen visible behind the in-flight request, which reads as a flash. */
  function closePreDive() {
    setModeChoiceOpen(false); setHcConfirmOpen(false); setTermsOpen(false)
  }

  function begin(hardcore = false) {
    if (starting) return
    setStarting(true)
    startGauntletRun(hardcore, hardcore ? signedTermsRef.current : undefined, props.variant).then(res => {
      if (!res.started) {
        setStarting(false)
        closePreDive()
        if (res.reason === 'cooldown') { if (res.nextAt) setCooldownUntil(res.nextAt); setPhase('usedup'); return }
        // One run at a time: the OTHER gauntlet still has an unfinished run.
        if (res.reason === 'other_run') { setHcBlockedMsg(`You have an unfinished ${props.variant === 'don' ? 'Davy Jones' : "Don's"} Gauntlet run. Finish or bank it first.`); return }
        // Hardcore was rejected server-side (gate not met / no living squad).
        setHcBlockedMsg(res.reason === 'no_squad'
          ? 'Assign at least one crew to your raid party first — that party is the squad you risk.'
          : 'The Hardcore Gauntlet is not open to you yet.')
        return
      }
      closePreDive()
      setHardcoreRun(hardcore)
      // Resolve the signed Terms EAGERLY, right here. termFxRef is mirrored from
      // state by an effect, and `hardcoreRun` has not flushed yet at this point —
      // so reading termFxRef.current now would hand back NO_TERM_EFFECTS, and the
      // FIRST fight of a signed run would be generated (and its starting hull set,
      // and its lethal saves granted) as though nothing had been signed at all.
      // This is HARDCORE: the terms must be true from the very first shot.
      const fx = hardcore ? resolveTerms(signedTermsRef.current) : NO_TERM_EFFECTS
      termFxRef.current = fx
      const runHpMax = Math.max(1, Math.round(baseHpMax * fx.maxHpPct))
      // Fresh run.
      rollStateRef.current = { cleared: 0, prevWasBoss: false, roundsSinceBoss: 0 }
      playerHPRef.current = runHpMax
      prevHpMaxRef.current = runHpMax
      potRef.current = 0
      runEventsRef.current = []
      recordShownRef.current = false
      setUncharted(false)
      setPotGain(null)
      carriedChargesRef.current = 0
      runMaxHitRef.current = 0
      runStatsRef.current = emptyRunStats()
      // Deep Draft (a signed Term) cut the ceiling, so a full hull IS the smaller number.
      setPlayerHP(runHpMax)
      setPot(0)
      setBossesDefeated(0)
      setUsedAbilityIds(new Set())
      setUsedRaidItemIds(new Set())
      setCurseTiers({}); curseTiersRef.current = {}
      // Dead Hands: clear the silenced-crew set too, or a new run keeps locking
      // last run's silenced crew (fight-open re-silences straight from this ref,
      // never re-checking the now-empty curse count) — the "silence outlives the
      // run" bug.
      silencedCrewIdsRef.current = []
      setPendingCurse(null)
      // Blood Oath (Don's): open the run already holding one random boon. Seed
      // boonTiers before the reset settles so combat + the boon tracker see it
      // from the first fight. Non-legendary, non-Mega-gated (see pickBloodOathBoon).
      const oathBoon = gauntletHasBloodOath(activeUpgrades) ? pickBloodOathBoon(props.variant) : null
      setOathBoon(oathBoon)
      setBoonTiers(oathBoon ? { [oathBoon]: 1 } : {}); setConfluencesTaken([]); setPendingBoons(null); setPendingConfluence(null); setPendingReprieve(null); offeredConfluenceIdsRef.current = new Set()
      bannedBoonsRef.current = new Set(); setFiltersLeft(gauntletBoonFilters(activeUpgrades))
      setBanArmed(false); setBanConfirm(null)
      setConfluenceUnlocked(null); setConfluenceBanner(null); setCurseShed(null)
      nextShrineRef.current = SHRINE_FIRST_DEPTH; setShrineCoin(null); setShrineFlipping(false); setBoonFromShrine(false)
      nextMerchantRef.current = MERCHANT_FIRST_DEPTH; setMerchantStock([]); setMerchantSold(new Set()); setMerchantBuying(null)
      fenceSpentRef.current = 0; setFenceSpent(0)
      peekFightRef.current = null; setPeekFight(null)
      crewRefreshedRef.current = false; setFightOpensRefreshed(false)
      calmBeforeUsedRef.current = false
      // Clear any contract left dangling by a sunk run so it can't ride the next
      // dive's first fight or flash a stale chip.
      activeContractRef.current = null; contractFactsRef.current = null
      setContractChip(null); setContractOffer(null); setContractResult(null)
      setContractHullMult(1)
      contractsWonRef.current = []; setContractsWon([])
      // Fresh run: no Marks earned, no pending Don beat / offer.
      setMarks([]); setDonFallen(null); pendingDonFallRef.current = null
      setMarkOffer(null); setMarkSearing(null)
      // No Mercy (a signed Term): the Anchor does not hold. The first blow that
      // would sink you, sinks you.
      anchorSavesLeftRef.current = fx.noLethalSaves ? 0 : getActiveEffects(props.equippedItems)
        .filter(e => e.type === 'lethal_save').reduce((a, e) => a + e.value, 0)
        // Second Wind (Don's Locker): one extra lethal-save seeded at run start.
        + gauntletStartAnchorSaves(activeUpgrades)
      setFight(generateFight(rollStateRef.current, skipOffset, fx, props.variant))
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
    setHardcoreRun(false)
    setPhase('intro')
    router.refresh()
  }

  // Descent flow modals — shown from the home screens (intro + cooldown-ready).
  // The Descend button opens a Normal / Hardcore CHOICE; picking Hardcore opens
  // a stark, squad-naming confirmation before any crew are ever put at risk.
  const HC_ACCENT = '#8b7bf0'
  const DANGER = '#ef4444'
  const squadAtRisk = props.crewMembers
  const descentModals = (
    <>
      {modeChoiceOpen && (
        <div onClick={() => setModeChoiceOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(2,6,12,0.84)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem', overflowY: 'auto' }}>
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 400, borderRadius: 22, padding: '1.25rem 1.1rem 1.15rem', background: 'linear-gradient(180deg, rgba(15,23,36,0.99), rgba(7,12,20,0.99))', border: `1px solid ${GOLD}33`, boxShadow: '0 24px 70px rgba(0,0,0,0.65)' }}>
            <p className="font-cinzel font-800" style={{ fontSize: '1.15rem', color: '#f3ead2', textAlign: 'center', lineHeight: 1.05 }}>Choose Your Descent</p>
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#8a8f98', textAlign: 'center', marginTop: 4, marginBottom: 14 }}>Two ways down. One puts your crew on the line.</p>
            {(() => {
              const canHc = props.hardcoreUnlocked
              const comingSoon = !canHc && !props.hardcoreLive
              // Shared card shell so the two read as a matched pair.
              const Card = ({ accent, title, titleColor, icon, desc, enabled, onClick, footer }: {
                accent: string; title: string; titleColor: string; icon: React.ReactNode; desc: string; enabled: boolean; onClick?: () => void; footer: React.ReactNode
              }) => (
                <motion.button
                  onClick={enabled ? onClick : undefined}
                  disabled={!enabled || starting}
                  whileHover={enabled ? { y: -4 } : undefined}
                  whileTap={enabled ? { scale: 0.955 } : undefined}
                  transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                  style={{
                    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                    padding: '1.1rem 0.7rem 0.85rem', borderRadius: 17, position: 'relative', overflow: 'hidden',
                    background: `linear-gradient(180deg, ${accent}26 0%, ${accent}0c 52%, rgba(8,13,22,0.35) 100%)`,
                    border: `1px solid ${accent}${enabled ? '77' : '2e'}`,
                    boxShadow: enabled ? `0 0 22px ${accent}22, inset 0 1px 0 ${accent}33` : 'none',
                    cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.58,
                  }}
                >
                  {/* top sheen */}
                  <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '42%', background: `radial-gradient(ellipse at 50% -20%, ${accent}22, transparent 70%)`, pointerEvents: 'none' }} />
                  {/* emblem */}
                  <div style={{ width: 54, height: 54, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: titleColor, background: `radial-gradient(circle at 40% 30%, ${accent}4d, ${accent}12)`, border: `1px solid ${accent}77`, boxShadow: `0 0 18px ${accent}3a`, marginBottom: 11, flexShrink: 0 }}>
                    {icon}
                  </div>
                  <p className="font-cinzel font-800" style={{ fontSize: '1.05rem', color: titleColor, lineHeight: 1.02 }}>{title}</p>
                  <p className="font-karla" style={{ fontSize: '0.68rem', color: 'rgba(240,237,232,0.66)', lineHeight: 1.38, marginTop: 6, flex: 1 }}>{desc}</p>
                  <div style={{ width: '100%', marginTop: 11, padding: '0.42rem 0.4rem', borderRadius: 10, background: `${accent}16`, border: `1px solid ${accent}3a` }}>
                    {footer}
                  </div>
                </motion.button>
              )
              const chevrons = <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 5l6 6 6-6" /><path d="M6 13l6 6 6-6" /></svg>
              const skull = <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a7 7 0 0 0-7 7v3.4c0 .9.6 1.7 1.5 2l.5.2V19a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3.4l.5-.2c.9-.3 1.5-1.1 1.5-2V10a7 7 0 0 0-7-7Z" /><circle cx="9" cy="11" r="1.4" fill="currentColor" stroke="none" /><circle cx="15" cy="11" r="1.4" fill="currentColor" stroke="none" /><path d="M11 15.5h2" /></svg>
              return (
                <div style={{ display: 'flex', gap: 11, alignItems: 'stretch' }}>
                  <Card
                    accent={AC} title="Normal" titleColor={AC} icon={chevrons} enabled={!starting}
                    desc="Push your luck for the pot. Your crew are never at risk."
                    onClick={() => begin(false)}
                    footer={<>
                      <p className="font-karla font-700 uppercase" style={{ fontSize: '0.48rem', letterSpacing: '0.1em', color: `${AC}cc` }}>Your Deepest</p>
                      <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#dbf5ef' }}>{props.deepest > 0 ? `Depth ${props.deepest}` : 'Uncharted'}</p>
                    </>}
                  />
                  <Card
                    accent={DANGER} title="Hardcore" titleColor={canHc ? '#fca5a5' : 'rgba(252,165,165,0.8)'} icon={skull} enabled={canHc && !starting && props.hcRunsLeft > 0}
                    desc="The squad you send in dies for good if you fall. Its own hiscore and cosmetics."
                    onClick={() => { setModeChoiceOpen(false); setHcConfirmOpen(true) }}
                    footer={comingSoon
                      ? <p className="font-karla font-800 uppercase" style={{ fontSize: '0.52rem', letterSpacing: '0.12em', color: HC_ACCENT }}>Coming Soon</p>
                      : !canHc
                      // Live but not yet eligible — the only unmet gate here is the
                      // normal-Gauntlet depth floor (they're already on the page).
                      ? <><p className="font-karla font-700 uppercase" style={{ fontSize: '0.48rem', letterSpacing: '0.1em', color: `${DANGER}cc` }}>Locked</p>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#f3d6d6', lineHeight: 1.2 }}>Reach depth {HC_UNLOCK_DEPTH} in the Gauntlet</p></>
                      : <>
                          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.48rem', letterSpacing: '0.1em', color: `${DANGER}cc` }}>Hardcore Best</p>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#f3d6d6' }}>
                            {props.hcDeepest > 0 ? `Your best · ${props.hcDeepest}` : props.hardcoreTop ? `#1 · Depth ${props.hardcoreTop.depth}` : 'Unclaimed'}
                          </p>
                          <p className="font-karla font-700" style={{ fontSize: '0.6rem', color: props.hcRunsLeft > 0 ? '#c48a8a' : '#e0555a', marginTop: 3 }}>
                            {props.hcRunsLeft > 0 ? `${props.hcRunsLeft} of ${HARDCORE_RUNS_PER_DAY} runs left today` : 'No runs left today'}
                          </p>
                        </>}
                  />
                </div>
              )
            })()}
            <button onClick={() => setModeChoiceOpen(false)} className="font-karla font-600 tap" style={{ display: 'block', margin: '13px auto 0', background: 'none', border: 'none', color: '#7f7a72', fontSize: '0.74rem', cursor: 'pointer' }}>Back</button>
          </motion.div>
        </div>
      )}

      {termsOpen && (
        <GauntletTermsPanel
          signed={signedTerms}
          variant={props.variant}
          onChange={setSignedTerms}
          onDone={() => setTermsOpen(false)}
        />
      )}

      {hcConfirmOpen && (
        <div onClick={() => setHcConfirmOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1310, background: 'rgba(10,2,4,0.88)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 380, borderRadius: 20, padding: '1.35rem 1.15rem 1.15rem', textAlign: 'center', background: 'linear-gradient(180deg, rgba(30,10,12,0.99), rgba(14,6,8,0.99))', border: `1px solid ${DANGER}66`, boxShadow: `0 0 44px ${DANGER}22, 0 18px 50px rgba(0,0,0,0.6)` }}>
            <p className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.24em', color: `${DANGER}cc` }}>No Turning Back</p>
            <p className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#f3d7d7', lineHeight: 1.08, marginTop: 8 }}>Send Them Down?</p>
            <p className="font-karla" style={{ fontSize: '0.84rem', color: 'rgba(240,220,220,0.82)', lineHeight: 1.5, marginTop: 10, maxWidth: 320, marginInline: 'auto' }}>
              If you <strong style={{ color: '#fca5a5' }}>fall or abandon</strong> this run, these crew are lost to the Locker — <strong style={{ color: '#fca5a5' }}>gone for good</strong>, and remembered only in your Crew Hall.
            </p>
            {/* The exact squad at risk. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center', marginTop: 14 }}>
              {squadAtRisk.map(c => (
                <div key={c.id} title={c.name} style={{ width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${DANGER}77`, background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.08), rgba(20,10,12,0.9))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {c.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={c.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(0.85)' }} />
                    : <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#e6b0b0' }}>{c.name.slice(0, 1)}</span>}
                </div>
              ))}
            </div>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.14em', color: '#c48a8a', marginTop: 10 }}>{squadAtRisk.length} crew at risk</p>
            {/* THE UPSIDE. This used to promise Blood Gems and stop there, which sold
                Hardcore short by three whole items: the Blood Cannon, the Bad Blood Hull
                and the Pitch Black Hull all drop ONLY here and were never named at the
                one screen where a captain decides to risk the crew for them. If we are
                going to ask someone to wager their roster, we can at least tell them
                everything that is on the other side of it. */}
            <p className="font-karla" style={{ fontSize: '0.8rem', color: '#f0cfcf', lineHeight: 1.45, marginTop: 13 }}>
              Bring them home alive and the chest pays <strong style={{ color: '#fca5a5' }}>Blood Gems</strong>, earned nowhere else.
            </p>
            <div style={{ marginTop: 9, padding: '0.6rem 0.7rem', borderRadius: 11, textAlign: 'left',
              background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(220,38,38,0.28)' }}>
              <p className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#c48a8a', marginBottom: 5 }}>
                Drops Only on Hardcore
              </p>
              {/* Per descent, because the lists share nothing. Davy's hardcore
                  holds three; the Don's holds one, since his two hulls are NORMAL
                  drops and the Pitch Black Hull is Davy-only (see cashOut's
                  `!isDon` gate). Listing Davy's on a Don's dive promised a cannon
                  and two skins that cannot drop there. */}
              {(isDonG
                ? [{ name: "Don's Palisade", note: 'the only regenerating ward in the game' }]
                : [
                  { name: "Davy's Blood Cannon", note: 'the only lifesteal in the game' },
                  { name: 'Bad Blood Hull', note: 'Man-o-War skin' },
                  { name: 'Pitch Black Hull', note: `Man-o-War skin · needs ${PRESSURE_SKIN_THRESHOLD}+ Pressure, banked from depth ${PRESSURE_SKIN_DEPTH}` },
                ]).map(d => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
                  <span aria-hidden style={{ flexShrink: 0, width: 3, height: 3, borderRadius: 999, background: '#fca5a5', transform: 'translateY(-2px)' }} />
                  <p className="font-karla" style={{ fontSize: '0.7rem', color: '#f0cfcf', lineHeight: 1.35 }}>
                    <strong className="font-700" style={{ color: '#fca5a5' }}>{d.name}</strong>
                    <span style={{ color: '#a88a8a' }}> · {d.note}</span>
                  </p>
                </div>
              ))}
            </div>

            {/* ── Davy's Terms — a section you open, sign, and come back from.
                The board is a sub-modal; the descent is confirmed HERE. ── */}
            <button onClick={() => setTermsOpen(true)} disabled={starting} className="tap"
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                marginTop: 14, padding: '0.85rem 0.9rem', borderRadius: 13, cursor: 'pointer',
                background: pressure > 0 ? 'rgba(240,192,64,0.1)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${pressure > 0 ? 'rgba(240,192,64,0.55)' : 'rgba(255,255,255,0.14)'}`,
                boxShadow: pressure > 0 ? '0 0 18px rgba(240,192,64,0.14)' : 'none',
              }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.02rem', color: pressure > 0 ? '#f0c040' : '#e0d6d6' }}>
                  {termsTitle(isDonG ? 'don' : 'davy')}
                </p>
                <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(240,220,220,0.62)', marginTop: 2, lineHeight: 1.35 }}>
                  {pressure > 0
                    ? `${signedTermCount} signed, ${pressure} Pressure`
                    : 'Make the dive harder, and pay far more Blood Gems'}
                </p>
              </div>
              {pressure > 0 && (
                <span className="font-cinzel font-800" style={{ flexShrink: 0, fontSize: '1.2rem', color: '#f0c040', textShadow: '0 0 12px rgba(240,192,64,0.5)' }}>
                  ×{gemMultAtFullDepth.toFixed(2)}
                </span>
              )}
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={pressure > 0 ? '#f0c040' : '#9a8e8e'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m9 18 6-6-6-6" /></svg>
            </button>

            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.12em', color: '#c48a8a', marginTop: 13 }}>
              {props.hcRunsLeft} of {HARDCORE_RUNS_PER_DAY} hardcore runs left today
            </p>
            <button onClick={() => begin(true)} disabled={starting} className="font-cinzel font-800 tap"
              style={{ width: '100%', marginTop: 9, padding: '1.05rem', borderRadius: 13, fontSize: '1.2rem', lineHeight: 1.1, color: '#170a0a', border: 'none', cursor: starting ? 'wait' : 'pointer',
                background: pressure > 0 ? 'linear-gradient(180deg, #ffd868, #f0c040 55%, #d4a02c)' : `linear-gradient(180deg, #f0797d, ${DANGER} 55%, #b83f45)`,
                boxShadow: `0 6px 22px ${pressure > 0 ? '#f0c040' : DANGER}44`, textShadow: '0 1px 0 rgba(255,255,255,0.25)' }}>
              {starting ? 'Descending' : pressure > 0 ? 'Sign and Descend' : 'Descend into the Locker'}
            </button>
            <button onClick={() => setHcConfirmOpen(false)} className="font-karla font-600 tap" style={{ marginTop: 11, background: 'none', border: 'none', color: '#9a8e8e', fontSize: '0.76rem', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Not this time
            </button>
          </div>
        </div>
      )}

      {hcBlockedMsg && (
        <div onClick={() => setHcBlockedMsg(null)} style={{ position: 'fixed', inset: 0, zIndex: 1320, background: 'rgba(2,6,12,0.82)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <motion.div onClick={e => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          style={{ width: '100%', maxWidth: 340, borderRadius: 16, padding: '1.15rem', textAlign: 'center', background: 'linear-gradient(180deg, rgba(14,22,34,0.99), rgba(7,13,22,0.99))', border: `1px solid ${HC_ACCENT}55` }}>
            <p className="font-karla" style={{ fontSize: '0.86rem', color: '#e0dccc', lineHeight: 1.5 }}>{hcBlockedMsg}</p>
            <button onClick={() => setHcBlockedMsg(null)} className="font-karla font-700 tap" style={{ marginTop: 14, padding: '0.6rem 1.4rem', borderRadius: 10, background: `${HC_ACCENT}1e`, border: `1px solid ${HC_ACCENT}66`, color: '#cfc4ff', fontSize: '0.8rem', cursor: 'pointer' }}>Got it</button>
          </motion.div>
        </div>
      )}
    </>
  )

  // Pre-roll the next fight the moment the breather opens, so Sounding Line can
  // reveal it AND pushOn fights the very same roll (no re-roll = no lie). The
  // roll state doesn't change between here and the push, so this is consistent.
  useEffect(() => {
    if (phase !== 'between') return
    const nf = generateFight(rollStateRef.current, skipOffset, termFxRef.current, props.variant)
    peekFightRef.current = nf
    // Blind Descent (a signed Term): the roll is still pre-committed (pushOn must
    // fight the same one), you just don't get to see it.
    setPeekFight(termFxRef.current.noPeek ? null : nf)
    // Crash safety net: checkpoint the settled run state at every breather so an
    // interruption resumes here (worst case: redo the fight you were in).
    // Then ask Davy whether he wants to make an offer. The checkpoint goes FIRST and
    // is awaited, because the server reads the depth out of that very row — so the
    // depth an offer is stamped with is one we wrote, never one the client named.
    void (async () => {
      await checkpointGauntletRun(buildCheckpoint()).catch(() => {})
      const hpPct = playerHPRef.current / Math.max(1, hpMax)
      const { offer: o } = await rollDavyOffer(hpPct).catch(() => ({ offer: null }))
      setOffer(o)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, skipOffset])

  // The descent beat: a short fall-into-the-dark interstitial before each fight
  // so dropping deeper reads as a real plunge, not a hard cut. Fight is already
  // generated by the time we land here; we just hold the cut for a moment.
  useEffect(() => {
    if (phase !== 'descending') return
    // Uncharted water — the first depth past the mode's standing record fires
    // its beat HERE, on the descent splash, while the stakes are live (the
    // old flow only told you at cash-out). Requires a real record (>= 5) so a
    // first-ever dive isn't wall-to-wall banners.
    const best = hardcoreRun ? props.hcDeepest : props.deepest
    const d = fight?.depth ?? 0
    let firedBeat = false
    if (!recordShownRef.current && best >= 5 && d > best) {
      recordShownRef.current = true
      firedBeat = true
      setUncharted(true)
      setRecordBeat(true)
      vibrate([0, 24, 60, 32])
    } else {
      setRecordBeat(false)
    }
    // Hold longer on depths where Davy speaks, so his taunt is readable —
    // and on the uncharted beat, so the record moment lands. The Don apex gets
    // the longest hold + a heavy haptic: his rise is an EVENT, not a fight.
    const hasTaunt = fight ? gauntletTaunt(fight.depth, props.variant) !== null : false
    const isApexFight = fight?.isApex === true
    if (isApexFight) vibrate([0, 45, 90, 45, 140])
    const t = setTimeout(() => setPhase('fighting'), isApexFight ? 4200 : hasTaunt ? 3000 : firedBeat ? 2200 : 1350)
    return () => clearTimeout(t)
  }, [phase, fight])

  // Boon-draft reveal sequence — seal all three, then charge + flip them open
  // worst -> best so the rarest pull lands last as the climax (mirrors the Crew
  // Hall recruit reveal). The flip itself carries the haptic/SFX payoff per
  // rarity; legendary also fires a screen flash + banner.
  useEffect(() => {
    if (phase !== 'boon' || !pendingBoons) { setBoonPhases({}); setBoonBanner(null); return }
    const rank = (r: string) => (r === 'legendary' ? 3 : r === 'rare' ? 2 : 1)
    // Only reveal the SHOWN cards — a confluence offer takes one boon slot, so
    // the hidden 3rd boon must not flip (or fire a banner the player can't see).
    const shown = pendingBoons.slice(0, boonCardCount)
    const init: Record<number, 'sealed' | 'charging' | 'flipped'> = {}
    shown.forEach((_, i) => { init[i] = 'sealed' })
    setBoonPhases(init)
    setBoonBanner(null)
    const order = shown
      .map((b, i) => ({ i, r: rank(b.rarity), name: b.name }))
      .sort((a, c) => a.r - c.r)   // rarest last
    const timers: ReturnType<typeof setTimeout>[] = []
    // Flip a card open + fire its rarity payoff.
    const doFlip = (o: { i: number; r: number; name: string }) => {
      setBoonPhases(p => ({ ...p, [o.i]: 'flipped' }))
      if (o.r === 3) {
        setBoonFlash(1000 + o.i)
        setBoonBanner({ name: o.name, key: 1000 + o.i })
        vibrate([0, 50, 40, 70, 40, 110])
        import('@/lib/fishingMusic').then(m => m.playChestSfx(true)).catch(() => {})
      } else if (o.r === 2) {
        vibrate([0, 32, 40, 52])
        import('@/lib/fishingMusic').then(m => m.playChestSfx(false)).catch(() => {})
      }
    }
    let t = 120
    order.forEach((o, pos) => {
      const isLast = pos === order.length - 1
      if (o.r === 3) {
        // Legendary: the one card that earns a wind-up — a brief rattle, then
        // the climax flip + big payoff.
        const chargeAt = t + (isLast ? 120 : 0)   // a small beat before the finale
        const charge = 320
        timers.push(setTimeout(() => setBoonPhases(p => (p[o.i] === 'sealed' ? { ...p, [o.i]: 'charging' } : p)), chargeAt))
        timers.push(setTimeout(() => doFlip(o), chargeAt + charge))
        t = chargeAt + charge + 110
      } else {
        // Common / rare: clean, quick flip — no rattle.
        timers.push(setTimeout(() => doFlip(o), t))
        t += 150
      }
    })
    return () => timers.forEach(clearTimeout)
    // NOTE: intentionally keyed on draftGen, not pendingBoons — a Blacklist swap
    // mutates pendingBoons but must not restart the reveal. Reads pendingBoons at
    // run time; phase entering/leaving 'boon' still drives the seal + clear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, draftGen, pendingConfluence])

  // Auto-dismiss the legendary banner a beat after it lands.
  useEffect(() => {
    if (!boonBanner) return
    const t = setTimeout(() => setBoonBanner(null), 2200)
    return () => clearTimeout(t)
  }, [boonBanner])

  // Auto-dismiss the confluence "Synergy Unlocked" banner.
  useEffect(() => {
    if (!confluenceBanner) return
    const t = setTimeout(() => setConfluenceBanner(null), 3000)
    return () => clearTimeout(t)
  }, [confluenceBanner])

  // Auto-dismiss the "Curse Shed" confirmation.
  useEffect(() => {
    if (!curseShed) return
    const t = setTimeout(() => setCurseShed(null), 2800)
    return () => clearTimeout(t)
  }, [curseShed])

  function handleEnemyDefeated(remainingHp: number, leftoverCharges = 0) {
    const f = fight
    if (!f) return
    // Powder Hoard boon: carry unfired cannonballs into the next fight, up to
    // the boon's cap. Stored here and fed to the next RaidCombat as initialCharges.
    const carryEffect = boonEffects(boonTiers).find(e => e.kind === 'chargeCarryover')
    carriedChargesRef.current = carryEffect && carryEffect.kind === 'chargeCarryover'
      ? Math.max(0, Math.min(leftoverCharges, carryEffect.cap))
      : 0
    // Clamp to max FIRST — Field Repairs / Engorge overheal is temporary and
    // shed here, so it never carries into the next fight.
    const carriedHp = Math.min(hpMax, remainingHp)
    // Vigor (Run Upgrade): patch up a slice of max HP for every ship you sink.
    // Iron Rations (a signed Term) scales every heal, this one included.
    const vigorHeal = Math.round(hpMax * gauntletKillHealPct(activeUpgrades) * termFxRef.current.healMult)
    const healedHp = vigorHeal > 0 ? Math.min(hpMax, carriedHp + vigorHeal) : carriedHp
    playerHPRef.current = healedHp
    setPlayerHP(healedHp)
    potRef.current += f.potContribution
    setPot(potRef.current)
    // Feed the pot VISIBLY — a "+N ⟡" float off the header pot so greed is
    // felt on every kill, with the fat boss version called out.
    if (f.potContribution > 0) setPotGain({ amount: f.potContribution, key: Date.now(), boss: f.isBoss })
    if (f.isBoss) setBossesDefeated(b => b + 1)

    rollStateRef.current = advanceRollState(rollStateRef.current, f)
    // Run ribbon: log the boss fall at the depth it happened.
    if (f.isBoss) runEventsRef.current.push({ depth: f.depth, kind: 'boss' })

    // Crew abilities refresh after each BOSS kill (a natural "catch your breath"
    // beat) plus at run start. Keys off the actual fight, not a depth counter,
    // so Veteran's Start can't desync it. The on-demand Reprieve fills the gaps.
    // Refresh everyone EXCEPT crew the deep has silenced (Dead Hands) — they
    // stay spent through the refresh.
    // Skeleton Crew (a signed Term): a boss kill normally restores every crew
    // ability. Now it only has a CHANCE to, so you can be caught empty-handed.
    if (f.isBoss && Math.random() < termFxRef.current.crewRefreshChance) {
      setUsedAbilityIds(new Set(silencedCrewIdsRef.current)); crewRefreshedRef.current = true
    }

    // A Don Finleone rise just fell — queue his "Falls" beat (which hands into the
    // Mark choice). The ref survives the contract-first ordering below;
    // proceedAfterFight consumes it, so the beat lands after any contract result.
    if (f.isApex) pendingDonFallRef.current = f.depth

    // Don's Gauntlet CONTRACT resolution — a job that rode this fight is judged
    // here, BEFORE any normal depth event, so its beat lands first. Cleared out
    // the instant it resolves (win or lose), so it can never double-fire.
    const contract = activeContractRef.current
    if (contract) {
      activeContractRef.current = null
      setContractChip(null)
      const facts = contractFactsRef.current
      contractFactsRef.current = null
      // No facts (shouldn't happen — combat reports before this) → treat as a
      // wash: no reward, no penalty, contract simply expires.
      const cleared = !!facts && checkContract(contract, facts)
      resolveContractOutcome(contract, cleared)   // pot/HP applied now; screens deferred to Continue
      setContractResult({ offer: contract, cleared })
      vibrate(cleared ? [0, 40, 60, 120] : [0, 120, 40, 120])
      setPhase('contract_result')
      return
    }

    proceedAfterFight()
  }

  // Apply a contract's immediate (pot / hull) outcome. The two screen-driven
  // outcomes — a won boon draft, a lost curse — are deferred to the result
  // screen's Continue (they hijack the boon/curse UI). A lost hull hit can never
  // be lethal: you already won the fight, so it floors at 1.
  function resolveContractOutcome(offer: ContractOffer, cleared: boolean) {
    if (cleared) {
      const r = offer.reward
      // Log the cleared job + what it paid, for the profile + recap.
      contractsWonRef.current = [...contractsWonRef.current, { name: CONTRACTS[offer.kind].name, reward: describeReward(r) }]
      setContractsWon(contractsWonRef.current)
      if (r.kind === 'plunder') {
        // The result screen shows the "+N plunder" beat itself; no DepthBar is
        // mounted here, so skip the float (it'd stray onto the next fight).
        potRef.current += r.n
        setPot(potRef.current)
      } else if (r.kind === 'fullHeal') {
        playerHPRef.current = hpMax
        setPlayerHP(hpMax)
      } else if (r.kind === 'hullBoost') {
        // Raise the run-wide ceiling; the hpMax effect heals by the increase.
        setContractHullMult(m => m * (1 + r.pct))
      }
    } else {
      const p = offer.penalty
      if (p.kind === 'plunderLose') {
        potRef.current = Math.max(0, potRef.current - p.n)
        setPot(potRef.current)
      } else if (p.kind === 'hpLossPct') {
        const nh = Math.max(1, Math.round(playerHPRef.current * (1 - p.pct)))
        playerHPRef.current = nh
        setPlayerHP(nh)
      } else if (p.kind === 'hullCut') {
        // Lower the run-wide ceiling; the hpMax effect clamps current hull down.
        setContractHullMult(m => m * (1 - p.pct))
      }
    }
  }

  // Leave the contract result beat. A won boon draft / a lost curse hijack the
  // very next screen (they need the pick UI); everything else already landed, so
  // fall through to the normal depth routing.
  function contractResultContinue() {
    const res = contractResult
    setContractResult(null)
    if (res && res.cleared && res.offer.reward.kind === 'boonDraft') {
      const draft = drawBoons(termFxRef.current.boonPicks, boonTiers, gauntletBoonLuck(activeUpgrades), termFxRef.current.commonSkew, props.variant, bannedBoonsRef.current)
      if (draft.length > 0) {
        setPendingBoons(draft)
        setDraftGen(g => g + 1)
        setBoonFromShrine(true)
        setRerollsLeft(gauntletBoonRerolls(activeUpgrades))
        setPendingConfluence(null)
        setPendingReprieve(null)
        setPhase('boon')
        return
      }
    } else if (res && !res.cleared && res.offer.penalty.kind === 'curse') {
      const depth = rollStateRef.current.cleared + 1 + skipOffset
      const curse = drawCurse(curseTiersRef.current, depth, termFxRef.current.curseStartsAtWorst, props.variant)
      if (curse) {
        curseDepthRef.current = depth
        setPendingCurse(curse)
        setCurseRerollsLeft(gauntletCurseRerolls(activeUpgrades))
        setPhase('curse')
        return
      }
    }
    proceedAfterFight()
  }

  // Leave the "Don Finleone Falls" beat → into the Mark choice. Roll the two Marks
  // he offers (once, so preview = commit) and hand off to the cinematic.
  function donFallenClaim() {
    setDonFallen(null)
    setMarkOffer(rollMarkOffer())
    setMarkSearing(null)
    setPhase('mark_choice')
  }

  // Take one of the two offered Marks: brand it in (the sear animation), stack it
  // onto the run, then continue. The sear holds ~1.5s of payoff before routing.
  function chooseMark(type: MarkType) {
    if (!markOffer || markSearing) return
    const buffs = type === 'shark' ? markOffer.shark : markOffer.whale
    setMarks(prev => [...prev, { type, buffs }])
    setMarkSearing(type)
    vibrate([0, 30, 40, 90, 40, 160])
    setTimeout(() => {
      setMarkSearing(null)
      setMarkOffer(null)
      proceedAfterFight()
    }, 1600)
  }

  // The between-fights routing: curse milestone → boon draft → shrine → merchant
  // → breather. Split out of handleEnemyDefeated so a contract result can run
  // first and then hand back here. Recomputes the combat depth from the refs.
  function proceedAfterFight() {
    // A Don rise just fell — his "Falls" victory beat takes priority over every
    // normal depth event (consumed once; the Mark already applied at the kill).
    if (pendingDonFallRef.current != null) {
      const fallDepth = pendingDonFallRef.current
      pendingDonFallRef.current = null
      setDonFallen(fallDepth)
      vibrate([0, 60, 40, 120, 40, 200])
      setPhase('don_fallen')
      return
    }
    // Curse milestone (descend INTO a CURSE_DEPTH) and boon draft (INTO a
    // BOON_DEPTH). They sit on different depths so the run alternates toll and
    // gift. Calm Before lets the FIRST curse milestone pass uncursed — the
    // player descends curse-free until the second. The curse/boon both-fire
    // branch below is kept defensive in case the two ever share a depth.
    // Combat depth (Veteran's Start shifts the boon/curse cadence up too).
    const nextDepth = rollStateRef.current.cleared + 1 + skipOffset
    // isCurseDepth / isBoonDepth carry the cadence PAST the fixed schedule
    // (every few depths forever) so deep runs keep stacking rules.
    const atCurseDepth = isCurseDepth(nextDepth, termFxRef.current.curseFrequencyMult)
    // Calm Before waves off the FIRST curse milestone the player actually hits,
    // not a hardcoded depth — so it still works under Veteran's Start, which
    // starts past depth 4. Spent the moment it fires.
    const skipFirstCurse = atCurseDepth && !calmBeforeUsedRef.current && gauntletSkipsFirstCurse(activeUpgrades)
    if (skipFirstCurse) calmBeforeUsedRef.current = true
    const curse = (atCurseDepth && !skipFirstCurse)
      ? drawCurse(curseTiersRef.current, nextDepth, termFxRef.current.curseStartsAtWorst, props.variant)   // null once the curse pool is spent
      : null
    // Draw the boons up front so an exhausted pool ([] when every family is
    // maxed) falls through to the breather instead of an empty draft screen.
    const boons = isBoonDepth(nextDepth, termFxRef.current.boonFrequencyMult)
      ? drawBoons(termFxRef.current.boonPicks, boonTiers, gauntletBoonLuck(activeUpgrades), termFxRef.current.commonSkew, props.variant, bannedBoonsRef.current)
      : []
    if (curse || boons.length > 0) {
      // Set the boon draft now even on a curse round, so applyCurse can hand off
      // to the boon screen (it routes to 'boon' whenever pendingBoons is set).
      if (boons.length > 0) {
        setPendingBoons(boons)
        setDraftGen(g => g + 1)
        setBoonFromShrine(false)
        setRerollsLeft(gauntletBoonRerolls(activeUpgrades))
        // Confluence draft (Hades-duo model): if you QUALIFY for a synergy you
        // haven't taken, it can surface as a gold card in place of a boon slot —
        // taking it forgoes those boons. Mutually exclusive with the Reprieve so
        // the screen never stacks two "instead of a boon" cards.
        const conf = rollSynergyOffer()
        if (conf) offeredConfluenceIdsRef.current.add(conf.id)
        setPendingConfluence(conf)
        setPendingReprieve(!conf && !termFxRef.current.noReprieves && nextDepth >= REPRIEVE_MIN_DEPTH && Math.random() < REPRIEVE_CHANCE
          ? drawReprieve({ curseCount: Object.keys(curseTiersRef.current).length })
          : null)
      }
      if (curse) { curseDepthRef.current = nextDepth; setPendingCurse(curse); setCurseRerollsLeft(gauntletCurseRerolls(activeUpgrades)); setPhase('curse') }
      else setPhase('boon')
      return
    }

    // The Drowned Shrine — a wager beat on a steady cadence. Only reachable here,
    // i.e. on a depth with no active boon/curse, and only once we've passed the
    // due depth. Schedules the next one ~SHRINE_INTERVAL deeper. Sits BEFORE the
    // breather (it hands off to 'between'), so you still get your cash-out choice.
    if (nextDepth >= nextShrineRef.current) {
      nextShrineRef.current = nextDepth + SHRINE_INTERVAL + Math.floor(Math.random() * 3)
      setShrineCoin(null)
      setShrineStake(Math.min(SHRINE_WAGER_MAX, Math.max(1, fathomsNow)))
      setPhase('shrine')
      return
    }

    // The Black Market — Don's-only vendor node on its own cadence. Same rule as
    // the shrine: only on a quiet depth, only once we've passed the due depth.
    if (props.variant === 'don' && nextDepth >= nextMerchantRef.current) {
      nextMerchantRef.current = nextDepth + MERCHANT_INTERVAL + Math.floor(Math.random() * 3)
      setMerchantStock(rollMerchantStock(Object.keys(curseTiersRef.current).length > 0))
      setMerchantSold(new Set())
      setMerchantBuying(null)
      setPhase('merchant')
      return
    }

    setPhase('between')
  }

  // ── The Drowned Shrine wagers ───────────────────────────────────────────────
  // Davy's Coin: double-or-nothing on your banked FATHOMS, up to SHRINE_WAGER_MAX.
  // Server-authoritative (Fathoms buy permanent upgrades) — the stake + roll are
  // resolved in wagerGauntletFathoms. The coin spins for ≥1s of suspense in
  // parallel with the round-trip, then the result lands.
  async function shrineCoinFlip() {
    if (shrineCoin || shrineFlipping || fathomsNow < 1) return
    runEventsRef.current.push({ depth: rollStateRef.current.cleared + skipOffset, kind: 'shrine' })
    setShrineFlipping(true)
    vibrate([0, 18])
    const [res] = await Promise.all([
      wagerGauntletFathoms(shrineStake),
      new Promise(r => setTimeout(r, 1050)),  // minimum spin time, parallel to the call
    ])
    if ('error' in res) { setShrineFlipping(false); return }
    setFathomsNow(res.fathoms)
    setShrineCoin({ result: res.won ? 'win' : 'lose', stake: res.stake, fathoms: res.fathoms })
    setShrineFlipping(false)
    vibrate(res.won ? [0, 45, 50, 95] : [0, 80, 40, 40])
  }

  // Blood Price: pay HALF your current HP (never below 1) for a NORMAL boon draft
  // (no rare skew — the cost is the HP, not a better draw). If the boon pool is
  // spent, charge nothing and just move on.
  function shrineBloodPrice() {
    runEventsRef.current.push({ depth: rollStateRef.current.cleared + skipOffset, kind: 'shrine' })
    const draft = drawBoons(termFxRef.current.boonPicks, boonTiers, gauntletBoonLuck(activeUpgrades), termFxRef.current.commonSkew, props.variant, bannedBoonsRef.current)
    if (draft.length === 0) { setPhase('between'); return }
    // The Full Measure (a signed Term): he does not take half of anything.
    const left = termFxRef.current.bloodPriceToOne
      ? 1
      : Math.max(1, playerHPRef.current - Math.max(1, Math.round(playerHPRef.current * SHRINE_BLOOD_HP_PCT)))
    playerHPRef.current = left
    setPlayerHP(left)
    vibrate([0, 60, 30, 30])
    setPendingBoons(draft)
    setDraftGen(g => g + 1)
    setRerollsLeft(0)
    setPendingReprieve(null)
    { const conf = rollSynergyOffer(); if (conf) offeredConfluenceIdsRef.current.add(conf.id); setPendingConfluence(conf) }
    setBoonFromShrine(true)
    setPhase('boon')
  }

  // Walk on: a small safe heal, no gamble.
  function shrineWalkOn() {
    const healed = Math.min(hpMax, playerHPRef.current + Math.round(hpMax * SHRINE_WALK_HEAL))
    playerHPRef.current = healed
    setPlayerHP(healed)
    setShrineCoin(null)
    setPhase('between')
  }

  // Leave the shrine after a resolved coin flip.
  function shrineDescend() {
    setShrineCoin(null)
    setPhase('between')
  }

  // ── The Black Market (Don's mid-run shop) ──────────────────────────────────
  // Apply a purchased item's game effect in run state. Mirrors the Reprieve
  // effects; the Fathom spend already happened server-side in buyMerchant. The
  // 'boon' item hands off to a draft (which ends the visit at that draft).
  function applyMerchantEffect(id: MerchantItemKind) {
    if (id === 'heal') {
      const healed = Math.min(hpMax, playerHPRef.current + Math.round(hpMax * 0.35 * termFxRef.current.healMult))
      playerHPRef.current = healed; setPlayerHP(healed)
      vibrate([0, 40, 40, 60])
    } else if (id === 'charges') {
      carriedChargesRef.current = 3 + bonusChargeSlots(activeUpgrades)
      vibrate([0, 30, 30, 40])
    } else if (id === 'crew') {
      setUsedAbilityIds(new Set(silencedCrewIdsRef.current))
      crewRefreshedRef.current = true
      vibrate([0, 30, 30, 40])
    } else if (id === 'cleanse') {
      const owned = Object.keys(curseTiersRef.current)
      if (owned.length > 0) {
        const drop = owned[Math.floor(Math.random() * owned.length)]
        const next = { ...curseTiersRef.current }; delete next[drop]
        curseTiersRef.current = next; setCurseTiers(next)
        if (drop === 'dead_hands') reconcileSilence()
        setCurseShed({ name: GAUNTLET_CURSES.find(c => c.id === drop)?.name ?? 'a curse', key: Date.now() })
        vibrate([0, 40, 50, 70])
      }
    } else if (id === 'boon') {
      // Contraband — an extra draft, right now. Opens the boon screen and so ends
      // the market visit (same hand-off the shrine's Blood Price uses).
      const draft = drawBoons(termFxRef.current.boonPicks, boonTiers, gauntletBoonLuck(activeUpgrades), termFxRef.current.commonSkew, props.variant, bannedBoonsRef.current)
      if (draft.length === 0) { setPhase('between'); return }
      setPendingBoons(draft); setDraftGen(g => g + 1); setRerollsLeft(0); setPendingReprieve(null)
      { const conf = rollSynergyOffer(); if (conf) offeredConfluenceIdsRef.current.add(conf.id); setPendingConfluence(conf) }
      setBoonFromShrine(true); setPhase('boon')
    }
  }

  async function buyMerchant(id: MerchantItemKind) {
    if (merchantBuying || merchantSold.has(id)) return
    const item = MERCHANT_ITEMS[id]
    // Pay from this dive's earned Fathoms (fathomsForDepth of the depth cleared
    // so far) minus the tab already run up — never the banked purse.
    const runFathoms = fathomsForDepth(rollStateRef.current.cleared, props.variant ?? 'davy')
    if (runFathoms - fenceSpentRef.current < item.price) return
    // A Hex-Breaker with no curse to break is a wasted buy — block it defensively
    // (the card is filtered out of stock too, this is belt-and-braces).
    if (id === 'cleanse' && Object.keys(curseTiersRef.current).length === 0) return
    setMerchantBuying(id)
    const res = await buyMerchantItem(id)
    if ('error' in res) { setMerchantBuying(null); return }
    // Run up the tab (settled against the earned grant at cash-out); the banked
    // purse is untouched until then.
    fenceSpentRef.current += item.price; setFenceSpent(fenceSpentRef.current)
    setMerchantSold(prev => { const n = new Set(prev); n.add(id); return n })
    setMerchantBuying(null)
    applyMerchantEffect(id)   // last — may switch phase (Contraband → draft)
  }

  function merchantLeave() {
    setPhase('between')
  }

  // Record a freshly-imposed curse (or its tier-2 deepening) at its tier, then
  // drop into the breather. Effects are resolved live from curseTiers via
  // curseEffects() and threaded into the combat pipeline, so nothing is pushed
  // into the tide channel here (mirrors how boons work).
  function applyCurse(offer: CurseOffer) {
    runEventsRef.current.push({ depth: rollStateRef.current.cleared + skipOffset, kind: 'curse' })
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
    hapticCommit() // a run-defining pick locks in — give it weight
    runEventsRef.current.push({ depth: rollStateRef.current.cleared + skipOffset, kind: 'boon' })
    // Opportunity-cost model: completing a boon PAIR no longer auto-grants the
    // confluence — it just makes it eligible to be OFFERED as a draft card
    // (handled at the next draw). So taking a boon only bumps its own tier.
    const nextTiers = { ...boonTiers, [offer.id]: offer.tier }
    setBoonTiers(nextTiers)
    setPendingBoons(null)
    setPendingConfluence(null)   // forwent the synergy card this draft
    setPendingReprieve(null)     // chose the boon over the relief
    setPhase('between')
  }

  // The synergy slot each draft can offer: a CONVERGENCE (Don's meta-tier) takes
  // priority when you qualify for one, otherwise the ordinary confluence roll.
  // Both share the pity/offered set (ids are distinct namespaces).
  function rollSynergyOffer(): ConfluenceOffer | null {
    // Consigliere (Don's) folds into the run's synergy-offer chance.
    const synMult = termFxRef.current.confluenceOfferMult * gauntletSynergyOfferMult(activeUpgrades)
    if (props.variant === 'don') {
      const cv = drawConvergenceOffer(boonTiers, confluencesTaken, convergencesTaken, offeredConfluenceIdsRef.current, synMult, props.variant)
      if (cv) return cv
    }
    return drawConfluenceOffer(boonTiers, confluencesTaken, offeredConfluenceIdsRef.current, synMult, props.variant)
  }

  // Draft a confluence (or convergence) instead of a boon this round (the
  // Hades-duo opportunity cost). It applies from now on, scaling with its
  // halves, and lands as a full "unlocked" beat — codex reveal + banner.
  function applyConfluence(offer: ConfluenceOffer) {
    hapticCommit() // same weight as a boon pick
    if (offer.isConvergence) {
      const cv = CONVERGENCES.find(x => x.id === offer.id)
      setConvergencesTaken(prev => (prev.includes(offer.id) ? prev : [...prev, offer.id]))
      setPendingBoons(null); setPendingConfluence(null); setPendingReprieve(null)
      if (cv) {
        setConfluenceBanner({ name: cv.name, desc: convergenceDescAt(cv, offer.level), level: offer.level, isNew: true, discovered: false, isConvergence: true, image: cv.image, key: Date.now() })
        vibrate([0, 55, 40, 90, 40, 150])
        import('@/lib/fishingMusic').then(m => m.playChestSfx(true)).catch(() => {})
      }
      // "The Convergence" badge — forging any convergence (a Don's-only meta synergy).
      if (props.variant === 'don') unlockBadge('first_convergence').catch(() => {})
      setPhase('between')
      return
    }
    const c = CONFLUENCES.find(x => x.id === offer.id)
    setConfluencesTaken(prev => (prev.includes(offer.id) ? prev : [...prev, offer.id]))
    setPendingBoons(null)
    setPendingConfluence(null)
    setPendingReprieve(null)
    if (c) {
      setConfluenceUnlocked(c)
      const discovered = !seenConfluences.includes(c.id)
      if (discovered) {
        setSeenConfluences(prev => (prev.includes(c.id) ? prev : [...prev, c.id]))
        markConfluencesSeen([c.id]).catch(() => {})
      }
      setConfluenceBanner({ name: c.name, desc: confluenceDescAt(c, offer.level), level: offer.level, isNew: true, discovered, image: c.image, key: Date.now() })
      vibrate([0, 45, 40, 80, 40, 130])
      import('@/lib/fishingMusic').then(m => m.playChestSfx(true)).catch(() => {})
    }
    setPhase('between')
  }

  // Second Cast: throw the offered boons back and draw three fresh ones (the
  // synergy card re-rolls with them).
  function rerollBoons() {
    if (rerollsLeft <= 0) return
    setPendingBoons(drawBoons(termFxRef.current.boonPicks, boonTiers, gauntletBoonLuck(activeUpgrades), termFxRef.current.commonSkew, props.variant, bannedBoonsRef.current))
    setDraftGen(g => g + 1)
    { const conf = rollSynergyOffer(); if (conf) offeredConfluenceIdsRef.current.add(conf.id); setPendingConfluence(conf) }
    setRerollsLeft(r => r - 1)
  }

  // Blacklist (Don's): banish ONE offered boon for the rest of the run. The
  // banned family is added to the run-long set (so it never surfaces in any
  // later draw), the ban budget drops, and this slot is refilled on the spot
  // with a fresh boon that isn't banned and isn't one of the others shown. The
  // replacement keeps the slot's index, so it renders face-up straight away.
  function banBoon(idx: number) {
    if (filtersLeft <= 0 || !pendingBoons) return
    const target = pendingBoons[idx]
    if (!target) return
    bannedBoonsRef.current.add(target.id)
    const others = pendingBoons.filter((_, i) => i !== idx).map(x => x.id)
    const excl = new Set<string>([...bannedBoonsRef.current, ...others])
    const [fresh] = drawBoons(1, boonTiers, gauntletBoonLuck(activeUpgrades), termFxRef.current.commonSkew, props.variant, excl)
    setPendingBoons(prev => {
      if (!prev) return prev
      const next = prev.slice()
      if (fresh) next[idx] = fresh          // swap in a replacement
      else next.splice(idx, 1)              // pool exhausted — just drop the slot
      return next
    })
    setFiltersLeft(n => n - 1)
    setBanArmed(false); setBanConfirm(null)
    hapticTap()
  }

  // Salt Ward: throw the imposed curse back and draw a different one. Tries a few
  // times to land a curse that isn't the same one you just shrugged off; if the
  // pool is thin it may repeat (and an exhausted pool just keeps the current one).
  function rerollCurse() {
    if (curseRerollsLeft <= 0 || !pendingCurse) return
    const depth = curseDepthRef.current
    let next = drawCurse(curseTiersRef.current, depth, termFxRef.current.curseStartsAtWorst, props.variant)
    for (let i = 0; i < 6 && next && next.id === pendingCurse.id && next.tier === pendingCurse.tier; i++) {
      next = drawCurse(curseTiersRef.current, depth, termFxRef.current.curseStartsAtWorst, props.variant)
    }
    if (next) setPendingCurse(next)
    setCurseRerollsLeft(r => r - 1)
  }

  // Take the Reprieve instead of a boon — apply its one-time effect now and
  // forgo the draft entirely (the give-up-upgrade-potential trade).
  function applyReprieve(r: Reprieve) {
    if (r.kind === 'heal') {
      // Iron Rations (a signed Term) guts this too — a reprieve is still a heal.
      const healed = Math.min(hpMax, Math.round(playerHPRef.current + hpMax * r.amount * termFxRef.current.healMult))
      playerHPRef.current = healed
      setPlayerHP(healed)
    } else if (r.kind === 'crew') {
      // Loads every ability fresh — but Dead Hands holds its silenced crew down.
      setUsedAbilityIds(new Set(silencedCrewIdsRef.current))
      crewRefreshedRef.current = true
    } else if (r.kind === 'charges') {
      // Open the next fight with the gun deck run out (carryover plumbing).
      carriedChargesRef.current = 3 + bonusChargeSlots(activeUpgrades)
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
        // Confirm it landed — name the curse the deep took back so the player
        // can see the reprieve actually worked.
        setCurseShed({ name: GAUNTLET_CURSES.find(c => c.id === drop)?.name ?? 'a curse', key: Date.now() })
        vibrate([0, 40, 50, 70])
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
      stats: { ...runStatsRef.current },
      contracts: contractsWonRef.current,
      fenceSpent: fenceSpentRef.current,
    }
  }

  // ── Crash safety net ────────────────────────────────────────────────────────
  // Snapshot the resumable run state (everything that affects rewards, difficulty
  // or power). Called at each breather so a crash resumes at the last cleared
  // depth. Transient UI (banners, pending drafts) is rebuilt fresh on resume.
  function buildCheckpoint(): GauntletRunState {
    return {
      cleared: rollStateRef.current.cleared,
      prevWasBoss: rollStateRef.current.prevWasBoss,
      roundsSinceBoss: rollStateRef.current.roundsSinceBoss,
      hp: playerHPRef.current,
      pot: potRef.current,
      bossesDefeated,
      boonTiers,
      confluencesTaken,
      convergencesTaken,
      stats: runStatsRef.current,
      curseTiers,
      usedAbilityIds: Array.from(usedAbilityIds),
      usedRaidItemIds: Array.from(usedRaidItemIds),
      silencedCrewIds: silencedCrewIdsRef.current,
      carriedCharges: carriedChargesRef.current,
      anchorSavesLeft: anchorSavesLeftRef.current,
      runMaxHit: runMaxHitRef.current,
      nextShrine: nextShrineRef.current,
      nextMerchant: nextMerchantRef.current,
      calmBeforeUsed: calmBeforeUsedRef.current,
      marks,
      contractHullMult,
      contractsWon: contractsWonRef.current,
      fenceSpent: fenceSpentRef.current,
    }
  }

  // Rehydrate a resumed run and drop the player back at the breather. The
  // between-phase effect re-rolls the next fight from the restored roll state.
  function applyCheckpoint(s: GauntletRunState) {
    rollStateRef.current = { cleared: s.cleared, prevWasBoss: s.prevWasBoss, roundsSinceBoss: s.roundsSinceBoss }
    playerHPRef.current = s.hp; setPlayerHP(s.hp)
    // Sync the max-HP baseline to the RESTORED ceiling so the heal-on-growth
    // effect sees no delta (s.hp was already saved against that max).
    {
      // Include Mark effects (maxHpMult rides here) + the contract hull multiplier
      // so the restored ceiling MATCHES the resumed hpMax — else the heal-on-
      // increase effect would see a phantom delta and top the player up for free.
      const restoredEffects = [...boonEffects(s.boonTiers), ...confluenceEffects(s.boonTiers, s.confluencesTaken ?? []), ...convergenceEffects(s.boonTiers, s.confluencesTaken ?? [], s.convergencesTaken ?? []), ...curseEffects(s.curseTiers), ...markEffects(s.marks ?? [])]
      prevHpMaxRef.current = Math.max(1, Math.round(baseHpMax * termFxRef.current.maxHpPct * hpBoonMult(restoredEffects, s.cleared + skipOffset + 1, s.cleared) * (s.contractHullMult ?? 1)))
    }
    potRef.current = s.pot; setPot(s.pot)
    setBossesDefeated(s.bossesDefeated)
    setBoonTiers(s.boonTiers)
    setConfluencesTaken(s.confluencesTaken ?? [])
    setConvergencesTaken(s.convergencesTaken ?? [])
    runStatsRef.current = coerceRunStats(s.stats)
    setCurseTiers(s.curseTiers); curseTiersRef.current = s.curseTiers
    setUsedAbilityIds(new Set(s.usedAbilityIds))
    setUsedRaidItemIds(new Set(s.usedRaidItemIds ?? []))
    silencedCrewIdsRef.current = s.silencedCrewIds
    carriedChargesRef.current = s.carriedCharges
    anchorSavesLeftRef.current = s.anchorSavesLeft
    runMaxHitRef.current = s.runMaxHit
    nextShrineRef.current = s.nextShrine
    nextMerchantRef.current = s.nextMerchant ?? MERCHANT_FIRST_DEPTH
    calmBeforeUsedRef.current = s.calmBeforeUsed
    setMarks(s.marks ?? [])
    setContractHullMult(s.contractHullMult ?? 1)
    contractsWonRef.current = s.contractsWon ?? []; setContractsWon(contractsWonRef.current)
    fenceSpentRef.current = s.fenceSpent ?? 0; setFenceSpent(fenceSpentRef.current)
    pendingDonFallRef.current = null; setMarkOffer(null); setMarkSearing(null)
    // Transient state rebuilt fresh at the breather.
    peekFightRef.current = null; setPeekFight(null)
    crewRefreshedRef.current = false; setFightOpensRefreshed(false)
    setConfluenceUnlocked(null); setConfluenceBanner(null)
    setPendingBoons(null); setPendingConfluence(null); setPendingCurse(null); setPendingReprieve(null)
    setPhase('between')
  }

  const [resuming, setResuming] = useState(false)
  const [pausing, setPausing] = useState(false)
  const [letGoArmed, setLetGoArmed] = useState(false) // two-tap confirm on the crash-resume "Let it go" in hardcore
  // Take the crashed run back (spends the run's single resume, server-owned).
  function doResume() {
    if (resuming || !props.resumeState) return
    setResuming(true)
    resumeGauntletRun().then(res => {
      if (res.ok) {
        applyCheckpoint(res.state)
        setOffer(res.offer) // restore a live Davy's Offer so it survives leave-and-resume
      } else setPhase(props.available ? 'intro' : 'usedup') // already spent / raced
    }).finally(() => setResuming(false))
  }
  // Deliberate pause at a breather: save + step away. Unlimited, never risks the
  // crew — the run is simply held until the captain comes back. Fire the save,
  // then show the "held" screen (they leave via the nav or the Back link).
  function doPause() {
    if (pausing) return
    setPausing(true)
    pauseGauntletRun(buildCheckpoint())
      .then(() => setPhase('paused'))
      .finally(() => setPausing(false))
  }
  // Let the crashed run go: close it out (banks Fathoms for the depth reached,
  // clears the checkpoint) and show the death recap — same end-of-dive screen as
  // dying in combat, seeded from the checkpoint. A disconnect you come back to
  // and abandon still gets its recap, instead of a silent refresh to the intro.
  function abandonResume() {
    if (resuming || !props.resumeState) return
    setResuming(true)
    const s = props.resumeState
    const cleared = s.cleared
    rollStateRef.current = { cleared: s.cleared, prevWasBoss: s.prevWasBoss, roundsSinceBoss: s.roundsSinceBoss }
    potRef.current = s.pot
    runMaxHitRef.current = s.runMaxHit
    runStatsRef.current = coerceRunStats(s.stats)
    setBoonTiers(s.boonTiers)
    setCurseTiers(s.curseTiers); curseTiersRef.current = s.curseTiers
    setConfluencesTaken(s.confluencesTaken ?? [])
    setConvergencesTaken(s.convergencesTaken ?? [])
    resolveGauntletDeath(cleared, cleared > 0 ? cleared + skipOffset : 0)
      .then(res => { if (res?.ok) setDeathFathoms(res.earnedFathoms) })
      .finally(() => { setResuming(false); setPhase('dead') })
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
    setConfluenceUnlocked(null) // the "just unlocked" highlight is spent once you dive
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
    const next = peekFightRef.current ?? generateFight(rollStateRef.current, skipOffset, termFxRef.current, props.variant)
    peekFightRef.current = null
    setPeekFight(null)
    // Snapshot whether this fight opens with freshly restored abilities, then
    // clear the accumulator for the next stretch.
    setFightOpensRefreshed(crewRefreshedRef.current)
    crewRefreshedRef.current = false
    setFight(next)
    setOffer(null)   // no deal. The server counts this as a refusal and sweetens the next one.
    // Don's Contracts — a chance-based "job" on the hull you're diving into.
    // Additive: this fires at the descend (after every other between-fight beat),
    // so it never replaces a boon/curse/market. One active contract at a time.
    if (isDonG && !activeContractRef.current) {
      const cd = rollStateRef.current.cleared + skipOffset + 1
      const kind = rollContractOffer(cd)
      if (kind) {
        const offers = ([1, 2, 3] as ContractStake[]).map(s => buildContractOffer(kind, s, cd))
        // EVERY JOB (Don's term): the choice is taken away, not just the refusal.
        // It signs you to the MIDDLE stake rather than the safest or the
        // greediest, so the term is a genuine coin-flip on every job rather than
        // a quiet buff (all low stakes) or an instant run-ender (all high ones).
        if (termFxRef.current.forceContracts) {
          takeContract(offers[1])
          return
        }
        setContractOffer({ kind, offers })
        setPhase('contract')
        return
      }
    }
    setPhase('descending')
  }

  function cashOut(takeOffer = false) {
    if (resolving) return
    setResolving(true)
    cashOutGauntlet(rollStateRef.current.cleared, rollStateRef.current.cleared + skipOffset, potRef.current, buildRunSnapshot(), takeOffer).then(res => {
      setResolving(false)
      setReward(res)
      if (res.ok) setBloodGemsNow(res.newBloodGems)
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
      hardcore={hardcoreRun}
      don={isDonG}
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
        const isConf = detailEffect.kind === 'confluence'
        const accent = isConf ? '#f5b94a' : isBoon ? AC : '#f87171'
        const fg = isConf ? '#fbe7c4' : isBoon ? '#aef3e6' : '#fca5a5'
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
            onClick={() => setDetailEffect(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(2,6,12,0.82)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
           <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}>
            <motion.div initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ type: 'spring', stiffness: 280, damping: 24 }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 360, borderRadius: 18, padding: '1.2rem 1.15rem 1.1rem', textAlign: 'center', background: 'linear-gradient(180deg, rgba(14,22,34,0.99), rgba(7,13,22,0.99))', border: `1px solid ${accent}55`, boxShadow: `0 0 44px ${accent}22, 0 18px 50px rgba(0,0,0,0.6)` }}>
              {detailEffect.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={detailEffect.image} alt="" decoding="async"
                  style={{ display: 'block', width: 78, height: 78, objectFit: 'contain', margin: '0 auto 9px', filter: `drop-shadow(0 2px 6px rgba(0,0,0,0.6)) drop-shadow(0 0 10px ${accent}66)` }} />
              )}
              <p className="font-karla font-800 uppercase tracking-[0.22em]" style={{ fontSize: '0.58rem', color: `${accent}cc` }}>
                {isConf ? 'A Synergy' : isBoon ? 'Your Power' : 'The Locker’s Curse'}
              </p>
              <p className="font-cinzel font-800" style={{ fontSize: '1.45rem', color: '#f5f2ec', lineHeight: 1.12, marginTop: 6 }}>
                {detailEffect.name}
              </p>
              {/* WHAT IT DOES RIGHT NOW, in its own block at the top — the same
                  move ItemEffectLines makes for an Abyssal's signature. A boon
                  you hold at tier 2 does exactly one thing, and burying that one
                  line in a paragraph about the whole family meant the answer to
                  "what am I actually getting" was never the first thing read. */}
              <div style={{ marginTop: 12, padding: '0.6rem 0.75rem', borderRadius: 12, background: `${accent}16`, border: `1px solid ${accent}4d`, textAlign: 'left' }}>
                <p className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: `${accent}cc`, marginBottom: 4 }}>
                  {isConf ? 'What the synergy adds' : isBoon ? 'What you have now' : 'What it does to you'}
                </p>
                <p className="font-karla font-700" style={{ fontSize: '0.88rem', lineHeight: 1.4, color: fg }}>
                  {detailEffect.desc}
                </p>
              </div>

              {/* THE LADDER as lines, not prose. Every rung is one effect, so a
                  reader can see what they hold and what the next one buys
                  without parsing a paragraph for the numbers. */}
              {detailEffect.rungs && detailEffect.rungs.length > 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 11, textAlign: 'left' }}>
                  {detailEffect.rungs.map(r => (
                    <div key={r.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, opacity: r.held ? 1 : 0.5 }}>
                      <span aria-hidden style={{ flexShrink: 0, marginTop: 1, width: 15, textAlign: 'center', fontSize: '0.62rem', color: r.current ? accent : r.held ? `${accent}99` : 'rgba(255,255,255,0.3)' }}>
                        {r.current ? (isConf ? '◆' : '▲') : r.held ? '✓' : '·'}
                      </span>
                      <span className="font-karla font-700 uppercase" style={{ flexShrink: 0, width: 30, fontSize: '0.5rem', letterSpacing: '0.1em', marginTop: 3, color: r.current ? accent : 'rgba(255,255,255,0.35)' }}>{r.label}</span>
                      <span className="font-karla" style={{ flex: 1, minWidth: 0, fontSize: '0.76rem', lineHeight: 1.4, color: r.current ? '#f5f2ec' : 'rgba(245,242,236,0.6)' }}>{r.desc}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* The mechanic, underneath and quieter. It explains HOW the thing
                  works; the block above already answered WHAT it does. */}
              <p className="font-karla" style={{ fontSize: '0.8rem', lineHeight: 1.5, color: 'rgba(245,242,236,0.68)', marginTop: 13, textAlign: 'left' }}>
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
  // A crashed run offered back to the player — the crash safety net. Resume
  // (spends the run's one resume) or let it go (banks Fathoms + ends the run).
  if (phase === 'resume' && props.resumeState) {
    const rs = props.resumeState
    const depth = rs.cleared + skipOffset
    const boonCount = Object.keys(rs.boonTiers).length
    const curseCount = Object.keys(rs.curseTiers).length
    const pill = (label: string, value: string, color: string) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '0.5rem 0.9rem', borderRadius: 12, background: 'rgba(240,192,64,0.06)', border: `1px solid ${GOLD}2a` }}>
        <span className="font-cinzel font-800" style={{ fontSize: '1.05rem', color, lineHeight: 1 }}>{value}</span>
        <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: '#9a948a' }}>{label}</span>
      </div>
    )
    return (
      <>
        <AbyssBackdrop hardcore={hardcoreRun} don={isDonG} />
        <AbyssScrim />
        {/* Just enough bottom pad to clear the fixed mobile tab bar (~58px):
            this + the global page footer below (~25px) lands "Not today" just
            above the bar. No safe-area inset (the bar already sits at bottom:0,
            so the inset was pure excess — the old relic that stacked to ~120px
            on an iPhone PWA). On sm+ the bar is hidden, so drop to a small pad. */}
        <div
          className="pb-10 sm:pb-6"
          style={{
            position: 'relative', zIndex: 1, maxWidth: 460, margin: '0 auto',
            paddingTop: 6, paddingLeft: '0.85rem', paddingRight: '0.85rem', textAlign: 'center',
          }}>
          <h1 className="font-cinzel font-800" style={{ fontSize: '1.7rem', color: '#f3ead2', lineHeight: 1.12, marginTop: 26, textShadow: '0 0 26px rgba(240,192,64,0.32)' }}>
            {props.resumePaused ? 'Your Dive Is Held' : 'The Deep Still Has You'}
          </h1>
          <p className="font-karla" style={{ fontSize: '0.82rem', color: '#b9b2a6', lineHeight: 1.55, marginTop: 12, maxWidth: 340, marginInline: 'auto' }}>
            {props.resumePaused
              ? 'You stepped away mid-descent. Pick the line back up whenever you like — your progress is right where you left it.'
              : 'Your last dive was cut short before it ended. The current holds you at your breather — take the line back up and press on.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 20 }}>
            {pill('Depth', `${depth}`, GOLD)}
            {pill(boonCount === 1 ? 'Boon' : 'Boons', `${boonCount}`, AC)}
            {pill(curseCount === 1 ? 'Curse' : 'Curses', `${curseCount}`, '#e08a6a')}
          </div>
          <button onClick={doResume} disabled={resuming} className="font-cinzel font-800 uppercase tracking-[0.08em] tap"
            style={{
              marginTop: 26, width: '100%', padding: '1.05rem', borderRadius: 14, fontSize: '1.05rem',
              color: GOLD, background: `linear-gradient(180deg, ${GOLD}2a, ${GOLD}10)`,
              border: `1px solid ${GOLD}70`, cursor: resuming ? 'wait' : 'pointer',
              boxShadow: `0 0 22px ${GOLD}22`, animation: resuming ? 'none' : 'gauntCta 2.6s ease-in-out infinite',
            }}>
            {resuming ? 'Descending…' : 'Resume the Dive'}
          </button>

          {props.resumePaused ? (
            <>
              <div style={{ marginTop: 12 }}>
                <BackLink router={router} label="Leave it held" />
              </div>
              <p className="font-karla" style={{ fontSize: '0.62rem', color: '#7d776e', lineHeight: 1.5, marginTop: 6 }}>
                Held safely. Resume as many times as you like — no limit{hardcoreRun ? ', and your crew are never at risk while it is paused' : ''}.
              </p>
            </>
          ) : (
            <>
              {/* Crash resume. In hardcore, "Let it go" DROWNS the crew (it ends the
                  run = a death), so require a second, explicit tap to confirm. */}
              <button
                onClick={hardcoreRun && !letGoArmed ? () => setLetGoArmed(true) : abandonResume}
                disabled={resuming}
                className="font-karla font-700 tap"
                style={{ marginTop: 12, width: '100%', padding: '0.7rem', borderRadius: 12, fontSize: '0.78rem',
                  color: hardcoreRun ? '#f0a6a6' : '#9a948a', background: 'transparent',
                  border: `1px solid ${hardcoreRun && letGoArmed ? 'rgba(224,85,90,0.6)' : 'rgba(154,148,138,0.28)'}`,
                  cursor: resuming ? 'wait' : 'pointer' }}>
                {hardcoreRun ? (letGoArmed ? 'Yes — end it and lose the crew' : 'Let it go') : 'Let it go'}
              </button>
              <p className="font-karla" style={{ fontSize: '0.62rem', color: hardcoreRun ? '#c88a8a' : '#7d776e', lineHeight: 1.5, marginTop: 12 }}>
                {hardcoreRun
                  ? (letGoArmed
                      ? 'This ends the run and drowns your whole squad, for good. Tap once more to confirm, or resume above.'
                      : 'A crashed run can be resumed once. Letting it go ends the run AND drowns your hardcore crew — permanently.')
                  : 'A crashed run can be resumed once. Letting it go banks the Fathoms you earned and ends the run.'}
              </p>
            </>
          )}
        </div>
      </>
    )
  }

  // Held: the confirmation shown right after "Pause & step away". The run is saved
  // server-side; the captain can wander off and resume from the hub any time.
  if (phase === 'paused') {
    return (
      <>
        <AbyssBackdrop hardcore={hardcoreRun} don={isDonG} />
        <AbyssScrim />
        <div className="pb-10 sm:pb-6" style={{ position: 'relative', zIndex: 1, maxWidth: 460, margin: '0 auto', paddingTop: 6, paddingLeft: '0.85rem', paddingRight: '0.85rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.4rem', marginTop: 30 }} aria-hidden>⏸</div>
          <h1 className="font-cinzel font-800" style={{ fontSize: '1.6rem', color: '#f3ead2', lineHeight: 1.12, marginTop: 10, textShadow: '0 0 26px rgba(240,192,64,0.3)' }}>
            Your Dive Is Held
          </h1>
          <p className="font-karla" style={{ fontSize: '0.82rem', color: '#b9b2a6', lineHeight: 1.55, marginTop: 12, maxWidth: 340, marginInline: 'auto' }}>
            Saved right where you stopped. Step away as long as you need — come back to the Gauntlet whenever and pick up the descent{hardcoreRun ? '. Your crew are safe while it is held' : ''}.
          </p>
          <button onClick={doResume} disabled={resuming} className="font-cinzel font-800 uppercase tracking-[0.08em] tap"
            style={{ marginTop: 24, width: '100%', padding: '1.05rem', borderRadius: 14, fontSize: '1.05rem', color: GOLD, background: `linear-gradient(180deg, ${GOLD}2a, ${GOLD}10)`, border: `1px solid ${GOLD}70`, cursor: resuming ? 'wait' : 'pointer', boxShadow: `0 0 22px ${GOLD}22` }}>
            {resuming ? 'Descending…' : 'Resume Now'}
          </button>
          <div style={{ marginTop: 12 }}>
            <BackLink router={router} label="Leave for now" />
          </div>
        </div>
      </>
    )
  }

  if (phase === 'intro') {
    return (
      <>
        <AbyssBackdrop hardcore={hardcoreRun} don={isDonG} />
        <AbyssScrim />
        {/* Just enough bottom pad to clear the fixed mobile tab bar (~58px):
            this + the global page footer below (~25px) lands "Not today" just
            above the bar. No safe-area inset (the bar already sits at bottom:0,
            so the inset was pure excess — the old relic that stacked to ~120px
            on an iPhone PWA). On sm+ the bar is hidden, so drop to a small pad. */}
        <div
          className="pb-10 sm:pb-6"
          style={{
            position: 'relative', zIndex: 1, maxWidth: 460, margin: '0 auto',
            paddingTop: 6, paddingLeft: '0.85rem', paddingRight: '0.85rem', textAlign: 'center',
          }}>
          {/* Title — a rich picker when the player has BOTH gauntlets unlocked,
              otherwise a plain heading. */}
          {props.otherGauntletUnlocked ? (
            <div style={{ position: 'relative', display: 'inline-block', marginTop: 8 }}>
              <button type="button" onClick={() => { vibrate([0, 12]); setSwitcherOpen(o => !o) }} className="tap"
                aria-haspopup="menu" aria-expanded={switcherOpen}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
                <h1 className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#f3ead2', lineHeight: 1.08, textShadow: '0 2px 10px rgba(0,0,0,0.9), 0 0 22px rgba(240,192,64,0.3)' }}>
                  {gauntletTitle}
                </h1>
                {/* a themed control chip so the title clearly reads as switchable */}
                <motion.span aria-hidden
                  animate={switcherOpen ? {} : { boxShadow: [`0 0 0px ${AC}00`, `0 0 12px ${AC}55`, `0 0 0px ${AC}00`] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: `${AC}1c`, border: `1px solid ${AC}66` }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={AC} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: switcherOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </motion.span>
              </button>
              <AnimatePresence>
                {switcherOpen && (() => {
                  const GS = [
                    { id: 'davy', name: 'Davy Jones Gauntlet', route: '/raids/gauntlet',      img: MAW_IMG,          ac: TEAL,   tag: 'The original descent' },
                    { id: 'don',  name: "Don's Gauntlet",      route: '/raids/dons-gauntlet', img: '/donsgauntlet.png', ac: KRAKEN, tag: 'The endgame descent' },
                  ]
                  const currentId = isDonG ? 'don' : 'davy'
                  return (
                    <>
                      {/* outside-tap backdrop */}
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => setSwitcherOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(3,6,10,0.55)', backdropFilter: 'blur(2px)' }} />
                      {/* centering wrapper stays static so the menu's own scale/opacity
                          animation never clobbers the translateX(-50%). */}
                      <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 10, zIndex: 41 }}>
                        <motion.div role="menu"
                          initial={{ opacity: 0, y: -10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.94 }}
                          transition={{ type: 'spring', stiffness: 440, damping: 30 }}
                          style={{ transformOrigin: 'top center', width: 296, padding: 9, borderRadius: 18,
                            background: 'linear-gradient(180deg, rgba(15,21,28,0.99), rgba(8,11,15,0.99))', border: `1px solid ${AC}44`, boxShadow: `0 20px 48px rgba(0,0,0,0.66), 0 0 0 1px rgba(255,255,255,0.02)` }}>
                          <p className="font-karla font-800 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: '#8a948e', textAlign: 'center', margin: '2px 0 9px' }}>Choose your gauntlet</p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {GS.map((g, i) => {
                              const here = g.id === currentId
                              return (
                                <motion.button key={g.id} type="button"
                                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 + i * 0.07 }}
                                  onClick={here ? undefined : () => { vibrate([0, 16]); setSwitcherOpen(false); router.push(g.route) }}
                                  disabled={here}
                                  whileTap={here ? undefined : { scale: 0.97 }}
                                  className="tap"
                                  style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '0.62rem 0.7rem', borderRadius: 13, cursor: here ? 'default' : 'pointer',
                                    background: here ? `${g.ac}16` : 'rgba(255,255,255,0.028)', border: `1px solid ${here ? `${g.ac}66` : 'rgba(255,255,255,0.09)'}` }}>
                                  {/* hero portrait with a themed glow ring */}
                                  <span style={{ position: 'relative', flexShrink: 0, width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span aria-hidden style={{ position: 'absolute', inset: -3, borderRadius: '50%', background: `radial-gradient(circle, ${g.ac}4d, transparent 70%)` }} />
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={g.img} alt="" loading="lazy" decoding="async" style={{ position: 'relative', width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: `1.5px solid ${g.ac}99`, background: 'rgba(0,0,0,0.35)' }} />
                                  </span>
                                  <span style={{ flex: 1, minWidth: 0 }}>
                                    <span className="font-cinzel font-700 truncate" style={{ display: 'block', fontSize: '0.94rem', color: here ? '#f3ead2' : '#e4ece8', lineHeight: 1.1 }}>{g.name}</span>
                                    <span className="font-karla font-600" style={{ display: 'block', fontSize: '0.62rem', color: `${g.ac}cc`, marginTop: 2 }}>{g.tag}</span>
                                  </span>
                                  {here ? (
                                    <span className="font-karla font-800 uppercase tracking-[0.1em]" style={{ flexShrink: 0, fontSize: '0.48rem', color: g.ac, background: `${g.ac}20`, border: `1px solid ${g.ac}55`, borderRadius: 999, padding: '0.18rem 0.45rem' }}>Here</span>
                                  ) : (
                                    <motion.span aria-hidden animate={{ x: [0, 3, 0] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} style={{ flexShrink: 0, display: 'flex', color: g.ac }}>
                                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                                    </motion.span>
                                  )}
                                </motion.button>
                              )
                            })}
                          </div>
                        </motion.div>
                      </div>
                    </>
                  )
                })()}
              </AnimatePresence>
            </div>
          ) : (
            <h1 className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#f3ead2', lineHeight: 1.08, marginTop: 8, textShadow: '0 2px 10px rgba(0,0,0,0.9), 0 0 22px rgba(240,192,64,0.3)' }}>
              {gauntletTitle}
            </h1>
          )}

          {/* The maw — the hole you drop into. Depth-ping rings pulse out of it
              and the whole thing breathes, so it reads as alive and pulling you
              down rather than a static crest. */}
          <div style={{ position: 'relative', width: 162, height: 162, margin: '14px auto 4px' }}>
            {/* sonar rings emanating from the deep */}
            {[0, 1.4, 2.8].map((d, i) => (
              <span key={i} aria-hidden style={{ position: 'absolute', left: '50%', top: '50%', width: 128, height: 128, marginLeft: -64, marginTop: -64, borderRadius: '50%', border: `1.5px solid ${AC}`, boxShadow: `0 0 12px ${AC}55`, opacity: 0, animation: `gauntRing 4.2s ${d}s ease-out infinite` }} />
            ))}
            {/* ambient glow */}
            <div style={{ position: 'absolute', inset: -20, borderRadius: '50%', background: `radial-gradient(circle, rgba(240,192,64,0.26) 0%, ${isDonG ? 'rgba(63,191,130,0.14)' : 'rgba(94,234,212,0.12)'} 42%, transparent 70%)`, animation: 'gauntPulse 4.2s ease-in-out infinite' }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroImg} alt="" loading="eager" decoding="async"
              style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 10px 32px rgba(0,0,0,0.75))', animation: 'gauntMaw 6s ease-in-out infinite' }} />
          </div>

          {/* Hero stat — how deep you've gone. The personal mark the whole screen
              is really about, right under the maw. Taps to the full run recap
              (boons, curses, tides) when a deepest run is on record. */}
          {(() => {
            const canRecap = !!props.deepestRun && props.deepest > 0
            const inner = (
              <>
                <p className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.26em', color: AC, textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>Your deepest descent</p>
                {props.deepest > 0
                  ? <>
                      <p className="font-cinzel font-800" style={{ fontSize: '1.7rem', lineHeight: 1.05, color: '#f3ead2', marginTop: 1 }}>
                        <span style={{ fontSize: '0.72rem', color: '#8a857c', letterSpacing: '0.04em' }}>DEPTH </span>
                        <span style={{ color: AC, textShadow: `0 2px 8px rgba(0,0,0,0.9), 0 0 20px ${AC}66` }}>{props.deepest}</span>
                      </p>
                      {canRecap && (
                        <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.5rem', color: `${AC}cc`, marginTop: 3 }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                          View run
                        </span>
                      )}
                    </>
                  : <p className="font-karla font-600" style={{ fontSize: '0.82rem', color: '#b3ac9e', marginTop: 3, fontStyle: 'italic', textShadow: '0 1px 6px rgba(0,0,0,0.75)' }}>Uncharted. Your first dive awaits.</p>}
              </>
            )
            return canRecap ? (
              <button type="button" onClick={() => { vibrate([0, 12]); setRecapRun({ hardcore: false }) }}
                aria-label="View your deepest run" className="tap"
                style={{ marginTop: 2, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                {inner}
              </button>
            ) : (
              <div style={{ marginTop: 2 }}>{inner}</div>
            )
          })()}

          {/* ── TIER 1 · The one action ───────────────────────────
              Compact currencies then Descend, so starting a run sits
              right under the maw with nothing competing above it. */}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8 }}>
            <button onClick={() => setInfoCurrency('fathoms')} title="What are Fathoms?"
              className="active:scale-95"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.3rem 0.7rem 0.3rem 0.55rem', borderRadius: 999, background: `linear-gradient(180deg, ${AC}22, rgba(6,10,16,0.6))`, border: `1px solid ${AC}55`, cursor: 'pointer', transition: 'transform 0.08s' }}>
              {/* Anchor = Fathoms (depth). */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={AC} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="5" r="2" /><path d="M12 7v13" /><path d="M5 12H3a9 9 0 0 0 18 0h-2" /><path d="M8 10h8" /></svg>
              <span className="font-cinzel font-800" style={{ fontSize: '0.95rem', color: AC, lineHeight: 1 }}>{fmt(fathomsNow)}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={AC} strokeWidth="2.2" strokeLinecap="round" aria-hidden style={{ opacity: 0.55 }}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>
            </button>
            {/* Blood Gems — shown once Hardcore is unlocked (discoverable at 0)
                or whenever the player holds any. */}
            {(bloodGemsNow > 0 || props.hardcoreUnlocked) && (
              <button onClick={() => setInfoCurrency('blood')} title="What are Blood Gems?"
                className="active:scale-95"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.3rem 0.7rem 0.3rem 0.55rem', borderRadius: 999, background: 'linear-gradient(180deg, rgba(192,56,74,0.18), rgba(120,20,32,0.12))', border: '1px solid rgba(220,38,38,0.55)', boxShadow: '0 0 12px rgba(192,56,74,0.22)', cursor: 'pointer', transition: 'transform 0.08s' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden style={{ filter: 'drop-shadow(0 0 2.5px rgba(220,38,38,0.7))' }}><path d="M12 2s7 8.6 7 13a7 7 0 1 1-14 0c0-4.4 7-13 7-13z" fill="#d1394b" /><path d="M9.2 12.4a3.4 3.4 0 0 0-.2 4.2" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.3" fill="none" strokeLinecap="round" /></svg>
                <span className="font-cinzel font-800" style={{ fontSize: '0.95rem', color: '#f2536a', lineHeight: 1, textShadow: '0 0 10px rgba(220,38,38,0.6)' }}>{fmt(bloodGemsNow)}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f2536a" strokeWidth="2.2" strokeLinecap="round" aria-hidden style={{ opacity: 0.6 }}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>
              </button>
            )}
          </div>

          {/* Descend — the two mode cards ARE the descent buttons. Normal starts
              a run immediately; Hardcore opens the "send them down" confirm (its
              own gating shown inline). No separate mode-choice modal on the way
              in. Each card also shows that mode's deepest diver — the mark to
              beat. */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9, padding: '0 0.15rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span aria-hidden style={{ width: 14, height: 2, borderRadius: 2, background: `${AC}aa` }} />
                <span className="font-karla font-800 uppercase" style={{ fontSize: '0.55rem', letterSpacing: '0.2em', color: '#c2bcae', textShadow: '0 1px 5px rgba(0,0,0,0.7)' }}>Choose Your Descent</span>
              </span>
              <LeaderboardModal boards={isDonG ? ['gauntletDonsDepth'] : ['gauntletDepth', 'gauntletHardcore', 'gauntletBigHit']} title={isDonG ? "Don's Gauntlet" : 'The Gauntlet'} label="Full ranks"
                triggerStyle={{ background: 'none', border: 'none', color: '#9a948a', padding: 0, fontSize: '0.55rem', letterSpacing: '0.04em' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {(() => {
                const canHc = props.hardcoreUnlocked
                const comingSoon = !canHc && !props.hardcoreLive
                const cards = [
                  {
                    key: 'normal' as const, color: AC, label: 'Normal', rec: props.topDescender,
                    mine: props.deepest, recap: (props.deepestRun && props.deepest > 0) ? props.deepestRun : null,
                    enabled: !starting,
                    onClick: () => begin(false),
                    disabledNote: starting ? 'Descending…' : null as string | null,
                  },
                  {
                    key: 'hardcore' as const, color: '#e0555a', label: 'Hardcore', rec: props.hardcoreTop,
                    mine: props.hcDeepest, recap: (props.hcDeepestRun && props.hcDeepest > 0) ? props.hcDeepestRun : null,
                    enabled: canHc && !starting && props.hcRunsLeft > 0,
                    onClick: () => setHcConfirmOpen(true),
                    disabledNote: comingSoon ? 'Coming soon' : !canHc ? `Reach depth ${HC_UNLOCK_DEPTH}` : props.hcRunsLeft <= 0 ? 'No runs left today' : starting ? 'Descending…' : null,
                  },
                ]
                // Card = a wrapper with a descend button (the pulsing down-arrow IS
                // the tap-to-dive indicator; no CTA text) and a deepest footer as
                // siblings. Footer shows YOUR best above the global #1; Normal taps
                // to the detailed recap.
                return cards.map(c => (
                  <div key={c.key} style={{
                    position: 'relative', display: 'flex', flexDirection: 'column', minWidth: 0, borderRadius: 15, overflow: 'hidden',
                    // A doorway into the dark: accent light up top pooling into a
                    // black shaft at the bottom you're about to drop through. Kept
                    // solid enough through the middle/bottom that the label + depth
                    // stats read over the painted abyss behind (was ~55% at the
                    // base, which the busy backdrop washed out).
                    background: `radial-gradient(ellipse 130% 78% at 50% 118%, rgba(0,0,0,0.66), transparent 56%), linear-gradient(180deg, ${c.color}2a 0%, rgba(8,13,22,0.74) 46%, rgba(5,9,16,0.92) 100%)`,
                    border: `1px solid ${c.color}${c.enabled ? '5a' : '22'}`,
                    boxShadow: c.enabled ? `0 0 22px ${c.color}1e, inset 0 1px 0 ${c.color}33` : 'none',
                    opacity: c.enabled ? 1 : 0.6,
                  }}>
                    {/* faint threshold line at the top of the doorway */}
                    <span aria-hidden style={{ position: 'absolute', top: 0, left: '14%', right: '14%', height: 1, background: `linear-gradient(90deg, transparent, ${c.color}${c.enabled ? '88' : '44'}, transparent)` }} />
                    <motion.button
                      onClick={c.enabled ? c.onClick : undefined}
                      disabled={!c.enabled}
                      whileTap={c.enabled ? { scale: 0.97 } : undefined}
                      className="tap"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '1.1rem 0.55rem 0.9rem', background: 'none', border: 'none', textAlign: 'center', minWidth: 0, cursor: c.enabled ? 'pointer' : 'default', color: 'inherit' }}>
                      {/* Descend indicator — a bobbing double-chevron in a glowing
                          well that reads as the mouth you drop through */}
                      <motion.div aria-hidden
                        animate={c.enabled ? { y: [0, 4, 0] } : {}}
                        transition={c.enabled ? { duration: 1.7, repeat: Infinity, ease: 'easeInOut' } : undefined}
                        style={{ position: 'relative', width: 52, height: 52, borderRadius: '50%', background: `radial-gradient(circle at 50% 38%, ${c.color}66, ${c.color}0c 70%)`, border: `1.5px solid ${c.color}${c.enabled ? 'c0' : '55'}`, boxShadow: c.enabled ? `0 0 26px ${c.color}55, inset 0 0 14px ${c.color}22` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.color }}>
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 5l6 6 6-6M6 12l6 6 6-6" /></svg>
                      </motion.div>
                      <span className="font-cinzel font-800 uppercase" style={{ fontSize: '1.05rem', letterSpacing: '0.05em', color: c.color, lineHeight: 1, textShadow: c.enabled ? `0 0 16px ${c.color}44` : 'none' }}>{c.label}</span>
                      {!c.enabled && c.disabledNote && (
                        <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.08em', color: `${c.color}cc` }}>{c.disabledNote}</span>
                      )}
                    </motion.button>
                    {/* Deepest footer — your best above the global #1, aligned for
                        readability. Normal taps to the recap. */}
                    <button
                      onClick={c.recap ? () => setRecapRun({ hardcore: c.key === 'hardcore' }) : undefined}
                      className={c.recap ? 'tap' : undefined}
                      aria-label={c.recap ? 'Recap your deepest run' : undefined}
                      style={{ width: '100%', marginTop: 'auto', padding: '0.52rem 0.6rem 0.55rem', background: c.recap ? `${c.color}0d` : 'none', border: 'none', borderTop: `1px solid ${c.color}22`, cursor: c.recap ? 'pointer' : 'default', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                        <span className="font-karla font-800 uppercase" style={{ flexShrink: 0, fontSize: '0.48rem', letterSpacing: '0.12em', color: `${c.color}cc` }}>You</span>
                        {c.mine > 0
                          ? <span className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#f2ede3', whiteSpace: 'nowrap' }}>Depth {c.mine}{c.recap ? ' ↻' : ''}</span>
                          : <span className="font-karla" style={{ fontSize: '0.62rem', color: '#8a857c' }}>Uncharted</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <span className="font-karla font-800 uppercase" style={{ flexShrink: 0, fontSize: '0.48rem', letterSpacing: '0.12em', color: '#6a665e' }}>#1</span>
                        {c.rec
                          ? <span className="font-cinzel font-700" style={{ fontSize: '0.66rem', color: '#a8a296', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{c.rec.name} · {c.rec.depth}</span>
                          : <span className="font-karla" style={{ fontSize: '0.6rem', color: '#6a665e' }}>Unclaimed</span>}
                      </div>
                    </button>
                  </div>
                ))
              })()}
            </div>
            {/* ── Reference band — the three things worth reading before a dive,
                promoted out of the old tiny text links. Synergies especially is a
                core mechanic, not a footnote; Rewards folds both mode loot guides
                into one card (toggle lives inside). ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10 }}>
              {([
                { key: 'syn', title: 'Synergies', sub: 'Boons that fuse', color: '#b98bff', glow: true, onClick: () => setSynergiesOpen(true),
                  icon: <><path d="M12 2 4 7v10l8 5 8-5V7z" /><path d="M12 22V12" /><path d="m4 7 8 5 8-5" /></> },
                { key: 'loot', title: 'Rewards', sub: 'Items · skins · odds', color: GOLD, glow: false, onClick: () => setLootMode('normal'),
                  icon: <><path d="M3 9.5 4 7a1.6 1.6 0 0 1 1.5-1h13A1.6 1.6 0 0 1 20 7l1 2.5" /><rect x="3" y="9.5" width="18" height="9.5" rx="1.6" /><path d="M3 13.2h18" /></> },
                { key: 'how', title: 'How it works', sub: 'The rules', color: '#8fb8b0', glow: false, onClick: () => setIntroOpen(true),
                  icon: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1 .8-1 1.6" /><path d="M12 17h.01" /></> },
              ] as const).map(c => (
                <button key={c.key} onClick={c.onClick} className="tap"
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '0.7rem 0.35rem 0.6rem', borderRadius: 13, cursor: 'pointer', minWidth: 0,
                    background: `linear-gradient(180deg, ${c.color}1c 0%, rgba(8,12,20,0.66) 100%)`,
                    border: `1px solid ${c.color}${c.glow ? '6e' : '3a'}`,
                    boxShadow: c.glow ? `0 0 16px ${c.color}22` : 'none' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: `${c.color}1e`, border: `1px solid ${c.color}55`, color: c.color }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{c.icon}</svg>
                  </span>
                  <span className="font-cinzel font-800 uppercase" style={{ fontSize: '0.66rem', letterSpacing: '0.02em', color: '#f2ede2', lineHeight: 1.08, textAlign: 'center' }}>{c.title}</span>
                  <span className="font-karla font-600" style={{ fontSize: '0.52rem', color: '#9a948a', lineHeight: 1.15, textAlign: 'center' }}>{c.sub}</span>
                </button>
              ))}
            </div>
            {GAUNTLET_COOLDOWN_HOURS > 0 && (
              <p className="font-karla" style={{ fontSize: '0.68rem', color: '#a29c90', marginTop: 8, textAlign: 'center', textShadow: '0 1px 5px rgba(0,0,0,0.7)' }}>
                Each descent starts the {GAUNTLET_COOLDOWN_HOURS}-hour cooldown.
              </p>
            )}
          </div>

          {/* ── TIER 3 · The Locker — shops + guides, one weight down ──
              Two shops as tiles, then muted guide links. Nothing here
              competes with Descend. */}
          <div style={{ marginTop: 20, textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9, paddingLeft: 2 }}>
              <span aria-hidden style={{ width: 14, height: 2, borderRadius: 2, background: `${GOLD}aa` }} />
              <span className="font-karla font-800 uppercase" style={{ fontSize: '0.55rem', letterSpacing: '0.2em', color: '#c2bcae', textShadow: '0 1px 5px rgba(0,0,0,0.7)' }}>The Locker</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
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
                label="Permanent Upgrades"
                line="Voyages, raids, fishing"
                icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v15" /><path d="M5 11l7-4 7 4" /><path d="M4 14c1.6 2.5 4.5 4 8 4s6.4-1.5 8-4" /><path d="M9 5.5h6" /></svg>}
              />
            </div>

            {/* Active run perks — gauntlet-scoped upgrades in effect this dive.
                Permanent Upgrades apply out in the world, so they'd only
                confuse here. */}
            {(() => {
              // Tiered chains (Deep Lungs I/II/III): show only the TOP owned tier
              // — a perk is superseded if an owned upgrade `requires` it.
              const owned = upgradesForVariant(props.variant ?? 'davy').filter(u =>
                u.scope === 'gauntlet' && activeUpgrades.includes(u.id)
                && !activeUpgrades.some(o => getGauntletUpgrade(o)?.requires === u.id))
              if (owned.length === 0) return null
              return (
                <div style={{ marginTop: 14 }}>
                  <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: '#7a8e8a', marginBottom: 7 }}>Active Run Perks · {owned.length}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {owned.map(u => (
                      <span key={u.id} title={u.description} className="font-karla font-700" style={{ fontSize: '0.56rem', color: `${AC}dd`, background: `${AC}12`, border: `1px solid ${AC}30`, borderRadius: 999, padding: '0.2rem 0.6rem' }}>
                        ✓ {u.name}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>

          <BackLink router={router} label="Not today" />
        </div>
        {introOpen && <GauntletIntroModal variant={props.variant} onClose={dismissIntro} firstTime={!props.hasSeenIntro} />}
        {lootMode && <LootModal mode={lootMode} don={isDonG} totalFortune={props.totalFortune} onClose={() => setLootMode(null)} />}
        {infoCurrency && <CurrencyInfoModal kind={infoCurrency} don={isDonG} onClose={() => setInfoCurrency(null)} />}
        {/* Home: no active run, so Codex-only (no "This Run" tab). */}
        {synergiesOpen && <SynergiesModal owned={boonTiers} seen={seenConfluences} taken={confluencesTaken} takenConv={convergencesTaken} variant={props.variant ?? 'davy'} activeRun={false} onClose={() => setSynergiesOpen(false)} />}
        {recapRun && <DeepestRunModal best={recapRun.hardcore ? props.hcDeepestRun : props.deepestRun} last={recapRun.hardcore ? props.hcLastRun : props.lastRun} hardcore={recapRun.hardcore} don={isDonG} onClose={() => setRecapRun(null)} />}
        {shopSection && <LockerUpgradesModal section={shopSection} variant={props.variant ?? 'davy'} onClose={() => setShopSection(null)} onClaimed={(owned) => { setUpgrades(owned); setBonusSlots(bonusChargeSlots(owned)) }} onToggled={setUpgradesOff} />}
        {descentModals}
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
            onClick={() => setModeChoiceOpen(true)}
            disabled={starting}
            className="font-cinzel font-700 uppercase tracking-[0.08em] tap"
            style={{ width: '100%', padding: '0.9rem', borderRadius: 12, fontSize: '1rem', background: 'rgba(232,200,121,0.2)', border: '1px solid rgba(232,200,121,0.55)', color: '#e8c879', cursor: 'pointer' }}
          >
            {starting ? 'Descending…' : 'Descend Again →'}
          </button>
        ) : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={() => setShopSection('run')} className="font-cinzel font-700 uppercase tracking-[0.07em] tap"
            style={{ flex: 1, padding: '0.8rem', borderRadius: 13, fontSize: '0.74rem', color: AC, background: `${AC}14`, border: `1px solid ${AC}55`, cursor: 'pointer' }}>
            Run Upgrades
          </button>
          <button onClick={() => setShopSection('shore')} className="font-cinzel font-700 uppercase tracking-[0.07em] tap"
            style={{ flex: 1, padding: '0.8rem', borderRadius: 13, fontSize: '0.74rem', color: GOLD, background: `${GOLD}14`, border: `1px solid ${GOLD}55`, cursor: 'pointer' }}>
            Permanent Upgrades
          </button>
        </div>
        <BackLink router={router} label="Back to the map" primary={!ready} />
        {shopSection && <LockerUpgradesModal section={shopSection} variant={props.variant ?? 'davy'} onClose={() => setShopSection(null)} onClaimed={(owned) => { setUpgrades(owned); setBonusSlots(bonusChargeSlots(owned)) }} onToggled={setUpgradesOff} />}
        {descentModals}
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
    return <GauntletReward r={r} recap={{ shipsSunk: rollStateRef.current.cleared, maxHit: runMaxHitRef.current, boonTiers, curseTiers, confluencesTaken, convergencesTaken, stats: runStatsRef.current, events: runEventsRef.current, contracts: contractsWon }} onBack={backToIntro} don={isDonG} />
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
    // Death wash: Davy's crimson, or Don's sickly kraken green.
    const CRIMSON = isDonG ? '#2ea86a' : '#ef4444'
    return (
      <>
        {hardcoreRun ? <HcSeaBackdrop /> : <AbyssBackdrop hardcore={hardcoreRun} don={isDonG} />}
        <AbyssScrim />
        {/* Death wash bleeding up from the deep, over the abyss. */}
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
            <div style={{ position: 'absolute', inset: -22, borderRadius: '50%', background: `radial-gradient(circle, ${CRIMSON}30 0%, ${isDonG ? 'rgba(20,90,55,0.16)' : 'rgba(120,20,20,0.14)'} 42%, transparent 70%)`, animation: 'gauntPulse 3.4s ease-in-out infinite' }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <motion.img src={heroImg} alt="" loading="eager" decoding="async"
              animate={{ y: [0, -5, 0] }} transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
              style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: `${isDonG ? '' : DROWNED_FILTER + ' '}drop-shadow(0 10px 30px rgba(0,0,0,0.8)) drop-shadow(0 0 22px ${CRIMSON}40)` }} />
          </motion.div>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.32em', color: CRIMSON }}>
            {isDonG ? 'The Green Takes It' : 'The Locker Takes It'}
          </motion.p>
          <motion.h1 initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.24, type: 'spring', stiffness: 240, damping: 18 }}
            className="font-cinzel font-800" style={{ fontSize: '1.95rem', color: isDonG ? '#d6f3e6' : '#f3d6d6', lineHeight: 1.08, marginTop: 6, textShadow: `0 0 26px ${CRIMSON}3a` }}>
            You Sank
          </motion.h1>
          <p className="font-karla" style={{ fontSize: '0.78rem', color: '#9a948a', marginTop: 6 }}>
            Dragged under at depth {diedAt} · {cleared} {cleared === 1 ? 'round' : 'rounds'} deep
          </p>
          {/* Band epitaph — WHERE you fell, in the sea's own words. */}
          <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: `${CRIMSON}bb`, marginTop: 4, letterSpacing: '0.03em' }}>
            {bandForDepth(diedAt, props.variant).name} keeps what it takes.
          </p>

          {/* The pot lost — the cost of pushing too far. */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34, duration: 0.4 }}
            style={{ marginTop: 16, padding: '1rem 1rem 0.95rem', borderRadius: 16, background: `radial-gradient(ellipse at 50% 0%, ${CRIMSON}14 0%, rgba(8,13,22,0.5) 74%)`, border: `1px solid ${CRIMSON}40`, boxShadow: `inset 0 0 24px ${CRIMSON}0e, 0 14px 40px rgba(0,0,0,0.45)` }}
          >
            <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: `${CRIMSON}cc` }}>Gone to the Deep</p>
            <p className="font-cinzel font-800" style={{ fontSize: '1.7rem', color: '#e08a8a', lineHeight: 1.05, marginTop: 5, textShadow: `0 0 18px ${CRIMSON}33` }}>
              {/* Tallied, not shown flat — watching the loss count up is the sting. */}
              <CountUp to={lost} dur={1100} /> <span style={{ fontSize: '1.1rem' }}>⟡</span>
            </p>
            <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#8a8480', marginTop: 4 }}>
              and as much Nav XP, sunk with your ship.
            </p>
          </motion.div>

          {/* Hardcore: the squad is lost for good. The heaviest beat of the run. */}
          {hardcoreRun && (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44, duration: 0.45 }}
              style={{ marginTop: 14, padding: '1rem 0.95rem', borderRadius: 16, background: `${CRIMSON}12`, border: `1px solid ${CRIMSON}55`, boxShadow: `inset 0 0 22px ${CRIMSON}0e` }}
            >
              <p className="font-karla font-800 uppercase" style={{ fontSize: '0.52rem', letterSpacing: '0.2em', color: `${CRIMSON}dd` }}>Lost to the Locker</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 11 }}>
                {props.crewMembers.map(c => (
                  <div key={c.id} title={c.name} style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${CRIMSON}66`, background: 'rgba(20,10,12,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, filter: 'grayscale(0.5) brightness(0.82)' }}>
                    {c.imageUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={c.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#c48a8a' }}>{c.name.slice(0, 1)}</span>}
                  </div>
                ))}
              </div>
              <p className="font-karla" style={{ fontSize: '0.74rem', color: 'rgba(240,220,220,0.82)', marginTop: 11, lineHeight: 1.45 }}>
                Your squad went down with the ship — {props.crewMembers.length} crew, gone for good. They rest now in your Crew Hall.
              </p>
              <button onClick={() => router.push('/crew')} className="font-karla font-700 uppercase tracking-[0.12em] tap"
                style={{ marginTop: 12, padding: '0.5rem 1rem', borderRadius: 10, fontSize: '0.58rem', background: `${CRIMSON}18`, border: `1px solid ${CRIMSON}66`, color: '#fca5a5', cursor: 'pointer' }}>
                Visit the Graveyard
              </button>
            </motion.div>
          )}

          {/* Silver lining — the Fathoms you salvaged. Your deepest record is
              unchanged: only surviving and cashing out sets it. */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} style={{ marginTop: 14 }}>
            <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#7a766e' }}>Deepest run: depth {props.deepest}</p>
            {deathFathoms > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 10, padding: '0.36rem 0.85rem', borderRadius: 999, background: `${AC}0e`, border: `1px solid ${AC}3a` }}>
                <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#8aa39e' }}>Salvaged</span>
                <span className="font-cinzel font-800" style={{ fontSize: '0.85rem', color: AC }}>+{fmt(deathFathoms)} Fathoms</span>
              </div>
            )}
            <p className="font-karla" style={{ fontSize: '0.66rem', color: '#8a8480', marginTop: 8, lineHeight: 1.45 }}>
              The pot is lost, but how deep you reached is not. The Fathoms you earned and any depth unlocks you tore loose are yours to keep.
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.62, duration: 0.4 }}>
            <RunRecap depth={reached} shipsSunk={cleared} maxHit={runMaxHitRef.current} boonTiers={boonTiers} curseTiers={curseTiers} confluencesTaken={confluencesTaken} convergencesTaken={convergencesTaken} stats={runStatsRef.current} events={runEventsRef.current} contracts={contractsWon} don={isDonG} />
          </motion.div>

          <div style={{ marginTop: 22 }}>
            <BackLink router={router} label="Back to the map" primary onClick={backToIntro} />
          </div>
        </div>
      </>
    )
  }

  // ── The Drowned Shrine — a wager beat before the breather ───────────────────
  if (phase === 'shrine') {
    const VIO = '#b794f6'
    const hpNow = playerHP
    const bloodCost = Math.max(1, Math.round(hpNow * SHRINE_BLOOD_HP_PCT))
    const walkHeal = Math.round(hpMax * SHRINE_WALK_HEAL)
    const won = shrineCoin?.result === 'win'
    const maxStake = Math.min(SHRINE_WAGER_MAX, fathomsNow)
    const stake = Math.min(Math.max(1, shrineStake), Math.max(1, maxStake))
    const canWager = fathomsNow >= 1
    return (
      <>
        <AbyssBackdrop hardcore={hardcoreRun} don={isDonG} />
        <AbyssScrim />
        <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: [0.4, 0.7, 0.4] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: `radial-gradient(ellipse 130% 90% at 50% 0%, ${VIO}1f 0%, ${VIO}0a 42%, transparent 70%)` }} />
        <div style={{
          position: 'relative', zIndex: 1, maxWidth: 440, margin: '0 auto',
          padding: '12px 0.95rem', textAlign: 'center', overflow: 'hidden',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
        }}>
          <motion.p initial={{ opacity: 0, letterSpacing: '0.5em' }} animate={{ opacity: 1, letterSpacing: '0.32em' }} transition={{ duration: 0.8 }}
            className="font-karla font-800 uppercase" style={{ fontSize: '0.7rem', color: VIO, marginTop: 16, textShadow: `0 0 16px ${VIO}66` }}>
            A Drowned Shrine
          </motion.p>
          {/* A sunken idol, rising from the dark — only while you're choosing. */}
          {!shrineFlipping && !shrineCoin && (
            <motion.div initial={{ opacity: 0, y: -26, scale: 0.7 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              style={{ position: 'relative', width: 128, height: 128, margin: '16px auto 6px' }}>
              <div style={{ position: 'absolute', inset: -20, borderRadius: '50%', background: `radial-gradient(circle, ${VIO}3a 0%, transparent 66%)`, animation: 'gauntPulse 3.4s ease-in-out infinite' }} />
              <svg width="128" height="128" viewBox="0 0 24 24" fill="none" stroke={VIO} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'relative', filter: `drop-shadow(0 6px 22px ${VIO}55)` }} aria-hidden>
                <path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z" />
                <circle cx="12" cy="10" r="2.4" />
                <path d="M12 12.5V17" /><path d="M9.5 15h5" />
              </svg>
            </motion.div>
          )}

          {shrineFlipping ? (
            <div style={{ padding: '14px 0 10px' }}>
              <div style={{ perspective: 600, width: 112, height: 112, margin: '6px auto 0' }}>
                <motion.div initial={{ rotateY: 0 }} animate={{ rotateY: 360 * 4 }} transition={{ duration: 1.05, ease: [0.4, 0, 0.3, 1] }}
                  style={{ width: 112, height: 112, borderRadius: '50%', transformStyle: 'preserve-3d', background: `radial-gradient(circle at 38% 30%, #ffe9a8, ${GOLD} 58%, #b07f2c)`, border: '3px solid #d9b25a', boxShadow: `0 0 32px ${GOLD}99, inset 0 0 16px rgba(70,40,0,0.35)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="52" height="52" viewBox="0 0 24 24" fill="#7a5418" aria-hidden style={{ opacity: 0.85 }}>
                    <path d="M12 2a7 7 0 0 0-7 7c0 2.2 1 3.7 2.4 4.8.4.3.6.7.6 1.2v1.2A1.4 1.4 0 0 0 9.4 18.8h.3l.4-1.4h-.9l-.3-1.2h1.4l.4 1.2.4-1.2h.9l.4 1.2h1.4l-.3 1.2h-.9l.4 1.4h.3a1.4 1.4 0 0 0 1.4-1.4v-1.2c0-.5.2-.9.6-1.2C18 12.7 19 11.2 19 9a7 7 0 0 0-7-7Z" />
                    <circle cx="9.3" cy="9.3" r="1.5" fill="#ffe9a8" />
                    <circle cx="14.7" cy="9.3" r="1.5" fill="#ffe9a8" />
                  </svg>
                </motion.div>
              </div>
              <motion.p animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#efe7fb', marginTop: 20, textShadow: `0 0 20px ${GOLD}44` }}>
                The coin turns in the dark…
              </motion.p>
            </div>
          ) : !shrineCoin ? (
            <>
              <motion.h1 initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15, type: 'spring', stiffness: 220, damping: 18 }}
                className="font-cinzel font-800" style={{ fontSize: '1.95rem', color: '#efe7fb', lineHeight: 1.06, marginTop: 6, textShadow: `0 0 26px ${VIO}55` }}>
                Make an Offering
              </motion.h1>
              <p className="font-karla" style={{ fontSize: '0.9rem', fontStyle: 'italic', color: 'rgba(214,200,240,0.7)', lineHeight: 1.5, marginTop: 8, padding: '0 0.4rem' }}>
                The old gods of the deep trade in nerve and blood. Lay something on the stone, or walk on.
              </p>

              {/* Davy's Coin — double-or-nothing on your banked Fathoms */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                style={{ marginTop: 18, padding: '0.9rem 1rem 1rem', borderRadius: 16, background: `linear-gradient(180deg, ${GOLD}26, rgba(7,12,19,0.9) 60%)`, border: `1.5px solid ${GOLD}88`, boxShadow: `0 0 22px ${GOLD}20`, textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5h3.2a1.8 1.8 0 0 1 0 3.6H9.5h3.5a1.8 1.8 0 0 1 0 3.6H9.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <p className="font-cinzel font-800" style={{ flex: 1, fontSize: '1.05rem', color: '#f5d98a' }}>Davy&apos;s Coin</p>
                  <span className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.12em', color: '#1a1206', background: GOLD, borderRadius: 999, padding: '0.2rem 0.5rem' }}>Double or nothing</span>
                </div>
                {canWager ? (
                  <>
                    <p className="font-karla" style={{ fontSize: '0.78rem', color: '#cdbfa0', lineHeight: 1.45, marginTop: 6 }}>
                      Stake your hard-won Fathoms on the flip. Heads, you double them. Tails, the deep keeps them.
                    </p>
                    {/* Stake stepper */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 12 }}>
                      <button type="button" aria-label="Wager less" className="tap" onClick={() => setShrineStake(s => Math.max(1, Math.min(s, maxStake) - 1))}
                        style={{ width: 36, height: 36, borderRadius: 10, fontSize: '1.3rem', lineHeight: 1, color: '#f5d98a', background: `${GOLD}1c`, border: `1px solid ${GOLD}66`, cursor: 'pointer' }}>−</button>
                      <div style={{ textAlign: 'center', minWidth: 96 }}>
                        <p className="font-cinzel font-800" style={{ fontSize: '1.6rem', color: GOLD, lineHeight: 1 }}>{stake} <span style={{ fontSize: '0.85rem' }}>Fathoms</span></p>
                      </div>
                      <button type="button" aria-label="Wager more" className="tap" onClick={() => setShrineStake(s => Math.min(maxStake, Math.min(s, maxStake) + 1))}
                        style={{ width: 36, height: 36, borderRadius: 10, fontSize: '1.3rem', lineHeight: 1, color: '#f5d98a', background: `${GOLD}1c`, border: `1px solid ${GOLD}66`, cursor: 'pointer' }}>+</button>
                    </div>
                    <p className="font-karla font-700" style={{ fontSize: '0.66rem', textAlign: 'center', color: '#b0a890', marginTop: 8 }}>
                      Win <span style={{ color: '#86efac' }}>+{stake}</span> · Lose <span style={{ color: '#e0a0a0' }}>−{stake}</span> · You hold {fmt(fathomsNow)}
                    </p>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={shrineCoinFlip} className="font-cinzel font-800 uppercase tracking-[0.06em] tap"
                      style={{ width: '100%', marginTop: 12, padding: '0.85rem', borderRadius: 12, fontSize: '0.95rem', color: '#1a1206', background: `linear-gradient(180deg, #ffe08a, ${GOLD})`, border: `1px solid ${GOLD}`, cursor: 'pointer', boxShadow: `0 0 18px ${GOLD}3a` }}>
                      Flip the Coin
                    </motion.button>
                  </>
                ) : (
                  <p className="font-karla" style={{ fontSize: '0.78rem', color: '#a8a08c', lineHeight: 1.45, marginTop: 6, fontStyle: 'italic' }}>
                    You&apos;ve no Fathoms banked to wager. Descend, earn some, and the coin will be here next time.
                  </p>
                )}
              </motion.div>

              {/* Blood Price — HP for a boon */}
              <motion.button whileTap={{ scale: 0.975 }} onClick={shrineBloodPrice} className="tap"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
                style={{ width: '100%', textAlign: 'left', marginTop: 11, padding: '0.9rem 1rem', borderRadius: 16, background: `linear-gradient(180deg, rgba(239,68,68,0.16), rgba(8,13,22,0.6) 78%)`, border: '1.5px solid rgba(239,68,68,0.55)', color: '#f6e3e3', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8" style={{ flexShrink: 0 }}><path d="M12 2s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <p className="font-cinzel font-800" style={{ flex: 1, fontSize: '1.05rem', color: '#fca5a5' }}>Blood Price</p>
                  <span className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.12em', color: '#fca5a5', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.6)', borderRadius: 999, padding: '0.2rem 0.5rem' }}>Sure thing</span>
                </div>
                <p className="font-karla" style={{ fontSize: '0.78rem', color: '#d3b8b8', lineHeight: 1.45, marginTop: 6 }}>
                  {termFx.bloodPriceToOne
                    ? <>Bleed <strong style={{ color: '#fca5a5' }}>everything but a single point of hull</strong> onto the stone and a power surfaces: an extra boon draft, here and now. You signed for this.</>
                    : <>Bleed <strong style={{ color: '#fca5a5' }}>half your hull ({fmt(bloodCost)} HP)</strong> onto the stone and a power surfaces: an extra boon draft, here and now.</>}
                </p>
              </motion.button>

              {/* Walk on — safe heal */}
              <motion.button whileTap={{ scale: 0.975 }} onClick={shrineWalkOn} className="tap"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}
                style={{ width: '100%', textAlign: 'left', marginTop: 11, padding: '0.85rem 1rem', borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.16)', color: '#d8e6e2', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#86efac" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M12 21s-7-4.3-9.5-8.5C.8 9.6 2.4 6 6 6c2 0 3.2 1.2 4 2.3C10.8 7.2 12 6 14 6c3.6 0 5.2 3.6 3.5 6.5C19 16.7 12 21 12 21z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <p className="font-cinzel font-700" style={{ flex: 1, fontSize: '0.98rem', color: '#bfe6cf' }}>Leave an Offering, Walk On</p>
                </div>
                <p className="font-karla" style={{ fontSize: '0.76rem', color: '#9fb4ad', lineHeight: 1.45, marginTop: 5 }}>
                  No gamble. The shrine mends your hull for <strong style={{ color: '#86efac' }}>{fmt(walkHeal)} HP</strong> and lets you pass.
                </p>
              </motion.button>

              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.14em', color: '#7d7596', marginTop: 16 }}>
                Fathoms banked · {fmt(fathomsNow)} · Hull {hpNow}/{hpMax}
              </p>
            </>
          ) : (
            <>
              {/* Coin resolved — the deep gives, or the deep takes. A win bursts. */}
              {won && (
                <motion.div aria-hidden initial={{ scale: 0.3, opacity: 0.8 }} animate={{ scale: 2.6, opacity: 0 }} transition={{ duration: 0.9, ease: 'easeOut' }}
                  style={{ position: 'absolute', left: '50%', top: '34%', width: 240, height: 240, marginLeft: -120, marginTop: -120, borderRadius: '50%', background: `radial-gradient(circle, ${GOLD}66 0%, ${GOLD}1c 42%, transparent 70%)`, pointerEvents: 'none' }} />
              )}
              <motion.h1 key={shrineCoin.result} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 16 }}
                className="font-pirata" style={{ fontSize: '2.6rem', lineHeight: 1, marginTop: 6, color: won ? GOLD : '#ef4444', textShadow: won ? `0 0 30px ${GOLD}88` : '0 0 30px rgba(239,68,68,0.6)' }}>
                {won ? 'The Coin Falls True!' : 'The Deep Takes Its Cut'}
              </motion.h1>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                style={{ marginTop: 18, padding: '1.1rem', borderRadius: 16, background: won ? `${GOLD}14` : 'rgba(239,68,68,0.12)', border: `1px solid ${won ? `${GOLD}55` : 'rgba(239,68,68,0.45)'}` }}>
                <p className="font-cinzel font-800" style={{ fontSize: '2.3rem', lineHeight: 1, color: won ? '#86efac' : '#fca5a5', textShadow: won ? `0 0 24px ${GOLD}55` : 'none' }}>
                  {won ? '+' : '−'}{shrineCoin.stake} <span style={{ fontSize: '1.1rem' }}>Fathoms</span>
                </p>
                <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#b0a890', marginTop: 8 }}>
                  {fmt(shrineCoin.fathoms)} Fathoms banked
                </p>
              </motion.div>
              <motion.button whileTap={{ scale: 0.97 }} onClick={shrineDescend} className="font-cinzel font-800 uppercase tracking-[0.06em] tap"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                style={{ width: '100%', marginTop: 22, padding: '1.05rem', borderRadius: 14, fontSize: '1.05rem', color: '#efe7fb', background: `linear-gradient(180deg, ${VIO}33, ${VIO}12)`, border: `1px solid ${VIO}77`, cursor: 'pointer' }}>
                Leave the Shrine
              </motion.button>
            </>
          )}
        </div>
        {exitModal}
      </>
    )
  }

  // ── The Black Market (Don's mid-run shop) ────────────────────────────────
  if (phase === 'merchant') {
    const MC = '#3fbf82'   // ghost-market green
    // The Fence spends this dive's earned Fathoms (grows as you sink ships), not
    // the banked purse; the tab you've run up is already subtracted.
    const runFathoms = fathomsForDepth(rollStateRef.current.cleared, props.variant ?? 'davy')
    const spendable = Math.max(0, runFathoms - fenceSpent)
    return (
      <>
        <AbyssBackdrop hardcore={hardcoreRun} don={isDonG} />
        <AbyssScrim />
        <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: [0.35, 0.6, 0.35] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: `radial-gradient(ellipse 130% 90% at 50% 0%, ${MC}1c 0%, ${MC}09 44%, transparent 72%)` }} />
        <div style={{
          position: 'relative', zIndex: 1, maxWidth: 440, margin: '0 auto',
          padding: '12px 0.95rem', textAlign: 'center',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
        }}>
          <motion.p initial={{ opacity: 0, letterSpacing: '0.5em' }} animate={{ opacity: 1, letterSpacing: '0.3em' }} transition={{ duration: 0.8 }}
            className="font-karla font-800 uppercase" style={{ fontSize: '0.7rem', color: MC, marginTop: 16, textShadow: `0 0 16px ${MC}55` }}>
            A Black Market
          </motion.p>
          <motion.div initial={{ opacity: 0, y: -18, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: 'relative', width: 96, height: 96, margin: '14px auto 4px' }}>
            <div style={{ position: 'absolute', inset: -16, borderRadius: '50%', background: `radial-gradient(circle, ${MC}33 0%, transparent 66%)`, animation: 'gauntPulse 3.4s ease-in-out infinite' }} />
            <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke={MC} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'relative', filter: `drop-shadow(0 6px 20px ${MC}55)` }} aria-hidden>
              <path d="M3 9l1.5-4.5h15L21 9" /><path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M9 13h6" />
            </svg>
          </motion.div>
          <motion.h1 initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.12, type: 'spring', stiffness: 220, damping: 18 }}
            className="font-cinzel font-800" style={{ fontSize: '1.85rem', color: '#e7f6ee', lineHeight: 1.06, marginTop: 4, textShadow: `0 0 24px ${MC}44` }}>
            The Fence
          </motion.h1>
          <p className="font-karla" style={{ fontSize: '0.9rem', fontStyle: 'italic', color: 'rgba(214,236,226,0.9)', lineHeight: 1.5, marginTop: 8, padding: '0 0.4rem', textShadow: '0 1px 8px rgba(0,0,0,0.7)' }}>
            One of the Don&apos;s people, waiting in the dark with a crate and a grin. His goods are real. So is his price, paid in Fathoms.
          </p>

          {/* Your spendable Fathoms, front and centre — so the price on each
              crate reads against what you can actually pay. */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 13, padding: '0.42rem 0.95rem', borderRadius: 999, background: `${MC}18`, border: `1px solid ${MC}5c`, boxShadow: `0 0 16px ${MC}22` }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MC} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="5" r="2" /><path d="M12 7v13" /><path d="M5 12H3a9 9 0 0 0 18 0h-2" /><path d="M8 10h8" /></svg>
            <span className="font-cinzel font-800" style={{ fontSize: '1.1rem', color: '#eafff5' }}>{fmt(spendable)}</span>
            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.56rem', color: `${MC}dd` }}>Fathoms earned this dive</span>
          </div>

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {merchantStock.map((id, i) => {
              const item = MERCHANT_ITEMS[id]
              const sold = merchantSold.has(id)
              const afford = spendable >= item.price
              const busy = merchantBuying === id
              const blocked = sold || !afford || !!merchantBuying
              return (
                <motion.button key={id} type="button" disabled={blocked} onClick={() => buyMerchant(id)}
                  whileTap={blocked ? undefined : { scale: 0.975 }}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 + i * 0.08 }}
                  className={blocked ? '' : 'tap'}
                  style={{
                    position: 'relative', overflow: 'hidden', width: '100%', textAlign: 'left',
                    padding: '0.85rem 1rem 0.85rem 1.1rem', borderRadius: 16,
                    background: sold ? 'rgba(255,255,255,0.03)' : `linear-gradient(180deg, ${item.color}22 0%, rgba(6,11,16,0.95) 58%)`,
                    border: `1.5px solid ${sold ? 'rgba(255,255,255,0.12)' : `${item.color}${afford ? '9a' : '4a'}`}`,
                    color: '#eaf5f0', cursor: blocked ? 'default' : 'pointer', opacity: sold ? 0.5 : afford ? 1 : 0.8,
                    boxShadow: sold ? 'none' : '0 4px 14px rgba(0,0,0,0.4)',
                  }}>
                  <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: `linear-gradient(180deg, ${item.color}, ${item.color}22)` }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <p className="font-cinzel font-800" style={{ flex: 1, minWidth: 0, fontSize: '1.06rem', color: sold ? '#9aa39d' : '#eafff5' }}>{item.name}</p>
                    {sold ? (
                      <span className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.12em', color: '#8a938d', background: 'rgba(255,255,255,0.08)', borderRadius: 999, padding: '0.22rem 0.6rem' }}>Sold</span>
                    ) : busy ? (
                      <span className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.12em', color: item.color }}>…</span>
                    ) : (
                      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.2rem 0.55rem', borderRadius: 999, background: afford ? 'rgba(240,192,64,0.12)' : 'rgba(224,136,138,0.12)', border: `1px solid ${afford ? 'rgba(240,192,64,0.4)' : 'rgba(224,136,138,0.4)'}` }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={afford ? '#f5d98a' : '#e0888a'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="5" r="2" /><path d="M12 7v13" /><path d="M5 12H3a9 9 0 0 0 18 0h-2" /><path d="M8 10h8" /></svg>
                        <span className="font-cinzel font-800" style={{ fontSize: '1rem', color: afford ? '#f5d98a' : '#e0888a' }}>{item.price}</span>
                        <span className="font-karla font-700 uppercase" style={{ fontSize: '0.48rem', letterSpacing: '0.08em', color: afford ? '#c9b06a' : '#b57779' }}>Fathoms</span>
                      </span>
                    )}
                  </div>
                  {!sold && <p className="font-karla" style={{ fontSize: '0.8rem', color: 'rgba(220,236,228,0.84)', lineHeight: 1.42, marginTop: 6 }}>{item.blurb}</p>}
                  {!sold && !afford && <p className="font-karla font-700" style={{ fontSize: '0.62rem', color: '#e0888a', marginTop: 5 }}>Earn {item.price - spendable} more Fathoms this dive to afford it</p>}
                </motion.button>
              )
            })}
          </div>

          <motion.button whileTap={{ scale: 0.97 }} onClick={merchantLeave} disabled={!!merchantBuying}
            className="font-cinzel font-800 uppercase tracking-[0.06em] tap"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            style={{ width: '100%', marginTop: 18, padding: '1rem', borderRadius: 14, fontSize: '1rem', color: '#e7f6ee', background: `linear-gradient(180deg, ${MC}2e, ${MC}10)`, border: `1px solid ${MC}66`, cursor: 'pointer' }}>
            Leave the Market
          </motion.button>
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.14em', color: '#6f8a7e', marginTop: 14 }}>
            Spent here comes off this dive&apos;s haul, not your bank · Hull {playerHP}/{hpMax}
          </p>
        </div>
        {exitModal}
      </>
    )
  }

  // ── Between rounds: cash out or push on ──────────────────────────────────
  if (phase === 'contract' && contractOffer) {
    const def = CONTRACTS[contractOffer.kind]
    const MC = '#3fbf82'   // Don's court green
    return (
      <>
        <AbyssBackdrop hardcore={hardcoreRun} don={isDonG} />
        <AbyssScrim />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 440, margin: '0 auto', padding: '12px 0.95rem', textAlign: 'center', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)' }}>
          <motion.p initial={{ opacity: 0, letterSpacing: '0.5em' }} animate={{ opacity: 1, letterSpacing: '0.28em' }} transition={{ duration: 0.8 }}
            className="font-karla font-800 uppercase" style={{ fontSize: '0.66rem', color: MC, marginTop: 16, textShadow: `0 0 16px ${MC}55` }}>
            The Don Has a Job
          </motion.p>
          <motion.div initial={{ opacity: 0, y: -14, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: 'relative', width: 92, height: 92, margin: '14px auto 4px' }}>
            <div aria-hidden style={{ position: 'absolute', inset: -14, borderRadius: '50%', background: `radial-gradient(circle, ${MC}3a 0%, transparent 66%)`, animation: 'gauntPulse 3.4s ease-in-out infinite' }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/donsgauntlet.png" alt="" loading="eager" decoding="async"
              style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: `1.5px solid ${MC}aa`, filter: `drop-shadow(0 6px 20px ${MC}55)` }} />
          </motion.div>
          <motion.h1 initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1, type: 'spring', stiffness: 220, damping: 18 }}
            className="font-cinzel font-800" style={{ fontSize: '1.7rem', color: '#e7f6ee', lineHeight: 1.06, marginTop: 4, textShadow: `0 0 24px ${MC}44` }}>
            {def.name}
          </motion.h1>
          <p className="font-karla" style={{ fontSize: '0.92rem', fontStyle: 'italic', color: 'rgba(214,240,228,0.9)', lineHeight: 1.5, marginTop: 8, padding: '0 0.3rem', textShadow: '0 1px 8px rgba(0,0,0,0.7)' }}>
            &ldquo;{def.job}&rdquo;
          </p>
          <p className="font-karla font-600" style={{ fontSize: '0.74rem', color: '#a7b0aa', lineHeight: 1.5, marginTop: 10, padding: '0 0.5rem', textShadow: '0 1px 6px rgba(0,0,0,0.7)' }}>
            It rides your next dive. Clear it, get paid. Blow it, the Don collects. Once you take it, you&apos;re in.
          </p>

          {/* Same job, three ways to run it — the stake is the reward you play
              for against the price of failing. That trade is the whole choice,
              so it's the loud part of each card now. */}
          <p className="font-karla font-800 uppercase tracking-[0.2em]" style={{ fontSize: '0.56rem', color: MC, marginTop: 16, marginBottom: 9, textShadow: '0 1px 6px rgba(0,0,0,0.7)' }}>
            Pick your stakes
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
            {contractOffer.offers.map((offer, i) => (
              <motion.button key={offer.stake} type="button"
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.14 + i * 0.07 }}
                whileTap={{ scale: 0.98 }} onClick={() => takeContract(offer)} className="tap"
                style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 9, padding: '0.85rem 0.95rem 0.9rem 1.15rem', borderRadius: 14, cursor: 'pointer',
                  background: `linear-gradient(180deg, ${MC}20 0%, rgba(6,11,16,0.95) 60%)`, border: `1px solid ${MC}7a`, boxShadow: `0 4px 16px rgba(0,0,0,0.42)` }}>
                <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: `linear-gradient(180deg, ${MC}, ${MC}44)` }} />
                {/* Stake name + this stake's exact target for the shared job. */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span className="font-cinzel font-800 uppercase tracking-[0.05em]" style={{ fontSize: '0.98rem', color: '#eafff5' }}>{STAKE_LABEL[offer.stake]}</span>
                  <span className="font-karla font-700" style={{ flexShrink: 0, fontSize: '0.66rem', color: MC, background: `${MC}1e`, border: `1px solid ${MC}55`, borderRadius: 999, padding: '0.16rem 0.6rem' }}>{def.goal(offer.param)}</span>
                </div>
                {/* Reward vs penalty — the real difference between the three. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="font-karla font-800 uppercase" style={{ flexShrink: 0, width: 52, fontSize: '0.52rem', letterSpacing: '0.08em', color: '#6fce97' }}>Reward</span>
                    <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#aef5c4', lineHeight: 1.25 }}>{describeReward(offer.reward)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="font-karla font-800 uppercase" style={{ flexShrink: 0, width: 52, fontSize: '0.52rem', letterSpacing: '0.08em', color: '#e58a8a' }}>If failed</span>
                    <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#f8a5a5', lineHeight: 1.25 }}>{describePenalty(offer.penalty)}</span>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>

          <button type="button" onClick={walkContract} className="font-karla font-700 tap"
            style={{ width: '100%', marginTop: 12, padding: '0.7rem', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#b0aaa0', cursor: 'pointer', fontSize: '0.82rem' }}>
            Walk away
          </button>
        </div>
      </>
    )
  }

  if (phase === 'contract_result' && contractResult) {
    const def = CONTRACTS[contractResult.offer.kind]
    const won = contractResult.cleared
    const MC = won ? '#3fbf82' : '#f8716b'   // paid green / broken-deal red
    return (
      <>
        <AbyssBackdrop hardcore={hardcoreRun} don={isDonG} />
        <AbyssScrim />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 420, margin: '0 auto', padding: '12px 0.95rem', textAlign: 'center', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)' }}>
          <motion.p initial={{ opacity: 0, letterSpacing: '0.5em' }} animate={{ opacity: 1, letterSpacing: '0.28em' }} transition={{ duration: 0.7 }}
            className="font-karla font-800 uppercase" style={{ fontSize: '0.66rem', color: MC, marginTop: 22, textShadow: `0 0 16px ${MC}55` }}>
            {won ? 'Contract Cleared' : 'Contract Broken'}
          </motion.p>
          <motion.div initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            style={{ position: 'relative', width: 96, height: 96, margin: '16px auto 6px' }}>
            <div aria-hidden style={{ position: 'absolute', inset: -16, borderRadius: '50%', background: `radial-gradient(circle, ${MC}44 0%, transparent 66%)`, animation: 'gauntPulse 3s ease-in-out infinite' }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/donsgauntlet.png" alt="" loading="eager" decoding="async"
              style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: `1.5px solid ${MC}cc`, filter: `drop-shadow(0 6px 22px ${MC}66)`, ...(won ? {} : { filter: `grayscale(0.4) drop-shadow(0 6px 22px ${MC}66)` }) }} />
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#e7f6ee', lineHeight: 1.08, marginTop: 4 }}>
            {def.name}
          </motion.h1>
          <p className="font-karla" style={{ fontSize: '0.9rem', fontStyle: 'italic', color: 'rgba(206,232,220,0.72)', lineHeight: 1.5, marginTop: 10, padding: '0 0.4rem' }}>
            &ldquo;{won ? 'Clean work. Here’s your cut.' : 'You gave me your word. Now you’ll pay it.'}&rdquo;
          </p>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.18, type: 'spring', stiffness: 240, damping: 16 }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 18, padding: '0.6rem 1.1rem', borderRadius: 999,
              background: won ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)', border: `1px solid ${MC}66` }}>
            <span className="font-cinzel font-800 uppercase tracking-[0.06em]" style={{ fontSize: '0.95rem', color: won ? '#7fe0a8' : '#f8a5a5' }}>
              {won ? `▲ ${describeReward(contractResult.offer.reward)}` : `▼ ${describePenalty(contractResult.offer.penalty)}`}
            </span>
          </motion.div>
          <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}
            whileTap={{ scale: 0.97 }} type="button" onClick={() => { vibrate([0, 15]); contractResultContinue() }}
            className="font-cinzel font-800 uppercase tracking-[0.06em] tap"
            style={{ width: '100%', marginTop: 24, padding: '1rem', borderRadius: 14, fontSize: '1rem', color: '#e7f6ee', background: `linear-gradient(180deg, ${MC}2e, ${MC}10)`, border: `1px solid ${MC}66`, cursor: 'pointer' }}>
            Onward
          </motion.button>
        </div>
      </>
    )
  }

  // ── Don Finleone Falls — the landmark victory beat, into the Mark choice ─────
  if (phase === 'don_fallen' && donFallen != null) {
    const fall = donFallCopy(donFallen)
    const isThrone = donRiseIndex(donFallen) === DON_RISE_DEPTHS.length - 1
    const AK = isThrone ? '#f0c040' : KRAKEN   // the throne pays out in gold; the rest in his green
    return (
      <>
        <AbyssBackdrop hardcore={hardcoreRun} don={isDonG} />
        <AbyssScrim />
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: `radial-gradient(ellipse 120% 82% at 50% 56%, ${AK}30 0%, ${AK}10 42%, transparent 72%)` }} />
        <div style={{ position: 'relative', zIndex: 1, minHeight: '62vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '1.6rem 1.1rem', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)' }}>
          {/* His face, sinking + dimmed — he's going down. The throne clear glints gold. */}
          <motion.div initial={{ opacity: 0.95, scale: 1, y: 0, rotate: 0 }} animate={{ opacity: isThrone ? 1 : 0.62, scale: 0.9, y: 26, rotate: isThrone ? 0 : -5 }} transition={{ duration: 1.5, ease: 'easeIn' }}
            style={{ position: 'relative', width: 150, height: 150 }}>
            <div aria-hidden style={{ position: 'absolute', inset: -18, borderRadius: '50%', background: `radial-gradient(circle, ${AK}3a 0%, transparent 66%)` }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/raid8_donfinleone.png" alt="" loading="eager" decoding="async"
              style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%', filter: isThrone ? `drop-shadow(0 10px 30px ${AK}66)` : 'grayscale(0.5) brightness(0.7) drop-shadow(0 10px 30px rgba(0,0,0,0.8))' }} />
          </motion.div>
          <motion.p initial={{ opacity: 0, letterSpacing: '0.5em' }} animate={{ opacity: 1, letterSpacing: '0.34em' }} transition={{ delay: 0.5, duration: 0.7 }}
            className="font-karla font-800 uppercase" style={{ fontSize: '0.62rem', color: AK, marginTop: 20, textShadow: `0 0 18px ${AK}88` }}>{fall.eyebrow}</motion.p>
          <motion.p initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.62, type: 'spring', stiffness: 200, damping: 16 }}
            className="font-cinzel font-800" style={{ fontSize: '2rem', color: '#eafff2', lineHeight: 1.05, marginTop: 8, textShadow: `0 2px 12px rgba(0,0,0,0.7), 0 0 28px ${AK}55` }}>{fall.title}</motion.p>
          <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85, duration: 0.5 }}
            className="font-karla" style={{ maxWidth: 340, fontSize: '0.82rem', fontStyle: 'italic', color: 'rgba(206,232,220,0.82)', lineHeight: 1.5, marginTop: 12 }}>
            &ldquo;{fall.line}&rdquo;
            <span className="font-karla font-700 uppercase tracking-[0.16em]" style={{ display: 'block', fontSize: '0.5rem', color: 'rgba(206,232,220,0.5)', marginTop: 6 }}>Don Finleone</span>
          </motion.p>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.15 }}
            className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.58rem', color: 'rgba(230,244,236,0.6)', marginTop: 20 }}>
            You tear a piece off him
          </motion.p>
          <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3 }}
            whileTap={{ scale: 0.97 }} type="button" onClick={() => { vibrate([0, 18]); donFallenClaim() }}
            className="font-cinzel font-800 uppercase tracking-[0.06em] tap"
            style={{ width: '100%', maxWidth: 360, marginTop: 10, padding: '1rem', borderRadius: 14, fontSize: '1rem', color: '#0c1512', background: `linear-gradient(180deg, ${AK}, ${AK}bb)`, border: `1px solid ${AK}`, cursor: 'pointer', boxShadow: `0 0 22px ${AK}44` }}>
            Take his Mark
          </motion.button>
        </div>
      </>
    )
  }

  // ── The Mark choice — a forge-style cinematic: two Marks torn from the Don,
  //    Shark (offense) vs Whale (defense). Pick one; it sears in and rides the run.
  if (phase === 'mark_choice' && markOffer) {
    return <MarkChoice offer={markOffer} searing={markSearing} taken={markCount} onChoose={chooseMark} />
  }

  if (phase === 'between') {
    const cleared = rollStateRef.current.cleared
    // Display depth is the COMBAT depth (Veteran's Start shifts it up); chest +
    // pot stay on `cleared` so the head start is no reward shortcut.
    const combatDepth = cleared + skipOffset
    const nextDepth = combatDepth + 1
    // Economy cap — previews mirror the server: pot/XP pay as if the run ended
    // at the cap; deeper is for the record + Fathoms.
    const payDepth = Math.min(cleared, GAUNTLET_REWARD_DEPTH_CAP)
    const pastPayCap = cleared >= GAUNTLET_REWARD_DEPTH_CAP
    const chest = chestForDepth(payDepth)
    const previewDoubloons = Math.round(pot * chest.potMult * props.classDoubloonMult)
    // DAVY'S OFFER, if he made one at this breather. `dealDoubloons` is what the bank
    // button must SAY — quoting the un-sweetened pot and then paying more (or worse,
    // less) is the one thing a bargain screen can never do.
    const offerChest    = offerChestMult(offer)
    const dealDoubloons = Math.round(previewDoubloons * offerCoinMult(offer))
    // Nav XP is on its own decoupled curve (not the pot) — mirror the server.
    const previewXp = Math.round(gauntletXpForDepth(payDepth, props.variant) * chest.potMult)
    const hpPct = Math.max(0, Math.min(100, Math.round((playerHP / hpMax) * 100)))
    const hpColor = hpPct < 30 ? '#f87171' : hpPct < 60 ? GOLD : '#4ade80'
    const band = bandForDepth(combatDepth, props.variant)
    const ownedBoons = GAUNTLET_BOONS
      .map(fam => ({ fam, tier: boonTiers[fam.id] ?? 0 }))
      .filter(x => x.tier >= 1)
    const ownedCurses = GAUNTLET_CURSES
      .map(c => ({ c, tier: curseTiers[c.id] ?? 0 }))
      .filter(x => x.tier >= 1)
    const activeConf = activeConfluences(boonTiers, confluencesTaken)
    // Synergies you QUALIFY for but haven't drafted — nudge the player to watch
    // for the gold "forge a synergy" card in an upcoming draft.
    const eligibleConf = eligibleConfluences(boonTiers, confluencesTaken, props.variant)
    // A line of voice for the breather, keyed to the run's state — bleeding hull,
    // a fat haul, a record depth, or just the quiet before the next gun.
    const breathLine =
      pastPayCap          ? "The Locker's purse runs dry this deep. You dive for Fathoms and the record now."
      : hpPct < 30          ? 'Your hull groans. The deep can smell blood in the water.'
      : combatDepth >= 14 ? 'Few ships sail this deep. Fewer ever sail back.'
      : previewDoubloons >= 5000 ? "A captain's ransom rides in your hold now."
      : combatDepth <= 2  ? 'Early yet. The Locker is only just stirring below.'
      :                   'The water stills. The Locker waits on your nerve.'
    // Sounding Line — read what waits at the next depth before committing.
    const sounding = (gauntletHasSoundingLine(activeUpgrades) && peekFight)
      ? peekFight.isBoss
        ? { label: 'A BOSS lies below', sub: peekFight.enemy.name, color: '#f87171' }
        : peekFight.isElite
          ? { label: peekFight.affix ? `An Elite below · ${peekFight.affix.name}` : 'An Elite lies below', sub: peekFight.enemy.name, color: '#c084fc' }
          : { label: 'Open water below · a lone hull', sub: peekFight.enemy.name, color: AC }
      : null
    // Aligned label + wrapping chips — one tidy row per loadout category so the
    // whole loadout reads as a single block instead of three headed sections.
    const LoadoutRow = ({ label, color, children }: { label: string; color: string; children: React.ReactNode }) => (
      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        <span className="font-karla font-800 uppercase tracking-[0.1em]" style={{ flexShrink: 0, width: 54, paddingTop: 4, fontSize: '0.5rem', color }}>{label}</span>
        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 5 }}>{children}</div>
      </div>
    )
    return (
      <>
        <AbyssBackdrop hardcore={hardcoreRun} don={isDonG} />
        <AbyssScrim />
        {/* Synergy Unlocked — a one-shot fanfare overlay the moment a confluence
            comes online (the boon you just claimed completed a pair). */}
        <AnimatePresence>
          {confluenceBanner && (() => {
            const GLD = confluenceBanner.isConvergence ? '#ff8a3d' : '#f5b94a'
            return (
              <motion.div key={confluenceBanner.key} aria-hidden
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ position: 'fixed', inset: 0, zIndex: 70, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 1.2rem' }}>
                {/* Dark scrim — dims the busy abyss so the gold reveal is legible
                    (fades with the parent's opacity). */}
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 44%, rgba(4,8,15,0.72) 0%, rgba(3,6,12,0.93) 100%)' }} />
                {/* radial gold burst */}
                <motion.div initial={{ scale: 0.3, opacity: 0.7 }} animate={{ scale: 2.8, opacity: 0 }} transition={{ duration: 0.9, ease: 'easeOut' }}
                  style={{ position: 'absolute', width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle, ${GLD}88 0%, ${GLD}22 40%, transparent 70%)` }} />
                <motion.div initial={{ scale: 0.4, opacity: 0.8 }} animate={{ scale: 2.1, opacity: 0 }} transition={{ duration: 0.8, delay: 0.1, ease: 'easeOut' }}
                  style={{ position: 'absolute', width: 180, height: 180, borderRadius: '50%', border: `2px solid ${GLD}`, boxShadow: `0 0 28px ${GLD}` }} />
                {/* Reveal card — a dark backing plate keeps the text readable on
                    top of the burst + backdrop. */}
                <motion.div initial={{ scale: 0.6, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ delay: 0.12, type: 'spring', stiffness: 220, damping: 16 }}
                  style={{ position: 'relative', padding: '1.3rem 1.5rem 1.4rem', borderRadius: 18, background: 'rgba(7,12,19,0.82)', border: `1px solid ${GLD}55`, boxShadow: `0 0 44px ${GLD}22, 0 12px 40px rgba(0,0,0,0.6)`, backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}>
                  {confluenceBanner.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={confluenceBanner.image} alt="" decoding="async" style={{ display: 'block', width: 100, height: 100, objectFit: 'contain', margin: '0 auto', filter: `drop-shadow(0 3px 9px rgba(0,0,0,0.6)) drop-shadow(0 0 18px ${GLD}99)` }} />
                  ) : (
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={GLD} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 14px ${GLD}aa)` }}><path d="M12 2 4 7v10l8 5 8-5V7z" /><path d="M12 22V12" /><path d="m4 7 8 5 8-5" /></svg>
                  )}
                  <p className="font-karla font-800 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.32em', color: GLD, marginTop: 10, textShadow: `0 0 16px ${GLD}88` }}>{confluenceBanner.isConvergence ? 'Convergence Forged' : confluenceBanner.discovered ? 'New Synergy Discovered' : confluenceBanner.isNew ? 'Synergy Unlocked' : `Synergy Deepened · ${['', 'I', 'II', 'III'][confluenceBanner.level] ?? ''}`}</p>
                  <p className="font-cinzel font-800" style={{ fontSize: '2.1rem', lineHeight: 1.05, color: '#fff3d6', marginTop: 6, textShadow: `0 2px 10px rgba(0,0,0,0.7), 0 0 30px ${GLD}66` }}>{confluenceBanner.name}</p>
                  <p className="font-karla" style={{ fontSize: '0.86rem', color: '#e7d5aa', marginTop: 8, lineHeight: 1.4, maxWidth: 300, marginInline: 'auto', textShadow: '0 1px 6px rgba(0,0,0,0.75)' }}>{confluenceBanner.desc}</p>
                </motion.div>
              </motion.div>
            )
          })()}
        </AnimatePresence>
        {/* Curse Shed — confirms a Shake the Curse reprieve actually took one. */}
        <AnimatePresence>
          {curseShed && (
            <motion.div key={curseShed.key} aria-hidden
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, zIndex: 70, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 1.2rem' }}>
              <motion.div initial={{ scale: 0.3, opacity: 0.7 }} animate={{ scale: 2.6, opacity: 0 }} transition={{ duration: 0.9, ease: 'easeOut' }}
                style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', background: `radial-gradient(circle, ${AC}77 0%, ${AC}1c 42%, transparent 70%)` }} />
              <motion.div initial={{ scale: 0.6, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ delay: 0.1, type: 'spring', stiffness: 220, damping: 16 }}
                style={{ position: 'relative' }}>
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={AC} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 14px ${AC}aa)` }}><path d="M20 6 9 17l-5-5" /></svg>
                <p className="font-karla font-800 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.3em', color: AC, marginTop: 10, textShadow: `0 0 16px ${AC}88` }}>Curse Shed</p>
                <p className="font-cinzel font-800" style={{ fontSize: '1.9rem', lineHeight: 1.05, color: '#eafffb', marginTop: 6, textShadow: `0 0 30px ${AC}66` }}>{curseShed.name}</p>
                <p className="font-karla" style={{ fontSize: '0.84rem', color: '#9cc7bf', marginTop: 8, fontStyle: 'italic' }}>The deep takes it back.</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <div style={{
          position: 'relative', zIndex: 1, maxWidth: 440, margin: '0 auto',
          padding: '10px 0.95rem', textAlign: 'center',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
        }}>
          {/* Depth + a line of voice. The "Catch Your Breath" eyebrow is gone: the
              screen IS the breather, and a label announcing that spent the most
              valuable line on the page saying nothing. */}
          <p className="font-cinzel font-700" style={{ fontSize: '1.22rem', color: '#f4eee2', marginTop: 14, lineHeight: 1.1, textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>
            Depth {combatDepth} · {band.name}
          </p>
          <p className="font-karla" style={{ fontSize: '0.86rem', fontStyle: 'italic', color: 'rgba(184,222,213,0.92)', lineHeight: 1.4, marginTop: 7, maxWidth: 340, marginInline: 'auto', textShadow: '0 1px 8px rgba(0,0,0,0.75)' }}>
            &ldquo;{breathLine}&rdquo;
          </p>

          {/* ── THE HAUL ─────────────────────────────────────────────────────────
              Everything banking pays you, in ONE card. The chest odds used to sit in
              a separate panel below, which was the same question ("what do I get if I
              stop here?") asked twice in two places.

              The values are a right-aligned ledger now. They were a run-on line of
              bullet separators (+1,240 Nav XP · +3 ◆ · Locker ×2), which reads as a
              sentence and scans as nothing. */}
          {(() => {
            const odds = chestOdds({
              depth: rollStateRef.current.cleared,
              hardcore: hardcoreRun,
              pressure,
              ownedItems: props.ownedRaidItems,
              ownedSkins: props.ownedShipSkins,
              davyForge: DAVY_FORGE,
              variant: props.variant,
              // A chest offer multiplies these on the spot, so the rows the player is
              // staring at visibly jump the moment Davy leans over the rail.
              oddsMult: offerChest,
              // Crew Fortune, the same 1x to 2x the server folds into every
              // chase roll at cash-out. Shown here or the panel would be
              // quoting odds the payout does not use.
              fortuneMult: fortuneLootMult(props.totalFortune),
            })
            const sweetened = offerChest > 1
            // These odds are already Fortune-boosted (passed in above), but the
            // label only ever credited Davy, so a captain saw bigger numbers and
            // had no way to know their crew earned them.
            const ftnMult = fortuneLootMult(props.totalFortune)
            // Fathoms this dive would bank (the Fence tab already spent comes off
            // it, mirroring the cash-out settle).
            const previewFathoms = Math.max(0, Math.round(fathomsForDepth(cleared, props.variant ?? 'davy') * gauntletFathomsMult(activeUpgrades)) - fenceSpent)
            // One compact cell per currency — the old hero was a 2.5rem number and
            // a stacked ledger that ate half the screen to say three things.
            const Cell = ({ label, value, color }: { label: string; value: string; color: string }) => (
              <div style={{ flex: 1, minWidth: 0, padding: '0.5rem 0.3rem', borderRadius: 11, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
                <p className="font-cinzel font-800" style={{ fontSize: 'clamp(0.9rem, 4.2vw, 1.1rem)', color, lineHeight: 1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
                <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.46rem', color: '#8f8a80', marginTop: 4 }}>{label}</p>
              </div>
            )
            return (
              <div style={{ marginTop: 13, padding: '0.75rem 0.7rem', borderRadius: 16,
                background: `radial-gradient(ellipse at 50% 0%, ${GOLD}1c 0%, rgba(8,13,22,0.6) 76%)`,
                border: `1px solid ${GOLD}3a` }}>
                <p className="font-karla font-800 uppercase tracking-[0.2em]" style={{ fontSize: '0.5rem', color: `${GOLD}cc`, marginBottom: 7 }}>Bank now and you take</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Cell label="Doubloons" value={fmt(dealDoubloons)} color={GOLD} />
                  <Cell label="Nav XP" value={`+${fmt(previewXp)}`} color="#7dd3fc" />
                  <Cell label="Fathoms" value={`+${fmt(previewFathoms)}`} color={AC} />
                  {chest.gems > 0 && <Cell label="Gems" value={`+${chest.gems}`} color="#c9a7ff" />}
                </div>

                {/* The chase — icons + odds in one scrollable row, so what you're
                    fishing for reads visually instead of as a text ledger. */}
                {odds.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${GOLD}22` }}>
                    <p className="font-karla font-800 uppercase tracking-[0.16em]" style={{ fontSize: '0.46rem', color: sweetened ? '#c9a7ff' : '#8f8a80', marginBottom: 6, textAlign: 'left' }}>
                      In the Chest{sweetened ? ` · Davy's ${offerChest}x` : ''}{ftnMult > 1 ? ` · Fortune ${ftnMult.toFixed(2)}x` : ''}
                    </p>
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
                      {odds.map(o => {
                        const img = o.kind === 'skin'
                          ? getShipSkin(o.id)?.imageByTier?.[6]
                          : getRaidItem(o.id)?.image
                        return (
                          <div key={o.id} title={o.lockedUntilDepth ? `${o.name} — opens at depth ${o.lockedUntilDepth}` : o.name} style={{
                            flexShrink: 0, width: 62, padding: '0.4rem 0.2rem 0.35rem', borderRadius: 10,
                            background: 'rgba(255,255,255,0.04)',
                            border: `1px solid ${o.lockedUntilDepth ? 'rgba(255,255,255,0.08)' : sweetened ? 'rgba(201,167,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                            textAlign: 'center', opacity: o.lockedUntilDepth ? 0.5 : 1,
                          }}>
                            <div style={{ height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {img
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={img} alt="" loading="lazy" decoding="async" style={{ maxWidth: 28, maxHeight: 30, objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.55))' }} />
                                : <span style={{ fontSize: '1rem', color: GOLD }}>◆</span>}
                            </div>
                            {/* The BOOSTED chance is the headline, because it is
                                the player's actual chance. The pre-Fortune number
                                sits under it struck through, which says "was"
                                without making anyone add two percentages
                                together or work out whether a "+5%" meant points
                                or a proportion. */}
                            <p className="font-cinzel font-800" style={{
                              fontSize: o.lockedUntilDepth ? '0.6rem' : '0.72rem', lineHeight: 1, marginTop: 3,
                              color: o.lockedUntilDepth ? '#8f8a80' : o.chance > o.chanceBeforeFortune ? GOLD : sweetened ? '#c9a7ff' : '#e8e1d2',
                            }}>
                              {o.lockedUntilDepth ? `Depth ${o.lockedUntilDepth}` : `${(o.chance * 100).toFixed(o.chance < 0.1 ? 1 : 0)}%`}
                            </p>
                            {!o.lockedUntilDepth && o.chance > o.chanceBeforeFortune && (
                              <p className="font-karla font-600" style={{ fontSize: '0.5rem', color: '#8f8a80', lineHeight: 1, marginTop: 1, textDecoration: 'line-through', opacity: 0.75 }}>
                                {(o.chanceBeforeFortune * 100).toFixed(o.chanceBeforeFortune < 0.1 ? 1 : 0)}%
                              </p>
                            )}
                            <p className="font-karla font-600 truncate" style={{ fontSize: '0.44rem', color: '#8f8a80', lineHeight: 1.2, marginTop: 2 }}>{o.name}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Hull — the other half of the gamble, right under the reward. */}
          <div style={{ marginTop: 13, textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
              <span className="font-karla font-800 uppercase tracking-[0.16em]" style={{ fontSize: '0.58rem', color: '#9a988e' }}>Hull</span>
              <span className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: hpColor }}>{playerHP} / {hpMax}</span>
            </div>
            <div style={{ height: 11, borderRadius: 6, background: 'rgba(0,0,0,0.5)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
              <motion.div initial={{ width: `${hpPct}%` }} animate={{ width: `${hpPct}%` }} transition={{ duration: 0.4 }}
                style={{ height: '100%', background: `linear-gradient(90deg, ${hpColor}aa, ${hpColor})`, boxShadow: `0 0 10px ${hpColor}88` }} />
            </div>
          </div>

          {/* ── LOADOUT, FOLDED AWAY ─────────────────────────────────────────────
              Powers, synergies and curses are reference material you consult, not news
              you need at every depth. Open by default they ran to a dozen chips and
              pushed the bank-or-dive decision below the fold, which is the one thing
              this screen exists to ask. Collapsed, the header still carries the counts
              and the "synergy within reach" nudge, so nothing urgent is hidden. */}
          {(ownedBoons.length > 0 || activeConf.length > 0 || ownedCurses.length > 0) && (
            <div style={{ marginTop: 13, borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', textAlign: 'left', overflow: 'hidden' }}>
              <button onClick={() => setLoadoutOpen(o => !o)} className="tap"
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '0.7rem 0.9rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span className="font-karla font-800 uppercase tracking-[0.16em]" style={{ flexShrink: 0, fontSize: '0.55rem', color: '#9a988e' }}>Loadout</span>
                <span className="font-karla font-600 truncate" style={{ flex: 1, minWidth: 0, fontSize: '0.62rem', color: eligibleConf.length > 0 ? '#c6b0ff' : '#7a756c' }}>
                  {eligibleConf.length > 0
                    ? `${eligibleConf.length} synerg${eligibleConf.length === 1 ? 'y' : 'ies'} within reach`
                    : [
                        ownedBoons.length > 0 ? `${ownedBoons.length} power${ownedBoons.length === 1 ? '' : 's'}` : null,
                        activeConf.length > 0 ? `${activeConf.length} synerg${activeConf.length === 1 ? 'y' : 'ies'}` : null,
                        ownedCurses.length > 0 ? `${ownedCurses.length} curse${ownedCurses.length === 1 ? '' : 's'}` : null,
                      ].filter(Boolean).join(', ')}
                </span>
                <motion.span aria-hidden animate={{ rotate: loadoutOpen ? 180 : 0 }} transition={{ duration: 0.2 }} style={{ flexShrink: 0, display: 'flex', color: '#8a8578' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </motion.span>
              </button>

              <AnimatePresence initial={false}>
                {loadoutOpen && (
                  <motion.div key="loadout" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }} style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '0 0.9rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 9 }}>
                      {ownedBoons.length > 0 && (
                        <LoadoutRow label="Powers" color={AC}>
                          {ownedBoons.map(({ fam, tier }) => {
                            const t = fam.tiers[tier - 1]
                            const rc = BOON_RARITY_META[boonRarity(fam)].color
                            return (
                              <button key={fam.id} className="font-karla font-700 tap"
                                onClick={() => setDetailEffect({ kind: 'boon', name: `${fam.name} ${boonTierLabel(tier)}`, desc: t.desc, detail: t.detail, flavor: fam.flavor, count: tier, maxTier: fam.tiers.length, image: fam.image,
                                  rungs: fam.tiers.map((tt, i) => ({ label: boonTierLabel(i + 1), desc: tt.desc, held: i + 1 <= tier, current: i + 1 === tier })) })}
                                style={{ cursor: 'pointer', fontSize: '0.64rem', padding: '0.24rem 0.6rem', borderRadius: 999, background: `${rc}20`, border: `1px solid ${rc}66`, color: rc }}>
                                {fam.name} {boonTierLabel(tier)}
                              </button>
                            )
                          })}
                        </LoadoutRow>
                      )}
                      {activeConf.length > 0 && (
                        <LoadoutRow label="Synergies" color={GOLD}>
                          {activeConf.map(c => {
                            const lvl = confluenceLevel(c, boonTiers)
                            const lvlLabel = ['', 'I', 'II', 'III'][lvl] ?? ''
                            const fresh = confluenceUnlocked?.id === c.id
                            const reqNames = c.requires.map(r => GAUNTLET_BOONS.find(b => b.id === r.boonId)?.name ?? r.boonId)
                            return (
                              <button key={c.id} className="font-karla font-700 tap"
                                onClick={() => setDetailEffect({ kind: 'confluence', name: lvlLabel ? `${c.name} ${lvlLabel}` : c.name, desc: confluenceDescAt(c, lvl), detail: `${c.detail} Its level is the lower of your ${reqNames.join(' and ')} tiers, so deepen whichever is behind to level it up.`, flavor: c.flavor, count: 0, image: c.image,
                                  rungs: c.levels.map((lv, i) => ({ label: boonTierLabel(i + 1), desc: lv.desc, held: i + 1 <= lvl, current: i + 1 === lvl })) })}
                                style={{ cursor: 'pointer', fontSize: '0.64rem', padding: '0.24rem 0.6rem', borderRadius: 999, background: fresh ? `${GOLD}30` : `${GOLD}18`, border: `1px solid ${GOLD}${fresh ? 'aa' : '66'}`, color: '#fbe7c4', boxShadow: fresh ? `0 0 12px ${GOLD}66` : 'none' }}>
                                {c.name} {lvlLabel}{fresh ? ' · NEW' : ''}
                              </button>
                            )
                          })}
                        </LoadoutRow>
                      )}
                      {ownedCurses.length > 0 && (
                        <LoadoutRow label="Curses" color="#f87171">
                          {ownedCurses.map(({ c, tier }) => {
                            const t = c.tiers[tier - 1]
                            const label = curseTierLabel(tier)
                            return (
                              <button key={c.id} className="font-karla font-700 tap"
                                onClick={() => setDetailEffect({ kind: 'curse', name: label ? `${c.name} ${label}` : c.name, desc: t.desc, detail: t.detail, flavor: c.flavor, count: tier, maxTier: c.tiers.length, image: c.image,
                                  rungs: c.tiers.map((tt, i) => ({ label: boonTierLabel(i + 1), desc: tt.desc, held: i + 1 <= tier, current: i + 1 === tier })) })}
                                style={{ cursor: 'pointer', fontSize: '0.64rem', padding: '0.24rem 0.6rem', borderRadius: 999, background: 'rgba(248,113,113,0.14)', border: '1px solid rgba(248,113,113,0.42)', color: '#fca5a5' }}>
                                {c.name}{label ? ` ${label}` : ''}
                              </button>
                            )
                          })}
                        </LoadoutRow>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 1, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <span className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#7a756c' }}>Tap any to read</span>
                        <button onClick={() => setSynergiesOpen(true)} className="font-karla font-800 uppercase tracking-[0.1em] tap"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.54rem', color: '#c9bfa8', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 7v10l8 5 8-5V7z" /><path d="M12 22V12" /><path d="m4 7 8 5 8-5" /></svg>
                          Codex
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* DAVY'S TERMS — what they are paying you AT THIS DEPTH. The bonus
              ramps in, so a board worth x3.25 deep can be paying almost nothing
              here. That gap is the whole dive-or-bank argument, so it belongs on
              the screen where the player makes that call. */}
          {hardcoreRun && pressure > 0 && (() => {
            const payDepthNow = Math.min(cleared, GAUNTLET_REWARD_DEPTH_CAP)
            const multNow  = pressureGemMult(pressure, payDepthNow)
            const multFull = pressureGemMult(pressure, PRESSURE_DEPTH_FULL)
            const atFull   = multNow >= multFull - 0.001
            const signedList = GAUNTLET_TERMS.filter(t => (signedTerms[t.id] ?? 0) >= 1)
            return (
              <div style={{ marginTop: 12, padding: '0.9rem 0.95rem', borderRadius: 16, textAlign: 'left',
                background: `radial-gradient(ellipse at 50% 0%, ${GOLD}16 0%, rgba(8,13,22,0.6) 76%)`,
                border: `1px solid ${GOLD}3a` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <p className="font-karla font-800 uppercase tracking-[0.2em]" style={{ fontSize: '0.56rem', color: `${GOLD}cc` }}>
                    {termsTitle(isDonG ? 'don' : 'davy')}
                  </p>
                  <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#c48a8a' }}>
                    {pressure} Pressure
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <p className="font-cinzel font-800" style={{ fontSize: '1.75rem', color: atFull ? GOLD : '#e8dfc8', lineHeight: 1, textShadow: atFull ? `0 0 16px ${GOLD}66` : 'none' }}>
                      ×{multNow.toFixed(2)}
                    </p>
                    <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.5rem', color: '#8a8578', marginTop: 4 }}>
                      Blood Gems if you bank now
                    </p>
                  </div>
                  {!atFull && (
                    <p className="font-karla font-600" style={{ flex: 1, textAlign: 'right', fontSize: '0.7rem', color: `${GOLD}cc`, lineHeight: 1.35 }}>
                      Reaches <strong style={{ color: GOLD }}>×{multFull.toFixed(2)}</strong> at depth {PRESSURE_DEPTH_FULL}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 9 }}>
                  {signedList.map(t => {
                    const tier = Math.min(signedTerms[t.id], t.tiers.length)
                    const accent = TERM_GROUP_META[t.group].accent
                    return (
                      <span key={t.id} className="font-karla font-700"
                        style={{ fontSize: '0.58rem', color: accent, background: `${accent}16`, border: `1px solid ${accent}55`, borderRadius: 999, padding: '0.16rem 0.45rem' }}>
                        {t.name}{t.tiers.length > 1 ? ` ${['', 'I', 'II', 'III'][tier]}` : ''}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* ── THE FORK ─────────────────────────────────────────────────────────
              Bank or dive, SIDE BY SIDE, because it is one either/or and stacking it
              vertically made the second option read as an afterthought under the
              first. Gold rises, teal descends, and each button carries an arrow that
              says which way it takes you. */}
          <div style={{ marginTop: 18 }}>
            {/* DAVY'S OFFER — while one stands, banking means taking it. */}
            {offer && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                style={{ marginBottom: 10, padding: '0.75rem 0.85rem', borderRadius: 13, textAlign: 'left',
                  background: 'linear-gradient(180deg, rgba(78,44,124,0.34), rgba(38,20,64,0.18))',
                  border: '1px solid rgba(201,167,255,0.5)', boxShadow: '0 0 26px rgba(140,90,220,0.16)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c9a7ff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M12 3v18" /><path d="M5 7h9a3 3 0 0 1 0 6H5" /><path d="M19 17H8" />
                  </svg>
                  <p className="font-karla font-800 uppercase tracking-[0.16em]" style={{ fontSize: '0.52rem', color: '#c9a7ff' }}>
                    {offerCopy(offer).badge}
                  </p>
                </div>
                <p className="font-cinzel font-800" style={{ fontSize: '1.05rem', color: '#f0e6ff', marginTop: 5, lineHeight: 1.15 }}>
                  {offerCopy(offer).title}
                </p>
                <p className="font-karla font-600" style={{ fontSize: '0.76rem', color: '#cfc0e6', marginTop: 4, lineHeight: 1.4 }}>
                  {offerCopy(offer).line} Dive on and it sinks with the light.
                </p>
              </motion.div>
            )}

            {/* Sounding Line — intel that informs the dive, so it sits above the fork. */}
            {sounding && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
                style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9, padding: '0.55rem 0.85rem', borderRadius: 11, background: `${sounding.color}12`, border: `1px solid ${sounding.color}44` }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={sounding.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 2v20" /><path d="M5 9l7-7 7 7" /><path d="M8 16h8" /></svg>
                <div style={{ textAlign: 'left', minWidth: 0 }}>
                  <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.44rem', color: `${sounding.color}cc` }}>Sounding Line · what lies below</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: sounding.color, lineHeight: 1.15 }}>
                    {sounding.label}{sounding.sub ? <span style={{ color: 'rgba(255,255,255,0.58)' }}> · {sounding.sub}</span> : ''}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Hardcore — the stakes, in the lane where they matter. */}
            {hardcoreRun && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9, padding: '0.55rem 0.8rem', borderRadius: 11, textAlign: 'left',
                background: 'linear-gradient(180deg, rgba(140,10,20,0.28), rgba(88,4,10,0.14))', border: '1px solid rgba(220,38,38,0.45)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, filter: 'drop-shadow(0 0 5px rgba(220,38,38,0.5))' }}><path d="M12 3a7 7 0 0 0-7 7v3.4c0 .9.6 1.7 1.5 2l.5.2V19a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3.4l.5-.2c.9-.3 1.5-1.1 1.5-2V10a7 7 0 0 0-7-7Z" /><circle cx="9" cy="11" r="1.4" fill="#fca5a5" stroke="none" /><circle cx="15" cy="11" r="1.4" fill="#fca5a5" stroke="none" /><path d="M11 15.5h2" /></svg>
                <p className="font-karla" style={{ fontSize: '0.7rem', color: '#f0c9c9', lineHeight: 1.35 }}>
                  <span className="font-800 uppercase tracking-[0.06em]" style={{ color: '#fca5a5' }}>Hardcore.</span> Sink and your whole crew drowns for good.
                </p>
              </div>
            )}

            {(() => {
              const bankBarred = termFx.cashOutOnlyAfterBoss && !rollStateRef.current.prevWasBoss
              const diveBtn = (
                // Dive Deeper is the BECKONING option: it breathes, its chevron
                // bobs downward, and it carries the accent glow — so the risky
                // path pulls at you while Claim & Leave sits calm and solid.
                <motion.button onClick={pushOn} disabled={resolving} className="tap"
                  animate={resolving ? {} : { boxShadow: [`0 0 10px ${AC}22`, `0 0 26px ${AC}55`, `0 0 10px ${AC}22`] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ width: '100%', height: '100%', minHeight: 96, padding: '0.8rem 0.6rem', borderRadius: 14,
                    background: `linear-gradient(180deg, ${AC}3d 0%, rgba(6,10,16,0.9) 74%)`, border: `1.5px solid ${AC}c4`,
                    cursor: resolving ? 'wait' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                  <motion.span aria-hidden animate={resolving ? {} : { y: [0, 3, 0] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }} style={{ display: 'flex' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={AC} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 5v14" /><path d="M19 12l-7 7-7-7" /></svg>
                  </motion.span>
                  <span className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ fontSize: '1.02rem', color: '#d7fbf4', lineHeight: 1.1, textShadow: `0 0 12px ${AC}66` }}>Dive Deeper</span>
                  <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#bfe4dc' }}>To depth {nextDepth}</span>
                  {previewDoubloons > 0 && (
                    <span className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#d3a595', lineHeight: 1.25 }}>
                      {fmt(previewDoubloons)} ⟡ at risk
                    </span>
                  )}
                </motion.button>
              )
              if (bankBarred) return (
                <>
                  <div style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: 14, textAlign: 'center', marginBottom: 10, background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.2)' }}>
                    <p className="font-cinzel font-800 uppercase tracking-[0.05em]" style={{ fontSize: '0.85rem', color: '#8a8578' }}>You Cannot Leave</p>
                    <p className="font-karla" style={{ fontSize: '0.72rem', color: '#6f6a62', marginTop: 4, lineHeight: 1.4 }}>
                      You signed <strong style={{ color: '#a89898' }}>No Second Thoughts</strong>. Davy only lets you bank once you have put a boss down.
                    </p>
                  </div>
                  {diveBtn}
                </>
              )
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'stretch' }}>
                  {/* SURFACE. Gold, and it points UP. */}
                  <button onClick={() => setConfirmClaim(true)} disabled={resolving} className="tap"
                    style={{ width: '100%', minHeight: 96, padding: '0.8rem 0.6rem', borderRadius: 14,
                      background: offer ? 'linear-gradient(180deg, rgba(201,167,255,0.36) 0%, rgba(10,8,18,0.9) 74%)' : `linear-gradient(180deg, ${GOLD}38 0%, rgba(14,11,6,0.9) 74%)`,
                      border: offer ? '1px solid rgba(201,167,255,0.9)' : `1px solid ${GOLD}a6`,
                      cursor: resolving ? 'wait' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                      boxShadow: offer ? '0 0 22px rgba(140,90,220,0.28)' : `0 0 20px ${GOLD}22` }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={offer ? '#c9a7ff' : GOLD} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
                    <span className="font-cinzel font-800 uppercase tracking-[0.04em]" style={{ fontSize: '1.02rem', color: offer ? '#f2eaff' : '#f7dc8f', lineHeight: 1.1, textShadow: offer ? '0 0 12px rgba(201,167,255,0.5)' : `0 0 12px ${GOLD}55` }}>
                      {resolving ? '…' : offer ? 'Take the Deal' : 'Claim & Leave'}
                    </span>
                    <span className="font-karla font-700" style={{ fontSize: '0.74rem', color: offer ? '#d8c2ff' : '#ffd98a' }}>{fmt(dealDoubloons)} ⟡</span>
                    <span className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#c2bcaa', lineHeight: 1.25 }}>Surface with it</span>
                  </button>
                  {diveBtn}
                </div>
              )
            })()}
          </div>

          {/* Pause & step away — save the run and take a break. Unlimited, and it
              never risks the crew: the dive is held server-side and picks up right
              here. Deliberately quiet so it never competes with the dive/bank fork. */}
          <button onClick={doPause} disabled={pausing || resolving} className="font-karla font-700 tap"
            style={{ marginTop: 12, width: '100%', padding: '0.7rem', borderRadius: 11, fontSize: '0.78rem',
              color: '#c8c2b6', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(200,194,182,0.4)',
              cursor: (pausing || resolving) ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M8 5v14M16 5v14" /></svg>
            {pausing ? 'Saving…' : 'Pause & step away'}
          </button>
        </div>

        {detailModal}
        {exitModal}
        {synergiesOpen && <SynergiesModal owned={boonTiers} seen={seenConfluences} taken={confluencesTaken} takenConv={convergencesTaken} variant={props.variant ?? 'davy'} onClose={() => setSynergiesOpen(false)} />}
        {/* Claim & Leave confirm — a light guard so you never bank + end the run
            on a misfire. Shows exactly what walks away with you. */}
        {confirmClaim && (
          <div onClick={() => setConfirmClaim(false)} style={{ position: 'fixed', inset: 0, zIndex: 1310, background: 'rgba(6,8,14,0.86)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem', overflowY: 'auto' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 360, borderRadius: 20, padding: '1.35rem 1.15rem 1.15rem', textAlign: 'center', background: 'linear-gradient(180deg, rgba(24,20,10,0.99), rgba(12,10,6,0.99))', border: `1px solid ${GOLD}66`, boxShadow: `0 0 44px ${GOLD}22, 0 18px 50px rgba(0,0,0,0.6)` }}>
              <p className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.24em', color: offer ? '#c9a7ff' : `${GOLD}cc` }}>{offer ? "Davy's Offer" : 'Bank the Haul'}</p>
              <p className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#f6ead0', lineHeight: 1.08, marginTop: 8 }}>{offer ? 'Shake on it?' : 'Claim & leave?'}</p>
              <p className="font-cinzel font-800" style={{ fontSize: '2rem', color: GOLD, lineHeight: 1, marginTop: 12, textShadow: `0 0 26px ${GOLD}55` }}>
                {fmt(dealDoubloons)} <span style={{ fontSize: '1.2rem' }}>⟡</span>
              </p>
              <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#b0a890', marginTop: 6 }}>
                +{fmt(previewXp)} Nav XP{chest.gems > 0 ? ` · +${chest.gems} ◆` : ''}{hardcoreRun ? ' · Blood Gems' : ''}
              </p>
              <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(230,222,205,0.8)', lineHeight: 1.5, marginTop: 12, maxWidth: 300, marginInline: 'auto' }}>
                {offer
                  ? `${offerCopy(offer).line} Your descent ends here, and what he owes you is yours to keep.`
                  : 'Your descent ends here and this is yours to keep. Push deeper and it grows, but sink and it all goes down with you.'}
              </p>
              <button onClick={() => { setConfirmClaim(false); cashOut(!!offer) }} disabled={resolving} className="font-cinzel font-800 uppercase tracking-[0.05em] tap"
                style={{ width: '100%', marginTop: 16, padding: '1rem', borderRadius: 13, fontSize: '1rem', color: '#1a1206', background: `linear-gradient(180deg, ${GOLD}, ${GOLD}cc)`, border: `1px solid ${GOLD}`, cursor: resolving ? 'wait' : 'pointer', boxShadow: `0 0 22px ${GOLD}33` }}>
                {resolving ? '…' : offer ? <>Shake on It · {fmt(dealDoubloons)} ⟡</> : <>Claim {fmt(previewDoubloons)} ⟡ &amp; Leave</>}
              </button>
              <button onClick={() => setConfirmClaim(false)} className="font-karla font-600 tap" style={{ marginTop: 11, background: 'none', border: 'none', color: '#9a948a', fontSize: '0.76rem', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                {offer ? 'No deal' : 'Keep diving'}
              </button>
            </div>
          </div>
        )}
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
        <AbyssBackdrop hardcore={hardcoreRun} don={isDonG} />
        <AbyssScrim />
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

          {/* Curse art, sinking in from above like it's surfacing for you.
              Its own painted icon (matching the boon set) when we have one;
              the drowned skull sigil is the fallback. */}
          <motion.div initial={{ opacity: 0, y: -32, scale: 0.7 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: 'relative', width: 150, height: 150, margin: '18px auto 8px' }}>
            <div style={{ position: 'absolute', inset: -24, borderRadius: '50%', background: `radial-gradient(circle, ${CRIM}3c 0%, transparent 64%)`, animation: 'gauntPulse 3s ease-in-out infinite' }} />
            {c.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.image} alt="" loading="lazy" decoding="async"
                style={{ position: 'relative', width: 150, height: 150, objectFit: 'contain', filter: `drop-shadow(0 8px 24px ${CRIM}66) drop-shadow(0 0 10px ${CRIM}55)` }} />
            ) : (
              <svg width="150" height="150" viewBox="0 0 24 24" fill={CRIM} style={{ position: 'relative', filter: `drop-shadow(0 8px 28px ${CRIM}66)` }} aria-hidden>
                <path d="M12 2a8 8 0 0 0-8 8c0 2.5 1.2 4.2 2.8 5.4.4.3.7.8.7 1.3V18a1.6 1.6 0 0 0 1.6 1.6h.4l.5-1.6h-1l-.4-1.4h1.6L11 18l.5 1.6h1L13 18l.4-1.4H15l-.4 1.4h-1l.5 1.6h.4A1.6 1.6 0 0 0 16.1 18v-1.3c0-.5.3-1 .7-1.3C18.4 14.2 20 12.5 20 10a8 8 0 0 0-8-8Z" />
                <circle cx="9" cy="10.5" r="1.7" fill="#0a0e16" />
                <circle cx="15" cy="10.5" r="1.7" fill="#0a0e16" />
              </svg>
            )}
          </motion.div>

          <motion.h1 initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 220, damping: 18 }}
            className="font-cinzel font-800" style={{ fontSize: '2.2rem', color: '#fdecec', lineHeight: 1.06, marginTop: 8, textShadow: `0 0 30px ${CRIM}55` }}>
            {c.name}{c.isUpgrade ? ` ${curseTierLabel(c.tier)}` : ''}
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
              color: '#ffe0e0', background: `linear-gradient(180deg, ${CRIM}3a 0%, rgba(22,6,8,0.86) 70%)`,
              border: `1px solid ${CRIM}88`, cursor: 'pointer',
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
    const SYN = '#b98bff'    // violet — the "synergy" lane, distinct from rarity + reprieve
    // When a confluence is offered it takes one boon slot, so only 2 boon cards
    // render. Gate the reveal-dependent extras (confluence card, reprieve, reroll)
    // on just the SHOWN boons — else the hidden 3rd card never flips.
    const shownBoons = boonCardCount
    const revealDone = pendingBoons.slice(0, shownBoons).every((_, i) => (boonPhases[i] ?? 'sealed') === 'flipped')
    return (
      <>
        <AbyssBackdrop hardcore={hardcoreRun} don={isDonG} />
        <AbyssScrim />
        {/* Teal "treasure surfacing" wash — the whole screen should read as a reward. */}
        <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
          style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: `radial-gradient(ellipse 120% 66% at 50% 6%, ${AC}24 0%, ${AC}08 38%, transparent 64%)` }} />
        {/* Legendary climax — a brief gold screen flash the instant the rarest
            card flips open (rare/common land quietly on the card itself). */}
        <AnimatePresence>
          {boonFlash > 0 && boonBanner && (
            <motion.div key={boonFlash} aria-hidden initial={{ opacity: 0.5 }} animate={{ opacity: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }}
              style={{ position: 'fixed', inset: 0, zIndex: 58, pointerEvents: 'none', background: boonFromShrine
                ? 'radial-gradient(circle at 50% 46%, rgba(220,50,60,0.4) 0%, rgba(220,50,60,0.12) 40%, transparent 72%)'
                : 'radial-gradient(circle at 50% 46%, rgba(245,185,74,0.4) 0%, rgba(245,185,74,0.12) 40%, transparent 72%)' }} />
          )}
        </AnimatePresence>
        {/* Blood Price draft — the whole room goes crimson: a shrine draft was
            PAID FOR in hull, and it should never read like a free depth gift.
            Static plain-gradient wash (no blend modes — perf audit rule). */}
        {boonFromShrine && (
          <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
              background: [
                'radial-gradient(ellipse 120% 46% at 50% -6%, rgba(170,24,34,0.34) 0%, transparent 62%)',
                'radial-gradient(ellipse 130% 60% at 50% 108%, rgba(120,12,22,0.4) 0%, transparent 60%)',
                'linear-gradient(180deg, rgba(60,8,14,0.18), rgba(30,4,8,0.22))',
              ].join(', '),
            }} />
        )}
        {/* Legendary banner — the only "stop the room" beat left, reserved for the
            rarest pull (mirrors the Crew Hall legendary reveal). */}
        <AnimatePresence>
          {boonBanner && (
            <motion.div key={boonBanner.key} aria-hidden
              initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.45, ease: [0.16, 1.25, 0.3, 1] }}
              style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <p className="font-pirata" style={{ fontSize: '2.4rem', letterSpacing: '0.05em', lineHeight: 1, color: '#f5b94a', textShadow: '0 0 28px #f5b94a, 0 0 64px rgba(245,185,74,0.6)' }}>Legendary!</p>
              <p className="font-cinzel font-700 uppercase" style={{ fontSize: '0.95rem', letterSpacing: '0.18em', color: '#ecdcbd', marginTop: 8, textShadow: '0 2px 12px rgba(0,0,0,0.85)' }}>{boonBanner.name}</p>
            </motion.div>
          )}
        </AnimatePresence>
        <div style={{
          position: 'relative', zIndex: 1, maxWidth: 470, margin: '0 auto',
          padding: '12px 0.9rem', textAlign: 'center',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
        }}>
          <motion.p initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="font-karla font-800 uppercase" style={{ fontSize: '0.72rem', letterSpacing: '0.36em', color: boonFromShrine ? '#f87171' : AC, marginTop: 10, textShadow: boonFromShrine ? '0 0 16px rgba(239,68,68,0.5)' : `0 0 16px ${AC}66` }}>
            {boonFromShrine ? 'Paid in Blood' : 'Plunder of the Deep'}
          </motion.p>
          <motion.h1 initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 17 }}
            className="font-cinzel font-800" style={{ fontSize: 'clamp(1.6rem, 8vw, 2.2rem)', whiteSpace: 'nowrap', color: boonFromShrine ? '#ffe9e9' : '#eafffb', lineHeight: 1.04, marginTop: 9, textShadow: boonFromShrine ? '0 0 32px rgba(220,50,60,0.55)' : `0 0 32px ${AC}55` }}>
            {boonFromShrine ? 'A Power Surfaces' : 'Choose a Power'}
          </motion.h1>
          <p className="font-karla font-600" style={{ fontSize: '0.95rem', color: boonFromShrine ? '#d3b0b0' : '#b6c7c2', marginTop: 9, marginBottom: boonFromShrine ? 10 : 20, lineHeight: 1.4 }}>
            {boonFromShrine
              ? 'The stone drank your blood and gave this up in return. Take one.'
              : 'Three powers surface. One is yours for the rest of the dive.'}
          </p>
          {/* Blood-drop divider — the offering mark under the header (drawn, no
              emoji), so the shrine draft reads as a rite even at a glance. */}
          {boonFromShrine && (
            <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18 }}>
              <span style={{ width: 54, height: 1, background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.55))' }} />
              <svg width="13" height="13" viewBox="0 0 24 24" fill="rgba(239,68,68,0.85)" aria-hidden>
                <path d="M12 2.5s5.6 6.3 5.6 10.4a5.6 5.6 0 0 1-11.2 0C6.4 8.8 12 2.5 12 2.5z" />
              </svg>
              <span style={{ width: 54, height: 1, background: 'linear-gradient(90deg, rgba(239,68,68,0.55), transparent)' }} />
            </motion.div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {pendingBoons.slice(0, boonCardCount).map((b, idx) => {
              const rm = BOON_RARITY_META[b.rarity]
              const legendary = b.rarity === 'legendary'
              const rare = b.rarity === 'rare'
              const fam = GAUNTLET_BOONS.find(f => f.id === b.id)
              const maxTier = fam?.tiers.length ?? 3
              const boonImg = fam?.image
              const ph = boonPhases[idx] ?? 'sealed'
              const flipped = ph === 'flipped'
              const charging = ph === 'charging'
              const rank = legendary ? 3 : rare ? 2 : 1
              return (
                <div key={b.id} style={{ position: 'relative', perspective: 1100 }}>
                {/* The real card — edge-on (hidden) until it flips up to face you */}
                <motion.div
                  initial={false}
                  animate={{ rotateY: flipped ? 0 : -90 }}
                  transition={{ duration: 0.26, ease: 'easeOut' }}
                  className={flipped ? (rank === 3 ? 'reveal-glow-legendary' : rank === 2 ? 'reveal-glow-rare' : '') : ''}
                  style={{ transformOrigin: 'center', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                >
                <motion.button
                  initial={false}
                  // Press-and-hold weight: the card sinks under the finger with a
                  // tick on contact, then applyBoon's commit buzz fires on release
                  // — the pick should feel heavier than a menu tap.
                  whileTap={flipped ? { scale: 0.93 } : undefined}
                  whileHover={flipped ? { scale: 1.015 } : undefined}
                  transition={{ type: 'spring', stiffness: 480, damping: 26 }}
                  onPointerDown={flipped ? () => hapticTap() : undefined}
                  // Armed to banish: the whole card becomes the "bin this one"
                  // target (and opens a confirm) instead of drafting it.
                  onClick={() => {
                    if (!flipped) return
                    if (banArmed) { hapticTap(); setBanConfirm({ idx, name: b.name }); return }
                    applyBoon(b)
                  }}
                  className="tap"
                  style={{
                    position: 'relative', textAlign: 'left', overflow: 'hidden', width: '100%',
                    padding: '0.9rem 1rem 0.9rem 1.2rem', borderRadius: 16,
                    // Firm dark base so the card reads over the detailed backdrop;
                    // the rarity tint stays as an accent up top.
                    background: banArmed
                      ? 'linear-gradient(180deg, rgba(220,70,70,0.24) 0%, rgba(19,8,10,0.92) 58%)'
                      : `linear-gradient(180deg, ${rm.color}30 0%, rgba(7,12,19,0.9) 58%)`,
                    border: `1.5px solid ${banArmed ? 'rgba(240,120,120,0.85)' : `${rm.color}${legendary ? 'dd' : rare ? '99' : '66'}`}`,
                    color: '#eef7f4', cursor: 'pointer',
                    boxShadow: banArmed ? '0 0 22px rgba(220,70,70,0.35)'
                             : legendary ? `0 0 40px ${rm.color}5a, inset 0 0 38px ${rm.color}1c`
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
                  {/* Hero row — a big framed art medallion carries the card; the
                      name + payoff sit beside it. Flavor moves to the info sheet
                      and the synergy chips run full-width below, so the card stays
                      tight and art-forward. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Art medallion — the star of the card */}
                    <div style={{
                      position: 'relative', flexShrink: 0, width: 76, height: 76, borderRadius: 16,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `radial-gradient(circle at 42% 34%, ${rm.color}33 0%, rgba(4,9,14,0.55) 74%)`,
                      border: `1.5px solid ${rm.color}${legendary ? 'cc' : rare ? '88' : '5a'}`,
                      boxShadow: `inset 0 0 16px ${rm.color}22, 0 4px 12px rgba(0,0,0,0.4)`,
                    }}>
                      {boonImg
                        ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={boonImg} alt="" loading="lazy" decoding="async"
                            style={{ width: 60, height: 60, objectFit: 'contain', filter: `drop-shadow(0 2px 5px rgba(0,0,0,0.6)) drop-shadow(0 0 7px ${rm.color}66)` }} />
                        )
                        : <span aria-hidden style={{ fontSize: '1.7rem', color: rm.color, lineHeight: 1 }}>✦</span>}
                      {(legendary || rare) && (
                        <motion.span aria-hidden animate={{ opacity: [0.3, 0.75, 0.3], scale: [1, 1.045, 1] }}
                          transition={{ duration: legendary ? 1.8 : 2.6, repeat: Infinity, ease: 'easeInOut' }}
                          style={{ position: 'absolute', inset: -2, borderRadius: 18, border: `1.5px solid ${rm.color}`, boxShadow: `0 0 14px ${rm.color}77`, pointerEvents: 'none' }} />
                      )}
                    </div>

                    {/* Name + payoff */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                        <p className="font-cinzel font-700" style={{ flex: 1, minWidth: 0, fontSize: '1.04rem', color: '#f4fbf9', lineHeight: 1.14 }}>
                          {b.name} <span style={{ color: rm.color }}>{boonTierLabel(b.tier)}</span>
                        </p>
                        <span className="font-karla font-800 uppercase" style={{ flexShrink: 0, fontSize: '0.52rem', letterSpacing: '0.13em', color: legendary ? '#1a1206' : rm.color, background: legendary ? rm.color : `${rm.color}26`, border: `1px solid ${rm.color}`, borderRadius: 999, padding: '0.2rem 0.55rem', boxShadow: legendary ? `0 0 12px ${rm.color}88` : 'none' }}>
                          {rm.label}
                        </span>
                        <span
                          role="button" tabIndex={0} aria-label={`What ${b.name} does`}
                          onClick={(e) => { e.stopPropagation(); setDetailEffect({ kind: 'boon', name: `${b.name} ${boonTierLabel(b.tier)}`, desc: b.desc, detail: b.detail, flavor: b.flavor, count: b.tier, maxTier, image: boonImg,
                            rungs: fam?.tiers.map((tt, i) => ({ label: boonTierLabel(i + 1), desc: tt.desc, held: i + 1 <= b.tier, current: i + 1 === b.tier })) }) }}
                          className="font-cinzel font-700 tap"
                          style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.22)', color: 'rgba(255,255,255,0.72)', cursor: 'pointer', fontSize: '0.82rem', fontStyle: 'italic', lineHeight: 1 }}>
                          i
                        </span>
                      </div>
                      {/* The power gained — the payoff, green + clear. Set in
                          Karla, not Cinzel: Cinzel is a Roman-CAPITALS face, so
                          the effect line read as shouty all-caps at a size that
                          out-weighed the boon's own name. Sentence case, a notch
                          smaller than the title, still the green payoff. */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                        <span className="font-karla font-700" style={{ fontSize: '0.92rem', color: '#aef5c4', lineHeight: 1.3, textShadow: '0 0 10px rgba(74,222,128,0.25)' }}>
                          {b.desc}
                        </span>
                        {b.upgrade && (
                          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.1em', color: '#f0d79a', background: 'rgba(217,176,102,0.18)', border: '1px solid rgba(217,176,102,0.55)', borderRadius: 999, padding: '0.16rem 0.45rem' }}>
                            ↑ Upgrade
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Row 2.5 — SYNERGY STEER. What this pick does to your
                      confluences, shown BEFORE you commit: 'unlocks' one you
                      hold the other half of, or 'deepens' an online one by
                      raising its weaker half. An undiscovered synergy stays
                      fogged (you still get to steer; the reveal survives). */}
                  {(() => {
                    const hints = confluenceHintsFor(b, boonTiers, confluencesTaken)
                    if (hints.length === 0) return null

                    // A boon can genuinely feed SEVERAL confluences — ten of the
                    // twenty-five do, and Leviathan's Hunger feeds four. A named chip
                    // per confluence is right, but a FOGGED one has no name to show, so
                    // four of them rendered four identical "Unlocks a hidden synergy"
                    // chips and read as a duplication bug. (Testers reported exactly
                    // that.) So the fogged ones collapse into ONE counted chip, which is
                    // strictly better information: it says this boon is a HUB, without
                    // spoiling which synergies it opens.
                    const named  = hints.filter(h => h.kind === 'deepens' || seenConfluences.includes(h.c.id))
                    const fogged = hints.filter(h => h.kind === 'unlocks' && !seenConfluences.includes(h.c.id))

                    const chip = (key: string, label: string) => (
                      <span key={key} className="font-karla font-700 uppercase"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: '0.5rem', letterSpacing: '0.1em',
                          color: SYN, background: `${SYN}1c`, border: `1px solid ${SYN}77`,
                          borderRadius: 999, padding: '0.16rem 0.5rem',
                          boxShadow: `0 0 10px ${SYN}33`,
                        }}>
                        <span aria-hidden style={{ fontSize: '0.62rem', lineHeight: 1 }}>✦</span>
                        {label}
                      </span>
                    )

                    return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                        {named.map(h => chip(h.c.id, h.kind === 'deepens'
                          ? `Deepens ${h.c.name} ${boonTierLabel(h.level)}`
                          : `Unlocks ${h.c.name}`))}
                        {fogged.length > 0 && chip('fogged', fogged.length === 1
                          ? 'Unlocks a hidden synergy'
                          : `Unlocks ${fogged.length} hidden synergies`)}
                      </div>
                    )
                  })()}
                  {/* Flavor lives on the info sheet now — keeps the card tight. */}
                </motion.button>
                </motion.div>

                {/* Landing payoff — legendary gets gold shock rings + a spark
                    burst; rare/common settle with a soft rarity-tinted ring. */}
                {flipped && rank === 3 && <BoonShockRings />}
                {flipped && rank === 3 && <BoonSparks />}
                {flipped && rank < 3 && (
                  <span aria-hidden className="crew-land-ring" style={{
                    position: 'absolute', left: '50%', top: '50%', width: 44, height: 44, marginLeft: -22, marginTop: -22,
                    borderRadius: '50%', border: `2px solid ${rm.color}`, boxShadow: `0 0 8px ${rm.color}66`,
                    zIndex: 4, pointerEvents: 'none',
                  }} />
                )}

                {/* Sealed cover — rattles while charging, then flips away to reveal
                    the card beneath (mirrors the Crew Hall dossier reveal). */}
                <AnimatePresence>
                  {!flipped && (
                    <motion.div key="cover" initial={false} exit={{ rotateY: 90, opacity: 0 }}
                      transition={{ duration: 0.26, ease: 'easeIn' }}
                      style={{ position: 'absolute', inset: 0, zIndex: 6, transformOrigin: 'center', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', pointerEvents: 'none' }}>
                      <motion.div
                        animate={charging
                          ? { x: [0, -2, 2, -1.5, 1.5, 0], rotate: rank >= 3 ? [0, -1.4, 1.4, -0.9, 0.9, 0] : [0, -0.9, 0.9, -0.5, 0.5, 0] }
                          : { x: 0, rotate: 0 }}
                        transition={charging ? { duration: rank >= 3 ? 0.1 : 0.17, repeat: Infinity, ease: 'linear' } : { duration: 0.12 }}
                        style={{
                          width: '100%', height: '100%', borderRadius: 16,
                          background: 'linear-gradient(157deg, #11202a 0%, #0a141c 100%)',
                          border: `1px solid ${rm.color}3a`,
                          boxShadow: `inset 0 0 0 1px ${rm.color}1a, 0 6px 16px rgba(0,0,0,0.5)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                        <div className={charging ? 'crew-seal-charging' : ''} style={{
                          width: 48, height: 48, borderRadius: '50%',
                          background: `radial-gradient(circle at 38% 32%, ${rm.color} 0%, ${rm.color}66 72%)`,
                          border: '2px solid rgba(0,0,0,0.32)',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.55), inset 0 1px 2px rgba(255,255,255,0.25)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          ['--seal-glow']: rm.color,
                        } as CSSProperties}>
                          {/* Compass-rose sigil — a "power waiting to surface" mark */}
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <circle cx="12" cy="12" r="9" />
                            <polygon points="12,4.2 13.7,10.3 19.8,12 13.7,13.7 12,19.8 10.3,13.7 4.2,12 10.3,10.3" fill="rgba(255,255,255,0.82)" stroke="none" />
                          </svg>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
                </div>
              )
            })}

            {/* Confluence — a synergy you QUALIFY for, offered in place of a boon
                slot (the Hades-duo opportunity cost). Distinct violet lane so the
                "forge the synergy instead" trade reads at a glance. */}
            {pendingConfluence && revealDone && (() => {
              // Convergences (Don's meta-tier) take a hotter crimson-gold lane so
              // "forge a convergence" reads as a bigger moment than a synergy.
              const cvg = !!pendingConfluence.isConvergence
              const AC = cvg ? '#ff8a3d' : SYN
              const synImg = (cvg ? CONVERGENCES : CONFLUENCES).find(x => x.id === pendingConfluence.id)?.image
              return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 2px' }}>
                  <div style={{ flex: 1, height: 1, background: `${AC}33` }} />
                  <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.2em', color: AC }}>{cvg ? 'or forge a convergence' : 'or forge a synergy'}</span>
                  <div style={{ flex: 1, height: 1, background: `${AC}33` }} />
                </div>
                <motion.button
                  initial={{ opacity: 0, y: 22, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.12 + shownBoons * 0.13, type: 'spring', stiffness: 300, damping: 19 }}
                  whileTap={{ scale: 0.93 }}
                  whileHover={{ scale: 1.015 }}
                  onPointerDown={() => hapticTap()}
                  onClick={() => applyConfluence(pendingConfluence)}
                  className="tap reveal-glow-legendary"
                  style={{
                    position: 'relative', textAlign: 'left', overflow: 'hidden',
                    padding: '0.9rem 1rem 0.9rem 1.2rem', borderRadius: 16,
                    background: `linear-gradient(180deg, ${AC}2c 0%, rgba(8,14,22,0.62) 74%)`,
                    border: `1.5px solid ${AC}aa`, color: '#f3ecff', cursor: 'pointer',
                    boxShadow: `0 0 30px ${AC}44, inset 0 0 30px ${AC}12`,
                  }}
                >
                  <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, background: `linear-gradient(180deg, ${AC}, ${AC}33)`, boxShadow: `0 0 16px ${AC}` }} />
                  <motion.span aria-hidden
                    initial={{ x: '-130%' }} animate={{ x: '180%' }}
                    transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.4, ease: 'easeInOut' }}
                    style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '45%', background: `linear-gradient(100deg, transparent, ${AC}3a, transparent)`, pointerEvents: 'none' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    {/* Synergy medallion — matches the boon cards' hero art */}
                    <div style={{
                      position: 'relative', flexShrink: 0, width: 64, height: 64, borderRadius: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `radial-gradient(circle at 42% 34%, ${AC}33 0%, rgba(4,9,14,0.55) 74%)`,
                      border: `1.5px solid ${AC}aa`, boxShadow: `inset 0 0 14px ${AC}26, 0 4px 12px rgba(0,0,0,0.4)`,
                    }}>
                      {synImg
                        ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={synImg} alt="" loading="lazy" decoding="async"
                            style={{ width: 50, height: 50, objectFit: 'contain', filter: `drop-shadow(0 2px 5px rgba(0,0,0,0.6)) drop-shadow(0 0 7px ${AC}66)` }} />
                        )
                        : <span aria-hidden style={{ fontSize: '1.5rem', color: AC, lineHeight: 1 }}>✦</span>}
                      <motion.span aria-hidden animate={{ opacity: [0.3, 0.8, 0.3], scale: [1, 1.05, 1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ position: 'absolute', inset: -2, borderRadius: 16, border: `1.5px solid ${AC}`, boxShadow: `0 0 14px ${AC}88`, pointerEvents: 'none' }} />
                    </div>
                    <p className="font-cinzel font-700" style={{ flex: 1, minWidth: 0, fontSize: '1.06rem', color: '#f6f1ff', lineHeight: 1.16 }}>
                      {pendingConfluence.name} <span style={{ color: AC }}>{boonTierLabel(pendingConfluence.level)}</span>
                    </p>
                    <span className="font-karla font-800 uppercase" style={{ flexShrink: 0, fontSize: '0.52rem', letterSpacing: '0.13em', color: '#1a1030', background: AC, border: `1px solid ${AC}`, borderRadius: 999, padding: '0.2rem 0.55rem', boxShadow: `0 0 12px ${AC}88` }}>{cvg ? 'Convergence' : 'Synergy'}</span>
                  </div>
                  <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.12em', color: `${AC}cc`, marginTop: 4 }}>
                    {pendingConfluence.halves[0]} + {pendingConfluence.halves[1]}
                  </p>
                  <div style={{ marginTop: 7 }}>
                    <span className="font-cinzel font-800" style={{ fontSize: '1.06rem', color: '#e6d5ff', lineHeight: 1.16, textShadow: `0 0 14px ${AC}55` }}>{pendingConfluence.desc}</span>
                  </div>
                  {/* Plain-English mechanic explainer at the moment of decision —
                      more useful here than flavor (which still lives in the codex). */}
                  <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(243,236,255,0.72)', lineHeight: 1.45, marginTop: 6 }}>{pendingConfluence.detail}</p>
                  <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.1em', color: '#9a7fce', marginTop: 7 }}>You forgo the draft</p>
                </motion.button>
              </>
              )
            })()}

            {/* Reprieve — an optional one-time relief, taken INSTEAD of a boon.
                Surfaces in later rounds; the warm amber + "you forgo the draft"
                cue keep the trade clear. */}
            {pendingReprieve && revealDone && (
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
                  <div style={{ marginTop: 7 }}>
                    <span className="font-cinzel font-800" style={{ fontSize: '1.12rem', color: '#f3d9a6', lineHeight: 1.15, textShadow: `0 0 14px ${RELIEF}55` }}>{pendingReprieve.desc}</span>
                  </div>
                  <p className="font-karla" style={{ fontSize: '0.8rem', color: 'rgba(246,239,226,0.6)', lineHeight: 1.4, fontStyle: 'italic', marginTop: 6 }}>{pendingReprieve.flavor}</p>
                  <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.1em', color: '#b89a6a', marginTop: 7 }}>You forgo the draft</p>
                </motion.button>
              </>
            )}
          </div>

          {/* Second Cast — reroll the offered boons (limited per draft). */}
          {rerollsLeft > 0 && revealDone && (
            <button onClick={rerollBoons} className="font-karla font-700 uppercase tracking-[0.1em] tap"
              style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0.55rem 1.1rem', borderRadius: 999, fontSize: '0.64rem', color: AC, background: `${AC}14`, border: `1px solid ${AC}55`, cursor: 'pointer' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
              Reroll · {rerollsLeft} left
            </button>
          )}
          {/* Banish — arm the mode, then tap the boon you want gone (and confirm).
              A proper button beats the old 24px ✕ that sat on top of a full-card
              draft target. Only while a ban is still available. */}
          {filtersLeft > 0 && revealDone && (
            <div style={{ marginTop: rerollsLeft > 0 ? 9 : 16 }}>
              <button onClick={() => { hapticTap(); setBanArmed(a => !a) }} className="font-karla font-700 uppercase tracking-[0.08em] tap"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0.55rem 1.05rem', borderRadius: 999, fontSize: '0.64rem', cursor: 'pointer',
                  color: banArmed ? '#ffd9d9' : '#f0a0a0',
                  background: banArmed ? 'rgba(220,70,70,0.3)' : 'rgba(220,70,70,0.12)',
                  border: `1px solid ${banArmed ? 'rgba(240,120,120,0.9)' : 'rgba(230,90,90,0.45)'}`,
                  boxShadow: banArmed ? '0 0 18px rgba(220,70,70,0.35)' : 'none' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /><line x1="5.6" y1="5.6" x2="18.4" y2="18.4" /></svg>
                {banArmed ? 'Cancel' : `Remove a boon · ${filtersLeft} left`}
              </button>
              {banArmed && (
                <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#f8b4b4', marginTop: 8, lineHeight: 1.4 }}>
                  Tap the boon you want gone for the rest of the run.
                </p>
              )}
            </div>
          )}
          {/* Codex access — review what a synergy does / what you're building
              toward right when you're deciding. Lights violet when one is on
              offer. */}
          {revealDone && (
            <div style={{ marginTop: rerollsLeft > 0 ? 9 : 16 }}>
              <button onClick={() => setSynergiesOpen(true)} className="font-karla font-700 uppercase tracking-[0.1em] tap"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0.5rem 1rem', borderRadius: 999, fontSize: '0.6rem',
                  color: pendingConfluence ? '#e6d5ff' : '#c9c2b6',
                  background: pendingConfluence ? 'rgba(185,139,255,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${pendingConfluence ? 'rgba(185,139,255,0.5)' : 'rgba(255,255,255,0.12)'}`,
                  boxShadow: pendingConfluence ? '0 0 16px rgba(185,139,255,0.28)' : 'none', cursor: 'pointer' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 7v10l8 5 8-5V7z" /><path d="M12 22V12" /><path d="m4 7 8 5 8-5" /></svg>
                {pendingConfluence ? 'Review Synergies' : 'Synergy Codex'}
              </button>
            </div>
          )}
        </div>
        {detailModal}
        {exitModal}
        {synergiesOpen && <SynergiesModal owned={boonTiers} seen={seenConfluences} taken={confluencesTaken} takenConv={convergencesTaken} variant={props.variant ?? 'davy'} onClose={() => setSynergiesOpen(false)} />}
        {/* Banish confirm — spending a one-per-run charge deserves a beat. */}
        {banConfirm && (
          <ModalScrim zIndex={1320} onClose={() => setBanConfirm(null)}>
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 360, borderRadius: 18, padding: '1.3rem 1.15rem 1.15rem', textAlign: 'center', background: 'linear-gradient(180deg, rgba(26,12,14,0.99), rgba(12,7,8,0.99))', border: '1px solid rgba(240,120,120,0.5)', boxShadow: '0 0 44px rgba(220,70,70,0.22), 0 18px 50px rgba(0,0,0,0.6)' }}>
              <p className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.24em', color: '#f0a0a0' }}>Banish a Power</p>
              <p className="font-cinzel font-800" style={{ fontSize: '1.4rem', color: '#ffe4e4', lineHeight: 1.12, marginTop: 8 }}>{banConfirm.name}</p>
              <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(245,225,225,0.8)', lineHeight: 1.5, marginTop: 11 }}>
                Bin it for the rest of the dive — it never surfaces again, and a different power takes its place in this draft. Costs one of your {filtersLeft} banishes.
              </p>
              <button onClick={() => banBoon(banConfirm.idx)} className="font-cinzel font-800 uppercase tracking-[0.05em] tap"
                style={{ width: '100%', marginTop: 16, padding: '0.9rem', borderRadius: 13, fontSize: '0.95rem', color: '#ffe4e4', background: 'linear-gradient(180deg, rgba(220,70,70,0.5), rgba(120,25,30,0.4))', border: '1px solid rgba(240,120,120,0.85)', cursor: 'pointer' }}>
                Banish It
              </button>
              <button onClick={() => setBanConfirm(null)} className="font-karla font-600 tap"
                style={{ marginTop: 11, background: 'none', border: 'none', color: '#9a948a', fontSize: '0.76rem', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Keep it
              </button>
            </motion.div>
          </ModalScrim>
        )}
      </>
    )
  }

  // ── Descent transition ─────────────────────────────────────────────────────
  if (phase === 'descending') {
    const d = fight?.depth ?? 1
    const band = bandForDepth(d, props.variant)
    const taunt = gauntletTaunt(d, props.variant)
    // First depth OF a band = a real arrival — the name gets the loud cut.
    const bandEntry = band.minDepth === d && d > 1

    // Don Finleone's rise (Don's Gauntlet, placed at milestone depths): his OWN
    // telegraph so you feel him coming, not just meet a big boss mid-descent. Copy
    // climbs by rise (first meeting → returns → the throne). Shows his FACE, not
    // the ghost-host key art, so the boss reads as distinct from the presiding Ghost.
    if (fight?.isApex) {
      const rise = donRiseCopy(d)
      return (
        <>
          <AbyssBackdrop hardcore={hardcoreRun} don={isDonG} />
          <AbyssScrim />
          <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: `radial-gradient(ellipse 120% 82% at 50% 58%, ${KRAKEN_DEEP}3a 0%, ${KRAKEN_DEEP}14 40%, transparent 70%)` }} />
          <div style={{ position: 'relative', zIndex: 1, minHeight: '62vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2rem 1.2rem' }}>
            <motion.div initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 0.97, scale: 1 }} transition={{ duration: 1.4, ease: 'easeOut' }} style={{ position: 'relative', width: 190, height: 190 }}>
              <motion.div aria-hidden animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.85, 0.5] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                style={{ position: 'absolute', inset: -30, borderRadius: '50%', background: `radial-gradient(circle, ${KRAKEN}44 0%, ${KRAKEN_DEEP}22 45%, transparent 72%)` }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <motion.img src="/raid8_donfinleone.png" alt="" loading="eager" decoding="async"
                animate={{ y: [0, -6, 0] }} transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%', filter: `drop-shadow(0 12px 34px rgba(0,0,0,0.85)) drop-shadow(0 0 26px ${KRAKEN}66)` }} />
            </motion.div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="font-karla font-800 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.36em', color: KRAKEN, marginTop: 16, textShadow: `0 0 18px ${KRAKEN}88` }}>{rise.eyebrow}</motion.p>
            <motion.p initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.36, type: 'spring', stiffness: 210, damping: 17 }}
              className="font-cinzel font-800" style={{ fontSize: '2.3rem', color: '#eafff2', lineHeight: 1.04, marginTop: 8, textShadow: `0 2px 12px rgba(0,0,0,0.7), 0 0 30px ${KRAKEN}55` }}>{rise.title}</motion.p>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: KRAKEN, marginTop: 6, letterSpacing: '0.06em' }}>{rise.sublabel}</motion.p>
            <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.72, duration: 0.5 }}
              className="font-karla" style={{ maxWidth: 330, fontSize: '0.8rem', fontStyle: 'italic', color: 'rgba(63,191,130,0.9)', lineHeight: 1.5, marginTop: 16 }}>
              &ldquo;{rise.line}&rdquo;
              <span className="font-karla font-700 uppercase tracking-[0.16em]" style={{ display: 'block', fontSize: '0.5rem', color: 'rgba(63,191,130,0.6)', marginTop: 6 }}>Don Finleone</span>
            </motion.p>
          </div>
        </>
      )
    }
    return (
      <>
        <AbyssBackdrop hardcore={hardcoreRun} don={isDonG} />
        <AbyssScrim />
        <div style={{
          position: 'relative', zIndex: 1, minHeight: '60vh',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: '2rem 1rem',
        }}>
          <motion.div initial={{ opacity: 0, y: -22, scale: 0.86 }} animate={{ opacity: 0.92, y: 0, scale: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroImg} alt="" loading="eager" decoding="async"
              style={{ width: 104, height: 104, objectFit: 'contain', filter: 'drop-shadow(0 8px 26px rgba(0,0,0,0.7))' }} />
          </motion.div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12, duration: 0.4 }}
            className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.34em', color: bandEntry ? band.accent : AC, marginTop: 16 }}>
            {d === 1 ? (isDonG ? 'Into the Green' : 'Into the Locker') : bandEntry ? 'You Sink Into' : 'Deeper Still'}
          </motion.p>
          <motion.p initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.18, type: 'spring', stiffness: 230, damping: 18 }}
            className="font-cinzel font-800" style={{ fontSize: '2.4rem', color: GOLD, lineHeight: 1, marginTop: 8, textShadow: '0 0 28px rgba(240,192,64,0.4)' }}>
            Depth {d}
          </motion.p>
          <motion.p initial={{ opacity: 0, scale: bandEntry ? 0.82 : 1 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 0.45 }}
            className="font-cinzel font-700" style={{ fontSize: bandEntry ? '1.2rem' : '0.92rem', color: bandEntry ? band.accent : '#cfc9bf', marginTop: 7, letterSpacing: '0.02em', textShadow: bandEntry ? `0 0 20px ${band.accent}66` : undefined }}>
            {band.name}
          </motion.p>
          {/* Blood Oath (a Locker upgrade) opens the run already holding one
              boon. Announce it on the first descent so a boon you never drafted
              doesn't read as a bug when you open the codex. */}
          {d === 1 && oathBoon && (() => {
            const nm = GAUNTLET_BOONS.find(f => f.id === oathBoon)?.name
            return nm ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42, duration: 0.5 }}
                style={{ marginTop: 14, maxWidth: 320, padding: '0.5rem 0.9rem', borderRadius: 12, background: `${AC}12`, border: `1px solid ${AC}45`, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={AC} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}><path d="M12 2 4 7v10l8 5 8-5V7z" /><path d="M12 22V12" /><path d="m4 7 8 5 8-5" /></svg>
                <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#dfeee9', lineHeight: 1.35, textAlign: 'left' }}>
                  <span className="font-800 uppercase tracking-[0.06em]" style={{ color: AC }}>Blood Oath</span> — you dive already holding <strong style={{ color: '#f4ecd8' }}>{nm} I</strong>.
                </p>
              </motion.div>
            ) : null
          })()}
          {/* Uncharted water — the record breaks HERE, mid-run, not at the
              cash-out screen. Fires once per run. */}
          {recordBeat && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5 }}
              style={{ marginTop: 14, padding: '0.5rem 1rem', borderRadius: 12, background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.55)', boxShadow: '0 0 22px rgba(240,192,64,0.25)' }}>
              <p className="font-cinzel font-800 uppercase" style={{ fontSize: '0.82rem', letterSpacing: '0.2em', color: GOLD, textShadow: '0 0 14px rgba(240,192,64,0.5)' }}>
                Uncharted Water
              </p>
              <p className="font-karla" style={{ fontSize: '0.7rem', color: 'rgba(240,225,190,0.8)', fontStyle: 'italic', marginTop: 3 }}>
                No chart of yours goes deeper. Every fathom from here is a first.
              </p>
            </motion.div>
          )}
          {taunt && (
            <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.5 }}
              className="font-karla" style={{ maxWidth: 320, fontSize: '0.78rem', fontStyle: 'italic', color: isDonG ? 'rgba(63,191,130,0.85)' : 'rgba(94,234,212,0.82)', lineHeight: 1.5, marginTop: 16 }}>
              &ldquo;{taunt}&rdquo;
              <span className="font-karla font-700 uppercase tracking-[0.16em]" style={{ display: 'block', fontSize: '0.5rem', color: isDonG ? 'rgba(63,191,130,0.55)' : 'rgba(94,234,212,0.5)', marginTop: 6 }}>{gauntletFace}</span>
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
    // The gloom's HUE deepens with the band — cold blue up top, violet on the
    // Leviathan's Road, blood-dark in the Crush — so depth reads in the room.
    const gloomHue = fight.depth >= 60 ? '40,6,10' : fight.depth >= 42 ? '22,8,32' : '3,9,18'
    // Backdrop escalates with the fight: the Don apex (Finleone) gets its own
    // unique tableau; else boss > elite > standard sea, keyed to the run.
    const battleBg = fight.isApex
      ? '/dons-apex-battle.jpg'
      : hardcoreRun
      ? (fight.isBoss ? '/hc-gauntlet-boss.jpg' : fight.isElite ? '/hc-gauntlet-elite.jpg' : '/hc-gauntlet-battle.jpg')
      : isDonG
        ? (fight.isBoss ? '/dons-gauntlet-boss.jpg' : fight.isElite ? '/dons-gauntlet-elite.jpg' : '/dons-gauntlet-battle.jpg')
        : (fight.isBoss ? '/davy-gauntlet-boss.jpg' : fight.isElite ? '/davy-gauntlet-elite.jpg' : '/davy-gauntlet-battle.jpg')
    return (
      <>
      {/* Full-screen battle backdrop — ONE scene behind the whole fight, keyed to
          the run, matching AbyssBackdrop's mode split: Hardcore's blood-red
          spectral sea (wins), else Don's kraken-green drowned court at sea, else
          Davy's teal maelstrom-sea. Same stacking as raids: the page lives inside
          PageTransition's z-index:1 layer (above the app-level /raids
          ClientBackground), so a fixed layer at zIndex -1 still covers that page
          image while sitting BEHIND the in-flow combat and leaving the fixed
          overlays untouched. RaidCombat's container is transparent
          (transparentBackdrop) so this shows through — no boxed second image. */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={battleBg} alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, background: hardcoreRun
          ? 'linear-gradient(to bottom, rgba(28,2,4,0.24) 0%, rgba(22,1,3,0.44) 46%, rgba(8,0,1,0.82) 100%)'
          : 'linear-gradient(to bottom, rgba(3,9,11,0.26) 0%, rgba(3,9,11,0.44) 46%, rgba(2,6,8,0.8) 100%)' }} />
      </div>
      <div className="raid-combat-region flex flex-col items-center gap-2 select-none"
        style={{ position: 'relative', userSelect: 'none', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 48px)' }}>
        {gloom > 0.02 && (
          <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
            background: `radial-gradient(ellipse 116% 96% at 50% 44%, transparent 56%, rgba(${gloomHue},${gloom}) 100%)` }} />
        )}
        <div className="gauntlet-depthbar" style={{ width: '100%', flexShrink: 0, marginBottom: 2 }}>
          <DepthBar depth={fight.depth} pot={pot} isBoss={fight.isBoss} isElite={fight.isElite} affixName={fight.affix?.name} curses={Object.keys(curseTiers).length} isHardcore={hardcoreRun} potGain={potGain} uncharted={uncharted} pressure={hardcoreRun ? pressure : 0} signedTerms={hardcoreRun ? signedTerms : {}} contract={contractChip} marks={marks} />
        </div>
        {/* Everything the run carries (job, Don's Marks, terms, curses) now lives
            IN the DepthBar header + its tap-for-details panel, so nothing above the
            combat can shift the stage down mid-fight. */}
        <div style={{ width: '100%' }}>
          <RaidCombat
            key={`gauntlet-r${fight.depth}`}
            enemy={fight.enemy}
            atmosphere={atmosphereForDepth(fight.depth)}
            zoneBg="/abyss.jpg"
            zoneFilter={hardcoreRun ? undefined : GAUNTLET_ABYSS_FILTER}
            // The abyss is painted full-screen behind the whole fight (below), so
            // RaidCombat's container stays transparent and that one scene shows
            // through — no boxed abyss on top of the app's /raids page image.
            transparentBackdrop
            enemyArtFilter={props.variant === 'don' ? GHOST_FILTER : DROWNED_FILTER}
            bonusChargeSlots={bonusSlots}
            anchorSaveAvailable={anchorSavesLeftRef.current > 0}
            onAnchorSave={() => { anchorSavesLeftRef.current = Math.max(0, anchorSavesLeftRef.current - 1) }}
            affix={fight.affix}
            isElite={fight.isElite}
            isBoss={fight.isBoss}
            contractsWon={contractsWon}
            runBoons={runBoonsList}
            runCurses={runCursesList}
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
            // Don's contract: combat hands over the per-fight facts the instant
            // this hull sinks, just before onEnemyDefeated resolves the job.
            onContractFacts={(f) => { contractFactsRef.current = f }}
            runKills={rollStateRef.current.cleared}
            runDepth={fight.depth}
            initialCharges={carriedChargesRef.current}
            onPlayerDefeated={handlePlayerDefeated}
            onPlayerHit={(d) => { if (d > runMaxHitRef.current) { runMaxHitRef.current = d; recordGauntletHit(d).catch(() => {}) } }}
            onStat={(d) => addRunStats(runStatsRef.current, d)}
            // No escape mid-fight in Hardcore — abandoning is death, so the ←
            // leave button is withheld entirely (undefined onLeave → no button).
            onLeave={hardcoreRun ? undefined : () => setConfirmLeave(true)}
            raidMods={runRaidMods}
            tideEffects={runEffects}
            crewMembers={runCrew}
            usedAbilityIds={usedAbilityIds}
            megaAugment={props.manowarAugment}
            abilitiesRefreshed={fightOpensRefreshed}
            onAbilityFired={(crewId) => setUsedAbilityIds(prev => {
              if (prev.has(crewId)) return prev
              const next = new Set(prev); next.add(crewId); return next
            })}
            usedRaidItemIds={usedRaidItemIds}
            onRaidItemUsed={(itemId) => setUsedRaidItemIds(prev => {
              if (prev.has(itemId)) return prev
              const next = new Set(prev); next.add(itemId); return next
            })}
            onRefreshAbility={(crewId) => setUsedAbilityIds(prev => {
              if (!prev.has(crewId)) return prev
              const next = new Set(prev); next.delete(crewId); return next
            })}
            usedAbilitySub="Used — back soon."
            openingNote={rollStateRef.current.prevWasBoss ? 'Your crew catch their breath. Abilities refreshed.' : undefined}
          />
        </div>
        {exitModal}
      </div>
      </>
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
// Don's Gauntlet keeps its own coffer: verdigris brass and sea-worn green
// against Davy's gold. Only the SPRITE swaps, never the tier colour, so a
// tier-5 Don chest still bursts violet exactly like a tier-5 Davy one and the
// ladder reads the same in both descents.
const DONS_CHEST = { closed: '/donschestclosed.png', open: '/donschestopen.png' }
const CHEST_ART: Record<number, { closed: string; open: string; color: string }> = {
  1: { ...DAVY_CHEST, color: '#c08a4e' },
  2: { ...DAVY_CHEST, color: '#9fb0bf' },
  3: { ...DAVY_CHEST, color: '#f0c040' },
  4: { ...DAVY_CHEST, color: '#7fdce8' },
  5: { ...DAVY_CHEST, color: '#a78bfa' },
}

// Hardcore cash-out chest — same Davy sprite, but a blood-dark coffer: a
// dark, muted red CSS tint over the art + a matching accent driving every
// glow/ray, and its own name (the tier still sets the pot mult + haul).
const HARDCORE_CHEST_ACCENT = '#b83a3a'
const HARDCORE_CHEST_FILTER = 'grayscale(0.4) sepia(1) saturate(2.4) hue-rotate(-30deg) brightness(0.62) contrast(1.1)'

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

// The Mark emblems — a swept shark dorsal fin, a whale-tail fluke. Silhouettes so
// the boss reward reads its own iconography (never emoji).
function SharkFin() {
  return <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M3 20 C 10 20, 14 19, 16 16 C 19 10, 20 5, 19 2 C 16 7, 11 13, 3 20 Z" /></svg>
}
function WhaleTail() {
  return <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 19 C 10 13, 6 9, 2 8 C 5 11, 8 14, 12 19 C 16 14, 19 11, 22 8 C 18 9, 14 13, 12 19 Z" /></svg>
}

// The Mark choice cinematic — two Marks torn from the fallen Don, Shark (offense)
// vs Whale (defense). Pick one; it sears in (the chosen card flares + brands, the
// other burns away) before the run continues. Deliberately unlike the boon draft.
function MarkChoice({ offer, searing, taken, onChoose }: {
  offer: { shark: MarkBuff[]; whale: MarkBuff[] }
  searing: MarkType | null
  taken: number
  onChoose: (t: MarkType) => void
}) {
  const cards: { type: MarkType; buffs: MarkBuff[]; accent: string }[] = [
    { type: 'shark', buffs: offer.shark, accent: '#ff6a3d' },
    { type: 'whale', buffs: offer.whale, accent: '#4d9de0' },
  ]
  return (
    <>
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 90% 60% at 24% 42%, rgba(255,106,61,0.13), transparent 60%), radial-gradient(ellipse 90% 60% at 76% 42%, rgba(77,157,224,0.13), transparent 60%), #05070b' }} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 520, margin: '0 auto', minHeight: '72vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '1.4rem 0.9rem', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 20px)' }}>
        <motion.p initial={{ opacity: 0, letterSpacing: '0.5em' }} animate={{ opacity: 1, letterSpacing: '0.3em' }} transition={{ duration: 0.7 }}
          className="font-karla font-800 uppercase" style={{ textAlign: 'center', fontSize: '0.6rem', color: '#c9b48a', textShadow: '0 0 16px rgba(240,192,64,0.4)' }}>
          {searing ? 'The Mark Sears In' : taken > 0 ? `His Mark · ${taken} already yours` : 'His Mark'}
        </motion.p>
        <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="font-cinzel font-800" style={{ textAlign: 'center', fontSize: '1.5rem', color: '#eef3f7', lineHeight: 1.1, marginTop: 6, marginBottom: 4 }}>
          {searing ? 'Marked' : 'Take What You Tore Loose'}
        </motion.h1>
        {!searing && (
          <p className="font-karla" style={{ textAlign: 'center', fontSize: '0.72rem', color: 'rgba(200,214,226,0.6)', marginBottom: 14 }}>
            One rides the rest of your run. Choose.
          </p>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: searing ? 18 : 6, alignItems: 'stretch' }}>
          {cards.map(c => {
            const isChosen = searing === c.type
            const isDimmed = searing != null && !isChosen
            return (
              <motion.button key={c.type} type="button" disabled={searing != null}
                onClick={() => onChoose(c.type)} whileTap={searing ? undefined : { scale: 0.97 }}
                animate={{ opacity: isDimmed ? 0.14 : 1, scale: isChosen ? 1.04 : 1, filter: isDimmed ? 'grayscale(0.7)' : 'none' }}
                transition={{ duration: 0.5 }} className="tap"
                style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                  padding: '1rem 0.65rem', borderRadius: 18, cursor: searing ? 'default' : 'pointer',
                  background: `linear-gradient(170deg, ${c.accent}2a, rgba(7,12,19,0.88))`,
                  border: `1.5px solid ${isChosen ? c.accent : c.accent + '66'}`,
                  boxShadow: isChosen ? `0 0 42px ${c.accent}66, inset 0 0 30px ${c.accent}22` : `0 0 18px ${c.accent}18` }}>
                <motion.div animate={isChosen ? { scale: [1, 1.28, 1.12], rotate: [0, -5, 0] } : {}} transition={{ duration: 0.8 }}
                  style={{ width: 62, height: 62, display: 'grid', placeItems: 'center', borderRadius: '50%',
                    background: `radial-gradient(circle, ${c.accent}33, transparent 70%)`, color: c.accent,
                    filter: `drop-shadow(0 0 ${isChosen ? 20 : 8}px ${c.accent}99)` }}>
                  {c.type === 'shark' ? <SharkFin /> : <WhaleTail />}
                </motion.div>
                <p className="font-cinzel font-800 uppercase tracking-[0.03em]" style={{ fontSize: '0.72rem', color: c.accent, marginTop: 8, textShadow: `0 0 12px ${c.accent}66` }}>
                  {MARK_META[c.type].name}
                </p>
                <p className="font-karla" style={{ fontSize: '0.58rem', fontStyle: 'italic', color: 'rgba(220,228,236,0.55)', marginTop: 2, minHeight: '1.6em', lineHeight: 1.25 }}>
                  {MARK_META[c.type].tagline}
                </p>
                <div style={{ width: '100%', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {c.buffs.map((b, i) => (
                    <motion.div key={b.cat} animate={isChosen ? { scale: [1, 1.09, 1] } : {}} transition={{ delay: isChosen ? 0.2 + i * 0.12 : 0, duration: 0.4 }}
                      className="font-karla font-700"
                      style={{ fontSize: '0.62rem', color: '#eef3f7', padding: '0.3rem 0.35rem', borderRadius: 8,
                        background: isChosen ? `${c.accent}2e` : 'rgba(255,255,255,0.05)', border: `1px solid ${c.accent}44` }}>
                      {describeBuff(b)}
                    </motion.div>
                  ))}
                </div>
                {isChosen && (
                  <motion.p initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5, type: 'spring', stiffness: 240, damping: 14 }}
                    className="font-cinzel font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.64rem', color: c.accent, marginTop: 10, textShadow: `0 0 14px ${c.accent}` }}>
                    Seared in
                  </motion.p>
                )}
              </motion.button>
            )
          })}
        </div>
      </div>
    </>
  )
}

function GauntletReward({ r, recap, onBack, don }: { r: RewardOk; recap: { shipsSunk: number; maxHit: number; boonTiers: Record<string, number>; curseTiers: Record<string, number>; confluencesTaken?: string[]; convergencesTaken?: string[]; stats?: GauntletRunStats; events?: RunEvent[]; contracts?: { name: string; reward: string }[] }; onBack: () => void; don?: boolean }) {
  const AC = don ? KRAKEN : TEAL   // Don's cash-out wears the kraken green
  // Three beats: closed -> opening (a wind-up rattle + creak) -> open (burst +
  // reveal). The anticipation phase makes the crack land as a payoff.
  const [opening, setOpening] = useState(false)
  const [opened, setOpened] = useState(false)
  // Counting starts a beat AFTER opening: chest cracks + reveals, then the
  // doubloons / XP increment (count-up + purse tick + bar fill).
  const [counting, setCounting] = useState(false)
  // Hardcore recolors the coffer red/black + renames it; the tier sprite is
  // shared, so we just swap the accent color (all glows/rays read it) and
  // prepend a tint filter to the chest art.
  const baseTier = CHEST_ART[r.chest.tier] ?? CHEST_ART[1]
  const baseArt = don ? { ...baseTier, ...DONS_CHEST } : baseTier
  const art = r.hardcore ? { ...baseArt, color: HARDCORE_CHEST_ACCENT } : baseArt
  const chestFilter = r.hardcore ? `${HARDCORE_CHEST_FILTER} ` : ''
  // r.chest.label already arrives named for the descent (see chestLabelFor on
  // the server). Hardcore overrides it with its own single name.
  const chestLabel = r.hardcore ? hardcoreChestLabel(don ? 'don' : 'davy') : r.chest.label
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

  // Navigation Renown crossing (post-100) — the banked XP can push past one or
  // more Renown levels. Fires once the XP has visibly flowed into the bar.
  const gainedRenown = renownLevel('nav', r.newExpeditionXP) - renownLevel('nav', oldXp)
  const [renownUp, setRenownUp] = useState<RenownUpInfo | null>(null)
  useEffect(() => {
    if (counting && gainedRenown > 0) {
      const t = window.setTimeout(() => setRenownUp({ skill: 'nav', toLevel: renownLevel('nav', r.newExpeditionXP), points: gainedRenown }), 1400)
      return () => window.clearTimeout(t)
    }
  }, [counting, gainedRenown, r.newExpeditionXP])

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
      {r.hardcore ? <HcSeaBackdrop /> : <AbyssBackdrop hardcore={r.hardcore} don={don} />}
      <AbyssScrim />
      <RenownUpOverlay info={renownUp} onDismiss={() => setRenownUp(null)} />
      <div style={{
        position: 'relative', zIndex: 1, maxWidth: 440, margin: '0 auto',
        padding: '10px 0.95rem', textAlign: 'center',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 24px)',
        // The chest burst/ray FX scale up to ~800px and stay mounted at opacity
        // 0; transformed elements still count toward scroll size, so without
        // this they balloon the page's scroll area. Clip the decorative bleed —
        // the bursts still flash, they just can't push the page wider/taller.
        overflow: 'hidden',
      }}>
        {!opened ? (
          <>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.3em', color: r.hardcore ? '#8b7bf0' : AC, marginTop: 16 }}>
              {r.hardcore ? 'Your Crew Sailed Home From the Locker' : 'You Climbed Back Into the Light'}
            </p>
            {r.hardcore && (
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.14em', color: '#a99cf0', marginTop: 6 }}>
                Hardcore Gauntlet · survivor bonus paid
              </p>
            )}
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
                style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: `${chestFilter}drop-shadow(0 8px 22px rgba(0,0,0,0.6)) drop-shadow(0 0 26px ${art.color}44)` }} />
            </div>
            <p className="font-cinzel font-800" style={{ fontSize: '1.35rem', color: art.color, lineHeight: 1.1, marginTop: 4, textShadow: `0 0 22px ${art.color}44` }}>
              {chestLabel}
            </p>
            <p className="font-karla font-600" style={{ fontSize: '0.76rem', color: '#c2bcae', marginTop: 5, textShadow: '0 1px 6px rgba(0,0,0,0.75)' }}>
              Hauled up from depth {r.depth}{r.chest.potMult > 1 ? ` · ×${r.chest.potMult} haul` : ''}
            </p>
            {/* You came back up under Davy's terms. Say what they were, and what
                they turned your Blood Gems into. */}
            {r.runPressure > 0 && (
              <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: GOLD, marginTop: 4 }}>
                You came up under Davy&rsquo;s terms at {r.runPressure} Pressure.{' '}
                {r.gemMult > 1
                  ? <>Blood Gems ×{r.gemMult.toFixed(2)}</>
                  : <span style={{ color: '#8a8578' }}>Too shallow to earn the bonus.</span>}
              </p>
            )}
            {/* You shook on it. Name what the bargain actually paid, so the deal reads
                as a decision the captain made and not a number that quietly appeared. */}
            {r.offerTaken && (
              <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#c9a7ff', marginTop: 4 }}>
                {offerTakenLine(r.offerTaken)}
              </p>
            )}
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
                style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: `${chestFilter}drop-shadow(0 8px 22px rgba(0,0,0,0.6)) drop-shadow(0 0 30px ${art.color}66)` }} />
            </div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
              className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.32em', color: AC }}>
              Hauled Up
            </motion.p>
            <motion.p initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.18, type: 'spring', stiffness: 240, damping: 18 }}
              className="font-cinzel font-800" style={{ fontSize: '1.4rem', color: art.color, lineHeight: 1.1, marginTop: 4, textShadow: `0 0 22px ${art.color}44` }}>
              {chestLabel}
            </motion.p>

            <div style={{ marginTop: 16, textAlign: 'left', background: 'rgba(6,10,16,0.86)', border: `1px solid ${GOLD}3a`, borderRadius: 14, padding: '0.5rem 0.85rem 0.7rem', boxShadow: '0 8px 26px rgba(0,0,0,0.45)' }}>
              <RewardLine label="Doubloons" to={r.bankedDoubloons} suffix=" ⟡" color={GOLD} delay={0.2} run={counting} />
              <RewardLine label="Nav XP" to={r.bankedXp} color="#4ade80" delay={0.32} run={counting} />
              {r.gems > 0 && <RewardLine label="Gems" to={r.gems} suffix=" ◆" color="#a78bfa" delay={0.44} run={counting} />}
              {r.earnedFathoms > 0 && <RewardLine label="Fathoms" to={r.earnedFathoms} suffix=" Fathoms" color={AC} delay={0.56} run={counting} />}
              {/* Blood Gems — the premium Hardcore spoil. A crimson, glowing row
                  set apart from the plain payouts above it (only ever > 0 on a
                  Hardcore cash-out). */}
              {r.earnedBloodGems > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.68, duration: 0.35 }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, padding: '0.55rem 0.6rem', borderRadius: 11, background: 'linear-gradient(180deg, rgba(192,56,74,0.18), rgba(120,20,32,0.12))', border: '1px solid rgba(220,38,38,0.55)', boxShadow: '0 0 20px rgba(192,56,74,0.28), inset 0 0 12px rgba(120,20,32,0.35)' }}>
                  <span style={{ minWidth: 0 }}>
                    <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ display: 'block', fontSize: '0.56rem', color: '#e88a97', textShadow: '0 0 8px rgba(192,56,74,0.5)' }}>Blood Gems</span>
                    {/* What Davy's Terms actually bought you. Only shown when the
                        Pressure genuinely paid (deep enough for the ramp). */}
                    {r.gemMult > 1 && (
                      <span className="font-karla font-700" style={{ display: 'block', fontSize: '0.56rem', color: '#f0c040', marginTop: 2 }}>
                        {r.runPressure} Pressure · ×{r.gemMult.toFixed(2)}
                      </span>
                    )}
                  </span>
                  <span className="font-cinzel font-800" style={{ fontSize: '1.25rem', color: '#f2536a', textShadow: '0 0 14px rgba(220,38,38,0.7)' }}>+<CountUp to={r.earnedBloodGems} run={counting} /></span>
                </motion.div>
              )}
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
                className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: AC, marginTop: 12 }}>
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
                    : <span style={{ width: 42, fontSize: '1.9rem', lineHeight: 1, textAlign: 'center', flexShrink: 0 }}>{item.emoji}</span>}
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#e8c879' }}>Rare drop · equip from Manage Ship</p>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f5ecd6', lineHeight: 1.1 }}>{item.name}</p>
                    <p className="font-karla" style={{ fontSize: '0.66rem', color: '#b0aaa0', lineHeight: 1.35, marginTop: 1 }}>{item.description}</p>
                  </div>
                </motion.div>
              )
            })}

            {/* Man-o-War hull drops — the Golden Gauntlet Hull (deepest chest), the
                Hardcore-only Bad Blood Hull, and the Pitch Black Hull that only a
                heavy board can roll. Each gets its own colored card so the prestige
                drop lands. */}
            {[r.droppedSkinId, r.droppedHcSkinId, r.droppedPressureSkinId].filter((x): x is string => !!x).map((skinId, i) => {
              const skin = getShipSkin(skinId)
              if (!skin) return null
              return (
                <motion.div key={skinId} initial={{ opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.85 + i * 0.15, type: 'spring', stiffness: 260, damping: 18 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 10, padding: '0.7rem 0.8rem', borderRadius: 12, background: `${skin.color}18`, border: `1px solid ${skin.color}88`, boxShadow: `0 0 26px ${skin.color}33` }}>
                  {skin.imageByTier?.[6]
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={skin.imageByTier[6]} alt="" style={{ width: 46, height: 46, objectFit: 'contain', flexShrink: 0 }} />
                    : null}
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: skin.color }}>Rare hull · equip from Manage Ship</p>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f7efd8', lineHeight: 1.1 }}>{skin.name}</p>
                    <p className="font-karla" style={{ fontSize: '0.66rem', color: '#b0aaa0', lineHeight: 1.35, marginTop: 1 }}>{skin.description}</p>
                  </div>
                </motion.div>
              )
            })}

            {/* Depth-milestone unlocks earned by SURVIVING to this depth. Shown
                here, in the moment, instead of a piece of mail after the fact. */}
            {r.unlockedThisRun.map((u, i) => (
              <motion.div key={u.name} initial={{ opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.7 + i * 0.15, type: 'spring', stiffness: 260, damping: 18 }}
                style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 10, padding: '0.7rem 0.8rem', borderRadius: 12, background: `${AC}12`, border: `1px solid ${AC}55`, boxShadow: `0 0 22px ${AC}1c` }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={AC} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M7 11V7a5 5 0 0 1 10 0v4" /><rect x="3" y="11" width="18" height="11" rx="2" /></svg>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: AC }}>Depth unlocked · {u.where}</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#eaf5f2', lineHeight: 1.1 }}>{u.name}</p>
                  <p className="font-karla" style={{ fontSize: '0.66rem', color: '#a8b6b2', lineHeight: 1.35, marginTop: 1 }}>{u.blurb}</p>
                </div>
              </motion.div>
            ))}

            {counting && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.4 }}>
                <RunRecap depth={r.depth} shipsSunk={recap.shipsSunk} maxHit={recap.maxHit} boonTiers={recap.boonTiers} curseTiers={recap.curseTiers} confluencesTaken={recap.confluencesTaken} convergencesTaken={recap.convergencesTaken} stats={recap.stats} events={recap.events} contracts={recap.contracts} don={don} />
              </motion.div>
            )}

            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
              onClick={onBack} className="font-karla font-600 tap"
              style={{ marginTop: 18, width: '100%', padding: '0.85rem', borderRadius: 12, fontSize: '0.88rem', background: 'rgba(10,16,24,0.8)', border: '1px solid rgba(255,255,255,0.28)', color: '#e4ded2', cursor: 'pointer' }}>
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
function AbandonRunModal({ pot, hardcore = false, don, onStay, onAbandon }: { pot: number; hardcore?: boolean; don?: boolean; onStay: () => void; onAbandon: () => void }) {
  const AC = don ? KRAKEN : TEAL
  const CRIMSON = '#ef4444'
  return (
    <ModalScrim zIndex={1400} onClose={onStay}>
      <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 280, damping: 24 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 380, borderRadius: 18, background: 'linear-gradient(180deg, rgba(22,12,14,0.99), rgba(10,7,9,0.99))', border: `1px solid ${CRIMSON}44`, boxShadow: `0 0 44px ${CRIMSON}22, 0 18px 50px rgba(0,0,0,0.6)`, padding: '1.3rem 1.2rem 1.15rem', textAlign: 'center' }}>
        <p className="font-karla font-700 uppercase tracking-[0.24em]" style={{ fontSize: '0.52rem', color: `${CRIMSON}cc` }}>Abandon the Dive?</p>
        <p className="font-cinzel font-800" style={{ fontSize: '1.45rem', color: '#f3d6d6', lineHeight: 1.12, marginTop: 6 }}>
          {hardcore ? 'Abandon and Drown Them' : 'Leave Now and You Sink'}
        </p>
        <p className="font-karla" style={{ fontSize: '0.82rem', color: '#c9c3b8', lineHeight: 1.5, marginTop: 10 }}>
          {pot > 0
            ? <>Walk away from this run and the <strong style={{ color: '#e08a8a' }}>{fmt(pot)} ⟡</strong> you&apos;ve hauled up, along with the Nav XP and any depth unlocks, goes down with the ship. Nothing is banked until you cash out.</>
            : <>Walk away now and this descent is over for the day. Your one run is spent — there&apos;s no picking it back up.</>}
        </p>
        {hardcore && (
          <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#fca5a5', lineHeight: 1.5, marginTop: 10, padding: '0.7rem 0.8rem', borderRadius: 12, background: `${CRIMSON}14`, border: `1px solid ${CRIMSON}55` }}>
            This is a Hardcore run. Abandoning counts as a wipe — the squad you brought down here dies for good.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 18 }}>
          <button onClick={onStay} className="font-cinzel font-700 uppercase tracking-[0.07em] tap"
            style={{ width: '100%', padding: '0.85rem', borderRadius: 12, fontSize: '0.92rem', background: `${AC}29`, border: `1px solid ${AC}55`, color: AC, cursor: 'pointer' }}>
            Stay in the Fight
          </button>
          <button onClick={onAbandon} className="font-karla font-700 tap"
            style={{ width: '100%', padding: '0.6rem', borderRadius: 11, fontSize: '0.74rem', background: 'none', border: `1px solid ${CRIMSON}40`, color: `${CRIMSON}dd`, cursor: 'pointer' }}>
            {hardcore ? 'Abandon — drown my crew' : 'Abandon and lose it all'}
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
type RunEvent = { depth: number; kind: 'boon' | 'curse' | 'boss' | 'shrine' }

// ── Run ribbon — the dive's story as a depth strip ─────────────────────────
// One horizontal line from the surface to the run's deepest point, with the
// run's events stamped where they happened: boons above the line (teal),
// curses below it (crimson), bosses ON it (gold diamonds), shrine stops
// above (violet). Every dive leaves a different ribbon.
function RunRibbon({ events, depth }: { events: RunEvent[]; depth: number }) {
  if (depth < 3 || events.length === 0) return null
  const max = Math.max(depth, 1)
  const x = (d: number) => `${Math.min(100, Math.max(0, (d / max) * 100))}%`
  const ticks: number[] = []
  for (let t = 10; t < max; t += 10) ticks.push(t)
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.5rem', color: 'rgba(196,169,106,0.6)' }}>The Descent</p>
        <p className="font-cinzel font-700" style={{ fontSize: '0.58rem', color: 'rgba(196,169,106,0.7)' }}>0 → {depth}</p>
      </div>
      <div style={{ position: 'relative', height: 26 }}>
        {/* descent line + every-10 depth notches */}
        <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 2, borderRadius: 1, background: 'linear-gradient(90deg, rgba(196,169,106,0.5), rgba(196,169,106,0.2))' }} />
        {ticks.map(t => (
          <span key={t} aria-hidden style={{ position: 'absolute', left: x(t), top: 9, width: 1, height: 8, background: 'rgba(196,169,106,0.35)' }} />
        ))}
        {events.map((e, i) => e.kind === 'boss' ? (
          <span key={i} aria-hidden title={`Boss fell at depth ${e.depth}`} style={{ position: 'absolute', left: e.depth === 0 ? 0 : `calc(${x(e.depth)} - 4px)`, top: 9, width: 8, height: 8, background: '#f0c040', transform: 'rotate(45deg)', boxShadow: '0 0 6px rgba(240,192,64,0.6)' }} />
        ) : (
          <span key={i} aria-hidden style={{
            position: 'absolute', left: `calc(${x(e.depth)} - 2px)`,
            top: e.kind === 'curse' ? 18 : 4,
            width: 4.5, height: 4.5, borderRadius: '50%',
            background: e.kind === 'boon' ? '#5eead4' : e.kind === 'shrine' ? '#c084fc' : '#f87171',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 2 }}>
        {([['Boons', '#5eead4'], ['Curses', '#f87171'], ['Bosses', '#f0c040'], ['Shrine', '#c084fc']] as const).map(([label, c]) => (
          <span key={label} className="font-karla font-600" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.5rem', color: 'rgba(240,237,232,0.5)' }}>
            <span aria-hidden style={{ width: 4, height: 4, borderRadius: '50%', background: c }} /> {label}
          </span>
        ))}
      </div>
    </div>
  )
}

function RunRecap({ depth, shipsSunk, maxHit, boonTiers, curseTiers, confluencesTaken = [], convergencesTaken = [], stats, events, contracts = [], don }: {
  depth: number; shipsSunk: number; maxHit: number
  boonTiers: Record<string, number>; curseTiers: Record<string, number>; confluencesTaken?: string[]; convergencesTaken?: string[]; stats?: GauntletRunStats
  events?: RunEvent[]; contracts?: { name: string; reward: string }[]; don?: boolean
}) {
  const AC = don ? KRAKEN : TEAL
  const boons = Object.entries(boonTiers)
    .map(([id, tier]) => ({ fam: GAUNTLET_BOONS.find(b => b.id === id), tier }))
    .filter((x): x is { fam: NonNullable<typeof x.fam>; tier: number } => !!x.fam && x.tier >= 1)
  const curses = Object.entries(curseTiers)
    .map(([id, tier]) => ({ c: GAUNTLET_CURSES.find(c => c.id === id), tier }))
    .filter((x): x is { c: NonNullable<typeof x.c>; tier: number } => !!x.c && x.tier >= 1)
  const confs = activeConfluences(boonTiers, confluencesTaken)
  const convs = activeConvergences(boonTiers, confluencesTaken, convergencesTaken)
  const Stat = ({ label, value, color }: { label: string; value: string | number; color: string }) => (
    <div style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '0.62rem 0.35rem', borderRadius: 12, background: 'rgba(8,14,22,0.82)', border: '1px solid rgba(125,211,252,0.26)', textAlign: 'center', overflow: 'hidden' }}>
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
      {events && events.length > 0 && <RunRibbon events={events} depth={depth} />}
      <p className="font-karla font-800 uppercase tracking-[0.22em]" style={{ fontSize: '0.52rem', color: '#7e96a8', marginBottom: 9, textAlign: 'center' }}>The Dive</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <Stat label="Depth" value={depth} color={AC} />
        <Stat label="Ships Sunk" value={shipsSunk} color="#f4fbf9" />
        <Stat label="Biggest Hit" value={fmt(maxHit)} color={GOLD} />
      </div>
      {/* Combat telemetry — the fun run stats. Only when we actually logged a
          shot (old snapshots + zero-shot runs skip it cleanly). */}
      {stats && stats.shots > 0 && (
        <>
          <p className="font-karla font-800 uppercase tracking-[0.22em]" style={{ fontSize: '0.52rem', color: '#7e96a8', margin: '15px 0 9px', textAlign: 'center' }}>The Guns</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Stat label="Total Damage" value={fmt(stats.dmgDealt)} color="#fca5a5" />
            <Stat label="Crit Rate" value={`${Math.round((stats.crits / stats.shots) * 100)}%`} color={GOLD} />
            <Stat label="Shots Fired" value={fmt(stats.shots)} color="#f4fbf9" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Stat label="Dmg Taken" value={fmt(stats.dmgTaken)} color="#f87171" />
            <Stat label="Dmg Healed" value={fmt(stats.dmgHealed)} color="#4ade80" />
            <Stat label="Dmg Absorbed" value={fmt(stats.dmgAbsorbed)} color="#7dd3fc" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Stat label="Volleys" value={fmt(stats.volleys)} color={AC} />
            <Stat label="Dodges Slipped" value={fmt(stats.dodgesWon)} color="#38bdf8" />
            <Stat label="Dodges Failed" value={fmt(stats.dodgesLost)} color="#9a948a" />
          </div>
        </>
      )}
      {boons.length > 0 && (
        <Chips title={`Powers · ${boons.length}`} color={AC}
          items={boons.map(({ fam, tier }) => ({ key: fam.id, label: `${fam.name} ${boonTierLabel(tier)}`.trim(), rc: BOON_RARITY_META[boonRarity(fam)].color }))} />
      )}
      {contracts.length > 0 && (
        <Chips title={`Don's Jobs · ${contracts.length}`} color="#3fbf82"
          items={contracts.map((c, i) => ({ key: `${c.name}-${i}`, label: `${c.name} · ${c.reward}`, rc: '#3fbf82' }))} />
      )}
      {confs.length > 0 && (
        <Chips title={`Synergies · ${confs.length}`} color="#f5b94a"
          items={confs.map(c => ({ key: c.id, label: c.name, rc: '#f5b94a' }))} />
      )}
      {convs.length > 0 && (
        <Chips title={`Convergences · ${convs.length}`} color="#ff8a3d"
          items={convs.map(cv => ({ key: cv.id, label: cv.name, rc: '#ff8a3d' }))} />
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
function DeepestRunModal({ best, last, hardcore = false, don, onClose }: { best: GauntletRunSnapshot | null; last: GauntletRunSnapshot | null; hardcore?: boolean; don?: boolean; onClose: () => void }) {
  const AC = don ? KRAKEN : TEAL
  const accent = hardcore ? '#e0555a' : GOLD
  // Best vs Last toggle — only offered when a distinct last run exists (older
  // players have no last-run snapshot until their next cash-out).
  const hasBoth = !!best && !!last && best.at !== last.at
  const [tab, setTab] = useState<'best' | 'last'>('best')
  const run = (tab === 'best' ? best : last) ?? best ?? last
  if (!run) return null
  const boons = Object.entries(run.boons ?? {})
    .map(([id, tier]) => ({ fam: GAUNTLET_BOONS.find(b => b.id === id), tier }))
    .filter((x): x is { fam: NonNullable<typeof x.fam>; tier: number } => !!x.fam && x.tier >= 1)
  const curses = Object.entries(run.curses ?? {})
    .map(([id, tier]) => ({ c: GAUNTLET_CURSES.find(c => c.id === id), tier }))
    .filter((x): x is { c: NonNullable<typeof x.c>; tier: number } => !!x.c && x.tier >= 1)
  const tides = (run.tides ?? []).filter(t => t && t.title)
  const contracts = run.contracts ?? []

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
        style={{ position: 'relative', width: '100%', maxWidth: 440, maxHeight: '86vh', overflowY: 'auto', borderRadius: 18, background: 'linear-gradient(180deg, rgba(14,22,34,0.99), rgba(7,13,22,0.99))', border: `1px solid ${accent}3a`, boxShadow: `0 0 44px ${accent}1f, 0 18px 50px rgba(0,0,0,0.6)`, padding: '1.3rem 1.15rem 1.2rem', textAlign: 'center' }}>
        {/* Close — X at the top-right */}
        <button onClick={onClose} aria-label="Close" className="tap"
          style={{ position: 'absolute', top: 10, right: 10, zIndex: 3, width: 30, height: 30, borderRadius: '50%', padding: 0, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.16)', color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
        {/* Hero — a trophy header, not a bare number. Anchor (depth), not a
            descend chevron — this is a record view, not an action. */}
        <div style={{ width: 50, height: 50, margin: '0 auto 8px', borderRadius: '50%', background: `${accent}1c`, border: `1px solid ${accent}5c`, boxShadow: `0 0 22px ${accent}2a`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="5" r="2.4" /><path d="M12 7.4V21" /><path d="M5 13H3a9 9 0 0 0 18 0h-2" /><path d="M8 11h8" /></svg>
        </div>
        <p className="font-karla font-800 uppercase tracking-[0.24em]" style={{ fontSize: '0.54rem', color: `${accent}cc` }}>Your {tab === 'best' ? 'Deepest' : 'Last'} {hardcore ? 'Hardcore ' : ''}Dive</p>
        <p className="font-cinzel font-800" style={{ fontSize: '2.3rem', color: accent, lineHeight: 1.02, marginTop: 3, textShadow: `0 0 26px ${accent}44` }}>
          Depth {run.depth}
        </p>
        {/* Best / Last toggle */}
        {hasBoth && (
          <div style={{ display: 'inline-flex', gap: 4, marginTop: 10, padding: 3, borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
            {([['best', 'Deepest'], ['last', 'Last']] as const).map(([val, label]) => {
              const on = tab === val
              return (
                <button key={val} type="button" onClick={() => { vibrate([0, 10]); setTab(val) }} className="tap"
                  style={{ padding: '0.28rem 0.85rem', borderRadius: 999, border: 'none', cursor: 'pointer', background: on ? `${accent}26` : 'transparent' }}>
                  <span className="font-karla font-800 uppercase tracking-[0.1em]" style={{ fontSize: '0.55rem', color: on ? accent : '#8a857c' }}>{label}</span>
                </button>
              )
            })}
          </div>
        )}
        {/* Stat strip — the run at a glance */}
        <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 6, marginTop: 11 }}>
          {([
            { n: boons.length, label: 'Powers', color: AC },
            { n: curses.length, label: 'Curses', color: '#f87171' },
            { n: tides.length,  label: 'Tides',  color: '#bae6fd' },
          ] as const).filter(s => s.n > 0).map(s => (
            <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.24rem 0.62rem', borderRadius: 999, background: `${s.color}14`, border: `1px solid ${s.color}33` }}>
              <span className="font-cinzel font-800" style={{ fontSize: '0.74rem', color: s.color, lineHeight: 1 }}>{s.n}</span>
              <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.1em', color: `${s.color}cc` }}>{s.label}</span>
            </span>
          ))}
        </div>

        {/* The Guns — the combat telemetry, from the stored snapshot. */}
        {(() => {
          const st = coerceRunStats(run.stats)
          if (st.shots <= 0) return null
          const cells = [
            { label: 'Biggest Hit', value: fmt(st.highestHit), color: GOLD },
            { label: 'Total Damage', value: fmt(st.dmgDealt), color: '#fca5a5' },
            { label: 'Crit Rate', value: `${Math.round((st.crits / st.shots) * 100)}%`, color: GOLD },
            { label: 'Shots Fired', value: fmt(st.shots), color: '#f4fbf9' },
            { label: 'Dmg Taken', value: fmt(st.dmgTaken), color: '#f87171' },
            { label: 'Dmg Healed', value: fmt(st.dmgHealed), color: '#4ade80' },
            { label: 'Dmg Absorbed', value: fmt(st.dmgAbsorbed), color: '#7dd3fc' },
            { label: 'Dodges', value: `${fmt(st.dodgesWon)}/${fmt(st.dodgesWon + st.dodgesLost)}`, color: '#38bdf8' },
          ]
          return (
            <Section title="The Guns" color={GOLD}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                {cells.map(c => (
                  <div key={c.label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, padding: '0.5rem 0.65rem', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.05em', color: '#84939f' }}>{c.label}</span>
                    <span className="font-cinzel font-800" style={{ fontSize: '0.85rem', color: c.color, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{c.value}</span>
                  </div>
                ))}
              </div>
            </Section>
          )
        })()}

        {boons.length > 0 && (
          <Section title="Powers" color={AC}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {boons.map(({ fam, tier }) => {
                const t = fam.tiers[Math.min(tier, fam.tiers.length) - 1]
                const meta = BOON_RARITY_META[boonRarity(fam)]
                const rc = meta.color
                return (
                  <div key={fam.id} style={{ display: 'flex', flexDirection: 'column', padding: '0.6rem 0.62rem', borderRadius: 12, background: `${rc}12`, border: `1px solid ${rc}3a`, borderTop: `2.5px solid ${rc}`, textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 7 }}>
                      <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 7, background: `${rc}22`, border: `1px solid ${rc}55`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill={rc} stroke="none" aria-hidden><path d="M12 2l2.3 6.9L21 11l-6.7 2.1L12 20l-2.3-6.9L3 11l6.7-2.1z" /></svg>
                      </div>
                      <span className="font-karla font-800 uppercase" style={{ fontSize: '0.42rem', letterSpacing: '0.06em', color: rc, background: `${rc}1e`, border: `1px solid ${rc}44`, borderRadius: 999, padding: '0.12rem 0.42rem', whiteSpace: 'nowrap' }}>{meta.label}{tier > 1 ? ` ${boonTierLabel(tier)}` : ''}</span>
                    </div>
                    <span className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#f4fbf9', lineHeight: 1.15 }}>{fam.name}</span>
                    <span className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#9fbdb5', marginTop: 3, lineHeight: 1.35 }}>{t?.desc}</span>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {contracts.length > 0 && (
          <Section title="Don's Jobs" color="#3fbf82">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {contracts.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: '0.5rem 0.65rem', borderRadius: 10, background: 'rgba(63,191,130,0.08)', border: '1px solid rgba(63,191,130,0.28)' }}>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#e6e1d6' }}>{c.name}</span>
                  <span className="font-karla font-700" style={{ flexShrink: 0, fontSize: '0.72rem', color: '#8ff0bd' }}>▲ {c.reward}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {curses.length > 0 && (
          <Section title="Curses" color="#f87171">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {curses.map(({ c, tier }) => {
                const t = c.tiers[Math.min(tier, c.tiers.length) - 1]
                const label = curseTierLabel(tier)
                const rc = '#f87171'
                return (
                  <div key={c.id} style={{ display: 'flex', flexDirection: 'column', padding: '0.6rem 0.62rem', borderRadius: 12, background: `${rc}12`, border: `1px solid ${rc}3a`, borderTop: `2.5px solid ${rc}`, textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 7 }}>
                      <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 7, background: `${rc}22`, border: `1px solid ${rc}55`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={rc} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3a7 7 0 0 0-7 7v3.4c0 .9.6 1.7 1.5 2l.5.2V19a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3.4l.5-.2c.9-.3 1.5-1.1 1.5-2V10a7 7 0 0 0-7-7Z" /><circle cx="9" cy="11" r="1.2" fill={rc} stroke="none" /><circle cx="15" cy="11" r="1.2" fill={rc} stroke="none" /></svg>
                      </div>
                      {label && <span className="font-karla font-800 uppercase" style={{ fontSize: '0.42rem', letterSpacing: '0.06em', color: rc, background: `${rc}1e`, border: `1px solid ${rc}44`, borderRadius: 999, padding: '0.12rem 0.42rem', whiteSpace: 'nowrap' }}>{label}</span>}
                    </div>
                    <span className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#fdecec', lineHeight: 1.15 }}>{c.name}</span>
                    <span className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#d99', marginTop: 3, lineHeight: 1.35 }}>{t?.desc}</span>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {tides.length > 0 && (
          <Section title="Tides" color="#bae6fd">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {tides.map((t, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', padding: '0.6rem 0.62rem', borderRadius: 12, background: 'rgba(125,211,252,0.08)', border: '1px solid rgba(125,211,252,0.26)', borderTop: '2.5px solid rgba(125,211,252,0.6)', textAlign: 'left' }}>
                  <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 7, background: 'rgba(125,211,252,0.16)', border: '1px solid rgba(125,211,252,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 7 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#bae6fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0" /><path d="M3 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0" /></svg>
                  </div>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: '#cbe9f8', lineHeight: 1.18 }}>{t.title}</span>
                  <span className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#8fb6c8', marginTop: 3, lineHeight: 1.35 }}><span style={{ color: '#6f93a4' }}>Chose: </span>{t.choice}</span>
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
      </motion.div>
    </ModalScrim>
  )
}

// "What's down there" — a popup on the intro so a player can see the chest
// ladder, a rough doubloon/XP estimate for their reach, and the named-item chase
// BEFORE committing a descent (and burning the cooldown).
// Synergies codex — the confluence pairs, with DISCOVERY FOG: an unfound pair
// shows as a silhouetted "undiscovered" row (no name, boons, or effect), and
// reveals permanently the first time you unlock it in a dive. The chase is the
// point — you find them by experimenting, then they stay in your codex.
// ── Synergy codex visuals ────────────────────────────────────────────────────
// Boons and synergies carry no art, so give each boon a rarity-bordered TOKEN
// with a category glyph read off its primary effect. The codex then reads as a
// board of visual recipes — two component tokens fusing into a synergy — the way
// the Abyssal Forge shows components, instead of a wall of text.
type BoonCat = 'offense' | 'defense' | 'support' | 'control' | 'fortune'
function boonCategory(boonId: string): BoonCat {
  const b = GAUNTLET_BOONS.find(x => x.id === boonId)
  const k = (b?.tiers?.[0]?.effect?.kind ?? '').toLowerCase()
  if (/heal|lifesteal|tithe|regen|cleanse/.test(k)) return 'support'
  if (/doubloon|plunder|loot|bounty|gold|fathom|favor|salvage|abyss/.test(k)) return 'fortune'
  if (/freeze|ice|cold|perma|confuse|blackout|fog|decoy|chain|rattl|slow|stun|steal|hide|flare/.test(k)) return 'control'
  if (/hull|shield|armor|incoming|dodge|block|fortress|bulwark|mitigat|parry|barrier|maxhp|counter|reinforc|deep|riposte/.test(k)) return 'defense'
  return 'offense'
}
const BOON_CAT_GLYPH: Record<BoonCat, { color: string; d: string }> = {
  offense: { color: '#ff8a5c', d: 'M12 2l2.6 6.8L21.5 11l-6.9 2.2L12 20l-2.6-6.8L2.5 11l6.9-2.2z' }, // spark
  defense: { color: '#5fa8e0', d: 'M12 2.5l7.5 3.2v5.1c0 4.6-3.2 8-7.5 9.4-4.3-1.4-7.5-4.8-7.5-9.4V5.7z' }, // shield
  support: { color: '#7fd49a', d: 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z' }, // cross
  control: { color: '#7ecbff', d: 'M13 2L4 14h6l-1 8 9-12h-6z' }, // bolt
  fortune: { color: '#f0c040', d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2z' }, // coin ring
}
function BoonGlyph({ cat, size }: { cat: BoonCat; size: number }) {
  const g = BOON_CAT_GLYPH[cat]
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={g.color} aria-hidden style={{ filter: `drop-shadow(0 0 2px ${g.color}88)` }}><path d={g.d} /></svg>
}
function BoonToken({ boonId, tier = 0, held, full, size = 32 }: { boonId: string; tier?: number; held?: boolean; full?: boolean; size?: number }) {
  const b = GAUNTLET_BOONS.find(x => x.id === boonId)
  const rc = b ? BOON_RARITY_META[boonRarity(b)].color : '#8894a6'
  // `full` = show it lit regardless of holdings (the Codex is a catalogue, not
  // your current build, so it's never ghosted). `held` is the This-Run state.
  const lit = held || full
  const tierPip = held && tier > 0
    ? <span className="font-cinzel font-800" style={{ position: 'absolute', bottom: -5, right: -5, minWidth: 13, height: 13, padding: '0 2px', borderRadius: 7, background: rc, color: '#0a0e14', fontSize: '0.5rem', lineHeight: '13px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.55)' }}>{['', 'I', 'II', 'III'][Math.min(tier, 3)]}</span>
    : null
  // With real art, the icon floats free like the forge board — no chip frame.
  if (b?.image) {
    return (
      <span style={{ position: 'relative', flexShrink: 0, width: size, height: size, display: 'grid', placeItems: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={b.image} alt="" loading="lazy" decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: lit ? 1 : 0.5, filter: lit ? 'none' : 'grayscale(0.85)' }} />
        {tierPip}
      </span>
    )
  }
  // The category glyph keeps its framed chip so the small mark still reads.
  return (
    <span style={{ position: 'relative', flexShrink: 0, width: size, height: size, borderRadius: size * 0.26, display: 'grid', placeItems: 'center',
      background: lit ? `${rc}22` : 'rgba(255,255,255,0.03)',
      border: `1.5px ${lit ? 'solid' : 'dashed'} ${lit ? rc : 'rgba(255,255,255,0.2)'}`,
      boxShadow: lit ? `0 0 8px ${rc}44, inset 0 0 8px ${rc}1a` : 'none', opacity: lit ? 1 : 0.6 }}>
      <BoonGlyph cat={boonCategory(boonId)} size={Math.round(size * 0.5)} />
      {tierPip}
    </span>
  )
}
// A hexagon crest — a synergy shown as a component of a convergence, or the
// result identity in a detail header.
function MiniCrest({ size = 32, color, dim, image }: { size?: number; color: string; dim?: boolean; image?: string | null }) {
  const c = dim ? '#5a6472' : color
  // With real art, the crest floats free like the boon tokens — no hex frame.
  if (image) {
    return (
      <span style={{ position: 'relative', flexShrink: 0, width: size, height: size, display: 'grid', placeItems: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" loading="lazy" decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: dim ? 0.5 : 1, filter: dim ? 'grayscale(0.85)' : 'none' }} />
      </span>
    )
  }
  // Fallback: the hex spark crest for synergies without art yet.
  return (
    <span style={{ position: 'relative', flexShrink: 0, width: size, height: size, display: 'grid', placeItems: 'center' }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill={`${c}1e`} stroke={c} strokeWidth="1.4" style={{ filter: dim ? 'none' : `drop-shadow(0 0 4px ${c}77)` }}><path d="M12 2 4 7v10l8 5 8-5V7z" /></svg>
      <svg width={Math.round(size * 0.4)} height={Math.round(size * 0.4)} viewBox="0 0 24 24" fill={c} aria-hidden style={{ position: 'absolute' }}><path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" /></svg>
    </span>
  )
}
function MysteryToken({ size = 32 }: { size?: number }) {
  return (
    <span style={{ flexShrink: 0, width: size, height: size, borderRadius: size * 0.26, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.02)', border: '1.5px dashed rgba(255,255,255,0.16)' }}>
      <span className="font-cinzel font-800" style={{ color: '#6b7280', fontSize: size * 0.42 }}>?</span>
    </span>
  )
}

function SynergiesModal({ owned, seen = [], taken = [], takenConv = [], variant = 'davy', activeRun = true, onClose }: { owned: Record<string, number>; seen?: string[]; taken?: string[]; takenConv?: string[]; variant?: GauntletVariant; activeRun?: boolean; onClose: () => void }) {
  const GLD = '#f5b94a'   // active
  const SYN = '#b98bff'   // ready (both halves held, not yet drafted)
  const NEED = '#5fa8c7'  // one away (hold one half)
  const takenSet = new Set(taken)
  const takenConvSet = new Set(takenConv)
  const ROMAN = ['', 'I', 'II', 'III']
  type Status = 'active' | 'ready' | 'need1'
  const RANK: Record<Status, number> = { active: 0, ready: 1, need1: 2 }
  const accentOf = (s: Status) => (s === 'active' ? GLD : s === 'ready' ? SYN : NEED)
  const held = (id: string) => (owned[id] ?? 0) >= 1

  const boonMeta = (id: string) => {
    const b = GAUNTLET_BOONS.find(x => x.id === id)
    return { id, name: b?.name ?? id, color: b ? BOON_RARITY_META[boonRarity(b)].color : '#8894a6', tier: owned[id] ?? 0 }
  }

  // ── Confluences (boon + boon) in reach: hold at least one half. ──────────────
  const confRows = CONFLUENCES.filter(c => inGauntletPool(c.gauntlet, variant)).map(c => {
    const parts = c.requires.map(r => boonMeta(r.boonId))
    const heldCount = parts.filter(p => p.tier >= 1).length
    const lvl = confluenceLevel(c, owned)
    const on = takenSet.has(c.id) && lvl >= 1
    const status: Status | null = on ? 'active' : lvl >= 1 ? 'ready' : heldCount === 1 ? 'need1' : null
    return { c, parts, lvl, status }
  }).filter((r): r is typeof r & { status: Status } => r.status !== null)
  confRows.sort((a, b) => RANK[a.status] - RANK[b.status] || a.c.name.localeCompare(b.c.name))

  // ── Convergences (synergy + synergy) — Don's meta-tier. In reach if one of the
  // two component confluences is already online. ─────────────────────────────
  const convRows = CONVERGENCES.filter(cv => inGauntletPool(cv.gauntlet, variant)).map(cv => {
    const parts = cv.requires.map(r => {
      const c = CONFLUENCES.find(x => x.id === r.confluenceId)
      const online = !!c && takenSet.has(c.id) && confluenceLevel(c, owned) >= 1
      return { id: r.confluenceId, name: c?.name ?? r.confluenceId, online, boonIds: c ? c.requires.map(x => x.boonId) : [] }
    })
    const onlineCount = parts.filter(p => p.online).length
    const lvl = convergenceLevel(cv, owned, taken)
    const on = takenConvSet.has(cv.id) && lvl >= 1
    const status: Status | null = on ? 'active' : lvl >= 1 ? 'ready' : onlineCount === 1 ? 'need1' : null
    return { cv, parts, lvl, status }
  }).filter((r): r is typeof r & { status: Status } => r.status !== null)
  convRows.sort((a, b) => RANK[a.status] - RANK[b.status] || a.cv.name.localeCompare(b.cv.name))

  const counts = { active: 0, ready: 0, need1: 0 }
  for (const r of [...confRows, ...convRows]) counts[r.status]++
  const anyRows = confRows.length + convRows.length > 0

  // ── Trace: tap a held boon to light every synergy it feeds. ─────────────────
  const [trace, setTrace] = useState<string | null>(null)
  const traceBoons = Array.from(new Set(confRows.flatMap(r => r.parts).filter(p => p.tier >= 1).map(p => p.id)))
    .map(boonMeta)
    .sort((a, b) => a.name.localeCompare(b.name))
  const confMatchesTrace = (r: (typeof confRows)[number]) => !trace || r.parts.some(p => p.id === trace)
  const convMatchesTrace = (r: (typeof convRows)[number]) => !trace || r.parts.some(p => p.boonIds.includes(trace))

  // ── Codex — the full catalog across runs. A "This Run / Codex" toggle switches
  // between the personalized tree above and this reference view. Discovered
  // entries (seen in a past run, or qualifying right now) read in full; the rest
  // are locked silhouettes. Confluence discovery is persisted (gauntlet_confluences_seen);
  // convergences have no store, so they reveal once BOTH their synergies are known.
  // No active run (opened from the gauntlet home) → there's no "This Run" build
  // to show, so it's Codex-only.
  const [view, setView] = useState<'run' | 'codex'>(activeRun ? 'run' : 'codex')
  // Tapped medallion → its detail sheet (a confluence OR convergence id).
  const [openId, setOpenId] = useState<string | null>(null)
  const seenSet = new Set(seen)
  const codexConf = CONFLUENCES.filter(c => inGauntletPool(c.gauntlet, variant)).map(c => {
    const lvl = confluenceLevel(c, owned)
    const discovered = seenSet.has(c.id) || lvl >= 1
    const activeNow = takenSet.has(c.id) && lvl >= 1
    return { c, lvl, discovered, activeNow }
  }).sort((a, b) => Number(b.discovered) - Number(a.discovered) || Number(b.activeNow) - Number(a.activeNow) || a.c.name.localeCompare(b.c.name))
  const codexConv = CONVERGENCES.filter(cv => inGauntletPool(cv.gauntlet, variant)).map(cv => {
    const lvl = convergenceLevel(cv, owned, taken)
    const discovered = lvl >= 1 || cv.requires.every(r => seenSet.has(r.confluenceId))
    const activeNow = takenConvSet.has(cv.id) && lvl >= 1
    return { cv, lvl, discovered, activeNow }
  }).sort((a, b) => Number(b.discovered) - Number(a.discovered) || Number(b.activeNow) - Number(a.activeNow) || a.cv.name.localeCompare(b.cv.name))
  const codexTotal = codexConf.length + codexConv.length
  const codexFound = codexConf.filter(e => e.discovered).length + codexConv.filter(e => e.discovered).length

  const Pips = ({ level, color, max = 3 }: { level: number; color: string; max?: number }) => (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', flexShrink: 0 }} aria-hidden>
      {Array.from({ length: max }, (_, i) => i + 1).map(n => (
        <span key={n} style={{ width: 7, height: 7, transform: 'rotate(45deg)', borderRadius: 1, background: n <= level ? color : 'transparent', border: `1px solid ${n <= level ? color : 'rgba(255,255,255,0.22)'}`, boxShadow: n <= level ? `0 0 6px ${color}bb` : 'none' }} />
      ))}
    </span>
  )
  // The diamonds are a synergy's POWER LEVEL (I–III). Once it's online we show the
  // filled level + "Lv N"; before that the empty diamonds read as a mystery
  // rating, so we say the ceiling in plain words instead ("Up to Lv III").
  // Level readout — pips + "Lv N" once it's actually online. Below that it shows
  // nothing at all: an un-held synergy has no level, and spelling out its
  // ceiling on every tile was clutter.
  const LevelReadout = ({ level, max, color }: { level: number; max: number; color: string }) =>
    level >= 1 ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <Pips level={level} color={color} max={max} />
        <span className="font-karla font-800 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.08em', color, whiteSpace: 'nowrap' }}>Lv {ROMAN[Math.min(level, max)]}</span>
      </span>
    ) : null

  const Fuse = () => <span aria-hidden style={{ color: '#7a8e8a', fontSize: '0.72rem' }}>⊕</span>

  // One medallion — two component tokens fusing, the synergy name, and a compact
  // state footer. Everything else (effect, how-it-works, flavor) waits behind a tap.
  const SynergyMedallion = ({ name, status, lvl, accent, dim, onOpen, tokens, kraken }: { name: string; status: Status | 'codex'; lvl: number; accent: string; dim?: boolean; onOpen: () => void; tokens: React.ReactNode; kraken?: boolean }) => {
    const activeBg = kraken ? `${KRAKEN}1c` : `${GLD}16`
    const activeBorder = kraken ? `${KRAKEN}66` : `${GLD}66`
    return (
      <button type="button" onClick={onOpen} className="tap" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '0.75rem 0.5rem 0.65rem', borderRadius: 14, cursor: 'pointer', minWidth: 0, position: 'relative', overflow: 'hidden',
        opacity: dim ? 0.4 : 1, transition: 'opacity 0.2s',
        background: status === 'active' ? activeBg : status === 'ready' ? `${SYN}10` : 'rgba(255,255,255,0.03)',
        border: `1px solid ${status === 'active' ? activeBorder : status === 'ready' ? `${SYN}4a` : status === 'need1' ? `${NEED}30` : 'rgba(255,255,255,0.09)'}`,
        boxShadow: status === 'active' ? `0 0 18px ${accent}22` : 'none' }}>
        {status === 'active' && (
          <motion.span aria-hidden initial={{ x: '-130%' }} animate={{ x: '190%' }} transition={{ duration: 3.6, repeat: Infinity, repeatDelay: 2.6, ease: 'easeInOut' }}
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '40%', background: `linear-gradient(100deg, transparent, ${accent}26, transparent)`, pointerEvents: 'none' }} />
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{tokens}</span>
        <span className="font-cinzel font-800" style={{ fontSize: '0.8rem', lineHeight: 1.12, textAlign: 'center', color: status === 'active' ? (kraken ? '#f0d7ff' : '#fbe7c4') : '#e4ebf2', minHeight: '1.9rem', display: 'flex', alignItems: 'center' }}>{name}</span>
        {status === 'need1'
          ? <span className="font-karla font-800 uppercase" style={{ fontSize: '0.48rem', letterSpacing: '0.1em', color: NEED }}>Need 1 more</span>
          : status === 'codex'
            ? <LevelReadout level={lvl} max={3} color={accent} />
            : <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><LevelReadout level={lvl} max={3} color={accent} /><span className="font-karla font-800 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.1em', color: accent }}>{status === 'active' ? 'Active' : 'Ready'}</span></span>}
      </button>
    )
  }

  // Locked codex entry — a silhouette medallion teasing an undiscovered synergy.
  const MysteryMedallion = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '0.75rem 0.5rem 0.65rem', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.12)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><MysteryToken size={52} /></span>
      <span className="font-cinzel font-800" style={{ fontSize: '0.8rem', color: '#7d8794', letterSpacing: '0.12em', minHeight: '1.9rem', display: 'flex', alignItems: 'center' }}>? ? ?</span>
      <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.08em', color: '#6b7280' }}>Undiscovered</span>
    </div>
  )

  return (
    <ModalScrim zIndex={1300} onClose={onClose}>
      {/* Open with opacity + a small translate only — no scale. Scaling this
          card re-rasterizes its whole (art-heavy) subtree every frame, which
          was the open-stutter. */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 440, maxHeight: '86vh', overflowY: 'auto', borderRadius: 18, background: 'linear-gradient(180deg, rgba(14,22,34,0.99), rgba(7,13,22,0.99))', border: `1px solid ${GLD}3a`, boxShadow: `0 0 44px ${GLD}1f, 0 18px 50px rgba(0,0,0,0.6)`, padding: '1.3rem 1.15rem 1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <p className="font-karla font-700 uppercase tracking-[0.24em]" style={{ fontSize: '0.52rem', color: `${GLD}cc` }}>{view === 'run' ? 'Your Build' : 'The Codex'}</p>
            <p className="font-cinzel font-800" style={{ fontSize: '1.4rem', color: '#eafffb', lineHeight: 1.1, marginTop: 3 }}>{view === 'run' ? 'Synergy Tree' : 'All Synergies'}</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', padding: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* This Run (personalized tree) vs Codex (the full catalogue). The tab
            only appears mid-run — from the home there's no build to show. */}
        {activeRun && (
          <div style={{ display: 'flex', gap: 4, marginTop: 12, padding: 4, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
            {([['run', 'This Run'], ['codex', 'Codex']] as ['run' | 'codex', string][]).map(([v, label]) => {
              const on = view === v
              return (
                <button key={v} onClick={() => setView(v)} className="font-karla font-800 uppercase tracking-[0.08em] tap"
                  style={{ flex: 1, padding: '0.5rem 0', borderRadius: 9, fontSize: '0.62rem', cursor: 'pointer', border: `1px solid ${on ? `${GLD}66` : 'transparent'}`, background: on ? `linear-gradient(180deg, ${GLD}26, ${GLD}0c)` : 'transparent', color: on ? '#f4d79a' : '#8f97a2' }}>
                  {label}
                </button>
              )
            })}
          </div>
        )}

        {/* Status legend / count summary — what's shown, at a glance. */}
        {view === 'run' && anyRows && (
          <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
            {([['active', 'Active'], ['ready', 'Ready'], ['need1', 'One away']] as [Status, string][]).map(([k, label]) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.56rem', padding: '0.22rem 0.5rem', borderRadius: 999, background: `${accentOf(k)}12`, border: `1px solid ${accentOf(k)}3a` }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: accentOf(k) }} />
                <span className="font-karla font-800" style={{ color: accentOf(k) }}>{counts[k]}</span>
                <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ color: '#8f97a2', fontSize: '0.5rem' }}>{label}</span>
              </span>
            ))}
          </div>
        )}


        {/* Trace strip — tap a boon you hold to light every synergy it feeds. */}
        {view === 'run' && traceBoons.length > 1 && (
          <div style={{ marginTop: 13 }}>
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.5rem', color: '#9a948a', marginBottom: 6 }}>
              {trace ? 'Tracing — tap again to clear' : 'Tap a boon to trace it'}
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {traceBoons.map(b => {
                const lit = trace === b.id
                return (
                  <button key={b.id} onClick={() => setTrace(lit ? null : b.id)} className="font-karla font-700 tap" style={{
                    fontSize: '0.66rem', borderRadius: 999, padding: '0.24rem 0.6rem', cursor: 'pointer',
                    color: b.color,
                    background: lit ? `${b.color}2e` : `${b.color}12`,
                    border: `1px solid ${b.color}${lit ? 'aa' : '44'}`,
                    boxShadow: lit ? `0 0 12px ${b.color}66` : 'none',
                    opacity: trace && !lit ? 0.5 : 1,
                  }}>
                    {b.name}<span style={{ opacity: 0.7 }}> {ROMAN[Math.min(b.tier, 3)]}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {view === 'run' && (<>
        {confRows.length > 0 && (
          <p className="font-karla font-800 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: '#8f97a2', marginTop: 15, marginBottom: 8 }}>Synergies</p>
        )}
        {confRows.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 9 }}>
            {confRows.map(({ c, parts, lvl, status }) => (
              <SynergyMedallion key={c.id} name={c.name} status={status} lvl={lvl} accent={accentOf(status)}
                dim={!confMatchesTrace({ c, parts, lvl, status })} onOpen={() => setOpenId(c.id)}
                tokens={<MiniCrest color={accentOf(status)} size={52} image={c.image} />} />
            ))}
          </div>
        )}

        {convRows.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 16, marginBottom: 8 }}>
              <p className="font-karla font-800 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: KRAKEN }}>Convergences</p>
              <span className="font-karla" style={{ fontSize: '0.5rem', color: '#7c8794' }}>two synergies fused</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 9 }}>
              {convRows.map(({ cv, parts, lvl, status }) => (
                <SynergyMedallion key={cv.id} name={cv.name} status={status} lvl={lvl} kraken
                  accent={status === 'active' ? KRAKEN : status === 'ready' ? SYN : NEED}
                  dim={!convMatchesTrace({ cv, parts, lvl, status })} onOpen={() => setOpenId(cv.id)}
                  tokens={<MiniCrest color={KRAKEN} size={52} image={cv.image} />} />
              ))}
            </div>
          </>
        )}

        {!anyRows && (
          <div style={{ marginTop: 16, borderRadius: 14, padding: '1.4rem 1rem', textAlign: 'center', background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.14)' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#c8d0da' }}>No synergies in reach yet</p>
            <p className="font-karla" style={{ fontSize: '0.72rem', color: '#8a94a0', lineHeight: 1.5, marginTop: 6 }}>Draft a couple of boons that pair up and the synergies they can form will appear here — even the ones you&apos;re still one boon short of.</p>
          </div>
        )}

        <p className="font-karla" style={{ fontSize: '0.6rem', color: '#5f6875', textAlign: 'center', lineHeight: 1.5, marginTop: 14 }}>
          Tap a synergy to see how it works. Switch to the Codex for the full catalogue.
        </p>
        </>)}

        {/* ── CODEX — the full catalogue across runs. Discovered entries read in
             full; the rest are locked silhouettes you reveal by drafting them. ── */}
        {view === 'codex' && (
          <>
            <div style={{ marginTop: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                <span className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: '#9a948a' }}>Discovered</span>
                <span className="font-cinzel font-800" style={{ fontSize: '0.76rem', color: GLD }}>{codexFound}<span style={{ color: 'rgba(255,255,255,0.32)' }}> / {codexTotal}</span></span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.round((codexFound / (codexTotal || 1)) * 100)}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
                  style={{ height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${GLD}, #ffe6a8)`, boxShadow: `0 0 10px ${GLD}88` }} />
              </div>
            </div>

            <p className="font-karla font-800 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: '#8f97a2', marginTop: 15, marginBottom: 8 }}>Synergies</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 9 }}>
              {codexConf.map(({ c, lvl, discovered, activeNow }) => {
                if (!discovered) return <MysteryMedallion key={c.id} />
                return (
                  <SynergyMedallion key={c.id} name={c.name} status={activeNow ? 'active' : 'codex'} lvl={lvl} accent={activeNow ? GLD : '#9aa7b4'} onOpen={() => setOpenId(c.id)}
                    tokens={<MiniCrest color={activeNow ? GLD : '#9aa7b4'} size={52} image={c.image} />} />
                )
              })}
            </div>

            {codexConv.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 16, marginBottom: 2 }}>
                  <p className="font-karla font-800 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: KRAKEN }}>Convergences</p>
                  <span className="font-karla" style={{ fontSize: '0.5rem', color: '#7c8794' }}>two synergies fused</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 9 }}>
                  {codexConv.map(({ cv, lvl, discovered, activeNow }) => {
                    if (!discovered) return <MysteryMedallion key={cv.id} />
                    return (
                      <SynergyMedallion key={cv.id} name={cv.name} status={activeNow ? 'active' : 'codex'} lvl={lvl} accent={activeNow ? KRAKEN : '#9aa7b4'} kraken onOpen={() => setOpenId(cv.id)}
                        tokens={<MiniCrest color={activeNow ? KRAKEN : '#9aa7b4'} size={52} image={cv.image} />} />
                    )
                  })}
                </div>
              </>
            )}

            <p className="font-karla" style={{ fontSize: '0.6rem', color: '#5f6875', textAlign: 'center', lineHeight: 1.5, marginTop: 14 }}>
              The full catalogue for this Gauntlet. Locked entries reveal the first time you draft them in a dive.
            </p>
          </>
        )}

        {/* ── Detail sheet — the recipe + everything it does, one tap deep. Portaled
             to body so the modal's transform can't trap its fixed positioning. ── */}
        {openId && (() => {
          const oc = CONFLUENCES.find(c => c.id === openId)
          const ov = oc ? null : CONVERGENCES.find(cv => cv.id === openId)
          if (!oc && !ov) return null
          const close = () => setOpenId(null)

          // Normalise both kinds into one shape the sheet renders.
          let name: string, accent: string, lvl: number, maxLvl: number, effectStr: string, detailStr: string, flavorStr: string, stateLabel: string, hint: string
          let comps: { node: React.ReactNode; name: string; held: boolean }[]
          let headTokens: React.ReactNode
          let resultImage: string | null | undefined

          if (oc) {
            const parts = oc.requires.map(r => boonMeta(r.boonId))
            lvl = confluenceLevel(oc, owned)
            const on = takenSet.has(oc.id) && lvl >= 1
            const ready = !on && lvl >= 1
            const need1 = !on && lvl < 1 && parts.some(p => p.tier >= 1)
            accent = on ? GLD : ready ? SYN : need1 ? NEED : '#9aa7b4'
            maxLvl = oc.levels.length
            name = oc.name; effectStr = confluenceDescAt(oc, Math.max(1, lvl)); detailStr = oc.detail; flavorStr = oc.flavor
            stateLabel = on ? 'Active' : ready ? 'Ready to draft' : need1 ? 'One boon away' : 'Not held'
            hint = on ? (lvl >= maxLvl ? 'Fully deepened — maxed out' : `Deepen ${parts.filter(p => p.tier === lvl).map(p => p.name).join(' & ')} to reach ${ROMAN[lvl + 1]}`)
              : ready ? 'Both halves held — draft it instead of a boon this round'
              : need1 ? `Draft ${parts.filter(p => p.tier < 1).map(p => p.name).join(' & ')} to unlock it`
              : `Hold ${parts.map(p => p.name).join(' & ')} together to unlock it`
            comps = parts.map(p => ({ node: <BoonToken boonId={p.id} tier={p.tier} held={p.tier >= 1} full={view === 'codex'} size={34} />, name: p.name + (p.tier >= 1 ? ` ${ROMAN[Math.min(p.tier, 3)]}` : ''), held: p.tier >= 1 }))
            headTokens = <><BoonToken boonId={parts[0].id} tier={parts[0].tier} held={parts[0].tier >= 1} full={view === 'codex'} size={38} /><Fuse /><BoonToken boonId={parts[1].id} tier={parts[1].tier} held={parts[1].tier >= 1} full={view === 'codex'} size={38} /></>
            resultImage = oc.image
          } else {
            const cv = ov!
            const parts = cv.requires.map(r => {
              const c = CONFLUENCES.find(x => x.id === r.confluenceId)
              return { name: c?.name ?? r.confluenceId, online: !!c && takenSet.has(c.id) && confluenceLevel(c, owned) >= 1, image: c?.image }
            })
            lvl = convergenceLevel(cv, owned, taken)
            const on = takenConvSet.has(cv.id) && lvl >= 1
            const ready = !on && lvl >= 1
            const need1 = !on && lvl < 1 && parts.some(p => p.online)
            accent = on ? KRAKEN : ready ? SYN : need1 ? NEED : '#9aa7b4'
            maxLvl = cv.levels.length
            name = cv.name; effectStr = convergenceDescAt(cv, Math.max(1, lvl)); detailStr = cv.detail; flavorStr = cv.flavor
            stateLabel = on ? 'Active' : ready ? 'Ready to draft' : need1 ? 'One synergy away' : 'Not online'
            hint = on ? (lvl >= maxLvl ? 'Fully deepened — maxed out' : 'Deepen either synergy to level it up')
              : ready ? 'Both synergies online — draft it instead of a boon this round'
              : need1 ? `Bring ${parts.filter(p => !p.online).map(p => p.name).join(' & ')} online to unlock it`
              : `Bring ${parts.map(p => p.name).join(' & ')} online together to unlock it`
            comps = parts.map(p => ({ node: <MiniCrest color={KRAKEN} dim={view === 'codex' ? false : !p.online} size={34} image={p.image} />, name: p.name, held: p.online }))
            headTokens = <><MiniCrest color={KRAKEN} dim={view === 'codex' ? false : !parts[0].online} size={38} image={parts[0].image} /><Fuse /><MiniCrest color={KRAKEN} dim={view === 'codex' ? false : !parts[1].online} size={38} image={parts[1].image} /></>
            resultImage = cv.image
          }

          return createPortal(
            <motion.div onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(2,6,12,0.74)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <motion.div onClick={e => e.stopPropagation()} initial={{ y: 44 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                style={{ width: '100%', maxWidth: 440, maxHeight: '86vh', overflowY: 'auto', background: 'linear-gradient(180deg, #141a24 0%, #0b0f16 100%)', borderRadius: '20px 20px 0 0', border: `1px solid ${accent}66`, borderBottom: 'none', boxShadow: `0 -12px 44px rgba(0,0,0,0.55)`, padding: '1rem 1.1rem calc(env(safe-area-inset-bottom, 0px) + 1.3rem)' }}>
                <div aria-hidden style={{ width: 38, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.18)', margin: '0 auto 14px' }} />

                {/* The recipe, spelled out: components fuse into the synergy. */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 12 }}>
                  {headTokens}
                  <span aria-hidden style={{ color: accent, fontSize: '1.05rem', margin: '0 2px' }}>→</span>
                  <MiniCrest color={accent} size={44} image={resultImage} />
                </div>
                <p className="font-cinzel font-800" style={{ fontSize: '1.35rem', lineHeight: 1.1, color: '#f4efe4', textAlign: 'center' }}>{name}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 5 }}>
                  <span className="font-karla font-800 uppercase tracking-[0.12em]" style={{ fontSize: '0.56rem', color: accent }}>{stateLabel}</span>
                  <LevelReadout level={lvl} max={maxLvl} color={accent} />
                </div>

                {/* What it does, at this level. */}
                <div style={{ marginTop: 14, borderRadius: 12, padding: '0.7rem 0.85rem', background: `${accent}12`, border: `1px solid ${accent}33` }}>
                  <p className="font-cinzel font-800" style={{ fontSize: '0.95rem', color: '#aef5c4', lineHeight: 1.3, textShadow: '0 0 12px rgba(74,222,128,0.25)' }}>{effectStr}</p>
                  <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(230,240,236,0.7)', lineHeight: 1.5, marginTop: 7 }}>{detailStr}</p>
                </div>

                {/* Fused From — the components + whether you hold each. */}
                <p className="font-karla font-800 uppercase tracking-[0.14em]" style={{ fontSize: '0.56rem', color: '#8a8480', margin: '14px 0 8px' }}>Fused From</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {comps.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.5rem 0.6rem', borderRadius: 11, background: c.held ? 'rgba(127,212,154,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${c.held ? 'rgba(127,212,154,0.32)' : 'rgba(255,255,255,0.1)'}` }}>
                      {c.node}
                      <p className="font-karla font-700" style={{ flex: 1, minWidth: 0, fontSize: '0.9rem', color: c.held ? '#e6e1d6' : '#9a948a' }}>{c.name}</p>
                      <span className="font-karla font-800 uppercase tracking-[0.08em]" style={{ flexShrink: 0, fontSize: '0.56rem', color: c.held ? '#7fd49a' : '#7a7470' }}>{c.held ? 'Held' : 'Need'}</span>
                    </div>
                  ))}
                </div>

                {/* Next step + flavor. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, padding: '0.55rem 0.7rem', borderRadius: 10, background: `${accent}0f`, border: `1px solid ${accent}2e` }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M7 13l5 5 5-5" /><path d="M7 6l5 5 5-5" /></svg>
                  <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: accent, lineHeight: 1.35 }}>{hint}</p>
                </div>
                <p className="font-karla" style={{ fontSize: '0.76rem', fontStyle: 'italic', color: 'rgba(245,242,236,0.42)', lineHeight: 1.45, marginTop: 10, textAlign: 'center' }}>{flavorStr}</p>

                <button type="button" onClick={close} className="font-karla font-800 uppercase tracking-[0.1em] tap"
                  style={{ width: '100%', marginTop: 14, padding: '0.7rem 0', borderRadius: 11, fontSize: '0.7rem', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: '#cfcabf' }}>
                  Back to the board
                </button>
              </motion.div>
            </motion.div>,
            document.body,
          )
        })()}
      </motion.div>
    </ModalScrim>
  )
}

// Tap a purse pill on the intro screen → this explains the currency + where to
// spend it. Themed teal (Fathoms) or crimson (Blood Gems).
function CurrencyInfoModal({ kind, don, onClose }: { kind: 'fathoms' | 'blood'; don?: boolean; onClose: () => void }) {
  const blood = kind === 'blood'
  const accent = blood ? '#d1394b' : (don ? KRAKEN : TEAL)
  const title = blood ? 'Blood Gems' : 'Fathoms'
  const kicker = blood ? 'Hardcore Spoils' : 'Gauntlet Currency'
  const earn = blood
    ? 'Pulled from the cash-out chest at the end of a Hardcore run. You only keep them if you bring your crew home alive.'
    : 'Earned by sinking ships in the Gauntlet, one Fathom for each, kept even if you go down.'
  const uses = blood
    ? [
        { h: 'Blood-charged reroll', b: 'In the Crew Hall, spend them alongside gems to sway a reroll toward Epic and Legendary recruits.' },
        { h: 'Skin gamble', b: 'Wager them for a random crew skin you don’t own yet.' },
      ]
    : [
        { h: 'Run Upgrades', b: 'Boons for the descent itself, bought before you dive.' },
        { h: 'Locker Upgrades', b: 'Permanent unlocks, like the Auto Catcher, that stay with you for good.' },
      ]
  const icon = blood
    ? <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden style={{ filter: `drop-shadow(0 0 4px ${accent}88)` }}><path d="M12 2s7 8.6 7 13a7 7 0 1 1-14 0c0-4.4 7-13 7-13z" fill={accent} /><path d="M9.2 12.4a3.4 3.4 0 0 0-.2 4.2" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.3" fill="none" strokeLinecap="round" /></svg>
    : <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="5" r="2" /><path d="M12 7v13" /><path d="M5 12H3a9 9 0 0 0 18 0h-2" /><path d="M8 10h8" /></svg>
  return (
    <ModalScrim zIndex={1300} onClose={onClose}>
      <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 380, borderRadius: 18, background: 'linear-gradient(180deg, rgba(16,13,18,0.99), rgba(9,7,11,0.99))', border: `1px solid ${accent}44`, boxShadow: `0 0 44px ${accent}22, 0 18px 50px rgba(0,0,0,0.6)`, padding: '1.2rem 1.1rem 1.15rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {icon}
            <div>
              <p className="font-karla font-700 uppercase tracking-[0.2em]" style={{ fontSize: '0.5rem', color: `${accent}cc` }}>{kicker}</p>
              <p className="font-cinzel font-800" style={{ fontSize: '1.3rem', color: '#f4ead2', lineHeight: 1.1, marginTop: 2 }}>{title}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', padding: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <p className="font-karla" style={{ fontSize: '0.76rem', color: '#b8b2a6', lineHeight: 1.5, marginTop: 12, textAlign: 'left' }}>{earn}</p>
        <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#8a8480', marginTop: 14, marginBottom: 6 }}>Spend them on</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {uses.map(u => (
            <div key={u.h} style={{ padding: '0.55rem 0.7rem', borderRadius: 10, background: `${accent}0f`, border: `1px solid ${accent}2e`, textAlign: 'left' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: '#f0ede8' }}>{u.h}</p>
              <p className="font-karla" style={{ fontSize: '0.68rem', color: '#9a948a', lineHeight: 1.45, marginTop: 2 }}>{u.b}</p>
            </div>
          ))}
        </div>
        {/* Blood Market is gone: the reroll lives in Recruit, the gamble in
            Skins. Point at Recruit, which is the primary use. */}
        {blood && (
          <Link href="/crew?tab=recruits" onClick={onClose} className="font-cinzel font-800 uppercase tracking-[0.05em] tap"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, padding: '0.85rem', borderRadius: 12, fontSize: '0.9rem', color: '#ffe6e9', textDecoration: 'none', background: `linear-gradient(180deg, ${accent}3a, ${accent}16)`, border: `1px solid ${accent}88`, boxShadow: `0 0 20px ${accent}22` }}>
            Open the Blood Market
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
        )}
      </motion.div>
    </ModalScrim>
  )
}

// ── THE HAUL ─────────────────────────────────────────────────────────────────
// What a dive pays, Normal or Hardcore. This used to be five paragraphs of prose in
// four competing accent colors, with the actual ARTWORK shrunk to 34px thumbnails
// beside it — the loot guide buried the loot. It is now a grid: the art is the
// content, and every word beyond a name lives one tap away in a detail sheet, for
// the players who want it.
//
// Both modes render the SAME grid, because a Hardcore dive genuinely earns
// everything a Normal dive drops plus its own spoils. On Normal the Hardcore drops
// sit there greyed and locked, which says "this is what the other mode adds" with no
// prose at all, and says it far better than a paragraph did.

interface HaulDrop {
  id: string
  name: string
  img?: string | null
  icon?: React.ReactNode
  /** One line on the tile. Everything else waits behind the tap. */
  tag: string
  desc: string
  /** How it is actually won. The fact players came here for. */
  how: string
  hardcoreOnly?: boolean
}

function LootModal({ mode, don, totalFortune = 0, onClose }: {
  mode: 'normal' | 'hardcore'
  don?: boolean
  /** Crew Fortune. The guide quoted the base curve while the cash-out rolled a
   *  boosted one, so a captain reading it was reading the wrong table. */
  totalFortune?: number
  onClose: () => void
}) {
  // One entry, both modes: the Rewards card opens this and you flip Normal /
  // Hardcore inside (Hardcore-only drops are still shown greyed on Normal).
  const [viewMode, setViewMode] = useState<'normal' | 'hardcore'>(mode)
  const hardcore = viewMode === 'hardcore'
  const AC = don ? KRAKEN : TEAL
  const accent = hardcore ? HC_RED : AC
  const [detail, setDetail] = useState<HaulDrop | null>(null)

  // Drop-rate formatting: keep small odds honest (0.25%), one decimal in the
  // 1-10 band (1.5%), whole numbers otherwise.
  const fmtPct = (c: number): string => {
    const p = c * 100
    if (p <= 0) return '0%'
    if (p < 1) return `${p.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`
    if (p < 10 && Math.round(p) !== p) return `${p.toFixed(1)}%`
    return `${Math.round(p)}%`
  }
  // The depth→odds reference for one chase drop: its range up top, the unlock
  // gate if any, and the rate at the depths where it climbs (it maxes at 50).
  const ftnMult = fortuneLootMult(totalFortune)
  const OddsBlock = ({ info }: { info: DropOddsInfo }) => {
    const startD = info.unlockDepth > 1 ? info.unlockDepth : 10
    const rows = Array.from(new Set([startD, 20, 30, 40, 50].filter(d => d >= startD))).sort((a, b) => a - b)
    return (
      <div style={{ marginTop: 11, padding: '0.7rem 0.8rem', borderRadius: 11, textAlign: 'left', background: `${GOLD}0d`, border: `1px solid ${GOLD}30` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: info.unlockDepth > 1 ? 5 : 7 }}>
          <p className="font-karla font-800 uppercase tracking-[0.16em]" style={{ fontSize: '0.5rem', color: `${GOLD}cc` }}>Drop odds by depth</p>
          <span className="font-cinzel font-800" style={{ fontSize: '0.82rem', color: GOLD }}>{fmtPct(info.min)}–{fmtPct(info.max)}</span>
        </div>
        {info.unlockDepth > 1 && (
          <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#c9a7ff', marginBottom: 7 }}>
            Locked until you bank from depth {info.unlockDepth}.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rows.map((d, i) => {
            const isMax = i === rows.length - 1
            return (
              <div key={d} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <span className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#9a948a' }}>{isMax ? `Depth ${d}+` : `Depth ${d}`}</span>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                  {info.chanceAt(d) > info.baseChanceAt(d) && (
                    <span className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#8f8a80', textDecoration: 'line-through', opacity: 0.8 }}>
                      {fmtPct(info.baseChanceAt(d))}
                    </span>
                  )}
                  <span className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: info.chanceAt(d) > info.baseChanceAt(d) ? GOLD : isMax ? GOLD : '#e8e1d2' }}>{fmtPct(info.chanceAt(d))}{isMax ? ' · max' : ''}</span>
                </span>
              </div>
            )
          })}
        </div>
        <p className="font-karla" style={{ fontSize: '0.64rem', color: '#8f8a80', lineHeight: 1.45, marginTop: 8 }}>
          Each rolls on its own, only while unowned — the deeper you bank, the better the odds, maxing out at depth 50.
          {ftnMult > 1
            ? <> Your crew&apos;s Fortune is already worth <span style={{ color: GOLD, fontWeight: 700 }}>{ftnMult.toFixed(2)}×</span> on every line above, and Davy&apos;s Offer can raise them further on the spot.</>
            : <> Crew Fortune raises them, up to double, and Davy&apos;s Offer can raise them further on the spot.</>}
        </p>
      </div>
    )
  }

  const GEM_ICON = (
    <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden><path d="M12 2s7 8.6 7 13a7 7 0 1 1-14 0c0-4.4 7-13 7-13z" fill="#d1394b" /><path d="M9.2 12.4a3.4 3.4 0 0 0-.2 4.2" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.3" fill="none" strokeLinecap="round" /></svg>
  )

  // ── What every dive pays, win or lose ──────────────────────────────────────
  const banked: HaulDrop[] = [
    {
      id: 'pot', name: 'The Pot', tag: 'Doubloons',
      icon: <span className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: GOLD }}>⟡</span>,
      desc: 'Every ship you sink grows one pot. Cash out at any depth and it banks as doubloons, plus a share of Nav XP.',
      how: 'The deeper you bank, the richer the chest and the bigger the multiplier on the pot. Sink before you bank and you lose the lot.',
    },
    {
      id: 'fathoms', name: 'Fathoms', tag: 'Kept even if you sink',
      icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={AC} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 7h18" /><path d="M3 12h18" /><path d="M3 17h18" /></svg>,
      desc: 'The Gauntlet\u2019s own currency. One per ship sunk, and the only thing a dive pays whether you come home or not.',
      how: 'Spend them in the Locker on permanent upgrades that carry into every future dive.',
    },
    {
      id: 'blood_gems', name: 'Blood Gems', tag: 'Premium currency', hardcoreOnly: true,
      icon: GEM_ICON,
      desc: 'The premium currency, and the reason to risk the crew. Banked in your cash-out chest, never dropped anywhere else in the game.',
      how: `Survive and bank them. The deeper you go the more you carry up, and signing Davy\u2019s Terms multiplies them further.`,
    },
  ]

  // ── The chase. Art first; the rules are one tap away. ──────────────────────
  // Variant-specific: the two gauntlets share no chase drops \u2014 each drops its own
  // Man-o-War hulls (and Davy's its cannons). A shared helper builds a skin tile.
  const skinDrop = (id: string, tag: string, how: string, hardcoreOnly = false): HaulDrop | null => {
    const s = getShipSkin(id)
    return s ? { id: s.id, name: s.name, img: s.imageByTier?.[6], tag, desc: s.description, how, hardcoreOnly } : null
  }
  // Raid-item tile — emoji fallback while art is pending (image null).
  const itemDrop = (id: string, tag: string, how: string, hardcoreOnly = false): HaulDrop | null => {
    const it = getRaidItem(id)
    if (!it) return null
    return {
      id: it.id, name: it.name,
      img: it.image ?? undefined,
      icon: it.image ? undefined : <span style={{ fontSize: '1.9rem', lineHeight: 1 }}>{it.emoji}</span>,
      tag, desc: it.description, how, hardcoreOnly,
    }
  }
  const chase: HaulDrop[] = (don
    ? [
        itemDrop('opening_statement', 'Rare from any chest',
          'A rare roll in any cash-out chest. The odds climb the deeper you bank.'),
        itemDrop('made_man', 'Rare from any chest',
          'A rare roll in any cash-out chest. The odds climb the deeper you bank.'),
        itemDrop('the_shakedown', 'Rare from any chest',
          'A rare roll in any cash-out chest. The odds climb the deeper you bank.'),
        skinDrop('galaxy_hull', 'Deepest chest only',
          "Only rolls from the deepest Don's Gauntlet chest. Man-o-War hulls only."),
        skinDrop('dons_ghost_hull', 'Rare from any chest',
          "A rare roll from the deeper Don's chests, one tier below the Galaxy Hull. Man-o-War hulls only."),
        // The Don's hardcore chase, mirroring the Blood Cannon's entry on Davy's
        // side. This guide keeps its OWN hand-written list per descent rather
        // than reading chestOdds, so adding a drop to the roll does not add it
        // here: the Palisade was rolling and going unlisted.
        itemDrop('dons_palisade', 'Rare from deeper chests',
          'A rare roll from the deeper Hardcore chests. The only regenerating ward in the game.', true),
      ]
    : (() => {
        const heavy   = getRaidItem('davys_heavy_cannon')
        const hand    = getRaidItem('davys_hand_cannon')
        const bloodCn = getRaidItem('davys_blood_cannon')
        return [
          heavy && { id: heavy.id, name: heavy.name, img: heavy.image, tag: 'Rare from any chest',
            desc: heavy.description, how: 'A rare roll in any cash-out chest. The odds climb the deeper you bank.' },
          hand && { id: hand.id, name: hand.name, img: hand.image, tag: 'Rare from any chest',
            desc: hand.description, how: 'A rare roll in any cash-out chest. The odds climb the deeper you bank. Forge it with the Heavy to make the Grand Cannon.' },
          skinDrop('golden_gauntlet_hull', 'Deepest chest only',
            'Only rolls from Davy Jones\u2019 Locker, the deepest chest tier. Man-o-War hulls only.'),
          bloodCn && { id: bloodCn.id, name: bloodCn.name, img: bloodCn.image, tag: 'Rare from deeper chests', hardcoreOnly: true,
            desc: bloodCn.description, how: 'A rare roll from the deeper Hardcore chests. The only lifesteal in the game.' },
          skinDrop('bad_blood_hull', 'Rare from deeper chests',
            'A rare roll from the deeper Hardcore chests. Man-o-War hulls only.', true),
          skinDrop(PRESSURE_SKIN_ID, `${PRESSURE_SKIN_THRESHOLD}+ Pressure`,
            `The rarest thing in the Gauntlet. It is not won by diving deep, it is won by diving deep UNDER WEIGHT: a Hardcore cash-out carrying ${PRESSURE_SKIN_THRESHOLD}+ Pressure from Davy\u2019s Terms, banked from depth ${PRESSURE_SKIN_DEPTH} or deeper. Man-o-War hulls only.`, true),
        ]
      })()
  ).filter(Boolean) as HaulDrop[]

  // Each tab lists only what actually drops there (the mode filter runs at
  // render), so tiles never need a "Hardcore only" lock/label anymore — the tab
  // says it. Hardcore-exclusive drops keep a faint red border as a quiet tell.
  const Tile = ({ d, big }: { d: HaulDrop; big?: boolean }) => {
    return (
      <button onClick={() => setDetail(d)} className="tap"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: big ? '0.75rem 0.4rem 0.6rem' : '0.6rem 0.35rem',
          borderRadius: 12, cursor: 'pointer', textAlign: 'center', width: '100%',
          background: 'rgba(255,255,255,0.035)',
          border: `1px solid ${d.hardcoreOnly ? `${HC_RED}44` : 'rgba(255,255,255,0.09)'}` }}>
        <div style={{ height: big ? 52 : 40, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.55))' }}>
          {d.img
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={d.img} alt="" loading="lazy" decoding="async" style={{ maxWidth: big ? 62 : 44, maxHeight: big ? 52 : 40, objectFit: 'contain' }} />
            : d.icon}
        </div>
        <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#f2ede2', lineHeight: 1.12 }}>{d.name}</p>
        <p className="font-karla font-600" style={{ fontSize: '0.55rem', lineHeight: 1.2, color: d.hardcoreOnly ? `${HC_RED}dd` : '#7f7a72' }}>
          {d.tag}
        </p>
        {/* Drop-rate range for the chase items/skins (banked currencies have none). */}
        {(() => {
          const o = dropOddsInfo(d.id, ftnMult)
          return o ? (
            <span className="font-karla font-800" style={{ marginTop: 1, fontSize: '0.5rem', color: `${GOLD}dd`, background: `${GOLD}16`, border: `1px solid ${GOLD}40`, borderRadius: 999, padding: '0.08rem 0.4rem' }}>
              {fmtPct(o.min)}–{fmtPct(o.max)}
            </span>
          ) : null
        })()}
      </button>
    )
  }

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: '#7f7a72', margin: '15px 0 7px' }}>{children}</p>
  )

  return (
    <ModalScrim zIndex={1300} onClose={onClose}>
      <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 420, maxHeight: '86vh', overflowY: 'auto', borderRadius: 18, background: 'linear-gradient(180deg, rgba(14,22,34,0.99), rgba(7,13,22,0.99))', border: `1px solid ${accent}3a`, boxShadow: `0 0 44px ${accent}1f, 0 18px 50px rgba(0,0,0,0.6)`, padding: '1.15rem 1.05rem 1.05rem' }}>

        {detail ? (
          // ── DETAIL: one drop, all the words, nothing competing with it ────────
          <motion.div key={detail.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }}>
            <button onClick={() => setDetail(null)} className="font-karla font-700 tap"
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: '#9a948a', fontSize: '0.72rem', cursor: 'pointer', padding: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              Back
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 12 }}>
              <div style={{ height: 92, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.6))' }}>
                {detail.img
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={detail.img} alt="" style={{ maxWidth: 120, maxHeight: 92, objectFit: 'contain' }} />
                  : <div style={{ transform: 'scale(2)' }}>{detail.icon}</div>}
              </div>
              <p className="font-cinzel font-800" style={{ fontSize: '1.3rem', color: '#f2ede2', lineHeight: 1.12, marginTop: 12, textAlign: 'center' }}>{detail.name}</p>
            </div>
            <p className="font-karla" style={{ fontSize: '0.82rem', color: '#b8b2a6', lineHeight: 1.55, marginTop: 11, textAlign: 'left' }}>{detail.desc}</p>
            <div style={{ marginTop: 11, padding: '0.7rem 0.8rem', borderRadius: 11, textAlign: 'left', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.09)' }}>
              <p className="font-karla font-800 uppercase tracking-[0.16em]" style={{ fontSize: '0.5rem', color: '#7f7a72', marginBottom: 5 }}>How it drops</p>
              <p className="font-karla" style={{ fontSize: '0.78rem', color: '#c8c2b6', lineHeight: 1.5 }}>{detail.how}</p>
            </div>
            {/* Depth→odds table for the chase drops (banked currencies have none). */}
            {(() => {
              const o = dropOddsInfo(detail.id, ftnMult)
              return o ? <OddsBlock info={o} /> : null
            })()}
          </motion.div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ textAlign: 'left' }}>
                <p className="font-karla font-700 uppercase tracking-[0.24em]" style={{ fontSize: '0.52rem', color: `${accent}cc` }}>{hardcore ? 'Hardcore' : 'Normal'}</p>
                <p className="font-cinzel font-800" style={{ fontSize: '1.35rem', color: '#eafffb', lineHeight: 1.1, marginTop: 3 }}>The Haul</p>
              </div>
              <button onClick={onClose} aria-label="Close" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', padding: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <p className="font-karla" style={{ fontSize: '0.76rem', color: '#8f8a82', lineHeight: 1.45, marginTop: 8, textAlign: 'left' }}>
              Tap anything to see how it drops and its odds by depth.
            </p>

            {/* Normal / Hardcore toggle — each tab lists only what actually drops
                on that mode (Hardcore adds its own chases). */}
            <div style={{ display: 'flex', gap: 5, marginTop: 10, padding: 4, background: 'rgba(0,0,0,0.3)', borderRadius: 11, border: '1px solid rgba(255,255,255,0.08)' }}>
              {(['normal', 'hardcore'] as const).map(mm => {
                const on = viewMode === mm
                const c = mm === 'hardcore' ? HC_RED : AC
                return (
                  <button key={mm} onClick={() => setViewMode(mm)} className="font-karla font-800 uppercase tracking-[0.08em] tap"
                    style={{ flex: 1, padding: '0.44rem 0', borderRadius: 8, fontSize: '0.62rem', cursor: 'pointer',
                      border: `1px solid ${on ? `${c}66` : 'transparent'}`,
                      background: on ? `linear-gradient(180deg, ${c}26, ${c}0c)` : 'transparent',
                      color: on ? (mm === 'hardcore' ? '#ffb3b3' : '#bfeee6') : '#8f97a2' }}>
                    {mm === 'hardcore' ? 'Hardcore' : 'Normal'}
                  </button>
                )
              })}
            </div>

            <SectionLabel>Every dive pays</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {banked.filter(d => hardcore || !d.hardcoreOnly).map(d => <Tile key={d.id} d={d} />)}
            </div>

            <SectionLabel>The chase</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {chase.filter(d => hardcore || !d.hardcoreOnly).map(d => <Tile key={d.id} d={d} big />)}
            </div>
          </>
        )}
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
        background: primary ? `linear-gradient(180deg, ${color}2e, ${color}12)` : `linear-gradient(180deg, ${color}1e 0%, rgba(8,12,20,0.62) 100%)`,
        border: `1px solid ${color}${primary ? '70' : '3e'}`,
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
// reopenable via "How it works". Variant-aware: Don's Gauntlet gets his own
// portrait, kraken-green theme, and copy that TEASES its new layers
// (Convergences, the Don's Mark, the shadier market) without spoiling them.
function GauntletIntroModal({ variant, onClose, firstTime }: { variant?: GauntletVariant; onClose: () => void; firstTime: boolean }) {
  const isDon = variant === 'don'
  const AC = isDon ? KRAKEN : TEAL
  const heroImg = isDon ? '/donsgauntlet.png' : MAW_IMG
  const eyebrow = isDon ? "The Don's Gauntlet" : 'The Davy Jones Gauntlet'

  // Shared icons so the two step lists read consistently.
  const ChevIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 5l6 6 6-6" /><path d="M6 13l6 6 6-6" /></svg>
  const StarIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l2.1 5.6L20 9.2l-4.4 3.6L17 19l-5-3.4L7 19l1.4-6.2L4 9.2l5.9-1.6z" /></svg>
  const CubeIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 7v10l8 5 8-5V7z" /><path d="M12 22V12" /><path d="m4 7 8 5 8-5" /></svg>
  const PotIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="6.5" rx="7" ry="2.6" /><path d="M5 6.5v5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-5" /><path d="M5 11.5v5c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-5" /></svg>
  const SkullIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a8 8 0 0 0-8 8c0 4 3 7 7 8 4-1 7-4 7-8a8 8 0 0 0-8-8z" /><circle cx="9" cy="10" r="1.4" fill="#120a12" /><circle cx="15" cy="10" r="1.4" fill="#120a12" /></svg>
  const WaveIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M7 10.6c1.2-1 2.3-1 3.5 0s2.3 1 3.5 0 2.1-0.9 2.8-0.4" /><path d="M7 14c1.2-1 2.3-1 3.5 0s2.3 1 3.5 0 2.1-0.9 2.8-0.4" /></svg>
  const CrownIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M3 8l4 3.5L12 5l5 6.5L21 8l-1.8 11H4.8z" /></svg>
  const ScrollIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h9a2 2 0 0 1 2 2v13a3 3 0 0 1-3 3H7a2 2 0 0 1-2-2V6" /><path d="M5 6a2 2 0 1 1 4 0v1H5z" /><path d="M9 9h7M9 12.5h7M9 16h4" /></svg>

  const davySteps: { color: string; title: string; text: string; icon: React.ReactNode }[] = [
    { color: TEAL, title: 'Descend the Locker', text: 'Fight ship after ship. Each depth hits harder.', icon: ChevIcon },
    { color: '#8b9cff', title: 'Powers and curses', text: 'Between fights you draft a boon for the whole dive. Go deep enough and the Locker forces curses on you too.', icon: StarIcon },
    { color: '#b98bff', title: 'Synergies', text: 'Hold the right pair of boons and a synergy surfaces as a card in a draft — take it instead of a boon. It lasts the whole dive and levels up as you deepen its two boons.', icon: CubeIcon },
    { color: GOLD, title: 'One pot grows', text: 'Every ship you sink swells a single pot of doubloons and Nav XP.', icon: PotIcon },
    { color: '#f87171', title: 'Cash out or sink', text: 'Bank the pot whenever you like. Go under first and it all sinks with you.', icon: SkullIcon },
    { color: TEAL, title: 'Fathoms to spend', text: 'Each dive also pays Fathoms, win or lose. Spend them on Run Upgrades for the next dive, or on Permanent Upgrades that carry into voyages, raids and fishing.', icon: WaveIcon },
  ]
  // Don's list: the core loop still applies, reskinned to his abyss, with new
  // layers named but left mysterious (no numbers, no mechanics — you find out
  // by descending).
  const donSteps: { color: string; title: string; text: string; icon: React.ReactNode }[] = [
    { color: KRAKEN, title: 'Descend the deep', text: "Fight ship after ship of the Don's own fleet. Every depth cuts deeper than the last.", icon: ChevIcon },
    { color: '#8b9cff', title: 'Powers and curses', text: 'Between fights you draft a boon for the whole dive. Push deep enough and the dark forces curses on you too.', icon: StarIcon },
    { color: '#b98bff', title: 'Convergences', text: 'The right boons fuse into a synergy — and down in the Don’s water, synergies themselves can converge into something greater still.', icon: CubeIcon },
    { color: GOLD, title: 'The Don descends with you', text: 'He does not wait at the bottom. Meet Don Finleone in the deep, and best him to take his Mark.', icon: CrownIcon },
    { color: '#e0a34a', title: "The Don's contracts", text: 'On the way down he offers jobs. Take one and clear his terms for a prize — fail it and you pay the price.', icon: ScrollIcon },
    { color: '#f87171', title: 'Cash out or sink', text: 'One pot of doubloons and Nav XP swells with every kill. Bank it whenever you like — go under first and it all sinks with you.', icon: SkullIcon },
    { color: KRAKEN, title: 'Fathoms and darker deals', text: "Every dive pays Fathoms for the Don's own Locker of upgrades — and a shadier market prowls these waters, dealing in things Davy never stocked.", icon: WaveIcon },
  ]
  const steps = isDon ? donSteps : davySteps
  return (
    <ModalScrim zIndex={1400} onClose={onClose} bg="rgba(2,6,12,0.88)" blur="blur(5px)">
      <motion.div initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 250, damping: 23 }}
        onClick={e => e.stopPropagation()}
        style={{ position: 'relative', width: '100%', maxWidth: 420, borderRadius: 20, background: 'linear-gradient(180deg, rgba(12,18,30,0.99), rgba(6,9,16,0.99))', border: `1px solid ${AC}3a`, boxShadow: `0 0 50px ${AC}22, 0 18px 50px rgba(0,0,0,0.65)`, padding: '1.3rem 1.15rem 1.15rem', textAlign: 'center' }}>
        <button onClick={onClose} aria-label="Close" className="tap" style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, width: 30, height: 30, borderRadius: '50%', padding: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
        <div style={{ position: 'relative', width: 92, height: 92, margin: '0 auto 6px' }}>
          <div style={{ position: 'absolute', inset: -14, borderRadius: '50%', background: `radial-gradient(circle, ${GOLD}22 0%, ${AC}12 45%, transparent 72%)`, animation: 'gauntPulse 3.6s ease-in-out infinite' }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroImg} alt="" loading="eager" decoding="async" style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.7))' }} />
        </div>
        <p className="font-karla font-700 uppercase" style={{ fontSize: '0.55rem', letterSpacing: '0.3em', color: AC }}>{eyebrow}</p>
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
          {firstTime ? (isDon ? 'Into the deep' : 'Into the Locker') : 'Got it'}
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
type LockerState = { deepest: number; fathoms: number; owned: string[]; ownedAll: string[]; off: string[]; hasAutoCatcher: boolean; hasAutoCaster: boolean; tributeReady: boolean }
/** A purchasable row in the Locker — either a Gauntlet upgrade or a special
 *  item (the Auto Catcher) — normalized so both render through one card. */
type ShopEntry = {
  id: string; name: string; description: string; depthRequired: number; cost: number
  scope: string; owned: boolean; lockNote: string | null; demo: boolean; special: boolean
  category?: 'voyages' | 'raids' | 'fishing'
  /** "I of III" when this upgrade is part of a tier chain (so players see more). */
  tierLabel?: string
  /** Built but not live yet — shown with a Coming Soon lock, can't be bought. */
  comingSoon?: boolean
  /** Milestone art. Present = featured: big card, picture, top of its section. */
  art?: string
}

// Permanent Upgrades sections, ordered, each with a small glyph for the header.
const SHORE_CATEGORIES: { id: 'voyages' | 'raids' | 'fishing'; label: string; icon: React.ReactNode }[] = [
  { id: 'voyages', label: 'Voyages', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v9" /><path d="M12 5l6 6-6 1" /><path d="M4 14h16l-1.6 4.2a2 2 0 0 1-1.9 1.3H7.5a2 2 0 0 1-1.9-1.3z" /></svg> },
  { id: 'raids', label: 'Raids', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6" /><path d="m16 16 4 4" /><path d="M9.5 6.5 21 6V3h-3L6.5 14.5" /><path d="m5 13 6 6" /><path d="m8 18-5 3" /></svg> },
  { id: 'fishing', label: 'Fishing', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12c3-4 8-5 12-3 2 1 4 3 6 3-2 0-4 2-6 3-4 2-9 1-12-3z" /><path d="m16 9.5 4-2.5v10l-4-2.5" /><circle cx="7.5" cy="11.5" r="0.7" fill="currentColor" stroke="none" /></svg> },
]

function LockerUpgradesModal({ section, variant, onClose, onClaimed, onToggled }: { section: 'run' | 'shore'; variant: GauntletVariant; onClose: () => void; onClaimed?: (owned: string[]) => void; onToggled?: (off: string[]) => void }) {
  const AC = variant === 'don' ? KRAKEN : TEAL   // Don's Locker wears the kraken green
  const [state, setState] = useState<LockerState | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { getGauntletUpgradeState(variant).then(setState) }, [variant])

  // Flip an owned Run Upgrade on/off. Optimistic — the switch moves instantly,
  // then the server-authoritative off-set is written back (and pushed to the
  // parent so the next dive reads it). Reverts on error.
  async function toggle(id: string, active: boolean) {
    if (toggling) return
    setToggling(id); setErr(null)
    setState(s => (s ? { ...s, off: active ? s.off.filter(x => x !== id) : [...new Set([...s.off, id])] } : s))
    vibrate([0, 18])
    const res = await setGauntletUpgradeActive(id, active, variant)
    setToggling(null)
    if ('error' in res) {
      setErr(res.error)
      const fresh = await getGauntletUpgradeState(variant); setState(fresh); onToggled?.(fresh.off)
      return
    }
    setState(s => (s ? { ...s, off: res.off } : s))
    onToggled?.(res.off)
  }

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
      const fresh = await getGauntletUpgradeState(variant); setState(fresh)
    } else {
      const res = await claimGauntletUpgrade(id, variant)
      setClaiming(null)
      if ('error' in res) { setErr(res.error); return }
      setState(s => (s ? { ...s, fathoms: res.fathoms, owned: res.owned } : s))
      onClaimed?.(res.owned)
      vibrate([0, 30, 50, 40])
    }
  }

  // The Don's Tribute — claim the free daily 10 Fathoms. Once per UTC day,
  // server-gated. Optimistically bumps the purse + hides the button on success.
  const [claimingTribute, setClaimingTribute] = useState(false)
  async function claimTribute() {
    if (claimingTribute) return
    setClaimingTribute(true); setErr(null)
    const res = await claimDailyTribute()
    setClaimingTribute(false)
    if ('error' in res) { setErr(res.error); return }
    setState(s => (s ? { ...s, fathoms: res.fathoms, tributeReady: false } : s))
    vibrate([0, 30, 50, 40])
  }

  // Fathoms → lures. Repeatable (consumable), unlike the one-time upgrades.
  const [lureBought, setLureBought] = useState<string | null>(null)
  async function buyLure(baitType: string) {
    if (claiming) return
    setClaiming('lure:' + baitType); setErr(null)
    const res = await buyBaitWithFathoms(baitType)
    setClaiming(null)
    if ('error' in res) { setErr(res.error); return }
    setState(s => (s ? { ...s, fathoms: res.fathoms } : s))
    vibrate([0, 25, 40, 35])
    setLureBought(baitType)
    setTimeout(() => setLureBought(b => (b === baitType ? null : b)), 1600)
  }

  // A shop line item for an UN-OWNED upgrade: name + description on the left,
  // a Fathoms price tag on the right, a status accent stripe, and a buy button
  // whose label spells out exactly why you can or can't take it. (Owned upgrades
  // are surfaced as chips up top, not here.)
  function Card({ e }: { e: ShopEntry }) {
    if (!state) return null
    const comingSoon = !!e.comingSoon
    const depthMet = state.deepest >= e.depthRequired
    const canAfford = state.fathoms >= e.cost
    const busy = claiming === e.id
    const prereqLocked = !!e.lockNote
    const claimable = depthMet && canAfford && !prereqLocked && !busy && !comingSoon
    // Carrying art IS the milestone flag — see the `art` note on GauntletUpgrade.
    const featured = !!e.art
    const accent = comingSoon ? `${AC}66` : claimable ? GOLD : (!depthMet || prereqLocked) ? '#caa05a' : '#6a6764'
    // Compact buy control on the right: a small tinted price-button when you can
    // take it, a dim status chip when you can't. Fathoms read teal, matching the
    // wallet, so it never needs a gold fill.
    const topLabel = comingSoon ? 'Coming' : busy ? '' : !depthMet ? 'Locked' : prereqLocked ? 'Locked' : !canAfford ? 'Need' : 'Buy'
    const bigLabel = comingSoon ? 'Soon' : busy ? '…' : !depthMet ? `Lv ${e.depthRequired}` : fmt(e.cost)
    const showFathoms = !comingSoon && !busy && depthMet
    return (
      <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 11, borderRadius: 14, padding: '0.75rem 0.85rem 0.75rem 1rem', background: featured ? `linear-gradient(180deg, ${GOLD}14, rgba(255,255,255,0.03))` : 'rgba(255,255,255,0.035)', border: `1px solid ${featured ? `${GOLD}55` : claimable ? `${GOLD}3a` : 'rgba(255,255,255,0.1)'}`, boxShadow: featured ? `0 0 22px ${GOLD}1c` : claimable ? `0 0 18px ${GOLD}12` : 'none' }}>
        <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: featured ? 5 : 4, background: accent }} />
        {/* The art the system itself uses, so the card and the board it opens
            are recognisably the same thing. Dimmed until it is actually
            reachable, so a locked milestone still reads as locked. */}
        {featured && (
          <span aria-hidden style={{ flexShrink: 0, width: 58, height: 58, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${GOLD}0f`, border: `1px solid ${GOLD}3a`, overflow: 'hidden' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.art} alt="" decoding="async" loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'contain', filter: claimable ? `drop-shadow(0 2px 8px ${GOLD}66)` : 'grayscale(0.5) brightness(0.72)' }}
              onError={ev => { (ev.target as HTMLImageElement).style.display = 'none' }} />
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {featured && (
            <p className="font-karla font-800 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.16em', color: GOLD, marginBottom: 2 }}>
              Opens a new system
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <p className="font-cinzel font-700" style={{ fontSize: featured ? '1.04rem' : '0.96rem', color: comingSoon ? '#cfcabf' : '#f0ede8', lineHeight: 1.15 }}>{e.name}</p>
            {e.tierLabel && !comingSoon && (
              <span title="This upgrade has higher tiers — buy this to unlock the next." className="font-karla font-800 uppercase tracking-[0.1em]" style={{ flexShrink: 0, fontSize: '0.46rem', color: GOLD, background: `${GOLD}18`, border: `1px solid ${GOLD}55`, borderRadius: 999, padding: '0.16rem 0.42rem' }}>Tier {e.tierLabel}</span>
            )}
            {comingSoon && (
              <span className="font-karla font-800 uppercase tracking-[0.12em]" style={{ flexShrink: 0, fontSize: '0.46rem', color: AC, background: `${AC}1c`, border: `1px solid ${AC}55`, borderRadius: 999, padding: '0.16rem 0.4rem' }}>Coming Soon</span>
            )}
          </div>
          {e.depthRequired > 0 && !comingSoon && (
            <span className="font-karla font-700 uppercase tracking-[0.07em]" style={{ fontSize: '0.5rem', color: depthMet ? '#7fd49a' : '#d8a14a' }}>
              {depthMet ? `Depth ${e.depthRequired} reached` : `Reach depth ${e.depthRequired}`}
            </span>
          )}
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#b0aaa0', lineHeight: 1.45, marginTop: 4 }}>{e.description}</p>
          {e.demo && <CannonballRackDemo />}
          {prereqLocked && <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#caa05a', marginTop: 7 }}>{e.lockNote}</p>}
          {comingSoon && <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: `${AC}cc`, marginTop: 7 }}>Still on the anvil. Not ready yet.</p>}
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
            color: claimable ? AC : '#6a6764',
            background: claimable ? `${AC}1c` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${claimable ? `${AC}66` : 'rgba(255,255,255,0.1)'}`,
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
        style={{ width: '100%', maxWidth: 440, borderRadius: 18, background: 'linear-gradient(180deg, rgba(14,22,34,0.99), rgba(7,13,22,0.99))', border: `1px solid ${AC}3a`, boxShadow: `0 0 44px ${AC}1f, 0 18px 50px rgba(0,0,0,0.6)`, padding: '1.2rem 1.1rem 1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.24em]" style={{ fontSize: '0.52rem', color: `${AC}cc` }}>The Locker</p>
            <p className="font-cinzel font-800" style={{ fontSize: '1.35rem', color: '#eafffb', lineHeight: 1.1, marginTop: 3 }}>{section === 'run' ? 'Run Upgrades' : 'Permanent Upgrades'}</p>
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
            const upgrades: ShopEntry[] = upgradesForVariant(variant).map(u => {
              // Prereq lock (checked across both Lockers via ownedAll): e.g.
              // Relentless Catcher needs Tireless Catcher owned first.
              const req = u.requires ? getGauntletUpgrade(u.requires) : null
              const prereqMissing = !!req && !state.ownedAll.includes(u.requires!)
              const ti = upgradeTierInfo(u.id)
              return {
                id: u.id, name: u.name, description: u.description, depthRequired: u.depthRequired,
                cost: u.cost, scope: u.scope, owned: state.owned.includes(u.id),
                lockNote: prereqMissing ? `Unlock ${req!.name} first.` : null,
                demo: u.id === 'cannonball_rack', special: false, category: u.category,
                comingSoon: COMING_SOON_UPGRADES.has(u.id),
                tierLabel: ti ? `${romanTier(ti.tier)} of ${romanTier(ti.total)}` : undefined,
                art: u.art,
              }
            })
            // Auto Catcher is a Davy's-Locker fishing perk (bought with Fathoms
            // via buySpecialItem) — Don's Permanent Upgrades doesn't re-list it.
            const ac = variant === 'davy' ? getSpecialItem('auto_catcher') : null
            const autoCatcher: ShopEntry | null = ac ? {
              id: 'auto_catcher', name: ac.name, description: ac.description,
              depthRequired: ac.requiresGauntletDepth ?? 5, cost: ac.costFathoms ?? 0,
              scope: 'world', owned: state.hasAutoCatcher,
              lockNote: state.hasAutoCaster ? null : 'Buy the Auto Caster in the fishing shop first.',
              demo: false, special: true, category: 'fishing',
            } : null
            // Run shop reads as a clean cheap→dear ladder regardless of catalog
            // order (tier chains stay ordered since I < II < III by cost).
            const runShop = upgrades.filter(e => e.scope === 'gauntlet').sort((a, b) => a.cost - b.cost)
            const shoreShop = [...upgrades.filter(e => e.scope !== 'gauntlet'), ...(autoCatcher ? [autoCatcher] : [])]
            const entries = section === 'run' ? runShop : shoreShop
            // Owned chips: collapse a tier chain to its TOP owned tier (a tier is
            // superseded if an owned entry `requires` it).
            const owned = entries.filter(e => e.owned && !entries.some(o => o.owned && getGauntletUpgrade(o.id)?.requires === e.id))
            // Tiered Run Upgrades (Deep Lungs I/II/III etc.) chain via `requires`.
            // Hide a locked HIGHER tier until its prior tier is bought, so the
            // ladder surfaces one buyable step at a time instead of a wall of
            // "Unlock X first" cards. (Account-perk prereqs stay visible-locked.)
            const forSale = entries.filter(e => !e.owned && !(e.lockNote && e.scope === 'gauntlet'))
            return (
          <>
            {/* Fathoms wallet — the currency you're spending, up top. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '13px 0 0', padding: '0.65rem 0.85rem', borderRadius: 12, background: `${AC}10`, border: `1px solid ${AC}33` }}>
              <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.52rem', color: `${AC}cc` }}>Your Fathoms</span>
              <span className="font-cinzel font-800" style={{ fontSize: '1.2rem', color: AC }}>{fmt(state.fathoms)}</span>
            </div>

            {/* The Don's Tribute — a free daily 10 Fathoms for perk owners. Shown
                only when it's owned AND uncollected today; disappears once taken. */}
            {state.tributeReady && (
              <button
                type="button"
                onClick={claimTribute}
                disabled={claimingTribute}
                className="tap"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', margin: '8px 0 0', padding: '0.6rem 0.85rem', borderRadius: 12, background: `${GOLD}14`, border: `1px solid ${GOLD}55`, boxShadow: `0 0 16px ${GOLD}14`, cursor: claimingTribute ? 'default' : 'pointer' }}
              >
                <span style={{ textAlign: 'left' }}>
                  <span className="font-cinzel font-700" style={{ display: 'block', fontSize: '0.82rem', color: '#f4e2b0', lineHeight: 1.1 }}>The Don’s Tribute</span>
                  <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.46rem', color: `${GOLD}cc` }}>Free · resets daily</span>
                </span>
                <span className="font-cinzel font-800" style={{ fontSize: '0.92rem', color: GOLD, flexShrink: 0 }}>{claimingTribute ? '…' : `+${DONS_DAILY_TRIBUTE_AMOUNT}`}</span>
              </button>
            )}

            {/* Your loadout. Run Upgrades render as a switchboard — each owned
                perk carries an on/off toggle so a player can leave, say,
                Veteran's Start out of the next dive without unlearning it. A
                switched-off perk dims to grey and its effect is skipped. Ship &
                Shore permanents aren't toggleable, so they stay simple claimed
                cards. */}
            {owned.length > 0 && section === 'run' ? (() => {
              const activeCount = owned.filter(e => !state.off.includes(e.id)).length
              return (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                  <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#8a8480' }}>Your Run Perks</p>
                  <p className="font-karla font-700" style={{ fontSize: '0.5rem', color: `${AC}cc` }}>{activeCount} of {owned.length} on</p>
                </div>
                <p className="font-karla" style={{ fontSize: '0.62rem', color: '#7a766e', lineHeight: 1.4, marginBottom: 9 }}>
                  Switch any perk off to leave it out of your next dive. It stays yours — flip it back on any time.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {owned.map(e => {
                    const on = !state.off.includes(e.id)
                    const busyT = toggling === e.id
                    return (
                      <div key={e.id} style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 11, borderRadius: 12, padding: '0.6rem 0.75rem 0.6rem 0.95rem', background: on ? `${AC}0d` : 'rgba(255,255,255,0.03)', border: `1px solid ${on ? `${AC}33` : 'rgba(255,255,255,0.09)'}`, transition: 'background 0.15s, border-color 0.15s' }}>
                        <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: on ? AC : '#57534e', transition: 'background 0.15s' }} />
                        <div style={{ flex: 1, minWidth: 0, opacity: on ? 1 : 0.5, transition: 'opacity 0.15s' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: on ? '#eafffb' : '#c4bfb6', lineHeight: 1.15 }}>{e.name}</p>
                            {e.tierLabel && <span title="Owned tier — higher tiers may be available in the shop." className="font-karla font-800 uppercase tracking-[0.1em]" style={{ flexShrink: 0, fontSize: '0.44rem', color: GOLD, background: `${GOLD}18`, border: `1px solid ${GOLD}55`, borderRadius: 999, padding: '0.14rem 0.4rem' }}>Tier {e.tierLabel}</span>}
                            {!on && <span className="font-karla font-800 uppercase tracking-[0.12em]" style={{ fontSize: '0.44rem', color: '#8a8480', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 999, padding: '0.14rem 0.4rem' }}>Off</span>}
                          </div>
                          <p className="font-karla" style={{ fontSize: '0.68rem', color: on ? '#a7c4bd' : '#8a857c', lineHeight: 1.42, marginTop: 3 }}>{e.description}</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={`${e.name} — ${on ? 'on' : 'off'}`}
                          disabled={busyT}
                          onClick={() => toggle(e.id, !on)}
                          className="tap"
                          style={{ flexShrink: 0, alignSelf: 'center', width: 46, height: 27, borderRadius: 999, padding: 3, cursor: busyT ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start', background: on ? `${AC}3a` : 'rgba(255,255,255,0.06)', border: `1px solid ${on ? `${AC}88` : 'rgba(255,255,255,0.16)'}`, transition: 'background 0.18s, border-color 0.18s', opacity: busyT ? 0.6 : 1 }}
                        >
                          <motion.span layout transition={{ type: 'spring', stiffness: 620, damping: 34 }} aria-hidden style={{ width: 19, height: 19, borderRadius: '50%', background: on ? AC : '#7a756c', boxShadow: '0 1px 3px rgba(0,0,0,0.45)' }} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
              )
            })() : owned.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#8a8480', marginBottom: 7 }}>
                  {`Owned · ${owned.length}`}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {owned.map(e => (
                    <div key={e.id} style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, padding: '0.6rem 0.8rem 0.6rem 0.95rem', background: `${AC}0d`, border: `1px solid ${AC}33` }}>
                      <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: AC }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* A milestone keeps its picture once bought. Dropping
                            it here would make the thing you were sold and the
                            thing you own look like two different unlocks. */}
                        {e.art && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={e.art} alt="" aria-hidden decoding="async" loading="lazy"
                            style={{ flexShrink: 0, width: 26, height: 26, objectFit: 'contain' }}
                            onError={ev => { (ev.target as HTMLImageElement).style.display = 'none' }} />
                        )}
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={AC} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 6 9 17l-5-5" /></svg>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#eafffb', lineHeight: 1.15 }}>{e.name}</p>
                      </div>
                      <p className="font-karla" style={{ fontSize: '0.7rem', color: '#a7c4bd', lineHeight: 1.45, marginTop: 4 }}>{e.description}</p>
                    </div>
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
              // Permanent Upgrades — grouped by what each upgrade affects.
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {SHORE_CATEGORIES.map(cat => {
                  // Milestone unlocks lead their section. They open whole boards
                  // rather than nudging a number, so burying them under stat
                  // perks sold the wrong thing first. Order within each half is
                  // catalog order, which already runs cheap to dear.
                  const group = forSale.filter(e => e.category === cat.id)
                    .sort((a, b) => Number(!!b.art) - Number(!!a.art))
                  if (group.length === 0) return null
                  return (
                    <div key={cat.id}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                        <span style={{ color: AC, display: 'flex' }}>{cat.icon}</span>
                        <span className="font-cinzel font-800" style={{ fontSize: '0.88rem', color: '#eafffb', letterSpacing: '0.02em' }}>{cat.label}</span>
                        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{group.map(e => <Card key={e.id} e={e} />)}</div>
                    </div>
                  )
                })}

                {/* Lures — Fathoms-buyable premium bait. CONSUMABLE (repeatable),
                    so it sits apart from the one-time upgrade cards above. */}
                {FATHOM_BAITS().length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                      <span style={{ color: AC, display: 'flex' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v6" /><circle cx="12" cy="14" r="5" /><path d="M12 19v2" /></svg>
                      </span>
                      <span className="font-cinzel font-800" style={{ fontSize: '0.88rem', color: '#eafffb', letterSpacing: '0.02em' }}>Lures</span>
                      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                    </div>
                    <p className="font-karla" style={{ fontSize: '0.66rem', color: '#8a8480', marginBottom: 9, lineHeight: 1.4 }}>The finest bait in the sea, restocked with Fathoms. Buy as many bundles as you like.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {FATHOM_BAITS().map(b => {
                        const cost = b.fathomCost ?? 0
                        const bundle = b.fathomBundle ?? 0
                        const canAfford = state.fathoms >= cost
                        const busy = claiming === 'lure:' + b.type
                        const buyable = canAfford && !busy
                        const justBought = lureBought === b.type
                        const effect = `${Math.round((1 - b.waitMult) * 100)}% faster bites${b.catchZoneBonus > 0 ? ` · +${b.catchZoneBonus}° zone` : ''}`
                        return (
                          <div key={b.type} style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 11, borderRadius: 14, padding: '0.7rem 0.85rem 0.7rem 0.9rem', background: 'rgba(255,255,255,0.035)', border: `1px solid ${buyable ? `${b.color}44` : 'rgba(255,255,255,0.1)'}` }}>
                            <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: b.color }} />
                            {b.imageUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={b.imageUrl} alt="" style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0, filter: `drop-shadow(0 0 8px ${b.color}55)` }} />
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p className="font-cinzel font-700" style={{ fontSize: '0.96rem', color: '#f0ede8', lineHeight: 1.15 }}>{b.name} <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#8a8480' }}>· ×{bundle}</span></p>
                              <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: b.color, marginTop: 2 }}>{effect}</p>
                              {b.hint && <p className="font-karla font-400 italic" style={{ fontSize: '0.6rem', color: '#8a8480', marginTop: 2, lineHeight: 1.3 }}>{b.hint}</p>}
                              {justBought && <p className="font-karla font-700" style={{ fontSize: '0.62rem', color: '#7fd49a', marginTop: 3 }}>+{bundle} added to your bait.</p>}
                            </div>
                            <button
                              type="button"
                              onClick={buyable ? () => buyLure(b.type) : undefined}
                              disabled={!buyable}
                              className="tap"
                              style={{ flexShrink: 0, alignSelf: 'center', width: 66, padding: '0.5rem 0.4rem', borderRadius: 11, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, lineHeight: 1, cursor: buyable ? 'pointer' : 'default', color: buyable ? AC : '#6a6764', background: buyable ? `${AC}1c` : 'rgba(255,255,255,0.04)', border: `1px solid ${buyable ? `${AC}66` : 'rgba(255,255,255,0.1)'}` }}
                            >
                              <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.1em', opacity: 0.85 }}>{busy ? '' : canAfford ? 'Buy' : 'Need'}</span>
                              <span className="font-cinzel font-800" style={{ fontSize: '1rem' }}>{busy ? '…' : fmt(cost)}</span>
                              <span className="font-karla font-700 uppercase" style={{ fontSize: '0.4rem', letterSpacing: '0.08em', opacity: 0.7 }}>Fathoms</span>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
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
@keyframes gauntMaw { 0%, 100% { transform: translateY(0) scale(1) } 50% { transform: translateY(-8px) scale(1.035) } }
@keyframes gauntRing { 0% { transform: scale(0.42); opacity: 0 } 16% { opacity: 0.55 } 100% { transform: scale(1.85); opacity: 0 } }
@keyframes gauntShaft { 0%, 100% { opacity: 0.14 } 50% { opacity: 0.3 } }
@keyframes gauntFog { 0%, 100% { transform: translateX(-5%) scale(1.05); opacity: 0.4 } 50% { transform: translateX(5%) scale(1.14); opacity: 0.72 } }
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
  { left: 17, size: 3, dur: 11, delay: 3.5 },
  { left: 38, size: 2, dur: 13, delay: 8 },
  { left: 68, size: 3, dur: 10, delay: 4.5 },
  { left: 84, size: 2, dur: 12, delay: 9 },
  { left: 48, size: 4, dur: 8.5, delay: 6.5 },
]

// Gold shockwave rings off a legendary boon card as it flips open.
function BoonShockRings() {
  const color = '#f5b94a'
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5, overflow: 'visible' }}>
      {[0, 0.14, 0.28].map((d, i) => (
        <span key={i} style={{
          position: 'absolute', left: '50%', top: '50%', width: 84, height: 84, marginLeft: -42, marginTop: -42,
          borderRadius: '50%', border: `2px solid ${color}`, boxShadow: `0 0 12px ${color}88`,
          animation: `crew-shock 1.1s ${d}s ease-out both`,
        }} />
      ))}
    </div>
  )
}

// A modest gold spark burst from a legendary boon card's center.
function BoonSparks() {
  const colors = ['#ffe48a', '#ffd23c', '#ffb800', '#fff3c0']
  const count = 30
  const sparks = Array.from({ length: count }, (_, i) => {
    // Deterministic-ish spread (no Math.random in a render-pure helper is fine
    // here, but a touch of variance reads better) — vary by index.
    const angle = (Math.PI * 2 * i) / count + (i % 3 - 1) * 0.22
    const dist = 50 + (i % 5) * 22
    return {
      id: i,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist - 12,
      size: 3 + (i % 4),
      color: colors[i % colors.length],
      delay: (i % 6) * 0.025,
      dur: 0.7 + (i % 4) * 0.12,
    }
  })
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5, overflow: 'visible' }}>
      {sparks.map(p => (
        <motion.span key={p.id}
          initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
          animate={{ x: p.x, y: p.y, scale: [0.3, 1, 0.55], opacity: [0, 1, 0] }}
          transition={{ duration: p.dur, delay: p.delay, ease: 'easeOut' }}
          style={{
            position: 'absolute', left: '50%', top: '50%',
            width: p.size, height: p.size, marginLeft: -p.size / 2, marginTop: -p.size / 2,
            borderRadius: '50%', background: p.color, boxShadow: `0 0 6px ${p.color}, 0 0 12px ${p.color}88`,
          }} />
      ))}
    </div>
  )
}

// Hardcore end-of-run backdrop (claim + death screens): the painted blood-red
// battle sea, shown with only a LIGHT scrim (no heavy AbyssBackdrop tint) so the
// scene reads vibrant behind the reward chest / death beat. Same art the hardcore
// fights use, so the whole run reads as one place.
function HcSeaBackdrop() {
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/hc-gauntlet-battle.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(8,1,2,0.16) 0%, rgba(6,1,2,0.32) 50%, rgba(4,0,1,0.62) 100%)' }} />
    </div>
  )
}

/** Flat darkening layer that sits between the animated abyss and a screen's
 *  content. The backdrop is busy and MOVES, so text and translucent cards laid
 *  straight onto it wash in and out as it breathes. Every gauntlet screen pairs
 *  its backdrop with one of these. Sits at zIndex 0 like the backdrop, so any
 *  screen's own coloured wash (rendered after it) still paints on top, and
 *  content at zIndex 1 stays above everything. */
function AbyssScrim() {
  return (
    <div aria-hidden style={{
      position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
      background: 'linear-gradient(180deg, rgba(4,8,14,0.52) 0%, rgba(4,8,14,0.7) 50%, rgba(3,6,12,0.82) 100%)',
    }} />
  )
}

function AbyssBackdrop({ hardcore, don }: { hardcore?: boolean; don?: boolean }) {
  // Hardcore recolors the whole abyss blood-dark; Don's Gauntlet washes it a
  // scary kraken green (deep bile-green rays + motes, near-black green vignette).
  // Hardcore wins if both (Blood Gems own the red). Same motion, different
  // palette, so every meta screen reads its mode at a glance.
  const mode = hardcore ? 'hc' : don ? 'don' : 'base'
  const bg = mode === 'hc'
    ? 'radial-gradient(ellipse 130% 80% at 50% -12%, rgba(120,22,28,0.5) 0%, rgba(46,8,12,0.66) 36%, rgba(6,1,2,0.98) 76%), #060102'
    : mode === 'don'
    ? 'radial-gradient(ellipse 130% 80% at 50% -12%, rgba(20,74,52,0.52) 0%, rgba(8,32,22,0.66) 36%, rgba(2,8,5,0.98) 76%), #030905'
    : 'radial-gradient(ellipse 130% 80% at 50% -12%, rgba(34,64,98,0.55) 0%, rgba(10,20,34,0.62) 36%, rgba(2,5,10,0.97) 76%), #02040a'
  const shaft = mode === 'hc' ? 'rgba(224,90,90,0.16)' : mode === 'don' ? 'rgba(80,200,140,0.15)' : 'rgba(120,180,220,0.18)'
  const shaft2 = mode === 'hc' ? 'rgba(224,90,90,0.12)' : mode === 'don' ? 'rgba(80,200,140,0.11)' : 'rgba(120,180,220,0.13)'
  const mote = mode === 'hc' ? 'rgba(240,120,120,0.5)' : mode === 'don' ? 'rgba(120,230,175,0.52)' : 'rgba(150,200,230,0.55)'
  const vignette = mode === 'hc'
    ? 'radial-gradient(ellipse at 50% 42%, transparent 40%, rgba(60,2,6,0.5) 82%, rgba(10,0,1,0.82) 100%)'
    : mode === 'don'
    ? 'radial-gradient(ellipse at 50% 42%, transparent 44%, rgba(4,32,20,0.5) 82%, rgba(1,10,6,0.85) 100%)'
    : 'radial-gradient(ellipse at 50% 42%, transparent 48%, rgba(0,0,0,0.6) 100%)'
  // Custom painted abyss for the two live gauntlets. Hardcore keeps the pure
  // blood-red CSS abyss (Blood Gems own the red). The animated fog / god-rays /
  // motes / vignette below layer OVER the painting so it still breathes.
  const bgImg = mode === 'don' ? '/dons-gauntlet-bg.jpg' : mode === 'base' ? '/davy-gauntlet-bg.jpg' : null
  return (
    <>
      <style>{ABYSS_KEYFRAMES}</style>
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden',
        background: bg,
      }}>
        {/* Painted abyss base (Davy / Don) under a dark tint so the meta panels
            still read; the animated layers below drift over it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {bgImg && <img src={bgImg} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        {bgImg && <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,6,12,0.66)' }} />}
        {/* Extra darkening through the middle band, where the choice screens'
            menus + text sit — the painted art is brightest dead-center, so a soft
            central scrim keeps translucent cards legible without muddying the
            edges of the scene. */}
        {bgImg && <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 92% 82% at 50% 46%, rgba(2,5,10,0.34) 0%, rgba(2,5,10,0.14) 46%, transparent 72%)' }} />}
        {/* Drifting fog banks — slow, soft, so the deep feels like it's moving. */}
        <div style={{ position: 'absolute', top: '4%', left: '-10%', width: '70%', height: '55%', filter: 'blur(34px)', background: `radial-gradient(ellipse at center, ${shaft}, transparent 70%)`, animation: 'gauntFog 19s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '2%', right: '-12%', width: '75%', height: '52%', filter: 'blur(38px)', background: `radial-gradient(ellipse at center, ${shaft2}, transparent 72%)`, animation: 'gauntFog 24s ease-in-out infinite reverse', animationDelay: '3s' }} />
        {/* God-rays from the surface */}
        <div style={{ position: 'absolute', top: '-12%', left: '20%', width: 130, height: '95%', transform: 'rotate(9deg)', filter: 'blur(10px)', background: `linear-gradient(to bottom, ${shaft}, transparent 68%)`, animation: 'gauntShaft 7s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '-12%', left: '62%', width: 100, height: '95%', transform: 'rotate(-7deg)', filter: 'blur(10px)', background: `linear-gradient(to bottom, ${shaft2}, transparent 64%)`, animation: 'gauntShaft 9s ease-in-out infinite', animationDelay: '1.5s' }} />
        <div style={{ position: 'absolute', top: '-12%', left: '40%', width: 72, height: '90%', transform: 'rotate(3deg)', filter: 'blur(12px)', background: `linear-gradient(to bottom, ${shaft2}, transparent 60%)`, animation: 'gauntShaft 11s ease-in-out infinite', animationDelay: '3.5s' }} />
        {/* Motes rising from the deep */}
        {MOTES.map((m, i) => (
          <div key={i} style={{
            position: 'absolute', bottom: -10, left: `${m.left}%`,
            width: m.size, height: m.size, borderRadius: '50%',
            background: mote, boxShadow: `0 0 6px ${mote}`,
            animation: `gauntRise ${m.dur}s linear ${m.delay}s infinite`,
          }} />
        ))}
        {/* Vignette to keep the focus center */}
        <div style={{ position: 'absolute', inset: 0, background: vignette }} />
      </div>
    </>
  )
}

// ── Small presentational helpers ──────────────────────────────────────────────
function Shell({ children, wide, hardcore }: { children: React.ReactNode; wide?: boolean; hardcore?: boolean }) {
  return (
    <>
      <AbyssBackdrop hardcore={hardcore} />
      <AbyssScrim />
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
          // No backdrop-filter (2026-07-11 perf audit): the panel is 86-93%
          // opaque so the blur was imperceptible, but it forced continuous
          // recomposite over the animated abyss backdrop (and backdrop-filter
          // in this PWA scroller has bitten before — see DepthBar below).
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

function DepthBar({ depth, pot, isBoss, isElite, affixName, curses, isHardcore, potGain, uncharted, pressure = 0, signedTerms = {}, contract = null, marks = [] }: { depth: number; pot: number; isBoss: boolean; isElite: boolean; affixName?: string; curses: number; isHardcore?: boolean; potGain?: { amount: number; key: number; boss: boolean } | null; uncharted?: boolean; pressure?: number; signedTerms?: SignedTerms; contract?: ContractOffer | null; marks?: ChosenMark[] }) {
  const sharkMarks = marks.filter(m => m.type === 'shark').length
  const whaleMarks = marks.filter(m => m.type === 'whale').length
  // The bar shows only the ESSENTIALS on one immovable row; tapping it opens
  // the detail panel (full affix names, exact pot, curse count, hardcore
  // note). Long dual-affix names + fat pots used to wrap the flex row and
  // grow the header, which shifted the whole combat stage below it.
  const [open, setOpen] = useState(false)
  const tag = isBoss ? 'BOSS' : isElite ? 'ELITE' : null
  const tagColor = isBoss ? '#f87171' : '#c084fc'
  // Compact pot so the row never grows with the number (full ⟡ in the panel).
  const potShort = pot >= 10_000 ? `${(pot / 1000).toFixed(1)}k` : fmt(pot)
  return (
    <div style={{ position: 'relative' }}>
      <div
        role="button" aria-label="Run details" aria-expanded={open}
        onClick={() => { hapticTap(); setOpen(o => !o) }}
        // FULLY OPAQUE, no backdrop-filter. This bar is position:sticky inside the
        // PWA's -webkit-overflow-scrolling:touch combat scroller; backdrop-filter on
        // a sticky element there is an iOS repaint bug — during the aim-bar swap it
        // failed to repaint (the bar "disappeared") AND mis-composited the hit-test
        // layer below, so the Lock button's tap target drifted off its paint spot.
        //
        // ONE ROW, ALWAYS: 1fr/auto/1fr grid + nowrap cells. The center column
        // holds the hardcore skull so it sits EXACTLY mid-bar; both side
        // columns clip rather than wrap.
        style={{
          display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', columnGap: 8,
          background: '#050b13', border: isHardcore ? '1px solid rgba(220,38,38,0.55)' : `1px solid ${GOLD}28`,
          borderRadius: 14, padding: '0.4rem 0.8rem', cursor: 'pointer',
          boxShadow: isHardcore ? '0 0 16px rgba(200,20,32,0.32), inset 0 0 10px rgba(120,10,18,0.3)' : undefined,
        }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          <span className="font-karla font-600" style={{ fontSize: '0.46rem', color: GOLD + 'bb', letterSpacing: '0.1em', textShadow: uncharted ? `0 0 8px ${GOLD}88` : undefined }}>{uncharted ? 'UNCHARTED' : 'DEPTH'}</span>
          <span className="font-cinzel font-800" style={{ fontSize: '1rem', color: GOLD, lineHeight: 1 }}>{depth}</span>
          {tag && <span className="font-cinzel font-700" style={{ fontSize: '0.56rem', color: tagColor, letterSpacing: '0.06em' }}>{tag}</span>}
          {/* Active job — a pulsing briefcase so a taken contract reads at a glance
              WITHOUT a banner shoving the combat stage down. Tap the bar for the
              full job (goal, reward, penalty) in the detail panel below. */}
          {contract && (
            <motion.span aria-label="Active job — tap for details" title="Active job"
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.25, repeat: Infinity, ease: 'easeInOut' }}
              style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 17, height: 17, borderRadius: 5, color: '#3fbf82', background: 'rgba(63,191,130,0.18)', border: '1px solid rgba(63,191,130,0.55)', boxShadow: '0 0 8px rgba(63,191,130,0.5)', flexShrink: 0 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </motion.span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isHardcore && (
            <span aria-label="Hardcore — your crew die for good if you sink" title="Hardcore — your crew die for good if you sink"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', color: '#fca5a5', background: 'rgba(140,10,20,0.4)', border: '1px solid rgba(220,38,38,0.6)', boxShadow: '0 0 10px rgba(220,38,38,0.4)' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a7 7 0 0 0-7 7v3.4c0 .9.6 1.7 1.5 2l.5.2V19a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3.4l.5-.2c.9-.3 1.5-1.1 1.5-2V10a7 7 0 0 0-7-7Z" /><circle cx="9" cy="11" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="11" r="1.3" fill="currentColor" stroke="none" /></svg>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, minWidth: 0, whiteSpace: 'nowrap' }}>
          {curses > 0 && (
            <span className="flex items-baseline gap-1">
              <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', color: '#f8717199', letterSpacing: '0.08em' }}>CURSED</span>
              <span className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#f87171', lineHeight: 1 }}>{curses}</span>
            </span>
          )}
          {/* The Terms you signed, carried for the whole dive so you never forget
              what you agreed to (or what it's paying you). */}
          {pressure > 0 && (
            <span className="flex items-baseline gap-1">
              <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', color: '#f0c04099', letterSpacing: '0.08em' }}>PRESSURE</span>
              <span className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#f0c040', lineHeight: 1 }}>{pressure}</span>
            </span>
          )}
          {/* Don's Marks earned this run — a count here, the shark/whale breakdown
              + every buff in the tap panel below (was a separate banner). */}
          {marks.length > 0 && (
            <span className="flex items-baseline gap-1">
              <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', color: '#e0a94a99', letterSpacing: '0.08em' }}>MARKS</span>
              <span className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#e0a94a', lineHeight: 1 }}>{marks.length}</span>
            </span>
          )}
          <span className="flex items-baseline gap-1" style={{ position: 'relative' }}>
            <span className="font-karla font-600" style={{ fontSize: '0.46rem', color: '#9a948a', letterSpacing: '0.08em' }}>POT</span>
            {/* keyed by the gain so each kill re-pops the number */}
            <motion.span key={potGain?.key ?? 'pot'} initial={{ scale: potGain ? 1.22 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#e8dfc8', display: 'inline-block' }}>{potShort} ⟡</motion.span>
            {/* "+N ⟡" float — every kill feeds the pot visibly; boss hauls run gold. */}
            <AnimatePresence>
              {potGain && (
                <motion.span key={`gain-${potGain.key}`}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: [0, 1, 1, 0], y: -16 }} exit={{ opacity: 0 }}
                  transition={{ duration: 1.15, times: [0, 0.15, 0.7, 1] }}
                  className="font-cinzel font-700"
                  style={{ position: 'absolute', right: 0, top: -14, fontSize: potGain.boss ? '0.78rem' : '0.66rem', color: potGain.boss ? GOLD : '#cbbd9a', whiteSpace: 'nowrap', pointerEvents: 'none', textShadow: potGain.boss ? `0 0 10px ${GOLD}88` : undefined }}>
                  +{fmt(potGain.amount)} ⟡
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          <svg aria-hidden width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#7a746a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : undefined }}><path d="M6 9l6 6 6-6" /></svg>
        </div>
      </div>

      {/* Tap-for-details panel — everything the one-row bar elides. Anchored
          under the sticky bar; tapping it (or the bar) closes it. */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 40,
            background: '#0a1220', border: `1px solid ${isHardcore ? 'rgba(220,38,38,0.5)' : GOLD + '40'}`,
            borderRadius: 12, padding: '0.65rem 0.85rem', boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
          }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <p className="font-karla" style={{ fontSize: '0.72rem', color: '#e8dfc8' }}>
              <span style={{ color: GOLD }}>Depth {depth}</span>
              {isBoss ? ' — a BOSS holds this water.' : isElite ? ` — Elite${affixName ? `: ${affixName}` : ''}.` : ' — open water.'}
            </p>
            <p className="font-karla" style={{ fontSize: '0.72rem', color: '#cfc9bf' }}>Pot: {fmt(pot)} ⟡</p>
            <p className="font-karla" style={{ fontSize: '0.72rem', color: curses > 0 ? '#f8a5a5' : '#8a847a' }}>
              {curses > 0 ? `${curses} curse${curses === 1 ? '' : 's'} on the run — see your loadout at the next breather.` : 'No curses on the run yet.'}
            </p>
            {isHardcore && (
              <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#fca5a5' }}>Hardcore — your crew die for good if you sink.</p>
            )}

            {/* Active job (Don's contract) riding this fight — the goal, the
                reward for clearing it and the penalty for blowing it. Surfaced
                here (tap the bar) instead of a stage-shifting banner. */}
            {contract && (
              <div style={{ marginTop: 4, paddingTop: 7, borderTop: '1px solid rgba(63,191,130,0.28)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#3fbf82' }}>Job · {CONTRACTS[contract.kind].name}</p>
                  <p className="font-karla font-700" style={{ fontSize: '0.62rem', color: '#8a948e', whiteSpace: 'nowrap' }}>{STAKE_LABEL[contract.stake]}</p>
                </div>
                <p className="font-karla" style={{ fontSize: '0.68rem', color: '#cfc9bf', marginTop: 3, lineHeight: 1.35 }}>{CONTRACTS[contract.kind].goal(contract.param)}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: '#7fe0a8', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 999, padding: '0.16rem 0.5rem' }}>▲ {describeReward(contract.reward)}</span>
                  <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: '#f8a5a5', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 999, padding: '0.16rem 0.5rem' }}>▼ {describePenalty(contract.penalty)}</span>
                </div>
              </div>
            )}

            {/* Don's Marks — the trophies earned this run and every buff each is
                granting, shark (offense) + whale (defense). */}
            {marks.length > 0 && (
              <div style={{ marginTop: 4, paddingTop: 7, borderTop: '1px solid rgba(224,169,74,0.28)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#e0a94a' }}>Don&rsquo;s Marks &times;{marks.length}</p>
                  <p className="font-karla font-700" style={{ fontSize: '0.62rem', color: '#8a847a', whiteSpace: 'nowrap' }}>{sharkMarks} Shark &middot; {whaleMarks} Whale</p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                  {marks.flatMap((m, mi) => m.buffs.map((b, bi) => (
                    <span key={`${mi}-${bi}`} className="font-karla font-700"
                      style={{ fontSize: '0.58rem',
                        color: m.type === 'shark' ? '#f0b78a' : '#8fd0d8',
                        background: m.type === 'shark' ? 'rgba(240,150,90,0.1)' : 'rgba(120,200,215,0.1)',
                        border: `1px solid ${m.type === 'shark' ? 'rgba(240,150,90,0.3)' : 'rgba(120,200,215,0.3)'}`,
                        borderRadius: 999, padding: '0.16rem 0.5rem' }}>
                      {describeBuff(b)}
                    </span>
                  )))}
                </div>
              </div>
            )}

            {/* DAVY'S TERMS — the one-row bar only has space for the Pressure
                number, so the full contract lives here: every term you signed,
                at what tier, what it is doing to you, and what it is paying. */}
            {pressure > 0 && (
              <div style={{ marginTop: 4, paddingTop: 7, borderTop: '1px solid rgba(240,192,64,0.22)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: GOLD }}>Terms Signed</p>
                  <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: GOLD, whiteSpace: 'nowrap' }}>
                    {pressure} Pressure, ×{pressureGemMult(pressure, PRESSURE_DEPTH_FULL).toFixed(2)} gems
                  </p>
                </div>
                <p className="font-karla" style={{ fontSize: '0.64rem', color: '#8a847a', marginTop: 2 }}>
                  Full value from depth {PRESSURE_DEPTH_FULL}. You must cash out alive to collect.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                  {GAUNTLET_TERMS
                    .filter(t => (signedTerms[t.id] ?? 0) >= 1)
                    .map(t => {
                      const tier = Math.min(signedTerms[t.id], t.tiers.length)
                      const roman = ['', 'I', 'II', 'III'][tier]
                      return (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <span className="font-karla font-800" style={{ flexShrink: 0, fontSize: '0.56rem', color: '#1a0c0c', background: TERM_GROUP_META[t.group].accent, borderRadius: 999, padding: '0.1rem 0.34rem', marginTop: 1 }}>
                            {roman}
                          </span>
                          <p className="font-karla" style={{ flex: 1, minWidth: 0, fontSize: '0.68rem', color: '#d8d0c4', lineHeight: 1.35 }}>
                            <span className="font-700" style={{ color: '#f0e6d8' }}>{t.name}</span>
                            <span style={{ color: '#8a847a' }}> {t.tiers[tier - 1].desc}</span>
                          </p>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
