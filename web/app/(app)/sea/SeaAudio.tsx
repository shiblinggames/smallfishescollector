'use client'

// ── THE SEA GETS ITS SOUNDTRACK BACK ────────────────────────────────────────
//
// lib/fishingMusic has a full gapless music engine with three per-zone tracks
// written for it, and since /fishing was retired NOTHING CALLED IT. The chart
// inherited the SFX (the cast, the second splash, the perfect chime) because
// FishingHere imports those directly, and quietly lost the music, because that
// was started by the old FishingGame's mount effect and nobody moved it.
//
// So the settings panel's music switch would have been a switch for silence.
// This is the other half of that feature.
//
// ── IT STARTS ON A GESTURE, NOT ON MOUNT ────────────────────────────────────
//
// Two reasons and they point the same way. Every browser refuses to start
// audio outside a user gesture, so a mount-time start is a promise the platform
// will not keep; and `unlockFishingAudio` builds an AudioContext and fetches a
// 1.6MB track, which is a bill nobody should pay for opening the chart to look
// at it. Waiting for the first press means the people who pay for the music are
// the people who are playing.
//
// One shot. Once it is up, `setFishingMusicMuted` does the rest.
//
// ── AND THE TRACK FOLLOWS THE WATER ─────────────────────────────────────────
//
// `fishingTrackForZone` exists for exactly this and has never been used on the
// chart: the Shallows, Open Waters and the Deep each have their own piece.
// Sailing out of one band into another crossfades. It is the one thing the
// chart can do that the old fishing screen could not, because out here the
// zones are somewhere you sail rather than somewhere you picked from a list.

import { useEffect, useRef } from 'react'
import { getSetting, SEA_SETTINGS_EVENT } from '@/lib/seaSettings'

export default function SeaAudio({ zoneId }: {
  /** The water the boat is in, or null in open sea / the anchorage. */
  zoneId: string | null
}) {
  const started = useRef(false)

  // ── UP ON THE FIRST PRESS ─────────────────────────────────────────────
  useEffect(() => {
    let dead = false
    const begin = () => {
      if (started.current || dead) return
      started.current = true
      void import('@/lib/fishingMusic').then(m => {
        if (dead) return
        m.setFishingTrack(m.fishingTrackForZone(zoneId))
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
    // zoneId deliberately NOT a dependency: this only ever fires once, and the
    // effect below is what keeps the track current afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── THE TRACK FOLLOWS THE BOAT ────────────────────────────────────────
  useEffect(() => {
    if (!started.current) return
    void import('@/lib/fishingMusic')
      .then(m => m.setFishingTrack(m.fishingTrackForZone(zoneId)))
      .catch(() => {})
  }, [zoneId])

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
          m.setFishingTrack(m.fishingTrackForZone(zoneId))
          m.startFishingMusic(false)
        }
      }).catch(() => {})
    }
    window.addEventListener(SEA_SETTINGS_EVENT, apply)
    return () => window.removeEventListener(SEA_SETTINGS_EVENT, apply)
  }, [zoneId])

  // ── OUT WITH THE CHART ────────────────────────────────────────────────
  // Leaving for the market should not mean the sea follows you in there.
  useEffect(() => () => {
    void import('@/lib/fishingMusic').then(m => m.fadeOutFishingMusic()).catch(() => {})
  }, [])

  return null
}
