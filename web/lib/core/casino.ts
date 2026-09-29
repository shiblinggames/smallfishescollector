// ── THE DEN, CORE (Steam prep, 2026-09-29) ──
//
// The shared chip purse (buy-in, cash-out), Fish Slots and the community pot,
// Fish Roulette and Blackjack, with nothing of the web in them. Each takes the
// store (CasinoData) and the captain's id. On the web the server actions
// (tavern/actions, tavern/casino, tavern/roulette, tavern/blackjack) check the
// session and hand these the Supabase store; offline, the local save's.
//
// ONE chip purse (profiles.casino_chips) backs all three games. Buy-in
// converts doubloons to chips against a single shared daily cap; chips churn
// freely across games; cash-out converts everything back and ends the session
// (the shared buy-in tally and all three per-game session nets reset). A purse
// that hits zero ends the session too.
//
// Moved verbatim out of those actions. The only edits: the session read became
// `uid`; the wallet and badges became store operations; the clock became
// clockNow. The web-only step (telling Next the cached pages changed) stays in
// the actions.

import { handValue, canSplit, type Card, type SettledHand, type HandOutcome } from '@/lib/blackjack'
import {
  dealTable, standAll, insuranceCost, answerInsurance, turnRefusal, hitTable, standTable, doubleRefusal, doubleTable,
  splitRefusal, splitTable, settleTable, nextStreaks, afterRound, casinoDayStart,
  buyInAmountOk, buyInRefusal, rollSlots, betSlipRefusal,
  type Phase, type ServerHand, type ServerState,
} from '@/lib/casinoRules'
import { rollWinningNumber, settleSpin, type Bet } from '@/lib/roulette'
import { BJ_MIN_BET, BJ_MAX_BET, SLOTS_MIN_BET, SLOTS_MAX_BET, SLOTS_JACKPOT_FEED_PCT, denDailyCap, denCapFromXp } from '@/app/(app)/tavern/constants'
import type { SlotSymbolId } from '@/app/(app)/tavern/constants'
import type { CasinoWallet, CasinoBuyInResult, CasinoCashOutResult } from '@/app/(app)/tavern/casino/types'
import type { RouletteState, SpinResult, RecentSpin } from '@/app/(app)/tavern/roulette/types'
import { isPremiumActive } from '@/lib/premium'
import { clockNow } from '@/lib/clock'
import type { CasinoData } from '@/lib/data/casinoData'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── The purse's day ─────────────────────────────────────────────────────────

/** Today's buy-ins into the SHARED casino wallet (one cap across all three
 *  games — casino_buy_ins is the only source). */
async function getDailyBuyInTotal(db: CasinoData, userId: string): Promise<number> {
  return db.boughtInSince(userId, casinoDayStart())
}

/** A player's effective shared Den daily cap — Captains climb it with their
 *  combined Fishing+Nav level (2k→20k); non-Captains sit flat at 2,000 ⟡/day. */
async function getDenCap(db: CasinoData, userId: string): Promise<number> {
  const data = await db.profile(userId, 'fishing_xp, expedition_xp, is_premium, premium_expires_at')
  return denCapFromXp((data?.fishing_xp as number | null) ?? 0, (data?.expedition_xp as number | null) ?? 0, isPremiumActive(data))
}

export const NO_WALLET: CasinoWallet = {
  chips: 0, doubloons: 0, sessionBuyIns: 0,
  dailyBoughtIn: 0, dailyCap: denDailyCap(0, false), dailyRemaining: denDailyCap(0, false),
  sessionNets: { blackjack: 0, roulette: 0, slots: 0 }, isMember: false,
}

