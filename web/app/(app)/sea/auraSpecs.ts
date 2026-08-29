// ── WHAT EVERY GOOD PIECE OF GEAR LOOKS LIKE ────────────────────────────────
//
// The rows. `aura.ts` is the engine that reads them; this file is the only
// place that decides what a Legendary Rod, an Ethereal hull or a Mythic hook
// actually look like.
//
// Two halves per effect, and they are not the same thing:
//
//   1. THE GLOW — the part's own silhouette lit up. Ported from that item's
//      `*-glow-*` keyframes in globals.css, stop for stop: radii, colours, the
//      alpha hiding in an rgba(), the duration, and whether it eases or runs
//      linear. If one of these ever disagrees with the stylesheet, the
//      stylesheet is right and this file is a bug.
//
//   2. THE EFFECT — what comes off that silhouette. New, because a blur cannot
//      throw anything. Sparks leave the OUTLINE along its outward normal, so
//      they belong to the shape rather than hovering near it.
//
// Kept apart from the engine because they change for different reasons: a
// designer retunes rows, an engineer changes the engine, and neither should
// have to read the other's file to do it.

// ── TIMELINES ───────────────────────────────────────────────────────────────

/** One `drop-shadow(0 0 Rpx COLOR)`. `r` is SCREEN pixels, exactly as written
 *  in the stylesheet. `a` carries the colour's own alpha, which many of the
 *  keyframes lean on. */
export type Shadow = { r: number; c: number; a: number }

/** One keyframe. `t` is the CSS percentage over 100. */
export type Stop = { t: number; layers: Shadow[] }

export type Anim = {
  /** Seconds, straight off the `animation` shorthand. */
  dur: number
  /** CSS `linear`. Everything else here is `ease-in-out`. */
  linear?: boolean
  stops: Stop[]
}

// ── PARTICLES ───────────────────────────────────────────────────────────────

export type Range = [number, number]

/** Lightning. A bolt is a connected path, not a crowd of dots, so it gets its
 *  own primitive. */
export type Arcs = {
  /** Seconds between strikes. */
  every: Range
  life: Range
  /** How far apart a bolt's ends are, in screen px along the part. */
  span: Range
  /** Sideways displacement at the first subdivision, screen px. */
  chaos: number
  width: number
  core: number
  halo: number
  /** Chance per bolt of throwing a shorter branch off its middle. */
  fork: number
}

export type Spec = {
  rate: number
  life: Range
  speed: Range
  /** Base direction, radians. Screen coordinates, so -PI/2 is UP. Blended with
   *  the outline's own normal by `normal`. */
  angle: number
  spread: number
  /** 0 uses `angle` alone; 1 leaves the part perpendicular to its own edge.
   *  This is what makes sparks belong to the thing they came off. */
  normal: number
  gravity: number
  drag: number
  size: Range
  colors: number[]
  /** Walk `colors` in order rather than sampling, so consecutive particles
   *  sweep the hue the way the keyframes do. */
  cycle?: boolean
  /** Spawn from the outline or from the body. */
  from: 'edge' | 'fill'
  swirl?: number
  /** Stretch along the direction of travel: a spark is an arc, not a dot in a
   *  hurry. */
  streak?: number
  /** Hold, then throw several at once from DIFFERENT points on the part. */
  burst?: { every: number; count: number }
  star?: boolean
  arcs?: Arcs
  /** Particles composite as LIGHT by default. Smoke and shadow do not: adding
   *  a dark colour to the scene brightens nothing, so ash and void need normal
   *  blending or they are invisible. */
  blend?: 'add' | 'normal'
}

export type Effect = {
  glow: Anim
  spec: Spec
  /** Glow layers composite as light (default) or as normal paint. Same reason
   *  as above: a smoke halo cannot be additive. */
  glowBlend?: 'add' | 'normal'
  /** A standing tint on the PART ITSELF, for effects whose CSS carries a
   *  constant brightness filter rather than an animated one. Charcoal's whole
   *  identity is that the sprite reads as deep charcoal instead of grey, and
   *  that lives in a `brightness(0.58)` baked into every keyframe. */
  darken?: number
  /** A slow vertical bob applied to the part and its glow together. Ethereal's
   *  hull does this in CSS via a second animation on the same element. */
  bob?: { px: number; dur: number }
}

// ════════════════════════════════════════════════════════════════════════════
// RODS
// ════════════════════════════════════════════════════════════════════════════

