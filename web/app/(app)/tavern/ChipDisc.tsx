'use client'

// Shared tavern-chip vocabulary. Both Blackjack and Fish Roulette now
// use the same chip palette + disc visual so a player who buys in at one
// table reads the same denominations at the next. The CHIP_COLORS map
// stays at exact denomination keys so a tap on "the gold 500 chip" looks
// identical across both surfaces; downstream code uses pickChipColor
// when an arbitrary value needs the closest palette tier (e.g., chip
// badges that sum multiple denominations).

import { forwardRef } from 'react'
import { motion } from 'framer-motion'

export const CHIP_COLORS: Record<number, string> = {
  10:  '#e07c7c',
  25:  '#5fa8c9',
  50:  '#7a7a7a',
  100: '#4ade80',
  250: '#a78bfa',
  500: '#f0c040',
}

/** Pick the nearest preset color for an arbitrary chip amount. `tier`
 *  controls which preset bucket to choose: 0 = highest applicable preset
 *  (label disc), 1/2 = one/two tiers below (stack discs). Lets stacked-
 *  chip visualizations show a mix of chip colors instead of one tone. */
export function pickChipColor(value: number, tier = 0): string {
  const presets = Object.keys(CHIP_COLORS).map(Number).sort((a, b) => b - a)
  let found = -1
  for (let i = 0; i < presets.length; i++) {
    if (value >= presets[i]) { found = i; break }
  }
  if (found < 0) return CHIP_COLORS[10]
  const idx = Math.min(presets.length - 1, found + tier)
  return CHIP_COLORS[presets[idx]]
}

/** Standard chip disc button. forwardRef so the parent can capture its
 *  on-screen rect for chip-flight animations (blackjack uses this — tap
 *  a chip, a clone flies from the rack into the bet circle). */
export interface ChipDiscProps {
  denom: number
  disabled?: boolean
  selected?: boolean
  /** Click handler. Receives the underlying button so the caller can
   *  read getBoundingClientRect() for flight-source coordinates. */
  onTap?: (denom: number, button: HTMLButtonElement) => void
  size?: number
  /** Label override — defaults to the denom number. Lets the caller
   *  show '+10' or similar variations. */
  label?: string | number
  title?: string
}

const ChipDisc = forwardRef<HTMLButtonElement, ChipDiscProps>(function ChipDisc(
  { denom, disabled, selected, onTap, size = 40, label, title }: ChipDiscProps, ref
) {
  const color = CHIP_COLORS[denom] ?? pickChipColor(denom)
  return (
    <motion.button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={(e) => onTap?.(denom, e.currentTarget)}
      whileTap={disabled ? undefined : { scale: 0.92, y: 2 }}
      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
      title={title ?? `${denom} ⟡`}
      className="font-cinzel font-700"
      style={{
        width: size, height: size, borderRadius: '50%',
        // Brighter radial with a vivid center → saturated rim so the
        // chip reads from across the room. Old gradient muted toward
        // ${color}cc at 80% which washed out small text.
        background: `radial-gradient(circle at 50% 32%, #fff 0%, ${color} 28%, ${color} 70%, ${color}99 100%)`,
        border: selected ? '2.5px solid #fff' : '2.5px dashed rgba(255,255,255,0.75)',
        color: '#0a0a0a',
        // ~25% of disc width — readable from a phone arm's length.
        // Old size was 0.55rem (~9px) on a 42px chip, basically unreadable.
        fontSize: Math.max(11, Math.round(size * 0.30)),
        fontWeight: 800,
        lineHeight: 1,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        boxShadow: selected
          ? '0 0 10px rgba(255,255,255,0.5)'
          : '0 2px 5px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 4px rgba(0,0,0,0.25)',
        padding: 0,
        textShadow: '0 1px 0 rgba(255,255,255,0.65), 0 0 2px rgba(255,255,255,0.55)',
      }}
    >
      {label ?? denom}
    </motion.button>
  )
})

export default ChipDisc
