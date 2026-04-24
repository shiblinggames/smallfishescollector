import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'

const ZONES = {
  coral_run: {
    name: 'The Coral Run',
    description: 'Familiar coastlines and reef passages. Safe enough for new crews.',
    length: 4,
    eventTypes: ['rival_pirates', 'mild_storm', 'merchant_vessel', 'stranded_ship', 'fog', 'fishing_spot', 'hidden_cove'],
    crisisTypes: ['storm', 'sea_creature'],
  },
  bertuna_triangle: {
    name: 'The Bertuna Triangle',
    description: 'The stretch where ships go missing. Rival pirates, sea fog, cursed winds.',
    length: 6,
    eventTypes: ['rival_pirates', 'ghost_ship', 'whirlpool', 'storm', 'sea_creature', 'cursed_cargo', 'merchant_vessel'],
    crisisTypes: ['ghost_ship', 'rival_pirates'],
  },
  sunken_reach: {
    name: 'The Sunken Reach',
    description: 'Below the known charts. Sea monsters, shipwrecks, pressure that cracks lesser hulls.',
    length: 8,
    eventTypes: ['sea_monster', 'shipwreck_salvage', 'rival_pirates', 'cursed_ship', 'storm', 'whirlpool'],
    crisisTypes: ['kraken_warning', 'sea_monster'],
  },
  davy_jones_locker: {
    name: "Davy Jones' Locker",
    description: 'No charts exist. Only Catfish and Doby Mick know the way.',
    length: 10,
    eventTypes: ['kraken_attack', 'ghost_armada', 'cursed_treasure', 'abyss_creature', 'void_storm', 'davy_jones_encounter'],
    crisisTypes: ['kraken_attack', 'davy_jones_encounter'],
  },
}

const EVENT_MECHANICS: Record<string, { stat: string | null; difficultyTier: string }> = {
  rival_pirates:         { stat: 'combat',      difficultyTier: 'standard' },
  mild_storm:            { stat: 'durability',  difficultyTier: 'easy'     },
  storm:                 { stat: 'durability',  difficultyTier: 'standard' },
  ghost_ship:            { stat: 'combat',      difficultyTier: 'standard' },
  merchant_vessel:       { stat: 'luck',        difficultyTier: 'easy'     },
  stranded_ship:         { stat: null,          difficultyTier: 'easy'     },
  fog:                   { stat: 'navigation',  difficultyTier: 'easy'     },
  fishing_spot:          { stat: 'luck',        difficultyTier: 'easy'     },
  hidden_cove:           { stat: 'navigation',  difficultyTier: 'easy'     },
  whirlpool:             { stat: 'navigation',  difficultyTier: 'standard' },
  sea_creature:          { stat: 'combat',      difficultyTier: 'standard' },
  cursed_cargo:          { stat: 'luck',        difficultyTier: 'standard' },
  cursed_ship:           { stat: 'navigation',  difficultyTier: 'standard' },
  sea_monster:           { stat: 'combat',      difficultyTier: 'crisis'   },
  shipwreck_salvage:     { stat: 'luck',        difficultyTier: 'standard' },
  kraken_warning:        { stat: 'speed',       difficultyTier: 'crisis'   },
  kraken_attack:         { stat: 'combat',      difficultyTier: 'crisis'   },
  ghost_armada:          { stat: 'combat',      difficultyTier: 'crisis'   },
  cursed_treasure:       { stat: 'luck',        difficultyTier: 'standard' },
  abyss_creature:        { stat: 'combat',      difficultyTier: 'crisis'   },
  void_storm:            { stat: 'durability',  difficultyTier: 'crisis'   },
  davy_jones_encounter:  { stat: 'luck',        difficultyTier: 'crisis'   },
}

async function generateZoneContent(zone: string, zoneConfig: typeof ZONES[keyof typeof ZONES]) {
  const randomCount = zoneConfig.length - 2
  const eventTypes: string[] = []
  for (let i = 0; i < randomCount; i++) {
    eventTypes.push(zoneConfig.eventTypes[Math.floor(Math.random() * zoneConfig.eventTypes.length)])
  }
  const crisisType = zoneConfig.crisisTypes[Math.floor(Math.random() * zoneConfig.crisisTypes.length)]
  eventTypes.push(crisisType)

  const client = new Anthropic()
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are the narrator for a pirate fish themed adventure game called Small Fishes: Seas the Booty.

Generate narrative content for today's expedition through "${zoneConfig.name}" — ${zoneConfig.description}

The tone is fun, slightly dramatic, pirate-themed. Characters and creatures are all fish — anthropomorphized fish pirates. Keep flavor text to 2-3 sentences max.

Generate content for these ${eventTypes.length} events in order:
${eventTypes.map((type, i) => `${i + 1}. ${type}`).join('\n')}

For each event return:
- name: a short evocative title (max 5 words)
- flavor: 2-3 sentence scene description. Make each one unique.
- choices: array of 2-3 choices. Each choice needs:
  - label: short action label (max 6 words, start with an emoji)
  - successText: 1 sentence result if they succeed
  - failText: 1 sentence result if they fail
  - isNoRoll: true for negotiate/pay/ignore options (max one per event)

Return ONLY a valid JSON array, no markdown:
[{"eventType":"...","name":"...","flavor":"...","choices":[{"label":"...","successText":"...","failText":"..."}]}]`,
    }],
  })

  const text = (response.content[0] as { type: string; text: string }).text.trim()
  const parsed = JSON.parse(text) as Array<{
    eventType: string; name: string; flavor: string
    choices: Array<{ label: string; successText: string; failText: string; isNoRoll?: boolean }>
  }>

  return parsed.map((event, i) => ({
    ...event,
    nodeIndex: i,
    isCrisis: i === parsed.length - 1,
    mechanics: EVENT_MECHANICS[event.eventType] ?? { stat: 'luck', difficultyTier: 'standard' },
  }))
}

Deno.serve(async () => {
  const today = new Date().toISOString().split('T')[0]
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const results: string[] = []

  for (const [zoneKey, zoneConfig] of Object.entries(ZONES)) {
    const { data: existing } = await supabase
      .from('daily_expeditions')
      .select('id')
      .eq('expedition_date', today)
      .eq('zone', zoneKey)
      .maybeSingle()

    if (existing) {
      results.push(`${zoneKey}: already generated`)
      continue
    }

    try {
      const eventSequence = await generateZoneContent(zoneKey, zoneConfig)
      await supabase.from('daily_expeditions').insert({
        expedition_date: today,
        zone: zoneKey,
        event_sequence: eventSequence,
      })
      results.push(`${zoneKey}: generated ${eventSequence.length} events`)
    } catch (err) {
      results.push(`${zoneKey}: ERROR - ${err}`)
    }
  }

  return new Response(JSON.stringify({ date: today, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
