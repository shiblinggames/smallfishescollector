// Regenerates the leverage table in lib/fishExchange.ts.
//
// A contract pays  stake x L x max(0, move% your way).  L is chosen so the
// expected payout is exactly stake x (1 - EDGE), which makes every instrument
// and every term fair to the same degree instead of some being quietly better
// bets than others. Derived by simulating the SHIPPED engine
// (update_fish_exchange) rather than by algebra, because the mood regime and
// the reflecting band both bend the distribution.
//
//   node scripts/derive-exchange-payouts.mjs
const BAND = Math.log(2.5), THETA = 0.015, EDGE = 0.08
const VOL = { 1: 0.030, 2: 0.038, 3: 0.048, 4: 0.060, 5: 0.075 }
const MOODS = [
  [0.05,()=>(Math.random()<0.5?0.015:-0.015),2.0],[0.10,()=>0.018,1.2],[0.16,()=>-0.018,1.2],
  [0.28,()=>0.009,1.0],[0.40,()=>-0.009,1.0],[0.60,()=>(Math.random()<0.5?0.007:-0.007),1.5],[1.01,()=>0,1.0],
]
function endMove(cycles, vol, members) {
  const st = { lp: 0, left: 0, bias: 0, vm: 1 }
  let p = 1
  for (let c = 0; c < cycles; c++) {
    if (st.left <= 0) { const r=Math.random(); const q=MOODS.find(x=>r<x[0]); st.bias=q[1]()*0.5; st.vm=q[2]; st.left=2+Math.floor(Math.random()*4) }
    st.left--
    let n = 0
    for (let i=0;i<members;i++) n += (Math.random()+Math.random()+Math.random()-1.5)*vol*st.vm
    n /= members
    st.lp = Math.max(-BAND, Math.min(BAND, st.lp - THETA*st.lp + n + st.bias))
    p = Math.exp(st.lp)
  }
  return (p - 1) * 100
}
function leverage(cycles, vol, members, N = 150000) {
  let sum = 0
  for (let i = 0; i < N; i++) { const m = endMove(cycles, vol, members); if (m > 0) sum += m }
  return (1 - EDGE) / (sum / N)
}
const TERMS = [6, 24, 72]
console.log('// singles, by bite_rarity')
for (const r of [1,2,3,4,5]) {
  const row = TERMS.map(c => leverage(c, VOL[r], 1).toFixed(3))
  console.log(`  ${r}: { 6: ${row[0]}, 24: ${row[1]}, 72: ${row[2]} },`)
}
console.log('// funds, by member count')
for (const n of [8, 20, 35, 146]) {
  const row = TERMS.map(c => leverage(c, VOL[3], n).toFixed(3))
  console.log(`  ${n}: { 6: ${row[0]}, 24: ${row[1]}, 72: ${row[2]} },`)
}
