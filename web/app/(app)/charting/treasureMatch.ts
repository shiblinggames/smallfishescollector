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
// match); it only does something when swapped (resolveSwap detonates a colour).
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
export function resolveSwap(
  board: number[], a: number, b: number,
  cols: number, rows: number, nTypes: number, rng: () => number,
  wildChance = 0,
): ResolveResult | null {
  if (!areAdjacent(a, b, cols)) return null

  // ── Compass wildcard detonation ──
  // Swapping a Compass against a normal gem clears EVERY gem of that gem's
  // colour (plus the Compass), then cascades like any other clear. Two
  // Compasses have no colour to lock onto → treated as an invalid swap.
  const aWild = board[a] === WILD, bWild = board[b] === WILD
  if (aWild || bWild) {
    if (aWild && bWild) return null
    const target = aWild ? board[b] : board[a]
    if (target < 0) return null
    const detonated: number[] = []
    for (let i = 0; i < board.length; i++) if (board[i] === target) detonated.push(i)
    detonated.push(aWild ? a : b) // the Compass pops too
    const steps: ResolveStep[] = []
    let totalGained = 0
    let cur = board
    let cleared = detonated
    let cascade = 1
    while (cleared.length > 0) {
      const gained = cleared.length * 10 * cascade
      totalGained += gained
      const resultBoard = collapseAndRefill(cur, cleared, cols, rows, rng, nTypes, wildChance)
      steps.push({ cleared, gained, resultBoard })
      cur = resultBoard
      cascade++
      cleared = findMatches(cur, cols, rows)
    }
    return { swapped: board, steps, totalGained, finalBoard: cur }
  }

  const swapped = swap(board, a, b)
  let cur = swapped
  let cascade = 1
  let totalGained = 0
  const steps: ResolveStep[] = []
  while (true) {
    const m = findMatches(cur, cols, rows)
    if (m.length === 0) break
    const gained = m.length * 10 * cascade
    totalGained += gained
    const resultBoard = collapseAndRefill(cur, m, cols, rows, rng, nTypes, wildChance)
    steps.push({ cleared: m, gained, resultBoard })
    cur = resultBoard
    cascade++
  }
  if (steps.length === 0) return null // no match → invalid move
  return { swapped, steps, totalGained, finalBoard: cur }
}

/** Is there any swap that would create a match? Used to detect a dead
 *  board so it can be reshuffled. */
export function hasValidMove(board: number[], cols: number, rows: number): boolean {
  if (board.includes(WILD)) return true // a Compass can always be detonated
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
