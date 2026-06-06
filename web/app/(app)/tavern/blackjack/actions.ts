'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import {
  newShoe, drawCard, handValue, isBust, isNaturalBlackjack, canSplit,
  dealerPlay, settleHand, settleInsurance, cardRank,
  type Card, type SettledHand, type HandOutcome,
} from '@/lib/blackjack'
import { BJ_MIN_BET, BJ_MAX_BET, BJ_DAILY_CAP } from '../constants'

// ── Server-side state shape (lives in blackjack_hands.state JSONB) ──

interface ServerHand {
  cards: Card[]
  wager: number
  doubled: boolean
  stood: boolean
  busted: boolean
  isNatural: boolean    // pre-split natural BJ (split-21 doesn't qualify)
  isSplit: boolean      // hand was created via split (used to block double-after-split)
}

type Phase = 'insuranceOffered' | 'playerTurn' | 'settled'

interface ServerState {
  shoe: Card[]
  hands: ServerHand[]
  activeHandIdx: number
  dealerCards: Card[]           // both cards stored; hole hidden from client view until reveal
  insuranceTaken: boolean
  insuranceAmount: number
  insuranceResolved: boolean
  phase: Phase
}

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
  dailyRemaining: number        // doubloons still allowed today, post-this-hand
  doubloons: number             // current balance (post-this-hand)
}

export interface SettleResult {
  handId: number
  hands: SettledHand[]
  dealerCards: Card[]
  dealerTotal: number
  dealerBust: boolean
  dealerNatural: boolean
  insurance: { taken: boolean; amount: number; paid: number; net: number; win: boolean }
  netDelta: number              // total change in doubloons across the hand
  newDoubloons: number
  dailyWagered: number
}

export type ActionResult =
  | { kind: 'active'; state: ClientState }
  | { kind: 'settled'; result: SettleResult }
  | { error: string }

// ── Daily-wager helper ──

async function getDailyWageredTotal(userId: string): Promise<number> {
  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await admin
    .from('blackjack_hands')
    .select('total_wagered')
    .eq('user_id', userId)
    .gte('created_at', today)
  return (data ?? []).reduce((sum, r) => sum + (r.total_wagered as number), 0)
}

export async function getDailyWagered(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  return getDailyWageredTotal(user.id)
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
  doubloons: number,
  dailyRemaining: number,
): ClientState {
  const activeHand = state.hands[state.activeHandIdx]
  const isPlayerTurn = state.phase === 'playerTurn'
  const initialWager = state.hands[0]?.wager ?? 0
  const canHit    = isPlayerTurn && !!activeHand && !activeHand.busted && !activeHand.stood
  const canStand  = canHit
  const canDouble = canHit
    && activeHand.cards.length === 2
    && !activeHand.isSplit
    && doubloons >= activeHand.wager
  const canSplitNow = canHit
    && state.hands.length === 1     // no re-splitting
    && canSplit(activeHand.cards)
    && doubloons >= initialWager
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
    doubloons,
  }
}

// ── Core mutations ──

/** Advance to next active hand, OR transition to settled if all hands
 *  are done. Caller passes the hand row id + the live state object and
 *  the supabase admin client. Returns the post-advance state (still
 *  ServerState; caller persists). */
function advanceTurn(state: ServerState): void {
  // Skip any hands that are already busted or stood
  while (state.activeHandIdx < state.hands.length) {
    const h = state.hands[state.activeHandIdx]
    if (!h.busted && !h.stood) return
    state.activeHandIdx++
  }
  // All hands done — dealer plays, phase = settled
  state.dealerCards = dealerPlay(state.shoe, state.dealerCards)
  state.phase = 'settled'
}

/** Settle a hand row: compute payouts, update profile, write the
 *  result jsonb + transaction ledger, mark status='settled'. Returns
 *  the SettleResult shaped for the client. */
