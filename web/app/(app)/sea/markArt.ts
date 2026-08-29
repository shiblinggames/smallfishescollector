// ── A LANDMARK, BAKED ───────────────────────────────────────────────────────
//
// The DOM draws every wreck, rig, buoy and smack as TWO <img> elements: a wet
// copy under a vertical gradient mask, and a dry copy clipped to the waterline
// polyline that was placed by eye on /sea/waterline. Forty-two landmarks means
// eighty-four elements, each with its own mask or clip-path, all mounted
// whether or not they are anywhere near the screen.
//
// ── ONCE PER ART, NOT ONCE PER LANDMARK ─────────────────────────────────────
//
// There are forty-two landmarks and about ten distinct paintings between them:
// the chart is full of the same wreck at different sizes. So the mask and the
// clip are burned into two canvases PER ART and every landmark that uses that
// art shares them. Ten arts, twenty canvases, forty-two landmarks — against
// eighty-four masked DOM nodes.
//
// It also means the waterline is applied exactly once per painting instead of
// being re-evaluated by the compositor per element, and that the numbers on
// /sea/waterline keep meaning what they meant: this reproduces the same two
// layers with the same stops, in the same order, rather than approximating
// them with a shader.
//
// `destination-in` is the whole trick — draw the art, then paint the mask over
// it in that mode and what is left is the art wearing the mask's alpha.

import type { Submerge } from './submerge'

export type MarkArt = { wet: HTMLCanvasElement; dry: HTMLCanvasElement | null }

const cache = new Map<string, Promise<MarkArt>>()

/** The dry region: everything ABOVE the waterline. The same polygon
 *  SubmergedSprite builds for `clip-path`, in canvas units. */
function dryPath(g: CanvasRenderingContext2D, pts: [number, number][], w: number, h: number) {
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(w, 0)
  for (let i = pts.length - 1; i >= 0; i--) {
    g.lineTo((pts[i][0] / 100) * w, (pts[i][1] / 100) * h)
  }
  g.closePath()
}

/**
 * Both copies of one painting, cached forever by art path.
 *
 * Forever is right here and wrong for islands: an island's canvas is sized to
 * that island, so the cache grows with the chart, while this is keyed on the
 * PAINTING and there are ten of those. It cannot grow.
 */
export function bakeMark(art: string, sub: Submerge | undefined): Promise<MarkArt> {
  const key = `${art}|${sub ? sub.keep : 'dry'}`
  const hit = cache.get(key)
  if (hit) return hit

  const job = (async (): Promise<MarkArt> => {
    const img = new Image()
    img.decoding = 'async'
    img.src = art
    await img.decode()

    const w = img.naturalWidth
    const h = img.naturalHeight

    const make = () => {
      const cv = document.createElement('canvas')
      cv.width = w; cv.height = h
      return cv
    }

    // ── THE WET COPY. The same four stops SubmergedSprite writes into its
    //    linear-gradient, so a landmark fades into the water at exactly the
    //    depth the bench showed. Without a waterline it is just the art.
    const wet = make()
    const wg = wet.getContext('2d')!
    wg.drawImage(img, 0, 0)
    if (sub) {
      // The fade anchor is the line's SHALLOWEST point: above it the dry copy
      // covers everything anyway, and starting lower would brighten water the
      // line says is already under.
      const top = Math.min(...sub.pts.map(p => p[1]))
      const grad = wg.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, `rgba(0,0,0,${sub.keep})`)
      grad.addColorStop(Math.min(1, (top + 3) / 100), `rgba(0,0,0,${sub.keep})`)
      grad.addColorStop(Math.min(1, (top + 100) / 200), `rgba(0,0,0,${sub.keep * 0.55})`)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      wg.globalCompositeOperation = 'destination-in'
      wg.fillStyle = grad
      wg.fillRect(0, 0, w, h)
    }

    // ── THE DRY COPY, clipped to the waterline. Only exists when there is a
    //    line to clip to; everything else on the chart is simply above water.
    let dry: HTMLCanvasElement | null = null
    if (sub) {
      dry = make()
      const dg = dry.getContext('2d')!
      dg.drawImage(img, 0, 0)
      dg.globalCompositeOperation = 'destination-in'
      dg.fillStyle = '#000'
      dryPath(dg, sub.pts, w, h)
      dg.fill()
    }

    return { wet, dry }
  })()

  cache.set(key, job)
  return job
}
