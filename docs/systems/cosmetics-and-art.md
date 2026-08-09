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
