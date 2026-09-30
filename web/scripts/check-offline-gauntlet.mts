// THE GAUNTLETS, OFFLINE (Steam prep, 2026-09-29).
//
// Runs the REAL gauntlet paths (lib/core/gauntlet) against a LOCAL save
// (lib/data/local/gauntletLocal), with no network:
//   1. the import trees of the core and the local store hold nothing of the
//      server;
//   2. the lobby: a run opens and its start is stamped (runs have had no
//      cooldown since 2026-06-23);
//   3. a run: checkpoints and per-depth times (a first time is not a record, a
//      faster one is), pause and unlimited resumes, one crash resume, Davy's
//      coin, hits held to the loadout and flagged when absurd;
//   4. the finish: a cash-out paid once (doubloons, Fathoms, the record, the
//      run log, the bounty moment), a death paying Fathoms only and leaving the
//      record alone, a second finish refused;
//   5. hardcore: the squad snapshotted, drowned on a death (the graveyard
//      remembers the depth), and a Don's hardcore cash-out writing the Don's
//      own columns (the fix that rode along);
//   6. the Locker: an upgrade bought once and gated on depth, switched off and
//      on, the Don's Tribute once a day, a lure bought with Fathoms;
//   7. the save file: version 4 upgrades to 5, and a web export's depth times,
//      run log and bounty moments convert.
//
//   npx tsx scripts/check-offline-gauntlet.mts

import fs from 'fs'
import path from 'path'
import * as g from '../lib/core/gauntlet'
import * as crew from '../lib/core/crew'
import { localGauntletData } from '../lib/data/local/gauntletLocal'
import type { LocalSave } from '../lib/data/local/save'
import { deserializeSave, serializeSave, fromWebExport, LOCAL_SAVE_FORMAT } from '../lib/data/local/saveFile'
import type { SpeciesRow } from '../lib/data/fishingData'
import { freshCasino } from '../lib/data/local/save'
import { installRng, mulberry32 } from '../lib/rng'
import { installClock } from '../lib/clock'
import { XP_TABLE as NAV_XP } from '../lib/expeditionLevel'
import { GAUNTLET_UPGRADES, isToggleableUpgrade, isUpgradeComingSoon, DONS_DAILY_TRIBUTE_ID, DONS_DAILY_TRIBUTE_AMOUNT } from '../lib/gauntletUpgrades'
import { FATHOM_BAITS } from '../lib/bait'
import { GAUNTLET_DAMAGE_MIN } from '../lib/bounties'
import type { GauntletRunState } from '../lib/gauntlet'

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
for (const entry of ['lib/core/gauntlet.ts', 'lib/data/local/gauntletLocal.ts']) {
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
      username: 'Offline Captain', doubloons: 0, gems: 0, blood_gems: 0, gauntlet_fathoms: 0, expedition_xp: NAV_XP[39], ship_tier: 6,
      ship_classes: null, has_sixth_berth: false, is_admin: false, is_premium: false, premium_expires_at: null,
      gauntlet_upgrades: [], gauntlet_upgrades_off: [], dons_gauntlet_upgrades: [], dons_gauntlet_upgrades_off: [],
      raid_items: [], ship_skins: [], equipped_raid_items: [], raid_node_progress: null, crew_hall_tier: 1,
      gauntlet_run_open: false, gauntlet_last_run_at: null, gauntlet_deepest: 0, dons_gauntlet_deepest: 0,
      ...over,
    },
    species: SPECIES,
    bait: {}, hold: {}, collection: {}, lifetime: {}, bests: {}, shinies: [], daily: {},
    clears: [], rodItems: {}, ledger: [], anomalies: [], mail: [], rapport: [], contests: {}, overrides: {},
    deals: [], market: null, crew: [], recruits: [], bunks: [], nextId: 1, voyages: [], trawls: [],
    depthBests: {}, gauntletRuns: [], bountyEvents: [], casino: freshCasino(), raidTokens: [], raidClears: [], bounty: null, bountyHistory: [], contestsWonAt: {}, trivia: { board: {}, capstan: {}, ladder: {} }, charting: { boards: { match: {}, minefield: {}, sudoku: {}, rigging: {} }, match: {}, minefield: {}, rigging: {}, hold: {} }, digs: [], discoveries: [], homestead: null,
  }
}
function sign(s: LocalSave, cardId: number, raid: number | null) {
  const id = s.nextId++
  s.crew.push({ id, card_id: cardId, rarity: 2, power: 6, dodge: 4, fortune: 5, effects: [], pending_trait: null, voyage_slot: null, raid_slot: raid,
    xp: 0, nickname: null, recruited_at: new Date(T0 + id).toISOString(), died_at: null, died_on_voyage_id: null, died_hardcore_depth: null })
  return id
}
const state = (cleared: number, prevWasBoss = false) => ({
  cleared, prevWasBoss, roundsSinceBoss: 0, hp: 100, pot: 0, bossesDefeated: 0, boonTiers: {}, curseTiers: {},
  usedAbilityIds: [], silencedCrewIds: [], carriedCharges: 0, anchorSavesLeft: 0,
} as unknown as GauntletRunState)

