'use client'

// Shared storefront purchase button used across every marketplace shop.
// One component owns all the states the shops were each re-implementing:
//   - affordable   -> gold CTA showing the label + price (e.g. "Buy · 500 ⟡")
//   - unaffordable -> muted, shows the shortfall ("Need 120 more ⟡")
//   - pending      -> dimmed, swaps to a "…" verb
//   - owned/done   -> disabled confirmation state (no price)
//
// `accent` lets a shop tint the button to its scene colour while keeping the
// same shape/feel. Prices are passed as numbers so the button can compute the
// shortfall itself.

import { motion } from 'framer-motion'

export default function ShopBuyButton({
  label, cost, balance, pending = false, busy = false, done = false,
  doneLabel = 'Owned', pendingLabel, accent = '#f0c040', onClick, fullWidth = true,
}: {
  /** CTA verb when affordable, e.g. "Buy", "Upgrade", "Equip". */
  label: string
  /** Price in doubloons. Pass 0/undefined for a costless action (e.g. equip). */
  cost?: number
  /** Current doubloon balance, used to compute affordability + shortfall. */
  balance: number
  /** This specific button is mid-request. */
  pending?: boolean
  /** A sibling request is running — disable but don't show this one's spinner. */
  busy?: boolean
  /** Already owned/active — disabled confirmation pill. */
  done?: boolean
  doneLabel?: string
  pendingLabel?: string
  accent?: string
  onClick?: () => void
  fullWidth?: boolean
}) {
  const price = cost ?? 0
  const canAfford = price === 0 || balance >= price
  const disabled = done || pending || busy || !canAfford

  let content: React.ReactNode
  if (done) content = doneLabel
  else if (pending) content = pendingLabel ?? `${label}…`
  else if (!canAfford) content = `Need ${(price - balance).toLocaleString()} more ⟡`
  else content = price > 0
    ? <>{label} <span style={{ opacity: 0.5 }}>·</span> {price.toLocaleString()} ⟡</>
    : label

  const bg = done
    ? 'rgba(255,255,255,0.05)'
    : canAfford
      ? `linear-gradient(180deg, ${accent}30 0%, ${accent}1a 100%)`
      : 'rgba(255,255,255,0.04)'
  const border = done
    ? 'rgba(255,255,255,0.14)'
    : canAfford ? `${accent}70` : 'rgba(255,255,255,0.1)'
  const color = done ? '#9a978f' : canAfford ? accent : '#d8b154'

  return (
    <motion.button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
      className="font-karla font-700 uppercase tracking-[0.1em]"
      style={{
        width: fullWidth ? '100%' : undefined,
        padding: '0.72rem 0.9rem',
        borderRadius: 12,
        background: bg,
        border: `1px solid ${border}`,
        color,
        cursor: disabled ? 'default' : 'pointer',
        opacity: pending || busy ? 0.6 : 1,
        fontSize: '0.76rem',
        boxShadow: canAfford && !done ? `0 2px 10px ${accent}1f, inset 0 1px 0 rgba(255,255,255,0.08)` : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {content}
    </motion.button>
  )
}
