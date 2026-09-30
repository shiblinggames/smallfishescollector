// THE DAILY LOOP, OFFLINE (Steam prep, 2026-09-29).
//
// Runs the REAL bounty and daily paths (lib/core/bounties, lib/core/dailies)
// against a LOCAL save (lib/data/local/dailyLocal), with no network:
//   1. the import trees of both cores and the local store hold nothing of the
//      server;
//   2. bounties: shut before Chapter I; each rung's board rolled, every order it
//      hands out finished from the logs it reads (raids, voyages, events,
//      counters) and paid once, a finish claimed early refused, the sweep and
//      its points, the one swap, the next day's fresh board with the old one
//      archived, the points ladder collected in order, the rung announcement;
//   3. the daily challenges: three (four at Master), each paid once and only
//      when done, the Master crate, the sweep only after all three;
//   4. the Daily Haul: gems, bait and the weekly crate, once each per day or
//      week, the member tiers, the disc's state;
//   5. mail: the game's letters, read and unread, "mark all", an attachment
//      paid once;
//   6. contests: this captain as the winner and the standings;
//   7. the save file: version 8 upgrades to 9 (old letters kept), and a web
//      export's bounty board converts.
//
//   npx tsx scripts/check-offline-dailies.mts

import fs from 'fs'
import path from 'path'
import * as bounties from '../lib/core/bounties'
import * as dailies from '../lib/core/dailies'
import { localDailyData } from '../lib/data/local/dailyLocal'
import { localCaptain, freshCasino, SHIP_PROFILE_DEFAULTS, DAILY_PROFILE_DEFAULTS, type LocalSave, type LocalVoyageRow } from '../lib/data/local/save'
import { deserializeSave, serializeSave, fromWebExport, LOCAL_SAVE_FORMAT } from '../lib/data/local/saveFile'
import type { SpeciesRow } from '../lib/data/fishingData'
import { installRng, mulberry32 } from '../lib/rng'
import { installClock } from '../lib/clock'
import { XP_TABLE } from '../lib/fishingLevel'
import { BOUNTY_RUNGS, BOUNTY_BY_ID, BOUNTY_MILESTONES, BOUNTY_SWEEP_POINTS, bountyGems, bountyPoints, rungGems, type Bounty } from '../lib/bounties'
import { MASTER_MIN_LEVEL, DAILY_SWEEP_GEMS } from '../lib/dailyChallenges'
import { CONTESTS } from '../lib/contests'

let failed = 0
const fail = (m: string) => { failed++; console.log('  FAIL ' + m) }
const ROOT = process.cwd()
const DAY = 86_400_000

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
for (const entry of ['lib/core/bounties.ts', 'lib/core/dailies.ts', 'lib/data/local/dailyLocal.ts']) {
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
      ...structuredClone(SHIP_PROFILE_DEFAULTS), ...structuredClone(DAILY_PROFILE_DEFAULTS),
      username: 'Offline Captain', doubloons: 1_000, gems: 0, fishing_xp: XP_TABLE[19], is_admin: false,
      unlocked_character_colors: [], unlocked_boats: [], unlocked_hats: [], unlocked_pets: [], unlocked_badges: [],
      ...over,
    },
    species: SPECIES,
    bait: {}, hold: {}, collection: {}, lifetime: {}, bests: {}, shinies: [], daily: {},
    clears: [], rods: [0], ledger: [], anomalies: [], mail: [], rapport: [], contests: {}, overrides: {},
    deals: [], market: null, crew: [], recruits: [], bunks: [], nextId: 1, voyages: [], trawls: [],
    depthBests: {}, gauntletRuns: [], bountyEvents: [], casino: freshCasino(), raidTokens: [], raidClears: [],
    bounty: null, bountyHistory: [], contestsWonAt: {}, trivia: { board: {}, capstan: {}, ladder: {} }, charting: { boards: { match: {}, minefield: {}, sudoku: {}, rigging: {} }, match: {}, minefield: {}, rigging: {}, hold: {} },
  }
}

let now = T0
const iso = () => new Date(now).toISOString()
installRng(mulberry32(11)); installClock(() => now)

