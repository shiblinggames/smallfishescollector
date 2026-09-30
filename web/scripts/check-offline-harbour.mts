// THE HARBOUR, OFFLINE (Steam prep, 2026-09-29).
//
// Runs the REAL harbour paths (lib/core/harbour) against a LOCAL save
// (lib/data/local/harbourLocal), with no network:
//   1. the import trees of the core and the local store hold nothing of the
//      server;
//   2. the tackle shop: bait for its price, a rod bought once (never an earned,
//      free, trader's or Captain's rod the rules forbid, never under its level
//      or on credit), sold back once for its rate (the Bamboo back in hand),
//      the rod put in hand, the Completionist on its full record;
//   3. the ladders: reels, hooks, the fish hold and the hulls each climbed rung
//      by rung for their price to the top and no further, never on credit or
//      under their gate; the ship renamed;
//   4. the Almanac: lifetime counts, the ancient floor, first-caught and the
//      NEW marks (cleared once the book is read), goldens newest first, the
//      Vigil only after the finale;
//   5. the Shipyard's state and the ship screen's props from the save;
//   6. the store's own guards (a rod added or taken once).
//
//   npx tsx scripts/check-offline-harbour.mts

import fs from 'fs'
import path from 'path'
import * as harbour from '../lib/core/harbour'
import { localHarbourData } from '../lib/data/local/harbourLocal'
import {
  freshCasino, freshCharting, SHIP_PROFILE_DEFAULTS, DAILY_PROFILE_DEFAULTS, PARLOR_PROFILE_DEFAULTS, CHARTING_PROFILE_DEFAULTS, SEA_PROFILE_DEFAULTS,
  type LocalSave,
} from '../lib/data/local/save'
import type { SpeciesRow } from '../lib/data/fishingData'
import { installRng, mulberry32 } from '../lib/rng'
import { installClock } from '../lib/clock'
import { XP_TABLE } from '../lib/fishingLevel'
import { XP_TABLE as NAV_XP } from '../lib/expeditionLevel'
import { BAITS } from '../lib/bait'
import { RODS, ROD_SELL_RATE, isCaptainRod } from '../lib/rods'
import { REELS } from '../lib/reels'
import { HOOKS } from '../lib/hooks'
import { FISH_HOLD_TIERS } from '../lib/fishHold'
import { nextShip, MIN_SHIP_TIER } from '../lib/ships'
import { FOLK } from '../lib/seaFolk'
import { ISLES } from '../lib/seaIsles'

let failed = 0
const fail = (m: string) => { failed++; console.log('  FAIL ' + m) }
const ROOT = process.cwd()

