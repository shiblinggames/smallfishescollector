'use client'

// ── THE BOARD, OPENED WHERE IT IS POSTED ────────────────────────────────────
//
// 2026-09-23: this is no longer a window of its own. Kong wanted the voyage
// and the trawls to land like the other dailies, so the day board (SeaDay)
// opens voyages one step in, in its frame and its header, and mooring at the
// Charterhouse opens the board there. What is left here is the BODY: the
// fetch and the panel. The notes below still describe why it is shaped so.
//
// Going ashore at the Charterhouse opens the actual voyage panel over the
// water. It used to route to /expeditions, which is a hub of six cards, one of
// which opens this — so mooring at the island whose entire purpose is voyages
// left you two taps and a page load away from a voyage, on a screen that is
// mostly about other things.
//
// SAME PANEL, NOT A COPY OF IT. `DailyVoyagePanel` is imported as-is: route
// choice, crew slots, the send, the countdown, the sealed return and the
// claim. A second implementation out here would drift within a week, and the
// one thing this must never do is disagree with the hub about what a voyage
// pays.
//
// ── IT FETCHES WHEN IT OPENS ────────────────────────────────────────────────
//
// The panel needs a crew roster, the day's voyage state and eight rows of
// history, and none of that belongs on the chart's own load — see the note in
// voyageBoardActions. So the data arrives on the first open and is held for the
// session; re-opening after sending a voyage refetches, because the panel's own
// state is gone with it and a stale board would offer a route that is already
// at sea.
//
// DYNAMIC, so the chart's bundle does not carry sixteen hundred lines of voyage
// UI for a panel most sessions never open.
//
// ── ONE THING IT DOES THAT IS WORTH KNOWING ─────────────────────────────────
//
// Sending and claiming both call `router.refresh()`, which out here re-renders
// /sea rather than /expeditions. That is a real cost and it is the right one:
// the map stays MOUNTED through a refresh, so the boat keeps her position, her
// heading and her fog — every one of those lives in a ref or in state that a
// new set of server props does not touch. It happens twice a day at most.

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { voyageBoard, type VoyageBoard as Board } from './voyageBoardActions'

const DailyVoyagePanel = dynamic(() => import('@/app/(app)/expeditions/DailyVoyagePanel'), { ssr: false })

type Phase = 'idle' | 'away' | 'returned' | 'done'

/** The voyage board's contents. Reads on every mount, which is every open:
 *  sending a voyage unmounts the panel with its own state, and a cached board
 *  would offer a route that is already at sea.
 *
 *  ── NO FRAME WHILE YOU CHOOSE (Kong, 2026-09-25) ──────────────────────────
 *  The cards are the board: while a route is being chosen there is no box,
 *  only a slim bar over the water (back, the title, the log, close) and the
 *  cards under it. The status screens (at sea, home, the haul) keep a framed
 *  card, because those are one thing to read, not five to compare. */
export default function VoyageBoardBody({ onBack, onClose, icon, title, narrow = false }: {
  onBack?: () => void
  onClose?: () => void
  icon?: string
  title?: string
  narrow?: boolean
}) {
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase | null>(null)
  const [log, setLog] = useState(false)
  useEffect(() => {
    let alive = true
    void voyageBoard().then(res => {
      if (!alive) return
      if ('error' in res) setError(res.error)
      else setBoard(res)
    }).catch(() => { if (alive) setError('The board would not load. Try again.') })
    return () => { alive = false }
  }, [])
  const bare = !board || phase === null || phase === 'idle'
  const btn = {
    width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, background: 'rgba(6,10,16,0.72)', border: '1px solid rgba(255,255,255,0.16)',
    color: '#dfe5ec', cursor: 'pointer', padding: 0,
  } as const
  const bar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: bare ? 14 : 8 }}>
      {onBack && (
        <button type="button" onClick={onBack} aria-label="Back to the day" style={btn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
      )}
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" style={{ width: 32, height: 32, objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.7))' }} />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <p className="font-cinzel font-700" style={{ fontSize: narrow ? '1.1rem' : '1.3rem', color: '#f4ecd8', margin: 0, lineHeight: 1.15, textShadow: '0 2px 10px rgba(0,0,0,0.85)' }}>
          {title ?? 'The Voyage'}
        </p>
        {bare && board && (
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.16em', color: 'rgba(240,210,150,0.8)', margin: '2px 0 0', textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>
            Choose a route
          </p>
        )}
      </div>
      {bare && board && board.voyages.length > 0 && (
        <button type="button" onClick={() => setLog(v => !v)} aria-pressed={log}
          className="font-karla font-800 uppercase"
          style={{ ...btn, width: 'auto', padding: '0 12px', fontSize: '0.6rem', letterSpacing: '0.12em', color: log ? '#f0c040' : '#dfe5ec' }}>
          Log
        </button>
      )}
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close" style={btn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      )}
    </div>
  )
  const body = error ? (
    <p className="font-karla" style={{ fontSize: '0.86rem', color: 'rgba(240,168,144,0.95)', textAlign: 'center', padding: '1.4rem 0' }}>
      {error}
    </p>
  ) : board ? (
    <DailyVoyagePanel
      roster={board.roster}
      shipTier={board.shipTier}
      todayVoyage={board.todayVoyage}
      readyVoyage={board.readyVoyage}
      expeditionXP={board.expeditionXP}
      voyages={board.voyages}
      gauntletUpgrades={board.gauntletUpgrades}
      onPhase={setPhase}
      showLog={log}
    />
  ) : (
    // A RESERVED BOX, not a spinner that collapses when it goes.
    <div aria-busy style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(214,226,236,0.7)', textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>
        Reading the board…
      </p>
    </div>
  )
  return bare ? (
    <div style={{ width: '100%', maxWidth: 1240, margin: '0 auto' }}>
      {bar}
      {body}
    </div>
  ) : (
    <div style={{
      width: '100%', maxWidth: 820, margin: '0 auto',
      background: 'rgba(8,12,18,0.98)', border: '1px solid rgba(240,192,64,0.23)',
      borderRadius: 18, boxShadow: '0 22px 60px rgba(0,0,0,0.7)',
      padding: narrow ? '0.8rem 0.75rem 0.85rem' : '1.05rem 1rem 1.15rem',
    }}>
      {bar}
      {body}
    </div>
  )
}
