// VOYAGES AND TRAWLS, OFFLINE (Steam prep, 2026-09-29).
//
// Runs the REAL voyage and trawl paths (lib/core/voyages) against a LOCAL save
// (lib/data/local/voyageLocal), with no network:
//   1. the import trees of the core and the local store hold nothing of the
//      server;
//   2. the daily voyage: the crew minimum and route gates, one ship at sea, the
//      party locked while it sails, nothing paid before it is back, the haul
//      paid exactly once (coin, gems, Navigation XP, crew XP to survivors, the
//      fallen to the graveyard with their route), the board's history;
//   3. trawls: the docks, a send (one per zone, one per hand, the party seat
//      given up), the hand locked, nothing paid before it is back, the haul
//      paid once;
//   4. the crew's roll call says where everybody is;
//   5. the save file: version 3 upgrades to 4, and a web export's voyages and
//      trawls convert.
//
//   npx tsx scripts/check-offline-voyages.mts

import fs from 'fs'
import path from 'path'
import * as voy from '../lib/core/voyages'
import * as crew from '../lib/core/crew'
import { localVoyageData } from '../lib/data/local/voyageLocal'
import type { LocalSave } from '../lib/data/local/save'
import { deserializeSave, serializeSave, fromWebExport, LOCAL_SAVE_FORMAT } from '../lib/data/local/saveFile'
import type { SpeciesRow } from '../lib/data/fishingData'
import { freshCasino } from '../lib/data/local/save'
import { installRng, mulberry32 } from '../lib/rng'
import { installClock } from '../lib/clock'
import { XP_TABLE as NAV_XP } from '../lib/expeditionLevel'
import { XP_TABLE as FISH_XP } from '../lib/fishingLevel'
import { trawlDurationMs } from '../app/(app)/fishing/trawls/constants'

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
for (const entry of ['lib/core/voyages.ts', 'lib/data/local/voyageLocal.ts']) {
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
      doubloons: 1000, gems: 0, expedition_xp: NAV_XP[29], fishing_xp: FISH_XP[39], ship_tier: 6, ship_classes: null, has_sixth_berth: false,
      gauntlet_upgrades: [], dons_gauntlet_upgrades: [], crew_hall_tier: 3, crew_drill_level: 1, crew_stores_level: 1,
      unlocked_character_colors: [], unlocked_badges: [], has_tide_turner: false, has_phantom_hook: false, has_perfected_sigil: false,
      equipped_raid_items: [], has_ancient_deep_access: false, is_admin: false, is_premium: false, premium_expires_at: null,
      gauntlet_run_open: false, last_free_recruit_date: null,
      ...over,
    },
    species: SPECIES,
    bait: {}, hold: {}, collection: {}, lifetime: {}, bests: {}, shinies: [], daily: {},
    clears: [], rods: [0], ledger: [], anomalies: [], mail: [], rapport: [], contests: {}, overrides: {},
    deals: [], market: null, crew: [], recruits: [], bunks: [], nextId: 1, voyages: [], trawls: [], depthBests: {}, gauntletRuns: [], bountyEvents: [], casino: freshCasino(), raidTokens: [], raidClears: [], bounty: null, bountyHistory: [], contestsWonAt: {}, trivia: { board: {}, capstan: {}, ladder: {} }, charting: { boards: { match: {}, minefield: {}, sudoku: {}, rigging: {} }, match: {}, minefield: {}, rigging: {}, hold: {} }, digs: [], discoveries: [], homestead: null,
  }
}
function sign(s: LocalSave, cardId: number, seat: { voyage?: number; raid?: number } = {}, xp = 0) {
  const id = s.nextId++
  s.crew.push({ id, card_id: cardId, rarity: 2, power: 5, dodge: 5, fortune: 5, effects: [], pending_trait: null,
    voyage_slot: seat.voyage ?? null, raid_slot: seat.raid ?? null, xp, nickname: null,
    recruited_at: new Date(T0 + id).toISOString(), died_at: null, died_on_voyage_id: null, died_hardcore_depth: null })
  return id
}

