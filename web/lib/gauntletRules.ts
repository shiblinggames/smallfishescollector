// ── THE GAUNTLET'S SETTLEMENT RULES, WITH NO DATABASE IN THEM (Steam prep, Phase B, 2026-09-28) ──
//
// The run itself was already pure (lib/gauntlet, lib/gauntletOffer,
// lib/gauntletTerms). What still lived inline in raids/gauntlet/actions was the
// SETTLEMENT: how the reported depths are held against the run clock, what a
// cash-out pays (the chest, the chase drops in their fixed roll order, Blood
// Gems, doubloons, Nav XP, gems, Fathoms, crew XP), what a death pays, which
// record a finish claims, the daily cooldown, the shrine's coin, and the Don's
// feats. Moved verbatim: no odds and no payout changed. The actions keep who
// is asking, the close-first locks and the writes.
// scripts/check-gauntlet-rules.mts holds the rules.

import { aggregateShipClasses } from '@/lib/shipClasses'
import { navRenownEffects, type RenownAlloc } from '@/lib/renown'
import { termPressure, pressureGemMult, pressureSkinDropChance, PRESSURE_SKIN_ID, type SignedTerms } from '@/lib/gauntletTerms'
import {
  GOLD_HULL_SKIN_ID, GOLD_HULL_CHEST_TIER, BLOOD_HULL_SKIN_ID, BLOOD_HULL_CHEST_TIER, GALAXY_HULL_SKIN_ID, GALAXY_HULL_CHEST_TIER,
  GHOST_HULL_SKIN_ID, GHOST_HULL_CHEST_TIER, GHOST_HULL_DROP_MULT, DONS_GAUNTLET_ITEM_IDS, BLOOD_CANNON_ITEM_ID, BLOOD_CANNON_CHEST_TIER,
  maxPotForDepth, chestForDepth, chestCannonDropChance, chestSkinDropChance, MAX_GAUNTLET_DEPTH, GAUNTLET_REWARD_DEPTH_CAP,
  GAUNTLET_COOLDOWN_MS, fathomsForDepth, gauntletXpForDepth, gauntletCrewXp, DONS_CHEST_GEM_MULT, HARDCORE_UNLOCKS,
  HC_FATHOMS_MULT, HC_SURVIVOR_XP_MULT, bloodGemsForDepth, type GauntletRunSnapshot, type GauntletVariant,
} from '@/lib/gauntlet'
import { activeGauntletUpgrades, gauntletHaulMult, gauntletXpMult, gauntletFathomsMult, donsBloodGemMult, gauntletStartDepth } from '@/lib/gauntletUpgrades'
import { DAVY_FORGE } from '@/lib/raidItems'
import { offerCoinMult, offerFathomMult, offerChestMult, EMPTY_OFFER_STATE, CHEST_ODDS_CAP, type OfferState, type DavyOffer } from '@/lib/gauntletOffer'
import { fortuneLootMult } from '@/lib/expeditions'
import { rngNext } from '@/lib/rng'
import { clockNow } from '@/lib/clock'

// ── The run clock ───────────────────────────────────────────────────────────

/**
 * ACTIVE TIME ON THE OPEN RUN. Wall clock measures how long ago you started (a
 * gauntlet pauses, resumes and survives a crash), so the run checkpoints at
 * every breather and the gaps between ticks are summed. A gap longer than the
 * cap is somebody who walked away and is dropped, so the figure is an
 * UNDER-estimate at worst, never an over-estimate.
 */
export const ACTIVE_GAP_CAP_MS = 5 * 60_000

/**
 * THE FASTEST A DEPTH CAN HONESTLY FALL. Four seconds: every honest personal
 * best takes at least nine for depth one and slows from there, while the
 * forged rows were two seconds for seventy depths. A SPEED BUMP, NOT A LOCK:
 * until each fight is checkpointed server-side, a patient forger is still paid
 * at an honest rate.
 */
export const MIN_MS_PER_DEPTH = 4_000

/** Fold the time since the last tick into the run's total. `stop` leaves the
 *  clock off, for a pause or a finish; otherwise the next tick measures from now. */
