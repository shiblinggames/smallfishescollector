// ── ONE GROUP ON THE TAVERN PAGE ────────────────────────────────────────────
//
// The page was a stack of cards with no headings, so five unrelated things sat
// at the same visual level and the eye had to work out which of them belonged
// together. A titled box is the whole fix: it says what this part of the room
// is for before you read anything inside it.
//
// `action` is the way OUT of a group — "See all", "Manage" — and it is the
// other half of the rule this page runs on: the tavern says how things STAND
// and links to where they are managed. A group that holds a full list is a
// filing cabinet with a fireplace.

import Link from 'next/link'

export default function Group({ title, note, action, children }: {
  title: string
  /** One short line under the title. Optional, and usually the count. */
  note?: string
  action?: { href: string; label: string }
  children: React.ReactNode
}) {
  return (
    <section style={{
      borderRadius: 16, padding: '0.85rem 1rem 1rem',
      background: 'rgba(10,12,16,0.55)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 10, marginBottom: '0.7rem',
      }}>
        <div style={{ minWidth: 0 }}>
          <p className="font-karla font-700 uppercase" style={{
            fontSize: '0.56rem', letterSpacing: '0.18em', color: 'rgba(200,170,100,0.8)', margin: 0,
          }}>{title}</p>
          {note && (
            <p className="font-karla font-600" style={{
              fontSize: '0.72rem', color: 'rgba(214,198,166,0.62)', margin: '3px 0 0',
            }}>{note}</p>
          )}
        </div>
        {action && (
          <Link href={action.href} className="font-karla font-700 uppercase"
            style={{
              flexShrink: 0, textDecoration: 'none', letterSpacing: '0.1em',
              fontSize: '0.6rem', color: 'rgba(200,170,100,0.9)',
              padding: '0.3rem 0.6rem', borderRadius: 999,
              background: 'rgba(200,170,100,0.08)', border: '1px solid rgba(200,170,100,0.28)',
            }}>
            {action.label} →
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}
