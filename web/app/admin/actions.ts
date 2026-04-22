'use server'

import { cookies } from 'next/headers'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'

function adminHash() {
  return crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD ?? '').digest('hex')
}

async function assertAuthed() {
  const jar = await cookies()
  if (jar.get('admin_auth')?.value !== adminHash()) throw new Error('Unauthorized')
}

export async function adminLogin(_: unknown, formData: FormData): Promise<{ ok: boolean }> {
  const password = formData.get('password') as string
  if (password !== process.env.ADMIN_PASSWORD) return { ok: false }
  const jar = await cookies()
  jar.set('admin_auth', adminHash(), {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 8,
    path: '/',
  })
  return { ok: true }
}

export async function generateTokens(
  _: unknown,
  formData: FormData
): Promise<{ results: { email: string; packs: number; token: string }[]; error?: string }> {
  await assertAuthed()

  const raw = (formData.get('bulk') as string ?? '').trim()
  const rows = raw.split('\n').flatMap((line) => {
    const [email, packsStr] = line.split(',').map((s) => s.trim())
    const packs = parseInt(packsStr ?? '')
    if (!email || isNaN(packs) || packs < 1) return []
    return [{ email, packs }]
  })

  if (rows.length === 0) return { results: [], error: 'No valid rows found. Format: email, packs' }

  const supabase = await createClient()
  const results: { email: string; packs: number; token: string }[] = []

  for (const row of rows) {
    const token = crypto.randomBytes(16).toString('hex')
    const { error } = await supabase.from('claim_tokens').insert({
      token,
      email: row.email,
      packs_to_grant: row.packs,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    if (!error) results.push({ email: row.email, packs: row.packs, token })
  }

  return { results }
}