export function tickActiveMs(
  prevMs: number | null | undefined,
  tickAt: string | null | undefined,
  { stop = false }: { stop?: boolean } = {},
): { gauntlet_run_active_ms: number; gauntlet_run_tick_at: string | null } {
  const now = clockNow()
  const prev = Math.max(0, Number(prevMs ?? 0))
  const since = tickAt ? now - new Date(tickAt).getTime() : 0
  const add = since > 0 ? Math.min(since, ACTIVE_GAP_CAP_MS) : 0
  return { gauntlet_run_active_ms: prev + add, gauntlet_run_tick_at: stop ? null : new Date(now).toISOString() }
}

/** The daily run: open again GAUNTLET_COOLDOWN_MS after the last start.
 *  Admins bypass it to test the curve. */
export function gauntletCooldown(lastRunAt: string | null | undefined, isAdmin: boolean): { available: boolean; nextMs: number } {
  const last = lastRunAt ? new Date(lastRunAt).getTime() : 0
  const nextMs = last + GAUNTLET_COOLDOWN_MS
  return { available: isAdmin || clockNow() >= nextMs, nextMs }
}

/** The shrine's coin: double or nothing, even odds. */
export const shrineWon = () => rngNext() < 0.5

// ── The depths ──────────────────────────────────────────────────────────────

/**
 * THE TWO DEPTHS A FINISH SETTLES ON. rewardDepth (ships actually sunk) drives
 * the chest, pot and Fathoms, so Veteran's Start is no loot shortcut; it is
 * clamped to the depth cap and to what the run clock allows. combatDepth (how
 * deep you reached) drives the records, and may sit above the reward depth by
 * exactly the Veteran's Start head start and no more.
 */
export function settleDepths(rewardDepth: number, combatDepth: number, clockMs: number, ownedUpgrades: string[]): { rd: number; cd: number } {
  const timeDepth = Math.floor(clockMs / MIN_MS_PER_DEPTH)
  const rd = Math.max(0, Math.min(MAX_GAUNTLET_DEPTH, Math.floor(rewardDepth), timeDepth))
  const headStart = gauntletStartDepth(ownedUpgrades) - 1
  const cd = Math.max(rd, Math.min(MAX_GAUNTLET_DEPTH, Math.floor(combatDepth), rd + headStart))
  return { rd, cd }
}

/** Fathoms for the ships sunk, less what was spent at the Fence this run
 *  (run-scoped: a purchase never turns the grant negative or dips into the
 *  banked purse). Hardcore banks at the normal rate (HC_FATHOMS_MULT = 1). */
export function runFathoms(rd: number, variant: GauntletVariant, activeUpgrades: string[], opts: { hc?: boolean; offer?: DavyOffer | null; fenceSpent?: number } = {}): number {
  // A death passes neither: both multipliers are then exactly 1.
  const gross = Math.round(fathomsForDepth(rd, variant) * gauntletFathomsMult(activeUpgrades) * (opts.hc ? HC_FATHOMS_MULT : 1) * offerFathomMult(opts.offer ?? null))
  return Math.max(0, gross - Math.max(0, Math.round(opts.fenceSpent ?? 0)))
}

// ── The cash-out ────────────────────────────────────────────────────────────

export type CashOutInput = {
  variant: GauntletVariant
  hc: boolean
  rd: number
  cd: number
  pot: number
  /** This gauntlet's Locker: owned and switched off. */
  owned: string[]
  off: string[]
  /** Both Lockers' owned upgrades (account perks like the Crimson Tithe). */
  accountUpgrades: string[]
  offerState: OfferState | null
  takeOffer: boolean
  terms: SignedTerms | null
  ownedItems: string[]
  ownedSkins: string[]
  totalFortune: number
  shipClasses: Record<string, string> | null
  navRenownAlloc: RenownAlloc | null
  prevHcDeepest: number
  prevDeepest: number
  fenceSpent: number
}

export type CashOutHaul = {
  payDepth: number
  chest: ReturnType<typeof chestForDepth>
  offerTaken: DavyOffer | null
  droppedItems: string[]
  droppedSkinId: string | null
  droppedHcSkinId: string | null
  droppedPressureSkinId: string | null
  hcDeepest: number
  hcUnlocks: typeof HARDCORE_UNLOCKS
  grantSkins: string[]
  runPressure: number
  gemMult: number
  earnedBloodGems: number
  bankedDoubloons: number
  bankedXp: number
  gems: number
  earnedFathoms: number
  deepest: number
  crewXp: number
}

