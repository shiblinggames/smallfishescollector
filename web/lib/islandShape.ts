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

/**
 * HOW FAR A TOWN MAY REACH, which is further, and only a town gets it.
 *
 * BUILDABLE is the scrub band and it is deliberately cautious, because it is
 * sizing ONE cottage: a lean-to whose corner hangs over the beach looks like a
 * mistake. A port does not work that way. A town is built out to the water it
 * exists for, and its outermost roofs standing on the sand is the whole look of
 * a working harbour — the Mainland painted at scrub width came out as a village
 * marooned in the middle of a field.
 *
 * So this is the top face itself: the full painted land, cliff edge excluded.
 * A base corner here is on the beach, never in the sea. Opt in per building
 * with `toShore` in chart.ts, which the Mainland town is the only user of.
 */
export const SHORE = TOP

/** How many points the outline is drawn with. 160, because at 26 the straight
 *  segments were visible on the big islands and read as a polygon. */
const N = 160

/**
 * The coastline radii for an island, in percent of its box, one per Nth of a
 * turn. Seeded off the id so it is stable and different for every island.
 *
 * ── SIX OF TEN ISLANDS WERE THE SAME SHAPE, AND IT WAS ARITHMETIC ──────────
 *
 * The old generator was five octaves plus a lobe term at period ONE OR TWO. A
 * period-one term is `sin(a + phase)`, and a shape built on it has the property
 * that opposite radii always sum to the same number — every diameter identical,
 * a curve of constant width. Measured across the chart, six islands came out at
 * an aspect of exactly 1.000 and the other four at 1.4 to 1.55. Two families,
 * one of them perfect blobs, and no amount of texture on top fixes a silhouette
 * that is mathematically a circle.
 *
 * So the shape is built from three things now, each seeded independently:
 *
 *   AN AXIS. Every island is stretched along a bearing of its own. This is the
 *   term that was missing entirely — it is what makes one island long and
 *   another squat, and it cannot be produced by adding octaves, because a
 *   period-two term is the only octave that changes aspect and it was sharing a
 *   slot with a period-one term that does not.
 *
 *   A HEADLAND, of its own strength rather than a fixed 0.095. Some coasts push
 *   one side a long way out; some barely at all.
 *
 *   AND A BAY, on about half of them. A gaussian bitten out of one bearing —
 *   the only feature here that is not a smooth harmonic, and the only one that
 *   gives a coast something a captain can name.
 *
 * ── AND THE LIMIT IS SOFT, WHICH IS NOT A DETAIL ───────────────────────────
 *
 * Three independent terms stack, and unclamped an island whose bay lands on the
 * narrow end of its own stretch pinches to almost nothing — which puts a
 * building on that bearing in the water.
 *
 * A HARD clamp fixes that and ruins the coast: measured, it pinned twenty-six
 * of the Mainland's hundred and sixty vertices to the floor, and a run of
 * vertices at one radius is a circular ARC — a smooth machined curve in the
 * middle of a hand-drawn coastline, which is more obviously wrong than the
 * pinch was.
 *
 * `tanh` compresses instead. Everything lands inside the band, extremes give up
 * more than the middle does, and nothing is ever flat. The band is what
 * `scripts/check-islands` measures every building against.
 */
export function coastline(id: string): number[] {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const rnd = (n: number) => ((h >>> (n * 3)) % 1000) / 1000
  /** A properly mixed draw. `rnd` shifts the hash by 3n and runs out of bits
   *  past n=7 — at n=10 there are two left and every island gets the same
   *  answer. Everything added below uses this instead. */
  const mix = (n: number) =>
    ((Math.imul(h ^ Math.imul(n + 1, 0x9e3779b1), 2654435761) >>> 0) % 1000) / 1000

  const rug = 0.70 + rnd(1) * 0.35

  /** How far from round, and along which bearing. A two-fold term repeats at
   *  half a turn, so the axis only needs half of one. */
  const ecc = 0.08 + mix(1) * 0.16
  const axis = mix(2) * Math.PI

  /** The headland: its reach, and whether the coast has one of them or two. */
  const head = 0.05 + mix(3) * 0.12
  const heads = 1 + Math.floor(mix(4) * 2)

  /**
   * ── THE BAY, AND WHY IT IS ALWAYS ON THE SEAWARD SIDE ─────────────────────
   *
   * Bearings here are screen bearings: 0 is east, and because y runs DOWN the
   * page, 90 degrees is SOUTH. The south face of every island is the settled
   * one — it is the face the camera looks at, it is where the berth ring sits
   * (east-south-east), and it is where every building table on the chart puts
   * its houses, all of them below the centre line.
   *
   * A gaussian bay is the deepest single bite this generator takes, and left
   * free it lands wherever the hash says. On the first cut it took the
   * Mainland's south face down to 17.9% of the box while the north-west stood
   * at 37.9% — so the town was hanging over the water, and the same bite caught
   * the Estate and the Crew Hall's stores.
   *
   * Moving three buildings would have fixed those three. Putting the bay on the
   * seaward half fixes the rule: a coast wears its drama on the side you sail
   * PAST, and keeps its harbour side whole. That is also just where a
   * settlement goes — you build on the sheltered face, not in the surf.
   */
  const bayAt = Math.PI + mix(6) * Math.PI
  const bayW = 0.45 + mix(7) * 0.45
  const bayD = mix(5) > 0.45 ? 4 + mix(8) * 5 : 0

  const out: number[] = []
  for (let i = 0; i < N; i++) {
    const a = (Math.PI * 2 * i) / N
    const wobble =
      head * Math.sin(a * heads + rnd(3) * 6.28) +
      0.055 * Math.sin(a * 3 + rnd(4) * 6.28) +
      0.028 * Math.cos(a * 5 - rnd(5) * 6.28) +
      0.012 * Math.sin(a * 9 + rnd(6) * 6.28) +
      0.004 * Math.cos(a * 17 + rnd(7) * 6.28)
    let r = (46 + wobble * rug * 100) * (1 + ecc * Math.cos(2 * (a - axis)))
    if (bayD > 0) {
      let da = a - bayAt
      while (da > Math.PI) da -= Math.PI * 2
      while (da < -Math.PI) da += Math.PI * 2
      r -= bayD * Math.exp(-(da * da) / (2 * bayW * bayW))
    }
    // Soft limit: see the note above. 48 is the middle of the band and 21 its
    // half-width, so tanh flattens toward 27 and 69 without ever reaching them.
    out.push(48 + 21 * Math.tanh((r - 48) / 21))
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
