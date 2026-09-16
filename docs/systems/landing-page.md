# The landing page

`web/app/page.tsx` (the page), `web/app/TrailerFrame.tsx` (the player),
`web/app/opengraph-image.tsx` (the link preview), and the `.lp-*` rules in
`web/app/globals.css` (the frames). Read the header comment in `page.tsx` first;
this file is the part that is about ASSETS rather than code.

## The rule

**Nothing goes in a slot until something true goes in it.** The page was
rewritten in September 2026 because its two screenshots were taken in August of
a screen that has since been deleted: they showed the five-tab bottom bar, a
"back to Shallows" zone menu, and the old `/fishing` hub, a route with no
`page.tsx` any more. A visitor who opens the game after seeing those learns that
the pictures lie, which is a worse first lesson than no pictures at all.

So a band with no capture renders as its words and takes the full width, and it
looks deliberate. Do not fill a slot with something that is nearly right.

## Dropping the art in

The page looks for **exact filenames under `web/public/lp/`** at module load and
lays itself out around whatever is there. Adding a capture is dropping the file
in and deploying. There is nothing to edit in the page.

| File | Frame | Shape | What is in it |
|---|---|---|---|
| `sea-desktop.jpg` | browser window | 16:10 | The chart under sail. Fog rolled back behind, dark ahead. Hull mid-water, an isle or a mooring in view, the compass legible. |
| `sea-phone.jpg` | phone | 9:19 | The same sea, portrait. |
| `cast-desktop.jpg` | browser window | 16:10 | The dial mid-cast, needle coming round to the perfect band. |
| `cast-phone.jpg` | phone | 9:19 | The PERFECT moment landing. The old `lp_shot_cast.jpg` is the composition to beat: the fish in the rowboat with the parrot, the dial, the word. It was the best thing on the old page. |
| `fight-desktop.jpg` | browser window | 16:10 | A turn of ship combat, aim bar mid-swing, both hulls and the log in shot. |
| `fight-phone.jpg` | phone | 9:19 | The same, portrait. |
| `trailer.mp4` | 16:9 | 1920x1080 | See below. |
| `trailer-poster.jpg` | 16:9 | 1920x1080 | A real frame from the trailer, not a title card. Most visitors will never press play, so this still is doing a screenshot's job. |

Notes on capturing:

- **Both shots of a band, or one, or none.** With a desktop and a phone the
  phone rides the desktop shot's corner. With one it stands alone. With none the
  band is its words.
- **Shape matters more than size.** Every frame is a fixed box and the capture
  is cropped to fill it, so a capture at the wrong aspect loses its edges. Shoot
  the desktop shots in a window at roughly 16:10 (1600x1000 is plenty).
- **JPEG, and compress them.** House rule: run them through sharp. Aim under
  300KB each.
- **No browser chrome in the capture.** The frame draws its own title bar with
  the address on it. A second set of tabs inside the picture reads as a mistake.
- **Nothing personal in shot.** The captures are public. Watch the corner for a
  real username, and for anything from a friend list.

## The trailer

`TrailerFrame` takes either a hosted file or a YouTube id (set
`YOUTUBE_TRAILER_ID` at the top of `page.tsx`). Hosting it ourselves is the
better watch: no third-party chrome, and no suggested videos pasted over the
last frame. YouTube is free and brings its own furniture.

Either way it is a **still until somebody presses it**. No autoplay: a muted
autoplay trailer is a silent trailer, and the sound is half of what a trailer is
for. It also would cost every visitor a video download to decide they did not
want one, on a page whose selling point is that nothing has to be downloaded.

### What it should show, in order

Sixty to ninety seconds. The argument the page makes in words, made in motion.

1. **The sea, first and longest.** The hull under sail, fog peeling back, the
   camera keeping up. This is the thing the old page never said and it is what
   the game now is. Give it twenty seconds and do not cut it fast.
2. **A cast.** The needle turning, the window narrowing, the band hit clean.
   Hold on PERFECT. This is the thing a player does a thousand times and it has
   to feel good in the trailer or it will not feel good in the game.
3. **Something landing that is worth landing.** A giant off the Ancient Deep is
   the shot, if the account has one.
4. **The turn.** Night falling, the lantern coming on, the water going dark.
5. **A fight.** The aim bar swinging, a shot connecting, a hull taking it.
6. **The title, and the address.** Nothing else on the end card. No feature
   list, no "coming soon", no laurel.

### What it must not do

- No voice-over explaining the mechanics. The game's own copy never explains
  itself in that voice and the trailer should not either.
- No claim the page does not make. Check the page's copy against
  `docs/systems/` before writing a single line of text on screen.
- No stock trailer music that fights the game's own soundtrack. There are four
  tracks already in `web/public/` and they were written for this.
- No frames from a build that is not live.

## The link preview

