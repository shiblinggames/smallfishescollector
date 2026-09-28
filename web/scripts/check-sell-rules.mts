// WHAT A FISH SELLS FOR (Steam prep, Phase B).
//
// Holds lib/sellRules to the two lanes the game promises
// (docs/systems/fish-economy.md):
//   - the market floors PER FISH, then counts (a stack of three 9.59s is 27);
//   - a buyer at sea floors ONCE over the whole hold;
//   - every zone's resident buys inside the published 78-86% band, deeper
//     water paying better, and never above the market;
//   - the blockade runner's cut is one roll at his odds, the same every time
//     under the same seed.
//
//   npx tsx scripts/check-sell-rules.mts

import { marketPriceEach, marketSale, holdAtRate, runnerCutWon } from '../lib/sellRules'
import { RESIDENTS } from '../app/(app)/sea/chart'
import { withRng, mulberry32 } from '../lib/rng'

let failed = 0
const fail = (m: string) => { failed++; console.log('  FAIL ' + m) }

// The market floors per fish.
if (marketPriceEach(7, 1.37) !== 9) fail('the market did not floor a single fish')
const m = marketSale([{ sellValue: 7, multiplier: 1.37, quantity: 3 }, { sellValue: 120, multiplier: 0.9, quantity: 2 }])
if (m.earned !== 27 + 216 || m.fishSold !== 5) fail(`a market sale came to ${m.earned} for ${m.fishSold}, not 243 for 5`)
if (marketSale([]).earned !== 0) fail('an empty sale paid something')

// A buyer at sea floors once over the lot.
if (holdAtRate([{ sellValue: 7, quantity: 3 }, { sellValue: 5, quantity: 1 }], 0.8) !== Math.floor(7 * 3 * 0.8 + 5 * 0.8)) fail('a sea sale did not floor once over the whole hold')

// The residents: inside the band, rising with depth, below the market.
const order = ['shallows', 'open_waters', 'deep', 'abyss', 'ancient_deep']
const rates = order.map(z => RESIDENTS.find(r => r.zoneId === z)?.rate)
if (rates.some(r => r == null)) fail('a water has no resident buyer')
for (const r of rates) if (r != null && (r < 0.78 || r > 0.86)) fail(`a resident buys at ${r}, outside 78-86%`)
for (let i = 1; i < rates.length; i++) if ((rates[i] ?? 0) < (rates[i - 1] ?? 0)) fail('a deeper resident pays less than a shallower one')
const stack = [{ sellValue: 1000, quantity: 10 }]
for (const r of RESIDENTS) {
  if (holdAtRate(stack, r.rate) >= marketSale([{ sellValue: 1000, multiplier: 1, quantity: 10 }]).earned) fail(`${r.name} pays as much as the market`)
}

// The runner.
const a = withRng(mulberry32(51), () => Array.from({ length: 50 }, () => runnerCutWon(0.1)).join())
const b = withRng(mulberry32(51), () => Array.from({ length: 50 }, () => runnerCutWon(0.1)).join())
if (a !== b) fail('the same seed cut the deck differently')
let wins = 0
withRng(mulberry32(53), () => { for (let i = 0; i < 50_000; i++) if (runnerCutWon(0.1)) wins++ })
if (Math.abs(wins / 50_000 - 0.1) > 0.006) fail(`the runner won ${wins / 500}% of cuts at 10% odds`)

console.log(`\n  Sell rules: market, sea buyers, residents and the runner ${failed ? `${failed} FAILED` : 'ok'}.`)
if (failed) process.exit(1)
