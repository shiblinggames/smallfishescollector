// THE CAPTAIN'S LOG'S STORY, SHAPED (split out 2026-09-30): the Finn arc and
// the raid map, as StoryLog draws them, from the profile and the map view. The
// page reads those and calls this; the desktop build reads the same from the
// save, so the two logs cannot tell the story differently.

import { FINN_BEATS, FINN_REVEAL_BEAT } from '@/lib/finn'
import { isCombatNode } from '@/lib/raidMap'
import type { RaidMapView } from '@/lib/core/raidMap'
import type { StoryLogData } from './StoryLog'

export function storyLogData(profile: Record<string, unknown> | null, raidMap: RaidMapView): StoryLogData {
  // ── Finn arc recap ──
  const seenFinn = new Set((profile?.finn_seen_beats as string[] | null) ?? [])
  const finnRevealed = !!profile?.finn_revealed || seenFinn.has('reveal')
  const finnEncounter = FINN_BEATS.filter(b => seenFinn.has(b.id)).map(b => ({ id: b.id, lines: b.lines.map(l => l.text) }))

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

  return {
    finn: {
      encounter: finnEncounter,
      revealed: finnRevealed,
      revealLines: finnRevealed ? FINN_REVEAL_BEAT.lines.map(l => l.text) : [],
      discovered: finnEncounter.length + (finnRevealed ? 1 : 0),
      total: FINN_BEATS.length + 1,
    },
    raid: {
      done: raidDone,
      next: raidNext,
      clearedCount: raidDone.length,
      total: raidViews.length,
    },
  }
}
