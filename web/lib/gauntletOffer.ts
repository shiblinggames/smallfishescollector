// ── DAVY'S OFFER ─────────────────────────────────────────────────────────────
// The banker's bargain. At a breather, Davy sometimes leans over the rail and
// tries to BUY YOU OUT: bank right here and he sweetens the haul. Dive on and the
// offer is gone.
//
// The whole point is WHEN he shows up. He does not haggle with the drowning — an
// offer only lands when you are healthy and deep, which is exactly the moment you
// were feeling invincible and planning to push. That is the tension: the offer is
// never a lifeline, it is a temptation.
//
// And refusing him is not free of consequence, it is the opposite: he comes back
// with MORE. Every "No Deal" makes the next offer richer, so a captain who keeps
// waving him off is watching the pot they walked away from get fatter while the
// water gets darker. That is the Deal or No Deal spine, and it is the only reason
// the escalation exists.
//
// EVERYTHING here is rolled and stored by the server (see gauntlet_run_offer,
// which mirrors gauntlet_run_terms exactly). The client is told what the offer IS;
// it never gets to decide that one happened, what kind it is, or what it pays.

/** What Davy is willing to sweeten. The three levers a cash-out actually has. */
export type OfferKind = 'coin' | 'fathoms' | 'chest'

export interface DavyOffer {
  kind: OfferKind
  /** 1-3. Climbs each time you tell him no. */
  tier: number
  /** The depth the offer was made at. Cash-out refuses to honor it at any other
   *  depth, so an offer can never be carried deeper and cashed at a bigger pot. */
  depth: number
}

export interface OfferState {
  live: DavyOffer | null
  /** How many offers this captain has turned down this run. Drives the tier. */
  refused: number
  /** Depth of the last offer made, so he does not pester you every breather. */
  lastAt: number
  /** Depth this state was last ROLLED at, hit or miss. A breather can ask more
   *  than once for the same depth — a leave-and-resume re-enters it, and so does
   *  any beat that hands the rail back — and the answer has to stand. Without
   *  this, asking again after a HIT fell into the cooldown check below and
   *  returned nothing, which is how a live offer appeared on the rail and then
   *  vanished a moment later; and asking again after a MISS handed out a free
   *  second roll at the same depth. Optional so runs opened before this shipped
   *  still read (they simply roll once more, which is the old behaviour). */
  rolledAt?: number
}

export const EMPTY_OFFER_STATE: OfferState = { live: null, refused: 0, lastAt: 0 }

// ── WHEN HE SHOWS UP ─────────────────────────────────────────────────────────
/**
 * Too shallow and there is nothing to tempt you with. This is set LATE on purpose.
 * Measured as "how many more depths must you survive for a plain bank to beat the
 * best offer on the table", a shallow bargain is worth about four more depths, which
 * is a shrug. Past 30 it is worth thirteen to nineteen, which is a decision. Davy
 * does not waste his breath on a captain who has nothing to lose yet.
 */
export const OFFER_MIN_DEPTH = 30
/** He does not haggle with the drowning. Below this, no offer — the bargain must
 *  land while you still feel strong enough to refuse it. */
export const OFFER_MIN_HP_PCT = 0.5
/**
 * Depths of quiet between offers, so he stays an event and not a menu. Together with
 * OFFER_CHANCE this is deliberately STINGY: a captain who banks around 40 usually
 * meets him once and a third of them never meet him at all, while a run to the floor
 * of the world sees maybe three. He was a vending machine at 22% and a 3-depth
 * cooldown (seven offers on a deep dive), which is no way to treat a bargain.
 */
export const OFFER_COOLDOWN = 8
export const OFFER_CHANCE = 0.10
/** Tier only climbs when you REFUSE, so at this rarity a tier-3 offer takes a very
 *  deep run AND the nerve to have told him no twice. It should be a story. */
export const OFFER_MAX_TIER = 3

// ── WHAT HE PAYS ─────────────────────────────────────────────────────────────
// Indexed by tier - 1. Tuned so tier 1 is a real nudge, tier 3 is genuinely hard
// to walk away from, and none of it beats simply surviving several more depths —
// the offer should tempt the greedy, never dominate the brave.
const COIN_BONUS   = [0.25, 0.40, 0.60]
const FATHOM_BONUS = [0.30, 0.50, 0.75]
const CHEST_MULT   = [1.5, 2.0, 2.5]

/** Hard ceiling on any single chest drop chance after the offer multiplies it. A
 *  deep bank already sits at 10%; this stops a tier-3 chest offer from turning the
 *  chase items into a formality. */
export const CHEST_ODDS_CAP = 0.25

