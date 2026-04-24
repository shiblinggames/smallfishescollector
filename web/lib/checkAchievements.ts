'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { rarityFromVariant } from '@/lib/variants'
import type { DrawnCard } from '@/lib/types'

export type AchievementTrigger =
  | { type: 'pack'; drawn: DrawnCard[] }
  | { type: 'fotd'; streak: number; guessCount: number }
  | { type: 'crown'; matches: number; wager: number }
  | { type: 'fishing'; result: 'perfect' | 'catch' | 'miss' | 'penalty'; depthId: number; abyssStreak: number }
  | { type: 'expedition'; zone: string; status: 'completed' | 'failed' }
  | { type: 'bonus' }
  | { type: 'membership' }

export async function checkAchievements(userId: string, trigger: AchievementTrigger): Promise<string[]> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('user_achievements')
    .select('achievement_key')
    .eq('user_id', userId)

  const unlocked = new Set((existing ?? []).map((r: any) => r.achievement_key as string))
  const toAward: string[] = []

  function needs(key: string) {
    return !unlocked.has(key)
  }

  async function award(keys: string[]) {
    if (keys.length === 0) return
    const now = new Date().toISOString()
    await admin.from('user_achievements').upsert(
      keys.map(key => ({ user_id: userId, achievement_key: key, unlocked_at: now })),
      { onConflict: 'user_id,achievement_key', ignoreDuplicates: true }
    )
    toAward.push(...keys)
  }

  if (trigger.type === 'pack') {
    const packKeys = ['first_pack', 'packs_10', 'packs_50', 'packs_100', 'packs_500']
    const rarityKeys = ['first_epic', 'first_legendary', 'first_mythic']
    const fishKeys = ['fish_10', 'fish_25', 'fish_all']
    const anyPackNeeded = packKeys.some(needs)
    const anyRarityNeeded = rarityKeys.some(needs)
    const anyFishNeeded = fishKeys.some(needs)

    const promises: Promise<any>[] = []

    if (anyPackNeeded) {
      promises.push(
        (async () => {
          const { count } = await admin.from('pack_history').select('id', { count: 'exact', head: true }).eq('user_id', userId)
          const packs = count ?? 0
          const keys: string[] = []
          if (packs >= 1) keys.push('first_pack')
          if (packs >= 10) keys.push('packs_10')
          if (packs >= 50) keys.push('packs_50')
          if (packs >= 100) keys.push('packs_100')
          if (packs >= 500) keys.push('packs_500')
          await award(keys.filter(needs))
        })()
      )
    }

    if (anyRarityNeeded) {
      const keys: string[] = []
      for (const card of trigger.drawn) {
        const rarity = rarityFromVariant(card.variantName, card.dropWeight)
        if (rarity === 'Epic' && needs('first_epic')) keys.push('first_epic')
        if (rarity === 'Legendary' && needs('first_legendary')) keys.push('first_legendary')
        if (rarity === 'Mythic' && needs('first_mythic')) keys.push('first_mythic')
      }
      if (keys.length > 0) promises.push(award([...new Set(keys)]))
    }

    if (anyFishNeeded) {
      promises.push(
        (async () => {
          const [{ data: ownedRows }, { count: totalCards }] = await Promise.all([
            admin.from('user_collection')
              .select('card_variants(card_id)')
              .eq('user_id', userId),
            admin.from('cards').select('id', { count: 'exact', head: true }),
          ])
          const seenCards = new Set((ownedRows ?? []).map((r: any) => r.card_variants?.card_id).filter(Boolean))
          const fishCount = seenCards.size
          const keys: string[] = []
          if (fishCount >= 10) keys.push('fish_10')
          if (fishCount >= 25) keys.push('fish_25')
          if (totalCards && fishCount >= totalCards) keys.push('fish_all')
          await award(keys.filter(needs))
        })()
      )
    }

    await Promise.all(promises)
  }

  if (trigger.type === 'fotd') {
    const keys: string[] = []
    if (needs('fotd_first')) keys.push('fotd_first')
    if (trigger.guessCount === 1 && needs('fotd_perfect')) keys.push('fotd_perfect')
    if (trigger.streak >= 3 && needs('fotd_streak_3')) keys.push('fotd_streak_3')
    if (trigger.streak >= 7 && needs('fotd_streak_7')) keys.push('fotd_streak_7')
    if (trigger.streak >= 30 && needs('fotd_streak_30')) keys.push('fotd_streak_30')
    await award(keys)
  }

  if (trigger.type === 'crown') {
    const keys: string[] = []
    if (needs('crown_first')) keys.push('crown_first')
    if (trigger.matches === 3 && needs('crown_triple')) keys.push('crown_triple')
    if (trigger.matches === 3 && trigger.wager >= 200 && needs('crown_all_in')) keys.push('crown_all_in')
    await award(keys)
  }

  if (trigger.type === 'fishing') {
    const keys: string[] = []
    const isCatch = trigger.result === 'catch' || trigger.result === 'perfect'
    if (isCatch && needs('fishing_first_catch')) keys.push('fishing_first_catch')
    if (trigger.result === 'perfect' && needs('fishing_perfect')) keys.push('fishing_perfect')
    if (isCatch && trigger.depthId === 3 && needs('fishing_abyss')) keys.push('fishing_abyss')
    if (trigger.abyssStreak >= 5 && needs('fishing_abyss_streak')) keys.push('fishing_abyss_streak')
    await award(keys)
  }

  if (trigger.type === 'expedition') {
    if (trigger.status === 'completed') {
      const keys: string[] = []
      if (needs('expedition_first')) keys.push('expedition_first')
      if (trigger.zone === 'coral_run'          && needs('expedition_coral_run'))  keys.push('expedition_coral_run')
      if (trigger.zone === 'bertuna_triangle'    && needs('expedition_bertuna'))    keys.push('expedition_bertuna')
      if (trigger.zone === 'sunken_reach'        && needs('expedition_sunken'))     keys.push('expedition_sunken')
      if (trigger.zone === 'davy_jones_locker'   && needs('expedition_davy_jones')) keys.push('expedition_davy_jones')
      await award(keys)
    }
  }

  if (trigger.type === 'bonus') {
    const bonusNeeded = ['bonus_first', 'bonus_7'].filter(needs)
    if (bonusNeeded.length > 0) {
      const { count } = await admin
        .from('doubloon_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .like('reason', 'Daily login bonus%')
      const claims = count ?? 0
      const keys: string[] = []
      if (claims >= 1) keys.push('bonus_first')
      if (claims >= 7) keys.push('bonus_7')
      await award(keys.filter(needs))
    }
  }

  if (trigger.type === 'membership') {
    if (needs('member')) await award(['member'])
  }

  // Doubloon milestones — checked on every trigger
  const doubloonKeys = ['doubloons_1k', 'doubloons_5k', 'doubloons_25k', 'doubloons_100k']
  if (doubloonKeys.some(needs)) {
    const { data: txns } = await admin
      .from('doubloon_transactions')
      .select('amount')
      .eq('user_id', userId)
      .gt('amount', 0)
    const totalEarned = (txns ?? []).reduce((sum: number, r: any) => sum + r.amount, 0)
    const keys: string[] = []
    if (totalEarned >= 1000)   keys.push('doubloons_1k')
    if (totalEarned >= 5000)   keys.push('doubloons_5k')
    if (totalEarned >= 25000)  keys.push('doubloons_25k')
    if (totalEarned >= 100000) keys.push('doubloons_100k')
    await award(keys.filter(needs))
  }

  return toAward
}
