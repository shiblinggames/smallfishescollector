// Bounty ranks — a standing you climb as your LIFETIME bounty points grow,
// separate from the milestone rewards you collect. Each rank carries a painted
// medallion (public/bounty/ranks, Kie-generated in the house style) and a title
// the harbourmaster gives you. Five rungs landing on the odd point milestones,
// so a new emblem arrives every second milestone rather than every one.

export type BountyRank = {
  slug: string
  title: string
  /** Lifetime bounty points needed to hold this rank. */
  points: number
  /** 192px transparent medallion under public/. */
  emblem: string
  /** The rank's colour, for glow and title. */
  accent: string
  /** One line the harbourmaster would say of you. */
  blurb: string
}

export const BOUNTY_RANKS: BountyRank[] = [
  { slug: 'freebooter',    title: 'Freebooter',    points: 25,   emblem: '/bounty/ranks/freebooter.png',    accent: '#9db4c9', blurb: 'You take the odd order off the board.' },
  { slug: 'bloodhound',    title: 'Bloodhound',    points: 120,  emblem: '/bounty/ranks/bloodhound.png',    accent: '#cf8f7c', blurb: 'The harbourmaster knows your name now.' },
  { slug: 'privateer',     title: 'Privateer',     points: 320,  emblem: '/bounty/ranks/privateer.png',     accent: '#c8d2df', blurb: 'You hunt with a letter of marque.' },
  { slug: 'reckoner',      title: 'Reckoner',      points: 650,  emblem: '/bounty/ranks/reckoner.png',      accent: '#e2b84e', blurb: 'Debts come due when you make port.' },
  { slug: 'bounty_hunter', title: 'Bounty Hunter', points: 1200, emblem: '/bounty/ranks/bounty_hunter.png', accent: '#e78a68', blurb: 'The name whispered on every dock.' },
]

/** The rank this many lifetime points holds, or null before the first. */
export function rankForPoints(points: number): BountyRank | null {
  let held: BountyRank | null = null
  for (const r of BOUNTY_RANKS) if (points >= r.points) held = r
  return held
}

/** The next rank still to earn, or null once every one is held. */
export function nextRank(points: number): BountyRank | null {
  return BOUNTY_RANKS.find(r => points < r.points) ?? null
}

/** Did crossing from `before` to `after` points earn a NEW rank? Returns it. */
export function rankGained(before: number, after: number): BountyRank | null {
  const had = rankForPoints(before)
  const has = rankForPoints(after)
  if (has && (!had || has.points > had.points)) return has
  return null
}
