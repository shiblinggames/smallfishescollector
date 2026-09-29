// THE CREW HALL, OFFLINE (Steam prep, 2026-09-29).
//
// Runs the REAL crew paths (lib/core/crew) against a LOCAL save
// (lib/data/local/crewLocal), with no network:
//   1. the import trees of the core and the local store hold nothing of the
//      server;
//   2. the board: filled once a day, a candidate taken once, a full roster
//      hands it back, a paid reroll charges once and spends the gifted
//      legendary once, the blood gamble and its badge;
//   3. the roster and the seats: assign, the slot bump, one track at a time,
//      the berth count, promote, clear, bench, rename once, dismiss, crew the
//      deck; the fallen leave the roster for the graveyard;
//   4. the hall: its upgrade, bunks (seated hands refused, a bunk taken once,
//      nothing paid mid-stint, the stint's XP paid once, a bunked hand locked),
//      the Leviathan re-cut offered and answered once, drills and stores;
//   5. skins bought once for a legendary you have, equipped and taken off;
//      promotions celebrated once;
//   6. the save file: version 2 upgrades to 3 with the hall's defaults, the
//      crew survive a round trip, and a web export's crew convert.
//
//   npx tsx scripts/check-offline-crew.mts

import fs from 'fs'
import path from 'path'
import * as crew from '../lib/core/crew'
import { localCrewData } from '../lib/data/local/crewLocal'
import type { LocalSave } from '../lib/data/local/save'
import { deserializeSave, serializeSave, fromWebExport, LOCAL_SAVE_FORMAT } from '../lib/data/local/saveFile'
import type { SpeciesRow } from '../lib/data/fishingData'
import { freshCasino } from '../lib/data/local/save'
import { installRng, mulberry32 } from '../lib/rng'
import { installClock } from '../lib/clock'
import { XP_TABLE as NAV_XP } from '../lib/expeditionLevel'
import { XP_TABLE as CREW_XP } from '../lib/crewLevel'
import { crewCapacity } from '../lib/crewCapacity'
import { DAILY_RECRUITS } from '../lib/crewGen'
import { bunkRatePerHour, storesCapHours, stintXP, nextDrillCost, nextStoresCost, LEVIATHAN_SLOT } from '../lib/crewBunks'
import { nextHallTier } from '../lib/crewHall'
import { BLOOD_SKIN_GAMBLE_COST } from '../lib/gauntlet'
import { CREW_SKINS } from '../lib/crewSkins'
import { EXPEDITION_SHIP_STATS } from '../lib/expeditions'
import cards from '../content/cards.json'

