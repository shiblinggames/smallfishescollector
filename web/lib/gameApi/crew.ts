// ── THE CREW SIDE OF THE GAME API (Steam prep, 2026-09-29) ──
//
// The Crew Hall as one object: the board, the roster, seats, the hall and its
// bunks, skins. On the web each call is the server action; on Steam the same
// interface runs lib/core/crew against the local save. The signatures ARE the
// actions' (typeof), so the two cannot drift.

import {
  todaysRecruits, getCrewState, getCrewRoster, rerollBoard, gambleBloodSkin, recruitCrew,
  upgradeCrewHall, dismissCrew, assignToVoyage, assignToRaid, clearParty, benchCrew,
  renameCrew, promoteToCaptain, buyCrewSkin, equipCrewSkin, getCrewGraveyard, crewTheDeck, markCrewGuideSeen,
} from '@/app/(app)/crew/actions'
import { bunkCrew, resolveTraitOffer, collectBunk, buyDrill, buyStores } from '@/app/(app)/crew/bunkActions'

export type { CrewState, CrewMember, BoardCandidate, CrewActionResult, FallenCrew, RecruitFace } from '@/app/(app)/crew/actions'
export type { BunkClaimResult } from '@/app/(app)/crew/bunkActions'

export interface CrewApi {
  // ── Reading the hall ──
  getCrewState: typeof getCrewState
  getCrewRoster: typeof getCrewRoster
  getCrewGraveyard: typeof getCrewGraveyard
  todaysRecruits: typeof todaysRecruits
  // ── The board ──
  rerollBoard: typeof rerollBoard
  recruitCrew: typeof recruitCrew
  gambleBloodSkin: typeof gambleBloodSkin
  // ── The roster and the seats ──
  dismissCrew: typeof dismissCrew
  assignToVoyage: typeof assignToVoyage
  assignToRaid: typeof assignToRaid
  clearParty: typeof clearParty
  benchCrew: typeof benchCrew
  renameCrew: typeof renameCrew
  promoteToCaptain: typeof promoteToCaptain
  crewTheDeck: typeof crewTheDeck
  // ── The hall and its bunks ──
  upgradeCrewHall: typeof upgradeCrewHall
  bunkCrew: typeof bunkCrew
  collectBunk: typeof collectBunk
  resolveTraitOffer: typeof resolveTraitOffer
  buyDrill: typeof buyDrill
  buyStores: typeof buyStores
  // ── Skins and the guide ──
  buyCrewSkin: typeof buyCrewSkin
  equipCrewSkin: typeof equipCrewSkin
  markCrewGuideSeen: typeof markCrewGuideSeen
}

/** The web implementation: each call is the server action. */
export const webCrewApi: CrewApi = {
  getCrewState, getCrewRoster, getCrewGraveyard, todaysRecruits,
  rerollBoard, recruitCrew, gambleBloodSkin,
  dismissCrew, assignToVoyage, assignToRaid, clearParty, benchCrew, renameCrew, promoteToCaptain, crewTheDeck,
  upgradeCrewHall, bunkCrew, collectBunk, resolveTraitOffer, buyDrill, buyStores,
  buyCrewSkin, equipCrewSkin, markCrewGuideSeen,
}
