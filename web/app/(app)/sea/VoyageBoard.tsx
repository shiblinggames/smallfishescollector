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

/** The voyage board's contents. Reads on every mount, which is every open:
 *  sending a voyage unmounts the panel with its own state, and a cached board
 *  would offer a route that is already at sea. */
export default function VoyageBoardBody() {
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void voyageBoard().then(res => {
      if (!alive) return
      if ('error' in res) setError(res.error)
      else setBoard(res)
    }).catch(() => { if (alive) setError('The board would not load. Try again.') })
    return () => { alive = false }
  }, [])
  return (
    <>
      {error ? (
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
        />
      ) : (
        // A RESERVED BOX, not a spinner that collapses when it goes. The
        // board is tall, and a modal that snaps to full height under a
        // thumb already reaching for it is how a mis-tap happens.
        <div aria-busy style={{
          minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(214,226,236,0.55)' }}>
            Reading the board…
          </p>
        </div>
      )}
    </>
  )
}
