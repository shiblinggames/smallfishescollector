'use client'

import { useEffect } from 'react'
import { resumeFishingAudioIfReady } from '@/lib/fishingMusic'
import { resumeTideRunAudioIfReady } from '@/lib/tideRunAudio'

/** Mounts at the app shell. On every user gesture (pointerdown / touchstart)
 *  anywhere in the app, resumes any audio contexts that have already been
 *  created (fishing music, tide-run SFX). iOS only honors AudioContext.
 *  resume() inside a user-gesture call stack, so doing it on every tap
 *  keeps the contexts primed by the time the player reaches the relevant
 *  game.
 *
 *  Light path only — neither function here triggers a context creation or
 *  asset fetch. The first heavy init happens lazily inside the game's
 *  own mount effect (FishingGame's startFishingMusic, TideRunGame's
 *  prefetchTideRunAudio), so players who never visit a given game don't
 *  pay its cost on every tap somewhere else.
 *
 *  Listeners use the capture phase so they run before the target's own
 *  click handlers (e.g., a tab button's router.push). */
export default function FishingAudioPrimer() {
  useEffect(() => {
    const onGesture = () => {
      // Both calls are LIGHT — only resume the per-module
      // AudioContext if it already exists. Neither creates audio
      // elements / contexts / fetches on its own. The heavy unlock
      // happens inside each game's own mount effect, so the iOS
      // Now Playing widget doesn't get re-armed by a tap outside
      // the game.
      resumeFishingAudioIfReady()
      resumeTideRunAudioIfReady()
    }
    window.addEventListener('pointerdown', onGesture, { capture: true, passive: true })
    window.addEventListener('touchstart', onGesture, { capture: true, passive: true })
    return () => {
      window.removeEventListener('pointerdown', onGesture, { capture: true } as EventListenerOptions)
      window.removeEventListener('touchstart', onGesture, { capture: true } as EventListenerOptions)
    }
  }, [])
  return null
}
