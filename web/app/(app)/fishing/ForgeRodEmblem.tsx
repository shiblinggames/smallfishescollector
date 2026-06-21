'use client'

// The Completionist Rod has no sprite (it's a forged, one-of-a-kind thing), so
// this is its stylized emblem: a gold fishing rod whose aura + tip jewel
// intensify with `power` (0..1 = how many of the 3 effects are forged in).
// Shared by the forge panel preview (GearScreen) and the first-forge flourish
// (FishingGame) so the rod that lights up is the same in both places.
export default function ForgeRodEmblem({
  size = 120,
  power = 0,
  accent = '#f3d98a',
}: {
  size?: number
  /** 0..1 power level — drives aura + tip-jewel intensity. */
  power?: number
  /** Tip-glow colour (defaults to gold; the panel can tint it the colour of
   *  the effect just forged). */
  accent?: string
}) {
  const h = size * 0.72
  const glow = 0.3 + power * 0.7
  return (
    <div style={{ position: 'relative', width: size, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Aura bloom behind the rod — grows with power. */}
      <div aria-hidden style={{
        position: 'absolute', inset: '-22%',
        background: `radial-gradient(ellipse at 64% 28%, rgba(245,210,110,${0.12 + power * 0.45}) 0%, transparent 64%)`,
        filter: 'blur(6px)', pointerEvents: 'none',
      }} />
      <svg width={size} height={h} viewBox="0 0 120 86" fill="none" style={{ position: 'relative' }}>
        <defs>
          <linearGradient id="forgeRodGold" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#8a6322" />
            <stop offset="0.5" stopColor="#f3d98a" />
            <stop offset="1" stopColor="#fff6d8" />
          </linearGradient>
        </defs>
        {/* Cork handle */}
        <line x1="16" y1="76" x2="36" y2="62" stroke="#5e4220" strokeWidth="6.5" strokeLinecap="round" />
        {/* Shaft */}
        <line x1="30" y1="66" x2="102" y2="12" stroke="url(#forgeRodGold)" strokeWidth="3.4" strokeLinecap="round" />
        {/* Reel */}
        <circle cx="33" cy="62" r="5.5" fill="none" stroke="#caa540" strokeWidth="2.2" />
        <circle cx="33" cy="62" r="1.4" fill="#caa540" />
        {/* Line guides */}
        <circle cx="57" cy="44" r="2.4" fill="none" stroke="#e8c84a" strokeWidth="1.5" />
        <circle cx="80" cy="26" r="2.4" fill="none" stroke="#e8c84a" strokeWidth="1.5" />
        {/* Tip jewel */}
        <circle cx="102" cy="12" r={3.2 + power * 1.4} fill={accent} />
      </svg>
      {/* Tip glow — CSS bloom over the jewel, scales with power. */}
      <div aria-hidden style={{
        position: 'absolute', left: '85%', top: '14%',
        width: 10 + power * 16, height: 10 + power * 16,
        transform: 'translate(-50%,-50%)', borderRadius: '50%',
        background: accent, filter: 'blur(4px)', opacity: glow, pointerEvents: 'none',
      }} />
    </div>
  )
}
