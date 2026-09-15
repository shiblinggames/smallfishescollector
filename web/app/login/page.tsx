import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/userData'
import SignInStage from './SignInStage'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Small Fishes. No password: we send a link and you are aboard.',
}

/**
 * ALREADY SIGNED IN? THEN THIS IS NOT A PAGE YOU WANTED.
 *
 * The root has always had this guard and this never did, so a captain with a
 * live session who reached /login (by a bookmark, by the back button after
 * signing in, or by a magic link that landed somewhere unexpected) was shown a
 * form asking them to sign in to the account they were already using.
 *
 * It is also a second net under the auth redirect. Supabase drops a magic link
 * on the project's Site URL whenever the requested `emailRedirectTo` is not on
 * the allow list, and the browser client picks the session up wherever it lands
 * (`detectSessionInUrl` is on by default), so a stale Site URL signs you in
 * perfectly well, just in the wrong room. This cannot fix that on its own, but
 * every door that knows where a signed-in captain belongs is one fewer place
 * the drift can strand somebody.
 *
 * /sea and not the tavern, and /sea does its own gate: if the water is ever
 * shut again it forwards to the tavern itself, so there stays exactly one place
 * that decides who may sail. Same reasoning as the root's, and deliberately the
 * same destination: two doors that disagree about home is its own bug.
 *
 * WHAT IT LOOKS LIKE lives in SignInStage, which /register renders too. The
 * form is the same for both; only the sentence around it changes.
 */
export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/sea')
  return <SignInStage mode="in" />
}
