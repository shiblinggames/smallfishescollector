'use client'

// Onboarding / tutorial cinematic. It's the exact campaign StoryScene kit (bust
// + typewriter + letterbox + Ken-Burns backdrop), mounted anywhere with a single
// onDone. Render it conditionally when a scene should play — it portals to
// <body>, so it sits above the page and the Nav. Both "finish the last line" and
// "Skip" resolve to onDone (usually: mark the has_seen_* flag + close).

import type { ReactNode } from 'react'
import StoryScene from '@/app/(app)/expeditions/StoryScene'
import type { SceneLine, SceneInsert } from '@/lib/raidMap'

export default function GuideScene({ title, lines, ctaLabel, accent, background, pending, renderInsert, onDone }: {
  title: string
  lines: SceneLine[]
  ctaLabel: string
  accent?: string
  background?: string
  pending?: boolean
  /** Optional custom insert visual (e.g. a live dial demo). See StoryScene. */
  renderInsert?: (insert: SceneInsert) => ReactNode
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
      renderInsert={renderInsert}
      onComplete={onDone}
      onSkip={onDone}
    />
  )
}