export const ROD_EFFECTS = {
  // Legendary — warm orange-red at two radii, breathing like radiating heat.
  // Embers leave the whole length and rise, because heat does.
  fire: {
    glow: {
      dur: 2.0,
      stops: [
        { t: 0.00, layers: [{ r: 4, c: 0xffb066, a: 1 }, { r: 18, c: 0xff4a10, a: 1 }] },
        { t: 0.35, layers: [{ r: 8, c: 0xffd28a, a: 1 }, { r: 32, c: 0xff3a00, a: 1 }] },
        { t: 0.65, layers: [{ r: 6, c: 0xffbf66, a: 1 }, { r: 26, c: 0xd83000, a: 1 }] },
        { t: 1.00, layers: [{ r: 4, c: 0xffb066, a: 1 }, { r: 18, c: 0xff4a10, a: 1 }] },
      ],
    },
    spec: {
      rate: 34, life: [0.7, 1.5], speed: [14, 38], angle: -Math.PI / 2, spread: 0.5,
      normal: 0.45, gravity: -30, drag: 0.4, size: [2, 5.5], from: 'edge',
      colors: [0xffd28a, 0xffb066, 0xff7a2a, 0xff4a10],
    },
  },

  // Millionaire's and Treasure — a long calm gold with ONE deliberate twinkle.
  // The narrow 46-54% window is the whole character. Twinkles pop ALL DOWN THE
  // ROD and barely move: a twinkle is a glint on metal, not a projectile.
  sparkle: {
    glow: {
      dur: 6.5,
      stops: [
        { t: 0.00, layers: [{ r: 3, c: 0xfff2c0, a: 1 }, { r: 14, c: 0xf0c040, a: 1 }] },
        { t: 0.46, layers: [{ r: 10, c: 0xffffff, a: 1 }, { r: 36, c: 0xffd560, a: 1 }] },
        { t: 0.54, layers: [{ r: 3, c: 0xfff2c0, a: 1 }, { r: 14, c: 0xf0c040, a: 1 }] },
        { t: 1.00, layers: [{ r: 3, c: 0xfff2c0, a: 1 }, { r: 14, c: 0xf0c040, a: 1 }] },
      ],
    },
    spec: {
      rate: 0, life: [0.45, 0.95], speed: [1, 6], angle: -Math.PI / 2, spread: Math.PI,
      normal: 0.6, gravity: -2, drag: 0.2, size: [5, 13], from: 'edge', star: true,
      colors: [0xffffff, 0xfff2c0, 0xffd560, 0xf0c040],
      burst: { every: 0.5, count: 3 },
    },
  },

  // YOLO — a cyan base broken by two sharp bursts, linear because easing the
  // on-off windows rounds off the edges that make it lightning. The rod ARCS:
  // bolts crawl across its own body and the sparks are what they knock loose.
  electric: {
    glow: {
      dur: 5.5, linear: true,
      stops: [
        { t: 0.00, layers: [{ r: 3, c: 0xc8f0ff, a: 1 }, { r: 16, c: 0x3fa8ff, a: 1 }] },
        { t: 0.28, layers: [{ r: 12, c: 0xffffff, a: 1 }, { r: 44, c: 0x5cc8ff, a: 1 }] },
        { t: 0.33, layers: [{ r: 3, c: 0xc8f0ff, a: 1 }, { r: 16, c: 0x3fa8ff, a: 1 }] },
        { t: 0.72, layers: [{ r: 10, c: 0xffffff, a: 1 }, { r: 38, c: 0x4dc8ff, a: 1 }] },
        { t: 0.77, layers: [{ r: 3, c: 0xc8f0ff, a: 1 }, { r: 16, c: 0x3fa8ff, a: 1 }] },
        { t: 1.00, layers: [{ r: 3, c: 0xc8f0ff, a: 1 }, { r: 16, c: 0x3fa8ff, a: 1 }] },
      ],
    },
    spec: {
      rate: 10, life: [0.16, 0.4], speed: [60, 170], angle: -Math.PI / 2, spread: Math.PI,
      normal: 0.85, gravity: 0, drag: 0.08, size: [1.6, 3.4], from: 'edge', streak: 4.5,
      colors: [0xffffff, 0xc8f0ff, 0x5cc8ff, 0x3fa8ff],
      arcs: {
        every: [0.05, 0.30], life: [0.05, 0.13], span: [26, 90], chaos: 9,
        width: 1.5, core: 0xffffff, halo: 0x3fa8ff, fork: 0.55,
      },
    },
  },

  // Moonwood — catching moonlight rather than radiating power.
  moon: {
    glow: {
      dur: 6.0,
      stops: [
        { t: 0.00, layers: [{ r: 2, c: 0xd8c8ff, a: 1 }, { r: 8, c: 0xa78bfa, a: 1 }] },
        { t: 0.50, layers: [{ r: 6, c: 0xece0ff, a: 1 }, { r: 18, c: 0xb89bff, a: 1 }] },
        { t: 1.00, layers: [{ r: 2, c: 0xd8c8ff, a: 1 }, { r: 8, c: 0xa78bfa, a: 1 }] },
      ],
    },
    spec: {
      rate: 9, life: [1.6, 3.0], speed: [3, 11], angle: -Math.PI / 2, spread: 1.1,
      normal: 0.5, gravity: -4, drag: 0.6, size: [1.5, 3.5], from: 'edge',
      colors: [0xece0ff, 0xd8c8ff, 0xb89bff, 0xa78bfa],
    },
  },

  // Carbon — a precision indicator, not an aura. Tight radii, low contrast.
  tech: {
    glow: {
      dur: 2.8,
      stops: [
        { t: 0.00, layers: [{ r: 1.5, c: 0x86efac, a: 1 }, { r: 5, c: 0x4ade80, a: 1 }] },
        { t: 0.50, layers: [{ r: 3, c: 0xbbf7d0, a: 1 }, { r: 12, c: 0x2fbf6e, a: 1 }] },
        { t: 1.00, layers: [{ r: 1.5, c: 0x86efac, a: 1 }, { r: 5, c: 0x4ade80, a: 1 }] },
      ],
    },
    spec: {
      rate: 11, life: [0.35, 0.8], speed: [6, 18], angle: -Math.PI / 2, spread: 0.9,
      normal: 0.7, gravity: 8, drag: 0.25, size: [1, 2.2], from: 'edge',
      colors: [0xbbf7d0, 0x86efac, 0x4ade80, 0x2fbf6e],
    },
  },

  // Galaxy — deep violet with two starlight twinkles across the void. The dust
  // hangs AROUND the rod rather than leaving it, orbiting on a fixed sign so
  // one aura reads as one system instead of as chaos.
  galaxy: {
    glow: {
      dur: 6.5,
      stops: [
        { t: 0.00, layers: [{ r: 3, c: 0xc9b8ff, a: 1 }, { r: 16, c: 0x7c5cff, a: 1 }] },
        { t: 0.30, layers: [{ r: 11, c: 0xffffff, a: 1 }, { r: 40, c: 0x9b7cff, a: 1 }] },
        { t: 0.36, layers: [{ r: 3, c: 0xc9b8ff, a: 1 }, { r: 16, c: 0x7c5cff, a: 1 }] },
        { t: 0.68, layers: [{ r: 9, c: 0xe8dcff, a: 1 }, { r: 34, c: 0x8a6cff, a: 1 }] },
        { t: 0.74, layers: [{ r: 3, c: 0xc9b8ff, a: 1 }, { r: 16, c: 0x7c5cff, a: 1 }] },
        { t: 1.00, layers: [{ r: 3, c: 0xc9b8ff, a: 1 }, { r: 16, c: 0x7c5cff, a: 1 }] },
      ],
    },
    spec: {
      rate: 34, life: [1.2, 2.6], speed: [8, 22], angle: -Math.PI / 2, spread: Math.PI,
      normal: 0.3, gravity: 0, drag: 0.75, size: [1.4, 4.5], from: 'fill',
      swirl: 55, star: true,
      colors: [0xffffff, 0xe8dcff, 0xc9b8ff, 0x9b7cff, 0x7c5cff],
    },
  },

  // Lightsaber — THREE layers: a white-hot core inside two crimsons, the only
  // item with a core and the reason the engine takes more than two. Crimson
  // sheds off the blade and FALLS: a blade burns the air rather than lifting it.
  saber: {
    glow: {
      dur: 2.2,
      stops: [
        { t: 0.00, layers: [{ r: 4, c: 0xffffff, a: 1 }, { r: 13, c: 0xff3344, a: 1 }, { r: 26, c: 0xe00022, a: 1 }] },
        { t: 0.50, layers: [{ r: 6, c: 0xffffff, a: 1 }, { r: 19, c: 0xff5566, a: 1 }, { r: 36, c: 0xff1133, a: 1 }] },
        { t: 1.00, layers: [{ r: 4, c: 0xffffff, a: 1 }, { r: 13, c: 0xff3344, a: 1 }, { r: 26, c: 0xe00022, a: 1 }] },
      ],
    },
    spec: {
      rate: 30, life: [0.4, 0.9], speed: [8, 26], angle: Math.PI / 2, spread: 1.5,
      normal: 0.55, gravity: 34, drag: 0.35, size: [1.6, 4], from: 'edge',
      colors: [0xffffff, 0xff5566, 0xff3344, 0xe00022],
    },
  },

  // Banked forge-coals, one flare per cycle.
  forge: {
    glow: {
      dur: 5.5,
      stops: [
        { t: 0.00, layers: [{ r: 4, c: 0xa7f3d0, a: 1 }, { r: 14, c: 0x34d399, a: 1 }] },
        { t: 0.48, layers: [{ r: 11, c: 0xecfdf5, a: 1 }, { r: 36, c: 0x22c55e, a: 1 }] },
        { t: 0.56, layers: [{ r: 4, c: 0xa7f3d0, a: 1 }, { r: 14, c: 0x34d399, a: 1 }] },
        { t: 1.00, layers: [{ r: 4, c: 0xa7f3d0, a: 1 }, { r: 14, c: 0x34d399, a: 1 }] },
      ],
    },
    spec: {
      rate: 22, life: [0.9, 1.8], speed: [8, 24], angle: -Math.PI / 2, spread: 0.7,
      normal: 0.45, gravity: -14, drag: 0.45, size: [2, 4.5], from: 'edge',
      colors: [0xecfdf5, 0xa7f3d0, 0x34d399, 0x22c55e],
    },
  },

  // Completionist — four energy strands, sweeping. Linear so the rainbow turns
  // at a constant rate instead of pausing on each colour, and the sparks WALK
  // the four in order: the stylesheet's sweep, spread along the rod rather than
  // across time.
  prismatic: {
    glow: {
      dur: 4.2, linear: true,
      stops: [
        { t: 0.00, layers: [{ r: 5, c: 0xf26d6d, a: 1 }, { r: 18, c: 0xf2c14e, a: 0.667 }] },
        { t: 0.25, layers: [{ r: 5, c: 0xf2c14e, a: 1 }, { r: 18, c: 0x57d06a, a: 0.667 }] },
        { t: 0.50, layers: [{ r: 5, c: 0x57d06a, a: 1 }, { r: 18, c: 0x5aa9f0, a: 0.667 }] },
        { t: 0.75, layers: [{ r: 5, c: 0x5aa9f0, a: 1 }, { r: 18, c: 0xf26d6d, a: 0.667 }] },
        { t: 1.00, layers: [{ r: 5, c: 0xf26d6d, a: 1 }, { r: 18, c: 0xf2c14e, a: 0.667 }] },
      ],
    },
    spec: {
      rate: 40, life: [0.8, 1.6], speed: [12, 34], angle: -Math.PI / 2, spread: Math.PI,
      normal: 0.6, gravity: -8, drag: 0.5, size: [2, 4.5], from: 'edge', cycle: true,
      colors: [0xf26d6d, 0xf2c14e, 0x57d06a, 0x5aa9f0],
    },
  },

  // The Locked-In Rod at streak 0. Faint and colour-neutral: the stylesheet's
  // own comment calls it "not yet charged", and it is meant to disappoint.
  lockedin: {
    glow: {
      dur: 4.2,
      stops: [
        { t: 0.00, layers: [{ r: 1.5, c: 0xd6deeb, a: 0.35 }] },
        { t: 0.50, layers: [{ r: 3, c: 0xe2e8f4, a: 0.5 }] },
        { t: 1.00, layers: [{ r: 1.5, c: 0xd6deeb, a: 0.35 }] },
      ],
    },
    spec: {
      rate: 4, life: [0.8, 1.6], speed: [3, 10], angle: -Math.PI / 2, spread: 1.2,
      normal: 0.5, gravity: -6, drag: 0.5, size: [1, 2.4], from: 'edge',
      colors: [0xe2e8f4, 0xd6deeb],
    },
  },
} satisfies Record<string, Effect>

