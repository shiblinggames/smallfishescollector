import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/userData'
import SignInStage from '../login/SignInStage'

export const metadata: Metadata = {
  alternates: { canonical: '/register' },
  title: 'Start playing',
  description:
    'Make a captain and start fishing. Free, nothing to install, and no password to remember.',
}

/**
 * ── IT WAS A REDIRECT TO /login ─────────────────────────────────────────────
 *
 * Which was true and unhelpful. A magic link makes signing up and signing in
 * the same press, so there is genuinely one form. But a first-time visitor who
 * follows "start playing" and lands on a page headed "welcome back" has been
 * told they are in the wrong place, and the one moment a game gets to say what
 * it is has been spent saying nothing.
 *
 * Same stage, same form, new-captain framing. No second auth path to keep in
 * step: see SignInStage.
 */
export default async function RegisterPage() {
  if (await getCurrentUser()) redirect('/sea')
  return <SignInStage mode="new" />
}
