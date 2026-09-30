// PROGRESSION, OFFLINE (Steam prep, 2026-09-29).
//
// Runs the REAL progression paths (lib/core/progress, lib/core/homestead,
// lib/core/profile) against a LOCAL save (lib/data/local/progressLocal), with
// no network:
//   1. the import trees of the cores and the local store hold nothing of the
//      server;
//   2. Renown: points from overflow XP, spent and committed only within what is
//      banked, a Captain's board, a respec token bought for gems and spent once;
//   3. badges: derived from the save's own records and stamped, a reward paid
//      once and only for an unlocked badge, the raid feats the client may
//      unlock (and nothing else), worn in a real slot only;
//   4. the unlock banner: the first check seeds, a newly earned gate is news
//      once;
//   5. the welcome gift and the member's daily pack, once each;
//   6. the homestead: the house climbed rung by rung for its price, furniture
//      only where a room is open, salvage never bought, a piece owned back for
//      free, the name's rules, badges pinned only when earned and hung;
//   7. the profile: the username's rules (once, clean), skins bought, worn and
//      self-healed, Captain swatches and specials gated, the showcase only the
//      living crew;
//   8. the store's own guards (a reward claimed once, the house raised once);
//   9. the Almanac: a zone's reward paid once and only when every species is
//      logged, a prestige only after it and only once, goldens kept through the
//      wipe, the Ancient Deep never prestiged; a giant released only after the
//      finale, only once, and never one you have not landed.
//
//   npx tsx scripts/check-offline-progress.mts

import fs from 'fs'
import path from 'path'
import * as progress from '../lib/core/progress'
import * as homestead from '../lib/core/homestead'
import * as profile from '../lib/core/profile'
import * as fishing from '../lib/core/fishing'
import { localFishingData } from '../lib/data/local/fishingLocal'
import { zoneRewardDoubloons } from '../lib/zoneRewards'
import { localProgressData } from '../lib/data/local/progressLocal'
import {
  freshCasino, freshCharting, SHIP_PROFILE_DEFAULTS, DAILY_PROFILE_DEFAULTS, PARLOR_PROFILE_DEFAULTS, CHARTING_PROFILE_DEFAULTS, SEA_PROFILE_DEFAULTS,
  type LocalSave,
} from '../lib/data/local/save'
import type { SpeciesRow } from '../lib/data/fishingData'
import { installRng, mulberry32 } from '../lib/rng'
import { installClock } from '../lib/clock'
import { XP_TABLE } from '../lib/fishingLevel'
import { XP_TABLE as NAV_XP } from '../lib/expeditionLevel'
import { FISHING_RENOWN_STATS, RENOWN_RESPEC_GEM_COST, renownLevel } from '../lib/renown'
import { BADGES, BADGE_REWARD, BADGE_GEM_REWARD } from '../lib/badges'
import { HOUSE, FURNISHING_BY_ID, ROOM_BY_ID, openSlots, EMPTY_HOMESTEAD } from '../lib/homestead'
import { CHARACTER_COLORS } from '../lib/characters'
import { AVATAR_SPECIALS } from '../lib/avatarColors'
import { PROFILE_BACKGROUNDS } from '../lib/profileBackgrounds'

let failed = 0
const fail = (m: string) => { failed++; console.log('  FAIL ' + m) }
const ROOT = process.cwd()
const DAY = 86_400_000

