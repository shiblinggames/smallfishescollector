'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SYMBOLS, DAILY_CAP, MAX_BET, MIN_BET } from './constants'
import type { Symbol } from './constants'
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

