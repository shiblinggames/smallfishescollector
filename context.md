# Small Fishes — Project Context

**Live site:** seasthebooty.com  
**Supabase project ID:** pwvndjczpdcttmyvnsyq  
**Git:** master → Vercel auto-deploy

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16.2.4 (App Router, server actions, server components) |
| UI | React 19.2.4 + Tailwind CSS v4 |
| Language | TypeScript 5 |
| Database + Auth | Supabase (supabase-js ^2.104, @supabase/ssr ^0.10) |
| AI | @anthropic-ai/sdk ^0.90 — Claude Haiku 4.5 for FOTD and Daily Quiz generation |

**Supabase clients:**
- `lib/supabase/server.ts` — SSR server client (uses cookies)
- `lib/supabase/client.ts` — Browser client
- `lib/supabase/admin.ts` — Admin client (bypasses RLS, server-only)

---

## Database Tables

### cards
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| name | text | Display name |
| slug | text UNIQUE | URL-safe identifier |
| filename | text | Storage bucket filename |
| tier | int | 1 = common fish, 2 = mid, 3 = rare species |
| zone | text | `shallows`, `open_waters`, `deep`, `abyss` |
| created_at | timestamptz | |

### card_variants
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| card_id | int FK → cards | |
| variant_name | text | e.g. Standard, Gold, Holographic, Kraken, GOD |
| border_style | text | CSS class key |
| art_effect | text | CSS class key |
| drop_weight | numeric | Higher = more common |

### profiles
| Column | Type | Notes |
|---|---|---|
| id | uuid PK → auth.users | |
| username | text | |
| packs_available | int | |
| doubloons | int | |
| hook_tier | int | 0–6 |
| ship_tier | int | 0–6 |
| packs_since_legendary | int | 0–20 tide mechanic counter |
| highest_rank_claimed | int | 0–4 rank index |
| is_premium | boolean | |
| premium_expires_at | timestamptz | |
| last_daily_claim | date | `YYYY-MM-DD` |
| last_ship_claim | date | |
| last_pack_claim | date | Premium daily pack |
| fotd_streak | int | Current FOTD streak |
| fotd_longest_streak | int | |
| last_fotd_date | date | |
| last_viewed_achievements_at | timestamptz | For Nav badge |
| created_at | timestamptz | |

### user_collection
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| user_id | uuid FK → profiles | |
| card_variant_id | int FK → card_variants | |
| obtained_at | timestamptz | |

Duplicates allowed — users can own multiple copies of the same variant.

### pack_history
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| user_id | uuid FK → profiles | |
| cards | jsonb | Array of DrawnCard objects |
| was_god_pack | boolean | |
| created_at | timestamptz | |

### user_achievements
| Column | Type | Notes |
|---|---|---|
| user_id | uuid FK → profiles | |
| achievement_key | text | References ACHIEVEMENTS array key |
| unlocked_at | timestamptz | |

Primary key: (user_id, achievement_key). RLS: publicly readable (for profiles page).

### doubloon_transactions
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| user_id | uuid FK → profiles | |
| amount | int | Positive = earned, negative = spent |
| reason | text | Human-readable e.g. "Daily login bonus" |
| created_at | timestamptz | |

### daily_fish_attempts
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| user_id | uuid FK → profiles | |
| date | date | `YYYY-MM-DD` |
| guesses | jsonb | Array of guessed names |
| solved | boolean | |
| doubloons_awarded | int | |
| created_at | timestamptz | |

### daily_fish_generated
| Column | Type | Notes |
|---|---|---|
| date | date UNIQUE PK | |
| common_name | text | |
| scientific_name | text | |
| clue_1–4 | text | Progressive clues |
| fun_fact | text | |
| habitat, diet, size, conservation_status, range | text | |

### quiz_answers
| Column | Type | Notes |
|---|---|---|
| user_id | uuid FK → profiles | |
| date | date | |
| chosen_index | int | 0–3 |
| correct | boolean | |
| reward | int | |
| answered_at | timestamptz | |

No `id` column. Unique constraint: (user_id, date).

### daily_quiz
| Column | Type | Notes |
|---|---|---|
| date | date UNIQUE PK | |
| question | text | |
| options | text[] | 4 entries |
| correct_index | int | 0–3 |
| explanation | text | |
| topic | text | biology, behavior, habitat, fishing, record, history |

