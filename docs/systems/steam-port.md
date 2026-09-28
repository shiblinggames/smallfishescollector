# The Steam port — PARKED IDEA, NOT A PLAN

**Status: parked 2026-09-10, the same day it was written. THE GAME STAYS WEB-BASED.**
**2026-09-28: Kong asked to PREP a possible Steam migration with offline play, up to the whole
game offline. Still no switch decided. See "Offline-capable port: the preparation plan" at the
bottom; its first steps change nothing a player can see.**

Nothing here is decided and nothing is being built. This is a worked-through idea kept because
the analysis in it cost something to produce and is still true — the scaling arithmetic, the
monetisation constraint, the phase ordering — and because it will be the starting point if this
ever comes back. Read it as "here is what we found when we looked at it", not as a set of
choices anybody made.

**Why it is parked.** A great deal of work has gone into making this a mobile and online
experience: the PWA, the touch chart, the phone layouts, the iOS plan, and a live multiplayer
presence system that only just started working properly. A Steam port throws most of that
away, and does it in exchange for problems the game does not have yet — the message bill that
motivated the whole conversation only bites at ten thousand players, and there are eighty
accounts today.

**What the port WOULD have required, if it ever happens.** These read like decisions below
because they were reasoned as decisions on the day. They are not in force:

- Premium buy-once, because Steam requires in-game purchases to go through Steam and the two
  Stripe pipes cannot survive a Steam build.
- Steam only, with the web retiring, because a second SKU means two economies and an
  account-linking flow to maintain forever.
- Which means the game design changes BEFORE the shell does. That ordering is the single most
  useful thing on this page and it is what makes the whole idea expensive.

## Why that decision is the one that gates the rest

Steam requires purchases made inside a game to go through Steam's own payment. The two
real-money pipes today are the Captain membership and the gem packs, both Stripe, and neither
can survive in a Steam build. So the choice was never "which payment library" — it was which
of three games to ship, and the answer changes the DESIGN, not the checkout code:

- Every `isPremiumActive` gate stops gating. Sailing pacts need it on BOTH captains; homestead
  visits, the compass arrows and the crew disc all read it. Those become unconditional.
- The gem economy loses one of its two taps. Every gem SINK has to be re-checked against the
  earn rates alone, or the top of the game becomes unreachable rather than merely long.
- It also settles the philosophy question in the right direction. The house rule is evergreen,
  player-paced, never pay-to-win; a single price and no shop is the purest form of that, and
  premium sells better on Steam than free-to-play does.

## What Steam gives back

- **Steam Datagram Relay.** NAT traversal and relay fallback, free, over Valve's backbone.
  This is the answer to the scaling wall: the message bill that would reach five figures a
  month at ten thousand players becomes nothing, and there is no TURN server to run.
- **Verified identity.** A SteamID is authenticated by Steam, so the transport needs no JWT of
  its own and no re-implementation of the pact rules.
- **The social layer already exists.** Friends, invites, "Join Game" from the overlay. Pacts
  and mutual follows were built because the web had no friends list. Steam has one.
- **Achievements.** 249 badges with a registry, tiers and conditions already in one file.

## Where development happens, and when it moves

**Development stays on the web until the game is content complete.** Decided 2026-09-10 with
the port itself.

The reason is the iteration loop and it is worth more than it looks. A push is live in three
minutes and a tester on any device sees it; a Steam build is a binary, an upload, a download
and a restart. Fifteen fixes in an afternoon — which is a real day on this project — is not
possible on the second one, and you cannot hot-fix a broken session while two people are
sitting in it. A game still finding its shape should not trade that away, and the current
testers are friends who tolerate breakage where a Steam playtest audience forms durable
impressions of an unfinished thing.

**But three of the phases below are not wrapper work, they change the GAME, and those happen
now, on the web, where the loop is fast:**

1. **Phase 1, taking the money out.** The most important thing on this page. It changes the
   BALANCE, so it needs months of play, not a week before submission. Finishing the web game
   with a premium economy and stripping it at the end means having balanced a game you are not
   shipping, and shipping an economy nobody has tested.
2. **Phase 4, controller support.** A design constraint dressed as a port task. Some panels
   will need rethinking rather than adapting, and that is cheap to find out now and expensive
   after another forty are built on the same assumptions.
3. **Retiring pacts** (part of phase 6). Steam friends replace them. No hurry, but do not build
   anything new on top of them.

Everything else — the shell, Steam auth, achievements, the networking swap — is mechanical,
gains nothing from early testing, and slows the loop if done early. The networking especially:
it replaces something that only just started working, and there is no reason to touch it twice.

**The risk is drift.** "We will port when it is done" runs forever. Two guards: write down what
content complete actually means, and spend about a week on a SHELL SPIKE soon — Tauri plus
Steamworks bindings, one window, auth working, nothing else. Not to adopt it; to prove the path
and surface the surprises while they are still free.

