# Seas the Booty — Technical Overview

A readable guide to how everything in the game works.

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
9. [Tavern Minigames](#9-tavern-minigames)
10. [Card Collection & Packs](#10-card-collection--packs)
11. [Marketplace](#11-marketplace)
12. [Social & Challenges](#12-social--challenges)
13. [XP & Leveling](#13-xp--leveling)
14. [Economy Overview](#14-economy-overview)
15. [Page Structure](#15-page-structure)
16. [How the Systems Connect](#16-how-the-systems-connect)

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

The app is a Next.js App Router project. Pages that need live interactivity are Client Components (`'use client'`). Heavy data fetching (DB queries, auth checks) happens in Server Components or Server Actions. Supabase is accessed two ways: a normal client (respects Row Level Security for the logged-in user) and an admin client (bypasses RLS, used only inside server actions for game logic).

---

## 2. Database & Data Model

All data lives in Supabase (PostgreSQL). Row Level Security (RLS) is enabled on every table so users can only read and write their own data.

### Core user data

**`profiles`** — one row per player, the central record.
Key fields: `username`, `doubloons`, `gems`, `fishing_xp`, `ship_tier`, `rod_tier`, `hook_tier`, `reel_tier`, `line_tier`, `packs_available`, `highest_perfect_streak`, `ring_skin`, `unlocked_ring_skins`, `is_premium`.

### Fishing

**`fish_species`** — the game-wide catalog of all fish. Fields include `name`, `scientific_name`, `habitat` (shallows / open_waters / deep / abyss), `bite_rarity` (1–5), `catch_difficulty` (1–5), `sell_value`, `fun_fact`.

**`fish_inventory`** — what the player currently has in their hold. One row per species per player (`user_id`, `fish_id`, `quantity`).

**`fish_collection`** — tracks which species a player has ever caught (one row per species, no quantity). Used for the Collection screen and to derive line tier.

**`fish_market`** — hourly price multipliers per species (`fish_id`, `multiplier` 1.0–2.5×).

**`bait_inventory`** — consumable bait counts (`user_id`, `bait_type`, `quantity`).

**`rod_inventory`** — which rod tiers the player owns (`user_id`, `rod_tier`).

### Daily systems

**`daily_challenge_progress`** — one row per (user, date). Stores progress on 3 daily challenges (`p1`, `p2`, `p3`) and whether each reward has been claimed (`claimed_1/2/3`).

**`daily_fish_attempts`** — Fish of the Day puzzle attempts per user per date.

**`daily_bonus_claims`** — tracks whether a player has taken their daily free bonus today.

### Cards & packs

**`cards`** — base card definitions (`name`, `slug`, `tier`).

**`card_variants`** — variants of each card (Standard, Gold, Holographic, Ghost, Shadow, Prismatic, Kraken, Mythic variants). Each variant has `drop_weight` (rarity), and crew stats: `power`, `dodge`, `fortune`.

**`user_collection`** — cards a player owns (one row per card instance, duplicates included).

**`pack_history`** — log of every pack opened.

### Expeditions & combat

**`daily_expeditions`** — one AI-generated narrative per zone per day (`zone`, `expedition_date`, `event_sequence` JSON array).

**`expeditions`** — a player's active or completed run (`user_id`, `zone`, `status`, `current_node`, `crew_loadout`, `combat_state`, `loot`, `hull_damage`).

### Social

**`fishing_challenges`** — head-to-head challenges between two players.

**`challenge_sessions`** — the active fishing session during a challenge.

**`crew`** — follow/following relationships between players.

**`weekly_leaderboard`** — cached weekly stats by player.

### Tavern minigames

**`crown_and_anchor_rolls`**, **`slot_machine_spins`**, **`dead_mans_draw_games`** — one row per game played, tracks wagers and payouts. All have daily wagering caps.

### Audit logs

**`doubloon_transactions`** and **`gem_transactions`** — every credit and debit of each currency with a `reason` string. Used for debugging and fairness auditing.

---

## 3. Authentication & User Flow

Players sign up with email and password via Supabase Auth. On signup, a database trigger (`handle_new_user()`) automatically creates a `profiles` row with default values: 0 doubloons, 0 gems, 0 fishing XP, 1 starter pack.

Login produces a Supabase JWT which is stored in a cookie. All server-rendered pages verify this JWT via Next.js middleware before rendering. If there's no valid session, the user is redirected to `/login`.

**Premium status** is controlled by the `is_premium` flag on profiles, updated by a Shopify webhook when a player purchases a subscription. Premium players pay 0% selling fee on fish (free players pay 3%).

---

## 4. Fishing Game

The fishing game is the core loop of the entire product. Here's how each part works.

### Zone selection

Before fishing, players pick a zone. There are four, unlocked by fishing level:

| Zone | Min Level | Bite Wait | XP Multiplier | Notes |
|---|---|---|---|---|
| Shallows | 1 | 3–12s | 0.4× | Starter zone |
| Open Waters | 15 | 5–20s | 1.1× | First unlock |
| Deep | 30 | 8–35s | 1.25× | |
| Abyss | 50 | 12–45s | 1.5× | Random needle bursts |

The last visited zone is saved to `localStorage` so players return to where they left off.

### Casting

When the player taps Cast, a server action (`castLine`) runs:

1. Verifies bait is in inventory and deducts one unit (unless Bloom event is active — see events section).
2. Selects the fish using a two-stage random pick:
   - First, roll a rarity tier (common / uncommon / rare / epic / legendary) using zone-specific weights.
   - Then, pick uniformly from all fish in that tier that match the zone's habitat.
3. Computes the bite wait time based on fish difficulty, bait speed multiplier, and level reduction.
4. Returns the fish data (hidden from the player until reeled in).

**Zone rarity weights (example — Shallows):** 55% common, 25% uncommon, 12% rare, 7% epic, 1% legendary. Deeper zones shift these toward higher rarities.

### The catch dial

Once a fish bites, the catch dial appears. This is an arc-based UI:

- A needle spins around a circle at a speed determined by fish difficulty and reel tier.
- The circle has coloured zones:
  - **Green** = catch zone (land here to catch the fish)
  - **Gold strip** in the middle of green = perfect catch
  - **Red** = snag zones (lose fish and bait; snag-immune rods only lose the fish)
- The width of the green zone is controlled by: hook tier (+3° per tier), bait catch bonus, level bonus (+0.2° per level), and any active event bonuses.
- Line tier shrinks the red snag zones (making them less punishing).
- Reel tier slows the needle speed.

### Catch outcomes

| Outcome | Effect |
|---|---|
| Perfect | Fish caught, 50% chance bait is saved, +20% XP, streak incremented |
| Catch | Fish caught, bait consumed, normal XP |
| Miss | Fish lost, bait consumed, streak broken |
| Snag | Fish lost, bait consumed (snag-immune rods keep the fish), streak broken |

A server action (`reelIn`) handles the outcome, updating the DB in one call: adds fish to inventory, updates fish collection if new species, awards XP, updates highest streak, and tracks daily challenge progress.

### Perfect streak

Each consecutive perfect catch increments a streak counter. The streak is shown in the XP bar as a small badge. If the player breaks it, it resets to 0. Their personal best is saved to `profiles.highest_perfect_streak` and tracked on the leaderboard.

---

## 5. Gear System

All gear is purchased from the Tackle Shop and stored on the player's profile (tiers) or in `rod_inventory` (individual rods). Only one piece of each gear type is active at a time (the highest purchased, except rods which can be switched).

### Rods (11 tiers)

Rods affect the most mechanics. Key properties per tier:
- `rarityBonus` — shifts fish rarity rolls toward higher tiers
- `catchZoneBonus` — extra degrees on the green zone
- `needleSpeedMult` — slows the needle (overlaps with reel)
- `snagImmune` — whether snags lose the fish or just bait
- `retryOnMiss` — chance to get a second attempt on a miss
- `doubleCatch` — chance to catch 2 fish at once
- `baitSaveChance` — additional chance to save bait on non-perfect catches

Legendary Rod and Completionist Rod are earned, not bought (Completionist requires level 100 + all species caught).

### Hooks (9 tiers)

Simply add +3° to the catch zone per tier. Straightforward linear upgrade.

### Reels (9 tiers)

Reduce needle speed via `needleSpeedMultiplier` (ranges from 1.0 at tier 0 down to ~0.40 at max tier). Slower needle = easier to land perfect catches.

### Line (6 tiers)

Shrinks the red snag zones via `penaltyMultiplier`. Line tier is **automatically derived** from the player's unique species count (no purchase needed — it unlocks passively as you catch more species). This is a nice progression mechanic that rewards variety.

### Bait (7 types)

| Bait | Wait Mult | Zone Bonus | Source |
|---|---|---|---|
| Worms | 1.0× | +0° | Shop, daily bonus |
| Minnow | 0.8× | +0° | Shop |
| Night Crawler | 1.0× | +8° | Shop |
| Chum | 0.6× | +0° | Shop |
| Angler's Formula | 0.9× | +14° | Shop |
| Luminous Lure | 0.75× | +10° | Expeditions, bounties |
| Golden Lure | 0.6× | +16° | Rare earned drops |

Luminous and Golden lures are earned-only and show as display items in the Tackle Shop.

---

## 6. Daily Challenges & Events

### Daily challenges

Every day, all players share the same 3 challenges (Easy / Medium / Hard), generated deterministically from the date using a hash function. This means no DB table stores what the challenges are — just the player's progress against them.

Challenge types: catch any fish, catch fish in a specific zone, land perfect catches, catch fish of a specific rarity, earn doubloon value from catches.

Progress is tracked in `daily_challenge_progress` and updated every time `reelIn` runs. Rewards are doubloons (~150 / 350 / 700 for Easy / Medium / Hard). Challenges reset at midnight UTC (8 PM EDT).

The UI is a compact "Daily" button next to the Collection button in the top bar. Tapping it opens a drawer showing all three challenges with progress bars and claim buttons.

### Random fishing events

Every 15–20 minutes during a fishing session, one of four events can fire. The event lasts 90 seconds and shows a coloured atmospheric overlay + announcement banner.

| Event | Effect |
|---|---|
| Bioluminescent Bloom | Bait is not consumed on casts |
| Full Moon Rising | Quick-sell pays 100% (normally 65%) |
| Red Tide | +0.25 rarity bias (rare fish more likely) |
| Glassy Waters | +12° to catch zone |

Events are purely client-scheduled (no DB involvement) and have no effect on XP or leaderboard progression.

---

## 7. Fish Hold & Market

### Fish Hold

Every fish caught goes into `fish_inventory`. The total number of fish (sum of all quantities) is capped by the ship's hold capacity (15–250 depending on ship tier). When the hold is full, the player must sell before catching more.

### Selling options

**Quick Sell** — available in the fishing game's sell drawer. Pays 65% of base `sell_value`. Fast but lossy. During a Full Moon event, it pays 100%.

**Fish Market** — available at `/tavern/market`. Each species has a live hourly multiplier (1.0–2.5×). Sell price = `base_value × multiplier × 0.90 × (premium ? 1.0 : 0.97)`. The 10% market fee applies to all players; the 3% free-user fee stacks on top.

The market multiplier updates on the hour, so timing sales to high-multiplier windows is part of the meta.

---

## 8. Expedition & Combat

Expeditions are multi-node runs through one of four zones, each with a distinct difficulty and narrative flavour. They're separate from the fishing game and use the card collection for crew.

### Zones

Coral Run → Bertuna Triangle → Sunken Reach → Davy Jones' Locker (increasing difficulty, minimum ship tier required).

### Daily narrative

Each zone gets a new AI-generated event sequence daily (via the Anthropic API), stored in `daily_expeditions`. All players on the same day see the same narrative — the randomness is in your crew composition and choices, not the map.

### Crew & ships

Before entering, the player picks 1–5 crew cards from their collection and an equipped item. Card stats (power, dodge, fortune) determine combat performance. The first card operates at 100%; each additional card contributes at 80%. Mythic variants have significantly boosted stats.

Ships (tiers 0–6) determine: durability (hull HP), armor (flat damage reduction), min damage, crew slots, and sail speed.

### Combat loop

Combat is turn-based. On each round:

1. Player chooses an action: **Reload** (charge up), **Fire** (medium damage), **Heavy Fire** (high damage + recoil), or **Defend** (reduce incoming damage).
2. Enemy acts based on its behavior pattern.
3. Damage is calculated: base damage rolled within a min–max range, modified by armor and crit/dodge rolls.
   - Dodge chance = dodge_stat × 5% (fully negates the hit)
   - Crit chance = fortune_stat × 4% (doubles damage)
4. Hull durability and enemy HP are updated.
5. If durability hits 0 the run ends (failed). If enemy HP hits 0, the node is cleared.

The full round-by-round log is stored in `expeditions.combat_state.log`.

### Loot & rewards

Each cleared node awards doubloons. Boss nodes drop special items (Luminous Lure, Golden Lure, equipment). Completing a full zone awards a large doubloon bonus and potentially zone-specific rewards.

---

## 9. Tavern Minigames

All minigames are in the Tavern (`/tavern`). They use doubloons (minigames) or gems (Fish of the Day).

### Crown & Anchor

A classic dice game. Roll 3 dice showing 6 symbols. Bet on a symbol before the roll; win if it appears on 2 or more dice. Payout is 1× your bet per matching die. Daily wagering cap: 5,000 doubloons.

### Fish Slots

A 3-reel slot machine with fish-themed symbols. Matching 2 or 3 symbols pays out multipliers; special symbols (Catfish jackpot) pay big. Daily wagering cap: 5,000 doubloons.

### Fish of the Day

A Wordle-style guessing game. One fish per day, same for all players. Guess in up to 4 attempts; each wrong guess reveals a new clue (habitat, size, diet, fish group). Correct guesses award gems (100 for first try, less for subsequent attempts). Streak bonuses at 3, 7, and 30 consecutive days.

### Dead Man's Draw

A risk escalation card game. Draw cards to accumulate value, but stop to bank your winnings before you bust. Payout multiplier increases with each draw.

### Daily Bonus

One free claim per day from the Tavern. Awards a small bundle of worms, gems, and doubloons. Resets at midnight UTC.

---

## 10. Card Collection & Packs

### Cards

Cards are the collectible layer of the game. Each card has a `tier` (1–3) and multiple variants:

- **Standard variants:** Standard, Gold, Holographic, Ghost, Shadow, Prismatic, Kraken
- **Mythic variants:** Available on tier 3 cards only; dramatically higher stats

Each variant has a `drop_weight` (governs pull chance) and crew stats (`power`, `dodge`, `fortune`) used in expeditions.

### Opening packs

Packs cost 100 gems (or 900 for 10). Each pack reveals 5 cards. The pull logic:

1. Draws are weighted by `drop_weight` across all variants.
2. General rarity distribution: ~70% common, ~20% rare, ~7% epic, ~2.5% legendary, ~0.5% mythic.
3. **Pity system:** If no legendary has appeared in 20 packs, the next pack forces one.
4. **God Pack:** 0.1% chance — all 5 cards are Mythic.

Packs are earned by: purchasing with gems, monthly subscription grant, redemption codes, certain achievement milestones.

### Duplicates

Duplicate cards sit in `user_collection` as extra rows. Players can sell them for gems from the Collection page: Rare = 5 gems, Epic = 10, Legendary = 25, Mythic = 50.

---

## 11. Marketplace

The marketplace (`/marketplace`) is the main shop hub.

**Tackle Shop** — buy fishing gear:
- Rods (0–10): 1,500–200,000 doubloons. Some are earned, not purchased.
- Reels (0–8), Hooks (0–8): similarly tiered and priced.
- Line: free, auto-unlocks via species count.
- Bait: consumable bundles, 10–250 doubloons.

**Shipyard** — buy fishing ships for larger hold capacity: 500–100,000 doubloons.

**Packs** — spend gems on card packs (see section 10).

**Redeem** — enter promo codes for free packs.

---

## 12. Social & Challenges

### Crew (follow system)

Players can follow each other. Your "crew" is the list of people you follow. The social page shows crew members ranked by XP, plus active challenges.

### Fishing Challenges

A head-to-head competition:

1. Player A challenges Player B, picks a type (most fish / most doubloons / most perfects), duration (1h / 6h / 24h), and optional wager.
2. Player B accepts or declines.
3. Both players fish independently during the window. The game tracks their score in `challenge_sessions`.
4. At the end, scores are compared. The winner takes both wagers (if any).

Wagers are held in escrow — deducted on start, returned to winner. Challenge status flow: `pending` → `accepted` → `active` → `complete`.

### Leaderboard

Weekly leaderboard at `/leaderboard`. Tracks fish caught, doubloons earned, and perfect catches for the current UTC week. Cached in `weekly_leaderboard` and updated after each fishing session.

---

## 13. XP & Leveling

### XP table

Level gaps grow exponentially. The formula: `gap(level) = 60 × 1.086^(level–1)`. Level 1 starts at 0 XP; reaching level 100 requires roughly 15 million total XP.

### Earning XP

XP is awarded only for catching fish (no XP for selling, minigames, etc.). The formula:

```
XP = BASE_XP[difficulty] × ZONE_MULT × PERFECT_BONUS × STREAK_BONUS
```

- `BASE_XP` by difficulty: 15 / 30 / 55 / 90 / 140
- `ZONE_MULT`: 0.4× (Shallows) / 1.1× (Open Waters) / 1.25× (Deep) / 1.5× (Abyss)
- `PERFECT_BONUS`: 1.2× if perfect catch
- `STREAK_BONUS`: +0.05× per consecutive perfect (up to ~+0.25× at 5+)

So a difficult fish caught perfectly in the Abyss on a streak is worth roughly: `140 × 1.5 × 1.2 × 1.25 ≈ 315 XP`.

### Level benefits

Each level grants:
- +0.2° wider catch zone
- −0.25% bite wait time
- Zone unlocks at 15, 30, 50
- Cosmetic ring skin unlocks at milestones

---

## 14. Economy Overview

Two currencies: **Doubloons** (primary, earned everywhere) and **Gems** (secondary, earned more selectively).

### Doubloon sources
- Selling fish (main source)
- Daily challenges
- Expedition node rewards and zone completion
- Tavern minigames (net positive if lucky)
- Challenge wager winnings
- Zone first-clear bonuses

### Doubloon sinks
- Gear upgrades (rods, reels, hooks)
- Bait
- Ship upgrades
- Expedition entry fees
- Challenge wagers
- Tavern minigame wagering

### Gem sources
- Daily challenges (150–750/day)
- Fish of the Day puzzle (25–100/day)
- Selling duplicate cards
- Rank milestone bonuses
- Pack opening sometimes yields gem-equivalent cards

### Gem sinks
- Card packs (100 gems each, 900 for 10)

The intent is that engaged daily players always have enough doubloons to keep improving their gear, while gems require more deliberate engagement (daily puzzle, challenges) to accumulate pack-opening speed.

---

## 15. Page Structure

```
/                    Home / splash
/login               Sign in
/register            Create account

/fishing             Main fishing game (zone select → casting → results)
/tavern              Minigame hub
/tavern/market       Fish market (sell at hourly prices)
/expeditions         Expedition zone select
/expeditions/prepare Crew loadout + item select
/expeditions/voyage  Active expedition (nodes, combat, events)

/packs               Open card packs
/collection          Fish collection + card collection + duplicate selling

/social              Crew list, active challenges, create challenges
/leaderboard         Weekly fishing rankings

/marketplace         Shop hub
/marketplace/tackle-shop  Gear and bait
/marketplace/shipyard     Ships
/marketplace/redeem       Promo code redemption

/u/[username]        Public player profile
/profile             Personal profile (edit username, view stats)
/achievements        Achievement list

/contact             Contact form
/privacy             Privacy policy
/terms               Terms of service
/admin               Admin panel (staff only)
/claim               Token-based pack claim (for marketing links)
```

---

## 16. How the Systems Connect

```
FISHING (core loop)
    │
    ├─ Catch fish ──────────── XP ──────────── Level up
    │       │                                    │
    │   Fish Hold ─── Sell ─── Doubloons         │
    │                              │          Zone unlocks
    │                              │          Wider catch zone
    │                       Gear upgrades     Faster bites
    │                       Bait purchases
    │                       Ship upgrades (bigger hold)
    │
    ├─ New species ─── Fish Collection ─── Line tier (auto)
    │                        │
    │                  Completionist Rod (all species + lv.100)
    │
    ├─ Perfect catches ─── Streak ─── Leaderboard
    │
    └─ Daily Challenges ─── Gems ─── Card Packs

CARD PACKS
    │
    └─ Cards ─── Expeditions (crew) ─── Doubloon loot
              └─ Duplicate selling ─── Gems

SOCIAL
    ├─ Challenges ─── Head-to-head fishing ─── Wager doubloons
    └─ Leaderboard ─── Weekly rankings

TAVERN
    ├─ Minigames ─── Doubloon wagering (risk/reward)
    └─ Fish of the Day ─── Gems
```

The fishing game is the heartbeat. Everything else either feeds into it (bait, gear, daily challenges) or branches off it (collection, market, social). Gems sit one layer above doubloons — you earn them through engagement, spend them on cards, and cards feed back into expeditions for more loot.

---

*Last updated: May 2026*
