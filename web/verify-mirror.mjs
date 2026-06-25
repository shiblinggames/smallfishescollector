const BS = String.fromCharCode(92) // backslash
const REFLECT = {
  '/': { right: 'up', up: 'right', left: 'down', down: 'left' },
  [BS]: { right: 'down', down: 'right', left: 'up', up: 'left' },
}
const STEP = { up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 } }
function trace(lvl, orient) {
  const wall = new Set(lvl.walls.map(w => `${w.x},${w.y}`))
  const mir = new Set(lvl.mirrors.map(m => `${m.x},${m.y}`))
  let x = lvl.source.x, y = lvl.source.y, dir = lvl.source.dir
  const cap = lvl.cols * lvl.rows * 4
  for (let i = 0; i < cap; i++) {
    const key = `${x},${y}`
    if (!(i === 0 && x === lvl.source.x && y === lvl.source.y) && mir.has(key)) dir = REFLECT[orient[key] ?? '/'][dir]
    if (x === lvl.target.x && y === lvl.target.y) return { hit: true, steps: i }
    const { dx, dy } = STEP[dir]; const nx = x + dx, ny = y + dy
    if (nx < 0 || ny < 0 || nx >= lvl.cols || ny >= lvl.rows) return { hit: false }
    if (wall.has(`${nx},${ny}`)) return { hit: false }
    x = nx; y = ny
  }
  return { hit: false }
}
function analyze(name, lvl) {
  const rot = lvl.mirrors.filter(m => !m.fixed)
  const fixed = lvl.mirrors.filter(m => m.fixed)
  const base = {}; for (const m of lvl.mirrors) base[`${m.x},${m.y}`] = m.init
  const sols = []
  const N = rot.length
  for (let mask = 0; mask < (1 << N); mask++) {
    const o = { ...base }
    for (let i = 0; i < N; i++) o[`${rot[i].x},${rot[i].y}`] = (mask >> i & 1) ? BS : '/'
    if (trace(lvl, o).hit) sols.push({ ...o })
  }
  const forced = []
  for (const m of rot) { const k = `${m.x},${m.y}`; const vals = new Set(sols.map(s => s[k])); if (vals.size === 1 && sols.length > 0) forced.push(`${k}=${[...vals][0] === '/' ? 'fwd' : 'BACK'}`) }
  const initHit = trace(lvl, base).hit
  console.log(`\n=== ${name} === ${lvl.cols}x${lvl.rows}, ${rot.length} rotatable + ${fixed.length} fixed`)
  console.log(`solutions: ${sols.length} / ${1 << N} combos | solvable: ${sols.length > 0} | already-solved-at-init: ${initHit}`)
  console.log(`required (forced) mirrors: ${forced.join('  ') || '(none)'}`)
}

const B = BS
analyze('coffers_lens (L1)', { cols: 7, rows: 7, source: { x: 0, y: 0, dir: 'right' }, target: { x: 6, y: 1 },
  walls: [{ x: 6, y: 0 }, { x: 0, y: 6 }, { x: 3, y: 5 }, { x: 6, y: 6 }],
  mirrors: [
    { x: 2, y: 0, init: B, fixed: true },
    { x: 2, y: 3, init: '/' },
    { x: 4, y: 3, init: B },
    { x: 4, y: 1, init: B },
    { x: 1, y: 3, init: '/' },
    { x: 4, y: 5, init: '/' },
  ] })

// LEVEL 2 (Vault Beam, hardest) — 8x8, 4 required non-greedy turns + decoys.
// Intended path: (0,0)r -> (2,0)FIX\\ down -> (2,5)\\ right -> (5,5)/ up
//   -> (5,2)/ right -> (6,2)\\ down -> (6,6) target.
analyze('coffers_vault_lens (L2)', { cols: 8, rows: 8, source: { x: 0, y: 0, dir: 'right' }, target: { x: 6, y: 6 },
  walls: [{ x: 0, y: 7 }, { x: 7, y: 0 }, { x: 7, y: 7 }, { x: 0, y: 3 }],
  mirrors: [
    { x: 2, y: 0, init: B, fixed: true },
    { x: 2, y: 5, init: '/' },
    { x: 5, y: 5, init: B },
    { x: 5, y: 2, init: B },
    { x: 6, y: 2, init: '/' },
    { x: 3, y: 2, init: '/' },
    { x: 1, y: 5, init: B },
  ] })
