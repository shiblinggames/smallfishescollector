import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Frame-Options',          value: 'DENY' },
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Stripe.js + embedded Checkout load from js.stripe.com and
      // checkout.stripe.com — without these the embedded card form is blocked
      // and renders blank. (Hosted Checkout still works since it's a redirect.)
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://checkout.stripe.com",  // unsafe-eval required by Next.js dev; tighten in future
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.supabase.co https://*.stripe.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://checkout.stripe.com",
      "frame-src https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  /**
   * WHICH BUILD A TAB IS RUNNING, stamped onto every asset request.
   *
   * Chunk filenames are hashed per build, so a tab left open across a deploy is
   * holding a list of files the CDN has stopped serving. The first one it needs
   * that it has not already downloaded 404s, and the page dies — after every
   * deploy, regardless of what was in it.
   *
   * With this set, asset requests carry ?dpl=<id> and Vercel can serve them
   * from the deployment the tab actually came from. THE DASHBOARD TOGGLE IS THE
   * OTHER HALF: Skew Protection has to be enabled on the project or the
   * parameter is simply ignored. Harmless either way, and useless on its own.
   *
   * The boundaries and lib/staleBuild are the belt to this pair of braces: they
   * turn a dead page into a reload rather than preventing the mismatch.
   */
  // deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  //
  // DISABLED — re-enable ONLY together with the Skew Protection toggle in the
  // Vercel dashboard, never alone. It stamps ?dpl=<id> onto every asset URL,
  // and without the toggle that is pure cost with zero benefit: content-hashed
  // assets normally keep the SAME url across deploys, so browser and CDN
  // caches survive shipping — but ?dpl= changes every deploy, so at our
  // cadence every player re-downloaded the whole JS/CSS/font payload a dozen
  // times a day and the CDN never warmed. Measured live: a long-lived font
  // came back X-Vercel-Cache: MISS. "Everything loads significantly slower"
  // was this line.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
