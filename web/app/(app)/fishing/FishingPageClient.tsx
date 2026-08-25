'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { startFishingMusic, fadeOutFishingMusic, setFishingTrack, primeFishingTrack, fishingTrackForZone } from '@/lib/fishingMusic'
import ZoneLanding, { type ZoneKey, type ZoneStat } from './ZoneLanding'
import type { VigilState } from '@/lib/ancientVigil'

// ── THE GAME ITSELF, OFF THE FIRST LOAD ─────────────────────────────────────
// FishingGame is 12,037 lines: 58% of this route's client code, and the largest
// component in the app by a distance. It was imported statically, so it was
// downloaded, parsed and hydrated before the player had picked a zone -- the
// two views most visits actually open FIRST (the hub and the zone selector)
// were waiting on the one view they had not asked for yet. That is why this
// route loaded slower than every other page by a wide margin.
//
// Split, the hub and the selector paint from a much smaller bundle and the
// game's chunk fetches when a zone is chosen. A returning player whose zone
// restores from localStorage still needs it immediately, but it now arrives in
// parallel with the shell instead of blocking it.
//
// ssr:false because the game is entirely interactive -- refs, rAF, Web
// Animations, audio -- and has nothing meaningful to server-render.
//
// THE FALLBACK IS THE ROUTE'S OWN LOADING SCREEN, not a second one. A returning
// captain restores straight into a zone, so this chunk is fetched the moment the
// page mounts and the wait for it lands immediately after the route's wait ends.
// It used to answer that with a line of grey text reading "Rigging the line",
// which made the trip read as two loads back to back: the water, then a bare
// screen, then the game. Rendering the same scene means there is only ever one
// wait on screen, and it ends when the game is genuinely ready to draw.
//
// Safe in a way the old asset-gate overlay was not: dynamic() swaps this out in
// the same commit that mounts the game. No fade, no timer, nothing that can
// linger over a finished page.
const FishingGame = dynamic(() => import('./FishingGame'), {
  ssr: false,
  loading: () => <SoundingScene />,
})
import FishingHub from './FishingHub'
import SoundingScene from './SoundingScene'
import type { FishSpecies } from './actions'
import { getLevelFromXP } from '@/lib/fishingLevel'
import type { RenownAlloc } from '@/lib/renown'
import { ZONE_MIN_LEVEL, ZONE_ORDER } from './zoneData'
import type { DailyChallengeState } from '@/lib/dailyChallenges'
import type { TickerItem } from '@/components/MarketTicker'

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
  initialDoubloons, initialGems, initialFathoms, initialFishingXP, initialBait, initialLastUsedBait, initialInventory, uniqueSpeciesCaught, zoneStats, zonesEverFished, ancientDeepUnlocked,
  fishHoldTier, ownedRods, initialCompletionistEffects, initialHasForgedBefore, allFishSpecies, caughtFishIds, mountedFishIds, initialPersonalBests, initialCatchCounts, initialHighestPerfectStreak, initialPerfectStreak, initialStreakZone,
  hubSpeciesCaught, hubSpeciesTotal, hubMarketMood, hubMarketNextUpdate, hubOpenContracts, hubExchangeUnveil, hubTicker,
  hasSeenFishingHubTour, hasSeenFishingTour, hasSeenFishingCatchTour, hasSeenFirstCatchCelebration, initialShowWaitTimer, username, zoneRewardsClaimed,
  initialDailyChallenge, hasTideTurner, initialTideTurnerSkipsLeft, initialEquippedSpecial, initialEquippedSpecial2, hasDeepReel, hasAnglersPatience, anglersPatienceXp, hasPhantomHook, hasAutoCaster, hasAutoCatcher, gauntletDeepest, gauntletUpgrades, hasPerfectedSigil, prestigeLevels, goldenBoosts, ancientCatches, ancientVigil, vigilUnlocked, characterColor, unlockedCharacterColors, newlyUnlockedSkins, equippedBadges, unlockedBadges, marketMultipliers, isPremium, equippedBoat, unlockedBoats, newlyUnlockedBoats, equippedHat, unlockedHats, equippedPet, equippedPetBow, unlockedPets,
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
  /** Zones with a lifetime catch, so prestige cannot make a veteran look new. */
  zonesEverFished: string[]
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
  hubMarketMood: string
  hubMarketNextUpdate: string
  hubOpenContracts: number
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
  ancientVigil: VigilState
  vigilUnlocked: boolean
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
  equippedPetBow: string | null
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
    // NO SAVED PREF MEANS PLAY IT. It defaulted to muted, which sounds polite
    // and mostly meant players never learned there was a soundtrack at all --
    // an off switch is easy to find, an off switch you do not know exists is
    // not. Autoplay policy still holds it until the first gesture, so nobody
    // gets ambushed by sound they did not ask for. Keep this in lockstep with
    // FishingGame's audioMuted initialiser or the toggle opens on the wrong icon.
    startFishingMusic(saved === 'true')
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
  const [persistedEquippedPetBow, setPersistedEquippedPetBow] = useState<string | null>(equippedPetBow)
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

  /** Has this captain ever landed anything here? Three independent proofs, any
   *  one of which settles it: something caught THIS cycle, something caught in
   *  any past cycle (lifetime_species, which prestige does not clear), or a
   *  prestige actually completed in that water. The union matters because
   *  lifetime_species was backfilled and may be thin on the oldest rows. */
  const everFishedSet = useMemo(() => new Set(zonesEverFished), [zonesEverFished])
  const everFished = useCallback((z: string) =>
    everFishedSet.has(z)
    || (zoneCollection[z]?.caught ?? 0) > 0
    || (prestigeLevels[z] ?? 0) > 0,
  [everFishedSet, zoneCollection, prestigeLevels])

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

  /** All the way out to the hub, not back one step to the zone selector.
   *
   *  Same teardown as goBack, and the same refresh for the same reason: the
   *  hub reads the hold and the Almanac counts off server props, so returning
   *  with a page-load snapshot would show a hold that is missing everything
   *  caught this session. */
  function goHome() {
    localStorage.removeItem(LAST_ZONE_KEY)
    setSelectedZone(null)
    setZonesOpen(false)
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
        baitCount={initialBait.reduce((n, b) => n + b.quantity, 0)}
        speciesCaught={hubSpeciesCaught}
        speciesTotal={hubSpeciesTotal}
        marketMood={hubMarketMood}
        marketNextUpdate={hubMarketNextUpdate}
        openContracts={hubOpenContracts}
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
        everFished={everFished}
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
      unfishedZones={ZONE_ORDER.filter(z =>
        z !== selectedZone
        && fishingLevel >= (ZONE_MIN_LEVEL[z] ?? 1)
        && (z !== 'ancient_deep' || ancientDeepUnlocked)
        && !everFished(z)).length}
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
      // Passed through as-is: the streak no longer dies for changing water, so
      // it is no longer zeroed when the zone does not match where it was built.
      initialPerfectStreak={initialPerfectStreak}
      hasSeenFishingTour={hasSeenFishingTour}
      hasSeenFishingCatchTour={hasSeenFishingCatchTour}
      hasSeenFirstCatchCelebration={hasSeenFirstCatchCelebration}
      initialShowWaitTimer={initialShowWaitTimer}
      selectedZone={selectedZone}
      onBack={goBack}
      onHome={goHome}
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
      initialAncientVigil={ancientVigil}
      vigilUnlocked={vigilUnlocked}
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
      initialEquippedPetBow={persistedEquippedPetBow}
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
