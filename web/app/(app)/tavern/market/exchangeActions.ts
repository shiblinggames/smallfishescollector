'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getXPProgress as navProgress } from '@/lib/expeditionLevel'
import {
  TERMS, type Term, type Direction,
  quoteFund, quoteSingle, FUND_BY_ID,
  liveValue, EXCHANGE_FISHING_LEVEL, EXCHANGE_NAV_LEVEL,
  MIN_STAKE, MAX_STAKE,
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
      .select('price').eq('fund_id', instrument.fundId).single()
    if (!f) return { error: 'Fund not listed' }
    entry = Number(f.price)
    leverage = quoteFund(instrument.fundId, term).leverage
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

/** Close before expiry for what the contract is worth right now, less the time
 *  value still on it. Sell a winner the moment it spikes, the way you would in
 *  any trading app; waiting for expiry costs nothing extra. */
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

  // What it is WORTH, which is intrinsic plus the time still on it. A contract
  // behind on the day but with three days to run is not worthless, and paying
  // intrinsic only was telling players it was.
  const { data: st } = await admin.from('market_state').select('exchange_cycle').eq('id', 1).single()
  const remaining = Math.max(0, Number(claimed.expiry_cycle) - Number(st?.exchange_cycle ?? 0))
  const entry = Number(claimed.entry_price)
  const movePct = ((exit - entry) / entry) * 100
  const yourWay = claimed.direction === 'rise' ? movePct : -movePct
  const payout = liveValue(
    Number(claimed.stake), Number(claimed.leverage), yourWay, remaining, Number(claimed.term) as Term,
  )

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

// ── Read side ───────────────────────────────────────────────────────────────

export type BoardFund = {
  id: string; name: string; blurb: string; accent: string
  price: number; prevPrice: number; members: number; history: number[]
}
export type BoardFish = {
  fishId: number; name: string; habitat: string; rarity: number
  price: number; prevPrice: number; history: number[]
}
export type BoardPosition = {
  id: number
  label: string
  accent: string
  direction: Direction
  term: Term
  stake: number
  leverage: number
  entryPrice: number
  livePrice: number
  openCycle: number
  expiryCycle: number
  status: 'open' | 'settled' | 'closed_early'
  payout: number | null
  exitPrice: number | null
  seen: boolean
  /** The instrument's own recent prices, so the detail sheet can draw where
   *  this contract sits on the line rather than describing it in numbers. */
  history: number[]
  /** Fish only, for the sheet's subtitle. */
  habitat: string | null
}
export type ExchangeBoard = {
  open: boolean
  gateReason: string | null
  cycle: number
  doubloons: number
  funds: BoardFund[]
  fish: BoardFish[]
  positions: BoardPosition[]
  unseen: number
}

export async function getExchangeBoard(): Promise<ExchangeBoard | { error: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const uid = session?.user?.id
  if (!uid) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const [profileRes, stateRes, fundsRes, fishRes, posRes] = await Promise.all([
    admin.from('profiles').select('doubloons, fishing_xp, expedition_xp').eq('id', uid).single(),
    admin.from('market_state').select('exchange_cycle').eq('id', 1).single(),
    admin.from('exchange_funds').select('fund_id, price, prev_price, members, history'),
    admin.from('fish_exchange')
      .select('fish_id, price, prev_price, history, fish_species(name, habitat, bite_rarity)'),
    admin.from('exchange_positions')
      .select('id, fund_id, fish_id, direction, term, stake, leverage, entry_price, open_cycle, expiry_cycle, status, payout, exit_price, seen')
      .eq('user_id', uid)
      .order('id', { ascending: false })
      .limit(60),
  ])

  const gate = await checkGate(profileRes.data)
  const cycle = Number(stateRes.data?.exchange_cycle ?? 0)

  const funds: BoardFund[] = (fundsRes.data ?? []).map(f => {
    const def = FUND_BY_ID.get(f.fund_id as string)
    return {
      id: f.fund_id as string,
      name: def?.name ?? (f.fund_id as string),
      blurb: def?.blurb ?? '',
      accent: def?.accent ?? '#38bdf8',
      price: Number(f.price), prevPrice: Number(f.prev_price),
      members: Number(f.members),
      history: ((f.history as number[] | null) ?? []).map(Number),
    }
  }).sort((a, b) => b.members - a.members)

  const fish: BoardFish[] = (fishRes.data ?? []).map(r => {
    const s = r.fish_species as unknown as { name: string; habitat: string; bite_rarity: number } | null
    return {
      fishId: r.fish_id as number,
      name: s?.name ?? 'Unknown', habitat: s?.habitat ?? 'shallows', rarity: Number(s?.bite_rarity ?? 3),
      price: Number(r.price), prevPrice: Number(r.prev_price),
      history: ((r.history as number[] | null) ?? []).map(Number),
    }
  })

  const fundById = new Map(funds.map(f => [f.id, f]))
  const fishById = new Map(fish.map(f => [f.fishId, f]))

  const positions: BoardPosition[] = (posRes.data ?? []).map(p => {
    const isFund = p.fund_id != null
    const fu = isFund ? fundById.get(p.fund_id as string) : undefined
    const fi = !isFund ? fishById.get(p.fish_id as number) : undefined
    const inst = fu ?? fi
    return {
      id: p.id as number,
      label: fu?.name ?? fi?.name ?? 'Unknown',
      accent: fu?.accent ?? '#7dd3fc',
      direction: p.direction as Direction,
      term: Number(p.term) as Term,
      stake: Number(p.stake),
      leverage: Number(p.leverage),
      entryPrice: Number(p.entry_price),
      livePrice: inst?.price ?? Number(p.entry_price),
      openCycle: Number(p.open_cycle),
      expiryCycle: Number(p.expiry_cycle),
      status: p.status as 'open' | 'settled' | 'closed_early',
      payout: p.payout == null ? null : Number(p.payout),
      exitPrice: p.exit_price == null ? null : Number(p.exit_price),
      seen: p.seen === true,
      history: inst?.history ?? [],
      habitat: fi?.habitat ?? null,
    }
  })

  return {
    open: gate.open,
    gateReason: gate.open ? null : gate.reason,
    cycle,
    doubloons: Number(profileRes.data?.doubloons ?? 0),
    funds, fish, positions,
    unseen: positions.filter(p => p.status !== 'open' && !p.seen).length,
  }
}

/** Clear the "new result" markers once the player has looked at them. */
export async function markResultsSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient()
    .from('exchange_positions')
    .update({ seen: true })
    .eq('user_id', user.id)
    .neq('status', 'open')
    .eq('seen', false)
}
