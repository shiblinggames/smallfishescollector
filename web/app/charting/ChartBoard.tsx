'use client'

import { useState, useTransition } from 'react'
import { makeChartGuess, claimChartReward } from './chartActions'
import type { ChartContest, ChartProgress, ChartGuess, ChartFinisher } from './chartActions'
import { getShip } from '@/lib/ships'

const SHIP_COLORS = ['#f0c040', '#d04040', '#4080c0', '#30b870', '#706080', '#e8e0d0', '#9060c0', '#c07040']
const MEDAL = ['🥇', '🥈', '🥉']
const GAP = 2         // px gap between tiles
const EXTEND = 1      // px connectors extend past tile edge into gap
const LINE_COLOR = 'rgba(56,210,130,0.9)'
const LINE_W = 2      // px line width

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface Props {
  contest: ChartContest
  progress: ChartProgress
  initialGuesses: ChartGuess[]
  initialMovesAvailable: number
  pathLength: number
  startTile: [number, number]
  finishers: ChartFinisher[]
  shipTier: number
}

export default function ChartBoard({
  contest, progress, initialGuesses, initialMovesAvailable,
  pathLength, startTile, finishers, shipTier,
}: Props) {
  const [guesses, setGuesses] = useState<ChartGuess[]>(initialGuesses)
  const [pathIndex, setPathIndex] = useState(progress.path_index ?? 0)
  const [movesAvailable, setMovesAvailable] = useState(initialMovesAvailable)
  const [completed, setCompleted] = useState(!!progress.completed_at)
  const [showColorPicker, setShowColorPicker] = useState(!!progress.completed_at && !progress.ship_color)
  const [chosenColor, setChosenColor] = useState<string | null>(progress.ship_color ?? null)
  const [claimedColor, setClaimedColor] = useState<string | null>(progress.ship_color ?? null)
  const [isPending, startTransition] = useTransition()
  const ship = getShip(shipTier)

  const { grid_cols: cols, grid_rows: rows } = contest

  const correctGuesses = guesses.filter(g => g.correct)
  const currentTile: [number, number] = correctGuesses.length > 0
    ? [correctGuesses[correctGuesses.length - 1].row, correctGuesses[correctGuesses.length - 1].col]
    : startTile

  // Full visited chain: start tile + each correct guess in order
  const visitedTiles: [number, number][] = [
    startTile,
    ...correctGuesses.map(g => [g.row, g.col] as [number, number]),
  ]

  const [curRow, curCol] = currentTile
  const correctGuessKeys = new Set(correctGuesses.map(g => `${g.row}_${g.col}`))

  const selectable: Set<string> = new Set(
    (!completed && !isPending && movesAvailable > 0)
      ? ([[curRow + 1, curCol], [curRow, curCol - 1], [curRow, curCol + 1]] as [number, number][])
          .filter(([r, c]) => r >= 0 && r < rows && c >= 0 && c < cols && !correctGuessKeys.has(`${r}_${c}`))
          .map(([r, c]) => `${r}_${c}`)
      : []
  )

  // For a visited tile, return which directions the path line extends
  function getConnections(row: number, col: number) {
    const idx = visitedTiles.findIndex(([r, c]) => r === row && c === col)
    if (idx === -1) return null
    const neighbors = [
      idx > 0 ? visitedTiles[idx - 1] : null,
      idx < visitedTiles.length - 1 ? visitedTiles[idx + 1] : null,
    ].filter((n): n is [number, number] => n !== null)
    return {
      up:    neighbors.some(([r, c]) => r === row + 1 && c === col),
      down:  neighbors.some(([r, c]) => r === row - 1 && c === col),
      left:  neighbors.some(([r, c]) => r === row && c === col - 1),
      right: neighbors.some(([r, c]) => r === row && c === col + 1),
    }
  }

  function tileState(row: number, col: number) {
    if (row === currentTile[0] && col === currentTile[1]) return 'current'
    if (guesses.some(g => g.row === row && g.col === col && g.correct)) return 'visited'
    if (guesses.some(g => g.row === row && g.col === col && !g.correct)) return 'wrong'
    if (row === startTile[0] && col === startTile[1]) return 'visited'
    return 'hidden'
  }

  function handleSelect(row: number, col: number) {
    if (isPending || movesAvailable <= 0) return
    startTransition(async () => {
      const result = await makeChartGuess(contest.id, row, col)
      if ('error' in result) return
      setGuesses(prev => [...prev, { row, col, correct: result.correct }])
      setMovesAvailable(result.movesLeft)
      if (result.correct) setPathIndex(result.newPathIndex)
      if (result.completed) { setCompleted(true); setShowColorPicker(true) }
    })
  }

  async function handleClaim() {
    if (!chosenColor) return
    const result = await claimChartReward(contest.id, chosenColor)
    if ('error' in result) return
    setClaimedColor(chosenColor)
    setShowColorPicker(false)
  }

  return (
    <div>
      <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f0ede8', marginBottom: '0.25rem' }}>
        {contest.name}
      </p>
      <p className="font-karla" style={{ fontSize: '0.75rem', color: '#6a6050', marginBottom: '1.25rem' }}>
        Chart a path from sea to shore. Move up, left, or right. Every guess costs one move.
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
          ) : (
            <>
              <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#c8a840' }}>
                {pathIndex} / {pathLength - 1}
              </p>
              <p className="font-karla" style={{ fontSize: '0.58rem', color: '#4a4028', marginTop: 1 }}>tiles charted</p>
            </>
          )}
        </div>
      </div>

      {claimedColor && !showColorPicker && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          background: 'rgba(10,14,24,0.85)', border: `1px solid ${claimedColor}55`,
          borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '1.25rem',
        }}>
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: claimedColor, flexShrink: 0 }} />
          <p className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#f0ede8' }}>Ship color claimed</p>
        </div>
      )}

      {/* Grid */}
      <div style={{ width: '100%' }}>
        <p className="font-cinzel font-700 uppercase tracking-[0.12em]" style={{
          fontSize: '0.44rem', color: '#c8a840', textAlign: 'center', marginBottom: 4,
        }}>⚓ Destination</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, width: '100%' }}>
          {Array.from({ length: rows }, (_, i) => rows - 1 - i).map(row => (
            <div key={row} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: GAP }}>
              {Array.from({ length: cols }, (_, col) => {
                const key = `${row}_${col}`
                const state = tileState(row, col)
                const isSelectable = selectable.has(key)
                const isGreen = state === 'current' || state === 'visited'
                const isRed = state === 'wrong'
                const conn = isGreen ? getConnections(row, col) : null

                return (
                  <div
                    key={col}
                    onClick={isSelectable ? () => handleSelect(row, col) : undefined}
                    style={{ aspectRatio: '1', position: 'relative', cursor: isSelectable ? 'pointer' : 'default' }}
                  >
                    {/* Tile face — border-only color changes */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      borderRadius: 4,
                      background: 'rgba(10,14,24,0.92)',
                      border: isGreen
                        ? `${LINE_W}px solid rgba(50,210,120,${state === 'current' ? '1' : '0.65'})`
                        : isRed
                        ? `${LINE_W}px solid rgba(210,55,70,0.65)`
                        : isSelectable
                        ? '1.5px solid rgba(240,192,64,0.65)'
                        : '1px solid rgba(255,255,255,0.07)',
                      boxShadow: isGreen
                        ? `0 0 ${state === 'current' ? '8' : '5'}px rgba(50,210,120,${state === 'current' ? '0.35' : '0.2'})`
                        : isRed
                        ? '0 0 5px rgba(210,55,70,0.2)'
                        : isSelectable
                        ? '0 0 8px rgba(240,192,64,0.2)'
                        : 'none',
                      transition: 'border-color 0.25s, box-shadow 0.25s',
                      zIndex: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                    }}>
                      {state === 'current' && ship.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ship.imageUrl}
                          alt={ship.name}
                          style={{ width: '68%', height: '68%', objectFit: 'contain', position: 'relative', zIndex: 2 }}
                        />
                      )}
                    </div>

                    {/* Path line connectors — extend EXTEND px past tile edge to bridge the gap */}
                    {conn && (
                      <>
                        {conn.up && (
                          <div style={{
                            position: 'absolute', left: '50%', top: -EXTEND,
                            height: `calc(50% + ${EXTEND}px)`, width: LINE_W,
                            background: LINE_COLOR, transform: 'translateX(-50%)', zIndex: 2,
                          }} />
                        )}
                        {conn.down && (
                          <div style={{
                            position: 'absolute', left: '50%', bottom: -EXTEND,
                            height: `calc(50% + ${EXTEND}px)`, width: LINE_W,
                            background: LINE_COLOR, transform: 'translateX(-50%)', zIndex: 2,
                          }} />
                        )}
                        {conn.left && (
                          <div style={{
                            position: 'absolute', top: '50%', left: -EXTEND,
                            width: `calc(50% + ${EXTEND}px)`, height: LINE_W,
                            background: LINE_COLOR, transform: 'translateY(-50%)', zIndex: 2,
                          }} />
                        )}
                        {conn.right && (
                          <div style={{
                            position: 'absolute', top: '50%', right: -EXTEND,
                            width: `calc(50% + ${EXTEND}px)`, height: LINE_W,
                            background: LINE_COLOR, transform: 'translateY(-50%)', zIndex: 2,
                          }} />
                        )}
                        {/* Node dot at centre — hidden behind ship on current tile */}
                        {state !== 'current' && (
                          <div style={{
                            position: 'absolute', top: '50%', left: '50%',
                            width: 4, height: 4, borderRadius: '50%',
                            background: LINE_COLOR,
                            transform: 'translate(-50%, -50%)', zIndex: 3,
                          }} />
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <p className="font-cinzel font-700 uppercase tracking-[0.12em]" style={{
          fontSize: '0.44rem', color: '#4a5840', textAlign: 'center', marginTop: 4,
        }}>Start</p>
      </div>

      {movesAvailable === 0 && !completed && (
        <p className="font-karla" style={{ fontSize: '0.72rem', color: '#5a5040', textAlign: 'center', marginTop: '0.75rem' }}>
          No moves — gain a fishing or navigator level to continue
        </p>
      )}

      {/* Top 3 finishers */}
      {finishers.length > 0 && (
        <div style={{ marginTop: '1.75rem' }}>
          <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#c4a96a', marginBottom: '0.6rem', letterSpacing: '0.04em' }}>
            First Ashore
          </p>
          <div style={{
            background: 'rgba(4,10,20,0.82)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14, overflow: 'hidden',
          }}>
            {finishers.map((f, i) => (
              <div key={f.username} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0.65rem 1rem',
                borderBottom: i < finishers.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                background: 'rgba(200,168,64,0.06)',
              }}>
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>{MEDAL[i]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-karla font-700 truncate" style={{ fontSize: '0.82rem', color: '#f0c040' }}>{f.username}</p>
                  <p className="font-karla" style={{ fontSize: '0.58rem', color: '#6a5a40' }}>{formatDate(f.completed_at)}</p>
                </div>
                <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#8a7860' }}>{f.moves_used} moves</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Color picker */}
      {showColorPicker && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 70,
          background: 'rgba(0,0,0,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem',
        }}>
          <div style={{
            background: 'linear-gradient(160deg,rgba(18,14,8,0.98),rgba(10,8,4,0.99))',
            border: '1px solid rgba(200,170,100,0.22)',
            borderRadius: 20, padding: '1.75rem 1.5rem',
            width: '100%', maxWidth: 340,
          }}>
            <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0c040', textAlign: 'center', marginBottom: '0.4rem' }}>
              🏁 You charted the course!
            </p>
            <p className="font-karla" style={{ fontSize: '0.76rem', color: '#8a7a60', textAlign: 'center', marginBottom: '1.5rem' }}>
              Choose a color for your ship.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: '1.5rem' }}>
              {SHIP_COLORS.map(hex => (
                <button key={hex} onClick={() => setChosenColor(hex)} style={{
                  aspectRatio: '1', borderRadius: 10, background: hex,
                  border: chosenColor === hex ? '2.5px solid #fff' : '2px solid transparent',
                  boxShadow: chosenColor === hex ? `0 0 12px ${hex}88` : 'none',
                  cursor: 'pointer', transition: 'all 0.15s',
                }} />
              ))}
            </div>
            <button
              onClick={handleClaim}
              disabled={!chosenColor}
              className="font-cinzel font-700 uppercase tracking-[0.1em]"
              style={{
                width: '100%', padding: '0.7rem', borderRadius: 10, fontSize: '0.72rem',
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

      <div className="pb-16" />
    </div>
  )
}
