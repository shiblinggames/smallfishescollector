'use client'

// Shared ownership/status pill for shop item cards (Shipyard fleet, Tackle Shop
// owned/equipped). Replaces the per-shop emoji pills (⬤ Active / ✓ Owned /
// 🔒 Locked) with real SVG/CSS glyphs per the no-emoji-icons rule.

type Kind = 'active' | 'owned' | 'equipped' | 'next' | 'locked'

const PALETTE: Record<Kind, { color: string; label: string }> = {
  active:   { color: '#5fd9bd', label: 'Active' },
  equipped: { color: '#5fd9bd', label: 'Equipped' },
  owned:    { color: '#4ade80', label: 'Owned' },
  next:     { color: '#f0c040', label: 'Next Tier' },
  locked:   { color: '#7a7775', label: 'Locked' },
}

function Glyph({ kind, color }: { kind: Kind; color: string }) {
  if (kind === 'active' || kind === 'equipped') {
    return <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
  }
  if (kind === 'owned') {
    return (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 6L9 17l-5-5" />
      </svg>
    )
  }
  if (kind === 'locked') {
    return (
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="4.5" y="11" width="15" height="9.5" rx="1.5" />
        <path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11" />
      </svg>
    )
  }
  return null // 'next' has no glyph — just the label
}

export default function ShopStatusPill({ kind, label }: { kind: Kind; label?: string }) {
  const { color, label: defaultLabel } = PALETTE[kind]
  return (
    <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: '0.5rem', color,
      background: `${color}1c`, border: `1px solid ${color}55`,
      borderRadius: 999, padding: '0.2rem 0.55rem', whiteSpace: 'nowrap',
    }}>
      <Glyph kind={kind} color={color} />
      {label ?? defaultLabel}
    </span>
  )
}