/**
 * THE LOCKED-IN ROD'S FOUR STAGES.
 *
 * Its design is "power grows with your live perfect streak, one miss drops it
 * to nothing". The stylesheet already escalates all four on amount as well as
 * hue — modest cyan, bigger gold, biggest prismatic — and all four are
 * transcribed so the canvas steps where the CSS steps. The effect escalates
 * with it, on every axis at once, because swapping a colour cannot express a
 * rod getting LOUDER and loud is the actual mechanic.
 */
export const LOCKED_IN_STAGES: Effect[] = [
  ROD_EFFECTS.lockedin,
  { // streak 3 — faster bites. Cyan, and now clearly ON.
    glow: {
      dur: 1.6,
      stops: [
        { t: 0.00, layers: [{ r: 4, c: 0x67e8f9, a: 1 }, { r: 16, c: 0x22d3ee, a: 0.53 }] },
        { t: 0.40, layers: [{ r: 8, c: 0xa5f3fc, a: 1 }, { r: 28, c: 0x06b6d4, a: 1 }] },
        { t: 1.00, layers: [{ r: 4, c: 0x67e8f9, a: 1 }, { r: 16, c: 0x22d3ee, a: 0.53 }] },
      ],
    },
    spec: {
      rate: 26, life: [0.6, 1.2], speed: [14, 40], angle: -Math.PI / 2, spread: 1.4,
      normal: 0.7, gravity: -18, drag: 0.4, size: [1.6, 3.6], from: 'edge',
      colors: [0xa5f3fc, 0x67e8f9, 0x22d3ee, 0x06b6d4],
    },
  },
  { // streak 5 — triple haul. Gold, bigger, richer.
    glow: {
      dur: 1.5,
      stops: [
        { t: 0.00, layers: [{ r: 7, c: 0xffe08a, a: 1 }, { r: 26, c: 0xf0b90b, a: 0.667 }] },
        { t: 0.40, layers: [{ r: 13, c: 0xfff1b8, a: 1 }, { r: 44, c: 0xf0c040, a: 1 }] },
        { t: 1.00, layers: [{ r: 7, c: 0xffe08a, a: 1 }, { r: 26, c: 0xf0b90b, a: 0.667 }] },
      ],
    },
    spec: {
      rate: 44, life: [0.7, 1.5], speed: [18, 54], angle: -Math.PI / 2, spread: 1.7,
      normal: 0.7, gravity: -22, drag: 0.42, size: [2, 5], from: 'edge',
      colors: [0xfff1b8, 0xffe08a, 0xf0c040, 0xf0b90b],
    },
  },
  { // streak 10 — LOCKED IN. Deliberately slightly too much: it is rare, it is
    // fragile, and the next miss takes all of it.
    glow: {
      dur: 2.0, linear: true,
      stops: [
        { t: 0.00, layers: [{ r: 11, c: 0x67e8f9, a: 1 }, { r: 40, c: 0x22d3ee, a: 0.73 }] },
        { t: 0.33, layers: [{ r: 11, c: 0xf0c040, a: 1 }, { r: 40, c: 0xf0b90b, a: 0.73 }] },
        { t: 0.66, layers: [{ r: 11, c: 0xe879f9, a: 1 }, { r: 40, c: 0xc084fc, a: 0.73 }] },
        { t: 1.00, layers: [{ r: 11, c: 0x67e8f9, a: 1 }, { r: 40, c: 0x22d3ee, a: 0.73 }] },
      ],
    },
    spec: {
      rate: 85, life: [0.7, 1.6], speed: [24, 84], angle: -Math.PI / 2, spread: Math.PI,
      normal: 0.75, gravity: -26, drag: 0.45, size: [2, 6], from: 'edge',
      cycle: true, star: true,
      colors: [0x67e8f9, 0x22d3ee, 0xf0c040, 0xf0b90b, 0xe879f9, 0xc084fc],
      arcs: {
        every: [0.10, 0.34], life: [0.05, 0.12], span: [24, 80], chaos: 8,
        width: 1.4, core: 0xffffff, halo: 0xc084fc, fork: 0.45,
      },
    },
  },
]

