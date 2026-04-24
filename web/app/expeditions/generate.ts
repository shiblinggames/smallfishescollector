import { createAdminClient } from '@/lib/supabase/admin'
import { anthropic } from '@/lib/anthropic'
import { ZONES, EVENT_MECHANICS, ZONE_ORDER, type ZoneKey, type EventNode, type DailyExpeditionRow } from '@/lib/expeditions'

const ZONE_PERSONALITY: Record<ZoneKey, string> = {
  coral_run: `Relatively safe but never boring. The Gilded Net runs these waters — merchants, traders, opportunists. Threats are manageable. Tone: tense but survivable, occasional dark humor. The danger here is complacency.`,

  bertuna_triangle: `Ships disappear here without explanation. The Saltwater Brotherhood is active. Things happen that navigation can't account for. Tone: paranoid, nothing is what it seems, trust nothing you see on the water.`,

  sunken_reach: `Below the shipping lanes. The Deepwatch patrols here and answers to no one. Sea creatures are enormous and old. Salvage from forgotten wars litters the floor. Tone: oppressive, ancient, the ocean does not care whether you survive.`,

  davy_jones_locker: `Physics works differently here. Davy Jones is real and has opinions about you specifically. The Pale Current runs through everything. The Sunken Armada drifts these waters. Tone: cosmic dread, surreal, darkly funny about death. Nothing here can be fully explained and you should not try.`,
}

