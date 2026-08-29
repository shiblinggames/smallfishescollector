// ── WHAT THE GOOD RODS DO IN THE AIR ────────────────────────────────────────
//
// In the DOM a rod's aura is a CSS `filter: drop-shadow()` keyframe: a coloured
// blur that breathes. It is a good effect and it is also the ONLY effect the
// DOM can afford, because a drop-shadow is one rasterised blur per element per
// frame and there is no version of it that throws sparks.
//
// This is the version that throws sparks. Same rods, same colours — every
// palette below is lifted from that rod's own keyframes in globals.css, so a
// Legendary still reads as the orange-red one and a Lightsaber still reads as
// the white core in crimson. What changes is that the aura now has PARTICLES in
// it, which is a thing a sprite renderer does for free and the compositor
// cannot do at all.
//
// ── ONE ENGINE, MANY ROWS ───────────────────────────────────────────────────
//
// Every effect here is the same emitter driven by a different row of numbers.
// That is deliberate: ten hand-written effects drift into ten different ideas
// of what "a particle" is, and the eleventh takes a day. A row takes a minute,
// and tuning one rod cannot break another.
//
// ── WHY IT NEVER ALLOCATES ──────────────────────────────────────────────────
//
// The pool is sized once from the spec and recycled forever. A dead particle is
// not removed, it is parked at alpha 0 and reused on the next spawn — because
// adding and removing children re-uploads the whole static buffer, and a rod
// that garbage-collects every few seconds during play is worse than no rod.
// Two textures serve every effect on the chart; the colour is a TINT, which
// costs nothing, which is the entire reason a fleet of captains can each be on
// fire in their own colour without a second draw call.

