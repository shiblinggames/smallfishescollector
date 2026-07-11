// Drawn podium medallion — gold / silver / bronze metal disc with an engraved
// rank numeral. Replaces the 🥇🥈🥉 emoji medals (no-emoji-icons rule) on the
// leaderboards and contest standings; one component so every podium matches.

const METALS = {
  1: { hi: '#ffe9a6', base: '#f0c040', lo: '#9a7215', num: '#4a3407' },
  2: { hi: '#eef2f6', base: '#c0c8d4', lo: '#6d7686', num: '#2e3540' },
  3: { hi: '#f0c39a', base: '#c47a3a', lo: '#7a4517', num: '#3d2008' },
} as const

export default function RankMedallion({ rank, size = 24 }: { rank: 1 | 2 | 3; size?: number }) {
  const m = METALS[rank]
  return (
    <span aria-label={`Rank ${rank}`} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: `radial-gradient(circle at 35% 30%, ${m.hi}, ${m.base} 55%, ${m.lo})`,
      border: `1px solid ${m.lo}`,
      boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.5), inset 0 -2px 3px rgba(0,0,0,0.25), 0 1px 3px rgba(0,0,0,0.5)',
    }}>
      <span className="font-cinzel font-800" style={{ fontSize: size * 0.46, color: m.num, lineHeight: 1 }}>{rank}</span>
    </span>
  )
}
