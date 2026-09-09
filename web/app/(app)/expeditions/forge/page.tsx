import { redirect } from 'next/navigation'

// The forge is a building on the Forge island; you sail to it and moor. See
// ../page.tsx.
export default function Page() {
  redirect('/sea?open=forge')
}
