// THE CHARTING PUZZLES' FRAME (split out 2026-09-30): the expedition backdrop,
// the column, and the "no board this week" line when a board could not be
// read. Treasure Match and the Minefield both sit in it. Split from their pages
// so the desktop build, which has no server components, draws the same frame
// around the same game.

import type { ReactNode } from 'react'

export default function ChartingFrame({ error, children }: { error?: string; children?: ReactNode }) {
  return (
    <>
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/expedition-background.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom,rgba(0,0,0,0.6) 0%,rgba(0,0,0,0.78) 50%,rgba(0,0,0,0.92) 100%)' }} />
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <main className="min-h-screen pb-24 sm:pb-0">
          <div className="page-col" style={{ paddingTop: '1.25rem' }}>
            {error != null ? (
              <div style={{ textAlign: 'center', paddingTop: '5rem' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#c8bfa6', marginBottom: '0.5rem' }}>No Board This Week</p>
                <p className="font-karla" style={{ fontSize: '0.76rem', color: '#9a9078' }}>{error}</p>
              </div>
            ) : children}
          </div>
        </main>
      </div>
    </>
  )
}
