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
  // BAY_AT is only the default a new bay starts at now; each carries its own.
  console.log(`    junction at ${HUB.x},${HUB.y}, ${HUB_R * 2} across`
    + `   (a new bay starts at ${BAY_AT})`)

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
    BAYS, BAY_BY_ID, ENCOUNTERS, CACHES, BEATS, RAID_ISLES, WALLS, ISLE_BY_ID,
    encounterAt, ENCOUNTER_REACH, CACHE_REACH, opensBay,
    dockAt, isleAt, bayCentre, inChapterWater,
    RETURN_PORTALS, PORTAL_REACH, PORTAL_HOME, portalOpensOn,
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
    + ` ${BEATS.length} beats, ${RAID_ISLES.length} isles)`)

  // -- IS THERE ANYWHERE TO STAND AND FIGHT? --------------------------------
  //
  // A fight moors at a fixed world offset off the boss's port quarter (DOCK)
  // and both hulls are framed from there, so a boss with rock in that corner is
  // a boss you cannot take on without being shoved through stone on the way in.
  // That is a property of WHERE THE BOSS WAS PUT, which makes it this file's
  // business rather than something to find out mid-broadside.
  //
  // WHAT THIS CANNOT SEE, said plainly: the loose rock a bay is scattered with
  // is generated inside SeaMap and is not importable here, so this measures the
  // dock against the bay's coast and its isles only. The chart dodges the rest
  // at runtime by walking variations of the same formation; this check is what
  // keeps that fallback from being load-bearing.
  const DOCK_HULL = 120
  const DOCK_WANT = 220
  for (const e of ENCOUNTERS) {
    const bb = BAY_BY_ID[e.bay]
    const d = dockAt(e)
    if (!bb || !d) continue
    const cc = bayCentre(bb)
    const coast = bb.r - Math.hypot(d.x - cc.x, d.y - cc.y)
    let isleGap = Infinity, who = 'nothing'
    for (const i of RAID_ISLES) {
      const ip = isleAt(i)
      if (!ip) continue
      const gap = Math.hypot(d.x - ip.x, d.y - ip.y) - (i.r + DOCK_HULL)
      if (gap < isleGap) { isleGap = gap; who = i.id }
    }
    if (!inChapterWater(bb, d.x, d.y)) {
      console.error(`  x ${e.node}: its docking spot is outside the bay`); bad++
    } else if (coast < DOCK_WANT) {
      console.error(`  x ${e.node}: docking spot is ${Math.round(coast)}px off the coast, wants ${DOCK_WANT} - move the boss off the shore`); bad++
    } else if (isleGap < 0) {
      console.error(`  x ${e.node}: docking spot is inside isle '${who}'`); bad++
    } else {
      console.log(`    ok   dock    ${e.node.padEnd(18)} ${Math.round(coast)}px of coast, ${Math.round(isleGap)}px off ${who}`)
    }
  }

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
    const i = ISLE_BY_ID[t.isle]
    if (!i) {
      console.error(`  ✗ beat '${t.node}' stands on '${t.isle}', which is not an isle`); bad++; continue
    }
    // Readable from CACHE_REACH off its rock. The wall block below is what
    // measures a post against a gate now, because a gate is a SEGMENT and
    // "how far up the bay is it" stopped meaning anything the moment the route
    // started folding back on itself.
    console.log(`    ok   beat    ${t.node.padEnd(18)} at ${t.isle.padEnd(14)}`
      + ` ${i.along}px up, read from ${CACHE_REACH + i.r} out`)
  }

  /**
   * ── AND THE CHAIN HAS TO BE WALKABLE FROM THE WATER ─────────────────────
   *
   * `requiresNode` is what makes the campaign a campaign: you cannot read the
   * wax that names Krust before you have been up the line to learn there is a
   * name. Every placed node therefore needs its REQUIREMENT placed too, or the
   * bay dead-ends at a locked thing with nothing out here that could ever
   * unlock it.
   *
   * This is not hypothetical. Chapter one's chain runs
   *   syndicate → bilge_milestone → quartermaster → krust_reveal → krust
   *              → chapter_1_close → chapter_1_class
   * and the milestone and the class pick were both left off the water as
   * "management". So four fifths of the chapter was unreachable, and so was
   * every chapter after it — chapter II's door opens on chapter_1_class.
   *
   * A requirement that is CLEARED BY SOMETHING ELSE PLACED is fine: a boss
   * clears its own challenge variant's requirement, and challenge variants are
   * deliberately not on the water.
   */
  {
    const placed = new Set<string>([
      ...ENCOUNTERS.map(e => e.node),
      ...CACHES.map(c => c.node),
      ...BEATS.map(b => b.node),
    ])
    let broken = 0
    for (const id of placed) {
      const n = RAID_MAP.find(x => x.id === id)
      const req = n?.requiresNode
      if (!req || placed.has(req)) continue
      console.error(`  ✗ '${id}' needs '${req}', which is nowhere in the water`)
      broken++; bad++
    }
    // AND THE CHAPTER'S OWN TAIL, which is what opens the NEXT bay's door.
    //
    // ONLY FOR A BAY THAT HAS BEEN BUILT. An empty bay is not a dead end, it is
    // a chapter nobody has laid out yet, and failing on it would mean the gate
    // shouted at every step of building this water instead of at the one thing
    // that is actually broken. A bay with content in it and no tail, though, is
    // a chapter you can finish and still find the next door rocked shut.
    for (let i = 1; i < BAYS.length; i++) {
      const prev = BAYS[i - 1]
      const built = [...ENCOUNTERS, ...CACHES, ...BEATS].some(t => t.bay === prev.id)
      if (!built) continue
      const gate = opensBay(BAYS[i])
      if (gate && !placed.has(gate)) {
        console.error(`  ✗ ${BAYS[i].name}'s door opens on '${gate}', which is nowhere in ${prev.name}`)
        broken++; bad++
      }
    }
    console.log(`    ${broken === 0 ? 'ok  ' : 'OFF '} chain   ${placed.size} node(s) placed,`
      + ` ${broken === 0 ? 'every requirement reachable' : `${broken} dead end(s)`}`)
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

  /**
   * ── THE WALLS, AND WHETHER THE ROUTE IS SAILABLE ────────────────────────
   *
   * A bay's rock is a ROAD now, and a road has failure modes a scattering of
   * content never had. Three of them, all silent:
   *
   *   1. A stop sitting ON a wall. The hull cannot reach it, and nothing on
   *      screen says why — the rock is just there and the thing is behind it.
   *   2. A gate opening on a node that is BEHIND it, which walls the chapter in
   *      permanently: the only thing that can take the gate down is on the far
   *      side of the gate.
   *   3. A wall running outside its own bay, which is rock in open water with
   *      nothing on either side of it.
   */
  const CLEAR_OF_WALL = 260
  const segDist = (
    px: number, py: number,
    ax: number, ay: number, bx: number, by: number,
  ) => {
    const dx = bx - ax, dy = by - ay
    const l2 = dx * dx + dy * dy
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
  }

  console.log(`
  Walls  (${WALLS.length}, ${WALLS.filter(w => w.node).length} of them gates)`)
  for (const w of WALLS) {
    const b = BAY_BY_ID[w.bay]
    if (!b) { console.error(`  ✗ a wall is in bay '${w.bay}', which does not exist`); bad++; continue }
    let ok = true
    // Both ends inside the bay, or the rock stands in open sea.
    for (const [al, ac] of [w.a, w.b]) {
      if (Math.hypot(al - b.r, ac) > b.r) {
        console.error(`  ✗ a wall in ${b.name} has an end outside the bay (${al},${ac})`)
        ok = false
      }
    }
    if (w.node && !RAID_MAP.some(n => n.id === w.node)) {
      console.error(`  ✗ a gate opens on '${w.node}', which is not a node`); ok = false
    }
    // Nothing standing on it.
    for (const t of things) {
      if (t.bay !== w.bay) continue
      const d = segDist(t.along, t.across, w.a[0], w.a[1], w.b[0], w.b[1]) - t.r
      if (d < CLEAR_OF_WALL) {
        console.error(`  ✗ ${t.id} is ${d.toFixed(0)}px from a wall in ${b.name} (wants ${CLEAR_OF_WALL})`)
        ok = false
      }
    }
    if (!ok) bad++
    if (w.node) {
      console.log(`    ${ok ? 'ok  ' : 'OFF '} gate    ${String(w.node).padEnd(18)}`
        + ` ${w.a[0]},${w.a[1]} -> ${w.b[0]},${w.b[1]}`)
    }
  }

  /**
   * ── AND THE ROAD HAS TO BE WALKABLE IN THE CHAIN'S OWN ORDER ────────────
   *
   * Every step of the chapter, in the order raidMap gives it, and the straight
   * line from each stop to the next must not cross a wall that is still up at
   * that point in the run.
   *
   * This is the check the whole shape needs. Anything else can be eyeballed —
   * a route that looks like a road usually is one — but "can you actually get
   * from the wax to Krust without crossing the finger" is a question about a
   * sixteen-segment polyline and a fold, and eyes are bad at it.
   *
   * Straight lines, not pathfinding: if the direct run is clear the route is
   * certainly sailable, and if it is not, this says which leg to look at. A
   * false alarm costs a glance; a road you cannot sail costs a chapter.
   */
  {
    // EVERY STOP, INCLUDING THE ONES THAT STAND ON A ROCK. `things` keys an
    // isle by the isle's id, but the chain is written in NODE ids — so without
    // this the walk found only the three ships and cheerfully reported that
    // Pete and Krust are not connected, which is true of the straight line
    // between them and irrelevant, because six stops sit on the road between.
    const at = new Map<string, { bay: string; along: number; across: number; r: number }>()
    for (const t of things) if (t.kind !== 'isle') at.set(t.id, t)
    for (const c of CACHES) {
      const i = ISLE_BY_ID[c.isle]
      if (i) at.set(c.node, { bay: c.bay, along: i.along, across: i.across, r: i.r })
    }
    for (const t of BEATS) {
      const i = ISLE_BY_ID[t.isle]
      if (i) at.set(t.node, { bay: t.bay, along: i.along, across: i.across, r: i.r })
    }
    const chapterOne = RAID_MAP.filter(n => at.has(n.id))
    let broke = 0
    const done = new Set<string>()
    console.log(`
  The road  (${chapterOne.length} stops, in the chain's order)`)
    for (let i = 0; i + 1 < chapterOne.length; i++) {
      const from = at.get(chapterOne[i].id)!
      const to = at.get(chapterOne[i + 1].id)!
      done.add(chapterOne[i].id)
      if (from.bay !== to.bay) continue
      const blocking = WALLS.filter(w => w.bay === from.bay && (!w.node || !done.has(w.node)))
      const hit = blocking.find(w => {
        const cross = (ax: number, ay: number, bx: number, by: number,
                       cx: number, cy: number, dxx: number, dyy: number) => {
          const s1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
          const s2 = (bx - ax) * (dyy - ay) - (by - ay) * (dxx - ax)
          const s3 = (dxx - cx) * (ay - cy) - (dyy - cy) * (ax - cx)
          const s4 = (dxx - cx) * (by - cy) - (dyy - cy) * (bx - cx)
          return s1 * s2 < 0 && s3 * s4 < 0
        }
        return cross(from.along, from.across, to.along, to.across, w.a[0], w.a[1], w.b[0], w.b[1])
      })
      const ok = !hit
      if (!ok) { broke++; bad++ }
      console.log(`    ${ok ? 'ok  ' : 'OFF '} ${chapterOne[i].id.padEnd(18)} -> ${chapterOne[i + 1].id.padEnd(18)}`
        + ` ${Math.hypot(to.along - from.along, to.across - from.across).toFixed(0).padStart(5)}px`
        + (ok ? '' : `   blocked by a ${hit!.node ? `gate (${hit!.node})` : 'wall'}`))
    }
    if (broke === 0) console.log('    the whole chapter is sailable in order')
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

  /**
   * ── THE WAY HOME ────────────────────────────────────────────────────────
   *
   * Four things, and every one of them is silent when it is wrong:
   *
   *   1. A portal in a bay with no raid in it can never open, and nothing on
   *      screen would ever say so — it simply would not be there.
   *   2. One that is not BEHIND its boss is a shortcut past the fight it is
   *      supposed to be the reward for.
   *   3. One inside the coast, or on top of something, is a mouth you cannot
   *      reach or one that swallows a chest.
   *   4. And the far end has to be somewhere a boat can actually float: inside
   *      the harbour and out of every berth ring, or arriving would either
   *      leave you in rock or open a panel you did not ask for.
   */
  for (const pt of RETURN_PORTALS) {
    const b = BAY_BY_ID[pt.bay]
    if (!b) { console.error(`  ✗ a way home is in bay '${pt.bay}', which does not exist`); bad++; continue }
    const boss = portalOpensOn(pt.bay)
    if (!boss) { console.error(`  ✗ ${b.name}'s way home has no raid to open it`); bad++; continue }
    /**
     * NO "IS IT BEHIND THE BOSS" TEST ANY MORE, and it was not merely failing,
     * it was measuring the wrong thing.
     *
     * It compared `along`, which was a real ordering while a bay was a straight
     * run out. On a road that folds back it is not: Krust ends the chapter at
     * along 2,801 and Pete opens it at 6,803, so the second boss is NEARER the
     * door than the first and every honest layout would fail.
     *
     * And the thing it was guarding against cannot happen anyway. The portal is
     * only drawn, and only usable, once its boss is cleared — position was never
     * what stopped it being a shortcut, `portalOpen` was. What is left to check
     * is that it is somewhere a hull can actually float.
     */
    const room = b.r - Math.hypot(pt.along - b.r, pt.across)
    let ok = room > PORTAL_REACH
    for (const w of WALLS.filter(x => x.bay === pt.bay)) {
      if (segDist(pt.along, pt.across, w.a[0], w.a[1], w.b[0], w.b[1]) < PORTAL_REACH) {
        console.error(`  ✗ ${b.name}'s way home is up against a wall`); ok = false
      }
    }
    for (const t of things) {
      if (t.bay !== pt.bay) continue
      const d = Math.hypot(t.along - pt.along, t.across - pt.across) - t.r - PORTAL_REACH
      if (d < 0) { console.error(`  ✗ ${b.name}'s way home overlaps ${t.id}`); ok = false }
    }
    if (!ok) bad++
    console.log(`    ${ok ? 'ok  ' : 'OFF '} home    ${pt.bay.padEnd(18)} opens on ${boss.padEnd(10)}`
      + ` ${pt.along}px up, ${room.toFixed(0)}px off the coast`)
  }

  {
    const { PLACES, EXP_ORIGIN, EXP_EDGE } = await import('../app/(app)/sea/chart')
    const fromHarbour = Math.hypot(PORTAL_HOME.x - EXP_ORIGIN.x, PORTAL_HOME.y - EXP_ORIGIN.y)
    let ok = fromHarbour < EXP_EDGE - 200
    if (!ok) console.error(`  ✗ the way home lands ${fromHarbour.toFixed(0)}px out, past the harbour's ${EXP_EDGE}`)
    let nearest = Infinity, who = ''
    for (const p of PLACES) {
      if (p.kind !== 'port' || p.y > -1500) continue
      const d = Math.hypot(PORTAL_HOME.x - p.x, PORTAL_HOME.y - p.y) - p.r
      if (d < nearest) { nearest = d; who = p.name }
      if (d < 120) { console.error(`  ✗ the way home lands inside ${p.name}`); ok = false }
    }
    if (!ok) bad++
    console.log(`    ${ok ? 'ok  ' : 'OFF '} landing ${`${PORTAL_HOME.x},${PORTAL_HOME.y}`.padEnd(18)}`
      + ` ${fromHarbour.toFixed(0)}px into the harbour, ${nearest.toFixed(0)}px off ${who}`)
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