import type { Container, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js'

export type GlowType =
  | 'fire' | 'sparkle' | 'electric' | 'moon' | 'tech'
  | 'galaxy' | 'saber' | 'forge' | 'prismatic' | 'lockedin'

/** A range the emitter samples uniformly. Written as a pair because every one
 *  of these numbers wants jitter — particles that agree with each other read as
 *  a machine rather than as fire. */
type Range = [number, number]

type Spec = {
  /** Particles per second. The single biggest knob on how loud a rod is. */
  rate: number
  life: Range
  /** Initial speed, px/sec at the skiff's own scale. */
  speed: Range
  /** Emission direction, radians. Screen coordinates, so -PI/2 is UP. */
  angle: number
  /** Half-width of the emission cone. PI is "any direction". */
  spread: number
  /** px/sec². Positive falls. Embers use a negative one and rise. */
  gravity: number
  /** Per-second velocity retention: 0.02 stops almost at once, 0.9 coasts. */
  drag: number
  size: Range
  /** Sampled per particle. Prismatic walks it in order instead. */
  colors: number[]
  /** Walk `colors` in order rather than sampling, so consecutive particles
   *  sweep the hue the way the CSS keyframes do. */
  cycle?: boolean
  /** Spawn radius around the tip. A rod is a line, not a point, and sparks
   *  that all come from one pixel look like a leak. */
  scatter?: number
  /** Tangential acceleration, px/sec². Galaxy dust orbits instead of flying. */
  swirl?: number
  /** Stretch along the direction of travel. Electric sparks are streaks. */
  streak?: number
  /** Hold-then-burst: nothing for `every` seconds, then `count` at once. This is
   *  what makes lightning read as lightning rather than as a hose. */
  burst?: { every: number; count: number }
  /** A steady soft glow sprite at the tip, under the particles: the part of the
   *  original drop-shadow that was doing real work. 0 for none. */
  bloom?: { size: number; color: number; alpha: number; pulse: number }
  /** Twinkles use the 4-point star; everything else uses the soft dot. */
  star?: boolean
}

// ── THE ROWS ────────────────────────────────────────────────────────────────
//
// Colours are the rod's own, out of globals.css. Where the CSS had a bright
// inner shadow and a wide outer one, the bright colour is the particle and the
// wide one is the bloom — which is what those two radii were always depicting.

const SPECS: Record<GlowType, Spec> = {
  // Legendary. Embers off a coal: they RISE, because heat does, and the drag is
  // high so they slow as they cool rather than sailing off the screen.
  fire: {
    rate: 26, life: [0.7, 1.5], speed: [12, 34], angle: -Math.PI / 2, spread: 0.5,
    gravity: -26, drag: 0.4, size: [2, 5.5], scatter: 7,
    colors: [0xffd28a, 0xffb066, 0xff7a2a, 0xff4a10],
    bloom: { size: 46, color: 0xff5a20, alpha: 0.34, pulse: 2.0 },
  },

  // Millionaire's and Treasure. Almost nothing, then one deliberate twinkle —
  // the CSS gives this a single peak per 6.5s cycle on purpose, and a constant
  // shower of gold would read as cheap rather than as rich.
  sparkle: {
    rate: 0, life: [0.5, 1.1], speed: [6, 20], angle: -Math.PI / 2, spread: Math.PI,
    gravity: 4, drag: 0.3, size: [3, 8], scatter: 16, star: true,
    colors: [0xffffff, 0xfff2c0, 0xffd560, 0xf0c040],
    burst: { every: 1.1, count: 3 },
    bloom: { size: 30, color: 0xf0c040, alpha: 0.18, pulse: 6.5 },
  },

  // YOLO. Short, fast, and violent, in tight bursts with dead air between. The
  // streak stretches each spark along its own velocity so it reads as an arc
  // rather than a dot in a hurry.
  electric: {
    rate: 4, life: [0.16, 0.4], speed: [70, 200], angle: -Math.PI / 2, spread: Math.PI,
    gravity: 0, drag: 0.08, size: [1.6, 3.4], scatter: 5, streak: 4.5,
    colors: [0xffffff, 0xc8f0ff, 0x5cc8ff, 0x3fa8ff],
    burst: { every: 0.72, count: 7 },
    bloom: { size: 34, color: 0x3fa8ff, alpha: 0.26, pulse: 5.5 },
  },

  // Moonwood. Slow motes that barely move: the CSS calls this "catching
  // moonlight rather than radiating power", and the particles obey.
  moon: {
    rate: 7, life: [1.6, 3.0], speed: [3, 11], angle: -Math.PI / 2, spread: 1.1,
    gravity: -4, drag: 0.6, size: [1.5, 3.5], scatter: 10,
    colors: [0xece0ff, 0xd8c8ff, 0xb89bff, 0xa78bfa],
    bloom: { size: 26, color: 0xa78bfa, alpha: 0.16, pulse: 6.0 },
  },

  // Carbon. A precision indicator, not an aura. Tiny, tight, and quiet.
  tech: {
    rate: 9, life: [0.35, 0.8], speed: [8, 22], angle: -Math.PI / 2, spread: 0.9,
    gravity: 10, drag: 0.25, size: [1, 2.2], scatter: 4,
    colors: [0xbbf7d0, 0x86efac, 0x4ade80, 0x2fbf6e],
    bloom: { size: 16, color: 0x4ade80, alpha: 0.14, pulse: 2.8 },
  },

  // Galaxy. The dust ORBITS — swirl turns velocity sideways every frame, so it
  // falls into a slow spiral around the tip instead of flying off. The white in
  // the palette is the starlight twinkle the keyframes peak on.
  galaxy: {
    rate: 30, life: [1.2, 2.6], speed: [10, 26], angle: -Math.PI / 2, spread: Math.PI,
    gravity: 0, drag: 0.75, size: [1.4, 4], scatter: 13, swirl: 55, star: true,
    colors: [0xffffff, 0xe8dcff, 0xc9b8ff, 0x9b7cff, 0x7c5cff],
    bloom: { size: 40, color: 0x7c5cff, alpha: 0.3, pulse: 6.5 },
  },

  // Lightsaber. A humming blade, so the bloom does most of the work and the
  // particles are the crimson that sheds off it — falling, because a blade
  // burns the air rather than lifting it.
  saber: {
    rate: 22, life: [0.4, 0.9], speed: [10, 30], angle: Math.PI / 2, spread: 1.5,
    gravity: 34, drag: 0.35, size: [1.6, 4], scatter: 8,
    colors: [0xffffff, 0xff5566, 0xff3344, 0xe00022],
    bloom: { size: 52, color: 0xff2233, alpha: 0.42, pulse: 2.2 },
  },

  // Banked forge-coals: slow, heavy, green, with one surge per cycle.
  forge: {
    rate: 18, life: [0.9, 1.8], speed: [8, 24], angle: -Math.PI / 2, spread: 0.7,
    gravity: -14, drag: 0.45, size: [2, 4.5], scatter: 9,
    colors: [0xecfdf5, 0xa7f3d0, 0x34d399, 0x22c55e],
    bloom: { size: 38, color: 0x22c55e, alpha: 0.3, pulse: 5.5 },
  },

  // Completionist. Four energy strands, so consecutive particles WALK the four
  // colours rather than sampling them — the same rainbow sweep the CSS does,
  // spread across the spray instead of across time.
  prismatic: {
    rate: 34, life: [0.8, 1.6], speed: [14, 40], angle: -Math.PI / 2, spread: Math.PI,
    gravity: -8, drag: 0.5, size: [2, 4.5], scatter: 10, cycle: true,
    colors: [0xf26d6d, 0xf2c14e, 0x57d06a, 0x5aa9f0],
    bloom: { size: 44, color: 0xf2c14e, alpha: 0.26, pulse: 4.2 },
  },

  // The Locked-In Rod at streak 0: deliberately almost nothing. This row is the
  // DORMANT state and it is supposed to disappoint slightly — see below.
  lockedin: {
    rate: 3, life: [0.8, 1.6], speed: [4, 12], angle: -Math.PI / 2, spread: 1.2,
    gravity: -6, drag: 0.5, size: [1, 2.4], scatter: 6,
    colors: [0xe2e8f4, 0xd6deeb],
    bloom: { size: 14, color: 0xd6deeb, alpha: 0.1, pulse: 4.2 },
  },
}

// ── THE LOCKED-IN ROD, WHICH IS THE WHOLE REASON FOR THIS FILE ──────────────
//
// Its entire design is "power grows with your live perfect streak, one miss
// drops it to nothing", and in the DOM that is expressed by swapping between
// four CSS classes. Swapping a class can change a colour. It cannot express a
// rod getting LOUDER, and loud is the actual mechanic.
//
// So the stages are four rows of the same engine, and they escalate on every
// axis at once — rate, speed, size, bloom — rather than only on hue. Stage 3 is
// meant to be slightly too much. A ten-perfect-catch streak is rare, it is
// fragile, and the next miss takes it all away; the rod should be visibly
// difficult to ignore while you have it.
const LOCKED_IN_STAGES: Spec[] = [
  SPECS.lockedin,
  // Stage 1 — streak 3, faster bites. Cyan, and now clearly ON.
  {
    rate: 20, life: [0.6, 1.2], speed: [16, 44], angle: -Math.PI / 2, spread: 1.4,
    gravity: -18, drag: 0.4, size: [1.6, 3.6], scatter: 8,
    colors: [0xa5f3fc, 0x67e8f9, 0x22d3ee, 0x06b6d4],
    bloom: { size: 30, color: 0x22d3ee, alpha: 0.3, pulse: 1.6 },
  },
  // Stage 2 — streak 5, triple haul. Gold, bigger, richer.
  {
    rate: 34, life: [0.7, 1.5], speed: [20, 58], angle: -Math.PI / 2, spread: 1.7,
    gravity: -22, drag: 0.42, size: [2, 5], scatter: 10,
    colors: [0xfff1b8, 0xffe08a, 0xf0c040, 0xf0b90b],
    bloom: { size: 44, color: 0xf0c040, alpha: 0.38, pulse: 1.5 },
  },
  // Stage 3 — streak 10, LOCKED IN. Everything at once, cycling all three
  // stage colours, plus the stars. This is the frenzy.
  {
    rate: 70, life: [0.7, 1.6], speed: [26, 90], angle: -Math.PI / 2, spread: Math.PI,
    gravity: -26, drag: 0.45, size: [2, 6], scatter: 12, cycle: true, star: true,
    colors: [0x67e8f9, 0x22d3ee, 0xf0c040, 0xf0b90b, 0xe879f9, 0xc084fc],
    bloom: { size: 62, color: 0xc084fc, alpha: 0.5, pulse: 2.0 },
  },
]

// ── TEXTURES, MADE ONCE FOR THE WHOLE CHART ─────────────────────────────────

let dotTex: Texture | null = null
let starTex: Texture | null = null

function softDot(PIXI: typeof import('pixi.js')): Texture {
  if (dotTex) return dotTex
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  // White, so a tint can take it anywhere. The stops are weighted to the centre
  // so a particle has a hot core and a soft falloff — a linear ramp reads as a
  // grey blob and no amount of tinting rescues it.
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.75)')
  grad.addColorStop(0.6, 'rgba(255,255,255,0.18)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  dotTex = PIXI.Texture.from(c)
  return dotTex
}

function star(PIXI: typeof import('pixi.js')): Texture {
  if (starTex) return starTex
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  // Four tapered points over a small core: the shape an eye reads as "twinkle".
  // Drawn rather than blurred because a blurred cross loses its points.
  g.translate(S / 2, S / 2)
  g.fillStyle = '#fff'
  for (let i = 0; i < 4; i++) {
    g.beginPath()
    g.moveTo(0, -S / 2)
    g.quadraticCurveTo(3.5, -6, 0, 0)
    g.quadraticCurveTo(-3.5, -6, 0, -S / 2)
    g.fill()
    g.rotate(Math.PI / 2)
  }
  const core = g.createRadialGradient(0, 0, 0, 0, 0, 10)
  core.addColorStop(0, 'rgba(255,255,255,1)')
  core.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = core
  g.beginPath()
  g.arc(0, 0, 10, 0, Math.PI * 2)
  g.fill()
  starTex = PIXI.Texture.from(c)
  return starTex
}

// ── THE EMITTER ─────────────────────────────────────────────────────────────

type Live = {
  p: Particle
  vx: number
  vy: number
  age: number
  ttl: number
  size: number
}

export type RodFx = {
  /** Hang this at the rod's tip. It draws in its own local space. */
  view: Container
  /** Seconds since the last call. Driven by the caller's ticker so every
   *  emitter on the chart advances on the same clock. */
  update(dt: number): void
  /** The Locked-In Rod's live streak stage, 0..3. Ignored by every other rod.
   *  Cheap to call every frame; it only does work when the stage changes. */
  setStage(stage: number): void
  /** 0 stops emission and lets the tail burn out; 1 is full. The chart turns
   *  this down for distant boats, because a captain three screens away does not
   *  need sixty embers and the fill rate is not free. */
  setIntensity(k: number): void
  destroy(): void
}

const rand = (r: Range) => r[0] + Math.random() * (r[1] - r[0])

export function makeRodFx(
  PIXI: typeof import('pixi.js'),
  glowType: GlowType,
  opts?: { stage?: number },
): RodFx {
  let spec = glowType === 'lockedin'
    ? LOCKED_IN_STAGES[Math.max(0, Math.min(3, opts?.stage ?? 0))]
    : SPECS[glowType]

  const view: Container = new PIXI.Container()

  // The bloom sits UNDER the particles, so sparks read as coming out of the
  // glow rather than floating in front of a sticker.
  let bloom: Sprite | null = null
  const makeBloom = () => {
    if (!spec.bloom) return null
    const s: Sprite = new PIXI.Sprite(softDot(PIXI))
    s.anchor.set(0.5)
    s.width = s.height = spec.bloom.size
    s.tint = spec.bloom.color
    s.alpha = spec.bloom.alpha
    s.blendMode = 'add'
    return s
  }
  bloom = makeBloom()
  if (bloom) view.addChild(bloom)

  // Additive, because these are all LIGHT. Overlapping embers should get
  // brighter where they pile up, which is the one thing that separates a fire
  // from a lot of orange dots.
  const layer: ParticleContainer = new PIXI.ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
  })
  layer.blendMode = 'add'
  view.addChild(layer)

  // ── THE POOL ──────────────────────────────────────────────────────────────
  // Sized for the loudest thing this emitter can become, once, up front:
  // peak rate × longest life, plus a burst's worth of headroom. The Locked-In
  // Rod is sized for stage 3 even at stage 0, because the whole point is that
  // it can get there mid-cast and the moment it does is not the moment to be
  // allocating.
  // A spec's ceiling is its steady rate plus however many bursts can still be
  // in the air at once — a burst every 0.7s with a 0.4s life overlaps not at
  // all, one every 0.2s overlaps twice, and undercounting that is what makes an
  // effect eat its own oldest sparks mid-flight.
  const ceiling = (s: Spec) => {
    const steady = s.rate * s.life[1]
    const bursts = s.burst ? s.burst.count * Math.ceil(s.life[1] / s.burst.every) : 0
    return steady + bursts
  }
  const peak = glowType === 'lockedin'
    ? Math.max(...LOCKED_IN_STAGES.map(ceiling))
    : ceiling(spec)
  const CAP = Math.min(280, Math.ceil(peak * 1.4) + 8)

  const wantsStar = glowType === 'lockedin'
    ? LOCKED_IN_STAGES.some(s => s.star)
    : !!spec.star
  const tex = wantsStar ? star(PIXI) : softDot(PIXI)

  const pool: Live[] = []
  for (let i = 0; i < CAP; i++) {
    const p: Particle = new PIXI.Particle({ texture: tex })
    p.anchorX = 0.5
    p.anchorY = 0.5
    p.alpha = 0
    p.scaleX = p.scaleY = 0
    layer.addParticle(p)
    pool.push({ p, vx: 0, vy: 0, age: 0, ttl: 0, size: 0 })
  }

  let next = 0            // round-robin cursor into the pool
  let carry = 0           // fractional particles owed at the current rate
  let sinceBurst = 0
  let clock = 0
  let intensity = 1
  let colorTick = 0

  function spawn(n: number) {
    for (let i = 0; i < n; i++) {
      const s = pool[next]
      next = (next + 1) % CAP
      const a = spec.angle + (Math.random() * 2 - 1) * spec.spread
      const v = rand(spec.speed)
      s.vx = Math.cos(a) * v
      s.vy = Math.sin(a) * v
      s.age = 0
      s.ttl = rand(spec.life)
      s.size = rand(spec.size)
      const r = (spec.scatter ?? 0) * Math.sqrt(Math.random())
      const ra = Math.random() * Math.PI * 2
      s.p.x = Math.cos(ra) * r
      s.p.y = Math.sin(ra) * r
      s.p.tint = spec.cycle
        ? spec.colors[colorTick++ % spec.colors.length]
        : spec.colors[(Math.random() * spec.colors.length) | 0]
      s.p.alpha = 1
    }
  }

  return {
    view,

    update(dt) {
      // A tab that was backgrounded hands back an enormous dt; simulating it
      // honestly teleports every particle off the screen at once.
      const d = Math.min(dt, 0.05)
      clock += d

      // ── EMIT ──
      if (intensity > 0) {
        if (spec.burst) {
          sinceBurst += d
          if (sinceBurst >= spec.burst.every) {
            sinceBurst = 0
            spawn(Math.max(1, Math.round(spec.burst.count * intensity)))
          }
        }
        carry += spec.rate * intensity * d
        const n = Math.floor(carry)
        if (n > 0) { carry -= n; spawn(n) }
      }

      // ── MOVE ──
      for (const s of pool) {
        if (s.age >= s.ttl) continue
        s.age += d
        if (s.age >= s.ttl) { s.p.alpha = 0; s.p.scaleX = s.p.scaleY = 0; continue }

        if (spec.swirl) {
          // Push perpendicular to the current heading and the path curves. The
          // sign is fixed, so all the dust in one aura orbits the same way,
          // which is what makes it read as one system rather than as chaos.
          // Both components come off the SAME heading — feeding the updated vx
          // into vy's term turns the orbit into a spiral that winds itself up.
          const vx = s.vx, vy = s.vy
          const m = Math.hypot(vx, vy) || 1
          s.vx += (-vy / m) * spec.swirl * d
          s.vy += (vx / m) * spec.swirl * d
        }
        s.vy += spec.gravity * d
        const keep = Math.pow(spec.drag, d)
        s.vx *= keep
        s.vy *= keep
        s.p.x += s.vx * d
        s.p.y += s.vy * d

        const t = s.age / s.ttl
        // Fast in, slow out: a particle that fades linearly reads as a dimmer
        // switch. This one arrives and then lets go.
        s.p.alpha = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88
        const grow = 1 - t * 0.55
        const k = (s.size * grow) / 64
        if (spec.streak) {
          // Stretched along the direction of travel, which for a spark is the
          // difference between an arc and a dot that happens to be moving.
          s.p.rotation = Math.atan2(s.vy, s.vx)
          s.p.scaleX = k * spec.streak
          s.p.scaleY = k
        } else {
          s.p.scaleX = s.p.scaleY = k
        }
      }

      // ── BREATHE ──
      if (bloom && spec.bloom) {
        const w = 0.5 + 0.5 * Math.sin((clock / spec.bloom.pulse) * Math.PI * 2)
        bloom.alpha = spec.bloom.alpha * (0.7 + 0.3 * w) * intensity
        const g = 1 + 0.12 * w
        bloom.width = bloom.height = spec.bloom.size * g
      }
    },

    setStage(stage) {
      if (glowType !== 'lockedin') return
      const s = LOCKED_IN_STAGES[Math.max(0, Math.min(3, stage))]
      if (s === spec) return
      spec = s
      // Live particles keep their old colour and burn out naturally, which is
      // what a stage-up should look like: the cyan you already threw is still
      // in the air while the gold starts coming. Only the bloom is restated,
      // because it is one sprite and it is the thing the eye tracks.
      if (bloom && spec.bloom) {
        bloom.tint = spec.bloom.color
        bloom.width = bloom.height = spec.bloom.size
      }
    },

    setIntensity(k) {
      intensity = Math.max(0, Math.min(1, k))
    },

    destroy() {
      // The textures are shared and deliberately outlive this: they are two
      // canvases for the entire chart.
      view.destroy({ children: true })
    },
  }
}
