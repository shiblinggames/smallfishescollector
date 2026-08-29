// ── A CAPTAIN AND THEIR BOAT, ON THE GPU ────────────────────────────────────
//
// The DOM builds a skiff by stacking absolutely-positioned <img>: a character,
// a hat, a hull, a rod, a reel, a pet, a hook — each placed by hand-tuned
// percentages out of the cosmetic tables, and each with THREE POSES, because
// fishing is an animation. Rest, wait, cast. This builds the same stack out of
// Pixi sprites, all three poses included.
//
// ── NOT BAKED, AND THAT IS THE POINT ────────────────────────────────────────
//
// The obvious move is to bake each finished skiff to one canvas and use it as a
// texture, the way islands and landmarks are baked. It is the wrong move here,
// because a skiff is not fixed: every part is EQUIPPABLE, and every part has
// three poses. Baking either enumerates a combinatorial space that has no
// business existing, or re-bakes every time somebody changes a hat.
//
// So it composes at runtime exactly as the DOM does, and shares textures: one
// hat texture serves every captain wearing that hat. This is the case where a
// sprite renderer is straightforwardly better than the DOM rather than merely
// equivalent — fifty captains at seven layers each is 350 elements the
// compositor tracks individually, or 350 quads sharing thirty textures in one
// or two draw calls.
//
// ── WHY THE DOM MOUNTS EVERY POSE AT ONCE, AND WHY THIS DOES NOT ────────────
//
// SeaMap's `Layer` mounts all three frames of every layer simultaneously and
// switches them with `visibility`. That is not belt-and-braces; it is load
// bearing. The character sheet has a plain wooden hull and a red bandana
// PAINTED INTO IT, and an equipped boat and hat cover them exactly — but only
// while every layer agrees on which pose it is in. Swapping `src` cannot
// promise that: React writes all the attributes in one commit, but each <img>
// paints when its own bitmap is ready, so the base could flip to `cast` a frame
// before the boat did and the painted-in default underneath showed through.
//
// A sprite renderer does not have that problem, PROVIDED the textures are
// already uploaded: swapping to a resident texture is synchronous, and the
// whole scene commits in one frame. So this keeps ONE sprite per layer and
// swaps its texture — but it loads every pose of every layer BEFORE the first
// frame is shown, because that promise is the entire basis for doing so. Get
// that wrong and the bug comes straight back, just somewhere harder to see.
//
// ── THE HARD PART IS THE PLACEMENT ──────────────────────────────────────────
//
// Those percentages mean something specific in CSS and something else if read
// carelessly. In an absolutely-positioned child of a `position: relative` box:
//
//   left:  % of the CONTAINER'S WIDTH      →  x of the part's LEFT edge
//   top:   % of the CONTAINER'S HEIGHT     →  y of the part's TOP edge
//   width: % of the CONTAINER'S WIDTH      →  the part's width; height follows
//                                              from its own aspect
//   rotate: about the part's OWN CENTRE, unless transform-origin says otherwise
//
// Every one of those numbers was tuned by eye on /fishing-test over a long
// time — the pet tables carry notes like "sits low and a touch left of the
// monkey" — so they are reproduced here rather than reinterpreted. Anything
// that reads differently is a bug in this file, not a number that wants
// changing.

export type Frame = 'rest' | 'wait' | 'cast'

/** Painted in this order, which is the DOM's. It is not decoration: the hull
 *  goes over the character because a captain sits IN a boat, and the hook goes
 *  over the rod because it hangs off the end of it. */
export const FRAMES: Frame[] = ['rest', 'wait', 'cast']

/** Where a part sits, in the CSS sense described above. */
export type Placement = {
  top: number
  left: number
  width: number
  rotate: number
  /** CSS `transform-origin`. Only the rod uses anything but the default. */
  origin?: 'center' | 'bottom right'
  /** Drawn but not shown on this pose. The hook is in the WATER during the
   *  bite, so it is not on the rod. */
  hidden?: boolean
}

/** One equippable layer, across the poses. Several layers hand back the same
 *  file for more than one pose — hats and hulls ship a rest/wait sprite and a
 *  separate cast one — and that is the caller's business, not this file's. */
