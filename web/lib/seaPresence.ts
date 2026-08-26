// BOATS ON THE WATER, IN REAL TIME.
//
// Plain module, NOT 'use server' — this is browser-side and every export is
// sync.
//
// ── WHAT THIS REPLACED, AND WHAT IT DID NOT ─────────────────────────────────
//
// Presence used to be one server action polled on an adaptive timer: every 20
// seconds normally, every 2 seconds once a friend was within a couple of
// screens. That is still there and still the BACKBONE — it is how you find out
// somebody is online at all, and it feeds the compass arrow, the crew list and
// the "so-and-so has put to sea" line.
//
// What moved here is only the close-up: the part where you are sailing
// alongside somebody and their hull needs to move like a hull. Two seconds is
// 600-1000 world pixels at cruising speed, which is most of a screen, and no
// amount of easing makes that look like a boat rather than a slideshow.
//
// So: the poll answers "who is out there", at 20s, for a few queries a minute.
// This answers "exactly where is the one next to me", at 2Hz, for as long as
// they are next to you and not one second longer.
//
// ── WHY NOT ONE BIG CHANNEL ─────────────────────────────────────────────────
//
// Because Supabase bills fan-out. From their pricing docs, verbatim:
//
//   "Each broadcast message counts as one message sent plus one message per
//    subscribed client that receives it."
//
// One channel containing everybody is therefore O(N^2) on the invoice: at N
// players broadcasting at rate R the bill is N*R*N messages a second, and the
// people paying for most of those deliveries are on the far side of the chart
// and cannot see each other. Ten players at 2Hz in a single room is 200 a
// second — the whole 2M monthly free quota in under three hours of play, for a
// game where most of those ten cannot see one another.
//
// Instead every captain owns ONE channel — `sea:<their uuid>` — and broadcasts
// only on that. Fan-out is then the number of people actually subscribed to
// YOU, which is your mutual crew who are online, and that is bounded by the
// social graph rather than by how popular the game gets. Two friends sailing
// together cost 8 messages a second between them, whether the server is holding
// ten players or ten thousand.
//
// ── AND WHY THE CHANNELS ARE PRIVATE ────────────────────────────────────────
//
// A topic is `sea:<uuid>` and that uuid is handed to every mutual friend so
// they can subscribe. A shared secret is not a secret. Without policies anyone
// holding one could listen in, and — worse — could broadcast on it and drag
// somebody else's boat across the chart in front of everyone watching.
//
// So the channels are `private: true` and the rules live in Postgres (see the
// sea_presence_realtime_authorization migration): you may LISTEN to your own
// channel or a mutual's, and you may SEND only on your own. `setAuth` has to be
// called before any of it or every join is refused.

import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

/** One position report. Deliberately tiny: this goes out twice a second.
 *  No username — see the note in `listen` about trusting the channel. */
export type Beat = {
  x: number
  y: number
  /** Which way the hull is pointed, -1 or 1. */
  f: number
}

/**
 * HOW OFTEN A BOAT REPORTS ITSELF while somebody is watching.
 *
 * 500ms. At cruising speed that is 150-260 world pixels between reports, which
 * the existing easing smooths into continuous motion. The old poll left
 * 600-1000px gaps and looked like a slideshow.
 *
 * THIS CONSTANT IS THE BILL, so it is worth stating the arithmetic. A pair
 * sailing together costs `4 * (1000 / BEAT_MS)` messages a second — each of the
 * two sends 2/s, and each send bills once to send plus once for the one person
 * receiving it. That is 8 a second, about 28,800 an hour:
 *
 *     rate     per pair-hour     free 2M/mo      pro 5M/mo
 *     4 Hz          57,600         35 hours       87 hours
 *     2 Hz          28,800         69 hours      174 hours
 *     1 Hz          14,400        139 hours     347 hours
 *
 * Overage is $2.50 per million, so at this rate $2.50 buys another ~35 hours of
 * two people deliberately sailing side by side. Zero the rest of the time.
 *
 * 4Hz was the first draft and 2Hz is the same picture for half the money —
 * against easing this fine the difference is not visible.
 */
export const BEAT_MS = 500

