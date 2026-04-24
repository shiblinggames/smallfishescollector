---
name: Small Fishes digital collectibles project
description: Next.js 16 + Supabase digital collectibles system for the Small Fishes card game
type: project
---

Building a digital collectibles web app for the "Small Fishes: Seas the Booty" physical card game. Players redeem pack codes from game boxes to unlock CSS-styled digital fish cards.

**Why:** Physical game launches with a digital bonus; codes are printed in boxes.

**How to apply:** Code lives in `smallfishes/web/` (Next.js 16 App Router). Fish art PNGs are in `fish_card_assets/fish_arts/`. Supabase handles auth + DB + storage.

**Key facts:**
- Next.js 16 uses `proxy.ts` (not `middleware.ts`) for the proxy/middleware file
- Tailwind v4 — config is CSS-only (`@import "tailwindcss"` in globals.css, no tailwind.config.js)
- 36 fish cards across tiers 1/2/3; 4 rarity variants each (common/rare/epic/legendary, weights 60/25/12/3)
- Test redemption codes: FISH-DEMO1 through FISH-DEMO5
- Supabase Storage bucket: `card-arts` (public)
- Still needs: Supabase project credentials in `.env.local`, schema+seed SQL run, PNGs uploaded to Storage
