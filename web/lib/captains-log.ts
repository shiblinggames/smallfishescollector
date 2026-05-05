import { anthropic } from './anthropic'
import { getCrewTrait } from './crew-traits'
import { createAdminClient } from './supabase/admin'
import type { VoyageEvent, VoyageRoute } from './voyageEvents'
import { ROUTE_CONFIGS } from './voyageEvents'

export interface VoyageCrewMember {
  name: string
  rarity: string
  variantId: number
}

export interface VoyageLogInput {
  voyageId: number
  route: VoyageRoute
  crew: VoyageCrewMember[]
  events: VoyageEvent[]
  totalDoubloons: number
  totalGems: number
  crewLostNames: string[]  // names of crew who didn't return
}

export async function generateVoyageLog(input: VoyageLogInput): Promise<string> {
  const routeConfig = ROUTE_CONFIGS[input.route]

  const crewLines = input.crew.map(c => {
    const trait = getCrewTrait(c.name, c.rarity)
    const lost = input.crewLostNames.includes(c.name)
    return `${c.name} (${c.rarity})${lost ? ' — DID NOT RETURN' : ''}: "${trait}"`
  }).join('\n')

  const eventLines = input.events.map(e => {
    const icon = e.outcome === 'success' ? '✓' : e.outcome === 'failure' ? '✗' : '~'
    return `${icon} ${e.title} (${e.type}, ${e.outcome})`
  }).join('\n')

  const hasCatfish = input.crew.some(c => c.name === 'Catfish')
  const hasDobyMick = input.crew.some(c => c.name === 'Doby Mick')
  const abyssNote = (hasCatfish && hasDobyMick && input.route === 'deep')
    ? '\nNote: Both Catfish and Doby Mick are aboard. They do not speak to each other on deep runs. Reference this tension without explaining it.'
    : ''

  const lootLine = [
    input.totalDoubloons > 0 ? `${input.totalDoubloons} doubloons` : null,
    input.totalGems > 0 ? `${input.totalGems} gems` : null,
  ].filter(Boolean).join(', ') || 'nothing'

  const crewLostLine = input.crewLostNames.length > 0
    ? `Crew lost: ${input.crewLostNames.join(', ')}`
    : 'All crew returned'

  const prompt = `Captain's log entries for Seas the Booty — a pirate fish game. All characters are anthropomorphized fish pirates.
Factions: Saltwater Brotherhood (ruthless), Gilded Net (merchant, dishonest), Deepwatch (enforcers), Drifters (nomadic).
Valdris: giant Moray Eel, Brotherhood captain. Barnacle Pete: Pufferfish smuggler.

The captain waits at port. Write the log entry the night the crew returned. 2 sentences. 3 maximum only if someone died or something extraordinary happened. First person, past tense.

VOYAGE:
Route: ${routeConfig.name}
Loot: ${lootLine}
${crewLostLine}

CREW (name, rarity, personality):
${crewLines}

EVENTS (title, outcome):
${eventLines || 'Uneventful'}
${abyssNote}

RULES:
- Short. Every word earns its place.
- Let crew personality color how you mention them — don't explain the trait, just write them that way.
- The captain wasn't there. Write from that remove.
- If crew died, state it plainly. No mourning.
- End on something that lands.
- NEVER: "Unfortunately", "Sadly", "lesson learned", "all in all", "it was".

EXAMPLES:
"Bass came back with 340 doubloons and something he wouldn't name. I didn't ask."
"Sent Eel and Krill into the Howling Deep. One came back. Eel."
"The Crossing pushed them — Brotherhood contact mid-route, weather behind it. Hammerhead held. 620 doubloons. Good crew."
"They didn't come back. The ship did."

Return ONLY the log entry. No quotes around it. No title.`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 160,
    messages: [{ role: 'user', content: prompt }],
  })

  const block = response.content[0]
  return block.type === 'text' ? block.text.trim() : ''
}

export async function generateAndSaveVoyageLog(input: VoyageLogInput): Promise<void> {
  try {
    const log = await generateVoyageLog(input)
    const admin = createAdminClient()
    await admin.from('daily_voyages').update({
      captains_log: log,
      log_generated_at: new Date().toISOString(),
    }).eq('id', input.voyageId)
  } catch (err) {
    console.error('Voyage log generation failed:', err)
  }
}
