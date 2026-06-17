'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPremiumActive } from '@/lib/premium'
import { getStripe, MEMBERSHIP_PRICE_CENTS, MEMBERSHIP_PRODUCT_NAME } from '@/lib/stripe'

/** Create a Stripe-hosted Checkout session for the membership purchase and
 *  return its URL. The client sends the buyer to Stripe's own secure page;
 *  on success Stripe returns them to /marketplace?membership=success. The
 *  buyer is identified by metadata.user_id + client_reference_id so the
 *  webhook knows whom to grant — payment is never trusted from the redirect,
 *  only from the webhook. Hosted (not embedded) for maximum reliability. */
export async function createMembershipCheckout(): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Please sign in first.' }

  // Already a member? Don't let them pay twice.
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('is_premium, premium_expires_at').eq('id', user.id).single()
  if (isPremiumActive(profile)) return { error: "You're already a member." }

  if (!process.env.STRIPE_SECRET_KEY) return { error: 'Payments are not configured yet.' }

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://seasthebooty.com'
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      success_url: `${base}/marketplace?membership=success`,
      cancel_url: `${base}/marketplace?membership=cancelled`,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: MEMBERSHIP_PRICE_CENTS,
          product_data: {
            name: MEMBERSHIP_PRODUCT_NAME,
            description: 'Lifetime Captaincy — cosmetic perks + small daily boosts. Never pay-to-win.',
          },
        },
      }],
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata: { user_id: user.id, kind: 'membership' },
    })
    if (!session.url) return { error: 'Could not start checkout.' }
    return { url: session.url }
  } catch (e) {
    // Surface the real Stripe message during beta so misconfig (bad key etc.)
    // is diagnosable instead of a silent failure.
    const msg = e instanceof Error ? e.message : 'Could not start checkout.'
    console.error('[membership] checkout session create failed:', msg)
    return { error: msg }
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
