'use client'

// THE GIANT GOES DOWN.
//
// Full-screen, over the catch card, for the six Ancient Deep trophies only and
// once each. It hands off to Finn's reaction for that giant when it clears.
//
// EXTRACTED FROM FishingGame so the sea can play it too. It was a local
// function in a 9,000-line file, which is why the chart had every other part of
// the ancient ceremony and not this one: the reference count said the component
// was "in fishing", and it was — as a closure nothing else could reach.
//
// Deliberately dumb. Everything it needs arrives as props; it owns no game
// state, talks to no server, and the two screens that mount it decide when.

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { vibrate } from '@/lib/haptics'
import { fishImageUrl } from '@/components/CatchResultCard'
import type { FishSpecies } from './actions'

/** Local copy: it is four lines and lives in FishingGame, which this file
 *  deliberately does not import from — that file is 9,000 lines and pulling it
 *  in would drag the whole fishing screen into the sea's bundle. */
function toRoman(n: number): string {
  const vals: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  for (const [v, sym] of vals) { while (n >= v) { out += sym; n -= v } }
  return out
}

export default function AncientSlainCinematic({ fish, count, total, isMegalodon, onDone }: {
  fish: FishSpecies; count: number; total: number; isMegalodon: boolean; onDone: () => void
}) {
  const complete = count >= total
  // Apex crimson for Megalodon (and any final 6/6 fill); abyssal violet/cyan for
  // the other giants.
  const apex = isMegalodon || complete
  const glow   = apex ? '#f43f5e' : '#22d3ee'
  const accent = apex ? '#fb7185' : '#a855f7'
  const bg = apex
    ? 'radial-gradient(ellipse 90% 70% at 50% 46%, rgba(120,8,20,0.82) 0%, rgba(6,2,6,0.96) 62%)'
    : 'radial-gradient(ellipse 90% 70% at 50% 46%, rgba(40,10,70,0.80) 0%, rgba(4,4,10,0.96) 62%)'
  const eyebrow = apex ? (isMegalodon ? 'The Apex Falls' : 'The Wall Is Complete') : 'Ancient Slain'

  useEffect(() => {
    // Heavy triple-buzz on the moment landing. Guarded — not all devices have it.
    try { navigator.vibrate?.(apex ? [60, 40, 60, 40, 120] : [40, 30, 90]) } catch { /* no haptics */ }
    const t = setTimeout(onDone, apex ? 3400 : 2900)
    return () => clearTimeout(t)
  }, [onDone, apex])

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
      data-any-key
      onClick={onDone}
      style={{
        position: 'fixed', inset: 0, zIndex: 9200,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: bg, cursor: 'pointer', overflow: 'hidden',
      }}
    >
      {/* Letterbox bars — slam in from top and bottom */}
      <motion.div initial={{ height: 0 }} animate={{ height: '13%' }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, background: '#000' }} />
      <motion.div initial={{ height: 0 }} animate={{ height: '13%' }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#000' }} />

      {/* Expanding rings behind the giant */}
      {[0, 0.14, 0.3].map((delay, i) => (
        <motion.div key={i}
          initial={{ scale: 0.5, opacity: 0.5 - i * 0.14 }}
          animate={{ scale: 2.4 - i * 0.3, opacity: 0 }}
          transition={{ duration: 1.1, ease: 'easeOut', delay: 0.2 + delay }}
          style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', border: `2px solid ${glow}`, pointerEvents: 'none' }}
        />
      ))}

      {/* The giant surfacing from the dark */}
      <motion.div
        initial={{ opacity: 0, y: 70, scale: 0.7 }}
        animate={{ opacity: 1, y: [70, 0, 0], scale: [0.7, 1.06, 1] }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
        style={{ position: 'relative', zIndex: 2 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fishImageUrl(fish.name)} alt={fish.name} decoding="async"
          style={{ width: 'min(72vw, 300px)', height: 'auto', objectFit: 'contain',
            filter: `drop-shadow(0 0 18px ${glow}) drop-shadow(0 0 44px ${glow}aa)` }} />
      </motion.div>

      {/* Eyebrow + name slam + tally */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.55 }}
        style={{ position: 'relative', zIndex: 2, textAlign: 'center', marginTop: 8, padding: '0 1.2rem' }}
      >
        <p className="font-karla font-800 uppercase" style={{ letterSpacing: '0.34em', textIndent: '0.34em', fontSize: '0.62rem', color: accent, marginBottom: 6 }}>
          {eyebrow}
        </p>
        <motion.p className="font-cinzel font-700"
          initial={{ scale: 1.25, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.5 }}
          style={{ fontSize: 'clamp(1.6rem, 8vw, 2.6rem)', lineHeight: 1.05, color: '#fdf4e3',
            textShadow: `0 0 18px ${glow}88` }}>
          {fish.name}
        </motion.p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <span style={{ height: 1, width: 26, background: `${accent}66` }} />
          <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: accent, letterSpacing: '0.08em' }}>
            {toRoman(count)} <span style={{ color: `${accent}77` }}>/ {toRoman(total)}</span>
          </p>
          <span style={{ height: 1, width: 26, background: `${accent}66` }} />
        </div>
        <p className="font-karla font-600 uppercase" style={{ letterSpacing: '0.2em', fontSize: '0.5rem', color: '#8a8a99', marginTop: 5 }}>
          {complete ? 'Every giant on the wall' : 'Giants of the Ancient Deep'}
        </p>
      </motion.div>
    </motion.div>
  )
}