### claim_tokens
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| token | text UNIQUE | |
| email | text | null = any user |
| packs_to_grant | int | |
| status | text | `pending`, `claimed` |
| claimed_by | uuid FK → profiles | |
| claimed_at | timestamptz | |
| expires_at | timestamptz | |

### prize_claims
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| user_id | uuid FK → profiles | |
| prize_code | text UNIQUE | |
| card_variant_id | int FK → card_variants | |
| card_name, variant_name | text | |
| claimed_at | timestamptz | |
| fulfilled | boolean | |

### redemption_codes
| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| code | text UNIQUE | |
| redeemed_by | uuid FK → profiles | |
| redeemed_at | timestamptz | |
| packs_granted | int DEFAULT 1 | |

### Views (leaderboard)
- `leaderboard_collection` — ranks by COUNT(DISTINCT card_variant_id)
- `leaderboard_packs` — ranks by pack_history count
- `leaderboard_streak` — ranks by fotd_streak
- `leaderboard_achievements` — ranks by unlocked achievement count

---

## Hook / Shipyard System

**Hooks** (`lib/hooks.ts`) — affect zone drop probabilities when opening packs.

| Tier | Name | Cost (⟡) |
|---|---|---|
| 0 | Rusty Hook | Free |
| 1 | Bent Hook | 150 |
| 2 | Iron Hook | 400 |
| 3 | Steel Hook | 1,000 |
| 4 | Gold Hook | 2,500 |
| 5 | Enchanted Hook | 6,000 |
| 6 | Legendary Hook | 18,000 |

Zone weights by hook tier (shallows / open_waters / deep / abyss):

| Tier | Shallows | Open Waters | Deep | Abyss |
|---|---|---|---|---|
| 0 | 52% | 33% | 14.8% | 0.2% |
| 1 | 50% | 32.7% | 17% | 0.3% |
| 2 | 48% | 32.4% | 19.2% | 0.4% |
| 3 | 46% | 32% | 21.5% | 0.5% |
| 4 | 44% | 31.8% | 23.5% | 0.7% |
| 5 | 41% | 31.2% | 26.9% | 0.9% |
| 6 | 38% | 31% | 30% | 1% |

**Ships** (`lib/ships.ts`) — cosmetic upgrade that grants daily doubloon bonuses.

| Tier | Name | Cost (⟡) | Daily Bonus (⟡) |
|---|---|---|---|
| 0 | Rowboat | Free | 0 |
| 1 | Dinghy | 150 | 10 |
| 2 | Sloop | 400 | 20 |
| 3 | Schooner | 1,000 | 35 |
| 4 | Brigantine | 2,500 | 55 |
| 5 | Galleon | 6,000 | 80 |
| 6 | Man-o-War | 18,000 | 125 |

---

## Card Variants

Defined in `lib/variants.ts`. Each variant is a combination of border_style + art_effect applied to a base card.

| Variant Name | Border Style | Art Effect | Drop Weight | Rarity |
|---|---|---|---|---|
| Standard | standard | normal | 50 | Common |
| Silver | silver | normal | 25 | Uncommon |
| Gold | gold | normal | 12 | Rare |
| Pearl | pearl | normal | ~6 | Epic |
| Holographic | gold | holographic | 6 | Epic |
| Ghost | silver | ghost | 4 | Legendary |
| Shadow | void | shadow | 2 | Legendary |
| Prismatic | prismatic | rainbow | 1 | Legendary |
| Kraken | kraken | kraken | 0.2 | Mythic |
| Davy Jones | davy-jones | davy-jones | 0.2 | Mythic |
| Golden Age | golden-age | golden-age | 0.2 | Mythic |
| Storm | storm | storm | 0.2 | Mythic |
| Wanted | wanted | wanted | 0.2 | Mythic |
| Maelstrom | (void+effect) | maelstrom | 0.2 | Mythic |
| GOD | god | divine | varies | Divine |

**Special cards:** Catfish and Doby Mick have drop_weight × 0.1 (10× rarer than equivalent variants).

---

## Rarity Tiers

Defined in `lib/variants.ts`. Rarity is derived from variant_name via VARIANT_RARITY map.

| # | Name | Hex Color | Sell Value (⟡) |
|---|---|---|---|
| 1 | Common | #8a8880 | 2 |
| 2 | Uncommon | #4ade80 | 5 |
| 3 | Rare | #60a5fa | 10 |
| 4 | Epic | #a78bfa | 25 |
| 5 | Legendary | #f0c040 | 75 |
| 6 | Mythic | #ff3838 | 250 |
| 7 | Divine | #fffdf0 | 1,000 |

