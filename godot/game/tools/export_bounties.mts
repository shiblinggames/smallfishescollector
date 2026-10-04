// THE BOUNTY BOARD'S CATALOGUE for the Godot port (content/bounties.json), read
// out of the web's lib/bounties.ts and lib/bountyRanks.ts. The web is frozen,
// so this ran once (2026-10-04) and its output is committed.
//
// NO GEMS in the port (Kong, 2026-10-04: "port with just doubloons for now"):
// an order pays its tier's gems x 100 in doubloons, and the milestone ladder's
// gem rungs pay the same x 100. The decided longer cosmetic track is not built.
//
//   cd web && npx tsx ../godot/game/tools/export_bounties.mts
import fs from 'node:fs'
import path from 'node:path'
import { ALL_BOUNTIES, BOUNTY_RUNGS, BOUNTY_GEMS, BOUNTY_POINTS, BOUNTY_SWEEP_POINTS, BOUNTY_MILESTONES } from '../../../web/lib/bounties'
import { BOUNTY_RANKS } from '../../../web/lib/bountyRanks'

const PER_GEM = 100
const doubloons = Object.fromEntries(Object.entries(BOUNTY_GEMS).map(([t, g]) => [t, g * PER_GEM]))
// Two gem rungs x 100 would make the ladder dip (40,000 twice; 75,000 after
// 100,000), so they are lifted to keep it climbing.
const SMOOTH: Record<number, number> = { 450: 60_000, 900: 125_000 }
const milestones = BOUNTY_MILESTONES.map(m => {
  const d = SMOOTH[m.points] ?? ((m.doubloons ?? 0) + (m.gems ?? 0) * PER_GEM)
  const label = `${d.toLocaleString('en-US')} ⟡` + (m.shipSkinId ? ' and the Corsair Hull' : '')
  return { points: m.points, doubloons: d, shipSkinId: m.shipSkinId ?? null, label }
})
// The board resets when it is finished, not by the day, and voyages run in sea
// days: the words follow.
const reword = (t: string) => t
  .replace('It takes nine hours.', 'It sails for 11 sea days.')
  .replace('in one day', 'on this board')
  .replace(' today', ' on this board')
  .replace(/ — /g, ', ')
const bounties = ALL_BOUNTIES.map(b => ({ ...b, name: reword(b.name), desc: reword(b.desc) }))
const out = {
  _about: 'The bounty board, from the web (tools/export_bounties.mts). Gems became doubloons at 100 each.',
  bounties, rungs: BOUNTY_RUNGS, doubloons, points: BOUNTY_POINTS, sweepPoints: BOUNTY_SWEEP_POINTS,
  milestones, ranks: BOUNTY_RANKS,
}
fs.writeFileSync(path.join(import.meta.dirname, '..', 'content', 'bounties.json'), JSON.stringify(out, null, 1))
console.log('bounties.json:', ALL_BOUNTIES.length, 'orders,', milestones.length, 'milestones')