**What would change this:** if controller support turns out to force real UI redesigns rather
than adaptations, then the wrapper IS changing the game, and the shell should come early so the
design is aimed at the real target instead of guessing at it.

## Rhythm without a calendar

The target feel is Terraria and Stardew, and the single thing those two have in common is
worth stating plainly because it decides a dozen smaller questions:

**Neither of them has one mechanic keyed to the real-world calendar.** Stardew is FULL of
time — days, seasons, festivals, crops — and every bit of it is in-game time that only moves
while you play. Put the game down for two years and you have lost nothing. Terraria has day
and night, blood moons and invasions, and no daily reset anywhere. They have enormous rhythm
and zero calendar, and that is exactly why people trust them enough to sink hundreds of hours
into them.

This game currently keys almost everything to UTC: the daily challenges, the bounty board, the
free recruit, the hardcore gauntlet's three runs, the trader rotation. That
is a live-service shape. It is also in quiet tension with the house rule, which has always said
evergreen and player-paced and never FOMO — a daily that expires is a small FOMO mechanic, and
it is only there because free-to-play retention wanted it.

**So: move the rhythm out of the wall clock and into the session.** In value order:

1. **Boards restock by PLAYING, not by date.** Clear the daily challenges or the bounty board
   and a new one comes up. Same content, same loop, nothing missed, no reset. Mostly deleting
   date logic, and it is the highest-value change on this page after the money.
2. **The gauntlet's daily run becomes a resource you earn.** Roguelikes gate runs with supplies
   or a key, not with a calendar. The push-your-luck stake stays — a run still costs something
   — without the something being "come back tomorrow".
3. **The free recruit becomes a token you earn.** Same reasoning.
4. **Trawls and voyages are real-time timers**, which is a mobile mechanic. Stardew's crops grow
   over in-game days that pass in fourteen real minutes. Shorten them a lot, or tie them to
   play time.

**Correction (2026-09-25): the sea's day and night is NOT on the real clock.** It is a
48-minute cycle (`lib/seaClock.ts`), so every session already sees the whole arc. The only
wall-clock coupling left on the chart is trader rotation, hashed off `(cell, seaDay)` so that
everybody sees the same people on the same day; keep that on the calendar (shared, optional).

## The order to do it in

Each phase is safe to stop after. Nothing below starts until the phase above is done, because
each one changes the assumptions the next is written against.

### 1. Take the money out of the game

The biggest design change and the one everything else sits on. Not the last step, the first.

- `isPremiumActive` returns true for everybody. Do NOT delete the call sites yet — flipping the
  helper is one line and reversible, deleting forty gates is neither.
- Audit every gem sink against earn-only rates. This is a real balance pass, not a search and
  replace.
- Strip the Stripe and Shopify checkout surfaces and webhooks from the client and the API.
- **Nobody paid.** Every membership on the live table was GRANTED, not bought, so there is no
  refund, no goodwill debt and no Steam keys to hand out. Stripe and Shopify can be deleted
  outright rather than disabled behind a flag: there is no purchase history to preserve and no
  webhook that must keep answering. Confirm the table before deleting, then delete.

### 2. Identity

Steam auth to Supabase session: the client gets an auth ticket from Steamworks, the server
verifies it with Valve, and mints a Supabase JWT. Everything behind it is unchanged, because
every value mutation already runs service-role behind RLS and does not care how you signed in.

**The one thing here that is a real decision: what happens to the players who already exist.**
The web retires, so roughly eighty accounts with fish, crew, badges and homesteads either come
across or do not. A one-time claim — sign in once with the old email, bind that row to a
SteamID — is cheap to build and is the kind thing to do for people who tested this for a year.
The alternative is that everybody starts again, which is defensible for a Steam launch and
should then be said out loud rather than discovered.

Note that this is the ONLY place old accounts matter. Everything else about identity gets
simpler: no linking to maintain, because after the claim window there is one way in.

### 3. The shell

Tauri or Electron around the existing app. The Capacitor plan already settled the pattern for
iOS — a remote-URL shell — and the same reasoning applies, because this game's value mutations
are all server actions and it is online-only by construction.

**The review risk is that it reads as a website in a box.** Native window, no browser chrome,
real fullscreen, bundled assets wherever possible, and honest failure states when the network
drops. Say "online only" on the store page rather than letting a reviewer discover it.

With the web retiring there is no longer a reason for the shell to point at a public URL at
all. Worth revisiting once phases 1 and 2 are done: assets can ship in the binary and only the
server actions need the network, which is a better product and a much better first impression
than a loading spinner over a browser.

### 4. Input, and the Deck

The largest single chunk of work and the easiest to underestimate. Controller support across
every panel, the dial, the raid aim bar, the gauntlets and 249 badge rows. Steam Deck
verification is worth targeting on purpose rather than hoping for.

