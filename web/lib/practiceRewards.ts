// What each practice-skirmish enemy pays per kill. Shared by the client (which
// shows it) and awardPracticeKill (which pays it), so the server never takes
// the amount from the request.
export const PRACTICE_KILL_REWARDS: Record<string, { gold: number; xp: number }> = {
  brute:   { gold: 20, xp: 20 },
  sniper:  { gold: 25, xp: 30 },
  corsair: { gold: 35, xp: 45 },
}