export async function getCasinoState(db: CasinoData, uid: string): Promise<CasinoWallet> {
  const [profile, dailyBoughtIn] = await Promise.all([
    db.profile(uid, 'doubloons, casino_chips, casino_session_buy_ins, blackjack_session_net, roulette_session_net, slots_session_net, fishing_xp, expedition_xp, is_premium, premium_expires_at'),
    getDailyBuyInTotal(db, uid),
  ])
  const isMember = isPremiumActive(profile)
  const dailyCap = denCapFromXp((profile?.fishing_xp as number | null) ?? 0, (profile?.expedition_xp as number | null) ?? 0, isMember)
  return {
    isMember,
    chips: (profile?.casino_chips as number | null) ?? 0,
    doubloons: (profile?.doubloons as number | null) ?? 0,
    sessionBuyIns: (profile?.casino_session_buy_ins as number | null) ?? 0,
    dailyBoughtIn,
    dailyCap,
    dailyRemaining: Math.max(0, dailyCap - dailyBoughtIn),
    sessionNets: {
      blackjack: (profile?.blackjack_session_net as number | null) ?? 0,
      roulette: (profile?.roulette_session_net as number | null) ?? 0,
      slots: (profile?.slots_session_net as number | null) ?? 0,
    },
  }
}

/** Convert N doubloons → N chips in the shared purse. Enforces the
 *  shared daily cap + sufficient doubloons. Buying in mid-session just
 *  tops up the purse — it never resets the per-game nets. */
export async function buyInCasino(db: CasinoData, uid: string, amount: number): Promise<CasinoBuyInResult | { error: string }> {
  // The purse rules (range, funds, the shared daily cap) are lib/casinoRules buyInRefusal.
  if (!buyInAmountOk(amount)) return { error: 'Invalid amount' }

  const profile = await db.profile(uid, 'doubloons, casino_session_buy_ins')
  if (!profile) return { error: 'Profile not found' }
  const doubloons = profile.doubloons as number
  const prevSessionBuyIns = (profile.casino_session_buy_ins as number | null) ?? 0
  if (doubloons < amount) return { error: 'Insufficient doubloons' }

  const [dailyAlready, dailyCap] = await Promise.all([getDailyBuyInTotal(db, uid), getDenCap(db, uid)])
  const refusal = buyInRefusal(amount, doubloons, dailyAlready, dailyCap)
  if (refusal) return { error: refusal }

  // Doubloons leave in place first (the guard against two buy-ins spending
  // the same purse), then the chips land in place.
  const newDoubloons = await db.spend(uid, 'doubloons', amount)
  if (newDoubloons === null) return { error: 'Insufficient doubloons' }
  const newChips = await db.grant(uid, 'casino_chips', amount)
  const newSessionBuyIns = prevSessionBuyIns + amount

  await Promise.all([
    db.updateProfile(uid, { casino_session_buy_ins: newSessionBuyIns }),
    db.recordBuyIn(uid, amount),
    db.ledger(uid, -amount, `Casino: buy-in ${amount} ⟡`),
  ])

  return {
    newDoubloons, newChips,
    dailyBoughtIn: dailyAlready + amount,
    dailyCap,
    dailyRemaining: Math.max(0, dailyCap - (dailyAlready + amount)),
    sessionBuyIns: newSessionBuyIns,
  }
}

/** Convert all chips → doubloons and end the casino session: shared
 *  buy-in tally AND all three per-game session nets reset. Blocked
 *  while a blackjack hand is mid-flight — those chips are on the felt. */
export async function cashOutCasino(db: CasinoData, uid: string): Promise<CasinoCashOutResult | { error: string }> {
  if (await db.activeHand(uid)) return { error: 'Finish your blackjack hand first' }

  // One step moves every chip to doubloons, so a spin landing at the same
  // moment can never be paid out twice.
  const cashed = await db.cashOutChips(uid)
  if (!cashed) return { error: 'Cash-out failed' }
  const chips = cashed.paid
  if (chips <= 0) return { error: 'No chips to cash out' }
  const newDoubloons = cashed.doubloons

  await Promise.all([
    db.updateProfile(uid, {
      casino_session_buy_ins: 0,
      blackjack_session_net: 0,
      roulette_session_net: 0,
      slots_session_net: 0,
    }),
    db.ledger(uid, chips, `Casino: cash-out ${chips} ⟡`),
  ])

  return { newDoubloons, cashedOut: chips }
}