async function finalizeSettlement(
  userId: string,
  handId: number,
  state: ServerState,
  initialWager: number,
  totalWagered: number,
): Promise<SettleResult> {
  const admin = createAdminClient()
  const dealerFinal = state.dealerCards
  const dealerTotal = handValue(dealerFinal).total
  const dealerBust = dealerTotal > 21
  const dealerNatural = isNaturalBlackjack(dealerFinal)

  const settled: SettledHand[] = state.hands.map(h => settleHand(
    { cards: h.cards, wager: h.wager, doubled: h.doubled, isNatural: h.isNatural },
    { cards: dealerFinal, total: dealerTotal, bust: dealerBust, natural: dealerNatural },
  ))

  const insurance = settleInsurance(state.insuranceAmount, dealerNatural)

  // Total returned to player = sum of hand payouts + insurance payout.
  // All wagers (initial, doubles, splits, insurance) were already
  // deducted at the time they happened, so net delta is just:
  //   (returned) - (total wagered)
  const totalReturned = settled.reduce((sum, h) => sum + h.payout, 0) + insurance.paid
  const netDelta = totalReturned - totalWagered

  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons')
    .eq('id', userId)
    .single()
  const currentDoubloons = (profile?.doubloons as number | null) ?? 0
  const newDoubloons = currentDoubloons + totalReturned

  const resultJson = {
    hands: settled,
    dealerCards: dealerFinal,
    dealerTotal,
    dealerBust,
    dealerNatural,
    insurance: { taken: state.insuranceTaken, amount: state.insuranceAmount, paid: insurance.paid, net: insurance.net, win: insurance.win },
    netDelta,
  }

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

  await Promise.all([
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', userId),
    admin.from('blackjack_hands').update({
      status: 'settled',
      state: null,            // free the active-state JSON
      result: resultJson,
      net_delta: netDelta,
      settled_at: new Date().toISOString(),
    }).eq('id', handId),
    admin.from('doubloon_transactions').insert({
      user_id: userId,
      amount: netDelta,
      reason,
    }),
  ])

  const dailyWagered = await getDailyWageredTotal(userId)

  return {
    handId,
    hands: settled,
    dealerCards: dealerFinal,
    dealerTotal,
    dealerBust,
    dealerNatural,
    insurance: { taken: state.insuranceTaken, amount: state.insuranceAmount, paid: insurance.paid, net: insurance.net, win: insurance.win },
    netDelta,
    newDoubloons,
    dailyWagered,
    // Wager fields for the SettleResult shape — caller-facing values
    // already baked into the hand row at this point. Not duplicated.
  } as SettleResult
}

/** Load the active hand (or null) for the user. */
async function loadActiveHand(userId: string): Promise<{ id: number; state: ServerState; initial_wager: number; total_wagered: number } | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('blackjack_hands')
    .select('id, state, initial_wager, total_wagered')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (!data || !data.state) return null
  return {
    id: data.id as number,
    state: data.state as ServerState,
    initial_wager: data.initial_wager as number,
    total_wagered: data.total_wagered as number,
  }
}

async function persistActiveHand(handId: number, state: ServerState, totalWagered: number): Promise<void> {
  const admin = createAdminClient()
  await admin.from('blackjack_hands').update({ state, total_wagered: totalWagered }).eq('id', handId)
}

async function getDoubloons(userId: string): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('doubloons').eq('id', userId).single()
  return (data?.doubloons as number | null) ?? 0
}

