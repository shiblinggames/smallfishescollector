// Server-side settle helper for the Man-o-War ultimate build clock.
//
// Lives in /lib (NOT a 'use server' module) so it can be shared by both server
// actions and server components without being wrapped as a client-callable action
// — it takes an admin Supabase client, which is not serializable across the action
// boundary. Any read path that surfaces the ultimate (the ship screen, raid combat
// stats) calls this to promote a matured build into the active slot on read, so no
// cron is needed (mirrors the pending-sales on-read settlement pattern).

import type { createAdminClient } from '@/lib/supabase/admin'
import { raidData } from './data/raidData'
import { parseAugmentBuild, isBuildComplete, type ShipAugmentBuild } from '@/lib/shipAugments'
import { clockNow } from './clock'

/** If the build clock has passed, promote the build id into manowar_augment (the
 *  active slot) and clear the build column. Idempotent + safe to call from any read
 *  path. Returns the post-settle active id + remaining build (null once promoted). */
export async function settleUltimateBuild(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  active: string | null,
  buildRaw: unknown,
): Promise<{ active: string | null; build: ShipAugmentBuild | null }> {
  return settleUltimateBuildVia(raidData(admin), userId, active, buildRaw)
}

/** settleUltimateBuild against any store that can write the profile. */
export async function settleUltimateBuildVia(
  db: { updateProfile(uid: string, patch: Record<string, unknown>): Promise<void> },
  userId: string,
  active: string | null,
  buildRaw: unknown,
): Promise<{ active: string | null; build: ShipAugmentBuild | null }> {
  const build = parseAugmentBuild(buildRaw)
  if (!build) return { active, build: null }
  if (!isBuildComplete(build, clockNow())) return { active, build }
  await db.updateProfile(userId, { manowar_augment: build.id, manowar_augment_build: null })
  return { active: build.id, build: null }
}