/** First-visit Den guide dismissal (see components/LobbyGuide). */
export async function markDenGuideSeen(db: CasinoData, uid: string): Promise<void> {
  await db.updateProfile(uid, { has_seen_den_guide: true })
}

// ─── Fish Slots ───────────────────────────────────────────────────────────────

export interface SlotSpinResult {
  reels: SlotSymbolId[]
  outcome: 'win' | 'jackpot' | 'lose' | 'bonus' | 'refund' | 'near_miss' | 'pair_win'
  payout: number
  net: number
  newChips: number          // shared casino purse post-spin
  sessionNet: number        // slots' win/loss this session (post-spin)
  sessionBuyIns: number     // shared session buy-ins (0 after a bust-out reset)
  matchedSymbol?: SlotSymbolId
  /** Global jackpot pot AFTER this spin (post-feed, post-claim). */
  pot: number
  /** Doubloons taken from the pot when outcome (or bonus) hit the jackpot. */
  jackpotWin?: number
  bonus?: {
    reels: SlotSymbolId[]
    outcome: 'win' | 'jackpot' | 'pair' | 'lose'
    payout: number
    matchedSymbol?: SlotSymbolId
  }
}

export interface SlotsJackpotState {
  pot: number
  lastWinnerName: string | null
  lastWinAmount: number | null
  lastWonAt: string | null
}

export async function getSlotsJackpot(db: CasinoData): Promise<SlotsJackpotState> {
  const data = await db.slotsPot()
  return {
    pot: data?.pot ?? 15000,
    lastWinnerName: data?.last_winner_name ?? null,
    lastWinAmount: data?.last_win_amount ?? null,
    lastWonAt: data?.last_won_at ?? null,
  }
}

export interface SlotStats {
  spins: number
  net: number
  biggestWin: number
}

export const NO_SLOT_STATS: SlotStats = { spins: 0, net: 0, biggestWin: 0 }

export async function getSlotStats(db: CasinoData, uid: string): Promise<SlotStats> {
  // Aggregated in the store — a plain SELECT is capped at PostgREST's default
  // 1000 rows, which made the panel stick at 1000 spins with a wrong net for
  // anyone who'd spun more than that.
  const row = await db.slotStats(uid)
  return {
    spins: Number(row?.spins ?? 0),
    net: Number(row?.net ?? 0),
    biggestWin: Number(row?.biggest_win ?? 0),
  }
}

