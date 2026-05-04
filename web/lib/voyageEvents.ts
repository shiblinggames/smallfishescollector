import type { CrewCard } from './expeditions'
import { computeTotalCrewStats } from './expeditions'

export type VoyageEventType = 'discovery' | 'encounter' | 'danger' | 'weather' | 'peaceful'
export type VoyageEventOutcome = 'success' | 'failure' | 'neutral'
export type VoyageRoute = 'coastal' | 'open' | 'deep'

export interface RouteConfig {
  name: string
  tagline: string
  riskLabel: string
  color: string
  payoutScale: number
  crewLossScale: number
  gemScale: number
}

export const ROUTE_CONFIGS: Record<VoyageRoute, RouteConfig> = {
  coastal: {
    name: 'Coastal Run',
    tagline: 'Familiar waters. Light risk, modest reward.',
    riskLabel: 'Safe',
    color: '#4ade80',
    payoutScale: 0.70,
    crewLossScale: 0,
    gemScale: 0.5,
  },
  open: {
    name: 'Open Seas',
    tagline: 'Standard voyage. Balanced risk and reward.',
    riskLabel: 'Balanced',
    color: '#f0c040',
    payoutScale: 1.0,
    crewLossScale: 1.0,
    gemScale: 1.0,
  },
  deep: {
    name: 'The Deep',
    tagline: 'Hostile open water. High risk, high reward.',
    riskLabel: 'Dangerous',
    color: '#c084fc',
    payoutScale: 1.5,
    crewLossScale: 1.6,
    gemScale: 1.5,
  },
}

export interface VoyageEvent {
  type: VoyageEventType
  title: string
  narrative: string
  outcome: VoyageEventOutcome
  doubloonDelta: number      // always >= 0 — no doubloon losses
  gemDelta: number           // always >= 0
  crewVariantLost: number | null
}

export interface VoyageResult {
  events: VoyageEvent[]
  totalDoubloons: number
  totalGems: number
  crewLost: number[]  // variantIds permanently lost
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

