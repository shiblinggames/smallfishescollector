// optimize-public.mjs — batch downscale + recompress oversized art in web/public.
//
// Why: art ships at generation size (1024px+, 0.7–4.6MB) but displays at a
// fraction of that (most slots are 110–440 CSS px; 3x DPR worst case still
// needs ~1300px only for full-bleed heroes). 276MB of public assets means
// slow first loads and decode hitches on mobile. This walks web/public and
// rewrites anything heavy IN PLACE (same filename + format, so no code
// changes), capped to a sane max dimension and recompressed:
//   PNG  → max WIDTH 1024px (height follows aspect), palette quantization (q90)
//   JPEG → max WIDTH 1280px (full-bleed @3x territory), mozjpeg q78
//   WebP → max WIDTH 1024px, q82
// Width-only caps on purpose: lots of scene art is very tall (1024x4128
// zone backdrops, 1536x2752 page backgrounds) and a square fit-inside cap
// would crush the WIDTH to ~400-900px — visibly soft on retina full-bleed.
// A file is only overwritten when the rewrite saves >10% — borderline files
// keep their originals. Originals are recoverable from git history.
//
// Skips: models/ (3D), audio, svg/ico/json/fonts, anything ≤ 250KB.
//
// Usage (from web/):  node optimize-public.mjs          # dry run, prints table
//                     node optimize-public.mjs --apply  # write files

import sharp from 'sharp'
import { readdir, stat, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.join(process.cwd(), 'public')
const APPLY = process.argv.includes('--apply')
const MIN_BYTES = 250 * 1024
const SKIP_DIRS = new Set(['models'])
const EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

const PNG_MAX = 1024
const JPEG_MAX = 1600
const WEBP_MAX = 1024

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(full)
    } else {
      yield full
    }
  }
}

const rows = []
let totalBefore = 0
let totalAfter = 0

for await (const file of walk(ROOT)) {
  const ext = path.extname(file).toLowerCase()
  if (!EXTS.has(ext)) continue
  const { size } = await stat(file)
  if (size < MIN_BYTES) continue

  const input = await readFile(file)
  let img = sharp(input)
  const meta = await img.metadata()

  let out
  try {
    if (ext === '.png') {
      out = await sharp(input)
        .resize({ width: PNG_MAX, withoutEnlargement: true })
        .png({ palette: true, quality: 90, effort: 7 })
        .toBuffer()
    } else if (ext === '.webp') {
      out = await sharp(input)
        .resize({ width: WEBP_MAX, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer()
    } else {
      out = await sharp(input)
        .resize({ width: JPEG_MAX, withoutEnlargement: true })
        .jpeg({ quality: 78, mozjpeg: true })
        .toBuffer()
    }
  } catch (e) {
    console.error(`SKIP (error) ${path.relative(ROOT, file)}: ${e.message}`)
    continue
  }

  // Only take wins worth having — borderline files keep their originals.
  if (out.length >= size * 0.9) continue

  rows.push({
    file: path.relative(ROOT, file),
    dims: `${meta.width}x${meta.height}`,
    before: size,
    after: out.length,
  })
  totalBefore += size
  totalAfter += out.length

  if (APPLY) await writeFile(file, out)
}

rows.sort((a, b) => (b.before - b.after) - (a.before - a.after))
const kb = n => `${Math.round(n / 1024).toLocaleString()}KB`
for (const r of rows) {
  console.log(`${r.file.padEnd(52)} ${r.dims.padEnd(11)} ${kb(r.before).padStart(9)} -> ${kb(r.after).padStart(8)}  (-${Math.round((1 - r.after / r.before) * 100)}%)`)
}
console.log(`\n${rows.length} files, ${kb(totalBefore)} -> ${kb(totalAfter)}  (saves ${kb(totalBefore - totalAfter)})`)
console.log(APPLY ? 'APPLIED — files rewritten in place.' : 'DRY RUN — re-run with --apply to write.')
