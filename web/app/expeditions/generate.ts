import { createAdminClient } from '@/lib/supabase/admin'
import { anthropic } from '@/lib/anthropic'
import { ZONES, EVENT_MECHANICS, ZONE_ORDER, type ZoneKey, type EventNode, type DailyExpeditionRow } from '@/lib/expeditions'

async function generateZoneContent(zone: ZoneKey): Promise<EventNode[]> {
  const zoneConfig = ZONES[zone]
  const randomCount = zoneConfig.length - 2
  const eventTypes: string[] = []
  for (let i = 0; i < randomCount; i++) {
    eventTypes.push(zoneConfig.eventTypes[Math.floor(Math.random() * zoneConfig.eventTypes.length)])
  }
  const crisisType = zoneConfig.crisisTypes[Math.floor(Math.random() * zoneConfig.crisisTypes.length)]
  eventTypes.push(crisisType)

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `You are the narrator for a pirate fish themed adventure game called Small Fishes: Seas the Booty.

Generate narrative content for today's expedition through "${zoneConfig.name}" — ${zoneConfig.description}

The tone is fun, slightly dramatic, pirate-themed. Characters and creatures are all fish — anthropomorphized fish pirates. Keep flavor text to 2-3 sentences max.

Generate content for these ${eventTypes.length} events in order:
${eventTypes.map((type, i) => `${i + 1}. ${type}`).join('\n')}

For each event return:
- name: a short evocative title (max 5 words)
- flavor: 2-3 sentence scene description. Make each one feel unique — vary the specific pirates encountered, the weather conditions, the sea creatures, the ship names etc.
- choices: array of 2-3 choices the player can make. Each choice needs:
  - label: short action label (max 6 words, start with an emoji)
  - successText: 1 sentence result if they succeed the roll
  - failText: 1 sentence result if they fail the roll
  - isNoRoll: true if this choice always succeeds (negotiate/pay/ignore options) — only include on one choice per event maximum

Return ONLY a valid JSON array, no markdown, no extra text:
[
  {
    "eventType": "rival_pirates",
    "name": "...",
    "flavor": "...",
    "choices": [
      { "label": "...", "successText": "...", "failText": "..." },
      { "label": "...", "successText": "...", "failText": "...", "isNoRoll": true }
    ]
  }
]`,
    }],
  })

  const raw = (response.content[0] as { type: string; text: string }).text.trim()
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) throw new Error(`No JSON array in Claude response: ${raw.slice(0, 200)}`)
  const parsed = JSON.parse(match[0]) as Array<{
    eventType: string; name: string; flavor: string;
    choices: Array<{ label: string; successText: string; failText: string; isNoRoll?: boolean }>
  }>

  return parsed.map((event, i) => ({
    ...event,
    nodeIndex: i,
    isCrisis: i === parsed.length - 1,
    mechanics: EVENT_MECHANICS[event.eventType] ?? { stat: 'luck', difficultyTier: 'standard' },
  }))
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
