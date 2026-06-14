// Themed backdrop for The Chart Room — a navigator's chart table under
// lamplight: ruled chart grid, a faint compass rose, warm glow + a dark
// vignette. Pure CSS/SVG (no art asset). Rendered as a fixed layer in
// the lobby page, painted over the inherited tavern background.

const GOLD = '#c4a96a'

export default function ChartRoomBackdrop() {
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {/* Deep chart-table base */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #0f1c24 0%, #0a1218 55%, #060b10 100%)' }} />
      {/* Lamplight from above */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 95% 55% at 50% -8%, rgba(150,110,50,0.34) 0%, transparent 60%)' }} />
      {/* Ruled chart grid, faded toward the edges */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `linear-gradient(${GOLD}1a 1px, transparent 1px), linear-gradient(90deg, ${GOLD}1a 1px, transparent 1px)`,
        backgroundSize: '44px 44px',
        WebkitMaskImage: 'radial-gradient(ellipse 78% 72% at 50% 40%, black 30%, transparent 80%)',
        maskImage: 'radial-gradient(ellipse 78% 72% at 50% 40%, black 30%, transparent 80%)',
      }} />
      {/* Compass rose */}
      <svg viewBox="0 0 100 100" style={{ position: 'absolute', top: '34%', left: '50%', width: 'min(82vw, 440px)', height: 'min(82vw, 440px)', transform: 'translate(-50%, -50%)', opacity: 0.12 }}>
        <circle cx="50" cy="50" r="44" fill="none" stroke={GOLD} strokeWidth="0.5" />
        <circle cx="50" cy="50" r="34" fill="none" stroke={GOLD} strokeWidth="0.4" />
        {/* tick marks */}
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * Math.PI * 2
          const r1 = 44, r2 = i % 6 === 0 ? 37 : 41
          return <line key={i} x1={50 + r1 * Math.sin(a)} y1={50 - r1 * Math.cos(a)} x2={50 + r2 * Math.sin(a)} y2={50 - r2 * Math.cos(a)} stroke={GOLD} strokeWidth="0.4" />
        })}
        {/* 4-point star (two crossed diamonds) */}
        <polygon points="50,8 53,50 50,86 47,50" fill={GOLD} opacity="0.6" />
        <polygon points="14,50 50,53 86,50 50,47" fill={GOLD} opacity="0.6" />
        {/* diagonal short star */}
        <polygon points="50,20 51.6,50 50,80 48.4,50" fill={GOLD} opacity="0.35" transform="rotate(45 50 50)" />
        <polygon points="20,50 50,51.6 80,50 50,48.4" fill={GOLD} opacity="0.35" transform="rotate(45 50 50)" />
        <circle cx="50" cy="50" r="3" fill="none" stroke={GOLD} strokeWidth="0.6" />
        <text x="50" y="6.5" textAnchor="middle" fill={GOLD} fontSize="5" fontFamily="serif">N</text>
        <text x="50" y="98" textAnchor="middle" fill={GOLD} fontSize="5" fontFamily="serif">S</text>
        <text x="96" y="52" textAnchor="middle" fill={GOLD} fontSize="5" fontFamily="serif">E</text>
        <text x="4" y="52" textAnchor="middle" fill={GOLD} fontSize="5" fontFamily="serif">W</text>
      </svg>
      {/* Edge vignette */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 100% 100% at 50% 40%, transparent 48%, rgba(0,0,0,0.62) 100%)' }} />
    </div>
  )
}
