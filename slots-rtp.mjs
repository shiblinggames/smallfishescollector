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
  console.log(`base RTP: ${(r.base * 100).toFixed(2)}%  (+5% jackpot feed = ${(r.base * 100 + 5).toFixed(2)}% total)`)
  console.log(`catfish TRIPLE (jackpot): 1-in-${Math.round(1 / r.jackpotProb).toLocaleString()}`)
  for (const k in r.tripleProb) console.log(`  triple ${k}: 1-in-${Math.round(1 / r.tripleProb[k]).toLocaleString()}`)
  for (const k in r.pairProb) console.log(`  pair ${k} (${pairs[k]}x): 1-in-${Math.round(1 / r.pairProb[k])}  → contributes ${(r.pairProb[k] * pairs[k] * 100).toFixed(1)}pp`)
  console.log(`  3-hook bonus: 1-in-${Math.round(1 / r.bonusProb)}`)
}

// LIVE config
report('LIVE (catfish 4)', { common: 46, rare: 20, legendary: 9, catfish: 4, anchor: 21 }, { rare: 1.5, legendary: 5, catfish: 25 })

// Option A: catfish 5 (from sardine), pair 18x
report('A: catfish 5, pair 18x', { common: 45, rare: 20, legendary: 9, catfish: 5, anchor: 21 }, { rare: 1.5, legendary: 5, catfish: 18 })

// Option B: catfish 6 (from sardine 45, hook 20), pair 12x
report('B: catfish 6, pair 12x', { common: 45, rare: 20, legendary: 9, catfish: 6, anchor: 20 }, { rare: 1.5, legendary: 5, catfish: 12 })

// Option B2: catfish 6, pair 15x
report('B2: catfish 6, pair 15x', { common: 45, rare: 20, legendary: 9, catfish: 6, anchor: 20 }, { rare: 1.5, legendary: 5, catfish: 15 })
