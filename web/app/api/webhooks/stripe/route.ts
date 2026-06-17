import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import type Stripe from 'stripe'

// Stripe webhook — the authoritative fulfillment for membership purchases. On a
// completed, paid Checkout session tagged kind=membership, flip the buyer to a
// lifetime member (is_premium = true, premium_expires_at = null). Identified by
// the session metadata.user_id we stamped when creating the session, so a
// dropped tab or closed modal can never leave someone paid-but-not-granted.
//
// Setup: add an endpoint in the Stripe dashboard → /api/webhooks/stripe,
// subscribe to checkout.session.completed, and put its signing secret in
// STRIPE_WEBHOOK_SECRET.
export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !sig) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const isMembership = session.metadata?.kind === 'membership'
    const paid = session.payment_status === 'paid'
    const userId = session.metadata?.user_id ?? session.client_reference_id ?? null
    if (isMembership && paid && userId) {
      const admin = createAdminClient()
      await admin.from('profiles')
        .update({ is_premium: true, premium_expires_at: null })
        .eq('id', userId)
    }
  }

  return NextResponse.json({ received: true })
}
