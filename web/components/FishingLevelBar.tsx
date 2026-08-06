'use client'

// The Fishing level header + XP bar, and the Renown board it opens.
//
// This is the fishing counterpart to the Ship Hero's Navigation bar, and it
// sits at the top of the Fishing hub exactly like Navigation sits at the top of
// Expeditions. It was born inline in ZoneLanding; lifting it out is what lets
// the hub own it without a second copy going stale.

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { LevelSectionHeader } from '@/components/LevelSectionHeader'
import RenownPanel from '@/components/RenownPanel'
import { renownLevel, renownProgress, spentPoints, type RenownAlloc } from '@/lib/renown'
import type { RenownState } from '@/app/(app)/actions/renown'
import { getXPProgress } from '@/lib/fishingLevel'

export default function FishingLevelBar({
  fishingXP,
  initialAlloc,
}: {
  fishingXP: number
  /** Persisted Fishing Renown allocations ({} when none). */
  initialAlloc?: RenownAlloc | null
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
      <motion.button
        type="button"
        onClick={() => { markSeen(); setRenownOpen(true) }}
        aria-label="View Fishing Renown"
        animate={pulse ? { boxShadow: [`0 0 0px ${pc}00`, `0 0 16px ${pc}aa`, `0 0 0px ${pc}00`] } : { boxShadow: `0 0 0px ${pc}00` }}
        transition={pulse ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', width: '100%', textAlign: 'left', background: pulse ? `${pc}12` : 'none', border: `1px solid ${pulse ? pc + '55' : 'transparent'}`, borderRadius: 12, cursor: 'pointer', padding: '0.25rem 0.35rem 0.35rem', WebkitTapHighlightColor: 'transparent' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(125,160,216,0.12)'; e.currentTarget.style.borderColor = 'rgba(125,160,216,0.3)' }}
        onMouseLeave={e => { e.currentTarget.style.background = pulse ? `${pc}12` : 'none'; e.currentTarget.style.borderColor = pulse ? pc + '55' : 'transparent' }}
      >
        <LevelSectionHeader label="Fishing" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '0.3rem 0' }}>
          <div className="shrink-0" style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span className="font-karla font-600" style={{ fontSize: '0.55rem', color: '#7da0d8bb', letterSpacing: '0.08em' }}>LV</span>
            <span className="font-cinzel font-700" style={{ fontSize: '1.55rem', color: '#7da0d8', lineHeight: 1 }}>{xp.level}</span>
          </div>
          <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <motion.div
              key={atMax ? `rn-${rn?.level ?? 0}` : xp.level}
              initial={{ width: '0%' }}
              animate={{ width: `${atMax ? (rn ? rn.progress * 100 : 100) : xp.progress * 100}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              style={{ height: '100%', borderRadius: 999, background: atMax ? 'linear-gradient(90deg, #a07a2a 0%, #f0c040 100%)' : 'linear-gradient(90deg, #4a6090 0%, #7da0d8 100%)', boxShadow: atMax ? '0 0 10px #f0c04070' : '0 0 10px #7da0d870' }}
            />
          </div>
          <span className="font-karla font-600 shrink-0" style={{ fontSize: '0.62rem', color: atMax ? '#f0c040' : 'rgba(255,255,255,0.65)', textAlign: 'right', lineHeight: 1, whiteSpace: 'nowrap' }}>
            {atMax ? (rn ? `✦ R${rn.level} · ${renownXpLabel} xp` : 'MAX') : `${toNext.toLocaleString()} xp`}
          </span>
        </div>
      </motion.button>

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
