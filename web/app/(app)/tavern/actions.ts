'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SLOT_SYMBOLS_LIST, SLOT_PAYOUTS, SLOT_PARTIAL_PAYOUTS, SLOTS_MIN_BET, SLOTS_MAX_BET, SLOTS_DAILY_CAP } from './constants'
import type { SlotSymbolId } from './constants'

// Crown & Anchor was retired 2026-06-06 — replaced by Blackjack
// (app/(app)/tavern/blackjack/actions.ts). The dice_rolls table stays
// in the DB as historical record but no code writes to it anymore.

// ─── Fish Slots ───────────────────────────────────────────────────────────────

export interface SlotSpinResult {
  reels: SlotSymbolId[]
  outcome: 'win' | 'lose' | 'bonus' | 'refund' | 'near_miss' | 'partial_win' | 'wild_win'
  payout: number
  net: number
  newDoubloons: number
  dailyWagered: number
  matchedSymbol?: SlotSymbolId
  bonus?: {
    reels: SlotSymbolId[]
    outcome: 'win' | 'lose'
    payout: number
  }
}

function slotWeightedRandom(): SlotSymbolId {
  const total = SLOT_SYMBOLS_LIST.reduce((s, sym) => s + sym.weight, 0)
  let r = Math.random() * total
  for (const sym of SLOT_SYMBOLS_LIST) {
    r -= sym.weight
    if (r <= 0) return sym.id
  }
  return SLOT_SYMBOLS_LIST[SLOT_SYMBOLS_LIST.length - 1].id
}

function slotRollReels(): SlotSymbolId[] {
  return [slotWeightedRandom(), slotWeightedRandom(), slotWeightedRandom()]
}

export interface SlotStats {
  spins: number
  net: number
  biggestWin: number
}

export async function getSlotStats(): Promise<SlotStats> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { spins: 0, net: 0, biggestWin: 0 }
  const admin = createAdminClient()
  const { data } = await admin
    .from('slot_spins')
    .select('wager, payout')
    .eq('user_id', user.id)
  const rows = data ?? []
  const spins = rows.length
  const net = rows.reduce((s, r) => s + (r.payout - r.wager), 0)
  const biggestWin = rows.reduce((max, r) => Math.max(max, r.payout - r.wager), 0)
  return { spins, net, biggestWin }
}

export async function getSlotsDailyWagered(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await admin
    .from('slot_spins')
    .select('wager')
    .eq('user_id', user.id)
    .gte('created_at', today)
  return (data ?? []).reduce((sum: number, r: { wager: number }) => sum + r.wager, 0)
}

export async function spinSlots(wager: number): Promise<SlotSpinResult | { error: string }> {
  if (wager < SLOTS_MIN_BET || wager > SLOTS_MAX_BET) return { error: 'Invalid wager' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons')
    .eq('id', user.id)
    .single()
  if (!profile || profile.doubloons < wager) return { error: 'Insufficient doubloons' }

  const today = new Date().toISOString().split('T')[0]
  const { data: todaySpins } = await admin
    .from('slot_spins')
    .select('wager')
    .eq('user_id', user.id)
    .gte('created_at', today)
  const totalWagered = (todaySpins ?? []).reduce((sum: number, r: { wager: number }) => sum + r.wager, 0)
  if (totalWagered + wager > SLOTS_DAILY_CAP) return { error: `Daily limit reached (${SLOTS_DAILY_CAP} ⟡)` }

  const reels = slotRollReels()
  const [a, b, c] = reels
  const allSame = a === b && b === c
  const hookCount = reels.filter(r => r === 'anchor').length
  const fishReels = reels.filter(r => r !== 'anchor') as SlotSymbolId[]

  let outcome: SlotSpinResult['outcome']
  let payout = 0
  let matchedSymbol: SlotSymbolId | undefined
  let bonus: SlotSpinResult['bonus'] | undefined

  if (allSame && a === 'anchor') {
    // 3 hooks → bonus spin
    outcome = 'bonus'
    const bonusReels = slotRollReels()
    const [ba, bb, bc] = bonusReels
    const bonusAllSame = ba === bb && bb === bc
    if (bonusAllSame && ba !== 'anchor') {
      const bonusPayout = wager * SLOT_PAYOUTS[ba]
      bonus = { reels: bonusReels, outcome: 'win', payout: bonusPayout }
    } else {
      bonus = { reels: bonusReels, outcome: 'lose', payout: 0 }
    }
    payout = wager + bonus.payout
  } else if (hookCount === 2) {
    // 2 hooks anywhere → refund
    outcome = 'refund'
    payout = wager
  } else if (allSame) {
    // 3 of same fish → full win
    outcome = 'win'
    payout = wager * SLOT_PAYOUTS[a]
  } else if (hookCount === 1 && fishReels[0] === fishReels[1]) {
    // 1 hook + 2 matching fish → hook wild partial win
    outcome = 'wild_win'
    matchedSymbol = fishReels[0]
    payout = Math.floor(wager * (SLOT_PARTIAL_PAYOUTS[matchedSymbol] ?? 1))
  } else if (hookCount === 0 && (a === b || a === c || b === c)) {
    // 2 matching fish, no hooks → partial win
    outcome = 'partial_win'
    matchedSymbol = a === b ? a : a === c ? a : b
    payout = Math.floor(wager * (SLOT_PARTIAL_PAYOUTS[matchedSymbol] ?? 1))
  } else {
    outcome = 'lose'
    payout = 0
  }

  const net = payout - wager
  const newDoubloons = profile.doubloons + net

  const outcomeLabel =
    outcome === 'win'         ? `${SLOT_PAYOUTS[a]}× on ${a}` :
    outcome === 'bonus'       ? `bonus spin (${bonus!.outcome})` :
    outcome === 'refund'      ? '2 hooks — refund' :
    outcome === 'wild_win'    ? `hook wild — 2× ${matchedSymbol}` :
    outcome === 'partial_win' ? `2× ${matchedSymbol}` :
    'no match'

  await Promise.all([
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('slot_spins').insert({ user_id: user.id, wager, reels, outcome, payout }),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: net,
      reason: `Fish Slots: ${outcomeLabel}`,
    }),
  ])

  revalidatePath('/tavern/slots')
  return { reels, outcome, payout, net, newDoubloons, dailyWagered: totalWagered + wager, matchedSymbol, bonus }
}

