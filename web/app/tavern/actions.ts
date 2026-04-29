'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SYMBOLS, DAILY_CAP, MAX_BET, MIN_BET, SLOT_SYMBOLS_LIST, SLOT_PAYOUTS, SLOTS_MIN_BET, SLOTS_MAX_BET, SLOTS_DAILY_CAP } from './constants'
import type { Symbol, SlotSymbolId } from './constants'
import { checkAchievements } from '@/lib/checkAchievements'

function randomSymbol(): Symbol {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
}

export async function getDailyWagered(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await admin
    .from('dice_rolls')
    .select('wager')
    .eq('user_id', user.id)
    .gte('created_at', today)
  return (data ?? []).reduce((sum, r) => sum + r.wager, 0)
}

export interface RollResult {
  result: Symbol[]
  matches: number
  payout: number
  net: number
  newDoubloons: number
  dailyWagered: number
  newAchievements?: string[]
}

export async function rollDice(symbol: Symbol, wager: number): Promise<RollResult | { error: string }> {
  if (!SYMBOLS.includes(symbol)) return { error: 'Invalid symbol' }
  if (wager < MIN_BET || wager > MAX_BET) return { error: 'Invalid wager' }

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
  const { data: todayRolls } = await admin
    .from('dice_rolls')
    .select('wager')
    .eq('user_id', user.id)
    .gte('created_at', today)
  const totalWagered = (todayRolls ?? []).reduce((sum, r) => sum + r.wager, 0)
  if (totalWagered + wager > DAILY_CAP) return { error: `Daily limit reached (${DAILY_CAP} ⟡)` }

  const result: Symbol[] = [randomSymbol(), randomSymbol(), randomSymbol()]
  const matches = result.filter((s) => s === symbol).length
  const payout = matches > 0 ? wager * matches : 0
  const net = payout - wager
  const newDoubloons = profile.doubloons + net

  await Promise.all([
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('dice_rolls').insert({ user_id: user.id, symbol, wager, result, matches, payout }),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: net,
      reason: `Crown & Anchor: ${matches} match${matches !== 1 ? 'es' : ''} on ${symbol}`,
    }),
  ])

  const newAchievements = await checkAchievements(user.id, { type: 'crown', matches, wager })

  revalidatePath('/tavern')
  return { result, matches, payout, net, newDoubloons, dailyWagered: totalWagered + wager, newAchievements }
}

// ─── Fish Slots ───────────────────────────────────────────────────────────────

export interface SlotSpinResult {
  reels: SlotSymbolId[]
  outcome: 'win' | 'lose' | 'bonus'
  payout: number
  net: number
  newDoubloons: number
  dailyWagered: number
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

  let outcome: 'win' | 'lose' | 'bonus'
  let payout = 0
  let bonus: SlotSpinResult['bonus'] | undefined

  if (allSame && a === 'anchor') {
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
  } else if (allSame) {
    outcome = 'win'
    payout = wager * SLOT_PAYOUTS[a]
  } else {
    outcome = 'lose'
    payout = 0
  }

  const net = payout - wager
  const newDoubloons = profile.doubloons + net

  const outcomeLabel =
    outcome === 'win' ? `${SLOT_PAYOUTS[a]}× on ${a}` :
    outcome === 'bonus' ? `bonus spin (${bonus!.outcome})` :
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
  return { reels, outcome, payout, net, newDoubloons, dailyWagered: totalWagered + wager, bonus }
}

