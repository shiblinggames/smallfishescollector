// THE TALLY HOUSE — where the day's work is counted and paid.
//
// It was the Trawl Docks, and sending a crew out happens at the fleet moored on
// the water now. What is left here is the day's orders: readable from anywhere
// (the chart carries a copy), claimable only here. The sail IS the price of the
// reward, which is the same bargain every other island on the hub makes.
//
// Gated with the rest of the hub — see lib/seaAccess.

import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { canSail } from '@/lib/seaAccess'
import { getDailyChallenge } from '../fishing/dailyChallengeActions'
import TrawlDocksClient from './TrawlDocksClient'

export const metadata = { title: 'The Trawl Docks' }

export default async function TrawlDocksPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  // ONE RULE FOR ALL FOUR SEA ROUTES. See lib/seaAccess: this used to be a
  // copy of `is_admin !== true` in each of them, which is four chances to
  // open three and forget the fourth.
  if (!canSail(profile)) redirect('/tavern')
  // THE DAY'S ORDERS come with the page. They have always been ticking from
  // every cast — progress is written server-side inside reelIn — so the only
  // thing that was ever missing out here was somewhere to see and claim them.
  const daily = await getDailyChallenge()

  return <TrawlDocksClient daily={daily} />
}
