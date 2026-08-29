#!/usr/bin/env node
// ── ART THAT NEVER QUITE GOT ITS BACKGROUND REMOVED ─────────────────────────
//
// A generated sprite is cut out of its background by a chroma key, and a chroma
// key does not always finish the job: what is left is a faint, near-uniform
// haze over the WHOLE rectangle, at an alpha low enough to look like nothing on
// its own. On a dark sea it is not nothing. It is a visible box around the art,
// and it took someone squinting at the Mainland to notice.
//
// `mainland-town.png` had NO fully transparent pixel anywhere in it. Its
// corners sat at alpha 11 to 26 and 47% of the image was in that band.
//
// ── WHY A THRESHOLD IS SAFE HERE, AND WHEN IT IS NOT ────────────────────────
//
// A hard alpha cut is a blunt instrument: applied carelessly it eats the soft
// edges that stop a sprite looking cut out with scissors. So this does not pick
// a number. It looks at the alpha HISTOGRAM and cuts only where the histogram
// says there is nothing to lose — the haze and the real art are two separate
// populations, and a sprite with this problem has an empty band between them.
//
// Mainland: 46.7% of pixels at alpha 1-25, then NOTHING between 36 and 50, then
// the genuine antialiased edges above it. Cutting at 40 removes the haze and
// touches no real pixel, which is why it is lossless rather than a compromise.
//
// If a file has no empty band, it is REPORTED AND SKIPPED. That is the whole
// safety property: art whose haze overlaps its own soft edges cannot be fixed
// this way and wants re-cutting at the source instead.
//
//   node audit-art-alpha.mjs                 # report on the chart's art
//   node audit-art-alpha.mjs --apply         # and clean the ones that are safe
//   node audit-art-alpha.mjs --apply a.png   # or name files directly

import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const named = args.filter(a => !a.startsWith('--'))

/** Anything the chart draws, which is where this bit us. */
function chartArt() {
  const src = fs.readFileSync(path.join('app', '(app)', 'sea', 'chart.ts'), 'utf8')
  const hits = src.match(/art: '\/[^']+\.png'/g) ?? []
  return [...new Set(hits.map(h => h.slice(6, -1)))].map(p => path.join('public', p))
}

/** A sprite is SUSPECT when it has almost no fully transparent pixels. Real
 *  cut-out art is mostly empty space; a rectangle of haze has none at all. */
const SUSPECT_BELOW = 5

/** Only ever look for the gap down here. A band of emptiness at alpha 180 is
 *  not a haze boundary, it is just how that painting happens to be shaded. */
const GAP_CEILING = 90

/** And the gap has to be a real one rather than a single empty bucket. */
const GAP_MIN = 8

async function look(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true })
  const c = info.channels
  const hist = new Array(256).fill(0)
  for (let i = 3; i < data.length; i += c) hist[data[i]]++
  const total = info.width * info.height
  return { hist, total, w: info.width, h: info.height }
}

/** The widest run of empty alpha values below the ceiling, if there is one. */
function findGap(hist) {
  let best = null, run = 0
  for (let a = 1; a <= GAP_CEILING; a++) {
    if (hist[a] === 0) {
      run++
      if (!best || run > best.len) best = { end: a, len: run }
    } else run = 0
  }
  if (!best || best.len < GAP_MIN) return null
  // Cut in the MIDDLE of the gap, not at either edge: the middle is the value
  // furthest from anything the art actually uses.
  return Math.round(best.end - best.len / 2)
}

let cleaned = 0, skipped = 0
for (const file of named.length ? named : chartArt()) {
  if (!fs.existsSync(file)) { console.log(`missing   ${file}`); continue }
  const { hist, total, w, h } = await look(file)
  const clear = (hist[0] / total) * 100
  if (clear >= SUSPECT_BELOW && !named.length) continue

  const haze = hist.slice(1, 36).reduce((a, b) => a + b, 0)
  const cut = findGap(hist)
  const head = `${file}  ${w}x${h}  clear ${clear.toFixed(1)}%  haze ${(haze / total * 100).toFixed(1)}%`

  if (cut == null) {
    skipped++
    console.log(`${head}\n  SKIP: no empty band below alpha ${GAP_CEILING}. Its haze`
      + ` overlaps its own soft edges, so a cut would eat them. Re-cut at source.`)
    continue
  }
  const lost = hist.slice(1, cut + 1).reduce((a, b) => a + b, 0) - haze
  console.log(`${head}\n  cut at alpha ${cut} (empty band), removing ${(haze / total * 100).toFixed(1)}%`
    + `${lost > 0 ? `, plus ${lost} px of real edge` : ', touching no real pixel'}`)

  if (!apply) continue
  const { data, info } = await sharp(file).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true })
  const c = info.channels
  for (let i = 3; i < data.length; i += c) if (data[i] <= cut) data[i] = 0
  await sharp(data, { raw: { width: info.width, height: info.height, channels: c } })
    .png({ compressionLevel: 9 })
    .toFile(file + '.tmp')
  fs.renameSync(file + '.tmp', file)
  cleaned++
}

console.log(apply
  ? `\ncleaned ${cleaned}, skipped ${skipped}`
  : `\n(dry run — pass --apply to write)`)
