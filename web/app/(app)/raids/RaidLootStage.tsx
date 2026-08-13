'use client'

import { useEffect, useState } from 'react'
import { LOOT_RARITY_TIER } from '@/lib/raidLoot'
import { motion } from 'framer-motion'
import { type BroadsideEnemy, type RaidLootItem, RARITY_COLOR, GEM_GLYPH, GEM_COLOR, isUniqueLoot } from '@/lib/bossRaids'
import type { RaidClearTimes } from './actions'
import { getShipSkin } from '@/lib/shipSkins'
import { vibrate } from '@/lib/haptics'
import { playChestSfx, playChestCreakSfx } from '@/lib/fishingMusic'
import { IconCrate } from '@/components/GameIcons'

const GOLD = '#f0c040'

interface Props {
  /** The boss that was just defeated — used for kill narration only. */
  boss: BroadsideEnemy
  /** This run's clear time (ms) and the record context, for the victory panel. */
  clearTimeMs?: number | null
  clearTimes?: RaidClearTimes | null
  /** Doubloons + XP earned from the kill itself. */
  killGold: number
  /** Gems the crate's currency row paid, as granted by the server. */
  lootGems?: number
  killXP: number
  /** Pre-rolled loot pick + display amount (computed in RaidGame). The reveal
   *  shows this entry directly — no slot spin. */
  loot: RaidLootItem[]
  /** The row the reel lands on: the rarest item that dropped, or the currency
   *  row when the crate carried no items. */
  slotFinal: number
  /** Every unique that dropped. Empty on a currency-only crate, and can hold
   *  more than one now that uniques roll independently of each other. */
  itemIdxs?: number[]
  lootAmount: number
  fortuneMult: number
  /** Fortune's pull on ITEM odds. A different curve from the doubloon one
   *  (hard 2x cap), so it is shown as its own figure rather than folded in. */
  lootFortuneMult?: number
  /** Full-raid-clear bonus Nav XP. Undefined / 0 when this isn't the final boss. */
  clearBonusXp?: number
  /** Player nameplate fields — kept for parity with the battle scene. */
  shipImageUrl: string
  shipFilter?: string
  shipName: string
  playerLabel: string
  playerCharacterColor?: string | null
  playerEquippedHat?: string | null
  playerAvatarBg?: string | null
  playerAvatarBorder?: string | null
  playerHpMax: number
  playerHp: number
  /** Called when the player taps Return to Port — the parent runs the
   *  claimRaidLoot server action + routes to /expeditions. */
  onClaim: () => void
  /** Whether the parent is currently saving the claim. Disables the button. */
  claiming?: boolean
  /** Per-crew XP accumulated across THE ENTIRE RAID (not just the boss kill). */
  crewXP?: { id: number; name: string; oldXP: number; newXP: number; oldLevel: number; newLevel: number }[]
}

const RARITY_LABEL: Record<string, string> = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary',
}
// Rarity → a 1-5 "chest tier" so the open-burst scales like the Gauntlet's:
// commoner hauls pop quietly, epics/legendaries detonate. Shared with the roll
// (lib/raidLoot) so the headline pick and the burst agree, and so ancient stops
// falling through to the quietest tier.
const RARITY_TIER = LOOT_RARITY_TIER

function fmtGold(n: number): string {
  return n.toLocaleString()
}

