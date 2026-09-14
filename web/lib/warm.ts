// ── WARMING THINGS UP BEFORE THEY ARE ASKED FOR ─────────────────────────────
//
// A plain module, NOT 'use server' and not a component: it is called from the
// boot screen and it is worth calling from anywhere else that knows what is
// coming next.
//
// ── WHAT ACTUALLY COSTS TIME BETWEEN SCREENS ────────────────────────────────
//
// Three different things, and they are worth telling apart because only two of
// them can be paid for in advance:
//
//   THE JAVASCRIPT. Every route is its own chunk and the heavy ones are heavy:
//   the chart drags in Pixi, the fight drags in the whole raid engine. A chunk
//   fetched ahead of time is in the browser's own cache with an immutable
//   header on it, so it is paid for ONCE, ever. `router.prefetch` is how this
//   is asked for.
//
//   THE PICTURES. Same story and worse on a phone: a two-hundred-kilobyte
//   painting that has to be fetched AND decoded before the first frame that
//   wants it is a visible hitch wherever it lands. `decode()` is the line that
//   matters — `onload` only means the bytes arrived.
//
//   THE DATA. Every page here is dynamic: your purse, your crew, your run.
//   Next will not prefetch that (see node_modules/next/dist/docs — a dynamic
//   route prefetches its shell and nothing else) and it SHOULD not, because a
//   cached purse is a wrong purse. That round trip is the floor, and it is the
//   part a loading screen cannot buy back.
//
// So this warms the first two and leaves the third alone.

/**
 * Decoded bitmaps, held so the browser does not throw them away the moment
 * nothing points at one. A decoded image with no reference is a decode that
 * has to happen again.
 */
const held = new Map<string, HTMLImageElement>()

/** Fetch and DECODE one picture. Resolves either way: a warm-up that rejects
 *  on a missing file would take the whole boot down with it, and a missing
 *  file is the page's problem to draw, not this module's to police. */
export function warmImage(url: string): Promise<void> {
  const hit = held.get(url)
  if (hit) return Promise.resolve()
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  const done = () => { held.set(url, img) }
  return typeof img.decode === 'function'
    ? img.decode().then(done, () => { /* the page will draw what it can */ })
    : new Promise<void>(r => { img.onload = () => { done(); r() }; img.onerror = () => r() })
}

/**
 * A run of pictures, a few at a time, reporting how far through it is.
 *
 * FOUR AT ONCE, not all of them. Firing thirty image requests on one frame
 * puts them all in the same queue behind each other anyway, and on a phone it
 * competes with the page's own first paint — which is the thing the captain is
 * actually waiting for. Four keeps the pipe busy without owning it.
 */
export async function warmImages(
  urls: string[],
  onProgress?: (frac: number) => void,
  lanes = 4,
): Promise<void> {
  const list = [...new Set(urls)].filter(Boolean)
  if (list.length === 0) { onProgress?.(1); return }
  let done = 0
  let next = 0
  const lane = async () => {
    for (;;) {
      const i = next++
      if (i >= list.length) return
      await warmImage(list[i])
      done++
      onProgress?.(done / list.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(lanes, list.length) }, lane))
}

/**
 * ── ONE STEP OF A BOOT ──────────────────────────────────────────────────────
 *
 * `weight` is how much of the bar it owns, in whatever units the caller likes;
 * the bar normalises. It exists because these are wildly uneven — the chart's
 * paintings are megabytes and a route prefetch is a header — and a bar that
 * gives each step an equal slice lurches.
 */
export type WarmStep = {
  /** Said under the bar while it runs. Pirate-plain: what is being made ready. */
  label: string
  weight: number
  run: (onProgress: (frac: number) => void) => Promise<unknown>
}

/**
 * Run the steps in order, reporting 0..1 across the whole list.
 *
 * IN ORDER, DELIBERATELY. They are sorted by what the captain meets first, so
 * a boot that is cut short by the cap (see the boot screen) has still done the
 * things that matter most rather than a quarter of everything.
 */
export async function runWarm(
  steps: WarmStep[],
  onProgress: (frac: number, label: string) => void,
): Promise<void> {
  const total = steps.reduce((a, s) => a + s.weight, 0) || 1
  let before = 0
  for (const s of steps) {
    onProgress(before / total, s.label)
    try {
      await s.run(f => onProgress((before + s.weight * Math.max(0, Math.min(1, f))) / total, s.label))
    } catch {
      // A step that cannot finish is not a boot that cannot finish. The screen
      // it was warming will load the slow way, which is what it did before any
      // of this existed.
    }
    before += s.weight
    onProgress(before / total, s.label)
  }
}
