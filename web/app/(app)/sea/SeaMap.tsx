'use client'

// THE OCEAN HUB.
//
// Painted 2D, in the app, using art that already exists — not a renderer.
//
// The short history is worth keeping, because it is the reason this is shaped
// the way it is. This started as a Godot 3D scene (still in godot/sea, parked).
// The structure that came out of it was right: ports you dock at, waters you
// sail into, distance standing in for progression. The technology was wrong.
// The game's art is hand-painted, and an afternoon went into writing shaders to
// make a 3D renderer LOOK hand-painted, which is backwards when every plate in
// /public already is. Here the house style arrives for free.
//
// Everything moves in WORLD pixels; the viewport translates to follow the boat.
// One rAF loop owns the boat and the camera so they share a clock — nothing here
// animates on its own timer, because that is how a scene ends up feeling like
// several things happening near each other.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { PLACES, HOME, OPEN_SEA, type Place } from './chart'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getCharacterSprites } from '@/lib/characters'
import { BOATS } from '@/lib/boats'
import { HATS } from '@/lib/hats'
import { PET_OVERLAYS, type PetSpecies } from '@/lib/pets'
import { rodGlowClass } from '@/lib/rods'
import { vibrate } from '@/lib/haptics'
import FishingHere, { type FishingMods } from './FishingHere'
import { tradersAround, seaDay, KIND_LABEL, DEALS_PER_DAY, type Trader } from '@/lib/seaTraders'
import TraderPanel from './TraderPanel'

/** Metres-per-second in world pixels. Sets how big the chart may be: the longest
 *  crossing anyone tolerates is about ten seconds, and the far zone is ~3,600px
 *  out. */
const SPEED = 470
/** Low is heavy. A boat should take a moment to get going. */
const ACCEL = 2.6
/** Starts easing off here. The gap to ARRIVE is the whole feeling of coasting
 *  into a berth rather than stopping dead like a cursor. */
const SLOW = 240
const ARRIVE = 26

/**
 * THE GROUND PLANE.
 *
 * A horizon at the top of the screen says the camera is tilted. Nothing else on
 * the chart was saying it: the world was a pure top-down translate, so the sky
 * was making a promise the water never kept, and every island read as a sticker
 * lying flat on a wall of blue.
 *
 * This is the promise kept. The whole world layer is squashed vertically, which
 * is what a flat plane does when you look across it instead of down at it —
 * every zone becomes an ellipse, every distance north-south foreshortens, and
 * sailing "up" the chart covers less screen than sailing sideways, exactly as
 * it should.
 *
 * It is an orthographic tilt, not true perspective: the squash is uniform
 * rather than tightening toward the horizon, so nothing gets smaller with
 * distance. That is deliberate. Real perspective on a scrolling top-down chart
 * means the scale under the boat changes as you sail, which breaks every
 * hit-test on the map for a cue that atmospheric haze gives you for free.
 */
const GROUND = 0.58

/** The cloud bank. Written down rather than random so the sky is the same sky
 *  every session, and spread wide because the layer is 60% wider than the
 *  screen to give the parallax somewhere to travel. Sizes are percentages of
 *  the sky band, so it thins out sensibly on a phone. */
const CLOUDS = [
  { x: 2,  y: 8,  w: 26, h: 34 },
  { x: 15, y: 26, w: 18, h: 22 },
  { x: 29, y: 4,  w: 21, h: 30 },
  { x: 44, y: 22, w: 27, h: 26 },
  { x: 58, y: 6,  w: 17, h: 26 },
  { x: 69, y: 28, w: 24, h: 20 },
  { x: 84, y: 10, w: 22, h: 32 },
  { x: 95, y: 30, w: 16, h: 20 },
]

/** WHERE THE WATERLINE ACTUALLY IS, relative to the centre of the screen.
 *
 *  Measured off the art, not guessed at, and measured at the RIGHT ROW — the
 *  first version took the hull's mid-height and put the rings through the
 *  middle of the boat, which is why they read as sitting off to one side: the
 *  hull is not symmetric about its middle, so a ring at the wrong height looks
 *  like a ring at the wrong place.
 *
 *  The numbers: the composite is 210px wide and the 900x800 character sheet
 *  renders 186.7px tall. The hull overlay sits at top 77%, width 55%, on art
 *  that is 493x146, so it renders 115.5 x 34.2 and its bottom edge lands at
 *  y=177.9 in composite space. Along that bottom row the opaque hull spans art
 *  x 80..394, centring it at composite x=120.6 — LEFT of the box centre, not
 *  right. Skipper then shifts the whole composite by (-8%, -26%).
 *
 *  Which puts the point where this boat actually touches water at 1px left of
 *  centre and 34px below it. */
const WATERLINE_X = -1
const WATERLINE_Y = 34

/** Marks in the wake. Enough to trail a couple of seconds at speed; more just
 *  costs nodes nobody can see. */
/** How close you have to be to hail someone. A trader is a person, not a
 *  region — you pull alongside them, you do not "enter" them. */
const HAIL_RANGE = 190

const WAKE_MARKS = 16
/** Milliseconds between marks. Shorter reads as a solid smear, longer as a
 *  dotted line. */
const WAKE_EVERY = 85
/** How long a mark takes to dissolve. */
const WAKE_LIFE = 2100

type Vec = { x: number; y: number }

/** '#rrggbb' → [r,g,b]. */
function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

const OPEN_RGB = OPEN_SEA.map(rgb) as [number, number, number][]
const WATER_RGB: { x: number; y: number; r: number; c: [number, number, number][] }[] =
  PLACES.filter(p => p.kind === 'water' && p.sea)
    .map(p => ({ x: p.x, y: p.y, r: p.r, c: (p.sea as [string, string, string]).map(rgb) as [number, number, number][] }))

/**
 * THE COLOUR OF THE SEA WHERE YOU ARE.
 *
 * Regions used to be drawn as discs, which gave every zone a visible circular
 * edge you crossed like a doorway — the exact opposite of sailing out of one
 * stretch of water into another. There are no shapes now. Each water is a
 * COLOUR, and the sea is an inverse-distance blend of all of them plus the open
 * ocean, evaluated at the boat every frame.
 *
 * So the Shallows shade into open blue over a few hundred metres, and open blue
 * shades into the near-black of the Abyss, the way a real shelf does. Nothing
 * has an edge, and yet the water genuinely tells you where you are.
 *
 * The falloff is cubic on d/r: inside a water it dominates almost completely,
 * and by about twice its radius it contributes nearly nothing. Linear was far
 * too muddy — everything ended up the average of everything.
 */
/** The blend, and the two things the rest of the frame needs out of it: the CSS
 *  for the backdrop, and how DARK that water is. The wash and the sky both read
 *  the darkness so the whole frame agrees about how deep you are. */
type SeaLook = { css: string; lum: number; haze: string }

