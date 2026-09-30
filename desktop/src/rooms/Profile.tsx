// THE PROFILE, IN THE SHELL (Steam prep, 2026-09-30): the column the web's
// /profile draws around ProfileClient. The props come from lib/core/profile on
// both builds.

import ProfileClient from '@/app/(app)/profile/ProfileClient'
import type { ComponentProps } from 'react'

export default function Profile(props: ComponentProps<typeof ProfileClient>) {
  return (
    <main className="min-h-screen pt-8">
      <ProfileClient {...props} />
    </main>
  )
}
