// ── A CAPTAIN ON THE CHART ──────────────────────────────────────────────────
//
// One person, their boat, their tackle and everything it glows with, assembled
// from the cosmetic tables and ready to be dropped into the canvas. This is the
// piece that sits between `skiffArt` (which knows how to stack the layers) and
// the chart (which knows where people are), and it exists because BOTH the
// player and every trader out there need exactly the same thing built.
//
// It is deliberately not a component and knows nothing about React. A captain
// is made once when their look changes and then steered from the frame loop,
// which is the opposite of how the DOM version worked and the entire reason the
// canvas can hold a fleet.
//
// ── WHAT IS CENTRED, AND WHY IT HAS TO BE ───────────────────────────────────
//
// The DOM centres a captain with `translate(-50%, -50%)` on a div that is
// exactly the composite's size, then the composite nudges itself up and left
// because the sprite sheet reserves a big empty region for the rod and line.
// Both halves of that are reproduced here, so `view` is a container whose
// ORIGIN is the point the captain should stand on. Everything upstream then
// only has to say where that point is.

import type { Container, Sprite, Texture } from 'pixi.js'
import { BOATS } from '@/lib/boats'
import { HATS } from '@/lib/hats'
import { PET_OVERLAYS, type PetSpecies } from '@/lib/pets'
import { getCharacterSprites } from '@/lib/characters'
import { imageFor, makeSkiff, texture, type Frame, type Placement, type Skiff } from './skiffArt'
import {
  makeAura, bakeSilhouette, rodEffect, hookEffect, hullEffect,
  type Aura, type EffectName,
} from './aura'

/** Everything about how one captain looks. Flat and primitive on purpose: it is
 *  compared field by field to decide whether a captain needs rebuilding, and an
 *  object in here would make every frame look like a change of outfit. */
export type CaptainLook = {
  characterColor: string
  boatId: string | null
  hatId: string | null
  /** The pet's own art. A pet is a VARIANT with its own picture, but it sits
   *  where its SPECIES sits — every parrot perches where a parrot perches. */
  petArt: string | null
  petSpecies: string | null
  /** A slug rod has three per-frame sprites; a single-image rod reuses one file
   *  at three different angles. Both exist and neither is a mistake. */
  rodSlug: string | null
  rodImage: string | null
  rodGlowType: string | null
  rodLockedIn: boolean
  reel: string | null
  hookUrl: string | null
  /** Rod and hook auras are resolved from these rather than from a lookup on
   *  the url, so a trader can be handed a rod with the glow deliberately left
   *  off. See the note on traders in SeaMap. */
  hookGlowType: string | null
  /** Traders are drawn smaller than the player. Applied here rather than by the
   *  caller so the auras scale with the captain instead of floating at full
   *  size around a small boat. */
  scale?: number
}

/** A cheap identity for a look, so the chart can tell "same captain" from "new
 *  outfit" without a deep compare on every frame. */
export function lookKey(l: CaptainLook | null): string {
  if (!l) return ''
  return [
    l.characterColor, l.boatId, l.hatId, l.petArt, l.petSpecies,
    l.rodSlug, l.rodImage, l.rodGlowType, l.rodLockedIn ? 'L' : '',
    l.reel, l.hookUrl, l.hookGlowType, l.scale ?? 1,
  ].join('|')
}

/** The rod, reel and hook placements, per pose. These live in SeaMap, which
 *  lifted them verbatim from FishingGame; they are repeated here because a
 *  module that draws a captain should not have to import the chart to find out
 *  where a hook goes. Every rod, reel and hook tier is uploaded on the same
 *  canvas, so one set of numbers lines all of them up — which is also why
 *  copying the table is safe rather than fragile. */
const ROD_AT: Record<Frame, Placement> = {
  rest: { top: 37, left: -12, width: 107.5, rotate: 0, origin: 'bottom right' },
  wait: { top: 37.5, left: -8, width: 107.5, rotate: 0, origin: 'bottom right' },
  cast: { top: -8.5, left: 3.5, width: 100.5, rotate: 0, origin: 'bottom right' },
}
const REEL_AT: Record<Frame, Placement> = {
  rest: { top: 15, left: -10.3, width: 222, rotate: -18 },
  wait: { top: -5.2, left: -3.1, width: 222, rotate: -36.5 },
  cast: { top: 38.9, left: -42, width: 219.5, rotate: 46.5 },
}
const HOOK_AT: Record<Frame, Placement> = {
  rest: { top: 39.5, left: -10.5, width: 204.5, rotate: 0 },
  // Hidden on the wait frame because the hook is in the water during the bite.
  wait: { top: 39.5, left: -10.5, width: 222, rotate: 0, hidden: true },
  cast: { top: 40.5, left: -73, width: 204.5, rotate: 66.5 },
}

