'use client'

import { navLevelBonuses } from '@/lib/expeditionLevel'
import { shipsUnlockedBetween } from '@/lib/gearUnlocks'
import LevelUpCelebration from '@/components/LevelUpCelebration'

// The Nav half of the level-up. The moment itself lives in
// LevelUpCelebration, which fishing pours into as well — this is only the
// answer to "what did a Nav level give me": the raid-side stat bonuses
// (lib/expeditionLevel.navLevelBonuses) and any ship whose Nav gate just
// cleared. Use after a raid kill or a voyage payout.

export interface NavLevelUpInfo {
  fromLevel: number
  toLevel: number
}

interface Props {
  info: NavLevelUpInfo | null
  onDismiss: () => void
}

export default function NavLevelUpOverlay({ info, onDismiss }: Props) {
  const deltas = info ? diffBonuses(info.fromLevel, info.toLevel) : null
  const ships = info ? shipsUnlockedBetween(info.fromLevel, info.toLevel) : []
  // MOUNTED EVEN WITH NOTHING TO SAY, so dismissing it fades rather than
  // vanishes -- the exit lives inside the celebration and needs to still be
  // mounted to play. `show` is what actually opens it.
  return (
    <LevelUpCelebration
      show={!!info && !!deltas}
      skill="Navigation"
      from={info?.fromLevel ?? 0}
      to={info?.toLevel ?? 0}
      statsCaption="Captain's Bonus"
      stats={[
        ...(deltas && deltas.hp         > 0 ? [{ label: 'Max HP',  value: `+${deltas.hp}` }]         : []),
        ...(deltas && deltas.power      > 0 ? [{ label: 'Power',   value: `+${deltas.power}` }]      : []),
        ...(deltas && deltas.navigation > 0 ? [{ label: 'Savvy',   value: `+${deltas.navigation}` }] : []),
        ...(deltas && deltas.fortune    > 0 ? [{ label: 'Fortune', value: `+${deltas.fortune}` }]    : []),
      ]}
      unlocks={ships.length ? [{ caption: 'Now in the shipyard', items: ships.map(s => ({ name: s.name, image: s.image })) }] : []}
      zIndex={80}
      onDone={onDismiss}
    />
  )
}

function diffBonuses(from: number, to: number) {
  if (to <= from) return null
  const before = navLevelBonuses(from)
  const after  = navLevelBonuses(to)
  const d = {
    hp:         after.hp         - before.hp,
    power:      after.power      - before.power,
    navigation: after.navigation - before.navigation,
    fortune:    after.fortune    - before.fortune,
  }
  if (d.hp <= 0 && d.power <= 0 && d.navigation <= 0 && d.fortune <= 0) return null
  return d
}
