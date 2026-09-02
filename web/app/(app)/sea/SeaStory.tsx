'use client'

// ── A CAMPAIGN CUTSCENE, PLAYED FROM THE DECK ───────────────────────────────
//
// The story beats out in the bays are posts on rocks you pull alongside and
// read. What they open is the SAME scene the campaign map opens — the same
// component, the same lines, the same server write that marks it read — because
// a second player would be a second version of the story and the two would drift
// the first time somebody edited a line.
//
// `StoryScene` is `/expeditions`' own kit and it portals itself to the body, so
// it lands over the chart without the chart having to know anything about it.
//
// ── WHY THIS IS ITS OWN FILE ────────────────────────────────────────────────
//
// SeaMap is already twelve thousand lines and the scene kit drags in the whole
// cutscene pipeline behind it. Held behind a dynamic import, none of it is
// fetched until the first post is actually read — which for a captain who never
// leaves the fishing grounds is never.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import StoryScene from '@/app/(app)/expeditions/StoryScene'
import { markStoryNodeRead } from '@/app/(app)/expeditions/raidMapActions'
import { SCENE_BACKDROPS, type RaidNode } from '@/lib/raidMap'

export default function SeaStory({ node, cleared, onDone }: {
  node: RaidNode
  /** Already read. A replay: the closing button just shuts it, and Skip is
   *  allowed, because the beat has already been earned once. */
  cleared: boolean
  onDone: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function finish() {
    // A REPLAY WRITES NOTHING. It is already read; the only thing left to do
    // with it is close it.
    if (cleared) { onDone(); return }
    startTransition(async () => {
      const res = await markStoryNodeRead(node.id)
      if (res && 'error' in res) { setErr(res.error); return }
      // THE CHART HAS TO HEAR ABOUT IT. `nodeStatus` is a server prop, so
      // without this the post stays lit, the next post stays locked, and a gate
      // that this beat just opened stays shut until a reload.
      router.refresh()
      onDone()
    })
  }

  if (!node.scene) return null

  return (
    <>
      <StoryScene
        title={node.label}
        lines={node.scene}
        ctaLabel={cleared ? 'Close' : (node.detail?.ctaLabel ?? 'Log it →')}
        pending={pending}
        accent={node.sceneAccent}
        background={SCENE_BACKDROPS[node.id]}
        onComplete={finish}
        onSkip={finish}
        // No Skip on a first watch, exactly as the campaign map has it: the beat
        // is the payoff for everything that led to it, and a one-tap Skip in the
        // top bar from line one is easy to hit by accident and impossible to
        // undo in the moment.
        allowSkip={cleared}
      />
      {err && (
        <p role="alert" className="font-karla font-600" style={{
          position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
          zIndex: 100000, margin: 0, padding: '0.5rem 0.9rem', borderRadius: 10,
          background: 'rgba(26,10,10,0.96)', border: '1px solid rgba(230,160,160,0.5)',
          color: '#e6a0a0', fontSize: '0.82rem',
        }}>{err}</p>
      )}
    </>
  )
}
