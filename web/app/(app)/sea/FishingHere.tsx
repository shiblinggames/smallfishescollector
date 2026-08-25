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
import { XPBarDisplay } from '@/components/FishingXPBar'
import CrateOpening, { type CrateTierId, type CrateLootView } from '@/components/CrateOpening'
import { buildFishZones, ZONE_DIFFICULTY, FISH_DIFFICULTY_SPEED, type ZoneDef } from '../fishing/depths'
import { castLine, reelIn, reelCrate, type FishSpecies } from '../fishing/actions'
import { levelCatchBonus } from '@/lib/fishingLevel'
import { vibrate } from '@/lib/haptics'
import { unlockFishingAudio, playCastSfx, playCast2Sfx, playPerfectSfx } from '@/lib/fishingMusic'
import type { FishSizeTier } from '@/lib/fishSize'

/**
 * HOW FAST THE NEEDLE SWEEPS, and this was WRONG in a way that mattered.
 *
 * It was a flat 210 degrees a second for every fish and every reel. The fishing
 * screen rolls it per bite from FISH_DIFFICULTY_SPEED — 120-185 for a common,
 * 490-650 for the hardest — scaled by the equipped reel's own multiplier.
 *
 * So the map was making easy fish slightly HARDER than they should be and hard
 * fish about three times EASIER, and your reel did nothing at all out here.
 * That is not a presentation difference, it is a different game with the same
 * arithmetic behind it, and it is the sort of gap somebody eventually notices
 * is the cheapest place to farm legendaries.
 *
 * Rolled once per bite and held for the whole spin, exactly as the fishing
 * screen does — a mid-spin change reads as a stutter.
 */
function rollSweep(catchDifficulty: number, reelMult: number): number {
  const d = FISH_DIFFICULTY_SPEED[Math.max(0, Math.min(4, catchDifficulty - 1))]
  return (d.speedMin + Math.random() * (d.speedMax - d.speedMin)) * reelMult
}

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

/** EVERYTHING THE CAST ROLLED, carried through to the result.
 *
 *  castLine returns the jackpot multiplier, the double catch, the Locked-In
 *  haul and the crate tier, and the map was dropping all of them on the floor.
 *  The server still applied them — it rebinds every one of these off its own
 *  pending_cast token and ignores whatever the client claims — so the player
 *  was being PAID correctly and simply never told. */
type Hooked = {
  fishId: number
  catchDifficulty: number
  sweep: number
  crateTier?: string
  jackpotMult?: number
  doubleCatch?: boolean
  catchQty?: number
  lockedStage?: number
}

/** Everything the shared ResultCard needs. `reelIn` already returns all of it —
 *  the map was throwing it away and printing a name and an XP number. */
type Caught =
  | { kind: 'fish'; card: React.ComponentProps<typeof ResultCard> }
  | { kind: 'crate'; tier: string; loot: CrateLootView }
  | { kind: 'miss'; result: 'miss' | 'penalty' }

export type FishingMods = {
  /** The equipped reel's needle-speed multiplier. Lower is slower is easier,
   *  and leaving it out meant every reel tier was identical on the map. */
  reelSpeedMult: number
  hookTier: number
  linePenalty: number
  rodCatchBonus: number
  rodPerfectBonus: number
  fishingLevel: number
}

