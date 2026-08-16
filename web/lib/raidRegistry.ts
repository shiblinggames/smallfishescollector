import { isUniqueLoot } from './bossRaids'
// Every raid config, keyed by raidId.
//
// This exists so the SERVER can answer "what could this raid actually have
// dropped?". Raid combat runs entirely on the client, so the client is the one
// that rolls the crate and then tells the server what it won (see RaidGame's
// claimRaidLoot call). claimRaidLoot is a server action, which means it is a plain
// HTTP endpoint any logged-in user can POST to directly, and it used to look the
// rolled ids up in the GLOBAL ITEM_GRANTS map. Nothing tied an item to the raid it
// came from, so any raid could be told it had dropped anything.
//
// Every <RaidGame> mount in the app uses one of the configs below, so this registry
// is exhaustive by construction: a raidId that is not in here did not come from a
// real raid screen, and claimRaidLoot rejects it outright.
import {
  CORSAIRS_RECKONING, CAPTAIN_KRUST, THE_CARTOGRAPHER, THE_TOLLMASTER,
  THE_COFFERS_FLEET, THE_QUARTERMASTER, THE_QUARTERMASTERS_GHOST,
  THE_BLOCKADE, THE_THRONE, THE_SUNKEN_HAND, type BossRaidConfig,
} from './bossRaids'
import {
  CORSAIRS_RECKONING_CHALLENGE, CAPTAIN_KRUST_CHALLENGE, THE_CARTOGRAPHER_CHALLENGE,
  THE_TOLLMASTER_CHALLENGE, THE_COFFERS_FLEET_CHALLENGE, THE_QUARTERMASTER_CHALLENGE,
  THE_BLOCKADE_CHALLENGE, THE_THRONE_CHALLENGE, THE_SUNKEN_HAND_CHALLENGE,
} from './raidChallenge'

export const ALL_RAIDS: BossRaidConfig[] = [
  CORSAIRS_RECKONING, CAPTAIN_KRUST, THE_CARTOGRAPHER, THE_TOLLMASTER,
  THE_COFFERS_FLEET, THE_QUARTERMASTER, THE_QUARTERMASTERS_GHOST,
  THE_BLOCKADE, THE_THRONE, THE_SUNKEN_HAND,
  CORSAIRS_RECKONING_CHALLENGE, CAPTAIN_KRUST_CHALLENGE, THE_CARTOGRAPHER_CHALLENGE,
  THE_TOLLMASTER_CHALLENGE, THE_COFFERS_FLEET_CHALLENGE, THE_QUARTERMASTER_CHALLENGE,
  THE_BLOCKADE_CHALLENGE, THE_THRONE_CHALLENGE, THE_SUNKEN_HAND_CHALLENGE,
]

const RAID_BY_ID: Record<string, BossRaidConfig> =
  Object.fromEntries(ALL_RAIDS.map(r => [r.raidId, r]))

export function getRaidConfigById(raidId: string): BossRaidConfig | undefined {
  return RAID_BY_ID[raidId]
}

/** The ids a given raid's crate can legitimately contain. */
export function raidLootIds(raidId: string): Set<string> {
  return new Set((RAID_BY_ID[raidId]?.loot ?? []).map(l => l.id))
}

/**
 * A raid's UNIQUE ids: everything its crate can drop that is not currency.
 *
 * claimRaidLoot validates against THIS, not the full table. Crate currency
 * reaches the server as a clamped doubloon amount, never as an id, so a request
 * naming a `doubloons_*` or `gems_*` row is either a bug or someone trying to
 * mint coins by listing every currency row at once.
 */
export function raidUniqueLootIds(raidId: string): Set<string> {
  return new Set((RAID_BY_ID[raidId]?.loot ?? []).filter(isUniqueLoot).map(l => l.id))
}

/**
 * The currency half of a raid's table, which the SERVER now draws from itself.
 *
 * It used to be drawn on the client and never sent, so the reel could land on
 * "50 Gems", print it, and hand over a doubloon roll instead: gems from crates
 * silently stopped paying on 2026-08-02 when the crate split into currency plus
 * independent uniques, and nothing failed loudly because the label and the grant
 * had no connection left. Rolling it here closes that and is strictly safer than
 * accepting an id, since a forged claim cannot name a row at all.
 */
export function raidCurrencyRows(raidId: string): { id: string; weight: number }[] {
  return (RAID_BY_ID[raidId]?.loot ?? []).filter(l => !isUniqueLoot(l)).map(l => ({ id: l.id, weight: l.weight }))
}

/** Weighted draw over a raid's currency rows. Returns null for a table with no
 *  currency at all, which no shipped raid has but a future one might. */
export function rollRaidCurrency(raidId: string): string | null {
  const rows = raidCurrencyRows(raidId)
  const total = rows.reduce((s, r) => s + r.weight, 0)
  if (total <= 0) return null
  let r = Math.random() * total
  for (const row of rows) { r -= row.weight; if (r <= 0) return row.id }
  return rows[rows.length - 1].id
}

/** The most doubloons a crate can HONESTLY be worth, used to clamp the amount the
 *  client reports. The client rolls `floor(base * fortuneMult) + tideDoubloons`,
 *  where base is 300-600, fortuneMult is 1 + fortune/75 (about 2x at max crew luck),
 *  and tides can add at most +150 apiece. Tides are rolled mid-run on the client, so
 *  the server cannot RECOMPUTE the exact figure. It can bound it, which is all that
 *  matters here: a real crate tops out around 1,800, so this ceiling never rejects a
 *  legitimate claim, while stopping anyone from simply asking for a billion. */
