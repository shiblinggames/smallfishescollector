/**
 * DOES EVERY BUILDING STAND ON THE GRASS?
 *
 * Buildings are placed by percentage of the island BOX, but the grass is a
 * seeded 160-point coastline inside that box — so "x: 76" is not a position on
 * the land, it is a position on a square that the land only partly fills. The
 * two were never checked against each other, and several buildings sit out over
 * the water.
 *
 * This reproduces both exactly: the coastline generator from PlaceIsland, and
 * the grass layer's own 15% inset. A building passes only if the whole BASE it
 * stands on is inside the grass, corners included.
 */
import { PLACES } from '../app/(app)/sea/chart'
import { coastline, grassAt, outBy, GRASS, BUILDABLE, SHORE } from '../lib/islandShape'
import { HOUSE } from '../lib/homestead'

/* The coastline and the grass both come from lib/islandShape now — the same
   module PlaceIsland draws from, so this cannot drift from what is on screen
   the way it did before. */

type Item = { label: string; art: string; x: number; y: number; scale: number; toShore?: boolean }

/**
 * ── IT MEASURES THE FOOTPRINT, NOT THE BOUNDING BOX ─────────────────────────
 *
 * This checker used to test the sprite's full width: x - scale*50 and
 * x + scale*50, on the reasoning that those are the corners of its base. They
 * are not. They are the corners of its BOX, and the corners of a box are usually
 * transparent — the Estate's ground only spans 17% to 81% of its plate, and the
 * mainland town's 22% to 79%. So the two points the gate cared most about were
 * empty pixels hanging in the air beside the art, and it was failing placements
 * that were visibly correct on the island.
 *
 * A false failure is worse than no check: it teaches you to override the gate,
 * and then the gate is not there for the real one.
 *
 * So the base is READ OFF THE ART — the leftmost and rightmost opaque pixels in
 * the bottom band of the paint. `top`/`bot` scan past any transparent padding
 * first, so the band is a share of what is DRAWN rather than of the file.
 */
const BAND = 0.15
const ALPHA = 24

const feet = new Map<string, { l: number; r: number }>()

async function footprint(art: string): Promise<{ l: number; r: number }> {
  const hit = feet.get(art)
  if (hit) return hit
  // A plate that cannot be read falls back to the whole box, which is the old
  // behaviour and the cautious direction to be wrong in.
  let out = { l: 0, r: 1 }
  try {
    const sharp = (await import('sharp')).default
    const { data, info } = await sharp(`public${art}`).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true })
    const { width: w, height: h } = info
    const rowInk = (y: number) => {
      for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > ALPHA) return true
      return false
    }
    let top = 0, bot = h - 1
    while (top < h && !rowInk(top)) top++
    while (bot > top && !rowInk(bot)) bot--
    const band = Math.max(1, Math.round((bot - top) * BAND))
    let L = w, R = 0
    for (let y = bot - band; y <= bot; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > ALPHA) { if (x < L) L = x; if (x > R) R = x }
      }
    }
    if (R > L) out = { l: L / w, r: (R + 1) / w }
  } catch {
    console.log(`    (could not read public${art}, measuring its whole box)`)
  }
  feet.set(art, out)
  return out
}

/** How far outside its own band a point is. outBy measures against the green;
 *  the scrub and the shore are further out, so each is the same number scaled.
 *  `toShore` is the town allowance — see SHORE in lib/islandShape. */
const K = BUILDABLE / GRASS
const K_SHORE = SHORE / GRASS
const outByLand = (rs: number[], x: number, y: number, toShore = false) =>
  Math.hypot(x - 50, y - 50) - grassAt(rs, Math.atan2(y - 50, x - 50)) * (toShore ? K_SHORE : K)