`app/opengraph-image.tsx` generates `og:image` at build time: the game's night
sea cropped to the band with the moon in it, the title set in Cinzel and Karla
read off `web/assets/`. Satori has no system fonts and no network, so the faces
and the plate are bundled beside it. The budget is 500KB for the lot.

This is the most-seen page the game has, because far more people see a link than
open it. Before September 2026 there was no image at all and the description was
`Redeem your pack code and collect all 36 digital fish cards`, which is an
economy the game retired months ago.

## Editing the words

**Every word on the page is in `web/lib/homeCopy.ts` and nothing else is in it.**
No markup, no styling, no logic. That file is the one to open; `page.tsx` builds
itself around whatever is in it and never needs touching to change a sentence.

It holds the masthead, the buttons, every band, the closing line, the search
description, the social card lines and the screenshot alt text. Bands are a
list: add one, delete one, reorder them, and the art follows its `art` key while
the sides keep alternating and the rise delays recompute from position. A band
with `art: null` renders as words at full width.

Three things make it safe to edit by hand:

- **Every string is in backticks**, so apostrophes and quote marks can be typed
  freely. Only a backtick itself and the sequence `${` will break it.
- **`npm run check` polices it**, as the `homepage` source in
  `scripts/check-copy.mts`. An em-dash or en-dash anywhere in that file exits 1,
  and `prebuild` runs it, so a dash cannot reach the site. Verified by injecting
  one.
- **`npm run build` fails loudly** on broken syntax, so nothing malformed
  deploys.

The numbers in that file are checked against the code (see "The copy" below).
Changing one means checking that section first.

One thing is NOT in there: `web/public/manifest.json`, the installed-app card.
It is JSON so it cannot import, and it changes about once a year.

## The voice

**The page is first person and it is Kong's voice, not a trailer's.** Settled
2026-09-16, after a first draft came back written well and written by nobody:
"Four chapters that open on coastal pirates and close somewhere considerably
worse." Good sentence. Not one he would ever say, and the whole advantage a game
made by one person has over a studio is that there is a person there.

The reference is how he writes to testers on the Jira board (see the Jira
comment tone memory, which quotes him at length). What carries over:

- **First person, and he owns things in it.** "I made a fishing game and it got
  a bit out of hand." "There's a finale I'm pretty proud of." Not "the game
  features".
- **Contractions everywhere, and uneven rhythm.** Fragments are fine. A run of
  evenly-weighted declarative sentences is the thing that reads as generated even
  with every other tell removed.
- **Numerals, casually.** "27 isles", "every 48 minutes", not "twenty seven".
- **Spaced hyphens ( - ) for an aside.** Never em-dashes, which is the house
  rule anyway.
- **He volunteers what is still rough.** "Still in open beta, so expect the odd
  rough edge." That is worth more on a landing page than polish.
- **Plain everyday words.** "you just keep those", "sort of the whole problem".

What does NOT carry over from the Jira voice:

- **The hedging.** "I believe this is fixed" is right on a bug ticket and wrong
  in a pitch. Nothing on the page hedges.
- **The doubled exclamation marks and the emoji.** "Ty!!" and the P.S. hearts
  are right in a reply to a friend and read as manic at landing-page size.
  Warmth, not volume.
- **The @mention opener and the sign-off.** There is nobody to address.

If the copy is ever rewritten, rewrite it out loud. If it is not a sentence he
would say to somebody at a bar, it does not go on the page.

## The copy

Every number on the page is checked against the code, and the ones that were
wrong were wrong quietly for months. As of 2026-09-16:

- **152 catchable species** across **5 zones**. The page says "more than 150".
  The `public/fish/` art count is 154 and is not the species count.
- **9 boss raids**, not eight: 8 numbered plus The Sunken Hand as a coda. Four
  chapters and a finale. The finale has no numeral, so never "Chapter V".
- **The first two raids are coastal pirates**, not the outfit. The Finndicate is
  not named until Chapter II, which is why the page says the chapters "open on
  coastal pirates".
- **9 sea regulars** keep rapport. The 5 zone buyers are separate people and
  keep none.
- **27 isles**, **12 dig sites**, a **48-minute** day.
- **Crew cap 100**, and crew death is permanent. This is a pillar, so it is on
  the page.
- **Captain is $9.99 once, lifetime.** Never call it a subscription. It gates
  the deep end (Ancient Deep, Chapter IV, the finale, Don's Gauntlet, Hardcore,
  Renown) and **no rate anywhere**. Chapters I to III are free in full.

Do not claim: a live contest or prize race (all are finished and the beta prize
contest was cancelled on 2026-09-15), Crown & Anchor (retired), ship PvP
(removed), card packs or redemption codes (retired), an `/expeditions` hub or a
`/crew` page (both redirects), a gauntlet leaderboard (personal ladders only),
or a Steam version (parked, the game stays web-based).
