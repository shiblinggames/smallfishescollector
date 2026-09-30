'use client'

// The client half of app/actions/honeypot.ts: this import is what puts the
// action in the manifest, and the listener is the one path to it. Nothing in
// the game dispatches `stb:founders`. Renders nothing.

import { useEffect } from 'react'
import { api } from '@/lib/gameApi'

export default function Honeypot() {
  useEffect(() => {
    const on = () => { void api.online.claimFoundersChest() }
    window.addEventListener('stb:founders', on)
    return () => window.removeEventListener('stb:founders', on)
  }, [])
  return null
}
