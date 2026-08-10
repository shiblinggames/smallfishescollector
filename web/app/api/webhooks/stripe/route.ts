import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { gemPack } from '@/lib/gemPacks'
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

    // ── Gem packs ───────────────────────────────────────────────────────────
    // EXACTLY ONCE, which the membership grant gets for free by being a boolean
    // and gems do not. Stripe retries a webhook until it gets a 2xx, so the same
    // session can arrive several times; adding gems on each would pay a player
    // twice for one purchase.
    //
    // The ledger row is the lock. payment_ref is UNIQUE, so the first delivery
    // inserts and every later one loses that insert and returns here having
    // granted nothing. Insert BEFORE the balance moves: a crash between the two
    // leaves a recorded purchase and no gems, which is a support ticket, where
    // the other order leaves gems nobody can account for, which is a hole.
    //
    // The gem COUNT is re-read from the catalog rather than taken from the
    // session, so the amount paid out is whatever that pack is worth today.
    if (session.metadata?.kind === 'gems' && paid && userId) {
      const pack = gemPack(session.metadata?.pack ?? '')
      if (pack) {
        const admin = createAdminClient()
        const { error: claimErr } = await admin.from('gem_transactions').insert({
          user_id: userId,
          amount: pack.gems,
          reason: `Bought the ${pack.name}`,
          payment_ref: session.id,
        })
        // Duplicate delivery — already fulfilled, nothing to do.
        if (!claimErr) {
          await admin.rpc('increment_gems', { user_id: userId, amount: pack.gems })
        }
      }
    }
  }

  return NextResponse.json({ received: true })
}
