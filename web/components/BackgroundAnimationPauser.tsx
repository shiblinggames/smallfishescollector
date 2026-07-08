'use client'

import { useEffect } from 'react'

// Battery saver: when the tab / installed PWA is backgrounded (phone locked or
// the user switches apps), toggle a `doc-hidden` body class that globals.css
// uses to freeze every CSS animation (animation-play-state: paused). Browsers
// already throttle requestAnimationFrame while hidden, but the app has ~60
// always-on decorative CSS animations (glows, shimmers, backdrops) that can
// keep ticking off-screen on some mobile engines; this stops them cold.
// Zero visual effect while the app is actually on screen.
export default function BackgroundAnimationPauser() {
  useEffect(() => {
    const sync = () => document.body.classList.toggle('doc-hidden', document.hidden)
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      document.body.classList.remove('doc-hidden')
    }
  }, [])
  return null
}
