// THE SEA — the exploration hub, admin only.
//
// A Godot build, hosted from /public/sea, framed in a page. Phase 1 is a
// movement test and nothing else: a boat, open water, tap to sail. No
// destinations, no docking, no bridge back into the app. That absence is
// deliberate. If floating around is not pleasant with nowhere to go, giving it
// somewhere to go will not rescue it, and everything after this phase is
// decoration on top of a feel that either works or does not.
//
// ADMIN ONLY, the same way Chapter 4 shipped before it was ready. The engine
// build is a large download and this is a prototype; nobody should meet it by
// tapping the wrong tab.
//
// It is NOT the landing page and should not become one until the export has
// been measured on a real phone. Godot on `/` means every first visit pays for
// the engine before seeing anything, which undoes the loading work the fishing
// route just had done to it.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import SeaFrame from './SeaFrame'

export const metadata = { title: 'The Sea' }

export default async function SeaPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) redirect('/tavern')

  return (
    <main style={{ position: 'relative', minHeight: '100svh' }}>
      <SeaFrame />
      <div style={{
        position: 'fixed', left: 0, right: 0,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 68px)',
        display: 'flex', justifyContent: 'center', gap: 12, zIndex: 5,
        pointerEvents: 'none',
      }}>
        <Link href="/tavern" className="font-karla font-700 uppercase"
          style={{
            pointerEvents: 'auto',
            fontSize: '0.62rem', letterSpacing: '0.14em',
            padding: '0.5rem 1rem', borderRadius: 999,
            color: '#cfe4f2', background: 'rgba(2,8,14,0.72)',
            border: '1px solid rgba(120,180,220,0.3)',
            textDecoration: 'none',
          }}>
          Back to the Tavern
        </Link>
      </div>
    </main>
  )
}