/**
 * ── THE WATER CLOSING OVER HER FOOT ─────────────────────────────────────────
 *
 * Every rock, wreck, rig and buoy on this chart is drawn as TWO copies — a wet
 * half and a dry half, split on a waterline placed by eye. Boats were drawn as
 * one, with a hard cut at the bottom of the hull, which is why they read as
 * gliding ON the water rather than sailing THROUGH it.
 *
 * They cannot be split the same way, and the reason is in the ART: a rock's
 * plate is painted down past the water so the mark can bake the part below the
 * line, while a hull's plate is CROPPED at the water and has no underwater half
 * to find. So instead of splitting her, the water is brought up over her.
 *
 * ── AND IT IS THE HULL'S OWN SHAPE ─────────────────────────────────────────
 *
 * The first cut was a plain gradient rectangle laid across the bottom of the
 * boat, and it read as exactly that: a flat line ruled under her, with the
 * water standing in mid-air either side of a hull that curves away from it.
 *
 * This takes the hull's OWN alpha and keeps it, replacing only the colour. Draw
 * the plate, then fill through it with `source-in` and a vertical gradient: what
 * comes out is hull-shaped, transparent up top and solid along the keel, so the
 * water meets the boat on the boat's own curve.
 *
 * White, so the caller can tint it to whatever water she is actually in. Cached
 * per image and size, like every other bake here — a pose change re-cuts it and
 * coming back to a pose is a lookup.
 */
/**
 * ── WHERE THE PAINT ACTUALLY IS IN THE PLATE ────────────────────────────────
 *
 * The top and bottom of the opaque pixels, as fractions of the plate's height.
 *
 * This exists because a plate is not a picture of a boat, it is a BOX with a
 * picture in it, and how much of the box the picture fills is up to whoever
 * exported it. The fishing sheet is cropped hard at the water, so its bottom
 * edge IS the waterline and everything that assumed so was right. The sea
 * hulls are 640 by 640 squares with the ship floating in the middle:
 *
 *     sloop_v3        paint ends at 69% of the plate
 *     schooner_v3     74%
 *     brigantine_v3   76%
 *     galleon_v3      86%
 *     man-o-war_v3    92%
 *     the skins       100%
 *
 * So a reflection mirrored about the plate's bottom edge is thrown up to a
 * third of a plate too low - which is exactly what it looked like, a ship with
 * its image detached and swimming somewhere underneath it.
 *
 * Measured once per image and cached. Scanned at a reduced width because only
 * the ROWS matter: a 64 pixel wide draw answers the same question for a
 * fortieth of the pixels.
 */
const paintRows = new Map<string, { top: number; bot: number }>()

