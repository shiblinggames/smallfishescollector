'use client'

// Onboarding / tutorial cinematic. It's the exact campaign StoryScene kit (bust
// + typewriter + letterbox + Ken-Burns backdrop), mounted anywhere with a single
// onDone. Render it conditionally when a scene should play — it portals to
// <body>, so it sits above the page and the Nav. Both "finish the last line" and
// "Skip" resolve to onDone (usually: mark the has_seen_* flag + close).

import StoryScene from '@/app/(app)/expeditions/StoryScene'
import type { SceneLine } from '@/lib/raidMap'

export default function GuideScene({ title, lines, ctaLabel, accent, background, pending, onDone }: {
  title: string
  lines: SceneLine[]
  ctaLabel: string
  accent?: string
  background?: string
  pending?: boolean
  onDone: () => void
}) {
  return (
    <StoryScene
      title={title}
      lines={lines}
      ctaLabel={ctaLabel}
      accent={accent}
      background={background}
      pending={pending}
      onComplete={onDone}
      onSkip={onDone}
    />
  )
}
