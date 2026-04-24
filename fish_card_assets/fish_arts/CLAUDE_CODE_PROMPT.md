# Small Fishes: Seas the Booty — Digital Collectibles System
## Claude Code Kickoff Prompt

I'm building a digital collectibles system for my card game **Small Fishes: Seas the Booty**. Players who buy the physical board game get a code inside the box that lets them redeem a digital booster pack on our website. Packs contain collectible versions of the game's fish cards with CSS rarity treatments (gold borders, animated shimmer, holographic effects). No additional artwork needed — rarity is expressed through CSS effects applied on top of the card art images.

## Tech stack
- **Frontend:** Next.js (App Router) + Tailwind CSS
- **Backend/Auth/DB:** Supabase (auth, postgres, storage)
- **Hosting:** Vercel (frontend) + Supabase (free tier to start)

## Card catalog
36 unique fish cards across 3 tiers (tier = game power level, also used to weight rarity):

| # | Name | Tier |
|---|------|------|
| 1 | Bass | 1 |
| 2 | Eel | 1 |
| 3 | Flounder | 1 |
| 4 | Goldfish | 1 |
| 5 | Krill | 1 |
| 6 | Minnow | 1 |
| 7 | Piranha | 2 |
| 8 | Pufferfish | 1 |
| 9 | Red Snapper | 2 |
| 10 | Salmon | 1 |
| 11 | Sardine | 2 |
| 12 | Tuna | 1 |
| 13 | Angelfish | 2 |
| 14 | Anglerfish | 2 |
| 15 | Beluga Whale | 2 |
| 16 | Blobfish | 2 |
| 17 | Blue Marlin | 2 |
| 18 | Clownfish | 2 |
| 19 | Goblin Shark | 2 |
| 20 | Koi | 2 |
| 21 | Lionfish | 2 |
| 22 | Nurse Shark | 2 |
| 23 | Oarfish | 2 |
| 24 | Sailfish | 2 |
| 25 | Swordfish | 2 |
| 26 | Tiger Shark | 2 |
| 27 | Blue Whale | 3 |
| 28 | Catfish | 3 |
| 29 | Doby Mick | 3 |
| 30 | Giant Squid | 3 |
| 31 | Great White Shark | 3 |
| 32 | Hammerhead Shark | 3 |
| 33 | Humpback Whale | 3 |
| 34 | Manta Ray | 3 |
| 35 | Orca | 3 |
| 36 | Whale Shark | 3 |

## Database schema

```sql
-- Cards master table
create table cards (
  id serial primary key,
  name text not null,
  slug text unique not null,
  filename text not null,
  tier int not null check (tier in (1,2,3)),
  created_at timestamptz default now()
);

-- Collectible variants per card (one row per card per rarity)
create table card_variants (
  id serial primary key,
  card_id int references cards(id),
  rarity text not null check (rarity in ('common','rare','epic','legendary')),
  drop_weight int not null
);

-- User profiles (extends Supabase auth.users)
create table profiles (
  id uuid references auth.users primary key,
  username text,
  packs_available int default 0,
  created_at timestamptz default now()
);

-- Redemption codes (generated offline, printed in game boxes)
create table redemption_codes (
  id serial primary key,
  code text unique not null,
  redeemed_by uuid references profiles(id),
  redeemed_at timestamptz,
  packs_granted int default 1
);

-- User collection
create table user_collection (
  id serial primary key,
  user_id uuid references profiles(id),
  card_variant_id int references card_variants(id),
  obtained_at timestamptz default now()
);
```

## Seed data

Seed `cards` with the 36 fish above (slug = name with spaces replaced by underscores).

For each card, seed 4 rows in `card_variants`:
- common: drop_weight 60
- rare: drop_weight 25
- epic: drop_weight 12
- legendary: drop_weight 3

Seed these test codes into `redemption_codes`:
`FISH-DEMO1`, `FISH-DEMO2`, `FISH-DEMO3`, `FISH-DEMO4`, `FISH-DEMO5`

## Card art images
All 36 PNGs are in this folder (478×371px each, named by slug e.g. `Blue_Marlin.png`).
Upload them to a Supabase Storage bucket called `card-arts` (set to public).
Public URL pattern: `https://<project>.supabase.co/storage/v1/object/public/card-arts/<filename>`

## Rarity CSS treatments
Applied as CSS wrapper around the card `<img>`:

- **common** — no special border, standard card frame
- **rare** — `border: 3px solid #c8a84b` + static diagonal sheen overlay (`linear-gradient` at 135deg, 30% opacity)
- **epic** — `border: 3px solid #8a5cf7` + pulsing glow (`animation: epicPulse 3s ease-in-out infinite`)
- **legendary** — spinning conic-gradient holo behind semi-transparent card face (`animation: holoSpin 4s linear infinite`)

## Pages to build

**`/redeem`** — Code entry page
- Input + submit, validates against `redemption_codes`
- Marks code redeemed, increments `packs_available` on user profile
- Requires auth (redirect to /login if not)

**`/packs`** — Pack opening
- Shows pack count, "Open Pack" button
- Draws 5 card variants using weighted random from `card_variants`
- Guarantee at least 1 rare+ (re-roll 4th slot if all 5 are common)
- Saves draws to `user_collection`
- Card flip reveal animation, one at a time, CSS rarity effect on reveal

**`/collection`** — Gallery
- Full 36-card grid
- Owned: shown with rarity border treatment
- Unowned: dark silhouette, "???" label
- Filter tabs: All / Tier 1 / Tier 2 / Tier 3

**`/login`** and **`/register`** — Supabase email auth

## Build order
1. Init Next.js + Tailwind + Supabase client, set up `.env.local`
2. Run schema SQL in Supabase dashboard, seed cards + variants + test codes
3. Upload 36 PNGs to Supabase Storage `card-arts` bucket
4. Auth pages (login/register)
5. /redeem page
6. /packs page with flip animation + CSS rarity effects
7. /collection gallery
