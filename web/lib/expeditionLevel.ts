// Identical leveling curve to fishing level
const BASE_GAP   = 60
const GAP_GROWTH = 1.086

function computeXPTable(): number[] {
  const table: number[] = [0]
  let total = 0
  for (let lv = 1; lv <= 99; lv++) {
    total += Math.floor(BASE_GAP * Math.pow(GAP_GROWTH, lv - 1))
    table.push(total)
  }
  return table
}

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
  progress: number
  xpInLevel: number
  xpForLevel: number
} {
  const level = getLevelFromXP(xp)
  if (level >= MAX_LEVEL) return { level: MAX_LEVEL, progress: 1, xpInLevel: 0, xpForLevel: 0 }
  const levelStart = XP_TABLE[level - 1]
  const levelEnd   = XP_TABLE[level]
  const xpInLevel  = xp - levelStart
  const xpForLevel = levelEnd - levelStart
  return { level, progress: xpInLevel / xpForLevel, xpInLevel, xpForLevel }
}

// ── Navigator titles ─────────────────────────────────────────────────────────

const TITLES: { minLevel: number; title: string }[] = [
  { minLevel: 100, title: 'Legendary Seafarer' },
  { minLevel: 75,  title: 'Admiral'            },
  { minLevel: 50,  title: 'Commodore'          },
  { minLevel: 30,  title: 'Sea Captain'        },
  { minLevel: 15,  title: 'Navigator'          },
  { minLevel: 5,   title: 'First Mate'         },
  { minLevel: 1,   title: 'Deckhand'           },
]

export function getNavigatorTitle(level: number): string {
  return TITLES.find(t => level >= t.minLevel)?.title ?? 'Deckhand'
}

// ── XP awarded per voyage ────────────────────────────────────────────────────

// Base XP for completing the route at all
const ROUTE_BASE_XP: Record<string, number> = {
  coastal: 150,
  open:    280,
  deep:    450,
}

// XP per crew member (more crew = more XP, rewards building a full roster)
const XP_PER_CREW = 60

// XP per event, by type × outcome
const EVENT_XP: Record<string, Record<string, number>> = {
  encounter: { success: 90, failure: 25, neutral: 40 },
  discovery: { success: 60, failure: 20, neutral: 40 },
  danger:    { success: 70, failure: 15, neutral: 30 },
  weather:   { success: 30, failure: 15, neutral: 20 },
  peaceful:  { success: 20, failure: 20, neutral: 20 },
}

export function voyageXP(
  route: string,
  crewCount: number,
  events: { type: string; outcome: string; crewVariantLost?: number | null }[],
): number {
  const base      = ROUTE_BASE_XP[route] ?? 150
  const crewBonus = crewCount * XP_PER_CREW
  const eventXP   = events.reduce((sum, e) => {
    const row     = EVENT_XP[e.type] ?? EVENT_XP.peaceful
    // Crew loss always counts as failure for XP — dying in battle still teaches lessons
    const outcome = e.crewVariantLost != null ? 'failure' : (e.outcome ?? 'neutral')
    return sum + (row[outcome] ?? row.neutral ?? 20)
  }, 0)
  return base + crewBonus + eventXP
}
