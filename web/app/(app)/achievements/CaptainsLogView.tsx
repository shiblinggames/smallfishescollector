// THE CAPTAIN'S LOG, DRAWN (split out 2026-09-30), so the desktop build draws
// the same page.

import Link from 'next/link'
import StoryLog, { type StoryLogData } from './StoryLog'

export default function CaptainsLogView({ storyData }: { storyData: StoryLogData }) {
  return (
    <>
      <main className="min-h-screen pt-8">
        <div className="page-col pb-16 sm:pb-8">
          <div className="mb-6 flex items-baseline justify-between gap-3">
            <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.5rem' }}>Captain&apos;s Log</h1>
            <Link href="/badges" className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: '#b6a98c', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              Badges →
            </Link>
          </div>

          <StoryLog data={storyData} />
        </div>
      </main>
    </>
  )
}
