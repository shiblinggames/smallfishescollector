# Cosmetics & the Art Pipeline

Every purely-visual system (skins, pets, avatars, hats, backgrounds) and the one pipeline
that produces all game art.

## THE STYLE LOCK (global rule — survives every redesign)

All game art is **2D hand-painted in one consistent house style** — painterly, warm,
storybook-pirate. Every image prompt (fish, badges, crew, bosses, icons, medallions)
must request this style explicitly; never accept 3D renders, photorealism, or flat
vector. Generation runs through Kie.ai; icon-type art uses the **magenta chroma-key**
background convention, keyed to transparent PNG in post.

## Pipeline (repo-rooted, scriptable)

1. Generate sheets (Kie.ai, house-style prompt; badges use the reusable 6-per-sheet
   prompt where counts are never drawn as digits).
2. Slice: `slice-fish.mjs`, `slice-badges.mjs` (repo root); `web/slice-boat.mjs`,
   `slice-hat.mjs`, `slice-rod.mjs`, `trim-cosmetic.mjs` per cosmetic type. Each
   cosmetic type has its own touch-list of files to update — read the header of its
   slicer.
3. Compress with sharp before committing (`compress-public-images.mjs`,
   `web/optimize-public.mjs`). **sharp gotcha**: never chain `.extract().trim()` in one
   pipeline — split into two awaited operations or the extract silently misapplies.
4. **Commit the asset WITH the code that references it** — an image referenced by a
   pushed component but not staged 404s in production.
5. Audit: `audit-fish-images.mjs` (with `--apply`) checks fish art wiring.

## Rendering rules

- Art renders in RESERVED boxes (`objectFit: contain` in fixed-dimension containers) so
  layout never shifts while images load.
- No emojis as UI icons, ever. No solid-gold fills — translucent tinted gold. Panels
  over art need a solid opaque base layer.

## The cosmetic systems

- Crew skins: `web/lib/crewSkins.ts` (+ `ChaseSkinFx` for chase-tier animation)
- Ship skins `web/lib/shipSkins.ts`; hats `web/lib/hats.ts`; boats `web/lib/boats.ts`
- Pets: `web/lib/pets.ts` — **overlay coordinates are per-species; never copy another
  species' coords** as a starting point, they are hand-fit.
- Avatars: `components/CharacterAvatar.tsx`, palette in `web/lib/avatarColors.ts`,
  character normalization in `web/lib/characters.ts`
- Profile backgrounds: `web/lib/profileBackgrounds.ts`

## Connects to

[badges.md](badges.md), [crew.md](crew.md), [ship.md](ship.md). Sprite-sheet uploads to
Supabase Storage go via curl + service-role key ([platform.md](platform.md)).

## Boat stats — the hull stops being only a costume

`lib/boats.ts`. Two axes, doing two different jobs, and neither can do the other's.

**`trim` is a CHOICE.** -0.12 to +0.12, splitting a hull's budget between top speed and
agility (acceleration and how fast she answers the helm). Speed is the long haul out to the
Ancient Deep; agility is everything you do once you are there — pulling alongside a drifting
trader, threading a wreck field, getting under way after a cast. **The hardest rig in the
fleet either way is on a 5,000-doubloon boat** (Desert, Pistachio), so no amount of money
buys a better *answer* — there isn't one.

**`grade` is a REWARD.** A multiplier on *both* numbers at once, so a fine hull is better at
everything without telling you which way to sail. Working hulls are 1.00; the ladder runs
50k → 1.03, 500k → 1.05, 1M → 1.07, with the achievement boats at 1.04–1.05.

| hull | acquired | speed | agility | rig |
|---|---|---|---|---|
| Pistachio | 5,000 ⟡ | 88% | 112% | Nimble |
| Desert | 5,000 ⟡ | 112% | 88% | Long-haul |
| Charcoal / Offwhite | free | 92% / 108% | 108% / 92% | — |
| Fire, Ice, Jet Black | gems | 100% | 100% | Balanced |
| Golden | 50,000 ⟡ | 109% | 97% | Fast |
| Ethereal | 500,000 ⟡ | 95% | 116% | Nimble |
| Chromium | 1,000,000 ⟡ | 118% | 96% | Long-haul |

A Chromium genuinely out-sails a Desert, which is the point of a million doubloons. It does
not out-sail it in a direction the Desert's owner did not choose.

Verified monotonic along the doubloon ladder and the achievement ladder **separately**. They
are different currencies and comparing them on one axis is meaningless — an early check did
exactly that and reported a failure that was not there.

### The gem hulls stay at baseline

**Gems are bought with real money** (see the Stripe webhook, `metadata.kind === 'gems'`), so
Fire, Ice and Jet Black are `grade 1, trim 0` and must stay there. Doubloons and achievement
points are earned by playing, so a premium on those is progression; a premium on gems is a
sale. No script enforces this — it is a per-boat decision, so make it deliberately.

Note the field is **`gemPrice`, not `gemCost`**. Grepping the wrong name returns nothing and
reads as "no gem boats exist", which is exactly the mistake that put stats on all three in
the first pass.

### Where it surfaces

- The **Boat slot** in the gear grid carries the rig label under the name.
- The picker is titled **"The Hull"**, not "Boat Colors", and says the hull decides how she
  handles — a row of thumbnails cannot.
- **Tapping a boat** shows Speed and Agility as a comparison *against the hull you sail now*
  (`+6pp` / `-4pp`), because that is the actual question, with the absolutes above it.
- The **Shipyard** shows the equipped hull's two numbers under the boat.

The hull TIER upgrade (`lib/shipyard.ts`) is untouched and multiplies on top: that is the
ladder everyone climbs, this is the boat you climb it in.
