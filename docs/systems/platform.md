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
  IAP is the App Store gate). Tide Run is its OWN iOS app now and is out of this
  codebase entirely: `ios/PORT_BRIEF.md`, and see tavern.md for what came out.

## Anti-cheat, as a browser game has it (2026-09-16)

There is no anti-cheat program to install in a browser. What exists is three things: what
the server decides, what behaviour can be flagged, and what is done about a flag. The game's
structural advantage is that there is NO player-to-player economy (no trading, no gifting),
so a bot can only inflate its own account and, with no prizes on the boards, the industrial
motive that drives botting elsewhere does not exist. What remains is the occasional tester
with Postman, which is what the two incidents to date were.

**Signals** land in `anomaly_flags` via `lib/anomaly.flagAnomaly` (advisory, never blocks):
cap trips on reward endpoints, implausible perfect streaks, chart puzzle forgeries, and the
**honeypot** (`app/actions/honeypot.ts`, severity 5): a server action the real client never
calls, reachable only by reading the bundle or replaying requests, so it has no honest trigger.

**The freeze switch** (`app/dev/stats/actions.ts`): a button per flagged account on the admin
stats page. It sets `profiles.frozen` (the record) and `auth.users.raw_app_meta_data.frozen`
(the gate); `proxy.ts` reads the latter off `getUser()` with no extra query and sends a frozen
account to `/frozen` (403 on POST). Nothing is deleted. Review first, press second; act in
batches rather than on detection, so a script author cannot tell what tripped.

**Deliberately not done:** third-party anti-cheat SDKs (none work in a browser), obfuscation,
IP bans, CAPTCHAs in the loop, automatic bans. Timing-variance flags wait for honest baselines
from live traffic. Server-authoritative dial and fights remain the structural fix if a forged
number ever hurts anyone but the forger. Vercel's bot protection is a dashboard toggle
(Firewall, managed rulesets), not code.

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
- Two scripts enforce the dash rule and both run in `npm run check` and `prebuild`:
  `web/scripts/check-copy.mts` on the data catalogs in `lib/`, and (since 2026-09-16)
  `web/scripts/check-page-copy.mts` on everything in `app/` and `components/`. The second walks
  the TypeScript AST for string literals, template parts and JSX text, so the comments, which are
  full of dashes on purpose, are invisible to it. A lone dash as an empty value and a numeric range
  are typography and pass. `generate.ts` files (model prompts) and the admin benches are skipped.
  Before it existed, 289 dashes sat in component copy, 126 of them in the raid combat log.
- **"Press", not "tap"**, in copy, buttons and aria labels, because a mouse does not tap. "Pick"
  where the action is a choice. The iPhone install steps keep "tap" on purpose.

## The modal width is `--modal-w`

```css
:root { --modal-w-base: min(560px, 100%); --modal-w: var(--modal-w-base); }
```

**One width for every panel that opens over a page.** 560 is the cap — enough that a line of
text stays readable on a wide monitor — and on anything narrower it is simply the room the
shell has. Use it as `maxWidth: 'var(--modal-w)'` **alongside `width: '100%'`**.

It was `clamp(360px, 46vw, 560px)` first and **the floor was a bug**: on a phone 46vw is about
200px, so every modal fell to the 360 floor, which on a 430px handset left fifty pixels of dead
margin down both sides and made every panel narrower than the page it opened over. Modals had
always been `width: 100%` capped at 440-480 — on a phone, full width less the shell's margin —
and that is what they should have stayed. The `100%` resolves against the shell's padded box,
so a nested modal measures its own space rather than the window's.

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

**The first-run path takes it too.** It was the last corner that did not, and it was the worst
place for it: setup was three separately styled cards, so the very first panel in the game
resized under the captain as they filled it in — step one took `--modal-w` (up to 560), steps
two and three were hard-coded to 400, and step three changed the padding as well. Nothing chose
those numbers; the token landed on the first card when modals were standardised and the other
two were missed. Across the first minute a captain met six widths (360/400/430/540/560), four
radii (14/16/18/20) and no `PopupShell` at all.

`SetupModal` is now one card object spread by all three steps, on the shell. That last part is
not cosmetic: the old wrapper centred a card in a fixed box with no scroller, so on a short
screen the avatar step — a live preview, two rows of twelve swatches and a button — overflowed
equally off the top and the bottom with nothing to scroll, and **setup could not be completed on
that device at all**. `StepTourModal` is two components in one trench coat: its `center`
placement is a modal and takes the width, the radius and the shadow; its anchored placements are
coach marks and keep theirs. `GuideCoach` stays a 430px HUD strip with no backdrop — it is a
coach mark, not a modal, and `PopupShell` is explicitly not for those.

A guide's accent colour follows the SPEAKER, not the step. Doby was `#60a5fa` on the first setup
screen and `#c8a870` on the second: one character in two colours, on two consecutive screens.

**Two things do not take it:**

- **Art moments.** A crate opening, a legendary skin, an ancient's rank-up, a rescued boat:
  those are compositions built around a picture at a chosen size, and widening one scales the
  moment rather than giving it room. They keep their tuned widths.
- **`VoyageBoard`, which is wider (680) on purpose** — it is a board of routes, each with a
  crew muster and a reward line, and the note in the file explains why. A panel may exceed the
  default when its content is genuinely a table; it may not sit below it just because nobody
  chose.

## Dialogs: what `PopupShell` owns (2026-09-16)

Every sheet built on `components/PopupShell.tsx` gets three things without knowing, and no sheet
should implement them again on top:

- **Escape closes the topmost open shell, and only that one.** A module-level stack says which is
  on top. The listener is in the CAPTURE phase and stops the event there, so the sea's own
  Escape chain in `SeaMap.tsx` (23 branches, one per panel) and `KeyboardAdvance` never see the
  same press. It calls the same `onClose` the backdrop click does, so a caller that blocks the
  backdrop while busy blocks Escape for free.
- **The page behind stops scrolling** under a mouse wheel: `overflow: hidden` on body, refcounted
  across nested shells, with the scrollbar's width padded back so nothing shifts sideways on
  Windows. Not `lib/bodyScrollLock.ts`: that pins the body to the top and is for combat screens.
- **Focus moves into the wrapper on open and back to what had it on close.** Not a full trap.

`role="dialog"` and `aria-modal` sit on the wrapper. Hand-rolled overlays (the gem store, the
membership modal, the fishing card's own sheets) carry their own Escape in the capture phase with
the same stop, and the two checkout modals refuse both Escape and the backdrop while the embedded
Stripe form is up, so a stray press cannot discard a half-typed card.

Desktop affordances that are now global in `globals.css`: `.tap:hover` lifts a pixel (a transform,
never a filter, which would make the element the containing block for fixed descendants), a gold
`:focus-visible` ring on every control at zero specificity, and `button:not(:disabled)` is a
pointer. The phone tab bar reserves its 64px through `--tabbar-safe`, which is 0px from 640px up;
never hard-code `64px + env(safe-area-inset-bottom)` for it again.
