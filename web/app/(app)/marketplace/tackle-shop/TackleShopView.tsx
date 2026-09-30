// THE TACKLE SHOP PAGE, DRAWN (split out 2026-09-30): the backdrop and the
// column around the shop. Its props come from lib/core/harbour tackleShopProps
// on both builds.

import TackleShopClient from './TackleShopClient'
import type { ComponentProps } from 'react'

export default function TackleShopView(props: ComponentProps<typeof TackleShopClient>) {
  return (
    <>
      {/* Painterly bait-and-tackle shop backdrop, under a scrim heavy enough
          that it is TEXTURE rather than a picture.

          It was at 0.6 opening, which is a photograph you can read every detail
          of, and the whole page sits on top of it: a category grid, then rows
          of rod, reel, hook, line and bait tiles, most of them 4-6% white
          washes. The shipyard next door deliberately has no image at all for
          exactly this reason, and its own note in ClientBackground says why —
          "a busy photo behind translucent tiles was exactly what made them look
          muddy". This page added a photo and then hit that. */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tackle-shop-page-bg.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(6,9,14,0.90) 0%, rgba(6,9,14,0.94) 42%, rgba(5,7,11,0.98) 100%)' }} />
      </div>
      <main className="min-h-screen pb-24 sm:pb-0 pt-6" style={{ position: 'relative', zIndex: 1 }}>
        <TackleShopClient {...props} />
      </main>
    </>
  )
}
