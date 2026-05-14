'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import { type BroadsideEnemy, type RaidLootItem, RARITY_COLOR } from '@/lib/bossRaids'
import { getShipSkin } from '@/lib/shipSkins'

interface Props {
  /** The boss that was just defeated — used for kill narration only. */
  boss: BroadsideEnemy
  /** Doubloons + XP earned from the kill itself. Streamed into the log on
   *  mount so the loot screen reads as a continuation of the fight. */
  killGold: number
  killXP: number
  /** Pre-rolled loot pick + display amount (computed in RaidGame). The slot
   *  spin lands on this entry's index. */
  loot: RaidLootItem[]
  slotFinal: number
  lootAmount: number
  fortuneMult: number
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
}

type Phase = 'pending' | 'spinning' | 'landed' | 'revealed'

function fmtGold(n: number): string {
  return n.toLocaleString()
}

export default function RaidLootStage(props: Props) {
  const {
    boss, killGold, killXP,
    loot, slotFinal, lootAmount, fortuneMult,
    shipImageUrl, shipFilter, shipName, playerLabel,
    playerCharacterColor, playerEquippedHat, playerAvatarBg, playerAvatarBorder,
    playerHpMax, playerHp,
    onClaim, claiming = false,
  } = props

  const [phase, setPhase]               = useState<Phase>('pending')
  const [logLines, setLogLines]         = useState<string[]>([])
  const [slotDisplay, setSlotDisplay]   = useState(0)
  // Track if we've already pushed kill narration. Strict-mode double-mount
  // would otherwise double the lines.
  const mountedRef = useRef(false)

  // ─── Initial kill narration ────────────────────────────────────────────────
  // Mirrors the lines RaidCombat would have streamed before unmounting.
  useEffect(() => {
    if (mountedRef.current) return
    mountedRef.current = true
    const lines: string[] = [
      `You sank ${boss.name}!`,
      `Plunder: +${fmtGold(killGold)} ⟡`,
      `Nav XP: +${killXP}`,
      `${boss.name} dropped a plunder crate.`,
    ]
    lines.forEach((line, i) => {
      setTimeout(() => setLogLines(prev => [...prev, line]), i * 320)
    })
  }, [boss.name, killGold, killXP])

  // ─── Slot machine tick ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'spinning') return
    let cancelled = false
    let i = 0
    const total = 22 + (slotFinal % loot.length)  // ~3.5s of ticks
    const tick = () => {
      if (cancelled) return
      i++
      // Decelerating intervals — fast then slow, lands on slotFinal
      const remaining = total - i
      const interval = remaining > 12 ? 60 : remaining > 6 ? 110 : remaining > 2 ? 200 : 320
      setSlotDisplay(prev => (prev + 1) % loot.length)
      if (i >= total) {
        setSlotDisplay(slotFinal)
        setPhase('landed')
        return
      }
      setTimeout(tick, interval)
    }
    setTimeout(tick, 60)
    return () => { cancelled = true }
  }, [phase, slotFinal, loot.length])

  // ─── After slot lands: visual hold, then narrate loot, then reveal ─────────
  useEffect(() => {
    if (phase !== 'landed') return
    const item = loot[slotFinal]
    // Narration timeline:
    //   0ms     — "Opened the chest…"
    //  500ms    — "You found: <item.label>!"
    // 1500ms    — "+X doubloons!"
    // 2200ms    — phase → 'revealed' (action panel switches to Return to Port)
    setTimeout(() => setLogLines(prev => [...prev, `Opened the chest…`]), 0)
    setTimeout(() => setLogLines(prev => [...prev, `You found: ${item.label}!`]), 500)
    setTimeout(() => setLogLines(prev => [...prev, `Plunder claimed: +${fmtGold(lootAmount)} ⟡`]), 1500)
    setTimeout(() => setPhase('revealed'), 2200)
  }, [phase, slotFinal, loot, lootAmount])

  const slotItem = loot[slotDisplay]
  const finalItem = loot[slotFinal]
  const landedColor = RARITY_COLOR[finalItem.rarity]
  const showLandedItem = phase === 'landed' || phase === 'revealed'

  const playerHpPct = playerHpMax > 0 ? Math.max(0, Math.round((playerHp / playerHpMax) * 100)) : 0

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
      {/* ── Stage area — same shape as RaidCombat's battle stage but with
          chest content in the middle ───────────────────────────────────── */}
      <div style={{
        position: 'relative',
        flex: 1,
        minHeight: 320,
        background: 'linear-gradient(180deg, #1e3a5f 0%, #234567 30%, #2a5274 40%, #0a1c2e 100%)',
        overflow: 'hidden',
      }}>
        {/* Sun */}
        <div
          className="raid-sun"
          aria-hidden
          style={{
            position: 'absolute', top: '6%', right: '13%',
            width: 56, height: 56, borderRadius: '50%',
            background: 'radial-gradient(circle at 50% 50%, rgba(255,250,225,0.70) 0%, rgba(255,230,170,0.40) 28%, rgba(255,210,140,0.15) 55%, transparent 90%)',
            filter: 'blur(1.5px)',
            pointerEvents: 'none',
          }}
        />
        {/* Clouds */}
        <div aria-hidden style={{ position: 'absolute', top: '6%',  left: 0, right: 0, height: 36, pointerEvents: 'none' }}>
          <div className="raid-cloud-slow" style={{ width: 120, height: 28, borderRadius: 14, background: 'radial-gradient(ellipse at 50% 60%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0) 75%)', filter: 'blur(1px)' }} />
        </div>
        <div aria-hidden style={{ position: 'absolute', top: '15%', left: 0, right: 0, height: 28, pointerEvents: 'none' }}>
          <div className="raid-cloud-mid"  style={{ width: 88, height: 22, borderRadius: 11, background: 'radial-gradient(ellipse at 50% 60%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0) 75%)', filter: 'blur(0.8px)' }} />
        </div>
        <div aria-hidden style={{ position: 'absolute', top: '22%', left: 0, right: 0, height: 22, pointerEvents: 'none' }}>
          <div className="raid-cloud-fast" style={{ width: 64, height: 18, borderRadius: 9,  background: 'radial-gradient(ellipse at 50% 60%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0) 75%)', filter: 'blur(0.8px)' }} />
        </div>
        {/* Horizon */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '38%', height: 1,
          background: 'rgba(255,255,255,0.12)', boxShadow: '0 0 24px rgba(140,180,210,0.18)',
        }} />
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '38%', bottom: 0,
          background: 'linear-gradient(180deg, rgba(20,40,60,0.4) 0%, rgba(8,16,28,0.85) 100%)',
        }} />
        {/* Sun reflection on water */}
        <div
          aria-hidden
          style={{
            position: 'absolute', top: '38%', right: '8%',
            width: 110, height: '32%',
            background: 'radial-gradient(ellipse at 50% 0%, rgba(255,235,180,0.22) 0%, rgba(255,225,160,0.10) 40%, transparent 75%)',
            mixBlendMode: 'screen',
            pointerEvents: 'none',
            filter: 'blur(3px)',
          }}
        />

        {/* ── Chest / loot reel — centered in stage area ─────────────── */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 10, padding: '1rem',
        }}>
          {/* Pre-reveal: closed chest with idle bob */}
          {phase === 'pending' && (
            <motion.div
              key="chest-closed"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: [0, -6, 0] }}
              transition={{ opacity: { duration: 0.4 }, y: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/plunderclosed.png" alt="Plunder crate" style={{
                width: 150, height: 150, objectFit: 'contain',
                filter: 'drop-shadow(0 6px 14px rgba(240,192,64,0.35)) drop-shadow(0 0 28px rgba(240,192,64,0.18))',
              }} />
            </motion.div>
          )}

          {/* Spinning: open chest + spinning slot above */}
          {(phase === 'spinning' || phase === 'landed' || phase === 'revealed') && (
            <>
              <motion.div
                key="slot"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={
                  showLandedItem
                    ? { opacity: 1, scale: [0.9, 1.32, 0.95, 1.08, 1] }
                    : { opacity: 1, scale: 1 }
                }
                transition={{ duration: showLandedItem ? 0.65 : 0.2, ease: 'easeOut' }}
                style={{
                  width: 140, height: 156,
                  border: `2px solid ${showLandedItem ? landedColor : 'rgba(255,255,255,0.16)'}`,
                  borderRadius: 18,
                  background: showLandedItem ? `${landedColor}1a` : 'rgba(0,0,0,0.42)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                  overflow: 'hidden',
                  boxShadow: showLandedItem ? `0 0 30px ${landedColor}55` : 'none',
                  transition: 'border-color 0.2s, background 0.2s',
                }}
              >
                {slotItem.shipSkinId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shipImageUrl}
                    alt={slotItem.label}
                    style={{
                      width: 80, height: 80, objectFit: 'contain', objectPosition: 'bottom',
                      filter: !showLandedItem ? 'blur(1.5px) brightness(0.3)' : getShipSkin(slotItem.shipSkinId)?.filter ?? 'none',
                      transition: 'filter 0.15s',
                    }}
                  />
                ) : slotItem.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={slotItem.image}
                    alt={slotItem.label}
                    style={{
                      width: 80, height: 80, objectFit: 'contain',
                      filter: !showLandedItem ? 'blur(1.5px) brightness(0.6)' : 'none',
                      transition: 'filter 0.15s',
                    }}
                  />
                ) : (
                  <span style={{
                    fontSize: '3rem',
                    filter: !showLandedItem ? 'blur(1.5px) brightness(0.6)' : 'none',
                    transition: 'filter 0.15s',
                  }}>
                    {slotItem.emoji}
                  </span>
                )}
                <p
                  className="font-karla font-700"
                  style={{
                    fontSize: '0.78rem',
                    color: showLandedItem ? landedColor : 'transparent',
                    textAlign: 'center', lineHeight: 1.2,
                    transition: 'color 0.2s',
                  }}
                >
                  {slotItem.label}
                </p>
              </motion.div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/plunderopen.png" alt="" style={{
                width: 88, height: 88, objectFit: 'contain',
                filter: 'drop-shadow(0 4px 10px rgba(240,192,64,0.25))',
              }} />
              {phase === 'revealed' && fortuneMult > 1 && (
                <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.55rem', color: '#f0c040cc' }}>
                  {fortuneMult.toFixed(2)}× luck applied
                </p>
              )}
            </>
          )}
        </div>

        {/* ── Player nameplate (bottom-right, mirrors RaidCombat) ─────── */}
        <div style={{
          position: 'absolute', bottom: 10, right: 10, zIndex: 4,
          padding: '0.45rem 0.6rem 0.5rem 0.45rem',
          background: 'rgba(6,12,20,0.9)',
          border: '1px solid #2a3548',
          borderRadius: 12,
          minWidth: 160,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <CharacterAvatar
            characterColor={playerCharacterColor ?? null}
            equippedHat={playerEquippedHat ?? null}
            bgColor={playerAvatarBg ?? undefined}
            ringColor={playerAvatarBorder ?? undefined}
            size={50}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.72rem', color: '#e0ddd8' }}>
              {playerLabel || shipName}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
              <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${playerHpPct}%`, background: '#60a5fa', borderRadius: 3 }} />
              </div>
              <p className="font-karla font-700" style={{ fontSize: '0.58rem', color: '#9aaecc' }}>{playerHp}/{playerHpMax}</p>
            </div>
          </div>
        </div>

        {/* Decorative ship in the lower-left (just to match the framing) */}
        <div style={{ position: 'absolute', bottom: '8%', left: '6%', width: 90, opacity: 0.85, filter: shipFilter ?? 'none', pointerEvents: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shipImageUrl} alt="" style={{ width: '100%', display: 'block' }} />
        </div>
      </div>

      {/* ── Log box — same shape as RaidCombat's ────────────────────── */}
      <div style={{ padding: '0.85rem 0.85rem 0' }}>
        <div style={{
          background: '#04080e',
          border: '1px solid #1f2e42',
          borderRadius: 12,
          padding: '0.65rem 0.85rem',
          minHeight: 138,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.65rem', color: '#5a7a9a' }}>
              Plunder
            </p>
          </div>
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

      {/* ── Action panel — single button that swaps Loot Chest → Return to Port ── */}
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
            style={{
              width: '100%',
              padding: '14px 0',
              borderRadius: 12,
              cursor: claiming ? 'default' : 'pointer',
              background: 'linear-gradient(180deg, rgba(240,192,64,0.18) 0%, rgba(240,192,64,0.06) 100%)',
              border: '1px solid rgba(240,192,64,0.45)',
              borderTop: '1px solid rgba(240,192,64,0.70)',
              color: '#f0c040',
              fontSize: '0.85rem',
              boxShadow: '0 0 18px rgba(240,192,64,0.16)',
              opacity: claiming ? 0.6 : 1,
            }}
          >
            {claiming ? 'Saving…' : 'Return to Port'}
          </motion.button>
        ) : (
          <motion.button
            key="loot"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            onPointerDown={() => { if (phase === 'pending') setPhase('spinning') }}
            whileTap={{ scale: phase === 'pending' ? 0.97 : 1 }}
            disabled={phase !== 'pending'}
            className="font-cinzel font-700 uppercase tracking-[0.12em]"
            style={{
              width: '100%',
              padding: '14px 0',
              borderRadius: 12,
              cursor: phase === 'pending' ? 'pointer' : 'default',
              background: 'linear-gradient(180deg, rgba(240,192,64,0.18) 0%, rgba(240,192,64,0.06) 100%)',
              border: '1px solid rgba(240,192,64,0.45)',
              borderTop: '1px solid rgba(240,192,64,0.70)',
              color: '#f0c040',
              fontSize: '0.85rem',
              boxShadow: phase === 'pending' ? '0 0 18px rgba(240,192,64,0.16)' : 'none',
              opacity: phase === 'pending' ? 1 : 0.55,
            }}
          >
            {phase === 'pending' ? 'Loot Chest' : 'Opening…'}
          </motion.button>
        )}
      </div>
    </div>
  )
}
