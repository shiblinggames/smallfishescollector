'use server'

import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { gemPack } from '@/lib/gemPacks'

/**
 * Buy a gem pack. Mirrors the membership flow deliberately — embedded Checkout,
 * the buyer identified by metadata, and the actual grant left entirely to the
 * webhook. The client is never trusted to say a payment happened; it only ever
 * says which pack was chosen, and even that is re-read from the catalog here so
 * a forged pack id or a tampered price cannot reach Stripe.
 */
export async function createGemCheckout(packId: string): Promise<{ clientSecret: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  // Price and gem count come from the SERVER catalog, never from the caller.
  const pack = gemPack(packId)
  if (!pack) return { error: 'That pack is not for sale.' }

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
          unit_amount: pack.priceCents,
          product_data: {
            name: `${pack.name} — ${pack.gems.toLocaleString()} gems`,
            description: pack.blurb,
          },
        },
      }],
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      // kind + pack are what the webhook fulfils against. The gem COUNT is not
      // sent: the webhook re-reads it from the catalog, so a session that was
      // somehow tampered with still pays out only what that pack is worth.
      metadata: { user_id: user.id, kind: 'gems', pack: pack.id },
    })
    if (!session.client_secret) return { error: 'Could not start checkout.' }
    return { clientSecret: session.client_secret }
  } catch {
    return { error: 'Could not start checkout.' }
  }
}
