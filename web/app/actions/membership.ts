'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPremiumActive } from '@/lib/premium'
import { getStripe, MEMBERSHIP_PRICE_CENTS, MEMBERSHIP_PRODUCT_NAME } from '@/lib/stripe'

/** Create an embedded Stripe Checkout session for the membership purchase and
 *  return its client secret. The buyer is identified by metadata.user_id +
 *  client_reference_id so the webhook knows whom to grant. redirect_on_completion
 *  is 'never' so the whole flow stays inside the in-app modal. */
export async function createMembershipCheckout(): Promise<{ clientSecret: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Please sign in first.' }

  // Already a member? Don't let them pay twice.
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('is_premium, premium_expires_at').eq('id', user.id).single()
  if (isPremiumActive(profile)) return { error: "You're already a member." }

  if (!process.env.STRIPE_SECRET_KEY) return { error: 'Payments are not configured yet.' }

  try {
    const session = await getStripe().checkout.sessions.create({
      ui_mode: 'embedded_page',
      mode: 'payment',
      redirect_on_completion: 'never',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: MEMBERSHIP_PRICE_CENTS,
          product_data: {
            name: MEMBERSHIP_PRODUCT_NAME,
            description: 'Lifetime membership — cosmetic perks + small daily boosts. Never pay-to-win.',
          },
        },
      }],
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata: { user_id: user.id, kind: 'membership' },
    })
    if (!session.client_secret) return { error: 'Could not start checkout.' }
    return { clientSecret: session.client_secret }
  } catch {
    return { error: 'Could not start checkout. Try again in a moment.' }
  }
}

/** Lightweight poll for the modal — true once the webhook has flipped the
 *  player to a member after a successful payment. */
export async function checkMembership(): Promise<{ isMember: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { isMember: false }
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles').select('is_premium, premium_expires_at').eq('id', user.id).single()
  return { isMember: isPremiumActive(data) }
}
