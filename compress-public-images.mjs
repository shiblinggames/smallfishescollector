// Sweep web/public/ and shrink + recompress oversized raster images.
//
// Most art assets were exported at 1024-2048px for display targets
// of 100-300px, which means every page payload carries multi-MB images
// that the browser then downscales for free anyway. This script resizes
// each eligible PNG/JPEG to a sensible max-dimension by subfolder and
// re-encodes with sharp's high-effort settings.
//
// Usage:
//   node compress-public-images.mjs                 # dry run, shows savings per file + grand total
//   node compress-public-images.mjs --apply         # rewrite the files in place
//   node compress-public-images.mjs --only=fish     # restrict to one subdir (matches dir basename)
//
// Per-directory max-dimension targets (longest side):
//   fish/           600  (catch card / Logbook render at ~110-240px, 2x retina = 480)
//   badges/         256  (gear/profile chips ~80-128px, 2x = 256)
//   models/         600  (boat + hook thumbnails ~120-280px, 2x = 560)
//   <root>          600  (default for cosmetic + item arts)
//   *background*   1600  (full-viewport jpeg backdrops on desktop)
//   cast*/windup*  1600  (character pose photos behind the fishing scene)
//
// Skip list (never touched):
//   PWA1-5.png      Apple PWA splash hints — Apple cares about exact bytes/sizes
//   icon-192.png    PWA manifest icon (must stay 192x192)
//   icon-512.png    PWA manifest icon (must stay 512x512)
//   apple-touch-icon.png  iOS home-screen icon
//   any *.svg, *.webp, audio, json, etc.
//
// Output gets accepted only when the new file is at least SAVINGS_THRESHOLD
// smaller than the original — keeps the script from churning files that
// can't be meaningfully shrunk (e.g. already-tight icons).

import sharp from './web/node_modules/sharp/lib/index.js'
import { readdir, readFile, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(__dirname, 'web/public')

const APPLY    = process.argv.includes('--apply')
const ONLY_ARG = process.argv.find(a => a.startsWith('--only='))
const ONLY     = ONLY_ARG ? ONLY_ARG.slice('--only='.length).trim() : null

const SAVINGS_THRESHOLD = 0.04  // only rewrite if ≥4% smaller

// Filenames anywhere in the tree that should never be touched.
const SKIP_NAMES = new Set([
  'PWA1.png', 'PWA2.png', 'PWA3.png', 'PWA4.png', 'PWA5.png',
  'icon-192.png', 'icon-512.png',
  'apple-touch-icon.png',
])

// Max longest-side dimension by file path heuristic. Returns null if file
// should be skipped (not a raster, or in the skip list).
function targetMaxDim(absPath) {
  const name = path.basename(absPath)
  if (SKIP_NAMES.has(name)) return null
  const ext = path.extname(name).toLowerCase()
  if (ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg') return null

  const rel = path.relative(PUBLIC_DIR, absPath).replace(/\\/g, '/')
  const lowerName = name.toLowerCase()

  // Backgrounds + full-viewport character poses are allowed bigger
  if (/background/i.test(lowerName)) return 1600
  if (/^cast\d?/.test(lowerName) || /^windup/.test(lowerName) || /-norod/.test(lowerName) || /^fishing-norod/.test(lowerName)) return 1600

  // Per-folder defaults
  if (rel.startsWith('fish/'))   return 600
  if (rel.startsWith('badges/')) return 256
  if (rel.startsWith('models/')) return 600
  return 600
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (e.isFile()) yield p
  }
}

function fmtBytes(n) {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`
  return `${(n / 1024 / 1024).toFixed(2)}MB`
}

async function processFile(absPath) {
  const targetMax = targetMaxDim(absPath)
  if (targetMax == null) return null

  const rel = path.relative(PUBLIC_DIR, absPath).replace(/\\/g, '/')
  if (ONLY && !rel.startsWith(`${ONLY}/`) && path.dirname(rel) !== ONLY && !(ONLY === '.' && !rel.includes('/'))) {
    // --only=fish matches files in fish/; --only=. for root-only
    if (ONLY !== rel.split('/')[0]) return null
  }

  const origBuf = await readFile(absPath)
  const origSize = origBuf.length

  let pipeline = sharp(origBuf)
  const meta = await pipeline.metadata()
  if (!meta.width || !meta.height) return null

  const longest = Math.max(meta.width, meta.height)
  const needsResize = longest > targetMax
  if (needsResize) {
    pipeline = pipeline.resize({
      width:  meta.width  >= meta.height ? targetMax : null,
      height: meta.height > meta.width   ? targetMax : null,
      fit: 'inside',
      withoutEnlargement: true,
    })
  }

  // Re-encode at high-effort settings. We keep the source format —
  // converting PNG→WebP would break <img src="*.png"> references everywhere.
  const fmt = (meta.format ?? '').toLowerCase()
  if (fmt === 'png') {
    pipeline = pipeline.png({ compressionLevel: 9, effort: 10, palette: false })
  } else if (fmt === 'jpeg' || fmt === 'jpg') {
    pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true })
  } else {
    return null
  }

  const newBuf = await pipeline.toBuffer()
  const newSize = newBuf.length
  const saved = origSize - newSize
  const savedPct = saved / origSize

  const wouldWrite = savedPct >= SAVINGS_THRESHOLD
  return {
    rel,
    origSize, newSize, saved, savedPct,
    origDim: `${meta.width}x${meta.height}`,
    resized: needsResize,
    wouldWrite,
    newBuf,
    absPath,
  }
}

async function main() {
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — sweeping ${PUBLIC_DIR}${ONLY ? ` (only: ${ONLY}/)` : ''}\n`)

  const rows = []
  let totalOrig = 0, totalNew = 0, written = 0, skippedNoGain = 0
  for await (const absPath of walk(PUBLIC_DIR)) {
    let row
    try { row = await processFile(absPath) }
    catch (err) { console.error(`! error ${absPath}: ${err.message}`); continue }
    if (!row) continue
    rows.push(row)
    totalOrig += row.origSize
    if (row.wouldWrite) {
      totalNew += row.newSize
      written++
      if (APPLY) await writeFile(absPath, row.newBuf)
    } else {
      totalNew += row.origSize
      skippedNoGain++
    }
  }

  // Sort by absolute bytes saved, biggest first
  rows.sort((a, b) => (b.wouldWrite ? b.saved : 0) - (a.wouldWrite ? a.saved : 0))

  for (const r of rows) {
    if (!r.wouldWrite) continue
    const tag = r.resized ? '↘' : '·'
    const pct = (r.savedPct * 100).toFixed(0).padStart(3)
    console.log(`${tag} ${pct}%  ${fmtBytes(r.origSize).padStart(7)} → ${fmtBytes(r.newSize).padStart(7)}  ${r.origDim.padEnd(11)}  ${r.rel}`)
  }

  const totalSaved = totalOrig - totalNew
  const totalSavedPct = totalOrig > 0 ? (totalSaved / totalOrig * 100).toFixed(1) : 0
  console.log(`\n${written} files ${APPLY ? 'written' : 'would be written'}, ${skippedNoGain} unchanged (no meaningful gain)`)
  console.log(`Total: ${fmtBytes(totalOrig)} → ${fmtBytes(totalNew)}  (${totalSavedPct}% smaller, saved ${fmtBytes(totalSaved)})`)
}

main().catch(err => { console.error(err); process.exit(1) })
