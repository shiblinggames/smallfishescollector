import type { CapacitorConfig } from '@capacitor/cli'

/**
 * THE iOS SHELL.
 *
 * A REMOTE-URL wrapper, not a bundled build. The shell loads the live site
 * exactly as mobile Safari does, which buys three things:
 *
 *   1. No export step. Next.js App Router with 275 server actions cannot be
 *      statically exported, so bundling would mean building an API layer the
 *      app has never had. Pointing at production sidesteps that entirely.
 *   2. No launch cost. A bundled 150k-line app pays a JS parse on every cold
 *      start; this pays a network fetch, same as the site does now.
 *   3. Every deploy ships to the app. No resubmission for a copy fix.
 *
 * The trade is that the app needs a connection, which this game already does
 * for every action anyway.
 *
 * WHAT THE SHELL ACTUALLY ADDS over the PWA: the Taptic Engine (see
 * lib/haptics — iOS Safari has no Vibration API, so haptics are dead there
 * today), a store presence, and the IAP surface. Those are also the answer to
 * App Store guideline 4.2, which rejects plain website wrappers.
 */
const config: CapacitorConfig = {
  appId: 'com.shiblinggames.smallfishes',
  appName: 'Small Fishes',
  // Unused by the remote-URL path, but the CLI requires a real directory.
  webDir: 'public',
  server: {
    url: 'https://www.seasthebooty.com',
    // The live site redirects to www; pointing at the apex would cost every
    // cold start a redirect hop.
    cleartext: false,
  },
  ios: {
    // Let the web app own the full viewport. Its safe-area handling already
    // exists (see PopupShell and the Nav shell), so the native side should not
    // also be insetting or the padding doubles.
    contentInset: 'never',
    // Match the app's dark ground so the overscroll gutter is not white.
    backgroundColor: '#0b0f16',
  },
  plugins: {
    // Native splash rather than a white flash while the site loads.
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#0b0f16', showSpinner: false },
  },
}

export default config
