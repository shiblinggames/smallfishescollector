/**
 * EVERY COLOUR THE LAND IS PAINTED WITH IS A COLOUR.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * `toneHex` clamped each channel to 0..255 and then multiplied by `dim`, which
 * is greater than one for any island whose `chr` is under a half. A channel
 * clamped to 255 came back out at 260, `260 << 16` printed as seven hex digits,
 * and `#104f1ca` is not a colour — `addColorStop` throws SyntaxError on it.
 *
 * The throw was inside `bakeIsland`, inside `place()`, inside the loop that
 * places every island, so the GPU handle was never built. SeaMap reaches that
 * handle through optional chaining, so every camera() and skipper() call after
 * it did nothing at all: the chart froze with no boat on it while the water
 * carried on animating off the Pixi ticker's own clock.
 *
 * Two things made it hard to find and both are the point of this file. It took
 * one palette AND one seed together, so nine islands baked and the tenth did
 * not. And a dead colour presents as a dead camera three files away, which is
 * a symptom nobody would trace back to a hex string.
 *
 * ── WHAT IT CHECKS ──────────────────────────────────────────────────────────
 *
 * Every colour in every palette, through every island's own dial, is a valid
 * six-digit hex. That is the whole invariant and it is cheap, because the dial
 * is pure arithmetic on a string — no canvas, no browser, no Pixi.
 *
 * It fails on the version of `toneHex` that shipped, which is the only way to
 * know a check is worth having.
 */
import { PLACES } from '../app/(app)/sea/chart'
import { PALETTES, paletteOf, paletteChr, toneHex } from '../app/(app)/sea/islandArt'

const HEX = /^#[0-9a-f]{6}$/

const ids: string[] = []
for (const p of PLACES) {
  if (p.inner !== undefined) continue
  ids.push(p.id)
}

let bad = 0
let checked = 0

// EVERY palette against EVERY island's dial, not just the pairing each island
// happens to draw today. The pairing comes off a hash, so a change anywhere
// near `paletteOf` reshuffles which coast meets which seed — and the bug only
// existed in one of those pairings. Checking the grid is what makes this hold
// through the next reshuffle instead of only through this one.
for (const id of ids) {
  const chr = paletteChr(id)
  for (const pal of PALETTES) {
    const swatches = [
      ...pal.wet, ...pal.sand, ...pal.pale, ...pal.scrub, ...pal.green,
      ...pal.rock, ...pal.beach,
    ]
    for (const c of swatches) {
      checked++
      if (!HEX.test(c)) {
        bad++
        console.log(`    BAD SOURCE  ${pal.name}  ${c}  is not #rrggbb`)
        continue
      }
      const out = toneHex(c, chr)
      if (!HEX.test(out)) {
        bad++
        console.log(`    OFF  ${id.padEnd(13)} chr ${chr.toFixed(3)}  ${pal.name.padEnd(9)} ${c} -> ${out}`)
      }
    }
  }
}

console.log(`\n  Palettes: ${checked} colours through ${ids.length} dials, ${bad} not a colour.`)

// AND THE ISLAND EACH ONE ACTUALLY DRAWS, named, so the output says something
// about the chart rather than only about the arithmetic.
for (const id of ids) {
  console.log(`    ${id.padEnd(13)} ${paletteOf(id).name.padEnd(9)} chr ${paletteChr(id).toFixed(3)}`)
}

if (bad) process.exitCode = 1
