// Regenerates the leverage tables in lib/fishExchange.ts.
//
// A contract pays  stake x L x max(0, move% your way).  L is chosen so the
// expected payout is exactly stake x (1 - EDGE), which is what makes every
// instrument and every term fair to the SAME degree. Without it some contracts
// are quietly better bets than others and the board has a correct answer,
// which is the opposite of a market.
//
// Derived by simulating the SHIPPED engine (update_fish_exchange) rather than
// by algebra, because the mood regime and the reflecting band both bend the
// distribution away from anything closed-form.
//
// FUNDS ARE SIMULATED MEMBER BY MEMBER. update_exchange_funds() computes
// avg(price) over the members, so a fund is the mean of N exponentials, not one
// walk with averaged noise. Those are not the same thing: the first pass
// modelled it as a single averaged walk and understated the movement by ~23%,
// which handed every fund contract a +11% edge over the house instead of the
// intended -8%.
//
// And each fund carries its OWN rarity mix. Keying leverage off member count
// alone gave the Legendary Index and the Common Index near-identical
// break-evens (1.67% and 1.66% at 24h) despite legendaries being twice as
// volatile, so the legendary book was strictly the better bet.
//
//   node scripts/derive-exchange-payouts.mjs

const BAND = Math.log(2.5)
const THETA = 0.015
const EDGE = 0.08
const VOL = { 1: 0.030, 2: 0.038, 3: 0.048, 4: 0.060, 5: 0.075 }
const TERMS = [6, 24, 72]

const MOODS = [
  [0.05, () => (Math.random() < 0.5 ? 0.015 : -0.015), 2.0],
  [0.10, () => 0.018, 1.2],
  [0.16, () => -0.018, 1.2],
  [0.28, () => 0.009, 1.0],
  [0.40, () => -0.009, 1.0],
  [0.60, () => (Math.random() < 0.5 ? 0.007 : -0.007), 1.5],
  [1.01, () => 0, 1.0],
]

/** One instrument's move over `cycles`, as a percent. `vols` is one entry per
 *  member: a single fish is a one-element array, a fund is its whole roster.
 *  The mood is shared across members, which is exactly why a fund diversifies
 *  away its own noise but never the weather. */
function endMove(cycles, vols) {
  const lps = new Float64Array(vols.length)
  let left = 0, bias = 0, vm = 1
  for (let c = 0; c < cycles; c++) {
    if (left <= 0) {
      const r = Math.random()
      const m = MOODS.find(x => r < x[0])
      bias = m[1]() * 0.5
      vm = m[2]
      left = 2 + Math.floor(Math.random() * 4)
    }
    left--
    for (let i = 0; i < vols.length; i++) {
      const n = (Math.random() + Math.random() + Math.random() - 1.5) * vols[i] * vm
      const lp = lps[i] - THETA * lps[i] + n + bias
      lps[i] = lp < -BAND ? -BAND : lp > BAND ? BAND : lp
    }
  }
  let sum = 0
  for (let i = 0; i < lps.length; i++) sum += Math.exp(lps[i])
  return (sum / lps.length - 1) * 100
}

function leverage(cycles, vols, N) {
  let sum = 0
  for (let i = 0; i < N; i++) {
    const m = endMove(cycles, vols)
    if (m > 0) sum += m
  }
  return (1 - EDGE) / (sum / N)
}

const mix = counts => {
  const out = []
  for (const [r, n] of Object.entries(counts)) for (let i = 0; i < n; i++) out.push(VOL[r])
  return out
}

// The real composition of every listed index, from exchange_fund_members.
const FUNDS = {
  sea:          mix({ 1: 16, 2: 37, 3: 46, 4: 29, 5: 18 }),
  common:       mix({ 1: 16, 2: 37 }),
  legendary:    mix({ 4: 29, 5: 18 }),
  rare:         mix({ 3: 46 }),
  abyss:        mix({ 1: 5, 2: 2, 3: 8, 4: 11, 5: 9 }),
  open_waters:  mix({ 1: 5, 2: 14, 3: 9, 4: 3, 5: 3 }),
  shallows:     mix({ 1: 4, 2: 13, 3: 9, 4: 4, 5: 3 }),
  deep:         mix({ 1: 2, 2: 8, 3: 14, 4: 5, 5: 3 }),
  ancient_deep: mix({ 3: 6, 4: 6 }),
}

const N_FUND = 30000
const N_SINGLE = 150000

console.log('export const SINGLE_LEVERAGE: Record<number, Record<Term, number>> = {')
for (const r of [1, 2, 3, 4, 5]) {
  const row = TERMS.map(c => leverage(c, [VOL[r]], N_SINGLE).toFixed(4))
  console.log(`  ${r}: { 6: ${row[0]}, 24: ${row[1]}, 72: ${row[2]} },`.padEnd(52)
    + `// break-even ${(1 / Number(row[1])).toFixed(2)}% at 24h`)
}
console.log('}\n')

console.log('export const FUND_LEVERAGE: Record<string, Record<Term, number>> = {')
for (const [id, vols] of Object.entries(FUNDS)) {
  const row = TERMS.map(c => leverage(c, vols, N_FUND).toFixed(4))
  console.log(`  ${id}: { 6: ${row[0]}, 24: ${row[1]}, 72: ${row[2]} },`.padEnd(58)
    + `// ${vols.length} fish, break-even ${(1 / Number(row[1])).toFixed(2)}% at 24h`)
}
console.log('}')