### 5. Steam features

Achievements mapped off `lib/badges.ts` (close to one for one), rich presence, invites. Cloud
saves are a no-op: the save is already the database.

### 6. Multiplayer onto Steam networking

Replace the transport inside `lib/seaPresence.ts` with `ISteamNetworkingSockets`. Pacts and
mutual follows give way to Steam friends and invites.

**Everything above the transport carries over untouched** — the sender-clock velocity, the
interpolation buffer, the render lag, the stop beat. That layer took the longest to get right
and it does not care what carries it. See ocean-hub.md.

### 7. Compliance and the store

- **AI-generated content must be declared, and this is a RECEPTION risk rather than a
  paperwork one.** An earlier draft of this page filed it under compliance, which
  under-weighted it badly. Valve has required disclosure since early 2024 and it appears
  PUBLICLY on the store page, so every prospective buyer sees it before clicking. Games have
  been review-bombed over exactly that line, and the hostility concentrates among the people
  who write reviews and post on forums — which is the audience that decides a launch.

  It weighs against porting at all, and for this game more than most: the art is a large part
  of the appeal and there is a great deal of it — 249 badges, 75 crew skins, the fish, the
  hulls, the islands, all generated. Replacing it wholesale is not realistic at that volume.

  If it ever does come up, the affordable version is the useful thing to know: **what gets
  judged is the store capsule, the trailer and the first screenshots**, not badge icons nobody
  sees before buying. Commissioning hero art for the storefront while the generated long tail
  stays is the only version of this that costs a sane amount. Disclosure would still be
  required and still be visible; the thing people react to first would be real work.

  None of this applies on the web, which has no disclosure requirement and no review system to
  bomb. It is one more reason the parking decision was the right one.
- **Audit the casino before rating.** Blackjack, roulette, slots and a chip purse. Chips are
  bought with doubloons, which are earned — but trace every path from a PURCHASED currency to
  a chip and make sure none exists. Under premium buy-once there is no purchased currency at
  all, which is the cleanest possible answer, and that is worth confirming rather than
  assuming.
- $100 Steam Direct, 30% revenue share.

## What does not change

Supabase stays the authority for everything with value. The Pixi renderer, the chart, the
fishing dial, raids, gauntlets, the economy and every system doc in this folder are unaffected
by the port. This is a distribution and shell change with one design change at the front of it.

## Still open

- The price.
- Whether the eighty existing accounts get a one-time claim onto a SteamID, or everybody starts
  again. See phase 2.

## What is NOT decided

Everything above. In particular, and stated flatly because the earlier draft of this document
said the opposite:

- **The web version is not retiring.** It is the game.
- **The iOS/Capacitor plan is not cancelled.** It is still the live plan for mobile.
- **Nothing about the monetisation is settled.** The Captain membership and the gem packs are
  live and stay live.

## The one finding here that is NOT about Steam

The gem audit stands on its own and is a live balance question either way. All 75 crew skins
cost 113,750 gems against roughly 13,500 gems of one-off income, so the collection is only
reachable today because gems are PURCHASABLE. That is worth looking at as a balance matter
whatever platform this ships on. See economy-membership.md.


## Revisited 2026-09-25, and parked again

Kong asked whether the game could go fully paid, and then whether it could make money staying
on the web as it is. No decision: **"park all of this for now, not ready for the transition
decision."** What was worked out, so it is not redone:

**The calendar inventory** (every UTC-keyed mechanic and where it lives):
- **Gates progression, missing a day loses something:** Daily Haul (50 ◆, Captains 150; 20
  bait; weekly crate), daily challenges (3/day, 10 ◆ sweep), bounties (15-150 ◆/day by
  chapter rung, board expires, 1 reroll/day), free recruits (3/day, unrecruited wiped),
  hardcore gauntlet (3 runs/day per descent), Don's Tribute (10 Fathoms/day), Tide Turner
  (3 skips/day), Parlor Captain's Board (1 card/day, forfeits), Chart Room weekly points.
- **Shared or optional, fine on a calendar:** trader rotation (`seaDay`), Chart Room and Parlor
  weekly boards, casino buy-in cap (abuse guard), folk chats (1/day, story only), contests,
  mail expiry. NOT calendar: normal gauntlet (no limit), voyages (one pending at a time),
  trawls (timers), raids, the Exchange, sea day/night.
- Calendar-gated gem budget at endgame: about 210 ◆/day free, 310 Captain.

