import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CRON_SECRET              = Deno.env.get("CRON_SECRET");
const SHOPIFY_ADMIN_TOKEN      = Deno.env.get("SHOPIFY_ADMIN_TOKEN");
const SHOPIFY_STORE_DOMAIN     = Deno.env.get("SHOPIFY_STORE_DOMAIN");
const SHOPIFY_PREMIUM_PRODUCT_ID = Deno.env.get("SHOPIFY_PREMIUM_PRODUCT_ID");

Deno.serve(async (req: Request) => {
  const auth = req.headers.get("Authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Membership is lifetime now — nothing to expire. Legacy buyers with a
  // future premium_expires_at still work because the runtime check treats
  // a future date as valid; the column is only kept for that grandfathered
  // population. We no longer downgrade anyone here.

  if (!SHOPIFY_ADMIN_TOKEN || !SHOPIFY_STORE_DOMAIN || !SHOPIFY_PREMIUM_PRODUCT_ID) {
    return new Response(
      JSON.stringify({ ok: true, fixed: 0, note: "Shopify env vars not configured" }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // Fetch orders from the last 48h — catches webhooks that were dropped
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const shopifyUrl =
    `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/orders.json` +
    `?status=any&created_at_min=${encodeURIComponent(since)}` +
    `&fields=id,created_at,customer_email,email,line_items&limit=250`;

  const res = await fetch(shopifyUrl, {
    headers: { "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN },
  });

  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: `Shopify API error: ${res.status}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const { orders = [] } = await res.json();
  let fixed = 0;

  for (const order of orders) {
    const hasPremium = order.line_items?.some(
      (item: { product_id: number }) =>
        String(item.product_id) === SHOPIFY_PREMIUM_PRODUCT_ID,
    );
    if (!hasPremium) continue;

    const email: string | undefined = order.customer_email ?? order.email;
    if (!email) continue;

    const { data: userId } = await admin.rpc("get_user_by_email", { p_email: email });
    if (!userId) continue;

    const { data: profile } = await admin
      .from("profiles")
      .select("is_premium, premium_expires_at")
      .eq("id", userId)
      .single();

    // Treat a future expires_at as valid (legacy 1-year buyer) and a null
    // expires_at as valid (new lifetime buyer). Anything else = grant
    // lifetime to catch up the dropped webhook.
    const expiresAt = profile?.premium_expires_at
      ? new Date(profile.premium_expires_at)
      : null;
    const hasValidPremium =
      !!profile?.is_premium && (!expiresAt || expiresAt > new Date());

    if (!hasValidPremium) {
      await admin.from("profiles").update({
        is_premium: true,
        premium_expires_at: null,
      }).eq("id", userId);
      fixed++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, fixed, checked: orders.length }),
    { headers: { "Content-Type": "application/json" } },
  );
});
