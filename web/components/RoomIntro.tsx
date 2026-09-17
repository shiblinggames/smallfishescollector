// ── WHAT THIS ROOM IS FOR, IN ONE LINE ──────────────────────────────────────
//
// Under the header of every room on the Mainland. A captain who walks into the
// Chart Room for the first time sees four cards with names on them and no
// reason to press any; the Parlor's host says "sharpen your wits" and nothing
// about what that pays. The line is plain and literal: what you do here, and
// what it earns. Charm stays on the cards.

export default function RoomIntro({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-karla font-600" style={{
      fontSize: '0.78rem', color: 'rgba(214,202,176,0.78)', lineHeight: 1.5,
      textAlign: 'center', margin: '-0.2rem auto 0', maxWidth: 440,
    }}>
      {children}
    </p>
  )
}