async function setDoubloons(userId: string, doubloons: number): Promise<void> {
  const admin = createAdminClient()
  await admin.from('profiles').update({ doubloons }).eq('id', userId)
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
    const s = orphan.state
    s.hands.forEach(h => { if (!h.busted && !h.stood) h.stood = true })
    s.activeHandIdx = s.hands.length
    s.dealerCards = dealerPlay(s.shoe, s.dealerCards)
    s.phase = 'settled'
    await finalizeSettlement(user.id, orphan.id, s, orphan.initial_wager, orphan.total_wagered)
  }

  const doubloons = await getDoubloons(user.id)
  if (doubloons < wager) return { error: 'Insufficient doubloons' }

  const dailyAlready = await getDailyWageredTotal(user.id)
  if (dailyAlready + wager > BJ_DAILY_CAP) {
    return { error: `Daily limit reached (${BJ_DAILY_CAP} ⟡)` }
  }

  // Build a fresh shoe + deal 2-2
  const shoe = newShoe()
  const playerCards = [drawCard(shoe), drawCard(shoe)]
  const dealerCards = [drawCard(shoe), drawCard(shoe)]
  const playerNatural = isNaturalBlackjack(playerCards)
  const dealerUpRank = cardRank(dealerCards[0])

  const state: ServerState = {
    shoe,
    hands: [{
      cards: playerCards, wager, doubled: false,
      stood: playerNatural, busted: false, isNatural: playerNatural, isSplit: false,
    }],
    activeHandIdx: 0,
    dealerCards,
    insuranceTaken: false,
    insuranceAmount: 0,
    insuranceResolved: false,
    phase: dealerUpRank === 'A' ? 'insuranceOffered' : 'playerTurn',
  }

  // Charge the wager up front
  await setDoubloons(user.id, doubloons - wager)

  // Insert the hand row
  const { data: row } = await admin
    .from('blackjack_hands')
    .insert({ user_id: user.id, initial_wager: wager, total_wagered: wager, status: 'active', state })
    .select('id')
    .single()
  if (!row) return { error: 'Failed to create hand' }
  const handId = row.id as number

  revalidatePath('/tavern')

  // Resolve naturals immediately when no insurance gate.
  // (Insurance gate: the player must decide insurance before any
  //  natural-BJ resolution — that's the rule. Defer to acceptInsurance
  //  / declineInsurance handlers.)
  if (state.phase === 'playerTurn') {
    const dealerNaturalCheck = isNaturalBlackjack(state.dealerCards)
    if (playerNatural || dealerNaturalCheck) {
      state.hands.forEach(h => { h.stood = true })
      state.activeHandIdx = state.hands.length
      state.phase = 'settled'
      // dealer cards already known; no further draw needed since both naturals are 2-card hands
      const result = await finalizeSettlement(user.id, handId, state, wager, wager)
      return { kind: 'settled', result }
    }
  }

  const newDoubloons = doubloons - wager
  const dailyRemaining = Math.max(0, BJ_DAILY_CAP - (dailyAlready + wager))
  return { kind: 'active', state: toClientState(handId, state, wager, newDoubloons, dailyRemaining) }
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
  const insurance = Math.floor(initialWager / 2)
  const doubloons = await getDoubloons(user.id)
  if (doubloons < insurance) return { error: 'Insufficient doubloons for insurance' }

  const dailyAlready = await getDailyWageredTotal(user.id)
  if (dailyAlready - hand.total_wagered + (hand.total_wagered + insurance) > BJ_DAILY_CAP) {
    // The hand's existing wager already counts in dailyAlready; we add only the delta.
    return { error: `Daily limit reached (${BJ_DAILY_CAP} ⟡)` }
  }

  await setDoubloons(user.id, doubloons - insurance)
  hand.state.insuranceTaken = true
  hand.state.insuranceAmount = insurance
  hand.state.insuranceResolved = true

  const dealerNatural = isNaturalBlackjack(hand.state.dealerCards)
  const playerNatural = hand.state.hands[0].isNatural

  if (dealerNatural || playerNatural) {
    hand.state.hands.forEach(h => { h.stood = true })
    hand.state.activeHandIdx = hand.state.hands.length
    hand.state.phase = 'settled'
    const totalWagered = hand.total_wagered + insurance
    await persistActiveHand(hand.id, hand.state, totalWagered)
    const result = await finalizeSettlement(user.id, hand.id, hand.state, initialWager, totalWagered)
    return { kind: 'settled', result }
  }

  hand.state.phase = 'playerTurn'
  const totalWagered = hand.total_wagered + insurance
  await persistActiveHand(hand.id, hand.state, totalWagered)

  const newDoubloons = doubloons - insurance
  const dailyRemaining = Math.max(0, BJ_DAILY_CAP - (dailyAlready + insurance))
  return { kind: 'active', state: toClientState(hand.id, hand.state, totalWagered, newDoubloons, dailyRemaining) }
}

