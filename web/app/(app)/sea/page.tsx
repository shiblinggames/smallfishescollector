// THE OCEAN HUB — admin only.
//
// The ocean IS the hub: a painted chart you sail across, with the Mainland
// (tavern, market, shops) as one stop on it rather than the front door. Ports
// you go ashore at, waters you fish. See chart.ts for the layout and SeaMap.tsx
// for why it is painted 2D rather than an engine.
//
// ADMIN ONLY while it finds its feet, the same way Chapter 4 shipped. It is not
// the landing page yet and should not become one until it has been lived with.

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { getEffectiveRod } from '@/lib/rods'
import { getLine } from '@/lib/lines'
import { getReel } from '@/lib/reels'
import { getHook } from '@/lib/hooks'
import { PETS } from '@/lib/pets'
import { getBait } from '@/lib/bait'
import { getLevelFromXP } from '@/lib/fishingLevel'
import SeaMap from './SeaMap'
import { dealtToday } from './traderActions'
import { gauntletAutoCatchMaxRarity } from '@/lib/gauntletUpgrades'

export const metadata = { title: 'The Sea' }

export default async function SeaPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  if (profile?.is_admin !== true) redirect('/tavern')

  // EVERYTHING THE DIAL NEEDS TO BE THE REAL DIAL. buildFishZones takes the
  // same modifiers on the map as it does on the fishing screen, because a fish
  // must not be easier or harder depending on which surface you cast from.
  const rod = getEffectiveRod(
    Number(profile?.rod_tier ?? 0),
    (profile?.completionist_effects as number[] | null) ?? null,
  )
  const line = getLine(Number(profile?.line_tier ?? 0))

  // Bait: whatever they have most of, which is almost always what they would
  // have picked anyway. Choosing it properly is the full screen's job.
  const admin = createAdminClient()
  const { data: baitRows } = await admin
    .from('bait_inventory').select('bait_type, quantity').eq('user_id', user.id)
  const best = ((baitRows ?? []) as { bait_type: string; quantity: number }[])
    .filter(b => b.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity)[0]
  const baitType = best?.bait_type ?? 'worm'

  // Read on the server so the day's deal count survives a page reload — a cap
  // the client remembers is not a cap.
  const dealt = await dealtToday()

  // ── THE SPECIALS THE CLIENT DRIVES ────────────────────────────────────
  // Phantom Hook, Perfected Sigil and the Primeval Eye need nothing here: the
  // server reads them off the profile inside castLine and reelIn, so they have
  // been applying out here all along. These three are behaviour rather than
  // effect, so they have to be carried.
  const equippedSpecial = (profile?.equipped_special as string | null) ?? null
  const hasCatcher = profile?.has_auto_catcher === true
  const hasCaster = profile?.has_auto_caster === true
  const autoTier: 0 | 1 | 2 =
    (equippedSpecial === 'auto_catcher' && hasCatcher) ? 2
      : (equippedSpecial === 'auto_caster' && hasCaster) ? 1
        : 0

  const todayStr = new Date().toISOString().slice(0, 10)
  const ttUsed = profile?.tide_turner_date === todayStr ? Number(profile?.tide_turner_used ?? 0) : 0

  const equippedPet = (profile?.equipped_pet as string | null) ?? null
  const pet = PETS.find(p => p.id === equippedPet) ?? null

  return (
    <SeaMap
      fishingXP={Number(profile?.fishing_xp ?? 0)}
      characterColor={(profile?.character_color as string | null) ?? 'default'}
      boatId={(profile?.equipped_boat as string | null) ?? null}
      hatId={(profile?.equipped_hat as string | null) ?? null}
      // THE WHOLE RIG. You are fishing here, so what is in your hands should be
      // what you actually own — the same rod, reel and hook the fishing screen
      // draws, at the same overlay coordinates.
      gear={{
        // RODS COME IN TWO FLAVOURS and I only handled one, which is why the
        // Lightsaber never appeared. A `slug` rod has three per-frame files
        // (rod_lightsaber_rest/wait/cast.png); an `imageUrl` rod has a single
        // image reused across frames. Every high tier is a slug rod, so the
        // players most likely to notice were the only ones seeing nothing.
        rodSlug: rod.slug ?? null,
        rod: rod.imageUrl ?? null,
        rodGlow: rod.glow ? (rod.glowType ?? 'default') : null,
        rodColor: rod.color ?? null,
        reel: getReel(Number(profile?.reel_tier ?? 0)).imageUrl ?? null,
        hook: getHook(Number(profile?.hook_tier ?? 0)).imageUrl ?? null,
        pet: pet?.species ?? null,
        petArt: pet?.restImageUrl ?? null,
      }}
      bait={baitType}
      baitBonus={getBait(baitType).catchZoneBonus}
      baitQty={best?.quantity ?? 0}
      dealtToday={dealt}
      auto={{
        tier: autoTier,
        maxRarity: gauntletAutoCatchMaxRarity(profile?.gauntlet_upgrades as string[] | null),
      }}
      tideTurner={{
        has: profile?.has_tide_turner === true,
        // 3/day, matching useTideTurnerSkip's own guard. The date string is
        // built the same way the server builds it (UTC ISO date), or the count
        // shown here would disagree with the one enforced there.
        left: Math.max(0, 3 - ttUsed),
      }}
      mods={{
        // The reel's needle-speed multiplier. Without it every reel tier was
        // identical out here and the dial ran at a flat speed for every fish.
        reelSpeedMult: getReel(Number(profile?.reel_tier ?? 0)).needleSpeedMultiplier,
        hookTier: Number(profile?.hook_tier ?? 0),
        linePenalty: line.penaltyMultiplier,
        rodCatchBonus: rod.catchZoneBonus ?? 0,
        // Three rod effects the fishing screen implements CLIENT-side, which is
        // why the map silently did not have them.
        rodRetryOnMiss: rod.retryOnMissChance ?? 0,
        rodSnagImmune: rod.snagImmune === true,
        rodPerfectXpMult: rod.perfectXpMult ?? 1,
        rodPerfectBonus: rod.perfectZoneBonus ?? 0,
        fishingLevel: getLevelFromXP(Number(profile?.fishing_xp ?? 0)),
      }}
    />
  )
}
