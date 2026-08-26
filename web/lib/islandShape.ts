// THE SHAPE OF AN ISLAND, in one place.
//
// Plain module, NOT 'use server' — that directive silently drops non-async
// exports and everything here is pure.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// The coastline was generated inside SeaMap's `Landmass` and re-derived by hand
// in `scripts/check-islands.mts`. Two copies of a formula is a formula that
// will disagree with itself, and it did — for months the checker modelled the
// grass as 70% of the island box, having reasoned "the grass layer is
// `inset: 15%`, so its box is 70%". True of the grass div and false of the
// island, because the grass is a child of the TOP FACE, which is itself
// `inset: 13%`. The insets compound:
//
//     top face = 100% - 2*13%          = 74% of the island box
//     grass    = 74% * (100% - 2*15%)  = 51.8%
//
// The checker was handing every building 35% more land than exists. It reported
// "0 buildings not standing wholly on the grass" while buildings hung visibly
// over the water — a check that does not merely miss a bug but certifies it.
//
// Now there is one coastline and one GRASS, imported by the renderer, by the
// build check, and by the server that validates where a captain drags a
// building. If the layers ever change, this file is the one that changes.

/** The top face — the land itself — is `inset: 13%` of the island box. Every
 *  band below is inset again from THIS, which is the compounding that the old
 *  checker missed. */
const TOP = 1 - 0.13 * 2

/**
 * How far the GREEN reaches, as a fraction of a coastline radius.
 *
 * The grass layer is `inset: 15%` of the top face, so `0.70 * 0.74`. Written as
 * the product so the two insets it comes from stay visible.
 */
export const GRASS = 0.70 * TOP

/**
 * HOW FAR YOU MAY BUILD.
 *
 * The scrub band, `inset: 9.5%` of the top face. One band further out than the
 * green, and still unambiguously land — scrub is the dry stuff that grows above
 * the tideline, and a cottage standing on it looks like a cottage standing on
 * an island.
 *
 * IT USED TO BE THE GRASS, and that was too tight to size the buildings
 * honestly. The green is only 51.8% of a coastline radius, so six buildings on
 * it meant six small buildings — and the Estate came out at 48% of the island's
 * height against a lean-to's 24%, which is barely a doubling for four upgrades
 * and several million doubloons. It stopped reading as an upgrade at all.
 *
 * At 59.9% the whole ladder can be steep enough to see. Measured: every one of
 * the six spots fits its largest build at the new sizes here, and the portal is
 * the one that does not fit on the green.
 */
export const BUILDABLE = (1 - 0.095 * 2) * TOP

/** How many points the outline is drawn with. 160, because at 26 the straight
 *  segments were visible on the big islands and read as a polygon. */
const N = 160

/**
 * The coastline radii for an island, in percent of its box, one per Nth of a
 * turn. Seeded off the id so it is stable and different for every island.
 *
 * Five octaves plus a slow LOBE term that pulls one or two whole sides out into
 * headlands. Tuned against measurements rather than by eye: across all four
 * islands the radius stays between 30% and 63%, and the biggest step between
 * neighbours is 2.4%.
 */
export function coastline(id: string): number[] {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const rnd = (n: number) => ((h >>> (n * 3)) % 1000) / 1000
  const rug = 0.70 + rnd(1) * 0.35
  const out: number[] = []
  for (let i = 0; i < N; i++) {
    const a = (Math.PI * 2 * i) / N
    const wobble =
      0.095 * Math.sin(a * (1 + Math.floor(rnd(2) * 2)) + rnd(3) * 6.28) +
      0.055 * Math.sin(a * 3 + rnd(4) * 6.28) +
      0.028 * Math.cos(a * 5 - rnd(5) * 6.28) +
      0.012 * Math.sin(a * 9 + rnd(6) * 6.28) +
      0.004 * Math.cos(a * 17 + rnd(7) * 6.28)
    out.push(46 + wobble * rug * 100)
  }
  return out
}

/** The CSS polygon for the outline. What every layer of the island is clipped
 *  to — each on its own box, which is what makes the bands parallel the shore
 *  instead of being circles inside an irregular outline. */
export function coastClip(id: string): string {
  const rs = coastline(id)
  const pts = rs.map((r, i) => {
    const a = (Math.PI * 2 * i) / N
    return `${(50 + Math.cos(a) * r).toFixed(2)}% ${(50 + Math.sin(a) * r).toFixed(2)}%`
  })
  return `polygon(${pts.join(', ')})`
}

/** How far the grass reaches at an angle, in percent of the island box from
 *  its centre. */
export function grassAt(rs: number[], angle: number): number {
  let a = angle % (Math.PI * 2)
  if (a < 0) a += Math.PI * 2
  const t = (a / (Math.PI * 2)) * N
  const i = Math.floor(t) % N
  const j = (i + 1) % N
  const f = t - Math.floor(t)
  return (rs[i] * (1 - f) + rs[j] * f) * GRASS
}

/** How far outside the grass a point is, in box-percent. Negative is inside. */
export function outBy(rs: number[], x: number, y: number): number {
  return Math.hypot(x - 50, y - 50) - grassAt(rs, Math.atan2(y - 50, x - 50))
}

/**
 * Does a building at (x, y) stand wholly on the grass?
 *
 * A building is anchored BOTTOM-CENTRE (`translate(-50%, -100%)`), so what has
 * to be on the land is the horizontal line its base sits on — the centre and
 * both bottom corners. Testing the centre alone passes buildings whose feet are
 * in the water, which is most of the ways this goes wrong.
 *
 * `scale` is the building's width as a fraction of the island box, so half its
 * width in the same units is `scale * 50`.
 *
 * Measured against BUILDABLE, not GRASS — see the note there.
 */
export function standsOnLand(
  rs: number[], x: number, y: number, scale: number, margin = 1.5,
): boolean {
  const hw = scale * 50
  const o = (px: number, py: number) =>
    Math.hypot(px - 50, py - 50) - grassAt(rs, Math.atan2(py - 50, px - 50)) * (BUILDABLE / GRASS)
  return Math.max(o(x, y), o(x - hw, y), o(x + hw, y)) < -margin
}
