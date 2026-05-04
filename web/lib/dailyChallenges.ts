export type DailyChallengeType = 'catch_any' | 'catch_zone' | 'land_perfects' | 'catch_rarity' | 'earn_value'

export interface DailyChallenge {
  type: DailyChallengeType
  target: number
  zone?: string
  minRarity?: number
  reward: number
  label: string
}

export interface DailyChallengeState {
  date: string
  challenges: [DailyChallenge, DailyChallenge, DailyChallenge]
  progress: [number, number, number]
  claimed: [boolean, boolean, boolean]
}

const TIER1: DailyChallenge[] = [
  { type: 'catch_any',     target: 10, reward: 150, label: 'Catch 10 fish' },
  { type: 'catch_zone',    target: 8,  zone: 'shallows',    reward: 120, label: 'Catch 8 fish in the Shallows' },
  { type: 'land_perfects', target: 5,  reward: 180, label: 'Land 5 perfect catches' },
  { type: 'catch_rarity',  target: 1,  minRarity: 3, reward: 150, label: 'Catch a Rare or better fish' },
  { type: 'earn_value',    target: 500, reward: 150, label: 'Catch fish worth 500 ⟡ total' },
]

const TIER2: DailyChallenge[] = [
  { type: 'catch_any',     target: 25, reward: 350, label: 'Catch 25 fish' },
  { type: 'catch_zone',    target: 8,  zone: 'open_waters', reward: 300, label: 'Catch 8 fish in Open Waters' },
  { type: 'catch_zone',    target: 6,  zone: 'deep',        reward: 350, label: 'Catch 6 fish in the Deep' },
  { type: 'land_perfects', target: 10, reward: 400, label: 'Land 10 perfect catches' },
  { type: 'catch_rarity',  target: 1,  minRarity: 4, reward: 350, label: 'Catch an Epic or better fish' },
  { type: 'earn_value',    target: 2000, reward: 350, label: 'Catch fish worth 2,000 ⟡ total' },
]

const TIER3: DailyChallenge[] = [
  { type: 'catch_zone',    target: 5,  zone: 'abyss', reward: 750, label: 'Catch 5 fish in the Abyss' },
  { type: 'land_perfects', target: 20, reward: 700,   label: 'Land 20 perfect catches' },
  { type: 'catch_rarity',  target: 1,  minRarity: 5,  reward: 750, label: 'Catch a Legendary fish' },
  { type: 'earn_value',    target: 6000, reward: 700,  label: 'Catch fish worth 6,000 ⟡ total' },
  { type: 'catch_any',     target: 50, reward: 650,   label: 'Catch 50 fish' },
]

function dateHash(date: string, salt: number): number {
  let h = (salt * 2654435761) >>> 0
  for (const c of date) h = (((h ^ c.charCodeAt(0)) * 1664525) >>> 0) + 1013904223
  return h >>> 0
}

export function getDailyChallenges(date: string): [DailyChallenge, DailyChallenge, DailyChallenge] {
  return [
    TIER1[dateHash(date, 1) % TIER1.length],
    TIER2[dateHash(date, 2) % TIER2.length],
    TIER3[dateHash(date, 3) % TIER3.length],
  ]
}

export function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

export function challengeIncrement(
  challenge: DailyChallenge,
  fishHabitat: string,
  fishRarity: number,
  fishSellValue: number,
  catchQty: number,
  isPerfect: boolean,
): number {
  switch (challenge.type) {
    case 'catch_any':     return catchQty
    case 'catch_zone':    return fishHabitat === challenge.zone ? catchQty : 0
    case 'land_perfects': return isPerfect ? 1 : 0
    case 'catch_rarity':  return fishRarity >= (challenge.minRarity ?? 1) ? 1 : 0
    case 'earn_value':    return fishSellValue * catchQty
    default:              return 0
  }
}
