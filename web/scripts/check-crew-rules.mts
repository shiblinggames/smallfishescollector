// THE CREW RULES DO WHAT THE GAME PROMISES (Steam prep, Phase B).
//
// Runs lib/crewRules against the real card catalogue (content/cards.json):
//   - the same seed rolls the same board;
//   - the FREE board never carries a Legendary;
//   - a legendary whose chapter is not cleared never rolls, on any board;
//   - the gifted legendary lands in slot 0, pinned to the one named when it is
//     in reach, drawn from those in reach when it is not;
//   - over many boards the rarities land on the published weights;
//   - the Blood Gem gamble never pays a legendary skin or one already owned;
//   - a Crew Hall stint pays only once finished, a hand at the ceiling is
//     freed unpaid, and an open Leviathan offer is never replaced.
//
//   npx tsx scripts/check-crew-rules.mts

import fs from 'fs'
import path from 'path'
import { cardPools, rollRecruitBoard, pickBloodSkin, finishedStints, stintPayouts, leviathanOffer, NEUTRAL_OFFER, type CardRow, type BunkRow } from '../lib/crewRules'
import { FREE_WEIGHTS, GEM_WEIGHTS, groupForSlug } from '../lib/crewGen'
import { ALWAYS_UNLOCKED_LEGENDARIES } from '../lib/legendaryUnlocks'
import { CREW_SKINS } from '../lib/crewSkins'
import { XP_TABLE, CREW_MAX_LEVEL } from '../lib/crewLevel'
import { withRng, mulberry32 } from '../lib/rng'

let failed = 0
const fail = (m: string) => { failed++; console.log('  FAIL ' + m) }

const cards = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content', 'cards.json'), 'utf8')) as CardRow[]
const { byGroup, meta } = cardPools(cards)
const slugOf = (id: number) => (meta.get(id)?.slug ?? '').toLowerCase()
const legendarySlugs = byGroup[4].map(slugOf)
const gated = legendarySlugs.filter(s => !ALWAYS_UNLOCKED_LEGENDARIES.has(s))
if (byGroup[4].length === 0 || gated.length === 0) fail('the catalogue has no gated legendaries to test against')

const board = (over: Partial<Parameters<typeof rollRecruitBoard>[0]> = {}) =>
  rollRecruitBoard({ size: 3, weights: GEM_WEIGHTS, byGroup, meta, legendaryUnlocks: [], ...over })

// Determinism.
const a = withRng(mulberry32(61), () => JSON.stringify(Array.from({ length: 40 }, () => board())))
const b = withRng(mulberry32(61), () => JSON.stringify(Array.from({ length: 40 }, () => board())))
if (a !== b) fail('the same seed rolled a different board')

withRng(mulberry32(63), () => {
  // The free board: no legendaries, ever.
  for (let k = 0; k < 20_000; k++) {
    if (board({ weights: FREE_WEIGHTS }).some(r => r.rarity === 4)) { fail('a free board carried a Legendary'); break }
  }
  // The campaign gate: with nothing unlocked, a gated legendary never rolls.
  for (let k = 0; k < 20_000; k++) {
    const hit = board({ weights: [0, 0, 0, 1] }).find(r => gated.includes(slugOf(r.cardId)))
    if (hit) { fail(`${slugOf(hit.cardId)} rolled before its chapter was cleared`); break }
  }
})

// The gift.
withRng(mulberry32(65), () => {
  const pick = gated[0]
  const pinned = board({ weights: FREE_WEIGHTS, legendaryUnlocks: [pick], guaranteeLegendary: true, legendarySlug: pick })
  if (pinned[0]?.rarity !== 4 || slugOf(pinned[0].cardId) !== pick) fail(`the gift did not land ${pick} in slot 0`)
  const locked = board({ weights: FREE_WEIGHTS, guaranteeLegendary: true, legendarySlug: pick })
  if (locked[0]?.rarity !== 4 || gated.includes(slugOf(locked[0].cardId))) fail('a gift aimed at a locked legendary broke the gate')
  if (pinned.slice(1).some(r => r.rarity === 4)) fail('the gift reached past slot 0 on a free board')
})

// The weights.
withRng(mulberry32(67), () => {
  const n = [0, 0, 0, 0]
  const N = 60_000
  for (let k = 0; k < N / 3; k++) for (const r of board({ legendaryUnlocks: gated })) n[r.rarity - 1]++
  const total = GEM_WEIGHTS.reduce((x, y) => x + y, 0)
  GEM_WEIGHTS.forEach((w, i) => {
    const got = n[i] / N, want = w / total
    if (Math.abs(got - want) > Math.max(0.004, want * 0.12)) fail(`rarity ${i + 1} came out ${got.toFixed(4)} against ${want.toFixed(4)}`)
  })
})

// The Blood Gem gamble.
withRng(mulberry32(69), () => {
  const owned: string[] = []
  for (let k = 0; k < 500; k++) {
    const s = pickBloodSkin(owned)
    if (!s) break
    if (groupForSlug(s.slug) === 4) { fail(`the gamble paid a legendary skin (${s.id})`); break }
    if (owned.includes(s.id)) { fail(`the gamble paid a skin already owned (${s.id})`); break }
    owned.push(s.id)
  }
  const all = CREW_SKINS.filter(s => groupForSlug(s.slug) !== 4).map(s => s.id)
  if (pickBloodSkin(all) !== null) fail('the gamble still paid once every non-legendary skin was owned')
})

// The Crew Hall.
{
  const since = '2026-09-28T00:00:00.000Z'
  const t0 = Date.parse(since)
  const row = (crew: number, cap: number | null, slot = 0): BunkRow => ({ id: crew, crew_id: crew, since, rate: 100, cap, slot })
  const rows = [row(1, 4), row(2, 8), row(3, null)]
  if (finishedStints(rows, 100, 6, t0 + 3.9 * 3_600_000).length !== 0) fail('a stint paid before it finished')
  const at5 = finishedStints(rows, 100, 6, t0 + 5 * 3_600_000).map(r => r.crew_id)
  if (at5.join() !== '1') fail(`at five hours ${at5.join()} had finished, not just the 4-hour stint`)
  const at9 = finishedStints(rows, 100, 6, t0 + 9 * 3_600_000).map(r => r.crew_id).sort()
  if (at9.join() !== '1,2,3') fail('a stint on the live cap did not finish')
  const maxed = XP_TABLE[CREW_MAX_LEVEL - 1] + 1
  const pay = stintPayouts(rows, new Map([[1, 0], [2, maxed], [3, 50]]), 100, 6)
  if (pay.some(p => p.id === 2)) fail('a hand at the ceiling was paid')
  if (pay.find(p => p.id === 1)?.xp !== 400 || pay.find(p => p.id === 3)?.xp !== 600) fail(`stints paid ${JSON.stringify(pay)}, not 400 and 600`)
  if (leviathanOffer({ id: 1, rarity: 3, effects: [], pending_trait: 's:1,0,0' }) !== null) fail('an open Leviathan offer was replaced')
  withRng(mulberry32(71), () => {
    for (let k = 0; k < 300; k++) {
      const o = leviathanOffer({ id: 1, rarity: 4, effects: [], pending_trait: null })
      if (!o || !o.parked || (o.parked !== NEUTRAL_OFFER && !o.parked.includes(':'))) { fail('a Leviathan offer parked nothing usable'); break }
    }
  })
}

console.log(`\n  Crew rules: boards, the gate, the gift, weights, the gamble and the hall ${failed ? `${failed} FAILED` : 'ok'}.`)
if (failed) process.exit(1)
