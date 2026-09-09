'use client'

// ── THE TWO TAKEOVERS A CLEAR CAN EARN ──────────────────────────────────────
//
// A chapter opening, and the Quartermaster's plans falling into your hands.
// Both were declared inside RaidsSection, which is a three-and-a-half-thousand
// line campaign map — so the only surface that could fire them was that map,
// and by the time the sea could clear a chapter from the deck the celebration
// had nowhere to live. Filed here so both surfaces import the same moment
// rather than one of them growing a quieter copy.
//
// Both portal to the body and own their own z-index, so a caller mounts them
// anywhere and does not have to know what is underneath.

import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import type { RaidChapter } from '@/lib/raidMap'
import { ULTIMATE_STORY } from '@/lib/shipAugments'

/* ─────────────────────── Chapter-unlock overlay ───────────────── */

// First-time celebration when a chapter unlocks. Fires once per
// chapter per player (persisted via profiles.seen_chapter_unlocks;
// dismissed by markChapterUnlockSeen). Designed to FEEL like a real
// milestone — full-screen takeover, parchment scroll, gold particles,
// stamping roman numeral — not a quiet toast in the corner.
export function ChapterUnlockOverlay({
  chapter, previousChapter, onDismiss,
}: {
  chapter: RaidChapter
  previousChapter: RaidChapter | null
  onDismiss: () => void
}) {
  // Random-but-deterministic sparkle positions so they're stable across
  // re-renders. 14 sparkles drift up across the backdrop, each with its
  // own delay + duration + horizontal jitter — reads as ambient gold
  // dust, not a regimented confetti burst.
  const sparkles = (() => {
    const arr: { left: number; size: number; delay: number; duration: number; sway: number }[] = []
    for (let i = 0; i < 14; i++) {
      arr.push({
        left:     (i * 73) % 100,                   // spread across the width
        size:     3 + ((i * 17) % 5),               // 3–7px
        delay:    (i * 0.23) % 2.6,                 // staggered starts
        duration: 4 + ((i * 11) % 4),               // 4–7s
        sway:     (i % 2 === 0 ? 1 : -1) * (8 + (i * 3) % 10),
      })
    }
    return arr
  })()

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      style={{
        position: 'fixed', inset: 0,
        zIndex: 3000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem',
        // Deep-ocean radial so the sparkles glow against it. The very
        // center is darker so the parchment card pops cleanly.
        background: 'radial-gradient(ellipse at center, rgba(4,12,24,0.92) 0%, rgba(2,4,10,0.97) 70%, rgba(0,0,0,0.99) 100%)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
data-any-key
      onClick={onDismiss}
    >
      {/* Sparkle particles — float up + sway. pointer-events:none so
          they don't intercept the tap-anywhere dismiss. */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {sparkles.map((s, i) => (
          <motion.div
            key={i}
            initial={{ y: '110%', opacity: 0, x: 0 }}
            animate={{ y: '-15%', opacity: [0, 0.85, 0.85, 0], x: [0, s.sway, 0, -s.sway, 0] }}
            transition={{
              y:       { duration: s.duration, delay: s.delay, repeat: Infinity, ease: 'linear' },
              opacity: { duration: s.duration, delay: s.delay, repeat: Infinity, times: [0, 0.15, 0.8, 1], ease: 'easeInOut' },
              x:       { duration: s.duration, delay: s.delay, repeat: Infinity, ease: 'easeInOut' },
            }}
            style={{
              position: 'absolute',
              left: `${s.left}%`,
              bottom: 0,
              width: s.size, height: s.size,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,225,150,0.95) 0%, rgba(240,192,64,0.6) 50%, transparent 100%)',
              boxShadow: '0 0 12px rgba(255,210,120,0.55)',
            }}
          />
        ))}
      </div>

      {/* Card — stops tap propagation so taps inside don't trigger
          the backdrop dismiss accidentally. */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.18, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 'var(--modal-w)',
          padding: '1.6rem 1.4rem 1.5rem',
          borderRadius: 18,
          background: [
            'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(255,225,150,0.18) 0%, transparent 70%)',
            'linear-gradient(180deg, rgba(36,24,10,0.96) 0%, rgba(20,14,8,0.98) 100%)',
          ].join(', '),
          border: '1.5px solid rgba(240,192,64,0.55)',
          borderTop: '2.5px solid rgba(255,215,120,0.85)',
          boxShadow: '0 0 60px rgba(240,192,64,0.22), 0 0 140px rgba(240,192,64,0.08), inset 0 0 40px rgba(40,28,12,0.5)',
          textAlign: 'center',
        }}
      >
        {/* "Chapter N complete" — anchors the celebration to what the
            player just DID, not just what they're getting. */}
        {previousChapter && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.4 }}
            className="font-karla font-700 uppercase tracking-[0.22em]"
            style={{ fontSize: '0.56rem', color: '#4ade80', marginBottom: '0.65rem' }}
          >
            ✓ {previousChapter.coda ? previousChapter.title : `Chapter ${previousChapter.romanNumeral}`} Complete
          </motion.p>
        )}

        {/* Anchor divider — small pirate-flavored chrome that pins the
            card as a moment, not just a banner. */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ delay: 0.6, duration: 0.45, ease: 'easeOut' }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            margin: '0 auto 1rem', maxWidth: 220,
            transformOrigin: 'center',
          }}
        >
          <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent 0%, rgba(240,192,64,0.6) 100%)' }} />
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 8px rgba(240,192,64,0.55))' }}>
            <circle cx="12" cy="5" r="2"/>
            <path d="M12 7v10M8 17c0 0 1 2 4 2s4-2 4-2M7 11h10"/>
            <path d="M7 17c-2-1-3-3-3-5h3M17 17c2-1 3-3 3-5h-3"/>
          </svg>
          <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(240,192,64,0.6) 0%, transparent 100%)' }} />
        </motion.div>

        {/* "NEW CHAPTER UNLOCKED" tag */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85, duration: 0.4 }}
          className="font-karla font-700 uppercase tracking-[0.32em]"
          style={{ fontSize: '0.56rem', color: 'rgba(240,192,64,0.75)', marginBottom: '0.5rem' }}
        >
          New Chapter Unlocked
        </motion.p>

        {/* Roman numeral — stamps in with overshoot for a real "ka-thunk"
            arrival. Cinzel weight + drop-shadow give it the feel of an
            embossed plate. */}
        <motion.p
          initial={{ opacity: 0, scale: 1.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.05, duration: 0.55, type: 'spring', stiffness: 220, damping: 14 }}
          className="font-cinzel font-700"
          style={{
            fontSize: '4.2rem', lineHeight: 1,
            color: '#ffd56b', letterSpacing: '0.04em',
            margin: '0 0 0.3rem',
            textShadow: '0 0 24px rgba(240,192,64,0.7), 0 4px 18px rgba(0,0,0,0.6)',
          }}
        >
          {chapter.romanNumeral}
        </motion.p>

        {/* Chapter title */}
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.45, duration: 0.45 }}
          className="font-cinzel font-700"
          style={{
            fontSize: '1.45rem', lineHeight: 1.15,
            color: '#f5f2ec', letterSpacing: '0.02em',
            marginBottom: '0.65rem',
            textShadow: '0 2px 12px rgba(0,0,0,0.7)',
          }}
        >
          {chapter.title}
        </motion.p>

        {/* Subtitle — flavor blurb. */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.75, duration: 0.5 }}
          className="font-karla"
          style={{
            fontSize: '0.82rem', lineHeight: 1.5,
            color: 'rgba(245,242,236,0.78)',
            fontStyle: 'italic',
            marginBottom: '1.5rem',
            padding: '0 0.5rem',
          }}
        >
          {chapter.subtitle}
        </motion.p>

        {/* CTA */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.05, duration: 0.4 }}
          whileTap={{ scale: 0.97 }}
          onClick={onDismiss}
          className="font-cinzel font-700 uppercase tracking-[0.18em]"
          style={{
            width: '100%', padding: '12px 0',
            borderRadius: 12,
            background: 'linear-gradient(180deg, rgba(240,192,64,0.32) 0%, rgba(240,192,64,0.12) 100%)',
            border: '1px solid rgba(240,192,64,0.65)',
            borderTop: '1.5px solid rgba(255,215,120,0.9)',
            color: '#ffd56b',
            fontSize: '0.78rem',
            cursor: 'pointer',
            boxShadow: '0 0 24px rgba(240,192,64,0.22)',
          }}
        >
          Set Sail →
        </motion.button>

        {/* Subtle hint: tap backdrop also dismisses, but only after the
            CTA has appeared so the player doesn't dismiss-by-accident
            while the card is still animating in. */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.4, duration: 0.4 }}
          className="font-karla"
          style={{ fontSize: '0.6rem', color: 'rgba(240,192,64,0.4)', marginTop: '0.7rem' }}
        >
          Tap anywhere to dismiss
        </motion.p>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

