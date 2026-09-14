// ── THE PAINTED EFFECT SHEET ────────────────────────────────────────────────
//
// Every particle effect on the water used to be built from canvas gradients:
// a soft dot, a soft ring, a soft puff. Tinted and moved with care, and still
// a dot, a ring and a puff. These are PAINTED — generated in the house style on
// a magenta plate, keyed, and packed by scripts/pack-fx.mjs into ONE sheet.
//
// ONE SHEET IS A REQUIREMENT, not tidiness. A ParticleContainer draws every
// particle it holds from a single texture source, so anything that shares a
// container has to share a sheet. Add an element by appending it to NAMES in
// the packer, rerunning it, and adding its cell here.
export const FX_SHEET = '/fx-sheet.webp'
export const FX_CELL = 128
/** Where each element sits, [x, y, w, h]. Every cell is the full 128 with the
 *  element centred, so one anchor serves all of them. */
export const FX_FRAMES = {
  flame: [0, 0, 128, 128], ember: [128, 0, 128, 128], ice: [256, 0, 128, 128], frost: [384, 0, 128, 128],
  ward: [0, 128, 128, 128], smoke: [128, 128, 128, 128], spark: [256, 128, 128, 128], splash: [384, 128, 128, 128],
  flash: [0, 256, 128, 128], fireball: [128, 256, 128, 128],
} as const
export type FxName = keyof typeof FX_FRAMES