**The proposed restock-through-play numbers** (not approved, first draft for when it comes
back): a new challenge board 20 catches after the last is swept; bounties and recruits refill
after 2 voyages or raid wins, nothing expires, 1 reroll per board; Daily Haul becomes a meter
filled by any play (every 4th full meter = the weekly crate); Blood Keys (hold 3, one per
normal gauntlet run to a set depth) replace hardcore runs/day; Tribute paid per finished
normal run; Tide Turner holds 3, one back per 15 catches. Optional later: a seeded Daily
Gauntlet with a leaderboard (Slay the Spire's daily climb), missing it costs nothing. Open
questions left with Kong: the numbers, whether Daily Haul stays a daily gift, whether a missed
puzzle week carries over.

**Business models discussed.**
- Fully paid is possible: no gem store, Captain gates opened to all, gem costs rebalanced to
  play-only income. Best fit found was "free to start, pay once" (a free opening, one purchase
  for the rest), the same game on web and Steam, optional cosmetic-only extras later (the
  Deep Rock Galactic / Sea of Thieves shape).
- Going client-side like Stardew/Terraria (saves on the player's machine, player-hosted co-op,
  no per-player server cost) would be close to a rewrite: nearly every rule is server code. A
  lean server (account + cloud save, leaderboards, shared sea) is the realistic middle.
- Staying on the web as is is legitimate. Captain is ALREADY $9.99 one-time lifetime, not a
  subscription; but nobody has paid (all granted), so the price is untested. If staying:
  test real Captain purchases with the beta, tilt Captain toward cosmetics/convenience/supporter
  (away from daily gems and the casino cap), point gems at looks, do the restock changes
  anyway, and put the effort into acquisition (landing page, clips, the first ten minutes).


## Offline-capable port: the preparation plan (2026-09-28)

Kong: "prep a potential migration to Steam where there is offline capability, or for the whole
game to exist offline." This section sizes that and orders the work so that every early step
is useful on the web too, whether or not the port ever happens.

### Where the game stands (measured 2026-09-28)

**The rules are mostly portable already.**
- 159 `lib/` files (about 43,400 of 45,400 lines) import nothing server-side.
- That covers fishing levels, crew levels and generation, the raid map, the gauntlet, boss
  raids, voyages, badges, rods, roulette and blackjack, renown, raid loot, and fish size and
  shiny rolls.
- Many of these files say in their headers that they were moved out of `'use server'` on
  purpose.

**The glue is not portable.**
- 82 `'use server'` files (about 22,000 lines, 325 exported actions) plus 11 route handlers.
- They make over 1,000 `.from` / `.rpc` calls, 429 of them on `profiles` alone.
- `profiles` is one row with 312 columns, and 67 tables are named in code.

**Some rules live inline in the actions**, not in `lib/`:
- the catch pipeline and bait save in `fishing/actions.ts` (the biggest file, 2,867 lines);
- dice and DPS checks in `raidMapActions.ts`;
- chest tables and cash-out in `gauntlet/actions.ts`;
- slot reel weights, trader wager odds and the blackjack hand state;
- every currency move.

**Postgres holds real logic.**
- 35 RPCs are called from code (wallet, stat counters, crew XP, one-shot claims, casino
  jackpot). Only about 10 of them are in repo SQL.
- 5 pg_cron jobs:
  - the hourly fish market tick;
  - the hourly Exchange tick;
  - Exchange bet settlement;
  - casino leaderboard refreshes;
  - a premium reconcile that calls an edge function that isn't in the repo.

**Some content is data, not code.**
- Fish species (152), cards (41), card variants (483), crew (32), market prices, and the
  weekly puzzle and trivia boards all live in the database.
- Two storage buckets (about 183 MB of crew, fish and enemy art) are addressed by hard-coded
  Supabase URLs in 22 files. Everything else ships from `public/`.

**Randomness and time are server-side.**
- Rolls use `Math.random`: 39 calls in actions and 31 `lib` modules. Only three places use a
  seeded generator.
- Time comes from `Date.now` (137 calls in actions), plus UTC day keys in 8 files.

**Combat is already client-side.** Raids and gauntlet fights run in the browser. The server
mints run tokens, clamps the hits reported back, and pays out loot.

**External services:**
- Anthropic: nightly trivia and puzzle generation.
- Stripe and Shopify: payments, which go away under premium.
- Supabase: auth (magic link and Google), and Realtime for presence and live profile updates.
- Vercel: crons and analytics.

So the Stardew-style port is less of a rewrite than "nearly every rule is server code"
suggested. The RULES mostly port as they are. What gets rewritten is the layer that loads a
player's state, applies a rule and writes the result: about 22,000 lines of actions, plus the
RPCs and the crons.

### The target shape

One game core, run in two places.

**The core** is plain TypeScript, with no Supabase and no Next.
- A player's state is one typed save (`PlayerSave`).
- Each action is a command: `(save, input, { rng, now }) -> { save', events }`.
- Cast, reel, sell, recruit, send a voyage, cash out a gauntlet: every one is a function over
  the save.

**The web keeps the server as the authority.** A server action becomes four steps: check the
session, load the save slice, run the command with a server seed, write the difference.
Behaviour and security stay exactly as they are.

**Steam runs the same core on the player's machine.**
- It runs against a local save: an SQLite file in a native shell (Tauri), synced by Steam
  Cloud.
- Offline is then the normal case, not a special mode.
- The client calls one `GameApi` interface with two implementations: "call the server action"
  on the web, "run the core locally" on Steam.

**Online becomes optional extras:**
- Sailing with friends, over Steam networking (phase 6 above).
- Leaderboards: either verified runs only (a seeded run whose log the server can replay) or
  Steam's own leaderboards. A local save can be edited, and in single player that only hurts
  the person editing it. That is the Stardew and Terraria bargain.
- Fresh trivia and puzzle packs.
- Contests.

### Decisions this needs (Kong's, none made)

1. **Who is the authority on Steam.**
   - The local save (recommended): Stardew-style, and cheating only affects the cheater.
   - The server, with offline play synced and verified later. That keeps one shared economy,
     but it makes offline a degraded mode and costs far more.
2. **One save across web and Steam, or separate saves.** A local-authority Steam save can't
   flow back into the server-authority web economy without trusting it. The realistic options
   are separate saves, or a one-way import from web to Steam (the phase 2 claim).
3. **An offline answer for each shared-world system:**
   - the fish market's hourly prices and the Exchange: a seeded local simulation;
   - trader rotation: already seeded by sea day, so it ports cleanly;
   - the slots jackpot: local;
   - contests and the Pirate King ladder: online only;
   - weekly puzzles and trivia: downloaded packs plus a bank shipped with the game (see the
     tavern notes).
4. **The calendar.** A device clock can be set to anything, so offline play needs the
   restock-through-play rhythm drafted above in place of UTC daily resets.
5. **Money.** Unchanged from phase 1: premium buy-once, no in-game purchases on Steam.

### What can start now on the web (changes nothing a player sees)

In order. Each step is worth doing even if the port never happens.

1. **No new rules in SQL.**
   - New game logic goes in pure `lib/` modules. Postgres keeps only atomic writes, and each
     new one gets a TypeScript twin.
   - The RPCs that exist only in the live database get checked into repo SQL, so the schema
     can be rebuilt from the repo. That is worth doing for disaster recovery on its own.
   - **DONE 2026-09-28:** `web/supabase/live/`, written by `scripts/snapshot-schema.mts`
     (see platform.md). Re-run it after every schema change.
2. **Seeded randomness and an injected clock.**
   - One `lib/rng.ts`, using the mulberry32 generator already in three places.
   - It is passed into every roll module: `crewGen`, `crateLoot`, `voyageRoll`, `fishSize`,
     `shiny`, `raidLoot`, `gauntlet`.
   - The server keeps drawing a fresh seed every time, so odds and behaviour are identical.
   - This unlocks deterministic tests, seeded replays for verified leaderboards, and the
     offline casino and trivia design.
   - **DONE 2026-09-28:** `lib/rng.ts` (`rngNext`, `withRng`, `mulberry32`, `seedOf`) and
     `lib/clock.ts` (`clockNow`, `withClock`). 25 rules modules and 14 server-action files
     roll through `rngNext`, and 17 time-keyed modules read through `clockNow`. Defaults are
     `Math.random` / `Date.now`, so behaviour is unchanged. The override lives on
     `globalThis`, so every loaded copy of the module shares it. SYNC ONLY: never await inside
     `withRng`. `scripts/check-rng.mts` (part of `npm run check`) blocks direct
     `Math.random` / `Date.now()` in those files and proves the same seed gives the same rolls.
     Visuals (particles, audio, camera) keep `Math.random` on purpose.
3. **Content into the repo.**
   - Fish species, cards, card variants and crew become versioned JSON in the repo, and the
     database is seeded from it. A database-only copy has no history anyway.
   - Mirror the two storage buckets into `public/` or an asset manifest. A binary has to bundle
     them, and it removes 22 hard-coded Supabase URLs.
   - **DONE 2026-09-28.**
     - **Content:** `web/content/{fish_species,cards,card_variants}.json`, synced by
       `scripts/content-sync.mts` (pull / diff / push --apply, upsert only). From now on, edit
       the JSON, commit it, then push.
     - **Art:** both buckets, 156 images, converted to WebP in `public/card-arts` and
       `public/enemy-arts` (184 MB became 16 MB). Every reference now goes through
       `lib/artUrl` (`cardArt`, `enemyArt`), which maps the database's `.png` names to the
       `.webp` files. No Supabase storage URL is left in the code.
     - **Check:** `scripts/check-art.mts` (in `npm run check`) fails if a card, skin or
       literal `cardArt` / `enemyArt` has no file on disk.
     - **The buckets are left in place, unused.** Delete them once the new paths have run in
       production for a while.
4. **A save model with export and import.**
   - Define `PlayerSave`: everything a player owns, across `profiles` and its child tables.
   - Add a server export to JSON, and an import.
   - It's useful now for account backups, beta-wipe tooling and admin fixes, and later it
     becomes the Steam claim and the cloud-save format.
   - **DONE 2026-09-28:** `lib/playerSave.ts` defines the format.
     - **What it holds:** the profile row, `SAVE_TABLES` (32 tables in parent-first order) and,
       on request, `HISTORY_TABLES` (22 ledgers and logs, never restored). Shared and social
       rows and anti-cheat tokens are left out on purpose.
     - **The tool:** `scripts/player-save.mts`.
       - `export <user> [--history]` writes to `web/saves/`, which is git-ignored.
       - `restore <file>` is a dry run by default. With `--apply` it writes an undo file first,
         then replaces the account.
     - **Under it:** the service-role-only database functions `admin_export_player_rows` and
       `admin_import_player_rows`. Each is ONE transaction, and ids are kept
       (`overriding system value`).
     - **Proven** with a full round trip on catman: 1,078 rows, 0 differences.
     - **Same account only for now.** Restoring onto another account needs id remapping (crew
       ids live in bunks, trawls and `saved_crew`), and that is the Steam-claim work.
     - **A new table that holds a player's stuff goes in `SAVE_TABLES`.**
5. **Lift the inline rules out of the actions**, one system at a time, core loop first:
   1. fishing (`castLine`, `reelIn`, `reelCrate`);
   2. selling;
   3. crew and recruits;
   4. voyages and trawls;
   5. gauntlet cash-out and chests;
   6. the casino;
   7. raid map dice.

   Each one becomes a pure command with tests, and the action applies the result through the
   existing wallet and RPCs. No behaviour change. This step is the bulk of the work.
   - **Fishing: DONE 2026-09-28.** `lib/fishingRules.ts` holds three functions:
     - `rollCast`: the Ancient Deep pool, crate or fish, the species, the wait, Lightspeed,
       jackpot or double, the Locked-In haul and the Vigil rank.
     - `landFish`: the bait save, shiny, the haul clamped to the hold, the XP and its three
       reported parts, the streak and its record ceiling, the Sigil, the Wormhole, size, and
       the deep's omen.
     - `landAncient`: giant XP, Vigil ranks, and the capstone pet.

     `castLine` and `reelIn` keep auth, the token claim, the reads, the writes and the badges.

     `scripts/check-fishing-rules.mts` (in `npm run check`) runs them against
     `content/fish_species.json` under seeds. It covers determinism, the first cast, the
     giants and the Megalodon gate, stale crates, the zone odds and waits, and the landings
     (the XP parts summing, shiny, the hold clamp, haul priority, the record ceiling and the
     Vigil).

     Verified live on catman: 8 casts, 2 landed, one of them a ×100 jackpot.

     **Then the rest of fishing.** Moved into `lib/fishingRules`: the bite floor
     (`reelTooEarly`), `crateStreak`, `wormholeExit`, `rollCatchSize` and `prestigeStep`.
     `lib/crateLoot` is split into a pure `rollCrateLoot` and `grantCrateLoot`, which the
     crate reel, the weekly crate and the Master challenge share. The only rule left in
     `claimZoneReward` is the already-pure `zoneRewardDoubloons`.
   - **Selling: DONE 2026-09-28.** `lib/sellRules.ts`:
     - the market price, floored PER FISH;
     - sea buyers, floored ONCE over the hold;
     - the runner's cut.

     The market and trader actions use it. `scripts/check-sell-rules.mts` covers the floors,
     the 78-86% resident band (rising with depth, below the market) and the runner's odds.

     Verified live on catman. A jackpot filled the hold exactly to capacity (208 to 250),
     then the market's Sell all paid exactly the listed 4,228.
   - **Crew: DONE 2026-09-28.** `lib/crewRules.ts` covers:
     - the card pools;
     - the recruit board roll, including the campaign gate, the empty-group fallback and the
       one-shot gifted legendary;
     - the Blood Gem skin pick;
     - finished stints and stint payouts (the level ceiling is freed but not paid);
     - the Leviathan trait offer.

     `crew/actions` and `lib/crewBunkSettle` use it. `crewBunkSettle` re-exports `BunkRow`,
     `TraitUpgrade`, `NEUTRAL_OFFER` and `bunkTerms` for the old imports.

     `scripts/check-crew-rules.mts` checks the following against `content/cards.json`:
     - no legendary on a free board;
     - no gated legendary before its chapter;
     - the gift pinned to slot 0;
     - the GEM weights over 60,000 faces;
     - the gamble never paying a legendary or an owned skin;
     - the hall's payouts.

     Verified live: a fresh free board rolled for catman (one Rare, two Commons).
   - **Voyages and trawls: DONE 2026-09-28.** The event roll was already pure
     (`lib/voyageEvents`), and so was the trawl haul (`fishing/trawls/constants`).

     `lib/voyageRules.ts` covers:
     - `planVoyage`: the route gates, the crew minimum, the effect-lifted crew, the event
       roll, the doubloon bonus, and the duration with Swift Sails;
     - `voyagePayout`: Navigation and crew XP by route and outcome, bait, the special items
       (only once), and the survivors;
     - `voyageBack` and `voyageCrewCap`.

     `lib/trawlRules.ts` covers:
     - the trawler's Savvy and Fortune;
     - the deploy gates, in their order (the Ancient Deep's campaign gate is still worked
       out in the action, since it reads the database);
     - the return time;
     - the haul's species.

     `scripts/check-voyage-rules.mts` checks:
     - determinism and the gates;
     - no loss on Coastal or with Safe Passage (the Shroud does lose hands);
     - Swift Sails at exactly 15% off;
     - the payouts by outcome, the xp bonus, lost hands unpaid, and specials only once;
     - the timing, and the trawl refusals in order.

     Verified live on catman: an Inner Sea voyage sailed at 1h 19m with 410 ⟡ (the card said
     1h 19m and 253-422). Revealed, it paid exactly the triumph's 375 Nav XP, 410 ⟡ and 3 ◆.
     A trawl was not sent live, since sending needs the ship at the Trawl Docks.
   - **Gauntlet: DONE 2026-09-28.** The run itself was already pure (`lib/gauntlet`,
     `gauntletOffer`, `gauntletTerms`). What moved is the SETTLEMENT that lived inline in
     `raids/gauntlet/actions`. `lib/gauntletRules.ts` covers:
     - the run clock, the four-second depth floor, and `settleDepths` (the Veteran's Start
       bound on the combat depth);
     - `runFathoms` (the Fence tab);
     - `cashOutHaul`: the chest, the chase drops in their FIXED roll order (a seeded replay
       depends on that order), Blood Gems, doubloons, Nav XP, gems, Fathoms and crew XP;
     - `recordClaim`, the cooldown, the shrine's coin and the Don's feats.

     Still inline: the hardcore runs-per-day count uses the UTC date (`new Date()`). It
     belongs with the calendar-to-session restock decision above, not with this move.

     `scripts/check-gauntlet-rules.mts` checks:
     - the depth clamps and determinism;
     - no hardcore chase or Blood Gems on a normal run, and no Davy cannon on the Don's;
     - nothing owned dropping twice;
     - the pot ceiling, pay stopping at the reward cap while the record keeps going;
     - the offer honoured only at its own depth;
     - Pressure moving Blood Gems and nothing else;
     - records, the cooldown, the gap cap and the shrine's even odds.

     Live: catman's gauntlet page loads on the new code with DESCEND open and no server
     errors. No cash-out has been played since; the first real run after 2026-09-28 is the
     live proof (compare its `gauntlet_runs` row against the reward screen).
   - **Casino: DONE 2026-09-28.** The card maths (`lib/blackjack`) and the wheel
     (`lib/roulette`) were already pure. `lib/casinoRules.ts` covers:
     - the purse: the buy-in rule, and the session bust-out all three games share;
     - `rollSlots`: the reels, the bonus round with the wild, and the pay table. The shared
       community pot is still claimed by the action, since a pot many players feed is a
       database thing (offline it becomes a local pot);
     - the roulette slip and its per-zone cap;
     - the blackjack table: deal, insurance, hit, stand, double, split, the orphan stand, the
       settlement and the badge streaks.

     `scripts/check-casino-rules.mts` checks:
     - determinism;
     - the forced triples, and the pot (an admin never takes it);
     - the wild never completing a catfish line;
     - the base-game return (87.4% before the pot; the 10% feed returns through it, near the
       ~96.8% total the constants state);
     - the zone cap, the purse, and every blackjack house rule.

     Verified live on catman: four slot pulls. A catfish pair paid 3x, sardine pairs came up
     near misses, and the purse moved 120 to 95, exactly the four stakes less the one win.
   - **Raids: DONE 2026-09-28. PHASE B IS COMPLETE.** Combat runs on the client and its
     maths were already pure (`raidDamageProfile`, `rollCrate`, the `lib/bossRaids` configs).
     `lib/raidRules.ts` covers what the server decides:
     - a kill's reward from the config, with class and Renown scaling;
     - the crate: uniques, the coin clamp, the currency row, and item coin;
     - the clear records;
     - the map's node gate, the dice throw, and the damage check's preview and shot.

     The forge and Ultimate timers now read the seam clock.

     `scripts/check-raid-rules.mts` walks EVERY raid and every dice and damage node. It
     checks:
     - each round pays its own line, and the Helmsman scales gold only;
     - owned uniques never drop again, and a gem row pays no coin;
     - the coin claim clamps, and admin clears never take the record;
     - the d20 is fair, and no purse goes below zero.

     **Found by the check, fixed 2026-09-28 on Kong's OK:** the damage-check sheet
     UNDERSTATED the odds. It needed a roll of `ceil(threshold / mult)` while the shot passes
     on `round(roll x mult) >= threshold` (`coffers_fork` showed 29% and passed about 32%).
     `dpsPreview` now counts rolls with the shot's own rounding, and the check holds the two
     within 1.5 points.

     Not live-tested: every changed path fires only inside a fight or at a map node, so the
     first raid anyone plays after the deploy is the proof.
6. **A data-access layer.** Per-system read and write functions replace the scattered
   `admin.from('profiles')` calls, so a local store can later stand in for Supabase behind the
   same functions.
   **STARTED 2026-09-28.** The shape: one `lib/data/<system>Data.ts` per system, holding an
   interface of NAMED operations ("take one bait", "claim this cast", "add to the hold")
   plus its Supabase implementation, with the old queries moved verbatim and every one-shot
   condition kept. Actions call `db.claimCast(...)` rather than a table query. An offline build
   supplies the same interface over a local save. Shared helpers keep their homes:
   `lib/wallet` (balances, owned lists), `lib/badgeGrant`, `lib/anomaly`.
   - **Fishing: DONE 2026-09-28.** `lib/data/fishingData.ts`; `fishing/actions.ts` no longer
     names a table. The one-shot conditional writes became named operations with the
     guarantee in their contract: `claimCast`, `claimCrateCast`, `claimPendingReroll`,
     `flagOn` (zone rewards, special items), `moveLevelWatermark` (level rewards),
     `raiseHoldTier` (a floor), `takeFromHold` (the wormhole's guard against a sale in
     between) and `resolveShiny`. An offline store has to honour each of these as stated.
     Verified live on catman, twice. After the first slice, 9 casts took exactly 9 worms, and 3
     landings logged 3 species and filled the hold 2 to 106 (two doubles and a x100 jackpot,
     new and existing rows). After the whole file, 8 casts took 8 worms, and 3 landings logged
     3 and put 6 in the hold. Trophies, prestige and the shops were not driven live.
   - **Shared: `lib/data/common.ts`** holds `CaptainData` (the profile row, counters, the
     ledger, raid clears, bait), which every system's interface extends.
   - **Selling: DONE 2026-09-28.** `lib/data/sellData.ts`; the market and the sea traders (the
     salter, residents, the blockade runner, and the chart's position save that lives beside
     them) no longer name a table. Its contract: stacks are taken only if they still read
     what was seen; the whole-hold sale pays for exactly the rows removed; a deal key's second
     claim reports `taken`; the coin deduction returns null when the purse is short.
     Verified live on catman: Sell all on 112 fish paid exactly the 2,156 the price table
     gives, with the hold emptied, the lifetime stat and the ledger line matching.
   - **Crew: DONE 2026-09-28.** `lib/data/crewData.ts`; the Crew Hall, its bunks, promotions,
     the chart's crew hub, and the shared helpers every system calls (`loadDeployedParty`,
     crew XP, bunk settlement) no longer name a table. Seats are addressed by TRACK
     ('voyage' | 'raid'), never by column. Its contract: the board's date moves only from
     the date read; a candidate is claimed only while unclaimed; the legendary gift is
     spent only if still set; a tier steps only from the tier read; a bunk is claimed only
     at the `since` read, and XP pays only for bunks removed; an open trait offer is never
     overwritten and is answered once.
     Verified live on catman: a voyage sailed with exactly the five seated hands in seat
     order, and its reveal paid each of them exactly the route's 230 crew XP.
7. **The `GameApi` seam on the client.** Components call `api.castLine()` instead of importing
   the server action directly. On the web the implementation is the server action, so this is
   a rename, not a behaviour change.
8. **Restock through play** (drafted above), when Kong is ready to make that design call.

**Then the spike** (phase 3's week, updated):
- Tauri plus SQLite and a static export of the client.
- `GameApi` pointed at the local core for ONE system (fishing), running with the network off.
- The point is to prove the path and surface the surprises while they are cheap.

### Size, roughly

- **Steps 1 to 4:** a few weeks, all low risk.
- **Steps 5 to 7:** the bulk, measured in months. They can be done system by system alongside
  normal work, each step shipped to the web with behaviour unchanged.
- **After that:** porting the RPCs, crons and shared-world systems to local equivalents, once
  the core runs locally.
- **On top:** phases 1 to 7 above (money, identity, input, Steam features, networking, the
  store) still apply.

### Rules while this is prepped

- New game rules go in pure `lib/` modules with injected randomness and time. Never inline in
  an action, and never in SQL.
- New content goes in the repo, not only in a table.
- New art goes in `public/`, not a storage bucket.