function paintBand(img: CanvasImageSource, key: string): { top: number; bot: number } {
  const hit = paintRows.get(key)
  if (hit) return hit
  const fallback = { top: 0, bot: 1 }
  const iw = (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width || 0
  const ih = (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height || 0
  if (!iw || !ih) return fallback

  const W = 64
  const H = Math.max(2, Math.round((ih / iw) * W))
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d', { willReadFrequently: true })
  if (!g) return fallback
  g.drawImage(img, 0, 0, W, H)

  let data: Uint8ClampedArray
  try {
    data = g.getImageData(0, 0, W, H).data
  } catch {
    // A tainted canvas cannot be read. The whole plate is the cautious answer
    // and it is what everything did before this existed.
    return fallback
  }

  const ink = (y: number) => {
    for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 16) return true
    return false
  }
  let top = 0
  let bot = H - 1
  while (top < H && !ink(top)) top++
  while (bot > top && !ink(bot)) bot--
  const out = top >= bot ? fallback : { top: top / H, bot: (bot + 1) / H }
  paintRows.set(key, out)
  return out
}

const soakPlates = new Map<string, Texture>()

function soakPlate(
  PIXI: typeof import('pixi.js'),
  img: CanvasImageSource,
  key: string,
  w: number, h: number,
): Texture | null {
  if (w < 2 || h < 2) return null
  const id = `${key}|${Math.round(w)}x${Math.round(h)}`
  const hit = soakPlates.get(id)
  if (hit) return hit

  const c = document.createElement('canvas')
  c.width = Math.max(2, Math.round(w))
  c.height = Math.max(2, Math.round(h))
  const g = c.getContext('2d')
  if (!g) return null
  g.drawImage(img, 0, 0, c.width, c.height)

  // KEEP THE ALPHA, REPLACE THE PAINT. source-in draws the gradient only where
  // the hull already is, which is the whole trick: the shape comes from the
  // art and the fade comes from here.
  g.globalCompositeOperation = 'source-in'
  // OVER THE PAINT, NOT OVER THE BOX. On a plate with a third of its height
  // empty below the hull, a ramp measured from the plate's edges puts its whole
  // wet end in the transparent margin and leaves the boat dry.
  const band = paintBand(img, key)
  const y0 = band.top * c.height
  const y1 = band.bot * c.height
  const grad = g.createLinearGradient(0, y0, 0, y1)
  // Nothing for the top two thirds — she is not awash — then slow, then quick.
  // Water does not creep evenly up a hull; it takes the last inch all at once.
  grad.addColorStop(0.00, 'rgba(255,255,255,0)')
  grad.addColorStop(0.62, 'rgba(255,255,255,0)')
  grad.addColorStop(0.80, 'rgba(255,255,255,0.22)')
  grad.addColorStop(0.93, 'rgba(255,255,255,0.58)')
  grad.addColorStop(1.00, 'rgba(255,255,255,0.82)')
  g.fillStyle = grad
  g.fillRect(0, 0, c.width, c.height)

  const t = PIXI.Texture.from(c)
  soakPlates.set(id, t)
  return t
}

export type Captain = {
  /** Origin is the point the captain stands on. Put this where they are. */
  view: Container
  setFrame(f: Frame): void
  /** The Locked-In Rod's streak stage. Ignored by every other rod. */
  setStage(stage: number): void
  /** The hour, as a tint. NOT a filter: a filter on a moving sprite is a
   *  re-rasterisation every frame, and there can be a fleet of these. */
  setNight(tint: number): void
  /** 0 stops every emitter and lets the tails burn out. The chart turns this
   *  down with distance — a captain three screens away does not need sixty
   *  embers, and fill rate is the one cost here that is not free. */
  setIntensity(k: number): void
  update(dt: number): void
  /**
   * HOW DEEP SHE IS SITTING, in the same bob units the chart lifts her by.
   *
   * Negative is a trough, and a hull in a trough is further into the water.
   * Passed in rather than worked out here because a captain does not know where
   * it is on the chart — the caller already has the number, having just used it
   * to lift her.
   */
  setSoak(bob: number): void
  destroy(): void
}

export async function makeCaptain(
  PIXI: typeof import('pixi.js'),
  look: CaptainLook,
  opts?: { frame?: Frame; stage?: number },
): Promise<Captain> {
  const boat = look.boatId ? BOATS.find(b => b.id === look.boatId) ?? null : null
  const hat = look.hatId ? HATS.find(h => h.id === look.hatId) ?? null : null
  const char = getCharacterSprites(look.characterColor)
  const species = look.petSpecies as PetSpecies | null
  const petAt = species && species in PET_OVERLAYS ? PET_OVERLAYS[species] : null

  const skiff: Skiff = await makeSkiff(PIXI, {
    character: f => char[f],
    hat: hat ? {
      url: f => (f === 'cast' ? hat.castImageUrl : hat.restImageUrl),
      at: f => hat.positions[f],
    } : undefined,
    boat: boat ? {
      url: f => (f === 'cast' ? boat.castImageUrl : boat.restImageUrl),
      at: f => boat.positions[f],
    } : undefined,
    rod: look.rodSlug
      ? { url: f => `/${look.rodSlug}_${f}.png`, at: f => ROD_AT[f] }
      : look.rodImage
        ? { url: () => look.rodImage as string, at: f => ROD_AT[f] }
        : undefined,
    reel: look.reel ? { url: () => look.reel as string, at: f => REEL_AT[f] } : undefined,
    pet: look.petArt && petAt
      ? { url: () => look.petArt as string, at: f => petAt[f] }
      : undefined,
    hook: look.hookUrl ? { url: () => look.hookUrl as string, at: f => HOOK_AT[f] } : undefined,
  }, { frame: opts?.frame ?? 'rest' })

  // The base sheet, captured before anything is inserted beneath it.
  const base = skiff.view.children[0] as Sprite

  // ── CENTRED ON THE POINT THEY STAND ON ────────────────────────────────────
  // The composite's own nudge is already inside `skiff.view`; this is the
  // outer translate(-50%, -50%) the DOM puts on the wrapper.
  const view: Container = new PIXI.Container()
  const body: Container = new PIXI.Container()
  body.x = -skiff.w / 2
  body.y = -skiff.h / 2
  body.addChild(skiff.view)
  view.addChild(body)
  if (look.scale && look.scale !== 1) view.scale.set(look.scale)

  // ── WHAT SHE CASTS ────────────────────────────────────────────────────────
  //
  // THE HULL ONLY, and softly. The DOM put `drop-shadow()` on the whole
  // composite, so everything threw one — the captain, the hat, the rod, and the
  // hook sprite, which is two hundred per cent of the skiff's width and almost
  // all of it fishing LINE. A hard black line lying across the water is not
  // something a fishing line does at this scale, and the shadow's whole job is
  // to give the BOAT weight rather than to be an accurate account of what is
  // between the sun and the sea.
  //
  // So it is the hull's own silhouette, from the hull she is actually sailing.
  // The old version baked the character sheet, which has a plain boat painted
  // into it — meaning an equipped hull of a different shape threw the DEFAULT
  // hull's shadow. The sheet is still the fallback, because a captain with no
  // boat cosmetic has no other source for a hull outline, and no shadow at all
  // reads worse than an approximate one.
  //
  // Softer and shallower than the DOM's, which was pitched to survive being
  // seen through a CSS filter stack: 0.3 rather than 0.55, and eight pixels
  // down rather than twelve. It should say the boat is sitting ON something,
  // and stop there.
  const shadow: Sprite = new PIXI.Sprite()
  shadow.tint = 0x000000
  shadow.alpha = 0.30
  shadow.visible = false
  skiff.view.addChildAt(shadow, 0)

  /** Re-cut for the pose. A hull has a rest sprite and a cast sprite and they
   *  are different shapes at different angles, so a shadow fixed at build time
   *  is the wrong one for a third of the animation. Cached by image and size,
   *  so coming back to a pose is a lookup. */
  function alignShadow() {
    const part: Sprite | undefined = skiff.parts.boat
    const pose = part ? skiff.poseOf('boat') : null
    const img = pose?.image ?? imageFor(char.rest)
    const key = pose?.key ?? char.rest
    if (!img) { shadow.visible = false; return }

    // The boat's own placed box when there is one; the whole composite when
    // falling back to the sheet, which is what that sheet is drawn at.
    const w = part ? part.texture.width * Math.abs(part.scale.x) : skiff.w
    const h = part ? part.texture.height * Math.abs(part.scale.y) : skiff.h
    const shade = bakeSilhouette(PIXI, img, `shadow|${key}`, w, h, 22)
    if (!shade) { shadow.visible = false; return }

    shadow.visible = true
    shadow.texture = shade.texture
    if (part) {
      // The hull's own anchor, re-expressed in the padded bake — the same
      // arithmetic the auras use, and wrong in the same way if it is skipped.
      shadow.anchor.set((shade.pad + part.anchor.x * w) / (w + shade.pad * 2),
                        (shade.pad + part.anchor.y * h) / (h + shade.pad * 2))
      shadow.scale.set(1, 1)
      shadow.position.set(part.x, part.y + 8)
      shadow.rotation = part.rotation
    } else {
      shadow.anchor.set(0, 0)
      shadow.scale.set(1, 1)
      shadow.rotation = 0
      shadow.position.set(-shade.pad, -shade.pad + 8)
    }
  }
  alignShadow()

  /**
   * ── AND WHAT SHE THROWS BACK ───────────────────────────────────────────────
   *
   * The rocks got a reflection, the islands got one, and the boats never did —
   * which is exactly the kind of inconsistency the eye catches without being
   * able to name. A hull sitting on water that reflects everything except hulls
   * reads as a sticker on the sea.
   *
   * ── ALL OF HER, NOT THE HULL ───────────────────────────────────────────────
   *
   * The first cut mirrored the boat sprite alone, borrowing the shadow's
   * argument directly above: the shadow is the hull only because a hard black
   * line of fishing line lying across the water is not something a fishing line
   * does.
   *
   * That reasoning does not carry over. A shadow is an absence of light and a
   * long thin one is a mistake; a REFLECTION is a picture, and a picture of a
   * boat with nobody in it is a stranger thing than a picture with a rod in it.
   * Whatever you have equipped is the whole reason to look at your own boat,
   * and it was the one part not making it into the water.
   *
   * ── SO: TWINS, IN A BOX THAT IS FLIPPED ────────────────────────────────────
   *
   * One mirror Sprite per source Sprite, sharing its texture — no second
   * composite built, no render-to-texture per hull per frame, no extra pixels
   * in memory. The twins copy their sources' local transforms VERBATIM and the
   * mirroring is done once, on the container holding them.
   *
   * That is the whole trick and it is why this is cheap: put the flip on the
   * box and every child is reflected correctly for free, including the ones
   * that move (a rod swings through the cast) and the ones that come and go
   * (the hook is hidden while it is in the water).
   *
   * Auras are left out. A glow is a particle system, not a sprite, and a
   * reflected emitter would be a second one — twice the sparks for a thing that
   * should be dimmer, not busier.
   *
   * ── MIRRORED ABOUT THE WATERLINE, AND SQUASHED ─────────────────────────────
   *
   * The waterline is the bottom of the opaque hull: the sheet is drawn with the
   * boat cut off at the water, so the sprite's lower edge IS where it floats.
   * Taken from the hull's own box rather than from a constant, so a cosmetic
   * hull of a different shape reflects from its own waterline instead of the
   * default one's.
   *
   * Then compressed. A captain STANDS UP out of the plane and is
   * counter-squashed to do it; a reflection LIES IN the plane, so it is
   * foreshortened like anything else lying flat.
   */
  const mirrorBox: Container = new PIXI.Container()
  // FAINT. Water gives back a fraction of what falls on it, and the number that
  // matters is how little: at anything approaching solid this stops being a
  // reflection and becomes a second boat hanging upside down off the first.
  mirrorBox.alpha = 0.26
  // Over the shadow and under everything else: a shadow is cast ON the water
  // and a reflection is IN it, so the darker mark is the lower one.
  skiff.view.addChildAt(mirrorBox, 1)

  const twins: Sprite[] = []

  /** How much of its own height a reflection keeps. */
  const LIE = 0.55
  /** How far under the hull it starts, as a share of the hull's height. Without
   *  it the reflection touches the lowest painted pixel, and a hull whose paint
   *  runs a little past the water gets a seam. */
  const SINK = 0.04

  function alignMirror() {
    // WHERE THE WATER IS, in the composite's own space.
    const part: Sprite | undefined = skiff.parts.boat
    let water: number
    if (part && part.texture) {
      const h = part.texture.height * Math.abs(part.scale.y)
      water = part.y + (1 - part.anchor.y) * h - h * SINK
    } else {
      // No hull cosmetic: the sheet's own bottom is the waterline, which is
      // what the sheet is drawn to.
      water = skiff.h * (1 - SINK)
    }

    // A child at local y lands at P - LIE * y. It should land at
    // water + (water - y) * LIE, so P is water * (1 + LIE). One line, and
    // every twin below inherits it without any mirroring maths of its own.
    mirrorBox.position.set(0, water * (1 + LIE))
    mirrorBox.scale.set(1, -LIE)

    // IN THE SAME ORDER THEY ARE DRAWN. Walking the live child list rather
    // than a remembered set of parts, so anything the pose or a cosmetic adds
    // is reflected too, and the layering in the water matches the layering
    // above it.
    let n = 0
    for (const c of skiff.view.children) {
      if (c === shadow || c === mirrorBox) continue
      if (!(c instanceof PIXI.Sprite)) continue
      const src = c as Sprite
      let t = twins[n]
      if (!t) {
        t = new PIXI.Sprite()
        twins.push(t)
        mirrorBox.addChild(t)
      }
      t.visible = src.visible
      t.texture = src.texture
      t.anchor.set(src.anchor.x, src.anchor.y)
      t.position.set(src.x, src.y)
      t.scale.set(src.scale.x, src.scale.y)
      t.rotation = src.rotation
      t.alpha = src.alpha
      // The hour is copied off the source, so the reflection darkens with the
      // thing it reflects and nothing has to remember to tint it.
      t.tint = src.tint
      n++
    }
    for (let k = n; k < twins.length; k++) twins[k].visible = false
  }
  alignMirror()

  // ── AND THE WATER COMES UP HER SIDE ───────────────────────────────────────
  //
  // See soakPlate. Added last so it lies over the hull rather than under it,
  // and cut from the hull's own alpha so the water meets the boat on the boat's
  // own curve rather than on a ruled line.
  const soak: Sprite = new PIXI.Sprite()
  soak.visible = false
  skiff.view.addChild(soak)

  /** How much the water shows at rest, and how much the heave is worth on top.
   *  She settles into a trough and rides out on a crest, which is the whole of
   *  the difference between floating and gliding. */
  const SOAK_REST = 0.78
  const SOAK_SWING = 0.34

  /** Re-cut for the pose, like the shadow and the mirror: the hull is a
   *  different shape at a different angle in the cast, and water standing
   *  against last pose's keel is worse than none. */
  function cutSoak() {
    const part: Sprite | undefined = skiff.parts.boat
    const pose = part ? skiff.poseOf('boat') : null
    const img = pose?.image ?? imageFor(char.rest)
    const key = pose?.key ?? char.rest
    if (!img || !part || !part.texture) { soak.visible = false; return }
    const w = part.texture.width * Math.abs(part.scale.x)
    const h = part.texture.height * Math.abs(part.scale.y)
    const plate = soakPlate(PIXI, img, `soak|${key}`, w, h)
    if (!plate) { soak.visible = false; return }
    soak.visible = true
    soak.texture = plate
    // Sat exactly on top of the hull, in its own anchor, so the shape lines up
    // pixel for pixel with the boat under it.
    soak.anchor.set(part.anchor.x, part.anchor.y)
    soak.scale.set(1, 1)
    soak.position.set(part.x, part.y)
    soak.rotation = part.rotation
  }

  function placeSoak(bob: number) {
    // THE SHAPE IS BAKED; THE HEAVE IS ALPHA. The band cannot grow taller
    // without stretching the hull's own outline, which would slide the water
    // off the curve it is supposed to be meeting. So she shows more of it in a
    // trough and less on a crest instead — same reading, and it costs nothing.
    const k = Math.max(-1, Math.min(1, -bob / 5.5))
    soak.alpha = Math.max(0, SOAK_REST + k * SOAK_SWING)
  }
  cutSoak()
  placeSoak(0)

  // ── WHAT THEY GLOW WITH ───────────────────────────────────────────────────
  //
  // One aura per glowing part, each built on that part's own image. The glow
  // goes UNDER its part so the part sits on top of its own light, and the
  // sparks go OVER it so the part sits inside its effect.
  const worn: { key: 'rod' | 'boat' | 'hook'; aura: Aura }[] = []
  const hang = (key: 'rod' | 'boat' | 'hook', name: EffectName | null, staged = false) => {
    const part: Sprite | undefined = skiff.parts[key]
    const pose = skiff.poseOf(key)
    if (!part || !pose || !name) return
    const aura = makeAura(PIXI, {
      part, image: pose.image, name, key: pose.key, staged, stage: opts?.stage ?? 0,
    })
    skiff.view.addChildAt(aura.under, skiff.view.getChildIndex(part))
    skiff.view.addChild(aura.over)
    worn.push({ key, aura })
  }

  hang('rod', rodEffect({ glow: !!look.rodGlowType, glowType: look.rodGlowType ?? undefined }),
    look.rodLockedIn)
  hang('boat', hullEffect(boat))
  hang('hook', hookEffect({ glow: !!look.hookGlowType, glowType: look.hookGlowType ?? undefined }))

  // Every part is a different picture at a different angle in each pose, so
  // every aura is re-pointed when the pose changes. Cheap on a pose it has seen
  // before: the bakes and the outline are cached per image.
  skiff.onFrame = () => {
    // The hull moved, so what it throws, what it throws back and the water
    // standing against it all moved with it.
    alignShadow()
    alignMirror()
    cutSoak()
    for (const w of worn) {
      // A PART THAT IS NOT DRAWN DOES NOT GLOW. The hook is hidden on the wait
      // pose because it is in the WATER, and an aura that is not told simply
      // keeps burning wherever the hook was last seen — a glow and a stream of
      // sparks hanging in mid-air at the end of the cast, which is exactly what
      // it looked like.
      const part = skiff.parts[w.key]
      const on = !!part?.visible
      w.aura.setHidden(!on)
      if (!on) continue
      const p = skiff.poseOf(w.key)
      if (p) w.aura.setPose(p.image, p.key)
    }
  }

  // The sprites the hour applies to. NOT the auras: a lantern does not get
  // dimmer because the sun went down, and a rod that stops glowing at night is
  // a rod that stops being the reason you bought it.
  const lit: Sprite[] = Object.values(skiff.parts).filter(Boolean) as Sprite[]

  // Guarded, because the chart hands this the pose every frame and a pose
  // change is real work: every layer is re-placed and every aura re-points
  // itself at a new picture. Sixty of those a second to arrive at the pose it
  // was already in is the kind of waste that only shows up on a fleet.
  let frame: Frame = opts?.frame ?? 'rest'

  /** The reflection's own clock, and a per-captain offset so a fleet of boats
   *  does not shear in unison. */
  let wob = 0
  const phase = Math.random() * 6.28

  return {
    view,
    setFrame(f) {
      if (f === frame) return
      frame = f
      skiff.setFrame(f)
    },
    setStage: s => { for (const w of worn) w.aura.setStage(s) },
    setNight(tint) {
      // The character sprite is not in `parts`, so it is tinted by hand rather
      // than forgotten. Held by reference because the shadow now sits under it
      // and an index would quietly tint the wrong thing.
      base.tint = tint
      // The band is WATER, so it takes the sea's own colour rather than the
      // hull's: a shade of the deep, darkened by the hour like everything else.
      soak.tint = ((((tint >> 16) & 255) * 0.32) << 16)
        | ((((tint >> 8) & 255) * 0.46) << 8)
        | (((tint & 255) * 0.5) | 0)
      for (const s of lit) {
        // Charcoal's hull carries a standing darken of its own, and overwriting
        // it with the hour would undo the thing that makes it charcoal. Its
        // aura owns that tint; the hour leaves it alone.
        if (s === skiff.parts.boat && hullEffect(boat) === 'ash') continue
        s.tint = tint
      }
    },
    setIntensity: k => { for (const w of worn) w.aura.setIntensity(k) },
    setSoak: placeSoak,
    update(dt) {
      for (const w of worn) w.aura.update(dt)
      // ── THE ONE THING THAT STOPS IT BEING A SECOND BOAT ────────────
      //
      // A reflection with a hard, still outline is an upside-down hull. What
      // makes it read as an image IN something is that the something moves:
      // a slow shear, so the shape leans one way and then the other while the
      // hull above it does not.
      //
      // Skew rather than rotation, because a rotation swings the whole thing
      // about its anchor and detaches it from the hull it belongs to. A shear
      // keeps the waterline edge where it is and moves everything below.
      // EVERY FRAME, not only on a pose change. A rod swings through the
      // cast, a hook appears and disappears, and the hour repaints every
      // sprite — a reflection that only re-read its sources when the POSE
      // changed would hold the last pose's rod in the water through the whole
      // animation. It is a dozen transform copies on a handful of sprites.
      alignMirror()
      wob += dt
      mirrorBox.skew.x = Math.sin(wob * 1.15 + phase) * 0.055
        + Math.sin(wob * 1.9 + phase * 2.1) * 0.025
    },
    destroy() {
      for (const w of worn) w.aura.destroy()
      view.destroy({ children: true })
    },
  }
}

/**
 * THE EXPEDITION HULL, past the sea gate.
 *
 * Not a captain at all: one sprite, centred, with a shadow under it. The whole
 * point of the crossing is that the hull CHANGES rather than being dressed up,
 * so this replaces the composite outright the way the DOM does.
 *
 * Shaped like a Captain anyway, so the chart has one slot for "the thing at the
 * centre of the screen" rather than two code paths that have to be kept in
 * step. Everything a ship has no opinion about is a no-op: it has no poses, no
 * streak and no auras.
 */
export async function makeShip(
  PIXI: typeof import('pixi.js'),
  ship: { url: string; flip: boolean; scale?: number; aura?: EffectName | null },
): Promise<Captain> {
  const tex = await texture(PIXI, ship.url)
  const view: Container = new PIXI.Container()

  // SIZED BY THE PLATE, CORRECTED FOR THE PAINT. Every hull here is drawn to
  // one width, which is right while every plate crops its ship the same way —
  // and the skin plates do not. `scale` is the measured correction and it is 1
  // for a hull in her own colours. See SKIN_SEA_SCALE in lib/shipSkins.
  const W = 340 * (ship.scale ?? 1)
  const k = W / tex.width
  const h = tex.height * k

  // NO OFFSET, and that is measured rather than assumed. A Skipper needs one
  // because its sheet reserves empty space up and left for the rod; these are
  // drawn centred, so correcting again would push the ship half its own width
  // off the point the camera is following.
  const img = imageFor(ship.url)
  if (img) {
    const shade = bakeSilhouette(PIXI, img, `shadow|${ship.url}`, W, h, 22)
    if (shade) {
      const sp: Sprite = new PIXI.Sprite(shade.texture)
      // ── THE SHADOW IS MIRRORED WITH THE SHIP ──────────────────────────
      //
      // The hull below takes ship.flip as a negative scale; the silhouette
      // did not, so on the four hulls that flip — Sloop, Schooner,
      // Brigantine, Galleon — the shadow was the ship pointing the other
      // way, bow shading her stern. It looked right on exactly one boat:
      // the Man-o-War, the only hull in the table with no seaFlip.
      //
      // Anchored at the centre so the mirror pivots about the same point
      // the hull's does, rather than around a corner that would slide the
      // shadow a full ship-length sideways.
      sp.anchor.set(0.5)
      sp.scale.set(ship.flip ? -1 : 1, 1)
      sp.position.set(0, 10)
      sp.tint = 0x000000
      // The same restraint the fishing hull got. A ship of the line is bigger
      // and sits heavier, so it keeps a little more than she does — but it is
      // still saying "on the water" rather than drawing a second boat in black.
      sp.alpha = 0.34
      view.addChild(sp)
    }
  }

  // ── AND WHAT SHE THROWS BACK ──────────────────────────────────────
  //
  // The same reflection the fishing captain gets, and simpler, because a
  // warship IS one sprite: no parts to walk, no pose to follow, nothing that
  // appears and disappears. One twin of the hull, flipped about the waterline
  // and lying down in the plane.
  //
  // The waterline is her own bottom edge less a shade, exactly as it is over
  // there — these plates are drawn cropped at the water too.
  //
  // Added BEFORE the hull so it is under her, and after the shadow so a
  // reflection is in the water rather than beneath the mark she casts on it.
  const LIE = 0.55
  const SINK = 0.04
  // HER OWN WATERLINE, not the plate's bottom edge. See paintBand: these hulls
  // sit in a square with a lot of nothing under them, and mirroring about the
  // box threw the reflection a third of a plate too low.
  const band = img ? paintBand(img, ship.url) : { top: 0, bot: 1 }
  const paintH = h * (band.bot - band.top)
  const water = (band.bot - 0.5) * h - paintH * SINK
  const back: Sprite = new PIXI.Sprite(tex)
  back.anchor.set(0.5)
  back.scale.set(ship.flip ? -k : k, -k * LIE)
  // Anchored at the centre, so reflecting the centre about the waterline is
  // the whole of the placement.
  back.position.set(0, water * (1 + LIE))
  back.alpha = 0.26
  view.addChild(back)

  const hull: Sprite = new PIXI.Sprite(tex)
  hull.anchor.set(0.5)
  hull.scale.set(ship.flip ? -k : k, k)
  view.addChild(hull)

  // ── AND WHAT HER PAINT DOES ───────────────────────────────────────
  //
  // A warship could not glow. Every prestige hull in the game sat on the water
  // as cold as bare timber while a fishing boat two bands south threw embers
  // off its gunwale, because this builder never made an aura and the captain's
  // did. Built from the HULL'S OWN SILHOUETTE like every other aura here, so
  // the light traces her sheer and the sparks leave her outline rather than
  // being a lamp parked on her deck.
  //
  // Under the hull and over it both, exactly as the captain's parts are: the
  // glow below so she sits on top of her own light, the sparks above so she is
  // inside her effect rather than behind it. Which effect is `shipEffect` in
  // auraSpecs — matched by palette against each skin's own colour.
  //
  // NO setPose. A warship is one sprite at one angle: there is no rest/wait/
  // cast to follow, which is the whole reason this is four lines and the
  // captain's is a walk of the child list.
  let aura: Aura | null = null
  if (ship.aura && img) {
    aura = makeAura(PIXI, { part: hull, image: img, name: ship.aura, key: `ship|${ship.url}` })
    view.addChildAt(aura.under, view.getChildIndex(hull))
    view.addChild(aura.over)
  }

  // ── AND THE WATER COMES UP HER SIDE ───────────────────────────────
  //
  // The same band the fishing captain gets, and the same reason: her plate is
  // cropped at the water, so there is no wet half to draw and the bottom edge
  // was a hard cut sitting on the surface. A ship of the line is heavier and
  // sits deeper, so she takes a little more of it.
  const soakT = img ? soakPlate(PIXI, img, `soak|${ship.url}`, W, h) : null
  const soak: Sprite = new PIXI.Sprite(soakT ?? undefined)
  soak.visible = !!soakT
  soak.anchor.set(0.5)
  // The same mirror the hull takes, or the water stands against the wrong side
  // of a hull that is drawn facing the other way.
  soak.scale.set(ship.flip ? -1 : 1, 1)
  view.addChild(soak)

  function placeSoak(bob: number) {
    const k = Math.max(-1, Math.min(1, -bob / 5.5))
    // A ship of the line is heavier and sits deeper, so she carries more of it.
    soak.alpha = Math.max(0, 0.88 + k * 0.3)
  }

  placeSoak(0)

  let wob = 0
  const phase = Math.random() * 6.28

  return {
    view,
    setFrame() {},
    setStage() {},
    setNight(tint) {
      hull.tint = tint
      back.tint = tint
      soak.tint = ((((tint >> 16) & 255) * 0.32) << 16)
        | ((((tint >> 8) & 255) * 0.46) << 8)
        | (((tint & 255) * 0.5) | 0)
    },
    // FILL RATE IS THE ONE THING OUT HERE THAT IS NOT FREE, and this is the
    // hull that gets drawn biggest. Passed straight through, so a warship far
    // from the camera stops emitting and lets her tail burn out exactly as
    // every other captain on the water does.
    setIntensity(kk) { aura?.setIntensity(kk) },
    setSoak: placeSoak,
    update(dt) {
      aura?.update(dt)
      // The shear that stops it being an upside-down ship. See the note on the
      // captain's — skew rather than rotation, so the waterline edge stays put.
      wob += dt
      back.skew.x = Math.sin(wob * 0.95 + phase) * 0.045
        + Math.sin(wob * 1.6 + phase * 2.1) * 0.02
    },
    destroy() { view.destroy({ children: true }) },
  }
}
