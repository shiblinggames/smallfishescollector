// Pure sudoku engine for The Quartermaster's Hold — zero imports so it
// stays trivially testable in isolation (no Next/Supabase coupling).
// generate.ts wraps these with the daily cache; constants.ts owns the
// difficulty → clue-count mapping.
//
// Boards are number[] of length 81, row-major, 0 = empty. The public
// surface returns 81-char strings ('.' = empty) to match the storage
// encoding.

const SIZE = 9

function boxIndex(idx: number): number {
  const r = Math.floor(idx / SIZE)
  const c = idx % SIZE
  return Math.floor(r / 3) * 3 + Math.floor(c / 3)
}

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface Masks { rows: number[]; cols: number[]; boxes: number[] }

function makeMasks(board: number[]): Masks {
  const rows = new Array(SIZE).fill(0)
  const cols = new Array(SIZE).fill(0)
  const boxes = new Array(SIZE).fill(0)
  for (let i = 0; i < board.length; i++) {
    const v = board[i]
    if (!v) continue
    const bit = 1 << v
    rows[Math.floor(i / SIZE)] |= bit
    cols[i % SIZE] |= bit
    boxes[boxIndex(i)] |= bit
  }
  return { rows, cols, boxes }
}

function candidateBits(masks: Masks, idx: number): number {
  const used = masks.rows[Math.floor(idx / SIZE)] | masks.cols[idx % SIZE] | masks.boxes[boxIndex(idx)]
  return ~used & 0b1111111110 // bits 1..9 not yet used
}

function bitsToDigits(bits: number): number[] {
  const out: number[] = []
  for (let v = 1; v <= 9; v++) if (bits & (1 << v)) out.push(v)
  return out
}

function setCell(board: number[], masks: Masks, idx: number, v: number) {
  board[idx] = v
  const bit = 1 << v
  masks.rows[Math.floor(idx / SIZE)] |= bit
  masks.cols[idx % SIZE] |= bit
  masks.boxes[boxIndex(idx)] |= bit
}

function clearCell(board: number[], masks: Masks, idx: number, v: number) {
  board[idx] = 0
  const bit = ~(1 << v)
  masks.rows[Math.floor(idx / SIZE)] &= bit
  masks.cols[idx % SIZE] &= bit
  masks.boxes[boxIndex(idx)] &= bit
}

/** MRV cell pick. -1 = board full, -2 = dead end (empty cell w/ no
 *  candidates). */
function pickCell(board: number[], masks: Masks): { idx: number; bits: number } | -1 | -2 {
  let best = -1
  let bestBits = 0
  let bestCount = 10
  for (let i = 0; i < board.length; i++) {
    if (board[i]) continue
    const bits = candidateBits(masks, i)
    const count = bitsToDigits(bits).length
    if (count === 0) return -2
    if (count < bestCount) {
      bestCount = count; best = i; bestBits = bits
      if (count === 1) break
    }
  }
  if (best === -1) return -1
  return { idx: best, bits: bestBits }
}

/** Fill the board with one random complete solution, in place. */
export function fillRandom(board: number[], masks: Masks = makeMasks(board)): boolean {
  const pick = pickCell(board, masks)
  if (pick === -1) return true
  if (pick === -2) return false
  const { idx, bits } = pick
  for (const v of shuffled(bitsToDigits(bits))) {
    setCell(board, masks, idx, v)
    if (fillRandom(board, masks)) return true
    clearCell(board, masks, idx, v)
  }
  return false
}

/** Count solutions up to `limit` (default 2 — just "is it unique?").
 *  Non-destructive: operates on a copy of `source`. */
export function countSolutions(source: number[], limit = 2): number {
  const board = source.slice()
  const masks = makeMasks(board)
  let found = 0
  function recurse(): void {
    if (found >= limit) return
    const pick = pickCell(board, masks)
    if (pick === -1) { found++; return }
    if (pick === -2) return
    const { idx, bits } = pick
    for (const v of bitsToDigits(bits)) {
      setCell(board, masks, idx, v)
      recurse()
      clearCell(board, masks, idx, v)
      if (found >= limit) return
    }
  }
  recurse()
  return found
}

export function boardToStr(board: number[]): string {
  return board.map(v => (v ? String(v) : '.')).join('')
}

export function strToBoard(s: string): number[] {
  return s.split('').map(c => (c === '.' ? 0 : Number(c)))
}

/** Dig holes from a full solution toward `targetGivens`, keeping the
 *  puzzle uniquely solvable after every removal. */
function dig(full: number[], targetGivens: number): number[] {
  const puzzle = full.slice()
  let givens = puzzle.length
  for (const idx of shuffled(puzzle.map((_, i) => i))) {
    if (givens <= targetGivens) break
    if (puzzle[idx] === 0) continue
    const backup = puzzle[idx]
    puzzle[idx] = 0
    if (countSolutions(puzzle, 2) !== 1) {
      puzzle[idx] = backup // removal created ambiguity — restore
    } else {
      givens--
    }
  }
  return puzzle
}

export interface SudokuPuzzle {
  givens: string    // 81 chars, '.' = empty
  solution: string  // 81 chars — SERVER-ONLY, never sent to a client
}

/** Generate one puzzle with a guaranteed-unique solution, dug toward
 *  the requested clue count. */
export function generatePuzzle(targetGivens: number): SudokuPuzzle {
  const full = new Array(SIZE * SIZE).fill(0)
  fillRandom(full)
  const givens = dig(full, targetGivens)
  return { givens: boardToStr(givens), solution: boardToStr(full) }
}