const clampTier = (t: number) => Math.max(1, Math.min(OFFER_MAX_TIER, Math.floor(t)))

/** Multiplier on banked doubloons. 1 when the offer is not a coin offer. */
export function offerCoinMult(o: DavyOffer | null): number {
  return o?.kind === 'coin' ? 1 + COIN_BONUS[clampTier(o.tier) - 1] : 1
}
/** Multiplier on banked Fathoms. 1 when the offer is not a fathoms offer. */
export function offerFathomMult(o: DavyOffer | null): number {
  return o?.kind === 'fathoms' ? 1 + FATHOM_BONUS[clampTier(o.tier) - 1] : 1
}
/** Multiplier on every chest drop chance. 1 when the offer is not a chest offer. */
export function offerChestMult(o: DavyOffer | null): number {
  return o?.kind === 'chest' ? CHEST_MULT[clampTier(o.tier) - 1] : 1
}

/** The pitch. Kept here so the breather, the cash-out beat and any future retelling
 *  of the run all quote Davy saying the same thing. */
export function offerCopy(o: DavyOffer): { title: string; line: string; badge: string } {
  const t = clampTier(o.tier)
  const badge = t === 1 ? 'Davy makes an offer' : t === 2 ? 'Davy makes a better offer' : 'Davy is done asking nicely'
  switch (o.kind) {
    case 'coin':
      return { title: 'A Purse for Your Trouble', badge,
        line: `Bank right here and the haul comes up ${Math.round(COIN_BONUS[t - 1] * 100)}% heavier.` }
    case 'fathoms':
      return { title: 'Wages for the Deep', badge,
        line: `Bank right here and the Fathoms pay out ${Math.round(FATHOM_BONUS[t - 1] * 100)}% richer.` }
    case 'chest':
      return { title: 'A Heavier Chest', badge,
        line: `Bank right here and every drop in the chest is ${CHEST_MULT[t - 1]}x likelier.` }
  }
}

/** One line for the reward screen, after the deal is done. */
export function offerTakenLine(o: DavyOffer): string {
  const t = clampTier(o.tier)
  switch (o.kind) {
    case 'coin':    return `You took Davy's purse. Haul paid ${Math.round(COIN_BONUS[t - 1] * 100)}% heavier.`
    case 'fathoms': return `You took Davy's wages. Fathoms paid ${Math.round(FATHOM_BONUS[t - 1] * 100)}% richer.`
    case 'chest':   return `You took Davy's chest. Every drop rolled at ${CHEST_MULT[t - 1]}x.`
  }
}

/**
 * Roll the breather. PURE, so the server can own it and a test can prove it.
 *
 * `chestWorthOffering` is whether this captain has anything left the chest could
 * still drop — offering a heavier chest to someone who already owns every chase
 * item is a hollow bargain, and Davy does not make hollow bargains.
 *
 * Returns the NEXT offer state. A live offer that the player dove past is counted
 * as refused right here, which is what makes the next one richer.
 */
export function rollOffer(opts: {
  prev: OfferState
  depth: number
  hpPct: number
  hardcore: boolean
  chestWorthOffering: boolean
  rand?: () => number
}): OfferState {
  const { prev, depth, hpPct, chestWorthOffering } = opts
  const rand = opts.rand ?? Math.random

  // ONE ROLL PER DEPTH, AND THE ANSWER STANDS. Everything below is a fresh
  // random decision, and this function also PERSISTS what it returns — so a
  // second ask at the same breather did not just re-decide the bargain, it
  // overwrote it. Davy leans over the rail once per depth.
  if (prev.rolledAt === depth) return prev

  // A live offer from a SHALLOWER breather means they dove past it. That is a
  // refusal, and it is the only thing that moves the tier.
  const refused = prev.live && prev.live.depth < depth ? prev.refused + 1 : prev.refused
  const base: OfferState = { live: null, refused, lastAt: prev.lastAt, rolledAt: depth }

  if (depth < OFFER_MIN_DEPTH) return base
  if (hpPct < OFFER_MIN_HP_PCT) return base            // he does not haggle with the drowning
  if (depth - prev.lastAt < OFFER_COOLDOWN) return base
  if (rand() >= OFFER_CHANCE) return base

  const kinds: OfferKind[] = chestWorthOffering ? ['coin', 'fathoms', 'chest'] : ['coin', 'fathoms']
  const kind = kinds[Math.floor(rand() * kinds.length)] ?? 'coin'

  return {
    live: { kind, tier: clampTier(1 + refused), depth },
    refused,
    lastAt: depth,
    rolledAt: depth,
  }
}
