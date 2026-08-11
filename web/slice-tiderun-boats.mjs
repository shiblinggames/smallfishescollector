import sharp from 'sharp'
import { writeFile, readdir, access } from 'fs/promises'
import { argv, exit } from 'process'

/**
 * Tide Run boat recolours: art-source/tiderun_<id>.png -> public/tiderun/<id>.png
 *
 * The generator hands these back on a 16:9 canvas (1376x768) with the hull
 * stretched about 17% wide. Left alone that is not just uglier, it is a
 * GAMEPLAY change: SHIP_ASPECT and the HITBOX_INSET box are derived from
 * boatrun.png's 1.353, so a wider boat is a wider collision box, and a cosmetic
 * that alters your hitbox is not a cosmetic.
 *
 * So: trim to content, then resize with fit:'fill' back to 320x237. Forcing an
 * aspect is normally the wrong tool; this is the one case where it is right,
 * because it is cancelling the generator's distortion rather than adding one.
 *
 * Palette PNG to match the eleven already shipped (~30KB each). The trim and the
 * resize are two separate awaits on purpose: chaining .trim() after .extract()
 * or a resize on one pipeline silently drops one of them.
 *
 * Skips anything already in public/tiderun/ so a rerun only picks up new art and
 * never rewrites the shipped set into a pointless diff. Pass --force to redo all.
 */

const SRC_DIR = 'art-source'
const OUT_DIR = 'public/tiderun'
const OUT_W = 320
const OUT_H = 237          // boatrun.png's 805x595, to the nearest pixel

const force = argv.includes('--force')
const only = argv.slice(2).filter(a => !a.startsWith('--'))

const exists = async (p) => { try { await access(p); return true } catch { return false } }

const sources = (await readdir(SRC_DIR))
  .filter(f => /^tiderun_.+\.png$/i.test(f))
  .filter(f => only.length === 0 || only.includes(f.replace(/^tiderun_|\.png$/gi, '')))
  .sort()

if (sources.length === 0) {
  console.error(`No ${SRC_DIR}/tiderun_*.png found. Run from the web/ directory.`)
  exit(1)
}

let wrote = 0, skipped = 0, failures = 0

for (const file of sources) {
  const id = file.replace(/^tiderun_/i, '').replace(/\.png$/i, '')
  const out = `${OUT_DIR}/${id}.png`
  try {
    if (!force && await exists(out)) { console.log(`= ${id}: already shipped, left alone`); skipped++; continue }

    const src = await sharp(`${SRC_DIR}/${file}`).metadata()
    const trimmed = await sharp(`${SRC_DIR}/${file}`).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true })
    const data = await sharp(trimmed.data)
      .resize(OUT_W, OUT_H, { fit: 'fill' })
      .png({ palette: true, compressionLevel: 9 })
      .toBuffer()

    await writeFile(out, data)
    wrote++
    const srcAspect = (trimmed.info.width / trimmed.info.height).toFixed(3)
    console.log(`✓ ${id}: ${src.width}x${src.height} -> trim ${trimmed.info.width}x${trimmed.info.height} (${srcAspect}) -> ${OUT_W}x${OUT_H} (1.350), ${(data.length / 1024).toFixed(1)}KB`)
  } catch (e) {
    failures++
    console.error(`✗ ${id}: ${e.message}`)
  }
}

console.log(`\n${wrote} written, ${skipped} skipped, ${failures} failed.`)
if (failures > 0) exit(1)
