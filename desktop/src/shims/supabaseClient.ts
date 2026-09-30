// @/lib/supabase/client, for the desktop shell. Offline there is no database
// and nobody to sign in as. A few components still reach for the browser client
// directly (the Nav's chips, the session watcher, the live profile feed); they
// get this instead, which answers every query with nothing and every
// subscription with a no-op, so they sit quietly rather than throwing. The
// screens that matter read the game through `api`.

import type { createClient as RealClient } from '../../../web/lib/supabase/client'

const EMPTY = { data: null, error: null, count: 0 }

function chain(): unknown {
  const target = function () {} as unknown as Record<string | symbol, unknown>
  return new Proxy(target, {
    get(_t, key) {
      if (key === 'then') return (res: (v: unknown) => void) => res(EMPTY)
      if (key === 'unsubscribe') return () => {}
      return chain()
    },
    apply() { return chain() },
  })
}

export function createClient(): ReturnType<typeof RealClient> {
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }),
    },
    from: () => chain(),
    rpc: () => chain(),
    channel: () => chain(),
    removeChannel: () => {},
  } as never
}