// ── 1. Nothing of the server on the offline path ──
function importsOf(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8')
  const out: string[] = []
  for (const m of text.matchAll(/^\s*(import|export)\s+(type\s+)?[^'"\n]*?from\s+['"]([^'"]+)['"]/gm)) {
    if (m[2]) continue
    out.push(m[3])
  }
  return out
}
function resolve(from: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = path.join(path.dirname(from), spec)
  else return null
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return base + ext
  return null
}
for (const entry of ['lib/core/progress.ts', 'lib/core/homestead.ts', 'lib/core/profile.ts', 'lib/core/badgesPage.ts', 'lib/core/lobbies.ts', 'lib/core/gauntletPage.ts', 'lib/core/marketPage.ts', 'lib/data/local/progressLocal.ts']) {
  const seen = new Set<string>(); const bad: string[] = []; const stack = [path.join(ROOT, entry)]
  while (stack.length) {
    const f = stack.pop()!
    if (seen.has(f)) continue
    seen.add(f)
    if (f.endsWith('.json')) continue
    if (/^\s*['"]use server['"]/.test(fs.readFileSync(f, 'utf8'))) bad.push(`${path.relative(ROOT, f)} is a server action module`)
    for (const spec of importsOf(f)) {
      if (/supabase|^next(\/|$)|^server-only$|anthropic/.test(spec)) { bad.push(`${path.relative(ROOT, f)} imports ${spec}`); continue }
      const r = resolve(f, spec)
      if (r) stack.push(r)
    }
  }
  if (bad.length) for (const b of bad) fail(`${entry} reaches the server: ${b}`)
  else console.log(`  ${entry}: ${seen.size} modules, none of them the server`)
}

const SPECIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'fish_species.json'), 'utf8')) as SpeciesRow[]
const UID = 'local-captain'
const T0 = Date.parse('2026-09-29T09:00:00.000Z')
function freshSave(over: Record<string, unknown> = {}): LocalSave {
  return {
    uid: UID,
    profile: {
      ...structuredClone(SHIP_PROFILE_DEFAULTS), ...structuredClone(DAILY_PROFILE_DEFAULTS), ...structuredClone(PARLOR_PROFILE_DEFAULTS),
      ...structuredClone(CHARTING_PROFILE_DEFAULTS), ...structuredClone(SEA_PROFILE_DEFAULTS),
      username: 'offline_captain', doubloons: 100_000_000, gems: 10_000, fishing_xp: XP_TABLE[19], expedition_xp: NAV_XP[19], is_admin: false,
      unlocked_badges: [], claimed_badge_rewards: [], ancient_catches: [], prestige_levels: {}, unlocked_character_colors: [], unlocked_boats: [],
      unlocked_avatar_specials: [], seen_unlocks: null, renown_respecs: 0,
      ...over,
    },
    species: SPECIES,
    bait: {}, hold: {}, collection: {}, lifetime: {}, bests: {}, shinies: [], daily: {},
    clears: [], rodItems: {}, ledger: [], anomalies: [], mail: [], rapport: [], contests: {}, overrides: {},
    deals: [], market: null, crew: [], recruits: [], bunks: [], nextId: 1, voyages: [], trawls: [],
    depthBests: {}, gauntletRuns: [], bountyEvents: [], casino: freshCasino(), raidTokens: [], raidClears: [],
    bounty: null, bountyHistory: [], contestsWonAt: {}, trivia: { board: {}, capstan: {}, ladder: {} }, charting: freshCharting(),
    digs: [], discoveries: [], homestead: null,
  }
}
const isErr = (r: object) => 'error' in r && !!(r as { error?: string }).error

let now = T0
installRng(mulberry32(16)); installClock(() => now)

