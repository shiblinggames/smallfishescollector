// A bench, not a place. Admin only; see lib/adminGate. The tuner itself is a
// Client Component next door, unchanged.
import { adminOnlyPage } from '@/lib/adminGate'
import AvatarTuner from './AvatarTuner'

export const metadata = { title: 'Avatar tuner' }

export default async function AvatarTunerPage() {
  await adminOnlyPage()
  return <AvatarTuner />
}
