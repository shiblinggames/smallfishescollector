/**
 * The six doors on the Mainland, and their paintings.
 *
 * Its own module so the boot screen can fetch the art before anybody presses
 * "go ashore". It used to live inside SeaMap, which is seventeen thousand
 * lines and the last thing a loading screen should import; the six PNGs were
 * therefore not warmed with the rest of the chart, and arrived one at a time
 * while the chooser was already open. Same reasoning as folkFaces.
 */
export type AshoreDoor = {
  href: string
  art: string
  name: string
  blurb: string
  cta: string
  accent: string
  /** `data-coach` handle, for a tour that needs to point at this door. */
  coach?: string
}

export const ASHORE: AshoreDoor[] = [
  { href: '/tavern', art: '/sea/tavern.png', name: 'The Tavern',
    blurb: 'The day’s tot, and whatever race is running', cta: 'Enter', accent: '#e0a545' },
  { href: '/tavern/casino', art: '/sea/den.png', name: 'The Den',
    blurb: 'Cards, dice and the wheel', cta: 'Play', accent: '#d9534f' },
  { href: '/tavern/chart-room', art: '/sea/charting.png', name: 'The Chart Room',
    blurb: 'The week’s puzzles and the world chart', cta: 'Study', accent: '#6fc4b4' },
  { href: '/tavern/trivia', art: '/sea/parlor.png', name: 'The Parlor',
    blurb: 'Trivia, and the Pirate King ladder', cta: 'Sit in', accent: '#dd8f79' },
  { href: '/tavern/market', art: '/sea/market.png', name: 'The Market',
    blurb: 'Sell the hold at full price', cta: 'Trade', accent: '#7fd6a0',
    // The first voyage lights this one up when it sends a captain in to sell
    // their first fish. See SeaFirstVoyage.
    coach: 'market' },
  { href: '/marketplace/tackle-shop', art: '/sea/tackle.png', name: 'Tackle Shop',
    blurb: 'Rods, hooks, reels and bait', cta: 'Browse', accent: '#67d4e8' },
]
