# The Parlor — Trivia

Nightly trivia with two tiers: the Captain's Board (daily play) and the Pirate King
ladder (the prestige climb). Questions are generated nightly, not hand-authored.

## Files

- `web/app/(app)/tavern/trivia/` — lobby, board, capstan, king ladder, `actions.ts`,
  `constants.ts`
- Answer verification: `web/lib/triviaVerify.ts`

## Design shape

- Generation is nightly and server-side; the client never sees answers ahead of
  submission (`triviaVerify` is the only judge).
- The two-tier split is deliberate: the Board is low-stakes daily habit; the King ladder
  is a season-less prestige climb (evergreen — no resets, per the no-FOMO pillar).
- Rewards route through the standard gem/doubloon ledgers.

## Spin the Capstan: the two safety rails

Both live in `capstan/actions.ts` and both are server-side. Neither is a display fix.

- **No third hazard in a row.** The wheel carries one Overboard and one Lose a Turn in
  sixteen, so three back to back is a 1-in-256 shot that ends a round before a letter is
  ever called. After `CAPSTAN_MAX_HAZARD_RUN` hazards the spin pool narrows to the value
  wedges. Narrow the POOL rather than re-rolling until it likes the answer: that keeps
  every wedge equally likely within the pool and still returns a real index for the
  client to animate to. Costs about 0.2% of hazard rate.
- **A missed letter is a spent letter.** `run.called` records EVERY letter tried, hit or
  miss. It used to record hits only, so the board never greyed a dead letter out and the
  duplicate guard could not see it: the same miss could be called repeatedly, each time
  costing a spin and a strike. Applies to bought vowels too, so a wasted fee is paid once.

## Connects to

- [tavern.md](tavern.md) — its front door. [economy-membership.md](economy-membership.md)
  — payouts.