/** ms → "2:34" over a minute, "48.3s" under. */
function fmtTime(ms: number): string {
  const totalSec = ms / 1000
  const m = Math.floor(totalSec / 60)
  const s = Math.floor(totalSec % 60)
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${(Math.round(totalSec * 10) / 10).toFixed(1)}s`
}

function TimeRow({ label, value, accent, strong }: { label: string; value: string; accent?: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '0.28rem 0' }}>
      <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.54rem', color: '#9a948a' }}>{label}</span>
      <span className={strong ? 'font-cinzel font-800' : 'font-karla font-700'} style={{ fontSize: strong ? '1.05rem' : '0.82rem', color: accent ?? '#f3ede2', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

// ── Shared reveal vocabulary with the Davy Jones Gauntlet cash-out ───────────
// rAF count-up for the reward numbers (easeOutCubic), held at 0 until `run`.
function CountUp({ to, dur = 850, run = true }: { to: number; dur?: number; run?: boolean }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!run || to <= 0) { setN(0); return }
    let raf = 0, start = 0
    const tick = (t: number) => {
      if (!start) start = t
      const p = Math.min(1, (t - start) / dur)
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, dur, run])
  return <>{n.toLocaleString()}</>
}

function RewardLine({ label, to, suffix = '', color, delay, run }: { label: string; to: number; suffix?: string; color: string; delay: number; run: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.35 }}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0.45rem 0.3rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.56rem', color: '#9a948a' }}>{label}</span>
      <span className="font-cinzel font-800" style={{ fontSize: '1.2rem', color }}>+<CountUp to={to} run={run} />{suffix}</span>
    </motion.div>
  )
}

// Tier-scaled chest-open effect: mote spray (count scales with tier), rotating
// rays from tier 2, a second shock ring at tier 4-5. Deterministic. Sits
// absolutely inside the chest box.
function ChestOpenFx({ tier, color }: { tier: number; color: string }) {
  const count = tier * 4
  const motes = Array.from({ length: count }, (_, n) => {
    const ang = (Math.PI * 2 * n) / count + (n % 2) * 0.32
    const dist = 64 + (n % 4) * 18
    return { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, size: 3 + (n % 3), dur: 0.6 + (n % 4) * 0.1, delay: (n % 3) * 0.04 }
  })
  return (
    <>
      {tier >= 2 && (
        <motion.div aria-hidden initial={{ opacity: 0, scale: 0.5, rotate: 0 }} animate={{ opacity: [0, Math.min(0.7, 0.32 + tier * 0.09), 0], scale: 1.5, rotate: 80 }} transition={{ duration: 1.1, ease: 'easeOut' }}
          style={{ position: 'absolute', inset: -34, borderRadius: '50%', pointerEvents: 'none', mixBlendMode: 'screen', background: `conic-gradient(from 0deg, ${color}00, ${color}66, ${color}00, ${color}66, ${color}00, ${color}66, ${color}00${tier >= 4 ? `, ${color}66, ${color}00, ${color}66, ${color}00` : ''})` }} />
      )}
      {motes.map((m, n) => (
        <motion.div key={n} aria-hidden initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} animate={{ x: m.x, y: m.y, opacity: 0, scale: 0.3 }} transition={{ duration: m.dur, delay: m.delay, ease: 'easeOut' }}
          style={{ position: 'absolute', left: '50%', top: '50%', width: m.size, height: m.size, marginLeft: -m.size / 2, marginTop: -m.size / 2, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}`, pointerEvents: 'none' }} />
      ))}
      {tier >= 4 && (
        <motion.div aria-hidden initial={{ scale: 0.3, opacity: 0.85 }} animate={{ scale: 2.7, opacity: 0 }} transition={{ duration: 0.8, delay: 0.12, ease: 'easeOut' }}
          style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${color}`, boxShadow: `0 0 24px ${color}`, pointerEvents: 'none' }} />
      )}
    </>
  )
}

// How long the chest "reveals" before the haul starts ticking into the panel.
const REVEAL_DELAY = 850
// The wind-up beat before the crate bursts — it rattles + creaks, glow builds,
// so the crack lands as a payoff (mirrors the Gauntlet cash-out).
const ANTICIPATION_MS = 750

export default function RaidLootStage(props: Props) {
  const {
    boss, killGold, killXP, lootGems = 0,
    clearTimeMs, clearTimes,
    loot, slotFinal, itemIdxs = [], lootAmount, fortuneMult, lootFortuneMult = 1, clearBonusXp = 0,
    shipImageUrl,
    onClaim, claiming = false,
    crewXP = [],
  } = props

  const [opening, setOpening]   = useState(false)
  const [opened, setOpened]     = useState(false)
  const [counting, setCounting] = useState(false)

  const finalItem = loot[slotFinal]
  // Anything beyond the headline. A crate used to hold exactly one row, so this
  // is always empty until two uniques land in the same crate.
  const extraItems = itemIdxs.filter(i => i !== slotFinal).map(i => loot[i])
  const accent = RARITY_COLOR[finalItem.rarity]
  const tier = RARITY_TIER[finalItem.rarity] ?? 1
  const grand = tier >= 4
  const totalDoubloons = killGold + lootAmount

  // WHAT THE HEADLINE SAYS WHEN THE REEL LANDS ON COIN.
  //
  // The coin rows are labelled with fixed amounts ("+600", "+1,200") but the
  // crate's coin payout is a rolled range scaled by Fortune, so the two only
  // agreed by accident. The server settles the currency row now, which fixes
  // gems outright; for coin the honest thing to print is the figure actually
  // granted rather than the row's nominal one. Uniques and gem rows keep their
  // own labels, which are true.
  const headlineLabel = !isUniqueLoot(finalItem) && lootGems <= 0
    ? `+${lootAmount.toLocaleString()} ⟡`
    : finalItem.label
  const totalNavXp = killXP + clearBonusXp
  const crewGains = crewXP.filter(c => c.newXP > c.oldXP)

  // The loot artwork tile — image / skin preview / gem glyph — at a given size.
  function lootArt(item: RaidLootItem, size: number) {
    if (item.shipSkinId) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={getShipSkin(item.shipSkinId)?.imageByTier?.[4] ?? shipImageUrl} alt={item.label}
          style={{ width: size, height: size, objectFit: 'contain', objectPosition: 'bottom', filter: getShipSkin(item.shipSkinId)?.filter ?? 'none' }} />
      )
    }
    if (item.image) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={item.image} alt={item.label} style={{ width: size, height: size, objectFit: 'contain' }} />
    }
    if (item.emoji === GEM_GLYPH) {
      return (
        <span className="font-cinzel font-700" style={{ fontSize: size * 0.62, color: GEM_COLOR }}>
          {item.emoji}
        </span>
      )
    }
    return (
      <span style={{ fontSize: size * 0.62, color: RARITY_COLOR[item.rarity], display: 'flex' }}>
        <IconCrate size={Math.round(size * 0.62)} />
      </span>
    )
  }

  function open() {
    if (opening || opened) return
    // Beat 1 — the wind-up: the crate rattles + creaks as the lid strains.
    setOpening(true)
    vibrate([0, 10, 28, 14, 34, 18])
    playChestCreakSfx()
    window.setTimeout(() => {
      // Beat 2 — the crack: burst + open art + reward sting.
      setOpened(true)
      vibrate(grand ? [0, 40, 35, 70, 35, 95] : [0, 30, 55, 45])
      playChestSfx(grand)
      // Beat 3 — let the chest reveal first, THEN tick the haul into the panel.
      window.setTimeout(() => setCounting(true), REVEAL_DELAY)
    }, ANTICIPATION_MS)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: '#04080e', border: '2px solid #1f2e42', borderRadius: 18,
      overflow: 'hidden', maxWidth: 580, margin: '0 auto', flex: 1, minHeight: 0, width: '100%',
    }}>
      {/* Dark treasure-hold stage — the haul sits over a deep, glowing dark so
          the chest + reward pop (mirrors the Gauntlet cash-out's abyss). */}
      <div style={{
        // overflowX pinned off: overflowY:auto alone makes the browser compute
        // overflow-x to auto too, so any sub-pixel horizontal bleed (a glow, a
        // full-width child) would show a stray horizontal scrollbar here.
        position: 'relative', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch',
        background: `radial-gradient(ellipse 130% 80% at 50% 22%, ${accent}14 0%, #0a1626 42%, #04080e 100%)`,
      }}>
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 420, margin: '0 auto', padding: '1.3rem 1rem 1.5rem', textAlign: 'center' }}>
          {!opened ? (
            <>
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.3em', color: GOLD }}>
                You sank {boss.name}
              </p>
              <div style={{ position: 'relative', width: 188, height: 188, margin: '22px auto 6px' }}>
                <motion.div aria-hidden animate={{ opacity: [0.4, 0.8, 0.4], scale: [1, 1.07, 1] }} transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ position: 'absolute', inset: -10, borderRadius: '50%', background: `radial-gradient(circle, ${GOLD}26 0%, transparent 68%)` }} />
                {/* Building glow as the lid strains in the wind-up beat. */}
                {opening && (
                  <motion.div aria-hidden initial={{ opacity: 0, scale: 0.75 }} animate={{ opacity: [0, 0.9], scale: [0.75, 1.45] }} transition={{ duration: ANTICIPATION_MS / 1000, ease: 'easeIn' }}
                    style={{ position: 'absolute', inset: -20, borderRadius: '50%', background: `radial-gradient(circle, ${accent}77 0%, transparent 70%)`, pointerEvents: 'none' }} />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <motion.img src="/plunderclosed.png" alt="Plunder crate" loading="eager" decoding="async"
                  animate={opening
                    ? { x: [0, -4, 4, -4, 4, -3, 3, -2, 2, 0], rotate: [0, -2, 2, -2, 2, -1.5, 1.5, 0], scale: [1, 1.05, 1.04, 1.08, 1.12] }
                    : { y: [0, -6, 0] }}
                  transition={opening
                    ? { duration: ANTICIPATION_MS / 1000, ease: 'easeInOut' }
                    : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: `drop-shadow(0 8px 22px rgba(0,0,0,0.6)) drop-shadow(0 0 26px ${GOLD}33)` }} />
              </div>
              <p className="font-cinzel font-800" style={{ fontSize: '1.35rem', color: '#f3ead2', lineHeight: 1.1, marginTop: 4, textShadow: '0 0 22px rgba(240,192,64,0.3)' }}>
                A Plunder Crate
              </p>
              <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#9a948a', marginTop: 5 }}>
                It went down with the wreck. Crack it open and claim your spoils.
              </p>
            </>
          ) : (
            <>
              {/* Chest open + tier-scaled burst */}
              <div style={{ position: 'relative', width: 172, height: 172, margin: '14px auto 2px' }}>
                <motion.div aria-hidden initial={{ scale: 0.2, opacity: 0.85 }} animate={{ scale: 2.4 + tier * 0.4, opacity: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }}
                  style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle, ${accent}cc 0%, ${accent}33 35%, transparent 70%)` }} />
                <motion.div aria-hidden animate={{ opacity: [0.42, 0.82, 0.42], scale: [1, 1.07, 1] }} transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ position: 'absolute', inset: -10, borderRadius: '50%', background: `radial-gradient(circle, ${accent}2e 0%, transparent 68%)` }} />
                <ChestOpenFx tier={tier} color={accent} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <motion.img src="/plunderopen.png" alt="" loading="eager" decoding="async"
                  initial={{ scale: 0.55 }} animate={{ scale: [0.55, 1.16, 1] }} transition={{ duration: 0.5, ease: 'easeOut' }}
                  style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain', filter: `drop-shadow(0 8px 22px rgba(0,0,0,0.6)) drop-shadow(0 0 30px ${accent}66)` }} />
              </div>

              {/* The item — the headline drop, rising out with an overshoot pop */}
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
                className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.3em', color: accent }}>
                {RARITY_LABEL[finalItem.rarity] ?? finalItem.rarity} Find
              </motion.p>
              <motion.div initial={{ opacity: 0, scale: 0.4, y: 28 }} animate={{ opacity: 1, scale: [0.4, 1.14, 1], y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1.3, 0.4, 1] }}
                style={{ height: 92, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4, filter: `drop-shadow(0 4px 14px ${accent}66)` }}>
                {lootArt(finalItem, 86)}
              </motion.div>
              <motion.p initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 240, damping: 18 }}
                className="font-cinzel font-800" style={{ fontSize: '1.3rem', color: accent, lineHeight: 1.12, marginTop: 6, textShadow: `0 0 22px ${accent}44` }}>
                {headlineLabel}
              </motion.p>
              {/* THE REST OF THE CRATE. Independent rolls mean a second item
                  can land beside the headline, which the single-draw model
                  could not produce at all. Listed rather than given their own
                  reveal, so the big moment stays on one drop. */}
              {extraItems.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.4 }}
                  style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 10 }}>
                  {extraItems.map(it => {
                    const c = RARITY_COLOR[it.rarity]
                    return (
                      <span key={it.id} className="font-karla font-700" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '0.22rem 0.5rem 0.22rem 0.28rem', borderRadius: 999,
                        fontSize: '0.62rem', color: c,
                        background: `${c}1c`, border: `1px solid ${c}66`,
                      }}>
                        <span style={{ display: 'inline-flex', width: 18, height: 18 }}>{lootArt(it, 18)}</span>
                        {it.label}
                      </span>
                    )
                  })}
                </motion.div>
              )}

              {(fortuneMult > 1 || lootFortuneMult > 1) && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                  className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#f0c040aa', marginTop: 4 }}>
                  {lootFortuneMult > 1 && `${lootFortuneMult.toFixed(2)}× drop odds`}
                  {lootFortuneMult > 1 && fortuneMult > 1 && ' · '}
                  {fortuneMult > 1 && `${fortuneMult.toFixed(2)}× doubloons`}
                </motion.p>
              )}

              {/* Reward lines — count up into the panel a beat after the reveal */}
              <div style={{ marginTop: 16, textAlign: 'left', background: 'rgba(0,0,0,0.3)', border: `1px solid ${GOLD}26`, borderRadius: 14, padding: '0.5rem 0.85rem 0.7rem' }}>
                <RewardLine label="Doubloons" to={totalDoubloons} suffix=" ⟡" color={GOLD} delay={0.2} run={counting} />
                {/* Only when the crate's currency row was a gem row. Its own
                    line rather than folded into the coin one: they are different
                    currencies, and the row pays one or the other. */}
                {lootGems > 0 && (
                  <RewardLine label="Gems" to={lootGems} suffix=" ◆" color="#c084fc" delay={0.26} run={counting} />
                )}
                <RewardLine label="Nav XP" to={totalNavXp} color="#4ade80" delay={0.32} run={counting} />
              </div>

              {/* Clear time — this run vs your best vs the global record */}
              {clearTimeMs != null && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44, duration: 0.35 }}
                  style={{ marginTop: 12, textAlign: 'left', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(125,211,252,0.3)', borderRadius: 14, padding: '0.5rem 0.85rem 0.6rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#7dd3fc' }}>Clear Time</span>
                    {clearTimes?.isGlobalBest ? (
                      <span className="font-karla font-800 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#1a1205', background: 'linear-gradient(90deg,#ffe08a,#f0c040)', borderRadius: 999, padding: '0.14rem 0.5rem' }}>World Record!</span>
                    ) : clearTimes?.isPersonalBest ? (
                      <span className="font-karla font-800 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#7dd3fc', border: '1px solid rgba(125,211,252,0.55)', borderRadius: 999, padding: '0.12rem 0.5rem' }}>New Best!</span>
                    ) : null}
                  </div>
                  <TimeRow label="This run" value={fmtTime(clearTimeMs)} accent="#bfe6ff" strong />
                  {clearTimes && (
                    <>
                      <TimeRow label="Your best" value={fmtTime(clearTimes.yourBestMs)} />
                      <TimeRow label="Global best" value={clearTimes.globalBestMs != null ? `${fmtTime(clearTimes.globalBestMs)}${clearTimes.globalBestUsername ? ` · ${clearTimes.globalBestUsername}` : ''}` : '—'} accent={GOLD} />
                    </>
                  )}
                </motion.div>
              )}

              {/* Crew XP — the end-of-mission "who grew" beat */}
              {crewGains.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.35 }}
                  style={{ marginTop: 12, textAlign: 'left', background: 'rgba(232,200,121,0.08)', border: '1px solid rgba(232,200,121,0.32)', borderRadius: 14, padding: '0.55rem 0.85rem 0.65rem' }}>
                  <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#e8c879', marginBottom: 4 }}>Crew earned XP</p>
                  {crewGains.map(c => {
                    const delta = c.newXP - c.oldXP
                    return (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '0.25rem 0' }}>
                        <span className="font-cinzel font-700" style={{ fontSize: '0.84rem', color: '#f3ede2', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                        <span className="font-karla font-700" style={{ fontSize: '0.78rem', color: GOLD, flexShrink: 0, whiteSpace: 'nowrap' }}>
                          +{delta.toLocaleString()} XP
                          {c.newLevel > c.oldLevel && <span style={{ color: '#7fd49a' }}> · Lv {c.oldLevel} → {c.newLevel}</span>}
                        </span>
                      </div>
                    )
                  })}
                </motion.div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Pinned action footer — always reachable without scrolling past the
          haul + crew-XP list (which can run long with a full crew). */}
      <div style={{ flexShrink: 0, padding: '0.6rem 0.85rem', borderTop: '1px solid #1f2e42', background: '#04080e' }}>
        {!opened ? (
          <button onClick={open} disabled={opening} className="font-cinzel font-800 uppercase tracking-[0.08em] tap"
            style={{ width: '100%', padding: '0.95rem', borderRadius: 13, fontSize: '1rem', color: GOLD, background: `linear-gradient(180deg, ${GOLD}26, ${GOLD}0f)`, border: `1px solid ${GOLD}66`, cursor: opening ? 'default' : 'pointer', opacity: opening ? 0.55 : 1, boxShadow: `0 0 20px ${GOLD}1f` }}>
            {opening ? 'Prising It Open…' : 'Crack It Open'}
          </button>
        ) : (
          <button onPointerDown={() => { if (!claiming) onClaim() }} disabled={claiming}
            className="font-cinzel font-700 uppercase tracking-[0.1em] tap"
            style={{ width: '100%', padding: '0.95rem', borderRadius: 13, fontSize: '0.9rem', color: GOLD, background: `linear-gradient(180deg, ${GOLD}1e, ${GOLD}08)`, border: `1px solid ${GOLD}55`, cursor: claiming ? 'default' : 'pointer', opacity: claiming ? 0.6 : 1 }}>
            {claiming ? 'Saving…' : 'Return to Port'}
          </button>
        )}
      </div>
    </div>
  )
}
