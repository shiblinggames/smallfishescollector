'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

/**
 * The HOSTED fallback, for when the embedded form cannot run (no publishable
 * key, a blocked iframe, the nine-second watchdog). Same session, same
 * metadata, same webhook; the only difference is where the card form lives.
 * Returns to the sea, which is where a captain buying gems is standing.
 */
export async function createGemHostedCheckout(packId: string): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const pack = gemPack(packId)
  if (!pack) return { error: 'That pack is not for sale.' }
  if (!process.env.STRIPE_SECRET_KEY) return { error: 'Payments are not configured yet.' }
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://seasthebooty.com'
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      success_url: `${base}/sea?gems=success`,
      cancel_url: `${base}/sea?gems=cancelled`,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: pack.priceCents,
          product_data: { name: `${pack.name}: ${pack.gems.toLocaleString()} gems`, description: pack.blurb },
        },
      }],
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata: { user_id: user.id, kind: 'gems', pack: pack.id },
    })
    if (!session.url) return { error: 'Could not start checkout.' }
    return { url: session.url }
  } catch (e) {
    console.error('[gems] hosted session create failed:', e instanceof Error ? e.message : e)
    return { error: 'Could not start checkout.' }
  }
}

/** The purse, for the modal's poll after paying: the grant is the webhook's,
 *  and this is how the modal finds out it has landed. */
export async function currentGems(): Promise<{ gems: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { gems: 0 }
  const { data } = await createAdminClient().from('profiles').select('gems').eq('id', user.id).single()
  return { gems: Number(data?.gems ?? 0) }
}
