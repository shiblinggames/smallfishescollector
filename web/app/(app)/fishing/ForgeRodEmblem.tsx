'use client'

// The Completionist Rod's preview, shared by the forge panel (GearScreen) and
// the first-forge flourish (FishingGame). Now that the real 3-pose art exists,
// this shows the actual rod sprite wrapped in an emerald forge aura that
// intensifies with `power` (0..1 = how many of the 3 effects are forged in).
export default function ForgeRodEmblem({
  size = 120,
  power = 0,
  accent = '#34d399',
}: {
  size?: number
  /** 0..1 power level — drives the aura intensity + tip bloom. */
  power?: number
  /** Bloom tint — the panel passes the colour of the effect just forged so the
   *  rod flares in that colour; defaults to the forge emerald. */
  accent?: string
}) {
  const glow = 0.3 + power * 0.7
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Emerald forge aura behind the rod — grows with power. */}
      <div aria-hidden style={{
        position: 'absolute', inset: '-16%',
        background: `radial-gradient(ellipse at 50% 46%, rgba(52,211,153,${0.14 + power * 0.5}) 0%, transparent 66%)`,
        filter: 'blur(9px)', pointerEvents: 'none',
      }} />
      {/* Accent bloom — tinted by the effect just forged (panel passes accent);
          scales + brightens with power so socketing an effect reads as a surge. */}
      <div aria-hidden style={{
        position: 'absolute', width: `${40 + power * 34}%`, height: `${40 + power * 34}%`,
        borderRadius: '50%', background: `radial-gradient(circle, ${accent} 0%, transparent 62%)`,
        opacity: glow * 0.45, filter: 'blur(12px)', pointerEvents: 'none',
      }} />
      {/* The real rod sprite — breathing emerald glow via the shared class. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/rod_completionist_thumb.png"
        alt="Completionist Rod"
        className="rod-glow-forge"
        style={{ position: 'relative', width: '90%', height: '90%', objectFit: 'contain', display: 'block' }}
      />
    </div>
  )
}