export async function spinSlots(db: CasinoData, uid: string, wager: number): Promise<SlotSpinResult | { error: string }> {
  // Integer + range guard. NaN/fractional wagers slipped past a bare min/max
  // compare (NaN < MIN and NaN > MAX are both false) and could corrupt the
  // player's own int chip balance. Blackjack/roulette already guard this.
  if (!Number.isInteger(wager) || wager < SLOTS_MIN_BET || wager > SLOTS_MAX_BET) return { error: 'Invalid wager' }

  // Wagers come out of the SHARED casino chip purse (one balance across
  // blackjack/roulette/slots). The daily cap is enforced at buy-in
  // (casino_buy_ins) — chips on the table churn freely, so the old
  // per-spin daily-wager check is gone.
  const profile = await db.profile(uid, 'casino_chips, casino_session_buy_ins, slots_session_net, username, is_admin, slots_force_next')
  if (!profile) return { error: 'Profile not found' }
  // The wager leaves the purse in place before the roll. That is the guard:
  // two spins fired together cannot both bet the same chips.
  const afterStake = await db.spend(uid, 'casino_chips', wager)
  if (afterStake === null) return { error: 'Not enough chips' }
  // Admins still spin + feed the pot, but can't TAKE the community jackpot —
  // a catfish triple pays them a normal big win instead, pot left intact.
  const isAdmin = (profile as { is_admin?: boolean | null }).is_admin === true

  // One-time forced outcome (admin rig/gift): a valid symbol in
  // profiles.slots_force_next lands as a triple on THIS spin, then the flag is
  // cleared in the persist below. The roll and the pay table are
  // lib/casinoRules rollSlots; the community pot is claimed here.
  const roll = rollSlots(wager, { forced: (profile as { slots_force_next?: string | null }).slots_force_next ?? null, isAdmin })
  const { reels, isForced } = roll

  // Every spin feeds the global pot before any claim — your own
  // contribution is in the pot you might win this very spin.
  const feed = Math.ceil(wager * SLOTS_JACKPOT_FEED_PCT)
  let pot = (await db.feedPot(feed)) ?? 15000

  const winnerName = (profile as { username?: string | null }).username ?? 'A sailor'
  async function claimJackpot(): Promise<number> {
    const won = await db.claimPot(uid, winnerName, wager, SLOTS_MAX_BET)
    if (!won) return 0
    pot = won.newPot
    return won.share
  }

  const outcome = roll.outcome
  let payout = roll.payout
  const matchedSymbol = roll.matchedSymbol
  let bonus = roll.bonus
  let jackpotWin: number | undefined
  // A natural three catfish (main reels or the bonus round) takes the pot.
  if (roll.jackpot) {
    const share = await claimJackpot()
    jackpotWin = share
    if (roll.jackpot === 'main') payout = share
    else { bonus = { ...bonus!, payout: share }; payout = wager + share }
  }

  const net = payout - wager
  const newChips = payout > 0 ? await db.grant(uid, 'casino_chips', payout) : afterStake

  // Chip movement is internal to the casino session — no
  // doubloon_transactions row here (matches blackjack/roulette;
  // doubloons only move at buy-in / cash-out).
  // Shared purse hitting 0 ends the casino session (lib/casinoRules afterRound).
  const { busted, sessionNet: newSessionNet, sessionBuyIns: newSessionBuyIns } = afterRound(
    newChips, (profile.slots_session_net as number | null) ?? 0, net, (profile.casino_session_buy_ins as number | null) ?? 0)

  await Promise.all([
    db.updateProfile(uid, {
      slots_session_net: newSessionNet,
      // Consume the one-time forced-spin override so it only fires once.
      ...(isForced ? { slots_force_next: null } : {}),
      ...(busted ? { casino_session_buy_ins: 0, blackjack_session_net: 0, roulette_session_net: 0 } : {}),
    }),
    db.logSlotSpin(uid, { wager, reels, outcome, payout }),
  ])

  // Catfish Jackpot badge — winning the global pot (natural or via a bonus roll).
  if (jackpotWin && jackpotWin > 0) { try { await db.grantBadge(uid, 'catfish_jackpot') } catch { /* best-effort */ } }

  return { reels, outcome, payout, net, newChips, sessionNet: newSessionNet, sessionBuyIns: newSessionBuyIns, matchedSymbol, pot, jackpotWin, bonus }
}

// ── Fish Roulette ───────────────────────────────────────────────────────────
// Wagers come out of the SHARED casino chip purse. Roulette has no mid-game
// state: bet → spin → settle is one atomic action.

export const NO_ROULETTE: RouletteState = {
  chips: 0, doubloons: 0, sessionBuyIns: 0, sessionNet: 0,
  dailyBoughtIn: 0, dailyCap: denDailyCap(0, false), dailyRemaining: denDailyCap(0, false),
  recentSpins: [],
}

