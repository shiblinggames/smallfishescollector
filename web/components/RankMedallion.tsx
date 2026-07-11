// Podium rank mark — an ENGRAVED metal numeral, not a badge widget. Gold /
// silver / bronze Cinzel digits with an embossed cut (light catches the top
// edge, shadow under the stroke), like a rank chiselled into the harbour
// ledger's brass plate. Replaces the 🥇🥈🥉 emoji (no-emoji-icons rule) and
// the earlier gradient-disc medallion, which read as app chrome.

const METALS = {
  1: { color: '#f0c040', glow: 'rgba(240,192,64,0.4)' },
  2: { color: '#c8cfda', glow: 'rgba(200,207,218,0.3)' },
  3: { color: '#c47a3a', glow: 'rgba(196,122,58,0.35)' },
} as const

export default function RankMedallion({ rank, size = 24 }: { rank: 1 | 2 | 3; size?: number }) {
  const m = METALS[rank]
  return (
    <span
      aria-label={`Rank ${rank}`}
      className="font-cinzel font-800"
      style={{
        width: size, flexShrink: 0, textAlign: 'center', lineHeight: 1,
        fontSize: size * 0.82, color: m.color,
        textShadow: `0 -1px 0 rgba(255,255,255,0.3), 0 1px 0 rgba(0,0,0,0.7), 0 2px 3px rgba(0,0,0,0.5), 0 0 10px ${m.glow}`,
      }}
    >
      {rank}
    </span>
  )
}