/** Decline insurance: no charge; check dealer natural anyway, resolve if hit. */
export async function declineInsurance(): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const hand = await loadActiveHand(user.id)
  if (!hand) return { error: 'No active hand' }
  if (hand.state.phase !== 'insuranceOffered') return { error: 'Insurance not available' }

  hand.state.insuranceResolved = true
  const dealerNatural = isNaturalBlackjack(hand.state.dealerCards)
  const playerNatural = hand.state.hands[0].isNatural

  if (dealerNatural || playerNatural) {
    hand.state.hands.forEach(h => { h.stood = true })
    hand.state.activeHandIdx = hand.state.hands.length
    hand.state.phase = 'settled'
    await persistActiveHand(hand.id, hand.state, hand.total_wagered)
    const result = await finalizeSettlement(user.id, hand.id, hand.state, hand.initial_wager, hand.total_wagered)
    return { kind: 'settled', result }
  }

  hand.state.phase = 'playerTurn'
  await persistActiveHand(hand.id, hand.state, hand.total_wagered)
  const doubloons = await getDoubloons(user.id)
  const dailyAlready = await getDailyWageredTotal(user.id)
  const dailyRemaining = Math.max(0, BJ_DAILY_CAP - dailyAlready)
  return { kind: 'active', state: toClientState(hand.id, hand.state, hand.total_wagered, doubloons, dailyRemaining) }
}

export async function hit(): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const hand = await loadActiveHand(user.id)
  if (!hand) return { error: 'No active hand' }
  if (hand.state.phase !== 'playerTurn') return { error: 'Not your turn' }
  const active = hand.state.hands[hand.state.activeHandIdx]
  if (!active || active.stood || active.busted) return { error: 'Hand already done' }

  active.cards.push(drawCard(hand.state.shoe))
  if (isBust(active.cards)) active.busted = true
  else if (handValue(active.cards).total === 21) active.stood = true   // auto-stand on 21 (player can't improve)

  advanceTurn(hand.state)
  await persistActiveHand(hand.id, hand.state, hand.total_wagered)

  if ((hand.state.phase as Phase) === 'settled') {
    const result = await finalizeSettlement(user.id, hand.id, hand.state, hand.initial_wager, hand.total_wagered)
    return { kind: 'settled', result }
  }

  const doubloons = await getDoubloons(user.id)
  const dailyAlready = await getDailyWageredTotal(user.id)
  const dailyRemaining = Math.max(0, BJ_DAILY_CAP - dailyAlready)
  return { kind: 'active', state: toClientState(hand.id, hand.state, hand.total_wagered, doubloons, dailyRemaining) }
}

export async function stand(): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const hand = await loadActiveHand(user.id)
  if (!hand) return { error: 'No active hand' }
  if (hand.state.phase !== 'playerTurn') return { error: 'Not your turn' }
  const active = hand.state.hands[hand.state.activeHandIdx]
  if (!active || active.stood || active.busted) return { error: 'Hand already done' }

  active.stood = true
  advanceTurn(hand.state)
  await persistActiveHand(hand.id, hand.state, hand.total_wagered)

  if ((hand.state.phase as Phase) === 'settled') {
    const result = await finalizeSettlement(user.id, hand.id, hand.state, hand.initial_wager, hand.total_wagered)
    return { kind: 'settled', result }
  }

  const doubloons = await getDoubloons(user.id)
  const dailyAlready = await getDailyWageredTotal(user.id)
  const dailyRemaining = Math.max(0, BJ_DAILY_CAP - dailyAlready)
  return { kind: 'active', state: toClientState(hand.id, hand.state, hand.total_wagered, doubloons, dailyRemaining) }
}

