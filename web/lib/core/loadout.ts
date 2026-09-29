// ── THE CAPTAIN'S LOADOUT, CORE (Steam prep, step 8, 2026-09-28) ──
//
// Boats, bandanas, pets, the special slot, the Completionist forge and the two
// fishing preferences, with nothing of the web in them. Moved out of
// fishing/actions like the cast: the session read became `uid`, and the wallet
// and owned-list helpers became store operations (db.spend, db.grant,
// db.addToList). The web-only part, telling Next the cached chart changed
// (revalidatePath), stays in the actions.

import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import { getRod, COMPLETIONIST_TIER, COMPLETIONIST_MAX_EFFECTS, REFORGE_COST, rodHasUniqueEffect } from '@/lib/rods'
import { getSpecialItem, SPECIAL_OWNED_COLUMN } from '@/lib/specialItems'
import { getPet, petSlot, PET_SLOT_COLUMN } from '@/lib/pets'
import { BOAT_MAP } from '@/lib/boats'
import { HAT_MAP } from '@/lib/hats'
import { gateMet } from '@/lib/cosmeticGates'
import type { FishingData } from '@/lib/data/fishingData'

/**
 * REMEMBER WHETHER THE MACHINE IS RUNNING.
 *
 * The auto toggle was client state seeded to `true`, so every time the rod came
 * out the Auto Caster started casting and had to be switched off again. A
 * toggle that forgets is a toggle you operate twice.
 */
export async function setAutoFishing(db: FishingData, uid: string, value: boolean): Promise<void> {
  await db.updateProfile(uid, { auto_fishing_on: value })
}

/** Toggle for the cast→bite count-up shown in the waiting pill. */
export async function setShowWaitTimer(db: FishingData, uid: string, value: boolean): Promise<void> {
  await db.updateProfile(uid, { show_wait_timer: value })
}

export async function buySpecialItem(db: FishingData, uid: string, itemId: string): Promise<{ ok: true } | { error: string }> {
  const columnMap: Record<string, string> = {
    auto_caster: 'has_auto_caster',
    auto_catcher: 'has_auto_catcher',
  }
  const column = columnMap[itemId]
  if (!column) return { error: 'Unknown item' }

  const def = getSpecialItem(itemId)
  // For sale if it has a price in either currency.
  const usesFathoms = typeof def?.costFathoms === 'number'
  if (!def || (!def.shopCost && !usesFathoms)) return { error: 'Not for sale' }

  const profile = await db.profile(uid, 'doubloons, gauntlet_fathoms, has_auto_caster, has_auto_catcher, gauntlet_deepest')
  if (!profile) return { error: 'Profile not found' }
  const owned: Record<string, boolean> = {
    has_auto_caster: !!profile.has_auto_caster,
    has_auto_catcher: !!profile.has_auto_catcher,
  }
  if (owned[column]) return { error: 'Already owned' }
  // Prerequisite item (e.g. Auto Catcher needs the Auto Caster first).
  if (def.requiresItem && !owned[columnMap[def.requiresItem]]) {
    return { error: 'Requires the Auto Caster first' }
  }
  // Gauntlet-depth unlock gate.
  if (def.requiresGauntletDepth && ((profile.gauntlet_deepest as number | null) ?? 0) < def.requiresGauntletDepth) {
    return { error: `Reach depth ${def.requiresGauntletDepth} in Davy Jones' Gauntlet first` }
  }

  // Spend first, in place; the result is the guard. Then flip the item on only
  // where it is still off, and give the charge back if a concurrent twin
  // already flipped it.
  const col = usesFathoms ? 'gauntlet_fathoms' : 'doubloons'
  const cost = usesFathoms ? def.costFathoms! : def.shopCost!
  const after = await db.spend(uid, col, cost)
  if (after === null) return { error: usesFathoms ? 'Not enough Fathoms' : 'Not enough doubloons' }
  if (!(await db.flagOn(uid, column))) {
    await db.grant(uid, col, cost)
    return { error: 'Already owned' }
  }
  return { ok: true }
}

export async function equipSpecialItem(db: FishingData, uid: string, itemId: string | null): Promise<{ ok: true } | { error: string }> {
  // This wrote whatever it was handed. No ownership check, no slot check: the
  // only thing standing between a crafted request and The Primeval Eye seated
  // in slot one was that the button did not exist. Hiding the row fixes the
  // spoiler; it does not fix the hole behind it.
  if (itemId !== null) {
    const def = getSpecialItem(itemId)
    if (!def) return { error: 'No such item' }
    // The Sunken Hand's spoils fit the SECOND slot and nothing else. Seating one
    // here would hand a finale reward to anyone who never sailed the coda.
    if (def.finaleSlotOnly) return { error: 'That one does not fit this slot' }
    const profile = await db.profile(uid, SPECIAL_OWNED_COLUMN[def.id])
    if ((profile as Record<string, unknown> | null)?.[SPECIAL_OWNED_COLUMN[def.id]] !== true) {
      return { error: 'You do not own that' }
    }
  }
  await db.updateProfile(uid, { equipped_special: itemId })
  return { ok: true }
}

