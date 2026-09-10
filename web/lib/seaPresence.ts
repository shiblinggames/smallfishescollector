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
  /**
   * WHAT THEY ARE DOING WITH THEIR HANDS: 0 idle, 1 waiting on a bite, 2 casting
   * or working the reel. One digit rather than the frame's name, because this
   * rides along on a message that goes out twice a second and 'rest' is four
   * times the bytes of 0 for the same three states.
   *
   * The frames are the ones every captain composite already has, so a friend
   * fishing beside you is drawn by exactly the same code that draws you fishing
   * — no second animation, no stand-in pose, nothing to keep in step.
   */
  p?: Pose
  /**
   * WHEN THE SENDER SAMPLED IT, off their own wall clock.
   *
   * Their clock is not ours and we do not care: only the DIFFERENCE between
   * two of their stamps is ever used, and any fixed offset between the two
   * machines cancels out of a subtraction.
   *
   * It exists because deriving a speed from ARRIVAL times is deriving it from
   * network jitter. The distance between two beats is clean — it is however
   * far the boat actually sailed between two samples — but the gap between
   * their arrivals is that interval plus whatever the wire did, which on a
   * phone is tens of milliseconds either way. Dividing a clean number by a
   * noisy one gives a noisy speed, and a noisy speed makes the extrapolated
   * aim jump at every beat. That is the jank: the socket is healthy, the
   * positions are right, and the SPEED is being measured with a rubber ruler.
   */
  t?: number
}

/** rest / wait / cast, as they go over the wire. */
export type Pose = 0 | 1 | 2
export const POSE_FRAME = ['rest', 'wait', 'cast'] as const
export const POSE_CODE = { rest: 0, wait: 1, cast: 2 } as const

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
 *     5 Hz          72,000         27 hours       69 hours
 *     4 Hz          57,600         35 hours       87 hours
 *     2 Hz          28,800         69 hours      174 hours
 *     1 Hz          14,400        139 hours     347 hours
 *
 * Overage is $2.50 per million, so $2.50 buys another ~28 hours of two people
 * deliberately sailing side by side at this rate. Zero the rest of the time.
 *
 * ── WHY IT WENT UP, HAVING ONCE GONE DOWN ───────────────────────────────────
 *
 * This was 2Hz, and the note here said 4Hz was "the same picture for half the
 * money — against easing this fine the difference is not visible". That was
 * true of what the chart did then, which was ease toward the newest position:
 * at that point the rate only decided how often the target moved, and the ease
 * blurred the difference either way.
 *
 * It is not true of what it does now. The far end extrapolates along a measured
 * velocity, so between beats a hull sailing straight is drawn exactly right at
 * any rate at all — and the rate instead decides how long a TURN takes to be
 * noticed. At 2Hz that is half a second of a boat confidently continuing the
 * way it was already going, and steering is most of what anybody does on this
 * chart. It read as bursts.
 *
 * THE COST ONLY LANDS WHILE SOMEBODY IS ACTUALLY SAILING. The move gate below
 * drops a beat from a hull that has not gone anywhere, so a faster interval
 * costs nothing at all for two captains moored side by side fishing, which is
 * the other most likely way for two people to be near each other for an hour.
 */
export const BEAT_MS = 200

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
  /** You landed one. Fires once, immediately, outside the move gate. */
  landed: (perfect: boolean) => void
  close: () => void
}

/**
 * Open the water.
 *
 * `onBeat` is handed the FRIEND'S ID from the channel the message arrived on,
 * never anything out of the payload — see `listen`.
 */
/**
 * ── TELL ME WHAT THE SOCKET IS ACTUALLY DOING ───────────────────────────────
 *
 * Off unless you ask for it with `?seadebug=1` on /sea, so this costs a boolean
 * read at import and nothing else in normal play.
 *
 * It exists because everything about this system is invisible when it fails.
 * The database can say two captains are both Captains, follow each other, hold
 * an accepted pact and are three hundred pixels apart — every gate green — and
 * the water still not move, because whether a private channel actually JOINED
 * is a status on a callback and whether a beat actually LEFT is nothing at all.
 * Diagnosing that from the outside is guessing, and I did some.
 *
 * Prints: every channel's subscribe status, every beat sent with why it was not
 * skipped, and every beat received.
 */
