/**
 * SLICE THE ISLE PROPS.
 *
 *   node slice-isle-props.mjs <props.png>
 *
 * One 2x2 magenta sheet in, four PNGs out under public/sea/:
 *
 *   isle-chest        a plain banded chest, closed. Shallows and Open Waters.
 *   isle-chest-open   the same chest open and spilling, for after you take it.
 *   isle-chest-deep   the ornate barnacled one. The Deep and further out.
 *   isle-note         a post with a note tied to it, and a bottle at its foot.
 *
 * Trimmed tight, like the rocks: these are drawn at a `size` that means WIDTH
 * and anchored at the bottom, so padding would move where the prop stands.
 */
import { cutCell, gridCells } from './chroma-key.mjs'
import sharp from 'sharp'

const src = process.argv[2]
const which = process.argv[3] ?? 'isle'
if (!src) { console.error('usage: node slice-isle-props.mjs <sheet.png> [isle|drift]'); process.exit(1) }

const SHEETS = {
  isle: ['isle-chest', 'isle-chest-open', 'isle-chest-deep', 'isle-note'],
  // The drift sheet: what the sea sends you and what you dig up.
  drift: ['sea-bottle', 'dig-purse', 'dig-box', 'bearing-chart'],
  // The homestead ladder, lean-to to estate, plus the portal that stands beside
  // it. A 3x2 sheet rather than 2x2, so this needs the cols/rows below.
  home: ['home-leanto', 'home-cottage', 'home-longhouse', 'home-hall', 'home-estate', 'home-portal'],
  // The other build spots on the island: the gallery ladder, the landing, the
  // plot, and the point.
  spots: [
    'home-strongroom', 'home-gallery', 'home-wing',
    'home-jetty', 'home-pier', 'home-kitchen',
    'home-walled', 'home-brazier', 'home-lighthouse',
  ],
}
/** Sheets that are not 2x2. */
const SHAPE = { home: [3, 2], spots: [3, 3] }
const NAMES = SHEETS[which]
if (!NAMES) { console.error(`unknown sheet "${which}"`); process.exit(1) }
const m = await sharp(src).metadata()
const [cols, rows] = SHAPE[which] ?? [2, 2]
const cells = gridCells(m.width, m.height, cols, rows)
console.log(`${which} sheet ${m.width}x${m.height}`)
for (let i = 0; i < NAMES.length; i++) {
  // 320 not 512: a chest renders about 90 world pixels wide on an isle, so
  // half the rocks' budget is already twice what any screen will ask for.
  // Buildings get 512: they render up to ~150 world px on an island and the
  // chart zooms to 1.0 on desktop, where 320 would be visibly soft.
  const out = await cutCell(src, cells[i], `public/sea/${NAMES[i]}.png`, which === 'home' || which === 'spots' ? 512 : 320)
  console.log(`  ${NAMES[i].padEnd(16)} ${out.width}x${out.height}  ratio ${(out.width / out.height).toFixed(2)}`)
}