export async function equipBoat(db: FishingData, uid: string, boatId: string | null): Promise<{ ok: true } | { error: string }> {
  if (boatId !== null) {
    const profile = await db.profile(uid, 'unlocked_boats, fishing_xp, expedition_xp')
    let unlocked = (profile?.unlocked_boats as string[] | null) ?? []
    if (!unlocked.includes(boatId)) {
      // Self-heal an EARNED boat the player hasn't stored yet (a level or an
      // achievement gate, mirrors updateCharacterColor). Anything else is
      // genuinely locked.
      const def = BOAT_MAP[boatId]
      if (def?.gate) {
        const ap = def.gate.kind === 'ap' ? await db.achievementPoints(uid) : null
        if (gateMet(def.gate, {
          fishingLevel: getLevelFromXP(Number(profile?.fishing_xp ?? 0)),
          navLevel: navLevelFromXP(Number(profile?.expedition_xp ?? 0)),
          ap,
        })) {
          await db.addToList(uid, 'unlocked_boats', boatId)
          unlocked = [...unlocked, boatId]
        }
      }
      if (!unlocked.includes(boatId)) return { error: 'Boat not unlocked' }
    }
  }
  await db.updateProfile(uid, { equipped_boat: boatId })
  return { ok: true }
}

export async function buyBoat(db: FishingData, uid: string, boatId: string): Promise<{ ok: true; doubloons?: number; gems?: number } | { error: string }> {
  const def = BOAT_MAP[boatId]
  if (!def) return { error: 'Unknown boat' }
  if (def.crateOnly) return { error: 'This boat is only found in crates' }
  if (def.gate) return { error: 'This boat is earned, not bought' }

  const useGems = typeof def.gemPrice === 'number' && def.gemPrice > 0
  const price = useGems ? def.gemPrice! : def.cost
  const profile = await db.profile(uid, 'doubloons, gems, unlocked_boats')
  if (!profile) return { error: 'Profile not found' }
  const unlocked = (profile.unlocked_boats as string[] | null) ?? []
  if (unlocked.includes(boatId)) return { error: 'Already owned' }
  // Spend first, in place; the result is the guard. Then add the boat once,
  // and give the charge back if a concurrent twin already added it.
  const col = useGems ? 'gems' : 'doubloons'
  const newBalance = await db.spend(uid, col, price)
  if (newBalance === null) return { error: useGems ? 'Not enough gems' : 'Not enough doubloons' }
  if (!(await db.addToList(uid, 'unlocked_boats', boatId))) {
    await db.grant(uid, col, price)
    return { error: 'Already owned' }
  }

  await db.updateProfile(uid, { equipped_boat: boatId })
  await db.ledger(uid, -price, `Bought ${def.name} boat`, useGems ? 'gems' : 'doubloons')
  return useGems ? { ok: true, gems: newBalance } : { ok: true, doubloons: newBalance }
}

export async function equipHat(db: FishingData, uid: string, hatId: string | null): Promise<{ ok: true } | { error: string }> {
  if (hatId !== null) {
    const profile = await db.profile(uid, 'unlocked_hats')
    const unlocked = (profile?.unlocked_hats as string[] | null) ?? []
    if (!unlocked.includes(hatId)) return { error: 'Hat not unlocked' }
  }
  await db.updateProfile(uid, { equipped_hat: hatId })
  return { ok: true }
}

/** Equip / unequip a pet. Ownership is checked against unlocked_pets, so a
 *  crafted id cannot seat a pet you never found.
 *
 *  TWO SLOTS, routed by the PET, not by the caller. Stern pets (everything
 *  that faces the back of the boat) go in equipped_pet; front-facing pets go
 *  in equipped_pet_bow. The client never names a slot — it passes an id and
 *  the pet's own `bow` flag decides — so the two can never end up holding
 *  each other's kind, and a future front-facing pet needs no changes here.
 *
 *  Unequip (null) needs a slot, since there is nothing to read a flag off:
 *  `slot` defaults to stern, which is every pet that existed before the bow. */
export async function equipPet(db: FishingData, uid: string, petId: string | null, slot: 'stern' | 'bow' = 'stern'): Promise<{ ok: true } | { error: string }> {
  let column: string = PET_SLOT_COLUMN[slot]
  if (petId !== null) {
    const profile = await db.profile(uid, 'unlocked_pets')
    const unlocked = (profile?.unlocked_pets as string[] | null) ?? []
    if (!unlocked.includes(petId)) return { error: 'Pet not unlocked' }
    const def = getPet(petId)
    if (!def) return { error: 'No such pet' }
    // The pet picks its own slot. A bow pet seated in the stern column would
    // draw two pets back to back in the same spot.
    const own = petSlot(def)
    if (!own) return { error: 'No such pet' }
    column = PET_SLOT_COLUMN[own]
  }
  await db.updateProfile(uid, { [column]: petId })
  return { ok: true }
}

