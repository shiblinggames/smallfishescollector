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

// ── THE CAMPAIGN'S BAYS ──────────────────────────────────────────────────
//
// Four bays off one junction, each behind its own strait. Five things that can
// each be true on their own and wrong together, so each is measured:
//
//   1. RAID_EDGE has to hold them. It is a hand-set constant and the table is
//      hand-authored; nothing but this stops the furthest bay sitting past the
//      sail limit with its boss unreachable behind the edge of the chart.
//   2. NO TWO BAYS MAY TOUCH, and no strait may cross another bay. Shared water
//      is a way from an open chapter into a shut one without passing its mouth
//      — the one thing a linear campaign cannot have, and the easiest thing to
//      introduce by nudging a bearing.
//   3. The junction and the sortie have to be OUTSIDE every chapter's water, or
//      you arrive already through a wall and its gate means nothing.
//   4. A strait must actually REACH its bay. It is derived, so this can only go
//      wrong by someone making a bay bigger than the run out to it — but that
//      leaves a corridor stopping in open sea, which is not a thing to find out
//      from a screenshot.
//   5. Every bay must name a chapter that exists, and every chapter but the coda
//      must have a bay, or a mouth opens on a node id nothing will ever clear.
{
  const {
    HUB, HUB_R, BAY_AT, BAYS, bayCentre, mouthOf, entryOf, straitLen, raidReach,
    opensBay, inChapterWater, toStrait,
  } = await import('../app/(app)/sea/raidWaters')
  const { RAID_EDGE, EXP_ORIGIN, SORTIE } = await import('../app/(app)/sea/chart')
  const { RAID_CHAPTERS, RAID_MAP } = await import('../lib/raidMap')

  type B = (typeof BAYS)[number]
  let bad = 0

  const need = Math.round(raidReach(EXP_ORIGIN.y))
  console.log(`\n  Raid water  (sail limit ${RAID_EDGE}, bays reach ${need})`)
  if (need > RAID_EDGE) {
    console.error(`  ✗ RAID_EDGE is ${RAID_EDGE} but the bays need ${need}`)
    bad++
  }
  console.log(`    junction at ${HUB.x},${HUB.y}, ${HUB_R * 2} across, bays ${BAY_AT} out`)

  for (const b of BAYS) {
    if (!RAID_CHAPTERS.some(x => x.id === b.id)) {
      console.error(`  ✗ bay '${b.id}' is not a chapter`); bad++
    }
    const gate = opensBay(b)
    if (gate && !RAID_MAP.some(n => n.id === gate)) {
      console.error(`  ✗ '${b.id}' opens on '${gate}', which is not a node`); bad++
    }
    const L = straitLen(b)
    if (L < 400) {
      console.error(`  ✗ ${b.name}'s strait is only ${L.toFixed(0)} long — the bay has eaten it`)
      bad++
    }
    const c = bayCentre(b)
    console.log(`    ${gate ? 'shut' : 'open'} ${b.name.padEnd(18)}`
      + ` bearing ${Math.round((b.bearing * 180) / Math.PI).toString().padStart(4)}°`
      + `  bay ${(b.r * 2).toString().padStart(4)} across at ${c.x.toFixed(0)},${c.y.toFixed(0)}`
      + `  strait ${L.toFixed(0)}x${b.half * 2}`)
  }

  /**
   * DO TWO CHAPTERS SHARE ANY WATER?
   *
   * Each region is a disc and a box, so the honest test is a sweep: walk one
   * bay's rim and its strait's outline and ask the other whether it owns any of
   * those points, then the same the other way round. Discs and boxes have a
   * closed-form answer each; the UNION of a disc and a box does not have a tidy
   * one, and a wrong tidy one here reads as a working campaign right up until
   * somebody sails through a shut door.
   */
  const outline = (b: B) => {
    const pts: { x: number; y: number }[] = []
    const c = bayCentre(b)
    for (let t = 0; t < Math.PI * 2; t += Math.PI / 90) {
      pts.push({ x: c.x + Math.cos(t) * b.r, y: c.y + Math.sin(t) * b.r })
    }
    const L = straitLen(b)
    const m = mouthOf(b)
    const ux = Math.cos(b.bearing), uy = Math.sin(b.bearing)
    for (let a = 0; a <= L; a += 40) {
      for (const s of [-1, 1]) {
        pts.push({ x: m.x + ux * a - uy * s * b.half, y: m.y + uy * a + ux * s * b.half })
      }
    }
    return pts
  }

  for (let i = 0; i < BAYS.length; i++) {
    for (let j = i + 1; j < BAYS.length; j++) {
      const a = BAYS[i], b = BAYS[j]
      const clash = outline(a).some(p => inChapterWater(b, p.x, p.y))
        || outline(b).some(p => inChapterWater(a, p.x, p.y))
      if (clash) {
        console.error(`  ✗ ${a.name} and ${b.name} share water`
          + ` — that is a way into a shut chapter without its mouth`)
        bad++
      }
    }
  }

  // How much open sea is left between neighbouring coasts. Not a failure on its
  // own, but bays that nearly touch read as one shape with slots cut in it.
  for (let i = 0; i + 1 < BAYS.length; i++) {
    const a = BAYS[i], b = BAYS[i + 1]
    const ca = bayCentre(a), cb = bayCentre(b)
    const between = Math.hypot(cb.x - ca.x, cb.y - ca.y) - a.r - b.r
    console.log(`    ${between > 600 ? 'ok   ' : 'TIGHT'} ${between.toFixed(0).padStart(5)}px of open sea`
      + ` between ${a.name} and ${b.name}`)
    if (between <= 0) bad++
  }

  for (const b of BAYS) {
    if (inChapterWater(b, HUB.x, HUB.y)) { console.error(`  ✗ the junction is inside ${b.name}`); bad++ }
    if (inChapterWater(b, SORTIE.x, SORTIE.y)) { console.error(`  ✗ the sortie is inside ${b.name}`); bad++ }
  }
  const back = BAYS.map(b => -toStrait(b, HUB.x, HUB.y).along)
  console.log(`    ok    the junction's middle is ${Math.min(...back).toFixed(0)}px off the nearest mouth`)

  for (const ch of RAID_CHAPTERS) {
    if (ch.coda) continue                       // the coda has no water of its own
    if (!BAYS.some(b => b.id === ch.id)) {
      console.error(`  ✗ chapter '${ch.id}' has no bay`); bad++
    }
  }

  console.log(`\n  Bays: ${BAYS.length} placed, ${bad === 0 ? 'the fan is clean' : `${bad} problem(s)`}.`)
  if (bad) process.exit(1)
}

