// RAIDS AND THE CAMPAIGN MAP, OFFLINE (Steam prep, 2026-09-29).
//
// Runs the REAL raid and map paths (lib/core/raids, lib/core/raidMap) against a
// LOCAL save (lib/data/local/raidLocal), with no network:
//   1. the import trees of both cores and the local store hold nothing of the
//      server;
//   2. a raid run: a token minted per run; every round pays once, the boss
//      round with its bonus, a round past the raid refused, nothing without a
//      token; the clear banked once, only for the token's own raid and never
//      faster than an honest fight; the crate opened once and only after the
//      clear; the whole token dead after its six hours;
//   3. the biggest hit kept, an absurd one held to the loadout and flagged;
//   4. the campaign walked end to end: every open node of every kind is played
//      (raids cleared through the token path), each clears once, a second try
//      refuses or changes nothing, and the chain opens node after node;
//   5. the refit, the spoils (one free, the other bought, once each), the
//      Primeval Eye's slot, repair kits in tier order, the tutorials;
//   6. the save file: version 6 upgrades to 7 (the clears on record kept), and
//      a web export's clears convert with their times.
//
//   npx tsx scripts/check-offline-raids.mts

import fs from 'fs'
import path from 'path'
import * as raids from '../lib/core/raids'
import * as map from '../lib/core/raidMap'
import { localRaidData, RUN_TOKEN_TTL_MS } from '../lib/data/local/raidLocal'
import { freshCasino, type LocalSave } from '../lib/data/local/save'
import { deserializeSave, serializeSave, fromWebExport, LOCAL_SAVE_FORMAT } from '../lib/data/local/saveFile'
import type { SpeciesRow } from '../lib/data/fishingData'
import { installRng, mulberry32 } from '../lib/rng'
import { installClock } from '../lib/clock'
import { XP_TABLE as NAV_XP } from '../lib/expeditionLevel'
import { RAID_MAP } from '../lib/raidMap'
import { getRaidConfigById } from '../lib/raidRegistry'
import { raidKillReward, MIN_PLAUSIBLE_CLEAR_MS } from '../lib/raidRules'
import { SPOILS_PRICE } from '../lib/shipBerth'
import { REPAIR_KITS } from '../lib/repairKits'

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
for (const entry of ['lib/core/raids.ts', 'lib/core/raidMap.ts', 'lib/data/local/raidLocal.ts']) {
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
      username: 'Offline Captain', doubloons: 50_000_000, gems: 0, expedition_xp: NAV_XP[99], ship_tier: 6, ship_classes: null,
      has_sixth_berth: false, is_admin: false, is_premium: true, premium_expires_at: null, has_completed_practice_raid: false,
      raid_node_progress: null, legendary_unlocks: [], raid_items: [], ship_skins: [], equipped_raid_items: [], equipped_ship_skin: null,
      ancient_catches: [143, 144, 145, 146, 147, 148], nav_renown_alloc: null, crew_hall_tier: 1, owned_repair_kits: null,
      ...over,
    },
    species: SPECIES,
    bait: {}, hold: {}, collection: {}, lifetime: {}, bests: {}, shinies: [], daily: {},
    clears: [], rods: [0], ledger: [], anomalies: [], mail: [], rapport: [], contests: {}, overrides: {},
    deals: [], market: null, crew: [], recruits: [], bunks: [], nextId: 1, voyages: [], trawls: [],
    depthBests: {}, gauntletRuns: [], bountyEvents: [], casino: freshCasino(), raidTokens: [], raidClears: [], bounty: null, bountyHistory: [], contestsWonAt: {}, trivia: { board: {}, capstan: {}, ladder: {} }, charting: { boards: { match: {}, minefield: {}, sudoku: {}, rigging: {} }, match: {}, minefield: {}, rigging: {}, hold: {} },
  }
}
function sign(s: LocalSave, cardId: number, raid: number | null) {
  const id = s.nextId++
  s.crew.push({ id, card_id: cardId, rarity: 3, power: 9, dodge: 6, fortune: 7, effects: [], pending_trait: null, voyage_slot: null, raid_slot: raid,
    xp: 0, nickname: null, recruited_at: new Date(T0 + id).toISOString(), died_at: null, died_on_voyage_id: null, died_hardcore_depth: null })
  return id
}