  // Stat rolls
  const rollFortune  = () => Math.random() * 45 < fortune        // fortune 22 ≈ 50%, fortune 45 = guaranteed
  const rollPower    = () => Math.random() * 30 < power          // power 15 ≈ 50%
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
        const gemDrop = success && Math.random() * 55 < fortune ? Math.round(rand(3, 10) * rc.gemScale) : 0
        const template = pick(success ? DISCOVERY_SUCCESS : DISCOVERY_FAIL)
        event = {
          type, outcome: success ? 'success' : 'neutral',
          title: template.title, narrative: fill(template.narrative),
          doubloonDelta: success ? payout(60, 180) : 0,
          gemDelta: gemDrop,
          crewVariantLost: null,
        }
        break
      }

      case 'encounter': {
        const win = rollPower()
        if (win) {
          // Crushing win: separate roll — high power makes it more likely
          const crush = Math.random() * 30 < power * 0.6
          const gemDrop = crush
            ? Math.round(rand(5, 15) * rc.gemScale)
            : (Math.random() * 55 < power ? Math.round(rand(2, 7) * rc.gemScale) : 0)
          const template = pick(crush ? ENCOUNTER_CRUSH : ENCOUNTER_WIN)
          event = {
            type, outcome: 'success',
            title: template.title, narrative: fill(template.narrative),
            doubloonDelta: crush ? payout(120, 240, true) : payout(30, 80, true),
            gemDelta: gemDrop,
            crewVariantLost: null,
          }
        } else {
          // Loss: low power risks crew loss — chance fades to 0 at power 15+
          const canLoseCrew = crewCount >= 2 && crewLost.length === 0
          const crewLossChance = canLoseCrew ? Math.max(0, 0.6 - power / 25) * rc.crewLossScale : 0
          const loseCrew = crewLossChance > 0 && Math.random() < crewLossChance
          if (loseCrew) {
            const victims = crew.slice(1)
            const victim = pick(victims)
            const template = pick(ENCOUNTER_CREW_LOSS)
            const narrative = fill(template.narrative, { name: victim.name })
            crewLost.push(victim.variantId)
            event = {
              type, outcome: 'failure',
              title: template.title, narrative,
              doubloonDelta: 0, gemDelta: 0, crewVariantLost: victim.variantId,
            }
          } else {
            const template = pick(ENCOUNTER_LOSS)
            event = {
              type, outcome: 'failure',
              title: template.title, narrative: fill(template.narrative),
              doubloonDelta: 0, gemDelta: 0, crewVariantLost: null,
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
            doubloonDelta: 0, gemDelta: 0, crewVariantLost: null,
          }
        } else {
          const canLoseCrew = crewCount >= 2 && crewLost.length === 0
          const loseCrew = canLoseCrew && Math.random() < 0.40 * rc.crewLossScale
          if (loseCrew) {
            const victims = crew.slice(1)
            const victim = pick(victims)
            const template = pick(DANGER_CREW_LOSS)
            const narrative = fill(template.narrative, { name: victim.name })
            crewLost.push(victim.variantId)
            event = {
              type, outcome: 'failure',
              title: template.title, narrative,
              doubloonDelta: 0, gemDelta: 0, crewVariantLost: victim.variantId,
            }
          } else {
            const template = pick(DANGER_SETBACK)
            event = {
              type, outcome: 'failure',
              title: template.title, narrative: template.narrative,
              doubloonDelta: 0, gemDelta: 0, crewVariantLost: null,
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
          gemDelta: 0, crewVariantLost: null,
        }
        break
      }

      case 'peaceful':
      default: {
        const pool = crewCount === 1 ? PEACEFUL_SOLO : PEACEFUL_CREW
        const template = pick(pool)
        event = {
          type, outcome: 'neutral',
          title: template.title, narrative: fill(template.narrative),
          doubloonDelta: 0, gemDelta: 0, crewVariantLost: null,
        }
        break
      }
    }

    events.push(event)
  }

  const totalDoubloons = events.reduce((sum, e) => sum + e.doubloonDelta, 0)
  const totalGems = events.reduce((sum, e) => sum + e.gemDelta, 0)
  return { events, totalDoubloons, totalGems, crewLost }
}

// ── Event text pools ──────────────────────────────────────────────────────────

const DISCOVERY_SUCCESS = [
  { title: 'Sunken Wreck',     narrative: "{captain} spotted the mast tip above the waterline at first light. The hull was still sealed. Bars of silver gleamed beneath the salt water." },
  { title: "Smuggler's Cache", narrative: "A hidden cove, a false rock, and a stash tucked beneath it. {captain} found it before anyone else would have thought to look." },
  { title: 'Ambergris Haul',   narrative: "The whale surfaced once and the crew moved fast. Rare stuff. Worth more than a month of fishing." },
  { title: 'Floating Cargo',   narrative: "Merchant crates, barely waterlogged. Spices, cloth, a locked chest. Pure windfall." },
  { title: 'Abandoned Camp',   narrative: "An island camp, recently abandoned. The fire pit was cold but the supply crates weren't empty." },
  { title: 'Message Buoy',     narrative: "{captain} recognized the merchant's coding system. The crew got to the salvage site before anyone else." },
]

const DISCOVERY_FAIL = [
  { title: 'Sunken Wreck',    narrative: "The wreck was already stripped clean. Someone had beaten them to it by days, maybe hours." },
  { title: 'Empty Cove',      narrative: "{captain} called it promising from a mile out. Up close it was just gulls and old rope." },
  { title: 'Whale Sighting',  narrative: "The creature disappeared before they got close enough. Gone like it was never there." },
  { title: 'Floating Debris', narrative: "Empty crates. Whatever was in them had long since sunk." },
  { title: 'Dry Cave',        narrative: "The island cave the old chart marked was dry and picked over. Not even useful as a camp." },
]

