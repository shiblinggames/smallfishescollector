// The skiff comparison bench. Nothing imports it and nothing links to it; it
// exists so the Pixi composition is verified against the DOM one by looking,
// which is how the placement numbers it reproduces were arrived at in the first
// place. See SkiffBench.

import { adminOnlyPage } from '@/lib/adminGate'
import SkiffBench from './SkiffBench'

export const metadata = { title: 'Skiff bench' }

// Admin only, like every other bench under /sea.
export default async function SkiffBenchPage() {
  await adminOnlyPage()
  return <SkiffBench />
}
