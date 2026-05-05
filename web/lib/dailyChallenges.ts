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

// Pool sizes are 14, 13, 11 — LCM is 2002 days before the same 3-combo repeats
const TIER1: DailyChallenge[] = [
  { type: 'catch_any',     target: 10,  reward: 75,  label: 'Catch 10 fish' },
  { type: 'catch_any',     target: 15,  reward: 75,  label: 'Catch 15 fish' },
  { type: 'catch_zone',    target: 8,   zone: 'shallows',    reward: 60,  label: 'Catch 8 fish in the Shallows' },
  { type: 'catch_zone',    target: 12,  zone: 'shallows',    reward: 65,  label: 'Catch 12 fish in the Shallows' },
  { type: 'catch_zone',    target: 5,   zone: 'open_waters', reward: 70,  label: 'Catch 5 fish in Open Waters' },
  { type: 'land_perfects', target: 3,   reward: 80,  label: 'Land 3 perfect catches' },
  { type: 'land_perfects', target: 5,   reward: 90,  label: 'Land 5 perfect catches' },
  { type: 'land_perfects', target: 7,   reward: 90,  label: 'Land 7 perfect catches' },
  { type: 'catch_rarity',  target: 1,   minRarity: 2, reward: 65,  label: 'Catch an Uncommon or better fish' },
  { type: 'catch_rarity',  target: 3,   minRarity: 2, reward: 70,  label: 'Catch 3 Uncommon or better fish' },
  { type: 'catch_rarity',  target: 1,   minRarity: 3, reward: 75,  label: 'Catch a Rare or better fish' },
  { type: 'earn_value',    target: 300,  reward: 70,  label: 'Catch fish worth 300 ⟡ total' },
  { type: 'earn_value',    target: 500,  reward: 75,  label: 'Catch fish worth 500 ⟡ total' },
  { type: 'earn_value',    target: 800,  reward: 80,  label: 'Catch fish worth 800 ⟡ total' },
]

const TIER2: DailyChallenge[] = [
  { type: 'catch_any',     target: 20,  reward: 160, label: 'Catch 20 fish' },
  { type: 'catch_any',     target: 25,  reward: 175, label: 'Catch 25 fish' },
  { type: 'catch_any',     target: 30,  reward: 180, label: 'Catch 30 fish' },
  { type: 'catch_zone',    target: 8,   zone: 'open_waters', reward: 150, label: 'Catch 8 fish in Open Waters' },
  { type: 'catch_zone',    target: 12,  zone: 'open_waters', reward: 165, label: 'Catch 12 fish in Open Waters' },
  { type: 'catch_zone',    target: 5,   zone: 'deep',        reward: 165, label: 'Catch 5 fish in the Deep' },
  { type: 'catch_zone',    target: 8,   zone: 'deep',        reward: 180, label: 'Catch 8 fish in the Deep' },
  { type: 'land_perfects', target: 10,  reward: 200, label: 'Land 10 perfect catches' },
  { type: 'land_perfects', target: 15,  reward: 200, label: 'Land 15 perfect catches' },
  { type: 'catch_rarity',  target: 2,   minRarity: 3, reward: 160, label: 'Catch 2 Rare or better fish' },
  { type: 'catch_rarity',  target: 1,   minRarity: 4, reward: 175, label: 'Catch an Epic or better fish' },
  { type: 'earn_value',    target: 2000, reward: 175, label: 'Catch fish worth 2,000 ⟡ total' },
  { type: 'earn_value',    target: 3500, reward: 185, label: 'Catch fish worth 3,500 ⟡ total' },
]

const TIER3: DailyChallenge[] = [
  { type: 'catch_any',     target: 40,  reward: 325, label: 'Catch 40 fish' },
  { type: 'catch_any',     target: 50,  reward: 325, label: 'Catch 50 fish' },
  { type: 'catch_zone',    target: 3,   zone: 'abyss', reward: 350, label: 'Catch 3 fish in the Abyss' },
  { type: 'catch_zone',    target: 5,   zone: 'abyss', reward: 375, label: 'Catch 5 fish in the Abyss' },
  { type: 'catch_zone',    target: 8,   zone: 'abyss', reward: 375, label: 'Catch 8 fish in the Abyss' },
  { type: 'land_perfects', target: 20,  reward: 350, label: 'Land 20 perfect catches' },
  { type: 'land_perfects', target: 30,  reward: 360, label: 'Land 30 perfect catches' },
  { type: 'catch_rarity',  target: 1,   minRarity: 5, reward: 375, label: 'Catch a Legendary fish' },
  { type: 'catch_rarity',  target: 2,   minRarity: 4, reward: 350, label: 'Catch 2 Epic or better fish' },
  { type: 'catch_rarity',  target: 3,   minRarity: 4, reward: 360, label: 'Catch 3 Epic or better fish' },
  { type: 'earn_value',    target: 6000, reward: 350, label: 'Catch fish worth 6,000 ⟡ total' },
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
