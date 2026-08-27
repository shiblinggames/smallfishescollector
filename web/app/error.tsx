'use client'

// WHAT A PAGE DOES WHEN IT THROWS.
//
// There was nothing here at all, which is why a deploy could put the app on a
// white screen: an unhandled render error unmounts the tree and Next.js has
// nothing to put in its place. The commonest cause by far is not a bug in the
// page but a tab holding chunk filenames from a build that has been replaced —
// see lib/staleBuild.

import { useEffect } from 'react'
import Link from 'next/link'
import { isStaleBuild, reloadOntoCurrentBuild } from '@/lib/staleBuild'

export default function Error({ error, reset }: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const stale = isStaleBuild(error)

  useEffect(() => {
    // A stale build is not a problem to report, it is a page that needs
    // fetching again. Done in an effect rather than during render because it
    // navigates, and rendering must not.
    if (stale) reloadOntoCurrentBuild()
  }, [stale])

  return (
    <main style={{
      minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem 1rem', color: '#e6e2dc', textAlign: 'center',
    }}>
      <div style={{ maxWidth: 380 }}>
        <h1 className="font-pirata" style={{ fontSize: '1.9rem', lineHeight: 1.15 }}>
          {stale ? 'Fetching the new charts' : 'That did not go through'}
        </h1>
        <p className="font-karla" style={{
          fontSize: '0.92rem', lineHeight: 1.6, color: 'rgba(214,226,236,0.72)', margin: '0.6rem 0 1.2rem',
        }}>
          {stale
            ? 'The game updated while you had this open. One moment.'
            : 'Something went wrong on this page. Try again, and if it keeps happening head back to the tavern.'}
        </p>

        {!stale && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button type="button" onClick={reset} className="tap font-cinzel font-700"
              style={{
                padding: '0.7rem 1.1rem', borderRadius: 12, fontSize: '0.9rem', cursor: 'pointer',
                background: 'rgba(240,192,64,0.16)', border: '1px solid rgba(240,192,64,0.5)', color: '#f6dfa0',
              }}>
              Try again
            </button>
            <Link href="/tavern" className="tap font-karla font-700"
              style={{
                padding: '0.7rem 1.1rem', borderRadius: 12, fontSize: '0.9rem',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
                color: '#d8e2ea', textDecoration: 'none',
              }}>
              The Tavern
            </Link>
          </div>
        )}

        {/* The digest is the only handle on a server-side error, and a player
            who reports one without it has reported that something broke. */}
        {!stale && error.digest && (
          <p className="font-karla" style={{
            fontSize: '0.68rem', color: 'rgba(190,212,228,0.4)', marginTop: '1.4rem',
          }}>{error.digest}</p>
        )}
      </div>
    </main>
  )
}
