const BASE_GAP  = 60
const GAP_GROWTH = 1.086

function computeXPTable(): number[] {
  const table: number[] = [0] // table[0] = 0: need 0 XP to be at level 1
  let total = 0
  for (let lv = 1; lv <= 99; lv++) {
    total += Math.floor(BASE_GAP * Math.pow(GAP_GROWTH, lv - 1))
    table.push(total)
  }
  return table
}

// XP_TABLE[n] = total XP needed to reach level n+1
// e.g. XP_TABLE[0]=0 (you start at level 1), XP_TABLE[1]=XP to reach level 2, XP_TABLE[99]=XP to reach level 100
export const XP_TABLE: number[] = computeXPTable()

export const MAX_LEVEL = 100

export function getLevelFromXP(xp: number): number {
  if (xp >= XP_TABLE[MAX_LEVEL - 1]) return MAX_LEVEL
  for (let lv = MAX_LEVEL - 1; lv >= 1; lv--) {
    if (xp >= XP_TABLE[lv]) return lv + 1
  }
  return 1
}

export function getXPProgress(xp: number): {
  level: number
  progress: number   // 0–1 fill fraction for the XP bar
  xpInLevel: number  // XP earned within the current level
  xpForLevel: number // total XP span of the current level
} {
  const level = getLevelFromXP(xp)
  if (level >= MAX_LEVEL) {
    return { level: MAX_LEVEL, progress: 1, xpInLevel: 0, xpForLevel: 0 }
  }
  const currentLevelXP = XP_TABLE[level - 1]
  const nextLevelXP    = XP_TABLE[level]
  const xpInLevel  = xp - currentLevelXP
  const xpForLevel = nextLevelXP - currentLevelXP
  return {
    level,
    progress: xpForLevel > 0 ? Math.min(1, xpInLevel / xpForLevel) : 1,
    xpInLevel,
    xpForLevel,
  }
}

// XP awarded per successful catch
const BASE_CATCH_XP = [15, 30, 55, 90, 140] // difficulty 1–5
const ZONE_XP_MULT: Record<string, number> = {
  shallows:    1.00,
  open_waters: 1.10,
  deep:        1.25,
  abyss:       1.50,
}

export function catchXP(difficulty: number, zone: string, isPerfect: boolean): number {
  const base     = BASE_CATCH_XP[Math.max(0, Math.min(4, difficulty - 1))]
  const zoneMult = ZONE_XP_MULT[zone] ?? 1.0
  return Math.round(base * zoneMult * (isPerfect ? 1.2 : 1.0))
}

// Catch-zone bonus degrees from level (additive with hook tier)
export function levelCatchBonus(level: number): number {
  return Math.floor(level * 0.2)
}
