// Pure engine for Treasure Match (weekly Match-3) — zero imports so it
// stays trivially testable. The board + drop order are driven by a
// seeded PRNG so a given week is the same shared puzzle for everyone.
// generate.ts hands out the seed; the client runs this engine; the
// server just awards charting points on a claimed win (low-stakes).
//
// Board is a flat number[] of token-type indices, row-major.

/** Deterministic PRNG (mulberry32). Returns a function yielding floats
 *  in [0,1). Same seed → same sequence. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ix = (r: number, c: number, cols: number) => r * cols + c

// Compass wildcard sentinel. Sits OUTSIDE the 0..nTypes-1 range and below 0 so
// the `>= 0` guards in findMatches treat it as inert (it never forms a natural
// match on its own). It only acts when SWAPPED: it adopts the swapped gem's
// colour to complete a line (a plain wildcard — it does NOT clear a whole
// colour; a straight line of 5+ does that now).
export const WILD = -2

function randType(rng: () => number, nTypes: number): number {
  return Math.floor(rng() * nTypes)
}

/** Build a starting board with NO pre-made matches (so the first move is
 *  always the player's). Rejection-samples each cell against the two to
 *  its left and the two above. */
export function initialBoard(rng: () => number, cols: number, rows: number, nTypes: number): number[] {
  const b = new Array(cols * rows).fill(-1)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let t = randType(rng, nTypes)
      let guard = 0
      while (guard++ < 50) {
        const twoLeft = c >= 2 && b[ix(r, c - 1, cols)] === t && b[ix(r, c - 2, cols)] === t
        const twoUp = r >= 2 && b[ix(r - 1, c, cols)] === t && b[ix(r - 2, c, cols)] === t
        if (!twoLeft && !twoUp) break
        t = randType(rng, nTypes)
      }
      b[ix(r, c, cols)] = t
    }
  }
  return b
}

export function areAdjacent(a: number, b: number, cols: number): boolean {
  const ra = Math.floor(a / cols), ca = a % cols
  const rb = Math.floor(b / cols), cb = b % cols
  return (ra === rb && Math.abs(ca - cb) === 1) || (ca === cb && Math.abs(ra - rb) === 1)
}

/** Indices that are part of any horizontal or vertical run of 3+. */
export function findMatches(board: number[], cols: number, rows: number): number[] {
  const hit = new Set<number>()
  // rows
  for (let r = 0; r < rows; r++) {
    let runStart = 0
    for (let c = 1; c <= cols; c++) {
      const same = c < cols && board[ix(r, c, cols)] === board[ix(r, runStart, cols)] && board[ix(r, c, cols)] >= 0
      if (!same) {
        if (c - runStart >= 3) for (let k = runStart; k < c; k++) hit.add(ix(r, k, cols))
        runStart = c
      }
    }
  }
  // cols
  for (let c = 0; c < cols; c++) {
    let runStart = 0
    for (let r = 1; r <= rows; r++) {
      const same = r < rows && board[ix(r, c, cols)] === board[ix(runStart, c, cols)] && board[ix(r, c, cols)] >= 0
      if (!same) {
        if (r - runStart >= 3) for (let k = runStart; k < r; k++) hit.add(ix(k, c, cols))
        runStart = r
      }
    }
  }
  return [...hit]
}

export function swap(board: number[], a: number, b: number): number[] {
  const next = board.slice()
  ;[next[a], next[b]] = [next[b], next[a]]
  return next
}

/** Clear the given cells, drop everything above down, refill the top
 *  from the rng. Returns a new board. */
