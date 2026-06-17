'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPremiumActive } from '@/lib/premium'
import { getStripe, MEMBERSHIP_PRICE_CENTS, MEMBERSHIP_PRODUCT_NAME } from '@/lib/stripe'
import type Stripe from 'stripe'

const PRODUCT_DESCRIPTION = 'Lifetime membership. More daily gems, premium bait, a weekly gold crate, and Captain-only games.'

/** Shared eligibility gate + the line item / metadata every checkout session
 *  needs. Returns the user (for the session) or an error to bubble up. */
async function guardAndBuild(): Promise<
  | { error: string }
  | { user: { id: string; email?: string }; line_items: Stripe.Checkout.SessionCreateParams.LineItem[]; metadata: Record<string, string> }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Please sign in first.' }

  // Already a member? Don't let them pay twice.
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('is_premium, premium_expires_at').eq('id', user.id).single()
  if (isPremiumActive(profile)) return { error: "You're already a Captain." }

  if (!process.env.STRIPE_SECRET_KEY) return { error: 'Payments are not configured yet.' }

  return {
    user: { id: user.id, email: user.email ?? undefined },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: MEMBERSHIP_PRICE_CENTS,
        product_data: { name: MEMBERSHIP_PRODUCT_NAME, description: PRODUCT_DESCRIPTION },
      },
    }],
    metadata: { user_id: user.id, kind: 'membership' },
  }
}

/** Create an EMBEDDED Checkout session and return its client secret. The card
 *  form renders inside the in-app modal; redirect_on_completion 'never' keeps
 *  the whole flow in the popup. The buyer is identified by metadata.user_id so
 *  the webhook knows whom to grant — payment is only ever trusted from the
 *  webhook, never the client. */
export async function createEmbeddedCheckout(): Promise<{ clientSecret: string } | { error: string }> {
  const built = await guardAndBuild()
  if ('error' in built) return built
  try {
    const session = await getStripe().checkout.sessions.create({
      ui_mode: 'embedded_page',
      mode: 'payment',
      redirect_on_completion: 'never',
      line_items: built.line_items,
      client_reference_id: built.user.id,
      customer_email: built.user.email,
      metadata: built.metadata,
    })
    if (!session.client_secret) return { error: 'Could not start checkout.' }
    return { clientSecret: session.client_secret }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not start checkout.'
    console.error('[membership] embedded session create failed:', msg)
    return { error: msg }
  }
}

/** Create a Stripe-HOSTED Checkout session and return its URL — the reliable
 *  fallback. The client navigates to Stripe's own page; on success Stripe
 *  returns them to /marketplace?membership=success. Same webhook fulfillment. */
export async function createHostedCheckout(): Promise<{ url: string } | { error: string }> {
  const built = await guardAndBuild()
  if ('error' in built) return built
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://seasthebooty.com'
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      success_url: `${base}/marketplace?membership=success`,
      cancel_url: `${base}/marketplace?membership=cancelled`,
      line_items: built.line_items,
      client_reference_id: built.user.id,
      customer_email: built.user.email,
      metadata: built.metadata,
    })
    if (!session.url) return { error: 'Could not start checkout.' }
    return { url: session.url }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not start checkout.'
    console.error('[membership] hosted session create failed:', msg)
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