function seaAt(p: Vec): SeaLook {
  // THE OPEN OCEAN GETS A SMALL VOTE, NOT A BIG ONE.
  //
  // It used to get 0.55, which meant that even sitting dead in the middle of
  // the Abyss more than a third of the colour was ordinary blue — the deep
  // zones never actually arrived at their own palette. And the falloff was
  // gentle enough that being inside a zone barely counted for more than being
  // near it. Now the vote is 0.18 and the falloff is a fourth power, so the
  // water reaches the colour it is supposed to be and reaches it well before
  // the middle, which is what "deep" is supposed to feel like.
  let wSum = 0.18
  const acc: [number, number, number][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (let k = 0; k < 3; k++) {
    for (let ch = 0; ch < 3; ch++) acc[k][ch] = OPEN_RGB[k][ch] * 0.18
  }
  for (const w of WATER_RGB) {
    const d = Math.hypot(p.x - w.x, p.y - w.y) / w.r
    const d2 = d * d
    const weight = 1 / (1 + d2 * d2)
    wSum += weight
    for (let k = 0; k < 3; k++) {
      for (let ch = 0; ch < 3; ch++) acc[k][ch] += w.c[k][ch] * weight
    }
  }
  const out = acc.map(c => c.map(v => Math.round(v / wSum)))

  // Perceived brightness of the DEEP stop, 0..1. Drives how much light the
  // painted wash is allowed to add and how bright the horizon haze is.
  // Divided by 55, not 120. The deep stops on this chart run from about 39 down
  // to 16, so a 120 divisor squashed every zone into the bottom quarter of the
  // range and the Abyss came out barely darker than the Shallows.
  const lum = Math.min(1, (out[0][0] * 0.21 + out[0][1] * 0.72 + out[0][2] * 0.07) / 55)

  // THE HAZE the sky has to meet. It is this water, lifted toward white — so
  // wherever the sea and the sky touch they are the same colour, which is the
  // only thing that stops the join reading as a cut.
  // Lifted toward white by an amount that itself depends on the depth, so the
  // Abyss gets a low grey murk on the horizon and the Shallows get a bright one.
  const lift = 0.28 + lum * 0.5
  const h = out[2].map(v => Math.round(v + (232 - v) * lift))

  return {
    lum,
    haze: `rgb(${h.join(',')})`,
    // Painted three ways from the same blend, and weighted DOWN toward the
    // deep end: the pale stop used to own the top 38% of the screen, which is
    // a lot of light to be showing in water that is meant to be black.
    css:
      `radial-gradient(ellipse 130% 104% at 50% -10%, ` +
      `rgb(${out[2].join(',')}) 0%, ` +
      `rgb(${out[1].join(',')}) 24%, ` +
      `rgb(${out[0].join(',')}) 60%, ` +
      `rgb(${out[0].map(v => Math.max(0, Math.round(v * 0.62))).join(',')}) 100%)`,
  }
}


/**
 * THE SEA, DRAWN.
 *
 * Third attempt, and the first two are worth recording because they were both
 * the same mistake in different clothes.
 *
 *   1. CSS light sheets — striped caustics and a sun shaft. Gradients with hard
 *      stops make LINES, and a sheet of light over a flat colour is still a
 *      flat colour with a sheet over it.
 *   2. Drawn swell crests. Better physics, still wrong: a top-down ocean
 *      rendered as long wavy strokes reads as contour lines on a map, and the
 *      glints came out as little dashes of debris.
 *
 * Both were trying to draw the ocean's SHAPE. But every other pixel in this
 * game is hand-painted watercolour, and watercolour does not describe water
 * with outlines — it describes it with pigment settling unevenly. Mottling,
 * granulation, blooms of darker wash pooling against lighter.
 *
 * So that is what this is. Two seamless tiles of soft irregular blotches, one
 * darker and coarse, one lighter and finer, tiled across the chart and drifting
 * over each other at different speeds. Where they cross you get a shifting
 * depth that never resolves into a pattern, and never has an edge in it
 * anywhere. Nothing is stroked. Nothing blinks.
 *
 * It is cheap, too: the tiles are painted once into offscreen canvases and then
 * only ever blitted as repeating patterns, so a frame is two fills regardless
 * of how much ocean is on screen.
 */
/** THE TWO TILES ARE DIFFERENT SIZES ON PURPOSE.
 *
 *  A tiled texture is seamless but it still repeats, and at one size you can
 *  see the same patch of sea go by twice on a wide screen. Two coprime-ish
 *  sizes only line back up at their lowest common multiple — 640 and 576 give
 *  5760px, which is wider than the whole chart — so the combination never
 *  visibly repeats even though each layer does. */
const DEEP_TILE = 640
const PALE_TILE = 576

/** One seamless tile of soft blotches. Each blob is drawn nine times, at every
 *  wrap offset, so a blob crossing an edge continues correctly on the far side
 *  and the tiling has no seam to spot. */
function makeMottle(
  TILE: number, count: number, rgb: string, rMin: number, rMax: number, alpha: number, seed: number,
): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = TILE
  const g = c.getContext('2d')
  if (!g) return c
  // A plain LCG rather than Math.random: the same sea every session means a
  // stretch of water always looks like itself, which is what stops it reading
  // as static noise.
  let st = seed >>> 0
  const rnd = () => (st = (st * 1664525 + 1013904223) >>> 0) / 4294967296
  for (let i = 0; i < count; i++) {
    const x = rnd() * TILE, y = rnd() * TILE
    const r = rMin + rnd() * (rMax - rMin)
    const a = alpha * (0.45 + rnd() * 0.55)
    // Squashed, so the pigment pools along the current instead of in circles.
    const squash = 0.42 + rnd() * 0.3
    const tilt = rnd() * Math.PI
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const cx = x + ox * TILE, cy = y + oy * TILE
        if (cx < -r || cx > TILE + r || cy < -r || cy > TILE + r) continue
        g.save()
        g.translate(cx, cy)
        g.rotate(tilt)
        g.scale(1, squash)
        const grad = g.createRadialGradient(0, 0, 0, 0, 0, r)
        grad.addColorStop(0, `rgba(${rgb},${a})`)
        grad.addColorStop(0.55, `rgba(${rgb},${a * 0.45})`)
        grad.addColorStop(1, `rgba(${rgb},0)`)
        g.fillStyle = grad
        g.beginPath()
        g.arc(0, 0, r, 0, Math.PI * 2)
        g.fill()
        g.restore()
      }
    }
  }
  return c
}

let patDeep: CanvasPattern | null = null
let patPale: CanvasPattern | null = null

function seaPatterns(ctx: CanvasRenderingContext2D) {
  if (patDeep && patPale) return
  // Deep: coarse and dark, the wash pooling. Pale: finer and lighter, the
  // surface catching the sky. Different counts and radii so they never beat
  // against each other at a visible frequency.
  patDeep = ctx.createPattern(makeMottle(DEEP_TILE, 48, '2,16,30', 90, 220, 0.18, 0x5eed1), 'repeat')
  patPale = ctx.createPattern(makeMottle(PALE_TILE, 52, '198,232,246', 40, 105, 0.07, 0xa17c3), 'repeat')
}

function drawSea(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  camX: number, camY: number,
  t: number,
  /** 0..1 brightness of the water here. Scales the pale layer only — the dark
   *  pooling stays, because deep water still has structure in it. */
  lum: number,
) {
  ctx.clearRect(0, 0, w, h)
  seaPatterns(ctx)

  // Both layers move WITH the camera, because they are the water and the water
  // stays where it is. On top of that each has its own slow drift, so the sea
  // is still moving when you are not — a becalmed ocean is not a still one.
  const layer = (pat: CanvasPattern | null, size: number, px: number, py: number, alpha: number) => {
    if (!pat) return
    ctx.save()
    ctx.globalAlpha = alpha
    // THE SAME PLANE THE WORLD IS ON. The wash is water, the water is the
    // ground, and the ground is foreshortened — so the mottle compresses
    // vertically by exactly the amount the island layer does. Drawn taller by
    // the same factor so it still covers the screen after the squash.
    ctx.scale(1, GROUND)
    // Wrapped to the tile so the offsets never grow large enough to lose
    // precision on a long voyage.
    ctx.translate(-(((px % size) + size) % size), -(((py % size) + size) % size))
    ctx.fillStyle = pat
    ctx.fillRect(0, 0, w + size, h / GROUND + size)
    ctx.restore()
  }
  layer(patDeep, DEEP_TILE, camX + t * 5.5, camY + t * 2.5, 1)
  layer(patPale, PALE_TILE, camX + t * -3.5, camY + t * 6.5, 0.25 + lum * 0.75)
}

