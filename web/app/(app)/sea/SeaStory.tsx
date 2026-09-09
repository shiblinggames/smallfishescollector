'use client'

// ── A CAMPAIGN CUTSCENE, PLAYED FROM THE DECK ───────────────────────────────
//
// The story beats out in the bays are posts on rocks you pull alongside and
// read. What they open is the SAME scene the campaign map opens — the same
// component, the same lines, the same server write that marks it read — because
// a second player would be a second version of the story and the two would drift
// the first time somebody edited a line.
//
// `StoryScene` is `/expeditions`' own kit and it portals itself to the body, so
// it lands over the chart without the chart having to know anything about it.
//
// ── WHY THIS IS ITS OWN FILE ────────────────────────────────────────────────
//
// SeaMap is already twelve thousand lines and the scene kit drags in the whole
// cutscene pipeline behind it. Held behind a dynamic import, none of it is
// fetched until the first post is actually read — which for a captain who never
// leaves the fishing grounds is never.

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import StoryScene from '@/app/(app)/expeditions/StoryScene'
import { markStoryNodeRead, claimMilestoneNode, claimScoutDebt } from '@/app/(app)/expeditions/raidMapActions'
import { SCENE_BACKDROPS, type RaidNode } from '@/lib/raidMap'
import { nodeSheet } from './nodeSheetActions'
import { vibrate } from '@/lib/haptics'

const GOLD = '#f0c040'

export default function SeaStory({ node, cleared, intro = false, onDone, onCleared }: {
  node: RaidNode
  /** Already read. A replay: the closing button just shuts it, and Skip is
   *  allowed, because the beat has already been earned once. */
  cleared: boolean
  /**
   * AN INTRO, NOT THE BEAT ITSELF.
   *
   * On a milestone or an event the scene explains what you have sailed into and
   * the claim or the choice after it is the real clear. So this one writes
   * NOTHING — the caller opens the sheet when it finishes — and Skip stays off
   * for a first watch, because the scene is still the first time you are told
   * what the thing in front of you is.
   */
  intro?: boolean
  onDone: () => void
  /** Read, and said at once — see the note on SeaNodeSheet's own. */
  onCleared?: (id: string) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function finish() {
    // A REPLAY WRITES NOTHING, and neither does an intro. One is already read;
    // the other has not been earned yet and the sheet behind it is what earns
    // it. In both cases the only thing left to do here is close.
    if (cleared || intro) { onDone(); return }
    startTransition(async () => {
      // ── A PAYOFF BEAT IS CLAIMED, NOT MERELY READ ──────────────────
      //
      // `scout_debt` is a story node carrying a `payoff`: mercy shown at an
      // earlier fork pays back here in coin and Nav XP. Its action is
      // `claimScoutDebt`, and this called `markStoryNodeRead` for every story
      // node alike — which marks it cleared and grants NOTHING. The claim is
      // idempotent on an already-cleared node, so reading that beat from the
      // deck did not defer the payoff, it forfeited it permanently. The map
      // has always branched here; the water never learned to.
      const res = node.payoff ? await claimScoutDebt(node.id) : await markStoryNodeRead(node.id)
      if (res && 'error' in res) { setErr(res.error); return }
      // The purse changed under the header on every other surface.
      if ('newDoubloons' in res && res.doubloonsDelta !== 0) {
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloons }))
      }
      // ── AND SOMEBODY JUST JOINED THE POOL ──────────────────────────
      //
      // A gate beat adds its legendary to the recruit board as you read it, and
      // the reveal is the whole reason the beat is staged. This return value
      // was being dropped on the floor out here: the crew was unlocked and
      // nothing said so, so a captain met their new legendary by scrolling past
      // an unfamiliar face on the recruit card weeks later.
      //
      // Dispatched rather than rendered, because this component unmounts on the
      // very next line. Same event name /expeditions uses, so the two surfaces
      // cannot celebrate differently.
      if ('unlockedLegendary' in res && res.unlockedLegendary) {
        window.dispatchEvent(new CustomEvent('legendary-unlocked', { detail: res.unlockedLegendary }))
      }
      onCleared?.(node.id)
      router.refresh()
      onDone()
    })
  }

  if (!node.scene) return null

  // ── A TOLL IS SETTLED WHERE IT WAS DEMANDED ──────────────────────────────
  //
  // The Bilge Eels name their thousand in the scene. It used to end there, and
  // a panel then opened over the sea asking for the same thousand: the deal
  // struck twice, once in the film and once in a form. So the last beat IS the
  // deal now — see StoryScene's ctaSlot.
  //
  // KEYED OFF `intro`, NOT `cleared`. A milestone's scene is ALWAYS an intro —
  // the caller passes `cleared` alongside it purely to suppress the read-write,
  // because the payment is what clears this node, not the watching. And the
  // chart only opens an intro for a node that is not settled yet (see
  // openNode), so an intro on a milestone is a toll that is still owed.
  const toll = intro && node.type === 'milestone' && node.milestone ? node.milestone.amount : null

  return (
    <>
      <StoryScene
        title={node.label}
        lines={node.scene}
        ctaLabel={cleared ? 'Close' : (node.detail?.ctaLabel ?? 'Log it →')}
        pending={pending}
        accent={node.sceneAccent}
        background={SCENE_BACKDROPS[node.id]}
        ctaSlot={toll != null
          ? <SceneToll cost={toll} accent={node.sceneAccent}
              onPay={() => new Promise<void>((resolve, reject) => {
                startTransition(async () => {
                  const res = await claimMilestoneNode(node.id)
                  if (res && 'error' in res) { reject(new Error(res.error)); return }
                  // The purse changed under the header on every other surface.
                  window.dispatchEvent(new CustomEvent('doubloons-changed'))
                  onCleared?.(node.id)
                  router.refresh()
                  resolve()
                  onDone()
                })
              })}
              onWalk={onDone} />
          : undefined}
        onComplete={finish}
        onSkip={finish}
        // No Skip on a first watch, exactly as the campaign map has it: the beat
        // is the payoff for everything that led to it, and a one-tap Skip in the
        // top bar from line one is easy to hit by accident and impossible to
        // undo in the moment.
        allowSkip={cleared && !intro}
      />
      {err && (
        <p role="alert" className="font-karla font-600" style={{
          position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
          zIndex: 100000, margin: 0, padding: '0.5rem 0.9rem', borderRadius: 10,
          background: 'rgba(26,10,10,0.96)', border: '1px solid rgba(230,160,160,0.5)',
          color: '#e6a0a0', fontSize: '0.82rem',
        }}>{err}</p>
      )}
    </>
  )
}


