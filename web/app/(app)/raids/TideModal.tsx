'use client'

import { motion } from 'framer-motion'
import { type TideEvent, type TideChoice, describeEffect } from '@/lib/tides'

// ─── Tide modal ────────────────────────────────────────────────────────────
// Between-fight roguelike event interrupt. Fires after the kill of a
// configured slot (see BossRaidConfig.tides.slots) and gates the next
// encounter mount until the player picks a choice. Effects are added to
// the run's activeTideEffects array (managed by RaidGame).
//
// Visually a centered card on a dimmed backdrop. Designed to match the
// boss-dialogue modal's framing — same z-stack, same exit-on-tap pattern
// — but with stacked choice cards instead of a single Engage button.

interface Props {
  tide: TideEvent
  /** Player picks a choice card — parent applies effects + advances. */
  onPicked: (choice: TideChoice) => void
}

export default function TideModal({ tide, onPicked }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(2,6,12,0.82)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.25rem',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: '100%', maxWidth: 440,
          padding: '1.4rem 1.3rem 1.2rem',
          borderRadius: 18,
          background: 'linear-gradient(180deg, rgba(16,28,44,0.98) 0%, rgba(8,16,28,0.99) 100%)',
          border: '1px solid rgba(125,211,252,0.32)',
          borderTop: '2px solid rgba(125,211,252,0.55)',
          boxShadow: '0 0 48px rgba(125,211,252,0.14), 0 0 120px rgba(125,211,252,0.06)',
          maxHeight: '88vh',
          overflowY: 'auto',
        }}
      >
        {/* Eyebrow */}
        <p className="font-karla font-700 uppercase tracking-[0.2em]" style={{ fontSize: '0.56rem', color: 'rgba(125,211,252,0.7)', marginBottom: '0.55rem', textAlign: 'center' }}>
          A Tide Rolls In
        </p>

        {/* Title */}
        <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: '#f5f2ec', lineHeight: 1.2, marginBottom: '0.7rem', textAlign: 'center' }}>
          {tide.title}
        </p>

        {/* Flavor */}
        <p className="font-karla" style={{
          fontSize: '0.85rem', lineHeight: 1.55,
          color: 'rgba(245,242,236,0.78)',
          fontStyle: 'italic',
          marginBottom: '1.1rem',
          textAlign: 'center',
          padding: '0 0.3rem',
        }}>
          {tide.flavor}
        </p>

        {/* Choices — stacked cards. Each shows label + description + a
            small chip row summarizing the resolved effects so the player
            can compare trades at a glance. The chip text uses the same
            describeEffect helper that drives the Captain's Ledger row,
            so naming stays consistent across the run. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tide.choices.map(c => (
            <button
              key={c.id}
              onClick={() => onPicked(c)}
              className="font-karla"
              style={{
                textAlign: 'left',
                padding: '0.8rem 0.9rem',
                borderRadius: 12,
                background: 'rgba(125,211,252,0.06)',
                border: '1px solid rgba(125,211,252,0.28)',
                borderTop: '1.5px solid rgba(125,211,252,0.45)',
                color: '#e7eef6',
                cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#bae6fd', marginBottom: 4, lineHeight: 1.2 }}>
                {c.label}
              </p>
              <p className="font-karla" style={{ fontSize: '0.74rem', color: 'rgba(231,238,246,0.72)', lineHeight: 1.45, marginBottom: c.effects.length > 0 ? 7 : 0 }}>
                {c.description}
              </p>
              {c.effects.length > 0 && (() => {
                // Filter empty strings (marker-only effects like the
                // n=0 startHpDelta placeholders) so we don't render
                // blank chips. describeEffect returns '' for those.
                const chips = c.effects
                  .map(e => describeEffect(e))
                  .filter(s => s.length > 0)
                if (chips.length === 0) return null
                return (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {chips.map((label, i) => (
                      <span
                        key={i}
                        className="font-karla font-600"
                        style={{
                          fontSize: '0.6rem',
                          padding: '0.15rem 0.45rem',
                          borderRadius: 4,
                          background: 'rgba(125,211,252,0.10)',
                          border: '1px solid rgba(125,211,252,0.26)',
                          color: '#bae6fd',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )
              })()}
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}
