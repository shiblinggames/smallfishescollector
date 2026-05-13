import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const body = await req.text()

  // Verify Shopify HMAC signature
  const hmac = req.headers.get('x-shopify-hmac-sha256')
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET
  if (!secret || !hmac) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const digest = createHmac('sha256', secret).update(body).digest('base64')
  if (hmac !== digest) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const order = JSON.parse(body)
  const premiumProductId = process.env.SHOPIFY_PREMIUM_PRODUCT_ID

  const hasPremium = premiumProductId && order.line_items?.some(
    (item: any) => String(item.product_id) === premiumProductId
  )
  if (!hasPremium) return NextResponse.json({ ok: true })

  const email = order.customer_email ?? order.email
  if (!email) return NextResponse.json({ ok: true })

  const admin = createAdminClient()

  // Resolve email → user ID via DB function (reads auth.users with service role)
  const { data: userId } = await admin.rpc('get_user_by_email', { p_email: email })
  if (!userId) return NextResponse.json({ ok: true })

  // Lifetime membership — null premium_expires_at means "never expires."
  // The premium_expires_at column is kept for legacy buyers who still have
  // a future date there from the old 1-year era.
  await admin.from('profiles').update({
    is_premium: true,
    premium_expires_at: null,
  }).eq('id', userId)

  return NextResponse.json({ ok: true })
}