async function check(id: string, name: string, items: Item[]) {
  const rs = coastline(id)
  const lo = Math.min(...rs) * BUILDABLE, hi = Math.max(...rs) * BUILDABLE
  console.log(`\n  ${name}  (buildable land reaches ${lo.toFixed(1)}%..${hi.toFixed(1)}% from centre)`)
  let bad = 0
  for (const it of items) {
    const w = it.scale * 100            // the sprite's width, in box-percent
    const f = await footprint(it.art)
    // WHERE THE ART ACTUALLY MEETS THE GROUND. The sprite is anchored at its
    // bottom CENTRE, so a fraction f across the plate sits (f - 0.5) of the
    // width from x. Rarely symmetric: the Estate's ground reaches further left
    // than right, and that asymmetry is most of the reason to read it at all.
    const pts: [string, number, number][] = [
      ['centre', it.x + ((f.l + f.r) / 2 - 0.5) * w, it.y],
      ['left', it.x + (f.l - 0.5) * w, it.y],
      ['right', it.x + (f.r - 0.5) * w, it.y],
    ]
    const worst = pts.reduce((w, [tag, px, py]) => {
      const d = outByLand(rs, px, py, it.toShore)
      return d > w.d ? { tag, d } : w
    }, { tag: '', d: -Infinity })
    const ok = worst.d < -1.5           // 1.5% of margin, so nothing sits on the surf
    if (!ok) bad++
    console.log(`    ${ok ? 'ok  ' : 'OFF '} ${it.label.padEnd(20)} at ${String(it.x).padStart(3)},${String(it.y).padStart(3)}`
      + ` w${w.toFixed(0).padStart(3)} foot${((f.r - f.l) * w).toFixed(0).padStart(3)}`
      + `   worst ${worst.tag.padEnd(6)} ${worst.d > 0 ? '+' : ''}${worst.d.toFixed(1)}%${it.toShore ? '   (to shore)' : ''}`)
  }
  return bad
}

let bad = 0
for (const p of PLACES) {
  if (p.inner !== undefined) continue
  if (p.id === 'home') {
    // ONE SPRITE PER RUNG, all at the same spot, so every rung is checked
    // rather than only the widest: they are the same painting growing, and
    // the Estate is not automatically the one that overhangs first.
    bad += await check(p.id, `${p.name} (every rung of the house)`, HOUSE.map(b => ({
      label: b.name, art: b.art,
      x: b.x, y: b.y,
      scale: b.scale,
    })))
  } else {
    bad += await check(p.id, p.name, (p.buildings ?? []).map(b => ({
      label: b.art.split('/').pop()!.replace('.png', ''), art: b.art,
      x: b.x, y: b.y, scale: b.scale, toShore: b.toShore,
    })))
  }
}
console.log(`\n  ${bad} building${bad === 1 ? '' : 's'} not standing wholly on the land.`)
if (bad) process.exitCode = 1

// ── SALVAGE: the two halves of one fact ──────────────────────────────────
// A furnishing names the isle that holds it, and lib/seaIsles names the
// furnishing each isle holds. Either can be edited without the other, and the
// failure is silent both ways: a piece nobody can find, or an isle that grants
// something that is not gated on it.
{
  const { FURNITURE } = await import('../lib/homestead')
  const { ISLES, ISLE_FURNISHING } = await import('../lib/seaIsles')
  const fromItems = new Map<string, string>()
  for (const g of FURNITURE) for (const o of g.options) if (o.found) fromItems.set(o.found.isle, o.id)

  let bad = 0
  for (const [isle, id] of fromItems) {
    if (!ISLES.some(i => i.id === isle)) { console.error(`  ✗ ${id} is found on '${isle}', which is not an isle`); bad++ }
    if (ISLE_FURNISHING[isle] !== id) { console.error(`  ✗ ${id} says it is on ${isle}, but that isle grants ${ISLE_FURNISHING[isle] ?? 'nothing'}`); bad++ }
  }
  for (const [isle, id] of Object.entries(ISLE_FURNISHING)) {
    if (fromItems.get(isle) !== id) { console.error(`  ✗ ${isle} grants ${id}, which is not marked as found there`); bad++ }
  }
  console.log(`\n  Salvage: ${fromItems.size} piece(s) findable, ${bad === 0 ? 'both tables agree' : `${bad} disagreement(s)`}.`)
  if (bad) process.exit(1)
}