/**
 * WHAT A CASH-OUT PAYS, for a run with rd > 0.
 *
 * Everything that PAYS is evaluated at the reward-depth cap; depth past it
 * still counts for the record. Davy's Offer is honoured only if he made one at
 * this very depth. Every chase chance runs through the same capped multiply
 * the breather showed (offer x crew Fortune), and the chases roll in a FIXED
 * order: Davy's cannons (or the Don's items), the Blood Cannon, the hull, the
 * second hull, the Pitch Black Hull, then the Blood Gem amount. Pressure
 * multiplies Blood Gems and nothing else. The chest no longer multiplies Nav
 * XP (2026-09-18).
 */
export function cashOutHaul(i: CashOutInput): CashOutHaul {
  const isDon = i.variant === 'don'
  const hc = i.hc
  const cd = i.cd
  const payDepth = Math.min(i.rd, GAUNTLET_REWARD_DEPTH_CAP)
  const cleanPot = Math.max(0, Math.min(Math.floor(i.pot), maxPotForDepth(payDepth, i.variant)))
  const chest = chestForDepth(payDepth)
  const upgrades = activeGauntletUpgrades(i.owned, i.off)

  const offerState = i.offerState ?? EMPTY_OFFER_STATE
  const offerTaken: DavyOffer | null = i.takeOffer && offerState.live && offerState.live.depth === i.rd ? offerState.live : null
  const offerChest = offerChestMult(offerTaken)

  const fortuneOdds = fortuneLootMult(i.totalFortune)
  const chestDrop = (c: number) => Math.min(CHEST_ODDS_CAP, c * offerChest * fortuneOdds)
  const dropChance = chestDrop(chestCannonDropChance(cd))
  const droppedItems: string[] = []
  // Purely "do you hold this one": the forge consumes both components, so a
  // forged captain can roll them again (re-forging is blocked by the forge).
  if (!isDon) {
    for (const cannon of DAVY_FORGE.components) {
      if (!i.ownedItems.includes(cannon) && rngNext() < dropChance) droppedItems.push(cannon)
    }
  }
  if (isDon) {
    for (const itemId of DONS_GAUNTLET_ITEM_IDS) {
      if (!i.ownedItems.includes(itemId) && rngNext() < dropChance) droppedItems.push(itemId)
    }
  }
  // The Blood Cannon: hardcore-only, from the deeper chests, while not held.
  if (!isDon && hc && chest.tier >= BLOOD_CANNON_CHEST_TIER && !i.ownedItems.includes(BLOOD_CANNON_ITEM_ID) && rngNext() < chestDrop(chestCannonDropChance(cd))) {
    droppedItems.push(BLOOD_CANNON_ITEM_ID)
  }

  const runPressure = hc ? termPressure(i.terms) : 0

  // The deep-chest Man-o-War hull: Golden (Davy's) or Galaxy (Don's).
  const normalHullId = isDon ? GALAXY_HULL_SKIN_ID : GOLD_HULL_SKIN_ID
  const normalHullTier = isDon ? GALAXY_HULL_CHEST_TIER : GOLD_HULL_CHEST_TIER
  let droppedSkinId: string | null = null
  if (chest.tier >= normalHullTier && !i.ownedSkins.includes(normalHullId) && rngNext() < chestDrop(chestSkinDropChance(cd))) {
    droppedSkinId = normalHullId
  }
  // The second hull: Bad Blood (Davy's, hardcore-only) or Ghost (Don's, half rate).
  const secondHullId = isDon ? GHOST_HULL_SKIN_ID : BLOOD_HULL_SKIN_ID
  const secondHullTier = isDon ? GHOST_HULL_CHEST_TIER : BLOOD_HULL_CHEST_TIER
  const secondHullNeedsHc = !isDon
  const secondHullChance = chestSkinDropChance(cd) * (isDon ? GHOST_HULL_DROP_MULT : 1)
  let droppedHcSkinId: string | null = null
  if ((!secondHullNeedsHc || hc) && chest.tier >= secondHullTier && !i.ownedSkins.includes(secondHullId) && rngNext() < chestDrop(secondHullChance)) {
    droppedHcSkinId = secondHullId
  }
  // The Pitch Black Hull: Davy's, hardcore, heavy AND deep, all on this run.
  let droppedPressureSkinId: string | null = null
  if (!isDon && hc && !i.ownedSkins.includes(PRESSURE_SKIN_ID) && rngNext() < chestDrop(pressureSkinDropChance(runPressure, payDepth))) {
    droppedPressureSkinId = PRESSURE_SKIN_ID
  }
  // The Drowned Fleet skins, the first time a hardcore cash-out passes each milestone.
  const hcDeepest = hc ? Math.max(i.prevHcDeepest, cd) : i.prevHcDeepest
  const hcUnlocks = hc ? HARDCORE_UNLOCKS.filter(u => i.prevHcDeepest < u.depth && u.depth <= hcDeepest) : []
  const hcSkinIds = hcUnlocks.map(u => u.skinId).filter(id => !i.ownedSkins.includes(id))
  const grantSkins = [...(droppedSkinId ? [droppedSkinId] : []), ...(droppedHcSkinId ? [droppedHcSkinId] : []), ...(droppedPressureSkinId ? [droppedPressureSkinId] : []), ...hcSkinIds]

  // Blood Gems: hardcore only, a live roll by depth, lifted by Pressure (ramped
  // in with depth) and the Crimson Tithe.
  const gemMult = pressureGemMult(runPressure, payDepth)
  const baseBloodGems = hc ? bloodGemsForDepth(payDepth, rngNext()) : 0
  const earnedBloodGems = Math.round(baseBloodGems * gemMult * donsBloodGemMult(i.accountUpgrades))

  const navRenown = navRenownEffects(i.navRenownAlloc)
  const doubloonMult = aggregateShipClasses(i.shipClasses ?? {}).doubloonMult * navRenown.doubloonMult
  const bankedDoubloons = Math.round(cleanPot * chest.potMult * doubloonMult * gauntletHaulMult(upgrades) * offerCoinMult(offerTaken))
  const bankedXp = Math.round(gauntletXpForDepth(payDepth, i.variant) * gauntletXpMult(upgrades))
  const gems = Math.round(chest.gems * (isDon ? DONS_CHEST_GEM_MULT : 1))
  const earnedFathoms = runFathoms(i.rd, i.variant, upgrades, { hc, offer: offerTaken, fenceSpent: i.fenceSpent })
  const deepest = hc ? hcDeepest : Math.max(i.prevDeepest, cd)
  const crewXp = Math.round(gauntletCrewXp(payDepth, i.variant) * (hc ? HC_SURVIVOR_XP_MULT : 1) * navRenown.crewXpMult)

  return {
    payDepth, chest, offerTaken, droppedItems, droppedSkinId, droppedHcSkinId, droppedPressureSkinId,
    hcDeepest, hcUnlocks, grantSkins, runPressure, gemMult, earnedBloodGems,
    bankedDoubloons, bankedXp, gems, earnedFathoms, deepest, crewXp,
  }
}

// ── The records ─────────────────────────────────────────────────────────────

/** Which board claim a finish makes. First to a depth wins ties, so the claim
 *  time moves only on a strictly deeper finish; a faster finish at the same
 *  depth improves the shown time and keeps the claim. */
export function recordClaim(cd: number, runMs: number | null, prevBestDepth: number, prevBestMs: number | null): 'deeper' | 'faster' | null {
  if (runMs == null) return null
  if (cd > prevBestDepth) return 'deeper'
  if (cd === prevBestDepth && (prevBestMs == null || runMs < prevBestMs)) return 'faster'
  return null
}

/** The Don's challenge feats, read off the run's own snapshot. */
export function donFeats(snap: GauntletRunSnapshot | undefined, cd: number): string[] {
  if (!snap) return []
  const st = snap.stats
  const curseCount = Object.keys(snap.curses ?? {}).length
  const out: string[] = []
  if (st && st.shots >= 1 && st.shots === (st.megas ?? 0) && cd >= 10) out.push('ultimate_only')
  if (curseCount >= 5 && cd >= 30) out.push('weight_of_green')
  if (st && st.dmgTaken === 0 && cd >= 5) out.push('untouched')
  return out
}
