# The Steam port — PARKED IDEA, NOT A PLAN

**2026-09-30, KONG: THE STEAM GAME IS REBUILT IN GODOT.** This reverses the 2026-09-28 "wrap in
Electron" decision (stage 3 below). The reason: multiplayer is now at launch (Charters, co-op
raids, crew dives), none of the screens were built for more than one captain, and with the game
desktop-only a real engine is the better home. What carries over: the rules and cores in
`web/lib` (the SPEC for the port, with their checks), the content JSON, the art in
`web/public`, and every design decision on this page. The Electron shell (`desktop/`) is no
longer the product; it stays as a reference for how the offline game behaves until the Godot
build passes it. Weighed and accepted: the rewrite is months before multiplayer starts (about
155k lines of screens and 69k of rules at the time).
- LANGUAGE: GDScript with static typing; Steam through GodotSteam (its multiplayer peer too).
- FIRST SLICE: the sea chart and fishing, solo and matching the rules, then a second captain
  joining over a Steam lobby and sailing the same sea. Co-op raids after the co-op combat
  design sitting.
- PARITY: the TS cores generate test cases (a save plus seeded rolls in, the save out) and
  the Godot build must replay them exactly; a system is ported when it matches.
- THE WEB BETA: stays up, FEATURE-FROZEN, bug fixes only. New features go into Godot.
- STAGE 0 BUILT (2026-09-30): the project is `godot/game/` (Godot 4.7.2; `godot/sea/` is
  the parked August 3D prototype, left alone). `core/dice.gd` (mulberry32 and seedOf, exact),
  `core/clock.gd`, `core/js_json.gd` (numbers as JS doubles, written as JSON.stringify does),
  `core/save_file.gd` (the v13 local save format, read and written byte for byte).
  `web/scripts/parity-export.mts` writes the cases (dice, saves, three fishing sessions of 433
  calls from `lib/data/local/starter.ts`'s new captain, now shared with the desktop shell);
  `tests/parity.gd` replays them; `node tools/parity.mjs` runs it all. GodotSteam 4.22.1 is
  fetched by `tools/setup.mjs` (pinned, checksummed, not committed) and loads. Porting rules
  are in `godot/game/README.md`. Fishing is PENDING until stage 1 ports the cast and reel.

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
content complete actually means, and spend about a week on a SHELL SPIKE soon (done: Electron, step 8 stage 3) plus
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

Achievements mapped off `lib/badges.ts` (one for one, the API name is the badge id; BUILT 2026-09-29, see step 8 below), rich presence, invites. Cloud
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
- It runs against a local save: a JSON save file in the Electron shell, synced by Steam
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
5. **Money. DECIDED 2026-09-30:** buying the game on Steam makes you a Captain, and there
   is no store in the Steam build. Gems are removed from BOTH builds: cosmetics become earned
   and utilities cost doubloons. See economy-membership.md, "Gems are being retired". The web
   keeps Captain ($9.99, one-time) as its only purchase.

### Working it through with Kong (started 2026-09-30)

Decisions made together, one at a time. None of it is built yet; each one is also written into
its system's doc.
1. **Money:** buying the game on Steam = Captain; gems are removed from both builds; cosmetics
   are earned and utilities cost doubloons (economy-membership.md).
2. **The calendar:** Animal Crossing runs on the real clock and leaves clock-changing alone.
   The clock trick is accepted: it only affects the player who does it. So some things reset
   WITH PLAY and the rest REFRESH ON A CLOCK:
   - RESET ON COMPLETION: the bounty board and the daily challenges (bounties.md,
     progression.md).
   - SEA DAYS: voyages are measured in sea days, and may bring back an expedition crate
     (voyages.md).
   - REMOVED: the Daily Haul.
   - SEA DAYS: the Tide Turner gives 3 skips per sea day (it was held to 3 a real day for the
     leaderboard, which is going away). The Parlor's Captain's Board deals 1 card per 10 sea
     days (8 real hours) and holds 3, so an unplayed card is never lost.
   - RECRUITS: the board reloads on its own every few sea days (count to set), and CREW
     REROLLS become an item that can drop from expedition crates. This is Darkest Dungeon's
     Stagecoach, adapted: our expeditions aren't its dungeons, so a clock does the reloading.
   - DON'S TRIBUTE IS REMOVED (the Locker perk that paid 10 Fathoms a real day). No refunds
     for the 220 Fathoms paid (Kong).
   - OPEN on recruits: the reload count (10 sea days matches today); whether a reload refills
     only empty seats or replaces the whole group; rerolls from crates only, or also for
     doubloons.
   - HARDCORE GAUNTLET STAYS, and so do Blood Gems, with a new use:
     - The boosted reroll is DROPPED.
     - The 250-Blood-Gem skin gamble becomes SKIN VOUCHERS. Blood Gems buy them, you hold
       them, and redeeming one rolls a random crew skin from EVERY skin, the legendary chase
       skins included at rare odds.
     - A duplicate refunds part of the Blood Gem cost.
     - Vouchers can also drop, very rarely, from crates.
     - Davy's Terms keep multiplying Blood Gems.
     - HARDCORE RUNS: 1 per 10 sea days (8 real hours, today's rate), and unused runs wait,
       up to 3.
     - OPEN: the voucher price, the odds, the refund share, and which crates.
   - LEADERBOARDS: Kong, 2026-09-30: "When we fully migrate to Steam, leaderboards will no
     longer exist." So the direction is now a FULL MIGRATION: the web retires at some point.
     This overrides "the web version is not retiring" above, and no date is set.
3. **Existing web players:** FRESH START, NO GIFT. Kong: "Web is beta. Nothing gets carried
   over. They all know this." Nothing is imported and gem balances simply end. So:
   - phase 2 (identity, the Steam claim) is not needed;
   - the web-to-desktop import (`fromWebExport`) is a testing tool only;
   - the pending Don's-hardcore data repair only matters for the beta.
4. **Content complete, for the Steam launch:**
   - STORY: the campaign rewrite (nodes 32 to 58) must be finished. Chapter 4, the finale's
     dial combat and the Ancient Deep giants are already complete.
   - MULTIPLAYER AT LAUNCH (Kong), over Steam's networking (peer to peer, Valve's relay, no
     server of ours). Each player keeps their own save and earns full rewards in it; nothing
     is split or traded, so local saves cannot be duplicated through it.
     - JOINING: invite to your sea. You open your sea to friends and invite them through the
       Steam overlay, or they join from "Join Game". Joining is the consent: Steam friends
       replace follows, and accepting replaces the pact.
     - AT LAUNCH: seeing each other sail (today's web presence: live boats, arrows,
       arrivals), and FISHING TOGETHER. Being near each other gives a shared bonus while
       each captain casts their own dial; the bonus is to design.
     - CO-OP COMBAT: Kong wants it and it needs real design thinking first. Raids as a pair
       means one game runs the fight and the other follows. The gauntlet is harder still
       (shared boons, cash-out, permadeath on a disconnect). Not committed to launch.
     - NOT AT LAUNCH: homestead visits, trading and gifting.
     - MULTIPLAYER IS ONLY CHARTERS (Kong, 2026-09-30, replacing the guest-visiting rules
       just below). Solo captains are strictly single-player, each in their own world, and
       nobody else sails in it. Everything multiplayer is a Charter, with Charter captains
       that only ever play in that Charter's shared world. The Terraria-style guest rules
       below are kept only as a record of what was considered.
     - THE MODEL (Kong, 2026-09-30, SUPERSEDED for solo captains by "only Charters" above):
       TERRARIA'S, with Animal Crossing's manners for the homestead.
       - Up to 4 captains in a sea, joined by invite.
       - GUESTS SAIL IN THE HOST'S WORLD. They go anywhere the host can, including water they
         have not unlocked, and join the host's fights.
       - Everything a guest catches or earns (fish, doubloons, XP, loot, crew XP) goes into
         THEIR OWN save.
       - The host's world progress stays the host's: campaign nodes, fog, isles, digs, the
         regulars, Finn. Clearing a friend's raid does not clear it in your campaign.
       - The homestead is visited, not changed: you can look around and leave something, and
         only the owner changes it.
       - Talking is pings and emotes, with Steam's own chat and voice. No in-game free text.
       - Fishing together has a nearby bonus and shared moments.
       - OPEN: whether loot from a friend's later chapters is scaled.
       - Kong passed on the shared-world feature list (crew-sized catches, a sea beast, scout
         and angler, fleet voyages, drafting). What he wants instead is GROUP IRONMAN.
     - THE CHARTER (Kong, 2026-09-30): a Group Ironman mode, modelled on Old School
       RuneScape's.
       - Founded at a new game by 2 to 4 friends. The Charter is its OWN WORLD: one campaign,
         one fog, one homestead and one CREW CHEST, all shared by the crew.
       - Each member has their own captain (ship, crew, gear, levels), SEALED to the Charter.
         Nothing comes in from a solo game and nothing goes out; everything the crew owns,
         the crew earned. Specialising pays (one fishes and sells, one raids for gear) and
         the chest joins them up.
       - HARDCORE CHARTER: the crew shares a pool of lives (proposed: one per member plus a
         spare). A sunk ship or a lost raid spends one. When they run out the Charter plays
         on and loses its hardcore flag for good.
       - THE TERRARIA WAY (Kong, 2026-09-30, replacing an earlier "solo play, merged on
         return"):
         - The Charter's world lives on ONE computer, the founder's. The crew plays it when
           the founder hosts, and nobody plays it while the founder is away.
         - So there is one copy, no merging, and chests work exactly like Terraria's: anyone
           can add or take, one person at a time.
         - The founder can hand the world to another member.
         - Why: without a server, solo play meant a copy on every machine and a merge, and the
           chest would have needed rules against two captains taking the same thing apart.
       - THE CREW CHEST holds doubloons, raid items and forge materials, and maybe rods.
         Kong: "we may need to revisit how we do our whole inventory system" (next sitting).
       - THE REGULARS AND FINN are each captain's own: everyone builds their own rapport and
         meets Finn themselves. The campaign is the Charter's.
     - CAPTAINS AND WORLDS (Kong, 2026-09-30):
       - No accounts on Steam: no sign-in, no Google, no linking. You are your Steam account.
       - A CAPTAIN SELECT screen, with as many captains as you like. A new captain's name
         defaults to their Steam name and can be changed in setup.
       - Each normal captain has a HOME SEA (their own campaign, fog and homestead, like a
         Stardew farm per save), played alone.
       - In a Charter, the ALMANAC (catch log, bests, prestige) is SHARED by the crew.
       - BUILT (2026-09-30), the captain select, normal captains only (Charters come with the
         networking):
         - Each captain is one file, `captains/<id>.json` in the save folder; the id is the
           save's uid (`captain-` plus 12 hex for new ones). `desktop/electron/captains.cjs`
           owns the files: list, read, write (atomic, one at a time per captain, newest
           kept), retire. The old single `captain.json` moves in on first start.
         - RETIRE moves the file to `retired/<id>-<stamp>.json`. Nothing is ever deleted; a
           slip is undone by moving the file back by hand.
         - `desktop/src/CaptainSelect.tsx` is the title screen: each captain's avatar, name,
           levels, purse and last played, Play, Retire (asks once), New Captain. It opens on
           launch and at `/captains` (the Nav's Captains link on desktop; the Nav menu's Sign
           Out reads Captains and goes there).
         - Choosing a captain RELOADS the window with the id held in sessionStorage, so no
           screen or Steam state from one captain reaches the next.
         - The Steam name, cut to what a username allows, is offered in the setup's name box
           (`SetupModal` `suggestedName`); the web offers nothing.
     - THE CHARTER, WALKED THROUGH SYSTEM BY SYSTEM (Kong, 2026-09-30):
       - CAMPAIGN: SHARED MAP, PERSONAL CREDIT.
         - When anyone clears a node, the Charter's map advances and the water opens for
           the whole crew.
         - First-clear loot, the chapter-end ship class choice, legendary crew unlocks and
           bounty rungs go only to captains who TOOK PART.
         - Cleared nodes stay re-fightable, so a captain who missed one earns their credit
           later.
         - Story beats play once for those present; the Captain's Log replays them.
       - XP: FULL to every captain in the fight; nothing is split.
       - LOOT: PERSONAL ROLLS, each captain's own crate into their own save. What they do not
         need can go in the crew chest.
       - FIGHTS: every captain present joins with their own ship and crew. The boss grows
         tougher per extra captain, and a captain can take a Charter raid alone at normal
         difficulty. (The Charter only runs while its founder hosts, so "alone" means the
         founder solo, or one captain fighting while the others are elsewhere in the
         session.) Co-op combat itself (turns, targeting) is its own sitting.
       - EXPLORATION: ALL SHARED.
         - The fog lifts for the whole crew wherever anyone sails, and the fog badges count
           the Charter's shared map.
         - One landing claims an isle for the Charter, and one dig claims a site.
         - The caches go into the CREW CHEST.
         - Any captain's bearing (from their own regulars) marks a site on the shared chart.
         - One portal for the Charter, raised by anyone.
         - OPEN: isle caches pay cosmetics under the new economy, so the chest may need to hold
           cosmetics for a captain to take.
       - HOMESTEAD: ONE SHARED BASE, as a Terraria base is. Any captain builds, furnishes and
         arranges it; it all belongs to the crew. (Open detail: whose badges hang in the
         gallery.) PARKED for later: captain's quarters, a personal room per captain.
       - THE SEA'S MARKET: one market for the Charter (it is part of the world).
       - THE ALMANAC: ONE SHARED BOOK.
         - A species is logged once anyone lands it.
         - One personal best per species, with the holder's name.
         - Zone completion rewards pay once, into the crew chest.
         - A GOLDEN is logged with the CATCHER'S NAME on it: the credit is theirs, the book
           is the crew's.
         - PRESTIGE is a CREW VOTE (any captain proposes; everyone present agrees), and its
           boosts apply to the whole crew.
         - The FINALE opens for every captain once the crew's wall holds all six ancients.
       - THE PURSE: DOUBLOONS ARE THE CHARTER'S.
         - Every coin a captain earns (sales, loot coin, rewards) goes into ONE SHARED PURSE,
           which every captain spends from.
         - A CREW LEDGER everyone can read shows who earned what and who spent what.
         - Fathoms and Blood Gems stay each captain's own, since they buy that captain's
           Locker upgrades.
         - ITEMS (raid gear, rods, bait, fish) go into each captain's own inventory and can
           pass through the crew chest. The chest therefore holds items, not coin.
       - CREW: each captain recruits and levels their own. The CREW HALL (hall, drills,
         stores) is the Charter's, upgraded by anyone from the purse.
       - GAUNTLETS: personal Lockers from each captain's own Fathoms. Raid items move through
         the chest.
       - BOUNTIES: ONE SHARED CREW BOARD. Any captain's actions count; finished orders pay
         the purse; the bounty ladder's cosmetics go to EVERY captain when the crew reaches a
         rung.
       - DAILY CHALLENGES: ONE SHARED BOARD the crew completes together, paying the purse.
       - THE PARLOR: PERSONAL. Each captain has their own Board, Capstan, Pirate King, streak
         and rank; pay goes to the purse, and rank rewards are the captain's.
       - THE CHART ROOM: PERSONAL PUZZLES, SHARED WORLD CHART. Every captain's puzzle points
         push the Charter's one World Chart.
       - FOUNDING, JOINING, LEAVING:
         - CHARTER CAPTAINS LIVE INSIDE THE CHARTER'S WORLD, as Stardew keeps farmhands in
           the host's farm. They are saved on the founder's machine and played only when the
           founder hosts. So sealing holds by construction (a Charter captain cannot reach a
           solo game), and a handover moves the world and every captain together.
         - FOUNDING: "Found a Charter" from the title screen. Name it, choose normal or
           hardcore (fixed from then on), and make your Charter captain (Steam name by
           default). The founder hosts a harbour lobby, friends join by Steam invite and
           make their captains (up to 4 berths), and the founder presses SET SAIL.
         - THE ROSTER LOCKS AT SET SAIL: nobody joins afterwards, as in Old School RuneScape's
           Group Ironman.
         - LEAVING: a member who stops playing keeps their berth, and their captain waits
           for them. The founder can release a berth, which shrinks the crew (a locked roster
           cannot refill it).
         - HANDOVER: the founder can pass the whole Charter to another member, who hosts from
           then on.
       - HARDCORE CHARTER:
         - A LIFE is spent when a captain's SHIP IS SUNK: losing a raid fight, or going down in
           a gauntlet dive. Crew lost on voyages do not count; they are already a permanent
           loss of their own.
         - LIVES: one per member plus one, so four captains get five.
         - AT ZERO THE CHARTER SINKS: the world and every Charter captain are gone for good.
           True permadeath.
         - REWARD: a hardcore badge and a crimson Charter flag while it holds.
         - Notes: Steam achievements survive the sinking, since they live on each player's
           Steam account. A founder could restore a copied save; on a local game that cannot
           be prevented, and it only affects that crew.
         - Suggested, not decided: a MEMORIAL on the title screen for a sunk Charter (its name,
           crew, how far it got, where it went down).
       - CO-OP COMBAT:
         - THE HOST'S GAME RUNS THE FIGHT. Every Charter captain lives in the host's world, so
           the host rolls the dice and writes everyone's rewards; the others' games show the
           fight and send their aim presses. No disagreement between machines to settle.
         - A SHARED FIRING PHASE: each round every captain fires at once on their own aim bar
           (a short timer, about 20 seconds), then the boss acts.
         - CREW EFFECTS AND ITEMS NEED A MULTIPLAYER PASS, so heals, shields and boosts can
           reach a crewmate's ship. (Volleys, and a boss that telegraphs its target, were
           suggested but not chosen.)
         - SUNK MID-FIGHT: out for the rest of it, and NO REWARDS from that fight even if the
           crew wins. In a hardcore Charter it spends a life.
         - GAUNTLETS: the crew DIVES TOGETHER, with a shared run, shared boons and a joint
           cash-out decision. To be designed in detail.
     - THE ITEM SYSTEM (Kong, 2026-09-30; applies to solo captains too):
       - EVERYTHING OWNED IS ONE OF FOUR KINDS:
         - STACKS: counts of identical things (bait, fish, forge materials, raid components).
         - UNLOCKS: owned once, forever (cosmetics, badges, forge recipes, the six special
           items).
         - ONE-OF-A-KIND ITEMS: each with its own details (crew members, goldens with their
           length, forged gear if it gains charges or rolls).
         - UPGRADES: a level, not an item (reel, hook, line, hull tiers, the hold, the Crew
           Hall). Never held or given.
         Equipment slots point at owned things.
       - RAID ITEMS ALLOW DUPLICATES, AND EVERY ITEM HAS A FIXED DROP RATE (Kong, 2026-09-30;
         BUILT as stage 3, see raids-campaign.md):
         - A captain can hold several copies of a piece of gear.
         - What you own no longer drops out of a crate: every unique rolls at its own
           unchanging rate. Today an owned item leaves the table, which makes completing a
           boss's set fast; that goes.
       - RODS ARE ITEMS (Kong, 2026-09-30):
         - Each rod has a name id instead of a "tier" number (the numbers stopped meaning an
           order long ago), with its stats, price, level gate and where it is sold.
         - Held as copies like other gear, duplicates allowed; selling back sells one copy.
         - The equipped rod is a slot pointing at one you own.
         - The Bamboo is a real, unsellable item every captain starts with.
         - The Completionist Rod is a ONE-OF-A-KIND item carrying its own forged effects
           (today they live on the profile).
         - Rods do NOT drop as loot, for now.
         - The web beta keeps its columns, and its store translates ids to the old tier
           numbers; the desktop save gets the clean shape.
         - BUILT (4a/4b, 2026-09-30): ids, copies on both builds, every rod system on the
           inventory. See gear.md. 4c (screens and the API off tiers) is next.
       - A COSMETIC IN THE CHEST IS A TOKEN: the captain who takes it unlocks it. An unlocked
         cosmetic stays with its owner.
       - THE CREW CHEST HOLDS raid items, forge materials, rods and cosmetic tokens. Not bait,
         fish, crew members or upgrades.
     - THE GALLERY: each Charter captain pins their own badges on their own row.
     - BADGES PAY IN ACHIEVEMENT POINTS ONLY (Kong, 2026-09-30; solo too). The Claim button and
       the per-badge doubloons and gems go. Badges earn AP, AP milestones unlock cosmetics
       (extending the colours and boats AP already unlocks), and Steam achievements mirror the
       badges. So a badge stays personal even in a Charter.
       - A Charter captain is a SEPARATE character, sealed to its Charter's world.
       - So today's single save splits into a CAPTAIN file and a WORLD file.
     - THE INVENTORY SURVEY (2026-09-30) found everything a player owns stored six ways:
       - own tables (rods, bait, fish);
       - lists on the profile (most unlocks, and raid items, which cannot be held twice
         although the forge consumes them);
       - one true/false column per special item;
       - structured data columns (crew skins, homestead);
       - plain numbers (reels, hooks, lines, the hull);
       - a list that is really a ladder (repair kits).
       Also: some unlocks are only saved when first equipped, and there are about a dozen dead
       columns and card-era leftovers. The captain/world split and one item system are one
       job: split first, then the item model.
       - STILL TO DESIGN:
         - which state is the WORLD's and which is the CAPTAIN's, per system;
         - the hardcore numbers;
         - how a Charter is founded and joined, and what happens when a member leaves.
   - RETIRED on Steam: contests and the Pirate King ladder (races between players), along
     with the leaderboards.
5. **Quick ones (2026-09-30):**
   - STORE ART is parked until nearer launch: whether to commission the capsule, key art and
     trailer. The AI disclosure is required either way.
   - The physical-pack CLAIM CODES (`/claim`, 100 gems a pack) are RETIRED.
   - The Don's-hardcore cash-out repair is CLOSED as won't fix: the beta resets and nothing
     carries over.
   - The CASINO CHECK resolves itself: with no purchased currency, chips only ever come from
     earned doubloons.
6. Still to come: what "content complete" means, the real
   screens in the desktop window, controller support, store art and the AI disclosure, the
   casino check.

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
   - **Voyages and trawls: DONE 2026-09-28.** `lib/data/voyageData.ts` holds `VoyageData` and
     `TrawlData`, both over `CrewData`; `voyageActions` and the trawl actions no longer name a
     table. Contract: a second voyage launch while one is out reports `taken`; the reveal
     flips once and only the flipper pays; a trawl is collected once and only the collector
     is paid.
     Verified live on catman: a triumph voyage launched and revealed paying exactly 422 and
     3 gems with 288 crew XP to each of the five hands; a finished Shallows trawl (planted by
     hand, since sending needs the Docks) collected from the day board with its XP, coin,
     ledger line and counter all landing and its row gone.
   - **Gauntlet: DONE 2026-09-28.** `lib/data/gauntletData.ts` over `CrewData` (the hardcore
     squad is crew); the gauntlet actions no longer name a table. Contract: `closeRun` closes
     an OPEN run once, and only the closer pays, drowns a squad or logs the run; the Don's
     tribute stamps once per UTC day; the best hit only ever rises; a squad drowning touches
     only the living and reports how many.
     Verified live: catman's gauntlet page reads the same through the store as before (deepest
     82, the ledger tops, DESCEND open, no server errors). A cash-out was NOT driven live,
     since it needs a played dive and would spend catman's daily run; the first real finish
     after 2026-09-28 is the proof.
   - **Casino: DONE 2026-09-28.** `lib/data/casinoData.ts`; slots, blackjack, roulette and the
     chip purse no longer name a table. Contract: a blackjack hand settles once and only the
     settler is paid; the table saves only while the hand is active; the cash-out moves every
     chip in one step; the community pot's share and new size come from one atomic claim
     (offline, the pot is a local one).
     Verified live on catman: four slot pulls took the purse 95 to 20 (four stakes, one
     two-hook refund), the session net fell exactly 75, the community pot rose exactly 12
     (four feeds of 3), and all four spins were logged.
   - **Raids: DONE 2026-09-28. EVERY PHASE B SYSTEM NOW HAS A DATA LAYER.** `lib/data/raidData.ts`
     (`lib/runToken` kept as thin wrappers over it); raid clears, kills, loot, the cleared set,
     player stats, the campaign map, the forge and Accelerator, the Ultimate build, the berth
     and armory, spoils and repair kits no longer name a table. `CaptainData` gained
     `updateProfileIf`: a declarative guard list (`is null`, `eq`, `not null`, `contains`)
     that every one-shot purchase, build and node clear uses, and that a local store turns
     into a WHERE. Contract: the run token pays each round, clears, opens its crate and is
     consumed once each, and refuses an expired token.
     Verified against production directly through the store: catman's cleared raids, the
     raid records, and the store's own fastest-clear (dkmuppy on the Throne, 2,018,018 ms)
     agree with the database's aggregate; a guard that does not hold writes nothing, one that
     holds writes, and the profile was left unchanged.