try {
  // ── 2. Renown ──
  {
    const bigXp = XP_TABLE[99] * 3
    const s = freshSave({ fishing_xp: bigXp, is_premium: true }); const db = localProgressData(s)
    const st = await progress.getRenownState(db, UID, 'fishing')
    const lvl = renownLevel('fishing', bigXp)
    if (!st || st.level !== lvl || st.available !== lvl || !st.captain) fail(`Renown did not read its level (${st?.level} vs ${lvl})`)
    const stat = FISHING_RENOWN_STATS[0].id
    const a = await progress.allocateRenown(db, UID, 'fishing', stat)
    if (isErr(a) || (a as { spent: number }).spent !== 1) fail('a point was not spent')
    if (!isErr(await progress.allocateRenown(db, UID, 'fishing', 'no_such_stat'))) fail('an unknown stat took a point')
    if (!isErr(await progress.commitRenown(db, UID, 'fishing', { [stat]: lvl + 5 }))) fail('a draft past the banked points was committed')
    const c = await progress.commitRenown(db, UID, 'fishing', { [stat]: 2, bogus: 9 })
    if (isErr(c) || (c as { spent: number }).spent !== 3) fail('a draft was not committed (or kept an unknown stat)')
    // A deckhand's board is read-only (once nothing is spent on it).
    const deck = freshSave({ fishing_xp: bigXp })
    if (!isErr(await progress.allocateRenown(localProgressData(deck), UID, 'fishing', stat))) fail('a deckhand spent a Renown point')
    // Respec: refused with no token, a token bought for gems, spent once.
    if (!isErr(await progress.respecRenown(db, UID, 'fishing'))) fail('a respec ran with no token')
    const g0 = Number(s.profile.gems)
    const bought = await progress.buyRenownRespec(db, UID, 'fishing')
    if (isErr(bought) || s.profile.renown_respecs !== 1 || s.profile.gems !== g0 - RENOWN_RESPEC_GEM_COST) fail('a respec token did not sell for its gems')
    const r = await progress.respecRenown(db, UID, 'fishing')
    if (isErr(r) || (r as { spent: number }).spent !== 0 || s.profile.renown_respecs !== 0) fail('the respec did not clear the board and spend the token')
    if (!isErr(await progress.respecRenown(db, UID, 'fishing'))) fail('a respec ran twice on one token')
    const poor = freshSave({ fishing_xp: bigXp, is_premium: true, gems: 0 })
    if (!isErr(await progress.buyRenownRespec(localProgressData(poor), UID, 'fishing')) || poor.profile.renown_respecs !== 0) fail('a respec token sold on credit')
    await progress.markRenownIntroSeen(db, UID, 'nav')
    if (s.profile.seen_nav_renown_intro !== true) fail('the Renown intro did not stay seen')
    console.log(`  Renown: level ${lvl} from overflow XP, points spent and committed within the bank, a Captain's board, a respec token bought and spent once`)
  }

  // ── 3. Badges ──
  {
    const s = freshSave({ fishing_xp: XP_TABLE[99], expedition_xp: NAV_XP[99], total_perfects: 5000, highest_perfect_streak: 200 }); const db = localProgressData(s)
    s.raidClears = [{ raid_id: 'captain_krust', ms: 60_000, at: '2026-09-01' }]
    s.collection = Object.fromEntries(SPECIES.slice(0, 40).map(x => [x.id, { catch_count: 1, is_golden: null }]))
    const got = await progress.reconcileBadges(db, UID)
    if (got.length === 0 || (s.profile.unlocked_badges as string[]).length !== got.length) fail('no badges were derived from a well-played save')
    const stamped = s.profile.badge_unlocked_at as Record<string, string> | null
    if (!stamped || !got.every(id => stamped[id])) fail('derived badges were not dated')
    const again = await progress.reconcileBadges(db, UID)
    if (again.length !== got.length) fail('a second reconcile changed the set')

    const badge = BADGES.find(b => got.includes(b.id) && BADGE_REWARD[b.difficulty] > 0)!
    const d0 = Number(s.profile.doubloons), g0 = Number(s.profile.gems)
    const cl = await progress.claimBadgeReward(db, UID, badge.id)
    if (isErr(cl) || s.profile.doubloons !== d0 + BADGE_REWARD[badge.difficulty] || s.profile.gems !== g0 + BADGE_GEM_REWARD[badge.difficulty]) fail('a badge reward did not pay both currencies')
    const twice = await progress.claimBadgeReward(db, UID, badge.id)
    if (isErr(twice) || (twice as { amount: number }).amount !== 0 || s.profile.doubloons !== d0 + BADGE_REWARD[badge.difficulty]) fail('a badge reward paid twice')
    const locked = BADGES.find(b => !got.includes(b.id) && BADGE_REWARD[b.difficulty] > 0)!
    if (!isErr(await progress.claimBadgeReward(db, UID, locked.id))) fail('a locked badge paid')
    const all = await progress.claimAllBadgeRewards(db, UID)
    const unclaimed = got.filter(id => id !== badge.id && BADGE_REWARD[BADGES.find(b => b.id === id)!.difficulty] > 0)
    if (isErr(all) || (all as { count: number }).count !== got.length - 1 || !unclaimed.every(id => (s.profile.claimed_badge_rewards as string[]).includes(id))) fail('claim-all did not claim the rest')

    if (isErr(await progress.unlockBadge(db, UID, 'not_a_shot_fired')) || !(s.profile.unlocked_badges as string[]).includes('not_a_shot_fired')) fail('a raid feat was not unlocked')
    if (!isErr(await progress.unlockBadge(db, UID, locked.id))) fail('the client unlocked a badge it may not')
    if (isErr(await progress.equipBadge(db, UID, badge.id, 1)) || (s.profile.equipped_badges as string[])[1] !== badge.id) fail('a badge was not worn')
    await progress.equipBadge(db, UID, badge.id, 0)
    if ((s.profile.equipped_badges as string[])[1] !== '' || (s.profile.equipped_badges as string[])[0] !== badge.id) fail('a badge was worn in two slots')
    if (!isErr(await progress.equipBadge(db, UID, badge.id, 7 as never))) fail('a badge went in a slot that does not exist')
    if (!isErr(await progress.equipBadge(db, UID, locked.id, 2))) fail('a locked badge was worn')
    await progress.unequipBadge(db, UID, 0)
    if ((s.profile.equipped_badges as string[])[0] !== '') fail('a badge did not come off')
    console.log(`  badges: ${got.length} derived from the save and dated, rewards paid once and only when unlocked, raid feats only, worn in one real slot`)
  }

  // ── 4. The unlock banner ──
  {
    const s = freshSave({ fishing_xp: XP_TABLE[9] }); const db = localProgressData(s)
    const first = await progress.checkUnlocks(db, UID)
    if (!Array.isArray(s.profile.seen_unlocks)) fail('the first check did not seed what has been announced')
    s.profile.fishing_xp = XP_TABLE[99]; s.profile.expedition_xp = NAV_XP[99]
    const news = await progress.checkUnlocks(db, UID)
    const again = await progress.checkUnlocks(db, UID)
    if (!news.length || again.length) fail(`an earned gate was not news exactly once (${first.length}, ${news.length}, ${again.length})`)
    if (news.some(n => n.cat === 'skin' && !(s.profile.unlocked_character_colors as string[]).includes(n.id))) fail('an earned skin was announced but not stored')
    console.log(`  the unlock banner: seeded on the first check, ${news.length} newly earned cosmetics announced once and stored`)
  }

  // ── 5. The welcome and the daily pack ──
  {
    const s = freshSave({ gems: 0 }); const db = localProgressData(s)
    const w1 = await progress.claimWelcomePack(db, UID), w2 = await progress.claimWelcomePack(db, UID)
    if (!w1.ok || w2.ok || s.profile.gems !== 100) fail('the welcome gift did not pay exactly once')
    await progress.markSetupSeen(db, UID)
    if (s.profile.has_seen_setup !== true) fail('setup did not stay seen')
    if ((await progress.claimDailyPack(db, UID)).claimed) fail('a deckhand got the member\'s pack')
    const m = freshSave({ gems: 0, is_premium: true }); const mdb = localProgressData(m)
    const p1 = await progress.claimDailyPack(mdb, UID), p2 = await progress.claimDailyPack(mdb, UID)
    now += DAY
    const p3 = await progress.claimDailyPack(mdb, UID)
    if (!p1.claimed || p2.claimed || !p3.claimed || m.profile.gems !== 200) fail('the daily pack did not pay once a day')
    console.log('  the welcome gift once, the member\'s pack once a day')
  }

  // ── 6. The homestead ──
  {
    now = T0
    const s = freshSave({ unlocked_badges: ['first_catch', 'landfall'] }); const db = localProgressData(s)
    if (JSON.stringify(await homestead.getHomestead(db, UID)) !== JSON.stringify(EMPTY_HOMESTEAD)) fail('a captain with no homestead did not read the empty one')
    const poor = freshSave({ doubloons: 0 })
    if ((await homestead.build(localProgressData(poor), UID)).ok) fail('the house was built on credit')
    let spent = 0
    for (let t = 1; t < HOUSE.length; t++) {
      const d = Number(s.profile.doubloons)
      const r = await homestead.build(db, UID)
      if (!r.ok || Number(s.homestead?.house) !== t || s.profile.doubloons !== d - HOUSE[t].cost) { fail(`the house did not climb to ${HOUSE[t].name} for its price`); break }
      spent += HOUSE[t].cost
    }
    if ((await homestead.build(db, UID)).ok) fail('the house climbed past the Estate')
    // Furniture: a bought piece, back again for free, salvage refused.
    const home = await homestead.getHomestead(db, UID)
    const slot = openSlots(home)[0]
    const [pieceA, pieceB] = Object.entries(FURNISHING_BY_ID).filter(([, v]) => v.slot === slot && v.item.cost > 0 && !v.item.found).map(([id]) => id)
    if (pieceA && pieceB) {
      const d0 = Number(s.profile.doubloons)
      const f1 = await homestead.furnish(db, UID, pieceA)
      if (!f1.ok || s.profile.doubloons !== d0 - FURNISHING_BY_ID[pieceA].item.cost) fail('a piece did not sell for its price')
      await homestead.furnish(db, UID, pieceB)
      const d1 = Number(s.profile.doubloons)
      const back = await homestead.furnish(db, UID, pieceA)
      if (!back.ok || s.profile.doubloons !== d1) fail('putting back an owned piece was charged')
      if ((await homestead.furnish(db, UID, pieceA)).ok) fail('a piece already in its slot was placed again')
    }
    const salvage = Object.entries(FURNISHING_BY_ID).find(([, v]) => v.item.found)
    if (salvage && (await homestead.furnish(db, UID, salvage[0])).ok) fail('salvage was bought')
    const small = freshSave(); const sdb = localProgressData(small)
    const shut = Object.entries(FURNISHING_BY_ID).find(([, v]) => !openSlots(EMPTY_HOMESTEAD).includes(v.slot) && !v.item.found)
    if (shut && (await homestead.furnish(sdb, UID, shut[0])).ok) fail('a piece went into a room not yet built')
    if (!(await homestead.renameHomestead(db, UID, '  The   Rookery ')).ok || s.homestead?.name !== 'The Rookery') fail('the island was not named (tidied)')
    if ((await homestead.renameHomestead(db, UID, '<b>x</b>')).ok || (await homestead.renameHomestead(db, UID, 'x')).ok) fail('a bad name was taken')
    if (!(await homestead.renameHomestead(db, UID, '')).ok || s.homestead?.name !== null) fail('an empty box did not go back to the default')
    const pin = await homestead.pinBadges(db, UID, ['first_catch', 'not_earned', 'landfall', 'first_catch'])
    if (!pin.ok || JSON.stringify(s.homestead?.pinned) !== '["first_catch","landfall"]') fail('pinning kept a badge not earned (or a duplicate)')
    if ((await homestead.pinBadges(sdb, UID, ['first_catch'])).ok) fail('badges were pinned with no gallery')
    console.log(`  the homestead: ${HOUSE.length - 1} rungs for ${spent.toLocaleString()}, furniture only where a room is open, salvage never sold, owned pieces free, names, pins (gallery at house ${ROOM_BY_ID.gallery.needsHouse})`)
  }

  // ── 7. The profile ──
  {
    const s = freshSave(); const db = localProgressData(s)
    if (!isErr(await profile.updateUsername(db, UID, 'no'))) fail('a short username was taken')
    if (!(await profile.checkUsername(db, 'good_name')).available || (await profile.checkUsername(db, 'x!')).available) fail('the checker read names wrong')
    if (isErr(await profile.updateUsername(db, UID, 'Sea_Dog')) || s.profile.username !== 'sea_dog') fail('a good username was not taken (lower-cased)')
    if (!isErr(await profile.updateUsername(db, UID, 'another_name'))) fail('the username changed twice')
    if ((await profile.searchUsers(db, 'se')).length) fail('an offline search found somebody')

    const buyable = CHARACTER_COLORS.find(c => c.price && !c.gemPrice)
    if (buyable) {
      const d0 = Number(s.profile.doubloons)
      const b = await profile.purchaseCharacterColor(db, UID, buyable.id)
      if (isErr(b) || s.profile.doubloons !== d0 - buyable.price! || !(s.profile.unlocked_character_colors as string[]).includes(buyable.id)) fail('a skin did not sell for its price')
      if (!isErr(await profile.purchaseCharacterColor(db, UID, buyable.id))) fail('a skin sold twice')
      if (isErr(await profile.updateCharacterColor(db, UID, buyable.id)) || s.profile.character_color !== buyable.id) fail('a bought skin was not worn')
    }
    const lockedSkin = CHARACTER_COLORS.find(c => !c.free && !c.price && !c.gemPrice && c.gate)
    if (lockedSkin && !isErr(await profile.updateCharacterColor(db, UID, lockedSkin.id)) && !(s.profile.unlocked_character_colors as string[]).includes(lockedSkin.id)) fail('a locked skin was worn')
    // Self-heal: a level-earned skin not yet stored is allowed and stored.
    const vet = freshSave({ fishing_xp: XP_TABLE[99], expedition_xp: NAV_XP[99] }); const vdb = localProgressData(vet)
    const healed = await profile.persistEarnedSkins(vdb, UID, CHARACTER_COLORS.map(c => c.id))
    if (!healed.granted.length || !healed.granted.every(id => (vet.profile.unlocked_character_colors as string[]).includes(id))) fail('earned skins were not stored')

    const special = AVATAR_SPECIALS.find(x => !x.gate && x.gemPrice)
    if (special) {
      if (!isErr(await profile.purchaseAvatarSpecial(db, UID, special.id))) fail('a special sold to a deckhand')
      const cap = freshSave({ is_premium: true }); const cdb = localProgressData(cap)
      const g0 = Number(cap.profile.gems)
      const sp = await profile.purchaseAvatarSpecial(cdb, UID, special.id)
      if (isErr(sp) || cap.profile.gems !== g0 - special.gemPrice! || !isErr(await profile.purchaseAvatarSpecial(cdb, UID, special.id))) fail('a special did not sell once for its gems')
    }
    await profile.updateAvatarColors(db, UID, { bgColor: 'not-a-colour', borderColor: null })
    if (s.profile.avatar_bg_color !== null) fail('an unknown avatar colour was kept')
    const deepBg = PROFILE_BACKGROUNDS.find(b => b.minLevel > 20)
    if (deepBg && !isErr(await profile.updateProfileBg(db, UID, deepBg.id))) fail('a background was set under its level')
    // The showcase keeps only living crew.
    s.crew = [
      { id: 1, card_id: 1, rarity: 1, power: 1, dodge: 1, fortune: 1, effects: [], pending_trait: null, voyage_slot: null, raid_slot: null, xp: 0, nickname: null, recruited_at: '', died_at: null, died_on_voyage_id: null, died_hardcore_depth: null },
      { id: 2, card_id: 2, rarity: 1, power: 1, dodge: 1, fortune: 1, effects: [], pending_trait: null, voyage_slot: null, raid_slot: null, xp: 0, nickname: null, recruited_at: '', died_at: '2026-09-01', died_on_voyage_id: 1, died_hardcore_depth: null },
    ]
    await profile.updateShowcaseCrew(db, UID, [1, 2, 99, 1])
    if (JSON.stringify(s.profile.showcase_crew_ids) !== '[1]') fail('the showcase kept the fallen or a stranger')
    console.log('  the profile: the username once and clean, skins bought, worn and self-healed, Captain specials gated, the showcase only the living')
  }

  // ── 9. The Almanac ──
  {
    const s = freshSave(); const db = localFishingData(s)
    const zone = 'shallows'
    const ids = SPECIES.filter(f => f.habitat === zone).map(f => f.id)
    if (!isErr(await fishing.claimZoneReward(db, UID, zone))) fail('an unfinished zone paid')
    for (const id of ids) s.collection[id] = { catch_count: 1, is_golden: id === ids[0] }
    if (!isErr(await fishing.prestigeZone(db, UID, zone))) fail('a zone prestiged before its reward was claimed')
    const d0 = Number(s.profile.doubloons)
    const paid = await fishing.claimZoneReward(db, UID, zone)
    if (isErr(paid) || s.profile.doubloons !== d0 + zoneRewardDoubloons(zone, 0)) fail('a finished zone did not pay its reward')
    if (!isErr(await fishing.claimZoneReward(db, UID, zone)) || s.profile.doubloons !== d0 + zoneRewardDoubloons(zone, 0)) fail('a zone reward paid twice')
    const p = await fishing.prestigeZone(db, UID, zone)
    if (isErr(p) || (p as { prestigeLevel: number }).prestigeLevel !== 1 || (s.profile.prestige_levels as Record<string, number>)[zone] !== 1) fail('a prestige did not count')
    if (Object.keys(s.collection).map(Number).join() !== String(ids[0])) fail('the prestige did not clear the log down to the goldens')
    if (s.profile.zone_shallows_rewarded !== false) fail('the prestige did not reopen the reward')
    if (!isErr(await fishing.prestigeZone(db, UID, zone))) fail('a zone prestiged twice on one completion')
    if (!isErr(await fishing.prestigeZone(db, UID, 'ancient_deep'))) fail('the Ancient Deep prestiged')
    if (!isErr(await fishing.claimZoneReward(db, UID, 'nowhere'))) fail('a made-up zone paid')

    // The Long Vigil.
    const giant = 144
    s.profile.ancient_catches = [giant]; s.profile.ancient_vigil = null
    if (!isErr(await fishing.releaseAncient(db, UID, giant))) fail('a giant was released before the finale')
    s.clears.push('the_sunken_hand')
    if (!isErr(await fishing.releaseAncient(db, UID, 1))) fail('a common fish was released as a giant')
    if (!isErr(await fishing.releaseAncient(db, UID, 145))) fail('a giant never landed was released')
    const rel = await fishing.releaseAncient(db, UID, giant)
    if (isErr(rel) || !(s.profile.ancient_vigil as Record<string, { released: boolean }>)[String(giant)]?.released) fail('a landed giant was not released')
    if (!isErr(await fishing.releaseAncient(db, UID, giant))) fail('a giant was released twice')
    if (!(s.profile.ancient_catches as number[]).includes(giant)) fail('a release took the giant off the count for the finale')
    console.log('  the Almanac: a zone paid once when finished, prestiged once after it with the goldens kept, the Deep never; a giant released once, after the finale')
  }

  // ── 8. The store's own guards ──
  {
    const s = freshSave({ unlocked_badges: [BADGES[0].id] }); const db = localProgressData(s)
    const a = await db.claimBadgeReward(UID, BADGES[0].id, 10, 1), b = await db.claimBadgeReward(UID, BADGES[0].id, 10, 1)
    if (!a?.granted || b?.granted) fail('a badge reward was claimed twice by the store')
    await db.ensureHomestead(UID)
    if (!(await db.buildHouse(UID, 0, 1, '')) || await db.buildHouse(UID, 0, 1, '')) fail('the house was raised twice from one rung')
    console.log('  the store: a reward claimed once, the house raised once from a rung')
  }
} finally {
  installRng(null); installClock(null)
}

console.log(`\n  Offline progression: no server on the path, Renown, badges, the unlock banner, the welcome and the pack, the homestead, the profile, the Almanac ${failed ? `${failed} FAILED` : 'ok'}.`)
process.exit(failed ? 1 : 0)