// ── 1. Nothing of the server on the offline path ──
function importsOf(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8')
  const out: string[] = []
  for (const m of text.matchAll(/^\s*(import|export)\s+(type\s+)?[^'"\n]*?from\s+['"]([^'"]+)['"]/gm)) {
    if (m[2]) continue
    out.push(m[3])
  }
  return out
}
function resolve(from: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = path.join(path.dirname(from), spec)
  else return null
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return base + ext
  return null
}
for (const entry of ['lib/core/harbour.ts', 'lib/data/local/harbourLocal.ts']) {
  const seen = new Set<string>(); const bad: string[] = []; const stack = [path.join(ROOT, entry)]
  while (stack.length) {
    const f = stack.pop()!
    if (seen.has(f)) continue
    seen.add(f)
    if (f.endsWith('.json')) continue
    if (/^\s*['"]use server['"]/.test(fs.readFileSync(f, 'utf8'))) bad.push(`${path.relative(ROOT, f)} is a server action module`)
    for (const spec of importsOf(f)) {
      if (/supabase|^next(\/|$)|^server-only$|anthropic/.test(spec)) { bad.push(`${path.relative(ROOT, f)} imports ${spec}`); continue }
      const r = resolve(f, spec)
      if (r) stack.push(r)
    }
  }
  if (bad.length) for (const b of bad) fail(`${entry} reaches the server: ${b}`)
  else console.log(`  ${entry}: ${seen.size} modules, none of them the server`)
}

const SPECIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'fish_species.json'), 'utf8')) as SpeciesRow[]
const UID = 'local-captain'
const T0 = Date.parse('2026-09-29T09:00:00.000Z')
function freshSave(over: Record<string, unknown> = {}): LocalSave {
  return {
    uid: UID,
    profile: {
      ...structuredClone(SHIP_PROFILE_DEFAULTS), ...structuredClone(DAILY_PROFILE_DEFAULTS), ...structuredClone(PARLOR_PROFILE_DEFAULTS),
      ...structuredClone(CHARTING_PROFILE_DEFAULTS), ...structuredClone(SEA_PROFILE_DEFAULTS),
      username: 'Offline Captain', doubloons: 100_000_000, gems: 0, fishing_xp: XP_TABLE[99], expedition_xp: NAV_XP[99], is_admin: false,
      rod_tier: 0, hook_tier: 0, reel_tier: 0, fish_hold_tier: 0, unlocked_badges: [], ancient_catches: [], prestige_levels: {},
      ...over,
    },
    species: SPECIES,
    bait: {}, hold: {}, collection: {}, lifetime: {}, bests: {}, shinies: [], daily: {},
    clears: [], rods: [0], ledger: [], anomalies: [], mail: [], rapport: [], contests: {}, overrides: {},
    deals: [], market: null, crew: [], recruits: [], bunks: [], nextId: 1, voyages: [], trawls: [],
    depthBests: {}, gauntletRuns: [], bountyEvents: [], casino: freshCasino(), raidTokens: [], raidClears: [],
    bounty: null, bountyHistory: [], contestsWonAt: {}, trivia: { board: {}, capstan: {}, ladder: {} }, charting: freshCharting(),
    digs: [], discoveries: [], homestead: null,
  }
}
const isErr = (r: object) => 'error' in r

let now = T0
installRng(mulberry32(15)); installClock(() => now)