export default function SeaMap({
  fishingXP, characterColor, boatId, hatId, mods, gear, bait, baitBonus, baitQty, dealtToday,
}: {
  fishingXP: number
  /** The player's own loadout, so the thing crossing the ocean is the captain
   *  they dressed in the boat they bought — not a marker. */
  characterColor: string
  boatId: string | null
  hatId: string | null
  /** Everything the dial needs to be the REAL dial. See FishingHere. */
  mods: FishingMods
  gear: Gear
  bait: string
  baitBonus: number
  baitQty: number
  /** Trader keys already dealt with today, read on the server so the count
   *  cannot be reset by reloading the page. */
  dealtToday: string[]
}) {
  const router = useRouter()
  const level = useMemo(() => getLevelFromXP(fishingXP), [fishingXP])

  /** THE WAKE. A fixed pool of marks laid in WORLD space and left behind, which
   *  is what makes it a wake rather than a tail: each stays exactly where the
   *  hull dropped it while the boat sails on. Recycled oldest-first, so there is
   *  no allocation in the loop and no garbage at 60fps. */
  const wakeRefs = useRef<(HTMLDivElement | null)[]>([])
  const wakeAt = useRef(Array.from({ length: WAKE_MARKS }, () => ({ x: 0, y: 0, born: -9999 })))
  const wakeNext = useRef(0)
  const wakeLast = useRef(0)

  /** The at-anchor ripples, dimmed as you get under way — a boat making six
   *  knots is not sitting in its own rings. */
  const rippleRef = useRef<HTMLDivElement | null>(null)

  /** The cloud bank, which parallaxes at a fraction of the camera. */
  const cloudRef = useRef<HTMLDivElement | null>(null)
  /** The sky, recoloured every frame to match the water under it. */
  const skyRef = useRef<HTMLDivElement | null>(null)

  /** THE WATER ITSELF. Drawn, not stacked out of CSS gradients — see drawSea. */
  const seaCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)
  const boatRef = useRef<HTMLDivElement | null>(null)

  // Position, velocity and target live in refs, not state: they change every
  // frame and re-rendering React sixty times a second to move one sprite is how
  // a map like this ends up dropping frames on a phone.
  const pos = useRef<Vec>({ ...HOME })
  const vel = useRef<Vec>({ x: 0, y: 0 })
  const target = useRef<Vec>({ ...HOME })
  const facing = useRef<1 | -1>(1)

  // ── STEERING BY THUMB ───────────────────────────────────────────────────
  // Tap-to-course is fine with a mouse and miserable on a phone: crossing the
  // chart meant tapping, watching, tapping again. Holding is the fix — press
  // and the boat heads for your thumb, keep holding and drag and it follows,
  // which is one continuous gesture instead of twenty discrete ones.
  //
  // The tap survives untouched. A press that never travels far enough is still
  // a tap and still runs onTap, so entering a port and starting a cast work
  // exactly as before; only a press that MOVES becomes a helm.
  const dragFrom = useRef<Vec | null>(null)
  const dragging = useRef(false)
  /** Set on release after a drag, so the click the browser fires at the end of
   *  the gesture does not also re-plot a course. */
  const swallowTap = useRef(false)

  /** SPRITE PRELOAD, and the reason the cast used to tear.
   *
   *  The captain is not one image, it is a base sprite with the boat, hat, rod,
   *  reel, hook and pet composited on top, and FOUR of those swap file when the
   *  cast pose plays: the character, the boat, the hat and a per-frame rod.
   *  React sets all four `src` attributes in the same commit, but each <img>
   *  paints when ITS OWN bitmap is ready — so on a cold first cast they landed
   *  on different frames and you saw the base in its new pose with the boat
   *  still in the old one.
   *
   *  Same fix FishingGame uses: fetch and explicitly decode() every frame up
   *  front, so by the time the src changes the bitmap is already decoded and
   *  all four swap on one paint. The Cast button waits on this, which on any
   *  warm load resolves before the button is ever on screen.
   */
  const [spritesReady, setSpritesReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    const urls: string[] = []
    const c = getCharacterSprites(characterColor)
    urls.push(c.rest, c.wait, c.cast)
    const b = BOATS.find(x => x.id === boatId)
    if (b) urls.push(b.restImageUrl, b.castImageUrl)
    const h = HATS.find(x => x.id === hatId)
    if (h) urls.push(h.restImageUrl, h.castImageUrl)
    if (gear.rodSlug) urls.push(`/${gear.rodSlug}_rest.png`, `/${gear.rodSlug}_wait.png`, `/${gear.rodSlug}_cast.png`)
    else if (gear.rod) urls.push(gear.rod)
    if (gear.reel) urls.push(gear.reel)
    if (gear.hook) urls.push(gear.hook)
    if (gear.petArt) urls.push(gear.petArt)
    Promise.all(urls.map(src => {
      const img = new Image()
      img.src = src
      // decode() resolves when the bitmap is ready to PAINT, which is the whole
      // point — a load event only means the bytes arrived.
      if (typeof img.decode === 'function') {
        return img.decode().catch(() => new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r() }))
      }
      return new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r() })
    })).then(() => { if (!cancelled) setSpritesReady(true) })
    return () => { cancelled = true }
    // Depend on the PRIMITIVE sprite fields, never the `gear` object. It is
    // stable today because it arrives as a prop, but FishingGame has the scar
    // from the version of this that took an object rebuilt every render and
    // thrashed its ready flag into a render loop.
  }, [characterColor, boatId, hatId, gear.rodSlug, gear.rod, gear.reel, gear.hook, gear.petArt])

  // Only what the UI actually needs to re-render for.
  const [near, setNear] = useState<Place | null>(null)
  /** Who is on the water around us. Recomputed only when the boat crosses into
   *  a new cell, because the answer cannot change until it does. */
  const [traders, setTraders] = useState<Trader[]>([])
  const cellRef = useRef('')
  /** The one we have pulled alongside, and the one we are talking to. */
  const [nearTrader, setNearTrader] = useState<Trader | null>(null)
  const [hailing, setHailing] = useState<Trader | null>(null)
  /** Keys dealt with today, so a trader you have already traded with stops
   *  offering. Seeded from the server on mount and appended to on a deal. */
  const [dealt, setDealt] = useState<string[]>(dealtToday)
  const day = useMemo(() => seaDay(), [])
  // Mirrored for the loop, which must not be re-created every time the list
  // changes or the whole sail restarts.
  const tradersRef = useRef<Trader[]>([])
  useEffect(() => { tradersRef.current = traders }, [traders])
  const [tick, setTick] = useState(0)
  /** The water we have the rod out in. Null means sailing. */
  const [fishingIn, setFishingIn] = useState<Place | null>(null)
  /** A zone we have drifted out of with the rod still out, held for a warning
   *  rather than acted on silently. */
  const [leaving, setLeaving] = useState<Place | null>(null)
  const [baitLeft, setBaitLeft] = useState(baitQty)
  /** Which pose the captain is in. The game already draws three — rod up,
   *  line in the water, mid-cast — so the map uses the same ones rather than
   *  inventing a fourth. `wait` during the bite wait is most of the missing
   *  feedback: the line is visibly IN the water. */
  const [frame, setFrame] = useState<'rest' | 'wait' | 'cast'>('rest')
  // Mirrored so the rAF loop can read it without being re-created every time it
  // changes, which would restart the sweep.
  const fishingRef = useRef<Place | null>(null)
  useEffect(() => { fishingRef.current = fishingIn }, [fishingIn])

  const locked = useCallback((p: Place) => level < p.minLevel, [level])

  /** Screen point to world point, through the current camera translation. */
  const toWorld = useCallback((clientX: number, clientY: number): Vec | null => {
    const wrap = wrapRef.current
    if (!wrap) return null
    const r = wrap.getBoundingClientRect()
    return {
      x: clientX - r.left - r.width / 2 + pos.current.x,
      // Undo the plane's squash. Without this every tap in the top or bottom of
      // the screen courses to somewhere nearer than where the thumb landed, and
      // the further from centre the worse it gets.
      y: (clientY - r.top - r.height / 2) / GROUND + pos.current.y,
    }
  }, [])

  const enter = useCallback((p: Place) => {
    vibrate([18, 40, 24])
    router.push(p.href)
  }, [router])

  const onTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (swallowTap.current) return
    const pt = 'touches' in e
      ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
      : { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY }
    const w = toWorld(pt.x, pt.y)
    if (!w) return

    // A TAP IS A HELM ORDER. It goes exactly where your thumb went, and the
    // only thing that overrides that is land.
    //
    // It used to course to a WATER'S CENTRE whenever the tap landed inside one,
    // which was defensible when the zones were small discs you were trying to
    // get into. Now that they are enormous overlapping regions you sail around
    // INSIDE, almost every tap on screen lands in one — so every tap dragged
    // you back toward the middle of the zone regardless of where you pressed,
    // and the boat felt stuck. Navigating TO a place is what the compass and
    // the prompt are for; the sea itself is steering.
    const here = near
    if (here && !locked(here) && here.kind === 'port' && dist(w, here) < here.r) {
      // Tapping the port you are already moored at is the second half of the
      // trip: it takes you ashore.
      enter(here)
      return
    }

    // Land is the exception, because you cannot sail onto it. Tapping a port
    // courses for its edge so you pull alongside rather than into it.
    for (const p of PLACES) {
      if (p.kind === 'port' && dist(w, p) < p.r) {
        const dx = pos.current.x - p.x
        const dy = pos.current.y - p.y
        const m = Math.hypot(dx, dy) || 1
        target.current = { x: p.x + (dx / m) * p.r * 0.92, y: p.y + (dy / m) * p.r * 0.92 }
        return
      }
    }

    target.current = w
  }, [toWorld, near, locked, enter])

  // The canvas has to match the wrapper in CSS pixels and the DEVICE in real
  // ones, or the swell draws soft on a phone. Re-measured on resize and on
  // orientation change; the loop reads the backing store size off the element.
  useEffect(() => {
    const cvs = seaCanvasRef.current
    const wrap = wrapRef.current
    if (!cvs || !wrap) return
    const fit = () => {
      const r = wrap.getBoundingClientRect()
      // Capped at 2: a 3x phone screen triples the fill cost of the whole wash
      // for a difference nobody can see in a soft blotch.
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      cvs.width = Math.max(1, Math.round(r.width * dpr))
      cvs.height = Math.max(1, Math.round(r.height * dpr))
      cvs.style.width = `${r.width}px`
      cvs.style.height = `${r.height}px`
      const ctx = cvs.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  /** How far a press has to travel before it stops being a tap. Generous
   *  enough that a thumb resting on glass does not become a course change. */
  const DRAG_SLOP = 12

  const onDown = useCallback((e: React.PointerEvent) => {
    // Anything with a button in it is a control, not the sea. Cast, Reel In,
    // the prompt and the leaving dialog all live inside this element.
    if ((e.target as HTMLElement).closest('button, [data-no-steer]')) return
    dragFrom.current = { x: e.clientX, y: e.clientY }
    dragging.current = false
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* fine */ }
  }, [])

  const onMove = useCallback((e: React.PointerEvent) => {
    const from = dragFrom.current
    if (!from) return
    if (!dragging.current) {
      if (Math.hypot(e.clientX - from.x, e.clientY - from.y) < DRAG_SLOP) return
      dragging.current = true
      vibrate(8)
    }
    const w = toWorld(e.clientX, e.clientY)
    if (w) target.current = w
  }, [toWorld])

  const onUp = useCallback((e: React.PointerEvent) => {
    if (dragging.current) {
      // Let go and the boat coasts to where the thumb left it rather than
      // stopping dead — a hull has mass, and cutting the target to the current
      // position would read as hitting a wall.
      swallowTap.current = true
      setTimeout(() => { swallowTap.current = false }, 60)
    }
    dragFrom.current = null
    dragging.current = false
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* fine */ }
  }, [])

  // ── THE ONE LOOP ─────────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let sinceState = 0

    const step = (now: number) => {
      // Clamped delta: a backgrounded tab returns with an enormous gap, and an
      // unclamped one would teleport the boat across the chart.
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      const dx = target.current.x - pos.current.x
      const dy = target.current.y - pos.current.y
      const d = Math.hypot(dx, dy)

      let want = 0
      if (d > ARRIVE) {
        const t = Math.min(1, (d - ARRIVE) / (SLOW - ARRIVE))
        want = SPEED * (t * t * (3 - 2 * t))
      }
      const wx = d > 0.001 ? (dx / d) * want : 0
      const wy = d > 0.001 ? (dy / d) * want : 0
      const k = Math.min(1, ACCEL * dt)
      vel.current.x += (wx - vel.current.x) * k
      vel.current.y += (wy - vel.current.y) * k
      pos.current.x += vel.current.x * dt
      pos.current.y += vel.current.y * dt

      // WHICH WAY THE CAPTAIN FACES.
      //
      // The sprite is drawn facing LEFT — that is the pose, rod out to port —
      // so sailing left is the un-mirrored image and sailing right flips it.
      // It was the other way round.
      //
      // And the test is on the X component alone with a real deadband, not on
      // total speed. Sailing nearly straight up or down leaves vx hovering
      // around zero, and reading its sign every frame had the boat flipping
      // several times a second, which is the "no pattern" of it. Below the
      // deadband it simply keeps whatever it was facing.
      if (Math.abs(vel.current.x) > 70) facing.current = vel.current.x < 0 ? 1 : -1

      // THE WAKE. Lay a mark behind the hull while making way, then age every
      // mark in the pool. Marks live in world coordinates inside the world
      // layer, so they stay put on the sea while the boat leaves them behind.
      const speed = Math.hypot(vel.current.x, vel.current.y)
      if (speed > 55 && now - wakeLast.current > WAKE_EVERY) {
        wakeLast.current = now
        const i = wakeNext.current
        wakeNext.current = (i + 1) % WAKE_MARKS
        wakeAt.current[i] = {
          x: pos.current.x - (vel.current.x / speed) * 46 + WATERLINE_X,
          // WATERLINE_Y is a SCREEN measurement and this is a world coordinate
          // inside the squashed layer, so it has to be divided back out.
          y: pos.current.y - (vel.current.y / speed) * 46 + WATERLINE_Y / GROUND,
          born: now,
        }
      }
      for (let i = 0; i < WAKE_MARKS; i++) {
        const el = wakeRefs.current[i]
        if (!el) continue
        const m = wakeAt.current[i]
        const age = (now - m.born) / WAKE_LIFE
        if (age >= 1 || age < 0) { el.style.opacity = '0'; continue }
        // Spreads as it fades, the way disturbed water settles.
        el.style.opacity = String((1 - age) * 0.32)
        el.style.transform =
          `translate3d(${m.x}px, ${m.y}px, 0) translate(-50%, -50%) scale(${0.5 + age * 2.0})`
      }
      const ripples = rippleRef.current
      if (ripples) ripples.style.opacity = String(Math.max(0, 1 - speed / 190))

      // PARALLAX. The clouds are miles off, so they slide at a twelfth of the
      // camera and drift a little on their own besides. This one number is what
      // turns a flat chart into something with a distance in it.
      const clouds = cloudRef.current
      if (clouds) {
        clouds.style.transform =
          `translate3d(${-pos.current.x * 0.085 - (now / 1000) * 3.2}px, ${-pos.current.y * 0.02}px, 0)`
      }

      // Imperative writes. The whole reason this holds 60fps on a phone.
      const world = worldRef.current
      // scaleY LAST (CSS applies right to left), so the camera pan happens in
      // world units and only then meets the plane's foreshortening.
      if (world) {
        world.style.transform =
          `scaleY(${GROUND}) translate3d(${-pos.current.x}px, ${-pos.current.y}px, 0)`
      }
      // The sea recoloured under the boat. One style write per frame, and the
      // reason there are no zone edges anywhere on the chart.
      const wrap = wrapRef.current
      const look = seaAt(pos.current)
      if (wrap) wrap.style.background = look.css
      // THE SKY TAKES ITS COLOUR FROM THE WATER IT MEETS.
      //
      // This is the whole fix for the horizon reading as a cut. It was a fixed
      // pale blue sitting on top of near-black water, so there was a hard value
      // break across the join and sailing north looked like the sea and the sky
      // chopping each other off. Now the bottom of the sky IS this water lifted
      // toward white, so wherever they touch they are the same colour and the
      // one dissolves into the other. Over the Abyss the horizon goes grey and
      // low; over the Shallows it comes up bright.
      const sky = skyRef.current
      if (sky) {
        sky.style.setProperty('--sea-haze', look.haze)
        sky.style.opacity = String(0.34 + look.lum * 0.66)
      }
      // The surface, over that colour. Same camera, so the swell belongs to the
      // ocean rather than to the screen.
      const cvs = seaCanvasRef.current
      const ctx = cvs?.getContext('2d')
      if (cvs && ctx) {
        const dpr = cvs.width / Math.max(1, parseFloat(cvs.style.width) || 1)
        // The pale layer is light on water, so there has to be less of it in
        // water that is not catching any. The Abyss was getting exactly as much
        // sparkle as the Shallows, which is most of why it never read as deep.
        drawSea(ctx, cvs.width / dpr, cvs.height / dpr, pos.current.x, pos.current.y, now / 1000, look.lum)
      }
      const boat = boatRef.current
      if (boat) {
        // Screen-space only: the bob, the heel and which way it faces. Position
        // is not this element's business any more.
        const t = now / 1000
        const bob = Math.sin(t * 1.7) * 3.4 + Math.sin(t * 2.6 + 1.1) * 2.1
        const heel = Math.max(-7, Math.min(7, (vel.current.x / SPEED) * 7))
        boat.style.transform =
          `translate(-50%, -50%) translateY(${bob}px) scaleX(${facing.current}) rotate(${heel}deg)`
      }

      // Proximity drives React, but only a few times a second. Nothing on screen
      // needs it faster and it keeps the loop out of the reconciler.
      sinceState += dt
      if (sinceState > 0.12) {
        sinceState = 0
        let found: Place | null = null
        for (const p of PLACES) if (dist(pos.current, p) < p.r) found = p
        setNear(prev => (prev?.id === found?.id ? prev : found))

        // WHO IS OUT HERE. The cell key changes only when you cross a cell
        // boundary, and until it does the answer is identical — so this is a
        // string compare four times a second rather than a hash of two dozen
        // cells sixty times a second.
        const ck = `${Math.floor(pos.current.x / 900)}:${Math.floor(pos.current.y / 900)}`
        if (ck !== cellRef.current) {
          cellRef.current = ck
          setTraders(tradersAround(pos.current.x, pos.current.y, 2400, day))
        }
        // Alongside is close: a trader is a person, not a region, and you
        // should have to actually pull up to them.
        let hit: Trader | null = null
        for (const t of tradersRef.current) {
          if (Math.hypot(pos.current.x - t.x, pos.current.y - t.y) < HAIL_RANGE) { hit = t; break }
        }
        setNearTrader(prev => (prev?.key === hit?.key ? prev : hit))
        // LEAVING WITH THE ROD OUT. Caught here rather than in the tap handler
        // because you can sail out of a zone by tapping open water far away,
        // and the moment that matters is crossing the boundary, not the tap.
        const fishing = fishingRef.current
        if (fishing && (!found || found.id !== fishing.id)) {
          setLeaving(prev => prev ?? fishing)
        }
        setTick(v => (v + 1) % 1000)
      }

      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      ref={wrapRef}
      onClick={onTap}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{
        cursor: 'pointer',
        // Without this a drag on a touchscreen is a scroll gesture and the
        // pointermove events stop coming the moment the browser claims it.
        touchAction: 'none',
        // Background is written every frame by the loop — see seaAt. This is
        // only the colour before the first frame lands.
        background: seaAt(HOME).css,
      }}
      className="sea-surface"
    >
      {/* THE SURFACE, under everything. Drawn in the loop — see drawSea. */}
      <canvas ref={seaCanvasRef} aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
      }} />

      {/* THE WORLD. One transformed layer, so the camera is a single write. */}
      <div ref={worldRef} style={{ position: 'absolute', left: '50%', top: '50%', zIndex: 1, willChange: 'transform' }}>
        {PLACES.map(p => (
          <PlaceIsland key={p.id} place={p} locked={locked(p)} isNear={near?.id === p.id} />
        ))}
        {/* THE SALT ROAD. Other captains, out working. They are drawn from the
            same parts the player's own captain is, so they are house-style by
            construction rather than by anyone remembering to match it. */}
        {traders.map(t => (
          <TraderBoat key={t.key} trader={t}
            done={dealt.includes(t.key)}
            isNear={nearTrader?.key === t.key} />
        ))}

        {/* The wake, in the world layer so each mark stays on the water where
            the hull left it. Every one of these is positioned by the loop. */}
        {Array.from({ length: WAKE_MARKS }, (_, i) => (
          <div key={i} aria-hidden className="sea-wake"
            ref={el => { wakeRefs.current[i] = el }} />
        ))}
      </div>

      {/* THE HORIZON. Screen space, above the world so islands haze into it as
          they sail toward the top, below the boat so nothing occludes the
          captain. See globals.css for why it earns the one line on this page. */}
      <div ref={skyRef} aria-hidden className="sea-sky">
        <div ref={cloudRef} className="sea-clouds">
          {CLOUDS.map((c, i) => (
            <div key={i} className="sea-cloud" style={{
              left: `${c.x}%`, top: `${c.y}%`, width: `${c.w}%`, height: `${c.h}%`,
            }} />
          ))}
        </div>
      </div>

      {/* The hull settling at anchor. Three rings out of phase so it reads as
          water moving rather than something blinking. Pushed down to the
          WATERLINE: at plain screen centre these sat around the captain's
          chest, which is where they were floating above the boat. */}
      <div ref={rippleRef} aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none',
        transform: `translate(${WATERLINE_X}px, ${WATERLINE_Y}px)`,
      }}>
        <div className="sea-ripple" />
        <div className="sea-ripple" style={{ animationDelay: '1.5s' }} />
        <div className="sea-ripple" style={{ animationDelay: '3s' }} />
      </div>

      {/* THE BOAT SITS AT THE CENTRE OF THE SCREEN AND STAYS THERE.
          It used to live inside the world layer at its world position, with the
          world translated by the negative of that — which composes to dead
          centre, and is a needlessly clever way of saying "the middle". It also
          made the boat invisible for reasons I could not reproduce by reading,
          which is reason enough on its own.
          The camera follows the boat, so relative to the screen the boat never
          moves. Only the sea does. That is both simpler and what a camera-follow
          actually means. */}
      <div ref={boatRef}
        style={{
          position: 'absolute', left: '50%', top: '50%', zIndex: 5,
          willChange: 'transform', pointerEvents: 'none',
        }}>
        <Skipper characterColor={characterColor} boatId={boatId} hatId={hatId} gear={gear} frame={frame} />
      </div>

      {/* The prompt steps aside while the rod is out — the cast button is the
          only thing that should be asking for a thumb down there. */}
      {/* HAILING SOMEONE OUTRANKS THE ZONE PROMPT. You have pulled alongside a
          person; what water you happen to be floating in can wait. */}
      {!fishingIn && nearTrader && !hailing && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 22, zIndex: 12,
          display: 'flex', justifyContent: 'center', padding: '0 1rem',
        }}>
          <button
            onClick={e => { e.stopPropagation(); vibrate(14); setHailing(nearTrader) }}
            className="font-cinzel font-700"
            style={{
              padding: '0.72rem 1.5rem', borderRadius: 999, fontSize: '0.94rem',
              color: '#f6e6c6', background: 'rgba(24,18,10,0.9)',
              border: '1px solid rgba(255,206,138,0.5)',
              boxShadow: '0 6px 22px rgba(0,0,0,0.5)', cursor: 'pointer',
            }}>
            {dealt.includes(nearTrader.key)
              ? `Speak to ${nearTrader.name}`
              : `Hail ${nearTrader.name}`}
          </button>
        </div>
      )}

      {!fishingIn && !nearTrader && (
        <Prompt
          place={near}
          locked={near ? locked(near) : false}
          level={level}
          // A water does not navigate. Pressing "Fish The Shallows" puts the rod
          // in your hands where you are floating; only a port is a door.
          onEnter={p => { if (p.kind === 'water') { setFishingIn(p); vibrate(14) } else enter(p) }}
          tick={tick}
        />
      )}
      <WaterBanner place={near && near.kind === 'water' ? near : null} locked={near ? locked(near) : false} />
      <Compass pos={pos} locked={locked} />

      {fishingIn && (
        <FishingHere
          zone={fishingIn.id}
          zoneName={fishingIn.name}
          bait={bait}
          baitBonus={baitBonus}
          baitLeft={baitLeft}
          mods={mods}
          onBaitSpent={left => { if (typeof left === 'number') setBaitLeft(left) }}
          fishingXP={fishingXP}
          onPose={setFrame}
          spritesReady={spritesReady}
          onClose={() => { setFishingIn(null); setFrame('rest') }}
        />
      )}

      {hailing && (
        <TraderPanel
          trader={hailing}
          alreadyDealt={dealt.includes(hailing.key)}
          dealsLeft={DEALS_PER_DAY - dealt.length}
          onDealt={key => setDealt(prev => (prev.includes(key) ? prev : [...prev, key]))}
          onClose={() => setHailing(null)}
        />
      )}

      {/* LEAVING THE WATER. Sailing out with the rod out is a decision, so it
          is asked rather than done. The wording is exact on purpose: sailing
          away does NOT break a perfect streak in this game — only casting in a
          different zone does, and returning to the same water keeps it. Saying
          "you will lose your streak" here would be a lie that costs people
          casts they did not need to spend. */}
      {leaving && (
        <div onClick={e => e.stopPropagation()} style={{
          position: 'absolute', inset: 0, zIndex: 40, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
          background: 'rgba(2,8,14,0.72)', backdropFilter: 'blur(3px)',
        }}>
          <div style={{
            width: '100%', maxWidth: 340, borderRadius: 16, padding: '1.2rem',
            textAlign: 'center', background: 'rgba(8,16,24,0.98)',
            border: '1px solid rgba(180,214,232,0.35)',
          }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#e8f0f6' }}>
              Leaving {leaving.name}
            </p>
            <p className="font-karla" style={{ fontSize: '0.84rem', color: '#9fb4c2', marginTop: 8, lineHeight: 1.5 }}>
              Your line comes in. The streak you have built here holds while you sail
              and only breaks if you cast in different water.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => { setLeaving(null); setFishingIn(null) }}
                className="font-cinzel font-700"
                style={{
                  flex: 1, padding: '0.7rem', borderRadius: 11, fontSize: '0.86rem',
                  color: '#f2ead8', background: 'rgba(180,214,232,0.16)',
                  border: '1px solid rgba(180,214,232,0.45)', cursor: 'pointer',
                }}>
                Sail on
              </button>
              <button onClick={() => {
                // Back to where the rod is. Cancelling has to actually return
                // you, or the boat keeps drifting and asks again immediately.
                const back = leaving
                target.current = { x: back.x, y: back.y }
                setLeaving(null)
              }}
                className="font-karla font-700"
                style={{
                  flex: 1, padding: '0.7rem', borderRadius: 11, fontSize: '0.86rem',
                  color: '#cfe0ec', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.16)', cursor: 'pointer',
                }}>
                Stay here
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function dist(a: Vec, p: { x: number; y: number }): number {
  return Math.hypot(a.x - p.x, a.y - p.y)
}

/**
 * THE CAPTAIN, in their boat.
 *
 * Exactly the stack the fishing screen uses: the character sprite is the BASE
 * (it already contains a plain hull), and the bought boat and hat are overlays
 * positioned on top of it as percentages of the character box. Reusing that
 * composition rather than inventing one means a new hat or hull shows up out
 * here the day it ships, with no second set of coordinates to keep in step.
 *
 * The `rest` frame throughout. `cast` is a fishing pose and has no business on
 * open water.
 */
export type Gear = {
  /** A slug rod has three per-frame sprites at `/${slug}_${frame}.png`. Every
   *  high tier is one of these. */
  rodSlug: string | null
  /** A single-image rod, reused across frames. Null on the low tiers, whose
   *  rods are painted into the character sprite and have no overlay at all —
   *  that null is correct rather than missing. */
  rod: string | null
  rodGlow: string | null
  rodColor: string | null
  reel: string | null
  hook: string | null
  pet: string | null
  petArt: string | null
}

/** Overlay coordinates, lifted verbatim from FishingGame. Every rod, reel and
 *  hook tier is uploaded on the same canvas, so one set of numbers lines up all
 *  of them — which is also why copying the table is safe rather than fragile. */
const ROD_AT = {
  rest: { top: 37, left: -12, width: 107.5, rotate: 0 },
  wait: { top: 37.5, left: -8, width: 107.5, rotate: 0 },
  cast: { top: -8.5, left: 3.5, width: 100.5, rotate: 0 },
} as const
const REEL_AT = {
  rest: { top: 15, left: -10.3, width: 222, rotate: -18 },
  wait: { top: -5.2, left: -3.1, width: 222, rotate: -36.5 },
  cast: { top: 38.9, left: -42, width: 219.5, rotate: 46.5 },
} as const
const HOOK_AT = {
  rest: { top: 39.5, left: -10.5, width: 204.5, rotate: 0, hidden: false },
  // Hidden on the wait frame because the hook is in the water during the bite.
  wait: { top: 39.5, left: -10.5, width: 222, rotate: 0, hidden: true },
  cast: { top: 40.5, left: -73, width: 204.5, rotate: 66.5, hidden: false },
} as const

type CharFrame = 'rest' | 'wait' | 'cast'
const FRAMES: CharFrame[] = ['rest', 'wait', 'cast']

/**
 * ONE COSMETIC LAYER — drawn once per frame, switched with `visibility`.
 *
 * It must not be a single <img> whose src changes, and the reason is in the
 * base art: the character sheet has a plain wooden hull and a red bandana
 * PAINTED INTO IT. An equipped boat and hat are drawn over the top and cover
 * them exactly — but only while every layer agrees on which frame it is in.
 *
 * Swapping src cannot guarantee that. React writes all the src attributes in
 * one commit, but each <img> paints when its own bitmap is ready, so the base
 * would flip to the cast pose a frame or two before the boat did and the
 * painted-in default underneath was suddenly visible. Preloading and decoding
 * every frame up front makes that rare; it does not make it impossible, which
 * is why it did not fix it.
 *
 * So every frame of every layer is mounted at once, already loaded and already
 * rasterised, and the pose change is a `visibility` flip on all of them in a
 * single style recalculation. There is no decode in the path any more, so there
 * is nothing left to arrive late.
 */
function Layer({ frame, src, at, hiddenOn, origin, className, style }: {
  frame: CharFrame
  src: (f: CharFrame) => string
  at: (f: CharFrame) => { top: number; left: number; width: number; rotate: number } | null
  hiddenOn?: (f: CharFrame) => boolean
  origin?: string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <>
      {FRAMES.map(f => {
        const p = at(f)
        if (!p) return null
        const on = f === frame && !hiddenOn?.(f)
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={f} src={src(f)} alt="" draggable={false}
            // The glow animations go on the VISIBLE copy only. Three sets of
            // keyframes running behind a hidden layer is work nobody sees.
            className={on ? className : undefined}
            style={{
              position: 'absolute',
              top: `${p.top}%`, left: `${p.left}%`, width: `${p.width}%`, maxWidth: 'none',
              transform: `rotate(${p.rotate}deg)`,
              transformOrigin: origin ?? 'center center',
              visibility: on ? 'visible' : 'hidden',
              ...style,
            }} />
        )
      })}
    </>
  )
}

