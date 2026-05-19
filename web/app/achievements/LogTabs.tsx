'use client'

import { useState } from 'react'
import StoryLog, { type StoryLogData } from './StoryLog'
import AchievementsClient, { type JourneyGroup } from './AchievementsClient'

const TABS = [
  { id: 'goals', label: 'Goals' },
  { id: 'story', label: 'Story' },
] as const
type TabId = (typeof TABS)[number]['id']

export default function LogTabs({
  storyData,
  groups,
  doneCount,
  totalCount,
}: {
  storyData: StoryLogData
  groups: JourneyGroup[]
  doneCount: number
  totalCount: number
}) {
  const [tab, setTab] = useState<TabId>('goals')

  return (
    <div>
      <div
        role="tablist"
        aria-label="Captain's Log sections"
        style={{
          display: 'flex',
          gap: 6,
          padding: 4,
          marginBottom: '1.25rem',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
        }}
      >
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className="font-cinzel font-700 uppercase tracking-[0.08em]"
              style={{
                flex: 1,
                padding: '0.62rem',
                borderRadius: 9,
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.82rem',
                background: active
                  ? 'linear-gradient(180deg, #f6c84e 0%, #e0a82e 100%)'
                  : 'transparent',
                color: active ? '#241701' : 'rgba(240,237,232,0.5)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'story' ? (
        <StoryLog data={storyData} />
      ) : (
        <AchievementsClient groups={groups} doneCount={doneCount} totalCount={totalCount} />
      )}
    </div>
  )
}
