'use server'

// WHO YOU HAVE AGREED TO SAIL WITH.
//
// Following somebody back is not consent to be tracked. It used to be treated
// as though it were: mutual crew appeared on each other's charts automatically,
// live, with no say in it. Those are two different permissions and only one of
// them was ever asked for.
//
// So a pact is asked for and accepted, and it is the thing that actually opens
// the water. See the sea_pacts migration for the table and the
// sea_presence_requires_pact one for where it is enforced — which is Postgres,
// not here, because a client belongs to its player.
//
// THE OTHER TWO RULES STILL APPLY. Both captains have to hold a membership and
// still follow each other, re-checked every read. A pact outlives an unfollow
// on purpose: dropping a follow should take somebody off your water at once,
// and re-testing beats trying to find and delete every pact when it happens.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPremiumActive } from '@/lib/premium'

export type PactPerson = {
  id: string
  username: string
  characterColor: string
  /** Whether they hold a membership. A pact with somebody whose Captain has
   *  lapsed stays on the books and simply does nothing, and the panel says so
   *  rather than leaving them wondering why the boat never appears. */
  captain: boolean
}

export type PactState = {
  /** You are a Captain. Without it none of this does anything. */
  youCanSail: boolean
  /** Accepted, both ways. These are the people who can see you. */
  sailing: PactPerson[]
  /** They asked you. These carry an accept button. */
  asking: (PactPerson & { pactId: number })[]
  /** You asked them, and they have not answered. */
  asked: (PactPerson & { pactId: number })[]
  /** Mutual crew with no pact either way — who you could ask. */
  couldAsk: PactPerson[]
}

const SEL = 'id, username, character_color, is_premium, premium_expires_at'
type Row = {
  id: string; username: string | null; character_color: string | null
  is_premium: boolean | null; premium_expires_at: string | null
}
const toPerson = (r: Row): PactPerson => ({
  id: r.id,
  username: r.username ?? 'Someone',
  characterColor: r.character_color ?? 'default',
  captain: isPremiumActive(r),
})

async function me() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}

/** Mutual crew ids — you both pressed Follow. The floor for everything here:
 *  you cannot ask a stranger to sail with you. */
async function mutuals(admin: ReturnType<typeof createAdminClient>, uid: string): Promise<string[]> {
  const [{ data: iFollow }, { data: followMe }] = await Promise.all([
    admin.from('crew').select('following_id').eq('follower_id', uid),
    admin.from('crew').select('follower_id').eq('following_id', uid),
  ])
  const mine = new Set(((iFollow ?? []) as { following_id: string }[]).map(r => r.following_id))
  return ((followMe ?? []) as { follower_id: string }[])
    .map(r => r.follower_id)
    .filter(id => mine.has(id))
}

/** Everything the pact panel draws. */
export async function pactState(): Promise<PactState> {
  const empty: PactState = { youCanSail: false, sailing: [], asking: [], asked: [], couldAsk: [] }
  const user = await me()
  if (!user) return empty
  const admin = createAdminClient()

  const { data: meRow } = await admin
    .from('profiles').select('is_premium, premium_expires_at').eq('id', user.id).single()
  const youCanSail = isPremiumActive(meRow)

  const ids = await mutuals(admin, user.id)
  if (!ids.length) return { ...empty, youCanSail }

  const [{ data: people }, { data: pacts }] = await Promise.all([
    admin.from('profiles').select(SEL).in('id', ids),
    admin.from('sea_pacts')
      .select('id, requester_id, addressee_id, status')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
  ])

  const by = new Map((people ?? []).map(r => [(r as Row).id, toPerson(r as Row)]))
  type P = { id: number; requester_id: string; addressee_id: string; status: string }
  const rows = (pacts ?? []) as P[]

  const sailing: PactPerson[] = []
  const asking: (PactPerson & { pactId: number })[] = []
  const asked: (PactPerson & { pactId: number })[] = []
  const spoken = new Set<string>()

  for (const p of rows) {
    const other = p.requester_id === user.id ? p.addressee_id : p.requester_id
    const person = by.get(other)
    // A pact with somebody who is no longer mutual crew is not shown at all —
    // the follow is a live condition, and the panel should not offer to manage
    // a relationship the game is already ignoring.
    if (!person) continue
    spoken.add(other)
    if (p.status === 'accepted') sailing.push(person)
    else if (p.addressee_id === user.id) asking.push({ ...person, pactId: p.id })
    else asked.push({ ...person, pactId: p.id })
  }

  const couldAsk = ids.filter(id => !spoken.has(id)).map(id => by.get(id)).filter(Boolean) as PactPerson[]
  const byName = (a: PactPerson, b: PactPerson) => a.username.localeCompare(b.username)
  return {
    youCanSail,
    sailing: sailing.sort(byName),
    asking: asking.sort(byName),
    asked: asked.sort(byName),
    couldAsk: couldAsk.sort(byName),
  }
}

