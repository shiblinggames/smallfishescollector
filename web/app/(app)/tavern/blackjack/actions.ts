'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { handValue, canSplit, type Card, type SettledHand, type HandOutcome } from '@/lib/blackjack'
import {
  dealTable, standAll, insuranceCost, answerInsurance, turnRefusal, hitTable, standTable, doubleRefusal, doubleTable,
  splitRefusal, splitTable, settleTable, nextStreaks, afterRound, casinoDayStart,
  type Phase, type ServerHand, type ServerState,
} from '@/lib/casinoRules'
import { casinoData } from '@/lib/data/casinoData'
import { BJ_MIN_BET, BJ_MAX_BET, denCapFromXp } from '../constants'
import { isPremiumActive } from '@/lib/premium'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import { spend, grant } from '@/lib/wallet'

// ── Server-side state shape (lives in blackjack_hands.state JSONB) ──

// ServerHand, Phase and ServerState, and every move on the table, are
// lib/casinoRules (Phase B). Phase is re-exported for the client.
export type { Phase } from '@/lib/casinoRules'

// ── Client-safe view (what the UI sees) ──

export type CardOrBack = Card | 'X'   // 'X' = hidden hole card

export interface ClientHand {
  cards: Card[]
  wager: number
  doubled: boolean
  stood: boolean
  busted: boolean
  isNatural: boolean
  isSplit: boolean
  total: number
  soft: boolean
}

export interface ClientState {
  handId: number
  phase: Phase
  hands: ClientHand[]
  activeHandIdx: number
  dealerCards: CardOrBack[]     // hole card masked while phase != 'settled'
  dealerUpCard: Card            // never hidden
  dealerTotal: number | null    // null until reveal
  insuranceOffered: boolean     // dealer up = Ace + insurance not yet resolved
  insuranceTaken: boolean
  insuranceAmount: number
  totalWagered: number          // sum across all wagers on this hand (initial + double + split + insurance)
  canHit: boolean
  canStand: boolean
  canDouble: boolean
  canSplit: boolean
  dailyCap: number              // effective shared Den cap (Fishing+Nav level, Captain-scaled)
  dailyRemaining: number        // doubloons still allowed to buy in today (shared casino cap)
  chips: number                 // shared casino chip balance (post-this-hand)
  doubloons: number             // doubloons balance (off-table)
  sessionBuyIns: number         // shared casino session buy-ins (resets on cash-out / bust-out)
  sessionNet: number            // blackjack's win/loss this session (chips are shared, nets are per-game)
}

export interface SettleResult {
  handId: number
  hands: SettledHand[]
  dealerCards: Card[]
  dealerTotal: number
  dealerBust: boolean
  dealerNatural: boolean
  insurance: { taken: boolean; amount: number; paid: number; net: number; win: boolean }
  netDelta: number              // total change in chips across the hand
  newChips: number              // shared casino chip balance post-settle
  doubloons: number             // doubloons balance (unchanged by hand-level actions)
  dailyCap: number              // effective shared Den cap (Fishing+Nav level, Captain-scaled)
  dailyWagered: number          // sum of today's shared casino buy-ins
  sessionBuyIns: number         // shared casino session buy-ins (post-settle)
  sessionNet: number            // blackjack's session net post-settle
}

export type ActionResult =
  | { kind: 'active'; state: ClientState }
  | { kind: 'settled'; result: SettleResult }
  | { error: string }

// ── Daily-wager helper ──
//
// "Daily wagered" tracks BUY-INS into the SHARED casino wallet
// (casino_buy_ins — one cap across blackjack/roulette/slots), not
// per-hand wagers. Chips on the table can churn freely. Buy-in and
// cash-out live in ../casino/actions now; this file only plays hands.

async function getDailyBuyInTotal(userId: string): Promise<number> {
  return casinoData(createAdminClient()).boughtInSince(userId, casinoDayStart())
}

/** Effective shared Den daily cap for this player — Captains climb it with their
 *  combined Fishing+Nav level; non-Captains sit at the flat 2,000 ⟡/day cap. */