// ── THE CAMPAIGN'S CHANNELS ──────────────────────────────────────────────
//
// Four roads out of one piece of open water. Four things that can each be true
// on their own and wrong together, so each is measured rather than trusted:
//
//   1. RAID_EDGE has to hold them. It is a hand-set constant and the table is
//      hand-authored; nothing but this stops the longest channel's head sitting
//      past the sail limit with its boss unreachable behind it.
//   2. NO TWO CHANNELS MAY OVERLAP. Two corridors that cross share water, and
//      shared water is a way from an open road into a shut one without passing
//      its mouth — the one thing a linear campaign cannot have, and the easiest
//      thing to introduce by nudging a bearing.
//   3. The hub, and the sortie you arrive through, have to be OUTSIDE every
//      road, or you arrive already through a wall and its gate means nothing.
//   4. Every channel must name a chapter that exists, and every chapter but the
//      coda must have a road, or a mouth opens on a node id nothing will clear.
{
  const {
    HUB, CHANNELS, mouthOf, headOf, raidReach, opensChannel, inChannel, toChannel,
  } = await import('../app/(app)/sea/raidWaters')
  const { RAID_EDGE, EXP_ORIGIN, SORTIE } = await import('../app/(app)/sea/chart')
  const { RAID_CHAPTERS, RAID_MAP } = await import('../lib/raidMap')

  type Chan = (typeof CHANNELS)[number]
  let bad = 0

  const need = Math.round(raidReach(EXP_ORIGIN.y))
  console.log(`\n  Raid water  (sail limit ${RAID_EDGE}, channels reach ${need})`)
  if (need > RAID_EDGE) {
    console.error(`  ✗ RAID_EDGE is ${RAID_EDGE} but the channels need ${need}`)
    bad++
  }

  /** A channel's four corners, in world space. Everything below is rectangles. */
  const corners = (c: Chan) => {
    const m = mouthOf(c)
    const ux = Math.cos(c.bearing), uy = Math.sin(c.bearing)
    const pt = (a: number, r: number) => ({ x: m.x + ux * a - uy * r, y: m.y + uy * a + ux * r })
    return [pt(0, -c.half), pt(0, c.half), pt(c.length, c.half), pt(c.length, -c.half)]
  }

  /**
   * SEPARATING AXIS, on the four edge normals.
   *
   * Two convex rectangles miss each other if and only if some axis exists on
   * which their shadows do not touch, and for rectangles only their own edge
   * normals can be that axis. Corner containment alone would not do: two long
   * thin boxes can cross in an X with every corner of each outside the other,
   * which is exactly the shape a fan of channels is most likely to make.
   */
  const overlap = (a: Chan, b: Chan) => {
    const ca = corners(a), cb = corners(b)
    const axes = [
      [Math.cos(a.bearing), Math.sin(a.bearing)], [-Math.sin(a.bearing), Math.cos(a.bearing)],
      [Math.cos(b.bearing), Math.sin(b.bearing)], [-Math.sin(b.bearing), Math.cos(b.bearing)],
    ]
    for (const [ux, uy] of axes) {
      const pa = ca.map(p => p.x * ux + p.y * uy)
      const pb = cb.map(p => p.x * ux + p.y * uy)
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false
    }
    return true
  }

  for (const c of CHANNELS) {
    if (!RAID_CHAPTERS.some(x => x.id === c.id)) {
      console.error(`  ✗ channel '${c.id}' is not a chapter`); bad++
    }
    const gate = opensChannel(c)
    if (gate && !RAID_MAP.some(n => n.id === gate)) {
      console.error(`  ✗ '${c.id}' opens on '${gate}', which is not a node`); bad++
    }
    const h = headOf(c)
    console.log(`    ${gate ? 'shut' : 'open'} ${c.name.padEnd(18)}`
      + ` bearing ${Math.round((c.bearing * 180) / Math.PI).toString().padStart(4)}°`
      + `  ${c.length}px long, ${c.half * 2} wide`
      + `  head ${h.x.toFixed(0)},${h.y.toFixed(0)}`)
  }

  // The crossing test.
  for (let i = 0; i < CHANNELS.length; i++) {
    for (let j = i + 1; j < CHANNELS.length; j++) {
      if (overlap(CHANNELS[i], CHANNELS[j])) {
        console.error(`  ✗ ${CHANNELS[i].name} and ${CHANNELS[j].name} share water`
          + ` — that is a way into a shut road without its mouth`)
        bad++
      }
    }
  }

  // How much open water is left between neighbouring mouths. A junction whose
  // mouths touch reads as one shape with slots cut in it rather than four roads.
  for (let i = 0; i + 1 < CHANNELS.length; i++) {
    const a = CHANNELS[i], b = CHANNELS[i + 1]
    const ma = mouthOf(a), mb = mouthOf(b)
    const between = Math.hypot(mb.x - ma.x, mb.y - ma.y) - a.half - b.half
    console.log(`    ${between > 200 ? 'ok   ' : 'TIGHT'} ${between.toFixed(0).padStart(4)}px of open water`
      + ` between ${a.name} and ${b.name}`)
    if (between <= 0) bad++
  }

  for (const c of CHANNELS) {
    if (inChannel(c, HUB.x, HUB.y)) { console.error(`  ✗ the hub is inside ${c.name}`); bad++ }
    if (inChannel(c, SORTIE.x, SORTIE.y)) { console.error(`  ✗ the sortie is inside ${c.name}`); bad++ }
  }
  const back = CHANNELS.map(c => -toChannel(c, HUB.x, HUB.y).along)
  console.log(`    ok    the hub sits ${Math.min(...back).toFixed(0)}px short of the nearest mouth`)

  for (const ch of RAID_CHAPTERS) {
    if (ch.coda) continue                       // the coda has no road of its own
    if (!CHANNELS.some(c => c.id === ch.id)) {
      console.error(`  ✗ chapter '${ch.id}' has no channel`); bad++
    }
  }

  console.log(`\n  Channels: ${CHANNELS.length} placed, ${bad === 0 ? 'the fan is clean' : `${bad} problem(s)`}.`)
  if (bad) process.exit(1)
}

