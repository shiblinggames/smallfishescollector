const BS = String.fromCharCode(92) // backslash
const REFLECT = {
  '/': { right: 'up', up: 'right', left: 'down', down: 'left' },
  [BS]: { right: 'down', down: 'right', left: 'up', up: 'left' },
}
const STEP = { up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 } }
// A prism splits an incoming beam into the two PERPENDICULAR directions.
const PERP = { right: ['up', 'down'], left: ['up', 'down'], up: ['left', 'right'], down: ['left', 'right'] }
// Multi-beam: beam passes THROUGH lenses (must cross EVERY one, by ANY branch),
// reflects off mirrors, SPLITS at prisms into two perpendicular beams. Global
// (cell,dir) seen-set bounds the whole tree.
function trace(lvl, orient) {
  const wall = new Set(lvl.walls.map(w => `${w.x},${w.y}`))
  const mir = new Set(lvl.mirrors.map(m => `${m.x},${m.y}`))
  const prism = new Set((lvl.prisms ?? []).map(p => `${p.x},${p.y}`))
  const targets = lvl.targets ?? [lvl.target]
  const need = new Set(targets.map(t => `${t.x},${t.y}`))
  const crossed = new Set()
  const seen = new Set()
  const queue = [{ x: lvl.source.x, y: lvl.source.y, dir: lvl.source.dir, first: true }]
  let guard = lvl.cols * lvl.rows * 16
  while (queue.length && guard-- > 0) {
    let { x, y, dir, first } = queue.shift()
    while (guard-- > 0) {
      const key = `${x},${y}`
      if (!first && mir.has(key)) dir = REFLECT[orient[key] ?? '/'][dir]
      if (!first && prism.has(key)) { for (const nd of PERP[dir]) queue.push({ x, y, dir: nd, first: true }); break }
      if (need.has(key)) crossed.add(key)
      const state = `${x},${y},${dir}`
      if (seen.has(state)) break
      seen.add(state)
      first = false
      const { dx, dy } = STEP[dir]; const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= lvl.cols || ny >= lvl.rows) break
      if (wall.has(`${nx},${ny}`)) break
      x = nx; y = ny
    }
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
// LEVEL 1 — 9x9, PRISM splits the trunk into two arms; 3 lenses (one trunk,
// one per arm). Trunk: (0,0)r -> (3,0)\ down [lens A 3,2] -> (3,5) PRISM.
//   RIGHT arm: right -> (6,5)/ up -> (6,1)\ LEFT [lens B 4,1].
//   LEFT arm:  left  -> (1,5)/ down -> (1,7)\ RIGHT [lens C 3,7].
// FIVE required mirrors (trunk choice + 2 per arm); 4 decoys.
analyze('coffers_lens (L1)', { cols: 9, rows: 9, source: { x: 0, y: 0, dir: 'right' },
  targets: [{ x: 3, y: 2 }, { x: 4, y: 1 }, { x: 3, y: 7 }],
  prisms: [{ x: 3, y: 5 }],
  walls: [{ x: 8, y: 0 }, { x: 0, y: 8 }, { x: 8, y: 8 }, { x: 7, y: 0 }],
  mirrors: [
    { x: 3, y: 0, init: '/' },
    { x: 6, y: 5, init: B },
    { x: 6, y: 1, init: '/' },
    { x: 1, y: 5, init: B },
    { x: 1, y: 7, init: '/' },
    { x: 5, y: 7, init: '/' },
    { x: 7, y: 3, init: '/' },
  ] })

// LEVEL 2 — 10x10, PRISM split, longer arms; 3 lenses. Trunk:
// (0,0)r -> (4,0)\ down [lens A 4,2] -> (4,6) PRISM.
//   RIGHT arm: right -> (7,6)/ up -> (7,2)\ LEFT [lens B 5,2].
//   LEFT arm:  left  -> (1,6)/ down -> (1,8)\ RIGHT [lens C 4,8].
analyze('coffers_vault_lens (L2)', { cols: 10, rows: 10, source: { x: 0, y: 0, dir: 'right' },
  targets: [{ x: 4, y: 2 }, { x: 5, y: 2 }, { x: 4, y: 8 }],
  prisms: [{ x: 4, y: 6 }],
  walls: [{ x: 9, y: 0 }, { x: 0, y: 9 }, { x: 9, y: 9 }, { x: 8, y: 0 }],
  mirrors: [
    { x: 4, y: 0, init: '/' },
    { x: 7, y: 6, init: B },
    { x: 7, y: 2, init: '/' },
    { x: 1, y: 6, init: B },
    { x: 1, y: 8, init: '/' },
    { x: 6, y: 8, init: '/' },
    { x: 8, y: 4, init: '/' },
  ] })