async function getDenCap(userId: string): Promise<number> {
  const data = await casinoData(createAdminClient()).profile(userId, 'fishing_xp, expedition_xp, is_premium, premium_expires_at')
  return denCapFromXp((data?.fishing_xp as number | null) ?? 0, (data?.expedition_xp as number | null) ?? 0, isPremiumActive(data))
}

export async function getDailyWagered(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  return getDailyBuyInTotal(user.id)
}

// ── Helpers: state ↔ client view ──

function handTotal(h: ServerHand) { return handValue(h.cards) }

function toClientHand(h: ServerHand): ClientHand {
  const { total, soft } = handTotal(h)
  return { ...h, total, soft }
}

function toClientState(
  handId: number,
  state: ServerState,
  totalWagered: number,
  chips: number,
  doubloons: number,
  dailyRemaining: number,
  dailyCap: number,
  sessionBuyIns: number,
  sessionNet: number,
): ClientState {
  const activeHand = state.hands[state.activeHandIdx]
  const isPlayerTurn = state.phase === 'playerTurn'
  const initialWager = state.hands[0]?.wager ?? 0
  const canHit    = isPlayerTurn && !!activeHand && !activeHand.busted && !activeHand.stood
  const canStand  = canHit
  // Double / split now gate on CHIPS (the in-game stake), not doubloons.
  const canDouble = canHit
    && activeHand.cards.length === 2
    && !activeHand.isSplit
    && chips >= activeHand.wager
  const canSplitNow = canHit
    && state.hands.length === 1     // no re-splitting
    && canSplit(activeHand.cards)
    && chips >= initialWager
  const dealerCards: CardOrBack[] = state.phase === 'settled'
    ? state.dealerCards
    : [state.dealerCards[0], 'X']
  return {
    handId,
    phase: state.phase,
    hands: state.hands.map(toClientHand),
    activeHandIdx: state.activeHandIdx,
    dealerCards,
    dealerUpCard: state.dealerCards[0],
    dealerTotal: state.phase === 'settled' ? handValue(state.dealerCards).total : null,
    insuranceOffered: state.phase === 'insuranceOffered',
    insuranceTaken: state.insuranceTaken,
    insuranceAmount: state.insuranceAmount,
    totalWagered,
    canHit,
    canStand,
    canDouble,
    canSplit: canSplitNow,
    dailyRemaining,
    dailyCap,
    chips,
    doubloons,
    sessionBuyIns,
    sessionNet,
  }
}

// ── Core mutations ──

/** Settle a hand row: compute payouts, update profile, write the
 *  result jsonb + transaction ledger, mark status='settled'. Returns
 *  the SettleResult shaped for the client, or null when another request
 *  settled this hand first (nothing is paid twice). */
