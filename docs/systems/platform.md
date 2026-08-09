# Platform — Stack, Deploy, Security, Conventions

The non-game knowledge: how the app is built, shipped, and kept safe.

## Stack & deploy

- Next.js (App Router) + Supabase (auth/postgres/storage) + Vercel. **The Next.js
  version has breaking changes vs training data** — read `web/AGENTS.md` and the guides
  in `node_modules/next/dist/docs/` before writing framework-touching code (e.g.
  `proxy.ts` replaces `middleware.ts`; Tailwind v4 is CSS-configured).
- **Deploy = push to master → Vercel auto-builds.** There is no CLI deploy.
- Verify before commit, from `web/`: `rm -rf .next/types && node_modules/.bin/tsc
  --noEmit -p tsconfig.json`, then `npm run check` (campaign/copy/badge scripts), then
  `npm run build` for anything structural.
- Local setup: `web/SETUP.md`. iOS wrapper: `web/CAPACITOR_IOS.md` (remote-URL shell;
  IAP is the App Store gate). Native Tide Run port: `ios/PORT_BRIEF.md`.

## Security posture (the convention that holds everything)

- **Anything that mutates value goes through a service-role RPC or admin-client server
  action** — RLS allows users to SELECT their own rows and little else. New tables ship
  with RLS on and SELECT-own policies; writes stay server-side.
- **Postgres re-grants EXECUTE to PUBLIC when a function is RECREATED.** A migration
  that recreates a hardened RPC silently reopens it — every function migration must
  re-apply its REVOKEs in the same file. This regressed once in production.
- After any DB change: run the Supabase advisors and re-check the hardened-function
  list. Views that would trip SECURITY DEFINER advisories use `security_invoker`.
- Rate limiting: `web/lib/rateLimit.ts`. Run tokens for game-session integrity:
  `web/lib/runToken.ts`.

## Recurring code traps (each cost a debugging session)

- `'use server'` files silently DROP non-async exports — constants live in sibling
  plain modules.
- `getSession()` (instant, fine for RLS-protected SELECTs) vs `getUser()` (verified,
  required before value mutations).
- A server prop feeding `useState` needs a resync effect; stale closures in callbacks
  need a ref mirror.
- Destructive swaps: consume-before-grant, with the removal guarding the grant.
- Flex scroll needs `minHeight: 0`; CSS `transform` breaks `position: fixed` children
  (portal to body); framer-motion transforms clobber centering transforms.
- Tours/one-time flags persist in `has_seen_*` DB columns, never localStorage.
- Perf debugging starts by diffing against the last-known-good commit, not by profiling
  from scratch.

## Copy rules (all user-facing text)

- Voice: epic + pirate charm; **no em-dashes**; nothing AI-sounding.
- **Copy whose job is explaining a mechanic is plain and literal** ("How much damage you
  deal"), flavor keeps the charm. The split is by job, not by surface.
- Mechanics explanations must be verified against the code that consumes the value.
- `web/scripts/check-copy.mts` enforces some of this on data catalogs (not yet JSX).
