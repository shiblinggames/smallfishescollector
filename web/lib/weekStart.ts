export function getWeekStart(): string {
  const now = new Date()
  const day = now.getUTCDay() // 0 = Sunday
  const daysToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() + daysToMonday)
  monday.setUTCHours(0, 0, 0, 0)
  return monday.toISOString().split('T')[0]
}

export function daysUntilReset(): number {
  const day = new Date().getUTCDay()
  return (8 - day) % 7 || 7
}
