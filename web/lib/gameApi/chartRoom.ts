// ── THE CHART ROOM'S SIDE OF THE GAME API (Steam prep, 2026-09-29) ──
//
// Treasure Match, the Minefield, the Quartermaster's Hold, Lay the Rigging,
// the World Chart and the room's guide as one object. On the web each call is
// the server action; on Steam the same interface runs lib/core/chartRoom
// against the local save, which builds its own weekly boards. The signatures
// ARE the actions' (typeof), so the two cannot drift.

import { getMatchState, submitMatch } from '@/app/(app)/charting/actions'
import { getMinefieldState, revealCell, toggleFlag } from '@/app/(app)/charting/minefieldActions'
import { getWorldChartState, claimLandmark } from '@/app/(app)/charting/worldChartActions'
import { markChartingGuideSeen } from '@/app/(app)/tavern/chart-room/actions'
import { getHoldState, saveHoldProgress, tallyHold, submitHold } from '@/app/(app)/tavern/chart-room/hold/actions'
import { getRiggingState, saveRiggingPaths, submitRigging } from '@/app/(app)/tavern/chart-room/rigging/actions'

export interface ChartRoomApi {
  markChartingGuideSeen: typeof markChartingGuideSeen
  // ── Treasure Match ──
  getMatchState: typeof getMatchState
  submitMatch: typeof submitMatch
  // ── The Minefield ──
  getMinefieldState: typeof getMinefieldState
  revealCell: typeof revealCell
  toggleFlag: typeof toggleFlag
  // ── The Quartermaster's Hold ──
  getHoldState: typeof getHoldState
  saveHoldProgress: typeof saveHoldProgress
  tallyHold: typeof tallyHold
  submitHold: typeof submitHold
  // ── Lay the Rigging ──
  getRiggingState: typeof getRiggingState
  saveRiggingPaths: typeof saveRiggingPaths
  submitRigging: typeof submitRigging
  // ── The World Chart ──
  getWorldChartState: typeof getWorldChartState
  claimLandmark: typeof claimLandmark
}

/** The web implementation: each call is the server action. */
export const webChartRoomApi: ChartRoomApi = {
  markChartingGuideSeen,
  getMatchState, submitMatch,
  getMinefieldState, revealCell, toggleFlag,
  getHoldState, saveHoldProgress, tallyHold, submitHold,
  getRiggingState, saveRiggingPaths, submitRigging,
  getWorldChartState, claimLandmark,
}
