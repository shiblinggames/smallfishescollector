# Seas the Booty — router

Pirate fishing web game (Next.js + Supabase + Vercel, code in `web/`). This file only
routes; read the matching doc BEFORE working in a system. Do not inline these as imports.

## Global rules (always true)
- Evergreen, player-paced. NEVER seasons, FOMO, or pay-to-win. Crew death is final.
- All art is 2D hand-painted house style — every image prompt states it.
- Copy: pirate charm, no em-dashes; mechanic explanations plain and literal.
- Currency glyphs ◆ (gems, purple) / ⟡ (doubloons, gold); no emoji icons.
- Value mutations only via service-role server code; recreated Postgres functions
  re-apply their REVOKEs.
- `web/AGENTS.md`: this Next.js version breaks training-data assumptions — read it.

## Systems (trigger → doc → when)
- fishing, dial, zones, streak, reel → docs/systems/fishing.md — any FishingGame work
- rods/hooks/reels/lines/bait, tackle shop → docs/systems/gear.md — gear tiers or gating
- selling fish, market, Exchange, contracts → docs/systems/fish-economy.md — pricing/lanes
- trawls → docs/systems/trawls.md — crew passive fishing
- voyages, routes, crew loss → docs/systems/voyages.md — daily voyage logic
- raids, combat, tides, aim bar, damage → docs/systems/raids-campaign.md — RaidCombat/raidMap
- story, Finn, chapters, finale, naming → docs/systems/story-universe.md — ANY narrative copy
- gauntlet, hardcore, blood gems, contracts → docs/systems/gauntlets.md — run state/variants
- forge, accelerator, ITEM_GRANTS → docs/systems/forge.md — item crafting or new raid items
- ship classes, augments, berth, ultimate → docs/systems/ship.md — combat ship (berth ≠ bunk)
- crew, recruits, hall, bunks, skins, assign → docs/systems/crew.md — before ANY crew change
- bounties, ranks → docs/systems/bounties.md — daily hunts, medallions
- expeditions hub, score ladder → docs/systems/expeditions-hub.md — /expeditions surface
- tavern, blackjack, slots, tide run, chips → docs/systems/tavern.md — casino wallet law
- trivia, Parlor, Pirate King → docs/systems/trivia.md — trivia work
- chart room, puzzles, world chart → docs/systems/chart-room.md — weekly puzzles
- badges, achievements, points → docs/systems/badges.md — then web/BADGES.md runbook
- levels, renown, prestige, dailies, unlocks → docs/systems/progression.md — gates/curves
- skins, pets, avatars, art prompts, slicers → docs/systems/cosmetics-and-art.md — any art
- doubloons/gems, Captain, mail, packs → docs/systems/economy-membership.md — money pipes
- deploy, security, RLS, code traps, copy rules → docs/systems/platform.md — infra/DB work
