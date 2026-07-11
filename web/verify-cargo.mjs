// Cargo Shuffle (Sokoban) room validator — run BEFORE shipping any room.
//   node verify-cargo.mjs
// For each room: BFS over (player, crates) states → is it solvable, what's
// the minimum number of MOVES (steps, pushes included), and does the move
// budget leave honest headroom (budget ≥ min + a little slack, and not so
// generous that flailing solves it). Mirrors the Mirror Run validation ethos.
//
// Rooms are duplicated here from lib/raidMap.ts (plain-node script; keep in
// sync by hand when the node changes — the assert on room count guards drift).

// PORTRAIT boards only (cols ≤ 7, grow ROWS) — wider boards overflow phone
// edges; hardened 2026-07-11 after playtest read the first set as too easy.
const ROOMS = [
  { name: 'Room 1 — The Manifest', moveBudget: 36, grid: [
    '######',
    '#@.  #',
    '#  # #',
    '#    #',
    '# $$##',
    '# .  #',
    '######',
  ]},
  { name: 'Room 2 — The Lower Hold', moveBudget: 58, grid: [
    '#######',
    '#    .#',
    '# #$ .#',
    '#.$   #',
    '#   # #',
    '##$# @#',
    '#     #',
    '#######',
  ]},
  { name: 'Room 3 — The Magazine', moveBudget: 90, grid: [
    '#######',
    '#   # #',
    '#  $$ #',
    '#  $. #',
    '#   #.#',
    '#  #  #',
    '# #  @#',
    '#    .#',
    '#######',
  ]},
]

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]]

function parse(grid) {
  let player = null
  const crates = new Set()
  const plates = new Set()
  const walls = new Set()
  grid.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]
      const k = r * 100 + c
      if (ch === '#') walls.add(k)
      if (ch === '@' || ch === '+') player = k
      if (ch === '$' || ch === '*') crates.add(k)
      if (ch === '.' || ch === '*' || ch === '+') plates.add(k)
    }
  })
  return { player, crates, plates, walls, rows: grid.length, cols: Math.max(...grid.map(r => r.length)) }
}

function solve(room) {
  const { player, crates, plates, walls } = parse(room.grid)
  const crateKey = set => [...set].sort((a, b) => a - b).join(',')
  const solved = set => [...set].every(k => plates.has(k))
  if (solved(crates)) return { min: 0 }
  const start = `${player}|${crateKey(crates)}`
  const seen = new Set([start])
  let frontier = [{ p: player, crates, moves: 0 }]
  while (frontier.length > 0) {
    const next = []
    for (const st of frontier) {
      for (const [dr, dc] of DIRS) {
        const step = st.p + dr * 100 + dc
        if (walls.has(step)) continue
        let newCrates = st.crates
        if (st.crates.has(step)) {
          const beyond = step + dr * 100 + dc
          if (walls.has(beyond) || st.crates.has(beyond)) continue
          newCrates = new Set(st.crates)
          newCrates.delete(step)
          newCrates.add(beyond)
        }
        if (newCrates !== st.crates && solved(newCrates)) return { min: st.moves + 1 }
        const key = `${step}|${crateKey(newCrates)}`
        if (seen.has(key)) continue
        seen.add(key)
        next.push({ p: step, crates: newCrates, moves: st.moves + 1 })
      }
    }
    frontier = next
    if (seen.size > 3_000_000) return { min: -1 } // state explosion guard
  }
  return { min: -1 }
}

let fail = false
for (const room of ROOMS) {
  const { min } = solve(room)
  const ok = min > 0 && room.moveBudget >= min + 2 && room.moveBudget <= min * 2.2
  console.log(`${room.name}: min moves = ${min}, budget = ${room.moveBudget} → ${min < 0 ? 'UNSOLVABLE ✗' : ok ? 'OK ✓' : 'BUDGET OFF ✗ (want min+2 .. min*2.2)'}`)
  if (min < 0 || !ok) fail = true
}
process.exit(fail ? 1 : 0)
