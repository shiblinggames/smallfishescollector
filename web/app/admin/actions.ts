'use server'

import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function assertAuthed() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.ADMIN_EMAIL) throw new Error('Unauthorized')
}

export async function generateTokens(
  _: unknown,
  formData: FormData
): Promise<{ results: { email: string | null; packs: number; token: string }[]; error?: string }> {
  await assertAuthed()

  const raw = (formData.get('bulk') as string ?? '').trim()
  const rows = raw.split('\n').flatMap((line) => {
    const parts = line.split(',').map((s) => s.trim())
    const email = parts.length >= 2 ? (parts[0] || null) : null
    const packsStr = parts.length >= 2 ? parts[1] : parts[0]
    const packs = parseInt(packsStr ?? '')
    if (isNaN(packs) || packs < 1) return []
    return [{ email, packs }]
  })

  if (rows.length === 0) return { results: [], error: 'No valid rows found. Format: "email, packs" or just "packs"' }

  const supabase = createAdminClient()
  const results: { email: string | null; packs: number; token: string }[] = []

  for (const row of rows) {
    const token = crypto.randomBytes(16).toString('hex')
    const { error } = await supabase.from('claim_tokens').insert({
      token,
      email: row.email,
      packs_to_grant: row.packs,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    if (error) return { results, error: `Failed on ${row.email ?? 'row'}: ${error.message}` }
    results.push({ email: row.email, packs: row.packs, token })
  }

  return { results }
}
