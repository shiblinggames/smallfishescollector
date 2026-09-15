'use client'

// ── A PANEL MAY NOT TAKE THE GAME DOWN WITH IT ──────────────────────────────
//
// The chart is a single client component with a live WebGL renderer, a frame
// loop and an hour of session state in it. Anything that throws while it is
// mounted unmounts the whole tree, and Next puts up app/error.tsx — so a bad
// read in a wardrobe reads to a player as the game crashing, and takes the sail
// they were in the middle of with it.
//
// That trade is never worth it. A sheet is a thing you open, look at and shut;
// the sea behind it is the thing you are playing. So every sheet that hangs off
// the chart can be wrapped in one of these, and the worst a fault inside one
// can do is close itself and say so.
//
// ── IT IS A CLASS, AND IT HAS TO BE ─────────────────────────────────────────
//
// `componentDidCatch` has no hook. This is the one component in the codebase
// that is a class on purpose rather than by age.
//
// ── IT DOES NOT SWALLOW THE FAULT ───────────────────────────────────────────
//
// The error goes to the console with the sheet's name on it, because a panel
// that fails silently is a bug nobody can report. What it stops is the fault
// travelling upward into the chart.

import { Component, type ReactNode } from 'react'

type Props = {
  /** Named in the console and in the message, so a report says which sheet. */
  name: string
  /** Shut the sheet. A panel that has failed is a panel to get out of. */
  onClose: () => void
  children: ReactNode
}
type State = { failed: boolean }

export default class SheetBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Not swallowed: the whole point is that the chart survives and the fault
    // is still reportable.
    console.error(`[${this.props.name}] threw inside a sheet`, error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div style={{ padding: '1.5rem 0.5rem', textAlign: 'center' }}>
        <p className="font-cinzel font-700" style={{
          fontSize: '0.95rem', color: '#f0ede8', margin: '0 0 6px',
        }}>That panel would not open.</p>
        <p className="font-karla" style={{
          fontSize: '0.8rem', color: 'rgba(240,237,232,0.6)', margin: '0 0 1rem', lineHeight: 1.5,
        }}>
          Nothing is lost and the sea is still under you. Shut it and try again.
        </p>
        <button type="button" onClick={this.props.onClose} className="btn-gold">
          Close
        </button>
      </div>
    )
  }
}
