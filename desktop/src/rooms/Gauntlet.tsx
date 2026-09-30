// THE GAUNTLETS, IN THE SHELL (Steam prep, 2026-09-30): the column both
// gauntlet pages draw around GauntletGame. The props come from
// lib/core/gauntletPage on both builds.

import GauntletGame from '@/app/(app)/raids/gauntlet/GauntletGame'
import type { ComponentProps } from 'react'

export default function Gauntlet(props: ComponentProps<typeof GauntletGame>) {
  return (
    <main className="min-h-screen pt-6">
      <div className="page-col">
        <GauntletGame {...props} />
      </div>
    </main>
  )
}
