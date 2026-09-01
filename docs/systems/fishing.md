# Fishing

> **This page is being retired.** The ocean hub (`docs/systems/ocean-hub.md`) is the
> intended home of the fishing loop — you sail to water and cast where you are, instead of
> picking a zone from a menu. `FishingGame.tsx` is still the reference implementation and
> still the only place several things exist, so read it before changing the hub's version.
> When the two disagree about a RULE, the hub is wrong until proven otherwise; when they
> disagree about a SURFACE, the hub is where the direction is going.

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

## The bite wait

**The zone sets a band and the cast rolls uniformly inside it.** That is the whole base
number; nothing about the fish enters into it.

| zone | band | spread |
|---|---|---|
| shallows | 8-13s | 1.63x |
| open_waters | 13-21s | 1.62x |
| deep | 21-33s | 1.57x |
| abyss | 30-46s | 1.53x |
| ancient_deep | 80-120s | 1.50x |

Then five multipliers, all of which pull the same number DOWN and all of which stack: bait
(worm x1 to golden x0.55), fishing level (a flat 33% across the ladder), fishing renown, the
rod (`min(rodWaitMult, lockedInState.waitMult)` — the Locked-In streak REPLACES the rod's own
rather than adding to it), and Angler's Patience x the shoal hotspot. 3s floor, no ceiling.
The Lightsaber's `instantBiteChance` bypasses the lot and clamps to 700ms.

**THE WAIT USED TO TELL YOU WHAT YOU HAD CAUGHT.** It was interpolated across the band by the
fish's `catch_score`, and score climbs with rarity in every zone, so the delay was a reliable
tell: a Shallows legendary averaged 7.4s against a common's 3.2s, a 2.31x spread. You knew
roughly what was on the line before the needle appeared, which takes the reveal off the dial
AND off the card and hands it to a progress bar. Measured after the change: 1.002x, i.e.
nothing.

**`catch_score` was that and only that.** It is still on the row and still selected, and it
now drives nothing. Left in place as real data somebody may want; it is not a mechanic.

**The bands were also four-to-one wide and are now about 1.6-to-1**, so a zone has a rhythm
you can learn instead of being a lottery, and every base is 20-40% longer because five
systems already multiply it down and the old bases predate most of them.

## Rules that differ from what you'd assume

- **A perfect streak is NOT bound to a zone.** It used to break the moment you cast in
  different water, so a cheap streak could not be farmed in the Shallows and cashed in a
  hard zone. That was right when fishing meant picking one zone and staying in it, and it is
  wrong for a sea you sail across — a streak that dies for crossing a boundary punishes the
  thing the chart exists to encourage. It now breaks only on a miss, a snag or an abandoned
  cast. `profiles.current_streak_zone` is dead (left in place for its history), and
  `leaderboard_perfect_streak` no longer ranks by where.
- **The perfect streak is server-authoritative.** `reelIn` owns it. The client renders the
  streak; it never decides it. Don't "fix" a streak bug client-side.
- **Needle lock-in feel is CONFIRMED design** — on Reel In the needle locks and settles
  where it was, with zero rewind or re-roll. Read the comment block above `handleReelIn`
  before touching anything in that path. What you see at the moment of tap is what the
  server scores (WYSIWYG).
- **An interrupted cast RESUMES, it does not reroll.** `castLine` writes `pending_cast`
  with the exact payload it handed the client, and hands that same roll back until it is
  resolved. This closes a live exploit: the cast response names the species and uses
  `fishId: -1` for a chest, so a player could read it off the network tab and refresh away
  any roll they disliked for the price of one worm (1 doubloon), keeping only chests,
  legendaries and Ancient trophies. Bait is still charged PER CAST including a resume:
  the sticky roll is what kills the exploit, and the bait is the separate, deliberate
  cost of walking away (alongside the broken streak). A stale token from a DIFFERENT
  zone cannot be replayed, so the species rerolls but the crate decision is inherited —
  otherwise zone-hopping would reroll the chest check, which is the prize.
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