async function finalizeSettlement(
  userId: string,
  handId: number,
  state: ServerState,
  initialWager: number,
  totalWagered: number,
): Promise<SettleResult | null> {
  const admin = createAdminClient()
  // Every hand against the dealer, and insurance: lib/casinoRules settleTable.
  // All wagers were taken as they were placed, so the net is what comes back
  // less the total wagered.
  const { settled, dealerFinal, dealerTotal, dealerBust, dealerNatural, insurance, totalReturned, netDelta } = settleTable(state, totalWagered)

  const resultJson = {
    hands: settled,
    dealerCards: dealerFinal,
    dealerTotal,
    dealerBust,
    dealerNatural,
    insurance: { taken: state.insuranceTaken, amount: state.insuranceAmount, paid: insurance.paid, net: insurance.net, win: insurance.win },
    netDelta,
  }

  // Close the hand FIRST, and only if it is still open. Two stands (or a
  // stand racing a hit) fired together both reach here; only the one whose
  // update comes back with a row gets paid.
  const db = casinoData(admin)
  if (!(await db.settleHand(userId, handId, {
    state: null,            // free the active-state JSON
    result: resultJson,
    net_delta: netDelta,
    settled_at: new Date().toISOString(),
  }))) return null

  // Wagers were already taken from chips at action time; the return lands in place.
  const newChips = totalReturned > 0
    ? await grant(admin, userId, 'casino_chips', totalReturned)
    : await getChips(userId)

  const profile = await db.profile(userId, 'doubloons, casino_session_buy_ins, blackjack_session_net, blackjack_win_streak, blackjack_dealer_bj_streak')
  // The shared purse hitting 0 ends the casino session (afterRound), and the
  // badge streaks move (nextStreaks): both lib/casinoRules.
  const { busted, sessionNet: newSessionNet, sessionBuyIns: newSessionBuyIns } = afterRound(
    newChips, (profile?.blackjack_session_net as number | null) ?? 0, netDelta, (profile?.casino_session_buy_ins as number | null) ?? 0)
  const streaks = nextStreaks(netDelta, dealerNatural,
    (profile?.blackjack_win_streak as number | null) ?? 0, (profile?.blackjack_dealer_bj_streak as number | null) ?? 0)
  const newWinStreak = streaks.win
  const newDealerBjStreak = streaks.dealerBj

  // Ledger reason — fold all hand outcomes into a short summary
  const outcomeCounts = settled.reduce<Record<HandOutcome, number>>((acc, h) => {
    acc[h.outcome] = (acc[h.outcome] ?? 0) + 1
    return acc
  }, {} as Record<HandOutcome, number>)
  const reasonParts: string[] = []
  if (outcomeCounts.blackjack) reasonParts.push(`${outcomeCounts.blackjack} BJ`)
  if (outcomeCounts.win)       reasonParts.push(`${outcomeCounts.win} win`)
  if (outcomeCounts.push)      reasonParts.push(`${outcomeCounts.push} push`)
  if (outcomeCounts.lose)      reasonParts.push(`${outcomeCounts.lose} lose`)
  if (state.insuranceTaken)    reasonParts.push(insurance.win ? 'ins +' : 'ins -')
  const reason = `Blackjack: ${reasonParts.join(', ')}`

  // Hand-level settle updates CHIPS only; doubloons move on cash-out.
  // No doubloon_transactions row here — chip movement is internal to
  // the table session and would otherwise bloat the ledger.
  await db.updateProfile(userId, {
    casino_session_buy_ins: newSessionBuyIns,
    blackjack_session_net: newSessionNet,
    blackjack_win_streak: newWinStreak,
    blackjack_dealer_bj_streak: newDealerBjStreak,
    ...(busted ? { roulette_session_net: 0, slots_session_net: 0 } : {}),
  })
  void reason

  // Badge hooks (best-effort): 5-win streak and the dealer's back-to-back naturals.
  if (newWinStreak >= 5) { try { await grantBadgeDirect(userId, 'unstoppable') } catch { /* best-effort */ } }
  if (newDealerBjStreak >= 2) { try { await grantBadgeDirect(userId, 'stacked_deck') } catch { /* best-effort */ } }

  const [dailyWagered, dailyCap] = await Promise.all([getDailyBuyInTotal(userId), getDenCap(userId)])
  const currentDoubloons = (profile?.doubloons as number | null) ?? 0

  return {
    handId,
    hands: settled,
    dealerCards: dealerFinal,
    dealerTotal,
    dealerBust,
    dealerNatural,
    insurance: { taken: state.insuranceTaken, amount: state.insuranceAmount, paid: insurance.paid, net: insurance.net, win: insurance.win },
    netDelta,
    newChips,
    doubloons: currentDoubloons,
    dailyCap,
    dailyWagered,
    sessionBuyIns: newSessionBuyIns,
    sessionNet: newSessionNet,
  } as SettleResult
}

/** Load the active hand (or null) for the user. */
async function loadActiveHand(userId: string): Promise<{ id: number; state: ServerState; initial_wager: number; total_wagered: number } | null> {
  const data = await casinoData(createAdminClient()).activeHand(userId)
  if (!data || !data.state) return null
  return {
    id: data.id as number,
    state: data.state as ServerState,
    initial_wager: data.initial_wager as number,
    total_wagered: data.total_wagered as number,
  }
}

