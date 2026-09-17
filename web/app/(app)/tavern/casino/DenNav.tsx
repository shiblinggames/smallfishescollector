import type { ReactNode } from 'react'
import RoomHeader from '@/components/RoomHeader'

// The three Den tables' header. A thin wrapper over RoomHeader, which every
// room on the Mainland shares. Keeps the route in one place so "back" from any
// table always lands on the lobby, never on the sea and never on the tavern.
export default function DenNav({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <RoomHeader
      title={title}
      backHref="/tavern/casino"
      backLabel="The Den"
      right={
        <span className="font-karla" style={{ fontSize: '0.58rem', color: '#7a7672', whiteSpace: 'nowrap', textAlign: 'right' }}>
          {right}
        </span>
      }
    />
  )
}