/** Do whatever this order asks, straight into the logs its meter reads. */
function finish(s: LocalSave, b: Bounty) {
  const clear = (raid_id: string, ms = 30_000) => s.raidClears.push({ raid_id, ms, at: iso() })
  const voyage = (over: Partial<LocalVoyageRow> = {}) => s.voyages.push({
    id: s.nextId++, voyage_date: iso().slice(0, 10), crew_variant_ids: [], ship_tier: 2, route: 'coastal', status: 'revealed',
    events: [], total_doubloons: 0, total_gems: 0, crew_lost: [], created_at: iso(), captains_log: null, log_generated_at: null,
    duration_ms: null, xp_bonus_pct: null, tide_turner_drop: false, phantom_hook_drop: false, perfected_sigil_drop: false, ...over,
  })
  const m = b.meter
  for (let i = 0; i < b.target; i++) {
    switch (m.kind) {
      case 'raid_clear': clear(m.raidId); break
      case 'raid_any': clear('captain_krust'); break
      case 'raid_any_of': clear(m.raidIds[0]); break
      case 'raid_fast': clear(m.raidId, Math.max(1, m.underS * 1000 - 1)); break
      case 'raid_distinct': clear(`distinct_${s.nextId++}`); break
      case 'raid_budget': for (let k = 0; k < m.raids; k++) clear('captain_krust', 1); break
      case 'voyages': voyage(); break
      case 'voyage_haul': voyage({ total_doubloons: m.atLeast }); break
      case 'voyage_haul_total': voyage({ total_doubloons: m.atLeast }); break
      case 'voyage_route': voyage({ route: m.route }); break
      case 'counter': s.profile[m.column] = Number(s.profile[m.column] ?? 0) + 1; break
      case 'event': s.bountyEvents.push({ kind: m.eventKind, value: m.atLeast, at: iso() }); break
    }
  }
}