try {
  // ── 2. The tackle shop ──
  {
    const s = freshSave(); const db = localHarbourData(s)
    const bait = BAITS.find(b => b.shopCost > 0)!
    const d0 = Number(s.profile.doubloons)
    const b = await harbour.buyBait(db, UID, bait.type, 10)
    if (isErr(b) || s.bait[bait.type] !== 10 || s.profile.doubloons !== d0 - bait.shopCost * 10) fail('bait did not sell for its price')
    if (!isErr(await harbour.buyBait(db, UID, bait.type, 0)) || !isErr(await harbour.buyBait(db, UID, 'no_such_bait', 1))) fail('bad bait orders were taken')
    const notForSale = BAITS.find(x => x.shopCost <= 0)
    if (notForSale && !isErr(await harbour.buyBait(db, UID, notForSale.type, 1))) fail('bait that is not for sale sold')

    const shopRod = RODS.find(r => r.cost > 0 && !r.earnedOnly && !r.traderOnly && !isCaptainRod(r))!
    const d1 = Number(s.profile.doubloons)
    const bought = await harbour.purchaseRod(db, UID, shopRod.tier)
    if (isErr(bought) || !s.rods.includes(shopRod.tier) || s.profile.doubloons !== d1 - shopRod.cost) fail('a rod did not sell for its price')
    if (!isErr(await harbour.purchaseRod(db, UID, shopRod.tier)) || s.profile.doubloons !== d1 - shopRod.cost) fail('a rod sold twice')
    for (const bad of [RODS.find(r => r.earnedOnly), RODS.find(r => r.traderOnly), RODS.find(r => r.cost === 0)].filter(Boolean)) {
      if (!isErr(await harbour.purchaseRod(db, UID, bad!.tier))) fail(`the ${bad!.name} sold ashore`)
    }
    // Every trader's rod is also a Captain's rod, so the trader rule is tested
    // on a Captain, who would otherwise be allowed it.
    const cap = freshSave({ is_premium: true }); const trader = RODS.find(r => r.traderOnly)
    if (trader && (!isErr(await harbour.purchaseRod(localHarbourData(cap), UID, trader.tier)) || cap.rods.includes(trader.tier))) fail(`the ${trader.name} sold ashore to a Captain`)
    const captainRod = RODS.find(r => isCaptainRod(r) && r.cost > 0 && !r.traderOnly)
    if (captainRod && !isErr(await harbour.purchaseRod(db, UID, captainRod.tier))) fail('a Captain\'s rod sold to a deckhand')
    const low = freshSave({ fishing_xp: 0 })
    const gated = RODS.find(r => r.cost > 0 && !r.earnedOnly && !r.traderOnly && !isCaptainRod(r) && r.tier > shopRod.tier)
    if (gated && !isErr(await harbour.purchaseRod(localHarbourData(low), UID, gated.tier))) fail('a rod sold under its level')
    const poor = freshSave({ doubloons: 0 })
    if (!isErr(await harbour.purchaseRod(localHarbourData(poor), UID, shopRod.tier)) || poor.rods.includes(shopRod.tier)) fail('a rod sold on credit')

    // In hand, then sold: the Bamboo goes back in hand.
    if (isErr(await harbour.equipTackleRod(db, UID, shopRod.tier)) || s.profile.rod_tier !== shopRod.tier) fail('the bought rod did not go in hand')
    if (!isErr(await harbour.equipTackleRod(db, UID, gated?.tier ?? 99))) fail('a rod not owned went in hand')
    const d2 = Number(s.profile.doubloons)
    const sold = await harbour.sellRod(db, UID, shopRod.tier)
    if (isErr(sold) || s.rods.includes(shopRod.tier) || s.profile.doubloons !== d2 + Math.floor(shopRod.cost * ROD_SELL_RATE) || s.profile.rod_tier !== 0) fail('a sale did not refund its rate and put the Bamboo in hand')
    if (!isErr(await harbour.sellRod(db, UID, shopRod.tier))) fail('a rod sold back twice')
    if (!isErr(await harbour.sellRod(db, UID, 0))) fail('the free Bamboo was sold')

    // The Completionist: refused short of the record, granted on the whole of it.
    if (!isErr(await harbour.claimCompletionistRod(db, UID))) fail('the Completionist was claimed with nothing done')
    const full = freshSave({
      lifetime_species: SPECIES.map(x => x.id), ancient_catches: [143, 144, 145, 146, 147, 148],
      prestige_levels: Object.fromEntries([...new Set(SPECIES.map(x => x.habitat))].map(h => [h, 5])),
    })
    full.collection = Object.fromEntries(SPECIES.map(x => [x.id, { catch_count: 1, is_golden: null }]))
    full.rapport = FOLK.map(f => ({ folk_id: f.id, points: 9999, seen_lines: [], last_chat_on: null, gifts_given: 0, want_fish_id: null, want_asked_at: null }))
    full.discoveries = ISLES.map(i => i.id)
    const c = await harbour.claimCompletionistRod(localHarbourData(full), UID)
    if (isErr(c) || !full.rods.includes(14) || !(full.profile.unlocked_badges as string[]).includes('completionist_rod')) fail(`the Completionist was refused on a full record${isErr(c) ? `: ${(c as { error: string }).error}` : ''}`)
    if (!isErr(await harbour.claimCompletionistRod(localHarbourData(full), UID))) fail('the Completionist was claimed twice')
    console.log(`  the tackle shop: bait, a rod bought and sold back once (${Math.round(ROD_SELL_RATE * 100)}%), the forbidden rods refused, the Completionist on a full record`)
  }

  // ── 3. The ladders ──
  {
    const s = freshSave(); const db = localHarbourData(s)
    const climb = async (label: string, buy: () => Promise<object>, col: string, top: number, cost: (tier: number) => number) => {
      for (let t = Number(s.profile[col] ?? 0); t < top; t++) {
        const d = Number(s.profile.doubloons)
        const r = await buy()
        if (isErr(r) || s.profile[col] !== t + 1 || s.profile.doubloons !== d - cost(t + 1)) { fail(`${label} ${t + 1} did not climb for its price`); return }
      }
      const d = Number(s.profile.doubloons)
      if (!isErr(await buy()) || s.profile.doubloons !== d) fail(`${label} climbed past its top`)
    }
    await climb('the reel', () => harbour.buyReel(db, UID), 'reel_tier', REELS.length - 1, t => REELS[t].cost)
    await climb('the hook', () => harbour.buyHook(db, UID), 'hook_tier', HOOKS.length - 1, t => HOOKS[t].cost)
    await climb('the hold', () => harbour.upgradeFishHold(db, UID), 'fish_hold_tier', FISH_HOLD_TIERS.length - 1, t => FISH_HOLD_TIERS[t].cost)
    s.profile.ship_tier = MIN_SHIP_TIER
    let hulls = 0
    for (let n = nextShip(Number(s.profile.ship_tier)); n; n = nextShip(Number(s.profile.ship_tier))) {
      const d = Number(s.profile.doubloons)
      const r = await harbour.buyShip(db, UID)
      if (isErr(r) || s.profile.doubloons !== d - n.cost) { fail(`the ${n.name} did not sell for its price`); break }
      hulls++
    }
    if (!isErr(await harbour.buyShip(db, UID))) fail('a hull past the top sold')
    const poor = freshSave({ doubloons: 0 }); const pdb = localHarbourData(poor)
    if (!isErr(await harbour.buyReel(pdb, UID)) || !isErr(await harbour.buyHook(pdb, UID)) || !isErr(await harbour.upgradeFishHold(pdb, UID)) || !isErr(await harbour.buyShip(pdb, UID))) fail('a rung sold on credit')
    if (poor.profile.reel_tier !== 0 || poor.profile.hook_tier !== 0 || poor.profile.fish_hold_tier !== 0) fail('a rung moved without pay')
    const green = freshSave({ fishing_xp: 0, expedition_xp: 0, ship_tier: MIN_SHIP_TIER }); const gdb = localHarbourData(green)
    if (!isErr(await harbour.buyShip(gdb, UID))) fail('a hull sold under its Nav level')
    if (isErr(await harbour.renameShip(db, UID, '  The Salty Dog  ')) || s.profile.ship_name !== 'The Salty Dog') fail('the ship was not renamed (trimmed)')
    if (!isErr(await harbour.renameShip(db, UID, '   '))) fail('a blank name was taken')
    console.log(`  the ladders: ${REELS.length - 1} reels, ${HOOKS.length - 1} hooks, ${FISH_HOLD_TIERS.length - 1} holds and ${hulls} hulls climbed for their price to the top, never on credit or under a gate`)
  }

  // ── 4. The Almanac ──
  {
    now = T0
    const s = freshSave(); const db = localHarbourData(s)
    const [a, b] = SPECIES
    s.lifetime[a.id] = { n: 5, last: '2026-09-20T00:00:00.000Z', first: '2026-09-01T00:00:00.000Z' }
    s.collection[a.id] = { catch_count: 2, is_golden: true, last_caught_at: '2026-09-20T00:00:00.000Z' }
    s.profile.ancient_catches = [143]
    s.shinies = [
      { id: 1, fish_id: a.id, size_in: 10, status: 'hold', caught_at: '2026-09-02T00:00:00.000Z' },
      { id: 2, fish_id: a.id, size_in: 12, status: 'sold', caught_at: '2026-09-10T00:00:00.000Z', sold_for: 500 },
    ]
    s.bests[a.id] = { len: 12.5, at: '2026-09-10T00:00:00.000Z' }
    const book = await harbour.getAlmanacData(db, UID)
    if (isErr(book)) { fail('the Almanac did not open') } else {
      const ea = book.entries.find(e => e.id === a.id)!, eb = book.entries.find(e => e.id === b.id)!, anc = book.entries.find(e => e.id === 143)!
      if (book.entries.length !== SPECIES.length || ea.count !== 5 || ea.cycleCount !== 2 || !ea.everGolden || ea.pbLength !== 12.5) fail('a species\' lifetime record read wrong')
      if (ea.firstCaughtAt !== '2026-09-01T00:00:00.000Z' || !ea.isNew || book.newCount !== 1) fail('first-caught and the NEW mark read wrong')
      if (eb.count !== 0 || eb.everCaught) fail('an uncaught species read as caught')
      if (anc && (anc.count !== 1 || !anc.everCaught)) fail('an Ancient Deep trophy was not floored at one')
      if (book.goldens.length !== 2 || book.goldens[0].id !== 2 || book.goldens[0].soldFor !== 500) fail('the goldens were not newest first')
      if (book.vigilUnlocked) fail('the Vigil opened before the finale')
    }
    now += 1000
    await harbour.markAlmanacViewed(db, UID)
    const again = await harbour.getAlmanacData(db, UID)
    if (isErr(again) || (again as { newCount: number }).newCount !== 0) fail('reading the book did not clear the NEW marks')
    s.clears = ['the_sunken_hand']
    const vig = await harbour.getAlmanacData(db, UID)
    if (isErr(vig) || !(vig as { vigilUnlocked: boolean }).vigilUnlocked) fail('the finale did not open the Vigil')
    const held = freshSave(); held.hold = { [a.id]: 3, [b.id]: 1 }
    const hc = await harbour.holdContents(localHarbourData(held), UID)
    if (isErr(hc) || (hc as { rows: unknown[] }).rows.length !== 2) fail('the hold\'s contents read wrong')
    console.log('  the Almanac: lifetime counts, the ancient floor, first-caught and NEW (cleared once read), goldens newest first, the Vigil after the finale')
  }

  // ── 5. The Shipyard's state, the ship screen ──
  {
    const s = freshSave({ ship_tier: 6, has_sixth_berth: true }); const db = localHarbourData(s)
    s.bait = { worm: 12 }
    const st = await harbour.shipyardState(db, UID)
    if (isErr(st) || !(st as { ownedRods: number[] }).ownedRods.includes(0) || (st as { baitInventory: unknown[] }).baitInventory.length !== 1) fail('the Shipyard\'s state did not read the save')
    s.clears = ['the_quartermaster', 'the_blockade']
    const props = await harbour.shipHeroProps(db, await harbour.shipHeroPieces(db, UID))
    if (!props.chapter3Cleared || !props.blockadeCleared || props.throneCleared || !props.hasSixthBerth || props.shipStats.crewSlots < 2) fail('the ship screen\'s props did not read the save')
    console.log('  the Shipyard\'s state and the ship screen\'s props read the save')
  }

  // ── 6. The store's own guards ──
  {
    const s = freshSave(); const db = localHarbourData(s)
    if (!(await db.addRod(UID, 40)) || await db.addRod(UID, 40)) fail('a rod was added twice')
    if (!(await db.takeRod(UID, 40)) || await db.takeRod(UID, 40)) fail('a rod was taken twice')
    console.log('  the store: a rod added once and taken once')
  }
} finally {
  installRng(null); installClock(null)
}

console.log(`\n  Offline harbour: no server on the path, the tackle shop, the ladders, the Almanac, the Shipyard and the ship screen ${failed ? `${failed} FAILED` : 'ok'}.`)
process.exit(failed ? 1 : 0)