function Skipper({ characterColor, boatId, hatId, gear, frame }: {
  characterColor: string
  boatId: string | null
  hatId: string | null
  gear: Gear
  frame: CharFrame
}) {
  const char = useMemo(() => getCharacterSprites(characterColor), [characterColor])
  const boat = useMemo(() => BOATS.find(b => b.id === boatId) ?? null, [boatId])
  const hat = useMemo(() => HATS.find(h => h.id === hatId) ?? null, [hatId])

  return (
    <div style={{
      position: 'relative', width: 210,
      // The sprite sheet reserves a large empty region up and to the left for
      // the rod and line, so the hull sits low and right of the image centre.
      // This offset puts the BOAT in the middle of the screen rather than the
      // bounding box, which is what the camera is actually following.
      transform: 'translate(-8%, -26%)',
      filter: 'drop-shadow(0 12px 18px rgba(0,0,0,0.55))',
    }}>
      {/* THE BASE, all three poses. `rest` stays in the flow so it is what
          gives the container its height — visibility keeps a layout box, so it
          holds the box open whichever pose is actually showing, and all three
          sheets are the same size anyway. */}
      {FRAMES.map(f => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={f} src={char[f]} alt="" draggable={false} style={{
          width: '100%', display: 'block',
          ...(f === 'rest' ? {} : { position: 'absolute', top: 0, left: 0 }),
          visibility: f === frame ? 'visible' : 'hidden',
        }} />
      ))}

      {hat && (
        <Layer frame={frame}
          src={f => (f === 'cast' ? hat.castImageUrl : hat.restImageUrl)}
          at={f => hat.positions[f]} />
      )}
      {boat && (
        <Layer frame={frame}
          src={f => (f === 'cast' ? boat.castImageUrl : boat.restImageUrl)}
          at={f => boat.positions[f]}
          className={boat.glow ? 'boat-glow' : undefined} />
      )}
      {(gear.rodSlug || gear.rod) && (
        <Layer frame={frame}
          // A slug rod has three per-frame sprites; a single-image rod reuses
          // one file at three different angles.
          src={f => (gear.rodSlug ? `/${gear.rodSlug}_${f}.png` : (gear.rod as string))}
          at={f => ROD_AT[f]}
          origin="bottom right"
          className={gear.rodGlow ? rodGlowClass({ glow: true, glowType: gear.rodGlow } as never) : undefined}
          style={gear.rodColor ? ({ ['--rod-glow-color' as string]: gear.rodColor } as React.CSSProperties) : undefined} />
      )}
      {gear.reel && (
        <Layer frame={frame} src={() => gear.reel as string} at={f => REEL_AT[f]} />
      )}
      {gear.pet && gear.petArt && (
        <Layer frame={frame} src={() => gear.petArt as string}
          at={f => PET_OVERLAYS[gear.pet as PetSpecies]?.[f] ?? null} />
      )}
      {gear.hook && (
        <Layer frame={frame} src={() => gear.hook as string} at={f => HOOK_AT[f]}
          // The hook is in the water during the bite, so it is not on the rod.
          hiddenOn={f => HOOK_AT[f].hidden} />
      )}
    </div>
  )
}


