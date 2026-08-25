'use client'

// THE FISH COLLECTION DRAWER.
//
// Lifted OUT of FishingGame, not copied: the ocean hub needs the same log at
// the bottom of the same tackle bar, and zone completion pays a reward and
// spends a prestige. Two implementations of this would be two implementations
// of a payout, which is the one kind of duplication this codebase cannot
// afford. FishingGame now mounts this too.
//
// Controlled, like GearScreen: it renders what it is given and calls back.
// Both mounts already hold most of this state for other reasons — the fishing
// page for its zone rewards and prestige, the map for its catch bookkeeping —
// so handing it down is cheaper than hoisting it in.
//
// The drag-to-dismiss is the drawer's OWN. It is chrome on this element, and
// asking every caller to build a drag controller for a gesture they never
// otherwise touch was the wrong seam.

import React, { useRef } from 'react'
import { motion, useDragControls } from 'framer-motion'
import { RARITY, FishImg, TrophyMark } from '@/components/CatchResultCard'
import { DrawerHandle, DrawerClose } from '@/components/DrawerChrome'
import { IconLock, IconTrophy } from '@/components/GameIcons'
import { ZONES, HABITAT_COLOR, HABITAT_LABEL, HABITAT_TAGLINE } from './constants'
import { PRESTIGE_MAX, goldenBoostPct, zoneRewardDoubloons } from '@/lib/zoneRewards'
import { TIER_COLOR, tierForLength, formatFishLength } from '@/lib/fishSize'
import { SHINY_FISH_FILTER } from '@/lib/shiny'
import { VIGIL_FRAME, VIGIL_MAX_RANK, vigilNumeral, type VigilState } from '@/lib/ancientVigil'
import { getLevelFromXP } from '@/lib/fishingLevel'
import type { FishSpeciesBasic } from './constants'

/** The ink stamp on a species you have logged. Collection-only, so it moved
 *  with the drawer rather than staying behind in FishingGame. */
function DiscoveredStamp() {
  return (
    <div aria-hidden style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%) rotate(-14deg)',
      pointerEvents: 'none',
    }}>
      <div style={{
        border: '2px solid rgba(120,200,150,0.55)', borderRadius: 5,
        padding: '0.06rem 0.28rem',
      }}>
        <span className="font-karla font-800 uppercase" style={{
          fontSize: '0.34rem', letterSpacing: '0.14em', color: 'rgba(120,200,150,0.8)',
        }}>Logged</span>
      </div>
    </div>
  )
}

export type FishCollectionProps = {
  /** Every species, from the cached reference table. */
  allFishSpecies: FishSpeciesBasic[]
  fishingXP: number

  caughtFishIds: Set<number>
  mountedFishIds: Set<number>
  personalBests: Record<number, number>
  ancientCatches: Set<number>
  ancientVigil: VigilState
  vigilUnlocked: boolean

  prestigeLevels: Record<string, number>
  goldenBoosts: Record<string, number>
  claimedZones: Record<string, boolean>
  claimingZone: string | null
  prestigingZone: string | null

  /** Which zone block is open. Held by the caller because the fishing page also
   *  scrolls to it when a fresh catch flashes the Logbook button. */
  expandedZone: string | null
  setExpandedZone: (z: string | null) => void
  setTappedFishId: (id: number | null) => void
  uncheckedNewFishIds: Set<number>
  setUncheckedNewFishIds: React.Dispatch<React.SetStateAction<Set<number>>>

  confirmPrestigeZone: string | null
  setConfirmPrestigeZone: (z: string | null) => void
  handleClaimZoneReward: (zone: string) => void
  handlePrestige: (zone: string) => void
  setReleasingAncient: (f: FishSpeciesBasic | null) => void

  onClose: () => void
}

