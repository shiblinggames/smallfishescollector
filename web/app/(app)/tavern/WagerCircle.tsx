'use client'

// Wager-circle UI used on blackjack's wager-and-deal screens. Mirrors a
// casino felt: a circular bet area in the middle, the chip rack at the
// bottom. Tap a chip in the rack and a clone "flies" from the rack into
// the circle; the circle's wager total updates simultaneously. Clear
// resets the wager to zero and the chip pile disappears.
//
// The flight animation uses live DOM rects (getBoundingClientRect)
// because the rack and circle live in different parts of the layout
// tree — we can't share a coordinate space via framer's `layoutId`
// across siblings reliably across phase transitions.

import { useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ChipDisc, { CHIP_COLORS, pickChipColor } from './ChipDisc'

const ACCENT = '#f0c040'

interface FlyingChip {
  id: number
  denom: number
  fromX: number
  fromY: number
  toX: number
  toY: number
}

export interface WagerCircleProps {
  wager: number
  presets: readonly number[]
  /** Player's chip balance — chips that would exceed it are disabled. */
  chipsLeft: number
  /** Per-hand cap; chips that would push wager above this are disabled. */
  maxBet: number
  /** Minimum wager — bottom-row CTA stays disabled until reached. */
  minBet: number
  /** Wager delta when a chip is tapped. Parent owns the wager state. */
  onAdd: (denom: number) => void
  onClear: () => void
  /** Called when the player commits the wager (Deal button). */
  onDeal: () => void
  /** Optional label override for the deal button (e.g., 'Dealing…'). */
  dealLabel?: string
  dealDisabled?: boolean
}

export default function WagerCircle({
  wager, presets, chipsLeft, maxBet, minBet,
  onAdd, onClear, onDeal, dealLabel, dealDisabled,
}: WagerCircleProps) {
  const circleRef = useRef<HTMLDivElement | null>(null)
  const [flyingChips, setFlyingChips] = useState<FlyingChip[]>([])
  const nextIdRef = useRef(1)

  // Source the flight from the chip button's center, target the bet
  // circle's center. Both rects are read at click time so any scroll
  // since the last layout pass is accounted for.
  const handleChipTap = useCallback((denom: number, button: HTMLButtonElement) => {
    if (denom > chipsLeft) return
    if (wager + denom > maxBet) return
    const buttonRect = button.getBoundingClientRect()
    const circleRect = circleRef.current?.getBoundingClientRect()
    if (circleRect) {
      const id = nextIdRef.current++
      setFlyingChips(prev => [...prev, {
        id, denom,
        fromX: buttonRect.left + buttonRect.width / 2,
        fromY: buttonRect.top + buttonRect.height / 2,
        toX: circleRect.left + circleRect.width / 2,
        toY: circleRect.top + circleRect.height / 2,
      }])
    }
    onAdd(denom)
  }, [chipsLeft, wager, maxBet, onAdd])

  // Stacked-disc visualization inside the circle. Same logic as the
  // roulette ChipBadge: more discs at higher wager so a 500-chip stake
  // visibly looks like a pile.
  const stackCount = wager >= 1000 ? 5 : wager >= 500 ? 4 : wager >= 100 ? 3 : wager >= 25 ? 2 : wager > 0 ? 1 : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}>
      {/* Bet circle — the felt target where chips land. */}
      <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
        <motion.div
          ref={circleRef}
          animate={{
            scale: wager > 0 ? 1 : 0.96,
            boxShadow: wager > 0
              ? `0 0 24px ${ACCENT}33, inset 0 0 18px rgba(0,0,0,0.45)`
              : 'inset 0 0 16px rgba(0,0,0,0.55)',
          }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          style={{
            width: 132, height: 132, borderRadius: '50%',
            background: 'radial-gradient(circle at 50% 35%, rgba(60,42,16,0.55) 0%, rgba(8,4,2,0.85) 80%)',
            border: `2px dashed ${wager > 0 ? `${ACCENT}aa` : `${ACCENT}55`}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}
        >
          {/* Stacked chip discs underneath the wager label — pure visual
              flair so the bet circle reads as 'chips in the middle of
              the felt'. */}
          {Array.from({ length: stackCount }, (_, i) => (
            <span key={i} aria-hidden style={{
              position: 'absolute',
              width: 50, height: 36,
              borderRadius: 999,
              background: `radial-gradient(circle at 50% 30%, ${pickChipColor(wager, stackCount - 1 - i)} 0%, ${pickChipColor(wager, stackCount - 1 - i)}99 80%)`,
              border: '1.5px solid #1a1a1a',
              top: 56 - i * 4,
              left: 41,
              boxShadow: '0 2px 3px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.2)',
              opacity: 0.94,
            }} />
          ))}
          <div style={{ position: 'relative', textAlign: 'center', zIndex: 2 }}>
            <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: '#a68a4a' }}>
              {wager > 0 ? 'Wager' : 'Place bet'}
            </p>
            <motion.p
              key={wager}
              initial={wager > 0 ? { scale: 0.7, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 480, damping: 20 }}
              className="font-cinzel font-700"
              style={{
                fontSize: wager > 999 ? '1.3rem' : '1.55rem',
                color: wager > 0 ? ACCENT : '#5a5550',
                lineHeight: 1, marginTop: 4,
              }}>
              {wager > 0 ? `${wager.toLocaleString()} ⟡` : '—'}
            </motion.p>
          </div>
        </motion.div>
        {/* Clear button — small floating × on the top-right of the
            circle. Only renders when there's something to clear. */}
        <AnimatePresence>
          {wager > 0 && (
            <motion.button
              key="clear"
              type="button"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.18 }}
              onClick={onClear}
              aria-label="Clear wager"
              style={{
                position: 'absolute', top: 0, right: 'calc(50% - 78px)',
                width: 26, height: 26, borderRadius: '50%',
                background: 'rgba(248,113,113,0.18)',
                border: '1px solid rgba(248,113,113,0.55)',
                color: '#f08a8a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '0.8rem',
                padding: 0,
                lineHeight: 1,
              }}>
              ×
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Chip rack — same denominations across the tavern. */}
      <div style={{
        display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center',
        background: 'rgba(0,0,0,0.35)',
        border: '1px solid rgba(196,169,106,0.2)',
        borderRadius: 12,
        padding: '0.55rem 0.6rem',
      }}>
        {presets.map(denom => {
          const disabledByChips = denom > chipsLeft
          const disabledByCap   = wager + denom > maxBet
          const disabled = disabledByChips || disabledByCap
          return (
            <ChipDisc
              key={denom}
              denom={denom}
              size={42}
              disabled={disabled}
              onTap={handleChipTap}
              title={disabledByCap ? `Per-hand max ${maxBet.toLocaleString()} ⟡` : disabledByChips ? 'Not enough chips' : `Add ${denom} ⟡`}
            />
          )
        })}
      </div>

      {/* Deal button — locks in the wager and signals the parent. */}
      <motion.button
        type="button"
        disabled={wager < minBet || !!dealDisabled}
        onClick={onDeal}
        whileTap={wager >= minBet && !dealDisabled ? { y: 3, scale: 0.96 } : undefined}
        transition={{ type: 'spring', stiffness: 600, damping: 22 }}
        className="font-cinzel font-700 uppercase tracking-[0.1em]"
        style={{
          padding: '0.85rem 0', borderRadius: 12,
          background: wager >= minBet && !dealDisabled
            ? `linear-gradient(180deg, ${ACCENT}55 0%, ${ACCENT}22 100%)`
            : 'rgba(255,255,255,0.04)',
          border: `1px solid ${wager >= minBet && !dealDisabled ? ACCENT : 'rgba(255,255,255,0.1)'}`,
          color: wager >= minBet && !dealDisabled ? '#f0d695' : '#5a5550',
          fontSize: '0.92rem',
          cursor: wager >= minBet && !dealDisabled ? 'pointer' : 'default',
          boxShadow: wager >= minBet && !dealDisabled
            ? 'inset 0 1px 0 rgba(240,214,149,0.25), 0 2px 6px rgba(0,0,0,0.4)' : 'none',
        }}
      >
        {dealLabel ?? (wager >= minBet ? `Deal · ${wager.toLocaleString()} ⟡` : `Min ${minBet} ⟡ to deal`)}
      </motion.button>

      {/* Flying chips — rendered in a fixed-position layer so the
          coordinates from getBoundingClientRect line up regardless of
          parent transforms. AnimatePresence clears each chip when its
          animation completes. */}
      <FlyingChipLayer chips={flyingChips} onLand={(id) => setFlyingChips(prev => prev.filter(c => c.id !== id))} />
    </div>
  )
}

function FlyingChipLayer({ chips, onLand }: {
  chips: FlyingChip[]
  onLand: (id: number) => void
}) {
  return (
    <div aria-hidden style={{
      position: 'fixed', inset: 0,
      pointerEvents: 'none',
      zIndex: 220,
    }}>
      <AnimatePresence>
        {chips.map(chip => {
          const color = CHIP_COLORS[chip.denom] ?? pickChipColor(chip.denom)
          return (
            <motion.div
              key={chip.id}
              initial={{ x: chip.fromX - 21, y: chip.fromY - 21, scale: 1, opacity: 1 }}
              animate={{
                x: chip.toX - 21,
                y: chip.toY - 21,
                scale: 0.7,
                opacity: 0.95,
                rotate: 360,
              }}
              transition={{ duration: 0.42, ease: [0.4, 0, 0.2, 1] }}
              onAnimationComplete={() => onLand(chip.id)}
              style={{
                position: 'absolute', top: 0, left: 0,
                width: 42, height: 42, borderRadius: '50%',
                background: `radial-gradient(circle at 50% 35%, ${color} 0%, ${color}cc 80%)`,
                border: '2px dashed rgba(255,255,255,0.55)',
                color: '#0a0a0a',
                fontSize: '0.55rem',
                fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
                boxShadow: '0 4px 10px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.25)',
                textShadow: '0 1px 0 rgba(255,255,255,0.3)',
              }}>
              {chip.denom}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