/**
 * TWO WAYS IN, because an installed PWA has no address bar. `?seadebug=1` is
 * the one-off on a desktop browser; the stored key is the one an admin can
 * flip from the Settings disc and have survive every navigation inside the app,
 * which is the only way to reach this from a phone at all.
 */
/**
 * ── WHAT THE SOCKET IS DOING, WHERE YOU CAN SEE IT ──────────────────────────
 *
 * A counter block rather than a log, because a console is not reachable on the
 * device that matters: the phone is the one sailing, and the desktop account
 * is not an admin so it cannot reach the Settings switch either. Read by the
 * on-screen readout in SeaMap when the debug flag is on, and untouched
 * otherwise.
 *
 * Mutated in place on purpose. It is read once a frame by a panel that is only
 * mounted while debugging, and allocating a fresh object per beat to hand to
 * React would be the one part of this that could itself cost frames.
 */
export const presenceStats = {
  /** Subscribe status of your own channel, the one you SEND on. */
  own: 'idle' as string,
  /** Subscribe status per friend id, the channels you LISTEN on. */
  listens: {} as Record<string, string>,
  /** Beats put on the wire, and beats taken off it, since the page loaded. */
  out: 0,
  in: 0,
  /** Why the last send did nothing, when it did nothing. */
  blocked: '' as string,
  /** When the last beat arrived from each friend, wall clock. */
  lastIn: {} as Record<string, number>,
}

const DEBUG = typeof window !== 'undefined' && (() => {
  if (new URLSearchParams(window.location.search).get('seadebug') === '1') return true
  try { return window.localStorage.getItem('seadebug') === '1' } catch { return false }
})()
const log = (...a: unknown[]) => { if (DEBUG) console.log('[sea]', ...a) }