/** What the roulette page server-renders. */
export async function getRouletteState(db: CasinoData, uid: string): Promise<RouletteState> {
  const [profile, dailyBoughtIn, recentRows] = await Promise.all([
    db.profile(uid, 'doubloons, casino_chips, casino_session_buy_ins, roulette_session_net, fishing_xp, expedition_xp, is_premium, premium_expires_at'),
    getDailyBuyInTotal(db, uid),
    db.recentRouletteSpins(uid, 20),
  ])

  const recentSpins: RecentSpin[] = (recentRows as any[]).map(r => ({
    id: r.id,
    winningNumber: r.winning_number,
    net: r.net_chips,
    totalWagered: r.total_wagered,
    createdAt: r.created_at,
  }))

  return {
    chips: (profile?.casino_chips as number | null) ?? 0,
    doubloons: (profile?.doubloons as number | null) ?? 0,
    sessionBuyIns: (profile?.casino_session_buy_ins as number | null) ?? 0,
    sessionNet: (profile?.roulette_session_net as number | null) ?? 0,
    dailyBoughtIn,
    dailyCap: denCapFromXp((profile?.fishing_xp as number | null) ?? 0, (profile?.expedition_xp as number | null) ?? 0, isPremiumActive(profile)),
    dailyRemaining: Math.max(0, denCapFromXp((profile?.fishing_xp as number | null) ?? 0, (profile?.expedition_xp as number | null) ?? 0, isPremiumActive(profile)) - dailyBoughtIn),
    recentSpins,
  }
}

/** Atomic bet → spin → settle. Validates every bet against the configured
 *  min/max, debits the shared casino purse, rolls the wheel server-side,
 *  settles via the pure logic in lib/roulette, writes one roulette_spins
 *  row + updates the chip balance and roulette's session net, and
 *  returns the winning number + payout for the client to animate. */
export async function placeBetsAndSpin(db: CasinoData, uid: string, bets: Bet[]): Promise<SpinResult | { error: string }> {
  // The bet slip: per-bet limits, inside bets on the straight cap, outside on
  // the higher one, and the cap held on each zone's TOTAL (lib/casinoRules).
  const slipError = betSlipRefusal(bets)
  if (slipError) return { error: slipError }

  const profile = await db.profile(uid, 'casino_chips, casino_session_buy_ins, roulette_session_net, doubloons')
  if (!profile) return { error: 'Profile not found' }
  const totalWagered = bets.reduce((sum, b) => sum + b.amount, 0)

  // The wager leaves the purse in place first. That is the guard: two spins
  // fired together cannot both bet the same chips.
  const afterStake = await db.spend(uid, 'casino_chips', totalWagered)
  if (afterStake === null) return { error: 'Not enough chips' }
  const chipsBefore = afterStake + totalWagered

  // Server-authoritative spin + pure settlement.
  const winningNumber = rollWinningNumber()
  const settlement = settleSpin(bets, winningNumber)

  const chipsAfter = settlement.totalPayout > 0
    ? await db.grant(uid, 'casino_chips', settlement.totalPayout)
    : afterStake
  // Shared purse hitting 0 ends the casino session (lib/casinoRules afterRound).
  const { busted, sessionNet: newSessionNet, sessionBuyIns: newSessionBuyIns } = afterRound(
    chipsAfter, (profile.roulette_session_net as number | null) ?? 0, settlement.net, (profile.casino_session_buy_ins as number | null) ?? 0)

  await Promise.all([
    db.updateProfile(uid, {
      roulette_session_net: newSessionNet,
      ...(busted ? { casino_session_buy_ins: 0, blackjack_session_net: 0, slots_session_net: 0 } : {}),
    }),
    db.logRouletteSpin(uid, {
      bets: bets as unknown as object,
      winning_number: winningNumber,
      total_wagered: settlement.totalWagered,
      total_payout: settlement.totalPayout,
      net_chips: settlement.net,
      chips_before: chipsBefore,
      chips_after: chipsAfter,
    }),
  ])

  // Called It badge (best-effort): won a straight-up single-number bet.
  if (settlement.perBet.some(pb => pb.won && pb.bet.type === 'straight')) {
    try { await db.grantBadge(uid, 'called_it') } catch { /* best-effort */ }
  }

  return {
    winningNumber,
    totalWagered: settlement.totalWagered,
    totalPayout: settlement.totalPayout,
    net: settlement.net,
    chipsBefore,
    chipsAfter,
    perBet: settlement.perBet,
    doubloons: (profile.doubloons as number | null) ?? 0,
    sessionNet: newSessionNet,
    sessionBuyIns: newSessionBuyIns,
  }
}