/* ── THE TERMS, IN THE PLATE THEY WERE SPOKEN FROM ──────────────────────────
   The price, what you are carrying, and the two answers. It sits where the
   closing button would be, so the scene never breaks: the thugs are still on
   the stage, the letterbox is still down, and the water behind them is the
   water you are being charged to cross.

   GOLD, NOT THE SCENE'S ACCENT. Everything else here takes `sceneAccent` — the
   Bilge Strait's is a cold blue — but this is money, and money is gold on every
   other surface in the game. The one thing on screen that is going to leave
   your purse should not be wearing the scene's colour.

   AND THERE IS ALWAYS A WAY OUT. A first watch has no Skip (the beat is the
   payoff for everything that led to it), so without this a captain short of the
   toll would be standing in a cutscene with one dead button. Walking away
   writes nothing and the Eels are still there tomorrow. */
function SceneToll({ cost, accent, onPay, onWalk }: {
  cost: number
  accent?: string
  onPay: () => Promise<void>
  onWalk: () => void
}) {
  const [purse, setPurse] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)

  // Read on open, not threaded in: the purse changes as you play, and a number
  // captured when the chart loaded would be a scene about a captain who no
  // longer exists.
  useEffect(() => {
    let live = true
    nodeSheet().then(r => {
      if (!live) return
      if ('error' in r) setErr(r.error)
      else setPurse(r.doubloons)
    }, () => { if (live) setErr('Could not reach the hold.') })
    return () => { live = false }
  }, [])

  const short = purse != null && purse < cost
  const ready = purse != null && !short && !paying

  return (
    // The terms ARRIVE. They appear on the last line of a scene that has been
    // typing at you for nine, and a price that simply blinks into the plate
    // reads as the film ending and a form starting, which is the whole thing
    // this replaced.
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: 'easeOut' }}
      style={{ width: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
        padding: '0.5rem 0.7rem', borderRadius: 11, marginBottom: '0.6rem',
        background: 'rgba(240,192,64,0.08)', border: '1px solid rgba(240,192,64,0.24)',
      }}>
        <span className="font-karla font-700 uppercase" style={{
          fontSize: '0.54rem', letterSpacing: '0.16em', color: 'rgba(196,169,106,0.85)',
        }}>Their price</span>
        <span className="font-cinzel font-700" style={{
          fontSize: '1rem', color: GOLD, fontVariantNumeric: 'tabular-nums',
        }}>{cost.toLocaleString()} ⟡</span>
      </div>

      <p className="font-karla" style={{
        margin: '0 0 0.6rem', fontSize: '0.72rem', textAlign: 'right',
        color: short ? '#e6a0a0' : 'rgba(240,237,232,0.5)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {purse == null ? 'Counting what you carry…'
          : short ? `You are carrying ${purse.toLocaleString()} ⟡. You need ${(cost - purse).toLocaleString()} ⟡ more.`
            : `You are carrying ${purse.toLocaleString()} ⟡.`}
      </p>

      <button type="button" disabled={!ready}
        onClick={e => {
          e.stopPropagation()
          if (!ready) return
          setErr(null); setPaying(true); vibrate(12)
          onPay().catch((x: Error) => { setErr(x.message); setPaying(false) })
        }}
        className="font-cinzel font-800 uppercase tracking-[0.06em] tap"
        style={{
          width: '100%', padding: '0.8rem', borderRadius: 11, fontSize: '0.95rem',
          color: ready ? '#1a1206' : 'rgba(240,237,232,0.45)',
          background: ready ? `linear-gradient(180deg, ${GOLD}, ${GOLD}cc)` : 'rgba(255,255,255,0.06)',
          border: `1px solid ${ready ? GOLD : 'rgba(255,255,255,0.14)'}`,
          boxShadow: ready ? `0 0 20px ${GOLD}33` : 'none',
          cursor: ready ? 'pointer' : 'default',
        }}>
        {paying ? '…' : short ? 'Not enough aboard' : `Pay ${cost.toLocaleString()} ⟡`}
      </button>

      <button type="button" onClick={e => { e.stopPropagation(); onWalk() }}
        className="font-karla font-700 uppercase tap"
        style={{
          display: 'block', width: '100%', marginTop: 8, padding: '0.4rem',
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '0.56rem', letterSpacing: '0.16em',
          color: accent ? `${accent}99` : 'rgba(240,237,232,0.45)',
        }}>
        Keep your purse shut
      </button>

      {err && (
        <p role="alert" className="font-karla font-600" style={{
          margin: '0.5rem 0 0', fontSize: '0.74rem', color: '#e6a0a0', textAlign: 'center',
        }}>{err}</p>
      )}
    </motion.div>
  )
}
