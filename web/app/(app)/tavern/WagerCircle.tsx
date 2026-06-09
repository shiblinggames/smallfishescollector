'use client'

// Chip-betting bar used on blackjack's wager-and-deal screens. Renders
// the chip rack + Clear/Deal button + a fixed-position flying-chip
// overlay. The wager indicator itself (the pot) lives in the parent —
// during play it's the existing PotPill between the dealer and player
// rows; on the wager screen it's the same PotPill at the top. The
// parent passes its ref as `flyToRef` so taps on chip discs fly into
// the canonical pot, not a duplicate.
//
// The flight animation uses live DOM rects (getBoundingClientRect)
// because the rack and the pot live in different parts of the layout
// tree — we can't share a coordinate space via framer's `layoutId`
// across siblings reliably across phase transitions.

import { useRef, useState, useCallback, type RefObject } from 'react'
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
  /** REQUIRED. The parent's pot-indicator ref. Tapped chips fly into
   *  its center on screen. This used to be a self-contained bet circle
   *  inside this component, which duplicated blackjack's existing
   *  PotPill — now there's one canonical target rendered by the parent. */
  flyToRef: RefObject<HTMLElement | null>
}

export default function WagerCircle({
  wager, presets, chipsLeft, maxBet, minBet,
  onAdd, onClear, onDeal, dealLabel, dealDisabled,
  flyToRef,
}: WagerCircleProps) {
  const [flyingChips, setFlyingChips] = useState<FlyingChip[]>([])
  const nextIdRef = useRef(1)

  // Source from the chip button's center, target the parent-supplied
  // pot ref's center. Both rects are read at click time so any scroll
  // since the last layout pass is accounted for.
  const handleChipTap = useCallback((denom: number, button: HTMLButtonElement) => {
    if (denom > chipsLeft) return
    if (wager + denom > maxBet) return
    const buttonRect = button.getBoundingClientRect()
    const targetRect = flyToRef.current?.getBoundingClientRect()
    if (targetRect) {
      const id = nextIdRef.current++
      setFlyingChips(prev => [...prev, {
        id, denom,
        fromX: buttonRect.left + buttonRect.width / 2,
        fromY: buttonRect.top + buttonRect.height / 2,
        toX: targetRect.left + targetRect.width / 2,
        toY: targetRect.top + targetRect.height / 2,
      }])
    }
    onAdd(denom)
  }, [chipsLeft, wager, maxBet, onAdd, flyToRef])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', position: 'relative' }}>
      {/* Chip rack + inline Clear. The bet visual lives in the parent
          (PotPill); Clear sits as a small × on the right of the rack
          since there's no longer a bet circle to anchor it to. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          flex: 1,
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
                width: 38, height: 38, borderRadius: '50%',
                flexShrink: 0,
                background: 'rgba(248,113,113,0.14)',
                border: '1px solid rgba(248,113,113,0.45)',
                color: '#f08a8a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '1rem',
                padding: 0, lineHeight: 1,
              }}>
              ×
            </motion.button>
          )}
        </AnimatePresence>
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

      {/* Flying chips — fixed-position layer so the coordinates from
          getBoundingClientRect line up regardless of parent transforms.
          AnimatePresence clears each chip when its animation completes. */}
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