const ENCOUNTER_WIN = [
  { title: 'Pirate Ambush',   narrative: "The corsairs cut across the bow looking for easy prey. {captain} answered with a volley. The pirates turned and ran, leaving their spoils behind." },
  { title: 'Armed Skiff',     narrative: "A ragged skiff moved to intercept. One warning shot and it veered off. The crew recovered a small chest from the water where it had been." },
  { title: 'Rival Crew',      narrative: "Another crew, desperate and armed. They tested {captain}'s resolve — and found it." },
  { title: 'Toll Gate',       narrative: "An armed convoy tried to levy a toll. {captain}'s show of strength was enough. They sailed through without paying." },
  { title: 'Merchant Deal',   narrative: "A stranded merchant ship needed an escort through contested waters. {captain} obliged, and the merchant paid well." },
]

const ENCOUNTER_LOSS = [
  { title: 'Pirate Ambush',   narrative: "The corsairs hit fast and hard. {captain} drove them off eventually, but the fight cost time and they arrived empty-handed." },
  { title: 'Sea Monster',     narrative: "It rammed the hull twice before the crew could respond. They drove it off, but the detour cost them the window for profit." },
  { title: 'Naval Patrol',    narrative: "A patrol cutter demanded inspection. {captain} had nothing to hide — but the delay burned hours." },
  { title: 'Bad Weather',     narrative: "Pushed off course by a sudden squall. By the time they righted, the opportunity had passed." },
  { title: 'Rough Passage',   narrative: "The route was blocked by hostile ships. The long way around added a day and cost the crew any prizes." },
]

const ENCOUNTER_CRUSH = [
  { title: 'Ship Taken',       narrative: "{captain} hit them before they got their cannons loaded. The ship was theirs in ten minutes. They stripped it clean." },
  { title: 'Enemy Boarded',    narrative: "The boarding was swift and total. {captain} led the charge. The crew took everything worth taking and left the hull to sink." },
  { title: 'Captain Captured', narrative: "The enemy captain surrendered before the second volley. {captain} accepted — and took the ship's strongbox with the terms." },
  { title: 'Ambush Turned',    narrative: "They thought they had the advantage. {captain} had spotted them an hour earlier. By the time they moved, it was already over." },
]

const ENCOUNTER_CREW_LOSS = [
  { title: 'Pirate Ambush',    narrative: "The corsairs overwhelmed the deck. {captain} held the ship, but {name} was taken in the fighting and didn't come back." },
  { title: 'Sea Monster',      narrative: "It came up under the hull. {name} was over the side before anyone could reach them. The creature was gone by dawn." },
  { title: 'Hostile Boarding', narrative: "They swarmed the deck before the crew could form up. {name} was dragged off before {captain} could get there." },
  { title: 'Rival Crew',       narrative: "Outmatched and outgunned. {name} took the worst of it. {captain} got the ship away, but not everyone made it back." },
]

const DANGER_SUCCESS = [
  { title: 'Reef Passage',        narrative: "Threaded the needle through the reef without a scratch. The helmsman earned their pay today." },
  { title: 'Sudden Squall',       narrative: "Rode the storm out below deck. The ship held, and by morning the sky was clear." },
  { title: 'Rogue Wave',          narrative: "Turned bow-on at the last second. Took the hit and stayed whole. Not everyone manages that." },
  { title: 'Shallow Ambush',      narrative: "Spotted the skiffs early and outran them. Never got within hailing distance." },
  { title: 'Coastal Shallows',    narrative: "Picked their way through the shallows by feel. Not a scratch on the keel." },
]

const DANGER_SETBACK = [
  { title: 'Reef Passage',        narrative: "Scraped the hull on a submerged shelf. Lost time making emergency patches but no serious damage." },
  { title: 'Sudden Squall',       narrative: "The storm battered the rigging. They held it together, but arrived late and empty-handed." },
  { title: 'Rogue Wave',          narrative: "The wave caught them sideways. No one hurt, but the delay cost them the day." },
  { title: 'Hostile Boarding',    narrative: "They boarded briefly before the crew drove them off. Nothing taken, but it shook the crew." },
  { title: 'Sandbar',             narrative: "Ran aground in the shallows. Took hours to get free. Lost the tide window completely." },
]

