// THE PARLOR, OFFLINE (Steam prep, 2026-09-29).
//
// Runs the REAL Parlor paths (lib/core/parlor) against a LOCAL save
// (lib/data/local/triviaLocal) and the shipped question bank, with no network:
//   1. the import trees of the core and the local store hold nothing of the
//      server (no Claude, no Supabase);
//   2. the bank: every week's board, ladder and capstan set is whole, and the
//      rotation hands each week a real entry and moves on each Monday;
//   3. the Captain's Board: a card a day (two for members), revealed before it
//      can be answered, paid once, forfeited if not answered the same day, a
//      late answer a miss, the streak and points;
//   4. Spin the Capstan: Captain-only, the wheel rolled here, a letter tried
//      once, vowels bought from the bank, a solve paid once;
//   5. the Pirate King: a rung revealed before it is answered, the ladder
//      climbed to the crown, a bust to its haven, the 50/50 once, walking away;
//   6. the Parlor's rank: every rank reached claimed once, in order;
//   7. the save file: version 9 upgrades to 10, and a web export's attempts
//      convert.
//
//   npx tsx scripts/check-offline-parlor.mts

import fs from 'fs'
import path from 'path'
import * as parlor from '../lib/core/parlor'
import { localTriviaData } from '../lib/data/local/triviaLocal'
import { freshCasino, SHIP_PROFILE_DEFAULTS, DAILY_PROFILE_DEFAULTS, PARLOR_PROFILE_DEFAULTS, type LocalSave } from '../lib/data/local/save'
import { deserializeSave, serializeSave, fromWebExport, LOCAL_SAVE_FORMAT } from '../lib/data/local/saveFile'
import type { SpeciesRow } from '../lib/data/fishingData'
import { installRng, mulberry32 } from '../lib/rng'
import { installClock } from '../lib/clock'
import { TRIVIA_BANK, bankFor } from '../lib/triviaBank'
import {
  TRIVIA_TIER_VALUES, TRIVIA_ANSWER_SECONDS, TRIVIA_TIMER_GRACE_MS, PIRATE_KING_PRIZES, PIRATE_KING_RUNGS, PARLOR_RANKS,
  CAPSTAN_VOWEL_COST, CAPSTAN_MAX_STRIKES, kingWeekStr, kingHavenValue, triviaTileKey, normalizeCapstan, isCapstanVowel, rankGemsTotalFor,
} from '../app/(app)/tavern/trivia/constants'

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
for (const entry of ['lib/core/parlor.ts', 'lib/data/local/triviaLocal.ts']) {
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
      ...structuredClone(SHIP_PROFILE_DEFAULTS), ...structuredClone(DAILY_PROFILE_DEFAULTS), ...structuredClone(PARLOR_PROFILE_DEFAULTS),
      username: 'Offline Captain', doubloons: 0, gems: 0, is_admin: false, unlocked_badges: [],
      ...over,
    },
    species: SPECIES,
    bait: {}, hold: {}, collection: {}, lifetime: {}, bests: {}, shinies: [], daily: {},
    clears: [], rods: [0], ledger: [], anomalies: [], mail: [], rapport: [], contests: {}, overrides: {},
    deals: [], market: null, crew: [], recruits: [], bunks: [], nextId: 1, voyages: [], trawls: [],
    depthBests: {}, gauntletRuns: [], bountyEvents: [], casino: freshCasino(), raidTokens: [], raidClears: [],
    bounty: null, bountyHistory: [], contestsWonAt: {}, trivia: { board: {}, capstan: {}, ladder: {} }, charting: { boards: { match: {}, minefield: {}, sudoku: {}, rigging: {} }, match: {}, minefield: {}, rigging: {}, hold: {} }, digs: [], discoveries: [], homestead: null,
  }
}
const isErr = (r: object) => 'error' in r

let now = T0
installRng(mulberry32(12)); installClock(() => now)
const week = () => kingWeekStr(new Date(now))