try {
  // ── 2. Bounties ──
  {
    const s = freshSave(); const db = localDailyData(s)
    if ((await bounties.getBountyBoard(db, UID)).unlocked) fail('the board opened before Chapter I')
    let played = 0
    for (const rung of BOUNTY_RUNGS) {
      now += DAY
      s.clears = BOUNTY_RUNGS.filter(r => r.chapter <= rung.chapter).map(r => r.raid)
      s.raidClears = s.clears.map(raid_id => ({ raid_id, ms: 60_000, at: '' }))
      const board = await bounties.getBountyBoard(db, UID)
      if (!board.unlocked || board.rung?.chapter !== rung.chapter || board.bounties.length !== rung.slots.length || board.rungMax !== rungGems(rung.slots)) { fail(`chapter ${rung.chapter}'s board is the wrong shape`); continue }
      if (board.news?.chapter !== rung.chapter) fail(`chapter ${rung.chapter}'s rung was not announced`)
      await bounties.markBountyRungSeen(db, UID, rung.chapter)
      await bounties.markBountyRungSeen(db, UID, rung.chapter - 1)
      if (s.profile.bounty_rung_seen !== rung.chapter || (await bounties.getBountyBoard(db, UID)).news) fail('the rung announcement did not stay delivered')
      const first = board.bounties[0]
      if (!('error' in await bounties.claimBounty(db, UID, first.id))) fail('an unfinished order was paid')
      const g0 = Number(s.profile.gems), p0 = Number(s.profile.bounty_points)
      let want = 0, pts = 0
      for (const [i, v] of board.bounties.entries()) {
        const b = BOUNTY_BY_ID.get(v.id)!
        finish(s, b)
        const res = await bounties.claimBounty(db, UID, v.id)
        const last = i === board.bounties.length - 1
        want += bountyGems(b); pts += bountyPoints(b) + (last ? BOUNTY_SWEEP_POINTS : 0)
        if ('error' in res) { fail(`${v.id} (${b.meter.kind}) finished but was refused: ${res.error}`); continue }
        if (res.sweep !== last) fail(`the sweep was ${res.sweep ? 'paid early' : 'missed'}`)
        if (!('error' in await bounties.claimBounty(db, UID, v.id))) fail(`${v.id} paid twice`)
        played++
      }
      if (s.profile.gems !== g0 + want || s.profile.bounty_points !== p0 + pts) fail(`chapter ${rung.chapter}'s board did not pay its gems and points`)
      if ((await bounties.getBountyBoard(db, UID)).remaining !== 0) fail('a finished board still shows gems on it')
    }
    if (s.profile.bounty_boards_cleared !== BOUNTY_RUNGS.length) fail('a cleared board was not counted')

    // The swap: once a day, never a paid order.
    now += DAY
    const board = await bounties.getBountyBoard(db, UID)
    if (s.bountyHistory.length < BOUNTY_RUNGS.length) fail('yesterday\'s board was not archived')
    const [a, b] = board.bounties
    if ('error' in await bounties.rerollBounty(db, UID, a.id)) fail('the day\'s swap was refused')
    const after = await bounties.getBountyBoard(db, UID)
    if (after.bounties.some(x => x.id === a.id) || !after.rerollUsed || after.bounties[0].tier !== a.tier) fail('the swap did not replace the order with one of its tier')
    if (!('error' in await bounties.rerollBounty(db, UID, b.id))) fail('a second swap went through')
    s.bounty!.reroll_used = false
    finish(s, BOUNTY_BY_ID.get(b.id)!); await bounties.claimBounty(db, UID, b.id)
    if (!('error' in await bounties.rerollBounty(db, UID, b.id))) fail('a paid order was swapped')

    // The points ladder, in order, once each.
    const m0 = BOUNTY_MILESTONES[0]
    s.profile.bounty_points = BOUNTY_MILESTONES[BOUNTY_MILESTONES.length - 1].points
    s.profile.bounty_milestones_claimed = 0
    const d0 = Number(s.profile.doubloons)
    const r0 = await bounties.claimBountyMilestone(db, UID)
    if ('error' in r0 || s.profile.bounty_milestones_claimed !== 1 || s.profile.doubloons !== d0 + (m0.doubloons ?? 0)) fail('the first milestone did not pay')
    for (let i = 1; i < BOUNTY_MILESTONES.length; i++) await bounties.claimBountyMilestone(db, UID)
    const last = BOUNTY_MILESTONES[BOUNTY_MILESTONES.length - 1]
    if (s.profile.bounty_milestones_claimed !== BOUNTY_MILESTONES.length || (last.shipSkinId && !(s.profile.ship_skins as string[]).includes(last.shipSkinId))) fail('the ladder did not reach its capstone')
    if (!('error' in await bounties.claimBountyMilestone(db, UID))) fail('a milestone past the capstone paid')
    const poor = freshSave({ bounty_points: 1 })
    if (!('error' in await bounties.claimBountyMilestone(localDailyData(poor), UID)) || poor.profile.bounty_milestones_claimed !== 0) fail('a milestone paid short of its points')
    console.log(`  bounties: shut before Chapter I, all ${BOUNTY_RUNGS.length} rungs, ${played} orders finished from the logs and paid once, the sweep, the swap, the ladder of ${BOUNTY_MILESTONES.length}`)
  }

  // ── 3. The daily challenges ──
  {
    now = T0
    const s = freshSave(); const db = localDailyData(s)
    const st = (await dailies.getDailyChallenge(db, UID))!
    if (st.challenges.length !== 3) fail(`a level 20 captain has ${st.challenges.length} challenges`)
    if (!('error' in await dailies.claimDailyReward(db, UID, 0))) fail('an unfinished challenge paid')
    if (!('error' in await dailies.claimDailyReward(db, UID, 3))) fail('the Master challenge paid below its level')
    if (!('error' in await dailies.claimDailySweep(db, UID))) fail('the sweep paid before the three')
    const row = s.daily[st.date] as unknown as Record<string, unknown>
    st.challenges.forEach((c, i) => { row[`p${i + 1}`] = c.target })
    const d0 = Number(s.profile.doubloons)
    for (const i of [0, 1, 2] as const) {
      if ('error' in await dailies.claimDailyReward(db, UID, i)) fail(`challenge ${i + 1} did not pay`)
      if (!('error' in await dailies.claimDailyReward(db, UID, i))) fail(`challenge ${i + 1} paid twice`)
    }
    if (s.profile.doubloons !== d0 + st.challenges.reduce((n, c) => n + c.reward, 0)) fail('the challenges did not pay their coin')
    const sweep = await dailies.claimDailySweep(db, UID)
    if ('error' in sweep || s.profile.gems !== DAILY_SWEEP_GEMS) fail('the sweep did not pay')
    if (!('error' in await dailies.claimDailySweep(db, UID))) fail('the sweep paid twice')
    if (!(await dailies.getDailyChallenge(db, UID))!.sweepClaimed) fail('the sweep does not show as claimed')

    const m = freshSave({ fishing_xp: XP_TABLE[MASTER_MIN_LEVEL - 1] }); const mdb = localDailyData(m)
    const ms = (await dailies.getDailyChallenge(mdb, UID))!
    if (ms.challenges.length !== 4 || !ms.challenges[3].crateReward) fail('a Master captain has no crate challenge')
    ;(m.daily[ms.date] as unknown as Record<string, unknown>).p4 = ms.challenges[3].target
    const mc = await dailies.claimDailyReward(mdb, UID, 3)
    if ('error' in mc || !mc.crate || m.profile.daily_master_cleared !== 1) fail('the Master challenge did not open its crate')
    // A level-up across the line mid-day keeps the day's set.
    const l = freshSave(); const ldb = localDailyData(l)
    const before = (await dailies.getDailyChallenge(ldb, UID))!.challenges.length
    l.profile.fishing_xp = XP_TABLE[MASTER_MIN_LEVEL]
    if ((await dailies.getDailyChallenge(ldb, UID))!.challenges.length !== before) fail('levelling up mid-day changed the day\'s challenges')
    console.log('  the daily challenges: three (four at Master), each paid once when done, the Master crate, the sweep once after all three')
  }

  // ── 4. The Daily Haul ──
  {
    now = T0
    const s = freshSave(); const db = localDailyData(s)
    const st0 = (await dailies.bonusState(db, UID))!
    if (st0.gemsClaimed || st0.baitClaimed || st0.crateClaimed) fail('a new captain\'s haul showed as claimed')
    const g = await dailies.claimDailyBonus(db, UID)
    if (!g.claimed || s.profile.gems !== 50 || (await dailies.claimDailyBonus(db, UID)).claimed) fail('the day\'s gems did not pay once')
    const b = await dailies.claimDailyBait(db, UID)
    if (!b.claimed || b.baitType !== 'worm' || s.bait.worm !== 20 || (await dailies.claimDailyBait(db, UID)).claimed) fail('the day\'s bait did not come once')
    const c = await dailies.claimWeeklyCrate(db, UID)
    if (!c.claimed || c.tier !== 'wooden' || (await dailies.claimWeeklyCrate(db, UID)).claimed) fail('the week\'s crate did not open once')
    const st1 = (await dailies.bonusState(db, UID))!
    if (!st1.gemsClaimed || !st1.baitClaimed || !st1.crateClaimed) fail('the disc did not show the haul as taken')
    now += DAY
    if (!(await dailies.claimDailyBonus(db, UID)).claimed || !(await dailies.claimDailyBait(db, UID)).claimed) fail('tomorrow\'s haul did not come')
    const week = new Date(now).getUTCDay() === 1
    if ((await dailies.claimWeeklyCrate(db, UID)).claimed !== week) fail('the weekly crate did not keep to its week')
    now += 7 * DAY
    if (!(await dailies.claimWeeklyCrate(db, UID)).claimed) fail('next week\'s crate did not open')
    const mem = freshSave({ is_premium: true, premium_expires_at: null }); const mdb = localDailyData(mem)
    const mg = await dailies.claimDailyBonus(mdb, UID), mb = await dailies.claimDailyBait(mdb, UID), mc = await dailies.claimWeeklyCrate(mdb, UID)
    if (mg.amount !== 150 || mb.baitType !== 'chum' || !mc.claimed || mc.tier !== 'gold') fail('a member\'s haul was not the member\'s')
    console.log('  the Daily Haul: gems, bait and the week\'s crate once each, the member tiers, the disc')
  }

  // ── 5. Mail ──
  {
    const s = freshSave(); const db = localDailyData(s)
    const cap = localCaptain(s)
    await cap.mailTo(UID, { subject: 'Ahoy', body: 'A letter', sender: 'Shiblings' })
    now += 1000
    await cap.mailTo(UID, { subject: 'Coin', body: 'With coin', sender: 'Shiblings' })
    s.mail[1].attachment_gems = 25; s.mail[1].attachment_doubloons = 300
    const inbox = await dailies.getInbox(db, UID, '')
    if (inbox.messages.length !== 2 || inbox.unreadCount !== 2 || inbox.messages[0].subject !== 'Coin') fail('the inbox is not newest first with both unread')
    await dailies.markMailRead(db, UID, inbox.messages[1].id)
    const firstRead = s.mail[0].read_at
    await dailies.markMailRead(db, UID, inbox.messages[1].id)
    if ((await dailies.getMailUnreadCount(db, UID, '')) !== 1 || s.mail[0].read_at !== firstRead) fail('a read did not stick (or moved)')
    if ((await dailies.claimMailAttachment(db, UID, s.mail[0].id)).ok !== false) fail('a letter with nothing in it paid')
    if ((await dailies.claimMailAttachment(db, UID, 'nope')).ok !== false) fail('a made-up letter paid')
    const g0 = Number(s.profile.gems), d0 = Number(s.profile.doubloons)
    const cl = await dailies.claimMailAttachment(db, UID, s.mail[1].id)
    if (!cl.ok || s.profile.gems !== g0 + 25 || s.profile.doubloons !== d0 + 300 || cl.newGems !== g0 + 25) fail('the attachment did not pay')
    const again = await dailies.claimMailAttachment(db, UID, s.mail[1].id)
    if (again.ok || again.error !== 'already_claimed' || s.profile.gems !== g0 + 25) fail('an attachment paid twice')
    if ((await dailies.getMailUnreadCount(db, UID, '')) !== 0) fail('claiming did not count as reading')
    await cap.mailTo(UID, { subject: 'More', body: 'Another', sender: 'Shiblings' })
    const all = await dailies.markAllMailRead(db, UID, '')
    if (all.count !== 1 || (await dailies.getMailUnreadCount(db, UID, '')) !== 0) fail('"mark all" missed a letter')
    console.log('  mail: the game\'s letters, read once, "mark all", an attachment paid once')
  }

  // ── 6. Contests ──
  {
    const s = freshSave(); const db = localDailyData(s)
    const c = CONTESTS[0]
    if (c) {
      if ((await dailies.getContestsView(db, UID))[c.id]?.winner) fail('an unwon contest showed a winner')
      s.contests[c.id] = UID; s.contestsWonAt[c.id] = iso()
      const v = (await dailies.getContestsView(db, UID))[c.id]
      if (v?.winner?.username !== 'Offline Captain' || v.winner.wonAt !== iso()) fail('a won contest did not show its winner')
    }
    await dailies.markContestsSeen(db, UID)
    if (s.profile.has_seen_contests !== true) fail('the contests pulse did not clear')
    console.log(`  contests: ${CONTESTS.length} on the board, this captain as winner and standings`)
  }
} finally {
  installRng(null); installClock(null)
}