/**
 * ASK SOMEBODY TO SAIL WITH YOU.
 *
 * The unique index on the unordered pair IS the guard: if they asked you at the
 * same moment, one insert wins and the other comes back 23505, which is not an
 * error worth showing anybody — there is a pact either way, which is what they
 * both wanted.
 */
export async function requestPact(otherId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await me()
  if (!user) return { ok: false, error: 'Not signed in.' }
  if (otherId === user.id) return { ok: false, error: 'You are already aboard.' }

  const admin = createAdminClient()
  const ids = await mutuals(admin, user.id)
  if (!ids.includes(otherId)) return { ok: false, error: 'You are not both crew yet.' }

  const { error } = await admin.from('sea_pacts')
    .insert({ requester_id: user.id, addressee_id: otherId })
  if (error && error.code !== '23505') return { ok: false, error: 'The word did not get through.' }
  return { ok: true }
}

/**
 * SAY YES.
 *
 * Guarded on the row still being pending AND on you being the one who was
 * asked, both inside the WHERE — so a captain cannot accept their own request
 * by calling this with their own pact id, and a double tap updates one row and
 * then none.
 */
export async function acceptPact(pactId: number): Promise<{ ok: boolean; error?: string }> {
  const user = await me()
  if (!user) return { ok: false, error: 'Not signed in.' }
  const admin = createAdminClient()
  const { data } = await admin.from('sea_pacts')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', pactId)
    .eq('addressee_id', user.id)
    .eq('status', 'pending')
    .select('id')
  if (!data?.length) return { ok: false, error: 'That one is already settled.' }
  return { ok: true }
}

/**
 * END IT, or turn it down. One action for both because they are the same act:
 * the row goes, and the water closes.
 *
 * Either captain may do this at any time, which is the point — a pact you
 * cannot leave is not consent, it is a contract.
 */
export async function endPact(pactId: number): Promise<{ ok: boolean }> {
  const user = await me()
  if (!user) return { ok: false }
  const admin = createAdminClient()
  await admin.from('sea_pacts').delete()
    .eq('id', pactId)
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
  return { ok: true }
}

/** End the pact with a given captain, when the caller knows the person rather
 *  than the row — which is what the "sailing with" list has to hand. */
export async function endPactWith(otherId: string): Promise<{ ok: boolean }> {
  const user = await me()
  if (!user) return { ok: false }
  const admin = createAdminClient()
  await admin.from('sea_pacts').delete()
    .or(`and(requester_id.eq.${user.id},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${user.id})`)
  return { ok: true }
}

/**
 * HOW MANY CAPTAINS ARE WAITING ON YOUR ANSWER.
 *
 * The one number the chart needs on load. A request used to be invisible until
 * the addressee happened to open the crew panel, which for most captains is
 * never — the asker sat unanswered for days and read it as the feature being
 * broken rather than as silence. The crew button wears this as a badge.
 */
export async function pendingPacts(): Promise<number> {
  const user = await me()
  if (!user) return 0
  const admin = createAdminClient()
  const { count } = await admin
    .from('sea_pacts')
    .select('id', { count: 'exact', head: true })
    .eq('addressee_id', user.id)
    .eq('status', 'pending')
  return count ?? 0
}
