// Audit every PNG in web/public/fish for sprite-sheet bleed (stray blobs of
// adjacent sprites) and off-center subjects. The slicer that produced these
// images can leave a thin strip of the neighbouring sprite on the edge of
// each tile (see seahorse.png on 2026-05-16). This script flags every fish
// with that problem and, when run with --apply, fixes them — masks out the
// stray blob, re-crops to the main subject, and re-pads symmetrically so
// the fish is horizontally centered.
//
// Usage:
//   node audit-fish-images.mjs              # dry run — list problems only
//   node audit-fish-images.mjs --apply      # rewrite the problem images
//
// Heuristics:
//   - Stub blob: any connected component < 5% of the largest blob's area.
//   - Off-center: |leftPad - rightPad| > 5% of canvas width.
//   - Padding: re-emit with 12% transparent margin on each horizontal edge.
//   - Vertical layout is preserved (original canvas height kept).

import sharp from './web/node_modules/sharp/lib/index.js'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FISH_DIR  = path.resolve(__dirname, 'web/public/fish')

const APPLY                = process.argv.includes('--apply')
// Optional comma-separated filename whitelist (with or without .png).
// Lets us run the audit on a subset, e.g. just the ancient-deep trophies:
//   node audit-fish-images.mjs --only=megalodon,plesiosaurus,...
const ONLY_ARG             = process.argv.find(a => a.startsWith('--only='))
const ONLY                 = ONLY_ARG
  ? ONLY_ARG.slice('--only='.length).split(',').map(s => {
      const t = s.trim()
      return t.endsWith('.png') ? t : `${t}.png`
    })
  : null
const STUB_AREA_THRESHOLD  = 0.05  // blob is a stub if < 5% of main blob area
const OFFCENTER_THRESHOLD  = 0.05  // off-center if pad-diff > 5% of width
const PAD_PCT              = 0.12  // horizontal margin around content

/** Flood-fill connected components of opaque pixels. Returns one entry per
 *  blob with area + bounding box. Uses a stack-based 4-neighbour walk and
 *  a packed Uint8Array visited mask so it stays cheap on large images. */
function findBlobs(alpha, w, h) {
  const visited = new Uint8Array(w * h)
  const blobs = []
  for (let i = 0; i < w * h; i++) {
    if (!alpha[i] || visited[i]) continue
    let area = 0, minX = w, maxX = -1, minY = h, maxY = -1
    const stack = [i]
    visited[i] = 1
    while (stack.length) {
      const p = stack.pop()
      const x = p % w, y = (p - x) / w
      area++
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
      if (x > 0 && alpha[p - 1] && !visited[p - 1]) { visited[p - 1] = 1; stack.push(p - 1) }
      if (x < w - 1 && alpha[p + 1] && !visited[p + 1]) { visited[p + 1] = 1; stack.push(p + 1) }
      if (y > 0 && alpha[p - w] && !visited[p - w]) { visited[p - w] = 1; stack.push(p - w) }
      if (y < h - 1 && alpha[p + w] && !visited[p + w]) { visited[p + w] = 1; stack.push(p + w) }
    }
    blobs.push({ area, minX, maxX, minY, maxY, startIdx: i })
  }
  return blobs
}

/** Re-run flood fill from a known seed pixel to build a mask of pixels
 *  belonging to that single blob. Used to mask out non-main pixels when
 *  rewriting. */
function fillMaskFrom(alpha, w, h, seed) {
  const mask = new Uint8Array(w * h)
  const stack = [seed]
  mask[seed] = 1
  while (stack.length) {
    const p = stack.pop()
    const x = p % w, y = (p - x) / w
    if (x > 0 && alpha[p - 1] && !mask[p - 1]) { mask[p - 1] = 1; stack.push(p - 1) }
    if (x < w - 1 && alpha[p + 1] && !mask[p + 1]) { mask[p + 1] = 1; stack.push(p + 1) }
    if (y > 0 && alpha[p - w] && !mask[p - w]) { mask[p - w] = 1; stack.push(p - w) }
    if (y < h - 1 && alpha[p + w] && !mask[p + w]) { mask[p + w] = 1; stack.push(p + w) }
  }
  return mask
}