/**
 * HOW FAR YOU HAVE TO HAVE MOVED for a beat to be worth sending.
 *
 * A boat that is not moving has nothing to report, and "moored next to a friend
 * fishing" is one of the most likely ways for two people to be near each other
 * for a long time. Without this, that costs exactly as much as a chase.
 *
 * Well under the easing's tolerance, so this never shows up as stutter.
 */
const MOVE_MIN = 14

/** Even a crawl gets reported eventually. Without this, drifting a few pixels
 *  at a time would never cross MOVE_MIN and a boat could sit visibly wrong on a
 *  friend's screen forever. */
const IDLE_MS = 3_000

export type SeaPresence = {
  /** Who to listen to. Safe to call on every poll; unchanged ids are left
   *  alone and only the difference is acted on. */
  setCrew: (ids: string[]) => void
  /** Report where you are. Cheap to call and does nothing if the channel is
   *  not up yet, so callers never have to check. */
  send: (b: Beat) => void
  close: () => void
}

/**
 * Open the water.
 *
 * `onBeat` is handed the FRIEND'S ID from the channel the message arrived on,
 * never anything out of the payload — see `listen`.
 */
export function openSeaPresence(opts: {
  userId: string
  onBeat: (friendId: string, b: Beat) => void
}): SeaPresence {
  const supabase = createClient()
  const listening = new Map<string, RealtimeChannel>()
  let mine: RealtimeChannel | null = null
  let mineReady = false
  let closed = false
  /** The last beat actually put on the wire, for the move gate. */
  let sent: { x: number; y: number; f: number; at: number } | null = null

  // Realtime Authorization. Without this the socket carries no JWT, every
  // private channel refuses the join, and the failure looks like "presence just
  // does not work" rather than like an auth error.
  void supabase.realtime.setAuth()

  // ── YOUR OWN CHANNEL, the only one you may speak on ──────────────────
  // `self: false` because the one boat that never needs a position update over
  // the network is your own; it is right there in `pos`.
  mine = supabase.channel(`sea:${opts.userId}`, {
    config: { private: true, broadcast: { self: false } },
  })
  mine.subscribe(status => { mineReady = status === 'SUBSCRIBED' })

  /**
   * LISTEN TO ONE CAPTAIN.
   *
   * The friend's id comes from the CHANNEL, not from the message. The payload
   * is written by another player's browser and a browser can put anything in
   * it, so a username in there would be a player's claim about who they are.
   * The channel is different: Postgres will only let a captain insert on
   * `sea:<their own uuid>`, so which channel a message arrived on is a fact the
   * database enforced. That is the identity used.
   */
  function listen(id: string) {
    const ch = supabase.channel(`sea:${id}`, {
      config: { private: true, broadcast: { self: false } },
    })
    ch.on('broadcast', { event: 'pos' }, msg => {
      const b = msg.payload as Partial<Beat> | null
      if (!b) return
      const x = Number(b.x), y = Number(b.y)
      // A NaN here would be written straight into the render loop's easing
      // target and poison it permanently — every frame after would compute
      // NaN and the boat would vanish with no error anywhere. Cheap to check,
      // impossible to debug if it ever happened.
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      opts.onBeat(id, { x, y, f: b.f === -1 ? -1 : 1 })
    })
    ch.subscribe()
    listening.set(id, ch)
  }

  return {
    setCrew(ids: string[]) {
      if (closed) return
      const want = new Set(ids.filter(id => id && id !== opts.userId))
      for (const [id, ch] of listening) {
        if (!want.has(id)) {
          void supabase.removeChannel(ch)
          listening.delete(id)
        }
      }
      for (const id of want) if (!listening.has(id)) listen(id)
    },

    send(b: Beat) {
      if (closed || !mine || !mineReady) return
      // THE MOVE GATE. Cheap to call every beat and mostly says no.
      if (sent) {
        const moved = Math.hypot(b.x - sent.x, b.y - sent.y)
        const stale = Date.now() - sent.at > IDLE_MS
        const same = moved < 0.5 && b.f === sent.f
        if (moved < MOVE_MIN && !(stale && !same)) return
      }
      sent = { x: b.x, y: b.y, f: b.f, at: Date.now() }
      void mine.send({ type: 'broadcast', event: 'pos', payload: b })
    },

    close() {
      closed = true
      for (const ch of listening.values()) void supabase.removeChannel(ch)
      listening.clear()
      if (mine) void supabase.removeChannel(mine)
      mine = null
    },
  }
}
