/**
 * Premium membership is now lifetime — purchases set is_premium=true and
 * premium_expires_at=null. A null expires_at means "never expires."
 *
 * Legacy 1-year buyers still have a future date in premium_expires_at;
 * they remain premium until that date passes. If it ever does, is_premium
 * stays true but this helper returns false, so the check fails closed.
 *
 * Use this helper anywhere you need to gate a feature on premium status,
 * instead of inlining the (is_premium && expires_at && expires_at > now)
 * pattern. Keeps the logic in one place if we change the rules again.
 */
export interface PremiumProfileRow {
  is_premium?: boolean | null
  premium_expires_at?: string | null
}

export function isPremiumActive(profile: PremiumProfileRow | null | undefined): boolean {
  if (!profile?.is_premium) return false
  // Null/undefined expires_at = lifetime membership.
  if (!profile.premium_expires_at) return true
  return new Date(profile.premium_expires_at) > new Date()
}