// ════════════════════════════════════════════════════════════════════════════
// HOOKS
// ════════════════════════════════════════════════════════════════════════════
//
// A hook is SMALL and it is on the end of a line, so these stay restrained
// where the rods do not. The two cheap ones are metal catching light and get
// almost no particles at all; only the top three are allowed to be magic.

export const HOOK_EFFECTS = {
  // Silver — polished metal catching ambient light. Not an aura.
  chrome: {
    glow: {
      dur: 4.5,
      stops: [
        { t: 0.00, layers: [{ r: 1, c: 0xe8e8e8, a: 1 }, { r: 3, c: 0xd4d4d8, a: 1 }] },
        { t: 0.50, layers: [{ r: 2, c: 0xffffff, a: 1 }, { r: 8, c: 0xb8b8bc, a: 1 }] },
        { t: 1.00, layers: [{ r: 1, c: 0xe8e8e8, a: 1 }, { r: 3, c: 0xd4d4d8, a: 1 }] },
      ],
    },
    // One small glint at a time, somewhere on the metal. Silver is a working
    // hook, not a showpiece.
    spec: {
      rate: 0, life: [0.3, 0.6], speed: [0, 3], angle: -Math.PI / 2, spread: Math.PI,
      normal: 0.5, gravity: 0, drag: 0.2, size: [3, 7], from: 'edge', star: true,
      colors: [0xffffff, 0xe8e8e8],
      burst: { every: 1.6, count: 1 },
    },
  },

  // Gold — the warm sibling of chrome, one tier up and no louder.
  gilded: {
    glow: {
      dur: 4.5,
      stops: [
        { t: 0.00, layers: [{ r: 1, c: 0xfff2c0, a: 1 }, { r: 4, c: 0xf0c040, a: 1 }] },
        { t: 0.50, layers: [{ r: 2, c: 0xffe080, a: 1 }, { r: 10, c: 0xe0a830, a: 1 }] },
        { t: 1.00, layers: [{ r: 1, c: 0xfff2c0, a: 1 }, { r: 4, c: 0xf0c040, a: 1 }] },
      ],
    },
    spec: {
      rate: 0, life: [0.35, 0.7], speed: [0, 4], angle: -Math.PI / 2, spread: Math.PI,
      normal: 0.5, gravity: 0, drag: 0.2, size: [4, 9], from: 'edge', star: true,
      colors: [0xffffff, 0xfff2c0, 0xf0c040],
      burst: { every: 1.2, count: 1 },
    },
  },

  // Enchanted — violet drifting through magenta and indigo. Here the hook
  // stops being metal and starts being magic, so the motes arrive: slow,
  // weightless, hanging in the water rather than falling out of it.
  arcane: {
    glow: {
      dur: 5.5,
      stops: [
        { t: 0.00, layers: [{ r: 4, c: 0xe0c8ff, a: 1 }, { r: 28, c: 0x8b5cf6, a: 1 }] },
        { t: 0.33, layers: [{ r: 8, c: 0xffffff, a: 1 }, { r: 44, c: 0xa855f7, a: 1 }] },
        { t: 0.66, layers: [{ r: 6, c: 0xc8d0ff, a: 1 }, { r: 36, c: 0x6366f1, a: 1 }] },
        { t: 1.00, layers: [{ r: 4, c: 0xe0c8ff, a: 1 }, { r: 28, c: 0x8b5cf6, a: 1 }] },
      ],
    },
    spec: {
      rate: 12, life: [1.0, 2.2], speed: [2, 9], angle: -Math.PI / 2, spread: Math.PI,
      normal: 0.4, gravity: -2, drag: 0.7, size: [1.4, 3.4], from: 'edge',
      colors: [0xffffff, 0xe0c8ff, 0xa855f7, 0x8b5cf6, 0x6366f1],
    },
  },

  // Abyssal — drawn from the dark. Blood-red, and what it sheds SINKS, because
  // nothing this hook touches is going upward.
  cursed: {
    glow: {
      dur: 4.0,
      stops: [
        { t: 0.00, layers: [{ r: 3, c: 0xfca5a5, a: 1 }, { r: 24, c: 0xa01818, a: 1 }] },
        { t: 0.50, layers: [{ r: 6, c: 0xff4d4d, a: 1 }, { r: 40, c: 0x7f1d1d, a: 1 }] },
        { t: 1.00, layers: [{ r: 3, c: 0xfca5a5, a: 1 }, { r: 24, c: 0xa01818, a: 1 }] },
      ],
    },
    spec: {
      rate: 14, life: [0.7, 1.6], speed: [3, 12], angle: Math.PI / 2, spread: 1.0,
      normal: 0.35, gravity: 16, drag: 0.5, size: [1.6, 4], from: 'edge',
      colors: [0xff4d4d, 0xfca5a5, 0xa01818, 0x7f1d1d],
    },
  },

  // Legendary — the showpiece, and the widest radii of any hook in the
  // stylesheet. Lost at sea and returned, so it burns: white-hot through gold
  // and orange into deep red, with embers coming off the whole shank.
  mythic: {
    glow: {
      dur: 3.5,
      stops: [
        { t: 0.00, layers: [{ r: 6, c: 0xffffff, a: 1 }, { r: 36, c: 0xff4a18, a: 1 }] },
        { t: 0.25, layers: [{ r: 8, c: 0xfff2c0, a: 1 }, { r: 50, c: 0xff8030, a: 1 }] },
        { t: 0.50, layers: [{ r: 12, c: 0xffffff, a: 1 }, { r: 60, c: 0xff3300, a: 1 }] },
        { t: 0.75, layers: [{ r: 8, c: 0xffe080, a: 1 }, { r: 44, c: 0xe64a14, a: 1 }] },
        { t: 1.00, layers: [{ r: 6, c: 0xffffff, a: 1 }, { r: 36, c: 0xff4a18, a: 1 }] },
      ],
    },
    spec: {
      rate: 26, life: [0.6, 1.3], speed: [10, 32], angle: -Math.PI / 2, spread: 0.8,
      normal: 0.5, gravity: -22, drag: 0.42, size: [1.8, 4.5], from: 'edge',
      colors: [0xffffff, 0xfff2c0, 0xff8030, 0xff3300, 0xe64a14],
    },
  },
} satisfies Record<string, Effect>

