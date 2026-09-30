// A GAME'S PAGE FRAME (split out 2026-09-30): the column, and the game's own
// error line when its state could not be read. The Quartermaster's Hold, Lay
// the Rigging and the Parlor's three games all sit in it. Split from their
// pages so the desktop build, which has no server components, draws the same
// frame around the same game.

import type { ReactNode } from 'react'

export default function GameFrame({ error, children }: { error?: string; children?: ReactNode }) {
  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        {error != null ? (
          <div style={{ maxWidth: 'var(--game-col)', margin: '0 auto', paddingTop: '3rem', textAlign: 'center' }}>
            <p className="font-karla" style={{ fontSize: '0.85rem', color: '#6a6764' }}>{error}</p>
          </div>
        ) : children}
      </div>
    </main>
  )
}
