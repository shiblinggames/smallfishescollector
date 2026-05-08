# Seas the Booty — Technical Overview

A guide to how everything in the game works — both for understanding the architecture and for onboarding new developers.

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Database & Data Model](#2-database--data-model)
3. [Authentication & User Flow](#3-authentication--user-flow)
4. [Fishing Game](#4-fishing-game)
5. [Gear System](#5-gear-system)
6. [Daily Challenges & Events](#6-daily-challenges--events)
7. [Fish Hold & Market](#7-fish-hold--market)
8. [Expedition & Combat](#8-expedition--combat)
9. [Raids](#9-raids)
10. [Tavern Minigames](#10-tavern-minigames)
11. [Card Collection & Packs](#11-card-collection--packs)
12. [Marketplace](#12-marketplace)
13. [Social & Challenges](#13-social--challenges)
14. [XP & Leveling](#14-xp--leveling)
15. [Economy Overview](#15-economy-overview)
16. [Page Structure](#16-page-structure)
17. [How the Systems Connect](#17-how-the-systems-connect)

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) with React 19 |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS 4 + inline styles |
| Animations | Framer Motion 12 |
| 3D / Models | Three.js + React Three Fiber |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email + password) |
| Hosting | Vercel (auto-deploy on push to master) |
| AI content | Anthropic API (Claude) for expedition narratives |
| Payments | Shopify webhooks (premium subscriptions) |

### How it fits together

The app is a **Next.js App Router** project. This means each page in `app/` is either a **Server Component** (runs on the server, can query the DB directly) or a **Client Component** (runs in the browser, handles interactivity). Pages that need real-time UI — like the fishing game — are Client Components. Heavy data fetching happens in Server Components or **Server Actions** (functions marked `'use server'` that the client can call like an RPC).

**Supabase** is the database + auth layer. It's accessed two ways:
- **Normal client** — respects Row Level Security (RLS), so users can only read/write their own data. Used in Server Components for safe reads.
- **Admin client** — bypasses RLS using a service role key. Used only inside Server Actions where the game logic needs to trust the server, not the user.

**Vercel** handles deployment. Push to `master` → production is live within ~2 minutes. No manual deploy step.

---

## 2. Database & Data Model

All data lives in Supabase (PostgreSQL). Row Level Security (RLS) is enabled on every table so users can only touch their own rows — even if they craft custom API calls.

### How to think about the schema

The DB is organized around a central `profiles` table (one row per player), with satellite tables hanging off it. Most game state (gear tiers, doubloons, flags) lives directly on `profiles` for fast single-row reads. Anything that grows unboundedly (inventory, collection, history) gets its own table.

**`profiles` discipline rule:** The wide table is an intentional performance tradeoff — nearly every page load needs fishing XP, gear tiers, and cosmetics simultaneously, so a single row fetch beats multiple joins at this scale. The risk is that every new feature is tempted to bolt another column onto `profiles`. The rule: **if a new feature needs more than 2 new fields, it gets a satellite table.** Raid-specific flags like `has_seen_raid_tutorial` are acknowledged code smells — the natural trigger to extract them is when a second raid ships and they'd otherwise multiply. The discipline only works if future contributors know the rule exists, which is why it's written here.

### Core user data

**`profiles`** — one row per player, the central record.

Key fields:
- Identity: `username`, `avatar_url`
- Currencies: `doubloons`, `gems`
- Fishing progression: `fishing_xp`, `character_color`, `ring_skin`, `unlocked_ring_skins text[]`
- Gear tiers: `ship_tier`, `rod_tier`, `hook_tier`, `reel_tier`, `line_tier`
- Special items: `has_tide_turner`, `has_phantom_hook`, `has_auto_caster`, `equipped_special text`
- Expedition: `expedition_xp`, `saved_crew jsonb`
- Raids: `raid_items text[]`, `equipped_raid_items text[]`, `has_seen_raid_tutorial`, `has_completed_practice_raid`
- Prestige: `prestige_levels jsonb` — e.g. `{ "shallows": 2, "abyss": 1 }`
- Misc: `packs_available`, `highest_perfect_streak`, `is_premium`

### Fishing

**`fish_species`** — the game-wide catalog of every fish. Fields: `name`, `scientific_name`, `habitat` (shallows / open_waters / deep / abyss / ancient_deep), `bite_rarity`, `catch_difficulty`, `sell_value`, `fun_fact`.

**`fish_inventory`** — the player's current hold. One row per species per player (`user_id`, `fish_id`, `quantity`). Capped by ship hold capacity — the server enforces this on every catch.

**`fish_collection`** — which species a player has *ever* caught (no quantity, just presence). Used for the Collection screen and to automatically derive line tier. Separate from inventory because inventory empties when you sell, but the collection is permanent.

**`fish_market`** — hourly price multipliers per species (`fish_id`, `multiplier` 1.0–2.5×). Updated by a cron or admin action.

**`bait_inventory`** — consumable bait counts (`user_id`, `bait_type`, `quantity`).

**`rod_inventory`** — which rod tiers the player owns. Separate from profiles because players can own multiple rods and switch between them.

### Daily systems

**`daily_challenge_progress`** — one row per (user, date). Tracks progress on the 3 daily challenges and whether each reward has been claimed. The challenges themselves are derived from the date (no separate table) — see section 6.

**`daily_fish_attempts`** — Fish of the Day puzzle attempts per user per date.

**`daily_bonus_claims`** — tracks whether a player has taken their daily free worms/doubloons/gems today.

### Voyages

**`daily_voyages`** — active voyage runs. Each row = one player mid-voyage (`user_id`, `route`, `status`, `crew_loadout`, `score`, `result_data`). Status: `pending` (at sea) or `revealed` (returned).

### Cards & packs

**`cards`** — base card definitions (`name`, `slug`, `tier`, plus crew stats `power`, `dodge`, `fortune`). Stats live here, not on variants.

**`card_variants`** — variants of each card (Standard, Gold, Holographic, Ghost, Shadow, Prismatic, Kraken, Mythic). Each has `drop_weight` (pull rarity).

**`user_collection`** — cards a player owns. One row per card *instance* — duplicates get multiple rows. This lets players sell extras individually.

**`pack_history`** — log of every pack opened.

### Expeditions

**`daily_expeditions`** — one AI-generated narrative per zone per day. All players on the same day see the same story.

**`expeditions`** — a player's active or completed run (`zone`, `status`, `current_node`, `crew_loadout`, `combat_state`, `loot`, `hull_damage`).

### Social

**`fishing_challenges`** — head-to-head challenge records between two players.

**`challenge_sessions`** — the active fishing session during a challenge (tracks score as casts happen).

**`crew`** — follow/following relationships between players.

**`weekly_leaderboard`** — cached weekly stats by player. Updated after each fishing session.

### Audit logs

**`doubloon_transactions`** and **`gem_transactions`** — every credit and debit with a `reason` string. Essential for debugging economy issues and detecting exploits.

---

## 3. Authentication & User Flow

Players sign up with email and password via Supabase Auth. On signup, a database trigger (`handle_new_user()`) fires automatically and creates a `profiles` row with default values: 0 doubloons, 0 gems, 0 fishing XP, 1 starter pack.

**Why a DB trigger?** Because client-side signup is fast and can be interrupted. A trigger runs inside the database transaction — if the user row gets created, the profile row *always* gets created too. No orphaned auth accounts without profiles.

Login produces a Supabase JWT stored in a cookie. Next.js middleware (`middleware.ts`) verifies this JWT before rendering any protected page. No valid session → redirect to `/login`.

**Premium status** is controlled by `profiles.is_premium`, updated by a Shopify webhook when a player purchases a subscription. Premium players pay 0% market fee on fish sales (free players pay 3%).

---

## 4. Fishing Game

The fishing game (`/fishing`) is the core loop. Everything else in the economy feeds from or into it.

### Zone selection

Before fishing, players pick a zone. Zones are unlocked by fishing level:

| Zone | Min Level | Catch Difficulty | XP Multiplier | Notes |
|---|---|---|---|---|
| Shallows | 1 | Easy | 0.4× | Starter zone |
| Open Waters | 15 | Moderate | 1.1× | First unlock |
| Deep | 30 | Hard | 1.25× | |
| Abyss | 50 | Very Hard | 1.5× | Random needle reversals |
| Ancient Deep | 75 | Boss mechanic | 2.0× | 3-stage bosses, no hold/sell |

The last visited zone is saved to `localStorage` so players return to their zone on reload.

### Casting

When the player taps Cast, a **Server Action** (`castLine` in `actions.ts`) runs. This is important: the actual fish selection happens on the server so it can't be cheated. Steps:

1. Verifies bait is in inventory and deducts one unit (unless a Bioluminescent Bloom event is active).
2. 3% chance per cast (all zones except Ancient Deep) of a **crate encounter** instead of a fish — returns `fishId: -1`.
3. Otherwise, selects the fish in two stages:
   - Roll a rarity tier (common / uncommon / rare / epic / legendary) using zone-specific weights.
   - Pick uniformly from all fish in that tier matching the zone's habitat.
4. Computes the bite wait time.
5. Returns fish data (kept hidden client-side until reel-in).

**Zone rarity weights (example — Shallows):** 55% common, 25% uncommon, 12% rare, 7% epic, 1% legendary. Deeper zones shift toward higher rarities.

### The catch dial

Once a fish bites, the dial appears. It's an SVG arc with a spinning needle:

- A needle spins at a speed determined by fish difficulty and reel tier.
- The arc has coloured zones:
  - **Green** = catch zone
  - **Gold strip** at each edge of green = perfect zone (4°)
  - **Red** = snag zones (lose bait; snag-immune rods only lose the fish)
- Catch zone width: `hook_tier × 3° + bait.catchZoneBonus + level_bonus + event_bonus`
- Line tier shrinks the red snag zones
- Reel tier slows the needle

The SVG constants: `CX = CY = 110`, `OUTER_R = 96`, `INNER_R = 66`, viewBox `0 0 220 220`.

### Catch outcomes

| Outcome | Effect |
|---|---|
| Perfect | Fish caught, 50% bait save chance (+25% with Phantom Hook), +20% XP, streak +1 |
| Catch | Fish caught, bait consumed |
| Miss | Fish lost, bait consumed, streak reset |
| Snag | Fish + bait lost (snag-immune: fish saved), streak reset |

The **`reelIn` Server Action** handles all outcomes in one DB call: adds fish to inventory, updates fish collection if new species, awards XP, updates highest streak, and advances daily challenge progress.

### On-fire streak

Consecutive perfect catches increment `perfectStreak`. At 2+, the dial visually catches fire: 24 bezier flame tongues with radial gradients, animated glow rings, and an orange outer ring stroke. Any non-perfect catch resets it to 0. The personal best is saved to `profiles.highest_perfect_streak`.

### Crate encounters

3% chance per cast (except Ancient Deep). Instead of a fish, a sunken crate surfaces:

1. **Closed** — tap to open
2. **Rolling** — shaking crate + horizontal slot ticker showing possible loot
3. **Revealed** — claim button

Loot pool: doubloons (75 / 150 / 250 / 350 / 500) and bait bundles (worms, night crawlers, minnow, chum, angler's formula).

### Special items

Equipped via the Special slot in GearScreen. One item active at a time:

| ID | Name | Effect | Acquire |
|---|---|---|---|
| `tide_turner` | Tide Turner | 3 dial-skip charges/day without breaking streak | The Howling Deep voyage |
| `phantom_hook` | Phantom Hook | +25% bait save on every cast | The Bertuna Triangle voyage |
| `auto_caster` | Auto Caster | Auto-casts 1.5s after each result | Shop — 5,000 ⟡ |

### Ring skins (cosmetic dial skins)

Equipped via the Cosmetic slot. Each skin has a `stroke` color that tints the dial interior subtly. Hidden during fire streaks. Most unlock via voyages.

Current skins: Standard, Gilded Compass, Whale Bone, Coral Spire, Abyssal Sigil, Navigator's Silver.

### Character color system

Players choose a character skin color on their profile page. It's reflected in the fishing game sprite. The sprite sheet for each color lives in `web/public/` as 3 frames: `fishing_{color}_rest.png`, `fishing_{color}_wait.png`, `fishing_{color}_cast.png`.

Free colors: Green (default), Gray, Blue, Pink. Premium/earned colors: Sand, Sky, Golden, Forest, Mint, Autumn, Ruby.

New sprites are added via `web/normalize-fishing-sprites.mjs`: run `node normalize-fishing-sprites.mjs {colorname}` from `web/` to slice a source sprite sheet into the 3 frame files. The color registry lives in `lib/characters.ts`.

### Prestige system

When a player catches all fish in a zone and claims the completion reward, a **Prestige** button appears. Prestiging resets that zone's fish collection (so they can re-earn the completion reward) and increments `profiles.prestige_levels` for that zone.

Each total prestige point adds **+5% to quick-sell payouts** across all fish. Prestige levels stack across zones: Shallows II + Abyss I = +15% sell bonus everywhere.

A Roman numeral badge (Prestige I, II, etc.) appears next to the zone name in the zone header.

### Random events

Every 15–20 minutes during a session, one of four events can fire, lasting 90 seconds:

| Event | Effect |
|---|---|
| Bioluminescent Bloom | Bait not consumed this cycle (teal) |
| Full Moon Rising | Quick-sell pays 100% instead of 65% (white) |
| Red Tide | +0.25 rarity bias (rare fish more likely) (red) |
| Glassy Waters | +12° to catch zone (purple) |

Events are client-scheduled (no DB). An announcement banner fires on start; a persistent indicator shows the event name and tagline for the full duration.

---

## 5. Gear System

All gear is in `web/lib/` as typed registries. This pattern — static data as typed arrays — means gear stats are versioned in code (not the DB), making them easy to tune and reason about.

### Rods (16 tiers, 0–15)

Rods have the most mechanical depth. Key properties:

| Property | Effect |
|---|---|
| `catchZoneBonus` | Extra degrees on the green catch zone |
| `rarityBonus` | Shifts fish rarity rolls toward rares (0–0.50) |
| `biteIntervalMs` | Time between bite opportunities (lower = faster bites) |
| `doubleCatchChance` | Chance to catch 2 fish at once |
| `retryOnMissChance` | Chance to get a second attempt on a miss |
| `snagImmune` | Snag zones act as miss (no extra bait loss) |
| `perfectZoneBonus` | Extra degrees on the gold perfect strip |
| `jackpotChance` / `jackpotMultiplier` | Chance to land X fish at once (YOLO Rod: 10% → 100 fish) |

Rod costs range from free (Bamboo, tier 0) to 200,000 ⟡ (Legendary, YOLO). The **Completionist Rod** (tier 14) is earned — requires fishing level 100 + all species caught.

### Hooks (9 tiers, 0–8)

Add +3° to the catch zone per tier. Linear and simple — tier 8 = +24°.

### Reels (9 tiers, 0–8)

`needleSpeedMultiplier` drops from 1.0 (tier 0) to ~0.40 (tier 8). Slower needle = easier to land in the catch zone.

### Lines (6 tiers, 0–5)

Shrink the red snag zones via `penaltyMultiplier`. Lines **auto-unlock** based on unique species count — no purchase needed. This rewards variety over grinding the same zone.

| Tier | Name | Penalty Mult | Unlocks At |
|---|---|---|---|
| 0 | Monofilament | 1.00× | 0 species |
| 1 | Braided Line | 0.82× | 20 species |
| 2 | Copolymer | 0.67× | 40 species |
| 3 | Fluorocarbon | 0.54× | 60 species |
| 4 | Titanium Wire | 0.42× | 80 species |
| 5 | Deep Sea Line | 0.30× | 100 species |

### Ships (7 tiers, 0–6)

Ships expand fish hold capacity. Bigger hold = less frequent sell trips.

| Tier | Ship | Hold Capacity | Cost |
|---|---|---|---|
| 0 | Rowboat | 15 | Free |
| 1 | Dinghy | 25 | 500 ⟡ |
| 2 | Sloop | 40 | 1,500 ⟡ |
| 3 | Schooner | 70 | 5,000 ⟡ |
| 4 | Brigantine | 120 | 22,000 ⟡ |
| 5 | Galleon | 180 | 80,000 ⟡ |
| 6 | Man-o-War | 250 | 200,000 ⟡ |

Ships are also used in expeditions and voyages with separate combat stats (`EXPEDITION_SHIP_STATS` in `lib/expeditions.ts`).

### Bait (7 types)

| Type | Wait Mult | Zone Bonus | Cost/10 | Source |
|---|---|---|---|---|
| Worms | 1.00× | +0° | 10 ⟡ | Shop, daily |
| Minnow | 0.90× | +0° | 30 ⟡ | Shop |
| Night Crawler | 0.85× | +4° | 50 ⟡ | Shop |
| Chum | 0.75× | +0° | 100 ⟡ | Shop |
| Angler's Formula | 0.65× | +8° | 180 ⟡ | Shop |
| Luminous Lure | 0.60× | +10° | — | Expeditions, bounties |
| Golden Lure | 0.55× | +10° | — | Rare earned drops |

`waitMult` multiplies the bite wait time. A 0.65× mult means fish bite 35% faster. Luminous and Golden are earned-only and shown as display items in the shop.

---

## 6. Daily Challenges & Events

### Daily challenges

Every day, all players share the same 3 challenges (Easy / Medium / Hard). They're generated **deterministically from the date** using a hash function — there's no DB table storing what the challenges are, just each player's progress against them.

**Why deterministic generation?** It means no admin work to create challenges, they never go stale, and all players compete on the same tasks without requiring a shared seed table.

Challenge types: catch any fish, catch in a specific zone, land perfects, catch a specific rarity, earn doubloon value from catches.

Progress is tracked in `daily_challenge_progress` and updated on every `reelIn`. Rewards: ~150 / 350 / 700 ⟡ for Easy / Medium / Hard, plus gems. Reset at midnight UTC.

### Random fishing events

See section 4. Client-only, no DB involvement.

---

## 7. Fish Hold & Market

### Fish Hold

Every caught fish goes into `fish_inventory`. The server enforces the hold cap (ship's `holdCapacity`) on every `reelIn` — if the hold is full, the catch is rejected. The client shows a warning and disables casting when full.

### Selling options

**Quick Sell** — in the fishing game's sell drawer. Pays 65% of base `sell_value` (100% during Full Moon event). Fast but lossy. Prestige bonuses stack on top.

**Fish Market** (`/tavern/market`) — live hourly multipliers per species (1.0–2.5×).

Sell price formula: `base_value × multiplier × prestige_bonus × (premium ? 0.90 : 0.9 × 0.97)`

The 10% market fee applies to all players; the 3% free-user fee stacks on top. Timing high-multiplier windows is part of the meta.

---

## 8. Expedition & Combat

Expeditions are multi-node runs through one of four naval combat zones. They're separate from fishing and use the card collection for crew.

### Zones

| Zone | Ship Tier Required | Entry Cost | Base Reward |
|---|---|---|---|
| Coral Run | 0 | 25 ⟡ | 80 ⟡ |
| Bertuna Triangle | 2 | 75 ⟡ | 200 ⟡ |
| Sunken Reach | 4 | 200 ⟡ | 500 ⟡ |
| Davy Jones' Locker | 6 | 500 ⟡ | 1,200 ⟡ |

### Daily narrative

Each zone gets a new AI-generated event sequence daily via the Anthropic API, stored in `daily_expeditions`. All players on the same day see the same narrative. The randomness is in crew composition and choices — not the map.

### Crew & ships

Before entering, the player picks 1–5 crew cards and assigns a captain (slot 0). Stats: Power (damage), Dodge (defense), Fortune (crit chance). The captain counts at 1.0×, other crew at 0.8×. Ship tier determines durability, armor, and crew slots.

Cards have stats on the `cards` table (not `card_variants`). Variant boosts are applied in `applyVariantBoosts()` in `lib/expeditions.ts`.

### Combat loop (turn-based)

Each round:
1. Player chooses: **Reload** (+1 charge, max 3), **Fire** (spend charges; damage scales ×1/×2.5/×5), or **Defend** (dodge chance + halved damage).
2. Enemy acts based on a fixed pattern.
3. Damage formula: `random(minDamage, maxDamage) − armor`. Dodge: `dodge_stat × 5%`. Crit: `fortune_stat × 4%`.
4. Hull / enemy HP updated. Hull 0 = run failed. Enemy HP 0 = node cleared.

### Node structure (5 per zone)

Fight → Event → Fight → Shop → Boss

**Event types:** Calm Waters (+8 dur), Sudden Squall (−6 dur), Abandoned Wreck (+20 ⟡), Stockpiled Powder (+2 PWR buff), Floating Timber (+10 dur).

**Shop items:** Hull Repair, Fine-Ground Powder, Iron Plating.

### Voyages (Daily Voyages)

Voyages are a lighter version of expeditions — send your crew out on a route without active combat. The result is revealed later.

| Route | Display Name | Risk | Payout | Base Reward |
|---|---|---|---|---|
| `coastal` | The Inner Sea | None | 70% | 50 ⟡ |
| `open` | The Crossing | Full crew loss risk | 100% | 120 ⟡ |
| `deep` | The Howling Deep | 1.6× crew loss risk | 150% | 200 ⟡ |

Voyages live in `daily_voyages`. The recommended crew score per route: 20 / 45 / 75. Score formula: `power + dodge + round(fortune × 0.5)`.

### Navigation level

Expedition XP is tracked in `profiles.expedition_xp`. It levels up the **Navigation Level** (separate from Fishing Level), which unlocks expedition-specific cosmetics and titles. Displayed on the profile page and public profile.

---

## 9. Raids

Raids are a combat variant with a fixed enemy sequence and a boss loot table. Two raids currently exist:

- **Reef Skirmish** (`/raids/practice`) — tutorial raid, teaches the broadside mechanic. Unlocks the full raid.
- **Corsair's Reckoning** (`/raids`) — the live raid. Fight through 6 enemies then face Barnacle Pete.

### Architecture (BossRaidConfig pattern)

All raids share one engine: `app/raids/RaidGame.tsx`. A raid is just a config object (`BossRaidConfig` in `lib/bossRaids.ts`) — enemies, sequence, boss, loot table, kill rewards. To add a new raid: add a config, create a new route, pass the config to `<RaidGame />`.

### Corsair's Reckoning enemy sequence

`brute → brute → sniper → sniper → corsair → corsair → (Pete boss)` — repeats after Pete. Each kill shows a two-phase collect overlay (summary → claimed).

### Barnacle Pete loot table

Single roll revealed with a spin animation:
- +300 ⟡ (48.5%), +600 ⟡ (24.3%), 25 Gems (14.6%), 1 Pack (4.9%), Corsair Black ship skin (4.9%), Corsair Cannon raid item (2.9%)

### Kill rewards (Corsair's Reckoning)

| Enemy | Doubloons | XP |
|---|---|---|
| Reef Raider | 20 | 20 |
| Crow's Nest Marksman | 25 | 30 |
| Saltwater Corsair | 35 | 45 |
| Barnacle Pete | 180 | 180 |

Full clear = 350 ⟡ from kills + 300–900 ⟡ crate loot + up to 370 XP.

### Raid items

Equippable items that affect raid combat. Registry in `lib/raidItems.ts`. Stored in `profiles.raid_items[]` and `profiles.equipped_raid_items[]` (max 3 active). Current effect type: `boss_damage_mult`. Effects stack multiplicatively on boss rounds.

---

## 10. Tavern Minigames

All minigames live under `/tavern`. They use doubloons (minigames) or gems (puzzle games).

### Crown & Anchor

Classic dice game. Roll 3 dice showing 6 symbols. Bet on a symbol; win if it appears on 2+ dice. Payout: 1× bet per matching die. Daily wager cap: 5,000 ⟡.

### Fish Slots

3-reel slot machine with fish-themed symbols. Match 2 or 3 symbols for multiplier payouts. Jackpot on Catfish. Daily wager cap: 5,000 ⟡.

### Dead Man's Draw

Risk escalation card game. Draw cards to accumulate value, but stop to bank before you bust. Payout multiplier grows with each draw.

### Fish of the Day

Wordle-style daily fish puzzle. One fish per day, shared by all players. Up to 4 guesses; each wrong guess reveals a new clue (habitat, size, diet, group). Rewards: 100 gems (1st try) down to 25 gems (4th try). Streak bonuses at 3, 7, and 30 consecutive days.

### The Charting

A daily navigation grid puzzle. Chart a path from sea to shore by guessing grid coordinates — move up, left, or right. Every guess costs one move. Shared daily puzzle for all players.

### Daily Quiz

A daily fish knowledge quiz. Question + multiple choice, one attempt per day.

### Bounties

Weekly bounties tied to the card pack system. Complete fishing objectives to earn pack rewards. Defined in `app/packs/bountyActions.ts`.

### Daily Bonus

One free claim per day from the Tavern. Awards a small bundle of worms, gems, and doubloons. Resets at midnight UTC.

---

## 11. Card Collection & Packs

### Cards

Cards are the collectible layer. Each `cards` row has a `tier` (1–3) and crew stats (`power`, `dodge`, `fortune`). The `card_variants` table gives each card multiple rarity variants:

- **Standard variants:** Standard, Gold, Holographic, Ghost, Shadow, Prismatic, Kraken
- **Mythic variants:** Tier 3 only — dramatically higher stats

`drop_weight` on each variant governs pull chance.

### Opening packs

Packs cost 100 gems (or 900 for 10). Each pack reveals 5 cards:

1. Draws are weighted by `drop_weight` across all variants.
2. Distribution: ~70% common, ~20% rare, ~7% epic, ~2.5% legendary, ~0.5% mythic.
3. **Pity system:** No legendary in 20 packs → next pack forces one. Prevents extended bad luck.
4. **God Pack:** 0.1% chance — all 5 cards are Mythic.

### Duplicates

Extra copies sit in `user_collection` as additional rows. Players sell them for gems from the Collection page: Rare = 5, Epic = 10, Legendary = 25, Mythic = 50.

---

## 12. Marketplace

The main shop hub (`/marketplace`).

**Tackle Shop** — rods (0–10 purchasable, tiers 11–15 are specialty/earned), reels, hooks, bait bundles.

**Shipyard** — ships tier 1–6 (tier 0 Rowboat is free).

**Packs** — spend gems on card packs.

**Redeem** — enter promo codes for free packs. Also accessible at `/redeem`.

---

## 13. Social & Challenges

### Crew (follow system)

Players follow each other — their "crew" is who they follow. The social page shows crew members ranked by XP and lists active challenges.

### Fishing Challenges

Head-to-head competition:

1. Player A challenges Player B: picks type (most fish / most doubloons / most perfects), duration (1h / 6h / 24h), optional wager.
2. Player B accepts or declines (wager deducted from both on accept).
3. Both fish independently. Scores accumulate in `challenge_sessions`.
4. At end, scores compared. Winner takes both wagers.

Status flow: `pending` → `accepted` → `active` → `complete`.

### Leaderboard

Weekly rankings at `/leaderboard`. Tracks fish caught, doubloons earned, and perfect catches for the current UTC week. Cached in `weekly_leaderboard`, updated after each fishing session.

---

## 14. XP & Leveling

### Two level tracks

The game has two separate XP + level systems:

**Fishing Level** — earned from catching fish. Controls zone unlocks, catch zone bonuses, and cosmetics. Caps visible at 100 but XP continues to accumulate for prestige.

**Navigation Level** — earned from expeditions and raids. Controls expedition-specific titles and cosmetics. Displayed on profile separately.

### Fishing XP formula

```
XP = BASE_XP[difficulty] × ZONE_MULT × PERFECT_BONUS × STREAK_BONUS
```

- `BASE_XP` by difficulty: 15 / 30 / 55 / 90 / 140
- `ZONE_MULT`: 0.4× / 1.1× / 1.25× / 1.5× / 2.0×
- `PERFECT_BONUS`: 1.2×
- `STREAK_BONUS`: +0.05× per consecutive perfect (up to +0.25×)

Level curve formula: `gap(level) = 60 × 1.086^(level−1)`. Level 100 requires ~15 million total XP.

### Fishing level benefits

- +0.2° wider catch zone per level
- −0.25% bite wait time per level
- Zone unlocks at levels 15, 30, 50, 75
- Ring skin unlocks at certain milestones

### Prestige sell bonus

Each total prestige point (summed across all zones) adds +5% to quick-sell payouts:
`sell_value × 0.65 × (1 + totalPrestige × 0.05)`

---

## 15. Economy Overview

Two currencies: **Doubloons ⟡** (primary, earned everywhere) and **Gems** (secondary, earned through engagement).

### Doubloon sources
- Selling fish (main source — scales with gear, zone, and market timing)
- Daily challenges
- Expedition node rewards and zone completion
- Voyage rewards
- Raid kill rewards and loot
- Tavern minigames (net positive if lucky)
- Challenge wager winnings
- Zone first-clear bonuses

### Doubloon sinks
- Gear upgrades (rods: 1,500–200,000 ⟡; ships: 500–200,000 ⟡)
- Bait consumables
- Expedition entry fees
- Challenge wagers
- Tavern minigame wagering

### Gem sources
- Daily challenges
- Fish of the Day puzzle (25–100/day)
- Daily Quiz
- Selling duplicate cards
- Raid loot (Pete's crate)
- Rank milestones

### Gem sinks
- Card packs (100 gems each, 900 for 10)

**Design intent:** Engaged daily players always have enough doubloons to keep improving gear. Gems require deliberate engagement (puzzles, challenges) to accumulate pack-opening speed. Prestige creates an endgame loop for maxed players.

---

## 16. Page Structure

```
/                           Home / splash
/login                      Sign in
/register                   Create account

/fishing                    Main fishing game (zone select → casting → results)

/tavern                     Minigame hub
/tavern/market              Fish market (sell at hourly prices)
/tavern/crown-and-anchor    Crown & Anchor dice game
/tavern/slots               Fish Slots
/tavern/dead-mans-draw      Dead Man's Draw card game
/tavern/fish-of-the-day     Fish of the Day puzzle
/tavern/daily-quiz          Daily fish knowledge quiz
/tavern/daily-bonus         Daily free bonus claim
/tavern/bounties            Weekly pack bounties

/charting                   The Charting daily grid puzzle

/expeditions                Expedition zone select + crew roster
/expeditions/prepare        Crew loadout + item select
/expeditions/voyage         Active expedition (nodes, combat, events)
/expeditions/results        Post-voyage summary

/raids                      Corsair's Reckoning (boss raid)
/raids/practice             Reef Skirmish (tutorial raid)

/packs                      Open card packs
/collection                 Fish collection + card collection + duplicate selling

/social                     Crew list, active challenges, create challenges
/leaderboard                Weekly fishing rankings

/marketplace                Shop hub
/marketplace/tackle-shop    Gear and bait
/marketplace/shipyard       Ships
/marketplace/redeem         Promo code redemption
/redeem                     Standalone promo code page

/u/[username]               Public player profile
/profile                    Personal profile (edit username, view stats, pick character color)
/achievements               Achievement list

/contact                    Contact form
/privacy                    Privacy policy
/terms                      Terms of service
/admin                      Admin panel (staff only)
/claim                      Token-based pack claim (for marketing links)
/demo                       Feature demo / preview
/fishing-test               Dev tool for tuning character/rod/hook/bait overlay positions
```

---

## 17. How the Systems Connect

```
FISHING (core loop)
    │
    ├─ Catch fish ──────────── XP ──────────── Fishing Level
    │       │                                    │
    │   Fish Hold ─── Sell ─── Doubloons         │
    │       │                      │          Zone unlocks (15/30/50/75)
    │       │                      │          Wider catch zone
    │       │               Gear upgrades     Faster bites
    │       │               Bait purchases
    │       │               Ship upgrades (bigger hold)
    │       │
    │   Prestige ─────────────── +5% sell bonus per prestige point
    │
    ├─ New species ─── Fish Collection ─── Line tier (auto-unlocks)
    │                        │
    │                  Completionist Rod (all species + lv.100)
    │
    ├─ Perfect catches ─── Streak ─── Leaderboard
    │
    ├─ Daily Challenges ─── Gems + Doubloons
    │                           │
    │                      Card Packs ──────── Cards
    │                                            │
    └─ Crate encounters ─── Doubloons + Bait    │
                                                 │
EXPEDITIONS & RAIDS                              │
    │                                            │
    ├─ Cards ────────────────────────────────────┘
    │    └─ Crew for expeditions + voyages
    │
    ├─ Expeditions ─── Navigation XP ─── Navigation Level
    │       └─── Doubloon loot
    │
    ├─ Voyages ─── Doubloon rewards, special bait loot
    │
    └─ Raids ─── Doubloon + XP kills ─── Pete's loot crate
                                              └─ Ship skins, raid items, gems, packs

TAVERN
    ├─ Minigames ─── Doubloon wagering (risk/reward)
    ├─ Fish Market ─── Better sell prices than Quick Sell
    ├─ Daily Bonus ─── Free worms, gems, doubloons
    ├─ Bounties ─── Card pack rewards
    └─ Puzzles (Fish of the Day, Daily Quiz, Charting) ─── Gems

SOCIAL
    ├─ Challenges ─── Head-to-head fishing ─── Wager doubloons
    └─ Leaderboard ─── Weekly rankings
```

**The fishing game is the heartbeat.** Everything else either feeds into it (bait, gear, daily challenges, events) or branches from it (collection, market, social, prestige). Gems sit one layer above doubloons — you earn them through engagement, spend them on cards, and cards feed back into expeditions for more loot.

---

*Last updated: May 2026*
