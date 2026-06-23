'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { type BroadsideEnemy, type RaidLootItem, RARITY_COLOR, GEM_GLYPH, GEM_COLOR } from '@/lib/bossRaids'
import { getShipSkin } from '@/lib/shipSkins'
import { vibrate } from '@/lib/haptics'
import { playChestSfx } from '@/lib/fishingMusic'

const GOLD = '#f0c040'

interface Props {
  /** The boss that was just defeated — used for kill narration only. */
  boss: BroadsideEnemy
  /** Doubloons + XP earned from the kill itself. Streamed into the log on
   *  mount so the loot screen reads as a continuation of the fight. */
  killGold: number
  killXP: number
  /** Pre-rolled loot pick + display amount (computed in RaidGame). The reveal
   *  shows this entry directly — no slot spin. */
  loot: RaidLootItem[]
  slotFinal: number
  lootAmount: number
  fortuneMult: number
  /** Full-raid-clear bonus Nav XP — folded into the Plunder log instead of a
   *  layout-shifting banner. Undefined / 0 when this isn't the final boss. */
  clearBonusXp?: number
  /** Player nameplate fields — mirror what RaidCombat shows in the
   *  bottom-right HP box so the screen feels like the same scene. */
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
  /** Whether the parent is currently saving the claim. Disables the button
   *  and shows a "Saving…" label. */
  claiming?: boolean
  /** Per-crew XP accumulated across THE ENTIRE RAID (not just the boss kill). */
  crewXP?: { id: number; name: string; oldXP: number; newXP: number; oldLevel: number; newLevel: number }[]
}

type Phase = 'pending' | 'opening' | 'revealed'

const RARITY_LABEL: Record<string, string> = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary',
}

function fmtGold(n: number): string {
  return n.toLocaleString()
}