let failed = 0
const fail = (m: string) => { failed++; console.log('  FAIL ' + m) }
const ROOT = process.cwd()
const HOUR = 3_600_000

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
for (const entry of ['lib/core/crew.ts', 'lib/data/local/crewLocal.ts']) {
  const seen = new Set<string>(); const bad: string[] = []; const stack = [path.join(ROOT, entry)]
  while (stack.length) {
    const f = stack.pop()!
    if (seen.has(f)) continue
    seen.add(f)
    if (f.endsWith('.json')) continue
    if (/^\s*['"]use server['"]/.test(fs.readFileSync(f, 'utf8'))) bad.push(`${path.relative(ROOT, f)} is a server action module`)
    for (const spec of importsOf(f)) {
      if (/supabase|^next(\/|$)|^server-only$/.test(spec)) { bad.push(`${path.relative(ROOT, f)} imports ${spec}`); continue }
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
      doubloons: 5_000_000, gems: 10_000, blood_gems: 1_000, expedition_xp: NAV_XP[29], ship_tier: 6, ship_classes: null,
      has_sixth_berth: false, crew_hall_tier: 1, crew_drill_level: 1, crew_stores_level: 1, last_free_recruit_date: null,
      legendary_unlocks: [], crew_next_roll_legendary: false, crew_next_roll_legendary_slug: null, owned_crew_skins: [],
      equipped_crew_skins: {}, unlocked_badges: [], badge_unlocked_at: null, is_admin: false, is_premium: false,
      premium_expires_at: null, gauntlet_deepest: 0, raid_node_progress: null, gauntlet_run_open: false, seen_promotions: null,
      ...over,
    },
    species: SPECIES,
    bait: {}, hold: {}, collection: {}, lifetime: {}, bests: {}, shinies: [], daily: {},
    clears: [], rods: [0], ledger: [], anomalies: [], mail: [], rapport: [], contests: {}, overrides: {},
    deals: [], market: null, crew: [], recruits: [], bunks: [], nextId: 1, voyages: [], trawls: [], depthBests: {}, gauntletRuns: [], bountyEvents: [], casino: freshCasino(), raidTokens: [], raidClears: [],
  }
}
/** Sign a hand straight into the save (for the parts that need a particular one). */
function sign(s: LocalSave, cardId: number, rarity = 1, xp = 0) {
  const id = s.nextId++
  s.crew.push({ id, card_id: cardId, rarity, power: 3, dodge: 3, fortune: 3, effects: [], pending_trait: null, voyage_slot: null, raid_slot: null,
    xp, nickname: null, recruited_at: new Date(T0 + id).toISOString(), died_at: null, died_on_voyage_id: null, died_hardcore_depth: null })
  return id
}
const ok = <T,>(r: T | { error: string }, what: string): T | null => {
  if (r && typeof r === 'object' && 'error' in r) { fail(`${what}: ${(r as { error: string }).error}`); return null }
  return r as T
}

let now = T0
installRng(mulberry32(42)); installClock(() => now)
try {
  // ── 2. The board ──
  {
    const s = freshSave({ expedition_xp: 0 }); const db = localCrewData(s)
    const st = await crew.getCrewState(db, UID)
    if (!st || st.board.length !== DAILY_RECRUITS || s.profile.last_free_recruit_date !== '2026-09-29') fail('the free board was not rolled for the day')
    const again = await crew.getCrewState(db, UID)
    if (JSON.stringify(again!.board.map(b => b.id)) !== JSON.stringify(st!.board.map(b => b.id))) fail('a second look re-rolled the free board')
    const first = st!.board[0].id
    const r = ok(await crew.recruitCrew(db, UID, first), 'recruiting from the board')
    if (r && (r.state.roster.length !== 1 || !r.state.board.find(b => b.id === first)!.recruited)) fail('a recruit did not join the roster')
    if (!('error' in (await crew.recruitCrew(db, UID, first)))) fail('a candidate was recruited twice')
    if (!('error' in (await crew.recruitCrew(db, UID, 9999)))) fail('a made-up candidate was recruited')
    if (s.profile.lifetime_recruits !== 1) fail('the lifetime recruit counter did not move')
    // Fill to capacity, then the next candidate is handed back.
    const cap = crewCapacity(1, 1)
    while (s.crew.length < cap) sign(s, 1 + s.crew.length)
    const full = await crew.recruitCrew(db, UID, st!.board[1].id)
    if (!('error' in full) || s.recruits.find(b => b.id === st!.board[1].id)!.recruited) fail('a full roster kept the candidate')
    // The next day, a new board.
    now += 24 * HOUR
    const tomorrow = await crew.getCrewState(db, UID)
    if (tomorrow!.board.some(b => st!.board.some(o => o.id === b.id))) fail('the board did not refresh the next day')
    now = T0
  }
  // The paid reroll, the gift, the blood gamble.
  {
    const legend = (cards as { slug: string; tier: number }[]).find(c => c.tier === 4)
    const s = freshSave({ crew_next_roll_legendary: true, legendary_unlocks: legend ? [legend.slug.toLowerCase()] : [] }); const db = localCrewData(s)
    await crew.getCrewState(db, UID)
    const r = ok(await crew.rerollBoard(db, UID), 'a gem reroll')
    if (r && (s.profile.gems !== 10_000 - crew.REROLL_COST || r.state.board.length !== 3 || r.state.board.some(b => b.source !== 'gem'))) fail('a reroll did not charge once and lay three gem rows')
    if (s.profile.crew_next_roll_legendary !== false) fail('the gifted legendary was not spent')
    await crew.rerollBoard(db, UID)
    if (s.profile.gems !== 10_000 - 2 * crew.REROLL_COST) fail('a second reroll was not charged')
    s.profile.gems = 50
    if (!('error' in (await crew.rerollBoard(db, UID))) || s.profile.gems !== 50) fail('a reroll went through without the gems')
    s.profile.gems = 10_000
    if (!('error' in (await crew.rerollBoard(db, UID, 'not-a-tier')))) fail('a made-up blood tier was accepted')
    const g = ok(await crew.gambleBloodSkin(db, UID), 'the blood gamble')
    if (g && (s.profile.blood_gems !== 1_000 - BLOOD_SKIN_GAMBLE_COST || !(s.profile.owned_crew_skins as string[]).includes(g.skinId))) fail('the blood gamble did not charge once and grant the skin')
    if (!(s.profile.unlocked_badges as string[]).includes('crimson_fortune') || !s.profile.badge_unlocked_at?.crimson_fortune) fail('Crimson Fortune was not granted and dated')
  }

  // ── 3. The roster and the seats ──
  {
    const s = freshSave(); const db = localCrewData(s)
    const berths = EXPEDITION_SHIP_STATS[6].crewSlots
    const a = sign(s, 1, 2), b = sign(s, 2, 3), c = sign(s, 3, 1), twin = sign(s, 1, 1)
    ok(await crew.assignToRaid(db, UID, a, 0), 'seating a hand')
    ok(await crew.assignToRaid(db, UID, b, 0), 'seating a second hand in the same seat')
    const row = (id: number) => s.crew.find(x => x.id === id)!
    if (row(a).raid_slot !== null || row(b).raid_slot !== 0) fail('the seat did not bump its holder')
    ok(await crew.assignToRaid(db, UID, a, 1), 'seating in the next seat')
    ok(await crew.assignToRaid(db, UID, twin, 2), 'seating a second of the same fish')
    if (row(a).raid_slot !== null || row(twin).raid_slot !== 2) fail('two of one fish sat on one track')
    ok(await crew.assignToVoyage(db, UID, twin, 0), 'moving a hand to the other track')
    if (row(twin).raid_slot !== null || row(twin).voyage_slot !== 0) fail('a hand sat on both tracks')
    if (!('error' in (await crew.assignToRaid(db, UID, c, berths)))) fail('a seat past the berths was allowed')
    ok(await crew.assignToRaid(db, UID, c, 1), 'seating a third hand')
    ok(await crew.promoteToCaptain(db, UID, c), 'promoting to captain')
    if (row(c).raid_slot !== 0 || row(b).raid_slot !== 1) fail('promotion did not swap with the captain')
    s.profile.gauntlet_run_open = true
    if (!('error' in (await crew.clearParty(db, UID, 'raid')))) fail('the raid party was cleared during a gauntlet run')
    s.profile.gauntlet_run_open = false
    ok(await crew.clearParty(db, UID, 'raid'), 'clearing the raid party')
    if (s.crew.some(x => x.raid_slot != null) || row(twin).voyage_slot !== 0) fail('clearing the raid party touched the wrong seats')
    ok(await crew.benchCrew(db, UID, twin), 'benching')
    if (row(twin).voyage_slot !== null) fail('a benched hand kept a seat')
    if (!('error' in (await crew.renameCrew(db, UID, a, '   ')))) fail('an empty name was accepted')
    if (!('error' in (await crew.renameCrew(db, UID, a, 'x'.repeat(31))))) fail('a 31-letter name was accepted')
    ok(await crew.renameCrew(db, UID, a, '  Old Salt '), 'naming a hand')
    if (row(a).nickname !== 'Old Salt' || !('error' in (await crew.renameCrew(db, UID, a, 'Again')))) fail('a hand was not named exactly once')
    const deck = ok(await crew.crewTheDeck(db, UID), 'crewing the deck')
    const seated = s.crew.filter(x => x.raid_slot != null)
    if (deck && (seated.length !== deck.assigned || new Set(seated.map(x => x.card_id)).size !== seated.length || !seated.some(x => x.id === b))) fail('crew the deck did not seat the best, one of each fish')
    ok(await crew.dismissCrew(db, UID, twin), 'dismissing')
    if (s.crew.some(x => x.id === twin)) fail('a dismissed hand stayed')
    // The fallen leave the roster for the graveyard.
    await db.markFallen(UID, [c], 7, new Date(now).toISOString())
    const roster = await crew.getCrewRoster(db, UID)
    const grave = await crew.getCrewGraveyard(db, UID)
    if (roster.some(x => x.id === c) || grave[0]?.id !== c || grave[0].voyageSlot !== null) fail('a fallen hand did not move to the graveyard')
    if (!('error' in (await crew.assignToRaid(db, UID, c, 0)))) fail('a fallen hand was seated')
  }

  // ── 4. The hall ──
  {
    const s = freshSave({ doubloons: 20_000 }); const db = localCrewData(s)
    const next = nextHallTier(1)!
    s.profile.expedition_xp = 0
    if (!('error' in (await crew.upgradeCrewHall(db, UID))) || s.profile.crew_hall_tier !== 1) fail('the hall was upgraded without the Navigation')
    s.profile.expedition_xp = NAV_XP[29]
    ok(await crew.upgradeCrewHall(db, UID), 'upgrading the hall')
    if (s.profile.crew_hall_tier !== 2 || s.profile.doubloons !== 20_000 - next.cost) fail('the hall upgrade did not charge once and step once')

    const h = sign(s, 5, 2), seated = sign(s, 6, 2)
    await crew.assignToRaid(db, UID, seated, 0)
    if (!('error' in (await crew.bunkCrew(db, UID, seated, 0)))) fail('a seated hand took a bunk')
    ok(await crew.bunkCrew(db, UID, h, 0), 'bunking a hand')
    if (!('error' in (await crew.bunkCrew(db, UID, h, 1)))) fail('one hand took two bunks')
    const other = sign(s, 7, 1)
    if (!('error' in (await crew.bunkCrew(db, UID, other, 0)))) fail('two hands took one bunk')
    if (!('error' in (await crew.assignToRaid(db, UID, h, 1)))) fail('a hand mid-stint was seated')
    const early = ok(await crew.collectBunk(db, UID, h), 'an early collect')
    if (early && (early.freed.length || early.grants.length)) fail('a stint paid before it finished')
    const cap = storesCapHours(1), rate = bunkRatePerHour(1)
    now += cap * HOUR + 1000
    const xp0 = s.crew.find(x => x.id === h)!.xp
    const done = ok(await crew.collectBunk(db, UID, h), 'collecting a stint')
    if (done && (done.freed[0] !== h || s.crew.find(x => x.id === h)!.xp !== xp0 + stintXP(rate, cap) || done.grants[0]?.newXP !== xp0 + stintXP(rate, cap))) fail('a finished stint did not pay its XP')
    const twice = ok(await crew.collectBunk(db, UID, h), 'collecting twice')
    if (twice && (twice.freed.length || s.crew.find(x => x.id === h)!.xp !== xp0 + stintXP(rate, cap))) fail('a stint paid twice')
    if ('error' in (await crew.assignToRaid(db, UID, h, 1))) fail('a collected hand was still locked')

    // Drills and stores: gated on the hall, charged once.
    const d0 = Number(s.profile.doubloons)
    s.profile.doubloons = d0 + nextDrillCost(1) + nextStoresCost(1)
    ok(await crew.buyHallUpgrade(db, UID, 'drill'), 'buying a drill')
    ok(await crew.buyHallUpgrade(db, UID, 'stores'), 'buying stores')
    if (s.profile.crew_drill_level !== 2 || s.profile.crew_stores_level !== 2 || s.profile.doubloons !== d0) fail('drills and stores did not each step once at their price')
    if (!('error' in (await crew.buyHallUpgrade(db, UID, 'drill'))) || s.profile.crew_drill_level !== 2) fail('a drill was bought past what the hall allows')
    now = T0
  }
  // The Leviathan bunk: a trait offered, answered once.
  {
    const s = freshSave({ crew_hall_tier: 6 }); const db = localCrewData(s)
    const h = sign(s, 8, 3, CREW_XP[99])
    ok(await crew.bunkCrew(db, UID, h, LEVIATHAN_SLOT, 1), 'bunking a maxed hand in the Leviathan bunk')
    now += HOUR + 1000
    const got = ok(await crew.collectBunk(db, UID, h), 'collecting the Leviathan stint')
    const pending = s.crew.find(x => x.id === h)!.pending_trait
    if (got && (!pending || got.upgrades.length !== 1 || got.grants.length)) fail('the Leviathan bunk did not offer a re-cut (or paid XP to a maxed hand)')
    if (!('error' in (await crew.bunkCrew(db, UID, h, LEVIATHAN_SLOT, 1)))) fail('a hand holding an offer went back down')
    ok(await crew.resolveTraitOffer(db, UID, h, true), 'taking the re-cut')
    const c = s.crew.find(x => x.id === h)!
    if (c.pending_trait !== null || (pending !== 'n' && c.effects[0] !== pending && c.effects.length !== 0)) fail('taking the offer did not write the trait')
    if (!('error' in (await crew.resolveTraitOffer(db, UID, h, true)))) fail('an offer was answered twice')
    now = T0
  }

  // ── 5. Skins and promotions ──
  {
    const skin = CREW_SKINS[0]
    const card = (cards as { id: number; slug: string }[]).find(c => c.slug.toLowerCase() === skin.slug)!
    const s = freshSave(); const db = localCrewData(s)
    if (!('error' in (await crew.buyCrewSkin(db, UID, skin.id)))) fail('a skin was sold for a crew never recruited')
    sign(s, card.id, 4)
    ok(await crew.buyCrewSkin(db, UID, skin.id), 'buying a skin')
    if (s.profile.gems !== 10_000 - skin.gemCost || s.profile.equipped_crew_skins[skin.slug] !== skin.id) fail('a skin was not charged once and worn')
    if (!('error' in (await crew.buyCrewSkin(db, UID, skin.id))) || s.profile.gems !== 10_000 - skin.gemCost) fail('a skin was sold twice')
    ok(await crew.equipCrewSkin(db, UID, skin.slug, null), 'taking a skin off')
    if (skin.slug in s.profile.equipped_crew_skins) fail('a skin would not come off')
    if (!('error' in (await crew.equipCrewSkin(db, UID, skin.slug, 'not_a_skin')))) fail('a made-up skin was worn')

    const p = freshSave(); const pdb = localCrewData(p)
    const vet = sign(p, 1, 2, CREW_XP[30])
    if ((await crew.checkPromotions(pdb, UID)).length !== 0 || !(p.profile.seen_promotions as string[]).includes(`${vet}:10`)) fail('an old account was handed its old promotions')
    const rookie = sign(p, 2, 1, 0)
    await pdb.grantXpToIds(UID, [rookie], CREW_XP[9])
    const promos = await crew.checkPromotions(pdb, UID)
    if (promos.length !== 1 || promos[0].crewId !== rookie || promos[0].level !== 10) fail(`a promotion to level 10 was not celebrated (${promos.map(x => x.key).join()})`)
    if ((await crew.checkPromotions(pdb, UID)).length !== 0) fail('a promotion was celebrated twice')
  }
  console.log('  the Crew Hall on a local save: the board, the roster and seats, the hall and its bunks, the Leviathan offer, skins and promotions: each paid once, every guard held')
} finally {
  installRng(null); installClock(null)
}

// ── 6. The save file ──
{
  const s = freshSave()
  const v3 = JSON.parse(serializeSave(s))
  const { crew: _c, recruits: _r, bunks: _b, nextId: _n, ...v2save } = v3.save
  void _c; void _r; void _b; void _n
  delete v2save.profile.crew_hall_tier; delete v2save.profile.crew_drill_level
  const up = deserializeSave(JSON.stringify({ format: LOCAL_SAVE_FORMAT, version: 2, savedAt: '', save: v2save, carried: {} }), SPECIES).save
  if (!Array.isArray(up.crew) || up.nextId !== 1 || up.profile.crew_hall_tier !== 1 || up.profile.crew_drill_level !== 1) fail('a version 2 save did not upgrade to version 3 with the hall\'s defaults')
  const id = sign(s, 3, 2, 500)
  s.bunks.push({ id: s.nextId++, crew_id: id, since: new Date(T0).toISOString(), rate_per_hour: 10, cap_hours: 2, slot: 0 })
  const back = deserializeSave(serializeSave(s), SPECIES).save
  if (back.crew[0]?.xp !== 500 || back.bunks.length !== 1 || back.nextId !== s.nextId) fail('the crew did not survive the save file')
  const { save } = fromWebExport({
    format: 'x', version: 1, userId: 'w', username: null, profile: {},
    tables: {
      user_crew: [{ id: 40, card_id: 2, rarity: 3, power: 5, dodge: 4, fortune: 3, effects: ['s:1,0,0'], xp: 900, voyage_slot: null, raid_slot: 1, recruited_at: '2026-09-01T00:00:00Z', died_at: null }],
      daily_recruits: [{ id: 77, slot: 0, source: 'free', card_id: 5, rarity: 1, power: 1, dodge: 1, fortune: 1, effects: [], recruited: false, start_xp: 0 }],
      crew_hall_bunks: [{ id: 12, crew_id: 40, since: '2026-09-02T00:00:00Z', rate_per_hour: 40, cap_hours: 8, slot: 0 }],
    },
  }, SPECIES)
  if (save.crew[0]?.raid_slot !== 1 || save.recruits[0]?.id !== 77 || save.bunks[0]?.crew_id !== 40 || save.nextId !== 78) fail('a web export\'s crew did not convert (or the id counter could collide)')
}

console.log(`\n  Offline crew: no server on the path, the board, the seats, the hall, bunks, skins, promotions, save v3 ${failed ? `${failed} FAILED` : 'ok'}.`)
if (failed) process.exit(1)