async function generateZoneContent(zone: ZoneKey): Promise<EventNode[]> {
  const zoneConfig = ZONES[zone]
  const randomCount = zoneConfig.length - 2
  const eventTypes: string[] = []
  for (let i = 0; i < randomCount; i++) {
    eventTypes.push(zoneConfig.eventTypes[Math.floor(Math.random() * zoneConfig.eventTypes.length)])
  }
  const crisisType = zoneConfig.crisisTypes[Math.floor(Math.random() * zoneConfig.crisisTypes.length)]
  eventTypes.push(crisisType)
  const normalCount = eventTypes.length

  // 2 detour events — shown only if player fails a navigation check
  const penaltyTypes: string[] = [0, 1].map(() =>
    zoneConfig.eventTypes[Math.floor(Math.random() * zoneConfig.eventTypes.length)]
  )
  const eventCount = normalCount

  const prompt = `You write event text for a roguelike game set in a pirate fish world.
Think FTL: Faster Than Light but on the open seas, with anthropomorphized fish as all characters. Every character in this world is a fish.

TONE: Atmospheric, morally ambiguous, occasionally darkly funny. The world is dangerous and indifferent. Never heroic. Every situation has a cost. The best events leave the player with no clearly correct choice.

VOICE RULES — follow these exactly:
- Never explain what the player should feel
- Every event implies something happened before you arrived
- At least one named faction, character, or specific detail per event
- One line of in-character dialogue per event, no attribution needed
- Every choice carries a real cost or risk — no clean safe option
- NEVER use these words or phrases: "suddenly", "you feel", "the crew waits", "heart pounding", "you have a choice", "something enormous", "the water turns dark", "the crew looks to you", "what will you do", "ominously", "treacherous", "something feels wrong"

FLAVOR TEXT LENGTH — vary this deliberately:

BRIEF (2-3 sentences): Use for familiar threat types, quick encounters, things that don't need setup. The terseness IS the tone. A brief event after a long one feels like an exhale.

MEDIUM (3-4 sentences): Standard events. Establish the situation, name the players, deliver one line of dialogue. Most events should be this length.

LONG (4-6 sentences): Reserve for crisis events, morally complex situations, or anything with real lore weight. Use length to build dread or genuine dilemma — not to describe mood, but to complicate the situation. The player should finish reading and feel the weight of the choice before clicking.

The variety between brief, medium, and long events is intentional and important. A long event hits harder when the previous two were brief.

Every sentence must earn its place. Each sentence should:
- Add a specific new fact that changes how you read the situation
- Name a faction, character, or vessel
- Deliver dialogue
- Reveal something unexpected

Cut anything that only describes a mood without adding new information.

NO-ROLL CHOICE RULE: Every isNoRoll choice must include a "cost" field — doubloons deducted from the player's final loot. This represents paying your way out of risk. Scale costs by zone: coral_run 15–50, bertuna_triangle 50–150, sunken_reach 150–400, davy_jones_locker 400–800. The cost should feel proportionate to the danger being avoided.

CRISIS EVENT RULE: The final event in the sequence (marked as isCrisis: true) must always be LONG format. It is the climax of the expedition. Something real should be at stake. The choice must feel genuinely difficult with no obviously correct answer. The player should pause before clicking.

WORLD FACTIONS — reference and vary these across events:
- The Saltwater Brotherhood — ruthless pirates, red sails, no negotiation
- The Gilded Net — merchant guild, profitable but never fully honest
- The Deepwatch — mysterious enforcers of the deep zones, answer to no one
- The Drifters — nomadic fish with no allegiance, useful or dangerous depending on the day

NAMED LORE — use these as recurring world details:
- The Moray — legendary pirate vessel, black sails, captained by a giant Moray Eel named Valdris. Sightings are never good news.
- Barnacle Pete — infamous Pufferfish smuggler, always has "a deal", always costs more than advertised
- The Pale Current — unexplained phenomenon in deep water. Ships that enter don't always come back the same. No one knows what it is.
- The Sunken Armada — ghost fleet from a war no one remembers. Drifts the deep zones. Sometimes the ships are crewed. Sometimes they aren't.

STYLE EXAMPLES — match these exactly in structure. Use them as your tonal reference for the entire expedition.

BRIEF EXAMPLE (combat):
{
  "eventType": "rival_pirates",
  "name": "The Brotherhood's Tax",
  "flavor": "A Saltwater Brotherhood cutter slides alongside, close enough to smell the bilge. The captain — a scarred Barracuda missing his left fin — doesn't bother with pleasantries. 'The toll's gone up.'",
  "choices": [
    {
      "label": "⚔️ Dispute the toll",
      "successText": "The Barracuda reconsiders his pricing strategy from the water.",
      "failText": "He had friends below deck. Of course he did."
    },
    {
      "label": "💰 Pay the toll",
      "successText": "He pockets it without looking at you. Worse, somehow.",
      "isNoRoll": true,
      "cost": 30
    },
    {
      "label": "💨 Run before he finishes talking",
      "successText": "You're gone before the sentence ends.",
      "failText": "He was already moving when you were."
    }
  ]
}

MEDIUM EXAMPLE (navigation):
{
  "eventType": "fog",
  "name": "The Pale Current",
  "flavor": "The water changes color here — not quite white, not quite anything. Your charts show nothing useful. A Drifter vessel is anchored at the edge, its crew watching you from the rail. 'We've been here four days,' one of them calls out. 'Waiting for it to move.'",
  "choices": [
    {
      "label": "🧭 Chart a path through",
      "successText": "On the other side: a debris field worth picking through.",
      "failText": "You emerge two hours later with no memory of the crossing."
    },
    {
      "label": "⚓ Wait with the Drifters",
      "successText": "It clears by morning. The Drifters share what they know about what's on the other side.",
      "failText": "By morning the Drifter vessel is gone. You never heard them leave."
    },
    {
      "label": "🔄 Go around",
      "successText": "It costs you half a day. Maybe that's fine.",
      "isNoRoll": true,
      "cost": 20
    }
  ]
}

LONG EXAMPLE (crisis):
{
  "eventType": "merchant_vessel",
  "name": "The Gilded Net's Problem",
  "flavor": "A Gilded Net merchant brig sits dead in the water, flags down. Their captain — a heavyset Grouper in an expensive coat that no longer fits the situation — meets you at the rail. He explains quickly: his cargo manifest lists spices. The actual cargo is something the Deepwatch has been looking for. He doesn't know how it got there. He needs it gone before the Deepwatch patrol arrives, which his charts put at roughly one hour from now. He's offering everything in his legitimate hold. The Deepwatch patrol appears as a shape on the horizon before he finishes talking.",
  "choices": [
    {
      "label": "📦 Take the cargo and run",
      "successText": "You're out of sight before the Deepwatch arrives. Whatever you took is now your problem.",
      "failText": "The Deepwatch is faster than the Grouper's charts suggested. They've seen you."
    },
    {
      "label": "⚔️ Help him hide it",
      "successText": "The Deepwatch passes without stopping. The Grouper pays what he promised and vanishes before you can ask questions.",
      "failText": "The Deepwatch doesn't pass. They board both ships. This takes a long time and costs you significantly."
    },
    {
      "label": "🚪 Leave him to it",
      "successText": "Not your cargo. Not your problem. You sail on.",
      "isNoRoll": true,
      "cost": 0
    }
  ]
}

ZONE PERSONALITY for today:
${ZONE_PERSONALITY[zone]}

Now generate ${eventCount} events for this zone in this exact order:
${eventTypes.map((t, i) => `${i + 1}. ${t}${i === eventTypes.length - 1 ? ' ← CRISIS EVENT (long format, climax, difficult choice)' : ''}`).join('\n')}

Then generate 2 DETOUR events (brief format only — these appear as unexpected penalty encounters if the player fails a navigation check mid-voyage):
${penaltyTypes.map((t, i) => `D${i + 1}. ${t} ← DETOUR (brief, feels like an unlucky wrong turn)`).join('\n')}

Return all ${eventCount + 2} events as a single JSON array — main events first, then the 2 detour events at the end.
No markdown. No explanation. No keys other than those shown in the examples.
Vary event lengths deliberately — not every event should be the same length.
Make the crisis event feel earned after everything that came before it.`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = (response.content[0] as { type: string; text: string }).text.trim()
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) throw new Error(`No JSON array in Claude response: ${raw.slice(0, 200)}`)
  const rawParsed = JSON.parse(match[0]) as Array<{
    eventType: string; name: string; flavor: string;
    choices: Array<{ label: string; successText: string; failText: string; isNoRoll?: boolean; cost?: number }>
  }>

  // Drop any events that came back malformed (missing name, eventType, or choices)
  const parsed = rawParsed.filter(e =>
    e && typeof e.name === 'string' && e.name.trim() &&
    typeof e.eventType === 'string' &&
    Array.isArray(e.choices) && e.choices.length > 0
  )

  if (parsed.length === 0) throw new Error('All generated events were malformed — no valid events in response')

  return parsed.map((event, i) => {
    const mechanics = EVENT_MECHANICS[event.eventType] ?? { stat: 'luck', difficultyTier: 'standard' as const }
    let threshold: number | undefined
    if (mechanics.stat) {
      const [min, max] = zoneConfig.difficulty[mechanics.difficultyTier]
      threshold = Math.floor(Math.random() * (max - min + 1)) + min
    }
    // Last 2 events are detour/penalty events
    const isPenalty = i >= normalCount
    return {
      ...event,
      nodeIndex: i,
      isCrisis: i === normalCount - 1,
      isPenalty,
      mechanics: { ...mechanics, threshold },
    }
  })
}

export async function ensureDailyExpeditionContent(zone: ZoneKey, date: string): Promise<DailyExpeditionRow> {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('daily_expeditions')
    .select('*')
    .eq('expedition_date', date)
    .eq('zone', zone)
    .maybeSingle()

  if (existing) return existing as DailyExpeditionRow

  const eventSequence = await generateZoneContent(zone)
  const { data: inserted, error } = await admin
    .from('daily_expeditions')
    .insert({ expedition_date: date, zone, event_sequence: eventSequence })
    .select()
    .single()

  if (error || !inserted) throw new Error(`DB insert failed for ${zone}: ${error?.message}`)
  return inserted as DailyExpeditionRow
}

export async function generateAllDailyExpeditions(date: string): Promise<Record<string, string>> {
  const results: Record<string, string> = {}
  for (const zone of ZONE_ORDER) {
    try {
      const row = await ensureDailyExpeditionContent(zone, date)
      results[zone] = row ? 'ok' : 'already existed'
    } catch (err) {
      results[zone] = `error: ${err instanceof Error ? err.message : String(err)}`
    }
  }
  return results
}