async function persistActiveHand(handId: number, state: ServerState, totalWagered: number): Promise<void> {
  await casinoData(createAdminClient()).saveHand(handId, state, totalWagered)
}

/** Read the player's chip balance (the SHARED casino purse — one
 *  balance across blackjack/roulette/slots). Doubloons are the
 *  off-table currency and don't move during hands. */
async function getChips(userId: string): Promise<number> {
  const data = await casinoData(createAdminClient()).profile(userId, 'casino_chips')
  return (data?.casino_chips as number | null) ?? 0
}

/** Wrap a settlement for the client. null means a twin request already
 *  settled this hand and was paid; this one reports that instead. */
function settledOrError(result: SettleResult | null): ActionResult {
  return result ? { kind: 'settled', result } : { error: 'Hand already settled' }
}

async function getDoubloons(userId: string): Promise<number> {
  const data = await casinoData(createAdminClient()).profile(userId, 'doubloons')
  return (data?.doubloons as number | null) ?? 0
}

/** Shared-session fields: cumulative buy-ins since the last session
 *  reset (cash-out or shared purse hitting 0) + blackjack's own session
 *  net. The header tally shows the NET — chips alone can't tell you how
 *  blackjack went when the same purse also played roulette/slots. */
async function getSessionView(userId: string): Promise<{ sessionBuyIns: number; sessionNet: number }> {
  const data = await casinoData(createAdminClient()).profile(userId, 'casino_session_buy_ins, blackjack_session_net')
  return {
    sessionBuyIns: (data?.casino_session_buy_ins as number | null) ?? 0,
    sessionNet: (data?.blackjack_session_net as number | null) ?? 0,
  }
}

// ── Public actions ──

export async function dealBlackjack(wager: number): Promise<ActionResult> {
  if (!Number.isInteger(wager) || wager < BJ_MIN_BET || wager > BJ_MAX_BET) {
    return { error: 'Invalid wager' }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  // Auto-settle any orphan active hand BEFORE starting a new one. This
  // covers the "player closed the tab mid-hand" case: auto-stand every
  // unfinished hand, let dealer play, settle, then proceed.
  const orphan = await loadActiveHand(user.id)
  if (orphan) {
    standAll(orphan.state)
    await finalizeSettlement(user.id, orphan.id, orphan.state, orphan.initial_wager, orphan.total_wagered)
  }

  // Wagers come out of CHIPS, not doubloons. Daily cap is enforced
  // at buy-in, not per-hand — chips on the table can churn freely.
  // The wager leaves the purse in place up front. That is the guard: two
  // deals fired together cannot both stake the same chips.
  const afterStake = await spend(admin, user.id, 'casino_chips', wager)
  if (afterStake === null) return { error: 'Not enough chips' }

  // A fresh shoe, two and two; an Ace up offers insurance, otherwise a
  // natural on either side settles at once (lib/casinoRules dealTable).
  const state = dealTable(wager)

  // Insert the hand row
  const handId = await casinoData(admin).openHand(user.id, wager, state)
  if (handId == null) {
    await grant(admin, user.id, 'casino_chips', wager)
    return { error: 'Failed to create hand' }
  }

  revalidatePath('/tavern')

  // Naturals with no insurance gate settle at once.
  if (state.phase === 'settled') {
    return settledOrError(await finalizeSettlement(user.id, handId, state, wager, wager))
  }

  const newChips = afterStake
  const dailyAlready = await getDailyBuyInTotal(user.id)
  const dailyCap = await getDenCap(user.id)
  const dailyRemaining = Math.max(0, dailyCap - dailyAlready)
  const doubloons = await getDoubloons(user.id)
  const { sessionBuyIns, sessionNet } = await getSessionView(user.id)
  return { kind: 'active', state: toClientState(handId, state, wager, newChips, doubloons, dailyRemaining, dailyCap, sessionBuyIns, sessionNet) }
}

/** Accept insurance: charge half wager, resolve dealer natural check. */
export async function acceptInsurance(): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const hand = await loadActiveHand(user.id)
  if (!hand) return { error: 'No active hand' }
  if (hand.state.phase !== 'insuranceOffered') return { error: 'Insurance not available' }

  const initialWager = hand.initial_wager
  const insurance = insuranceCost(initialWager)
  const admin = createAdminClient()
  const afterInsurance = await spend(admin, user.id, 'casino_chips', insurance)
  if (afterInsurance === null) return { error: 'Not enough chips for insurance' }
  answerInsurance(hand.state, insurance)
  const totalWagered = hand.total_wagered + insurance
  await persistActiveHand(hand.id, hand.state, totalWagered)
  if ((hand.state.phase as Phase) === 'settled') {
    return settledOrError(await finalizeSettlement(user.id, hand.id, hand.state, initialWager, totalWagered))
  }

  const newChips = afterInsurance
  const dailyAlready = await getDailyBuyInTotal(user.id)
  const dailyCap = await getDenCap(user.id)
  const dailyRemaining = Math.max(0, dailyCap - dailyAlready)
  const doubloons = await getDoubloons(user.id)
  const { sessionBuyIns, sessionNet } = await getSessionView(user.id)
  return { kind: 'active', state: toClientState(hand.id, hand.state, totalWagered, newChips, doubloons, dailyRemaining, dailyCap, sessionBuyIns, sessionNet) }
}

