import type { Metadata, Viewport } from 'next'
import { Cinzel, Karla, Pirata_One } from 'next/font/google'
import './globals.css'
import PageTransition from '@/components/PageTransition'
import ClientBackground from '@/components/ClientBackground'
import MobileTabBar from '@/components/MobileTabBar'
import BadgeWatcher from '@/components/BadgeWatcher'
import BackgroundAnimationPauser from '@/components/BackgroundAnimationPauser'
import DragScrollRows from '@/components/DragScrollRows'
import PendingSalesWatcher from '@/components/PendingSalesWatcher'
import FishingAudioPrimer from '@/components/FishingAudioPrimer'
import ActivityPing from '@/components/ActivityPing'

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

export const metadata: Metadata = {
  metadataBase: new URL('https://seasthebooty.com'),
  title: 'Small Fishes: Seas the Booty — Online Game',
  description: 'Redeem your pack code and collect all 36 digital fish cards.',
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
        <ClientBackground />
        <PageTransition>
          {children}
        </PageTransition>
<MobileTabBar />
        <BadgeWatcher />
        <PendingSalesWatcher />
        <FishingAudioPrimer />
        <ActivityPing />
        <BackgroundAnimationPauser />
        <DragScrollRows />
        <footer className="sm:pb-4 pt-3 text-center">
          <p className="font-karla font-300 text-[#3a3835]" style={{ fontSize: '0.65rem' }}>
            &copy; {new Date().getFullYear()} Shibling Games LLC
          </p>
        </footer>
      </body>
    </html>
  )
}