let now = T0
installRng(mulberry32(8)); installClock(() => now)
try {
  // ── 2. A raid run ──
  const firstRaid = RAID_MAP.find(n => n.type === 'raid' && n.raidId && !getRaidConfigById(n.raidId)?.skirmish)!
  const raidId = firstRaid.raidId!
  const config = getRaidConfigById(raidId)!
  {
    const s = freshSave({ has_completed_practice_raid: true }); const db = localRaidData(s)
    const a = sign(s, 1, 0), b = sign(s, 2, 1), bench = sign(s, 3, null)
    const { token } = await raids.startRaidRun(db, UID, raidId)
    if (!token) { fail('no run token was minted') }
    else {
      if ((await raids.awardRaidKill(db, UID, 0, null)).newDoubloonTotal !== 0) fail('a kill paid without a token')
      const want0 = raidKillReward(config, 0, null, null)!
      const d0 = Number(s.profile.doubloons), x0 = Number(s.profile.expedition_xp)
      const k0 = await raids.awardRaidKill(db, UID, 0, token)
      if (k0.newDoubloonTotal !== d0 + want0.doubloons || s.profile.expedition_xp !== x0 + want0.xp) fail('round 0 did not pay what the raid says')
      const xpA = s.crew.find(c => c.id === a)!.xp, xpBench = s.crew.find(c => c.id === bench)!.xp
      if (xpA !== want0.crewXp || s.crew.find(c => c.id === b)!.xp !== want0.crewXp || xpBench !== 0) fail('crew XP did not go to the raid party only')
      if ((await raids.awardRaidKill(db, UID, 0, token)).newDoubloonTotal !== 0 || s.profile.doubloons !== d0 + want0.doubloons) fail('a round paid twice')
      if ((await raids.awardRaidKill(db, UID, config.sequence.length + 1, token)).newDoubloonTotal !== 0) fail('a round past the raid paid')
      for (let r = 1; r < config.sequence.length; r++) await raids.awardRaidKill(db, UID, r, token)
      const wantBoss = raidKillReward(config, config.sequence.length, null, null)!
      const dBoss = Number(s.profile.doubloons)
      await raids.awardRaidKill(db, UID, config.sequence.length, token)
      if (s.profile.doubloons !== dBoss + wantBoss.doubloons) fail('the boss round did not pay its bonus')

      // The crate before the clear: nothing.
      if ((await raids.claimRaidLoot(db, UID, 500, token)).itemIds.length || s.raidTokens[0].looted_at) fail('a crate opened before the clear')
      // The clear: never too fast, never for another raid, once.
      if (await raids.recordRaidClear(db, UID, raidId, MIN_PLAUSIBLE_CLEAR_MS - 1, token)) fail('an impossibly fast clear was banked')
      const other = RAID_MAP.find(n => n.type === 'raid' && n.raidId && n.raidId !== raidId)!.raidId!
      if (await raids.recordRaidClear(db, UID, other, 60_000, token)) fail('a token banked a clear of another raid')
      if (await raids.recordRaidClear(db, UID, raidId, 60_000, null)) fail('a clear was banked without a token')
      const times = await raids.recordRaidClear(db, UID, raidId, 60_000, token)
      if (!times || !times.isPersonalBest || times.yourBestMs !== 60_000 || !s.clears.includes(raidId)) fail('the clear was not banked')
      if (await raids.recordRaidClear(db, UID, raidId, 50_000, token)) fail('a run banked two clears')
      // The crate after the clear: once.
      const d1 = Number(s.profile.doubloons)
      const loot = await raids.claimRaidLoot(db, UID, 500, token)
      if (loot.newDoubloonTotal < d1 || !s.raidTokens[0].looted_at) fail('the crate did not open after the clear')
      const again = await raids.claimRaidLoot(db, UID, 500, token)
      if (again.newDoubloonTotal !== 0 || again.itemIds.length) fail('a crate opened twice')
      console.log(`  a raid run offline: ${config.sequence.length + 1} rounds paid once each, the clear banked once (${times?.yourBestMs} ms), the crate opened once (${loot.itemIds.length} uniques)`)
    }
    // A second run, faster: a new personal best. A third, dead after six hours.
    now += HOUR
    const { token: t2 } = await raids.startRaidRun(db, UID, raidId)
    const t2times = await raids.recordRaidClear(db, UID, raidId, 45_000, t2)
    if (!t2times?.isPersonalBest || t2times.yourBestMs !== 45_000) fail('a faster clear was not a personal best')
    const { token: t3 } = await raids.startRaidRun(db, UID, raidId)
    now += RUN_TOKEN_TTL_MS + 1000
    if ((await raids.awardRaidKill(db, UID, 0, t3)).newDoubloonTotal !== 0 || await raids.recordRaidClear(db, UID, raidId, 60_000, t3)) fail('an expired token still paid')
    now = T0
  }

  // ── 3. The biggest hit ──
  {
    const s = freshSave(); const db = localRaidData(s)
    sign(s, 1, 0)
    await raids.recordRaidHit(db, UID, 120)
    await raids.recordRaidHit(db, UID, 60)
    if (s.profile.highest_raid_damage !== 120) fail('the biggest hit was not kept')
    await raids.recordRaidHit(db, UID, 5e9)
    if (Number(s.profile.highest_raid_damage) >= 5e9 || !s.anomalies.some(a => a.kind === 'cap_trip:recordRaidHit')) fail('an absurd hit was not held to the loadout')
  }

  // ── 4. The campaign, walked ──
  {
    const s = freshSave(); const db = localRaidData(s)
    for (let k = 0; k < 6; k++) sign(s, k + 1, k)
    const played: Record<string, number> = {}
    let steps = 0, stuck = 0
    for (; steps < 400; steps++) {
      const view = await map.getRaidMapView(db, UID)
      const open = view.views.filter(v => v.status === 'available')
      const v = open[0]
      if (!v) break
      const n = v.node
      let done = false
      const before = JSON.stringify(s.profile.raid_node_progress)
      switch (n.type) {
        case 'skirmish': await raids.recordSkirmishClear(db, UID); done = true; break
        case 'raid': {
          const { token } = await raids.startRaidRun(db, UID, n.raidId!)
          done = !!(await raids.recordRaidClear(db, UID, n.raidId!, 90_000, token))
          break
        }
        case 'story': case 'berth': {
          const r = n.payoff ? await map.claimScoutDebt(db, UID, n.id) : await map.markStoryNodeRead(db, UID, n.id)
          done = !('error' in r)
          break
        }
        case 'milestone': done = !('error' in (await map.claimMilestoneNode(db, UID, n.id))); break
        case 'puzzle': done = !('error' in (await map.solvePuzzleNode(db, UID, n.id))); break
        case 'muster': {
          // The clerk wants particular classes; this party may not have them.
          // A refusal must be the clerk's, and then the walk steps past.
          const r = await map.standForMuster(db, UID, n.id)
          if ('error' in r) {
            if (!r.error.startsWith('The clerk')) fail(`the muster refused for the wrong reason: ${r.error}`)
            s.profile.raid_node_progress = { ...(s.profile.raid_node_progress ?? {}), cleared: [...((s.profile.raid_node_progress as { cleared?: string[] } | null)?.cleared ?? []), n.id] }
          }
          done = true
          break
        }
        case 'event': done = !('error' in (await map.pickRaidEventChoice(db, UID, n.id, n.event!.choices[0].id))); break
        case 'fork': done = !('error' in (await map.pickForkRoute(db, UID, n.id, n.fork!.routes[0].id))); break
        case 'dice': done = !('error' in (await map.rollDiceNode(db, UID, n.id, n.dice!.options[0].id))); break
        case 'dps_check': done = !('error' in (await map.resolveDpsCheck(db, UID, n.id, 'pay'))); break
        case 'class_pick': {
          const { offeredShipClassIds } = await import('../lib/shipClasses')
          const choice = n.classPick!.options?.[0] ?? offeredShipClassIds((s.profile.ship_classes as Record<string, string> | null) ?? {})[0]
          done = !('error' in (await map.pickShipClass(db, UID, n.id, choice)))
          break
        }
        case 'spoils': done = (await map.chooseSpoil(db, UID, 'fishing')).ok; break
        default:
          if (n.choice) { done = !('error' in (await map.claimQuartermasterChoice(db, UID, n.id, n.choice.items[0]))); break }
          // Gauntlets and shops are not map clears; mark them for the walk.
          s.profile.raid_node_progress = { ...(s.profile.raid_node_progress ?? {}), cleared: [...((s.profile.raid_node_progress as { cleared?: string[] } | null)?.cleared ?? []), n.id] }
          done = true
      }
      if (!done) { fail(`node ${n.id} (${n.type}) would not clear`); stuck++; if (stuck > 3) break; continue }
      played[n.type] = (played[n.type] ?? 0) + 1
      // A second go changes nothing or is refused.
      if (['milestone', 'event', 'fork', 'dice', 'class_pick'].includes(n.type)) {
        const after = JSON.stringify(s.profile.raid_node_progress)
        const again = n.type === 'milestone' ? await map.claimMilestoneNode(db, UID, n.id)
          : n.type === 'event' ? await map.pickRaidEventChoice(db, UID, n.id, n.event!.choices[0].id)
          : n.type === 'fork' ? await map.pickForkRoute(db, UID, n.id, n.fork!.routes[0].id)
          : n.type === 'dice' ? await map.rollDiceNode(db, UID, n.id, n.dice!.options[0].id)
          : await map.pickShipClass(db, UID, n.id, 'whatever')
        if (!('error' in again) || JSON.stringify(s.profile.raid_node_progress) !== after) fail(`node ${n.id} (${n.type}) cleared twice`)
        if (after === before) fail(`node ${n.id} (${n.type}) did not record its clear`)
      }
    }
    const view = await map.getRaidMapView(db, UID)
    const cleared = view.views.filter(v => v.status === 'cleared').length
    const locked = view.views.filter(v => v.status === 'locked')
    console.log(`  the campaign walked offline: ${cleared} of ${view.views.length} nodes cleared in ${steps} steps (${Object.entries(played).map(([t, n]) => `${n} ${t}`).join(', ')}); ${locked.length} still locked`)
    if (cleared < view.views.length * 0.8) fail(`only ${cleared} of ${view.views.length} nodes could be cleared: ${locked.slice(0, 5).map(v => `${v.node.id} (${v.lockReason ?? ''})`).join(', ')}`)
    if (!s.clears.length || view.raidRecords[raidId]?.yourBestMs == null) fail('the walked raids left no records')
  }

  // ── 5. The refit, the spoils, kits, tutorials ──
  {
    const s = freshSave({ ship_classes: { ch1: 'master_gunner' }, ship_refits_used: 0 }); const db = localRaidData(s)
    if (!('error' in (await map.refitShipClasses(db, UID, { ch1: 'ironside' })))) fail('a refit went through with the don on his throne')
    s.clears.push('the_throne')
    const r1 = await map.refitShipClasses(db, UID, { ch1: 'ironside' })
    if ('error' in r1) { if (!/class/i.test(r1.error)) fail(`the free refit failed: ${r1.error}`) }
    else if (s.profile.ship_refits_used !== 1 || r1.doubloons !== null) fail('the first refit was not free')

    // The spoils: nothing before Finn; one free, the other bought, once each.
    if ((await map.chooseSpoil(db, UID, 'nav')).ok) fail('a spoil was taken before Finn went down')
    s.clears.push('the_sunken_hand')
    if (!(await map.chooseSpoil(db, UID, 'nav')).ok || (await map.chooseSpoil(db, UID, 'fishing')).ok) fail('the free spoil was not taken exactly once')
    if ((await map.buySpoil(db, UID, 'nav')).ok) fail('the same side was bought again')
    const d0 = Number(s.profile.doubloons)
    const bought = await map.buySpoil(db, UID, 'fishing')
    if (!bought.ok || s.profile.doubloons !== d0 - SPOILS_PRICE || (await map.buySpoil(db, UID, 'fishing')).ok) fail('the other spoil was not bought once at its price')
    if ((await map.equipSecondSpecial(db, UID, 'anglers_patience')).ok) fail('the Eye was seated without being carried')
    s.profile.has_anglers_patience = true
    if (!(await map.equipSecondSpecial(db, UID, 'anglers_patience')).ok || s.profile.equipped_special_2 !== 'anglers_patience') fail('the Eye would not seat')
    if ((await map.equipSecondSpecial(db, UID, 'tide_turner')).ok) fail('something other than the Eye was seated in its slot')

    // Repair kits: in tier order, at their price, gated on Navigation.
    const kit = REPAIR_KITS.find(k => k.id !== 'basic_repair_kit')!
    const k0 = Number(s.profile.doubloons)
    const got = await raids.buyRepairKit(db, UID)
    if ('error' in got || s.profile.equipped_repair_kit !== kit.id || s.profile.doubloons !== k0 - kit.cost) fail('the next repair kit was not bought and worn at its price')
    const low = freshSave({ expedition_xp: 0 })
    if (!('error' in (await raids.buyRepairKit(localRaidData(low), UID)))) fail('a repair kit was sold below its Navigation')

    // Tutorials: unseen until marked.
    if (await raids.getCheckTutorialSeen(db, UID)) fail('an unseen tutorial read as seen')
    await raids.markCheckTutorialSeen(db, UID); await raids.markSkirmishTourSeen(db, UID); await raids.markRaidTutorialSeen(db, UID)
    if (!(await raids.getCheckTutorialSeen(db, UID)) || !(await raids.getSkirmishTourSeen(db, UID)) || s.profile.has_seen_raid_tutorial !== true) fail('a tutorial did not stay seen')
  }
  console.log('  the refit, the spoils (one free, one bought, once each), the Eye\'s slot, repair kits, tutorials')
} finally {
  installRng(null); installClock(null)
}

