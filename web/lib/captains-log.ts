import { anthropic } from './anthropic'
import { getCrewTrait } from './crew-traits'
import { createAdminClient } from './supabase/admin'
import type { CrewCard, CombatRoundLog, NodeResult, ZoneKey } from './expeditions'
import { ZONES, EXPEDITION_SHIP_STATS, ENEMIES } from './expeditions'

export interface ExpeditionLogInput {
  expeditionId: number
  zone: ZoneKey
  shipTier: number
  outcome: 'completed' | 'failed'
  nodesCompleted: number
  hullDamage: number
  crew: CrewCard[]
  combatLog: CombatRoundLog[]
  events: NodeResult[]
  lootDoubloons: number
}

export async function generateCaptainsLog(input: ExpeditionLogInput): Promise<string> {
  const zone = ZONES[input.zone]
  const ship = EXPEDITION_SHIP_STATS[input.shipTier] ?? EXPEDITION_SHIP_STATS[0]
  const maxDurability = ship.durability
  const hullAtEnd = maxDurability - input.hullDamage

  // Build crew highlights from combat log
  const crewHighlights = new Map<string, string[]>()
  for (const round of input.combatLog) {
    if (round.critHit) {
      const captain = input.crew[0]
      if (captain) {
        const arr = crewHighlights.get(captain.name) ?? []
        arr.push('critical_hit')
        crewHighlights.set(captain.name, arr)
      }
    }
    if (round.playerDodged) {
      const captain = input.crew[0]
      if (captain) {
        const arr = crewHighlights.get(captain.name) ?? []
        arr.push('dodge')
        crewHighlights.set(captain.name, arr)
      }
    }
  }

  const crewLines = input.crew.map(c => {
    const trait = getCrewTrait(c.name, c.rarity)
    const highlights = crewHighlights.get(c.name) ?? []
    const actionsStr = highlights.length > 0 ? highlights.join(', ') : 'no notable actions'
    return `${c.name} (${c.rarity}): "${trait}" — actions this run: ${actionsStr}`
  }).join('\n')

  const eventLines = input.events.map(e => {
    const enemyId = (e.details as Record<string, unknown>)?.enemyId as string | undefined
    const enemy = enemyId ? ENEMIES[enemyId] : null
    const label = enemy ? enemy.name : e.type
    const outcomeStr = e.outcome === 'win' ? '✓' : e.outcome === 'lose' ? '✗' : '~'
    return `${outcomeStr} ${label} (${e.type})`
  }).join('\n')

  const hasCatfish = input.crew.some(c => c.name === 'Catfish')
  const hasDobyMick = input.crew.some(c => c.name === 'Doby Mick')
  const abyssNote = (hasCatfish && hasDobyMick && input.zone === 'davy_jones_locker')
    ? '\nNote: Both Abyss navigators (Catfish and Doby Mick) are aboard. They do not speak during Locker runs. Reference this tension without explaining it.'
    : ''

  const prompt = `You write captain's log entries for a pirate fish game called Seas the Booty.
All characters are anthropomorphized fish pirates. The world has four factions:
The Saltwater Brotherhood (ruthless pirates), The Gilded Net (merchant guild, not always honest),
The Deepwatch (mysterious enforcers), The Drifters (nomadic, no allegiance).
Named figures: Valdris (giant Moray Eel, Brotherhood captain), Barnacle Pete (Pufferfish smuggler).

Write a captain's log entry for this expedition.
3 to 5 sentences. First person. Past tense.
Written as if recorded in a journal the night of the voyage.

EXPEDITION DATA:
Zone: ${zone.name}
Outcome: ${input.outcome}
Nodes completed: ${input.nodesCompleted} of ${zone.nodes.length}
Ship: ${ship.name} — hull ${maxDurability} → ${hullAtEnd}
Loot: ${input.lootDoubloons} doubloons

CREW ABOARD:
${crewLines}

EVENTS:
${eventLines || 'None recorded'}
${abyssNote}

TONE RULES — follow exactly:
- Terse and atmospheric. The world is dangerous and indifferent.
- Reference crew by name when they did something notable. Their trait should feel consistent with how they acted — do not quote the trait directly, let it inform the writing.
- A failed run is not a tragedy to bemoan. It is a fact to record.
- Don't describe game mechanics. Write what it felt like.
- The last sentence should land. Make it mean something.
- Vary length and drama to match the run — a short failed run gets a short entry.
- NEVER use: "Unfortunately", "Sadly", "We tried our best", "lesson learned", "all in all".

REFERENCE EXAMPLES (match this tone exactly):

Example 1 — failed, hull destroyed:
"The Deepwatch found us on the fifth node. Hammerhead put two shots through their bow — it wasn't enough. The Anglerfish got us clear of the first volley somehow, which is the only reason I'm writing this. Hull's gone. We came back with 340 doubloons and the knowledge that the Deepwatch is running patrols deeper than the charts suggest."

Example 2 — successful, full clear:
"Eight nodes. The Pale Current was strange today — wrong color, wrong temperature. Anglerfish noticed before anyone else did. She didn't say anything, just moved to the bow. We cleared it clean. Hammerhead was methodical in the Brotherhood encounter. Not angry. Just thorough. 890 doubloons. The crew ate well tonight."

Example 3 — short failed run:
"Three nodes. We turned back. Some days that's the right call and some days it's just the call you made. The Sunken Reach doesn't care which one it was."

Example 4 — abandoned run:
"We left. The math stopped working somewhere around the fourth node and nobody wanted to say it out loud. I said it. We left. The loot wasn't worth what the next node was going to cost."

Return ONLY the log entry. No title. No label. Just the prose.`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const block = response.content[0]
  return block.type === 'text' ? block.text.trim() : ''
}

export async function generateAndSaveCaptainsLog(input: ExpeditionLogInput): Promise<void> {
  try {
    const log = await generateCaptainsLog(input)
    const admin = createAdminClient()
    await admin.from('expeditions').update({
      captains_log: log,
      log_generated_at: new Date().toISOString(),
    }).eq('id', input.expeditionId)
  } catch (err) {
    console.error('Captain log generation failed:', err)
  }
}