/**
 * A PLACE ON THE WATER.
 *
 * Not a picture floating on a background. A port is LAND — an island silhouette
 * with the painted plate showing through it as its surface, a shoreline, and a
 * jetty running out into the water where you tie up. A water is a REGION, drawn
 * as a stretch of sea that has changed colour, with no coastline at all because
 * it does not have one.
 *
 * The island shape is generated per place from its id, so no two are the same
 * outline and a row of them never reads as a row of buttons.
 *
 * This is scaffolding for real art, not a substitute for it. Every plate here is
 * a scene painting doing duty as terrain; a purpose-painted island or dock plate
 * drops straight into `art` and this shape logic keeps working under it.
 */
/** Foam and weed sizes for the drift scatter. Hand-picked rather than random so
 *  a zone always looks the same, and varied enough that it never tiles. */
const DRIFT = [
  { w: 46, h: 9, a: 0.16, blur: 5 }, { w: 28, h: 6, a: 0.13, blur: 4 },
  { w: 62, h: 11, a: 0.10, blur: 7 }, { w: 34, h: 7, a: 0.18, blur: 3 },
  { w: 52, h: 8, a: 0.12, blur: 6 }, { w: 24, h: 5, a: 0.20, blur: 2 },
  { w: 70, h: 12, a: 0.09, blur: 8 }, { w: 38, h: 7, a: 0.15, blur: 4 },
  { w: 30, h: 6, a: 0.14, blur: 3 }, { w: 56, h: 10, a: 0.11, blur: 6 },
]