// ── 6. The save file ──
{
  const s = freshSave(); s.clears = ['old_raid']
  const v7 = JSON.parse(serializeSave(s))
  const { raidTokens: _t, raidClears: _c, ...v6save } = v7.save
  void _t; void _c
  const up = deserializeSave(JSON.stringify({ format: LOCAL_SAVE_FORMAT, version: 6, savedAt: '', save: v6save, carried: {} }), SPECIES).save
  if (!Array.isArray(up.raidTokens) || up.raidClears[0]?.raid_id !== 'old_raid' || up.raidClears[0].ms !== null) fail('a version 6 save did not upgrade to version 7 with its clears')
  const { save } = fromWebExport({
    format: 'x', version: 1, userId: 'w', username: null, profile: {},
    tables: {
      raid_completions: [
        { raid_id: 'corsairs_reckoning', elapsed_ms: 88_000, completed_at: '2026-09-01T00:00:00Z' },
        { raid_id: 'corsairs_reckoning', elapsed_ms: 71_000, completed_at: '2026-09-02T00:00:00Z' },
      ],
      run_tokens: [{ id: 'x', kind: 'raid' }],
    },
  }, SPECIES)
  const ldb = localRaidData(save)
  if (save.clears.join() !== 'corsairs_reckoning' || (await ldb.myBestClear('w', 'corsairs_reckoning')) !== 71_000 || save.raidTokens.length) fail('a web export\'s raid clears did not convert with their times')
}

console.log(`\n  Offline raids: no server on the path, the run token, the campaign, the spoils, save v7 ${failed ? `${failed} FAILED` : 'ok'}.`)
if (failed) process.exit(1)
