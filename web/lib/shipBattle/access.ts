// Ship PvP is in private testing — only these captains can see or use it.
// Drop this gate (or flip to everyone) when duels go public. Usernames are
// matched case-insensitively.
export const PVP_TESTERS = ['kingkong', 'carl', 'dmoney', 'chotime']

export function isPvpTester(username: string | null | undefined): boolean {
  return !!username && PVP_TESTERS.includes(username.toLowerCase())
}