export const MAX_CRATE_BASE_DOUBLOONS = 3000

/** The most XP / gold a SINGLE kill-grant call can honestly be worth, used to
 *  clamp what awardRaidKill / awardPracticeKill accept from the client. Raid
 *  combat is client-side, so those endpoints are plain POSTs that trusted the
 *  reported amount — a forged call could hand out any number (that's how a
 *  cheater maxed five crew at ~750k XP each in one sitting).
 *
 *  A single legit call is at most a boss kill plus the 25% full-clear bonus, and
 *  the bonus is 25% of the run's TOTAL kill XP, so no honest call can exceed the
 *  whole run's kill total by much. We take the biggest run total across every
 *  raid and add generous headroom for the bonus + any future captain multipliers.
 *  Derived from the configs so it rises automatically when a bigger raid ships. */
let _maxKillGrant: { xp: number; gold: number } | null = null
export function maxLegitKillGrant(): { xp: number; gold: number } {
  if (_maxKillGrant) return _maxKillGrant
  let xp = 0, gold = 0
  for (const r of ALL_RAIDS) {
    let rx = 0, rg = 0
    for (const k of Object.values(r.killRewards ?? {})) { rx += k.xp; rg += k.gold }
    if (rx > xp) xp = rx
    if (rg > gold) gold = rg
  }
  _maxKillGrant = { xp: Math.ceil(xp * 1.5), gold: Math.ceil(gold * 1.5) }
  return _maxKillGrant
}

// ── WHAT EACH LOOT ID ACTUALLY GRANTS ────────────────────────────────────────
// This used to live inside app/(app)/raids/actions.ts, which is a 'use server'
// module. Non-async exports get STRIPPED out of those, so it could not be exported,
// which meant nothing could ever check it against the raid loot tables. That matters
// a lot: claimRaidLoot looks every rolled id up in here and SILENTLY SKIPS anything
// missing, so a loot id with no entry shows the player a crate and gives them
// nothing. Exactly that had happened to all six Cache items.
//
// It lives here now so verify-loot.ts can prove, for every raid, that every id in
// its table grants something.
export const ITEM_GRANTS: Record<string, { doubloons?: number; gems?: number; shipSkin?: string; raidItem?: string; specialItem?: string }> = {
  doubloons_300:   { doubloons: 300 },
  doubloons_600:   { doubloons: 600 },
  doubloons_800:   { doubloons: 800 },
  doubloons_1200:  { doubloons: 1200 },
  doubloons_1500:  { doubloons: 1500 },
  gems_25:         { gems: 25 },
  gems_50:         { gems: 50 },
  // Legacy "pack" loot ids now pay gems (packs are retired): 100 gems per pack.
  pack:            { gems: 100 },
  pack_2:          { gems: 200 },
  // The Sunken Hand. A loot id with no entry here grants NOTHING, silently.
  anglers_patience:        { specialItem: 'anglers_patience' },
  borrowed_jaw:            { raidItem: 'borrowed_jaw' },
  sunken_hand_hull:        { shipSkin: 'sunken_hand_hull' },
  drowned_giant_hull:      { shipSkin: 'drowned_giant_hull' },
  last_cast_hull:          { shipSkin: 'last_cast_hull' },
  corsair_cannon:          { raidItem: 'corsair_cannon' },
  corsair_prime_cannon:    { raidItem: 'corsair_prime_cannon' },
  krusts_carapace:         { raidItem: 'krusts_carapace' },
  captains_carapace:       { raidItem: 'captains_carapace' },
  cartographers_astrolabe: { raidItem: 'cartographers_astrolabe' },
  captains_astrolabe:      { raidItem: 'captains_astrolabe' },
  spets_primer:            { raidItem: 'spets_primer' },
  tollmasters_primer:      { raidItem: 'tollmasters_primer' },
  tell_tale_glass:         { raidItem: 'tell_tale_glass' },
  admirals_eye:            { raidItem: 'admirals_eye' },
  chain_shot:              { raidItem: 'chain_shot' },
  brackwater_rack:           { raidItem: 'brackwater_rack' },
  court_fang:              { raidItem: 'court_fang' },
  dons_signet:             { raidItem: 'dons_signet' },
  war_drum:                { raidItem: 'war_drum' },
  // The six either/or Cache items. They had NO grants until now because the Cache
  // node handed them out directly and they had never been raid loot. The
  // Quartermaster's Ghost drops them, and without an entry here the roll would
  // show the player a crate and silently give them nothing.
  quartermasters_anchor:   { raidItem: 'quartermasters_anchor' },
  navigators_compass:      { raidItem: 'navigators_compass' },
  gunners_sight:           { raidItem: 'gunners_sight' },
  reinforced_hull:         { raidItem: 'reinforced_hull' },
  incendiary_cannonball:   { raidItem: 'incendiary_cannonball' },
  frozen_cannonball:       { raidItem: 'frozen_cannonball' },
  crows_nest_rigging:      { raidItem: 'crows_nest_rigging' },
  trade_wind_sails:        { raidItem: 'trade_wind_sails' },
  thunder_drum:            { raidItem: 'thunder_drum' },
  finndicate_hull:         { shipSkin:  'finndicate_hull' },
  chartmaker_hull:         { shipSkin:  'chartmaker_hull' },
  coffers_hull:            { shipSkin:  'coffers_hull' },
  last_fathom_hull:        { shipSkin:  'last_fathom_hull' },
}
