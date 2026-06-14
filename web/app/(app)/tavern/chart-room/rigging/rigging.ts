// Pure engine for Lay the Rigging (Flow / connect-the-pairs) — zero
// imports so it stays trivially testable. generate.ts wraps it with the
// weekly cache; actions.ts validates solves with isSolved().
//
// A board is solvable BY CONSTRUCTION: we build one random Hamiltonian
// path over every cell, cut it into K contiguous segments, and take each
// segment's two ends as a colored pair. The segments ARE a valid full
// cover, so the puzzle always has at least one solution. Only the pairs
// are stored/sent — never the solution.
//
// Cells are flat indices 0..cols*rows-1, row-major.

export function neighborsOf(i: number, cols: number, rows: number): number[] {
  const r = Math.floor(i / cols)
  const c = i % cols
  const out: number[] = []
  if (r > 0) out.push(i - cols)
  if (r < rows - 1) out.push(i + cols)
  if (c > 0) out.push(i - 1)
  if (c < cols - 1) out.push(i + 1)
  return out
}

function adjacent(a: number, b: number, cols: number, rows: number): boolean {
  return neighborsOf(a, cols, rows).includes(b)
}

function snakePath(cols: number, rows: number): number[] {
  const path: number[] = []
  for (let r = 0; r < rows; r++) {
    if (r % 2 === 0) for (let c = 0; c < cols; c++) path.push(r * cols + c)
    else for (let c = cols - 1; c >= 0; c--) path.push(r * cols + c)
  }
  return path
}

/** Backbite: randomize a Hamiltonian path while keeping it Hamiltonian.
 *  Pick an end, pick a random neighbor of that end already in the path,
 *  reverse the tail past it. Coverage is preserved every step. */
function backbite(path: number[], cols: number, rows: number, iterations: number) {
  const pos = new Map<number, number>()
  path.forEach((cell, idx) => pos.set(cell, idx))
  const n = path.length
  for (let it = 0; it < iterations; it++) {
    const atTail = Math.floor(Math.random() * 2) === 0
    const endCell = atTail ? path[n - 1] : path[0]
    const nbrs = neighborsOf(endCell, cols, rows)
    const v = nbrs[Math.floor(Math.random() * nbrs.length)]
    const j = pos.get(v)!
    if (atTail) {
      // reverse path[j+1 .. n-1]
      if (j >= n - 2) continue
      let lo = j + 1, hi = n - 1
      while (lo < hi) {
        ;[path[lo], path[hi]] = [path[hi], path[lo]]
        pos.set(path[lo], lo); pos.set(path[hi], hi)
        lo++; hi--
      }
      if (lo === hi) pos.set(path[lo], lo)
    } else {
      // reverse path[0 .. j-1]
      if (j <= 1) continue
      let lo = 0, hi = j - 1
      while (lo < hi) {
        ;[path[lo], path[hi]] = [path[hi], path[lo]]
        pos.set(path[lo], lo); pos.set(path[hi], hi)
        lo++; hi--
      }
      if (lo === hi) pos.set(path[lo], lo)
    }
  }
}

function cutLengths(total: number, parts: number): number[] {
  const lengths = new Array(parts).fill(2)
  let remaining = total - 2 * parts
  while (remaining > 0) {
    lengths[Math.floor(Math.random() * parts)]++
    remaining--
  }
  return lengths
}

export interface RiggingPair { color: number; a: number; b: number }
export interface GeneratedRigging {
  cols: number
  rows: number
  pairs: RiggingPair[]
  solution: number[][]   // per-color cell path (server-side reference / tests)
}

export function generateBoard(cols: number, rows: number, colorCount: number): GeneratedRigging {
  const path = snakePath(cols, rows)
  backbite(path, cols, rows, cols * rows * 12)
  const lengths = cutLengths(cols * rows, colorCount)
  const pairs: RiggingPair[] = []
  const solution: number[][] = []
  let cursor = 0
  for (let color = 0; color < colorCount; color++) {
    const seg = path.slice(cursor, cursor + lengths[color])
    cursor += lengths[color]
    solution.push(seg)
    pairs.push({ color, a: seg[0], b: seg[seg.length - 1] })
  }
  return { cols, rows, pairs, solution }
}

// ── Validation ──────────────────────────────────────────────────────
// A solve: every color's path is a simple orthogonal chain joining its
// two endpoints, paths are mutually disjoint, and together they cover
// every cell.

/** Validate a single color's path against its endpoints. */
export function isPathValid(pathCells: number[], pair: RiggingPair, cols: number, rows: number): boolean {
  if (!Array.isArray(pathCells) || pathCells.length < 2) return false
  const ends = new Set([pair.a, pair.b])
  const first = pathCells[0], last = pathCells[pathCells.length - 1]
  if (!ends.has(first) || !ends.has(last) || first === last) return false
  const seen = new Set<number>()
  for (let k = 0; k < pathCells.length; k++) {
    const cell = pathCells[k]
    if (cell < 0 || cell >= cols * rows) return false
    if (seen.has(cell)) return false
    seen.add(cell)
    if (k > 0 && !adjacent(pathCells[k - 1], cell, cols, rows)) return false
  }
  // interior cells must not be another endpoint of THIS pair (already
  // covered by simple-path check) — fine.
  return true
}

export function isSolved(
  cols: number, rows: number,
  pairs: RiggingPair[],
  paths: Record<number, number[]>,
): boolean {
  const covered = new Set<number>()
  for (const pair of pairs) {
    const p = paths[pair.color]
    if (!p || !isPathValid(p, pair, cols, rows)) return false
    for (const cell of p) {
      if (covered.has(cell)) return false // overlap between colors
      covered.add(cell)
    }
  }
  return covered.size === cols * rows // full coverage
}
