// THE PARLOR'S OFFLINE QUESTION BANK (Steam prep, 2026-09-29).
//
// On the web the Parlor's questions are written weekly by Claude and cached in
// trivia_boards, trivia_capstan and trivia_ladders. The offline game cannot call
// out, so it plays from a bank of the weeks already written, shipped in
// content/trivia.json and rotated by week (lib/triviaBank).
//
// This refreshes the bank from production: every week that passes the same
// shape checks the generators apply (12 board tiles, one per category and tier;
// a 10-rung ladder; capstan phrases of A-Z and spaces). Reads only. Re-run it
// before a desktop build to ship the newest weeks.
//
//   npx tsx scripts/export-trivia-bank.mts

import fs from 'fs'
import path from 'path'

const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  .split(/\r?\n/).filter(l => /^\w+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
Object.assign(process.env, env)

const { createAdminClient } = await import('../lib/supabase/admin')
const { PIRATE_KING_RUNGS } = await import('../app/(app)/tavern/trivia/constants')
const admin = createAdminClient()

type Q = { question: string; options: string[]; correct_index: number; explanation: string }
const okQ = (q: Q) => typeof q?.question === 'string' && q.question && Array.isArray(q.options) && q.options.length === 4
  && q.options.every(o => typeof o === 'string' && o) && new Set(q.options.map(o => o.trim().toLowerCase())).size === 4
  && Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index <= 3 && typeof q.explanation === 'string' && !!q.explanation

const [{ data: boards }, { data: capstan }, { data: ladders }] = await Promise.all([
  admin.from('trivia_boards').select('date, board').order('date'),
  admin.from('trivia_capstan').select('date, puzzles').order('date'),
  admin.from('trivia_ladders').select('date, ladder').order('date'),
])

const goodBoards = (boards ?? []).filter(r => {
  const b = r.board as (Q & { category: string; tier: number })[]
  return Array.isArray(b) && b.length === 12 && b.every(okQ) && new Set(b.map(t => `${t.category}-${t.tier}`)).size === 12
})
const goodLadders = (ladders ?? []).filter(r => {
  const l = r.ladder as Q[]
  return Array.isArray(l) && l.length === PIRATE_KING_RUNGS && l.every(okQ)
})
const goodCapstan = (capstan ?? []).filter(r => {
  const p = r.puzzles as { category: string; phrase: string }[]
  return Array.isArray(p) && p.length > 0 && p.every(x => typeof x.category === 'string' && /^[A-Z ]+$/.test(String(x.phrase ?? '').toUpperCase().trim()))
})

// Keep the questions apart: a week whose board shares a question with an
// earlier kept week is dropped, so the rotation never serves the same card twice.
const seen = new Set<string>()
const distinct = <T,>(rows: T[], qs: (r: T) => string[]) => rows.filter(r => {
  const list = qs(r).map(q => q.trim().toLowerCase())
  if (list.some(q => seen.has(q))) return false
  list.forEach(q => seen.add(q))
  return true
})
const bank = {
  exported: new Date().toISOString().slice(0, 10),
  boards: distinct(goodBoards, r => (r.board as Q[]).map(q => q.question)).map(r => r.board),
  ladders: distinct(goodLadders, r => (r.ladder as Q[]).map(q => q.question)).map(r => r.ladder),
  capstan: goodCapstan.map(r => r.puzzles),
}

const out = path.join(process.cwd(), 'content', 'trivia.json')
fs.writeFileSync(out, JSON.stringify(bank) + '\n')
console.log(`  ${bank.boards.length} boards (of ${boards?.length ?? 0}), ${bank.ladders.length} ladders (of ${ladders?.length ?? 0}), ${bank.capstan.length} capstan sets (of ${capstan?.length ?? 0}) -> content/trivia.json, ${Math.round(fs.statSync(out).size / 1024)} KB`)