---

## Drop Table / Pack Opening

Implemented in `lib/drawPack.ts`.

**Regular Pack (5 cards):**
1. For each card, pick a zone based on hook tier weights
2. Filter card_variants to that zone's cards
3. Weighted random pick by drop_weight
4. Fallback to all zones if zone has no cards

**Guarantees:**
- **Rare floor:** If no card with drop_weight ≤ 12 appears, card slot 3 is replaced with a Rare+ pull
- **Tide mechanic:** After 20 packs without a Legendary+, the next pack forces a Legendary+ at slot 3. Counter stored in `profiles.packs_since_legendary`

**God Pack (0.1% chance — `Math.random() < 0.001`):**
- All 5 cards drawn from Epic+ pool only
- Custom God Pack weights: Pearl 20, Holographic 20, Ghost 18, Shadow 16, Prismatic 12, each Mythic 3

**Pack costs:**
- 1 pack: 200 ⟡
- 10 packs: 1,500 ⟡
- Premium: 1 free pack/day

---

## Daily Features

**Daily Bonus** (`app/actions/dailyBonus.ts`)
- Free users: 50 ⟡ | Premium: 100 ⟡
- Once per calendar day (last_daily_claim)
- Achievements: bonus_first, bonus_7

**Ship Bonus** (`app/actions/shipBonus.ts`)
- 0–125 ⟡ based on ship_tier, once per day (last_ship_claim)

**Fish of the Day** (`app/tavern/fishActions.ts`)
- 4 progressive clues, 4 guesses to identify the fish
- Rewards: guess 1 = 100 ⟡, guess 2 = 75 ⟡, guess 3 = 50 ⟡, guess 4 = 25 ⟡
- Streak bonuses: 3-day +25 ⟡, 7-day +50 ⟡, 30-day +150 ⟡
- Streak resets if user misses a day (last_fotd_date ≠ yesterday)
- Generated nightly by Claude Haiku via `/api/cron/midnight`

**Daily Quiz** (`app/tavern/daily-quiz/`)
- 4-option trivia question, 20-second timer
- Correct: 50 ⟡ | Incorrect or timed out: 0 ⟡
- One per user per day (quiz_answers unique on user_id + date)
- Generated nightly by Claude Haiku via `/api/cron/midnight`

**Daily Pack** (`app/actions/dailyPack.ts`)
- Premium members only: 1 free pack per day (last_pack_claim)

---

## Tavern Minigames

### Crown & Anchor (`app/tavern/actions.ts` + `app/tavern/CrownAndAnchor.tsx`)
- Symbols: anchor, crown, heart, diamond, spade, club
- Pick one symbol, wager 10–200 ⟡ (MIN_BET: 10, MAX_BET: 200)
- 3 dice roll — count how many match your symbol:
  - 0 matches: lose wager
  - 1 match: get wager back (net 0)
  - 2 matches: get 2× wager (net +wager)
  - 3 matches: get 3× wager (net +wager × 2)
- Daily cap: 500 ⟡ wagered per day (DAILY_CAP)
- Achievements: crown_first, crown_triple

### Fish of the Day (see Daily Features above)

### Daily Quiz (see Daily Features above)

### Dead Man's Draw (`app/tavern/dead-mans-draw/`)
- Card game vs. AI — first to 30 points wins
- Entry fee: 20 ⟡
- Win payouts by difficulty: Cautious (Goldfish) 35 ⟡, Balanced (Anglerfish) 40 ⟡, Greedy (Kraken) 50 ⟡
- 8 power cards (4 copies each) + 28 vanilla cards = 60-card deck
- Power cards: Kraken, Anglerfish, Piranha, Whale Shark, Hammerhead, Clownfish, Manta Ray, Orca
- Game state is local (not persisted to DB)

---

## Card Art

**Storage:** Supabase Storage bucket `card-arts/`  
**URL format:** `{SUPABASE_URL}/storage/v1/object/public/card-arts/{cards.filename}`  
**Rendering:** `components/FishCard.tsx` — circular frame (140px), CSS classes for effects

**Art effects (CSS-based):**

