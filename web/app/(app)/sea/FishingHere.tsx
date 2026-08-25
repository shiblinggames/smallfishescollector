'use client'

// FISHING WHERE YOU ARE.
//
// The cast → bite → dial → reel loop, on the sea map, without leaving it.
//
// This is NOT a second fishing game. `FishingGame.tsx` is 12,037 lines and owns
// gear, the hold, the almanac, crates, Finn, prestige, tours and the ancient
// ceremonies. None of that moves here. What moves is the small loop in the
// middle of it, and it moves by CALLING THE SAME TWO SERVER ACTIONS rather than
// by being extracted:
//
//   castLine(bait, zone) → fishId, catchDifficulty, waitMs
//   reelIn(fishId, result, bait, …) → the catch
//
// Both take primitives and no session state, so the server neither knows nor
// cares that the call came from a map. That is what makes this days of work
// instead of surgery on the biggest file in the app.
//
// THE DIAL MATH IS THE REAL ONE. `buildFishZones` is the same function the
// fishing screen calls, with the same modifiers threaded in: hook tier, line
// penalty, the zone's own catch multiplier, level bonus, bait and rod. Getting
// this wrong would mean easier or harder fish depending on which screen you
// happened to cast from, which is worse than not shipping it.
//
// What is deliberately absent: events, boss mechanics and the Ancient Deep's
// drift. Those are situational and belong to the full screen, and the map does
// not offer the Ancient Deep as a quick cast.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DialSVG } from '@/components/FishingDial'
import { ResultCard } from '@/components/CatchResultCard'
import { buildFishZones, ZONE_DIFFICULTY, type ZoneDef } from '../fishing/depths'
import { castLine, reelIn, type FishSpecies } from '../fishing/actions'
import { levelCatchBonus } from '@/lib/fishingLevel'
import { vibrate } from '@/lib/haptics'
import { unlockFishingAudio, playCastSfx, playCast2Sfx, playPerfectSfx } from '@/lib/fishingMusic'
import type { FishSizeTier } from '@/lib/fishSize'

/** How fast the needle sweeps, degrees/sec. Matches the fishing screen's feel
 *  closely enough to be the same skill; it is not a different minigame. */
const SWEEP = 210

/** `reeling` is the beat that was missing. The dial used to vanish on the same
 *  tick as the tap, so the needle never visibly LANDED — you tapped and the
 *  instrument was simply gone, which is why hitting a perfect felt like hitting
 *  nothing. Now the dial stays up, frozen on the angle that resolved, long
 *  enough to show the snap and the gold burst, and the card comes after. */
type Phase = 'idle' | 'waiting' | 'hooked' | 'reeling' | 'result'

/** How long the frozen dial holds before the card. A perfect earns longer:
 *  the burst ring runs 450ms and cutting it off is the whole complaint. */
const HOLD_MS = 620
const HOLD_PERFECT_MS = 900

type Hooked = { fishId: number; catchDifficulty: number }

/** Everything the shared ResultCard needs. `reelIn` already returns all of it —
 *  the map was throwing it away and printing a name and an XP number. */
type Caught =
  | { kind: 'fish'; card: React.ComponentProps<typeof ResultCard> }
  | { kind: 'miss'; result: 'miss' | 'penalty' }

export type FishingMods = {
  hookTier: number
  linePenalty: number
  rodCatchBonus: number
  rodPerfectBonus: number
  fishingLevel: number
}

