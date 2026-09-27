'use client'

// ANY KEY ADVANCES A "TAP TO CONTINUE". Mounted once in the root layout;
// renders nothing.
//
// The game is full of tap-anywhere moments — kill beats, level-ups, skin
// reveals, boss dialogue, crate payoffs, celebration overlays. On desktop the
// natural instinct at one of those is to hit a key, any key, and before this
// nothing happened. Every such overlay now tags its clickable root with
// `data-any-key`, and this listener turns a keypress into the tap the overlay
// is already waiting for.
//
// DISPATCH, NOT DUPLICATION: it fires a pointerdown/pointerup/click sequence
// at the tagged element — the same events a real tap produces — so each
// overlay's own handler runs with its own semantics (advance a beat, skip the
// typewriter, dismiss) and nothing here knows or cares which. A component
// listens on exactly one of those events (listening on two would double-fire
// on a real finger too), so the triple dispatch cannot double-advance.
//
// WHICH KEYS: anything that isn't a browser or a11y key. Modifiers, function
// keys (F5 refresh, F12 devtools), Tab (focus), and modified chords pass
// through untouched. Space/Enter/letters/arrows all advance — "any button".
//
// WHICH OVERLAY: the LAST tagged element in document order (portals append to
// body, so later mount = visually higher), and only if it is actually the one
// under the viewport centre — a tagged overlay sitting beneath an untagged
// modal must not advance from behind it. Same geometric stance as
// lib/spaceAction's occlusion check.

import { useEffect } from 'react'
import { typingInField } from '@/lib/spaceAction'

export default function KeyboardAdvance() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return
      if (e.key === 'Tab' || /^F\d{1,2}$/.test(e.key)) return
      if (typingInField(e.target)) return

      const tagged = document.querySelectorAll<HTMLElement>('[data-any-key]')
      if (tagged.length === 0) return
      const el = tagged[tagged.length - 1]
      // `data-any-key="space"` answers only Space and Enter: a tutorial card's
      // Next, which appears while you are sailing, where letters steer.
      if (el.dataset.anyKey === 'space' && e.key !== ' ' && e.key !== 'Enter') return

      // The tagged overlay must actually be on top. Its own centre is the
      // probe: a full-bleed gate hits itself; a card-style overlay hits its
      // card; anything covered by a higher untagged layer misses and the key
      // does nothing rather than advancing something the player cannot see.
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      if (!hit || !(el === hit || el.contains(hit))) return

      // THE KEY IS SPENT HERE. Space is also the chart's act key (fish, hail,
      // go ashore): a press that advanced a line must not also cast one. So
      // this listens in the CAPTURE phase, ahead of every other window
      // listener, and stops the key once it has used it.
      e.preventDefault()
      e.stopImmediatePropagation()
      const opts = { bubbles: true, cancelable: true }
      el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerType: 'mouse' }))
      el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerType: 'mouse' }))
      el.dispatchEvent(new MouseEvent('click', opts))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  return null
}