// ── 7. The save file ──
{
  const s = freshSave()
  const v9 = JSON.parse(serializeSave(s))
  const { bounty: _b, bountyHistory: _h, contestsWonAt: _c, ...rest } = v9.save
  void _b; void _h; void _c
  const bare = { ...rest.profile }
  for (const k of Object.keys(DAILY_PROFILE_DEFAULTS)) delete bare[k]
  const v8 = { ...rest, profile: bare, mail: [{ subject: 'Old', body: 'An old letter', sender: 'Shiblings' }] }
  const up = deserializeSave(JSON.stringify({ format: LOCAL_SAVE_FORMAT, version: 8, savedAt: '2026-09-01T00:00:00.000Z', save: v8, carried: {} }), SPECIES).save
  if (up.bounty !== null || !Array.isArray(up.bountyHistory) || up.profile.bounty_rung_seen !== 0 || up.mail[0]?.subject !== 'Old' || !up.mail[0].id || up.mail[0].read_at !== null) fail('a version 8 save did not upgrade to 9 with its letters')
  const { save } = fromWebExport({
    format: 'x', version: 1, userId: 'w', username: null, profile: {},
    tables: {
      bounty_progress: [{ user_id: 'w', date: '2026-09-28', bounty_ids: ['x'], baselines: { x: 3 }, claimed: [true], assigned_at: '2026-09-28T01:00:00Z', reroll_used: true }],
      bounty_board_history: [{ date: '2026-09-27', bounty_ids: ['y'], claimed: [false], reroll_used: false }],
      mail_reads: [{ message_id: 'm', read_at: '2026-09-01' }],
    },
  }, SPECIES)
  if (save.bounty?.date !== '2026-09-28' || save.bounty.baselines.x !== 3 || save.bountyHistory.length !== 1 || save.profile.bounty_points !== 0) fail('a web export\'s bounty board did not convert')
}

console.log(`\n  Offline daily loop: no server on the path, bounties, the daily challenges, the Daily Haul, mail, contests, save v9 ${failed ? `${failed} FAILED` : 'ok'}.`)
process.exit(failed ? 1 : 0)
