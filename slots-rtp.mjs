// Quick RTP calculator for Fish Slots retune options.
// Mirrors actions.ts precedence: 3 hooks → bonus; 3 catfish → jackpot;
// 3 same fish → triple pay; 2 hooks → refund 1x; payable pair → pair pay;
// sardine pair / else → 0. Bonus spin: triples + pairs only, no refund,
// no nested bonus; catfish triple in bonus claims jackpot (excluded from base RTP).

function rtp(weights, triples, pairs) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  const p = {}
  for (const k in weights) p[k] = weights[k] / total
  const syms = Object.keys(weights)

  let base = 0, bonusProb = 0, jackpotProb = 0, pairProb = {}, tripleProb = {}
  // enumerate all 3-reel combos
  for (const a of syms) for (const b of syms) for (const c of syms) {
    const prob = p[a] * p[b] * p[c]
    const reels = [a, b, c]
    const hooks = reels.filter(r => r === 'anchor').length
    if (hooks === 3) { bonusProb += prob; continue }
    if (a === b && b === c) {
      if (a === 'catfish') { jackpotProb += prob; continue }
      base += prob * triples[a]
      tripleProb[a] = (tripleProb[a] || 0) + prob
      continue
    }
    if (hooks === 2) { base += prob * 1; continue } // refund
    // exactly-2 matching fish?
    const fish = reels.filter(r => r !== 'anchor')
    const counts = {}
    for (const f of fish) counts[f] = (counts[f] || 0) + 1
    const pairSym = Object.keys(counts).find(k => counts[k] === 2)
    if (pairSym && pairs[pairSym] !== undefined) {
      base += prob * pairs[pairSym]
      pairProb[pairSym] = (pairProb[pairSym] || 0) + prob
    }
  }

  // bonus spin EV: triples + pairs only (catfish triple = jackpot, excluded)
  let bonusEV = 0
  for (const a of syms) for (const b of syms) for (const c of syms) {
    const prob = p[a] * p[b] * p[c]
    const reels = [a, b, c]
    if (a === b && b === c) {
      if (a === 'catfish' || a === 'anchor') continue
      bonusEV += prob * triples[a]
      continue
    }
    const fish = reels.filter(r => r !== 'anchor')
    const counts = {}
    for (const f of fish) counts[f] = (counts[f] || 0) + 1
    const pairSym = Object.keys(counts).find(k => counts[k] === 2)
    if (pairSym && pairs[pairSym] !== undefined) bonusEV += prob * pairs[pairSym]
  }
  base += bonusProb * bonusEV

  return { base, jackpotProb, bonusProb, pairProb, tripleProb }
}

const TRIPLES = { common: 3, rare: 12, legendary: 60, anchor: 0 }

function report(label, weights, pairs, triples = TRIPLES) {
  const r = rtp(weights, triples, pairs)
  console.log(`\n=== ${label} ===`)
  console.log(`weights: ${JSON.stringify(weights)}  pairs: ${JSON.stringify(pairs)}`)
  console.log(`base RTP: ${(r.base * 100).toFixed(2)}%  (+10% jackpot feed = ${(r.base * 100 + 10).toFixed(2)}% total)`)
  console.log(`catfish TRIPLE (jackpot): 1-in-${Math.round(1 / r.jackpotProb).toLocaleString()}`)
  for (const k in r.tripleProb) console.log(`  triple ${k}: 1-in-${Math.round(1 / r.tripleProb[k]).toLocaleString()}`)
  for (const k in r.pairProb) console.log(`  pair ${k} (${pairs[k]}x): 1-in-${Math.round(1 / r.pairProb[k])}  → contributes ${(r.pairProb[k] * pairs[k] * 100).toFixed(1)}pp`)
  console.log(`  3-hook bonus: 1-in-${Math.round(1 / r.bonusProb)}`)
}

// LIVE config (913c74bd retune)
report('LIVE (catfish 6, pair 15x)', { common: 45, rare: 20, legendary: 9, catfish: 6, anchor: 20 }, { rare: 1.5, legendary: 5, catfish: 15 })

// Small-population candidates — sardine triple bumped to 4x to give the
// RTP back that the sardine weight cut takes away.
const T4 = { common: 4, rare: 12, legendary: 60, anchor: 0 }
report('E: catfish 10, pair 5x, sardine 4x', { common: 42, rare: 20, legendary: 9, catfish: 10, anchor: 19 }, { rare: 1.5, legendary: 5, catfish: 5 }, T4)
report('F: catfish 14, pair 3x, sardine 4x', { common: 39, rare: 20, legendary: 9, catfish: 14, anchor: 18 }, { rare: 1.5, legendary: 5, catfish: 3 }, T4)
report('F2: catfish 14, pair 2.5x, sardine 4x', { common: 40, rare: 20, legendary: 9, catfish: 14, anchor: 17 }, { rare: 1.5, legendary: 5, catfish: 2.5 }, T4)
report("F': catfish 14, pair 3x, sardine 4x, marlin pair 2x", { common: 39, rare: 20, legendary: 9, catfish: 14, anchor: 18 }, { rare: 2, legendary: 5, catfish: 3 }, T4)

// ── 2026-06-28: 10% feed pushed total to ~101.6%. Levers to claw base RTP
//    back UNDER 100% (value shifts from base churn into the bigger jackpot).
const W = { common: 39, rare: 20, legendary: 9, catfish: 14, anchor: 18 }
const T3 = { common: 3, rare: 12, legendary: 60, anchor: 0 }   // sardine triple 4→3
console.log('\n\n######## 10% FEED — claw-back candidates (target <100% total) ########')
report('LIVE @10% (F\', unchanged base)',           W, { rare: 2,   legendary: 5, catfish: 3 }, T4)
report('A: catfish pair 3→2',                       W, { rare: 2,   legendary: 5, catfish: 2 }, T4)
report('B: marlin pair 2→1.5',                      W, { rare: 1.5, legendary: 5, catfish: 3 }, T4)
report('C: sardine triple 4→3',                     W, { rare: 2,   legendary: 5, catfish: 3 }, T3)
report('D: catfish pair 3→2.5 + marlin 2→1.5',      W, { rare: 1.5, legendary: 5, catfish: 2.5 }, T4)
report('E: catfish 3→2 + marlin 2→1.5 (firmer)',    W, { rare: 1.5, legendary: 5, catfish: 2 }, T4)