export type Part = {
  url: (f: Frame) => string
  /** null means the layer is absent on that pose entirely. */
  at: (f: Frame) => Placement | null
}

/** The base box the percentages are relative to. The DOM writes `width: 210`
 *  and lets the character's aspect set the height; so does this. */
export const SKIFF_W = 210

// ── TEXTURES, SHARED AND LOADED ONCE ────────────────────────────────────────
const textures = new Map<string, Promise<import('pixi.js').Texture>>()

/** The bitmaps behind those textures, kept because the effects need PIXELS and
 *  not just something to draw. A rod's glow is its own silhouette blurred, and
 *  its sparks come off its own outline, so both have to read the alpha channel.
 *  Digging the image back out of a Texture is possible and fragile — the shape
 *  of `source.resource` is an internal detail that has changed between Pixi
 *  majors before — so it is kept here on the way past instead. */
const images = new Map<string, HTMLImageElement>()

/** The loaded bitmap for a url, if it has been through `texture()`. */
export function imageFor(url: string): HTMLImageElement | null {
  return images.get(url) ?? null
}

export function texture(
  PIXI: typeof import('pixi.js'),
  url: string,
): Promise<import('pixi.js').Texture> {
  const hit = textures.get(url)
  if (hit) return hit
  // A plain Image and decode(), the way everything else in this codebase warms
  // a sprite. One less subsystem than Assets between here and a picture, and
  // decode() resolves when the bitmap is ready to PAINT rather than when the
  // bytes have landed — which is exactly the promise the pose swap rests on.
  const job = (async () => {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    images.set(url, img)
    return PIXI.Texture.from(img)
  })()
  textures.set(url, job)
  return job
}

/**
 * Place one part.
 *
 * `w` and `h` are the container's box — the same box the percentages resolve
 * against in CSS. The sprite is anchored so that rotation happens about the
 * point CSS would rotate about, and then positioned by that anchor rather than
 * by its top-left, which is the only way to get both right at once.
 */
function place(
  sprite: import('pixi.js').Sprite,
  p: Placement,
  w: number,
  h: number,
) {
  const partW = (p.width / 100) * w
  // Uniform: a part keeps its own aspect, exactly as an <img> with only a width
  // does. Setting height as well would squash every hat by the container's.
  const k = partW / sprite.texture.width
  sprite.scale.set(k, k)
  const partH = sprite.texture.height * k

  const left = (p.left / 100) * w
  const top = (p.top / 100) * h

  if (p.origin === 'bottom right') {
    sprite.anchor.set(1, 1)
    sprite.position.set(left + partW, top + partH)
  } else {
    sprite.anchor.set(0.5, 0.5)
    sprite.position.set(left + partW / 2, top + partH / 2)
  }
  sprite.rotation = (p.rotate * Math.PI) / 180
}

/** The layers, in paint order. */
const KEYS = ['hat', 'boat', 'rod', 'reel', 'pet', 'hook'] as const
type Key = typeof KEYS[number]

export type Skiff = {
  view: import('pixi.js').Container
  /** Switch pose. Every texture is already resident, so this is one synchronous
   *  pass and the whole skiff commits together. */
  setFrame(f: Frame): void
  frame(): Frame
  /** Fires after a pose change, so anything hanging off the rod — the aura —
   *  can follow it. The rod's texture, size, angle and pivot all move between
   *  poses, so an effect that does not follow ends up glowing at where the rod
   *  used to be. */
  onFrame: ((f: Frame) => void) | null
  /** The placed layers. An aura is its part's own silhouette lit up, so the
   *  thing that draws one needs the SPRITE rather than a position — same
   *  texture, same anchor, same rotation, or the light slides off as it turns. */
  parts: Partial<Record<Key, import('pixi.js').Sprite>>
  /** A layer's bitmap and cache key FOR THE CURRENT POSE. The effects read its
   *  alpha: the glow blurs it, and the sparks come off the outline it
   *  describes, and both of those are a different picture in a cast than in a
   *  rest. */
  poseOf(key: Key): { image: HTMLImageElement; key: string } | null
  /** Where the rod's tip is, in the skiff's own coordinates, for the current
   *  pose. A spark that comes out of the middle of a captain is not a rod. */
  rodTip: { x: number; y: number } | null
}