export async function buyHat(db: FishingData, uid: string, hatId: string): Promise<{ ok: true; doubloons: number } | { error: string }> {
  const def = HAT_MAP[hatId]
  if (!def) return { error: 'Unknown hat' }
  if (def.crateOnly) return { error: 'This hat is only found in crates' }

  const profile = await db.profile(uid, 'doubloons, unlocked_hats')
  if (!profile) return { error: 'Profile not found' }
  const unlocked = (profile.unlocked_hats as string[] | null) ?? []
  if (unlocked.includes(hatId)) return { error: 'Already owned' }
  // Spend first, in place; the result is the guard. Then add the hat once,
  // and give the charge back if a concurrent twin already added it.
  const newDoubloons = await db.spend(uid, 'doubloons', def.cost)
  if (newDoubloons === null) return { error: 'Not enough doubloons' }
  if (!(await db.addToList(uid, 'unlocked_hats', hatId))) {
    await db.grant(uid, 'doubloons', def.cost)
    return { error: 'Already owned' }
  }
  await db.updateProfile(uid, { equipped_hat: hatId })
  await db.ledger(uid, -def.cost, `Bought ${def.name} bandana`)
  return { ok: true, doubloons: newDoubloons }
}

// ── Completionist Rod forge ───────────────────────────────────────────────────
// Set which (up to 3) owned rods' unique effects are folded into the
// Completionist. Reconfigurable, non-destructive — the donor rods stay in the
// inventory. Server-validated so a tampered client can't inject effects from
// rods it doesn't own or that have no unique effect. The resolved stats are
// derived from this on every cast/reel via getEffectiveRod, so this is the
// single source the gameplay paths trust.
export async function setCompletionistEffects(
  db: FishingData,
  uid: string,
  tiers: number[],
): Promise<{ completionistEffects: number[]; firstForge: boolean; charged: boolean; newDoubloons: number } | { error: string }> {
  const [ownedTiers, prof] = await Promise.all([
    db.rodTiers(uid),
    db.profile(uid, 'has_seen_forge_flourish, completionist_effects, doubloons, unlocked_badges'),
  ])
  const owned = new Set(ownedTiers)
  if (!owned.has(COMPLETIONIST_TIER)) return { error: "You haven't earned the Completionist Rod yet." }

  // Dedupe, drop the Completionist itself, validate ownership + that each rod
  // actually has an effect, then cap at the slot limit.
  const clean: number[] = []
  for (const t of Array.from(new Set((tiers ?? []).filter(t => Number.isInteger(t))))) {
    if (clean.length >= COMPLETIONIST_MAX_EFFECTS) break
    if (t === COMPLETIONIST_TIER) continue
    if (!owned.has(t)) return { error: 'You can only forge in rods you own.' }
    if (!rodHasUniqueEffect(getRod(t))) return { error: 'That rod has no unique effect to forge.' }
    clean.push(t)
  }

  const doubloons = prof?.doubloons ?? 0
  const current = (prof?.completionist_effects as number[] | null) ?? []
  const currentSet = new Set(current)
  const changed = clean.length !== current.length || clean.some(t => !currentSet.has(t))
  // First-forge flourish fires the first time an actual effect lands (not on an
  // empty loadout / clear). One-time via the has_seen_forge_flourish flag.
  const firstForge = clean.length > 0 && !prof?.has_seen_forge_flourish
  // Charge for a re-forge: a real change to a non-empty loadout AFTER the free
  // first forge. Using the flag (not "is current empty") stops a clear-then-
  // rebuild from dodging the fee.
  const mustPay = changed && clean.length > 0 && !!prof?.has_seen_forge_flourish
  // The fee comes off in place, and the result is the guard.
  let newDoubloons = doubloons
  if (mustPay) {
    const after = await db.spend(uid, 'doubloons', REFORGE_COST)
    if (after === null) return { error: `Re-forging costs ${REFORGE_COST.toLocaleString()} doubloons.` }
    newDoubloons = after
  }
  const update: Record<string, unknown> = { completionist_effects: clean }
  if (firstForge) update.has_seen_forge_flourish = true

  await db.updateProfile(uid, update)

  // "Reforged" badge — pay the re-forge fee to swap into a fresh FULL loadout.
  // Hook-granted (a paid re-forge isn't recoverable from the final state, which
  // just reads as 3 effects — same as a free first forge). Added in place.
  const badges = (prof?.unlocked_badges as string[] | null) ?? []
  if (mustPay && clean.length >= COMPLETIONIST_MAX_EFFECTS && !badges.includes('reforged')) {
    await db.addToList(uid, 'unlocked_badges', 'reforged')
  }
  return { completionistEffects: clean, firstForge, charged: mustPay, newDoubloons }
}
