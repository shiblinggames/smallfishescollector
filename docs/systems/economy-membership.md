# Economy & Membership

The two currencies, their ledgers, the paid tier, and mail — the pipes money moves
through. The design pillar over all of it: **evergreen and player-paced; never
pay-to-win, never FOMO**. Captain membership sells convenience and cosmetics, not power.

## Currencies

- Doubloons (⟡, gold) — earned everywhere, spent on gear/crew/ship. Gems (◆, purple) —
  the premium-adjacent currency, faucets are deliberate (dailies, bounties, chart).
- **Glyph law**: gems are ◆ tinted purple, doubloons ⟡ tinted gold — never emoji, never
  💎. Every new surface uses the glyphs.
- **Spending pattern**: debit via the `deduct_doubloons` RPC + write a
  `doubloon_transactions` ledger row with a negative amount and a reason. (Some older
  actions overwrite balances absolutely and skip the ledger — don't copy those.)
- Cumulative stats bump via `bump_*` RPCs, fire-and-forget — never block gameplay on a
  stats write.

## Membership ("Captain")

- Stripe-backed subscription (`web/lib/premium.ts`, `web/lib/stripe.ts`).
- **Every perk gate checks `isPremiumActive`** — one helper, no scattered date math.
  Perks are QoL and cosmetics; anything that would raise player power is out of bounds.

## Mail

- `app/actions/mail.ts`: service-role INSERT, claiming through the `claim_mail` RPC,
  sender is ALWAYS "Shiblings". Mail copy needs explicit approval before sending to
  players.

## Retired: the pack economy

The game began as a physical-game companion with redemption codes, card packs, and
rarity variants (`web/lib/drawPack.ts`, `variants.ts`, the `packs` route are remnants).
That economy is RETIRED — packs are not a live currency sink, and old docs describing
drop tables and pack odds describe a dead system. Don't extend it; if a feature wants
"packs", it wants crates ([fishing.md](fishing.md)) instead.

## Connects to

[progression.md](progression.md) (faucet cadence), [bounties.md](bounties.md),
[tavern.md](tavern.md) (chip wallet is deliberately NOT one of these currencies),
[platform.md](platform.md) (RPC security posture).

## Sailing with your crew (Captain-only)

Seeing mutual crew out on `/sea` — their boat, their compass arrow, their mark on the chart
— needs **both** captains to hold a membership. Social perk, not a power one: no fish, no
coin, no progress, so the no-pay-to-win rule is untouched.

Enforced in RLS on `realtime.messages` via `public.is_captain(uuid)`, not just in the
client. See [ocean-hub.md](ocean-hub.md) for the full presence architecture and what it
costs to run.