let now = T0
installRng(mulberry32(5)); installClock(() => now)
try {
  // ── 2 & 3. The gate and a run ──
  {
    const s = freshSave(); const db = localGauntletData(s)
    sign(s, 1, 0); sign(s, 2, 1)
    await g.recordGauntletHit(db, UID, 900)
    if (s.profile.gauntlet_big_hit != null || !s.anomalies.some(a => a.kind === 'no_run:recordGauntletHit')) fail('a hit outside a run was recorded')
    const lobby = await g.getGauntletDailyState(db, UID)
    if (!lobby.available || lobby.resumeState) fail('a fresh captain could not start a run')
    const start = await g.startGauntletRun(db, UID)
    if (!start.started || s.profile.gauntlet_run_open !== true) fail('the run did not open')
    // No cooldown between runs since 2026-06-23 (GAUNTLET_COOLDOWN_HOURS = 0); the
    // run-start stamp still fires for the board's time.
    if (!s.profile.gauntlet_last_run_at) fail('the run start was not stamped')

    // Hits: none recorded outside a run; inside, the best is kept and absurd ones held down.
    now += 60_000
    await g.checkpointGauntletRun(db, UID, state(1))
    await g.recordGauntletHit(db, UID, GAUNTLET_DAMAGE_MIN + 10)
    if (s.profile.gauntlet_big_hit !== GAUNTLET_DAMAGE_MIN + 10 || s.profile.gauntlet_max_hit !== GAUNTLET_DAMAGE_MIN + 10 || !s.bountyEvents.some(e => e.kind === 'gauntlet_hit')) fail('a hit was not recorded (or not counted for the bounty)')
    await g.recordGauntletHit(db, UID, 5)
    if (s.profile.gauntlet_big_hit !== GAUNTLET_DAMAGE_MIN + 10) fail('a smaller hit replaced the best')
    await g.recordGauntletHit(db, UID, 1e12)
    if (!s.anomalies.some(a => a.kind === 'cap_trip:recordGauntletHit') || Number(s.profile.gauntlet_big_hit) >= 1e12) fail('an absurd hit was not held to the loadout')

    // Per-depth times: the first is not a record; a faster later one is.
    const first = s.depthBests['davy:0:1']
    if (!first) fail('the first depth time was not kept')

    // Pause: unlimited resumes. Crash: one.
    await g.pauseGauntletRun(db, UID, state(1))
    if (!(await g.resumeGauntletRun(db, UID)).ok || !(await g.pauseGauntletRun(db, UID, state(1))).ok || !(await g.resumeGauntletRun(db, UID)).ok) fail('a paused run did not resume')
    const crash1 = await g.resumeGauntletRun(db, UID)
    const crash2 = await g.resumeGauntletRun(db, UID)
    if (!crash1.ok || crash2.ok) fail('the crash resume was not exactly once')

    // Davy's coin: clamped to the purse and the cap, rolled here.
    s.profile.gauntlet_fathoms = 50
    const w = await g.wagerGauntletFathoms(db, UID, 999)
    if ('error' in w || w.stake !== 10 || s.profile.gauntlet_fathoms !== (w.won ? 60 : 40)) fail('the Shrine wager did not stake 10 and settle it')
    s.profile.gauntlet_fathoms = 0

    // The finish: a cash-out, once. The clock has to allow the depth.
    for (let d = 2; d <= 5; d++) { now += 60_000; await g.checkpointGauntletRun(db, UID, state(d, d === 5)) }
    const d0 = Number(s.profile.doubloons)
    const out = await g.cashOutGauntlet(db, UID, 5, 5, 2_000, { depth: 5, boons: {}, curses: {}, tides: [] } as never)
    if (!out.ok) fail('the cash-out failed')
    else {
      if (s.profile.gauntlet_run_open !== false || s.profile.gauntlet_deepest !== 5 || out.deepest !== 5) fail('the cash-out did not close the run and set the record')
      if (s.profile.doubloons !== d0 + out.bankedDoubloons || s.profile.gauntlet_fathoms !== out.newFathoms || out.earnedFathoms <= 0) fail('the cash-out did not pay what it reported')
      if (s.gauntletRuns.at(-1)?.outcome !== 'cashed' || !s.bountyEvents.some(e => e.kind === 'gauntlet_depth' && e.value === 5)) fail('the run was not logged, or not counted for the bounty')
      if ((await g.getGauntletLeaderboard(db, UID)).top?.depth !== 5) fail('the ledger did not show the captain\'s own best')
      console.log(`  a descent offline: depth 5 cashed out for ${out.bankedDoubloons} doubloons and ${out.earnedFathoms} Fathoms (${out.chest.label}), once`)
    }
    if ((await g.cashOutGauntlet(db, UID, 5, 5, 2_000)).ok) fail('a run cashed out twice')

    // Tomorrow: a death pays Fathoms and leaves the record alone.
    now += 25 * HOUR
    if (!(await g.startGauntletRun(db, UID)).started) fail('the next day\'s run did not open')
    for (let d = 1; d <= 3; d++) { now += 60_000; await g.checkpointGauntletRun(db, UID, state(d)) }
    const f0 = Number(s.profile.gauntlet_fathoms)
    const died = await g.resolveGauntletDeath(db, UID, 3, 3)
    if (!died.ok || s.profile.gauntlet_deepest !== 5 || s.profile.gauntlet_fathoms !== f0 + died.earnedFathoms || s.profile.gauntlet_deepest_died !== 3) fail('a death paid more than Fathoms, or moved the record')
    if ((await g.resolveGauntletDeath(db, UID, 3, 3)).ok) fail('a run died twice')
    // A faster time to depth 1 than yesterday's is a record.
    now += 25 * HOUR
    await g.startGauntletRun(db, UID)
    now += 1_000
    const quick = await g.checkpointGauntletRun(db, UID, state(1))
    if (!quick.split?.isRecord || quick.split.prevMs !== first?.ms) fail('a faster time to a depth was not a record')
    await g.resolveGauntletDeath(db, UID, 1, 1)
  }

  // ── 5. Hardcore ──
  {
    const s = freshSave({ is_admin: true }); const db = localGauntletData(s)
    const a = sign(s, 1, 0), b = sign(s, 2, 1), bench = sign(s, 3, null)
    if ((await g.startGauntletRun(db, UID, true, { not_a_term: 3 } as never)).started !== true) fail('a hardcore run did not open')
    if (JSON.stringify(s.profile.gauntlet_hc_squad) !== JSON.stringify([a, b]) || s.profile.gauntlet_run_terms !== null) fail('the squad was not the raid party, or a made-up term was signed')
    for (let d = 1; d <= 4; d++) { now += 60_000; await g.checkpointGauntletRun(db, UID, state(d)) }
    const died = await g.resolveGauntletDeath(db, UID, 4, 4)
    const fallen = s.crew.filter(c => c.died_at != null).map(c => c.id).sort()
    if (!died.ok || died.fallenCount !== 2 || fallen.join() !== [a, b].join() || s.crew.find(c => c.id === a)!.died_hardcore_depth !== 4) fail('the squad did not drown at the depth')
    if (s.crew.find(c => c.id === bench)!.died_at != null) fail('a hand on the bench drowned')
    const grave = await crew.getCrewGraveyard(db, UID)
    if (grave.length !== 2 || grave[0].diedHardcoreDepth !== 4) fail('the graveyard does not remember the Locker')

    // A Don's hardcore cash-out writes the Don's own columns, including a
    // faster run at the same depth.
    const t = freshSave({ is_admin: true, dons_gauntlet_hc_best_depth: 3, dons_gauntlet_hc_best_depth_ms: 999_999_999 }); const tdb = localGauntletData(t)
    sign(t, 4, 0)
    await g.startGauntletRun(tdb, UID, true, undefined, 'don')
    for (let d = 1; d <= 3; d++) { now += 60_000; await g.checkpointGauntletRun(tdb, UID, state(d, d === 3)) }
    const hc = await g.cashOutGauntlet(tdb, UID, 3, 3, 500)
    if (!hc.ok) fail('the Don\'s hardcore cash-out failed')
    else if (!(Number(t.profile.dons_gauntlet_hc_best_depth_ms) < 999_999_999) || 'gauntlet_hc_best_depth_ms' in t.profile) fail('a Don\'s faster hardcore run wrote Davy\'s column')
    if (t.crew.some(c => c.died_at != null) || t.profile.gauntlet_hc_squad !== null) fail('a hardcore squad that sailed home did not come home')
  }
  console.log('  hardcore: the squad drowns on a death and comes home on a cash-out; a Don\'s run keeps to the Don\'s columns')

  // ── 6. The Locker ──
  {
    const s = freshSave({ gauntlet_deepest: 100 }); const db = localGauntletData(s)
    const up = GAUNTLET_UPGRADES.find(u => (u.gauntlet ?? 'davy') === 'davy' && !u.requires && !isUpgradeComingSoon(u.id) && u.cost > 0)!
    s.profile.gauntlet_fathoms = up.cost - 1
    if (!('error' in (await g.claimGauntletUpgrade(db, UID, up.id))) || s.profile.gauntlet_fathoms !== up.cost - 1) fail('a Locker upgrade was sold on credit')
    s.profile.gauntlet_fathoms = up.cost
    const got = await g.claimGauntletUpgrade(db, UID, up.id)
    if ('error' in got || s.profile.gauntlet_fathoms !== 0 || !(s.profile.gauntlet_upgrades as string[]).includes(up.id)) fail('a Locker upgrade was not bought at its price')
    s.profile.gauntlet_fathoms = up.cost
    if (!('error' in (await g.claimGauntletUpgrade(db, UID, up.id))) || s.profile.gauntlet_fathoms !== up.cost) fail('a Locker upgrade was sold twice')
    const shallow = freshSave({ gauntlet_deepest: 0, gauntlet_fathoms: 1e6 })
    const deep = GAUNTLET_UPGRADES.find(u => (u.gauntlet ?? 'davy') === 'davy' && !u.requires && !isUpgradeComingSoon(u.id) && u.depthRequired > 0)
    if (deep && !('error' in (await g.claimGauntletUpgrade(localGauntletData(shallow), UID, deep.id)))) fail('a Locker upgrade was sold above the depth reached')
    const toggle = GAUNTLET_UPGRADES.find(u => isToggleableUpgrade(u.id) && (u.gauntlet ?? 'davy') === 'davy')
    if (toggle) {
      s.profile.gauntlet_upgrades = [...(s.profile.gauntlet_upgrades as string[]), toggle.id]
      const off = await g.setGauntletUpgradeActive(db, UID, toggle.id, false)
      const on = await g.setGauntletUpgradeActive(db, UID, toggle.id, true)
      if ('error' in off || !off.off.includes(toggle.id) || 'error' in on || on.off.includes(toggle.id)) fail('a run upgrade did not switch off and on')
    }
    // The Don's Tribute: once a UTC day.
    s.profile.dons_gauntlet_upgrades = [DONS_DAILY_TRIBUTE_ID]
    const f0 = Number(s.profile.gauntlet_fathoms)
    const t1 = await g.claimDailyTribute(db, UID)
    const t2 = await g.claimDailyTribute(db, UID)
    if ('error' in t1 || !('error' in t2) || s.profile.gauntlet_fathoms !== f0 + DONS_DAILY_TRIBUTE_AMOUNT) fail('the tribute was not paid exactly once')
    now += 24 * HOUR
    if ('error' in (await g.claimDailyTribute(db, UID))) fail('the tribute did not come back the next day')
    now -= 24 * HOUR
    // A lure for Fathoms.
    const lure = FATHOM_BAITS()[0]
    if (lure) {
      s.profile.gauntlet_fathoms = lure.fathomCost!
      const bought = await g.buyBaitWithFathoms(db, UID, lure.type)
      if ('error' in bought || s.bait[lure.type] !== lure.fathomBundle || s.profile.gauntlet_fathoms !== 0) fail('a Fathoms lure was not bought at its price')
      if (!('error' in (await g.buyBaitWithFathoms(db, UID, lure.type)))) fail('a Fathoms lure was bought on credit')
    }
    if (!('error' in (await g.buyBaitWithFathoms(db, UID, 'worm')))) fail('a lure not sold for Fathoms was')
  }
  console.log('  the Locker: an upgrade bought once and gated on depth, switched off and on, the tribute once a day, a Fathoms lure')
} finally {
  installRng(null); installClock(null)
}

