// Pure minesweeper engine for The Minefield — zero imports so it stays
// trivially testable in isolation (no Next/Supabase coupling). generate.ts
// wraps generateBoard with the weekly cache; actions.ts drives reveals.
//
// Tiles are a flat index 0..cols*rows-1, row-major. The mine layout is
// produced here and lives server-side only; the client never receives it.

export function neighborsOf(i: number, cols: number, rows: number): number[] {
  const r = Math.floor(i / cols)
  const c = i % cols
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const nr = r + dr, nc = c + dc
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
      out.push(nr * cols + nc)
    }
  }
  return out
}

export function adjacentMineCount(mines: Set<number>, i: number, cols: number, rows: number): number {
  let n = 0
  for (const j of neighborsOf(i, cols, rows)) if (mines.has(j)) n++
  return n
}

export function safeCellCount(cols: number, rows: number, mineCount: number): number {
  return cols * rows - mineCount
}

/** Reveal from `start` outward: a single tile if it borders mines, or its
 *  whole zero-region (classic flood fill) if it doesn't. Never reveals a
 *  mine, an already-revealed tile, or a flagged (`blocked`) tile. Returns
 *  the newly revealed indices. */
export function floodReveal(
  mines: Set<number>, cols: number, rows: number,
  start: number, already: Set<number>, blocked: Set<number>,
): number[] {
  if (mines.has(start) || already.has(start) || blocked.has(start)) return []
  const revealed: number[] = []
  const seen = new Set<number>()
  const stack = [start]
  while (stack.length) {
    const c = stack.pop()!
    if (seen.has(c) || already.has(c) || blocked.has(c) || mines.has(c)) continue
    seen.add(c)
    revealed.push(c)
    if (adjacentMineCount(mines, c, cols, rows) === 0) {
      for (const nb of neighborsOf(c, cols, rows)) {
        if (!seen.has(nb) && !already.has(nb) && !blocked.has(nb) && !mines.has(nb)) stack.push(nb)
      }
    }
  }
  return revealed
}

export interface GeneratedBoard {
  mines: number[]    // SERVER-ONLY mine indices
  opening: number[]  // guaranteed-safe starting region, auto-revealed for everyone
}

/** Build a board with `mineCount` mines on a cols×rows grid. Mines avoid a
 *  random safe seed + its neighbors so the seed is a guaranteed zero; the
 *  board's opening is that seed's flood region. Retries until the opening
 *  is a decent size so every player starts with a real foothold. */
export function generateBoard(cols: number, rows: number, mineCount: number): GeneratedBoard {
  const total = cols * rows
  const minOpening = Math.max(6, Math.floor(total * 0.06))
  for (let attempt = 0; attempt < 200; attempt++) {
    const seed = Math.floor(Math.random() * total)
    const forbidden = new Set<number>([seed, ...neighborsOf(seed, cols, rows)])
    const candidates: number[] = []
    for (let i = 0; i < total; i++) if (!forbidden.has(i)) candidates.push(i)
    // Fisher–Yates partial shuffle to pick mineCount distinct mines.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
    }
    const mines = new Set(candidates.slice(0, mineCount))
    const opening = floodReveal(mines, cols, rows, seed, new Set(), new Set())
    if (opening.length >= minOpening) {
      return { mines: [...mines].sort((a, b) => a - b), opening: opening.sort((a, b) => a - b) }
    }
  }
  // Fallback: accept whatever the last seed produced (extremely unlikely).
  const seed = 0
  const forbidden = new Set<number>([seed, ...neighborsOf(seed, cols, rows)])
  const candidates: number[] = []
  for (let i = 0; i < total; i++) if (!forbidden.has(i)) candidates.push(i)
  const mines = new Set(candidates.slice(0, mineCount))
  const opening = floodReveal(mines, cols, rows, seed, new Set(), new Set())
  return { mines: [...mines].sort((a, b) => a - b), opening: opening.sort((a, b) => a - b) }
}