export default function RaidLootStage(props: Props) {
  const {
    boss, killGold, killXP,
    loot, slotFinal, lootAmount, fortuneMult, clearBonusXp = 0,
    shipImageUrl, shipFilter,
    onClaim, claiming = false,
    crewXP = [],
  } = props

  const [phase, setPhase]       = useState<Phase>('pending')
  // `burst` flips ~300ms into 'opening', after the crate's anticipation rattle,
  // and is what actually fires the lid-pop flash + reward reveal.
  const [burst, setBurst]       = useState(false)
  const [logLines, setLogLines] = useState<string[]>([])
  // Strict-mode double-mount would otherwise double the narration.
  const mountedRef = useRef(false)

  const finalItem = loot[slotFinal]
  const accent = RARITY_COLOR[finalItem.rarity]
  const grand = finalItem.rarity === 'epic' || finalItem.rarity === 'legendary'

  // ─── Initial kill narration ────────────────────────────────────────────────
  useEffect(() => {
    if (mountedRef.current) return
    mountedRef.current = true
    const lines: string[] = [
      `You sank ${boss.name}!`,
      `Plunder: +${fmtGold(killGold)} ⟡`,
      `Nav XP: +${killXP}`,
    ]
    if (clearBonusXp > 0) lines.push(`Full raid clear bonus: +${fmtGold(clearBonusXp)} Nav XP`)
    for (const c of crewXP) {
      const delta = c.newXP - c.oldXP
      if (delta <= 0) continue
      lines.push(
        c.newLevel > c.oldLevel
          ? `${c.name} +${delta.toLocaleString()} XP · Lv ${c.oldLevel} → ${c.newLevel}`
          : `${c.name} +${delta.toLocaleString()} XP`,
      )
    }
    lines.push(`${boss.name} dropped a plunder crate.`)
    lines.forEach((line, i) => {
      setTimeout(() => setLogLines(prev => [...prev, line]), i * 320)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boss.name, killGold, killXP])

  // ─── On open: anticipation rattle → lid-pop burst → narrate → unlock ───────
  useEffect(() => {
    if (phase !== 'opening') return
    vibrate(14)                                  // the crate strains
    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(setTimeout(() => {
      // The lid pops — the payoff beat: sound, a heavy haptic, the burst.
      setBurst(true)
      playChestSfx(grand)
      vibrate([0, 45, 35, 75])
      setLogLines(prev => [...prev, `You crack the crate open…`])
    }, 300))
    timers.push(setTimeout(() => setLogLines(prev => [...prev, `You found: ${finalItem.label}!`]), 850))
    timers.push(setTimeout(() => setLogLines(prev => [...prev, `Plunder claimed: +${fmtGold(lootAmount)} ⟡`]), 1550))
    timers.push(setTimeout(() => setPhase('revealed'), 1850))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Keep the Plunder log pinned to its newest line as entries stream in.
  const logScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = logScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logLines])

  // A handful of burst motes thrown out of the chest on open. Static angles
  // (deterministic) so the reveal looks the same every time.
  const motes = useMemo(() => Array.from({ length: 12 }, (_, n) => {
    const ang = (Math.PI * 2 * n) / 12
    return { x: Math.cos(ang) * (52 + (n % 3) * 14), y: Math.sin(ang) * (52 + (n % 3) * 14) - 10, size: 4 + (n % 3), dur: 0.55 + (n % 4) * 0.08 }
  }), [])

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
    return (
      <span className={item.emoji === GEM_GLYPH ? 'font-cinzel font-700' : undefined} style={{ fontSize: size * 0.62, color: item.emoji === GEM_GLYPH ? GEM_COLOR : undefined }}>
        {item.emoji}
      </span>
    )
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: '#04080e',
      border: '2px solid #2a3548',
      borderRadius: 18,
      overflow: 'hidden',
      maxWidth: 580, margin: '0 auto',
      flex: 1, minHeight: 0,
      width: '100%',
    }}>
      {/* ── Stage area ─────────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        flex: 1,
        minHeight: 320,
        background: 'linear-gradient(180deg, #1e3a5f 0%, #234567 30%, #2a5274 40%, #0a1c2e 100%)',
        overflow: 'hidden',
      }}>
        {/* Sun */}
        <div className="raid-sun" aria-hidden style={{
          position: 'absolute', top: '6%', right: '13%', width: 56, height: 56, borderRadius: '50%',
          background: 'radial-gradient(circle at 50% 50%, rgba(255,250,225,0.70) 0%, rgba(255,230,170,0.40) 28%, rgba(255,210,140,0.15) 55%, transparent 90%)',
          filter: 'blur(1.5px)', pointerEvents: 'none',
        }} />
        {/* Clouds */}
        <div aria-hidden style={{ position: 'absolute', top: '6%',  left: 0, right: 0, height: 36, pointerEvents: 'none' }}>
          <div className="raid-cloud-slow" style={{ width: 120, height: 28, borderRadius: 14, background: 'radial-gradient(ellipse at 50% 60%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0) 75%)', filter: 'blur(1px)' }} />
        </div>
        <div aria-hidden style={{ position: 'absolute', top: '15%', left: 0, right: 0, height: 28, pointerEvents: 'none' }}>
          <div className="raid-cloud-mid"  style={{ width: 88, height: 22, borderRadius: 11, background: 'radial-gradient(ellipse at 50% 60%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0) 75%)', filter: 'blur(0.8px)' }} />
        </div>
        {/* Horizon */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: '38%', height: 1, background: 'rgba(255,255,255,0.12)', boxShadow: '0 0 24px rgba(140,180,210,0.18)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: '38%', bottom: 0, background: 'linear-gradient(180deg, rgba(20,40,60,0.4) 0%, rgba(8,16,28,0.85) 100%)' }} />

        {/* ── Chest + reveal — bottom-anchored so the crate sits low and the
            reward rises UP out of it. One coherent stack: the crate never moves
            or resizes, and the loot clearly comes from the chest you tapped. ── */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '9%', overflow: 'hidden' }}>
          {/* Lid-pop flash — a beat of rarity colour across the whole stage */}
          {burst && (
            <motion.div aria-hidden initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.55, ease: 'easeOut' }}
              style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 62%, ${accent}66 0%, ${accent}1c 40%, transparent 64%)`, pointerEvents: 'none', zIndex: 1 }} />
          )}

          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Light beam up out of the crate, behind the reward */}
            {burst && (
              <motion.div aria-hidden initial={{ opacity: 0, scaleY: 0.2 }} animate={{ opacity: [0, 0.75, 0], scaleY: 1 }} transition={{ duration: 0.85, ease: 'easeOut', times: [0, 0.25, 1] }}
                style={{ position: 'absolute', bottom: 60, left: '50%', width: 84, height: 200, marginLeft: -42, transformOrigin: 'bottom center', background: `linear-gradient(to top, ${accent}, ${accent}40 45%, transparent)`, filter: 'blur(8px)', mixBlendMode: 'screen', pointerEvents: 'none', zIndex: 0 }} />
            )}

            {/* Burst motes flung up out of the crate mouth */}
            {burst && motes.map((m, n) => (
              <motion.div key={n} aria-hidden
                initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                animate={{ opacity: 0, x: m.x, y: m.y - 24, scale: 0.3 }}
                transition={{ duration: m.dur, ease: 'easeOut' }}
                style={{ position: 'absolute', bottom: 90, left: '50%', marginLeft: -(m.size / 2), width: m.size, height: m.size, borderRadius: '50%', background: accent, boxShadow: `0 0 6px ${accent}`, pointerEvents: 'none', zIndex: 1 }} />
            ))}

            {/* Reward — rises up out of the crate, its base tucked into the open
                mouth (negative margin) so it reads as a real drop. */}
            {burst && (
              <motion.div
                initial={{ opacity: 0, scale: 0.4, y: 42 }}
                animate={{ opacity: 1, scale: [0.4, 1.14, 1], y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1.3, 0.4, 1] }}
                style={{ position: 'relative', zIndex: 3, marginBottom: -18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '0.55rem 1.15rem 0.65rem', borderRadius: 16, background: `linear-gradient(180deg, ${accent}28 0%, ${accent}0c 100%)`, border: `1.5px solid ${accent}`, boxShadow: `0 0 30px ${accent}66, 0 8px 24px rgba(0,0,0,0.55)`, minWidth: 168 }}
              >
                <span className="font-karla font-700 uppercase tracking-[0.2em]" style={{ fontSize: '0.5rem', color: accent }}>{RARITY_LABEL[finalItem.rarity] ?? finalItem.rarity}</span>
                <div style={{ height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: `drop-shadow(0 4px 12px ${accent}66)` }}>{lootArt(finalItem, 68)}</div>
                <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f3ede2', textAlign: 'center', lineHeight: 1.15 }}>{finalItem.label}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 4, paddingTop: 6, borderTop: `1px solid ${accent}33`, width: '100%' }}>
                  <span className="font-cinzel font-800" style={{ fontSize: '0.9rem', color: GOLD }}>+{fmtGold(lootAmount)} ⟡</span>
                  {fortuneMult > 1 && <span className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.48rem', color: '#f0c040aa' }}>{fortuneMult.toFixed(2)}× luck</span>}
                </div>
              </motion.div>
            )}

            {/* The crate — one spot + size, closed → open in place (never teleports) */}
            <div style={{ position: 'relative', zIndex: 2, width: 138, height: 138, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {!burst ? (
                // eslint-disable-next-line @next/next/no-img-element
                <motion.img src="/plunderclosed.png" alt="Plunder crate"
                  animate={phase === 'opening' ? { x: [0, -3, 3, -3, 3, -2, 2, 0], rotate: [0, -2, 2, -2, 2, -1, 1, 0], scale: [1, 1.04, 1.06] } : { y: [0, -6, 0] }}
                  transition={phase === 'opening' ? { duration: 0.32, ease: 'easeInOut' } : { y: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } }}
                  style={{ width: 138, height: 138, objectFit: 'contain', filter: phase === 'opening' ? `drop-shadow(0 0 26px ${accent}cc) drop-shadow(0 6px 14px rgba(240,192,64,0.4))` : 'drop-shadow(0 6px 14px rgba(240,192,64,0.35)) drop-shadow(0 0 28px rgba(240,192,64,0.18))' }} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <motion.img src="/plunderopen.png" alt=""
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18 }}
                  style={{ width: 138, height: 138, objectFit: 'contain', filter: `drop-shadow(0 0 20px ${accent}aa) drop-shadow(0 6px 12px rgba(0,0,0,0.45))` }} />
              )}
            </div>

            {/* Tap hint (pending only) */}
            {phase === 'pending' && (
              <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.56rem', color: '#f0c040bb', marginTop: 6 }}>Tap to open</p>
            )}
          </div>
        </div>

        {/* Decorative ship in the lower-left (matches the battle framing) */}
        <div style={{ position: 'absolute', bottom: '8%', left: '6%', width: 90, opacity: 0.85, filter: shipFilter ?? 'none', pointerEvents: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shipImageUrl} alt="" style={{ width: '100%', display: 'block' }} />
        </div>
      </div>

      {/* ── Plunder log — fixed height, internal scroll. Carries ALL the
          rewards info (kill gold/XP, full-clear bonus, crew XP). ──────────── */}
      <div style={{ padding: '0.85rem 0.85rem 0' }}>
        <div style={{ background: '#04080e', border: '1px solid #1f2e42', borderRadius: 12, padding: '0.65rem 0.85rem', height: 150, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, flexShrink: 0 }}>
            <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.65rem', color: '#5a7a9a' }}>Plunder</p>
          </div>
          <div ref={logScrollRef} className="scrollbar-hide" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {logLines.map((line, i) => (
              <motion.p
                key={`${i}-${line}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="font-karla"
                style={{ fontSize: '0.84rem', color: '#d0d8e4', lineHeight: 1.5 }}
              >
                {line}
              </motion.p>
            ))}
          </div>
        </div>
      </div>

      {/* ── Action button — Open Chest → Return to Port ───────────────────── */}
      <div style={{ padding: '0.85rem' }}>
        {phase === 'revealed' ? (
          <motion.button
            key="claim"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            onPointerDown={() => { if (!claiming) onClaim() }}
            whileTap={{ scale: claiming ? 1 : 0.97 }}
            disabled={claiming}
            className="font-cinzel font-700 uppercase tracking-[0.12em]"
            style={ctaStyle(claiming ? 0.6 : 1)}
          >
            {claiming ? 'Saving…' : 'Return to Port'}
          </motion.button>
        ) : (
          <motion.button
            key="loot"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            onPointerDown={() => { if (phase === 'pending') setPhase('opening') }}
            whileTap={{ scale: phase === 'pending' ? 0.97 : 1 }}
            disabled={phase !== 'pending'}
            className="font-cinzel font-700 uppercase tracking-[0.12em]"
            style={ctaStyle(phase === 'pending' ? 1 : 0.55)}
          >
            {phase === 'pending' ? 'Open Chest' : 'Opening…'}
          </motion.button>
        )}
      </div>
    </div>
  )
}

function ctaStyle(opacity: number): React.CSSProperties {
  return {
    width: '100%', padding: '14px 0', borderRadius: 12,
    cursor: opacity === 1 ? 'pointer' : 'default',
    background: 'linear-gradient(180deg, rgba(240,192,64,0.18) 0%, rgba(240,192,64,0.06) 100%)',
    border: '1px solid rgba(240,192,64,0.45)',
    borderTop: '1px solid rgba(240,192,64,0.70)',
    color: GOLD, fontSize: '0.85rem',
    boxShadow: opacity === 1 ? '0 0 18px rgba(240,192,64,0.16)' : 'none',
    opacity,
  }
}