// ── WHAT STANDS IN THE CAMPAIGN'S WATER ──────────────────────────────────
//
// An encounter is a campaign node standing in a channel, and four things can be
// quietly wrong about one:
//
//   1. It names a node that does not exist — a rename in raidMap and the water
//      points at nothing, silently, because a missing node just does not draw.
//   2. It is in a wall, or past the head, so it is unreachable behind rock.
//   3. It sits IN THE MOUTH, so entering the road means colliding with content.
//   4. It sits on top of another, so one hides the other and the helm prompt
//      flickers between them.
{
  const { CHANNELS, CHANNEL_BY_ID, ENCOUNTERS, encounterAt, ENCOUNTER_REACH } =
    await import('../app/(app)/sea/raidWaters')
  const { RAID_MAP } = await import('../lib/raidMap')

  let bad = 0
  /**
   * HOW FAR APART TWO THINGS IN THE WATER HAVE TO SIT.
   *
   * Not twice the reach. `encounterNear` takes the NEAREST, so two inside one
   * reach ring do not flicker — the prompt just changes as you pass. What is
   * actually at stake is that they read as two ships rather than one pile: a
   * hull is 210 long, and one reach is the closest two of them can moor and
   * still have open water between them.
   */
  const APART = ENCOUNTER_REACH
  /** Nor closer than this to the mouth you come in through. */
  const OFF_MOUTH = 400
  /** Nor to a wall or the head. A boat is 210 long and comes alongside. */
  const OFF_WALL = 260

  console.log(`\n  Encounters  (${ENCOUNTERS.length} placed)`)
  for (const e of ENCOUNTERS) {
    const node = RAID_MAP.find(n => n.id === e.node)
    const c = CHANNEL_BY_ID[e.channel]
    if (!node) { console.error(`  ✗ '${e.node}' is not a node in RAID_MAP`); bad++; continue }
    if (!c) { console.error(`  ✗ '${e.node}' is in channel '${e.channel}', which does not exist`); bad++; continue }

    const room = c.half - Math.abs(e.across)
    const ahead = c.length - e.along
    const ok = room > OFF_WALL && ahead > OFF_WALL && e.along > OFF_MOUTH
    if (!ok) bad++

    console.log(`    ${ok ? 'ok  ' : 'OFF '} ${node.type.padEnd(10)} ${e.node.padEnd(18)}`
      + ` ${e.along.toString().padStart(4)}px up ${c.id.padEnd(16)}`
      + ` ${room.toFixed(0).padStart(4)}px off the wall, ${ahead.toFixed(0).padStart(4)}px short of the head`)
  }

  for (let i = 0; i < ENCOUNTERS.length; i++) {
    for (let j = i + 1; j < ENCOUNTERS.length; j++) {
      const a = encounterAt(ENCOUNTERS[i]), b = encounterAt(ENCOUNTERS[j])
      if (!a || !b) continue
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (d < APART) {
        console.error(`  ✗ ${ENCOUNTERS[i].node} and ${ENCOUNTERS[j].node} are ${d.toFixed(0)}px apart`)
        bad++
      }
    }
  }

  // Every road that has content needs a way to finish it: the chapter's own
  // boss. A channel of story and no fight cannot be cleared from the water.
  for (const c of CHANNELS) {
    const here = ENCOUNTERS.filter(e => e.channel === c.id)
    if (here.length === 0) continue
    const fights = here.filter(e => {
      const n = RAID_MAP.find(x => x.id === e.node)
      return n && (n.type === 'raid' || n.type === 'skirmish')
    })
    console.log(`    ${c.name}: ${here.length} placed, ${fights.length} of them fights`)
    if (fights.length === 0) { console.error(`  ✗ ${c.name} has no fight in it`); bad++ }
  }

  console.log(`\n  Encounters: ${bad === 0 ? 'all placed cleanly' : `${bad} problem(s)`}.`)
  if (bad) process.exit(1)
}
