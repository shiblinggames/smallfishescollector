/**
 * MAGENTA CHROMA-KEY, shared by the sea slicers.
 *
 * Nano Banana paints a transparency checkerboard when asked for "transparent",
 * so every sheet is generated on a flat RGB(255,0,255) plate and keyed here.
 *
 * The metric is `m = min(r,b) - g`, which is large on magenta and near zero on
 * everything else — warm stone, cool shadow, gold, green glass all sit at or
 * below nothing. Above 55 the pixel is background. Between 15 and 55 is the
 * antialiased fringe, which gets a ramp rather than a hard cut, or every edge
 * comes out with a jagged one-pixel halo. Anything positive at all is
 * DESPILLED — magenta bounced into the subject's edge — without which every
 * object keeps a pink rim that only shows up once it is over water.
 */
import sharp from 'sharp'

/** Cut one cell out of a sheet, key it, trim to the paint, cap the long edge. */
export async function cutCell(src, box, outPath, longEdge = 512) {
  // Two awaited steps. Chaining .extract() into another op in one pipeline
  // makes the extract silently misapply — a sharp trap this repo has hit.
  const { data, info } = await sharp(src).extract(box)
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const m = Math.min(r, b) - g
    if (m > 55) { data[i + 3] = 0; continue }
    if (m > 15) data[i + 3] = Math.round(data[i + 3] * (1 - (m - 15) / 40))
    if (m > 0) {
      data[i] = Math.max(0, r - m * 0.7)
      data[i + 2] = Math.max(0, b - m * 0.7)
    }
  }

  const keyed = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png().toBuffer()
  const trimmed = await sharp(keyed).trim({ threshold: 12 }).png().toBuffer()
  const meta = await sharp(trimmed).metadata()
  const scale = longEdge / Math.max(meta.width, meta.height)
  await sharp(trimmed)
    .resize(Math.max(1, Math.round(meta.width * scale)), Math.max(1, Math.round(meta.height * scale)),
      { fit: 'fill', kernel: 'lanczos3' })
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(outPath)
  return sharp(outPath).metadata()
}

/** Split a sheet into a rows x cols grid, inset to miss any drawn cell rules. */
export function gridCells(width, height, cols, rows, insetPct = 0.02) {
  const cw = Math.floor(width / cols), ch = Math.floor(height / rows)
  const inset = Math.round(Math.min(cw, ch) * insetPct)
  const out = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      out.push({ left: col * cw + inset, top: row * ch + inset, width: cw - inset * 2, height: ch - inset * 2 })
    }
  }
  return out
}
