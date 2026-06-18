import type { ReactNode } from 'react'
import BackButton from '@/components/BackButton'

// Uniform back-nav for the three Den games — same row shape as the Den
// lobby's own header: "← The Den" link left, Cinzel game title center,
// small muted right slot (daily-cap line, doubloons, or empty). Keeps
// the route in one place so 'back' from any table always lands on the
// lobby, never the tavern hub.
export default function DenNav({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <BackButton href="/tavern/casino" label="The Den" />
      <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0e8d0', textAlign: 'center', flex: 1 }}>
        {title}
      </p>
      {/* Fixed-min right slot so the title stays visually centered even
          when a game has nothing to show here. */}
      <span className="font-karla" style={{ fontSize: '0.58rem', color: '#7a7672', whiteSpace: 'nowrap', textAlign: 'right', minWidth: 56 }}>
        {right}
      </span>
    </div>
  )
}
