/**
 * The six doors on the Mainland, and their paintings.
 *
 * Its own module so the boot screen can fetch the art before anybody presses
 * "go ashore". It used to live inside SeaMap, which is seventeen thousand
 * lines and the last thing a loading screen should import; the six PNGs were
 * therefore not warmed with the rest of the chart, and arrived one at a time
 * while the chooser was already open. Same reasoning as folkFaces.
 *
 * ── TWO ROWS, AND THE ROWS MEAN SOMETHING ────────────────────────────────
 *
 * Six doors in one grid was six equal choices, and a new captain had to read
 * all six blurbs to learn that three of them are about the boat and three of
 * them are games. The top row is where you look after yourself: the people
 * you sail with, the fish you sell, the gear you buy. The bottom row is what
 * you do for an evening ashore. The label on each row says so.
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

export type AshoreRow = { label: string; doors: AshoreDoor[] }

export const ASHORE_ROWS: AshoreRow[] = [
  { label: 'Your crew, your catch, your gear', doors: [
    { href: '/tavern', art: '/sea/tavern.png', name: 'The Tavern',
      blurb: 'Other captains, the regulars and the day’s races', cta: 'Enter', accent: '#e0a545' },
    { href: '/tavern/market', art: '/sea/market.png', name: 'The Market',
      blurb: 'Sell the hold at full price', cta: 'Trade', accent: '#7fd6a0',
      // The first voyage lights this one up when it sends a captain in to sell
      // their first fish. See SeaFirstVoyage.
      coach: 'market' },
    { href: '/marketplace/tackle-shop', art: '/sea/tackle.png', name: 'Tackle Shop',
      blurb: 'Rods, hooks, reels and bait', cta: 'Browse', accent: '#67d4e8' },
  ] },
  { label: 'Games and puzzles', doors: [
    { href: '/tavern/trivia', art: '/sea/parlor.png', name: 'The Parlor',
      blurb: 'Trivia for doubloons and gems', cta: 'Sit in', accent: '#dd8f79' },
    { href: '/tavern/casino', art: '/sea/den.png', name: 'The Den',
      blurb: 'Blackjack, slots and the wheel', cta: 'Play', accent: '#d9534f' },
    { href: '/tavern/chart-room', art: '/sea/charting.png', name: 'The Chart Room',
      blurb: 'Weekly puzzles that uncover the World Chart', cta: 'Study', accent: '#6fc4b4' },
  ] },
]

/** The six in reading order, for anything that only needs the list. */
export const ASHORE: AshoreDoor[] = ASHORE_ROWS.flatMap(r => r.doors)