let now = T0
installRng(mulberry32(9)); installClock(() => now)
try {
  // ── 2. The daily voyage ──
  {
    const s = freshSave(); const db = localVoyageData(s)
    if (!('error' in (await voy.sendDailyVoyage(db, UID, 'open')))) fail('a voyage sailed with nobody aboard')
    const a = sign(s, 1, { voyage: 0 }), b = sign(s, 2, { voyage: 1 }), c = sign(s, 3, { voyage: 2 }), idle = sign(s, 4)
    if (!('error' in (await voy.sendDailyVoyage(db, UID, 'not_a_route' as 'open')))) fail('a made-up route was sailed')
    const low = freshSave({ ship_tier: 0 }); sign(low, 1, { voyage: 0 }); sign(low, 2, { voyage: 1 })
    if (!('error' in (await voy.sendDailyVoyage(localVoyageData(low), UID, 'open')))) fail('the Crossing was sailed without the ship for it')

    const sent = await voy.sendDailyVoyage(db, UID, 'open')
    if ('error' in sent) { fail(`the voyage would not sail: ${sent.error}`) }
    else {
      const v = sent.voyage
      if (v.status !== 'pending' || v.crew_variant_ids.join() !== [a, b, c].join()) fail('the voyage did not carry the voyage party')
      if (!('error' in (await voy.sendDailyVoyage(db, UID, 'open')))) fail('a second ship went to sea')
      // The party is locked while it sails; a hand not aboard is free.
      if (!('error' in (await crew.assignToRaid(db, UID, a, 0)))) fail('a hand at sea was reseated')
      if (!('error' in (await crew.clearParty(db, UID, 'voyage')))) fail('the voyage party was broken up at sea')
      if ('error' in (await crew.assignToRaid(db, UID, idle, 0))) fail('a hand ashore was locked by the voyage')
      const st = await voy.getDailyVoyageState(db, UID)
      if (st.todayVoyage?.id !== v.id || st.readyVoyage) fail('an outbound voyage read as back')
      if (!('error' in (await voy.revealVoyageResults(db, UID, v.id)).result)) fail('a voyage paid before it came back')

      now += (v.duration_ms ?? 0) + 1000
      const back = await voy.getDailyVoyageState(db, UID)
      if (back.readyVoyage?.id !== v.id || back.todayVoyage) fail('a returned voyage did not read as ready')
      const d0 = Number(s.profile.doubloons), g0 = Number(s.profile.gems), x0 = Number(s.profile.expedition_xp)
      const crewXp0 = new Map(s.crew.map(m => [m.id, m.xp]))
      const { result: r, log } = await voy.revealVoyageResults(db, UID, v.id)
      if ('error' in r) fail(`the reveal failed: ${r.error}`)
      else {
        if (s.profile.doubloons !== d0 + v.total_doubloons || s.profile.gems !== g0 + v.total_gems) fail('the haul was not paid as written')
        if (s.profile.expedition_xp !== x0 + r.xpEarned || r.newExpeditionXP !== x0 + r.xpEarned) fail('the Navigation XP was not paid as reported')
        for (const id of v.crew_variant_ids) {
          const m = s.crew.find(x => x.id === id)!
          const lost = v.crew_lost.includes(id)
          if (lost && (m.died_at == null || m.died_on_voyage_id !== v.id)) fail(`hand ${id} was lost but not laid to rest`)
          if (!lost && m.xp !== crewXp0.get(id)! + (r.crewXP.find(g => g.id === id)?.newXP ?? m.xp) - (r.crewXP.find(g => g.id === id)?.oldXP ?? m.xp)) fail(`survivor ${id}'s XP does not match the grant`)
          if (lost && r.crewXP.some(g => g.id === id)) fail(`lost hand ${id} was paid crew XP`)
        }
        if (!log || log.voyageId !== v.id || log.crew.length !== v.crew_variant_ids.length) fail('the Captain\'s Log was not handed what it needs')
        if (!('error' in (await voy.revealVoyageResults(db, UID, v.id)).result) || s.profile.doubloons !== d0 + v.total_doubloons) fail('a voyage paid twice')
        if (v.crew_lost.length) {
          const grave = await crew.getCrewGraveyard(db, UID)
          if (grave[0]?.diedOnRoute !== 'open') fail('the fallen do not remember the route they fell on')
        }
        const board = await voy.voyageBoard(db, UID)
        if (board.voyages[0]?.id !== v.id || board.todayVoyage || board.readyVoyage) fail('the voyage board did not show the voyage in its history')
        // Back in port, the party is free again.
        if ('error' in (await crew.clearParty(db, UID, 'voyage'))) fail('the party stayed locked after the reveal')
        console.log(`  a voyage offline: ${v.events.length} events, ${v.total_doubloons} doubloons, ${v.crew_lost.length} lost, ${r.xpEarned} Navigation XP, paid once`)
      }
    }
  }

  // A voyage that loses a hand: the loss is decided at the launch, so it is
  // written into the voyage before the reveal to be sure the path runs.
  {
    const s = freshSave(); const db = localVoyageData(s)
    const a = sign(s, 1, { voyage: 0 }), b = sign(s, 2, { voyage: 1 })
    const sent = await voy.sendDailyVoyage(db, UID, 'open')
    if ('error' in sent) fail(sent.error)
    else {
      s.voyages[0].crew_lost = [b]
      now += (sent.voyage.duration_ms ?? 0) + 1000
      const { result: r, log } = await voy.revealVoyageResults(db, UID, sent.voyage.id)
      const fallen = s.crew.find(x => x.id === b)!
      if ('error' in r || fallen.died_at == null || fallen.voyage_slot !== null || r.crewXP.some(g => g.id === b) || !r.crewXP.some(g => g.id === a)) fail('a lost hand was not laid to rest, or was paid, or the survivor was not')
      const grave = await crew.getCrewGraveyard(db, UID)
      if (grave[0]?.id !== b || grave[0].diedOnRoute !== 'open') fail('the fallen do not remember the route they fell on')
      if ((await crew.getCrewRoster(db, UID)).some(m => m.id === b)) fail('a lost hand stayed on the roster')
      if (!log?.crewLostNames.length) fail("the Captain's Log was not told who was lost")
      now = T0
    }
  }

  // ── 3. Trawls ──
  {
    const s = freshSave(); const db = localVoyageData(s)
    const h = sign(s, 5, { raid: 0 }, 5000), other = sign(s, 6), bunked = sign(s, 7)
    s.bunks.push({ id: s.nextId++, crew_id: bunked, since: new Date(now).toISOString(), rate_per_hour: 10, cap_hours: 4, slot: 0 })
    const docks = await voy.getTrawlState(db, UID)
    if (!docks.zones.find(z => z.key === 'shallows')!.unlocked || docks.freeCrew.some(c => c.id === bunked)) fail('the docks misread the zones or offered a hand mid-stint')
    if (!('error' in (await voy.deployTrawl(db, UID, 'nowhere', h)))) fail('a trawl went to a made-up zone')
    if (!('error' in (await voy.deployTrawl(db, UID, 'shallows', bunked)))) fail('a hand mid-stint was sent trawling')
    const sent = await voy.deployTrawl(db, UID, 'shallows', h)
    if ('error' in sent) fail(`the trawl would not go out: ${sent.error}`)
    else if (s.crew.find(x => x.id === h)!.raid_slot !== null || !sent.zones.find(z => z.key === 'shallows')!.trawl) fail('the trawl did not go out, or the hand kept their seat')
    if (!('error' in (await voy.deployTrawl(db, UID, 'shallows', other)))) fail('two trawls went to one zone')
    if (!('error' in (await voy.deployTrawl(db, UID, 'open_waters', h)))) fail('one hand went out on two trawls')
    if (!('error' in (await crew.assignToRaid(db, UID, h, 0)))) fail('a hand on a trawl was reseated')
    if (!('error' in (await voy.collectTrawl(db, UID, 'shallows')))) fail('a trawl paid before it came back')
    now += trawlDurationMs('shallows') + 1000
    const d0 = Number(s.profile.doubloons), f0 = Number(s.profile.fishing_xp)
    const got = await voy.collectTrawl(db, UID, 'shallows')
    if ('error' in got) fail(`the trawl would not come in: ${got.error}`)
    else {
      if (s.profile.doubloons !== d0 + got.doubloonsGained || s.profile.fishing_xp !== f0 + got.xpGained || got.newFishingXP !== f0 + got.xpGained) fail('the trawl did not pay as reported')
      if (got.xpGained <= 0 || !got.fish.length || s.profile.trawls_collected !== 1) fail('the trawl came back empty, or uncounted')
      console.log(`  a trawl offline: ${got.xpGained} fishing XP and ${got.doubloonsGained} doubloons from the Shallows, paid once`)
    }
    if (!('error' in (await voy.collectTrawl(db, UID, 'shallows')))) fail('a trawl paid twice')
    if ('error' in (await crew.assignToRaid(db, UID, h, 0))) fail('a hand stayed locked after the trawl came in')
    now = T0
  }

  // ── 4. The roll call ──
  {
    const s = freshSave(); const db = localVoyageData(s)
    const sailor = sign(s, 1, { voyage: 0 }), sailor2 = sign(s, 2, { voyage: 1 }), trawler = sign(s, 3), sleeper = sign(s, 4), raider = sign(s, 5, { raid: 0 }), idle = sign(s, 6)
    await voy.sendDailyVoyage(db, UID, 'open')
    await voy.deployTrawl(db, UID, 'shallows', trawler)
    s.bunks.push({ id: s.nextId++, crew_id: sleeper, since: new Date(now).toISOString(), rate_per_hour: 10, cap_hours: 4, slot: 0 })
    const hub = await voy.crewHub(db, UID)
    if ('error' in hub) fail(hub.error)
    else {
      const doing = (id: number) => hub.crew.find(c => c.id === id)?.doing
      const want: [number, string][] = [[sailor, 'voyage'], [sailor2, 'voyage'], [trawler, 'trawl'], [sleeper, 'bunk'], [raider, 'raid'], [idle, 'hall']]
      const wrong = want.filter(([id, d]) => doing(id) !== d)
      if (wrong.length || !hub.voyage || hub.voyage.ready) fail(`the roll call misplaced ${wrong.map(([id, d]) => `${id} (${doing(id)}, not ${d})`).join(', ') || 'the voyage'}`)
    }
  }
  console.log('  the roll call: at sea, on a trawl, in a bunk, in the raid party and idle, each where they are')
} finally {
  installRng(null); installClock(null)
}

