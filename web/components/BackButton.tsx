'use client'

// A way back, on its own, for a page that has no room header. The pill itself
// lives in BackPill, which is the one definition of this shape: it used to be
// written out here AND in ShopHeader, character for character, which is two
// places for one look to drift apart from itself.

import BackPill from './BackPill'

export default function BackButton({ href, label }: { href: string; label: string }) {
  return <BackPill href={href} label={label} />
}
