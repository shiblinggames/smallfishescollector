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

// Compass wildcard sentinel. Sits below 0 so plain colour comparisons skip it,
// but findColorRuns counts it toward WHATEVER colour surrounds it — so a Compass
// auto-completes any line of 3+ it lands inside (via a swap or a cascade drop).
// It does NOT clear a whole colour; a straight line of 5+ does that.
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

export interface ColorRun { cells: number[]; color: number; hasWild: boolean }

/** Maximal horizontal/vertical runs (length ≥ 3) in which every cell is either
 *  one colour C or a Compass (WILD), containing at least one real C. Because a
 *  Compass counts toward whichever colour surrounds it, a Compass that lands
 *  INSIDE a line of same-colour gems auto-completes it. `color` is the run's
 *  colour; `hasWild` flags a run that already contains a Compass. */
export function findColorRuns(board: number[], cols: number, rows: number): ColorRun[] {
  const runs: ColorRun[] = []
  const colors = new Set<number>()
  for (const v of board) if (v >= 0) colors.add(v)

  const scan = (line: number[]) => {
    for (const color of colors) {
      let run: number[] = []
      for (let k = 0; k <= line.length; k++) {
        const v = k < line.length ? board[line[k]] : -99
        if (v === color || v === WILD) {
          run.push(line[k])
        } else {
          if (run.length >= 3 && run.some(idx => board[idx] === color)) {
            runs.push({ cells: run.slice(), color, hasWild: run.some(idx => board[idx] === WILD) })
          }
          run = []
        }
      }
    }
  }
  for (let r = 0; r < rows; r++) { const line: number[] = []; for (let c = 0; c < cols; c++) line.push(ix(r, c, cols)); scan(line) }
  for (let c = 0; c < cols; c++) { const line: number[] = []; for (let r = 0; r < rows; r++) line.push(ix(r, c, cols)); scan(line) }
  return runs
}

/** Indices that are part of any run of 3+ (a Compass counts as a wildcard). */
export function findMatches(board: number[], cols: number, rows: number): number[] {
  const hit = new Set<number>()
  for (const run of findColorRuns(board, cols, rows)) for (const i of run.cells) hit.add(i)
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
    const runs = findColorRuns(cur, cols, rows)
    if (runs.length === 0) break
    // A straight line of 5+ marks its colour for a full-board wipe.
    const wipeColors = new Set<number>()
    for (const run of runs) if (run.cells.length >= 5) wipeColors.add(run.color)
    // A plain line of exactly 4 (no Compass already in it, colour not being
    // wiped) leaves a Compass behind.
    const spawns = new Set<number>()
    for (const run of runs) {
      if (run.cells.length === 4 && !run.hasWild && !wipeColors.has(run.color)) {
        spawns.add(pickSpawn(run.cells, cascade === startCascade ? a : -1, cascade === startCascade ? b : -1))
      }
    }
    const clearedSet = new Set<number>()
    for (const run of runs) for (const i of run.cells) clearedSet.add(i)
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

  // A Compass is a wildcard everywhere (findColorRuns counts it toward whatever
  // colour surrounds it), so a swapped Compass is handled by the normal path
  // too: swap it next to a pair and it lands in the run and clears. A swap that
  // forms no match — Compass or not — is invalid.
  const swapped = swap(board, a, b)
  const r = runCascades(swapped, cols, rows, nTypes, rng, wildChance, a, b, 1)
  if (r.steps.length === 0) return null // no match → invalid move
  return { swapped, steps: r.steps, totalGained: r.totalGained, finalBoard: r.finalBoard }
}

/** Is there any swap that would create a match? Used to detect a dead
 *  board so it can be reshuffled. */
export function hasValidMove(board: number[], cols: number, rows: number): boolean {
  // findMatches is Compass-aware, so this single adjacent-swap sweep also finds
  // moves that use a Compass (sliding it next to a pair completes a line).
  for (let i = 0; i < board.length; i++) {
    const r = Math.floor(i / cols), c = i % cols
    if (c < cols - 1) { const s = swap(board, i, i + 1); if (findMatches(s, cols, rows).length) return true }
    if (r < rows - 1) { const s = swap(board, i, i + cols); if (findMatches(s, cols, rows).length) return true }
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