/** How far an island stands out of the water, in SCREEN pixels. Everything
 *  with height divides by GROUND to convert that into the squashed layer's own
 *  units, so the lift stays the same on screen however the plane is tilted. */
const ISLAND_LIFT = 15

/** A trader has no rod, reel, hook or pet — they are working, not fishing, and
 *  an NPC wearing the player's tackle reads as a mirror rather than a stranger. */
const TRADER_GEAR: Gear = {
  rodSlug: null, rod: null, rodGlow: null, rodColor: null,
  reel: null, hook: null, pet: null, petArt: null,
}

/**
 * ANOTHER CAPTAIN, ON THE WATER.
 *
 * Built out of Skipper — the same component that draws the player — because the
 * answer to "what should an NPC look like" is "like a person who plays this
 * game". Hull, bandana and colour come off the cosmetic tables, so a stranger
 * out here is wearing things you could be wearing, and anything that ships for
 * players turns up on the Salt Road the same day.
 *
 * Counter-squashed like everything else with height. A boat stands ON the
 * plane; it is not painted onto it.
 */
function TraderBoat({ trader, done, isNear }: { trader: Trader; done: boolean; isNear: boolean }) {
  return (
    <div style={{
      position: 'absolute', left: trader.x, top: trader.y,
      pointerEvents: 'none', zIndex: 2,
    }}>
      {/* Contact shadow, ON the plane and therefore squashed with it. */}
      <div aria-hidden style={{
        position: 'absolute', left: -66, top: 6, width: 132, height: 46,
        borderRadius: '50%', background: 'rgba(2,10,18,0.34)', filter: 'blur(7px)',
      }} />
      <div style={{
        transform: `translate(-50%, -50%) scaleY(${1 / GROUND}) scale(0.78)`,
        // Someone you have already dealt with today is still there — they do
        // not vanish, because a person vanishing when you are done with them is
        // the sort of thing that makes a world feel like a vending machine.
        // They just stop calling out.
        opacity: done ? 0.62 : 1,
      }}>
        <Skipper
          characterColor={trader.look.characterColor}
          boatId={trader.look.boatId}
          hatId={trader.look.hatId}
          gear={TRADER_GEAR}
          frame="rest"
        />
      </div>

      {/* Name and trade, counter-squashed — a label was never on the plane. */}
      <div style={{
        position: 'absolute', left: 0, top: 30,
        transform: `translateX(-50%) scaleY(${1 / GROUND})`,
        transformOrigin: 'top center',
        textAlign: 'center', whiteSpace: 'nowrap', pointerEvents: 'none',
        opacity: isNear ? 1 : 0.72, transition: 'opacity 220ms ease-out',
      }}>
        <p className="font-cinzel font-700" style={{
          fontSize: '0.74rem', color: done ? 'rgba(180,192,200,0.6)' : '#e6eef4',
          textShadow: '0 2px 12px rgba(0,0,0,0.9)',
        }}>{trader.name}</p>
        <p className="font-karla font-600" style={{
          fontSize: '0.58rem', marginTop: 1,
          color: done ? 'rgba(160,176,186,0.55)' : 'rgba(255,214,150,0.85)',
          textShadow: '0 1px 9px rgba(0,0,0,0.9)',
        }}>{done ? 'Traded today' : KIND_LABEL[trader.kind]}</p>
      </div>
    </div>
  )
}

