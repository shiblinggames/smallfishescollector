'use client'

import { useState } from 'react'
import ZoneLanding, { type ZoneKey } from './ZoneLanding'
import FishingGame from './FishingGame'
import type { FishSpecies } from './actions'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { ZONE_MIN_LEVEL } from './zoneData'
import type { ActiveSession } from '@/app/social/challengeActions'

const LAST_ZONE_KEY = 'fishing_last_zone'

type BaitItem = { bait_type: string; quantity: number }
type InventoryItem = {
  fish_id: number
  quantity: number
  fish_species: FishSpecies
}

type FishSpeciesBasic = { id: number; name: string; scientific_name: string; fun_fact: string; habitat: string; bite_rarity: number; sell_value: number }

export default function FishingPageClient({
  hookTier, rodTier, reelTier, lineTier,
  initialDoubloons, initialFishingXP, initialBait, initialInventory, uniqueSpeciesCaught,
  holdCapacity, shipTier, ownedRods, allFishSpecies, caughtFishIds, initialHighestPerfectStreak,
  hasSeenFishingTour, hasSeenFishingCatchTour, activeSession, username, zoneRewardsClaimed,
  initialRingSkin, initialUnlockedRingSkins,
}: {
  hookTier: number
  rodTier: number
  reelTier: number
  lineTier: number
  initialDoubloons: number
  initialFishingXP: number
  initialBait: BaitItem[]
  initialInventory: InventoryItem[]
  uniqueSpeciesCaught: number
  holdCapacity: number
  shipTier: number
  ownedRods: number[]
  allFishSpecies: FishSpeciesBasic[]
  caughtFishIds: number[]
  initialHighestPerfectStreak: number
  hasSeenFishingTour: boolean
  hasSeenFishingCatchTour: boolean
  activeSession?: ActiveSession
  username: string
  zoneRewardsClaimed: Record<string, boolean>
  initialRingSkin: string
  initialUnlockedRingSkins: string[]
}) {
  const fishingLevel = getLevelFromXP(initialFishingXP)

  const [selectedZone, setSelectedZone] = useState<ZoneKey | null>(() => {
    if (typeof window === 'undefined') return null
    const saved = localStorage.getItem(LAST_ZONE_KEY) as ZoneKey | null
    if (!saved) return null
    const minLevel = ZONE_MIN_LEVEL[saved] ?? 1
    return fishingLevel >= minLevel ? saved : null
  })

  function selectZone(zone: ZoneKey) {
    localStorage.setItem(LAST_ZONE_KEY, zone)
    setSelectedZone(zone)
  }

  function goBack() {
    localStorage.removeItem(LAST_ZONE_KEY)
    setSelectedZone(null)
  }

  if (!selectedZone) {
    return (
      <ZoneLanding
        fishingLevel={fishingLevel}
        fishingXP={initialFishingXP}
        uniqueSpeciesCaught={uniqueSpeciesCaught}
        highestPerfectStreak={initialHighestPerfectStreak}
        username={username}
        onSelect={selectZone}
      />
    )
  }

  return (
    <FishingGame
      hookTier={hookTier}
      rodTier={rodTier}
      reelTier={reelTier}
      lineTier={lineTier}
      initialDoubloons={initialDoubloons}
      initialFishingXP={initialFishingXP}
      initialBait={initialBait}
      initialInventory={initialInventory}
      uniqueSpeciesCaught={uniqueSpeciesCaught}
      holdCapacity={holdCapacity}
      shipTier={shipTier}
      ownedRods={ownedRods}
      allFishSpecies={allFishSpecies}
      initialCaughtFishIds={caughtFishIds}
      initialHighestPerfectStreak={initialHighestPerfectStreak}
      hasSeenFishingTour={hasSeenFishingTour}
      hasSeenFishingCatchTour={hasSeenFishingCatchTour}
      selectedZone={selectedZone}
      onBack={goBack}
      activeSession={activeSession}
      zoneRewardsClaimed={zoneRewardsClaimed}
      initialRingSkin={initialRingSkin}
      initialUnlockedRingSkins={initialUnlockedRingSkins}
    />
  )
}