async function analyze(filePath) {
  const buf = await readFile(filePath)
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const w = info.width, h = info.height
  const alpha = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3] > 8 ? 1 : 0

  const blobs = findBlobs(alpha, w, h)
  if (blobs.length === 0) return { w, h, issues: ['empty'], main: null }

  blobs.sort((a, b) => b.area - a.area)
  const main = blobs[0]
  const stubs = blobs.slice(1).filter(b => b.area >= main.area * STUB_AREA_THRESHOLD)

  const leftPad   = main.minX
  const rightPad  = w - 1 - main.maxX
  const topPad    = main.minY
  const bottomPad = h - 1 - main.maxY
  const hDiff = Math.abs(leftPad - rightPad) / w
  const vDiff = Math.abs(topPad - bottomPad) / h
  const offcenterH = hDiff > OFFCENTER_THRESHOLD
  const offcenterV = vDiff > OFFCENTER_THRESHOLD

  const issues = []
  if (stubs.length > 0) issues.push(`${stubs.length} stub(s)`)
  if (offcenterH)       issues.push(`off-center H (L:${leftPad} R:${rightPad})`)
  if (offcenterV)       issues.push(`off-center V (T:${topPad} B:${bottomPad})`)

  return { buf, data, alpha, w, h, blobs, main, stubs, offcenterH, offcenterV, issues }
}

async function rewrite(filePath, analysis) {
  const { buf, alpha, w, h, main } = analysis

  // Mask out everything not in the main blob — kills stubs anywhere they
  // happen to be (left, right, even above/below) without depending on the
  // crop direction.
  const mainMask = fillMaskFrom(alpha, w, h, main.startIdx)
  const { data: rawData } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const cleaned = Buffer.from(rawData)
  for (let i = 0; i < w * h; i++) {
    if (!mainMask[i]) cleaned[i * 4 + 3] = 0
  }

  // Tight-crop to the main bbox on both axes, then pad with PAD_PCT
  // margin on every side so the subject is centered both horizontally
  // AND vertically. Padding is computed off the larger bbox dimension so
  // the per-side margin reads consistently regardless of fish aspect.
  const bboxW = main.maxX - main.minX + 1
  const bboxH = main.maxY - main.minY + 1
  const padPx = Math.round(Math.max(bboxW, bboxH) * PAD_PCT)

  const out = await sharp(cleaned, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: main.minX, top: main.minY, width: bboxW, height: bboxH })
    .extend({ left: padPx, right: padPx, top: padPx, bottom: padPx, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  await writeFile(filePath, out)
}

async function main() {
  let files = (await readdir(FISH_DIR)).filter(f => f.toLowerCase().endsWith('.png'))
  if (ONLY) {
    const want = new Set(ONLY.map(s => s.toLowerCase()))
    files = files.filter(f => want.has(f.toLowerCase()))
  }
  console.log(`Auditing ${files.length} fish images in ${FISH_DIR}`)
  console.log(`Mode: ${APPLY ? 'APPLY (will rewrite)' : 'dry run'}\n`)

  const problems = []
  for (const f of files) {
    const fp = path.join(FISH_DIR, f)
    try {
      const a = await analyze(fp)
      if (a.issues.length > 0) problems.push({ file: f, filePath: fp, ...a })
    } catch (e) {
      console.error(`  error analyzing ${f}: ${e.message}`)
    }
  }

  if (problems.length === 0) {
    console.log('All clean. No images need fixing.')
    return
  }

  console.log(`${problems.length} image(s) with issues:`)
  for (const p of problems) {
    console.log(`  ${p.file.padEnd(40)} ${p.issues.join(', ')}`)
  }

  if (APPLY) {
    console.log('\nRewriting...')
    let fixed = 0
    for (const p of problems) {
      try {
        await rewrite(p.filePath, p)
        fixed++
      } catch (e) {
        console.error(`  failed ${p.file}: ${e.message}`)
      }
    }
    console.log(`Fixed ${fixed}/${problems.length}.`)
  } else {
    console.log(`\n(dry run — pass --apply to rewrite)`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
