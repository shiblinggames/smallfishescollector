'use client'

// ── THE ROOM TALKING ────────────────────────────────────────────────────────
//
// Three snatches of conversation at the top of the tavern, and one of them is
// replaced every few seconds. See lib/tavernGossip for why the game's hints
// come out of other people's mouths rather than a tips panel.
//
// ── ONE AT A TIME, ROUND ROBIN ──────────────────────────────────────────────
//
// Swapping all three at once is a slideshow: the whole panel changes, you know
// something replaced it, and you re-read from the top. Replacing ONE while the
// other two sit still is how a room actually moves. Your eye catches the change
// where it happened and the rest of the page stays where you left it.
//
// SLOW, because these are sentences. Seven seconds is long enough to finish the
// one you started and short enough that the room is never still, and the house
// rule on juice is that the longer a thing is on screen the quieter it has to
// be. Nothing here slides or bounces; a line fades out and another fades in.
//
// ── AND IT SHUFFLES AFTER MOUNT, NOT DURING RENDER ──────────────────────────
//
// Picking at random while rendering gives the server one set and the client
// another, and React reports the mismatch. So the first paint is a reserved
// box and the deck is dealt in an effect. It costs one frame and it is the
// difference between a room and a hydration error.

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { shuffled, type Overheard } from '@/lib/tavernGossip'

/** How many are audible at once. Three fills the corner of an eye without
 *  becoming a page of dialogue. */
const SHOWN = 3
const EVERY_MS = 7000

export default function Gossip() {
  const [heard, setHeard] = useState<Overheard[] | null>(null)
  const deck = useRef<Overheard[]>([])
  const at = useRef(0)
  const slot = useRef(0)

  useEffect(() => {
    deck.current = shuffled()
    at.current = SHOWN
    setHeard(deck.current.slice(0, SHOWN))

    const next = () => {
      // Reshuffle when the deck runs out, so nothing repeats until everything
      // has been said once.
      if (at.current >= deck.current.length) {
        deck.current = shuffled()
        at.current = 0
      }
      const line = deck.current[at.current++]
      const i = slot.current
      slot.current = (slot.current + 1) % SHOWN
      setHeard(prev => {
        if (!prev) return prev
        const out = [...prev]
        out[i] = line
        return out
      })
    }
    // Paused while nobody is looking. A room nobody is in does not need to keep
    // talking, and coming back to a tab that has cycled forty lines in the
    // background has not gained anybody anything.
    let id = setInterval(next, EVERY_MS)
    const onVis = () => {
      clearInterval(id)
      if (document.visibilityState !== 'hidden') id = setInterval(next, EVERY_MS)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  return (
    <section style={{
      borderRadius: 16, padding: '0.85rem 1rem 0.9rem',
      background: 'linear-gradient(180deg, rgba(28,22,12,0.55) 0%, rgba(12,10,6,0.75) 100%), #0b0906',
      border: '1px solid rgba(200,170,100,0.22)',
    }}>
      <p className="font-karla font-700 uppercase" style={{
        fontSize: '0.56rem', letterSpacing: '0.18em', color: 'rgba(200,170,100,0.8)', margin: '0 0 0.7rem',
      }}>Overheard</p>

      {/* A RESERVED BOX. Lines are one to three sentences and the panel would
          jump on every swap without a floor under it. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 168 }}>
        {(heard ?? Array.from({ length: SHOWN }, () => null)).map((o, i) => (
          <div key={i} style={{ minHeight: 44 }}>
            <AnimatePresence mode="wait">
              {o && (
                <motion.div
                  // Keyed on the line so a swap in this slot is an exit and an
                  // enter rather than the text changing under you.
                  key={o.say.join('|')}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.55, ease: 'easeInOut' }}
                >
                  {o.say.map((line, k) => (
                    <p key={k} className="font-karla" style={{
                      fontSize: '0.82rem', lineHeight: 1.45, margin: k === 0 ? 0 : '2px 0 0',
                      // THE SECOND VOICE IS DIMMER AND INDENTED. Two people, and
                      // without the shift a back and forth reads as one person
                      // contradicting themselves.
                      color: k === 0 ? 'rgba(228,214,186,0.92)' : 'rgba(200,182,150,0.62)',
                      paddingLeft: k === 0 ? 0 : 14,
                      fontStyle: 'italic',
                    }}>
                      &ldquo;{line}&rdquo;
                    </p>
                  ))}
                  <p className="font-karla font-700 uppercase" style={{
                    fontSize: '0.5rem', letterSpacing: '0.16em',
                    color: 'rgba(200,170,100,0.42)', margin: '4px 0 0',
                  }}>{o.from}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  )
}
