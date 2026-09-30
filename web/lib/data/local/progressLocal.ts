// ── PROGRESSION OVER A LOCAL SAVE (Steam prep, 2026-09-29) ──
//
// ProgressData over one captain's save, spreading the harbour's. The badge
// signals are read from the save's own records (raid clears, the crew and its
// cards, revealed voyages, the catch log, rods, goldens, the regulars, the
// homestead, the isles and the digs); the Exchange is online only, so it
// counts nothing here. A badge's reward is paid once and only for an unlocked
// badge, both currencies with the mark. The house rises only from the tier
// priced against. Offline there is nobody else, so every well-formed name is
// free and a search finds nobody.

import type { ProgressData, HomesteadDbRow } from '../progressData'
import { localHarbourData } from './harbourLocal'
import { localCaptain, type LocalSave } from './save'
import cardsJson from '@/content/cards.json'
import { rodTierForId } from '@/lib/rods'

const SLUG_BY_CARD = new Map((cardsJson as unknown as { id: number; slug: string }[]).map(c => [c.id, c.slug]))

/** ProgressData over one captain's local save. */
export function localProgressData(save: LocalSave): ProgressData {
  const harbour = localHarbourData(save)
  const captain = localCaptain(save)
  const me = (uid: string) => {
    if (uid !== save.uid) throw new Error(`local save belongs to ${save.uid}, not ${uid}`)
    return save.profile
  }
  const home = (): HomesteadDbRow | null => save.homestead ? {
    house: Number(save.homestead.house ?? 0),
    name: (save.homestead.name as string | null) ?? null,
    furniture: save.homestead.furniture ?? {},
    owned: (save.homestead.owned as string[] | null) ?? [],
    pinned: (save.homestead.pinned as string[] | null) ?? [],
  } : null

  return {
    ...harbour,

    async badgeSignals(uid) {
      const prof = me(uid)
      return {
        profile: structuredClone(prof),
        raids: save.raidClears.map(c => ({ raid_id: c.raid_id, elapsed_ms: c.ms })),
        crew: save.crew.map(c => ({ xp: c.xp, died_at: c.died_at, effects: c.effects ?? null, slug: SLUG_BY_CARD.get(c.card_id) ?? null })),
        voyageCount: save.voyages.filter(v => v.status === 'revealed').length,
        collectionCount: Object.keys(save.collection).length,
        rodTiers: Object.keys(save.rodItems).map(id => rodTierForId(id)).filter((t): t is number => t != null),
        goldenCount: save.shinies.length,
        exchange: [],
        rapport: save.rapport.map(r => ({ points: r.points, gifts_given: r.gifts_given })),
        homestead: home() ? { house: home()!.house, name: home()!.name, owned: home()!.owned, pinned: home()!.pinned } : null,
        isles: [...save.discoveries],
        digs: save.digs.filter(d => d.dug_at).length,
      }
    },
    async claimBadgeReward(uid, badgeId, amount, gems) {
      const prof = me(uid)
      const unlocked = (prof.unlocked_badges as string[] | null) ?? []
      const claimed = (prof.claimed_badge_rewards as string[] | null) ?? []
      const granted = unlocked.includes(badgeId) && !claimed.includes(badgeId)
      if (granted) {
        prof.claimed_badge_rewards = [...claimed, badgeId]
        await captain.grant(uid, 'doubloons', amount)
        await captain.grant(uid, 'gems', gems)
      }
      return {
        new_doubloons: Number(prof.doubloons ?? 0), new_gems: Number(prof.gems ?? 0),
        claimed: [...((prof.claimed_badge_rewards as string[] | null) ?? [])], granted,
      }
    },

    async homestead(uid) { me(uid); return home() },
    async ensureHomestead(uid) {
      me(uid)
      if (!save.homestead) save.homestead = { house: 0, name: null, furniture: {}, owned: [], pinned: [] }
    },
    async buildHouse(uid, from, to, at) {
      me(uid)
      if (!save.homestead || Number(save.homestead.house ?? 0) !== from) return false
      save.homestead = { ...save.homestead, house: to, updated_at: at }
      return true
    },
    async updateHomestead(uid, patch) {
      me(uid)
      if (!save.homestead) return false
      save.homestead = { ...save.homestead, ...structuredClone(patch) }
      return true
    },
    async upsertHomestead(uid, patch) {
      me(uid)
      save.homestead = { house: 0, name: null, furniture: {}, owned: [], pinned: [], ...(save.homestead ?? {}), ...structuredClone(patch) }
    },

    async setUsername(uid, name) {
      const prof = me(uid)
      prof.username = name
      prof.username_changed = true
      return 'ok'
    },
    async usernameFree() { return true },
    async searchUsernames() { return [] },
  }
}
