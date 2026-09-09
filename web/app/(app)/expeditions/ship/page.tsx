import { redirect } from 'next/navigation'

// Her stats, her upgrade and her three rooms are the Gunwharf's panel on the
// chart (sea/ShipSheet, focus="ship"). See ../page.tsx.
export default function Page() {
  redirect('/sea?open=ship')
}
