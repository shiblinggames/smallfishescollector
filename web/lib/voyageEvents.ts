import type { CrewCard } from './expeditions'
import { computeTotalCrewStats } from './expeditions'

interface CrewTrait { common: string; rare: string; legendary: string }

export const CREW_TRAITS: Record<string, CrewTrait> = {
  Bass: {
    common: "Shows up. Does the work. Hasn't died yet.",
    rare: "Shows up. Does the work. Has outlasted four ships and never mentioned it.",
    legendary: "Shows up. Does the work. The Brotherhood stopped targeting him after the third attempt. Nobody knows why he's still alive. Including him.",
  },
  Eel: {
    common: "Slips through things she shouldn't be able to slip through.",
    rare: "Three Deepwatch searches. They found the ship. Never found her.",
    legendary: "Valdris himself put a price on her head in '07. She delivered it back to him. Personally.",
  },
  Flounder: {
    common: "Sees everything coming. Acts like he doesn't.",
    rare: "Flat profile, zero signature. The best scout the Drifters ever had before he stopped showing up.",
    legendary: "Disappeared from the Gilded Net's manifest eighteen months ago. They're still looking. He's been on your ship the whole time.",
  },
  Goldfish: {
    common: "Three-second memory. Zero-second reaction time. It evens out.",
    rare: "Forgets every mission immediately after. Makes her the perfect courier for things nobody should know she carried.",
    legendary: "The Deepwatch interrogated her for six hours. She remembered nothing. That was the plan.",
  },
  Krill: {
    common: "Small. Expendable. Aware of both. Does it anyway.",
    rare: "The smallest crew member you've ever had. Also the one the enemy never shoots at first. That's a strategy.",
    legendary: "Survived the Bertuna Triangle twice. Once by accident. Once on purpose. Won't say which was which.",
  },
  Minnow: {
    common: "Fast. Unreliable. Sometimes that's enough.",
    rare: "Fastest thing on the water at close range. Terrible at everything else. You don't need everything else every day.",
    legendary: "Set the Coral Run speed record in '11. The Gilded Net disputed it. She ran it again while they were watching.",
  },
  Pufferfish: {
    common: "Nobody boards a ship she's on. That's the whole strategy.",
    rare: "The Brotherhood stopped raiding her convoy after two incidents. The incident reports are sealed.",
    legendary: "The Deepwatch classifies her as a weather event. Technically accurate.",
  },
  Salmon: {
    common: "Knows where she's going. Always has. Doesn't explain it.",
    rare: "Navigated the Pale Current by instinct three times. Claims it's simple. Won't teach anyone.",
    legendary: "The current moves differently when she's aboard. Scientists from the Gilded Net studied it for a year. No conclusion.",
  },
  Sardine: {
    common: "Works best in numbers. You only have one. She's adapting.",
    rare: "Former Drifter fleet coordinator. Managed eleven ships simultaneously. Now she manages you. The adjustment has been mutual.",
    legendary: "At her signal, forty Drifter vessels moved as one. She gave the signal once. Nobody's seen the fleet since.",
  },
  Tuna: {
    common: "Built for distance. Not thrilled about the detours.",
    rare: "Open Waters specialist. Has crossed the Bertuna Triangle so many times it's stopped being interesting to her.",
    legendary: "Completed the full ocean crossing alone. When asked why, said she wanted to see if she could. She could.",
  },
  Angelfish: {
    common: "Looks harmless. Has been told this. Considers it an asset.",
    rare: "The Gilded Net hired her as a diplomat three times. Each negotiation ended with them getting less than they started with.",
    legendary: "Brokered the Coral Run Accord of '13. Both sides signed. Neither side is sure what they agreed to.",
  },
  Anglerfish: {
    common: "Knows what you want before you do. Uses that.",
    rare: "Three separate Deepwatch warrants. None have stuck.",
    legendary: "The Deepwatch stopped issuing warrants. They hired her as a consultant instead. She consulted for six months. Then disappeared. The warrants are back.",
  },
  'Beluga Whale': {
    common: "Slow. Patient. Correct.",
    rare: "Was offered command of a Gilded Net frigate. Declined. Has never explained why. The offer still stands.",
    legendary: "Remembers every ship she's ever encountered. Every captain. Every cargo. The Gilded Net would pay considerably for that memory. She knows this.",
  },
  Blobfish: {
    common: "Pressure doesn't bother her. She's built for it.",
    rare: "Operates best in conditions that incapacitate everyone else. Deep runs are her comfort zone.",
    legendary: "Went into the Abyss alone to retrieve a Gilded Net cargo. Came back with the cargo and something else she won't discuss.",
  },
  'Blue Marlin': {
    common: "Fast, direct, and deeply uninterested in your opinion.",
    rare: "Former Brotherhood enforcer. Left because the work was too slow. Your pace is marginally better.",
    legendary: "Held the Deep crossing record for nine years. Someone broke it last spring. She hasn't spoken about it since. That someone hasn't been seen since.",
  },
  Clownfish: {
    common: "Unpredictable enough that the enemy can't predict her. Neither can you.",
    rare: "The Drifters called her a chaos agent and meant it as an insult. She took it as a title.",
    legendary: "Once accidentally destabilized a Saltwater Brotherhood operation by being in the wrong place. Did it again on purpose. Then again. It's a method now.",
  },
  'Goblin Shark': {
    common: "Comes out of nowhere. That's intentional.",
    rare: "The deep zones produce certain crew. She's one of them. Doesn't explain what that means.",
    legendary: "Valdris won't send ships where she operates. This covers a significant portion of the Sunken Reach.",
  },
  Koi: {
    common: "Deliberate. Unhurried. Right.",
    rare: "Spent three years in the Gilded Net's treasury division. Left voluntarily. The treasury was slightly lighter when she did.",
    legendary: "The Gilded Net considers her a significant financial liability. She considers them a minor inconvenience. Both assessments are accurate.",
  },
  Lionfish: {
    common: "The crew gives her space. She hasn't asked why. Neither should you.",
    rare: "Former Brotherhood security. Left when she disagreed with an order. The officer who gave the order didn't leave.",
    legendary: "The Brotherhood's incident reports from '10–'12 are heavily redacted. Her name appears in the margins of every one.",
  },
  'Nurse Shark': {
    common: "Keeps the crew alive. More than you'd expect.",
    rare: "Field medic for the Drifter fleet for six years. The survival rate improved. She won't take credit.",
    legendary: "Pulled a crew of nine through the Sunken Reach with no provisions and a cracked hull. She'll tell you it was straightforward. It wasn't.",
  },
  Oarfish: {
    common: "Been here longer than most things. Remembers more than she says.",
    rare: "The Pale Current doesn't disorient her. She says it used to. That was a long time ago.",
    legendary: "Has seen the Abyss from the inside. Whatever she encountered down there fundamentally changed something about the way she moves through the water. She hasn't mentioned what.",
  },
  Sailfish: {
    common: "Fastest crew member you have. Has opinions about this.",
    rare: "Won't crew on a ship slower than a Sloop. Made an exception for you. Still hasn't said why.",
    legendary: "Outran a Deepwatch intercept in open water. The Deepwatch filed a formal complaint about the physics involved.",
  },
  Swordfish: {
    common: "Combat specialist. Appropriately named.",
    rare: "Former Brotherhood boarding crew. Left the Brotherhood. The Brotherhood left her alone after that.",
    legendary: "The Brotherhood's official position is that she's not a problem. Their unofficial position is significantly different.",
  },
  'Tiger Shark': {
    common: "Reliable in a fight. Enthusiastic in a way that occasionally concerns people.",
    rare: "The Saltwater Brotherhood recruits aggressively. They recruited her once. She said no. They haven't asked again.",
    legendary: "Valdris refused to engage her ship directly after their first encounter. He sent three ships the second time. She sent back two.",
  },
  'Blue Whale': {
    common: "Everything moves out of her way. Everything.",
    rare: "The Deepwatch doesn't stop Blue Whale vessels. This is policy, not courtesy.",
    legendary: "The Gilded Net named a trade route after her. She's never acknowledged it. The route exists because she decided it would.",
  },
  Catfish: {
    common: "Knows the Abyss. The Abyss knows her back.",
    rare: "One of two crew members who can navigate the Locker. Won't explain how. The explanation probably wouldn't help.",
    legendary: "Davy Jones sent a message to her once. She didn't reply. He sent another. She still didn't reply. He stopped.",
  },
  'Doby Mick': {
    common: "Knows the Abyss. The Abyss seems uncertain about him.",
    rare: "The other crew member who can navigate the Locker. Catfish doesn't talk about him. He doesn't talk about Catfish. Something happened down there.",
    legendary: "Has been to the bottom of Davy Jones' Locker and returned. Won't say what's there. Won't say what it cost. Will say it was worth it. That's the part that's concerning.",
  },
  'Giant Squid': {
    common: "Operates on a timescale you don't fully understand.",
    rare: "Was here before most of the factions. Has watched them rise. Has a theory about which ones will fall first. Won't share it yet.",
    legendary: "The Deepwatch has a file on her that predates the Deepwatch. Nobody has read the whole thing. The ones who tried didn't finish.",
  },
  'Great White Shark': {
    common: "The crew behaves when she's aboard. So does the enemy.",
    rare: "Valdris gave her a wide berth at sea and a respectful nod in port. That's more than he gives most admirals.",
    legendary: "The Brotherhood made her an honorary captain in absentia after the incident at the Sunken Reach. She hasn't acknowledged the honor. She was there for the incident.",
  },
  'Hammerhead Shark': {
    common: "Methodical. That's more dangerous than fast.",
    rare: "Broke a Saltwater Brotherhood blockade alone in '09. The Brotherhood hasn't forgotten.",
    legendary: "The Brotherhood put three bounties on her across twelve years. She's collected all three herself. Kept the paperwork.",
  },
  'Humpback Whale': {
    common: "Something about her presence changes the water. The crew feels it.",
    rare: "The Pale Current behaves differently when she's nearby. Scientists have noted this. She considers their notes incomplete.",
    legendary: "Has communicated with something in the Abyss. The conversation was long. She described it as inconclusive. The Deepwatch described her report as classified.",
  },
  'Manta Ray': {
    common: "Glides through things that should stop her.",
    rare: "Former Deepwatch operative. The former is doing a lot of work in that sentence.",
    legendary: "Left the Deepwatch after learning something she wasn't supposed to learn. They let her leave. That detail is more troubling than it sounds.",
  },
  Orca: {
    common: "The crew follows her lead even when you haven't given one.",
    rare: "Commanded a Drifter flotilla for four years. They still follow her orders. She no longer commands them. This is an unusual arrangement.",
    legendary: "The Drifters consider her their captain in exile. She considers herself retired. Forty ships consider her a signal away. The signal has never been sent.",
  },
  'Whale Shark': {
    common: "Gentle until she isn't. The transition is fast.",
    rare: "Captained a Gilded Net flagship for six years before walking away. Never said why. The ship's still waiting in port.",
    legendary: "The Gilded Net, the Brotherhood, and the Deepwatch all have open recruitment offers for her. She's turned down all three. Currently on your ship. Make of that what you will.",
  },
}

