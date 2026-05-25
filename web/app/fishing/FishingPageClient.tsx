'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { startFishingMusic, fadeOutFishingMusic, setFishingTrack, primeFishingTrack, fishingTrackForZone } from '@/lib/fishingMusic'
import ZoneLanding, { type ZoneKey, type ZoneStat } from './ZoneLanding'
import type { FishSpecies } from './actions'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { ZONE_MIN_LEVEL } from './zoneData'
import type { ActiveSession } from '@/app/social/challengeActions'
import type { DailyChallengeState } from '@/lib/dailyChallenges'

// FishingGame is a ~5,300-line client component. Dynamic-import it so the
// JS only ships once the player actually picks a zone — not on the first
// /fishing visit when they're still on ZoneLanding. ssr:false because the
// component owns RAF loops and localStorage state that don't render on
// the server anyway.
const FishingGame = dynamic(() => import('./FishingGame'), {
  ssr: false,
  loading: () => (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#04080e',
      color: '#7a8aa0',
      fontFamily: 'var(--font-karla), system-ui, sans-serif',
      fontSize: '0.78rem', letterSpacing: '0.14em', textTransform: 'uppercase',
    }}>
      Casting line…
    </div>
  ),
})

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
  initialDoubloons, initialFishingXP, initialBait, initialLastUsedBait, initialInventory, uniqueSpeciesCaught, zoneStats,
  fishHoldTier, ownedRods, allFishSpecies, caughtFishIds, initialHighestPerfectStreak, initialPerfectStreak,
  hasSeenFishingTour, hasSeenFishingCatchTour, activeSession, username, zoneRewardsClaimed,
  initialDailyChallenge, hasTideTurner, initialTideTurnerSkipsLeft, initialEquippedSpecial, hasPhantomHook, hasAutoCaster, prestigeLevels, trophyCatches, characterColor, unlockedCharacterColors, equippedBadges, unlockedBadges, marketMultipliers, isPremium, equippedBoat, unlockedBoats, equippedHat, unlockedHats,
  initialFinnEncounters, initialFinnWins, initialFinnSeenBeats, initialFinnRevealed, initialFinnLastOutcome,
}: {
  hookTier: number
  rodTier: number
  reelTier: number
  lineTier: number
  initialDoubloons: number
  initialFishingXP: number
  initialBait: BaitItem[]
  initialLastUsedBait: string | null
  initialInventory: InventoryItem[]
  uniqueSpeciesCaught: number
  zoneStats: Record<string, ZoneStat>
  fishHoldTier: number
  ownedRods: number[]
  allFishSpecies: FishSpeciesBasic[]
  caughtFishIds: number[]
  initialHighestPerfectStreak: number
  initialPerfectStreak: number
  hasSeenFishingTour: boolean
  hasSeenFishingCatchTour: boolean
  activeSession?: ActiveSession
  username: string
  zoneRewardsClaimed: Record<string, boolean>
  initialDailyChallenge: DailyChallengeState | null
  hasTideTurner: boolean
  initialTideTurnerSkipsLeft: number
  initialEquippedSpecial: string | null
  hasPhantomHook: boolean
  hasAutoCaster: boolean
  prestigeLevels: Record<string, number>
  trophyCatches: number[]
  characterColor: string
  unlockedCharacterColors: string[]
  equippedBadges: string[]
  unlockedBadges: string[]
  marketMultipliers: Record<number, number>
  isPremium: boolean
  equippedBoat: string | null
  unlockedBoats: string[]
  equippedHat: string | null
  unlockedHats: string[]
  initialFinnEncounters: number
  initialFinnWins: number
  initialFinnSeenBeats: string[]
  initialFinnRevealed: boolean
  initialFinnLastOutcome: 'won' | 'lost' | 'passed' | null
}) {
  const fishingLevel = getLevelFromXP(initialFishingXP)

  // Soundtrack lifecycle lives here (NOT in FishingGame) so the music keeps
  // playing across the ZoneLanding ↔ FishingGame views — it only fades when
  // the player actually leaves /fishing (this client unmounts). Respects the
  // saved mute pref; the in-game toggles still drive setFishingMusicMuted.
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('fishingAudioMuted') : null
    // Bind the correct per-zone track BEFORE the music starts, so the entry
    // fade-in plays on the right song. Without this, arriving straight into a
    // zone with its own track (e.g. Open Waters) fades in the default track
    // and then toggles, blipping the wrong song for a moment.
    if (selectedZone) primeFishingTrack(fishingTrackForZone(selectedZone))
    startFishingMusic(saved === null ? true : saved === 'true')
    return () => { fadeOutFishingMusic() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Boat/hat state lives at this level so it persists across the
  // ZoneLanding ↔ FishingGame remount when the player switches zones.
  const [persistedEquippedBoat, setPersistedEquippedBoat] = useState<string | null>(equippedBoat)
  const [persistedUnlockedBoats, setPersistedUnlockedBoats] = useState<string[]>(unlockedBoats)
  const handleBoatStateChange = useCallback((equipped: string | null, unlocked: string[]) => {
    setPersistedEquippedBoat(equipped)
    setPersistedUnlockedBoats(unlocked)
  }, [])
  const [persistedEquippedHat, setPersistedEquippedHat] = useState<string | null>(equippedHat)
  const [persistedUnlockedHats, setPersistedUnlockedHats] = useState<string[]>(unlockedHats)
  const handleHatStateChange = useCallback((equipped: string | null, unlocked: string[]) => {
    setPersistedEquippedHat(equipped)
    setPersistedUnlockedHats(unlocked)
  }, [])

  // Daily challenge progress + claimed flags survive zone remounts. The
  // server snapshot in initialDailyChallenge is only fresh at page load;
  // without lifting state here, a player who claims on Zone A and then
  // switches to Zone B sees the claim UI again (stale prop) and the
  // second click silently no-ops since the server returns 'Already claimed'.
  const [persistedDailyChallenge, setPersistedDailyChallenge] =
    useState<DailyChallengeState | null>(initialDailyChallenge)
  const handleDailyChallengeChange = useCallback(
    (progress: [number, number, number], claimed: [boolean, boolean, boolean]) => {
      setPersistedDailyChallenge(prev => prev ? { ...prev, progress, claimed } : prev)
    },
    [],
  )

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

  // Swap the soundtrack to match the zone you ENTER (Open Waters has its own
  // track; others use the default). Returning to the selector (selectedZone
  // null) intentionally leaves the track alone, so the song from the zone you
  // just left keeps playing. No-op when already on the right track.
  useEffect(() => {
    if (selectedZone) setFishingTrack(fishingTrackForZone(selectedZone))
  }, [selectedZone])

  if (!selectedZone) {
    return (
      <ZoneLanding
        fishingLevel={fishingLevel}
        fishingXP={initialFishingXP}
        uniqueSpeciesCaught={uniqueSpeciesCaught}
        highestPerfectStreak={initialHighestPerfectStreak}
        username={username}
        zoneStats={zoneStats}
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
      initialLastUsedBait={initialLastUsedBait}
      initialInventory={initialInventory}
      uniqueSpeciesCaught={uniqueSpeciesCaught}
      fishHoldTier={fishHoldTier}
      unlockedBadges={unlockedBadges}
      ownedRods={ownedRods}
      allFishSpecies={allFishSpecies}
      initialCaughtFishIds={caughtFishIds}
      initialHighestPerfectStreak={initialHighestPerfectStreak}
      initialPerfectStreak={initialPerfectStreak}
      hasSeenFishingTour={hasSeenFishingTour}
      hasSeenFishingCatchTour={hasSeenFishingCatchTour}
      selectedZone={selectedZone}
      onBack={goBack}
      activeSession={activeSession}
      zoneRewardsClaimed={zoneRewardsClaimed}
      initialDailyChallenge={persistedDailyChallenge}
      onDailyChallengeChange={handleDailyChallengeChange}
      hasTideTurner={hasTideTurner}
      initialTideTurnerSkipsLeft={initialTideTurnerSkipsLeft}
      initialEquippedSpecial={initialEquippedSpecial}
      hasPhantomHook={hasPhantomHook}
      hasAutoCaster={hasAutoCaster}
      initialPrestigeLevels={prestigeLevels}
      initialTrophyCatches={trophyCatches}
      characterColor={characterColor}
      unlockedCharacterColors={unlockedCharacterColors}
      equippedBadges={equippedBadges}
      marketMultipliers={marketMultipliers}
      isPremium={isPremium}
      initialEquippedBoat={persistedEquippedBoat}
      initialUnlockedBoats={persistedUnlockedBoats}
      onBoatStateChange={handleBoatStateChange}
      initialEquippedHat={persistedEquippedHat}
      initialUnlockedHats={persistedUnlockedHats}
      onHatStateChange={handleHatStateChange}
      initialFinnEncounters={initialFinnEncounters}
      initialFinnWins={initialFinnWins}
      initialFinnSeenBeats={initialFinnSeenBeats}
      initialFinnRevealed={initialFinnRevealed}
      initialFinnLastOutcome={initialFinnLastOutcome}
    />
  )
}
