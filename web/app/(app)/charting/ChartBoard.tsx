'use client'

import { useState, useTransition, useEffect } from 'react'
import { makeChartGuess } from './chartActions'
import type { ChartContest, ChartProgress, ChartGuess, ChartFinisher } from './chartActions'
import { getShip } from '@/lib/ships'

const MEDAL = ['🥇', '🥈', '🥉']
const GAP = 2
const EXTEND = 1
const LINE_COLOR = 'rgba(56,210,130,0.9)'
const LINE_W = 2
const MILESTONE_ROWS: Record<number, number> = { 5: 2000, 10: 5000 }
// Top-3 finisher rewards (paid in chartActions.makeChartGuess on completion).
// Keep in sync with the server table there.
const FINISHER_REWARDS: Record<number, number> = { 1: 10000, 2: 7500, 3: 5000 }

function ordinal(n: number) { return ['1st', '2nd', '3rd'][n - 1] ?? `${n}th` }
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface Props {
  contest: ChartContest
  progress: ChartProgress
  initialGuesses: ChartGuess[]
  initialMovesAvailable: number
  /** YYYY-MM-DD UTC of the day a new move next lands. Used for the
   *  "next move in HH:MM" countdown when the player is at 0. */
  nextGrantDate: string
  pathLength: number
  startTile: [number, number]
  finishers: ChartFinisher[]
  shipTier: number
  completionPosition: number | null
}

