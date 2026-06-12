'use client'

// Tap-through dialogue scene for story nodes — the visual-novel delivery
// that replaced the prose-wall reading experience (players read ten-word
// speech lines, they skip 150-word paragraphs). One SceneLine per tap:
// narrator lines render as italic log-style text, character lines get a
// portrait + name plate. Tapping anywhere advances; the final line swaps
// the "tap to continue" hint for the node's CTA button which fires
// onComplete (the caller marks the node read / closes).
//
// Portaled to document.body — Nav has translateZ(0) and the node sheet
// is itself a fixed portal at z-1000, so the scene sits above both.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import type { SceneLine } from '@/lib/raidMap'

const ACCENT = '#f0c040'

export default function StoryScene({ title, lines, ctaLabel, pending, onComplete, onSkip }: {
  /** Node label, shown small at the top so the player knows which beat
   *  they are in. */
  title: string
  lines: SceneLine[]
  /** Final-line button text (node's detail.ctaLabel or a default). */
  ctaLabel: string
  /** Disables the final CTA while the mark-read server action runs. */
  pending?: boolean
  /** Final CTA tapped — caller marks the node read and closes. */
  onComplete: () => void
  /** Skip/close without completing (replays use this for the CTA too —
   *  caller decides whether completing means a server write). */
  onSkip: () => void
}) {
  const [idx, setIdx] = useState(0)
  const line = lines[idx]
  const last = idx === lines.length - 1

  // Lock body scroll while the scene is up (same trick the raid
  // overlays use — the scene owns the whole viewport).
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  function advance() {
    if (!last) setIdx(i => i + 1)
  }

  const scene = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={advance}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'radial-gradient(ellipse at 50% 30%, #16120c 0%, #070504 78%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 'calc(env(safe-area-inset-top, 0px) + 3rem) 1.4rem calc(env(safe-area-inset-bottom, 0px) + 2.2rem)',
        cursor: last ? 'default' : 'pointer',
        WebkitTapHighlightColor: 'transparent',
        userSelect: 'none',
      }}
    >
      {/* Chapter-beat title + skip — pinned top */}
      <div style={{
        position: 'absolute',
        top: 'calc(env(safe-area-inset-top, 0px) + 0.9rem)',
        left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 1.1rem',
      }}>
        <span className="font-karla font-700 uppercase" style={{ fontSize: '0.55rem', letterSpacing: '0.18em', color: 'rgba(240,237,232,0.4)' }}>
          {title}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onSkip() }}
          className="font-karla font-700 uppercase"
          style={{
            fontSize: '0.55rem', letterSpacing: '0.14em',
            padding: '0.4rem 0.7rem', borderRadius: 8,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(240,237,232,0.55)', cursor: 'pointer',
          }}
        >
          Skip
        </button>
      </div>

      {/* The line — keyed by index so each tap fades the new line in.
          A fixed-height slot for the portrait keeps the text block from
          jumping between narrator and character lines. */}
      <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
          <div style={{
            height: 124, marginBottom: '0.9rem',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}>
            {line.portrait && (
              <div style={{
                width: 110, height: 110, borderRadius: 16, overflow: 'hidden',
                border: `1px solid ${ACCENT}40`,
                background: 'rgba(255,255,255,0.04)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={line.portrait} alt="" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
          </div>

          {line.speaker ? (
            <>
              <span className="font-cinzel font-800 uppercase" style={{
                fontSize: '0.68rem', letterSpacing: '0.16em', color: ACCENT,
                marginBottom: '0.55rem',
              }}>
                {line.speaker}
              </span>
              <p className="font-karla" style={{
                fontSize: '1.05rem', lineHeight: 1.6, textAlign: 'center',
                color: '#f0ede8',
                margin: 0,
              }}>
                &ldquo;{line.text}&rdquo;
              </p>
            </>
          ) : (
            <p className="font-karla" style={{
              fontSize: '1rem', lineHeight: 1.65, textAlign: 'center',
              fontStyle: 'italic', color: 'rgba(240,237,232,0.82)',
              margin: 0,
            }}>
              {line.text}
            </p>
          )}
        </motion.div>
      </div>

      {/* Bottom rail: progress dots + advance hint / final CTA */}
      <div style={{
        position: 'absolute',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.4rem)',
        left: 0, right: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem',
        padding: '0 1.4rem',
      }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {lines.map((_, i) => (
            <div key={i} style={{
              width: 5, height: 5, borderRadius: '50%',
              background: i <= idx ? `${ACCENT}cc` : 'rgba(255,255,255,0.14)',
              transition: 'background 0.2s',
            }} />
          ))}
        </div>

        {last ? (
          <button
            onClick={e => { e.stopPropagation(); onComplete() }}
            disabled={pending}
            className="font-cinzel font-700 uppercase tracking-[0.06em]"
            style={{
              width: '100%', maxWidth: 360, padding: '0.85rem', borderRadius: 12,
              fontSize: '1rem',
              background: `${ACCENT}26`, border: `1px solid ${ACCENT}66`, color: ACCENT,
              cursor: pending ? 'wait' : 'pointer',
            }}
          >
            {pending ? '…' : ctaLabel}
          </button>
        ) : (
          <motion.span
            className="font-karla font-700 uppercase"
            animate={{ opacity: [0.35, 0.7, 0.35] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ fontSize: '0.58rem', letterSpacing: '0.16em', color: 'rgba(240,237,232,0.6)' }}
          >
            Tap to continue ▸
          </motion.span>
        )}
      </div>
    </motion.div>
  )

  return createPortal(scene, document.body)
}
