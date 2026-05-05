'use client'

import { useState, useTransition } from 'react'
import { makeChartGuess, claimChartReward } from './chartActions'

const CHART_SHIP_COLORS = ['#f0c040', '#d04040', '#4080c0', '#30b870', '#706080', '#e8e0d0', '#9060c0', '#c07040']
import type { ChartContest, ChartProgress, ChartGuess, ChartLeaderEntry } from './chartActions'

interface Props {
  contest: ChartContest
  progress: ChartProgress
  initialGuesses: ChartGuess[]
  initialMovesAvailable: number
  leaderboard: ChartLeaderEntry[]
}

const TILE = 30
const GAP = 3

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ChartBoard({ contest, progress, initialGuesses, initialMovesAvailable, leaderboard: initialLeaderboard }: Props) {
  const [guesses, setGuesses] = useState<ChartGuess[]>(initialGuesses)
  const [movesAvailable, setMovesAvailable] = useState(initialMovesAvailable)
  const [completed, setCompleted] = useState(!!progress.completed_at)
  const [showColorPicker, setShowColorPicker] = useState(!!progress.completed_at && !progress.ship_color)
  const [chosenColor, setChosenColor] = useState<string | null>(progress.ship_color ?? null)
  const [claimedColor, setClaimedColor] = useState<string | null>(progress.ship_color ?? null)
  const [isPending, startTransition] = useTransition()
  const [lastFlipped, setLastFlipped] = useState<{ row: number; col: number } | null>(null)

  const { grid_cols: cols, grid_rows: rows, start_col: startCol } = contest

  const correctGuesses = guesses.filter(g => g.correct).sort((a, b) => a.row - b.row)
  const lastCorrect = correctGuesses[correctGuesses.length - 1] ?? null
  const nextRow = (lastCorrect?.row ?? -1) + 1
  const anchorCol = lastCorrect ? lastCorrect.col : startCol

  const wrongInNextRow = new Set(guesses.filter(g => !g.correct && g.row === nextRow).map(g => g.col))
  const selectableCols = (!completed && nextRow < rows)
    ? ([-1, 0, 1].map(d => anchorCol + d).filter(c => c >= 0 && c < cols && !wrongInNextRow.has(c)))
    : []

  function getTileState(row: number, col: number): 'hidden' | 'correct' | 'wrong' {
    const g = guesses.find(g => g.row === row && g.col === col)
    if (!g) return 'hidden'
    return g.correct ? 'correct' : 'wrong'
  }

  function isSelectable(row: number, col: number) {
    return !isPending && movesAvailable > 0 && !completed && row === nextRow && selectableCols.includes(col)
  }

  function handleSelect(row: number, col: number) {
    if (isPending || movesAvailable <= 0) return
    setLastFlipped({ row, col })
    startTransition(async () => {
      const result = await makeChartGuess(contest.id, row, col)
      if ('error' in result) return
      setGuesses(prev => [...prev, { row, col, correct: result.correct }])
      setMovesAvailable(result.movesLeft)
      if (result.completed) {
        setCompleted(true)
        setShowColorPicker(true)
      }
    })
  }

  async function handleClaim() {
    if (!chosenColor) return
    const result = await claimChartReward(contest.id, chosenColor)
    if ('error' in result) return
    setClaimedColor(chosenColor)
    setShowColorPicker(false)
  }

  const highestRow = lastCorrect?.row ?? -1

  return (
    <div>
      {/* Header */}
      <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f0ede8', marginBottom: '0.25rem' }}>
        {contest.name}
      </p>
      <p className="font-karla" style={{ fontSize: '0.75rem', color: '#6a6050', marginBottom: '1.25rem' }}>
        Chart a path from sea to shore. One move per level gained.
      </p>

      {/* Stats bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(10,14,24,0.85)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '1.25rem',
      }}>
        <div>
          <p className="font-karla font-700" style={{ fontSize: '0.88rem', color: movesAvailable > 0 ? '#f0ede8' : '#4a4845' }}>
            {movesAvailable} {movesAvailable === 1 ? 'move' : 'moves'} available
          </p>
          <p className="font-karla" style={{ fontSize: '0.62rem', color: '#4a4028', marginTop: 1 }}>
            Gain fishing or navigator levels to earn more
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          {completed ? (
            <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#c8a840' }}>🏁 Complete!</p>
          ) : highestRow >= 0 ? (
            <>
              <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#c8a840' }}>
                Row {highestRow + 1} / {rows}
              </p>
              <p className="font-karla" style={{ fontSize: '0.58rem', color: '#4a4028', marginTop: 1 }}>charted</p>
            </>
          ) : (
            <p className="font-karla" style={{ fontSize: '0.75rem', color: '#4a4028' }}>Not started</p>
          )}
        </div>
      </div>

      {/* Color reward banner if already claimed */}
      {claimedColor && !showColorPicker && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          background: 'rgba(10,14,24,0.85)', border: `1px solid ${claimedColor}55`,
          borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '1.25rem',
        }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: claimedColor, flexShrink: 0 }} />
          <p className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#f0ede8' }}>
            Ship color claimed
          </p>
        </div>
      )}

      {/* Grid */}
      <div style={{ overflowX: 'auto', paddingBottom: '0.5rem' }}>
        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: GAP }}>

          {/* DESTINATION label */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 18, gap: GAP,
          }}>
            <p className="font-cinzel font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.48rem', color: '#c8a840' }}>
              ⚓ Destination
            </p>
          </div>

          {/* Rows: top (row 14) → bottom (row 0) */}
          {Array.from({ length: rows }, (_, i) => rows - 1 - i).map(row => (
            <div key={row} style={{ display: 'flex', gap: GAP }}>
              {Array.from({ length: cols }, (_, col) => {
                const state = getTileState(row, col)
                const selectable = isSelectable(row, col)
                const isRevealed = state !== 'hidden'
                const justFlipped = lastFlipped?.row === row && lastFlipped?.col === col && isPending

                return (
                  <div
                    key={col}
                    onClick={selectable ? () => handleSelect(row, col) : undefined}
                    style={{ width: TILE, height: TILE, perspective: '500px', flexShrink: 0, cursor: selectable ? 'pointer' : 'default' }}
                  >
                    <div style={{
                      width: '100%', height: '100%', position: 'relative',
                      transformStyle: 'preserve-3d',
                      transition: 'transform 0.38s cubic-bezier(0.4, 0, 0.2, 1)',
                      transform: (isRevealed || justFlipped) ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    }}>
                      {/* Front */}
                      <div style={{
                        position: 'absolute', inset: 0, borderRadius: 5,
                        backfaceVisibility: 'hidden',
                        background: selectable ? 'rgba(240,192,64,0.12)' : 'rgba(10,14,24,0.92)',
                        border: selectable
                          ? '1.5px solid rgba(240,192,64,0.6)'
                          : '1px solid rgba(255,255,255,0.07)',
                        boxShadow: selectable ? '0 0 10px rgba(240,192,64,0.22)' : 'none',
                        transition: 'background 0.15s, border 0.15s, box-shadow 0.15s',
                      }} />
                      {/* Back */}
                      <div style={{
                        position: 'absolute', inset: 0, borderRadius: 5,
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                        background: state === 'correct'
                          ? 'linear-gradient(135deg, rgba(28,170,100,0.92), rgba(18,130,75,0.96))'
                          : 'linear-gradient(135deg, rgba(195,42,58,0.92), rgba(155,32,48,0.96))',
                        border: state === 'correct'
                          ? '1px solid rgba(60,210,130,0.55)'
                          : '1px solid rgba(230,70,88,0.55)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isRevealed && (
                          <span style={{ fontSize: TILE * 0.44, color: 'rgba(255,255,255,0.9)', lineHeight: 1 }}>
                            {state === 'correct' ? '✓' : '✗'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          {/* Ship start row */}
          <div style={{ display: 'flex', gap: GAP, marginTop: 2 }}>
            {Array.from({ length: cols }, (_, col) => (
              <div key={col} style={{
                width: TILE, height: TILE, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: col === startCol ? '1.1rem' : '0',
              }}>
                {col === startCol ? '🚢' : null}
              </div>
            ))}
          </div>

        </div>
      </div>

      {movesAvailable === 0 && !completed && (
        <p className="font-karla" style={{ fontSize: '0.72rem', color: '#5a5040', textAlign: 'center', marginTop: '0.75rem' }}>
          No moves — gain a fishing or navigator level to continue
        </p>
      )}

      {/* Color picker overlay */}
      {showColorPicker && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 70,
          background: 'rgba(0,0,0,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem',
        }}>
          <div style={{
            background: 'linear-gradient(160deg, rgba(18,14,8,0.98), rgba(10,8,4,0.99))',
            border: '1px solid rgba(200,170,100,0.22)',
            borderRadius: 20, padding: '1.75rem 1.5rem',
            width: '100%', maxWidth: 340,
          }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0c040', textAlign: 'center', marginBottom: '0.4rem' }}>
              🏁 You charted the course!
            </p>
            <p className="font-karla" style={{ fontSize: '0.76rem', color: '#8a7a60', textAlign: 'center', marginBottom: '1.5rem' }}>
              Choose a color for your ship. This is your reward for being first.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: '1.5rem' }}>
              {CHART_SHIP_COLORS.map(hex => (
                <button
                  key={hex}
                  onClick={() => setChosenColor(hex)}
                  style={{
                    aspectRatio: '1',
                    borderRadius: 10,
                    background: hex,
                    border: chosenColor === hex ? '2.5px solid #fff' : '2px solid transparent',
                    boxShadow: chosenColor === hex ? `0 0 12px ${hex}88` : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                />
              ))}
            </div>

            <button
              onClick={handleClaim}
              disabled={!chosenColor}
              className="font-cinzel font-700 uppercase tracking-[0.1em]"
              style={{
                width: '100%', padding: '0.7rem',
                borderRadius: 10, fontSize: '0.72rem',
                background: chosenColor ? 'rgba(200,168,64,0.18)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${chosenColor ? 'rgba(200,168,64,0.5)' : 'rgba(255,255,255,0.08)'}`,
                color: chosenColor ? '#c8a840' : '#4a4845',
                cursor: chosenColor ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s',
              }}
            >
              Claim Reward →
            </button>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      {initialLeaderboard.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#c4a96a', marginBottom: '0.6rem', letterSpacing: '0.04em' }}>
            Race Standings
          </p>
          <div style={{
            background: 'rgba(4,10,20,0.82)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14, overflow: 'hidden',
          }}>
            {initialLeaderboard.map((entry, i) => (
              <div
                key={entry.username}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '0.65rem 1rem',
                  borderBottom: i < initialLeaderboard.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  background: entry.completed_at ? 'rgba(200,168,64,0.06)' : 'transparent',
                }}
              >
                <span className="font-karla font-700" style={{ width: 18, textAlign: 'right', fontSize: '0.68rem', color: '#4a4845', flexShrink: 0 }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-karla font-700 truncate" style={{ fontSize: '0.8rem', color: entry.completed_at ? '#f0c040' : '#c8c8c2' }}>
                    {entry.username}
                    {entry.completed_at && <span style={{ fontSize: '0.55rem', color: '#c8a840', marginLeft: 6 }}>🏁 finished</span>}
                  </p>
                  {entry.completed_at && (
                    <p className="font-karla" style={{ fontSize: '0.55rem', color: '#6a5a40' }}>{formatDate(entry.completed_at)}</p>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p className="font-karla font-700" style={{ fontSize: '0.75rem', color: entry.completed_at ? '#c8a840' : '#6a7890' }}>
                    {entry.completed_at ? `${rows}/${rows}` : `${entry.highest_row + 1}/${rows}`}
                  </p>
                  <p className="font-karla" style={{ fontSize: '0.55rem', color: '#3a3835' }}>
                    {entry.moves_used} moves
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pb-16" />
    </div>
  )
}