const DANGER_CREW_LOSS = [
  { title: 'Sudden Squall',       narrative: "A wave hit amidships in the dark. {name} was on deck. By the time anyone noticed, they were gone." },
  { title: 'Rogue Wave',          narrative: "The wave rolled the deck flat. {name} didn't make it back to the rail in time." },
  { title: 'Hostile Boarding',    narrative: "They dragged {name} off the deck before the crew could respond. They never came back." },
  { title: 'Reef Passage',        narrative: "The ship lurched hard into the reef. {name} was overboard before anyone could react." },
  { title: 'Night Watch Ambush',  narrative: "Attacked in the dark. {name} was alone on watch. The rest of the crew found the deck empty at dawn." },
  { title: 'Man Overboard',       narrative: "A freak gust, a wet rope, a moment of bad luck. {name} went over the side. The sea gave nothing back." },
]

const WEATHER_SUCCESS = [
  { title: 'Trade Wind',          narrative: "A strong wind from the southwest pushed them ahead of schedule. The crew barely had to touch the sails." },
  { title: 'Clear Skies',         narrative: "Three days of perfect sailing weather. The crew's spirits were high the whole way." },
  { title: 'Favorable Current',   narrative: "The current ran with them the whole stretch. Made good time and had room to explore." },
  { title: 'Fog Clears',          narrative: "The fog lifted at just the right moment, opening a channel they'd have missed otherwise." },
]

const WEATHER_FAIL = [
  { title: 'Dead Calm',           narrative: "The wind died for two days. Oars and patience. Made it back late and tired." },
  { title: 'Fog Bank',            narrative: "Lost hours in the fog. Came out 20 miles off course with nothing to show for the detour." },
  { title: 'Headwind',            narrative: "Fighting headwinds the whole stretch. No room to maneuver into anything useful." },
  { title: 'Squall Line',         narrative: "A squall line stretched across the route. They punched through it but arrived wrung out." },
]

// Peaceful events — solo sailing (1 crew)
const PEACEFUL_SOLO = [
  { title: 'Dolphin Escort',  narrative: "A school of dolphins rode the bow wave most of the afternoon. {captain} watched them from the rail and didn't touch the sails for an hour." },
  { title: 'Shooting Stars',  narrative: "{captain} caught a meteor shower crossing the southern sky. Nobody else awake to see it." },
  { title: 'Seabird',         narrative: "A white seabird landed on the mast and rode along for two days. {captain} started leaving scraps out for it. It flew off just before land." },
  { title: 'Calm Night',      narrative: "A perfectly still night. The sea was glass. {captain} slept better than usual and was up before dawn without meaning to be." },
  { title: 'Old Chart',       narrative: "Found an old sea chart wedged behind a bunk — beautifully illustrated, useless for navigation. {captain} kept it anyway." },
  { title: 'Flying Fish',     narrative: "Flying fish cleared the deck twice before dawn. {captain} made good use of them." },
]

// Peaceful events — crew of 2 or more
const PEACEFUL_CREW = [
  { title: 'Dolphin Escort',  narrative: "A school of dolphins rode the bow wave for most of the day. The crew took it as a good omen." },
  { title: 'Shooting Stars',  narrative: "The night watch caught a meteor shower across the whole southern sky. They woke the rest of the crew for it." },
  { title: 'Old Chart',       narrative: "Found an old sea chart wedged behind a bunk. Useless for navigation, but beautifully illustrated. The crew argued over who'd keep it." },
  { title: 'Seabird',         narrative: "A white seabird landed on the mast and rode with them for two days. Flew off without warning just before they sighted land." },
  { title: 'Flying Fish',     narrative: "Flying fish cleared the deck twice before dawn. The cook made good use of them." },
  { title: 'Calm Night',      narrative: "A perfectly still night. The sea was glass. The crew slept well, and nobody could remember the last time that happened." },
  { title: 'Old Song',        narrative: "One of the crew started an old sailing song after dinner. By the second verse, everyone had joined in." },
  { title: 'Evening Watch',   narrative: "{captain} took the evening watch alone. By the time the crew rotated, there was hot food waiting and nobody knew when it had been made." },
]
