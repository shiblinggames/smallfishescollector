// Persistent raid progression map. A Super-Mario-style path of nodes shown
// (Slay-the-Spire-ish visually) inside the collapsible Raids section.
//
// Combat nodes route into the existing /raids screens; a node is "cleared"
// when beaten at least once (derived from existing data — no raid-engine
// changes). One-time nodes (milestone / shop) persist in
// profiles.raid_node_progress jsonb: { cleared: string[] }.
//
// Adding new raids/skirmishes/stops = appending to RAID_MAP. The chain is
// gated by `requiresNode` (+ optional Nav level); a cleared combat node
// stays farmable.

export type RaidNodeType = 'combat' | 'milestone' | 'shop'

export interface RaidNode {
  id: string
  type: RaidNodeType
  label: string
  /** Pirate-flavored blurb shown on the node. */
  flavor: string
  /** Node id that must be cleared before this one unlocks (omit = start). */
  requiresNode?: string
  /** Optional extra gate: minimum Navigation level. */
  requiresNavLevel?: number
  /** combat: route to the existing combat screen. */
  route?: string
  /** milestone: reach (not spend) `amount` doubloons to clear; optional
   *  one-time reward on claim. */
  milestone?: { amount: number; rewardDoubloons?: number }
}

export const RAID_MAP: RaidNode[] = [
  {
    id: 'skirmish',
    type: 'combat',
    label: 'Reef Skirmish',
    flavor: 'Learn the broadside system against a lone Reef Raider. Clear it once to set sail on the campaign.',
    route: '/raids/practice',
  },
  {
    id: 'pete',
    type: 'combat',
    label: "The Corsair's Reckoning",
    flavor: 'Barnacle Pete and his fleet have been spotted off the coast. Bring him to justice — dead or alive.',
    requiresNode: 'skirmish',
    route: '/raids',
  },
  {
    id: 'bilge_milestone',
    type: 'milestone',
    label: 'The Bilge Rats',
    flavor: 'Word of Pete’s fall spreads the docks over. Prove your coffers run deep enough to bankroll the next campaign.',
    requiresNode: 'pete',
    milestone: { amount: 2000, rewardDoubloons: 500 },
  },
  {
    id: 'quartermaster',
    type: 'shop',
    label: "Quartermaster's Cache",
    flavor: 'A fence who deals in raid contraband — upgrades, oddities, contraband cannon. Opening soon.',
    requiresNode: 'bilge_milestone',
  },
]

export type RaidNodeStatus = 'locked' | 'available' | 'cleared'

export interface RaidNodeView {
  node: RaidNode
  status: RaidNodeStatus
  /** milestone only: available + threshold met + not yet cleared. */
  claimable: boolean
  /** locked reason for the UI hint. */
  lockReason?: string
}

/** Pure status resolver. `cleared` is the set of node ids already done
 *  (combat beaten ≥1 / milestone claimed). Combat clears are derived by the
 *  caller from existing data; one-time clears come from raid_node_progress. */
export function computeRaidMap(
  cleared: Set<string>,
  doubloons: number,
  navLevel: number,
): RaidNodeView[] {
  return RAID_MAP.map(node => {
    if (cleared.has(node.id)) {
      return { node, status: 'cleared' as const, claimable: false }
    }
    const prereqOk = !node.requiresNode || cleared.has(node.requiresNode)
    const navOk = !node.requiresNavLevel || navLevel >= node.requiresNavLevel
    if (!prereqOk || !navOk) {
      const reason = !prereqOk
        ? `Clear ${RAID_MAP.find(n => n.id === node.requiresNode)?.label ?? 'the previous stop'} first`
        : `Reach Navigation Level ${node.requiresNavLevel}`
      return { node, status: 'locked' as const, claimable: false, lockReason: reason }
    }
    const claimable = node.type === 'milestone' && !!node.milestone && doubloons >= node.milestone.amount
    return { node, status: 'available' as const, claimable }
  })
}
