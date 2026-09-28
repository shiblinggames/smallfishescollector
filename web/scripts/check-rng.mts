// THE DICE AND THE CLOCK GO THROUGH ONE SEAM (Steam prep, Phase A step 2).
//
// Two checks:
//   1. GUARD: the rules modules and the server actions that roll may not call
//      Math.random, Date.now() or `new Date()` directly any more; they use
//      rngNext / clockNow (lib/rng, lib/clock). A direct call slips past a
//      seeded replay and an offline engine without anybody noticing.
//   2. DETERMINISM: the same seed gives the same rolls, a different seed gives
//      different ones, and the default dice still roll like Math.random.
//
//   npx tsx scripts/check-rng.mts

import fs from 'fs'
import path from 'path'
import { withRng, mulberry32, rngNext, seedOf } from '../lib/rng'
import { withClock, clockNow } from '../lib/clock'
import { rollRarity, rollTrait } from '../lib/crewGen'
import { rollFishSize } from '../lib/fishSize'
import { rollOutcome } from '../lib/voyageRoll'
import { newShoe } from '../lib/blackjack'
import { rollPet } from '../lib/pets'
import { drawDeepTrait } from '../lib/crewTraits'
import { seaClock } from '../lib/seaClock'

let failed = 0
const fail = (m: string) => { failed++; console.log('  FAIL ' + m) }

// ── 1. the guard ────────────────────────────────────────────────────────────
const RNG_FILES = [
  ...['gauntlet', 'voyageEvents', 'crewGen', 'crateLoot', 'pets', 'voyageRoll', 'tides', 'shiny', 'roulette',
    'raidAffixes', 'gauntletMerchant', 'gauntletContracts', 'fishSize', 'finn', 'blackjack', 'seaFolk',
    'repairKits', 'raidRegistry', 'raidMap', 'raidLoot', 'gauntletOffer', 'gauntletMarks', 'drawPack',
    'crewTraits', 'seaPortal', 'fishingRules', 'sellRules', 'crewRules', 'voyageRules', 'trawlRules'].map(n => `lib/${n}.ts`),
  ...['crew/actions.ts', 'expeditions/bountyActions.ts', 'expeditions/raidMapActions.ts', 'fishing/actions.ts',
    'fishing/dailyChallengeActions.ts', 'fishing/trawls/actions.ts', 'fishing/trawls/constants.ts',
    'raids/gauntlet/actions.ts', 'sea/finnActions.ts', 'sea/folkActions.ts', 'sea/traderActions.ts',
    'tavern/actions.ts', 'tavern/trivia/capstan/actions.ts', 'tavern/trivia/king/actions.ts'].map(n => `app/(app)/${n}`),
]
const CLOCK_FILES = ['seaClock', 'seaTraders', 'weekStart', 'seaHotspots', 'seaCouriers', 'crewBunks',
  'crewBunkSettle', 'dailyChallenges', 'bounties', 'seaWeather', 'seaLeviathans', 'seaBottles', 'seaFinn',
  'tavernGossip', 'pendingSales', 'ultimateBuild', 'premium', 'fishingRules', 'voyageRules', 'trawlRules'].map(n => `lib/${n}.ts`)

const codeLines = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8').split('\n')
  .map((l, i) => ({ l, n: i + 1 }))
  .filter(({ l }) => { const t = l.trim(); return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) })
  .map(({ l, n }) => ({ l: l.replace(/\/\/.*$/, ''), n }))

let guarded = 0
for (const f of RNG_FILES) {
  guarded++
  for (const { l, n } of codeLines(f)) if (/Math\.random/.test(l)) fail(`${f}:${n} calls Math.random; use rngNext from lib/rng`)
}
for (const f of CLOCK_FILES) {
  guarded++
  for (const { l, n } of codeLines(f)) if (/Date\.now\(\)|new Date\(\)/.test(l)) fail(`${f}:${n} reads the clock directly; use clockNow from lib/clock`)
}

// ── 2. determinism ──────────────────────────────────────────────────────────
const rolls = () => ({
  rarity: Array.from({ length: 12 }, () => rollRarity([60, 28, 10, 2])),
  trait: Array.from({ length: 4 }, () => rollTrait(3)),
  size: Array.from({ length: 6 }, () => rollFishSize(10, 40)),
  voyage: Array.from({ length: 6 }, () => rollOutcome(40, 'open')),
  shoe: newShoe().slice(0, 12),
  pet: rollPet().id,
  deep: drawDeepTrait(),
})
const a = JSON.stringify(withRng(mulberry32(seedOf('check-rng')), rolls))
const b = JSON.stringify(withRng(mulberry32(seedOf('check-rng')), rolls))
const c = JSON.stringify(withRng(mulberry32(seedOf('another seed')), rolls))
if (a !== b) fail('the same seed gave different rolls')
if (a === c) fail('two different seeds gave identical rolls')

// The seam puts the old dice back, even when the body throws.
try { withRng(() => 0.5, () => { throw new Error('x') }) } catch { /* expected */ }
const d = Array.from({ length: 200 }, () => rngNext())
if (d.every(x => x === 0.5)) fail('withRng did not restore the default dice after a throw')
if (d.some(x => x < 0 || x >= 1)) fail('default dice left [0, 1)')

// A seeded stream is still fair: rarity weights come out near their share.
const counts = [0, 0, 0, 0]
withRng(mulberry32(7), () => { for (let i = 0; i < 40_000; i++) counts[rollRarity([60, 28, 10, 2]) - 1]++ })
const share = counts.map(x => x / 40_000)
;[0.6, 0.28, 0.1, 0.02].forEach((w, i) => { if (Math.abs(share[i] - w) > 0.01) fail(`rarity ${i + 1} came out ${share[i].toFixed(3)} against ${w}`) })

// ── the clock ───────────────────────────────────────────────────────────────
const T = Date.UTC(2026, 8, 28, 12, 0, 0)
if (withClock(T, () => clockNow()) !== T) fail('withClock did not pin the time')
const p1 = withClock(T, () => seaClock().phase), p2 = withClock(T, () => seaClock().phase)
if (p1 !== p2) fail('the sea clock is not a function of the pinned time')
if (Math.abs(clockNow() - Date.now()) > 50) fail('withClock did not restore the real clock')

console.log(`\n  RNG/clock seam: ${guarded} files guarded, rolls deterministic under a seed, ${failed ? `${failed} FAILED` : 'ok'}.`)
if (failed) process.exit(1)
