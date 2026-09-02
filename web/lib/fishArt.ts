/**
 * WHERE A FISH'S PICTURE LIVES.
 *
 * One line, and it was written five times: once in `components/CatchResultCard`
 * and again, by hand, in ProfileClient, ProfileShowcase and VaultOfAncients. Five
 * copies of a slug rule is five chances for a renamed species to lose its picture
 * on four screens and keep it on the fifth.
 *
 * ── AND IT HAS TO BE OUT OF A CLIENT FILE ───────────────────────────────────
 *
 * The canonical copy lived in CatchResultCard, which is `'use client'`, so any
 * server component calling it got:
 *
 *     Attempted to call fishImageUrl() from the server but fishImageUrl is on
 *     the client.
 *
 * The Homestead did exactly that, and got away with it for months for a stupid
 * reason: it called this inside `.map()` over the giants you have landed, and it
 * was reading the wrong record, so the array was ALWAYS empty and the call never
 * happened. Fixing the trophy wall put six items in that array and the page threw
 * on the spot — a bug that had been sitting there the whole time, held shut by
 * another bug.
 *
 * A plain module has no side and can be called from either, which is what a pure
 * string function should always have been.
 */
export function fishImageUrl(name: string) {
  return `/fish/${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.png`
}