// ── 7. The save file ──
{
  const s = freshSave()
  const v5 = JSON.parse(serializeSave(s))
  const { depthBests: _d, gauntletRuns: _r, bountyEvents: _b, ...v4save } = v5.save
  void _d; void _r; void _b
  const up = deserializeSave(JSON.stringify({ format: LOCAL_SAVE_FORMAT, version: 4, savedAt: '', save: v4save, carried: {} }), SPECIES).save
  if (typeof up.depthBests !== 'object' || !Array.isArray(up.gauntletRuns) || !Array.isArray(up.bountyEvents)) fail('a version 4 save did not upgrade to version 5')
  const { save, carried } = fromWebExport({
    format: 'x', version: 1, userId: 'w', username: null, profile: {},
    tables: {
      gauntlet_depth_bests: [{ variant: 'davy', hardcore: false, depth: 7, best_ms: 42_000, achieved_at: '2026-09-01T00:00:00Z' }],
      gauntlet_runs: [{ variant: 'don', hardcore: true, depth: 9, duration_ms: 90_000, outcome: 'died', created_at: '2026-09-02T00:00:00Z' }],
      bounty_events: [{ kind: 'gauntlet_depth', value: 9, created_at: '2026-09-02T00:00:00Z' }],
    },
  }, SPECIES)
  if (save.depthBests['davy:0:7']?.ms !== 42_000 || save.gauntletRuns[0]?.variant !== 'don' || save.bountyEvents[0]?.value !== 9 || 'gauntlet_runs' in carried) fail('a web export\'s gauntlet history did not convert')
}

console.log(`\n  Offline gauntlets: no server on the path, the gate, the run, the finish, hardcore, the Locker, save v5 ${failed ? `${failed} FAILED` : 'ok'}.`)
if (failed) process.exit(1)
