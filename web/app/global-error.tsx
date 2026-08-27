'use client'

// THE LAST RESORT: an error in the ROOT LAYOUT.
//
// app/error.tsx sits inside the root layout and so cannot catch anything the
// layout itself throws. This replaces the whole document instead, which is why
// it has to render its own <html> and <body> — there is no shell left to render
// into.
//
// It carries no fonts, no globals.css and no components on purpose. Everything
// this file touches is one more thing that could be the reason it is being
// shown, and a fallback that can fail is not a fallback.

import { useEffect } from 'react'
import { isStaleBuild, reloadOntoCurrentBuild } from '@/lib/staleBuild'

export default function GlobalError({ error, reset }: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const stale = isStaleBuild(error)
  useEffect(() => { if (stale) reloadOntoCurrentBuild() }, [stale])

  return (
    <html lang="en">
      <body style={{
        margin: 0, minHeight: '100vh', background: '#0b1a24', color: '#e6e2dc',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '2rem 1rem',
      }}>
        <div style={{ maxWidth: 360 }}>
          <h1 style={{ fontSize: '1.4rem', margin: 0, lineHeight: 1.2 }}>
            {stale ? 'Fetching the new charts' : 'Seas the Booty hit a snag'}
          </h1>
          <p style={{ fontSize: '0.92rem', lineHeight: 1.6, color: 'rgba(214,226,236,0.72)', margin: '0.7rem 0 1.3rem' }}>
            {stale
              ? 'The game updated while you had this open. One moment.'
              : 'Reload to get going again.'}
          </p>
          {!stale && (
            <button type="button" onClick={reset} style={{
              padding: '0.7rem 1.2rem', borderRadius: 12, fontSize: '0.92rem', cursor: 'pointer',
              background: 'rgba(240,192,64,0.16)', border: '1px solid rgba(240,192,64,0.5)', color: '#f6dfa0',
            }}>
              Reload
            </button>
          )}
        </div>
      </body>
    </html>
  )
}