export function openSeaPresence(opts: {
  userId: string
  onBeat: (friendId: string, b: Beat) => void
  /** THEY LANDED ONE. A separate event because it is a MOMENT rather than a
   *  state: it happens once, it must not be missed, and it must not wait for
   *  the next position beat to be worth sending. Costs one message per catch
   *  per watcher, which against 2Hz of position is a rounding error. */
  onLanded?: (friendId: string, perfect: boolean) => void
}): SeaPresence {
  const supabase = createClient()
  const listening = new Map<string, RealtimeChannel>()
  let mine: RealtimeChannel | null = null
  let mineReady = false
  let closed = false
  /** The last beat actually put on the wire, for the move gate. */
  let sent: { x: number; y: number; f: number; p: Pose; at: number } | null = null
  /** Who we have been told to listen to, whether or not the socket is up yet. */
  let wanted = new Set<string>()

  /**
   * REALTIME AUTHORIZATION, AND IT HAS TO FINISH FIRST.
   *
   * `setAuth()` returns a Promise. The first cut called it with `void` and
   * subscribed on the next line, which is a RACE — a private channel's join is
   * refused unless the socket already carries the JWT, and whether it does
   * depends on whether an async call happened to have resolved.
   *
   * It shipped, and it failed exactly the way a race fails: two captains with a
   * valid pact, one able to see the other and not the reverse. Both clients ran
   * the same code and only one of them won. Nothing in the database was wrong
   * and nothing was logged, because a refused join is a status on a callback
   * this code was ignoring.
   *
   * So every channel now waits on this, and `subscribeAll` is the only place
   * that opens one.
   */
  const ready = supabase.realtime.setAuth().catch(() => {})

  /**
   * ── A REFUSED CHANNEL HAS TO BE ABLE TO COME BACK ───────────────────────
   *
   * It could not. A channel that errored stayed in its map, and every path
   * that opens one skips a key it already holds, so one failure was permanent
   * for the life of the page. That is not a rare corner: it swallows a token
   * that had not landed yet, a policy fixed while somebody had the tab open, a
   * tunnel, a laptop lid, a phone changing cell. All of them presented as
   * "multiplayer just does not work" with no way back but a reload, and no
   * reason to think a reload was what it wanted.
   *
   * So a failure drops the channel and tries again, backing off 1s, 2s, 4s to
   * a 30s ceiling and resetting the moment anything succeeds. `setAuth` runs
   * before each retry because the most likely cause is a JWT the socket does
   * not have yet, and it is a no-op when the token has not changed.
   */
  const tries = new Map<string, number>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const BACKOFF_MAX = 30_000

  function retry(key: string, open: () => void) {
    if (closed || timers.has(key)) return
    const n = (tries.get(key) ?? 0) + 1
    tries.set(key, n)
    const wait = Math.min(BACKOFF_MAX, 1000 * Math.pow(2, n - 1))
    log('retrying', key, `in ${wait}ms (attempt ${n})`)
    timers.set(key, setTimeout(() => {
      timers.delete(key)
      if (closed) return
      // The token first. It is the likeliest thing to have been wrong and the
      // cheapest thing to put right.
      void supabase.realtime.setAuth().catch(() => {}).then(() => {
        if (!closed) open()
      })
    }, wait))
  }

  function settled(key: string) {
    tries.delete(key)
    const t = timers.get(key)
    if (t) { clearTimeout(t); timers.delete(key) }
  }

  /** Open your own channel and everything you have been asked to listen to.
   *  Safe to call more than once; existing channels are left alone. */
  function subscribeAll() {
    if (closed) return
    if (!mine) {
      // YOUR OWN CHANNEL, the only one you may speak on. `self: false` because
      // the one boat that never needs a position update over the network is
      // your own; it is right there in `pos`.
      mine = supabase.channel(`sea:${opts.userId}`, {
        config: { private: true, broadcast: { self: false } },
      })
      mine.subscribe(status => {
        mineReady = status === 'SUBSCRIBED'
        log('own channel', `sea:${opts.userId}`, status)
        presenceStats.own = status
        if (status === 'SUBSCRIBED') settled('mine')
        // A refused join is the failure mode this whole comment is about. Say
        // so, rather than going quiet and looking like "presence is broken",
        // and then GO AND TRY AGAIN.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (status !== 'CLOSED') console.warn('[sea] could not open your own channel:', status)
          const dead = mine
          mine = null
          mineReady = false
          if (dead) void supabase.removeChannel(dead)
          retry('mine', () => { if (!mine) subscribeAll() })
        }
      })
    }
    for (const id of wanted) if (!listening.has(id)) listen(id)
  }

  void ready.then(subscribeAll)

  // AND AGAIN WHEN THE TOKEN ROLLS. Supabase refreshes the JWT on its own
  // schedule, and the socket keeps using whatever it was handed at join time —
  // so a chart left open long enough would quietly stop hearing anybody. This
  // is cheap: setAuth on an unchanged token is a no-op.
  const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
    if (closed) return
    if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
      // AND RE-OPEN WHATEVER IS DOWN. A fresh token is the one event most
      // likely to turn a refused join into a working one, so it is the worst
      // possible moment to be sitting on a backoff.
      void supabase.realtime.setAuth().catch(() => {}).then(() => {
        if (closed) return
        for (const key of [...timers.keys()]) settled(key)
        subscribeAll()
      })
    }
  })

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
      // The pose is cosmetic and comes off another player's browser, so it is
      // clamped to the three frames that exist rather than trusted. Anything
      // else reads as idle.
      const p: Pose = b.p === 1 ? 1 : b.p === 2 ? 2 : 0
      // Their stamp, or nothing. An older client sends no `t` and the reader
      // falls back to arrival times, which is what it did before this.
      const st = Number(b.t)
      log('beat IN from', id.slice(0, 8), x, y, 'pose', p)
      presenceStats.in++
      presenceStats.lastIn[id] = Date.now()
      opts.onBeat(id, { x, y, f: b.f === -1 ? -1 : 1, p, t: Number.isFinite(st) ? st : undefined })
    })
    ch.on('broadcast', { event: 'fish' }, msg => {
      const m = msg.payload as { perfect?: unknown } | null
      opts.onLanded?.(id, m?.perfect === true)
    })
    ch.subscribe(status => {
      log('listening to', `sea:${id}`, status)
      presenceStats.listens[id] = status
      if (status === 'SUBSCRIBED') settled(id)
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (status !== 'CLOSED') console.warn(`[sea] could not listen to ${id}:`, status)
        const dead = listening.get(id)
        listening.delete(id)
        if (dead) void supabase.removeChannel(dead)
        // Only chase somebody we still want to hear. A channel closed because
        // they went offline must not be reopened forever.
        retry(id, () => { if (wanted.has(id) && !listening.has(id)) listen(id) })
      }
    })
    listening.set(id, ch)
  }

  return {
    setCrew(ids: string[]) {
      if (closed) return
      wanted = new Set(ids.filter(id => id && id !== opts.userId))
      for (const [id, ch] of listening) {
        if (!wanted.has(id)) {
          void supabase.removeChannel(ch)
          listening.delete(id)
        }
      }
      // And stop chasing anybody who has gone: a pending retry for a captain
      // who logged off would otherwise reopen a channel nobody wants.
      for (const key of [...timers.keys()]) {
        if (key !== 'mine' && !wanted.has(key)) settled(key)
      }
      // Only opens anything once the JWT is on the socket. Before that this
      // records who to listen to and subscribeAll picks it up.
      void ready.then(subscribeAll)
    },

    send(b: Beat) {
      if (closed || !mine || !mineReady) {
        presenceStats.blocked = closed ? 'closed' : !mine ? 'no channel' : 'not subscribed'
        log('beat BLOCKED', presenceStats.blocked)
        return
      }
      // THE MOVE GATE. Cheap to call every beat and mostly says no.
      //
      // A CHANGE OF POSE ALWAYS GETS THROUGH, and that exception is the whole
      // reason fishing is visible at all: somebody working a rod is standing
      // still by definition, so the gate that exists to stop a moored boat
      // costing anything would have swallowed every frame of it. Casting,
      // hooking and landing are three sends across a catch that lasts the best
      // part of a minute, which is cheaper than the position beats the same
      // captain sends while merely sailing past.
      const posed = (b.p ?? 0)
      if (sent && posed === sent.p) {
        const moved = Math.hypot(b.x - sent.x, b.y - sent.y)
        const stale = Date.now() - sent.at > IDLE_MS
        const same = moved < 0.5 && b.f === sent.f
        if (moved < MOVE_MIN && !(stale && !same)) return
      }
      sent = { x: b.x, y: b.y, f: b.f, p: posed, at: Date.now() }
      presenceStats.out++
      presenceStats.blocked = ''
      log('beat OUT', b.x, b.y, 'pose', posed)
      // STAMPED AT THE MOMENT IT LEAVES, so the far end can measure how long
      // the boat actually took to cover the ground rather than how long the
      // network took to say so.
      void mine.send({ type: 'broadcast', event: 'pos', payload: { ...b, t: Date.now() } })
    },

    landed(perfect: boolean) {
      if (closed || !mine || !mineReady) return
      void mine.send({ type: 'broadcast', event: 'fish', payload: { perfect } })
    },

    close() {
      closed = true
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
      tries.clear()
      authSub?.subscription.unsubscribe()
      for (const ch of listening.values()) void supabase.removeChannel(ch)
      listening.clear()
      wanted = new Set()
      if (mine) void supabase.removeChannel(mine)
      mine = null
      mineReady = false
    },
  }
}
