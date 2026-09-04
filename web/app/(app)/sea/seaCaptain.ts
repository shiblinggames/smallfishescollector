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

import type { Container, Sprite } from 'pixi.js'
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
    // The hull moved, so what it throws moved with it.
    alignShadow()
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
      for (const s of lit) {
        // Charcoal's hull carries a standing darken of its own, and overwriting
        // it with the hour would undo the thing that makes it charcoal. Its
        // aura owns that tint; the hour leaves it alone.
        if (s === skiff.parts.boat && hullEffect(boat) === 'ash') continue
        s.tint = tint
      }
    },
    setIntensity: k => { for (const w of worn) w.aura.setIntensity(k) },
    update(dt) { for (const w of worn) w.aura.update(dt) },
    destroy() {
      for (const w of worn) w.aura.destroy()
      view.destroy({ children: true })
    },
  }
}

/**
 * THE EXPEDITION HULL, past the sortie.
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
  ship: { url: string; flip: boolean },
): Promise<Captain> {
  const tex = await texture(PIXI, ship.url)
  const view: Container = new PIXI.Container()

  const W = 340
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

  const hull: Sprite = new PIXI.Sprite(tex)
  hull.anchor.set(0.5)
  hull.scale.set(ship.flip ? -k : k, k)
  view.addChild(hull)

  return {
    view,
    setFrame() {},
    setStage() {},
    setNight(tint) { hull.tint = tint },
    setIntensity() {},
    update() {},
    destroy() { view.destroy({ children: true }) },
  }
}