try {
  // ── 2. The bank ──
  {
    const { boards, ladders, capstan } = TRIVIA_BANK
    if (boards.length < 4 || ladders.length < 4 || capstan.length < 4) fail(`the bank is thin: ${boards.length} boards, ${ladders.length} ladders, ${capstan.length} capstan sets`)
    const q4 = (q: { options: string[]; correct_index: number }) => q.options.length === 4 && q.correct_index >= 0 && q.correct_index <= 3
    if (!boards.every(b => b.length === 12 && b.every(q4) && new Set(b.map(t => triviaTileKey(t.category, t.tier))).size === 12)) fail('a board in the bank is not twelve whole cards')
    if (!ladders.every(l => l.length === PIRATE_KING_RUNGS && l.every(q4))) fail('a ladder in the bank is not ten whole rungs')
    if (!capstan.every(c => c.length > 0 && c.every(p => /^[A-Z ]+$/.test(normalizeCapstan(p.phrase))))) fail('a capstan phrase in the bank is not letters and spaces')
    const w0 = week()
    const nextWeek = kingWeekStr(new Date(now + 7 * DAY))
    if (bankFor(boards, w0) === bankFor(boards, nextWeek) && boards.length > 1) fail('the board did not move on with the week')
    if (bankFor(boards, w0) !== bankFor(boards, kingWeekStr(new Date(now + DAY)))) fail('the board changed mid-week')
    const seenWeeks = new Set(Array.from({ length: boards.length }, (_, i) => boards.indexOf(bankFor(boards, kingWeekStr(new Date(now + i * 7 * DAY)))!)))
    if (seenWeeks.size !== boards.length) fail('the rotation skips boards')
    console.log(`  the bank (${TRIVIA_BANK.exported}): ${boards.length} boards, ${ladders.length} ladders, ${capstan.length} capstan sets, one a week in turn`)
  }

  // ── 3. The Captain's Board ──
  {
    now = T0
    const s = freshSave(); const db = localTriviaData(s)
    const board = bankFor(TRIVIA_BANK.boards, week())!
    const st = await parlor.getCaptainsBoardState(db, UID)
    if (isErr(st) || st.tiles.length !== 12 || st.tiles.some(t => t.question !== null)) fail('the board showed a question before a card was chosen')
    const [t1, t2, t3] = board
    const k1 = triviaTileKey(t1.category, t1.tier), k2 = triviaTileKey(t2.category, t2.tier), k3 = triviaTileKey(t3.category, t3.tier)
    if (!isErr(await parlor.answerCaptainsTile(db, UID, k1, t1.correct_index))) fail('a card was answered before it was chosen')
    const played = await parlor.playCaptainsCard(db, UID, k1)
    if (isErr(played) || played.tiles.find(t => t.key === k1)?.question !== t1.question || played.tiles.filter(t => t.question).length !== 1) fail('choosing a card did not reveal only that card')
    if (!isErr(await parlor.playCaptainsCard(db, UID, k2))) fail('a second card was revealed before the first was answered')
    const again = await parlor.playCaptainsCard(db, UID, k1)
    if (isErr(again) || again.committedAt !== (played as { committedAt: string }).committedAt) fail('a refresh reset the card\'s clock')
    now += 2000
    const ans = await parlor.answerCaptainsTile(db, UID, k1, t1.correct_index)
    const value = TRIVIA_TIER_VALUES[t1.tier - 1]
    if (isErr(ans) || !ans.correct || s.profile.doubloons !== value || s.profile.parlor_streak !== 1 || ans.pointsEarned < 1) fail('a right answer did not pay its value, streak and points')
    if (!isErr(await parlor.answerCaptainsTile(db, UID, k1, t1.correct_index)) || s.profile.doubloons !== value) fail('a card paid twice')
    if (!isErr(await parlor.playCaptainsCard(db, UID, k2))) fail('a second card was played in one day')
    // Tomorrow: a card chosen and left unanswered is forfeited the day after.
    now += DAY
    await parlor.playCaptainsCard(db, UID, k2)
    now += DAY
    if (!isErr(await parlor.answerCaptainsTile(db, UID, k2, t2.correct_index))) fail('yesterday\'s card was answered today')
    const st3 = await parlor.getCaptainsBoardState(db, UID)
    if (isErr(st3) || !st3.tiles.find(t => t.key === k2)?.spent) fail('an unanswered card was not forfeited')
    // A late answer is a miss, and it breaks the streak.
    await parlor.playCaptainsCard(db, UID, k3)
    now += (TRIVIA_ANSWER_SECONDS + 1) * 1000 + TRIVIA_TIMER_GRACE_MS
    const late = await parlor.answerCaptainsTile(db, UID, k3, t3.correct_index)
    if (isErr(late) || late.correct || !late.timedOut || s.profile.parlor_streak !== 0 || s.profile.doubloons !== value) fail('a late answer was paid')
    // Members pick twice a day.
    const m = freshSave({ is_premium: true }); const mdb = localTriviaData(m)
    now = T0
    await parlor.playCaptainsCard(mdb, UID, k1); await parlor.answerCaptainsTile(mdb, UID, k1, 0)
    if (isErr(await parlor.playCaptainsCard(mdb, UID, k2))) fail('a member did not get a second pick')
    if (!isErr(await parlor.playCaptainsCard(mdb, UID, k3))) fail('a member got a third pick')
    // The race guard itself: an answer over answers that have moved on is refused.
    const wk = week()
    const cur = m.trivia.board[wk]
    if (await mdb.recordBoardAnswer(UID, wk, {}, { ...cur, doubloons_awarded: 99_999 })) fail('an answer landed over answers that had moved on')
    console.log('  the Captain\'s Board: a card a day (two for members), revealed then answered once, forfeited overnight, a late answer a miss')
  }

  // ── 4. Spin the Capstan ──
  {
    now = T0
    const free = freshSave(); const fdb = localTriviaData(free)
    if (!isErr(await parlor.getCapstanState(fdb, UID))) fail('the capstan opened for a captain who is not a member')
    const s = freshSave({ is_premium: true }); const db = localTriviaData(s)
    const set = bankFor(TRIVIA_BANK.capstan, week())!
    const st = await parlor.getCapstanState(db, UID)
    if (isErr(st) || st.puzzles.length !== set.length || st.puzzles.some(p => p.phrase !== null)) fail('the capstan showed a phrase unsolved')
    const phrase = normalizeCapstan(set[0].phrase)
    const consonants = Array.from(new Set(phrase.replace(/ /g, '').split(''))).filter(c => !isCapstanVowel(c))
    if (!isErr(await parlor.callConsonant(db, UID, 0, consonants[0]))) fail('a letter was called before a spin')
    // Spin until a value wedge arms a call, then call the letters in.
    let calls = 0
    for (let guard = 0; guard < 60 && calls < consonants.length; guard++) {
      const sp = await parlor.spinCapstan(db, UID, 0)
      if (isErr(sp)) { if ((sp as { error: string }).error.includes('finished')) break; fail(`a spin was refused: ${(sp as { error: string }).error}`); break }
      if (sp.puzzle.status !== 'active') break
      if (sp.outcome !== 'value') continue
      if (!isErr(await parlor.spinCapstan(db, UID, 0))) fail('the capstan spun twice without a call')
      const c = await parlor.callConsonant(db, UID, 0, consonants[calls++])
      if (isErr(c) || c.count < 1 || c.gained !== (sp.wedge as number) * c.count) fail('a called letter did not bank its value')
    }
    const run = s.trivia.capstan[week()]?.runs['0']
    if (!run) fail('the capstan kept no run')
    else if (run.status === 'active') {
      if (run.called.length && !isErr(await parlor.spinCapstan(db, UID, 0).then(async sp => 'error' in sp || sp.outcome !== 'value' ? { error: 'skip' } : parlor.callConsonant(db, UID, 0, run.called[0])))) fail('a letter was called twice')
      const bank0 = s.trivia.capstan[week()].runs['0'].bank
      const vowel = ['A', 'E', 'I', 'O', 'U'].find(v => !s.trivia.capstan[week()].runs['0'].called.includes(v))
      const pending = s.trivia.capstan[week()].runs['0'].pendingValue
      if (vowel && bank0 >= CAPSTAN_VOWEL_COST && pending === null) {
        const v = await parlor.buyVowel(db, UID, 0, vowel)
        if (isErr(v) || s.trivia.capstan[week()].runs['0'].bank !== bank0 - CAPSTAN_VOWEL_COST) fail('a vowel did not cost its fee')
      }
      if (s.trivia.capstan[week()].runs['0'].pendingValue !== null) {
        const extra = 'BCDFGHJKLMNPQRSTVWXYZ'.split('').find(c => !s.trivia.capstan[week()].runs['0'].called.includes(c))!
        await parlor.callConsonant(db, UID, 0, extra)
      }
      if (s.trivia.capstan[week()].runs['0'].status === 'active') {
        const bank = s.trivia.capstan[week()].runs['0'].bank
        const d0 = Number(s.profile.doubloons)
        const wrong = await parlor.solveCapstan(db, UID, 0, 'NOT THE PHRASE AT ALL')
        const strikes = s.trivia.capstan[week()].runs['0'].strikes
        if (isErr(wrong) || wrong.correct) fail('a wrong solve was taken')
        if (s.trivia.capstan[week()].runs['0'].status === 'active') {
          const solved = await parlor.solveCapstan(db, UID, 0, phrase.toLowerCase())
          if (isErr(solved) || !solved.correct || s.profile.doubloons !== d0 + bank || solved.puzzle.phrase !== phrase) fail('the solve did not bank the round')
          if (!isErr(await parlor.solveCapstan(db, UID, 0, phrase)) || s.profile.doubloons !== d0 + bank) fail('a solved phrase paid twice')
        } else if (strikes < CAPSTAN_MAX_STRIKES) fail('the run failed short of its strikes')
      }
    }
    // A solve, set up so it is not left to the wheel: the second phrase with a
    // known bank. A wrong guess is a strike; the right one banks the round, once.
    if (set.length > 1) {
      const w = week()
      s.trivia.capstan[w] ??= { runs: {}, doubloons_awarded: 0 }
      s.trivia.capstan[w].runs['1'] = { called: [], bank: 700, strikes: 0, status: 'active', pendingValue: null, earned: 0, hazardRun: 0 }
      const p1 = normalizeCapstan(set[1].phrase)
      const d0 = Number(s.profile.doubloons), pts0 = Number(s.profile.parlor_points)
      const wrong = await parlor.solveCapstan(db, UID, 1, 'NOT THE PHRASE AT ALL')
      if (isErr(wrong) || wrong.correct || s.trivia.capstan[w].runs['1'].strikes !== 1 || s.profile.doubloons !== d0) fail('a wrong solve was not a strike')
      const solved = await parlor.solveCapstan(db, UID, 1, p1.toLowerCase())
      if (isErr(solved) || !solved.correct || s.profile.doubloons !== d0 + 700 || solved.puzzle.phrase !== p1 || s.profile.parlor_points !== pts0 + solved.pointsEarned || solved.pointsEarned < 1) fail('the solve did not bank the round and its points')
      if (!isErr(await parlor.solveCapstan(db, UID, 1, p1)) || s.profile.doubloons !== d0 + 700) fail('a solved phrase paid twice')
    } else fail('the week\'s capstan set has one phrase; the solve went untested')
    // The race guard itself: a save over runs that have moved on is refused.
    if (await db.saveCapstanRuns(UID, week(), {}, 0, JSON.stringify({}))) fail('the capstan saved over runs that had moved on')
    if (await db.saveCapstanRuns(UID, week(), {}, 0, null)) fail('the capstan inserted a second first row')
    console.log('  Spin the Capstan: members only, the wheel rolled here, letters banked once, a vowel for its fee, a solve paid once')
  }

  // ── 5. The Pirate King ──
  {
    now = T0
    const s = freshSave(); const db = localTriviaData(s)
    const ladder = bankFor(TRIVIA_BANK.ladders, week())!
    const st = await parlor.getPirateKingState(db, UID)
    if (isErr(st) || st.current !== null || st.rung !== 0) fail('the ladder showed a question before it was revealed')
    if (!isErr(await parlor.walkKingAway(db, UID))) fail('a run walked away before a rung')
    for (let r = 0; r < PIRATE_KING_RUNGS; r++) {
      const rev = await parlor.startKingRung(db, UID)
      if (isErr(rev) || rev.current.question !== ladder[r].question) { fail(`rung ${r + 1} did not reveal its question`); break }
      if (r === 2) {
        const ff = await parlor.spendKingFiftyFifty(db, UID)
        if (isErr(ff) || ff.removed.length !== 2 || ff.removed.includes(ladder[r].correct_index)) fail('the 50/50 struck the answer')
        if (!isErr(await parlor.spendKingFiftyFifty(db, UID))) fail('the 50/50 was spent twice')
        if (!isErr(await parlor.answerKingRung(db, UID, r, (ff as { removed: number[] }).removed[0]))) fail('a struck option was taken')
      }
      now += 1000
      const a = await parlor.answerKingRung(db, UID, r, ladder[r].correct_index)
      if (isErr(a) || !a.correct) { fail(`rung ${r + 1} was not climbed`); break }
      if (!isErr(await parlor.answerKingRung(db, UID, r, ladder[r].correct_index))) fail(`rung ${r + 1} was answered twice`)
    }
    if (s.trivia.ladder[week()]?.status !== 'crowned' || s.profile.doubloons !== PIRATE_KING_PRIZES[PIRATE_KING_RUNGS - 1]) fail('the crown did not pay the top prize')
    if (!isErr(await parlor.startKingRung(db, UID))) fail('a crowned run went on')
    // A bust falls to its haven; a walk takes the rung's prize.
    const b = freshSave(); const bdb = localTriviaData(b)
    for (let r = 0; r < 5; r++) { await parlor.startKingRung(bdb, UID); await parlor.answerKingRung(bdb, UID, r, ladder[r].correct_index) }
    await parlor.startKingRung(bdb, UID)
    const bust = await parlor.answerKingRung(bdb, UID, 5, (ladder[5].correct_index + 1) % 4)
    if (isErr(bust) || bust.status !== 'busted' || b.profile.doubloons !== kingHavenValue(5)) fail('a bust did not fall to its haven')
    const w = freshSave(); const wdb = localTriviaData(w)
    for (let r = 0; r < 3; r++) { await parlor.startKingRung(wdb, UID); await parlor.answerKingRung(wdb, UID, r, ladder[r].correct_index) }
    const walk = await parlor.walkKingAway(wdb, UID)
    if (isErr(walk) || w.profile.doubloons !== PIRATE_KING_PRIZES[2] || !isErr(await parlor.walkKingAway(wdb, UID))) fail('walking away did not pay once')
    // The race guards themselves: a move from a state the run has left is refused.
    const run = w.trivia.ladder[week()]
    if (await wdb.advanceLadder(UID, week(), { ...run, status: 'active' }, { status: 'busted' })) fail('the ladder moved from a status it had left')
    if (await wdb.advanceLadder(UID, week(), null, { rung: 0 })) fail('the ladder inserted a second first row')
    const f = freshSave(); const fdb2 = localTriviaData(f)
    await parlor.startKingRung(fdb2, UID); await parlor.spendKingFiftyFifty(fdb2, UID)
    const fr = f.trivia.ladder[week()]
    if (await fdb2.advanceLadder(UID, week(), { ...fr, fifty: null }, { fifty: { rung: 0, removed: [0, 1] } })) fail('a second 50/50 landed over a spent one')
    // Next week is a new run.
    now += 7 * DAY
    const nx = await parlor.getPirateKingState(db, UID)
    if (isErr(nx) || nx.status !== 'active' || nx.rung !== 0) fail('next week\'s ladder did not open')
    console.log(`  the Pirate King: revealed then answered, crowned for ${PIRATE_KING_PRIZES[PIRATE_KING_RUNGS - 1]}, a bust to its haven, the 50/50 once, a walk paid once`)
  }

  // ── 6. The Parlor's rank ──
  {
    const top = PARLOR_RANKS[PARLOR_RANKS.length - 1]
    const s = freshSave({ parlor_points: 100_000 }); const db = localTriviaData(s)
    let n = 0
    while (!isErr(await parlor.claimParlorRank(db, UID)) && n < 50) n++
    if (s.profile.gems !== rankGemsTotalFor(100_000) || s.profile.parlor_rank_gems_awarded !== rankGemsTotalFor(100_000)) fail('the ranks did not pay their gems once each')
    const none = freshSave(); if (!isErr(await parlor.claimParlorRank(localTriviaData(none), UID))) fail('a rank was claimed with no points')
    await parlor.markParlorGuideSeen(db, UID)
    if (s.profile.has_seen_parlor_guide !== true) fail('the guide did not stay seen')
    console.log(`  the Parlor's rank: ${n} ranks claimed once each up to ${top.title}`)
  }
} finally {
  installRng(null); installClock(null)
}