export function collapseAndRefill(board: number[], cleared: number[], cols: number, rows: number, rng: () => number, nTypes: number, wildChance = 0): number[] {
  const clearedSet = new Set(cleared)
  const next = new Array(cols * rows).fill(-1)
  for (let c = 0; c < cols; c++) {
    const stack: number[] = []
    for (let r = rows - 1; r >= 0; r--) {
      const i = ix(r, c, cols)
      if (!clearedSet.has(i)) stack.push(board[i]) // surviving, bottom-up
    }
    // New tiles drop from above. Each has a small chance to be a Compass
    // wildcard (so wilds only ever DROP IN after a clear, never on the board).
    while (stack.length < rows) stack.push(rng() < wildChance ? WILD : randType(rng, nTypes))
    for (let k = 0; k < rows; k++) next[ix(rows - 1 - k, c, cols)] = stack[k]
  }
  return next
}

export interface ResolveStep {
  cleared: number[]   // indices cleared this cascade level (on the pre-collapse board)
  gained: number      // points from this level
  resultBoard: number[] // board after collapse + refill
}

export interface ResolveResult {
  swapped: number[]   // board immediately after the swap (before any clears)
  steps: ResolveStep[]
  totalGained: number
  finalBoard: number[]
}

/** Attempt a swap. Returns null if the swap makes no match (invalid —
 *  the UI swaps back). Otherwise resolves all cascades and returns the
 *  animation steps + score. */
/** Maximal horizontal/vertical runs of 3+ same-type (non-wild) cells. Used to
 *  spot a 4-of-a-kind so we can leave a Compass behind. */
export function findRuns(board: number[], cols: number, rows: number): number[][] {
  const runs: number[][] = []
  for (let r = 0; r < rows; r++) {
    let runStart = 0
    for (let c = 1; c <= cols; c++) {
      const same = c < cols && board[ix(r, c, cols)] === board[ix(r, runStart, cols)] && board[ix(r, c, cols)] >= 0
      if (!same) {
        if (c - runStart >= 3) { const cells: number[] = []; for (let k = runStart; k < c; k++) cells.push(ix(r, k, cols)); runs.push(cells) }
        runStart = c
      }
    }
  }
  for (let c = 0; c < cols; c++) {
    let runStart = 0
    for (let r = 1; r <= rows; r++) {
      const same = r < rows && board[ix(r, c, cols)] === board[ix(runStart, c, cols)] && board[ix(r, c, cols)] >= 0
      if (!same) {
        if (r - runStart >= 3) { const cells: number[] = []; for (let k = runStart; k < r; k++) cells.push(ix(k, c, cols)); runs.push(cells) }
        runStart = r
      }
    }
  }
  return runs
}

// Where a 4+ run leaves its Compass — prefer a swapped cell (so it appears
// where the player acted), else the run's middle.
function pickSpawn(run: number[], a: number, b: number): number {
  if (run.includes(a)) return a
  if (run.includes(b)) return b
  return run[Math.floor(run.length / 2)]
}

// The match → clear → collapse loop. Run length decides the payoff:
//   • 5+ in a straight line  → clears that gem's WHOLE colour (the old Compass
//     detonation, now earned by a big line).
//   • exactly 4             → leaves ONE cell behind as a Compass wildcard.
//   • 3                     → normal clear.
// a/b bias the Compass spawn toward the swapped cells on the first pass.
function runCascades(
  start: number[], cols: number, rows: number, nTypes: number, rng: () => number,
  wildChance: number, a: number, b: number, startCascade: number,
): { steps: ResolveStep[]; totalGained: number; finalBoard: number[] } {
  const steps: ResolveStep[] = []
  let totalGained = 0
  let cur = start
  let cascade = startCascade
  while (true) {
    const runs = findRuns(cur, cols, rows)
    if (runs.length === 0) break
    // A straight line of 5+ marks its colour for a full-board wipe.
    const wipeColors = new Set<number>()
    for (const run of runs) if (run.length >= 5) wipeColors.add(cur[run[0]])
    // A line of exactly 4 (whose colour isn't being wiped) leaves a Compass.
    const spawns = new Set<number>()
    for (const run of runs) {
      if (run.length === 4 && !wipeColors.has(cur[run[0]])) {
        spawns.add(pickSpawn(run, cascade === startCascade ? a : -1, cascade === startCascade ? b : -1))
      }
    }
    const clearedSet = new Set<number>(findMatches(cur, cols, rows))
    if (wipeColors.size) for (let i = 0; i < cur.length; i++) if (wipeColors.has(cur[i])) clearedSet.add(i)
    const cleared = [...clearedSet].filter(i => !spawns.has(i))
    const gained = cleared.length * 10 * cascade
    totalGained += gained
    const withWilds = cur.slice()
    for (const s of spawns) withWilds[s] = WILD
    const resultBoard = collapseAndRefill(withWilds, cleared, cols, rows, rng, nTypes, wildChance)
    steps.push({ cleared, gained, resultBoard })
    cur = resultBoard
    cascade++
  }
  return { steps, totalGained, finalBoard: cur }
}

