// STEAM, FROM THE PAGE (Steam prep, 2026-09-29).
//
// The shell's preload hands the page window.stbSteam (electron/steam.cjs); in a
// plain browser there is none and every call here does nothing.
//
// ACHIEVEMENTS FOLLOW THE SAVE, NOT THE MOMENT. Badges are granted in a dozen
// places in the core (a catch, a raid kill, a reconcile on the Logbook), so
// rather than hook each one, every save write compares the save's
// unlocked_badges against what has already been sent and sends the rest. The
// first write after opening sends them all, so a save imported from the web, or
// one earned while Steam was closed, catches up on its own. Steam ignores a
// repeat.

import type { LocalSave } from '@/lib/data/local/save'
import { ZONE_LABEL } from '@/app/(app)/fishing/zoneData'

type ShellSteam = {
  status(): Promise<{ running: boolean; appId: number | null; why: string; name?: string | null }>
  unlock(ids: string[]): Promise<number>
  presence(fields: Record<string, string | null>): Promise<void>
}
const shellSteam = () => (window as unknown as { stbSteam?: ShellSteam }).stbSteam

const sent = new Set<string>()

/** Send any badge in the save that Steam has not been told about yet. */
export function syncAchievements(save: LocalSave): void {
  const steam = shellSteam()
  if (!steam) return
  const fresh = ((save.profile.unlocked_badges as string[] | null) ?? []).filter(id => !sent.has(id))
  if (!fresh.length) return
  for (const id of fresh) sent.add(id)
  void steam.unlock(fresh).catch(() => { for (const id of fresh) sent.delete(id) })
}

/** What a friend sees next to the captain's name. The tokens are the ones in
 *  steam/rich_presence.vdf. */
export type Activity = 'menu' | 'fishing' | 'raid' | 'gauntlet' | 'den'

let last = ''
export function setActivity(activity: Activity, habitat?: string): void {
  const steam = shellSteam()
  if (!steam) return
  const zone = activity === 'fishing' && habitat ? (ZONE_LABEL[habitat] ?? null) : null
  const key = `${activity}:${zone ?? ''}`
  if (key === last) return
  last = key
  const token = { menu: '#Status_Menu', fishing: zone ? '#Status_FishingZone' : '#Status_Fishing', raid: '#Status_Raid', gauntlet: '#Status_Gauntlet', den: '#Status_Den' }[activity]
  void steam.presence({ zone, steam_display: token }).catch(() => {})
}

export async function steamStatus() {
  return (await shellSteam()?.status().catch(() => null)) ?? { running: false, appId: null, why: 'not in the shell' }
}