export async function doubleDown(): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const hand = await loadActiveHand(user.id)
  if (!hand) return { error: 'No active hand' }
  if (hand.state.phase !== 'playerTurn') return { error: 'Not your turn' }
  const active = hand.state.hands[hand.state.activeHandIdx]
  if (!active || active.stood || active.busted) return { error: 'Hand already done' }
  if (active.cards.length !== 2) return { error: 'Can only double on initial two cards' }
  if (active.isSplit) return { error: 'No double after split (house rule)' }

  const doubloons = await getDoubloons(user.id)
  if (doubloons < active.wager) return { error: 'Insufficient doubloons to double' }
  const dailyAlready = await getDailyWageredTotal(user.id)
  if (dailyAlready + active.wager > BJ_DAILY_CAP) {
    return { error: `Daily limit reached (${BJ_DAILY_CAP} ⟡)` }
  }

  await setDoubloons(user.id, doubloons - active.wager)
  active.wager *= 2
  active.doubled = true
  active.cards.push(drawCard(hand.state.shoe))
  if (isBust(active.cards)) active.busted = true
  active.stood = true   // double-down always ends the hand

  advanceTurn(hand.state)
  const totalWagered = hand.total_wagered + (active.wager / 2)   // we doubled wager, the delta added equals the original wager
  await persistActiveHand(hand.id, hand.state, totalWagered)

  if ((hand.state.phase as Phase) === 'settled') {
    const result = await finalizeSettlement(user.id, hand.id, hand.state, hand.initial_wager, totalWagered)
    return { kind: 'settled', result }
  }

  const newDoubloons = doubloons - (active.wager / 2)
  const dailyRemaining = Math.max(0, BJ_DAILY_CAP - (dailyAlready + (active.wager / 2)))
  return { kind: 'active', state: toClientState(hand.id, hand.state, totalWagered, newDoubloons, dailyRemaining) }
}

export async function split(): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const hand = await loadActiveHand(user.id)
  if (!hand) return { error: 'No active hand' }
  if (hand.state.phase !== 'playerTurn') return { error: 'Not your turn' }
  if (hand.state.hands.length !== 1) return { error: 'No re-splitting (house rule)' }
  const active = hand.state.hands[0]
  if (!active || active.cards.length !== 2 || !canSplit(active.cards)) return { error: 'Cannot split' }

  const initialWager = hand.initial_wager
  const doubloons = await getDoubloons(user.id)
  if (doubloons < initialWager) return { error: 'Insufficient doubloons to split' }
  const dailyAlready = await getDailyWageredTotal(user.id)
  if (dailyAlready + initialWager > BJ_DAILY_CAP) {
    return { error: `Daily limit reached (${BJ_DAILY_CAP} ⟡)` }
  }

  // Charge the second wager
  await setDoubloons(user.id, doubloons - initialWager)

  // Split: each hand gets one of the original cards + one new draw
  const [c1, c2] = active.cards
  const isAceSplit = cardRank(c1) === 'A'
  const handA: ServerHand = {
    cards: [c1, drawCard(hand.state.shoe)],
    wager: active.wager,
    doubled: false,
    stood: isAceSplit,             // split aces auto-stand after one card
    busted: false,
    isNatural: false,              // split-21 is NOT a natural
    isSplit: true,
  }
  const handB: ServerHand = {
    cards: [c2, drawCard(hand.state.shoe)],
    wager: initialWager,
    doubled: false,
    stood: isAceSplit,
    busted: false,
    isNatural: false,
    isSplit: true,
  }
  hand.state.hands = [handA, handB]
  hand.state.activeHandIdx = 0

  advanceTurn(hand.state)   // possibly skip past stood ace hands
  const totalWagered = hand.total_wagered + initialWager
  await persistActiveHand(hand.id, hand.state, totalWagered)

  if ((hand.state.phase as Phase) === 'settled') {
    const result = await finalizeSettlement(user.id, hand.id, hand.state, initialWager, totalWagered)
    return { kind: 'settled', result }
  }

  const newDoubloons = doubloons - initialWager
  const dailyRemaining = Math.max(0, BJ_DAILY_CAP - (dailyAlready + initialWager))
  return { kind: 'active', state: toClientState(hand.id, hand.state, totalWagered, newDoubloons, dailyRemaining) }
}

/** Resume the active hand on page load (or return null if none). */
export async function resumeHand(): Promise<ClientState | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const hand = await loadActiveHand(user.id)
  if (!hand) return null
  const doubloons = await getDoubloons(user.id)
  const dailyAlready = await getDailyWageredTotal(user.id)
  const dailyRemaining = Math.max(0, BJ_DAILY_CAP - dailyAlready)
  return toClientState(hand.id, hand.state, hand.total_wagered, doubloons, dailyRemaining)
}