7. **The `GameApi` seam on the client.** Components call `api.castLine()` instead of importing
   the server action directly. On the web the implementation is the server action, so this is
   a rename, not a behaviour change.
   **STARTED 2026-09-28, fishing first.** `lib/gameApi` exports one `api` object. Its
   `FishingApi` interface is typed straight off the server actions (`typeof castLine`...), so a
   second implementation cannot drift from the first without the compiler saying so. The web
   implementation IS the server actions. The fishing screen, loadout, chart, shipyard, golden
   choice and the gauntlet's special-item buy now call `api.fishing.*` (24 call sites); no
   component imports the fishing actions any more (`bootActions` is server code and keeps
   calling directly). The Tide Turner is `api.fishing.tideTurnerSkip`, not `useTideTurnerSkip`,
   so the hooks lint does not mistake it for a hook.
   The swap for Steam is a build-time alias of `lib/gameApi`'s implementation module; not built
   yet, that is the step 8 spike.
   Verified live on catman: 8 casts through `api.fishing` took 8 worms, and 2 landings logged
   and put 4 in the hold.

   **STEP 8 SPIKE, STAGE 1 DONE 2026-09-28: the cast and the reel run offline.**
   - `lib/core/fishing.ts` holds `castLine` and `reelIn` with nothing of the web: the store
     (`FishingData`) and the captain's id are arguments, and the shared helpers they used
     (wallet, badges, anomaly flags, the day's challenge override) became store operations.
     The server actions are now thin wrappers: check the session, pass the Supabase store.
   - `lib/data/local/fishingLocal.ts` implements `FishingData` over a plain save object,
     honouring every one-shot contract.
   - `installRng` / `installClock` install the save's seeded dice and a clock process-wide,
     for the one-player offline process only (never on the web server).
   - `scripts/check-offline-fishing.mts` (in `npm run check`) walks the core's import tree
     (no Supabase, no Next, no server action on it), fishes 80 casts on a local save checking
     bait, hold, log, XP and the one-shot claims after every one, and replays the seed to the
     identical save.
   - Web verified live after the change: 9 casts, 9 worms, 3 landings including a x100.
   **Found by the spike (to fix, none blocking):** the core stamps a few timestamps with the
   real clock rather than `clockNow`; `reelCrate` is not in the core yet (the crate loot grant
   still takes the Supabase client); offline there is nobody to rank against, so the top-three
   nudge answers nobody.
   **STAGE 2 DONE 2026-09-28: the save is ONE JSON FILE** (Kong chose it over SQLite: the save
   is already one document, it is small, it needs no dependency, and it is the Stardew model
   Steam Cloud syncs; SQLite can come later behind the same interface if saves grow).
   - `lib/data/local/saveFile.ts` (pure): a format name and version; a file that is not a
     save, or is from a newer game, is refused; older versions upgrade in order (MIGRATIONS);
     it stores player state only, re-attaching the species from content on load; web tables
     the offline core does not model yet are CARRIED verbatim so nothing is lost.
   - `SaveStorage` is where the text lives: `nodeSaveStorage` (tests, tools) writes
     atomically (temp file, flush, rename); the shell supplies one through Electron's main process.
   - `fromWebExport` turns a web account's export (`scripts/player-save`) into a local save.
   - The check now quits at cast 40, reloads from a ~3.5 KB file into a new store, and must
     end exactly where an unbroken session does; an interrupted write leaves the old save
     whole; catman's REAL converted export (146 species, 21 rods, 22 tables carried) fished 20
     casts offline, landing all 20.
   **STAGE 3, THE SHELL, DONE 2026-09-28 (Electron).** `desktop/` at the repo root (not a second
   game). Tauri was tried first and dropped the same day: it needs Rust plus the MSVC build
   tools, and its webview differs per OS. Electron ships one Chromium everywhere, has
   steamworks.js for Steam, and is the path Vampire Survivors, Cookie Clicker and CrossCode took.
   The decision on 2026-09-28: WRAP, do not rewrite. A native (Godot) rewrite was weighed and
   set aside; revisit only for consoles or if Steam sales justify it. REVERSED 2026-09-30:
   Kong chose Godot once multiplayer was at launch (see the top of this page).
   - A Vite + React front end, NOT a static export of the Next app (that would drag every server
     page in). Its `@` resolves into `web/`, so the core, the local store, the save file, the
     rules, the content and the REAL dial (`components/FishingDial` DialSVG) are the website's
     own files; React is deduped so the dial shares the app's copy.
   - The seam in action: `@/lib/gameApi` is aliased to `desktop/src/localGameApi.ts`, which
     answers `api.fishing.castLine` and `reelIn` from the core and the save (the rest answer
     that they are not offline yet). The screen imports `api` exactly as the website does.
   - `desktop/electron/main.cjs`: serves `dist/` over a private `app://game/` scheme (not
     file://), owns the saves (one per captain, `captains/<id>.json` in the app data folder since the
     captain select, written atomically: temp,
     fsync, rename), and locks the page down (context isolation, sandbox, no Node, no navigation
     away, outside links open in the browser). `preload.cjs` exposes ONLY `window.stbSave`
     (list, retire, and where, read, write by captain id) and `window.stbSteam`. `desktop/src/saveStorage.ts` uses it, or localStorage in a plain
     browser.
   - Commands (in `desktop/`): `npm run app` builds and opens the window; `npm run app:dev` is
     the Vite dev server with hot reload inside the window; `npm run dist` makes the Windows
     installer (NSIS) and `npm run dist:dir` an unpacked build in `release/`.
   - TRAP: VS Code's terminals export `ELECTRON_RUN_AS_NODE=1`, which starts Electron as plain
     Node (`protocol` is undefined). Even an EMPTY value counts; the launchers
     (`electron/start.mjs`, `dev.mjs`) delete the variable.
   - Everything the page needs is bundled, so the package's `dependencies` must stay EMPTY
     (all devDependencies): otherwise electron-builder ships node_modules (it did: 17 MB asar,
     now 720 KB). The unpacked build is ~370 MB, nearly all Electron's own Chromium.
   - Verified in the REAL window (puppeteer over the remote debugging port): the page has
     `stbSave` and no `require`/`process`, zero requests outside app://, casts through the core,
     two Bluegill landed (283 XP, 1 species), and a relaunch came back from the file exactly
     (283 XP, 54 worms, 2 in the hold) with no temp file left. The packaged exe opens the game.
   - Probe note: a fast needle cannot be timed with puppeteer's keyboard (the per-frame dial
     re-render delays input by hundreds of ms); the probe dispatches the keydown from inside the
     page at the moment the needle is in the band.
   **ALL OF FISHING OFFLINE, 2026-09-28.** Every `api.fishing` call now runs in the core:
   `lib/core/fishing` gained the crate, the wormhole, the Tide Turner, the golden choice
   (held, sell, mount) and the level rewards; `lib/core/loadout` holds boats, bandanas, pets,
   the special slot, the Completionist forge and the two preferences. The actions are thin
   wrappers (session, then the core with the Supabase store; `revalidatePath('/sea')` stays in
   the action, as the one web-only step). The crate grant is shared through
   `lib/crateLoot` `grantCrateLootTo(store)` (the weekly and Master crates still call
   `grantCrateLoot(admin)`, which adapts the client). FishingData gained `spend`, any owned
   list in `addToList`, and `achievementPoints` (offline: the badges held). The core's
   timestamps now come from `clockNow`. check-offline-fishing section 5 exercises each call and
   its one-shot guard; verified against production as catman through the real store (a
   wooden crate opened once, a golden sold once, the rest round-tripped and restored). The
   desktop's `localGameApi` answers every fishing call, and `desktop/tsconfig.json`
   (`npm run typecheck`) checks the shell with one React for both trees.
   NOT on the API yet (still direct server-action imports): quickBuyWorms, claimZoneReward,
   prestigeZone, releaseAncient, the tour flags, checkLeaderboardPosition, syncFishHold.
   **SELLING OFFLINE, 2026-09-29.** `lib/core/selling`: the market (whole hold, per species),
   the resident buyers, the wandering traders (claim, daily cap), the blockade runner, and
   `saveSeaPosition` (it lived in the trader actions and uses the same store). The actions are
   thin wrappers; the market ones still settle the retired delayed lane first (web-only table,
   never written offline). `api.selling` carries them; the sea chart, the trader panel, the
   market screen and the pending-sales watcher call it.
   - THE MARKET OFFLINE is the captain's own. On the web it is shared and the hourly cron
     `update_fish_market()` moves it; `lib/marketRules` is that SQL ported line for line (moods
     at the same odds and 2 to 5 hours, drift 8% to par, rarity volatility, clamp 0.40..2.50,
     cents, 24-deep history). The local store catches it up by the whole hours since it last
     ticked, capped at 48 (the drift has erased anything older).
   - `lib/data/local/save.ts` now holds the save's shape and `localCaptain` (CaptainData plus the
     wallet, lists, badges), spread by every local store. The SAVE FILE IS VERSION 2 (deals,
     market); a v1 file upgrades on load. Deals older than a week are pruned (their keys carry
     their day and can never be claimed again).
   - `scripts/check-offline-selling.mts` (in `npm run check`): the import trees, 5,000 market
     ticks and the mood odds against the SQL's, the catch-up, every lane and its guard, and the
     v1 to v2 upgrade. Verified against production as catman (one fish sold, one peddler deal,
     the chart position round-tripped and restored).
   - Found on the way: `update_fish_market()` was executable by anon and authenticated. It ran
     with the caller's rights and RLS has no update policy on the market tables, so a client
     call changed nothing, but it was revoked (2026-09-29) to match every other cron function.
   **THE CREW OFFLINE, 2026-09-29.** `lib/core/crew`: the board (free once a day, the paid and
   blood-charged rerolls, the gifted legendary, the blood skin gamble), recruiting, the roster,
   seats on both tracks, clear/bench/promote/rename/dismiss, crew the deck, the graveyard, the
   hall upgrade, bunks and the Leviathan re-cut, drills and stores, crew skins, promotions. The
   crew, bunk and promotion actions are thin wrappers (`revalidatePath('/sea')` stays in the
   hall and ladder ones); `api.crew` carries them to the Crew Hall, the ship screen, the crew
   panel and the hall sheet.
   - `lib/crewBunkSettle` and `lib/crewXPGrant` now take the crew STORE, not the admin client
     (`grantXPToSeatedVia` / `grantXPToIdsVia`; the admin-taking `grantXPToAssignedCrew` /
     `grantXPToCrewIds` remain as wrappers for voyages, raids and the gauntlet until those move).
     CrewData gained `spend`, `grant`, `addToList`. `stampBadges` moved to the pure
     `lib/badgeStamps` (badgeGrant re-exports it); the local `grantBadge` now dates badges too.
   - `lib/data/local/crewLocal`: the card catalogue from `content/cards.json`; the
     `grant_crew_xp_*` SQL as arithmetic; the web table's unique keys on bunks. SAVE FILE v3
     (crew with the fallen, recruits, bunks, one `nextId` counter; a v2 file upgrades and gets
     the hall's web defaults). A web export's crew convert with `nextId` past every web id.
   - NOT YET OFFLINE: voyages and trawls, so offline no hand is ever at sea or on a trawl, the
     graveyard cannot name the route, and `crewHub` (it reads both) stays web-only for now.
   - `scripts/check-offline-crew.mts` (in `npm run check`) and a production probe as catman
     (reads, a seat and a skin round-tripped and restored).
   - The desktop now carries a save's unmodelled web tables through every write (it dropped
     them before, so a converted account would have lost them on the first autosave).
   **VOYAGES AND TRAWLS OFFLINE, 2026-09-29.** `lib/core/voyages`: the daily voyage (state,
   send, reveal, the board), trawls (the docks, send, collect) and `crewHub`, the crew's roll
   call. The voyage, trawl, voyage-board and crew-hub actions are thin wrappers; `api.voyages`
   carries them to the voyage panel, the trawl indicator, the chart, the crew panel and the
   Charterhouse board.
   - THE CAPTAIN'S LOG stays web-only: it is an AI call. `revealVoyageResults` in the core
     returns `{ result, log }`; the web action schedules `generateAndSaveVoyageLog(log)` with
     `after()`, the desktop drops it, so an offline voyage simply has no log.
   - `loadDeployedPartyVia(store)` (the admin `loadDeployedParty` wraps it for raids and the
     sea page). VoyageData gained `revealedVoyages` and `grantBadge`; `seaCrewData(admin)` is
     voyages and trawls as one store for the roll call.
   - `lib/data/local/voyageLocal` (one store for both, spreading the crew's): one ship at sea,
     a reveal flips once, one trawl per zone and per hand, a trawl claimed once. The crew store
     now reads the save's voyages and trawls, so the at-sea and trawl locks hold offline and
     the graveyard names the route. SAVE FILE v4 (voyages, trawls); a v3 file upgrades.
   - `scripts/check-offline-voyages.mts` (in `npm run check`), including a voyage that loses a
     hand; a production probe as catman (reads and refusals only: a send or reveal would move
     real rewards).
   **THE GAUNTLETS OFFLINE, 2026-09-29.** `lib/core/gauntlet`: Davy's and the Don's lobby,
   start, checkpoints and per-depth times, pause and resume, Davy's Offer, the cash-out and
   the death (hardcore squads drown), the Locker, the tribute, the Shrine's coin, the Fence,
   the leaderboard node. The actions are thin wrappers; `api.gauntlet` carries them to
   GauntletGame. GauntletData gained `logBountyEvent`, `grantBadge`, `flagAnomaly`; crew
   purses include `gauntlet_fathoms`.
   - The raid loadout loader moved to the store-agnostic `lib/raidLoadout`
     (`getRaidPlayerStatsVia(store)`); `lib/raidPlayerStats.getRaidPlayerStats(userId)` wraps it
     for the web and re-exports the types. `settleUltimateBuildVia(store)` likewise.
   - `lib/data/local/gauntletLocal`: `bump_gauntlet_hit` and `record_gauntlet_depth_best` as
     arithmetic; offline the ledger is the captain's own best cashed-out run. SAVE FILE v5
     (per-depth times, run log, bounty moments; the last few hundred of each).
   - FIXED ON THE WAY: a hardcore cash-out's faster same-depth time and its best-Pressure check
     read Davy's hardcore columns on a Don's run; they now use `hcCols(variant)`. Two players had
     40 Don's hardcore cash-outs under the old code, so their Davy hardcore best time may have
     been overwritten by a Don's time, and their Don's best time / Pressure may not have been
     updated. Not repaired (needs Kong's call).
   - `scripts/check-offline-gauntlet.mts` (in `npm run check`); production probe as catman (reads
     and refusals only).
   **THE DEN OFFLINE, 2026-09-29.** `lib/core/casino`: the shared chip purse (buy-in against
   the day's cap, cash-out), Fish Slots and the community pot, Fish Roulette and Blackjack
   (every move, the settlement, orphan hands). The four tavern action files are thin wrappers
   (`revalidatePath` stays in the slots, purse and deal wrappers); `api.casino` carries them to
   the blackjack table, roulette, the slot machine and the Den lobby. CasinoData gained
   `spend`, `grant` and `grantBadge`. Blackjack's mid-hand view now reads the profile once
   instead of five separate reads (same values).
   - `lib/data/local/casinoLocal`: `casino_cash_out`, `slots_feed_jackpot`,
     `slots_claim_jackpot` (share = pot x wager / max bet, floored; never below the seed) and
     `get_slot_stats` (running totals) as arithmetic. THE COMMUNITY POT offline is the
     captain's own, seeded at 15,000 like the web's. SAVE FILE v6 (`casino`: recent buy-ins, the
     open hand, the last twenty roulette spins, slots totals, the pot).
   - `scripts/check-offline-casino.mts` (in `npm run check`): 400 spins, 300 roulette spins and
     500 blackjack hands, each proving every chip is where the nets say; production probe as
     catman (reads and refusals only).
   **RAIDS AND THE CAMPAIGN MAP OFFLINE, 2026-09-29.** `lib/core/raids`: the run token,
   each round's kill pay, the clear, the crate, the biggest hit, repair kits, the three raid
   tutorials. `lib/core/raidMap`: the map view and every node type (milestones, story reads and
   legendary gates, puzzles, the Quartermaster's pick, the muster, events, forks, dice, the DPS
   gate, the scout's debt, class picks), the refit, and the Sunken Hand's spoils. Eight action
   files are thin wrappers; `api.raids` carries them to RaidGame, RaidCombat, the practice raid,
   the dice/DPS/refit/spoils panels, the ship screen's repair kit, the sea's story and node
   sheets, the chart and the shipyard.
   - RaidData now extends CrewData (the party, the loadout, crew XP) plus `flagAnomaly` and
     `logBountyEvent`. Store-agnostic helpers: `lib/raidCleared.buildClearedSetVia` (the web's
     `lib/raidProgress.buildClearedSet` wraps it); `lib/ultimateBuild` loads the Supabase store
     only inside its web wrapper, so the loadout loader stays server-free.
   - `lib/data/local/raidLocal`: the run token keeps every one-shot the web's `run_tokens` row
     has (`claim_run_token_round`, `bump_run_token_kill`, the clear, the loot, the spend) and its
     six-hour life; offline the records (`raid_records`, the fastest clear) are the captain's
     own. SAVE FILE v7 (run tokens of the last week; clears with their times, `clears` kept as
     the list); a v6 file keeps its clears, untimed.
   - `scripts/check-offline-raids.mts` (in `npm run check`) walks the WHOLE campaign offline:
     all 64 nodes, raids cleared through the token path, each node once. Production probe as
     catman (reads, refusals that flag nothing, one token minted and spent).
   **THE SHIP AND THE SHIPYARD OFFLINE, 2026-09-29.** `lib/core/ship`: the raid loadout, the
   Forge (learn for Fathoms, forge from parts), the Abyssal Accelerator (charge, claim), the
   ultimate (build, free re-pick, settle on read, retool, the Full Schematics, the free switch),
   the Sixth Berth, the Expanded Armory, hull skins, the one-time guides, the Shipyard's four
   ladders and the rod you fish with. `expeditions/actions` and `shipyard/actions` are thin
   wrappers (the Shipyard's `revalidatePath('/sea')` stays in the web wrapper); `api.ship`
   carries them to ShipHero, the berth, armory and ultimate panels, the sea chart's ultimate
   celebration and the Shipyard.
   - `lib/data/shipData`: RaidData plus the rods carried. `lib/data/local/shipLocal` spreads the
     raid store. No new tables.
   - THE SHIPYARD'S FITTED-TIER WRITE is now `updateProfileIf` on the tier just re-read, which
     is how a store says a write did not land; a refit that does not land hands the coin back
     (the old code read the Postgres error for the same purpose). Two taps racing: the second
     now refunds instead of landing one rung higher.
   - SAVE FILE v8: no new tables; the ship's profile columns get the database's column defaults
     where a save never had them (`SHIP_PROFILE_DEFAULTS`, a fresh copy per save). Without this a
     new offline captain's `has_sixth_berth` read as missing, not `false`, and every guarded
     purchase refunded itself.
   - `scripts/check-offline-ship.mts` (in `npm run check`); production probe as catman (reads and
     refusals only, each spending call made only where the profile shows it must refuse; the
     profile was byte-identical after).
   - The legacy card-collection crew picker (`getCollectionForCrew`, `saveCrew`) moved to the
     core too but is not on the API: no screen calls it.
   **THE DAILY LOOP OFFLINE, 2026-09-29.** `lib/core/bounties` (the board, its meters, a
   claim, the one swap, the points ladder, the rung announcement) and `lib/core/dailies` (the
   daily challenges and the sweep, the Daily Haul's gems, bait and weekly crate, the disc's
   state, the mailbox, the contests). `bountyActions`, `dailyChallengeActions`,
   `actions/dailyBonus`, `actions/mail` and `tavern/contests/actions` are thin wrappers;
   `api.dailies` carries them to the bounty panel and rung celebration, the chart, the Daily
   Orders, the Daily Haul, the mail inbox, the Nav pip and the contests page.
   - `lib/data/dailyData`: RaidData plus the challenge rows and their guarded flags, a stamp
     that lands once per day or week (`stampIfNew`), the bounty board (claim slot, swap, the
     logs its meters read), the mailbox and the contests view.
   - `lib/data/local/dailyLocal`: the meters read the save's own logs (raid clears with times,
     revealed voyages, bounty events, profile counters). Offline the mailbox is the captain's
     own (the game is the only sender) and the contests show this captain against the goal.
     Local `profile('*')` now returns the whole row (the bounty meters read any counter).
   - The swap now reports a write that did not land (it used to answer success).
   - SAVE FILE v9: the bounty board and its history (sixty boards), when each contest was won,
     the mail as full letters (id, read, claimed, attachments), and the loop's profile columns
     at the database's defaults (`DAILY_PROFILE_DEFAULTS`).
   - `scripts/check-offline-dailies.mts` (in `npm run check`): every rung's board, each order
     finished from the logs its meter reads and paid once; checked to fail when a claim guard
     is broken. Production probe as catman (reads and refusals, profile unchanged).
   - The sea's boot and day aggregators (`sea/bootActions`, `sea/dayActions`) still call the
     web actions server-side; they convert with the sea stage.
   **THE PARLOR OFFLINE, 2026-09-29.** `lib/core/parlor`: the Captain's Board, Spin the
   Capstan, the Pirate King and the rank claims. The four trivia action files are thin wrappers;
   `api.parlor` carries them to the board, the capstan, the King, the rank claim and the lobby.
   - THE QUESTIONS OFFLINE come from a shipped bank, `content/trivia.json`, because the web's
     come from Claude each week. `scripts/export-trivia-bank.mts` refreshes it from production
     (every week that passes the generators' shape checks, no question repeated across weeks);
     `lib/triviaBank` hands each week one entry of each list in turn. First export: 18 boards,
     14 ladders, 11 capstan sets, so the offline Parlor repeats after about three months unless
     the bank is refreshed before a build. The bank is imported only by the local store, and the
     website's browser bundles were checked to hold none of it.
   - `lib/data/triviaData`: DailyData plus badges, the week's questions (the generators on the
     web, the bank offline) and each game's attempt row, moved only from the exact state read.
   - SAVE FILE v10: each game's attempt per week (twelve weeks kept) and the Parlor's profile
     columns at the database's defaults (`PARLOR_PROFILE_DEFAULTS`).
   - `scripts/check-offline-parlor.mts` (in `npm run check`); checked to fail when a payout or
     any of the three race guards is broken. Production probe as catman (reads and refusals,
     the profile and the week's rows unchanged).
   **THE CHART ROOM OFFLINE, 2026-09-29.** `lib/core/chartRoom`: Treasure Match (the run
   replayed from its swaps), the Minefield, the Quartermaster's Hold, Lay the Rigging, the World
   Chart's landmark claims and the room's guide. Six action files are thin wrappers;
   `api.chartRoom` carries them to the four puzzles, the World Chart and the lobby.
   - ALL FOUR BOARDS ARE BUILT BY CODE (no Claude), so offline the save builds its own each week
     and keeps it: `lib/chartBoards` is now the one builder, called by the web's cached
     generators and by the local store alike. The Minefield, Hold and Rigging engines rolled
     `Math.random`; they now roll `rngNext` (unchanged on the web, seedable offline) and
     `check-rng` guards them.
   - `lib/data/chartData`: DailyData plus badges, the week's boards and one operation per
     guarded write, each web query copied verbatim.
   - SAVE FILE v11: the boards the save built and each puzzle's attempt per week (twelve weeks),
     and the room's profile columns at the database's defaults (`CHARTING_PROFILE_DEFAULTS`). A
     web export keeps what was banked or solved and drops half-done grids, since they point at
     cells of the web's board, which the save never had.
   - `scripts/check-offline-chartroom.mts` (in `npm run check`): each puzzle solved through the
     real engines (an honest Treasure Match run played swap by swap), every store guard tested
     directly; checked to fail when a guard or a payout is broken. Production probe as catman
     (reads and refusals, none that flag; the profile and the week's rows unchanged).
   **THE SEA'S OWN OFFLINE (first half), 2026-09-29.** `lib/core/sea`: the nine regulars (a
   visit a day, a job asked, a fish delivered, a friend's rod), Finn (his meetings, jobs measured
   as deltas, the hand-in, the reveal, including `fishing/finnActions.markFinnRevealSeen`),
   bottles and digs, going ashore, the portal's ladder, the free recall, and Kip's question.
   Eight action files are thin wrappers; `api.sea` carries them to the chart, the folk and trader
   panels, Finn's sheet, Kip and the fishing screen's reveal.
   - `lib/data/seaData`: DailyData plus badges, rods and one operation per guarded write (a day's
     chat, a settled job, the last fish, a once-ever rod, unique bearings and isles, a dig, the
     recall's cutoff), each web query copied verbatim.
   - `lib/data/local/seaLocal`: Finn's catch counts come from the save's lifetime log and species
     list; "landed since the ask" from the catch log's last-caught stamp.
   - SAVE FILE v12: the regulars' FULL rows (a v11 save kept only who wanted which fish, so its
     points start from nothing), bearings and digs, isles been ashore at, the homestead, and the
     sea's profile columns at the database's defaults (`SEA_PROFILE_DEFAULTS`).
   - `scripts/check-offline-sea.mts` (in `npm run check`); checked to fail when any of seven
     store guards is broken. Production probe as catman (reads and refusals, nothing moved).
   **THE SEA'S OWN OFFLINE (second half), 2026-09-29.** `lib/core/seaSheets`: the two tours'
   latches and steps (only ever forwards), the loadout sheet, the raid sheet, a campaign node's
   sheet and the boss card (both off the map's own read), and the Day board. Six action files
   are thin wrappers (the tour's `/sea` revalidation stays in the web wrapper); `api.sea` now also
   carries the tours, the sheets, the Day board, the arrival read (`seaBoot`) and pacts to the
   chart, the tour cards, the market, the loadout, the sheets and the pact board.
   - THE DAY BOARD TAKES ITS READERS AS INPUTS (`DaySources`): the web hands it each system's
     action, the desktop each system's local API, so the board can never disagree with the sheet
     it opens. The once-a-day full-day credit is a store operation (`creditFullDay`).
   - `seaBoot` offline is composed in the desktop's API from the same readers. PACTS STAY ONLINE:
     they are between players, so offline there is nobody to ask (no pacts, no one's homestead to
     visit); the local API says so rather than failing.
   - `lib/dayList` now reads `DayState` from the core.
   - The sea check covers the tours, the sheets, the boss card and the Day board's once-a-day
     credit (checked to fail when that guard is broken). Production probe as catman (reads, tour
     writes sent behind the stored step, nothing moved). The loadout's achievement points sit
     behind Next's request cache, so a probe outside the app stands in 0 for that one read.
   **THE HARBOUR OFFLINE, 2026-09-29.** `lib/core/harbour`: the tackle shop (bait, rods bought
   and sold back, reels, the Completionist, the rod in hand), the hook bench, the fish hold (its
   upgrade and its contents), the Shipyard's hulls and name, the Angler's Almanac, the Shipyard's
   state and the ship screen's props. Seven action files are thin wrappers (their page
   revalidations stay on the web); `api.harbour` carries them to the tackle shop, both Shipyard
   screens, the ship screen and its sheet, the Almanac and the fishing screen's hold.
   - The tackle shop's `equipRod` is `api.harbour.equipTackleRod` (the Shipyard's is
     `api.ship.equipRod`).
   - THE SHIP SCREEN'S PROPS ARE SHAPED IN THE CORE FROM PIECES (`shipHeroProps`): on the web
     the pieces are the per-request caches the hub page shares with the ship screen
     (`expeditions/hubData`), so the roster is still fetched once; the desktop reads them from its
     stores (`shipHeroPieces`).
   - FIXED ON THE WAY: `buyBait` looked the bait up with `getBait`, which falls back to worms, so a
     made-up bait name was sold at the worm price and stocked under that name. It now needs an
     exact match. Production held no such rows (checked 2026-09-29).
   - The save's lifetime log now keeps each species' first-caught date (optional; older saves have
     none), for the Almanac's dates and NEW marks. No version bump.
   - The practice skirmish (`raids/practice`) is admin-only on the web and stays there.
   - `scripts/check-offline-harbour.mts` (in `npm run check`); checked to fail when a rod guard,
     the sell rate or the trader rule is broken. Production probe as catman (reads and refusals,
     nothing moved).
   **THE REST OFFLINE, 2026-09-29.** Every screen now reaches the game through `api`; no client
   component imports a server action except the admin screens.
   - `lib/core/progress`: Renown (state, allocate, commit, respec and its token), badges
     (reconcile from the store's `badgeSignals`, rewards, the raid feats the client may unlock,
     wearing), the unlock banner's `checkUnlocks`, the setup flag, the welcome gift and the
     member's daily pack. The gift and the pack are now written guarded, then paid in place (they
     used to write a gem total read earlier). Respec had the same stale read and is fixed the same
     way. On the web `api.progress.checkUnlocks` still fetches `/api/unlocks`.
   - `lib/core/homestead`: build, rename, furnish, pin, with the house guarded on the tier it
     was priced against. `lib/core/profile`: the username, the showcase, skins, avatar colours and
     specials, the backdrop, the user search.
   - The Almanac's zone reward, prestige and the Long Vigil's release moved into
     `lib/core/fishing` (`api.fishing`). Prestige is now written guarded on the reward flag, so
     two taps on one completion cannot both count.
   - `lib/data/local/progressLocal` reads the badge signals from the save's own records. Offline
     every well-formed name is free and a search finds nobody.
   - `api.online` holds the calls between players or through a payment provider. On the web
     each one is the server action. The desktop answers each one honestly instead of failing:
     - the leaderboards return an error saying they need the internet;
     - following and visits have nobody to follow or visit;
     - the Exchange is a closed Board;
     - checkout says it is bought on seasthebooty.com;
     - membership and gems are read from the save;
     - the activity ping does nothing;
     - the honeypot says 'Nothing here.' and flags nobody.
   - Web-only, not in `api`: admin and dev tools, the practice skirmish, `bootActions` (the
     desktop composes its boot from the local API) and the dead `shipBonus`. Also left alone are
     seven exported fishing actions with no caller: `settlePendingCatchCredit`, `quickBuyWorms`,
     the three tour flags, `checkLeaderboardPosition` and `syncFishHold`.
   - `scripts/check-offline-progress.mts` (in `npm run check`) covers all of it, including the
     Almanac. Production probe as catman (reads and refusals, nothing moved).
   - CORRECTION: what runs offline is every system's RULES and the whole `api`. The desktop
     WINDOW still shows the spike's small fishing screen (`desktop/src/App.tsx`), not the
     game's screens. Mounting the real screens in the shell is its own stage. They are Next
     pages whose data is loaded on the server, so each one needs its loading moved onto `api`.
   **THE REAL SCREENS IN THE SHELL, STAGE 1: THE SEA CHART (2026-09-30).** The desktop
   window now runs the game's own screens instead of the spike.
   - STAND-INS FOR NEXT (`desktop/src/shims`, swapped in by `vite.config.ts` and
     `tsconfig.json`, so the screens are type-checked against them):
     - `next/navigation` works over the window's own history. `router.refresh()` re-runs
       the screen's loader without remounting, as a refreshed server page does.
     - `next/link`, `next/dynamic` (React.lazy) and `next/image` (a plain img).
     - `@/lib/supabase/client` is a quiet stand-in that answers every query with nothing.
       The Nav, the live profile feed and the presence layer reach for it; offline they
       sit still.
   - THE FRAME (`desktop/src/Shell.tsx`) plays both web layouts: first-run setup and the
     welcome, the Nav, the preloader, the coach, the unlock banner, crew promotion, the
     doubloon guide and AppChrome's watchers. Left out: the Stripe checkouts, the session
     watcher, the honeypot and analytics.
   - SCREENS (`desktop/src/screens.tsx`): a path, a LOADER that builds the page's props
     from the save, and the page's client component. Only `/sea` so far; any other path
     shows "not aboard yet" with the way home.
   - THE SEA PAGE'S PROPS are shaped in `lib/core/seaPage` (`seaMapProps`) from pieces, like
     the ship screen. The web's `/sea` page keeps its one parallel batch of reads (with the
     cached species) and hands them over; the desktop reads the same pieces from the save
     (`seaPageProps` in `localGameApi`).
   - `electron/main.cjs` answers any extensionless path with index.html, so a screen's URL
     survives a reload. Save writes are queued and coalesced: parallel autosaves raced
     through one temp file and lost the rename.
   - Fonts ship as local files (@fontsource: Cinzel, Karla, Pirata One). The web's
     `public/` folder (152 MB of art and sound) is served and packaged as is.
   - PIXI UNDER app:// (`desktop/src/pixiPaths.ts`): Pixi only counted http(s) as a web
     address and resolved '/sea/x.webp' to app://sea/x.webp. Its check now counts app://.
   - `desktop/src/localGameApi` re-exports EVERY type the web's Game API does
     (`export type *`), since the real screens import many more than the spike did.
   - Checked: `npx tsc` in desktop covers the whole chart tree. The dev window and the
     packaged exe both load the chart with no errors, and first-run setup and the welcome
     go through to it.
   **STAGE 2: THE ROOMS (2026-09-30).** Every room a player reaches now opens in the shell:
   - the market and the tavern;
   - the tackle shop, the shipyard, today's orders and the homestead;
   - both gauntlets;
   - the Den: lobby, slots, roulette, blackjack;
   - the Chart Room: lobby, the Hold, the Rigging, Treasure Match, the Minefield, the World
     Chart;
   - the Parlor: lobby, the Board, the Capstan, the Pirate King;
   - badges, the Captain's Log and the profile.

   How they were brought over:
   - THE PATTERN: a web page that did more than hand props over is split. The page keeps
     its reads (and its caches); what it builds from them goes into a shared builder:
     `lib/core/marketPage`, `lobbies` (Chart Room and Parlor), `gauntletPage`, `badgesPage`,
     plus `homePageProps` and `profilePageProps`. Any page markup becomes a view the desktop
     reuses: ChartingFrame, GameFrame, SlotsView, RouletteView, BlackjackView,
     CaptainsLogView, TackleShopView, BadgesView. The tackle shop's page is one core
     function (`tackleShopProps`) that both builds run on their own store.
   - BADGES: the ~600-line goal computation moved verbatim into `lib/core/badgesPage`, fed
     from the store's `badgeSignals` (the same reads the page made). Its two self-healing
     writes are store operations. Global rarity is about other captains, so the web reads
     it and offline it is empty. `check-badge-goals` and `BADGES.md` point at the new file.
   - SPLIT FOR THE CLIENT: `MOOD_CONFIG` moved to `lib/marketMood`, and blackjack's fish art
     to `lib/blackjackFishArtPool`. Both had been pulling a server read into a client
     component.
   - The tavern composes its parts in the shell (`desktop/src/rooms/Tavern.tsx`). The
     leaderboard ticker, contests and the support card retire on Steam; the crew digest
     waits for Steam friends. `SaltRoadDigestView` is split from its server read.
   - ONLINE-ONLY rooms say so plainly (`rooms/OnlineOnly.tsx`): the leaderboards, contests,
     your crew and other captains' pages. Retired routes redirect as on the web.
   - Captain-only rooms (the Rigging, the Capstan) redirect a non-Captain exactly as on the
     web.
   - Checked: every room opened in the real window with no errors, and the gauntlets were
     also opened on an unlocked copy of the save.
   - NO LEADERBOARDS ON STEAM, AT ALL (Kong, 2026-09-30): `web/lib/platform` `IS_DESKTOP` (set
     only by the desktop's Vite config) hides every way in. That covers the Nav tab, the phone
     tab bar, the profile's link, the gauntlets' Records mooring and the Exchange's Ranks.
     `/leaderboard` and `/tavern/contests` redirect to the chart. On the web the flag is always
     false. Use it only for what Steam decisively does not have; the rules never branch on it.
   - RAID FIGHT PAGES ARE NOT NEEDED (Kong): all 19 campaign fights open inline on the chart
     (checked against `lib/raidRegistry`), so `/raids/krust` and the rest are dead fallbacks.
     The desktop has none; the web still carries them, harmlessly.
   - THE STARTER SAVE IS A FRESH WEB ACCOUNT (2026-09-30). `content/profile_defaults.json` is
     the `profiles` row at its column defaults, all 312 columns, parsed from the schema
     snapshot by `lib/profileDefaults`. It gets the set_default_username name and the sign-up
     trigger's 25 worms, and no rods beyond the Bamboo. One Steam difference: the captain
     starts as a Captain (the purchase is the membership).
     - WHEN `profiles` CHANGES: re-run `scripts/snapshot-schema.mts`, then
       `scripts/export-profile-defaults.mts`. `check-profile-defaults` (in `npm run check`)
       fails until the file matches the snapshot.
   - THE NAV READS THE SAVE OFFLINE. Its per-screen read (the avatar's look, the purse,
     badges waiting to be claimed, voyages out) moved into `lib/navState`. The web keeps the
     browser-client read, with no server round trip per click. The desktop swaps the module
     for `desktop/src/shims/navState.ts`, like the database client. Checked: selling in the
     market moved the Nav's purse at once. The starter save is still the spike's (Lv 5,
     500 doubloons) and should match a fresh web account (and on Steam, be a Captain).
   **THE STEAMWORKS LAYER, 2026-09-29.** `steamworks.js` 0.4.0 in the desktop shell.
   - `desktop/electron/steam.cjs` (main process): starts Steam, relaunches a packaged build
     through Steam if it was opened outside it, switches on the overlay, and answers three
     calls from the page (`window.stbSteam`): status, unlock, presence. With no App ID or no
     Steam running, every call does nothing and the game plays the same.
   - THE APP ID is `steamAppId` in `desktop/package.json`, null until the store page exists.
     `STB_STEAM_APPID=480` runs against Valve's public test app (Spacewar) for a quick check.
     That proves the bridge and the overlay, but 480's achievements are Valve's, and Steam will
     show you as playing Spacewar while it runs.
   - ACHIEVEMENTS: the Steam API name IS the badge id, so there is no mapping table. Every save
     write sends any badge in `unlocked_badges` that Steam has not been told about
     (`desktop/src/steam.ts`). The first write after opening sends them all, so an imported web
     save or badges earned while Steam was closed catch up on their own.
   - RICH PRESENCE: in port, fishing (with the zone), on a raid, running the gauntlet, at the
     tables in the Den. The text is `desktop/steam/rich_presence.vdf`.
   - OVERLAY COST: turning on the overlay makes Electron draw the GPU in-process and repaint
     every frame. That only happens when Steam is actually running. Watch frame rate there.
   - THE SAVE FOLDER IS PINNED in `electron/main.cjs` to `%APPDATA%\seas-the-booty-desktop`
     (the name the dev and packaged builds already used), so renaming the package cannot move
     every player's save.
   **Partner-site setup, once there is an App ID** (no code, all on partner.steamgames.com):
   1. Put the App ID in `desktop/package.json` `steamAppId`.
   2. Achievements: `npx tsx scripts/steam-achievements.mts` (in `web/`) writes
      `desktop/steam/achievements.csv` (243 rows: API name, name, description) and
      `desktop/steam/achievement-icons/` (earned and greyed JPGs, git-ignored, 256px; change
      `ICON` there if the partner page asks for another size). Steamworks has no bulk upload,
      so these are entered by hand. Decide which story badges should be HIDDEN (spoilers); the
      list does not guess.
   3. Rich presence: upload `desktop/steam/rich_presence.vdf` as the English localization.
   4. Steam Cloud, Auto-Cloud: quota about 100 MB, 50 files (a new save is about 13 KB; raise
      the file count if players keep more captains). Root `WinAppDataRoaming`, subdirectory
      `seas-the-booty-desktop/captains`, pattern `*.json`, not recursive. Add the same for
      `MacAppSupport` and `LinuxXdgConfigHome` if those builds ship. Never include `*.tmp`
      or `retired/` (retired captains stay on the machine).
   - NOT YET: Steam Input (controller) and the Deck, and the real screens in the shell.
8. **Restock through play** (drafted above), when Kong is ready to make that design call.

**Then the spike** (phase 3's week, updated):
- Electron (Tauri tried and dropped, see stage 3) plus a JSON save and a Vite front end over `web/`.
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
