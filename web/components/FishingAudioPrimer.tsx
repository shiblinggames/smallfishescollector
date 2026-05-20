'use client'

import { useEffect } from 'react'
import { unlockFishingAudio } from '@/lib/fishingMusic'

/** Mounts at the app shell. On every user gesture (pointerdown / touchstart)
 *  anywhere in the app, ensures the fishing AudioContext is created and
 *  resumed. iOS only honors AudioContext.resume() inside a user-gesture
 *  call stack, so doing it from any tap keeps the context primed by the
 *  time the player navigates to /fishing — the fade-in then "just works".
 *  Listeners use the capture phase so they run before the target's own
 *  click handlers (e.g., a tab button's router.push). */
export default function FishingAudioPrimer() {
  useEffect(() => {
    const onGesture = () => { unlockFishingAudio() }
    window.addEventListener('pointerdown', onGesture, { capture: true, passive: true })
    window.addEventListener('touchstart', onGesture, { capture: true, passive: true })
    return () => {
      window.removeEventListener('pointerdown', onGesture, { capture: true } as EventListenerOptions)
      window.removeEventListener('touchstart', onGesture, { capture: true } as EventListenerOptions)
    }
  }, [])
  return null
}
