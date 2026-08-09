# Fishing

The first of the two core loops (with expeditions). Everything else in the game feeds off
it or gates behind its level. Player-paced, evergreen: no timers that punish absence.

## Shape of the loop

Zone select → cast → catch dial → reel in → result → market. The dial is the skill core:
a rotating needle, a green catch zone (width set by gear), and a hold meter for larger
fish. Streaks of perfect catches build "on fire" state with escalating rewards.

- The whole game lives in `web/app/(app)/fishing/FishingGame.tsx` (very large, one file
  by design — the state machine reads top to bottom).
- Dial math and zone geometry: `web/lib/dialAim.ts`. Zone/species data:
  `web/app/(app)/fishing/zoneData.ts`, `web/lib/fishSpecies.ts`.
- Server verdicts: `reelIn` in `web/app/(app)/fishing/actions.ts`.

## Rules that differ from what you'd assume

- **The perfect streak is server-authoritative.** `reelIn` owns it. The client renders the
  streak; it never decides it. Don't "fix" a streak bug client-side.
- **Needle lock-in feel is CONFIRMED design** — on Reel In the needle locks and settles
  where it was, with zero rewind or re-roll. Read the comment block above `handleReelIn`
  before touching anything in that path. What you see at the moment of tap is what the
  server scores (WYSIWYG).
- **Fish size variance grants no XP or sell bonus.** Length rolls and personal-best tiers
  are bragging rights only (`web/lib/fishSize.ts`). Adding an economic reward to size was
  considered and rejected: it would turn a flavor system into a grind target.
- **Prestige caps and its perks are deliberate** — no sell bonus there either. Prestige
  logic lives in `web/app/(app)/fishing/actions.ts`, not a dedicated lib.
- **FishingGame is statically imported** by `FishingPageClient.tsx`. It was `next/dynamic`
  + `ssr:false` once; that created a post-hydration waterfall that made the page feel
  slow. Don't re-dynamic it.
- Random events, crate encounters (`components/CrateOpening.tsx` is THE crate moment),
  and giant/ancient trophies layer on top of the base loop without changing dial rules.

## Connects to

- [gear.md](gear.md) — dial zone width, hold strength, bait effects all come from gear.
- [fish-economy.md](fish-economy.md) — everything caught flows to the hold and market.
- [progression.md](progression.md) — fishing level gates zones and gear; renown past cap.
- [trawls.md](trawls.md) — crew fish zones passively; separate from the dial entirely.
