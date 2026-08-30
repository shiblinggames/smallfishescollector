'use client'

// ── THE BOARD, OPENED WHERE IT IS POSTED ────────────────────────────────────
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

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import PopupShell from '@/components/PopupShell'
import { voyageBoard, type VoyageBoard as Board } from './voyageBoardActions'

const DailyVoyagePanel = dynamic(() => import('@/app/(app)/expeditions/DailyVoyagePanel'), { ssr: false })

export default function VoyageBoard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const res = await voyageBoard()
    if ('error' in res) { setError(res.error); return }
    setBoard(res)
  }, [])

  useEffect(() => {
    if (!open) return
    // EVERY open, not only the first. Sending a voyage from here unmounts the
    // panel with its own state; coming back to a cached board would show the
    // routes as still available when one of them is at sea.
    void load()
  }, [open, load])

  return (
    // PopupShell does NOT portal, so this is a DOM child of the map — and the
    // map steers on click and captures the pointer. Without this the backdrop
    // tap that dismisses the board also puts the helm over.
    <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <PopupShell open={open} onClose={onClose}>
        <div role="dialog" aria-modal onClick={e => e.stopPropagation()}
          style={{
            // No maxHeight and no inner scroller: the modal grows to its
            // content and PopupShell owns the scroll. See the note on the
            // hub's copy of this shell — an inner scroll layer here made the
            // bottom of an expanded voyage log unreachable.
            margin: 'auto', width: '100%', maxWidth: 480,
            background: 'linear-gradient(180deg, rgba(6,12,22,0.34) 0%, rgba(6,11,20,0.48) 45%, rgba(5,9,16,0.44) 100%), url(/voyages-modal-bg.jpg) center / cover no-repeat',
            border: '1px solid rgba(240,192,64,0.28)',
            borderRadius: 20,
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            overflow: 'hidden',
          }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.85rem 1rem 0.6rem',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div>
              <p className="font-karla font-700 uppercase tracking-[0.16em]"
                style={{ fontSize: '0.5rem', color: 'rgba(240,192,64,0.7)', marginBottom: 1 }}>
                Ashore at the Charterhouse
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#f0e8d0' }}>
                Voyages
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close"
              style={{
                width: 30, height: 30, borderRadius: '50%', padding: 0,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.16)',
                color: '#cfcabf', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>

          <div style={{ padding: '0.9rem 1rem 1.2rem' }}>
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
          </div>
        </div>
      </PopupShell>
    </div>
  )
}