export default function ChartBoard({
  contest, progress, initialGuesses, initialMovesAvailable,
  nextGrantDate, pathLength, startTile, finishers, shipTier, completionPosition,
}: Props) {
  const [guesses, setGuesses] = useState<ChartGuess[]>(initialGuesses)
  const [pathIndex, setPathIndex] = useState(progress.path_index ?? 0)
  const [movesAvailable, setMovesAvailable] = useState(initialMovesAvailable)
  const [completed, setCompleted] = useState(!!progress.completed_at)
  const [finisherPosition, setFinisherPosition] = useState<number | null>(completionPosition)
  const [showReward, setShowReward] = useState(false)
  const [bonusToast, setBonusToast] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const ship = getShip(shipTier)

  // Live "next move in HH:MM" countdown to UTC midnight of nextGrantDate.
  // Single 60s tick is enough — minute precision matches the displayed format
  // and avoids a per-second re-render for a passive label.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  const nextGrantAt = new Date(`${nextGrantDate}T00:00:00.000Z`).getTime()
  const msToNext = Math.max(0, nextGrantAt - now)
  const hrsToNext = Math.floor(msToNext / 3_600_000)
  const minToNext = Math.floor((msToNext % 3_600_000) / 60_000)
  const nextLabel = msToNext <= 0
    ? 'Refresh to claim today’s move'
    : `Next move in ${hrsToNext}h ${minToNext}m`

  const { grid_cols: cols, grid_rows: rows } = contest

  const correctGuesses = guesses.filter(g => g.correct)
  const currentTile: [number, number] = correctGuesses.length > 0
    ? [correctGuesses[correctGuesses.length - 1].row, correctGuesses[correctGuesses.length - 1].col]
    : startTile

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
      if (result.completed) {
        setCompleted(true)
        setFinisherPosition(result.completionPosition)
        if (result.completionPosition !== null) setShowReward(true)
      }
      if (result.bonusDoubloons > 0) {
        setBonusToast(`+${result.bonusDoubloons.toLocaleString()} ⟡`)
        setTimeout(() => setBonusToast(null), 3500)
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: result.newDoubloonTotal }))
      }
    })
  }

  return (
    <div>
      <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f0ede8', marginBottom: '0.25rem' }}>
        {contest.name}
      </p>
      <p className="font-karla" style={{ fontSize: '0.84rem', color: '#9a9080', marginBottom: '1.25rem' }}>
        Chart a path from sea to shore. Move up, left, or right. One move arrives each day you log in. Skip a day and that day’s move is gone.
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
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#7a7060', marginTop: 1 }}>
            {completed ? 'Path charted' : nextLabel}
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
              <p className="font-karla" style={{ fontSize: '0.68rem', color: '#7a7060', marginTop: 1 }}>tiles charted</p>
            </>
          )}
        </div>
      </div>

      {/* Inline position banner for returning completed top-3 players */}
      {!showReward && finisherPosition !== null && completed && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          background: 'rgba(10,14,24,0.85)', border: '1px solid rgba(200,168,64,0.3)',
          borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '1.25rem',
        }}>
          <span style={{ fontSize: '1.2rem' }}>{MEDAL[finisherPosition - 1]}</span>
          <div>
            <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#f0c040' }}>
              {ordinal(finisherPosition)} to chart the course
            </p>
            <p className="font-karla" style={{ fontSize: '0.68rem', color: '#7a6a50' }}>
              +{FINISHER_REWARDS[finisherPosition].toLocaleString()} ⟡ awarded
            </p>
          </div>
        </div>
      )}

      {/* Grid. Used to wrap this in perspective + rotateX(12deg) scaleX(0.88)
          for a "map on a table" tilt, but CSS transforms don't update layout
          flow — the tilted bottom rows paint over the finishers leaderboard
          below. Flat is correct (Destination ↑ / Start ↓ labels already
          orient the chart) and lets the leaderboard sit cleanly beneath. */}
      <div style={{ width: '100%' }}>
        <div>
        <p className="font-cinzel font-700 uppercase tracking-[0.12em]" style={{
          fontSize: '0.62rem', color: '#c8a840', textAlign: 'center', marginBottom: 4,
        }}>⚓ Destination</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, width: '100%' }}>
          {Array.from({ length: rows }, (_, i) => rows - 1 - i).map(row => (
            <div key={row}>
              {/* Milestone line above this row */}
              {MILESTONE_ROWS[row] !== undefined && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  marginBottom: GAP, marginTop: 2,
                }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(240,192,64,0.35)', borderTop: '1px dashed rgba(240,192,64,0.45)' }} />
                  <span className="font-karla font-700" style={{ fontSize: '0.58rem', color: '#c8a840', whiteSpace: 'nowrap' }}>
                    +{MILESTONE_ROWS[row].toLocaleString()} ⟡
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(240,192,64,0.35)', borderTop: '1px dashed rgba(240,192,64,0.45)' }} />
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: GAP }}>
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
            </div>
          ))}
        </div>

        <p className="font-cinzel font-700 uppercase tracking-[0.12em]" style={{
          fontSize: '0.62rem', color: '#7a8870', textAlign: 'center', marginTop: 4,
        }}>Start</p>
        </div>
      </div>

      {movesAvailable === 0 && !completed && (
        <p className="font-karla" style={{ fontSize: '0.72rem', color: '#8a8070', textAlign: 'center', marginTop: '0.75rem' }}>
          Out of moves — {nextLabel.toLowerCase()}.
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
                  <p className="font-karla" style={{ fontSize: '0.58rem', color: '#8a7a60' }}>{formatDate(f.completed_at)}</p>
                </div>
                <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#a09070' }}>{f.moves_used} moves</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pb-16" />

      {/* Bonus toast */}
      {bonusToast && (
        <div style={{
          position: 'fixed', bottom: '5rem', left: '50%', transform: 'translateX(-50%)',
          zIndex: 80, pointerEvents: 'none',
          background: 'rgba(10,14,24,0.95)', border: '1px solid rgba(240,192,64,0.5)',
          borderRadius: 12, padding: '0.6rem 1.2rem',
        }}>
          <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0c040', whiteSpace: 'nowrap' }}>
            {bonusToast}
          </p>
        </div>
      )}

      {/* Position reward modal — shown on completion for top 3 */}
      {showReward && finisherPosition !== null && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 70,
          background: 'rgba(0,0,0,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem',
        }}>
          <div style={{
            background: 'linear-gradient(160deg,rgba(18,14,8,0.98),rgba(10,8,4,0.99))',
            border: '1px solid rgba(200,170,100,0.22)',
            borderRadius: 20, padding: '2rem 1.5rem',
            width: '100%', maxWidth: 340, textAlign: 'center',
          }}>
            <p style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{MEDAL[finisherPosition - 1]}</p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0c040', marginBottom: '0.4rem' }}>
              {ordinal(finisherPosition)} to Chart the Course!
            </p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: '#f0ede8', marginBottom: '0.4rem', textShadow: '0 0 18px rgba(240,192,64,0.4)' }}>
              +{FINISHER_REWARDS[finisherPosition].toLocaleString()} <span style={{ color: '#c8a840' }}>⟡</span>
            </p>
            <p className="font-karla" style={{ fontSize: '0.8rem', color: '#9a8a70', marginBottom: '1.75rem', lineHeight: 1.5 }}>
              Paid straight to your purse. Fair winds, captain.
            </p>
            <button
              onClick={() => setShowReward(false)}
              className="font-cinzel font-700 uppercase tracking-[0.1em]"
              style={{
                width: '100%', padding: '0.7rem', borderRadius: 10, fontSize: '0.72rem',
                background: 'rgba(200,168,64,0.18)',
                border: '1px solid rgba(200,168,64,0.5)',
                color: '#c8a840', cursor: 'pointer',
              }}
            >
              Got it →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
