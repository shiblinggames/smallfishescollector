// ── THE MUSTER ───────────────────────────────────────────────────────────────
// A roster gate. Not a drill you play: an INSPECTION you either pass or don't.
//
// It exists because of a real teaching gap. Chapter 4 is built on mechanic checks
// (Sal's Death Roll, the Ghost's three, Don's six), and every one of them is
// answered with a CREW ABILITY, never a dodge and never a good shot. Nothing in the
// game says so. A player can arrive at Sal with five sharpshooters and a full magazine
// and simply have no legal answer to the move that ends them.
//
// So the don's men look over your crew before they let you near the line. The node
// doesn't ask you to USE an ability — it checks you brought someone who could.
import type { MechanicResponse } from './bossRaids'
import { CLASS_BY_SLUG, type CrewClass } from './crewClasses'
import { crewLevelFromXP } from './crewLevel'

/** Which of the five check answers each crew class can produce. Mirrors exactly what
 *  RaidCombat actually reads when it resolves a BossMechanicCheck:
 *    brace  <- Anchor's brace is up          shield <- Tidecaller's shield is up
 *    snare  <- Snare has jammed the dodge    heal   <- a heal ability fired
 *    burst  <- a legendary big-shot fired
 *  Classes not listed here (Sharpshot, Navigator, Oracle, Vengeance) are strong crew
 *  that simply cannot ANSWER a check. That is the whole point of the inspection. */
export const CLASS_RESPONSES: Partial<Record<CrewClass, MechanicResponse[]>> = {
  anchor:       ['brace'],
  abyssal_tide: ['shield', 'heal'],   // the Tidecaller both shields and mends
  mender:       ['heal'],
  snare:        ['snare'],
  leviathan:    ['burst'],
  blitz:        ['burst'],
  // The Oracle (Dole) foresees the enemy's whole hand — reading any blow means
  // you're ready for it, so it answers EVERY check category. Matches the
  // in-combat noteCheckResponse breadth in RaidCombat.
  foresight:    ['brace', 'shield', 'heal', 'snare', 'burst'],
}

export interface RaidMuster {
  /** Bodies that must be standing in the RAID party (not the voyage one). */
  minCrew: number
  /** Every one of them must be at or above this level. A chain is its weakest hand. */
  minLevel: number
  /** Each group is an ANY-OF: the party must field at least one crew who can produce
   *  SOME response in every group. So [['brace','shield'], ['heal']] reads as "someone
   *  who can get between you and a blow, and someone who can put hull back on". */
  requires: MechanicResponse[][]
}

export interface MusterCrew {
  name: string
  level: number
  classId: CrewClass | null
}

/** Build the inspection's view of a crew row. */
export function musterCrewFrom(row: { name: string; xp: number; slug: string }): MusterCrew {
  const cls = CLASS_BY_SLUG[(row.slug ?? '').toLowerCase()] ?? null
  return { name: row.name, level: crewLevelFromXP(row.xp), classId: cls }
}

const RESPONSE_LABEL: Record<MechanicResponse, string> = {
  brace:  'Brace',
  shield: 'Shield',
  snare:  'Snare',
  heal:   'Heal',
  burst:  'Heavy Salvo',
}

export interface MusterRow {
  label: string
  /** Who satisfies it (empty when nobody does). */
  met: string[]
  ok: boolean
}

export interface MusterReport {
  rows: MusterRow[]
  passed: boolean
}

/** Run the inspection. Pure, so the SERVER and the sheet can never disagree about
 *  whether a player passed. */
export function musterReport(m: RaidMuster, party: MusterCrew[]): MusterReport {
  const rows: MusterRow[] = []

  rows.push({
    label: `${m.minCrew} crew at the rail`,
    met: party.map(c => c.name),
    ok: party.length >= m.minCrew,
  })

  const under = party.filter(c => c.level < m.minLevel)
  rows.push({
    label: `Every hand at Level ${m.minLevel} or better`,
    met: under.map(c => `${c.name} is only ${c.level}`),
    ok: party.length > 0 && under.length === 0,
  })

  for (const group of m.requires) {
    const who = party.filter(c => {
      const can = c.classId ? (CLASS_RESPONSES[c.classId] ?? []) : []
      return group.some(r => can.includes(r))
    })
    rows.push({
      label: `Someone who can ${group.map(r => RESPONSE_LABEL[r]).join(' or ')}`,
      met: who.map(c => c.name),
      ok: who.length > 0,
    })
  }

  return { rows, passed: rows.every(r => r.ok) }
}
