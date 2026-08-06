'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getXPProgress as navProgress } from '@/lib/expeditionLevel'
import {
  TERMS, type Term, type Direction,
  quoteFund, quoteSingle, settlePayout, FUND_BY_ID,
  EARLY_CLOSE_RETURN, EXCHANGE_FISHING_LEVEL, EXCHANGE_NAV_LEVEL,
} from '@/lib/fishExchange'

// The Exchange's write side. Contracts, not shares: nothing here touches
// fish_inventory, the hold, or any of the three selling lanes.
//
// Settlement is NOT here. Contracts settle themselves in the database, on a
// cron a couple of minutes past the hour (settle_exchange_contracts), so a
// contract expiring worthless always means the market went against you and
// never that you were not looking. These actions only cover opening one and
// choosing to close it early.

export type Instrument =
  | { kind: 'fund'; fundId: string }
  | { kind: 'fish'; fishId: number }

export type OpenResult = { ok: true; positionId: number; doubloons: number } | { error: string }

/** Smallest and largest a single contract can be. The cap is the brake on the
 *  whole feature: whatever edge a clever player finds in the price engine, they
 *  can only push this much through it at a time. */
export const MIN_STAKE = 500
export const MAX_STAKE = 250_000

type Gate = { open: true } | { open: false; reason: string }

async function checkGate(profile: { fishing_xp?: number | null; expedition_xp?: number | null } | null): Promise<Gate> {
  const fishing = getLevelFromXP(Number(profile?.fishing_xp ?? 0))
  const nav = navProgress(Number(profile?.expedition_xp ?? 0)).level
  if (fishing < EXCHANGE_FISHING_LEVEL) return { open: false, reason: `Fishing ${EXCHANGE_FISHING_LEVEL} opens the Exchange` }
  if (nav < EXCHANGE_NAV_LEVEL) return { open: false, reason: `Navigation ${EXCHANGE_NAV_LEVEL} opens the Exchange` }
  return { open: true }
}

export async function openContract(
  instrument: Instrument, direction: Direction, term: Term, stake: number,
): Promise<OpenResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  if (!TERMS.includes(term)) return { error: 'Unknown term' }
  if (direction !== 'rise' && direction !== 'fall') return { error: 'Pick a direction' }
  stake = Math.floor(stake)
  if (!Number.isFinite(stake) || stake < MIN_STAKE) return { error: `Smallest contract is ${MIN_STAKE.toLocaleString()} ⟡` }
  if (stake > MAX_STAKE) return { error: `Largest contract is ${MAX_STAKE.toLocaleString()} ⟡` }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('doubloons, fishing_xp, expedition_xp').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }

  const gate = await checkGate(profile)
  if (!gate.open) return { error: gate.reason }

  // Price and quote, read together so the contract is written against the
  // board the player was actually looking at.
  const { data: state } = await admin.from('market_state').select('exchange_cycle').eq('id', 1).single()
  const cycle = Number(state?.exchange_cycle ?? 0)

  let entry: number
  let leverage: number
  if (instrument.kind === 'fund') {
    if (!FUND_BY_ID.has(instrument.fundId)) return { error: 'Unknown fund' }
    const { data: f } = await admin.from('exchange_funds')
      .select('price, members').eq('fund_id', instrument.fundId).single()
    if (!f) return { error: 'Fund not listed' }
    entry = Number(f.price)
    leverage = quoteFund(Number(f.members), term).leverage
  } else {
    const { data: fx } = await admin.from('fish_exchange')
      .select('price, fish_species(bite_rarity)').eq('fish_id', instrument.fishId).single()
    if (!fx) return { error: 'Fish not listed' }
    entry = Number(fx.price)
    const rarity = Number((fx.fish_species as unknown as { bite_rarity: number } | null)?.bite_rarity ?? 3)
    leverage = quoteSingle(rarity, term).leverage
  }
  if (!(entry > 0)) return { error: 'No price for that instrument' }

  // Debit FIRST, atomically and balance-guarded, the same order every purchase
  // in the game uses. A contract written before the stake was taken is a
  // contract somebody could open with money they do not have.
  const { data: newDoubloons } = await admin.rpc('deduct_doubloons', { uid: user.id, amount: stake })
  if (newDoubloons == null) return { error: `Need ${stake.toLocaleString()} ⟡` }

  const { data: pos, error } = await admin.from('exchange_positions').insert({
    user_id: user.id,
    fund_id: instrument.kind === 'fund' ? instrument.fundId : null,
    fish_id: instrument.kind === 'fish' ? instrument.fishId : null,
    direction, term, stake,
    // Locked at open. Retuning the payout tables must never change what a
    // contract already sold to a player is worth.
    leverage,
    entry_price: entry,
    open_cycle: cycle,
    expiry_cycle: cycle + term,
  }).select('id').single()

  if (error || !pos) {
    // Give the stake back rather than leaving them short for a contract that
    // does not exist.
    await admin.rpc('bump_profile_stat', { uid: user.id, col: 'doubloons', n: stake })
    return { error: 'Could not open the contract' }
  }

  await admin.from('doubloon_transactions').insert({
    user_id: user.id, amount: -stake, reason: 'Exchange contract opened',
  })

  return { ok: true, positionId: pos.id as number, doubloons: Number(newDoubloons) }
}

export type CloseResult = { ok: true; payout: number; doubloons: number } | { error: string }

/** Close before expiry for a share of what the contract is worth right now.
 *
 *  The haircut is not a penalty for impatience, it is the price of optionality:
 *  the leverage was solved so the expected payout AT EXPIRY is fair, and being
 *  able to pick your own moment is worth strictly more than that. */
export async function closeContractEarly(positionId: number): Promise<CloseResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  // Claim it before paying anything. Guarded on status AND owner, so a second
  // tap, or the settler landing at the same moment, finds nothing to close.
  const { data: claimed } = await admin
    .from('exchange_positions')
    .update({ status: 'closed_early', settled_at: new Date().toISOString() })
    .eq('id', positionId)
    .eq('user_id', user.id)
    .eq('status', 'open')
    .select('*')
    .maybeSingle()
  if (!claimed) return { error: 'That contract is already settled' }

  let exit: number
  if (claimed.fund_id) {
    const { data: f } = await admin.from('exchange_funds').select('price').eq('fund_id', claimed.fund_id).single()
    exit = Number(f?.price ?? claimed.entry_price)
  } else {
    const { data: fx } = await admin.from('fish_exchange').select('price').eq('fish_id', claimed.fish_id).single()
    exit = Number(fx?.price ?? claimed.entry_price)
  }

  const gross = settlePayout(
    Number(claimed.stake), Number(claimed.entry_price), exit,
    claimed.direction as Direction,
    { leverage: Number(claimed.leverage), breakEvenPct: 1 / Number(claimed.leverage) },
  )
  const payout = Math.max(0, Math.round(gross * EARLY_CLOSE_RETURN))

  await admin.from('exchange_positions')
    .update({ exit_price: exit, payout })
    .eq('id', positionId)

  let doubloons = 0
  if (payout > 0) {
    const { data: bal } = await admin.rpc('bump_profile_stat', { uid: user.id, col: 'doubloons', n: payout })
    void bal
    await admin.from('doubloon_transactions').insert({
      user_id: user.id, amount: payout, reason: 'Exchange contract closed early',
    })
  }
  const { data: p } = await admin.from('profiles').select('doubloons').eq('id', user.id).single()
  doubloons = Number(p?.doubloons ?? 0)

  return { ok: true, payout, doubloons }
}