// ════════════════════════════════════════════════════════════════════════════
// HULLS
// ════════════════════════════════════════════════════════════════════════════
//
// A hull is BIG, so the rates stay low: what reads as a lively spray off a rod
// reads as an infestation off a boat. Three of these are ports of existing CSS
// (Ethereal, Charcoal, Golden). The rest are new, and they take their cue from
// something the boats already declare — the WAKE. If the codebase has already
// decided that a hull made of fire leaves embers on the water, then the hull
// itself throwing embers is the same idea finished, not a new one invented.

export const HULL_EFFECTS = {
  // Ethereal — the marquee hull, and the only one with a BOB in CSS: the
  // shimmer animation runs alongside a second animation that lifts it 2px. The
  // brightness/saturate pump in the keyframes has no direct equivalent here and
  // is carried by the additive glow instead.
  spirit: {
    glow: {
      dur: 7.0,
      stops: [
        { t: 0.00, layers: [{ r: 5, c: 0xffffff, a: 0.90 }, { r: 16, c: 0xffebc8, a: 0.60 }, { r: 34, c: 0xffd28c, a: 0.30 }] },
        { t: 0.25, layers: [{ r: 9, c: 0xffffff, a: 0.98 }, { r: 24, c: 0xfff5e1, a: 0.78 }, { r: 42, c: 0xffdca0, a: 0.46 }] },
        { t: 0.50, layers: [{ r: 10, c: 0xffffff, a: 1.00 }, { r: 28, c: 0xdcebff, a: 0.82 }, { r: 48, c: 0xc8b4ff, a: 0.50 }] },
        { t: 0.75, layers: [{ r: 9, c: 0xffffff, a: 0.95 }, { r: 24, c: 0xd2faf0, a: 0.75 }, { r: 42, c: 0xc8ebff, a: 0.45 }] },
        { t: 1.00, layers: [{ r: 5, c: 0xffffff, a: 0.90 }, { r: 16, c: 0xffebc8, a: 0.60 }, { r: 34, c: 0xffd28c, a: 0.30 }] },
      ],
    },
    bob: { px: 2, dur: 3.6 },
    spec: {
      rate: 10, life: [1.4, 3.0], speed: [2, 10], angle: -Math.PI / 2, spread: 1.0,
      normal: 0.35, gravity: -5, drag: 0.65, size: [2, 5], from: 'edge', star: true,
      colors: [0xffffff, 0xfff5e1, 0xdcebff, 0xc8b4ff],
    },
  },

  // Charcoal — a dark, ashy smoulder, and the one effect here that is NOT
  // light. The CSS carries a constant brightness(0.58) so the sprite reads as
  // deep charcoal rather than plain grey; that is a standing tint, not an
  // animation. Both halves composite normally, because adding a dark colour to
  // a scene brightens nothing and an additive smoke aura is an invisible one.
  ash: {
    glow: {
      dur: 5.0,
      stops: [
        { t: 0.00, layers: [{ r: 3, c: 0x1a1a1e, a: 0.55 }, { r: 7, c: 0x3a3840, a: 0.24 }] },
        { t: 0.50, layers: [{ r: 5, c: 0x202026, a: 0.66 }, { r: 12, c: 0x4a4652, a: 0.32 }] },
        { t: 1.00, layers: [{ r: 3, c: 0x1a1a1e, a: 0.55 }, { r: 7, c: 0x3a3840, a: 0.24 }] },
      ],
    },
    glowBlend: 'normal',
    // brightness(0.58) as a tint. Contrast and saturation have no cheap
    // equivalent, but the darken is what carries the look.
    darken: 0x949494,
    spec: {
      rate: 7, life: [1.6, 3.2], speed: [3, 11], angle: -Math.PI / 2, spread: 0.8,
      normal: 0.3, gravity: -8, drag: 0.7, size: [4, 11], from: 'edge', blend: 'normal',
      colors: [0x3a3840, 0x4a4652, 0x2a2830],
    },
  },

  // Golden — deliberately the SAME amount of glow as Charcoal in the
  // stylesheet: identical radii, alphas and timing, warm instead of smoke and
  // with no darken. Kept identical here, with a rare gold glint.
  gilt: {
    glow: {
      dur: 5.0,
      stops: [
        { t: 0.00, layers: [{ r: 3, c: 0xf0c85a, a: 0.55 }, { r: 7, c: 0xdcaa3c, a: 0.24 }] },
        { t: 0.50, layers: [{ r: 5, c: 0xf5d26e, a: 0.66 }, { r: 12, c: 0xe1af46, a: 0.32 }] },
        { t: 1.00, layers: [{ r: 3, c: 0xf0c85a, a: 0.55 }, { r: 7, c: 0xdcaa3c, a: 0.24 }] },
      ],
    },
    spec: {
      rate: 0, life: [0.5, 1.0], speed: [0, 5], angle: -Math.PI / 2, spread: Math.PI,
      normal: 0.5, gravity: -3, drag: 0.3, size: [4, 10], from: 'edge', star: true,
      colors: [0xffffff, 0xf5d26e, 0xf0c85a],
      burst: { every: 1.4, count: 1 },
    },
  },

  // Fire hull — wake: 'ember'. It leaves embers on the water, so it throws
  // them off the gunwale too. Warmest and busiest of the hulls, and the rate is
  // still a third of the Legendary Rod's because a boat is ten times the
  // outline.
  ember: {
    glow: {
      dur: 2.4,
      stops: [
        { t: 0.00, layers: [{ r: 5, c: 0xffb066, a: 0.85 }, { r: 22, c: 0xff4a10, a: 0.55 }] },
        { t: 0.40, layers: [{ r: 9, c: 0xffd28a, a: 1.00 }, { r: 38, c: 0xff3a00, a: 0.72 }] },
        { t: 0.70, layers: [{ r: 7, c: 0xffbf66, a: 0.90 }, { r: 30, c: 0xd83000, a: 0.60 }] },
        { t: 1.00, layers: [{ r: 5, c: 0xffb066, a: 0.85 }, { r: 22, c: 0xff4a10, a: 0.55 }] },
      ],
    },
    spec: {
      rate: 14, life: [0.9, 2.0], speed: [8, 26], angle: -Math.PI / 2, spread: 0.6,
      normal: 0.4, gravity: -26, drag: 0.42, size: [2, 5], from: 'edge',
      colors: [0xffd28a, 0xffb066, 0xff7a2a, 0xff4a10],
    },
  },

  // Ice hull — wake: 'frost'. Pale blue, and its motes SETTLE rather than rise:
  // frost falls off a cold thing. Slow enough to read as drifting rather than
  // as rain.
  frost: {
    glow: {
      dur: 5.0,
      stops: [
        { t: 0.00, layers: [{ r: 4, c: 0xdff2ff, a: 0.70 }, { r: 18, c: 0x7cc4f0, a: 0.42 }] },
        { t: 0.50, layers: [{ r: 8, c: 0xffffff, a: 0.90 }, { r: 30, c: 0x9adcff, a: 0.58 }] },
        { t: 1.00, layers: [{ r: 4, c: 0xdff2ff, a: 0.70 }, { r: 18, c: 0x7cc4f0, a: 0.42 }] },
      ],
    },
    spec: {
      rate: 12, life: [1.4, 2.8], speed: [2, 9], angle: Math.PI / 2, spread: 1.1,
      normal: 0.3, gravity: 9, drag: 0.75, size: [1.4, 3.6], from: 'edge', star: true,
      colors: [0xffffff, 0xdff2ff, 0x9adcff, 0x7cc4f0],
    },
  },

  // Jet Black — wake: 'void'. What comes off it is DARKNESS, so it composites
  // normally like the ash does, with a thin violet rim to keep the hull from
  // disappearing into a night sea entirely.
  voidhull: {
    glow: {
      dur: 6.0,
      stops: [
        { t: 0.00, layers: [{ r: 4, c: 0x120a1e, a: 0.60 }, { r: 20, c: 0x6b3fa0, a: 0.28 }] },
        { t: 0.50, layers: [{ r: 7, c: 0x0a0614, a: 0.72 }, { r: 34, c: 0x8b5cf6, a: 0.40 }] },
        { t: 1.00, layers: [{ r: 4, c: 0x120a1e, a: 0.60 }, { r: 20, c: 0x6b3fa0, a: 0.28 }] },
      ],
    },
    glowBlend: 'normal',
    spec: {
      rate: 9, life: [1.4, 2.8], speed: [3, 12], angle: -Math.PI / 2, spread: 1.2,
      normal: 0.3, gravity: -6, drag: 0.72, size: [3, 9], from: 'edge', blend: 'normal',
      colors: [0x1a1030, 0x2a1a44, 0x120a1e],
    },
  },

  // Abyssal — wake: 'ash', but nothing to do with Charcoal: this one came up
  // from the pressure. Deep teal, and what it sheds RISES the way anything
  // leaving a depth does.
  abyss: {
    glow: {
      dur: 4.6,
      stops: [
        { t: 0.00, layers: [{ r: 4, c: 0x5ee8d0, a: 0.62 }, { r: 22, c: 0x0e5f6b, a: 0.45 }] },
        { t: 0.50, layers: [{ r: 9, c: 0xbdfff4, a: 0.88 }, { r: 38, c: 0x14808f, a: 0.62 }] },
        { t: 1.00, layers: [{ r: 4, c: 0x5ee8d0, a: 0.62 }, { r: 22, c: 0x0e5f6b, a: 0.45 }] },
      ],
    },
    spec: {
      rate: 11, life: [1.6, 3.2], speed: [3, 13], angle: -Math.PI / 2, spread: 0.7,
      normal: 0.35, gravity: -14, drag: 0.7, size: [1.6, 4.5], from: 'edge',
      colors: [0xbdfff4, 0x5ee8d0, 0x14808f, 0x0e5f6b],
    },
  },

  // Celestial — a hull carrying its own sky. Stars, so they twinkle in place
  // over the whole shape rather than streaming off it, which is why this is the
  // one hull that spawns from the BODY.
  celestial: {
    glow: {
      dur: 6.5,
      stops: [
        { t: 0.00, layers: [{ r: 4, c: 0xdfe6ff, a: 0.70 }, { r: 22, c: 0x5b6ee1, a: 0.40 }] },
        { t: 0.35, layers: [{ r: 10, c: 0xffffff, a: 0.95 }, { r: 40, c: 0x8b9dff, a: 0.60 }] },
        { t: 0.70, layers: [{ r: 6, c: 0xe8dcff, a: 0.80 }, { r: 30, c: 0x6f5bd6, a: 0.48 }] },
        { t: 1.00, layers: [{ r: 4, c: 0xdfe6ff, a: 0.70 }, { r: 22, c: 0x5b6ee1, a: 0.40 }] },
      ],
    },
    spec: {
      rate: 0, life: [0.8, 1.8], speed: [0, 3], angle: -Math.PI / 2, spread: Math.PI,
      normal: 0.2, gravity: 0, drag: 0.4, size: [3, 9], from: 'fill', star: true,
      colors: [0xffffff, 0xdfe6ff, 0x8b9dff, 0xe8dcff],
      burst: { every: 0.34, count: 2 },
    },
  },

  // Chromium — a million doubloons of polished metal, and the restraint IS the
  // effect. A hard white specular breath and nothing else: chrome does not
  // smoulder, it catches the light and hands it straight back.
  //
  // NOT `chrome`: the Silver hook already owns that name, and these tables are
  // merged into one lookup so a duplicate key silently hands one item the
  // other's effect. Namespacing is not decoration here.
  chromed: {
    glow: {
      dur: 3.2,
      stops: [
        { t: 0.00, layers: [{ r: 2, c: 0xffffff, a: 0.55 }, { r: 10, c: 0xcfe0ec, a: 0.30 }] },
        { t: 0.50, layers: [{ r: 5, c: 0xffffff, a: 0.90 }, { r: 20, c: 0xe8f2ff, a: 0.48 }] },
        { t: 1.00, layers: [{ r: 2, c: 0xffffff, a: 0.55 }, { r: 10, c: 0xcfe0ec, a: 0.30 }] },
      ],
    },
    spec: {
      rate: 0, life: [0.25, 0.5], speed: [0, 2], angle: -Math.PI / 2, spread: Math.PI,
      normal: 0.5, gravity: 0, drag: 0.2, size: [5, 12], from: 'edge', star: true,
      colors: [0xffffff, 0xe8f2ff],
      burst: { every: 1.9, count: 1 },
    },
  },
} satisfies Record<string, Effect>

