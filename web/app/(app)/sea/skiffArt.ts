// ── A CAPTAIN AND THEIR BOAT, ON THE GPU ────────────────────────────────────
//
// The DOM builds a skiff by stacking absolutely-positioned <img>: a character,
// a hat, a hull, a hook, a rod — each placed by hand-tuned percentages out of
// the cosmetic tables. This builds the same stack out of Pixi sprites.
//
// ── NOT BAKED, AND THAT IS THE POINT ────────────────────────────────────────
//
// The obvious move is to bake each finished skiff to one canvas and use it as a
// texture, the way islands and landmarks are baked. It is the wrong move here,
// because a skiff is not fixed: every part is EQUIPPABLE. Baking either
// enumerates a combinatorial space that has no business existing, or re-bakes
// every time somebody changes a hat.
//
// So it composes at runtime exactly as the DOM does, and shares textures: one
// hat texture serves every captain wearing that hat. Changing a hat swaps one
// child's texture and nothing else. This is the case where a sprite renderer is
// straightforwardly better than the DOM rather than merely equivalent — fifty
// captains at five layers each is 250 elements the compositor tracks
// individually, or 250 quads sharing twenty textures in one or two draw calls.
//
// ── THE HARD PART IS THE PLACEMENT, NOT THE CosMETICS ───────────────────────
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

export type SkiffLook = {
  characterColor: string
  boatId: string | null
  hatId: string | null
  rodSlug: string | null
  hook: string | null
}

/** Where a part sits, in the CSS sense described above. */
export type Placement = {
  top: number
  left: number
  width: number
  rotate: number
  /** CSS `transform-origin`. Only the rod uses anything but the default. */
  origin?: 'center' | 'bottom right'
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
  // bytes have landed.
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
 * Add one placed part to a skiff.
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

export type Skiff = {
  view: import('pixi.js').Container
  /** Where the rod's tip is, in the skiff's own coordinates. Emitters hang off
   *  this: a spark that comes out of the middle of a captain is not a rod. */
  rodTip: { x: number; y: number } | null
  /** The placed rod, for the glow to match. A rod's aura is its own silhouette
   *  lit up, so the thing that draws it needs the sprite rather than a
   *  position — same texture, same anchor, same rotation, or the light slides
   *  off the rod as it turns. */
  rodSprite: import('pixi.js').Sprite | null
  /** The rod's bitmap. The effects read its alpha: the glow blurs it, and the
   *  sparks come off the outline it describes. */
  rodImage: HTMLImageElement | null
}

/**
 * Compose one skiff.
 *
 * `parts` are the placements from the cosmetic tables — passed in rather than
 * imported so this file never becomes a second opinion about where a hat goes.
 */
export async function makeSkiff(
  PIXI: typeof import('pixi.js'),
  look: SkiffLook,
  parts: {
    character: string
    hat?: { url: string; at: Placement }
    boat?: { url: string; at: Placement }
    hook?: { url: string; at: Placement }
    rod?: { url: string; at: Placement }
  },
): Promise<Skiff> {
  const view = new PIXI.Container()

  // The character defines the box, so it is loaded first and everything else is
  // measured against it — same as the DOM, where the only non-absolute child is
  // what gives the container its height.
  const charTex = await texture(PIXI, parts.character)
  const w = SKIFF_W
  const h = (charTex.height / charTex.width) * w

  const charSprite = new PIXI.Sprite(charTex)
  charSprite.width = w
  charSprite.height = h
  view.addChild(charSprite)

  // Painted in the DOM's order: hat, hull, hook, rod. Order is not decoration —
  // the hull is drawn OVER the character because a captain sits in a boat.
  let rodTip: Skiff['rodTip'] = null
  let rodSprite: Skiff['rodSprite'] = null
  for (const key of ['hat', 'boat', 'hook', 'rod'] as const) {
    const part = parts[key]
    if (!part) continue
    const tex = await texture(PIXI, part.url)
    const sprite = new PIXI.Sprite(tex)
    place(sprite, part.at, w, h)
    view.addChild(sprite)
    if (key === 'rod') {
      rodSprite = sprite
      // The far end of the rod, which for the rest frame is up and to the left.
      // Taken from the sprite's own placed box rather than guessed, so a longer
      // rod puts its sparks further out without anybody editing a number.
      const bw = sprite.texture.width * sprite.scale.x
      const bh = sprite.texture.height * sprite.scale.y
      rodTip = { x: sprite.x - bw * 0.86, y: sprite.y - bh * 0.86 }
    }
  }

  // The DOM's own nudge and shadow on the whole composite.
  view.x = -0.08 * w
  view.y = -0.26 * h

  return {
    view, rodTip, rodSprite,
    rodImage: parts.rod ? imageFor(parts.rod.url) : null,
  }
}
