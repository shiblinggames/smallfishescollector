'use client'

// The Godot build in an iframe, plus the empty half of the bridge it will use
// later.
//
// AN IFRAME, not a canvas mounted into this page, for two reasons. The export
// ships its own bootstrap HTML that expects to own the document, and keeping it
// behind a frame boundary means its stylesheet and its input handling cannot
// reach the app around it. The cost is that talking to it is postMessage rather
// than a function call, which for this feature is one message per dock and not
// worth avoiding.
//
// EXPORT WITH THREAD SUPPORT OFF. Godot's threaded web export needs
// SharedArrayBuffer, which needs COOP/COEP headers on the whole site, and
// `Cross-Origin-Embedder-Policy: require-corp` breaks the Stripe embedded
// checkout in MembershipModal. Single-threaded is slower and costs nothing else
// anyone has to think about. Revisit only if the frame rate demands it, and
// then only after checking what it does to checkout.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/** Where the export lands. See godot/sea/README.md. */
const BUILD = '/sea/index.html'

export default function SeaFrame() {
  const router = useRouter()
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [missing, setMissing] = useState(false)

  // Is the build actually there? A missing export otherwise shows a blank
  // black rectangle with no clue why, which is a bad half hour for whoever
  // meets it.
  useEffect(() => {
    let alive = true
    fetch(BUILD, { method: 'HEAD' })
      .then(r => { if (alive && !r.ok) setMissing(true) })
      .catch(() => { if (alive) setMissing(true) })
    return () => { alive = false }
  }, [])

  // PHASE 2 LANDS HERE. The scene will post { type: 'dock', to: 'fishing:abyss' }
  // and this turns it into a route change. Wired now so the contract is settled
  // and visible while the Godot side is still being written against it.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Same-origin only: the build is served from /public, so anything from
      // elsewhere has no business steering the router.
      if (e.origin !== window.location.origin) return
      const data = e.data as { type?: string; to?: string } | null
      if (!data || data.type !== 'dock' || typeof data.to !== 'string') return
      const [where, arg] = data.to.split(':')
      const routes: Record<string, string> = {
        fishing: '/fishing',
        expeditions: '/expeditions',
        tavern: '/tavern',
        market: '/tavern/market',
        crew: '/crew',
      }
      const path = routes[where]
      if (!path) return
      router.push(arg && where === 'fishing' ? `${path}?zone=${encodeURIComponent(arg)}` : path)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [router])

  if (missing) {
    return (
      <div className="mx-auto w-full max-w-md" style={{ padding: '4rem 1.25rem', textAlign: 'center' }}>
        <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#cfe4f2' }}>No build yet</p>
        <p className="font-karla" style={{ fontSize: '0.86rem', color: '#8a94a4', marginTop: 10, lineHeight: 1.6 }}>
          The Godot project lives in <code>godot/sea</code>. Open it, export for Web with
          Thread Support off, and drop the output in <code>web/public/sea</code>.
          Steps are in <code>godot/sea/README.md</code>.
        </p>
      </div>
    )
  }

  return (
    <iframe
      ref={frameRef}
      src={BUILD}
      title="The Sea"
      // The build wants the whole viewport. It sits under the app's fixed nav
      // and tab bar rather than over them, so there is always a way out.
      style={{
        position: 'fixed',
        top: 44, bottom: 60, left: 0, right: 0,
        width: '100%', height: 'auto',
        border: 'none', display: 'block',
        background: '#02080e',
      }}
      className="sm:top-[60px] sm:bottom-0"
    />
  )
}