export default function FishingHere({
  zone, zoneName, bait, baitBonus, baitLeft, mods, onBaitSpent, onPose, onClose,
}: {
  zone: string
  zoneName: string
  bait: string
  baitBonus: number
  baitLeft: number
  mods: FishingMods
  onBaitSpent: (left: number | undefined) => void
  /** Which pose the captain should be in. The game already draws three — rod
   *  up, mid-cast, line in the water — so the map plays those rather than
   *  inventing a fourth. */
  onPose: (pose: 'rest' | 'wait' | 'cast') => void
  onClose: () => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [err, setErr] = useState('')
  const [hooked, setHooked] = useState<Hooked | null>(null)
  const [caught, setCaught] = useState<Caught | null>(null)
  const [angle, setAngle] = useState(0)
  // THE TACTILE HIT, and it was here the whole time. DialSVG already draws the
  // snap-and-ripple on reel and the gold burst on a perfect — it just needs to
  // be TOLD, via these two counters. The map was rendering the dial without
  // them, so the instrument was correct and completely mute.
  const [snapKey, setSnapKey] = useState(0)
  const [burstKey, setBurstKey] = useState(0)

  const angleRef = useRef(0)
  const runningRef = useRef(false)
  // TWO timers, two refs. The cast-pose timer and the bite timer overlap by
  // design, and sharing one handle meant the second assignment orphaned the
  // first — so unmounting mid-cast could still fire a pose change at a
  // component that no longer exists.
  const poseRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const zones: ZoneDef[] = useMemo(() => {
    if (!hooked) return []
    const zd = ZONE_DIFFICULTY[zone] ?? ZONE_DIFFICULTY.shallows
    return buildFishZones(
      hooked.catchDifficulty,
      mods.hookTier,
      mods.linePenalty,
      zd.catchMultiplier,
      levelCatchBonus(mods.fishingLevel) + baitBonus + mods.rodCatchBonus,
      mods.rodPerfectBonus + 1,
    )
  }, [hooked, zone, mods, baitBonus])

  // ── The sweep ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'hooked') { runningRef.current = false; return }
    runningRef.current = true
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      if (!runningRef.current) return
      // Clamped, so a backgrounded tab does not resume with the needle having
      // silently swept a full revolution while nobody was looking.
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      angleRef.current = (angleRef.current + SWEEP * dt) % 360
      setAngle(angleRef.current)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => { runningRef.current = false; cancelAnimationFrame(raf) }
  }, [phase])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (poseRef.current) clearTimeout(poseRef.current)
  }, [])

  const cast = useCallback(() => {
    if (phase !== 'idle') return
    setErr('')
    setCaught(null)
    setPhase('waiting')
    vibrate(12)
    // The first Cast is the user gesture the AudioContext needs, so the unlock
    // rides on it. This wires the graph and decodes the SFX buffers WITHOUT
    // starting the soundtrack — the map is not the fishing screen and should
    // not seize the music. Every call after the first is a no-op.
    unlockFishingAudio()
    playCastSfx()
    // THE CAST IS A BEAT, not a state change. Rod comes over, and only once it
    // has does the line settle into the water. Skipping it was most of why
    // pressing Cast looked like nothing had happened: the pose never changed
    // and the only feedback was six small words for the several seconds the
    // server makes you wait for a bite.
    onPose('cast')
    poseRef.current = setTimeout(() => { onPose('wait'); playCast2Sfx() }, 460)
    castLine(bait, zone).then(res => {
      if ('error' in res) { setErr(res.error); setPhase('idle'); onPose('rest'); return }
      onBaitSpent(res.baitRemaining)
      // The server decides how long the fish takes to come. Honoured rather
      // than hurried: the wait is the tension.
      const wait = Math.max(560, res.instantBite ? 620 : res.waitMs)
      timerRef.current = setTimeout(() => {
        angleRef.current = 0
        setAngle(0)
        setHooked({ fishId: res.fishId, catchDifficulty: res.catchDifficulty })
        setPhase('hooked')
        vibrate([0, 26, 40, 18])
      }, wait)
    }).catch((e: unknown) => {
      // NO CATCH HERE MEANT NOTHING EVER HAPPENED. A server action that rejects
      // rather than returning { error } skipped the whole .then, so the line
      // stayed out, the pose stayed in the water, and the dial never came —
      // silently, forever. Anything that can leave the loop stuck has to say so.
      setErr(e instanceof Error ? e.message : 'The line came back empty. Try again.')
      setPhase('idle')
      onPose('rest')
    })
  }, [phase, bait, zone, onBaitSpent, onPose])

  const strike = useCallback(() => {
    if (phase !== 'hooked' || !hooked) return
    // FREEZE FIRST. The angle that resolves is the angle that was on screen when
    // the thumb landed — read once, then stop the sweep. Reading it after the
    // stop would judge a needle that had moved on.
    runningRef.current = false
    const at = angleRef.current
    const hit = zones.find(z => at >= z.from && at < z.to)
    const result = (hit?.type ?? 'miss') as 'perfect' | 'catch' | 'miss' | 'penalty'
    const perfect = result === 'perfect'

    // THE HIT, in the tap's own JS tick — same order the fishing screen uses.
    // Sound and haptic go first because they are the ones you FEEL as
    // simultaneous; the dial's snap and burst paint on the commit that follows.
    // The haptic patterns are lifted from FishingGame rather than invented: a
    // perfect is a distinct three-pulse buzz and everything else is a single
    // short tick that only says "registered". Two different signals is the
    // whole point, and the map had been giving three vague ones.
    if (perfect) { playPerfectSfx(); vibrate([40, 60, 80]); setBurstKey(k => k + 1) }
    else vibrate(6)
    setSnapKey(k => k + 1)
    setPhase('reeling')
    onPose('rest')

    // The dial holds, frozen, while the server resolves. Both have to finish
    // before the card: landing on the answer before the needle has visibly
    // stopped is exactly the "no response" the reel had.
    const held = new Promise<void>(r => setTimeout(r, perfect ? HOLD_PERFECT_MS : HOLD_MS))

    reelIn(hooked.fishId, result, bait).then(async res => {
      await held
      if ('error' in res) { setErr(res.error); setPhase('idle'); setHooked(null); return }
      if ('caught' in res && res.caught) {
        // Straight through to the shared card. Everything here comes off the
        // same payload the fishing screen reads, so a personal best or a shiny
        // landed from the map gets the identical moment.
        setCaught({
          kind: 'fish',
          card: {
            fish: res.fish as FishSpecies,
            baitSaved: res.baitSaved,
            isNewSpecies: res.isNewSpecies,
            isPerfect: perfect,
            xpGained: res.xpGained,
            doubleCatch: false,
            perfectStreak: res.perfectStreak ?? 1,
            streakBonusXP: res.streakBonusXP ?? 0,
            catchQty: res.catchQty ?? 1,
            sizeIn: res.sizeIn,
            sizeMin: res.sizeMin,
            sizeMax: res.sizeMax,
            sizeTier: res.sizeTier as FishSizeTier | undefined,
            isPB: res.isPB,
            previousBest: res.previousBest,
            isShiny: res.isShiny,
            vigilRankUp: res.vigilRankUp ?? null,
          },
        })
      } else {
        setCaught({ kind: 'miss', result: result === 'penalty' ? 'penalty' : 'miss' })
      }
      setPhase('result')
      setHooked(null)
    }).catch(async (e: unknown) => {
      await held
      setErr(e instanceof Error ? e.message : 'Lost the fish on the way in.')
      setHooked(null)
      setPhase('idle')
    })
  }, [phase, hooked, zones, bait, onPose])

  const dismiss = useCallback(() => { setCaught(null); setPhase('idle') }, [])

  return (
    <div
      /* THE ROD IS NOT A RUDDER. Cast and Reel In stop `pointerdown`, but the
         map steers on `click` — and stopping pointerdown does nothing to the
         click that follows it, so every cast was also plotting a course to
         wherever the button happened to be. Caught at the root: nothing in
         here is ever a steering tap. */
      onClick={e => e.stopPropagation()}
      style={{
      position: 'absolute', inset: 0, zIndex: 20,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      alignItems: 'center', paddingBottom: 26, pointerEvents: 'none',
    }}>
      {/* THE DIAL AND ITS BUTTON, exactly as the fishing screen has them.
          The dial reads, the BUTTON acts — I had made the dial itself the tap
          target, which is a different instrument to the one every player has
          already learned. Both are lifted from FishingGame: the same 88px
          circle, the same gold, the same chunky press, the same ripples. */}
      <AnimatePresence>
        {(phase === 'hooked' || phase === 'reeling') && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.14 } }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            style={{ pointerEvents: 'none', marginBottom: 12, width: 260 }}>
            <DialSVG zones={zones} angle={angle} needleColor="#f4e3b2" zoneOpacityFn={() => 1}
              snapKey={snapKey} perfectBurstKey={burstKey} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {phase === 'result' && caught && (
          <motion.div key="result" onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            style={{
              pointerEvents: 'auto', width: '100%', maxWidth: 380,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            }}>
            {/* The card is tall — new species, a PB and a streak all stack rows
                onto it — and this overlay is anchored to the bottom of the sea,
                not to a page that scrolls. Cap it and let the card scroll inside
                itself, so Cast Again never ends up off the top of the screen. */}
            <div data-no-steer style={{
              width: '100%', maxHeight: '58vh', overflowY: 'auto', overscrollBehavior: 'contain',
              // The map sets touch-action: none so a drag steers instead of
              // scrolling the page. This card is the one thing inside it that
              // genuinely wants a vertical drag, so it takes that back.
              touchAction: 'pan-y',
            }}>
            {caught.kind === 'fish' ? (
              /* THE SAME CARD. Not a summary of it — the component the fishing
                 screen renders, handed the same payload. See
                 components/CatchResultCard for why it moved out of FishingGame. */
              <ResultCard {...caught.card} />
            ) : (
              <div style={{
                width: '100%', borderRadius: 16, padding: '1rem 1.15rem', textAlign: 'center',
                background: 'rgba(8,16,24,0.94)',
                border: '1px solid rgba(180,214,232,0.28)',
              }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#d9b7b7' }}>
                  {caught.result === 'penalty' ? 'Snagged' : 'It got away'}
                </p>
                <p className="font-karla" style={{ fontSize: '0.8rem', color: '#9fb4c2', marginTop: 6 }}>
                  {caught.result === 'penalty'
                    ? 'The line fouled and took a bait with it.'
                    : 'The line went slack. Cast again.'}
                </p>
              </div>
            )}
            </div>
            <button onClick={e => { e.stopPropagation(); dismiss() }}
              className="font-cinzel font-700"
              style={{
                cursor: 'pointer', padding: '0.7rem 1.6rem', borderRadius: 12,
                fontSize: '0.88rem', color: '#f2ead8',
                background: 'rgba(10,20,28,0.9)',
                border: '1px solid rgba(180,214,232,0.45)',
                boxShadow: '0 6px 22px rgba(0,0,0,0.5)',
              }}>
              Cast Again
            </button>
          </motion.div>
        )}

        {phase === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            {err && <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: '#e6a0a0', textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}>{err}</p>}
            <motion.button
              onPointerDown={e => { e.preventDefault(); e.stopPropagation(); cast() }}
              className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
              style={{
                width: 88, height: 88, borderRadius: '50%',
                background: 'radial-gradient(ellipse at 40% 35%, rgba(14,116,144,0.45), rgba(14,116,144,0.18))',
                border: '1px solid rgba(34,170,200,0.5)', cursor: 'pointer',
                fontSize: '0.72rem', color: '#67d4e8', touchAction: 'manipulation',
                boxShadow: '0 6px 0 rgba(0,0,0,0.6), 0 0 28px rgba(14,116,144,0.35), inset 0 1px 0 rgba(255,255,255,0.12)',
              }}
              initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}
              whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.6)' }}
              transition={{ type: 'spring', stiffness: 600, damping: 22 }}>
              Cast
            </motion.button>
            <button onClick={e => { e.stopPropagation(); onClose() }}
              className="font-karla font-700"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.72rem', color: 'rgba(190,212,228,0.8)',
                textShadow: '0 1px 8px rgba(0,0,0,0.9)',
                borderBottom: '1px solid rgba(190,212,228,0.32)', paddingBottom: 1,
              }}>
              Stow rod · {zoneName} · {baitLeft} bait
            </button>
          </motion.div>
        )}

        {phase === 'hooked' && (
          <motion.button key="reel"
            onPointerDown={e => { e.preventDefault(); e.stopPropagation(); strike() }}
            className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
            style={{
              pointerEvents: 'auto',
              width: 88, height: 88, borderRadius: '50%',
              background: 'radial-gradient(ellipse at 40% 35%, rgba(240,192,64,0.28), rgba(240,192,64,0.08))',
              border: '1px solid rgba(240,192,64,0.4)', cursor: 'pointer',
              fontSize: '0.72rem', color: '#f0c040', touchAction: 'manipulation',
              boxShadow: '0 6px 0 rgba(0,0,0,0.5), 0 0 22px rgba(240,192,64,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
            }}
            initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}
            whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.5)' }}
            transition={{ type: 'spring', stiffness: 600, damping: 22 }}>
            Reel In
          </motion.button>
        )}

        {phase === 'waiting' && (
          <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
            {/* Three dots breathing out of phase. The wait is three to twelve
                seconds and the only feedback used to be six small words, which
                is indistinguishable from a hang. Something has to be moving. */}
            <div style={{ display: 'flex', gap: 7 }}>
              {[0, 1, 2].map(i => (
                <motion.span key={i}
                  animate={{ opacity: [0.25, 1, 0.25], y: [0, -4, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.22, ease: 'easeInOut' }}
                  style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(214,232,240,0.9)' }} />
              ))}
            </div>
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '0.7rem', letterSpacing: '0.18em', color: 'rgba(200,220,232,0.8)',
              textShadow: '0 1px 10px rgba(0,0,0,0.9)',
            }}>
              Waiting on a bite
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
