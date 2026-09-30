// THE CHART ROOM, OFFLINE (Steam prep, 2026-09-29).
//
// Runs the REAL Chart Room paths (lib/core/chartRoom) against a LOCAL save
// (lib/data/local/chartLocal), with no network:
//   1. the import trees of the core and the local store hold nothing of the
//      server;
//   2. the boards: the save builds each week's four boards once and keeps them
//      (the same board all week, a new one next week), seeded dice give the
//      same boards;
//   3. Treasure Match: an honest run played swap by swap through the engine,
//      replayed and banked by its tier once; a forged swap and an overlong run
//      refused and flagged;
//   4. the Minefield: a bust resets to the opening, flags toggle, a full clear
//      banks its points once;
//   5. the Hold: a tally flags wrong cells and costs the clean bonus, a wrong
//      submit counts as a tally, a solve pays once, all four;
//   6. the Rigging: an unsolved submit saves progress, the solve banks once;
//   7. the World Chart: a landmark claimed once when discovered, the whole
//      chart's completion bonus once;
//   8. every store guard refuses a write from a state that has moved on;
//   9. the save file: version 10 upgrades to 11, and a web export keeps what
//      was banked and drops half-done grids.
//
//   npx tsx scripts/check-offline-chartroom.mts

import fs from 'fs'
import path from 'path'
import * as chart from '../lib/core/chartRoom'
import { localChartData } from '../lib/data/local/chartLocal'
import { freshCasino, freshCharting, SHIP_PROFILE_DEFAULTS, DAILY_PROFILE_DEFAULTS, PARLOR_PROFILE_DEFAULTS, CHARTING_PROFILE_DEFAULTS, type LocalSave } from '../lib/data/local/save'
import { deserializeSave, serializeSave, fromWebExport, LOCAL_SAVE_FORMAT } from '../lib/data/local/saveFile'
import type { SpeciesRow } from '../lib/data/fishingData'
import { installRng, mulberry32, withRng } from '../lib/rng'
import { installClock } from '../lib/clock'
import { buildMinefieldLayout } from '../lib/chartBoards'
import { LANDMARKS, WORLD_CHART_COMPLETION_BONUS } from '../lib/worldChart'
import { makeRng, initialBoard, resolveSwap, hasValidMove, reshuffle, areAdjacent } from '../app/(app)/charting/treasureMatch'
import { WILD_DROP_CHANCE, matchWeekStr, pointsForScore } from '../app/(app)/charting/constants'
import { MINEFIELD_POINTS, minefieldWeekStr } from '../app/(app)/charting/minefieldConstants'
import { HOLD_DIFFICULTIES, holdPayout, holdPoints, holdWeekStr } from '../app/(app)/tavern/chart-room/hold/constants'
import { RIGGING_COLS, RIGGING_ROWS, RIGGING_COLORS, RIGGING_POINTS, riggingWeekStr } from '../app/(app)/tavern/chart-room/rigging/constants'
import { generateBoard as generateRigging } from '../app/(app)/tavern/chart-room/rigging/rigging'

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
for (const entry of ['lib/core/chartRoom.ts', 'lib/data/local/chartLocal.ts']) {
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
const T0 = Date.parse('2026-09-29T09:00:00.000Z')   // a Tuesday
function freshSave(over: Record<string, unknown> = {}): LocalSave {
  return {
    uid: UID,
    profile: {
      ...structuredClone(SHIP_PROFILE_DEFAULTS), ...structuredClone(DAILY_PROFILE_DEFAULTS), ...structuredClone(PARLOR_PROFILE_DEFAULTS), ...structuredClone(CHARTING_PROFILE_DEFAULTS),
      username: 'Offline Captain', doubloons: 0, gems: 0, is_admin: false, unlocked_badges: [],
      ...over,
    },
    species: SPECIES,
    bait: {}, hold: {}, collection: {}, lifetime: {}, bests: {}, shinies: [], daily: {},
    clears: [], rods: [0], ledger: [], anomalies: [], mail: [], rapport: [], contests: {}, overrides: {},
    deals: [], market: null, crew: [], recruits: [], bunks: [], nextId: 1, voyages: [], trawls: [],
    depthBests: {}, gauntletRuns: [], bountyEvents: [], casino: freshCasino(), raidTokens: [], raidClears: [],
    bounty: null, bountyHistory: [], contestsWonAt: {}, trivia: { board: {}, capstan: {}, ladder: {} }, charting: freshCharting(), digs: [], discoveries: [], homestead: null,
  }
}
const isErr = (r: object) => 'error' in r

let now = T0
installRng(mulberry32(13)); installClock(() => now)
const d = () => new Date(now)

try {
  // ── 2. The boards ──
  {
    const s = freshSave(); const db = localChartData(s)
    const m1 = await db.weeklyMinefield(minefieldWeekStr(d()))
    const m2 = await db.weeklyMinefield(minefieldWeekStr(d()))
    now += DAY
    const m3 = await db.weeklyMinefield(minefieldWeekStr(d()))
    if (!m1 || JSON.stringify(m1) !== JSON.stringify(m2) || JSON.stringify(m1) !== JSON.stringify(m3)) fail('the Minefield changed within the week')
    now += 7 * DAY
    const m4 = await db.weeklyMinefield(minefieldWeekStr(d()))
    if (!m4 || JSON.stringify(m4.mines) === JSON.stringify(m1!.mines)) fail('next week did not bring a new Minefield')
    const [match, sudoku, rigging] = await Promise.all([db.weeklyMatch(matchWeekStr(d())), db.weeklySudoku(holdWeekStr(d())), db.weeklyRigging(riggingWeekStr(d()))])
    if (!match || !sudoku || HOLD_DIFFICULTIES.some(k => !sudoku[k]?.solution) || !rigging || rigging.pairs.length !== RIGGING_COLORS) fail('a week\'s boards were not all built')
    const a = withRng(mulberry32(99), () => buildMinefieldLayout()), b = withRng(mulberry32(99), () => buildMinefieldLayout())
    if (JSON.stringify(a) !== JSON.stringify(b)) fail('the same dice built different boards')
    console.log('  the boards: all four built by the save once a week and kept; seeded dice build the same board')
  }

  // ── 3. Treasure Match ──
  {
    now = T0
    const s = freshSave(); const db = localChartData(s)
    const built = await db.weeklyMatch(matchWeekStr(d()))
    // Play honestly: each turn, the first swap the engine takes. A board this
    // simple player can score a tier on is looked for (by seed) and placed in
    // the save, so the banking is exercised rather than left to one seed.
    const play = (cfg: NonNullable<typeof built>) => {
      const rng = makeRng(cfg.seed)
      let board = initialBoard(rng, cfg.cols, cfg.rows, cfg.types)
      let movesLeft = cfg.moves, score = 0
      const moves: [number, number][] = []
      while (movesLeft > 0 && score < cfg.target) {
        let done = false
        for (let a = 0; a < cfg.cols * cfg.rows && !done; a++) for (const b of [a + 1, a + cfg.cols]) {
          if (b >= cfg.cols * cfg.rows || !areAdjacent(a, b, cfg.cols)) continue
          const r = resolveSwap(board, a, b, cfg.cols, cfg.rows, cfg.types, rng, WILD_DROP_CHANCE)
          if (!r) continue
          moves.push([a, b]); board = r.finalBoard; score += r.totalGained; movesLeft--; done = true; break
        }
        if (!done) break
        if (score >= cfg.target || movesLeft <= 0) break
        if (!hasValidMove(board, cfg.cols, cfg.rows)) board = reshuffle(rng, cfg.cols, cfg.rows, cfg.types)
      }
      return { moves, score }
    }
    let cfg = built!
    for (let seed = 1; seed < 400 && pointsForScore(Math.floor(play(cfg).score)) < 1; seed++) cfg = { ...built!, seed }
    s.charting.boards.match[matchWeekStr(d())] = cfg
    const st = await chart.getMatchState(db, UID)
    if (isErr(st) || st.seed !== cfg.seed) { fail('the Match did not open on its board') } else {
      const { moves, score } = play(cfg)
      if (pointsForScore(Math.floor(score)) < 1) fail('no board let the simple player reach a tier; the banking went untested')
      const tier = pointsForScore(Math.floor(score))
      const res = await chart.submitMatch(db, UID, moves)
      if (isErr(res) || res.bestScore !== Math.floor(score) || res.tier !== tier || res.pointsWon !== tier || s.profile.puzzle_points !== tier) fail(`an honest run of ${moves.length} swaps did not bank its tier (${score} -> ${tier})`)
      const again = await chart.submitMatch(db, UID, moves)
      if (isErr(again) || again.pointsWon !== 0 || s.profile.puzzle_points !== tier) fail('the same run banked twice')
      const forged = moves.slice(0, 1).map(([a]) => [a, (a + 3) % (st.cols * st.rows)] as [number, number])
      const anomalies = s.anomalies.length
      if (!isErr(await chart.submitMatch(db, UID, forged)) || s.anomalies.length !== anomalies + 1) fail('a forged swap was taken, or not flagged')
      if (!isErr(await chart.submitMatch(db, UID, Array.from({ length: st.moves + 1 }, () => [0, 1] as [number, number])))) fail('an overlong run was taken')
      console.log(`  Treasure Match: an honest run of ${moves.length} swaps replayed to ${Math.floor(score)} and banked ${tier} once; forgeries refused and flagged`)
    }
  }

  // ── 4. The Minefield ──
  {
    now = T0
    const s = freshSave(); const db = localChartData(s)
    const st = await chart.getMinefieldState(db, UID)
    const layout = s.charting.boards.minefield[minefieldWeekStr(d())]
    if (isErr(st) || st.revealed.length !== layout.opening.length) fail('the Minefield did not open on its safe opening')
    const mine = layout.mines[0]
    const safe = Array.from({ length: layout.cols * layout.rows }, (_, i) => i).filter(i => !layout.mines.includes(i))
    const flag = await chart.toggleFlag(db, UID, mine)
    if (isErr(flag) || !flag.flagged.includes(mine)) fail('a flag did not go up')
    await chart.toggleFlag(db, UID, mine)
    const firstSafe = safe.find(i => !layout.opening.includes(i))!
    await chart.revealCell(db, UID, firstSafe)
    const bust = await chart.revealCell(db, UID, mine)
    if (isErr(bust) || !bust.busted || bust.revealed.length !== layout.opening.length || bust.busts !== 1) fail('a bust did not reset to the opening')
    let last: Awaited<ReturnType<typeof chart.revealCell>> | null = null
    for (const i of safe) last = await chart.revealCell(db, UID, i)
    if (!last || isErr(last) || !last.cleared || s.profile.puzzle_points !== MINEFIELD_POINTS) fail('a full clear did not bank its points')
    await chart.revealCell(db, UID, safe[0])
    if (s.profile.puzzle_points !== MINEFIELD_POINTS || s.charting.minefield[minefieldWeekStr(d())].status !== 'cleared') fail('a cleared board banked again or reopened')
    console.log(`  the Minefield: a bust resets to the opening, flags toggle, a clear of ${safe.length} tiles banks ${MINEFIELD_POINTS} once`)
  }

  // ── 5. The Hold ──
  {
    now = T0
    const s = freshSave(); const db = localChartData(s)
    const st = await chart.getHoldState(db, UID)
    if (isErr(st) || st.puzzles.some(p => p.givens.length !== 81 || (p as unknown as { solution?: string }).solution)) fail('the Hold sent more than its givens')
    const set = s.charting.boards.sudoku[holdWeekStr(d())]
    let doubloons = 0, points = 0
    for (const diff of HOLD_DIFFICULTIES) {
      const { givens, solution } = set[diff]
      const clean = diff !== 'medium'
      if (!clean) {
        const blank = givens.indexOf('.')
        const wrongDigit = solution[blank] === '9' ? '1' : '9'
        const guess = givens.slice(0, blank) + wrongDigit + givens.slice(blank + 1)
        const tally = await chart.tallyHold(db, UID, diff, guess)
        if (isErr(tally) || !tally.wrong[blank] || tally.hintsUsed !== 1) fail('a tally did not flag the wrong cell')
        const full = solution.slice(0, blank) + wrongDigit + solution.slice(blank + 1)
        const wrong = await chart.submitHold(db, UID, diff, full)
        if (isErr(wrong) || wrong.correct || wrong.hintsUsed !== 2) fail('a wrong submit did not count as a tally')
      }
      if (!isErr(await chart.submitHold(db, UID, diff, givens))) fail('a hold with gaps was taken')
      const tampered = solution.split('').map((ch, i) => givens[i] !== '.' ? (ch === '1' ? '2' : '1') : ch).join('')
      if (!isErr(await chart.submitHold(db, UID, diff, tampered))) fail('a tampered manifest was taken')
      const ok = await chart.submitHold(db, UID, diff, solution)
      doubloons += holdPayout(diff, clean); points += holdPoints(diff)
      if (isErr(ok) || !ok.correct || ok.clean !== clean || ok.doubloonsWon !== holdPayout(diff, clean)) fail(`the ${diff} hold did not pay as ${clean ? 'clean' : 'tallied'}`)
      if (!isErr(await chart.submitHold(db, UID, diff, solution))) fail(`the ${diff} hold paid twice`)
    }
    if (s.profile.doubloons !== doubloons || s.profile.puzzle_points !== points) fail('the four holds did not pay their doubloons and points')
    if (!(s.profile.unlocked_badges as string[]).includes('clean_manifest')) fail('all four holds did not earn their badge')
    console.log(`  the Hold: tallies flag and cost the clean bonus, four holds solved once each for ${doubloons} and ${points} points`)
  }

  // ── 6. The Rigging ──
  {
    now = T0
    const s = freshSave(); const db = localChartData(s)
    const week = riggingWeekStr(d())
    const built = generateRigging(RIGGING_COLS, RIGGING_ROWS, RIGGING_COLORS)
    s.charting.boards.rigging[week] = { cols: built.cols, rows: built.rows, pairs: built.pairs }
    const st = await chart.getRiggingState(db, UID)
    if (isErr(st) || JSON.stringify(st.pairs) !== JSON.stringify(built.pairs)) fail('the Rigging did not show its board')
    const partial = { 0: built.solution[0] }
    const half = await chart.submitRigging(db, UID, partial)
    if (isErr(half) || half.solved || JSON.stringify(s.charting.rigging[week].paths) !== JSON.stringify(partial)) fail('an unsolved submit did not keep its ropes')
    const paths = Object.fromEntries(built.solution.map((p, color) => [color, p]))
    const done = await chart.submitRigging(db, UID, paths)
    if (isErr(done) || !done.solved || done.pointsWon !== RIGGING_POINTS || s.profile.puzzle_points !== RIGGING_POINTS) fail('the solve did not bank its points')
    const again = await chart.submitRigging(db, UID, paths)
    if (isErr(again) || again.pointsWon !== 0 || s.profile.puzzle_points !== RIGGING_POINTS) fail('the Rigging banked twice')
    await chart.saveRiggingPaths(db, UID, partial)
    if (s.charting.rigging[week].status !== 'cleared') fail('a save reopened a cleared board')
    console.log(`  the Rigging: unsolved ropes kept, the solve banks ${RIGGING_POINTS} once, a cleared board stays cleared`)
  }

  // ── 7. The World Chart ──
  {
    const s = freshSave(); const db = localChartData(s)
    if (!isErr(await chart.claimLandmark(db, UID, LANDMARKS[0].id))) fail('an undiscovered landmark paid')
    s.profile.puzzle_points = Math.max(...LANDMARKS.map(l => l.threshold))
    let gems = 0
    for (const l of LANDMARKS) {
      const r = await chart.claimLandmark(db, UID, l.id)
      gems += l.gems
      if (isErr(r)) { fail(`${l.name} was refused`); continue }
      if (!isErr(await chart.claimLandmark(db, UID, l.id))) fail(`${l.name} paid twice`)
    }
    if (s.profile.gems !== gems + WORLD_CHART_COMPLETION_BONUS) fail('the chart did not pay its landmarks and completion bonus once')
    if (!isErr(await chart.claimLandmark(db, UID, 9999))) fail('a made-up landmark paid')
    await chart.markChartingGuideSeen(db, UID)
    if (s.profile.has_seen_charting_guide !== true) fail('the guide did not stay seen')
    console.log(`  the World Chart: ${LANDMARKS.length} landmarks claimed once each, ${gems + WORLD_CHART_COMPLETION_BONUS} gems with the completion bonus`)
  }

  // ── 8. The store's guards ──
  {
    now = T0
    const s = freshSave(); const db = localChartData(s)
    const w = holdWeekStr(d())
    if (!(await db.saveHold(UID, w, { progress: {}, solved: {}, doubloons_awarded: 0 }, { progress: {}, solved: {}, doubloons_awarded: 0 }))) fail('the first Hold row was not written')
    if (await db.saveHold(UID, w, { progress: {}, solved: {}, doubloons_awarded: 0 }, { progress: {}, solved: {}, doubloons_awarded: 5 })) fail('a second first Hold row was written')
    if (await db.saveHold(UID, w, { progress: {}, solved: {}, doubloons_awarded: 0, updated_at: 'stale' }, { progress: {}, solved: {}, doubloons_awarded: 5 })) fail('the Hold wrote over a row that had moved on')
    if (!(await db.bankMatchTier(UID, w, 0, { status: 'active', best_score: 1300, points_awarded: 1 }))) fail('a first Match tier did not bank')
    if (await db.bankMatchTier(UID, w, 0, { status: 'active', best_score: 1300, points_awarded: 1 })) fail('a Match tier banked from a tier that had moved on')
    await db.raiseMatchBest(UID, w, 10, false)
    if (s.charting.match[w].best_score !== 1300) fail('a lower best score was written')
    const a = { revealed: [], flagged: [], status: 'cleared' as const, points_awarded: 3, busts: 0 }
    if (!(await db.bankMinefield(UID, w, a, false)) || await db.bankMinefield(UID, w, a, true)) fail('the Minefield banked twice')
    await db.saveMinefield(UID, w, { ...a, status: 'active', points_awarded: 0 })
    if (s.charting.minefield[w].points_awarded !== 3) fail('a save wrote over a banked Minefield')
    await db.saveRiggingActive(UID, w, {})
    if (!(await db.clearRigging(UID, w, {}, 3)) || await db.clearRigging(UID, w, {}, 3)) fail('the Rigging cleared twice')
    if (await db.claimLandmarks(UID, [1], [1, 2])) fail('a landmark claim landed over a set that had moved on')
    console.log('  the store: every guard refuses a write from a state that has moved on')
  }
} finally {
  installRng(null); installClock(null)
}

// ── 9. The save file ──
{
  const s = freshSave()
  const v11 = JSON.parse(serializeSave(s))
  const { charting: _c, ...rest } = v11.save
  void _c
  const bare = { ...rest.profile }
  for (const k of Object.keys(CHARTING_PROFILE_DEFAULTS)) delete bare[k]
  const up = deserializeSave(JSON.stringify({ format: LOCAL_SAVE_FORMAT, version: 10, savedAt: '', save: { ...rest, profile: bare }, carried: {} }), SPECIES).save
  if (!up.charting?.boards || up.profile.puzzle_points !== 0 || !Array.isArray(up.profile.charting_landmarks_claimed)) fail('a version 10 save did not upgrade to 11')
  const { save } = fromWebExport({
    format: 'x', version: 1, userId: 'w', username: null, profile: { puzzle_points: 12, charting_landmarks_claimed: [1] },
    tables: {
      treasure_match_attempts: [{ week: '2026-09-28', status: 'active', best_score: 1800, points_awarded: 2 }],
      minefield_attempts: [
        { week: '2026-09-28', revealed: [1, 2, 3], flagged: [], status: 'active', points_awarded: 0, busts: 1 },
        { week: '2026-09-21', revealed: [1, 2], flagged: [], status: 'cleared', points_awarded: 3, busts: 0 },
      ],
      rigging_attempts: [{ week: '2026-09-28', paths: { 0: [1, 2] }, status: 'active', points_awarded: 0 }],
      sudoku_attempts: [{ date: '2026-09-28', progress: { easy: { entries: '1'.repeat(81), hints: 1 } }, solved: { medium: { doubloons: 80, clean: true, points: 2, solved_at: '' } }, doubloons_awarded: 80, updated_at: 'x' }],
    },
  }, SPECIES)
  const c = save.charting
  if (c.match['2026-09-28']?.points_awarded !== 2 || c.minefield['2026-09-28'] || c.minefield['2026-09-21']?.points_awarded !== 3
    || c.rigging['2026-09-28'] || !c.hold['2026-09-28']?.solved.medium || Object.keys(c.hold['2026-09-28'].progress).length
    || save.profile.puzzle_points !== 12) fail('a web export did not keep what was banked and drop the half-done grids')
}

console.log(`\n  Offline Chart Room: no server on the path, the boards, the Match, the Minefield, the Hold, the Rigging, the World Chart, the guards, save v11 ${failed ? `${failed} FAILED` : 'ok'}.`)
process.exit(failed ? 1 : 0)