// ── 5. The save file ──
{
  const s = freshSave()
  const v4 = JSON.parse(serializeSave(s))
  const { voyages: _v, trawls: _t, ...v3save } = v4.save
  void _v; void _t
  const up = deserializeSave(JSON.stringify({ format: LOCAL_SAVE_FORMAT, version: 3, savedAt: '', save: v3save, carried: {} }), SPECIES).save
  if (!Array.isArray(up.voyages) || !Array.isArray(up.trawls)) fail('a version 3 save did not upgrade to version 4')
  const { save, carried } = fromWebExport({
    format: 'x', version: 1, userId: 'w', username: null, profile: {},
    tables: {
      daily_voyages: [
        { id: 300, voyage_date: '2026-09-02', crew_variant_ids: [40], ship_tier: 3, route: 'coastal', status: 'revealed', events: [], total_doubloons: 90, total_gems: 0, crew_lost: [], created_at: '2026-09-02T00:00:00Z' },
        { id: 301, voyage_date: '2026-09-03', crew_variant_ids: [40], ship_tier: 3, route: 'open', status: 'pending', events: [], total_doubloons: 120, total_gems: 1, crew_lost: [], created_at: '2026-09-03T00:00:00Z', duration_ms: 3600000 },
      ],
      trawls: [{ id: 55, zone: 'deep', crew_id: 41, ends_at: '2026-09-03T02:00:00Z' }],
      user_crew: [{ id: 40, card_id: 2, rarity: 1, power: 1, dodge: 1, fortune: 1, xp: 0, recruited_at: '2026-09-01T00:00:00Z' }],
    },
  }, SPECIES)
  if (save.voyages.length !== 2 || save.voyages[1].status !== 'pending' || save.trawls[0]?.crew_id !== 41 || 'daily_voyages' in carried || save.nextId !== 302) fail('a web export\'s voyages and trawls did not convert (or the id counter could collide)')
  const db = localVoyageData(save)
  if ((await db.voyageAtSea('w'))?.join() !== '40' || !(await db.onTrawl('w', 41))) fail('a converted save did not know who is at sea and who is trawling')
}

console.log(`\n  Offline voyages and trawls: no server on the path, the voyage, the board, the docks, the roll call, save v4 ${failed ? `${failed} FAILED` : 'ok'}.`)
if (failed) process.exit(1)
