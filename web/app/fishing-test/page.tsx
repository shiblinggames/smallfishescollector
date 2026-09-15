// An art tuner, not a game screen. Admin only; see lib/adminGate.
import { adminOnlyPage } from '@/lib/adminGate'
import FishingTestClient from './FishingTestClient'

export default async function FishingTestPage() {
  await adminOnlyPage()
  return <FishingTestClient />
}
