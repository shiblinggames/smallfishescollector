'use client'

// The Exchange's front door: an announcement, then a short guide.
//
// The Exchange opens at Fishing 100, which is MAX_LEVEL, so nobody arrives here
// by wandering in. It is the last thing fishing gives you and it deserves to be
// announced rather than to simply appear as a tab that stopped being greyed
// out. Act one says you earned it; act two says what the thing actually is.
//
// The guide exists because this screen breaks the rule every other screen in
// the game follows: everywhere else, spending doubloons gets you an object.
// Here it gets you a position that can end at zero. Nobody should learn that
// from their first expiry.
//
// Portaled to body. The market page sits inside PageTransition, and an ancestor
// transform makes position:fixed resolve against that ancestor instead of the
// viewport, which quietly turns a full-screen overlay into a box floating
// somewhere down the page.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { EXCHANGE_FISHING_LEVEL } from '@/lib/fishExchange'

const SKY = '#38bdf8'

type Page = { tag: string; title: string; body: string; accent: string; art?: 'payoff' | 'families' | 'report' }

// Six things, and only things the board does not already show you. Which index
// is up today is on screen; what a premium buys is not, and neither is the
// difference between a whole water and a single creature.
const PAGES: Page[] = [
  {
    tag: 'What you are buying',
    title: 'Contracts, not fish',
    body: 'Nothing here lands in your hold. You buy a contract on where a price is going, and the fish stays in the sea. The Hold is still where you sell what you actually caught.',
    accent: SKY,
  },
  {
    tag: 'Three choices',
    title: 'A way, a deadline, a price',
    body: 'Up or down. One day, three days or a week. Then the price it has to reach, which is the only one that decides anything. The board settles it for you at the hour it expires.',
    accent: '#a78bfa',
  },
  {
    tag: 'What it costs',
    title: 'The premium, and breakeven',
    body: 'You pay a premium up front, and that is the most you can ever lose. Past your target the contract pays more the further the price runs, so you turn a profit once it has covered the premium. That point is your breakeven.',
    accent: '#fbbf24',
    art: 'payoff',
  },
  {
    tag: 'The two families',
    title: 'Whole Waters, Single Species',
    body: 'A Whole Water is a whole fishing ground averaged together, so it drifts where a species lurches: steadier, cheaper to be right about, smaller swings. A Single Species moves several times as far in a day and gaps far harder on news. Waters to be patient with, species to take a swing at.',
    accent: '#4ade80',
    art: 'families',
  },
  {
    tag: 'News you can see coming',
    title: 'Catch reports and grounds surveys',
    body: 'Every index reports on a schedule, every few days. A species files a Catch Report, a water gets a Grounds Survey, and either one moves the price hard the hour it lands. The board counts down to it and turns gold when it is close. A contract running through a report costs more, because it carries that swing.',
    accent: '#f0c040',
    art: 'report',
  },
  {
    tag: 'The way out',
    title: 'Sell whenever you like',
    body: 'You are never stuck. A contract is worth something the whole time it runs, rising as the price moves your way and falling as the clock runs down. Take what it is worth and walk, or hold it to the end.',
    accent: '#f87171',
  },
]

/** Small diagrams. Three ideas here are shapes, not sentences: a payoff that
 *  hinges, two lines of different temperament, and a countdown that changes
 *  colour as it nears. */
