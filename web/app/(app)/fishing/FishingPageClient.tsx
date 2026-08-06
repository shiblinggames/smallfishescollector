'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { startFishingMusic, fadeOutFishingMusic, setFishingTrack, primeFishingTrack, fishingTrackForZone } from '@/lib/fishingMusic'
import ZoneLanding, { type ZoneKey, type ZoneStat } from './ZoneLanding'
import FishingHub from './FishingHub'
import type { FishSpecies } from './actions'
import { getLevelFromXP } from '@/lib/fishingLevel'
import type { RenownAlloc } from '@/lib/renown'
import { ZONE_MIN_LEVEL } from './zoneData'
import type { DailyChallengeState } from '@/lib/dailyChallenges'
import type { TickerItem } from '@/components/MarketTicker'

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
// The zone you last fished — kept even after you return to the selector, so the
// selector can show your fisher drifting in that zone's panel. Unlike
// LAST_ZONE_KEY it is NOT cleared on goBack (that key controls reload-resume;
// this one is purely "where were you last").
const CURRENT_ZONE_KEY = 'fishing_current_zone'

type BaitItem = { bait_type: string; quantity: number }
type InventoryItem = {
  fish_id: number
  quantity: number
  fish_species: FishSpecies
}

type FishSpeciesBasic = { id: number; name: string; scientific_name: string; fun_fact: string; habitat: string; bite_rarity: number; sell_value: number; length_min_in?: number | null; length_max_in?: number | null }