function PlaceIsland({ place, locked, isNear }: { place: Place; locked: boolean; isNear: boolean }) {
  const isWater = place.kind === 'water'
  const d = place.r * 2

  // An irregular coastline, seeded off the id so it is stable across renders and
  // different for every island.
  const clip = useMemo(() => {
    let h = 0
    for (let i = 0; i < place.id.length; i++) h = (h * 31 + place.id.charCodeAt(i)) >>> 0
    const pts: string[] = []
    const N = 26
    for (let i = 0; i < N; i++) {
      const a = (Math.PI * 2 * i) / N
      const wobble =
        0.085 * Math.sin(a * 3 + (h % 100) / 12) +
        0.05 * Math.cos(a * 5 - (h % 70) / 9) +
        0.028 * Math.sin(a * 8 + (h % 40) / 5)
      const r = 46 + wobble * 100
      pts.push(`${(50 + Math.cos(a) * r).toFixed(2)}% ${(50 + Math.sin(a) * r).toFixed(2)}%`)
    }
    return `polygon(${pts.join(', ')})`
  }, [place.id])

  return (
    <div style={{
      position: 'absolute', left: place.x, top: place.y,
      width: d, height: d, marginLeft: -place.r, marginTop: -place.r,
      pointerEvents: 'none',
    }}>
      {isWater ? (
        /* NO SHAPE AT ALL. The water itself is already telling you where you
           are — seaAt blends the whole background toward this zone's colour as
           you approach, so the Shallows shade into open blue and open blue
           shades into the near-black of the Abyss the way a real shelf does.
           Drawing anything with an edge on top of that would put back the
           doorway the blend exists to remove.

           What is left is DRIFT: a scatter of foam and weed, thicker toward the
           middle, so open water still has something in it to read at speed.
           Positions come off the id, so a zone's drift is its own and never
           moves between renders. */
        <>
          {DRIFT.map((f, i) => {
            const seed = (place.id.charCodeAt(i % place.id.length) * (i + 7)) % 97
            const ang = (seed / 97) * Math.PI * 2
            const rad = (0.22 + ((seed % 11) / 11) * 0.66) * place.r
            return (
              <div key={i} aria-hidden style={{
                position: 'absolute',
                left: place.r + Math.cos(ang) * rad,
                top: place.r + Math.sin(ang) * rad,
                width: f.w, height: f.h,
                marginLeft: -f.w / 2, marginTop: -f.h / 2,
                borderRadius: '50%',
                background: locked ? 'rgba(150,164,178,0.10)' : `rgba(214,232,238,${f.a})`,
                filter: `blur(${f.blur}px)`,
                transform: `rotate(${seed * 3.7}deg) scaleX(${1.4 + (seed % 5) * 0.5})`,
              }} />
            )
          })}
          {locked && (
            /* Weather, not a wall. A locked water is one you can SEE is bad:
               squall streaks that fade out with no boundary anywhere. */
            <div aria-hidden style={{
              position: 'absolute', inset: '4%',
              background: 'repeating-linear-gradient(58deg, rgba(150,164,178,0.13) 0 8px, transparent 8px 22px)',
              maskImage: 'radial-gradient(circle, #000 20%, transparent 72%)',
              WebkitMaskImage: 'radial-gradient(circle, #000 20%, transparent 72%)',
            }} />
          )}
        </>
      ) : (
        <>
          {/* ── THE FOOTPRINT, flat on the water ──────────────────────
              Shoals and a wet shore ring, which live INSIDE the squashed world
              layer and so come out as ellipses. This is the island's shadow on
              the sea and the only part of it that is genuinely lying down. */}
          <div aria-hidden style={{
            position: 'absolute', inset: '2%', clipPath: clip,
            background: 'rgba(150,190,205,0.16)', filter: 'blur(6px)',
          }} />
          <div aria-hidden style={{
            position: 'absolute', inset: '10%', clipPath: clip,
            background: 'rgba(196,214,222,0.34)',
          }} />
          {/* Contact shadow, thrown away from the light. Nothing says "this
              object is ABOVE the water" faster than a shadow that is not
              directly under it. */}
          <div aria-hidden style={{
            position: 'absolute', inset: '11%', clipPath: clip,
            transform: `translate(${ISLAND_LIFT * 0.34}px, ${ISLAND_LIFT * 0.5}px)`,
            background: 'rgba(2,10,18,0.42)', filter: 'blur(9px)',
          }} />

          {/* ── THE CLIFF, the extrusion ────────────────────────────────
              The same coastline again, dropped by the island's height and
              filled with wet rock. Drawn UNDER the top face, so all you ever
              see of it is the band along the near edge — which is exactly what
              you see of a real island's side from a low angle, and is the whole
              trick of an extrusion. */}
          <div aria-hidden style={{
            position: 'absolute', inset: '13%', clipPath: clip,
            transform: `translateY(${ISLAND_LIFT / GROUND}px)`,
            background: 'linear-gradient(180deg, #3b3226 0%, #2a2419 55%, #191509 100%)',
            filter: locked ? 'grayscale(0.9) brightness(0.5)' : 'none',
          }} />

          {/* ── THE TOP FACE, lifted clear of the water ─────────────────
              Counter-squashed so the land itself is NOT foreshortened — an
              island is a solid standing on the plane, not a decal printed on
              it — then raised by the same lift the cliff was dropped by. */}
          <div style={{
            position: 'absolute', inset: '13%', clipPath: clip, overflow: 'hidden',
            transform: `translateY(${-ISLAND_LIFT / GROUND}px)`,
            filter: locked ? 'grayscale(0.9) brightness(0.55)' : 'brightness(0.94) saturate(0.92)',
            boxShadow: 'inset 0 0 40px rgba(0,0,0,0.55)',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={place.art} alt="" draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            {/* A rim of light along the top edge, where the sky hits the land
                and the cliff below it does not. */}
            <div aria-hidden style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, rgba(226,238,242,0.30) 0%, rgba(226,238,242,0) 22%)',
            }} />
          </div>

          {/* ── THE JETTY, standing on the plane ────────────────────────
              Counter-squashed like everything else that has height, and
              anchored at its landward end so it runs OUT from the shore
              rather than floating beside it. */}
          <div aria-hidden style={{
            position: 'absolute', left: '50%', top: '78%',
            transform: `translateY(${-ISLAND_LIFT / GROUND}px) scaleY(${1 / GROUND})`,
            transformOrigin: 'left center',
            width: place.r * 0.62, height: 11,
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              transform: 'translateX(-6%) rotate(9deg)',
              background: 'linear-gradient(180deg, #6d5636, #3d2f1d)',
              borderRadius: 2,
              boxShadow: '0 3px 10px rgba(0,0,0,0.55)',
              opacity: locked ? 0.4 : 1,
            }} />
            {[0.34, 0.58, 0.82].map(f => (
              <div key={f} style={{
                position: 'absolute', left: `${f * 100}%`, top: 6,
                width: 5, height: 15, background: '#2e2416', borderRadius: 1,
                transform: 'rotate(9deg)', opacity: locked ? 0.4 : 0.9,
              }} />
            ))}
          </div>

          {/* A lantern on the end of the jetty. The thing you steer toward at
              distance, and the only warm colour on the whole chart. It sits
              highest of anything here, so it gets the most lift. */}
          <div aria-hidden style={{
            position: 'absolute', left: `calc(50% + ${place.r * 0.56}px)`, top: '72%',
            transform: `translateY(${-(ISLAND_LIFT + 10) / GROUND}px)`,
            width: 13, height: 13, borderRadius: '50%',
            background: locked ? 'rgba(150,160,170,0.5)' : '#ffd986',
            boxShadow: locked ? 'none' : `0 0 ${isNear ? 26 : 15}px 6px rgba(255,196,110,${isNear ? 0.5 : 0.3})`,
            transition: 'box-shadow 300ms ease-out',
          }} />
        </>
      )}

      {/* PORTS ONLY. A port is a thing with a name board on it. A water is not:
          its name used to hang in the middle of the sea like a label on a map,
          which is exactly the map-not-place feeling the blend was undoing. The
          water tells you where you are by its colour, and the banner at the top
          says it in words when you cross. */}
      {!isWater && (
        <div style={{
          position: 'absolute', left: '50%', top: '100%',
          // COUNTER-SQUASHED. It sits inside the world layer so it travels with
          // its island, but it is a label, not a thing lying on the water —
          // left on the plane it renders 58% tall and unreadable.
          transform: `translate(-50%, 8px) scaleY(${1 / GROUND})`,
          transformOrigin: 'top center',
          textAlign: 'center', whiteSpace: 'nowrap',
        }}>
          <p className="font-cinzel font-700" style={{
            fontSize: '0.96rem', color: locked ? 'rgba(180,192,200,0.55)' : '#e6eef4',
            textShadow: '0 2px 12px rgba(0,0,0,0.9)',
          }}>{place.name}</p>
          <p className="font-karla font-600" style={{
            fontSize: '0.7rem', marginTop: 1,
            color: locked ? 'rgba(206,152,152,0.8)' : 'rgba(184,204,218,0.72)',
            textShadow: '0 1px 9px rgba(0,0,0,0.9)',
          }}>{locked ? `Fishing ${place.minLevel}` : place.blurb}</p>
        </div>
      )}
    </div>
  )
}

