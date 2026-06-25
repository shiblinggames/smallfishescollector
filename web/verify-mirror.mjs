const BS = String.fromCharCode(92) // backslash
const REFLECT = {
  '/': { right: 'up', up: 'right', left: 'down', down: 'left' },
  [BS]: { right: 'down', down: 'right', left: 'up', up: 'left' },
}
const STEP = { up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 } }
// Multi-lens: the beam passes THROUGH lenses (they aren't mirrors) and must
// cross EVERY target cell. It keeps going until it dies (wall/edge/cap).
function trace(lvl, orient) {
  const wall = new Set(lvl.walls.map(w => `${w.x},${w.y}`))
  const mir = new Set(lvl.mirrors.map(m => `${m.x},${m.y}`))
  const targets = lvl.targets ?? [lvl.target]
  const need = new Set(targets.map(t => `${t.x},${t.y}`))
  const crossed = new Set()
  let x = lvl.source.x, y = lvl.source.y, dir = lvl.source.dir
  const cap = lvl.cols * lvl.rows * 4
  for (let i = 0; i < cap; i++) {
    const key = `${x},${y}`
    if (!(i === 0 && x === lvl.source.x && y === lvl.source.y) && mir.has(key)) dir = REFLECT[orient[key] ?? '/'][dir]
    if (need.has(key)) crossed.add(key)
    const { dx, dy } = STEP[dir]; const nx = x + dx, ny = y + dy
    if (nx < 0 || ny < 0 || nx >= lvl.cols || ny >= lvl.rows) break
    if (wall.has(`${nx},${ny}`)) break
    x = nx; y = ny
  }
  return { hit: crossed.size === need.size, crossed: crossed.size }
}
function analyze(name, lvl) {
  const rot = lvl.mirrors.filter(m => !m.fixed)
  const fixed = lvl.mirrors.filter(m => m.fixed)
  const base = {}; for (const m of lvl.mirrors) base[`${m.x},${m.y}`] = m.init
  const targets = lvl.targets ?? [lvl.target]
  const sols = []
  const hist = {} // crossed-count -> how many combos
  const N = rot.length
  for (let mask = 0; mask < (1 << N); mask++) {
    const o = { ...base }
    for (let i = 0; i < N; i++) o[`${rot[i].x},${rot[i].y}`] = (mask >> i & 1) ? BS : '/'
    const r = trace(lvl, o)
    hist[r.crossed] = (hist[r.crossed] ?? 0) + 1
    if (r.hit) sols.push({ ...o })
  }
  const forced = []
  for (const m of rot) { const k = `${m.x},${m.y}`; const vals = new Set(sols.map(s => s[k])); if (vals.size === 1 && sols.length > 0) forced.push(`${k}=${[...vals][0] === '/' ? 'fwd' : 'BACK'}`) }
  const initHit = trace(lvl, base).hit
  console.log(`\n=== ${name} === ${lvl.cols}x${lvl.rows}, ${rot.length} rotatable + ${fixed.length} fixed, ${targets.length} lenses`)
  console.log(`solutions (all ${targets.length} lit): ${sols.length} / ${1 << N} combos | solvable: ${sols.length > 0} | already-solved-at-init: ${initHit}`)
  console.log(`lenses-lit histogram (count -> combos): ${Object.entries(hist).map(([k, v]) => `${k}:${v}`).join('  ')}`)
  console.log(`required (forced) mirrors: ${forced.join('  ') || '(none)'}`)
}

const B = BS
// LEVEL 1 — 9x9, 3 LENSES, 5 required turns. Path:
// (0,0)r -> (2,0)FIX\ down [lens A 2,2] -> (2,6)\ right -> (4,6)/ up [lens B 4,3]
//   -> (4,1)/ right -> (6,1)\ down -> (6,4)\ right [lens C 7,4] -> dies right.
analyze('coffers_lens (L1)', { cols: 9, rows: 9, source: { x: 0, y: 0, dir: 'right' },
  targets: [{ x: 2, y: 2 }, { x: 4, y: 3 }, { x: 7, y: 4 }],
  walls: [{ x: 8, y: 0 }, { x: 0, y: 8 }, { x: 8, y: 8 }, { x: 7, y: 0 }],
  mirrors: [
    { x: 2, y: 0, init: B, fixed: true },
    { x: 2, y: 6, init: '/' },
    { x: 4, y: 6, init: B },
    { x: 4, y: 1, init: B },
    { x: 6, y: 1, init: '/' },
    { x: 6, y: 4, init: '/' },
    { x: 3, y: 4, init: '/' },
    { x: 7, y: 1, init: '/' },
    { x: 1, y: 6, init: '/' },
    { x: 5, y: 3, init: '/' },
  ] })

// LEVEL 2 — 10x10, 3 LENSES, 5 required turns, longer snake. Path:
// (0,0)r -> (2,0)FIX\ down [lens A 2,2] -> (2,7)\ right -> (5,7)/ up [lens B 5,4]
//   -> (5,2)/ right -> (7,2)\ down -> (7,6)\ right [lens C 8,6] -> dies right.
analyze('coffers_vault_lens (L2)', { cols: 10, rows: 10, source: { x: 0, y: 0, dir: 'right' },
  targets: [{ x: 2, y: 2 }, { x: 5, y: 4 }, { x: 8, y: 6 }],
  walls: [{ x: 9, y: 0 }, { x: 0, y: 9 }, { x: 9, y: 9 }, { x: 0, y: 8 }],
  mirrors: [
    { x: 2, y: 0, init: B, fixed: true },
    { x: 2, y: 7, init: '/' },
    { x: 5, y: 7, init: B },
    { x: 5, y: 2, init: B },
    { x: 7, y: 2, init: '/' },
    { x: 7, y: 6, init: '/' },
    { x: 3, y: 4, init: '/' },
    { x: 8, y: 2, init: '/' },
    { x: 1, y: 6, init: '/' },
    { x: 4, y: 3, init: '/' },
  ] })
