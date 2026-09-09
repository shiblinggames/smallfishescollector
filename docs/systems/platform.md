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

## The modal width is `--modal-w`

```css
:root { --modal-w: clamp(360px, 46vw, 560px); }
```

**One width for every panel that opens over a page**, and a clamp rather than a number: 46vw
so a modal grows with the window, floored at 360 so it never gets silly on a small laptop,
capped at 560 so a line of text stays readable on a wide monitor. Use it as
`maxWidth: 'var(--modal-w)'` **alongside `width: '100%'`** — on a phone the shell's own
padding decides and the clamp never binds.

This section used to say the house width was 480, and it was never true. Every dialog in the
game had picked its own somewhere between 280 and 520 — a hundred of them — so opening two
panels in a row on a desktop resized the thing under your cursor every time, and all of them
were phone columns stranded in the middle of a monitor. `FishingHere` had already found this
out on its own and standardised its own four panels at 560.

`ModalSheet` defaults to the token, so a sheet built on the kit needs nothing. `.page-col`
(980) is the PAGE column and a different measurement; do not reach for it on a modal.

**Some pages take the modal's width too**: `.page-col.page-col-modal` caps a page column at
`--modal-w`. The leaderboard, the badges wall and the profile are READS — a ranked list, a
grid of medals, one captain's record — and at 980 they were a third measurement in a game
otherwise made of 560px panels: you would close a modal on the sea and land on a page nearly
twice as wide saying the same kind of thing. The class only moves the ceiling; `.page-col`
keeps the padding and the centring.

**A modal inside a modal steps in.** One width for everything was the point, and it broke
nesting: a confirm opened from a panel used to be 300px against the panel's 480, so on a phone
it sat visibly inside its host — at one width they share edges, and a sheet over a sheet at
identical edges does not read as ON it, it reads as having REPLACED it. `PopupShell` carries a
`ModalDepth` context and each level adds 16px of side padding AND narrows `--modal-w` by the
same amount, so a nested modal insets on a phone (bound by the padding) and on a desktop (bound
by the width), without any modal having to know it is nested — a component opened from two
places cannot know. The step is computed from `--modal-w-base`, never from `--modal-w`: a
custom property that reads itself is a cycle and resolves to nothing. Two levels, then it
stops; a third-level dialog would be a slot.

**A modal is never taller than the room the shell left it.** Cap height with `100%` alongside
any `vh`: `maxHeight: 'min(84vh, 100%)'`. `vh` is the LARGE viewport on a phone — the one with
the browser's toolbars hidden — and `PopupShell` has already reserved the top for the header and
the bottom for the tab bar and the home indicator, so a card measured against the whole window
ignores both and runs off underneath them. The `100%` IS that padded box.

**And a scroll container must never be `pointer-events: none`.** It is a tempting way to let a
tap on the empty space around a card reach the scrim behind it, and it also hands every wheel
and every touch to whatever is underneath — so the one element with `overflowY: auto` on it
never sees a scroll gesture, and the sheet stops dead at the fold (this is exactly what happened
to the Wargate). Close on `e.target === e.currentTarget` instead, which is what "tap the empty
space" actually means and costs the sheet nothing.

**Two things do not take it:**

- **Art moments.** A crate opening, a legendary skin, an ancient's rank-up, a rescued boat:
  those are compositions built around a picture at a chosen size, and widening one scales the
  moment rather than giving it room. They keep their tuned widths.
- **`VoyageBoard`, which is wider (680) on purpose** — it is a board of routes, each with a
  crew muster and a reward line, and the note in the file explains why. A panel may exceed the
  default when its content is genuinely a table; it may not sit below it just because nobody
  chose.
