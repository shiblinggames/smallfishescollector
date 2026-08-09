# Raids — Combat & Campaign Map

Turn-based ship combat along a chaptered node chain. The other half of Expeditions.

## Files

- **`web/lib/raidMap.ts` — the campaign spine.** Node chain, story nodes, gates. Story
  nodes need a `scene[]`. Largest design surface in lib/.
- **`web/app/(app)/raids/RaidCombat.tsx` — the combat engine.** One large file; the
  turn loop, playback FX, HP bars (incl. overheal split), aim bar.
- Registry/loot/affixes/progress: `web/lib/raidRegistry.ts`, `raidItems.ts`,
  `raidLoot.ts`, `raidAffixes.ts`, `raidProgress.ts`, `raidChallenge.ts`
- Mid-raid roguelike interrupts: `web/lib/tides.ts`. Status effects: `web/lib/statuses.ts`.

## Combat rules that are LAWS (each encodes a shipped bug or a confirmed feel)

- **Damage has ONE source: `raidDamageProfile`.** It was duplicated once and drifted.
  Any new damage math goes through it.
- **Aim is RAW WYSIWYG with zero rewind.** The moving zone stays; where the needle is
  when you tap is what you get. No settle animation that changes the result.
- **The inline aim bar swaps INLINE with the LogBox and their dimensions must match** —
  a size mismatch shifts the whole battle column mid-turn.
- **Opening-shield sources SUM** (`fightShield`), never `Math.max`. Stacking is the
  reward for stacking sources.
- **Freeze suppresses reactive abilities INCLUDING dodge.** A frozen enemy doesn't slip.
- **Reload at MAX becomes fire (or a feint-dodge chance)** — holding reload at full is
  never a dead turn.
- **A raid clear persists at the KILL, not at loot-claim.** Closing the tab on the loot
  screen must not cost the clear.
- **Telegraphed enemy moves are answered by crew abilities** (mechanic checks). New
  mechanics (Mist Veil fogging the aim bar, Riposte parry, enemy barriers) follow this
  pattern: dormant until an enemy uses them, answered by a specific crew class.
- **Progressive reveal is intentional** — the map fogs past `REVEAL_AHEAD`. Don't
  "helpfully" show the whole chain.

## Tuning discipline

Changing a raid's battle count means editing the battle sequence, the challenge pin, and
the map node **in lockstep** — three places, one truth. Multi-phase bosses (chapter 3+)
use the N-phase engine; phases are data, not forks of the combat file.

## Connects to

- [story-universe.md](story-universe.md) — the chain IS the story delivery.
- [crew.md](crew.md) — party stats and abilities. [gauntlets.md](gauntlets.md) — reuses
  RaidCombat wholesale. [forge.md](forge.md) + [ship.md](ship.md) — the loadout.