// ── Blackjack ───────────────────────────────────────────────────────────────
// ServerHand, Phase and ServerState, and every move on the table, are
// lib/casinoRules. The hand's state lives in its row between actions.

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

// "Daily wagered" tracks BUY-INS into the SHARED casino wallet (one cap across
// blackjack/roulette/slots), not per-hand wagers. Chips on the table can churn
// freely.
export async function getDailyWagered(db: CasinoData, uid: string): Promise<number> {
  return getDailyBuyInTotal(db, uid)
}

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

/** Settle a hand row: compute payouts, update profile, write the
 *  result jsonb, mark status='settled'. Returns the SettleResult shaped for the
 *  client, or null when another request settled this hand first (nothing is
 *  paid twice). */
async function finalizeSettlement(
  db: CasinoData,
  userId: string,
  handId: number,
  state: ServerState,
  _initialWager: number,
  totalWagered: number,
): Promise<SettleResult | null> {
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
  if (!(await db.settleHand(userId, handId, {
    state: null,            // free the active-state JSON
    result: resultJson,
    net_delta: netDelta,
    settled_at: new Date(clockNow()).toISOString(),
  }))) return null

  // Wagers were already taken from chips at action time; the return lands in place.
  const newChips = totalReturned > 0
    ? await db.grant(userId, 'casino_chips', totalReturned)
    : await getChips(db, userId)

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
  if (newWinStreak >= 5) { try { await db.grantBadge(userId, 'unstoppable') } catch { /* best-effort */ } }
  if (newDealerBjStreak >= 2) { try { await db.grantBadge(userId, 'stacked_deck') } catch { /* best-effort */ } }

  const [dailyWagered, dailyCap] = await Promise.all([getDailyBuyInTotal(db, userId), getDenCap(db, userId)])
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
async function loadActiveHand(db: CasinoData, userId: string): Promise<{ id: number; state: ServerState; initial_wager: number; total_wagered: number } | null> {
  const data = await db.activeHand(userId)
  if (!data || !data.state) return null
  return {
    id: data.id as number,
    state: data.state as ServerState,
    initial_wager: data.initial_wager as number,
    total_wagered: data.total_wagered as number,
  }
}

/** The player's chip balance (the SHARED casino purse). Doubloons are the
 *  off-table currency and don't move during hands. */
async function getChips(db: CasinoData, userId: string): Promise<number> {
  const data = await db.profile(userId, 'casino_chips')
  return (data?.casino_chips as number | null) ?? 0
}

/** Wrap a settlement for the client. null means a twin request already
 *  settled this hand and was paid; this one reports that instead. */
function settledOrError(result: SettleResult | null): ActionResult {
  return result ? { kind: 'settled', result } : { error: 'Hand already settled' }
}

/** The table as the client sees it mid-hand: the purse, the day's cap and
 *  the session (cumulative buy-ins since the last reset, and blackjack's own
 *  net — chips alone cannot say how blackjack went when the same purse also
 *  played roulette and slots). */
async function activeView(db: CasinoData, userId: string, handId: number, state: ServerState, totalWagered: number, chips?: number): Promise<ActionResult> {
  const [prof, dailyAlready, dailyCap] = await Promise.all([
    db.profile(userId, 'casino_chips, doubloons, casino_session_buy_ins, blackjack_session_net'),
    getDailyBuyInTotal(db, userId),
    getDenCap(db, userId),
  ])
  return {
    kind: 'active',
    state: toClientState(handId, state, totalWagered,
      chips ?? ((prof?.casino_chips as number | null) ?? 0),
      (prof?.doubloons as number | null) ?? 0,
      Math.max(0, dailyCap - dailyAlready), dailyCap,
      (prof?.casino_session_buy_ins as number | null) ?? 0,
      (prof?.blackjack_session_net as number | null) ?? 0),
  }
}

export async function dealBlackjack(db: CasinoData, uid: string, wager: number): Promise<ActionResult> {
  if (!Number.isInteger(wager) || wager < BJ_MIN_BET || wager > BJ_MAX_BET) {
    return { error: 'Invalid wager' }
  }

  // Auto-settle any orphan active hand BEFORE starting a new one. This
  // covers the "player closed the tab mid-hand" case: auto-stand every
  // unfinished hand, let dealer play, settle, then proceed.
  const orphan = await loadActiveHand(db, uid)
  if (orphan) {
    standAll(orphan.state)
    await finalizeSettlement(db, uid, orphan.id, orphan.state, orphan.initial_wager, orphan.total_wagered)
  }

  // Wagers come out of CHIPS, not doubloons. Daily cap is enforced
  // at buy-in, not per-hand — chips on the table can churn freely.
  // The wager leaves the purse in place up front. That is the guard: two
  // deals fired together cannot both stake the same chips.
  const afterStake = await db.spend(uid, 'casino_chips', wager)
  if (afterStake === null) return { error: 'Not enough chips' }

  // A fresh shoe, two and two; an Ace up offers insurance, otherwise a
  // natural on either side settles at once (lib/casinoRules dealTable).
  const state = dealTable(wager)

  // Insert the hand row
  const handId = await db.openHand(uid, wager, state)
  if (handId == null) {
    await db.grant(uid, 'casino_chips', wager)
    return { error: 'Failed to create hand' }
  }

  // Naturals with no insurance gate settle at once.
  if (state.phase === 'settled') {
    return settledOrError(await finalizeSettlement(db, uid, handId, state, wager, wager))
  }
  return activeView(db, uid, handId, state, wager, afterStake)
}

/** Accept insurance: charge half wager, resolve dealer natural check. */
export async function acceptInsurance(db: CasinoData, uid: string): Promise<ActionResult> {
  const hand = await loadActiveHand(db, uid)
  if (!hand) return { error: 'No active hand' }
  if (hand.state.phase !== 'insuranceOffered') return { error: 'Insurance not available' }

  const initialWager = hand.initial_wager
  const insurance = insuranceCost(initialWager)
  const afterInsurance = await db.spend(uid, 'casino_chips', insurance)
  if (afterInsurance === null) return { error: 'Not enough chips for insurance' }
  answerInsurance(hand.state, insurance)
  const totalWagered = hand.total_wagered + insurance
  await db.saveHand(hand.id, hand.state, totalWagered)
  if ((hand.state.phase as Phase) === 'settled') {
    return settledOrError(await finalizeSettlement(db, uid, hand.id, hand.state, initialWager, totalWagered))
  }
  return activeView(db, uid, hand.id, hand.state, totalWagered, afterInsurance)
}

/** Decline insurance: no charge; check dealer natural anyway, resolve if hit. */
export async function declineInsurance(db: CasinoData, uid: string): Promise<ActionResult> {
  const hand = await loadActiveHand(db, uid)
  if (!hand) return { error: 'No active hand' }
  if (hand.state.phase !== 'insuranceOffered') return { error: 'Insurance not available' }

  answerInsurance(hand.state, null)
  await db.saveHand(hand.id, hand.state, hand.total_wagered)
  if ((hand.state.phase as Phase) === 'settled') {
    return settledOrError(await finalizeSettlement(db, uid, hand.id, hand.state, hand.initial_wager, hand.total_wagered))
  }
  return activeView(db, uid, hand.id, hand.state, hand.total_wagered)
}

export async function hit(db: CasinoData, uid: string): Promise<ActionResult> {
  const hand = await loadActiveHand(db, uid)
  if (!hand) return { error: 'No active hand' }
  const refusal = turnRefusal(hand.state)
  if (refusal) return { error: refusal }
  hitTable(hand.state)   // bust, or auto-stand on 21
  await db.saveHand(hand.id, hand.state, hand.total_wagered)

  if ((hand.state.phase as Phase) === 'settled') {
    return settledOrError(await finalizeSettlement(db, uid, hand.id, hand.state, hand.initial_wager, hand.total_wagered))
  }
  return activeView(db, uid, hand.id, hand.state, hand.total_wagered)
}

export async function stand(db: CasinoData, uid: string): Promise<ActionResult> {
  const hand = await loadActiveHand(db, uid)
  if (!hand) return { error: 'No active hand' }
  const refusal = turnRefusal(hand.state)
  if (refusal) return { error: refusal }
  standTable(hand.state)
  await db.saveHand(hand.id, hand.state, hand.total_wagered)

  if ((hand.state.phase as Phase) === 'settled') {
    return settledOrError(await finalizeSettlement(db, uid, hand.id, hand.state, hand.initial_wager, hand.total_wagered))
  }
  return activeView(db, uid, hand.id, hand.state, hand.total_wagered)
}

export async function doubleDown(db: CasinoData, uid: string): Promise<ActionResult> {
  const hand = await loadActiveHand(db, uid)
  if (!hand) return { error: 'No active hand' }
  const refusal = doubleRefusal(hand.state)
  if (refusal) return { error: refusal }
  const active = hand.state.hands[hand.state.activeHandIdx]

  const afterDouble = await db.spend(uid, 'casino_chips', active.wager)
  if (afterDouble === null) return { error: 'Not enough chips to double' }
  doubleTable(hand.state)   // one card, and the hand ends
  const totalWagered = hand.total_wagered + (active.wager / 2)   // we doubled wager, the delta added equals the original wager
  await db.saveHand(hand.id, hand.state, totalWagered)

  if ((hand.state.phase as Phase) === 'settled') {
    return settledOrError(await finalizeSettlement(db, uid, hand.id, hand.state, hand.initial_wager, totalWagered))
  }
  return activeView(db, uid, hand.id, hand.state, totalWagered, afterDouble)
}

export async function split(db: CasinoData, uid: string): Promise<ActionResult> {
  const hand = await loadActiveHand(db, uid)
  if (!hand) return { error: 'No active hand' }
  const refusal = splitRefusal(hand.state)
  if (refusal) return { error: refusal }

  const initialWager = hand.initial_wager
  // Charge the second wager in place
  const afterSplit = await db.spend(uid, 'casino_chips', initialWager)
  if (afterSplit === null) return { error: 'Not enough chips to split' }

  // Each hand takes one card and a fresh draw; split aces stand (lib/casinoRules).
  splitTable(hand.state, initialWager)
  const totalWagered = hand.total_wagered + initialWager
  await db.saveHand(hand.id, hand.state, totalWagered)

  if ((hand.state.phase as Phase) === 'settled') {
    return settledOrError(await finalizeSettlement(db, uid, hand.id, hand.state, initialWager, totalWagered))
  }
  return activeView(db, uid, hand.id, hand.state, totalWagered, afterSplit)
}

/** Resume the active hand on page load (or return null if none). */
export async function resumeHand(db: CasinoData, uid: string): Promise<ClientState | null> {
  const hand = await loadActiveHand(db, uid)
  if (!hand) return null
  const view = await activeView(db, uid, hand.id, hand.state, hand.total_wagered)
  return 'state' in view ? view.state : null
}