/* ─────────────────── Ultimate-weapon unlock overlay ───────────── */

// The Chapter-3 payoff. Beating the Quartermaster reveals his stolen weapon
// schematics; this full-screen forge-lit takeover announces it and sends the
// player to the build screen. Themed molten gold-red (a foundry, not the sea)
// so it reads as distinct from the chapter-unlock parchment. Fires once
// (persisted via profiles.seen_ultimate_unlock).
export function UltimateUnlockOverlay({ onBuild, onLater }: { onBuild: () => void; onLater: () => void }) {
  // Embers rising off the forge — deterministic positions, stable across renders.
  const embers = (() => {
    const arr: { left: number; size: number; delay: number; duration: number; sway: number }[] = []
    for (let i = 0; i < 16; i++) {
      arr.push({
        left:     (i * 61) % 100,
        size:     3 + ((i * 13) % 5),
        delay:    (i * 0.19) % 2.4,
        duration: 3.5 + ((i * 7) % 4),
        sway:     (i % 2 === 0 ? 1 : -1) * (7 + (i * 3) % 12),
      })
    }
    return arr
  })()

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
        background: 'radial-gradient(ellipse at center, rgba(28,10,4,0.93) 0%, rgba(10,4,2,0.97) 68%, rgba(0,0,0,0.99) 100%)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      }}
      onClick={onLater}
    >
      {/* rising embers */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {embers.map((s, i) => (
          <motion.div
            key={i}
            initial={{ y: '110%', opacity: 0, x: 0 }}
            animate={{ y: '-15%', opacity: [0, 0.9, 0.9, 0], x: [0, s.sway, 0, -s.sway, 0] }}
            transition={{
              y:       { duration: s.duration, delay: s.delay, repeat: Infinity, ease: 'linear' },
              opacity: { duration: s.duration, delay: s.delay, repeat: Infinity, times: [0, 0.15, 0.8, 1], ease: 'easeInOut' },
              x:       { duration: s.duration, delay: s.delay, repeat: Infinity, ease: 'easeInOut' },
            }}
            style={{
              position: 'absolute', left: `${s.left}%`, bottom: 0,
              width: s.size, height: s.size, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,200,120,0.95) 0%, rgba(240,110,50,0.6) 50%, transparent 100%)',
              boxShadow: '0 0 12px rgba(255,140,70,0.6)',
            }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 'var(--modal-w)',
          padding: '1.6rem 1.4rem 1.5rem', borderRadius: 18,
          background: [
            'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(255,150,70,0.2) 0%, transparent 70%)',
            'linear-gradient(180deg, rgba(38,16,8,0.96) 0%, rgba(18,8,5,0.98) 100%)',
          ].join(', '),
          border: '1.5px solid rgba(240,140,70,0.5)',
          borderTop: '2.5px solid rgba(255,180,110,0.85)',
          boxShadow: '0 0 60px rgba(240,120,60,0.24), 0 0 140px rgba(240,120,60,0.08), inset 0 0 40px rgba(50,20,10,0.5)',
          textAlign: 'center',
        }}
      >
        {/* "Quartermaster defeated" anchor */}
        <motion.p
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.4 }}
          className="font-karla font-700 uppercase tracking-[0.22em]"
          style={{ fontSize: '0.56rem', color: '#4ade80', marginBottom: '0.65rem' }}
        >
          ✓ The Quartermaster Falls
        </motion.p>

        {/* kicker */}
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.4 }}
          className="font-karla font-700 uppercase tracking-[0.3em]"
          style={{ fontSize: '0.56rem', color: 'rgba(255,180,110,0.8)', marginBottom: '0.7rem' }}
        >
          {ULTIMATE_STORY.unlockKicker}
        </motion.p>

        {/* weapon glyph — a cannon/blast mark stamping in */}
        <motion.div
          initial={{ opacity: 0, scale: 1.7 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.9, duration: 0.55, type: 'spring', stiffness: 210, damping: 14 }}
          style={{ margin: '0 auto 0.7rem', width: 62, height: 62, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, rgba(255,170,90,0.28) 0%, transparent 70%)' }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ffb46e" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 10px rgba(255,150,70,0.7))' }}>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
          </svg>
        </motion.div>

        {/* title */}
        <motion.p
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.15, duration: 0.45 }}
          className="font-cinzel font-700"
          style={{ fontSize: '1.55rem', lineHeight: 1.12, color: '#fff2e2', letterSpacing: '0.02em', marginBottom: '0.7rem', textShadow: '0 0 22px rgba(255,150,70,0.4), 0 2px 12px rgba(0,0,0,0.7)' }}
        >
          {ULTIMATE_STORY.unlockTitle}
        </motion.p>

        {/* blurb */}
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4, duration: 0.5 }}
          className="font-karla"
          style={{ fontSize: '0.8rem', lineHeight: 1.55, color: 'rgba(245,236,228,0.8)', marginBottom: '1rem', padding: '0 0.3rem' }}
        >
          {ULTIMATE_STORY.unlockBlurb}
        </motion.p>

        {/* the three weapons on offer */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.65, duration: 0.45 }}
          style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: '1.4rem' }}
        >
          {[['Railgun', '#5fd0ff'], ['Barrage', '#ffb454'], ['Nuke', '#ff5b5b']].map(([name, col]) => (
            <span key={name} className="font-karla font-700 uppercase tracking-[0.08em]"
              style={{ fontSize: '0.58rem', color: col, background: `${col}18`, border: `1px solid ${col}55`, borderRadius: 999, padding: '0.3rem 0.7rem' }}>
              {name}
            </span>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.button
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.85, duration: 0.4 }}
          whileTap={{ scale: 0.97 }} onClick={onBuild}
          className="font-cinzel font-700 uppercase tracking-[0.16em]"
          style={{
            width: '100%', padding: '13px 0', borderRadius: 12,
            background: 'linear-gradient(180deg, rgba(255,160,80,0.4) 0%, rgba(240,120,60,0.16) 100%)',
            border: '1px solid rgba(255,160,90,0.7)', borderTop: '1.5px solid rgba(255,200,140,0.9)',
            color: '#ffe0c0', fontSize: '0.8rem', cursor: 'pointer',
            boxShadow: '0 0 26px rgba(240,120,60,0.28)',
          }}
        >
          Study the Plans →
        </motion.button>
        <motion.button
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.15, duration: 0.4 }}
          onClick={onLater}
          className="font-karla font-600"
          style={{ marginTop: '0.7rem', background: 'transparent', border: 'none', color: 'rgba(255,180,110,0.5)', fontSize: '0.66rem', cursor: 'pointer' }}
        >
          Later
        </motion.button>
      </motion.div>
    </motion.div>,
    document.body,
  )
}
