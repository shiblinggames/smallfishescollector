// A bench, not a place. Admin only; see lib/adminGate. The tuner itself is a
// Client Component next door, unchanged.
import { adminOnlyPage } from '@/lib/adminGate'
import CloudTuner from './CloudTuner'

export const metadata = { title: 'Cloud tuner' }

export default async function CloudTunerPage() {
  await adminOnlyPage()
  return <CloudTuner />
}
