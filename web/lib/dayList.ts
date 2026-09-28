// TODAY'S LIST: which dailies are on it and which are done. Plain module
// (not 'use server', which strips non-async exports) so the board and the
// server read the one answer. See DayState.list in sea/dayActions.
import type { DayState } from '@/app/(app)/sea/dayActions'

export type ListKind = 'haul' | 'orders' | 'bounties' | 'parlor' | 'recruits'

/** Which of today's list are on the list for this captain, and done. The
 *  board draws from the same answer; see SeaDay's rowsOf. */
export function listItems(s: DayState): { kind: ListKind; done: boolean }[] {
  const items: { kind: ListKind; done: boolean }[] = []
  if (s.haul) items.push({ kind: 'haul', done: s.haul.gemsClaimed && s.haul.baitClaimed && s.haul.crateClaimed })
  if (s.orders) items.push({ kind: 'orders', done: s.orders.done >= s.orders.total && s.orders.ready === 0 })
  if (s.bounties?.unlocked) items.push({ kind: 'bounties', done: s.bounties.claimed >= s.bounties.total })
  if (s.parlor) items.push({ kind: 'parlor', done: s.parlor.boardPlayedToday })
  if (s.recruits && s.recruits.faces.length > 0) {
    items.push({ kind: 'recruits', done: s.list.recruitsSeen || s.recruits.faces.every(f => f.recruited) })
  }
  return items
}

export function listDone(s: DayState): boolean {
  const items = listItems(s)
  return items.length > 0 && items.every(i => i.done)
}
