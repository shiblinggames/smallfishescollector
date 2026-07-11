// Tumbler Lock (Rush Hour) stage validator — run BEFORE shipping any stage.
//   node verify-tumbler.mjs
// BFS over bar positions: solvable + minimum SLIDES (one slide = one bar moved
// any distance along its axis) vs the stage's move budget, in an honest band.
// Stages are duplicated from lib/raidMap.ts (keep in sync by hand).
//
// Grid notation: 6x6 rows; '.' empty, letters = bars (contiguous, horizontal
// or vertical), 'Z' = the BOLT (horizontal, always on its exit row) — solved
// when Z's path to the RIGHT edge is clear.

const STAGES = [
  { name: 'Tumbler 1', moveBudget: 12, grid: [
    'AA...O',
    'P..Q.O',
    'PZZQ.O',
    'P..Q..',
    'B...CC',
    'B.RRR.',
  ]},
  { name: 'Tumbler 2', moveBudget: 16, grid: [
    '..CCC.',
    '..IAD.',
    'ZZIADE',
    'B..AGE',
    'BFF.G.',
    'HHH...',
  ]},
  { name: 'Tumbler 3', moveBudget: 26, grid: [
    'G..BDD',
    'G..BI.',
    'ZZE.I.',
    '..EAC.',
    'HHHAC.',
    'FFF...',
  ]},
]

function parse(grid) {
  const cells = {}
  grid.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]
      if (ch !== '.') (cells[ch] ??= []).push([r, c])
    }
  })
  const bars = {}
  for (const [ch, cs] of Object.entries(cells)) {
    cs.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    const axis = new Set(cs.map(x => x[0])).size === 1 ? 'h' : 'v'
    bars[ch] = { axis, r: cs[0][0], c: cs[0][1], len: cs.length }
  }
  return bars
}

function solve(grid) {
  const R = grid.length, C = grid[0].length
  const bars = parse(grid)
  const ids = Object.keys(bars).sort()
  const startPos = Object.fromEntries(ids.map(ch => [ch, [bars[ch].r, bars[ch].c]]))
  const key = pos => ids.map(ch => pos[ch].join(':')).join('|')
  const occOf = pos => {
    const occ = new Map()
    for (const ch of ids) {
      const { axis, len } = bars[ch]
      const [r, c] = pos[ch]
      for (let i = 0; i < len; i++) occ.set(`${r + (axis === 'v' ? i : 0)},${c + (axis === 'h' ? i : 0)}`, ch)
    }
    return occ
  }
  const seen = new Set([key(startPos)])
  let frontier = [{ pos: startPos, m: 0 }]
  while (frontier.length > 0) {
    const next = []
    for (const { pos, m } of frontier) {
      const occ = occOf(pos)
      const [zr, zc] = pos.Z
      let clear = true
      for (let x = zc + bars.Z.len; x < C; x++) if (occ.has(`${zr},${x}`)) { clear = false; break }
      if (clear) return m
      for (const ch of ids) {
        const { axis, len } = bars[ch]
        const [r, c] = pos[ch]
        for (const d of [-1, 1]) {
          for (let s = 1; ; s++) {
            const nr = axis === 'v' ? r + d * s : r
            const nc = axis === 'h' ? c + d * s : c
            if (nr < 0 || nc < 0 || (axis === 'v' ? nr + len > R : nc + len > C)) break
            const probe = axis === 'h'
              ? `${r},${d > 0 ? nc + len - 1 : nc}`
              : `${d > 0 ? nr + len - 1 : nr},${c}`
            if (occ.has(probe) && occ.get(probe) !== ch) break
            const np = { ...pos, [ch]: [nr, nc] }
            const k = key(np)
            if (!seen.has(k)) { seen.add(k); next.push({ pos: np, m: m + 1 }) }
          }
        }
      }
    }
    frontier = next
    if (seen.size > 2_000_000) return -1
  }
  return -1
}

let fail = false
for (const st of STAGES) {
  const min = solve(st.grid)
  const ok = min > 0 && st.moveBudget >= min + 2 && st.moveBudget <= min * 2.2
  console.log(`${st.name}: min slides = ${min}, budget = ${st.moveBudget} → ${min < 0 ? 'UNSOLVABLE ✗' : ok ? 'OK ✓' : 'BUDGET OFF ✗'}`)
  if (min < 0 || !ok) fail = true
}
process.exit(fail ? 1 : 0)
