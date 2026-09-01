'use client'

// ── THE SEA GETS ITS SOUNDTRACK BACK ────────────────────────────────────────
//
// lib/fishingMusic has a full gapless music engine with three tracks written
// for it, and since /fishing was retired NOTHING CALLED IT. The chart inherited
// the SFX (the cast, the second splash, the perfect chime) because FishingHere
// imports those directly, and quietly lost the music, because that was started
// by the old FishingGame's mount effect and nobody moved it.
//
// ── IT STARTS ON A GESTURE, NOT ON MOUNT ────────────────────────────────────
//
// Two reasons and they point the same way. Every browser refuses to start audio
// outside a user gesture, so a mount-time start is a promise the platform will
// not keep; and `unlockFishingAudio` builds an AudioContext and fetches a 1.6MB
// track, which is a bill nobody should pay for opening the chart to look at it.
// Waiting for the first press means the people who pay for the music are the
// people who are playing.
//
// One shot. Once it is up, `setFishingMusicMuted` does the rest.
//
// ── AND THEN IT DOES NOT STOP ───────────────────────────────────────────────
//
// It used to follow the ZONE. `fishingTrackForZone` gave the Shallows, Open
// Waters and the Deep a piece each, and the boat's band was fed in as a prop.
// That reads well and plays badly, for a reason that only appears once the
// zones are somewhere you SAIL rather than somewhere you pick off a list: the
// bands are a few hundred pixels apart out here, so an ordinary run of fishing
// crosses them over and over and the track was re-cueing every time. Music that
// restarts whenever you drift over a line is not a soundtrack, it is a stinger.
//
// The day/night cycle is the axis that was always right for it. It turns four
// times in forty-eight minutes, on a clock every player shares, and it is
// already what the water, the light and the rare traders answer to. Between
// turns nothing touches the track at all, so a piece gets to actually play.
//
// The engine no-ops when handed the track it is already on, and dusk and dawn
// share one, so a whole cycle is three swaps rather than one per band crossing.
//
// ── WHAT IT STILL DOES NOT SURVIVE ──────────────────────────────────────────
//
// Leaving the chart. The sea's music is the SEA's, and carrying it into the
// tackle shop would make it the app's. That is the one deliberate stop.

import { useEffect, useRef } from 'react'
import { getSetting, SEA_SETTINGS_EVENT } from '@/lib/seaSettings'
import { seaClock, type SeaPhase } from '@/lib/seaClock'

/** How often the phase is checked. The cycle is forty-eight minutes and the
 *  fades either side of night are over four minutes long, so this is far
 *  finer than it needs to be and still costs one modulo every fifteen
 *  seconds. Anything faster would be measuring a clock that cannot move. */
const PHASE_POLL_MS = 15_000

export default function SeaAudio() {
  const started = useRef(false)
  /** The phase the track is currently bound to. Only a CHANGE does anything,
   *  so the poll below is free on all but three ticks per cycle. */
  const phase = useRef<SeaPhase>(seaClock().phase)

  // ── UP ON THE FIRST PRESS ─────────────────────────────────────────────
  useEffect(() => {
    let dead = false
    const begin = () => {
      if (started.current || dead) return
      started.current = true
      void import('@/lib/fishingMusic').then(m => {
        if (dead) return
        // PRIME, not set. Binding with a crossfade here would start the
        // default track and toggle off it ~400ms later, which blips the wrong
        // song under the entry fade. prime binds silently so the 3s fade-in
        // happens on the right piece.
        phase.current = seaClock().phase
        m.primeFishingTrack(m.fishingTrackForPhase(phase.current))
        m.startFishingMusic(!getSetting('music'))
      }).catch(() => { /* a missing soundtrack is not worth a broken chart */ })
    }
    // Capture, so it runs before a button's own handler routes away.
    window.addEventListener('pointerdown', begin, { capture: true, passive: true, once: true })
    window.addEventListener('keydown', begin, { capture: true, once: true })
    return () => {
      dead = true
      window.removeEventListener('pointerdown', begin, { capture: true } as EventListenerOptions)
      window.removeEventListener('keydown', begin, { capture: true } as EventListenerOptions)
    }
  }, [])

  // ── THE TRACK FOLLOWS THE LIGHT ───────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const next = seaClock().phase
      if (next === phase.current) return
      phase.current = next
      if (!started.current) return
      void import('@/lib/fishingMusic')
        .then(m => m.setFishingTrack(m.fishingTrackForPhase(next)))
        .catch(() => {})
    }
    const id = setInterval(tick, PHASE_POLL_MS)
    return () => clearInterval(id)
  }, [])

  // ── AND THE SWITCHES ──────────────────────────────────────────────────
  useEffect(() => {
    const apply = () => {
      void import('@/lib/fishingMusic').then(m => {
        // SFX first: lib/fishingMusic reads its own flag ONCE at module load,
        // so writing the key is not enough on its own. This is the call that
        // actually moves the gain node.
        m.setFishingSfxMuted(!getSetting('sfx'))
        if (!getSetting('music')) {
          m.setFishingMusicMuted(true)
        } else if (started.current) {
          m.setFishingMusicMuted(false)
        } else {
          // Turned on before anything had started it. The toggle IS a gesture,
          // so this is a legitimate moment to bring the music up.
          started.current = true
          phase.current = seaClock().phase
          m.primeFishingTrack(m.fishingTrackForPhase(phase.current))
          m.startFishingMusic(false)
        }
      }).catch(() => {})
    }
    window.addEventListener(SEA_SETTINGS_EVENT, apply)
    return () => window.removeEventListener(SEA_SETTINGS_EVENT, apply)
  }, [])

  // ── OUT WITH THE CHART ────────────────────────────────────────────────
  // Leaving for the market should not mean the sea follows you in there.
  useEffect(() => () => {
    void import('@/lib/fishingMusic').then(m => m.fadeOutFishingMusic()).catch(() => {})
  }, [])

  return null
}