| Effect | CSS Class | Variants |
|---|---|---|
| normal | (none) | Standard, Silver, Gold, Pearl |
| holographic | art-holographic | Holographic |
| rainbow | art-rainbow | Prismatic |
| ghost | art-ghost | Ghost |
| shadow | art-shadow | Shadow |
| kraken | art-kraken | Kraken |
| davy-jones | art-davy-jones | Davy Jones |
| golden-age | art-golden-age | Golden Age |
| storm | art-storm | Storm |
| wanted | art-wanted | Wanted |
| divine | art-divine | GOD |

**Border colors** applied via border_style: standard (#a0a09a), silver (#9ca3af), gold (#f0c040), pearl (#e8d5b0), void (#a855f7), prismatic (gradient), kraken (#00cc99), davy-jones, golden-age, storm, wanted, god.

---

## Doubloons

**Earning:**

| Source | Amount |
|---|---|
| Daily bonus (free) | 50 ⟡/day |
| Daily bonus (premium) | 100 ⟡/day |
| Ship bonus | 0–125 ⟡/day |
| Sell Common | 2 ⟡ |
| Sell Uncommon | 5 ⟡ |
| Sell Rare | 10 ⟡ |
| Sell Epic | 25 ⟡ |
| Sell Legendary | 75 ⟡ |
| Sell Mythic | 250 ⟡ |
| Sell Divine | 1,000 ⟡ |
| Fish of the Day | 25–100 ⟡ |
| FOTD streak bonus | 25–150 ⟡ |
| Daily Quiz (correct) | 50 ⟡ |
| Crown & Anchor (win) | up to wager × 3 |
| Dead Man's Draw (win) | 35–50 ⟡ |
| Rank-up rewards | 200–5,000 ⟡ |

**Rank-up thresholds** (unique variants collected):
- Officer (25 variants): +200 ⟡
- Second Mate (75): +500 ⟡
- Quartermaster (150): +1,500 ⟡
- Captain (250): +5,000 ⟡

**Spending:**

| Action | Cost |
|---|---|
| 1 pack | 200 ⟡ |
| 10 packs | 1,500 ⟡ |
| Hook tier 1–6 | 150 – 18,000 ⟡ |
| Ship tier 1–6 | 150 – 18,000 ⟡ |
| Crown & Anchor | 10–200 ⟡/bet |
| Dead Man's Draw entry | 20 ⟡ |

All transactions recorded in `doubloon_transactions` (positive = earned, negative = spent). Achievement milestones check sum of all positive amounts: 1k / 5k / 25k / 100k ⟡.

---

## Key Routes

| Route | Description |
|---|---|
| `/` | Landing / home page |
| `/login` | Auth login |
| `/register` | Auth registration |
| `/auth/*` | Supabase auth callbacks |
| `/packs` | Pack opener — open packs, view animation |
| `/collection` | Card collection grid, sell duplicates |
| `/marketplace` | Hub: hooks, shipyard, redeem |
| `/marketplace/shipyard` | Buy ship upgrades |
| `/marketplace/redeem` | Redeem codes / claim tokens |
| `/tavern` | Tavern hub with daily task status |
| `/tavern/crown-and-anchor` | Crown & Anchor dice game |
| `/tavern/fish-of-the-day` | Daily fish puzzle |
| `/tavern/daily-quiz` | Daily trivia quiz |
| `/tavern/dead-mans-draw` | Dead Man's Draw card game vs. AI |
| `/leaderboard` | Global leaderboards (Collection, Packs, Streak, Achievements) |
| `/achievements` | User achievement progress |
| `/social` | Crew/follow management |
| `/u/[username]` | Public user profile |
| `/guide` | How to play |
| `/admin` | Admin dashboard |
| `/claim` | Claim token redemption |
| `/demo` | Demo / variant showcase |

---

## APIs

| Route | Method | Description |
|---|---|---|
| `/api/daily-status` | GET | Returns `{ badge: number }` — count of uncompleted daily tasks (bonus, quiz, FOTD). Used by Nav badge. `force-dynamic`. |
| `/api/cron/midnight` | GET | Midnight cron job: generates today's FOTD puzzle + Daily Quiz via Claude Haiku. Requires `Authorization: Bearer {CRON_SECRET}` header. Triggered by Vercel Cron. |
| `/api/webhooks/shopify` | POST | Handles Shopify order webhooks; grants premium membership on purchase. Verifies HMAC-SHA256 signature against `SHOPIFY_WEBHOOK_SECRET`. Matches user by email via `get_user_by_email()` DB function. |
