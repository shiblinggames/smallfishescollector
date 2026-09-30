import { redirect } from 'next/navigation'
import CaptainsLogView from './CaptainsLogView'
import { storyLogData } from './storyLogData'
import { getRaidMapView } from '@/app/(app)/expeditions/raidMapActions'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'

// The Captain's Log — the narrative recap (Finn arc + raid map). The badge /
// goal "trophy shelf" lives on its own page now at /badges.
export default async function CaptainsLogPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [profile, raidMap] = await Promise.all([getCurrentProfile(), getRaidMapView()])

  return <CaptainsLogView storyData={storyLogData(profile, raidMap)} />
}
