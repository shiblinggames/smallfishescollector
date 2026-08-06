'use client'

// The Fishing level header + XP bar, and the Renown board it opens.
//
// This is the fishing counterpart to the Ship Hero's Navigation bar, and it
// sits at the top of the Fishing hub exactly like Navigation sits at the top of
// Expeditions. It was born inline in ZoneLanding; lifting it out is what lets
// the hub own it without a second copy going stale.

import { useState, useEffect, type ReactNode } from 'react'
import SkillLevelHero from '@/components/SkillLevelHero'
import RenownPanel from '@/components/RenownPanel'
import { renownLevel, renownProgress, spentPoints, type RenownAlloc } from '@/lib/renown'
import type { RenownState } from '@/app/(app)/actions/renown'
import { getXPProgress } from '@/lib/fishingLevel'

export default function FishingLevelBar({
  fishingXP,
  initialAlloc,
  footer,
}: {
  fishingXP: number
  /** Persisted Fishing Renown allocations ({} when none). */
  initialAlloc?: RenownAlloc | null
  /** Hung flush inside the hero panel, under a hairline. The hub passes the
   *  market ticker, mirroring the quarterdeck under Navigation. */
  footer?: ReactNode
}) {
  // Alloc mirrors to local state so the board stays in sync if the player
  // spends a point and reopens it.
  const [alloc, setAlloc] = useState<RenownAlloc>(initialAlloc ?? {})
  const [renownOpen, setRenownOpen] = useState(false)
  // Blink the bar when there's a reason to tap it — a new level you haven't
  // opened it to view, or an unspent Renown point. "Seen" level is remembered
  // per device, cleared on tap.
  const [levelSeen, setLevelSeen] = useState(999)
  useEffect(() => { setLevelSeen(Number(localStorage.getItem('sf_fish_level_seen') || 0)) }, [])

  const rLevel = renownLevel('fishing', fishingXP)
  const renownState: RenownState = {
    skill: 'fishing', level: rLevel,
    spent: spentPoints('fishing', alloc),
    available: Math.max(0, rLevel - spentPoints('fishing', alloc)),
    alloc,
  }

  const xp = getXPProgress(fishingXP)
  const atMax = xp.level >= 100
  const toNext = atMax ? 0 : xp.xpForLevel - xp.xpInLevel
  // Gold while a Renown point is unspent, blue for a level not yet viewed.
  const pulse = renownState.available > 0 || xp.level > levelSeen
  const pc = renownState.available > 0 ? '#f0c040' : '#7da0d8'
  const markSeen = () => { setLevelSeen(xp.level); try { localStorage.setItem('sf_fish_level_seen', String(xp.level)) } catch {} }
  // Past 100 the bar tracks progress to the next Renown level and shows the XP
  // remaining to it (compact "45k").
  const rn = atMax ? renownProgress('fishing', fishingXP) : null
  const toNextRenown = rn ? rn.span - rn.into : 0
  const renownXpLabel = toNextRenown >= 1000 ? `${Math.round(toNextRenown / 1000)}k` : `${toNextRenown}`

  return (
    <>
      <SkillLevelHero
        footer={footer}
        label="Fishing"
        level={xp.level}
        progress={atMax ? (rn ? rn.progress : 1) : xp.progress}
        atMax={atMax}
        pulse={pulse}
        pulseColor={pc}
        barKey={atMax ? `rn-${rn?.level ?? 0}` : xp.level}
        ariaLabel="View Fishing Renown"
        onClick={() => { markSeen(); setRenownOpen(true) }}
        trailing={
          <span className="font-karla font-600 shrink-0" style={{ fontSize: '0.66rem', color: atMax ? '#f0c040' : 'rgba(255,255,255,0.72)', textAlign: 'right', lineHeight: 1, whiteSpace: 'nowrap' }}>
            {atMax ? (rn ? `✦ R${rn.level} · ${renownXpLabel} xp` : 'MAX') : `${toNext.toLocaleString()} xp`}
          </span>
        }
      />

      {/* Fishing Renown board — opened by tapping the level header. */}
      <RenownPanel
        open={renownOpen}
        onClose={() => setRenownOpen(false)}
        skill="fishing"
        initial={renownState}
        onChange={s => setAlloc(s.alloc)}
      />
    </>
  )
}
