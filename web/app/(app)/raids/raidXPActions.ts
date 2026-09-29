'use server'

// Pay one raid kill. THE SERVER NAMES THE PRICE: the client says only which
// round fell, the reward comes off the token's own raid, and each round pays
// once (lib/core/raids awardRaidKill).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { raidData } from '@/lib/data/raidData'
import * as core from '@/lib/core/raids'
import type { CrewXPGrant } from '@/lib/crewXPGrant'

const db = () => raidData(createAdminClient())

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function awardRaidKill(
  round: number,
  token?: string | null,
): Promise<{ newExpeditionXP: number; newDoubloonTotal: number; crewXP: CrewXPGrant[] }> {
  const uid = await me()
  return uid ? core.awardRaidKill(db(), uid, round, token) : core.NO_KILL_PAY
}
