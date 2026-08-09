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

## Connects to

- [tavern.md](tavern.md) — its front door. [economy-membership.md](economy-membership.md)
  — payouts.
