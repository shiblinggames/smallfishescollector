---
name: add-art
description: Wire a newly-uploaded image into the app — optimize it, swap it into the constant/path that references it, and commit asset + code together. Use when the user says they uploaded a PNG to use for X.
---

The repeatable "I uploaded NAME.png, use it for X" workflow.

1. **Confirm + inspect.** Check the file exists under `web/public/` and read
   its dimensions / alpha:
   ```bash
   node -e "require('sharp')('public/NAME.png').metadata().then(m=>console.log(m.width+'x'+m.height, m.hasAlpha?'alpha':'opaque'))"
   ```

2. **Optimize it** (see the `optimize-asset` skill) — downscale to ~2× its
   display size and compress, preserving alpha. Overwrite the original so the
   path stays the same.

3. **Find what it should replace.** Grep for the current image path/constant
   it's swapping in for (e.g. `MAW_IMG`, a `CHEST_ART` entry, a raid item's
   `image`, a card's `image="..."`). Update ONLY the intended references —
   watch for unrelated items sharing a placeholder path (leave those).

4. **Verify it renders sanely.** Most art slots use `objectFit: 'contain'` in a
   reserved box, so a square cutout fits without distortion. If it's a sprite
   sheet (boat/hat/rod/fish/badge), it needs slicing first — use the matching
   `web/slice-*.mjs` script, not a raw swap.

5. **Typecheck** (`cd web && rm -rf .next/types && node_modules/.bin/tsc --noEmit`)
   if you changed code.

6. **Commit asset + code in ONE commit.** Per project convention, when code
   points at a new `/public` asset the asset must be staged too — check
   `git status` for untracked files before committing. End the message with the
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer. Then it's
   ready to `deploy`.

Tips:
- One sprite, many uses: if the same art covers several variants (e.g. one chest
  for every tier), swap the shared constant and differentiate by EFFECTS, not by
  duplicating the image — that's the established pattern.
- Commit the optimized file, never the raw multi-MB upload.
