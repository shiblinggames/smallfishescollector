'use client'

import { useEffect } from 'react'
import { unlockFishingAudio } from '@/lib/fishingMusic'
import { unlockTideRunAudio } from '@/lib/tideRunAudio'

/** Mounts at the app shell. On every user gesture (pointerdown / touchstart)
 *  anywhere in the app, resumes any audio contexts that have been created
 *  (fishing music, tide-run SFX). iOS only honors AudioContext.resume()
 *  inside a user-gesture call stack, so doing it on every tap keeps the
 *  contexts primed by the time the player reaches the relevant game.
 *  Listeners use the capture phase so they run before the target's own
 *  click handlers (e.g., a tab button's router.push). */
export default function FishingAudioPrimer() {
  useEffect(() => {
    const onGesture = () => {
      unlockFishingAudio()
      unlockTideRunAudio()
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
