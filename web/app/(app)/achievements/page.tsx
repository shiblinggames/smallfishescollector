import { redirect } from 'next/navigation'
import Link from 'next/link'
import StoryLog, { type StoryLogData } from './StoryLog'
import { FINN_ENCOUNTER_BEATS, FINN_REVEAL_BEAT } from '@/lib/finn'
import { getRaidMapView } from '@/app/(app)/expeditions/raidMapActions'
import { isCombatNode } from '@/lib/raidMap'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'

// The Captain's Log — the narrative recap (Finn arc + raid map). The badge /
// goal "trophy shelf" lives on its own page now at /badges.
export default async function CaptainsLogPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [profile, raidMap] = await Promise.all([getCurrentProfile(), getRaidMapView()])

  // ── Finn arc recap ───────────────────────────────────────────────────────
  const seenFinn = new Set((profile?.finn_seen_beats as string[] | null) ?? [])
  const finnRevealed = !!profile?.finn_revealed || seenFinn.has('reveal')
  const finnEncounter = FINN_ENCOUNTER_BEATS.filter(b => seenFinn.has(b.id)).map(b => ({ id: b.id, lines: b.lines.map(l => l.text) }))

  // ── Raid map recap ───────────────────────────────────────────────────────
  const raidViews = raidMap.views
  const raidDone = raidViews
    .filter(v => v.status === 'cleared')
    .map(v => {
      const n = v.node
      // Recap badge bucket. Combat (skirmish/raid), milestone, and berth (a
      // ship-refit "Port of Call") are their own kinds; EVERYTHING ELSE carries
      // narrative — story, muster, event, class pick, puzzle, fork, dice — so it
      // reads as "Story" instead of being mislabeled "Port of Call" by a
      // catch-all (musters and the cartographer_reveal event were showing as
      // shops).
      const kind: 'story' | 'combat' | 'milestone' | 'shop' =
        isCombatNode(n.type) ? 'combat'
          : n.type === 'milestone' ? 'milestone'
          : n.type === 'berth' ? 'shop'
          : 'story'
      return { label: n.label, kind, lines: [n.bridge ?? n.flavor], image: n.image ?? null }
    })
  const raidNextView = raidViews.find(v => v.status === 'available')
  const raidNext = raidNextView
    ? { label: raidNextView.node.label, flavor: raidNextView.node.flavor, image: raidNextView.node.image ?? null }
    : null

  const storyData: StoryLogData = {
    finn: {
      encounter: finnEncounter,
      revealed: finnRevealed,
      revealLines: finnRevealed ? FINN_REVEAL_BEAT.lines.map(l => l.text) : [],
      discovered: finnEncounter.length + (finnRevealed ? 1 : 0),
      total: FINN_ENCOUNTER_BEATS.length + 1,
    },
    raid: {
      done: raidDone,
      next: raidNext,
      clearedCount: raidDone.length,
      total: raidViews.length,
    },
  }

  return (
    <>
      <main className="min-h-screen pt-8">
        <div className="page-col pb-16">
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
