import Stripe from 'stripe'

// Lazy server-side Stripe client. Constructed on first use (not at import) so
// the module is safe to import during build / when STRIPE_SECRET_KEY isn't set
// yet — `new Stripe('')` throws, which would break `next build`.
let _stripe: Stripe | null = null
export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
  _stripe = new Stripe(key)
  return _stripe
}

// Captaincy = a one-time, lifetime unlock (mirrors the existing model where
// premium_expires_at = null means "never expires"). $9.99 USD.
export const MEMBERSHIP_PRICE_CENTS = 999
export const MEMBERSHIP_PRODUCT_NAME = "Sea's The Booty — Captain"
