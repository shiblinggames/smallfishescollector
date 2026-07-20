// ── The Black Market — Don's Gauntlet mid-run shop ───────────────────────────
// A Hades/Slay-the-Spire-style vendor node that surfaces mid-dive in DON'S
// Gauntlet only (never Davy's). You spend real FATHOMS — your meta/Locker
// currency — on the spot, so every purchase is a bet: burn savings to survive
// and push deeper, or hoard them for a permanent upgrade. The Don's hand is
// always out.
//
// Prices are FIXED per item (not depth-scaled) so the server can deduct a
// canonical amount with no client-supplied depth to tamper with. The Fathom
// balance is the real limiter, and it's server-authoritative. Effects are
// applied client-side in run state (like the shrine / reprieve), mirroring the
// gauntlet's existing trust model.

export type MerchantItemKind = 'heal' | 'cleanse' | 'charges' | 'boon' | 'crew'

export interface MerchantItem {
  id: MerchantItemKind
  name: string
  /** One-line pitch for the stall card. */
  blurb: string
  price: number
  /** Accent color for the card. */
  color: string
}

// Fathoms are a TINY currency (a Don's run earns ~depth×2, the shrine wager caps
// at 10), so the market trades in pocket change: a few Fathoms for the minor
// picks, 10 max for the extra draft. Cheap enough to actually use every visit,
// still a real nibble out of the Locker savings you're hoarding for upgrades.
export const MERCHANT_ITEMS: Record<MerchantItemKind, MerchantItem> = {
  heal:    { id: 'heal',    name: 'Patch Kit',       blurb: 'Ghost-market repairs — mend 35% of your max hull, right here.',                 price: 6,  color: '#86efac' },
  cleanse: { id: 'cleanse', name: 'Hex-Breaker',     blurb: 'The fence knows a charm-worker. Lift one curse the Locker laid on you.',        price: 10, color: '#c084fc' },
  charges: { id: 'charges', name: 'Powder Run',      blurb: 'A crate of shot slid across the counter. Open the next fight with a full rack.', price: 4,  color: '#fbbf24' },
  crew:    { id: 'crew',    name: 'Round of Grog',   blurb: 'Rally the deck — every crew ability comes back ready for the next fight.',      price: 5,  color: '#5eead4' },
  boon:    { id: 'boon',    name: 'Contraband',      blurb: 'Something fell off a passing hull. An extra power draft, here and now.',        price: 10, color: '#8b9cff' },
}

/** All item ids, stable order (for display + the "sold" set). */
export const MERCHANT_ITEM_IDS: MerchantItemKind[] = ['heal', 'cleanse', 'charges', 'crew', 'boon']

/** Canonical price for a purchase — the server's source of truth. */
export function merchantPrice(id: string): number | null {
  return (MERCHANT_ITEMS as Record<string, MerchantItem>)[id]?.price ?? null
}

/** Roll a visit's stock: the heal is ALWAYS stocked (survival is the core
 *  need), plus up to two more drawn from the rest. Hex-Breaker only appears if
 *  the player actually carries a curse (else it's a dead buy). Deterministic-free
 *  (Math.random) — only ever called once when the node opens, host-side. */
export function rollMerchantStock(hasCurse: boolean): MerchantItemKind[] {
  const extras: MerchantItemKind[] = ['charges', 'crew', 'boon']
  if (hasCurse) extras.push('cleanse')
  // Fisher–Yates on a copy, take two.
  for (let i = extras.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[extras[i], extras[j]] = [extras[j], extras[i]]
  }
  return ['heal', ...extras.slice(0, 2)]
}
