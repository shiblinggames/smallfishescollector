// THE PUZZLES, IN THEIR FRAMES (Steam prep, 2026-09-30). On the web each
// puzzle's page draws a frame (ChartingFrame, GameFrame) around the game with
// the board read on the server; here the screen table reads the board from the
// save and these put the same game in the same frame.

import ChartingFrame from '@/app/(app)/charting/ChartingFrame'
import GameFrame from '@/components/GameFrame'
import TreasureMatchGame from '@/app/(app)/charting/TreasureMatchGame'
import Minefield from '@/app/(app)/charting/MinefieldGame'
import QuartermastersHold from '@/app/(app)/tavern/chart-room/hold/QuartermastersHold'
import RiggingGame from '@/app/(app)/tavern/chart-room/rigging/RiggingGame'
import CaptainsBoard from '@/app/(app)/tavern/trivia/board/CaptainsBoard'
import CapstanGame from '@/app/(app)/tavern/trivia/capstan/CapstanGame'
import PirateKing from '@/app/(app)/tavern/trivia/king/PirateKing'
import type { ComponentProps } from 'react'

type Board<T> = T | { error: string }
const errorOf = (s: object) => ('error' in s ? String((s as { error: string }).error) : undefined)

type MatchState = ComponentProps<typeof TreasureMatchGame>['initial']
type MinefieldState = ComponentProps<typeof Minefield>['initial']
type HoldState = ComponentProps<typeof QuartermastersHold>['initial']
type RiggingState = ComponentProps<typeof RiggingGame>['initial']

export function Charting(p: { game: 'match'; state: Board<MatchState> } | { game: 'minefield'; state: Board<MinefieldState> }) {
  const error = errorOf(p.state)
  return (
    <ChartingFrame error={error}>
      {error == null && (p.game === 'match'
        ? <TreasureMatchGame initial={p.state as MatchState} />
        : <Minefield initial={p.state as MinefieldState} />)}
    </ChartingFrame>
  )
}

export function ChartRoomPuzzle(p: { game: 'hold'; state: Board<HoldState> } | { game: 'rigging'; state: Board<RiggingState> }) {
  const error = errorOf(p.state)
  return (
    <GameFrame error={error}>
      {error == null && (p.game === 'hold'
        ? <QuartermastersHold initial={p.state as HoldState} />
        : <RiggingGame initial={p.state as RiggingState} />)}
    </GameFrame>
  )
}

type BoardState = ComponentProps<typeof CaptainsBoard>['initial']
type CapstanState = ComponentProps<typeof CapstanGame>['initial']
type KingState = ComponentProps<typeof PirateKing>['initial']

/** The Parlor's three games, in the frame their pages use. */
export function ParlorGame(p: { parlorPoints: number } & (
  { game: 'board'; state: Board<BoardState> } | { game: 'capstan'; state: Board<CapstanState> } | { game: 'king'; state: Board<KingState> }
)) {
  const error = errorOf(p.state)
  return (
    <GameFrame error={error}>
      {error == null && (p.game === 'board'
        ? <CaptainsBoard initial={p.state as BoardState} parlorPoints={p.parlorPoints} />
        : p.game === 'capstan'
          ? <CapstanGame initial={p.state as CapstanState} parlorPoints={p.parlorPoints} />
          : <PirateKing initial={p.state as KingState} parlorPoints={p.parlorPoints} />)}
    </GameFrame>
  )
}