// ── 7. The save file ──
{
  const s = freshSave()
  const v10 = JSON.parse(serializeSave(s))
  const { trivia: _t, ...rest } = v10.save
  void _t
  const bare = { ...rest.profile }
  for (const k of Object.keys(PARLOR_PROFILE_DEFAULTS)) delete bare[k]
  const up = deserializeSave(JSON.stringify({ format: LOCAL_SAVE_FORMAT, version: 9, savedAt: '', save: { ...rest, profile: bare }, carried: {} }), SPECIES).save
  if (!up.trivia || up.profile.parlor_points !== 0 || up.profile.parlor_rank_gems_awarded !== 0) fail('a version 9 save did not upgrade to 10')
  const { save } = fromWebExport({
    format: 'x', version: 1, userId: 'w', username: null, profile: { parlor_points: 40 },
    tables: {
      trivia_board_attempts: [{ date: '2026-09-28', answers: { 'fish-1': { day: '2026-09-28', chosen: 1, correct: true } }, doubloons_awarded: 50, gems_awarded: 0 }],
      trivia_ladder_attempts: [{ date: '2026-09-28', rung: 3, status: 'active', fifty: null, doubloons_awarded: 0, current_started_at: null }],
      trivia_capstan_attempts: [{ date: '2026-09-28', runs: { 0: { called: ['T'], bank: 300, strikes: 0, status: 'active', pendingValue: null, earned: 0 } }, doubloons_awarded: 0 }],
    },
  }, SPECIES)
  if (save.trivia.board['2026-09-28']?.doubloons_awarded !== 50 || save.trivia.ladder['2026-09-28']?.rung !== 3 || save.trivia.capstan['2026-09-28']?.runs['0']?.bank !== 300 || save.profile.parlor_points !== 40) fail('a web export\'s Parlor did not convert')
}

console.log(`\n  Offline Parlor: no server on the path, the bank, the Board, the Capstan, the King, the rank, save v10 ${failed ? `${failed} FAILED` : 'ok'}.`)
process.exit(failed ? 1 : 0)
