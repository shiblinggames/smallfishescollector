import type { ReactNode } from 'react'
import BackButton from '@/components/BackButton'

// Uniform back-nav for the three Den games — same row shape as the Den
// lobby's own header: "← The Den" link left, Cinzel game title center,
// small muted right slot (daily-cap line, doubloons, or empty). Keeps
// the route in one place so 'back' from any table always lands on the
// lobby, never the tavern hub.
export default function DenNav({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {/* Equal-flex side rails so the title sits at the ROW's true center,
          regardless of the back-button vs right-slot widths. */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <BackButton href="/tavern/casino" label="The Den" />
      </div>
      <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0e8d0', textAlign: 'center', whiteSpace: 'nowrap' }}>
        {title}
      </p>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
        <span className="font-karla" style={{ fontSize: '0.58rem', color: '#7a7672', whiteSpace: 'nowrap', textAlign: 'right' }}>
          {right}
        </span>
      </div>
    </div>
  )
}