function Art({ kind, accent }: { kind: NonNullable<Page['art']>; accent: string }) {
  if (kind === 'payoff') {
    return (
      <svg viewBox="0 0 240 84" width="100%" height="84" aria-hidden style={{ display: 'block' }}>
        <line x1="10" y1="60" x2="230" y2="60" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
        {/* flat while it is under the strike, then it climbs and keeps climbing */}
        <path d="M10 60 L120 60 L225 14" fill="none" stroke={accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <line x1="120" y1="8" x2="120" y2="70" stroke="rgba(255,255,255,0.28)" strokeWidth="1" strokeDasharray="3 3" />
        <line x1="163" y1="8" x2="163" y2="70" stroke="#ffd96a" strokeWidth="1" strokeDasharray="3 3" />
        <text x="120" y="80" fill="#8a94a4" fontSize="9" textAnchor="middle" fontFamily="system-ui">target</text>
        <text x="176" y="80" fill="#ffd96a" fontSize="9" textAnchor="middle" fontFamily="system-ui">breakeven</text>
        <text x="228" y="12" fill={accent} fontSize="9" textAnchor="end" fontFamily="system-ui">profit</text>
      </svg>
    )
  }
  if (kind === 'families') {
    return (
      <svg viewBox="0 0 240 84" width="100%" height="84" aria-hidden style={{ display: 'block' }}>
        <path d="M8 26 L28 24 L48 27 L68 23 L88 26 L108 22 L128 25 L148 21 L168 24 L188 20 L212 23"
          fill="none" stroke="#7dd3fc" strokeWidth="2" strokeLinejoin="round" />
        <text x="232" y="26" fill="#7dd3fc" fontSize="9" textAnchor="end" fontFamily="system-ui">water</text>
        <path d="M8 66 L28 52 L48 72 L68 46 L88 70 L108 40 L128 74 L148 44 L168 68 L188 38 L212 60"
          fill="none" stroke="#f0a35e" strokeWidth="2" strokeLinejoin="round" />
        <text x="232" y="70" fill="#f0a35e" fontSize="9" textAnchor="end" fontFamily="system-ui">species</text>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 240 84" width="100%" height="84" aria-hidden style={{ display: 'block' }}>
      <rect x="8" y="30" width="86" height="24" rx="12" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.10)" />
      <text x="51" y="46" fill="#8d96a5" fontSize="10" textAnchor="middle" fontFamily="system-ui">in 6d 4h</text>
      <rect x="102" y="30" width="76" height="24" rx="12" fill="rgba(56,189,248,0.13)" stroke="rgba(56,189,248,0.42)" />
      <text x="140" y="46" fill="#9fdcff" fontSize="10" textAnchor="middle" fontFamily="system-ui">in 1d 8h</text>
      <rect x="186" y="30" width="46" height="24" rx="12" fill="rgba(240,192,64,0.16)" stroke="rgba(240,192,64,0.55)" />
      <circle cx="198" cy="42" r="2.5" fill="#ffcf6a" />
      <text x="212" y="46" fill="#ffcf6a" fontSize="10" textAnchor="middle" fontFamily="system-ui">in 5h</text>
    </svg>
  )
}

export default function ExchangeIntro({
  celebrate,
  onDone,
}: {
  /** True on the very first open: leads with the announcement. False when the
   *  captain reopened the guide from the board and just wants to re-read it. */
  celebrate: boolean
  onDone: () => void
}) {
  const [act, setAct] = useState<'announce' | 'guide'>(celebrate ? 'announce' : 'guide')
  const [page, setPage] = useState(0)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // The page under an overlay should not scroll away behind it.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  if (!mounted) return null

  const p = PAGES[page]
  const last = page === PAGES.length - 1

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={act === 'announce' ? 'The Exchange is open' : 'How the Exchange works'}
      style={{
        position: 'fixed', inset: 0, zIndex: 130,
        background: 'rgba(4,7,12,0.88)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.25rem',
        overflowY: 'auto',
      }}
    >
      <AnimatePresence mode="wait">
        {act === 'announce' ? (
          <motion.div
            key="announce"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ type: 'spring', stiffness: 240, damping: 24 }}
            style={{
              position: 'relative', width: '100%', maxWidth: 400, margin: 'auto',
              borderRadius: 18, overflow: 'hidden',
              background: 'linear-gradient(180deg, rgba(16,24,38,0.99) 0%, rgba(7,10,16,0.99) 100%)',
              border: `1px solid ${SKY}55`,
              boxShadow: `0 20px 60px rgba(0,0,0,0.7), 0 0 44px ${SKY}22`,
            }}
          >
            {/* A ticker of green and red bars behind the title: the trading
                floor rather than treasure, since this is the one unlock in the
                game that is not a chest. Transform-only, so it costs nothing. */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: 0.16, pointerEvents: 'none' }}>
              {Array.from({ length: 22 }).map((_, i) => {
                const up = (i * 7) % 3 !== 0
                const h = 12 + ((i * 37) % 46)
                return (
                  <motion.div
                    key={i}
                    initial={{ scaleY: 0.2, opacity: 0 }}
                    animate={{ scaleY: 1, opacity: 1 }}
                    transition={{ delay: 0.15 + i * 0.028, type: 'spring', stiffness: 200, damping: 18 }}
                    style={{
                      position: 'absolute', bottom: 0, left: `${(i / 22) * 100}%`,
                      width: '3.2%', height: h + 40,
                      transformOrigin: 'bottom',
                      background: `linear-gradient(180deg, ${up ? '#4ade80' : '#f87171'}00 0%, ${up ? '#4ade80' : '#f87171'} 100%)`,
                    }}
                  />
                )
              })}
            </div>

            <div style={{ position: 'relative', padding: '1.6rem 1.35rem 1.3rem', textAlign: 'center' }}>
              <motion.p
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="font-karla font-700 uppercase tracking-[0.22em]"
                style={{ fontSize: '0.6rem', color: SKY }}
              >
                Fishing {EXCHANGE_FISHING_LEVEL} reached
              </motion.p>

              <motion.h2
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.18, type: 'spring', stiffness: 200, damping: 16 }}
                className="font-cinzel font-800"
                style={{ fontSize: '1.72rem', lineHeight: 1.15, color: '#f0f6ff', margin: '0.5rem 0 0', textWrap: 'balance' }}
              >
                The Exchange is open
              </motion.h2>

              <motion.div
                initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.34, duration: 0.45 }}
                style={{
                  height: 1, margin: '0.85rem auto', width: 130, transformOrigin: 'center',
                  background: `linear-gradient(90deg, transparent, ${SKY}, transparent)`,
                }}
              />

              <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.42 }}
                className="font-karla font-400"
                style={{ fontSize: '0.84rem', color: '#aeb9c9', lineHeight: 1.6 }}
              >
                You have taken every fish the sea has to teach. The board no longer
                just tells you what a catch is worth, it lets you take a position
                on where the price is going. Back a rise, back a fall, and let the
                tide pay you either way.
              </motion.p>

              <motion.button
                type="button"
                onClick={() => setAct('guide')}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
                className="font-karla font-800"
                style={{
                  width: '100%', marginTop: '1.15rem', padding: '0.72rem',
                  borderRadius: 11, fontSize: '0.82rem', color: '#e6f4ff',
                  background: `${SKY}22`, border: `1px solid ${SKY}70`,
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              >
                Show me how it works
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="guide"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 240, damping: 24 }}
            style={{
              width: '100%', maxWidth: 400, margin: 'auto',
              borderRadius: 18, overflow: 'hidden',
              background: 'linear-gradient(180deg, rgba(16,24,38,0.99) 0%, rgba(7,10,16,0.99) 100%)',
              border: '1px solid rgba(255,255,255,0.13)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            }}
          >
            {/* Progress: five ticks, the current one lit. Cheaper to read than
                "3 of 5" and it shows how much is left at a glance. */}
            <div style={{ display: 'flex', gap: 4, padding: '0.85rem 1.1rem 0' }}>
              {PAGES.map((_, i) => (
                <div key={i} style={{
                  flex: 1, height: 3, borderRadius: 2,
                  background: i <= page ? p.accent : 'rgba(255,255,255,0.12)',
                  transition: 'background 0.25s',
                }} />
              ))}
            </div>

            <div style={{ padding: '1.05rem 1.1rem 1.15rem', minHeight: 232 }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={page}
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="font-karla font-700 uppercase tracking-[0.17em]" style={{ fontSize: '0.58rem', color: p.accent }}>
                    {p.tag}
                  </p>
                  <h3 className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#f0f6ff', margin: '0.35rem 0 0.6rem', textWrap: 'balance' }}>
                    {p.title}
                  </h3>
                  <p className="font-karla font-400" style={{ fontSize: '0.83rem', color: '#aeb9c9', lineHeight: 1.62 }}>
                    {p.body}
                  </p>
                  {p.art && (
                    <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.4rem', borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <Art kind={p.art} accent={p.accent} />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <div style={{ display: 'flex', gap: 8, padding: '0 1.1rem 1.1rem' }}>
              {page > 0 && (
                <button
                  type="button" onClick={() => setPage(n => n - 1)}
                  className="font-karla font-700"
                  style={{
                    padding: '0.66rem 1rem', borderRadius: 10, fontSize: '0.78rem',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                    color: '#8a94a4', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => (last ? onDone() : setPage(n => n + 1))}
                className="font-karla font-800"
                style={{
                  flex: 1, padding: '0.66rem', borderRadius: 10, fontSize: '0.8rem',
                  background: `${p.accent}1f`, border: `1px solid ${p.accent}70`,
                  color: '#e9f1fb', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              >
                {last ? 'Take me to the board' : 'Next'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