export function resolveSwap(
  board: number[], a: number, b: number,
  cols: number, rows: number, nTypes: number, rng: () => number,
  wildChance = 0,
): ResolveResult | null {
  if (!areAdjacent(a, b, cols)) return null

  // ── Compass wildcard ──
  // Swapping a Compass against a normal gem makes it ADOPT that gem's colour, so
  // it can complete a 3+ line at the swap. If that forms no match it's an
  // invalid swap (like any other). Two Compasses have no colour to adopt.
  const aWild = board[a] === WILD, bWild = board[b] === WILD
  if (aWild || bWild) {
    if (aWild && bWild) return null
    const target = aWild ? board[b] : board[a]
    if (target < 0) return null
    const substituted = board.slice()
    substituted[a] = target
    substituted[b] = target
    const r = runCascades(substituted, cols, rows, nTypes, rng, wildChance, a, b, 1)
    if (r.steps.length === 0) return null // wildcard completed no line → invalid
    return { swapped: substituted, steps: r.steps, totalGained: r.totalGained, finalBoard: r.finalBoard }
  }

  const swapped = swap(board, a, b)
  const r = runCascades(swapped, cols, rows, nTypes, rng, wildChance, a, b, 1)
  if (r.steps.length === 0) return null // no match → invalid move
  return { swapped, steps: r.steps, totalGained: r.totalGained, finalBoard: r.finalBoard }
}

/** Is there any swap that would create a match? Used to detect a dead
 *  board so it can be reshuffled. */
export function hasValidMove(board: number[], cols: number, rows: number): boolean {
  for (let i = 0; i < board.length; i++) {
    const r = Math.floor(i / cols), c = i % cols
    if (c < cols - 1) { const s = swap(board, i, i + 1); if (findMatches(s, cols, rows).length) return true }
    if (r < rows - 1) { const s = swap(board, i, i + cols); if (findMatches(s, cols, rows).length) return true }
  }
  // A Compass can complete a line by adopting a neighbour's colour — test that
  // substitution so a board with a usable wildcard isn't judged dead.
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== WILD) continue
    const r = Math.floor(i / cols), c = i % cols
    const nbrs: number[] = []
    if (c > 0) nbrs.push(i - 1); if (c < cols - 1) nbrs.push(i + 1)
    if (r > 0) nbrs.push(i - cols); if (r < rows - 1) nbrs.push(i + cols)
    for (const nb of nbrs) {
      const x = board[nb]
      if (x < 0) continue
      const s = board.slice(); s[i] = x; s[nb] = x
      if (findMatches(s, cols, rows).length) return true
    }
  }
  return false
}

/** Reshuffle into a match-free, move-available board (for a dead board). */
export function reshuffle(rng: () => number, cols: number, rows: number, nTypes: number): number[] {
  for (let attempt = 0; attempt < 60; attempt++) {
    const b = initialBoard(rng, cols, rows, nTypes)
    if (hasValidMove(b, cols, rows)) return b
  }
  return initialBoard(rng, cols, rows, nTypes)
}
