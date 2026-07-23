import type { createAdminClient } from './supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

/** Record a cheat/anomaly signal for later admin review (surfaced on /dev/stats).
 *
 *  ADVISORY ONLY — this never blocks, gates, or auto-acts on a request; a human
 *  reviews the flags and decides. It's awaited on the (rare) trip path so the row
 *  survives a serverless freeze after the response, and wrapped so a logging
 *  failure can never break gameplay.
 *
 *  The highest-signal use is a CAP TRIP: the reward endpoints clamp client-reported
 *  magnitudes to the legit ceiling, and a legit client can never exceed that ceiling
 *  — so a trip is a near-certain forged call. `severity`: 1 low · 2 med · 3 high. */
export async function flagAnomaly(
  admin: Admin,
  userId: string,
  kind: string,
  severity: number,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await admin.from('anomaly_flags').insert({ user_id: userId, kind, severity, detail })
  } catch {
    /* logging must never break the request it's observing */
  }
}