export default function FishCollectionDrawer({
  allFishSpecies, fishingXP,
  caughtFishIds, mountedFishIds, personalBests, ancientCatches, ancientVigil, vigilUnlocked,
  prestigeLevels, goldenBoosts, claimedZones, claimingZone, prestigingZone,
  expandedZone, setExpandedZone, setTappedFishId,
  uncheckedNewFishIds, setUncheckedNewFishIds,
  confirmPrestigeZone, setConfirmPrestigeZone,
  handleClaimZoneReward, handlePrestige, setReleasingAncient,
  onClose,
}: FishCollectionProps) {
  const collectionBodyRef = useRef<HTMLDivElement | null>(null)
  const zoneBlockRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const controls = useDragControls()
  const drag = {
    motionProps: {
      drag: 'y' as const,
      dragControls: controls,
      dragListener: false,
      dragConstraints: { top: 0 },
      dragElastic: { top: 0, bottom: 0.35 },
      onDragEnd: (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
        if (info.offset.y > 80 || info.velocity.y > 400) close()
      },
    },
    handleProps: {
      onPointerDown: (e: React.PointerEvent) => controls.start(e),
    },
  }
  function close() { onClose(); setExpandedZone(null); setTappedFishId(null) }
  const setCollectionOpen = (_v: boolean) => close()

  return (
    <motion.div key="collection-drawer"
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      {...drag.motionProps}
      style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
        // CAPPED, and centred with auto margins rather than a translateX: this
        // is a motion.div, framer owns `transform` for the slide-in AND for the
        // drag-to-dismiss, and a transform written here is silently clobbered
        // by both. Same reasoning as the gear sheet.
        //
        // A species grid stretched across a desktop monitor puts four fish on a
        // row two feet apart with the zone header a foot above them, which is
        // not a collection, it is a spreadsheet.
        maxWidth: 560, marginLeft: 'auto', marginRight: 'auto',
        background: 'rgba(6,12,20,0.98)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderBottom: 'none',
        borderRadius: '18px 18px 0 0',
        maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        willChange: 'transform',
      }}
    >
      <DrawerHandle dragHandleProps={drag.handleProps} />
      {/* Sticky header */}
      <div className="flex items-center justify-between flex-shrink-0"
        style={{ padding: '1.25rem 1.1rem 0.75rem' }}>
        <p className="font-karla font-700 uppercase tracking-[0.14em]"
          style={{ fontSize: '0.82rem', color: '#6a6764' }}>Fish Collection</p>
        <DrawerClose onClick={() => { setCollectionOpen(false); setExpandedZone(null); setTappedFishId(null) }} />
      </div>

      {/* Scrollable body */}
      <div ref={collectionBodyRef} style={{ overflowY: 'auto', padding: '0 1.1rem 2rem', overscrollBehavior: 'contain' }}>
      {ZONES.filter(z => z !== 'ancient_deep').map(zone => {
        const zoneSpecies = allFishSpecies.filter(f => f.habitat === zone)
        const discoveredCount = zoneSpecies.filter(f => caughtFishIds.has(f.id)).length
        // Trophies landed in this zone. Size gives no XP, no coin and no sell bonus:
        // the collection IS the reward, so it has to be somewhere you can point at.
        const trophyCount = zoneSpecies.filter(f => {
          const pb = personalBests[f.id]
          if (pb == null || f.length_min_in == null || f.length_max_in == null) return false
          return tierForLength(pb, Number(f.length_min_in), Number(f.length_max_in)) === 'trophy'
        }).length
        const zoneColor = HABITAT_COLOR[zone]
        const isExpanded = expandedZone === zone
        const pct = zoneSpecies.length > 0 ? discoveredCount / zoneSpecies.length : 0
        const isComplete = discoveredCount === zoneSpecies.length && zoneSpecies.length > 0
        const isClaimed = claimedZones[zone] ?? false
        const isClaiming = claimingZone === zone
        // Count unviewed new fish in this zone so the header
        // shows a NEW pill — tells the player exactly which
        // zone to open without a guessing game.
        const newInZone = zoneSpecies.filter(f => uncheckedNewFishIds.has(f.id)).length

        return (
          <div key={zone} ref={el => { zoneBlockRefs.current[zone] = el }} style={{ marginBottom: '0.6rem' }}>
            <button
              className="w-full text-left"
              style={{
                background: `linear-gradient(135deg, rgba(6,16,26,0.97) 0%, ${zoneColor}12 100%)`,
                border: `1px solid ${zoneColor}28`,
                borderLeft: `3px solid ${zoneColor}bb`,
                borderRadius: isExpanded ? '12px 12px 0 0' : 12,
                padding: '0.75rem 0.9rem 0.65rem',
                cursor: 'pointer',
                transition: 'border-radius 0.15s',
              }}
              onClick={() => { setExpandedZone(isExpanded ? null : zone); setTappedFishId(null) }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: '0.5rem' }}>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-karla font-700 uppercase tracking-[0.14em]"
                      style={{ fontSize: '0.85rem', color: zoneColor, lineHeight: 1 }}>{HABITAT_LABEL[zone]}</p>
                    {(prestigeLevels[zone] ?? 0) > 0 && (
                      <div style={{ display: 'flex', gap: 3 }}>
                        {Array.from({ length: prestigeLevels[zone] }).map((_, i) => (
                          <svg key={i} width="11" height="11" viewBox="0 0 24 24" fill={zoneColor} style={{ filter: `drop-shadow(0 0 4px ${zoneColor}cc)`, flexShrink: 0 }}>
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                          </svg>
                        ))}
                      </div>
                    )}
                    {(goldenBoosts[zone] ?? 0) > 0 && (
                      <span className="font-karla font-700" style={{ fontSize: '0.5rem', color: '#f0c040', letterSpacing: '0.06em', textShadow: '0 0 6px rgba(240,192,64,0.5)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        ✦ +{goldenBoostPct(goldenBoosts[zone] ?? 0)}% GOLDENS
                      </span>
                    )}
                    {newInZone > 0 && (
                      <motion.span
                        animate={{ scale: [1, 1.08, 1] }}
                        transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
                        style={{
                          fontSize: '0.5rem', fontWeight: 700,
                          fontFamily: 'var(--font-karla)',
                          color: '#fde68a',
                          background: 'rgba(253,230,138,0.18)',
                          border: '1px solid rgba(253,230,138,0.5)',
                          padding: '0.14rem 0.42rem',
                          borderRadius: '2rem',
                          letterSpacing: '0.12em',
                          boxShadow: '0 0 12px rgba(253,230,138,0.32)',
                          lineHeight: 1,
                        }}>
                        {newInZone} NEW
                      </motion.span>
                    )}
                  </div>
                  <p className="font-karla font-400"
                    style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>{HABITAT_TAGLINE[zone]}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    {/* Percentage as the headline metric — bigger,
                        brighter, in Cinzel. Raw count drops to a
                        muted secondary so completion reads at a
                        glance. Same row height as before so the
                        zone header chrome stays compact. */}
                    <p className="font-cinzel font-700"
                      style={{ fontSize: '0.88rem', color: isComplete ? zoneColor : '#f0ede8', lineHeight: 1, textShadow: isComplete ? `0 0 8px ${zoneColor}66` : 'none' }}>
                      {Math.round(pct * 100)}%
                    </p>
                    <p className="font-karla font-600"
                      style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1 }}>
                      {discoveredCount}/{zoneSpecies.length}
                    </p>
                    {trophyCount > 0 && (
                      <p className="font-karla font-700" title={`${trophyCount} trophy catch${trophyCount === 1 ? '' : 'es'}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.7rem', lineHeight: 1, color: TIER_COLOR.trophy, textShadow: `0 0 7px ${TIER_COLOR.trophy}55` }}>
                        <TrophyMark size={10} color={TIER_COLOR.trophy} />
                        {trophyCount}
                      </p>
                    )}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={zoneColor + '80'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', flexShrink: 0 }}>
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </div>
                  <p className="font-karla font-600"
                    style={{ fontSize: '0.68rem', color: isClaimed ? zoneColor + '99' : 'rgba(240,192,64,0.65)' }}>
                    {isClaimed ? '✓ reward claimed' : `${zoneRewardDoubloons(zone, prestigeLevels[zone] ?? 0).toLocaleString()} ⟡ on completion`}
                  </p>
                </div>
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${pct * 100}%`,
                  background: isComplete ? zoneColor : `linear-gradient(90deg, ${zoneColor}88, ${zoneColor})`,
                  borderRadius: 2,
                  transition: 'width 0.4s ease',
                  boxShadow: pct > 0 ? `0 0 6px ${zoneColor}60` : 'none',
                }} />
              </div>
            </button>

            {/* Reward claim strip */}
            {isComplete && !isClaimed && (
              <motion.button
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                onClick={() => handleClaimZoneReward(zone)}
                disabled={isClaiming}
                className="w-full flex items-center justify-between"
                style={{
                  background: `linear-gradient(90deg, ${zoneColor}20, ${zoneColor}10)`,
                  border: `1px solid ${zoneColor}50`,
                  borderTop: 'none',
                  borderRadius: '0 0 12px 12px',
                  padding: '0.5rem 0.9rem',
                  cursor: isClaiming ? 'default' : 'pointer',
                }}
              >
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: '0.9rem', color: zoneColor, display: 'flex' }}><IconTrophy size={14} /></span>
                  <div className="text-left">
                    <p className="font-karla font-700 uppercase tracking-[0.1em]"
                      style={{ fontSize: '0.52rem', color: zoneColor, lineHeight: 1 }}>Zone Complete!</p>
                    <p className="font-karla font-600"
                      style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Tap to claim your reward</p>
                  </div>
                </div>
                <p className="font-cinzel font-700"
                  style={{ fontSize: '0.88rem', color: '#f0c040' }}>
                  {isClaiming ? '…' : `${zoneRewardDoubloons(zone, prestigeLevels[zone] ?? 0).toLocaleString()} ⟡`}
                </p>
              </motion.button>
            )}
            {isComplete && isClaimed && (
              <div style={{
                background: `linear-gradient(to bottom, ${zoneColor}14, ${zoneColor}08)`,
                border: `1px solid ${zoneColor}40`,
                borderTop: 'none',
                borderRadius: '0 0 12px 12px',
                padding: '0.7rem 0.9rem 0.8rem',
              }}>
                {confirmPrestigeZone === zone ? (
                  <div>
                    <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.62rem', color: (prestigeLevels[zone] ?? 0) >= PRESTIGE_MAX ? '#f0c040' : zoneColor, marginBottom: '0.3rem' }}>
                      Are you sure?
                    </p>
                    {(prestigeLevels[zone] ?? 0) >= PRESTIGE_MAX ? (
                      <p className="font-karla font-500" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', marginBottom: '0.55rem', lineHeight: 1.4 }}>
                        Wipe your {HABITAT_LABEL[zone]} catch log (your <span style={{ color: '#f5c451', fontWeight: 700 }}>golden trophies stay</span>) for a permanent <span style={{ color: '#f0c040', fontWeight: 700 }}>+{goldenBoostPct(1)}% golden catch chance</span> here, stacking on your current +{goldenBoostPct(goldenBoosts[zone] ?? 0)}%.
                      </p>
                    ) : (
                      <p className="font-karla font-500" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', marginBottom: '0.55rem', lineHeight: 1.4 }}>
                        Your {HABITAT_LABEL[zone]} catch log resets (your <span style={{ color: '#f5c451', fontWeight: 700 }}>golden trophies stay</span>), but you&apos;ll permanently earn <span style={{ color: zoneColor, fontWeight: 700 }}>+{((prestigeLevels[zone] ?? 0) + 1) * 10}% XP</span> on every catch here. You can complete the collection again for another full reward.
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setConfirmPrestigeZone(null)}
                        className="font-karla font-600 uppercase tracking-[0.1em]"
                        style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', padding: '0.3rem 0.7rem', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7 }}
                      >Cancel</button>
                      {(() => {
                        const gold = (prestigeLevels[zone] ?? 0) >= PRESTIGE_MAX
                        const acc = gold ? '#f0c040' : zoneColor
                        return (
                          <button
                            onClick={() => handlePrestige(zone)}
                            disabled={prestigingZone === zone}
                            className="font-karla font-700 uppercase tracking-[0.1em]"
                            style={{ fontSize: '0.62rem', color: gold ? '#1a1205' : '#fff', padding: '0.3rem 0.9rem', background: gold ? acc : acc + 'cc', border: `1px solid ${acc}`, borderRadius: 7, boxShadow: `0 0 10px ${acc}66` }}
                          >{prestigingZone === zone ? '…' : gold ? 'Yes, wipe for gold!' : 'Yes, Prestige!'}</button>
                        )
                      })()}
                    </div>
                  </div>
                ) : (prestigeLevels[zone] ?? 0) >= PRESTIGE_MAX ? (
                  // MAX PRESTIGE — mastered. Further wipes no longer level up;
                  // each buys a permanent GOLDEN BOOST (higher golden odds
                  // here), the evergreen post-max chase.
                  <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 10, padding: '0.6rem 0.6rem 0.65rem', textAlign: 'center', background: 'linear-gradient(160deg, rgba(240,192,64,0.16), rgba(240,192,64,0.04))', border: '1px solid rgba(240,192,64,0.45)' }}>
                    <motion.div aria-hidden animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                      style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(240,192,64,0.26), transparent 70%)', pointerEvents: 'none' }} />
                    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
                      {Array.from({ length: PRESTIGE_MAX }).map((_, i) => (
                        <svg key={i} width="15" height="15" viewBox="0 0 24 24" fill="#f0c040" style={{ filter: 'drop-shadow(0 0 5px #f0c040cc)', flexShrink: 0 }}>
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                      ))}
                    </div>
                    <p className="font-cinzel font-800 uppercase" style={{ position: 'relative', fontSize: '0.78rem', letterSpacing: '0.16em', backgroundImage: 'linear-gradient(90deg,#fff2c8,#f0c040,#ffe9a8,#f0c040)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                      Max Prestige
                    </p>
                    {(goldenBoosts[zone] ?? 0) > 0 && (
                      <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ position: 'relative', fontSize: '0.6rem', color: '#f0c040', marginTop: 4 }}>
                        ✦ Golden Boost +{goldenBoostPct(goldenBoosts[zone] ?? 0)}%
                      </p>
                    )}
                    <p className="font-karla font-500" style={{ position: 'relative', fontSize: '0.62rem', color: 'rgba(255,235,190,0.7)', marginTop: 4, marginBottom: '0.5rem', lineHeight: 1.35 }}>
                      Wipe again for a permanent <span style={{ color: '#f0c040', fontWeight: 700 }}>+{goldenBoostPct(1)}%</span> golden catch chance here.
                    </p>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmPrestigeZone(zone) }}
                      className="font-karla font-700 uppercase tracking-[0.12em] w-full"
                      style={{ position: 'relative', fontSize: '0.66rem', color: '#1a1205', padding: '0.42rem 1rem', background: 'linear-gradient(135deg,#ffe08a,#f0c040)', border: '1px solid #f0c040', borderRadius: 8, boxShadow: '0 0 14px rgba(240,192,64,0.4), inset 0 1px 0 rgba(255,255,255,0.3)' }}
                    >✦ Wipe for +{goldenBoostPct(1)}% Goldens</button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-1.5" style={{ marginBottom: '0.25rem' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill={zoneColor} style={{ filter: `drop-shadow(0 0 5px ${zoneColor})`, flexShrink: 0 }}>
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                      <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.65rem', color: zoneColor }}>
                        Prestige {(prestigeLevels[zone] ?? 0) + 1} Available
                      </p>
                    </div>
                    <p className="font-karla font-500" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.65)', marginBottom: '0.55rem', lineHeight: 1.35 }}>
                      Reset your collection (golden trophies stay) and permanently earn <span style={{ color: zoneColor, fontWeight: 700 }}>+{((prestigeLevels[zone] ?? 0) + 1) * 10}% XP</span> on every {HABITAT_LABEL[zone]} catch{(prestigeLevels[zone] ?? 0) + 1 >= PRESTIGE_MAX ? '. This is the final prestige — Max Prestige.' : ', up to +50% at Max Prestige.'}
                    </p>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmPrestigeZone(zone) }}
                      className="font-karla font-700 uppercase tracking-[0.12em] w-full"
                      style={{
                        fontSize: '0.68rem',
                        color: '#fff',
                        padding: '0.42rem 1rem',
                        background: `linear-gradient(135deg, ${zoneColor}aa, ${zoneColor}66)`,
                        border: `1px solid ${zoneColor}88`,
                        borderRadius: 8,
                        boxShadow: `0 0 14px ${zoneColor}44, inset 0 1px 0 rgba(255,255,255,0.1)`,
                      }}
                    >★ Prestige {(prestigeLevels[zone] ?? 0) + 1}</button>
                  </div>
                )}
              </div>
            )}

            {isExpanded && (
              <motion.div
                // Stagger entrance — when a zone expands, the cards
                // cascade in over ~300ms instead of materialising
                // all at once. Parent's `visible` variant carries
                // staggerChildren; each card's variant just declares
                // hidden/visible states and inherits the delay from
                // the parent's stagger schedule.
                initial="hidden"
                animate="visible"
                variants={{
                  hidden:  {},
                  visible: { transition: { staggerChildren: 0.028, delayChildren: 0.04 } },
                }}
                style={{
                  background: `${zoneColor}08`,
                  border: `1px solid ${zoneColor}20`,
                  borderTop: 'none',
                  borderRadius: '0 0 12px 12px',
                  padding: '0.55rem 0.55rem 0.65rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '0.45rem',
                }}>
                {zoneSpecies.map(f => {
                  const discovered = caughtFishIds.has(f.id)
                  const rarityColor = RARITY[f.bite_rarity]?.color ?? '#888'
                  const pb = personalBests[f.id]
                  // The PB length, read back as a tier. fish_personal_bests never stored the
                  // tier, so a 3%-roll trophy used to vanish into the log as a slightly bigger
                  // number with nothing to say what it was. The length already knows:
                  // tierForLength is the exact inverse of the roll. No migration, no new column.
                  const pbTier = (pb != null && f.length_min_in != null && f.length_max_in != null)
                    ? tierForLength(pb, Number(f.length_min_in), Number(f.length_max_in))
                    : null
                  const isTrophy = pbTier === 'trophy'
                  const isNew = uncheckedNewFishIds.has(f.id)
                  const cardVariants = {
                    hidden:  { opacity: 0, y: 10, scale: 0.96 },
                    visible: { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.26, ease: [0.2, 0.7, 0.3, 1] as [number, number, number, number] } },
                  }

                  // Undiscovered: silhouette card. Render the actual
                  // fish image at brightness:0 + low opacity so the
                  // player gets a hint of the shape (more compelling
                  // than a plain "???") without leaking the species.
                  if (!discovered) {
                    return (
                      <motion.div key={f.id}
                        variants={cardVariants}
                        style={{
                          position: 'relative',
                          background: 'rgba(4,10,18,0.45)',
                          border: `1px solid ${rarityColor}1c`,
                          borderRadius: 10,
                          padding: '0.55rem 0.5rem 0.5rem',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          minHeight: 96,
                        }}>
                        <div style={{ width: '100%', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FishImg name={f.name} style={{ maxWidth: '88%', maxHeight: 48, objectFit: 'contain', filter: 'brightness(0) opacity(0.18)' }} />
                        </div>
                        <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.28)', marginTop: 4, letterSpacing: '0.06em' }}>???</p>
                      </motion.div>
                    )
                  }

                  // Discovered: full card. Tap opens the modal with
                  // the fun fact + sell value + PB. NEW badge clears
                  // on tap (same as before — replaces inline expand).
                  // Mounted (golden) species swap the card chrome to
                  // the gold treatment from the catch result card —
                  // gold radial bg, gold border, golden-filtered fish
                  // sprite, small ✦ badge.
                  const isMounted = mountedFishIds.has(f.id)
                  return (
                    <motion.button
                      key={f.id}
                      type="button"
                      variants={cardVariants}
                      onClick={() => {
                        setTappedFishId(f.id)
                        if (isNew) setUncheckedNewFishIds(prev => { const next = new Set(prev); next.delete(f.id); return next })
                      }}
                      className="text-left"
                      style={{
                        position: 'relative',
                        background: isMounted
                          ? 'radial-gradient(circle at 50% 35%, rgba(253,230,138,0.28) 0%, rgba(120,68,16,0.55) 60%, rgba(40,18,4,0.85) 100%)'
                          : `linear-gradient(180deg, rgba(4,10,18,0.7) 0%, ${rarityColor}10 100%)`,
                        border: isMounted
                          ? '1px solid rgba(228,188,108,0.75)'
                          : isTrophy
                            ? `1px solid ${TIER_COLOR.trophy}aa`
                            : `1px solid ${rarityColor}55`,
                        borderRadius: 10,
                        padding: '0.55rem 0.5rem 0.55rem',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                        minHeight: 96,
                        cursor: 'pointer',
                        touchAction: 'manipulation',
                        boxShadow: isMounted
                          ? 'inset 0 0 18px rgba(200,140,40,0.18), 0 0 14px rgba(228,188,108,0.22)'
                          : isTrophy
                            ? `inset 0 0 16px ${TIER_COLOR.trophy}1f, 0 0 12px ${TIER_COLOR.trophy}2e`
                            : undefined,
                      }}
                    >
                      <div style={{ width: '100%', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FishImg name={f.name} style={{
                          maxWidth: '88%', maxHeight: 50, objectFit: 'contain',
                          filter: isMounted ? SHINY_FISH_FILTER : `drop-shadow(0 1px 6px ${rarityColor}66)`,
                        }} />
                      </div>
                      <p className="font-cinzel font-700" style={{
                        fontSize: '0.72rem',
                        color: isMounted ? '#fff5d0' : rarityColor,
                        lineHeight: 1.15,
                        textAlign: 'center',
                        width: '100%',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        marginTop: 2,
                        textShadow: isMounted ? '0 0 8px rgba(251,204,74,0.45)' : undefined,
                      }}>{isMounted ? `Golden ${f.name}` : f.name}</p>
                      {pb != null && (
                        <p className="font-karla font-600" style={{
                          display: 'flex', alignItems: 'center', gap: 3,
                          fontSize: '0.6rem', letterSpacing: '0.04em',
                          color: isTrophy ? TIER_COLOR.trophy : isMounted ? 'rgba(251,204,74,0.85)' : 'rgba(230,220,200,0.7)',
                          textShadow: isTrophy ? `0 0 8px ${TIER_COLOR.trophy}66` : undefined,
                        }}>
                          {isTrophy && <TrophyMark size={9} color={TIER_COLOR.trophy} />}
                          {formatFishLength(pb)}
                        </p>
                      )}
                      {isMounted ? (
                        <span aria-hidden style={{
                          position: 'absolute', top: 5, right: 5,
                          fontSize: '0.62rem', color: '#fbcc4a',
                          textShadow: '0 0 8px rgba(251,204,74,0.85)',
                          lineHeight: 1,
                        }}>✦</span>
                      ) : isTrophy ? (
                        <span aria-hidden style={{ position: 'absolute', top: 4, right: 4, display: 'flex', filter: `drop-shadow(0 0 5px ${TIER_COLOR.trophy}aa)` }}>
                          <TrophyMark size={11} color={TIER_COLOR.trophy} />
                        </span>
                      ) : null}
                      {isNew && <DiscoveredStamp />}
                    </motion.button>
                  )
                })}
              </motion.div>
            )}
          </div>
        )
      })}

      {/* Ancient Deep — split into regulars (grid w/ images, like
          other zones) + trophies (existing row layout). The 12
          regulars added 2026-06-09 stack in fish_collection like
          normal catches, so they need the same image-card format.
          Trophies stay in their distinct row format with the 🏆
          icon since they're ceremonial unlocks tracked via
          ancient_catches, not the regular fish_collection. */}
      {(() => {
        const zone = 'ancient_deep'
        const zoneColor = HABITAT_COLOR[zone]
        const allAncient = allFishSpecies.filter(f => f.habitat === zone)
        const regulars = allAncient.filter(f => (f.sell_value ?? 0) > 0)
        const trophies = allAncient.filter(f => (f.sell_value ?? 0) === 0)
        const regularsCaught = regulars.filter(f => caughtFishIds.has(f.id)).length
        const trophiesCaught = trophies.filter(f => ancientCatches.has(f.id)).length
        const caughtCount = regularsCaught + trophiesCaught
        const bossSpecies = allAncient   // header sizing uses the combined total
        const isExpanded = expandedZone === zone
        const isLocked = getLevelFromXP(fishingXP) < 75
        return (
          <div key={zone} ref={el => { zoneBlockRefs.current[zone] = el }} style={{ marginBottom: '0.6rem' }}>
            <button
              className="w-full text-left"
              style={{
                background: `linear-gradient(135deg, rgba(6,6,20,0.97) 0%, ${zoneColor}16 100%)`,
                border: `1px solid ${zoneColor}40`,
                borderLeft: `3px solid ${zoneColor}cc`,
                borderRadius: isExpanded && !isLocked ? '12px 12px 0 0' : 12,
                padding: '0.75rem 0.9rem 0.65rem',
                cursor: 'pointer',
              }}
              onClick={() => !isLocked && setExpandedZone(isExpanded ? null : zone)}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: '0.4rem' }}>
                <div>
                  <p className="font-karla font-700 uppercase tracking-[0.14em]"
                    style={{ fontSize: '0.85rem', color: zoneColor, lineHeight: 1 }}>
                    {isLocked ? <><IconLock size={13} />{' '}</> : null}Ancient Deep
                  </p>
                  <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
                    {isLocked ? 'Unlocks at Fishing Level 75' : 'Before time. Beyond depth.'}
                  </p>
                </div>
                {/* Same percentage-led metric as the other zones,
                    gated on !isLocked so the header still reads
                    as "—" while the zone is locked. */}
                {isLocked ? (
                  <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.2)' }}>—</p>
                ) : (() => {
                  const isAncientComplete = caughtCount === bossSpecies.length && bossSpecies.length > 0
                  const ancientPct = bossSpecies.length > 0 ? caughtCount / bossSpecies.length : 0
                  return (
                    <div className="flex items-center gap-2">
                      <p className="font-cinzel font-700"
                        style={{ fontSize: '0.88rem', color: isAncientComplete ? zoneColor : '#f0ede8', lineHeight: 1, textShadow: isAncientComplete ? `0 0 8px ${zoneColor}66` : 'none' }}>
                        {Math.round(ancientPct * 100)}%
                      </p>
                      <p className="font-karla font-600"
                        style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1 }}>
                        {caughtCount}/{bossSpecies.length}
                      </p>
                    </div>
                  )
                })()}
              </div>
            </button>
            {isExpanded && !isLocked && (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  hidden:  {},
                  visible: { transition: { staggerChildren: 0.025, delayChildren: 0.05 } },
                }}
                style={{
                  background: `${zoneColor}08`, border: `1px solid ${zoneColor}22`,
                  borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '0.55rem 0.55rem 0.6rem',
                }}>
                {/* Regulars — 12 sellable Ancient Deep fish in the
                    same 2-column image grid the other zones use.
                    Same discovery / mounted / silhouette / NEW-stamp
                    treatments. */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.45rem',
                }}>
                  {regulars.map(f => {
                    const discovered = caughtFishIds.has(f.id)
                    const rarityColor = RARITY[f.bite_rarity]?.color ?? '#888'
                    const pb = personalBests[f.id]
                    // The PB length, read back as a tier. fish_personal_bests never stored the
                    // tier, so a 3%-roll trophy used to vanish into the log as a slightly bigger
                    // number with nothing to say what it was. The length already knows:
                    // tierForLength is the exact inverse of the roll. No migration, no new column.
                    const pbTier = (pb != null && f.length_min_in != null && f.length_max_in != null)
                      ? tierForLength(pb, Number(f.length_min_in), Number(f.length_max_in))
                      : null
                    const isTrophy = pbTier === 'trophy'
                    const isNew = uncheckedNewFishIds.has(f.id)
                    const cardVariants = {
                      hidden:  { opacity: 0, y: 10, scale: 0.96 },
                      visible: { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.26, ease: [0.2, 0.7, 0.3, 1] as [number, number, number, number] } },
                    }
                    if (!discovered) {
                      return (
                        <motion.div key={f.id}
                          variants={cardVariants}
                          style={{
                            position: 'relative',
                            background: 'rgba(4,10,18,0.45)',
                            border: `1px solid ${rarityColor}1c`,
                            borderRadius: 10,
                            padding: '0.55rem 0.5rem 0.5rem',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            minHeight: 96,
                          }}>
                          <div style={{ width: '100%', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <FishImg name={f.name} style={{ maxWidth: '88%', maxHeight: 48, objectFit: 'contain', filter: 'brightness(0) opacity(0.18)' }} />
                          </div>
                          <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.28)', marginTop: 4, letterSpacing: '0.06em' }}>???</p>
                        </motion.div>
                      )
                    }
                    const isMounted = mountedFishIds.has(f.id)
                    return (
                      <motion.button
                        key={f.id}
                        type="button"
                        variants={cardVariants}
                        onClick={() => {
                          setTappedFishId(f.id)
                          if (isNew) setUncheckedNewFishIds(prev => { const next = new Set(prev); next.delete(f.id); return next })
                        }}
                        className="text-left"
                        style={{
                          position: 'relative',
                          background: isMounted
                            ? 'radial-gradient(circle at 50% 35%, rgba(253,230,138,0.28) 0%, rgba(120,68,16,0.55) 60%, rgba(40,18,4,0.85) 100%)'
                            : `linear-gradient(180deg, rgba(4,10,18,0.7) 0%, ${rarityColor}10 100%)`,
                          border: isMounted
                            ? '1px solid rgba(228,188,108,0.75)'
                            : isTrophy
                              ? `1px solid ${TIER_COLOR.trophy}aa`
                              : `1px solid ${rarityColor}55`,
                          borderRadius: 10,
                          padding: '0.55rem 0.5rem 0.55rem',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                          minHeight: 96,
                          cursor: 'pointer',
                          touchAction: 'manipulation',
                          boxShadow: isMounted
                            ? 'inset 0 0 18px rgba(200,140,40,0.18), 0 0 14px rgba(228,188,108,0.22)'
                            : isTrophy
                              ? `inset 0 0 16px ${TIER_COLOR.trophy}1f, 0 0 12px ${TIER_COLOR.trophy}2e`
                              : undefined,
                        }}
                      >
                        <div style={{ width: '100%', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FishImg name={f.name} style={{
                            maxWidth: '88%', maxHeight: 50, objectFit: 'contain',
                            filter: isMounted ? SHINY_FISH_FILTER : `drop-shadow(0 1px 6px ${rarityColor}66)`,
                          }} />
                        </div>
                        <p className="font-cinzel font-700" style={{
                          fontSize: '0.72rem',
                          color: isMounted ? '#fff5d0' : rarityColor,
                          lineHeight: 1.15,
                          textAlign: 'center',
                          width: '100%',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          marginTop: 2,
                          textShadow: isMounted ? '0 0 8px rgba(251,204,74,0.45)' : undefined,
                        }}>{isMounted ? `Golden ${f.name}` : f.name}</p>
                        {pb != null && (
                          <p className="font-karla font-600" style={{
                            display: 'flex', alignItems: 'center', gap: 3,
                            fontSize: '0.6rem', letterSpacing: '0.04em',
                            color: isTrophy ? TIER_COLOR.trophy : isMounted ? 'rgba(251,204,74,0.85)' : 'rgba(230,220,200,0.7)',
                            textShadow: isTrophy ? `0 0 8px ${TIER_COLOR.trophy}66` : undefined,
                          }}>
                            {isTrophy && <TrophyMark size={9} color={TIER_COLOR.trophy} />}
                            {formatFishLength(pb)}
                          </p>
                        )}
                        {isMounted ? (
                          <span aria-hidden style={{
                            position: 'absolute', top: 5, right: 5,
                            fontSize: '0.62rem', color: '#fbcc4a',
                            textShadow: '0 0 8px rgba(251,204,74,0.85)',
                            lineHeight: 1,
                          }}>✦</span>
                        ) : isTrophy ? (
                          <span aria-hidden style={{ position: 'absolute', top: 4, right: 4, display: 'flex', filter: `drop-shadow(0 0 5px ${TIER_COLOR.trophy}aa)` }}>
                            <TrophyMark size={11} color={TIER_COLOR.trophy} />
                          </span>
                        ) : null}
                        {isNew && <DiscoveredStamp />}
                      </motion.button>
                    )
                  })}
                </div>

                {/* The Ancients — 6 ceremonial relic-monolith cards.
                    Caught: stone-tablet card with warm amber relic
                    glow at the top, full silhouette art, Cinzel
                    name + scientific italic, ✦ corner glyph, taps
                    open the existing detail modal. Slumbering: dim
                    dashed-border tablet with a barely-visible
                    silhouette and a "Slumbering" caption — same
                    species shape so the player can read what's
                    waiting for them. */}
                <p className="font-cinzel font-700 uppercase" style={{
                  fontSize: '0.62rem',
                  color: zoneColor,
                  marginTop: '0.95rem',
                  marginBottom: '0.55rem',
                  textAlign: 'center',
                  textShadow: `0 0 14px ${zoneColor}88`,
                  letterSpacing: '0.28em',
                }}>
                  ✦ The Ancients · {vigilUnlocked
                    ? `${Object.values(ancientVigil).reduce((n, e) => n + e.rank, 0)} of ${trophies.length * VIGIL_MAX_RANK} vigil`
                    : `${trophiesCaught} of ${trophies.length} awakened`}
                </p>
                {trophies.map(f => {
                  const caught = ancientCatches.has(f.id)
                  const ve = vigilUnlocked ? ancientVigil[String(f.id)] : undefined
                  // AT LARGE is its own state, and must not look like a
                  // mount: the berth is yours but empty, the water still
                  // moving where it went under.
                  const atLarge = ve?.released === true
                  const vrank = ve?.rank ?? 0
                  const vframe = vrank ? VIGIL_FRAME[vrank] : null
                  const monoVariants = {
                    hidden:  { opacity: 0, y: 6, scale: 0.98 },
                    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.32, ease: [0.2, 0.7, 0.3, 1] as [number, number, number, number] } },
                  }
                  if (!caught) {
                    return (
                      <motion.div key={f.id} variants={monoVariants} style={{
                        position: 'relative',
                        background: 'linear-gradient(180deg, rgba(8,12,22,0.92) 0%, rgba(4,8,16,0.96) 100%)',
                        border: '1px dashed rgba(255,255,255,0.08)',
                        borderRadius: 14,
                        padding: '1rem 1rem 0.85rem',
                        marginBottom: '0.5rem',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      }}>
                        <div style={{ width: '100%', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FishImg name={f.name} style={{ maxWidth: '68%', maxHeight: 50, objectFit: 'contain', filter: 'brightness(0) opacity(0.12)' }} />
                        </div>
                        <p className="font-cinzel font-700 uppercase" style={{
                          fontSize: '0.56rem',
                          color: 'rgba(255,255,255,0.25)',
                          letterSpacing: '0.28em',
                          marginTop: 2,
                        }}>Slumbering</p>
                      </motion.div>
                    )
                  }
                  return (
                    <motion.button
                      key={f.id}
                      type="button"
                      variants={monoVariants}
                      onClick={() => setTappedFishId(f.id)}
                      className="text-left w-full"
                      style={{
                        position: 'relative',
                        // THE RANK'S MATERIAL — same ladder the Giants
                        // room wears, off the same table, so a giant
                        // looks identical in both places.
                        background: atLarge
                          ? `
                            radial-gradient(120% 70% at 50% 100%, rgba(56,110,150,0.20) 0%, transparent 60%),
                            linear-gradient(180deg, rgba(6,10,18,0.96) 0%, rgba(4,8,15,0.97) 100%)
                          `
                          : vframe ? vframe.plate
                          : `
                          radial-gradient(120% 60% at 50% 0%, ${zoneColor}42 0%, transparent 55%),
                          linear-gradient(180deg, rgba(28,18,10,0.85) 0%, rgba(10,8,16,0.95) 70%, rgba(6,6,14,0.97) 100%)
                        `,
                        border: atLarge ? '1px dashed rgba(120,150,180,0.4)' : vframe ? vframe.border : `1px solid ${zoneColor}66`,
                        boxShadow: atLarge
                          ? 'inset 0 -30px 50px -30px rgba(56,110,150,0.35), 0 4px 14px rgba(0,0,0,0.5)'
                          : vframe
                            ? `0 6px 22px rgba(0,0,0,0.55), 0 0 ${vframe.trophy ? 34 : 18}px ${vframe.glow}`
                            : `inset 0 0 0 1px ${zoneColor}18, inset 0 32px 64px -22px ${zoneColor}30, 0 6px 22px rgba(0,0,0,0.55), 0 0 18px ${zoneColor}22`,
                        borderRadius: 14,
                        padding: '1rem 1rem 0.95rem',
                        marginBottom: '0.5rem',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                        cursor: 'pointer',
                        touchAction: 'manipulation',
                        overflow: 'hidden',
                        width: '100%',
                      }}
                    >
                      <span aria-hidden style={{
                        position: 'absolute', top: 8, right: 10,
                        fontSize: '0.78rem', color: atLarge ? 'rgba(120,150,180,0.6)' : vframe ? vframe.accent : zoneColor,
                        textShadow: atLarge ? 'none' : `0 0 10px ${vframe ? vframe.accent : zoneColor}cc`,
                        lineHeight: 1,
                      }}>{atLarge ? '〜' : vframe?.trophy ? '★' : '✦'}</span>
                      {/* THE LONG VIGIL — the same rank the Giants room
                          shows, off the same state, so the two surfaces
                          cannot disagree. */}
                      <p className="font-karla font-700 uppercase" style={{
                        fontSize: '0.5rem',
                        color: atLarge ? 'rgba(150,180,205,0.95)' : vframe ? vframe.accent : `${zoneColor}b0`,
                        letterSpacing: '0.36em',
                        marginBottom: 4,
                      }}>{atLarge ? 'BERTH EMPTY' : vframe?.trophy ? 'MASTERED' : vrank ? `RANK ${vigilNumeral(vrank)}` : 'ANCIENT'}</p>
                      <div style={{ width: '100%', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
                        <FishImg name={f.name} style={{
                          maxWidth: '78%', maxHeight: 64, objectFit: 'contain',
                          filter: atLarge
                            ? 'brightness(0.16) opacity(0.4) blur(0.6px)'
                            // Rank V: struck in gold, the same treatment
                            // a golden catch gets.
                            : vframe?.fishFilter
                            ?? `sepia(0.3) saturate(1.1) brightness(1.05) drop-shadow(0 4px 14px ${zoneColor}55)`,
                        }} />
                      </div>
                      <p className="font-cinzel font-700 uppercase" style={{
                        fontSize: '0.95rem',
                        color: atLarge ? 'rgba(190,205,220,0.72)' : vframe?.trophy ? '#fff5d0' : '#fbe9c2',
                        letterSpacing: '0.16em',
                        textShadow: atLarge ? '0 1px 0 rgba(0,0,0,0.5)' : `0 0 14px ${vframe ? vframe.accent : zoneColor}aa, 0 1px 0 rgba(0,0,0,0.5)`,
                        lineHeight: 1.1,
                        textAlign: 'center',
                        marginTop: 2,
                      }}>{f.name}</p>
                      <p className="font-karla font-400" style={{
                        fontSize: '0.62rem',
                        color: `${zoneColor}cc`,
                        fontStyle: 'italic',
                        marginTop: 2,
                        textAlign: 'center',
                      }}>{f.scientific_name}</p>
                      {(() => {
                        if (!ve) return null
                        if (ve.released) {
                          return (
                            <p className="font-karla font-600 italic" style={{ fontSize: '0.6rem', color: 'rgba(150,180,205,0.8)', marginTop: 8, textAlign: 'center', lineHeight: 1.45 }}>
                              Somewhere in the Ancient Deep.<br />It rises for a lure, and nothing else.
                            </p>
                          )
                        }
                        if (ve.rank >= VIGIL_MAX_RANK) {
                          return (
                            <p className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#e7d5aa', marginTop: 7, textAlign: 'center' }}>Mastered</p>
                          )
                        }
                        const vf = VIGIL_FRAME[Math.min(VIGIL_MAX_RANK, ve.rank + 1)]
                        return (
                          // A DIV, not a button: this slab is itself a
                          // <button> that opens the fish sheet, and a
                          // nested button is invalid HTML that React will
                          // hydrate wrong. stopPropagation keeps the tap
                          // from also opening the sheet behind it.
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={e => { e.stopPropagation(); setReleasingAncient(f) }}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); setReleasingAncient(f) } }}
                            className="font-karla font-700 uppercase tracking-[0.14em] tap"
                            style={{
                              marginTop: 9, padding: '0.42rem 0.9rem', borderRadius: 9,
                              border: `1px solid ${vf.accent}66`, color: vf.accent,
                              fontSize: '0.56rem', cursor: 'pointer',
                            }}
                          >Release for Rank {vigilNumeral(ve.rank + 1)}</div>
                        )
                      })()}
                    </motion.button>
                  )
                })}
              </motion.div>
            )}
          </div>
        )
      })()}
      </div>
    </motion.div>
  )
}