/** Decline insurance: no charge; check dealer natural anyway, resolve if hit. */
export async function declineInsurance(): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const hand = await loadActiveHand(user.id)
  if (!hand) return { error: 'No active hand' }
  if (hand.state.phase !== 'insuranceOffered') return { error: 'Insurance not available' }

  answerInsurance(hand.state, null)
  await persistActiveHand(hand.id, hand.state, hand.total_wagered)
  if ((hand.state.phase as Phase) === 'settled') {
    return settledOrError(await finalizeSettlement(user.id, hand.id, hand.state, hand.initial_wager, hand.total_wagered))
  }
  const chips = await getChips(user.id)
  const doubloons = await getDoubloons(user.id)
  const dailyAlready = await getDailyBuyInTotal(user.id)
  const dailyCap = await getDenCap(user.id)
  const dailyRemaining = Math.max(0, dailyCap - dailyAlready)
  const { sessionBuyIns, sessionNet } = await getSessionView(user.id)
  return { kind: 'active', state: toClientState(hand.id, hand.state, hand.total_wagered, chips, doubloons, dailyRemaining, dailyCap, sessionBuyIns, sessionNet) }
}

export async function hit(): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const hand = await loadActiveHand(user.id)
  if (!hand) return { error: 'No active hand' }
  const refusal = turnRefusal(hand.state)
  if (refusal) return { error: refusal }
  hitTable(hand.state)   // bust, or auto-stand on 21
  await persistActiveHand(hand.id, hand.state, hand.total_wagered)

  if ((hand.state.phase as Phase) === 'settled') {
    return settledOrError(await finalizeSettlement(user.id, hand.id, hand.state, hand.initial_wager, hand.total_wagered))
  }

  const chips = await getChips(user.id)
  const doubloons = await getDoubloons(user.id)
  const dailyAlready = await getDailyBuyInTotal(user.id)
  const dailyCap = await getDenCap(user.id)
  const dailyRemaining = Math.max(0, dailyCap - dailyAlready)
  const { sessionBuyIns, sessionNet } = await getSessionView(user.id)
  return { kind: 'active', state: toClientState(hand.id, hand.state, hand.total_wagered, chips, doubloons, dailyRemaining, dailyCap, sessionBuyIns, sessionNet) }
}

export async function stand(): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const hand = await loadActiveHand(user.id)
  if (!hand) return { error: 'No active hand' }
  const refusal = turnRefusal(hand.state)
  if (refusal) return { error: refusal }
  standTable(hand.state)
  await persistActiveHand(hand.id, hand.state, hand.total_wagered)

  if ((hand.state.phase as Phase) === 'settled') {
    return settledOrError(await finalizeSettlement(user.id, hand.id, hand.state, hand.initial_wager, hand.total_wagered))
  }

  const chips = await getChips(user.id)
  const doubloons = await getDoubloons(user.id)
  const dailyAlready = await getDailyBuyInTotal(user.id)
  const dailyCap = await getDenCap(user.id)
  const dailyRemaining = Math.max(0, dailyCap - dailyAlready)
  const { sessionBuyIns, sessionNet } = await getSessionView(user.id)
  return { kind: 'active', state: toClientState(hand.id, hand.state, hand.total_wagered, chips, doubloons, dailyRemaining, dailyCap, sessionBuyIns, sessionNet) }
}