function getCrewTrait(card: CrewCard): string | null {
  const traits = CREW_TRAITS[card.name]
  if (!traits) return null
  const r = card.rarity.toLowerCase()
  if (r === 'common' || r === 'rare' || r === 'legendary') return traits[r]
  return null
}

export type { VoyageEventType, VoyageEventOutcome, VoyageRoute, RouteConfig, VoyageEvent } from './voyageRoutes'
export { ROUTE_CONFIGS } from './voyageRoutes'
import type { VoyageRoute, VoyageEvent, VoyageEventType } from './voyageRoutes'
import { ROUTE_CONFIGS } from './voyageRoutes'

export interface VoyageResult {
  events: VoyageEvent[]
  totalDoubloons: number
  totalGems: number
  crewLost: number[]  // variantIds permanently lost
  ringSkinDrops: string[]
  baitDrops: { type: string; qty: number }[]
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function generateVoyageEvents(crew: CrewCard[], shipTier: number, route: VoyageRoute = 'open'): VoyageResult {
  const rc = ROUTE_CONFIGS[route]
  const stats = computeTotalCrewStats(crew)
  const { power, dodge, fortune } = stats
  const crewCount = crew.length
  const captain = crew[0]
  const fortuneScale = 1 + fortune / 55  // fortune=22 → 1.4×, fortune=40 → 1.73×, fortune=55 → 2×
  const powerScale   = 1 + power   / 60  // power=20  → 1.33×, power=30  → 1.5×
  const payout = (min: number, max: number, usePower = false) =>
    Math.round(rand(min, max) * fortuneScale * (usePower ? powerScale : 1) * rc.payoutScale)

  const fill = (narrative: string, extra?: Record<string, string>) => {
    let s = narrative.replace('{captain}', captain.name)
    if (extra) for (const [k, v] of Object.entries(extra)) s = s.replace(`{${k}}`, v)
    return s
  }

  // Stat rolls — power capped at 80% max so encounters are never guaranteed wins
  const rollFortune  = () => Math.random() * 45 < fortune        // fortune 22 ≈ 49%, fortune 45 = guaranteed
  const rollPower    = () => Math.random() < Math.min(0.80, power / 55)  // power 28 ≈ 50%, hard cap 80%
  const rollDodge    = () => Math.random() * 28 < dodge          // dodge 12 ≈ 43%
  const rollWeather  = () => Math.random() < 0.30 + shipTier * 0.10  // tier 0=30%, tier 7=100%

  const events: VoyageEvent[] = []
  const crewLost: number[] = []

  // Route-specific event sequence
  const sequence: VoyageEventType[] =
    route === 'coastal'
      ? ['peaceful', 'discovery', 'discovery', 'weather', 'peaceful']
      : route === 'deep'
      ? [
          'discovery', 'encounter', 'danger', 'encounter',
          'discovery', 'encounter', 'danger', 'encounter', 'weather',
          ...(crewCount >= 2 ? ['encounter' as VoyageEventType] : []),
        ]
      : [
          'peaceful', 'discovery', 'encounter', 'danger',
          'discovery', 'encounter', 'weather',
          ...(crewCount >= 2 ? ['danger' as VoyageEventType] : []),
        ]

  // Light shuffle — swap adjacent pairs randomly
  for (let i = sequence.length - 1; i > 1; i--) {
    const j = Math.floor(Math.random() * i)
    ;[sequence[i], sequence[j]] = [sequence[j], sequence[i]]
  }

  for (const type of sequence) {
    let event: VoyageEvent

    switch (type) {
      case 'discovery': {
        const success = rollFortune()
        const gemDrop = success && Math.random() * 55 < fortune ? Math.round(rand(1, 3) * rc.gemScale) : 0
        const skinPool: Record<VoyageRoute, string> = { coastal: 'whale_bone', open: 'coral_spire', deep: 'gilded_compass' }
        const skinDrop = success && Math.random() < 0.05 ? skinPool[route] : null
        const baitDrop = success && route === 'deep' && Math.random() < 0.04 ? 'luminous' : null
        const template = pick(success ? DISCOVERY_SUCCESS : DISCOVERY_FAIL)
        const discoveryNarrative = fill(template.narrative)
        const captainDiscoveryTrait = success && Math.random() < 0.60 ? getCrewTrait(captain) : null
        event = {
          type, outcome: success ? 'success' : 'neutral',
          title: template.title,
          narrative: captainDiscoveryTrait ? `${discoveryNarrative}\n\n${captainDiscoveryTrait}` : discoveryNarrative,
          doubloonDelta: success ? payout(50, 140) : 0,
          gemDelta: gemDrop,
          crewVariantLost: null,
          ringSkinDrop: skinDrop,
          baitDrop,
        }
        break
      }

      case 'encounter': {
        const win = rollPower()
        if (win) {
          const crush = Math.random() < Math.min(0.40, power / 100)
          const gemDrop = crush
            ? Math.round(rand(2, 5) * rc.gemScale)
            : (Math.random() * 55 < power ? Math.round(rand(1, 3) * rc.gemScale) : 0)
          const crushSkinDrop = crush
            ? (route === 'open' && Math.random() < 0.05 ? 'navigators_silver'
              : route === 'deep' && Math.random() < 0.04 ? 'abyssal_sigil'
              : route === 'deep' && Math.random() < 0.05 ? 'gilded_compass'
              : null)
            : null
          // Lure drops: Luminous on win/crush (open+deep), Golden only on deep crush
          const baitDrop = crush
            ? (route === 'deep' && Math.random() < 0.05 ? 'golden'
              : route !== 'coastal' && Math.random() < 0.12 ? 'luminous'
              : null)
            : (route !== 'coastal' && Math.random() < 0.07 ? 'luminous' : null)
          const template = pick(crush ? ENCOUNTER_CRUSH : ENCOUNTER_WIN)
          const encounterNarrative = fill(template.narrative)
          const captainEncounterTrait = crush
            ? (Math.random() < 0.55 ? getCrewTrait(captain) : null)
            : (Math.random() < 0.30 ? getCrewTrait(captain) : null)
          event = {
            type, outcome: 'success',
            title: template.title,
            narrative: captainEncounterTrait ? `${encounterNarrative}\n\n${captainEncounterTrait}` : encounterNarrative,
            doubloonDelta: crush ? payout(80, 160, true) : payout(20, 55, true),
            gemDelta: gemDrop,
            crewVariantLost: null,
            ringSkinDrop: crushSkinDrop,
            baitDrop,
          }
        } else {
          const availableEncounter = crew.slice(1).filter(c => !crewLost.includes(c.variantId))
          const crewLossChance = availableEncounter.length > 0 ? Math.max(0.10, 0.5 - power / 60) * rc.crewLossScale : 0
          const loseCrew = crewLossChance > 0 && Math.random() < crewLossChance
          if (loseCrew) {
            const victim = pick(availableEncounter)
            const template = pick(ENCOUNTER_CREW_LOSS)
            const baseNarrative = fill(template.narrative, { name: victim.name })
            const victimTrait = getCrewTrait(victim)
            const narrative = victimTrait ? `${baseNarrative}\n\n${victimTrait}` : baseNarrative
            crewLost.push(victim.variantId)
            event = {
              type, outcome: 'failure',
              title: template.title, narrative,
              doubloonDelta: 0, gemDelta: 0, crewVariantLost: victim.variantId, ringSkinDrop: null, baitDrop: null,
            }
          } else {
            const template = pick(ENCOUNTER_LOSS)
            event = {
              type, outcome: 'failure',
              title: template.title, narrative: fill(template.narrative),
              doubloonDelta: 0, gemDelta: 0, crewVariantLost: null, ringSkinDrop: null, baitDrop: null,
            }
          }
        }
        break
      }

      case 'danger': {
        const safe = rollDodge()
        if (safe) {
          const template = pick(DANGER_SUCCESS)
          event = {
            type, outcome: 'neutral',
            title: template.title, narrative: template.narrative,
            doubloonDelta: 0, gemDelta: 0, crewVariantLost: null, ringSkinDrop: null, baitDrop: null,
          }
        } else {
          const availableDanger = crew.slice(1).filter(c => !crewLost.includes(c.variantId))
          const loseCrew = availableDanger.length > 0 && Math.random() < 0.18 * rc.crewLossScale
          if (loseCrew) {
            const victim = pick(availableDanger)
            const template = pick(DANGER_CREW_LOSS)
            const baseNarrative = fill(template.narrative, { name: victim.name })
            const victimTrait = getCrewTrait(victim)
            const narrative = victimTrait ? `${baseNarrative}\n\n${victimTrait}` : baseNarrative
            crewLost.push(victim.variantId)
            event = {
              type, outcome: 'failure',
              title: template.title, narrative,
              doubloonDelta: 0, gemDelta: 0, crewVariantLost: victim.variantId, ringSkinDrop: null, baitDrop: null,
            }
          } else {
            const template = pick(DANGER_SETBACK)
            event = {
              type, outcome: 'failure',
              title: template.title, narrative: template.narrative,
              doubloonDelta: 0, gemDelta: 0, crewVariantLost: null, ringSkinDrop: null, baitDrop: null,
            }
          }
        }
        break
      }

      case 'weather': {
        const safe = rollWeather()
        const template = pick(safe ? WEATHER_SUCCESS : WEATHER_FAIL)
        event = {
          type, outcome: safe ? (Math.random() < 0.35 ? 'success' : 'neutral') : 'neutral',
          title: template.title, narrative: template.narrative,
          doubloonDelta: safe && Math.random() < 0.35 ? payout(20, 50) : 0,
          gemDelta: 0, crewVariantLost: null, ringSkinDrop: null, baitDrop: null,
        }
        break
      }

      case 'peaceful':
      default: {
        const pool = crewCount === 1 ? PEACEFUL_SOLO : PEACEFUL_CREW
        const template = pick(pool)
        const peacefulNarrative = fill(template.narrative)
        const captainPeacefulTrait = getCrewTrait(captain)
        event = {
          type, outcome: 'neutral',
          title: template.title,
          narrative: captainPeacefulTrait ? `${peacefulNarrative}\n\n${captainPeacefulTrait}` : peacefulNarrative,
          doubloonDelta: 0, gemDelta: 0, crewVariantLost: null, ringSkinDrop: null, baitDrop: null,
        }
        break
      }
    }

    events.push(event)
  }

  const totalDoubloons = events.reduce((sum, e) => sum + e.doubloonDelta, 0)
  const totalGems = events.reduce((sum, e) => sum + e.gemDelta, 0)
  const ringSkinDrops = events.map(e => e.ringSkinDrop).filter((s): s is string => s !== null)
  const baitDropMap = new Map<string, number>()
  for (const e of events) {
    if (e.baitDrop) baitDropMap.set(e.baitDrop, (baitDropMap.get(e.baitDrop) ?? 0) + 1)
  }
  const baitDrops = Array.from(baitDropMap.entries()).map(([type, qty]) => ({ type, qty }))
  return { events, totalDoubloons, totalGems, crewLost, ringSkinDrops, baitDrops }
}

// ── Event text pools ──────────────────────────────────────────────────────────

const DISCOVERY_SUCCESS = [
  { title: 'Sunken Wreck',       narrative: "{captain} spotted the mast tip above the waterline at first light. The hull was still sealed. Bars of silver gleamed beneath the salt water." },
  { title: "Smuggler's Cache",   narrative: "A hidden cove, a false rock, and a stash tucked beneath it. {captain} found it before anyone else would have thought to look." },
  { title: 'Ambergris Haul',     narrative: "The whale surfaced once and the crew moved fast. Rare stuff. Worth more than a month of fishing." },
  { title: 'Floating Cargo',     narrative: "Merchant crates, barely waterlogged. Spices, cloth, a locked chest. Pure windfall." },
  { title: 'Abandoned Camp',     narrative: "An island camp, recently abandoned. The fire pit was cold but the supply crates weren't empty." },
  { title: 'Message Buoy',       narrative: "{captain} recognized the merchant's coding system. The crew got to the salvage site before anyone else." },
  { title: 'Wrecked Longboat',   narrative: "A longboat half-buried in the sand, its oilskin cargo still dry. Nobody had found it before them." },
  { title: 'Pearl Beds',         narrative: "{captain} noticed the color of the water change. They anchored and dove. The oyster beds were untouched." },
  { title: 'Stranded Merchant',  narrative: "A merchant pinnace hard aground, crew already gone. {captain} salvaged the hold before the tide took the rest." },
  { title: 'Buried Casket',      narrative: "The shoreline marker was recent enough to still be readable. Whoever buried it hadn't come back for it." },
  { title: 'Wreck Chart',        narrative: "A dead man's map, traded off a dockside sailor for almost nothing. It turned out to be worth considerably more than that." },
  { title: 'Salt Marsh Cache',   narrative: "Poles marking a submerged cache in the marsh — a smuggler's system {captain} had seen before. The chest came up on the third dive." },
]

const DISCOVERY_FAIL = [
  { title: 'Sunken Wreck',      narrative: "The wreck was already stripped clean. Someone had beaten them to it by days, maybe hours." },
  { title: 'Empty Cove',        narrative: "{captain} called it promising from a mile out. Up close it was just gulls and old rope." },
  { title: 'Whale Sighting',    narrative: "The creature disappeared before they got close enough. Gone like it was never there." },
  { title: 'Floating Debris',   narrative: "Empty crates. Whatever was in them had long since sunk." },
  { title: 'Dry Cave',          narrative: "The island cave the old chart marked was dry and picked over. Not even useful as a camp." },
  { title: 'False Landmark',    narrative: "The headland matched the description but nothing else did. Either the chart was wrong or the cache was long gone." },
  { title: 'Claimed Wreck',     narrative: "A salvage buoy marked the site. Someone else had already staked a legal claim. {captain} turned back without a word." },
  { title: 'Rotted Cache',      narrative: "The chest was where the chart said. The wood had given way and the contents had been salt-ruined for years." },
  { title: 'Wrong Island',      narrative: "Two days to reach it. Wrong island entirely. {captain} didn't say much on the way back." },
  { title: 'Empty Longboat',    narrative: "The drifting longboat had been stripped before it was abandoned. Not even the oars were left." },
]

const ENCOUNTER_WIN = [
  { title: 'Pirate Ambush',     narrative: "The corsairs cut across the bow looking for easy prey. {captain} answered with a volley. The pirates turned and ran, leaving their spoils behind." },
  { title: 'Armed Skiff',       narrative: "A ragged skiff moved to intercept. One warning shot and it veered off. The crew recovered a small chest from the water where it had been." },
  { title: 'Rival Crew',        narrative: "Another crew, desperate and armed. They tested {captain}'s resolve — and found it." },
  { title: 'Toll Gate',         narrative: "An armed convoy tried to levy a toll. {captain}'s show of strength was enough. They sailed through without paying." },
  { title: 'Merchant Deal',     narrative: "A stranded merchant ship needed an escort through contested waters. {captain} obliged, and the merchant paid well." },
  { title: 'Customs Cutter',    narrative: "The cutter came alongside to inspect. {captain} kept calm and the papers held. They waved them through and the crew breathed again." },
  { title: 'Desperate Crew',    narrative: "A starving crew tried to take the ship at knifepoint. {captain} disarmed the ringleader and put the rest to work for passage." },
  { title: 'Hired Swords',      narrative: "Three armed men came aboard with a contract from a rival merchant. {captain} tore it up. They left without a fight." },
  { title: 'Standoff',          narrative: "Two ships, guns run out, neither wanting the cost of a real fight. {captain} waited them out. They blinked first." },
  { title: 'River Pirates',     narrative: "They'd blocked the channel with a chain. {captain} had seen the trick before. A flanking approach, a cut line, and they were through." },
]

const ENCOUNTER_LOSS = [
  { title: 'Pirate Ambush',     narrative: "The corsairs hit fast and hard. {captain} drove them off eventually, but the fight cost time and they arrived empty-handed." },
  { title: 'Sea Monster',       narrative: "It rammed the hull twice before the crew could respond. They drove it off, but the detour cost them the window for profit." },
  { title: 'Naval Patrol',      narrative: "A patrol cutter demanded inspection. {captain} had nothing to hide — but the delay burned hours." },
  { title: 'Bad Weather',       narrative: "Pushed off course by a sudden squall. By the time they righted, the opportunity had passed." },
  { title: 'Rough Passage',     narrative: "The route was blocked by hostile ships. The long way around added a day and cost the crew any prizes." },
  { title: 'Blockade Run',      narrative: "The blockade was tighter than the charts suggested. They punched through eventually, but not before losing the better part of a day." },
  { title: 'Toll Paid',         narrative: "The convoy was large enough that fighting wasn't worth it. {captain} paid the toll and swallowed the loss." },
  { title: 'False Flag',        narrative: "They flew merchant colors until they were close enough to act. By the time {captain} realized, the damage was done." },
  { title: 'Harassing Fire',    narrative: "Long-range shot kept the crew below deck for hours. The enemy never came close enough to board — just close enough to delay." },
  { title: 'Boarding Repelled', narrative: "They got a line over the rail before the crew drove them back. Nobody hurt, but the ship's stores were lighter for it." },
]

const ENCOUNTER_CRUSH = [
  { title: 'Ship Taken',        narrative: "{captain} hit them before they got their cannons loaded. The ship was theirs in ten minutes. They stripped it clean." },
  { title: 'Enemy Boarded',     narrative: "The boarding was swift and total. {captain} led the charge. The crew took everything worth taking and left the hull to sink." },
  { title: 'Captain Captured',  narrative: "The enemy captain surrendered before the second volley. {captain} accepted — and took the ship's strongbox with the terms." },
  { title: 'Ambush Turned',     narrative: "They thought they had the advantage. {captain} had spotted them an hour earlier. By the time they moved, it was already over." },
  { title: 'Perfect Broadside', narrative: "One volley, perfectly timed, and the fight was over. The enemy struck their colors before the smoke cleared." },
  { title: 'Ram and Board',     narrative: "{captain} drove straight at them. The crew was over the rail before the enemy could recover from the collision." },
  { title: 'Outwitted',         narrative: "The enemy had numbers. {captain} had positioning. By the time they understood what was happening, the strongbox was already on the new ship." },
  { title: 'Stern Chase Won',   narrative: "They ran. {captain} gave chase for three hours and ran them into a headland. Nowhere left to go." },
  { title: 'Night Raid',        narrative: "Came alongside in the dark with muffled oars. The enemy crew was asleep. It was over before they were fully awake." },
  { title: 'Fireships',         narrative: "{captain} used a burning dinghy as a distraction. While the enemy scrambled, the crew came over the stern. Clean and fast." },
]

const ENCOUNTER_CREW_LOSS = [
  { title: 'Pirate Ambush',     narrative: "The corsairs overwhelmed the deck. {captain} held the ship, but {name} was taken in the fighting and didn't come back." },
  { title: 'Sea Monster',       narrative: "It came up under the hull. {name} was over the side before anyone could reach them. The creature was gone by dawn." },
  { title: 'Hostile Boarding',  narrative: "They swarmed the deck before the crew could form up. {name} was dragged off before {captain} could get there." },
  { title: 'Rival Crew',        narrative: "Outmatched and outgunned. {name} took the worst of it. {captain} got the ship away, but not everyone made it back." },
  { title: 'Stern Chase',       narrative: "They couldn't shake the pursuit. {name} held the tiller while the rest fought. When it was finally over, {name} wasn't at the helm." },
  { title: 'Powder Mishap',     narrative: "A lantern in the wrong place, a moment of chaos during the fight. {name} was below deck. {captain} never got a chance to say anything." },
  { title: 'Cut Off',           narrative: "The fighting pushed {name} to the far end of the deck. By the time {captain} got through, {name} was gone and the enemy with them." },
  { title: 'Outnumbered',       narrative: "Too many of them, not enough of the crew. {captain} made it back to the ship. {name} didn't." },
]

const DANGER_SUCCESS = [
  { title: 'Reef Passage',      narrative: "Threaded the needle through the reef without a scratch. The helmsman earned their pay today." },
  { title: 'Sudden Squall',     narrative: "Rode the storm out below deck. The ship held, and by morning the sky was clear." },
  { title: 'Rogue Wave',        narrative: "Turned bow-on at the last second. Took the hit and stayed whole. Not everyone manages that." },
  { title: 'Shallow Ambush',    narrative: "Spotted the skiffs early and outran them. Never got within hailing distance." },
  { title: 'Coastal Shallows',  narrative: "Picked their way through the shallows by feel. Not a scratch on the keel." },
  { title: 'Fire Below',        narrative: "Smoke from the galley, quickly contained. Lucky it was spotted when it was." },
  { title: 'Waterspout',        narrative: "It passed close enough to feel the pull of it. The helmsman held course and it tracked away to the north." },
  { title: 'Hidden Rocks',      narrative: "The lookout called it with seconds to spare. Hard to starboard, then hard back. They slipped through." },
  { title: 'Fever Scare',       narrative: "One of the crew went down with a fever overnight. By morning it had broken. Nobody else caught it." },
  { title: 'Broken Mast',       narrative: "A crack in the mainmast, discovered early. Repaired at anchor before it became something worse." },
]

const DANGER_SETBACK = [
  { title: 'Reef Passage',      narrative: "Scraped the hull on a submerged shelf. Lost time making emergency patches but no serious damage." },
  { title: 'Sudden Squall',     narrative: "The storm battered the rigging. They held it together, but arrived late and empty-handed." },
  { title: 'Rogue Wave',        narrative: "The wave caught them sideways. No one hurt, but the delay cost them the day." },
  { title: 'Hostile Boarding',  narrative: "They boarded briefly before the crew drove them off. Nothing taken, but it shook the crew." },
  { title: 'Sandbar',           narrative: "Ran aground in the shallows. Took hours to get free. Lost the tide window completely." },
  { title: 'Broken Rudder',     narrative: "The rudder fitting gave way in heavy weather. Steered by sail for six hours while repairs were made. Not a quick fix." },
  { title: 'Waterspout',        narrative: "The waterspout clipped the stern. Rigging torn, a spar overboard. Got clear, but lost a day putting things right." },
  { title: 'Fever Outbreak',    narrative: "Half the crew down with fever by the second day. They made it back, but slowly and with nothing to show for it." },
  { title: 'Fire Below',        narrative: "A fire in the hold, caught before it spread but not before it took the better part of the supplies." },
  { title: 'Fouled Keel',       narrative: "Weed and debris fouled the keel in the shallows. Had to anchor and dive to clear it. Lost most of the day." },
]

const DANGER_CREW_LOSS = [
  { title: 'Sudden Squall',      narrative: "A wave hit amidships in the dark. {name} was on deck. By the time anyone noticed, they were gone." },
  { title: 'Rogue Wave',         narrative: "The wave rolled the deck flat. {name} didn't make it back to the rail in time." },
  { title: 'Hostile Boarding',   narrative: "They dragged {name} off the deck before the crew could respond. They never came back." },
  { title: 'Reef Passage',       narrative: "The ship lurched hard into the reef. {name} was overboard before anyone could react." },
  { title: 'Night Watch Ambush', narrative: "Attacked in the dark. {name} was alone on watch. The rest of the crew found the deck empty at dawn." },
  { title: 'Man Overboard',      narrative: "A freak gust, a wet rope, a moment of bad luck. {name} went over the side. The sea gave nothing back." },
  { title: 'Fire Below',         narrative: "The fire reached the powder store faster than anyone expected. {name} was still below when it went." },
  { title: 'Waterspout',         narrative: "The edge of the waterspout caught the deck. {name} was swept off before the rest of the crew could move." },
  { title: 'Broken Mast',        narrative: "The mast came down without warning. {name} was in the rigging. By the time they cut the lines free, it was too late." },
  { title: 'Fever',              narrative: "The fever took hold fast and didn't let go. {name} was gone before they reached port. Nothing {captain} could do." },
  { title: 'Fog Collision',      narrative: "Another ship, no lights, full speed in the fog. The impact threw {name} overboard. The other ship never stopped." },
  { title: 'Shark Waters',       narrative: "The water was warm and clear and {name} went in to check the hull. The crew didn't see what happened until it was already over." },
]

const WEATHER_SUCCESS = [
  { title: 'Trade Wind',         narrative: "A strong wind from the southwest pushed them ahead of schedule. The crew barely had to touch the sails." },
  { title: 'Clear Skies',        narrative: "Three days of perfect sailing weather. The crew's spirits were high the whole way." },
  { title: 'Favorable Current',  narrative: "The current ran with them the whole stretch. Made good time and had room to explore." },
  { title: 'Fog Clears',         narrative: "The fog lifted at just the right moment, opening a channel they'd have missed otherwise." },
  { title: 'Following Sea',      narrative: "Swells from behind pushed the ship all day. Barely needed the sails. They arrived a full tide early." },
  { title: 'Morning Offshore',   narrative: "The offshore wind came up at first light and held all day. Smooth and fast. Nobody complained." },
  { title: 'Calm Stretch',       narrative: "Flat water from the headland all the way to the strait. The kind of sailing that makes the rest of it worth it." },
  { title: 'Lucky Break',        narrative: "The storm that had been tracking them all week veered north overnight. They woke to clear skies and a fair wind." },
]

const WEATHER_FAIL = [
  { title: 'Dead Calm',          narrative: "The wind died for two days. Oars and patience. Made it back late and tired." },
  { title: 'Fog Bank',           narrative: "Lost hours in the fog. Came out 20 miles off course with nothing to show for the detour." },
  { title: 'Headwind',           narrative: "Fighting headwinds the whole stretch. No room to maneuver into anything useful." },
  { title: 'Squall Line',        narrative: "A squall line stretched across the route. They punched through it but arrived wrung out." },
  { title: 'Lightning Storm',    narrative: "A lightning storm pinned them at anchor for eighteen hours. Nothing to do but wait it out." },
  { title: 'Contrary Current',   narrative: "The current ran against them the whole way. Double the time, twice the effort, nothing to show for it." },
  { title: 'Freak Hail',         narrative: "Hailstones the size of a fist for two hours. The crew sheltered below and the sails took a beating." },
  { title: 'Tropical Heat',      narrative: "Three days of windless heat in the doldrums. Water rationed. Crew exhausted. They barely made it back." },
]

// Peaceful events — solo sailing (1 crew)
const PEACEFUL_SOLO = [
  { title: 'Dolphin Escort',   narrative: "A school of dolphins rode the bow wave most of the afternoon. {captain} watched them from the rail and didn't touch the sails for an hour." },
  { title: 'Shooting Stars',   narrative: "{captain} caught a meteor shower crossing the southern sky. Nobody else awake to see it." },
  { title: 'Seabird',          narrative: "A white seabird landed on the mast and rode along for two days. {captain} started leaving scraps out for it. It flew off just before land." },
  { title: 'Calm Night',       narrative: "A perfectly still night. The sea was glass. {captain} slept better than usual and was up before dawn without meaning to be." },
  { title: 'Old Chart',        narrative: "Found an old sea chart wedged behind a bunk — beautifully illustrated, useless for navigation. {captain} kept it anyway." },
  { title: 'Flying Fish',      narrative: "Flying fish cleared the deck twice before dawn. {captain} made good use of them." },
  { title: 'Bioluminescence',  narrative: "The water lit up green around the hull after dark. {captain} cut the lantern and sailed by it for an hour." },
  { title: 'Distant Sails',    narrative: "A fleet passed on the horizon, too far to read their flags. {captain} watched them until they were gone and didn't think about it again." },
  { title: 'Turtle',           narrative: "A sea turtle surfaced alongside and kept pace for the better part of a morning. {captain} left it a scrap of dried fish." },
  { title: 'Empty Horizon',    narrative: "Three days without sighting another ship. {captain} didn't miss the company." },
]

// Peaceful events — crew of 2 or more
const PEACEFUL_CREW = [
  { title: 'Dolphin Escort',   narrative: "A school of dolphins rode the bow wave for most of the day. The crew took it as a good omen." },
  { title: 'Shooting Stars',   narrative: "The night watch caught a meteor shower across the whole southern sky. They woke the rest of the crew for it." },
  { title: 'Old Chart',        narrative: "Found an old sea chart wedged behind a bunk. Useless for navigation, but beautifully illustrated. The crew argued over who'd keep it." },
  { title: 'Seabird',          narrative: "A white seabird landed on the mast and rode with them for two days. Flew off without warning just before they sighted land." },
  { title: 'Flying Fish',      narrative: "Flying fish cleared the deck twice before dawn. The cook made good use of them." },
  { title: 'Calm Night',       narrative: "A perfectly still night. The sea was glass. The crew slept well, and nobody could remember the last time that happened." },
  { title: 'Old Song',         narrative: "One of the crew started an old sailing song after dinner. By the second verse, everyone had joined in." },
  { title: 'Evening Watch',    narrative: "{captain} took the evening watch alone. By the time the crew rotated, there was hot food waiting and nobody knew when it had been made." },
  { title: 'Bioluminescence',  narrative: "The water glowed green around the hull after dark. The crew cut the lanterns and sat on deck watching it drift past." },
  { title: 'Whale Sounding',   narrative: "A whale surfaced thirty yards off the starboard bow and held there for a full minute. Nobody said anything. It dove without a sound." },
  { title: 'Cards Below',      narrative: "Three days of rain kept the crew below. They emerged on the fourth day with grievances, debts, and a complicated new card game." },
  { title: 'Fishing Off Watch', narrative: "The off-watch crew spent the afternoon fishing off the stern. Caught enough to eat well for two days." },
  { title: 'Tall Tale',        narrative: "One of the crew told a story nobody believed. By the third night of the voyage they were embellishing it together." },
  { title: 'Turtle',           narrative: "A sea turtle surfaced alongside and kept pace all morning. {captain} eventually told the crew to stop feeding it scraps." },
]
