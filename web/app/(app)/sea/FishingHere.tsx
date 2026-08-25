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
import { buildFishZones, ZONE_DIFFICULTY, type ZoneDef } from '../fishing/depths'
import { castLine, reelIn } from '../fishing/actions'
import { levelCatchBonus } from '@/lib/fishingLevel'
import { vibrate } from '@/lib/haptics'

/** How fast the needle sweeps, degrees/sec. Matches the fishing screen's feel
 *  closely enough to be the same skill; it is not a different minigame. */
const SWEEP = 210

type Phase = 'idle' | 'waiting' | 'hooked' | 'result'

type Hooked = { fishId: number; catchDifficulty: number }
type Caught = { name: string; xp: number; result: string; perfect: boolean }

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
    // THE CAST IS A BEAT, not a state change. Rod comes over, and only once it
    // has does the line settle into the water. Skipping it was most of why
    // pressing Cast looked like nothing had happened: the pose never changed
    // and the only feedback was six small words for the several seconds the
    // server makes you wait for a bite.
    onPose('cast')
    poseRef.current = setTimeout(() => onPose('wait'), 460)
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
    vibrate(result === 'perfect' ? [0, 30, 40, 60] : result === 'catch' ? 18 : 10)
    setPhase('result')
    onPose('rest')
    reelIn(hooked.fishId, result, bait).then(res => {
      if ('error' in res) { setErr(res.error); setPhase('idle'); return }
      if ('caught' in res && res.caught) {
        setCaught({
          name: res.fish.name, xp: res.xpGained,
          result, perfect: result === 'perfect',
        })
      } else {
        setCaught({ name: '', xp: 0, result, perfect: false })
      }
      setHooked(null)
    }).catch((e: unknown) => {
      setErr(e instanceof Error ? e.message : 'Lost the fish on the way in.')
      setHooked(null)
      setPhase('idle')
    })
  }, [phase, hooked, zones, bait, onPose])

  const dismiss = useCallback(() => { setCaught(null); setPhase('idle') }, [])

  return (
    <div style={{
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
        {phase === 'hooked' && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.14 } }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            style={{ pointerEvents: 'none', marginBottom: 12, width: 260 }}>
            <DialSVG zones={zones} angle={angle} needleColor="#f4e3b2" zoneOpacityFn={() => 1} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {phase === 'result' && caught && (
          <motion.button key="result" onClick={e => { e.stopPropagation(); dismiss() }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="font-cinzel font-700"
            style={{
              pointerEvents: 'auto', cursor: 'pointer',
              padding: '0.8rem 1.5rem', borderRadius: 14, fontSize: '0.95rem',
              color: caught.name ? '#f6ecd6' : '#d9b7b7',
              background: 'rgba(8,16,24,0.9)',
              border: `1px solid ${caught.perfect ? 'rgba(253,230,138,0.65)' : 'rgba(180,214,232,0.4)'}`,
              boxShadow: caught.perfect ? '0 0 30px rgba(253,230,138,0.25)' : '0 6px 22px rgba(0,0,0,0.5)',
            }}>
            {caught.name
              ? `${caught.perfect ? 'Perfect! ' : ''}${caught.name}  ·  +${caught.xp} XP`
              : caught.result === 'penalty' ? 'Snagged. Line lost.' : 'It got away.'}
          </motion.button>
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
