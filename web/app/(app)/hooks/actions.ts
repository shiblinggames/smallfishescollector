'use server'

// THE HOOK BENCH. The action checks the session and hands lib/core/harbour the
// Supabase store; the price, the gate and the spend-first guard live there.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { harbourData } from '@/lib/data/harbourData'
import { buyHook as buyCore } from '@/lib/core/harbour'

export async function buyHook(): Promise<{ hookTier: number; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const res = await buyCore(harbourData(createAdminClient()), user.id)
  if (!('error' in res)) {
    revalidatePath('/hooks')
    revalidatePath('/packs')
  }
  return res
}