/**
 * Compose one skiff, in every pose.
 *
 * `parts` are the placements from the cosmetic tables — passed in rather than
 * imported so this file never becomes a second opinion about where a hat goes.
 */
export async function makeSkiff(
  PIXI: typeof import('pixi.js'),
  parts: {
    character: (f: Frame) => string
  } & Partial<Record<Key, Part>>,
  opts?: { frame?: Frame },
): Promise<Skiff> {
  const view = new PIXI.Container()

  // ── EVERY POSE OF EVERY LAYER, BEFORE ANYTHING IS SHOWN ───────────────────
  // The pose swap is only atomic because nothing in it can be waiting on a
  // decode. See the header.
  const urls = new Set<string>()
  for (const f of FRAMES) {
    urls.add(parts.character(f))
    for (const key of KEYS) {
      const part = parts[key]
      if (part && part.at(f)) urls.add(part.url(f))
    }
  }
  await Promise.all([...urls].map(u => texture(PIXI, u)))

  const tex = (u: string) => PIXI.Texture.from(images.get(u)!)

  // The character defines the box, so everything else is measured against
  // it — same as the DOM, where the only non-absolute child is what gives the
  // container its height. All three sheets are the same size, so `rest` sets it
  // whichever pose is actually showing.
  const charTex = tex(parts.character('rest'))
  const w = SKIFF_W
  const h = (charTex.height / charTex.width) * w

  const charSprite = new PIXI.Sprite(charTex)
  charSprite.width = w
  charSprite.height = h
  view.addChild(charSprite)

  const sprites = {} as Partial<Record<Key, import('pixi.js').Sprite>>
  for (const key of KEYS) {
    const part = parts[key]
    if (!part) continue
    // Seeded from whichever pose the layer exists in, so there is always a
    // texture to measure; `setFrame` immediately puts it right.
    const seed = FRAMES.find(f => part.at(f))
    if (!seed) continue
    const s = new PIXI.Sprite(tex(part.url(seed)))
    view.addChild(s)
    sprites[key] = s
  }

  let current: Frame = opts?.frame ?? 'rest'
  let rodTip: Skiff['rodTip'] = null
  /** Which file each layer is showing right now. The aura keys off this: two
   *  poses of a rod are two different pictures, and a glow baked from the wrong
   *  one is a glow of the wrong shape. */
  const showing = {} as Partial<Record<Key, string>>

  const skiff: Skiff = {
    view,
    onFrame: null,
    frame: () => current,
    parts: sprites,
    poseOf: (key) => {
      const url = showing[key]
      if (!url) return null
      const image = images.get(url)
      return image ? { image, key: url } : null
    },
    get rodTip() { return rodTip },

    setFrame(f) {
      current = f
      charSprite.texture = tex(parts.character(f))
      charSprite.width = w
      charSprite.height = h

      for (const key of KEYS) {
        const part = parts[key]
        const s = sprites[key]
        if (!part || !s) continue
        const at = part.at(f)
        if (!at || at.hidden) { s.visible = false; continue }
        s.visible = true
        const url = part.url(f)
        showing[key] = url
        s.texture = tex(url)
        place(s, at, w, h)
        if (key === 'rod') {
          // The far end of the rod, taken from the sprite's own placed box
          // rather than guessed, so a longer rod puts its sparks further out
          // without anybody editing a number — and so the tip follows the rod
          // through the cast instead of staying where the rest pose left it.
          const bw = s.texture.width * s.scale.x
          const bh = s.texture.height * s.scale.y
          rodTip = { x: s.x - bw * 0.86, y: s.y - bh * 0.86 }
        }
      }
      skiff.onFrame?.(f)
    },
  }

  skiff.setFrame(current)

  // The DOM's own nudge on the whole composite: the sheet reserves a large
  // empty region up and to the left for the rod and line, so the hull sits low
  // and right of the image centre.
  view.x = -0.08 * w
  view.y = -0.26 * h

  return skiff
}