// ── RESOLVERS ───────────────────────────────────────────────────────────────
//
// Which effect a given piece of gear wears. Kept here rather than in the
// cosmetic tables so the canvas can gain an effect without editing lib/, and so
// there is one place to look when something glows that should not.

export type EffectName =
  | keyof typeof ROD_EFFECTS
  | keyof typeof HOOK_EFFECTS
  | keyof typeof HULL_EFFECTS

const ALL: Record<string, Effect> = { ...ROD_EFFECTS, ...HOOK_EFFECTS, ...HULL_EFFECTS }

// One lookup means one namespace: a name in two tables would resolve to
// whichever spread landed last, and the loser would wear the winner's effect
// with nothing failing anywhere. Cheap to check, and it fails at import.
if (process.env.NODE_ENV !== 'production') {
  const names = [
    ...Object.keys(ROD_EFFECTS), ...Object.keys(HOOK_EFFECTS), ...Object.keys(HULL_EFFECTS),
  ]
  const dupes = names.filter((n, i) => names.indexOf(n) !== i)
  if (dupes.length) throw new Error(`aura: duplicate effect name(s): ${dupes.join(', ')}`)
}

export function effect(name: EffectName): Effect {
  return ALL[name]
}

export function rodEffect(rod: { glow?: boolean; glowType?: string } | null): EffectName | null {
  if (!rod?.glow) return null
  return (rod.glowType && rod.glowType in ROD_EFFECTS ? rod.glowType : null) as EffectName | null
}

export function hookEffect(hook: { glow?: boolean; glowType?: string } | null): EffectName | null {
  if (!hook?.glow) return null
  return (hook.glowType && hook.glowType in HOOK_EFFECTS ? hook.glowType : null) as EffectName | null
}

/**
 * A hull's effect.
 *
 * Read by ID first for the hulls that have a character of their own, then by
 * the CSS glow fields for the three that already had one. Ordinary wooden
 * boats come back null and stay exactly as they are: a glow on every hull is
 * the same as a glow on none.
 */
export function hullEffect(
  boat: { id: string; glow?: boolean; glowType?: string } | null,
): EffectName | null {
  if (!boat) return null
  switch (boat.id) {
    case 'fire': return 'ember'
    case 'ice': return 'frost'
    case 'jetblack': return 'voidhull'
    case 'abyssal': return 'abyss'
    case 'celestial': return 'celestial'
    case 'chromium': return 'chromed'
  }
  if (boat.glow) return 'spirit'
  if (boat.glowType === 'ash') return 'ash'
  if (boat.glowType === 'gold') return 'gilt'
  return null
}
