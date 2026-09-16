import type { Metadata, Viewport } from 'next'
import { Cinzel, Karla, Pirata_One } from 'next/font/google'
import './globals.css'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import PageTransition from '@/components/PageTransition'
import ClientBackground from '@/components/ClientBackground'
import MobileTabBar from '@/components/MobileTabBar'
import BadgeWatcher from '@/components/BadgeWatcher'
import ProfileLive from '@/components/ProfileLive'
import BackgroundAnimationPauser from '@/components/BackgroundAnimationPauser'
import DragScrollRows from '@/components/DragScrollRows'
import KeyboardAdvance from '@/components/KeyboardAdvance'
import PendingSalesWatcher from '@/components/PendingSalesWatcher'
import FishingAudioPrimer from '@/components/FishingAudioPrimer'
import ActivityPing from '@/components/ActivityPing'
import StaleBuildGuard from '@/components/StaleBuildGuard'

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-cinzel',
})

const pirata = Pirata_One({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-pirata',
})

const karla = Karla({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-karla',
})

/**
 * ── WHAT THE INTERNET SEES ──────────────────────────────────────────────────
 *
 * This was two years out of date and describing a different game: "Redeem your
 * pack code and collect all 36 digital fish cards" is the card-pack economy,
 * retired months ago, and the title carried an em-dash against the house rule.
 * It is the description Google prints and the one every pasted link unfurled
 * with, so it was the most-read sentence the game had and it was fiction.
 *
 * The TEMPLATE is new. Pages set bare titles ("The Sea", "The Shipyard") and
 * were shipping browser tabs and search results that said only that, with no
 * way to tell whose sea it was.
 *
 * The card's picture is generated next door in app/opengraph-image.tsx.
 */
export const metadata: Metadata = {
  metadataBase: new URL('https://seasthebooty.com'),
  title: {
    default: 'Small Fishes: Seas the Booty',
    template: '%s · Small Fishes',
  },
  description: 'A free browser game on an open sea. Sail a fogged chart, fish it with a needle and a shrinking window, sign a crew, and take a ship into nine boss fights.',
  applicationName: 'Small Fishes',
  openGraph: {
    type: 'website',
    siteName: 'Small Fishes: Seas the Booty',
    title: 'Small Fishes: Seas the Booty',
    description: 'A free browser game on an open sea. Sail a fogged chart, fish it with a needle and a shrinking window, sign a crew, and take a ship into nine boss fights.',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Small Fishes: Seas the Booty',
    description: 'A free browser game on an open sea. Sail a fogged chart, fish it with a needle and a shrinking window, sign a crew, and take a ship into nine boss fights.',
  },
}

// Lock the scale so iOS doesn't auto-zoom when focusing an input whose
// font-size is < 16px (the qty field, friend search, etc.). With no zoom
// headroom there's nothing to zoom into on focus. This is a game played
// at a fixed layout, so disabling pinch-zoom is the intended UX anyway —
// it's fully respected in iOS PWA standalone (the primary platform).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cinzel.variable} ${karla.variable} ${pirata.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Small Fishes" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="min-h-screen bg-[#000000] text-[#f0ede8] font-karla">
        {/* FIRST, because a tab running a build that no longer exists cannot
            be fixed by anything below it. See lib/staleBuild. */}
        <StaleBuildGuard />
        <ClientBackground />
        <PageTransition>
          {children}
        </PageTransition>
<MobileTabBar />
        {/* Before the badge watcher in the tree only for reading order; the
            two talk through window events, not props. See ProfileLive. */}
        <ProfileLive />
        <BadgeWatcher />
        <PendingSalesWatcher />
        <FishingAudioPrimer />
        <ActivityPing />
        <BackgroundAnimationPauser />
        <DragScrollRows />
        <KeyboardAdvance />
        <footer className="sm:pb-4 pt-3 text-center">
          <p className="font-karla font-300 text-[#3a3835]" style={{ fontSize: '0.65rem' }}>
            &copy; {new Date().getFullYear()} Shibling Games LLC
          </p>
        </footer>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
