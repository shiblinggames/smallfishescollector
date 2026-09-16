// ── AN ACCOUNT ON ICE ───────────────────────────────────────────────────────
//
// Where the middleware sends a frozen account. Plain, literal, and it says
// who to write to: a wall with no door is worse than the wall. Nothing on the
// page reads the game, so it renders whether or not anything else does.

import Link from 'next/link'

export const metadata = { title: 'Account frozen' }

export default function FrozenPage() {
  return (
    <main className="min-h-screen relative" style={{ background: '#070b12' }}>
      <div className="relative z-10 mx-auto px-6" style={{ maxWidth: 520, paddingTop: 'clamp(3rem, 12vh, 7rem)' }}>
        <p className="font-karla font-600 uppercase" style={{ fontSize: '0.64rem', letterSpacing: '0.22em', color: '#7ab8cc', margin: 0 }}>
          Seas the Booty
        </p>
        <h1 className="font-cinzel font-900" style={{ fontSize: '2rem', color: '#f0ede8', margin: '0.6rem 0 0.4rem', lineHeight: 1.05 }}>
          This account is frozen.
        </h1>
        <p className="font-karla" style={{ fontSize: '0.95rem', lineHeight: 1.65, color: '#c3d6e2', margin: '1rem 0 0' }}>
          Something about how this account was played did not look like play, and it has been
          put on ice while a person looks at it. Nothing has been deleted.
        </p>
        <p className="font-karla" style={{ fontSize: '0.95rem', lineHeight: 1.65, color: '#c3d6e2', margin: '0.8rem 0 0' }}>
          If you think this is a mistake, write to{' '}
          <a href="mailto:hello@shiblinggames.com" style={{ color: '#f0c040', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            hello@shiblinggames.com
          </a>{' '}
          with your captain name.
        </p>
        <p style={{ marginTop: '1.6rem' }}>
          <Link href="/login" className="font-karla font-700 uppercase tracking-[0.1em]" style={{
            display: 'inline-block', padding: '0.6rem 1.2rem', borderRadius: 999, fontSize: '0.7rem',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: '#cfe0ec', textDecoration: 'none',
          }}>Sign in as somebody else</Link>
        </p>
      </div>
    </main>
  )
}