export default function FishingHere({
  zone, zoneName, bait, baitBonus, baitLeft, mods, fishingXP, onBaitSpent, onPose, spritesReady, onClose,
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
  /** For the level bar along the top. The map casts into the same XP pool, so
   *  it shows the same bar. */
  fishingXP: number
  onPose: (pose: 'rest' | 'wait' | 'cast') => void
  /** False until every frame of the loadout has been fetched AND decoded. The
   *  cast waits on it, because the pose swaps four images at once and an
   *  undecoded one paints a frame or two late — which is the base sprite
   *  changing pose while the boat is still in the old one. See SeaMap. */
  spritesReady: boolean
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
  /** The speed rolled for THIS bite. In a ref so the rAF reads it without the
   *  sweep effect being rebuilt when it changes. */
  const sweepRef = useRef(210)
  const runningRef = useRef(false)
  /** The Lightsaber's Lightspeed cue. The rod flashed the fish onto the line
   *  and the map was saying nothing about it. */
  const [instantBite, setInstantBite] = useState(false)
  // THREE overlapping timers, three refs. The cast splash, the pose flip and
  // the bite all run at once, and sharing a handle means the second assignment
  // orphans the first — which is how unmounting mid-cast could still fire a
  // pose change at a component that no longer exists, and how the pose flip
  // would silently vanish whenever the server answered inside 650ms.
  const poseRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sfxRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
      angleRef.current = (angleRef.current + sweepRef.current * dt) % 360
      setAngle(angleRef.current)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => { runningRef.current = false; cancelAnimationFrame(raf) }
  }, [phase])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (poseRef.current) clearTimeout(poseRef.current)
    if (sfxRef.current) clearTimeout(sfxRef.current)
  }, [])

  const cast = useCallback(() => {
    if (phase !== 'idle' || !spritesReady) return
    setErr('')
    setCaught(null)
    // THE DIAL FLASHING AFTER REEL IN. `hooked` used to be cleared the instant
    // the server answered, which emptied `zones` while the dial was still
    // playing its 140ms exit — so every arc vanished a frame before the dial
    // did and the whole instrument appeared to blink. It is cleared HERE
    // instead, at the start of the next cast, by which point nothing is
    // looking at it.
    setHooked(null)
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
    // 600 then 650, lifted from FishingGame rather than picked. The gap is
    // deliberate there: Web Audio's BufferSource.start has ~30-60ms of startup
    // latency on iOS, so the splash is fired 50ms AHEAD of the pose flip to
    // land with it. I had both at 460, which was both the wrong tempo and the
    // sound arriving after the line.
    sfxRef.current = setTimeout(() => playCast2Sfx(), 600)
    poseRef.current = setTimeout(() => onPose('wait'), 650)
    castLine(bait, zone).then(res => {
      if ('error' in res) { setErr(res.error); setPhase('idle'); onPose('rest'); return }
      onBaitSpent(res.baitRemaining)
      // The server decides how long the fish takes to come. Honoured rather
      // than hurried: the wait is the tension.
      // Floored above the 650ms cast animation: an instant bite that landed
      // mid-cast would put the dial up while the rod was still coming over.
      const wait = Math.max(760, res.instantBite ? 820 : res.waitMs)
      timerRef.current = setTimeout(() => {
        angleRef.current = 0
        setAngle(0)
        sweepRef.current = rollSweep(res.catchDifficulty, mods.reelSpeedMult)
        setHooked({
          fishId: res.fishId,
          catchDifficulty: res.catchDifficulty,
          sweep: sweepRef.current,
          crateTier: res.crateTier,
          jackpotMult: res.jackpotMult,
          doubleCatch: res.doubleCatch,
          catchQty: res.catchQty,
          lockedStage: res.lockedStage,
        })
        setPhase('hooked')
        vibrate([0, 26, 40, 18])
      }, wait)
      // Lightsaber Lightspeed cue, fired at the CAST rather than the bite —
      // the whole point of it is that the wait did not happen.
      if (res.instantBite) {
        setInstantBite(true)
        setTimeout(() => setInstantBite(false), 1100)
      }
    }).catch((e: unknown) => {
      // NO CATCH HERE MEANT NOTHING EVER HAPPENED. A server action that rejects
      // rather than returning { error } skipped the whole .then, so the line
      // stayed out, the pose stayed in the water, and the dial never came —
      // silently, forever. Anything that can leave the loop stuck has to say so.
      setErr(e instanceof Error ? e.message : 'The line came back empty. Try again.')
      setPhase('idle')
      onPose('rest')
    })
  }, [phase, spritesReady, bait, zone, mods.reelSpeedMult, onBaitSpent, onPose])

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

    // ── A CRATE IS NOT A FISH, and the map was destroying them ──────────
    //
    // castLine can hand back a CRATE instead of a fish, and a crate has to be
    // reeled with reelCrate. Passing one to reelIn does not fail loudly: reelIn
    // sees CRATE_FISH_ID on its own pending_cast token, returns { caught:
    // false } — and the token is ALREADY consumed by the atomic claim above
    // that line. So the crate was spent, nothing was granted, and the player
    // was shown "it got away". Every crate anyone pulled up on this map was
    // quietly thrown overboard.
    if (hooked.crateTier) {
      const tier = hooked.crateTier as CrateTierId
      const isCatch = result === 'perfect' || result === 'catch'
      if (!isCatch) {
        held.then(() => { setCaught({ kind: 'miss', result: result === 'penalty' ? 'penalty' : 'miss' }); setPhase('result') })
        return
      }
      reelCrate(zone, tier, result as 'perfect' | 'catch').then(async loot => {
        await held
        if ('error' in loot) { setErr(loot.error); setPhase('idle'); return }
        setCaught({ kind: 'crate', tier, loot })
        setPhase('result')
      }).catch(() => {
        setErr('The crate slipped the line.')
        setPhase('idle')
      })
      return
    }

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
            // FROM THE CAST, not invented. All three were hard-coded to
            // nothing, so a jackpot or a double catch paid out silently and
            // the card said you had landed one ordinary fish.
            doubleCatch: hooked.doubleCatch ?? false,
            jackpotMultiplier: hooked.jackpotMult,
            lockedStage: hooked.lockedStage ?? 0,
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
    }).catch(async (e: unknown) => {
      await held
      setErr(e instanceof Error ? e.message : 'Lost the fish on the way in.')
      setPhase('idle')
    })
  }, [phase, hooked, zones, bait, zone, onPose])

  /** `castAgain` needs the current `cast`, but `cast` is declared above it and
   *  is rebuilt whenever phase changes. Mirroring it to a ref keeps them in
   *  step without either depending on the other. */
  const castRef = useRef<(() => void) | null>(null)
  castRef.current = cast

  /** Cast straight out of the result, exactly as the fishing screen does: the
   *  card stays in the content area and the action slot goes back to Cast, so
   *  there is never a separate dismiss step to hunt for. */
  const castAgain = useCallback(() => {
    setCaught(null)
    setPhase('idle')
    // `cast` reads phase from its closure, so it cannot be called in the same
    // tick as the setState that unblocks it. A microtask is after the commit.
    queueMicrotask(() => castRef.current?.())
  }, [])

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
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', pointerEvents: 'none',
      }}>

      {/* LIGHTSPEED. The Lightsaber and its kin roll an instant bite, and the
          whole experience of that effect is the wait NOT happening — which is
          invisible unless something says so. Lifted from the fishing screen,
          same red bolt, same 1100ms. */}
      <AnimatePresence>
        {instantBite && (
          <motion.div key="instant-bite"
            initial={{ opacity: 0, scale: 0.7, x: '-50%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%' }}
            exit={{ opacity: 0, scale: 0.9, x: '-50%' }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            style={{
              position: 'absolute', top: 60, left: '50%', zIndex: 30, pointerEvents: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '0.32rem 0.72rem', borderRadius: 999,
              background: 'linear-gradient(180deg, rgba(255,59,71,0.32) 0%, rgba(224,0,34,0.18) 100%)',
              border: '1px solid rgba(255,90,100,0.7)',
              boxShadow: '0 0 18px rgba(255,40,60,0.5), inset 0 0 8px rgba(255,255,255,0.22)',
            }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" aria-hidden style={{ filter: 'drop-shadow(0 0 4px #ff3344)' }}>
              <path d="M13 2L3 14h7l-1 8 11-13h-7z" />
            </svg>
            <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.56rem', color: '#fff', textShadow: '0 0 8px rgba(255,60,70,0.85)' }}>Instant Bite</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── THE BAR, along the top ────────────────────────────────────────
          The fishing screen's own component, not a copy of it. Casting on the
          map without it meant the XP went somewhere invisible, and the map's
          fishing stopped reading as the same activity as the fishing screen's. */}
      <div style={{
        pointerEvents: 'auto', width: '100%', flexShrink: 0,
        // THE FISHING SCREEN'S OWN NUMBERS. It centres a max-w-md column and
        // pads it 1rem, and its XP bar carries 0.6rem beneath. I had 0.5rem of
        // top padding and no column, so the bar sat hard against the nav with
        // half the breathing room it has on the page it came from.
        maxWidth: 448, margin: '0 auto',
        padding: '1rem 1rem 0.6rem',
      }}>
        <XPBarDisplay xp={fishingXP} />
      </div>

      {/* ── CONTENT ───────────────────────────────────────────────────────
          Dial, result card or the wait, all in one flexible area that grows and
          shrinks around whatever is in it. The action row below is a fixed slot
          and never moves, which is the entire point of splitting them. */}
      <div style={{
        flex: 1, minHeight: 0, width: '100%',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-end',
        // Same column as the bar above it, so the dial and the card line up
        // with it rather than with the whole screen.
        maxWidth: 448, margin: '0 auto',
        padding: '0 1rem', gap: 10,
      }}>
        <AnimatePresence>
          {(phase === 'hooked' || phase === 'reeling') && (
            <motion.div key="dial"
              initial={{ opacity: 0, y: 30, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.14 } }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              /* SAME SIZE AS THE FISHING SCREEN. DialSVG is width:100% capped
                 at 300 and has to be given the room to reach that cap — I had
                 it in a 260px box, which quietly made the map's dial a
                 different instrument to the one every player has learned. */
              style={{ pointerEvents: 'none', width: '100%', maxWidth: 300 }}>
              <DialSVG zones={zones} angle={angle} needleColor="#f4e3b2" zoneOpacityFn={() => 1}
                snapKey={snapKey} perfectBurstKey={burstKey} />
            </motion.div>
          )}
        </AnimatePresence>

        {phase === 'result' && caught && (
          <motion.div key="result"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            style={{ pointerEvents: 'auto', width: '100%', maxWidth: 380, minHeight: 0 }}>
            <div data-no-steer style={{
              width: '100%', maxHeight: '52vh', overflowY: 'auto', overscrollBehavior: 'contain',
              // The map sets touch-action: none so a drag steers instead of
              // scrolling the page. This card is the one thing inside it that
              // genuinely wants a vertical drag, so it takes that back.
              touchAction: 'pan-y',
            }}>
              {caught.kind === 'crate' ? (
                /* THE crate moment, the shared one. components/CrateOpening is
                   deliberately the only implementation of this in the app and
                   the map is not going to become the second. It opens itself
                   here rather than borrowing the action slot, because out on
                   the water that slot has a boat to steer back to. */
                <div style={{
                  borderRadius: 20, padding: '1.15rem 1.25rem 1.05rem', textAlign: 'center',
                  background: 'rgba(6,14,22,0.96)', border: '1px solid rgba(255,255,255,0.1)',
                }}>
                  <CrateOpening
                    tier={caught.tier as CrateTierId}
                    loot={caught.loot}
                    headline="You reeled up a"
                    autoOpenMs={700}
                  />
                </div>
              ) : caught.kind === 'fish' ? (
                /* THE SAME CARD. Not a summary of it — the component the
                   fishing screen renders, handed the same payload. See
                   components/CatchResultCard for why it left FishingGame. */
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
          </motion.div>
        )}

        {phase === 'waiting' && (
          <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
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

        {err && (
          <p className="font-karla font-600" style={{
            fontSize: '0.78rem', color: '#e6a0a0', textShadow: '0 1px 8px rgba(0,0,0,0.9)',
          }}>{err}</p>
        )}
      </div>

      {/* ── THE ACTION SLOT — the same position in every phase ─────────────
          88px square, always, whatever is in it. The fishing screen holds this
          rule and states why: the button must not move between phases or your
          thumb goes looking for it mid-reel. No AnimatePresence around it
          either, for the reason FishingGame dropped one — a mode="wait" that
          gets stuck leaves the slot EMPTY, which is the recurring "there is no
          cast button" report. Plain conditionals always render something. */}
      <div style={{
        flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 8, paddingTop: 8, paddingBottom: 22, pointerEvents: 'auto',
      }}>
        <div style={{ width: 88, height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {(phase === 'idle' || phase === 'result') && (
            <motion.button key="cast"
              onPointerDown={e => { e.preventDefault(); if (phase === 'result') castAgain(); else cast() }}
              className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
              style={{
                width: 88, height: 88, borderRadius: '50%',
                background: 'radial-gradient(ellipse at 40% 35%, rgba(14,116,144,0.45), rgba(14,116,144,0.18))',
                border: '1px solid rgba(34,170,200,0.5)', cursor: 'pointer',
                fontSize: '0.72rem', touchAction: 'manipulation', lineHeight: 1.15,
                color: spritesReady ? '#67d4e8' : 'rgba(103,212,232,0.45)',
                boxShadow: '0 6px 0 rgba(0,0,0,0.6), 0 0 28px rgba(14,116,144,0.35), inset 0 1px 0 rgba(255,255,255,0.12)',
              }}
              initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
              whileTap={spritesReady ? { scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.6)' } : undefined}
              transition={{ type: 'spring', stiffness: 600, damping: 22 }}>
              {/* "Rigging" is only ever seen on a cold load: the frames are
                  fetched the moment the map mounts, and you have to sail to a
                  zone before this button exists at all. */}
              {!spritesReady ? 'Rigging' : phase === 'result' ? <>Cast<br />Again</> : 'Cast'}
            </motion.button>
          )}
          {phase === 'hooked' && (
            <motion.button key="reel"
              onPointerDown={e => { e.preventDefault(); strike() }}
              className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
              style={{
                width: 88, height: 88, borderRadius: '50%',
                background: 'radial-gradient(ellipse at 40% 35%, rgba(240,192,64,0.28), rgba(240,192,64,0.08))',
                border: '1px solid rgba(240,192,64,0.4)', cursor: 'pointer',
                fontSize: '0.72rem', color: '#f0c040', touchAction: 'manipulation',
                boxShadow: '0 6px 0 rgba(0,0,0,0.5), 0 0 22px rgba(240,192,64,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
              }}
              initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.5)' }}
              transition={{ type: 'spring', stiffness: 600, damping: 22 }}>
              Reel In
            </motion.button>
          )}
          {(phase === 'waiting' || phase === 'reeling') && (
            // The slot holds itself open rather than collapsing — the same
            // ellipsis the fishing screen shows while a reel resolves.
            <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: 'rgba(190,212,228,0.5)' }}>…</p>
          )}
        </div>

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
      </div>
    </div>
  )
}