export async function doubleDown(): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const hand = await loadActiveHand(user.id)
  if (!hand) return { error: 'No active hand' }
  const refusal = doubleRefusal(hand.state)
  if (refusal) return { error: refusal }
  const active = hand.state.hands[hand.state.activeHandIdx]

  const admin = createAdminClient()
  const afterDouble = await spend(admin, user.id, 'casino_chips', active.wager)
  if (afterDouble === null) return { error: 'Not enough chips to double' }
  doubleTable(hand.state)   // one card, and the hand ends
  const totalWagered = hand.total_wagered + (active.wager / 2)   // we doubled wager, the delta added equals the original wager
  await persistActiveHand(hand.id, hand.state, totalWagered)

  if ((hand.state.phase as Phase) === 'settled') {
    return settledOrError(await finalizeSettlement(user.id, hand.id, hand.state, hand.initial_wager, totalWagered))
  }

  const newChips = afterDouble
  const dailyAlready = await getDailyBuyInTotal(user.id)
  const dailyCap = await getDenCap(user.id)
  const dailyRemaining = Math.max(0, dailyCap - dailyAlready)
  const doubloons = await getDoubloons(user.id)
  const { sessionBuyIns, sessionNet } = await getSessionView(user.id)
  return { kind: 'active', state: toClientState(hand.id, hand.state, totalWagered, newChips, doubloons, dailyRemaining, dailyCap, sessionBuyIns, sessionNet) }
}

export async function split(): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const hand = await loadActiveHand(user.id)
  if (!hand) return { error: 'No active hand' }
  const refusal = splitRefusal(hand.state)
  if (refusal) return { error: refusal }

  const initialWager = hand.initial_wager
  // Charge the second wager in place
  const admin = createAdminClient()
  const afterSplit = await spend(admin, user.id, 'casino_chips', initialWager)
  if (afterSplit === null) return { error: 'Not enough chips to split' }

  // Each hand takes one card and a fresh draw; split aces stand (lib/casinoRules).
  splitTable(hand.state, initialWager)
  const totalWagered = hand.total_wagered + initialWager
  await persistActiveHand(hand.id, hand.state, totalWagered)

  if ((hand.state.phase as Phase) === 'settled') {
    return settledOrError(await finalizeSettlement(user.id, hand.id, hand.state, initialWager, totalWagered))
  }

  const newChips = afterSplit
  const dailyAlready = await getDailyBuyInTotal(user.id)
  const dailyCap = await getDenCap(user.id)
  const dailyRemaining = Math.max(0, dailyCap - dailyAlready)
  const doubloons = await getDoubloons(user.id)
  const { sessionBuyIns, sessionNet } = await getSessionView(user.id)
  return { kind: 'active', state: toClientState(hand.id, hand.state, totalWagered, newChips, doubloons, dailyRemaining, dailyCap, sessionBuyIns, sessionNet) }
}

/** Resume the active hand on page load (or return null if none). */
export async function resumeHand(): Promise<ClientState | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const hand = await loadActiveHand(user.id)
  if (!hand) return null
  const chips = await getChips(user.id)
  const doubloons = await getDoubloons(user.id)
  const dailyAlready = await getDailyBuyInTotal(user.id)
  const dailyCap = await getDenCap(user.id)
  const dailyRemaining = Math.max(0, dailyCap - dailyAlready)
  const { sessionBuyIns, sessionNet } = await getSessionView(user.id)
  return toClientState(hand.id, hand.state, hand.total_wagered, chips, doubloons, dailyRemaining, dailyCap, sessionBuyIns, sessionNet)
}
