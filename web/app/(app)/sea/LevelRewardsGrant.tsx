'use client'

// WHAT YOU WERE OWED FOR LEVELLING.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// Fishing level rewards are granted by claimFishingLevelRewards, which is
// idempotent and state-based: it compares claimed_fishing_levels against the
// level your XP actually implies and hands over the difference. It was called
// from exactly one place, on the fishing screen's mount — and the fishing
// screen now redirects every captain to the chart. So the rewards accrued
// correctly and were never handed to anybody who sails.
//
// The chart calls it now, on the crossing itself, and this is what says so.
//
// ── IT IS THE SAME MOMENT NAV GETS ──────────────────────────────────────────
//
// This was a card of its own: a plate of the water across the top, the number
// set into it, the payout underneath. It looked nothing like the Nav level-up,
// and the game only has one kind of level. The moment lives in
// LevelUpCelebration now and both skills pour into it; the scenery went with
// the card, because the picture on a level-up should be the thing the level
// actually OPENED — a water you can now fish, a rod you can now buy — rather
// than a backdrop behind a number.
//
// All that is left here is the answer to "what did this level give me".

import { rewardLabel, type LevelReward } from '@/lib/levelRewards'
import { fishingLevelPerks, zonesUnlockedBetween } from '@/lib/fishingUnlocks'
import { fishingGearUnlockedBetween } from '@/lib/gearUnlocks'
import LevelUpCelebration, { type UnlockGroup } from '@/components/LevelUpCelebration'
import { ZONE_BG, ZONE_COLOR } from '../fishing/zoneData'

export type Granted = { level: number; reward: LevelReward }[]

export default function LevelRewardsGrant({ granted, from, to, onDone }: {
  granted: Granted
  /** The span this covers: the card is for every level in (from, to], paid or
   *  not. `granted` is only the ones that paid. */
  from: number
  to: number
  onDone: () => void
}) {
  const many = to - from > 1
  // WHAT THE LEVEL OPENED, not just what it paid. A level-up that lists coin
  // and says nothing about the water it just unlocked has buried the headline:
  // the reward is spendable, the zone is a place you can now go. The water
  // gets the wide plate for exactly that reason — it is the biggest thing a
  // fishing level ever hands over.
  const zones = zonesUnlockedBetween(from, to)
  const gear = fishingGearUnlockedBetween(from, to)
  // THE DIFFERENCE, NOT THE STATE. This printed the perks AT the new level,
  // so level 1 to 2 announced "Catch zone +0 degrees" as though that were
  // the prize. Nav's card diffs its bonuses and drops the zeros; this does
  // the same. A level that moved neither number shows no stat block at all,
  // and what it did open (a water, a rod) is still said below.
  const before = fishingLevelPerks(from)
  const after = fishingLevelPerks(to)
  const dZone = after.catchZone - before.catchZone
  const dBite = Math.round((after.biteSpeed - before.biteSpeed) * 10) / 10
  const stats = [
    ...(dZone > 0 ? [{ label: 'Catch zone', value: `+${dZone}°` }] : []),
    ...(dBite > 0 ? [{ label: 'Quicker bites', value: `+${dBite}%` }] : []),
  ]

  const unlocks: UnlockGroup[] = []
  if (zones.length) {
    unlocks.push({
      caption: zones.length > 1 ? 'New waters open' : 'New water open',
      wide: true,
      items: zones.map(z => ({ name: z.label, image: ZONE_BG[z.key] ?? '', tint: ZONE_COLOR[z.key] })),
    })
  }
  if (gear.length) {
    unlocks.push({ caption: 'Now in the tackle shop', items: gear.map(g => ({ name: g.name, image: g.image })) })
  }

  return (
    <LevelUpCelebration
      skill="Fishing"
      from={from}
      to={to}
      statsCaption={stats.length ? "Angler's Edge" : undefined}
      stats={stats}
      chips={granted.map(g => (many ? `Lv ${g.level} · ${rewardLabel(g.reward)}` : rewardLabel(g.reward)))}
      unlocks={unlocks}
      // SAY WHY IT ARRIVED IN A HEAP. Several levels at once looks like a bug
      // unless somebody explains it, and the honest explanation is that they
      // were owed.
      note={many ? 'These were waiting for you. Everything you earn is held until you are back at the chart.' : undefined}
      onDone={onDone}
    />
  )
}