export default function FishingPageClient({
  hookTier, rodTier, reelTier, lineTier,
  initialDoubloons, initialGems, initialFathoms, initialFishingXP, initialBait, initialLastUsedBait, initialInventory, uniqueSpeciesCaught, zoneStats, ancientDeepUnlocked,
  fishHoldTier, ownedRods, initialCompletionistEffects, initialHasForgedBefore, allFishSpecies, caughtFishIds, mountedFishIds, initialPersonalBests, initialCatchCounts, initialHighestPerfectStreak, initialPerfectStreak, initialStreakZone,
  hubSpeciesCaught, hubSpeciesTotal, hubHoldValue, hubMarketMood, hubExchangeUnveil, hubTicker,
  hasSeenFishingHubTour, hasSeenFishingTour, hasSeenFishingCatchTour, hasSeenFirstCatchCelebration, initialShowWaitTimer, username, zoneRewardsClaimed,
  initialDailyChallenge, hasTideTurner, initialTideTurnerSkipsLeft, initialEquippedSpecial, initialEquippedSpecial2, hasDeepReel, hasAnglersPatience, anglersPatienceXp, hasPhantomHook, hasAutoCaster, hasAutoCatcher, gauntletDeepest, gauntletUpgrades, hasPerfectedSigil, prestigeLevels, goldenBoosts, ancientCatches, characterColor, unlockedCharacterColors, newlyUnlockedSkins, equippedBadges, unlockedBadges, marketMultipliers, isPremium, equippedBoat, unlockedBoats, newlyUnlockedBoats, equippedHat, unlockedHats, equippedPet, unlockedPets,
  initialFinnEncounters, initialFinnWins, initialFinnSeenBeats, initialFinnRevealed, initialFinnLastOutcome,
  initialFishingRenownAlloc, seenFishingRenownIntro,
}: {
  hookTier: number
  rodTier: number
  reelTier: number
  lineTier: number
  initialDoubloons: number
  initialGems: number
  initialFathoms: number
  initialFishingXP: number
  initialBait: BaitItem[]
  initialLastUsedBait: string | null
  initialInventory: InventoryItem[]
  uniqueSpeciesCaught: number
  zoneStats: Record<string, ZoneStat>
  ancientDeepUnlocked: boolean
  fishHoldTier: number
  ownedRods: number[]
  initialCompletionistEffects: number[]
  initialHasForgedBefore: boolean
  allFishSpecies: FishSpeciesBasic[]
  caughtFishIds: number[]
  mountedFishIds: number[]
  initialPersonalBests: Record<number, number>
  initialCatchCounts: Record<number, number>
  initialHighestPerfectStreak: number
  initialPerfectStreak: number
  initialStreakZone: string | null
  hubSpeciesCaught: number
  hubSpeciesTotal: number
  hubHoldValue: number
  hubMarketMood: string
  hubExchangeUnveil: boolean
  hubTicker: TickerItem[]
  hasSeenFishingHubTour: boolean
  hasSeenFishingTour: boolean
  hasSeenFishingCatchTour: boolean
  hasSeenFirstCatchCelebration: boolean
  initialShowWaitTimer: boolean
  username: string
  zoneRewardsClaimed: Record<string, boolean>
  initialDailyChallenge: DailyChallengeState | null
  hasTideTurner: boolean
  initialTideTurnerSkipsLeft: number
  initialEquippedSpecial: string | null
  /** THE DEEP REEL: the second special slot and its one legal occupant. */
  initialEquippedSpecial2?: string | null
  hasDeepReel?: boolean
  hasAnglersPatience?: boolean
  anglersPatienceXp?: number
  hasPhantomHook: boolean
  hasAutoCaster: boolean
  hasAutoCatcher: boolean
  gauntletDeepest: number
  gauntletUpgrades: string[]
  hasPerfectedSigil: boolean
  prestigeLevels: Record<string, number>
  goldenBoosts: Record<string, number>
  ancientCatches: number[]
  characterColor: string
  unlockedCharacterColors: string[]
  newlyUnlockedSkins: string[]
  newlyUnlockedBoats: string[]
  equippedBadges: string[]
  unlockedBadges: string[]
  marketMultipliers: Record<number, number>
  isPremium: boolean
  equippedBoat: string | null
  unlockedBoats: string[]
  equippedHat: string | null
  unlockedHats: string[]
  equippedPet: string | null
  unlockedPets: string[]
  initialFinnEncounters: number
  initialFinnWins: number
  initialFinnSeenBeats: string[]
  initialFinnRevealed: boolean
  initialFinnLastOutcome: 'won' | 'lost' | 'passed' | null
  initialFishingRenownAlloc: RenownAlloc | null
  seenFishingRenownIntro: boolean
}) {
  const router = useRouter()
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
  // Pet equip/unlock state — lifted here so zone switches don't lose
  // the new parrot the player just unlocked from a crate.
  const [persistedEquippedPet, setPersistedEquippedPet] = useState<string | null>(equippedPet)
  const [persistedUnlockedPets, setPersistedUnlockedPets] = useState<string[]>(unlockedPets)
  const handlePetStateChange = useCallback((equipped: string | null, unlocked: string[]) => {
    setPersistedEquippedPet(equipped)
    setPersistedUnlockedPets(unlocked)
  }, [])

  // Daily challenge progress + claimed flags survive zone remounts. The
  // server snapshot in initialDailyChallenge is only fresh at page load;
  // without lifting state here, a player who claims on Zone A and then
  // switches to Zone B sees the claim UI again (stale prop) and the
  // second click silently no-ops since the server returns 'Already claimed'.
  const [persistedDailyChallenge, setPersistedDailyChallenge] =
    useState<DailyChallengeState | null>(initialDailyChallenge)
  // sweepClaimed rides along for the same reason: it is paid once a day, so a
  // stale false after a zone switch would show the sweep as still owed.
  const handleDailyChallengeChange = useCallback(
    (progress: number[], claimed: boolean[], sweepClaimed: boolean) => {
      setPersistedDailyChallenge(prev => prev ? { ...prev, progress, claimed, sweepClaimed } : prev)
    },
    [],
  )

  // Per-zone collection progress for the landing bands: species caught this
  // prestige cycle vs the zone's species count. Ancient Deep counts the same
  // way as every other zone — its regulars live in the catch log; the six
  // giants land in ancient_catches, so union both (deduped by id).
  const zoneCollection = useMemo(() => {
    const caught = new Set(caughtFishIds)
    const ancientSet = new Set(ancientCatches)
    const rec: Record<string, { caught: number; total: number }> = {}
    for (const f of allFishSpecies) {
      const r = rec[f.habitat] ?? (rec[f.habitat] = { caught: 0, total: 0 })
      r.total += 1
      if (caught.has(f.id) || ancientSet.has(f.id)) r.caught += 1
    }
    return rec
  }, [allFishSpecies, caughtFishIds, ancientCatches])

  const [selectedZone, setSelectedZone] = useState<ZoneKey | null>(() => {
    if (typeof window === 'undefined') return null
    const saved = localStorage.getItem(LAST_ZONE_KEY) as ZoneKey | null
    if (!saved) return null
    const minLevel = ZONE_MIN_LEVEL[saved] ?? 1
    // Don't auto-restore into Ancient Deep if it isn't unlocked (Ch3 gate) —
    // the server would reject every cast.
    const ok = fishingLevel >= minLevel && (saved !== 'ancient_deep' || ancientDeepUnlocked)
    return ok ? saved : null
  })

  // Where the player last cast — survives returning to the selector so their
  // fisher shows in that zone's panel. Validated so a now-locked zone (e.g.
  // Ancient Deep before Ch3) doesn't try to render there.
  const [currentZone, setCurrentZone] = useState<ZoneKey | null>(() => {
    if (typeof window === 'undefined') return null
    const saved = localStorage.getItem(CURRENT_ZONE_KEY) as ZoneKey | null
    if (!saved) return null
    const ok = fishingLevel >= (ZONE_MIN_LEVEL[saved] ?? 1) && (saved !== 'ancient_deep' || ancientDeepUnlocked)
    return ok ? saved : null
  })

  // /fishing lands on the HUB now, not the zone selector. The selector is one
  // of the hub's four rooms, opened in-page (the Campaign tile / story map
  // relationship on the Expeditions hub). Resuming into a zone on reload skips
  // straight past both, so a reload mid-session drops you back on the water.
  const [zonesOpen, setZonesOpen] = useState(false)

  function selectZone(zone: ZoneKey) {
    localStorage.setItem(LAST_ZONE_KEY, zone)
    localStorage.setItem(CURRENT_ZONE_KEY, zone)
    setCurrentZone(zone)
    setSelectedZone(zone)
  }

  function goBack() {
    localStorage.removeItem(LAST_ZONE_KEY)
    setSelectedZone(null)
    setZonesOpen(true)
    // CRITICAL: refresh the server component so `initialInventory` (and
    // every other server-rendered prop) reflects the catches made this
    // session. Without this, picking a new zone remounts FishingGame
    // with the page-load snapshot — fish caught in the previous zone
    // disappear from the visible hold but stay on the server, so the
    // player gets "hold full" before they think they're at capacity
    // and can't sell the hidden fish. Tester bug, reported 2026-06-05.
    router.refresh()
  }

  // Swap the soundtrack to match the zone you ENTER (Open Waters has its own
  // track; others use the default). Returning to the selector (selectedZone
  // null) intentionally leaves the track alone, so the song from the zone you
  // just left keeps playing. No-op when already on the right track.
  useEffect(() => {
    if (selectedZone) setFishingTrack(fishingTrackForZone(selectedZone))
  }, [selectedZone])

  if (!selectedZone && !zonesOpen) {
    return (
      <FishingHub
        fishingLevel={fishingLevel}
        fishingXP={initialFishingXP}
        initialFishingRenownAlloc={initialFishingRenownAlloc}
        ancientDeepUnlocked={ancientDeepUnlocked}
        currentZone={currentZone}
        holdCount={initialInventory.reduce((n, r) => n + r.quantity, 0)}
        fishHoldTier={fishHoldTier}
        baitCount={initialBait.reduce((n, b) => n + b.quantity, 0)}
        speciesCaught={hubSpeciesCaught}
        speciesTotal={hubSpeciesTotal}
        holdValue={hubHoldValue}
        marketMood={hubMarketMood}
        exchangeUnveil={hubExchangeUnveil}
        ticker={hubTicker}
        hasSeenHubTour={hasSeenFishingHubTour}
        characterColor={characterColor}
        equippedHat={persistedEquippedHat}
        equippedBoat={persistedEquippedBoat}
        equippedPet={persistedEquippedPet}
        rodTier={rodTier}
        reelTier={reelTier}
        hookTier={hookTier}
        onOpenZones={() => setZonesOpen(true)}
      />
    )
  }

  if (!selectedZone) {
    return (
      <ZoneLanding
        fishingLevel={fishingLevel}
        fishingXP={initialFishingXP}
        username={username}
        zoneStats={zoneStats}
        zoneCollection={zoneCollection}
        prestigeLevels={prestigeLevels}
        goldenBoosts={goldenBoosts}
        ancientDeepUnlocked={ancientDeepUnlocked}
        onSelect={selectZone}
        currentZone={currentZone}
        characterColor={characterColor}
        equippedHat={persistedEquippedHat}
        equippedBoat={persistedEquippedBoat}
        equippedPet={persistedEquippedPet}
        rodTier={rodTier}
        reelTier={reelTier}
        hookTier={hookTier}
        onBack={() => setZonesOpen(false)}
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
      initialGems={initialGems}
      initialFathoms={initialFathoms}
      initialFishingXP={initialFishingXP}
      initialBait={initialBait}
      initialLastUsedBait={initialLastUsedBait}
      initialInventory={initialInventory}
      uniqueSpeciesCaught={uniqueSpeciesCaught}
      fishHoldTier={fishHoldTier}
      unlockedBadges={unlockedBadges}
      ownedRods={ownedRods}
      initialCompletionistEffects={initialCompletionistEffects}
      initialHasForgedBefore={initialHasForgedBefore}
      allFishSpecies={allFishSpecies}
      initialCaughtFishIds={caughtFishIds}
      initialMountedFishIds={mountedFishIds}
      initialPersonalBests={initialPersonalBests}
      initialCatchCounts={initialCatchCounts}
      initialHighestPerfectStreak={initialHighestPerfectStreak}
      initialPerfectStreak={initialStreakZone && initialStreakZone !== selectedZone ? 0 : initialPerfectStreak}
      hasSeenFishingTour={hasSeenFishingTour}
      hasSeenFishingCatchTour={hasSeenFishingCatchTour}
      hasSeenFirstCatchCelebration={hasSeenFirstCatchCelebration}
      initialShowWaitTimer={initialShowWaitTimer}
      selectedZone={selectedZone}
      onBack={goBack}
      zoneRewardsClaimed={zoneRewardsClaimed}
      initialDailyChallenge={persistedDailyChallenge}
      onDailyChallengeChange={handleDailyChallengeChange}
      hasTideTurner={hasTideTurner}
      initialTideTurnerSkipsLeft={initialTideTurnerSkipsLeft}
      initialEquippedSpecial={initialEquippedSpecial}
      initialEquippedSpecial2={initialEquippedSpecial2}
      hasDeepReel={hasDeepReel}
      hasAnglersPatience={hasAnglersPatience}
      anglersPatienceXp={anglersPatienceXp}
      hasPhantomHook={hasPhantomHook}
      hasAutoCaster={hasAutoCaster}
      hasAutoCatcher={hasAutoCatcher}
      gauntletDeepest={gauntletDeepest}
      gauntletUpgrades={gauntletUpgrades}
      hasPerfectedSigil={hasPerfectedSigil}
      initialPrestigeLevels={prestigeLevels}
      initialGoldenBoosts={goldenBoosts}
      initialAncientCatches={ancientCatches}
      characterColor={characterColor}
      unlockedCharacterColors={unlockedCharacterColors}
      newlyUnlockedSkins={newlyUnlockedSkins}
      newlyUnlockedBoats={newlyUnlockedBoats}
      equippedBadges={equippedBadges}
      marketMultipliers={marketMultipliers}
      isPremium={isPremium}
      initialEquippedBoat={persistedEquippedBoat}
      initialUnlockedBoats={persistedUnlockedBoats}
      onBoatStateChange={handleBoatStateChange}
      initialEquippedHat={persistedEquippedHat}
      initialUnlockedHats={persistedUnlockedHats}
      onHatStateChange={handleHatStateChange}
      initialEquippedPet={persistedEquippedPet}
      initialUnlockedPets={persistedUnlockedPets}
      onPetStateChange={handlePetStateChange}
      initialFinnEncounters={initialFinnEncounters}
      initialFinnWins={initialFinnWins}
      initialFinnSeenBeats={initialFinnSeenBeats}
      initialFinnRevealed={initialFinnRevealed}
      initialFinnLastOutcome={initialFinnLastOutcome}
      initialFishingRenownAlloc={initialFishingRenownAlloc}
      seenFishingRenownIntro={seenFishingRenownIntro}
    />
  )
}
