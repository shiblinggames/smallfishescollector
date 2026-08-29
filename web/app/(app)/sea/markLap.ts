// ── WHERE THE WATER LAPS AT A STANDING THING ────────────────────────────────
//
// A wreck, a rig, a buoy, a rock. Each is drawn in TWO halves already: a wet
// copy seen through the surface and a dry copy clipped to a waterline that was
// placed by hand on /sea/waterline. The halves meet along that line and the
// join is clean — which is the problem. Water does not meet anything cleanly.
// A hard boundary between "under" and "above" reads as a sprite with a mask on
// it, which is exactly what it is.
//
// ── NOT A SHAPE UNDERNEATH, AND THAT DISTINCTION IS THE WHOLE THING ─────────
//
// This chart has thrown out a contact shadow under a building SIX times: a dark
// blob, a pale one, a flat foreshortened warm one. The objection each time was
// the same and it was right — a discrete shape beneath an object says "this
// thing is ABOVE that thing", whatever tint you give it. It never says "in".
//
// Foam ON THE WATERLINE is the opposite claim. It is not under the object, it
// is at the exact height the art already says the water reaches, between the
// two halves that already exist. And it MOVES, which is the part a static shape
// can never do: a still ellipse is a shadow, and moving broken water is water.
// The islands settled this the same way — their shore foam is a moving ring at
// the land's own edge, and it is what stopped them looking pasted on.
//
// Same texture as the islands, deliberately: two soft crests travelling toward
// the shore. One visual language for "water meets a solid thing", whether that
// thing is a coastline or a rock the size of a boat.

import type { Submerge } from './submerge'

/** How far the foam reaches either side of the line, as a fraction of the
 *  sprite's height. Small: this is a lap, not a bow wave. */
const BAND = 0.045

/** Crests per sprite width. More than the islands get, because a landmark is a
 *  fraction of an island's span and the crests should read at the same SIZE
 *  rather than the same count. */
const ALONG = 3.5

/** How fast the crests run at the object. Slower than the islands' surf: a
 *  rock is not a beach and there is no swell breaking on it, just water
 *  moving. */
const SPEED = 0.09

/**
 * Below this the lap is not worth having. The band is 4.5% of a sprite's
 * height, so on a pebble it is two or three pixels of foam that nobody will
 * ever pick out — and there are four times as many pebbles as rocks. Each lap
 * costs a mesh and a UV upload on every frame it is visible, so this threshold
 * is the difference between a few dozen of them and four hundred.
 */
export const LAP_MIN_SIZE = 150

/** Points along the line. The polylines have at most seven, and a strip built
 *  straight from them has visible corners where the artist changed direction. */
const STEPS = 28

export type Lap = {
  mesh: import('pixi.js').Mesh<import('pixi.js').Geometry, import('pixi.js').Shader>
  advance(seconds: number): void
}

/** The waterline's height at a fraction across the sprite, walking the
 *  polyline. Linear between the placed points, because that is what the bench
 *  drew and what markArt clips to — a smoother curve here would put the foam
 *  somewhere the two halves do not actually meet. */
function heightAt(pts: [number, number][], x: number): number {
  if (x <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    if (x > pts[i][0]) continue
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0)
    return y0 + (y1 - y0) * t
  }
  return pts[pts.length - 1][1]
}

/**
 * `w` and `h` are the sprite's size in its own container, and the sprite is
 * anchored bottom-centre — so its box runs x from -w/2 to w/2 and y from -h
 * to 0, and that is the space this mesh is built in. A child of the same
 * container as the art, so it sways with it and needs no transform of its own.
 */
export function makeLap(
  PIXI: typeof import('pixi.js'),
  sub: Submerge,
  texture: import('pixi.js').Texture,
  w: number,
  h: number,
  seed: number,
): Lap {
  const n = STEPS
  const verts = new Float32Array(n * 4)
  const uvs = new Float32Array(n * 4)
  const idx: number[] = []

  for (let i = 0; i < n; i++) {
    const f = i / (n - 1)
    const px = f * 100
    const py = heightAt(sub.pts, px)
    const x = (px / 100 - 0.5) * w
    const y = (py / 100 - 1) * h

    // PINCHED AT BOTH ENDS. The waterline runs the full width of the sprite,
    // but the object does not: at the silhouette's edge the water is wrapping
    // around behind it rather than lapping at a face. Tapering the band to
    // nothing there ends the foam where the object ends, instead of cutting it
    // off square at the edge of a rectangle.
    const taper = Math.sin(f * Math.PI)
    const band = BAND * h * (0.25 + 0.75 * taper)

    verts[i * 4] = x
    verts[i * 4 + 1] = y - band
    verts[i * 4 + 2] = x
    verts[i * 4 + 3] = y + band

    // u along the line, v across the band. The crests travel across it, toward
    // the object, which is the direction water actually arrives from.
    const u = f * ALONG + seed
    uvs[i * 4] = u
    uvs[i * 4 + 1] = 0
    uvs[i * 4 + 2] = u
    uvs[i * 4 + 3] = 1

    if (i < n - 1) {
      const a = i * 2, b = (i + 1) * 2
      idx.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }

  const mesh = new PIXI.MeshSimple({
    texture,
    vertices: verts,
    uvs,
    indices: new Uint32Array(idx),
  })
  // Additive, like the islands' surf and for the same reason: broken water
  // LIGHTENS what is under it rather than covering it, and that is also what
  // stops the band reading as a drawn line along the hull.
  mesh.blendMode = 'add'
  mesh.alpha = 0.42

  const uvBuf = mesh.geometry.getBuffer('aUV')
  const base = Float32Array.from(uvs)

  return {
    mesh,
    advance(seconds) {
      // v only. u is fixed to the object; scrolling it would slide the foam
      // ALONG the waterline, which is a thing water does not do to a rock.
      const off = -seconds * SPEED
      const data = uvBuf.data as Float32Array
      for (let i = 0; i < base.length; i += 2) {
        data[i] = base[i]
        data[i + 1] = base[i + 1] + off
      }
      uvBuf.update()
    },
  }
}