/** The dock prompt. Says what to do, or why you cannot. */
function Prompt({ place, locked, level, onEnter, tick }: {
  place: Place | null; locked: boolean; level: number
  onEnter: (p: Place) => void; tick: number
}) {
  if (!place) return null
  const verb = place.kind === 'port' ? 'Go ashore at' : 'Fish'
  return (
    <div key={tick > -1 ? place.id : place.id}
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 22,
        display: 'flex', justifyContent: 'center', padding: '0 1rem',
      }}>
      <button
        onClick={e => { e.stopPropagation(); if (!locked) onEnter(place) }}
        disabled={locked}
        className="font-cinzel font-700"
        style={{
          padding: '0.72rem 1.5rem', borderRadius: 999, fontSize: '0.94rem',
          color: locked ? 'rgba(210,170,170,0.9)' : '#f2ead8',
          background: locked ? 'rgba(12,10,14,0.82)' : 'rgba(10,20,28,0.86)',
          border: `1px solid ${locked ? 'rgba(200,130,130,0.4)' : 'rgba(180,214,232,0.45)'}`,
          boxShadow: '0 6px 22px rgba(0,0,0,0.5)',
          cursor: locked ? 'default' : 'pointer',
        }}>
        {locked
          ? `${place.name} needs Fishing ${place.minLevel} — you are ${level}`
          : `${verb} ${place.name}`}
      </button>
    </div>
  )
}

/**
 * WHERE YOU ARE, along the top.
 *
 * Replaces the zone names that used to hang in the middle of the sea like
 * labels on a map — which was the map-not-place feeling the colour blend exists
 * to undo. The water already tells you where you are; this says it in words
 * only when it changes, then gets out of the way.
 *
 * It brightens on the crossing and then settles to something you can read if
 * you go looking but never notice otherwise. Two jobs, one element: "you have
 * entered somewhere new" and "what am I in".
 */
function WaterBanner({ place, locked }: { place: Place | null; locked: boolean }) {
  const [shown, setShown] = useState<Place | null>(null)
  const [fresh, setFresh] = useState(false)

  useEffect(() => {
    if (place?.id === shown?.id) return
    setShown(place)
    if (!place) return
    // The flare is the crossing. It decays on its own; nothing else needs to
    // know it happened.
    setFresh(true)
    const t = setTimeout(() => setFresh(false), 2600)
    return () => clearTimeout(t)
  }, [place, shown])

  return (
    <AnimatePresence>
      {shown && (
        <motion.div key={shown.id}
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10, transition: { duration: 0.35 } }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute', left: 0, right: 0, top: 18,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            pointerEvents: 'none',
          }}>
          <motion.p className="font-cinzel font-700"
            animate={{ opacity: fresh ? 1 : 0.42 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            style={{
              fontSize: '0.92rem', letterSpacing: '0.22em', textTransform: 'uppercase',
              color: locked ? 'rgba(214,176,176,0.95)' : '#dfeaf2',
              textShadow: '0 2px 14px rgba(0,0,0,0.95)',
            }}>
            {shown.name}
          </motion.p>
          <motion.div aria-hidden
            animate={{ opacity: fresh ? 0.5 : 0.12, width: fresh ? 96 : 46 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            style={{ height: 1, marginTop: 5, background: 'rgba(214,232,240,0.9)' }} />
          {locked && fresh && (
            <motion.p className="font-karla font-600"
              initial={{ opacity: 0 }} animate={{ opacity: 0.9 }}
              style={{
                fontSize: '0.68rem', marginTop: 6, color: 'rgba(214,166,166,0.95)',
                textShadow: '0 1px 10px rgba(0,0,0,0.95)',
              }}>
              Fishing {shown.minLevel} to work this water
            </motion.p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Off-screen pointers. Not decoration: open water with nothing in view is the
 *  classic hub failure — you cannot tell whether there is anything out there or
 *  which way, so you stop exploring. Distance matters as much as direction. */
function Compass({ pos, locked }: { pos: React.RefObject<Vec>; locked: (p: Place) => boolean }) {
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force(v => v + 1), 120)
    return () => clearInterval(id)
  }, [])
  const here = pos.current ?? HOME
  return (
    <>
      {PLACES.map(p => {
        const dx = p.x - here.x
        const dy = p.y - here.y
        const d = Math.hypot(dx, dy)
        // FROM THE EDGE, not the centre. The zones are big now — the Ancient
        // Deep is 1150 across — so a centre-distance test put an arrow on screen
        // pointing back into the water you were already sitting in.
        if (d - p.r < 700) return null
        // AIMED IN SCREEN SPACE. The compass is drawn on the screen but the
        // bearing comes from world coordinates, and the world is squashed onto
        // a tilted plane — so north-south has to be foreshortened here too or
        // every arrow points somewhere the place is not.
        const a = Math.atan2(dy * GROUND, dx)
        return (
          <div key={p.id} aria-hidden style={{
            position: 'absolute', left: '50%', top: '50%',
            transform: `rotate(${a}rad) translateX(min(38vw, 190px))`,
            pointerEvents: 'none',
          }}>
            <div style={{
              transform: `rotate(${-a}rad) translate(-50%, -50%)`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
              <span style={{
                width: 0, height: 0, transform: `rotate(${a + Math.PI / 2}rad)`,
                borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                borderBottom: `9px solid rgba(190,214,228,${locked(p) ? 0.3 : 0.62})`,
              }} />
              {/* NAME FIRST, then distance. An arrow with only a number on it
                  tells you something is 340m away and leaves you to sail there
                  to find out what — which is not navigation, it is a guess. */}
              <span className="font-cinzel font-700" style={{
                fontSize: '0.6rem', whiteSpace: 'nowrap',
                color: `rgba(214,232,240,${locked(p) ? 0.42 : 0.88})`,
                textShadow: '0 1px 6px rgba(0,0,0,0.9)',
              }}>{p.name}</span>
              <span className="font-karla font-700" style={{
                fontSize: '0.54rem', marginTop: -1,
                color: `rgba(190,214,228,${locked(p) ? 0.3 : 0.6})`,
                textShadow: '0 1px 6px rgba(0,0,0,0.9)',
              }}>{Math.round(d / 10)}m</span>
            </div>
          </div>
        )
      })}
    </>
  )
}