// ── WHAT STANDS IN THE CAMPAIGN'S WATER ──────────────────────────────────
//
// Ships, chests, bottles, isles and gates, all placed in bay space. What can be
// quietly wrong about one:
//
//   1. It names a node that does not exist — a rename in raidMap and the water
//      points at nothing, silently, because a missing node just does not draw.
//   2. It is in the coast, or past the back of the bay, so it is behind rock.
//   3. It sits IN THE DOORWAY, so arriving means colliding with content.
//   4. It sits on top of something else, or on an isle, so one hides the other.
//   5. A GATE has content sitting on the line, which would leave a chest you can
//      see, cannot reach, and cannot tell why.
{
  const {
    BAYS, BAY_BY_ID, ENCOUNTERS, CACHES, BEATS, RAID_ISLES, GATES, ISLE_BY_ID,
    encounterAt, ENCOUNTER_REACH,
  } = await import('../app/(app)/sea/raidWaters')
  const { RAID_MAP } = await import('../lib/raidMap')

  let bad = 0
  /**
   * HOW FAR APART TWO THINGS IN THE WATER HAVE TO SIT.
   *
   * `encounterNear` takes the NEAREST, so two inside one reach ring do not
   * flicker — the prompt just changes as you pass. What is at stake is that they
   * read as two things rather than one pile: a hull is 210 long, and one reach
   * is the closest two can moor with open water still between them.
   */
  const APART = ENCOUNTER_REACH
  /** Nor closer than this to the doorway you come in through. */
  const OFF_DOOR = 500
  /** Nor to the coast. A boat is 210 long and comes alongside. */
  const OFF_COAST = 300
  /** Nor to a gate, either side of it. */
  const OFF_GATE = 380

  type Thing = { id: string; kind: string; bay: string; along: number; across: number; r: number }
  const things: Thing[] = [
    ...ENCOUNTERS.map(e => ({ id: e.node, kind: 'ship', bay: e.bay, along: e.along, across: e.across, r: 0 })),
    ...RAID_ISLES.map(i => ({ id: i.id, kind: 'isle', bay: i.bay, along: i.along, across: i.across, r: i.r })),
  ]

  console.log(`\n  In the water  (${ENCOUNTERS.length} ships, ${CACHES.length} caches,`
    + ` ${BEATS.length} beats, ${RAID_ISLES.length} isles, ${GATES.length} gate(s))`)

  // A CACHE AND A BEAT ARE BOTH ATTACHED TO A ROCK, so they are checked by
  // whether that rock exists rather than by where they sit — the rock's own
  // placement is already measured above, and a chest cannot be anywhere its
  // isle is not. This is the fix for chests floating in open water: there is no
  // longer a coordinate on a cache that could disagree with an isle.
  for (const c of CACHES) {
    if (!ISLE_BY_ID[c.isle]) {
      console.error(`  ✗ cache '${c.node}' sits on '${c.isle}', which is not an isle`); bad++
    } else if (!RAID_MAP.some(n => n.id === c.node)) {
      console.error(`  ✗ cache '${c.node}' is not a node in RAID_MAP`); bad++
    } else {
      console.log(`    ok   cache   ${c.node.padEnd(18)} on ${c.isle}`)
    }
  }

  for (const t of BEATS) {
    if (!RAID_MAP.some(n => n.id === t.node)) {
      console.error(`  ✗ beat '${t.node}' is not a node in RAID_MAP`); bad++; continue
    }
    // A BEAT NEEDS SOMETHING YOU CAN SEE, or it is a trigger in open water that
    // fires for no reason a captain can name. The only exception is a beat in
    // the doorway, which cannot be missed by construction.
    const i = t.isle ? ISLE_BY_ID[t.isle] : null
    if (t.isle && !i) {
      console.error(`  ✗ beat '${t.node}' happens at '${t.isle}', which is not an isle`); bad++; continue
    }
    const along = i ? i.along : (t.along ?? 0)
    // AND IT MUST NOT REACH THROUGH A GATE. A trigger whose circle crosses a
    // shut line fires from the wrong side of it, which would hand you the scene
    // that opens the gate while the gate is still refusing you.
    const reach = t.r + (i?.r ?? 0)
    const g = GATES.find(x => x.bay === t.bay && Math.abs(x.at - along) < reach)
    if (g) {
      console.error(`  ✗ beat '${t.node}' reaches through the '${g.node}' gate`); bad++
    } else {
      console.log(`    ok   beat    ${t.node.padEnd(18)}`
        + ` ${i ? `at ${t.isle}` : `${along}px up ${t.bay}`}, fires within ${reach}`)
    }
  }

  for (const t of things) {
    const b = BAY_BY_ID[t.bay]
    if (!b) { console.error(`  ✗ '${t.id}' is in bay '${t.bay}', which does not exist`); bad++; continue }
    if (t.kind !== 'isle' && !RAID_MAP.some(n => n.id === t.id)) {
      console.error(`  ✗ '${t.id}' is not a node in RAID_MAP`); bad++; continue
    }

    // How far inside the coast it sits. The bay is a disc whose centre is `r`
    // up the axis from the door, so this is one hypot.
    const room = b.r - Math.hypot(t.along - b.r, t.across) - t.r
    const ok = room > OFF_COAST && t.along > OFF_DOOR
    if (!ok) bad++

    console.log(`    ${ok ? 'ok  ' : 'OFF '} ${t.kind.padEnd(7)} ${t.id.padEnd(18)}`
      + ` ${t.along.toString().padStart(4)}px up ${t.bay.padEnd(14)}`
      + ` ${room.toFixed(0).padStart(4)}px off the coast`)
  }

  for (let i = 0; i < things.length; i++) {
    for (let j = i + 1; j < things.length; j++) {
      const a = things[i], b = things[j]
      if (a.bay !== b.bay) continue
      const d = Math.hypot(a.along - b.along, a.across - b.across) - a.r - b.r
      const need = APART
      if (d < need) {
        console.error(`  ✗ ${a.id} and ${b.id} are ${d.toFixed(0)}px apart (wants ${need})`)
        bad++
      }
    }
  }

  for (const g of GATES) {
    const b = BAY_BY_ID[g.bay]
    if (!b) { console.error(`  ✗ gate '${g.node}' is in bay '${g.bay}', which does not exist`); bad++; continue }
    if (!RAID_MAP.some(n => n.id === g.node)) {
      console.error(`  ✗ gate opens on '${g.node}', which is not a node`); bad++; continue
    }
    // The thing that OPENS a gate has to be in front of it, or the bay cannot
    // be finished from inside itself.
    // WHAT OPENS IT HAS TO BE IN FRONT OF IT, or the bay cannot be finished
    // from inside itself. The opener can be a ship, a chest on a rock or a story
    // beat, so all three are searched — and each resolves to a distance up the
    // bay, which is the only thing this test needs of it.
    const beat = BEATS.find(x => x.node === g.node)
    const cache = CACHES.find(x => x.node === g.node)
    const openerAt = beat
      ? (beat.isle ? ISLE_BY_ID[beat.isle]?.along : beat.along)
      : cache
        ? ISLE_BY_ID[cache.isle]?.along
        : things.find(t => t.id === g.node)?.along
    if (openerAt == null) {
      console.error(`  ✗ gate '${g.node}' has nothing in the water to open it`); bad++
    } else if (openerAt >= g.at) {
      console.error(`  ✗ gate '${g.node}' is opened by something BEHIND it`); bad++
    }
    let clash = 0
    for (const t of things) {
      if (t.bay !== g.bay) continue
      if (Math.abs(t.along - g.at) - t.r < OFF_GATE) {
        console.error(`  ✗ ${t.id} sits on the '${g.node}' gate line`); bad++; clash++
      }
    }
    const behind = things.filter(t => t.bay === g.bay && t.along > g.at).length
    console.log(`    ${clash === 0 ? 'ok  ' : 'OFF '} gate    ${g.node.padEnd(18)}`
      + ` at ${g.at}, ${behind} thing(s) behind it`)
    if (behind === 0) { console.error(`  ✗ nothing is behind the '${g.node}' gate — it gates empty water`); bad++ }
  }

  // Every bay with content needs a way to finish it: the chapter's own boss.
  // A bay of story and no fight cannot be cleared from the water.
  for (const b of BAYS) {
    const here = things.filter(t => t.bay === b.id)
    if (here.length === 0) continue
    const fights = ENCOUNTERS.filter(e => e.bay === b.id).filter(e => {
      const n = RAID_MAP.find(x => x.id === e.node)
      return n && (n.type === 'raid' || n.type === 'skirmish')
    })
    console.log(`    ${b.name}: ${here.length} placed, ${fights.length} of them fights`)
    if (fights.length === 0) { console.error(`  ✗ ${b.name} has no fight in it`); bad++ }
  }

  // AND THE ART EACH COAST IS BUILT FROM HAS TO BE ON DISK. A missing sprite is
  // not an error anywhere — it simply does not draw — and a coast with holes in
  // it looks exactly like a coast with ways through it.
  const { readdir } = await import('node:fs/promises')
  const files = new Set(await readdir('public/sea'))
  for (const b of BAYS) {
    const n = [...files].filter(f => f.startsWith(`rock-${b.rocks}-`) && f.endsWith('.png')).length
    if (n < 3) {
      console.error(`  ✗ ${b.name} is built from 'rock-${b.rocks}-*' and only ${n} exist`)
      bad++
    } else {
      console.log(`    ok   ${b.name.padEnd(18)} ${n} rock(s) of its own`)
    }
  }

  console.log(`\n  In the water: ${bad === 0 ? 'all placed cleanly' : `${bad} problem(s)`}.`)
  if (bad) process.exit(1)
}
