/**
 * Cut the three crew-hall ladder sheets into their eighteen plates.
 *
 * Each sheet is one generation of a 3x2 grid, which is the whole reason the
 * six tiers of a ladder look like one another: they were painted together, in
 * one pass, under one light. Cells read left to right, top row first, so the
 * grid index IS the tier.
 *
 * `cutCell` does the magenta key, the despill, the trim to the paint and the
 * resize; `gridCells` insets 2% to miss the faint rules the model draws
 * between cells. Both come from the sea slicers - see chroma-key.mjs.
 */
import sharp from 'sharp'
import { cutCell, gridCells } from '../chroma-key.mjs'

const LADDERS = [
  { sheet: 'art/raw/hall-sheet.png', name: 'hall', edge: 512 },
  { sheet: 'art/raw/drill-sheet.png', name: 'drill', edge: 256 },
  { sheet: 'art/raw/stores-sheet.png', name: 'stores', edge: 256 },
]

for (const { sheet, name, edge } of LADDERS) {
  const { width, height } = await sharp(sheet).metadata()
  const cells = gridCells(width, height, 3, 2)
  console.log(`\n  ${name}  sheet ${width}x${height}  ->  ${cells.length} cells`)
  for (let i = 0; i < cells.length; i++) {
    const out = `public/crew/${name}_${i + 1}.png`
    const meta = await cutCell(sheet, cells[i], out, edge)
    const kb = (await import('node:fs')).statSync(out).size / 1024
    console.log(`    ${name}_${i + 1}.png  ${meta.width}x${meta.height}  ${kb.toFixed(0)}KB`)
  }
}
