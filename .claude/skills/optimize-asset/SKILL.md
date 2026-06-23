---
name: optimize-asset
description: Downscale + compress an oversized PNG/image in web/public with sharp before it's used. Use whenever the user uploads art that renders much smaller than its source resolution.
allowed-tools: Bash(node *) Bash(ls *)
---

Uploaded art usually comes in at 1024² and 1–2 MB but only ever renders at
≤~200–500px. Downscale + compress it with `sharp` (already installed in `web/`)
so it loads light, preserving alpha for cutouts.

Pick a target width from how big it actually displays (≈2× the max on-screen
size, for retina): item icons ~256–384px, hero/maw/chest art ~512px. When in
doubt, 512.

From `web/`, run (substitute the filename + target width):

```bash
node -e "
const sharp=require('sharp'), fs=require('fs');
const file='public/NAME.png', W=512;
(async()=>{
  await sharp(file).resize(W,W,{fit:'inside'}).png({quality:82,compressionLevel:9}).toFile(file+'.opt');
  const a=Math.round(fs.statSync(file).size/1024), b=Math.round(fs.statSync(file+'.opt').size/1024);
  fs.renameSync(file+'.opt', file);
  console.log(file, a+'KB ->', b+'KB');
})()"
```

For several files, loop the names. Report the before→after KB for each.

Notes:
- `{fit:'inside'}` keeps aspect ratio; a square cutout stays square.
- Don't add a background — alpha is preserved so transparent cutouts stay clean.
- After optimizing, the asset is ready to wire in + commit (see the `add-art`
  skill). Per project convention, commit the optimized asset alongside the code
  that references it.
- There's also a batch sweep at `web/optimize-public.mjs` for re-running across
  all of `public/` when lots of new art lands.
