'use client'

// PULLING ALONGSIDE.
//
// Deliberately not a shop. A shop is a grid you browse; this is one person with
// one thing to say and one thing to offer, and then you sail on. That is the
// whole reason to meet someone at sea rather than walk into the Mainland.
//
// The panel never sends a price. It sends the trader's key and nothing else,
// and the server rebuilds who that is and what they were asking. Everything
// shown here is for the player to read, not for the server to believe.

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getBait } from '@/lib/bait'
import { vibrate } from '@/lib/haptics'
import { KIND_LABEL, type Trader } from '@/lib/seaTraders'
import { strikeDeal, sellToResident, buyRunnerRod } from './traderActions'
import { RODS } from '@/lib/rods'
import { folkById } from '@/lib/seaFolk'
import { folkState, talkToFolk, giftToFolk, holdForGifting, type Rapport } from './folkActions'
import FolkScene, { type SceneGain } from './FolkScene'

export default function TraderPanel({
  trader, alreadyDealt, dealsLeft, onDealt, onHoldEmptied, onClose,
}: {
  trader: Trader
  alreadyDealt: boolean
  dealsLeft: number
  onDealt: (key: string) => void
  /** Both sell paths clear the hold outright, so the map's counter has to hear
   *  about it or it keeps showing a boat full of fish you no longer have. */
  onHoldEmptied: () => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<string | null>(null)

  const bait = trader.deal === 'bait' ? getBait(trader.baitType) : null
  const saving = trader.deal === 'bait'
    ? Math.round((1 - trader.cost / trader.shopCost) * 100)
    : 0

  /**
   * TELL THE NAV. The coin is already in the account — every one of these
   * actions grants it server-side and hands back the new total — but the
   * balance in the header is read once when the page renders and never asked
   * again, so a sale out here looked like it had done nothing.
   *
   * `doubloons-changed` is the house convention for exactly this. The detail
   * MUST be a number: Nav renders displayDoubloons.toLocaleString(), so a
   * dispatch with no detail sets it to null and takes the whole page to Next's
   * error screen.
   */
  function announce(total: number | undefined) {
    if (typeof total !== 'number') return
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: total }))
  }

  /** How far through a talker's run we are. Resets when the panel closes,
   *  because the run is theirs and hearing it again from the top is how a
   *  person you already spoke to behaves. */
  const [said, setSaid] = useState(0)

  // ── THE FRIENDSHIP, if this is one of the regulars ─────────────────
  // Loaded when the panel opens rather than held by the map: a hail is rare
  // and the map already carries enough live state.
  const folk = trader.folkId ? folkById(trader.folkId) : null
  const [rap, setRap] = useState<Rapport | null>(null)
  const [hold, setHold] = useState<{ id: number; name: string; qty: number; habitat: string | null }[]>([])
  /** What they just said. Fed to the scene as a new turn rather than
   *  replacing anything, so the exchange keeps its thread. */
  const [spoke, setSpoke] = useState<{ text: string; nonce: number } | null>(null)
  /** The scene, and the last thing that moved in it. */
  const [scene, setScene] = useState(false)
  const [gain, setGain] = useState<SceneGain | null>(null)

  useEffect(() => {
    if (!folk) return
    let alive = true
    void folkState().then(rows => {
      if (alive) setRap(rows.find(r => r.folkId === folk.id) ?? null)
    })
    void holdForGifting().then(h => { if (alive) setHold(h) })
    return () => { alive = false }
  }, [folk])

  async function haveAWord() {
    if (busy || !folk) return
    setBusy(true); setErr(''); vibrate(10)
    try {
      const res = await talkToFolk(folk.id)
      if ('error' in res) { setErr(res.error) }
      else {
        setSpoke(v => ({ text: res.line, nonce: (v?.nonce ?? 0) + 1 }))
        setGain({ points: res.points, gained: res.points - (rap?.points ?? 0), tier: res.tier, tierUp: res.tierUp })
        setRap(r => (r ? { ...r, points: res.points, tier: res.tier, chattedToday: true } : r))
      }
    } catch { setErr('They did not hear you.') }
    setBusy(false)
  }

  async function handOver(fishId: number) {
    if (busy || !folk) return
    setBusy(true); setErr(''); vibrate(12)
    try {
      const res = await giftToFolk(folk.id, fishId)
      if ('error' in res) { setErr(res.error) }
      else {
        setSpoke(v => ({ text: res.line, nonce: (v?.nonce ?? 0) + 1 }))
        setGain({
          points: res.points, gained: res.points - (rap?.points ?? 0),
          tier: res.tier, tierUp: res.tierUp, how: res.how,
        })
        setRap(r => (r ? { ...r, points: res.points, tier: res.tier, giftedToday: true } : r))
        setHold(h => h.map(f => (f.id === fishId ? { ...f, qty: f.qty - 1 } : f)).filter(f => f.qty > 0))
        vibrate(res.how === 'loved' ? [0, 40, 60, 90] : 14)
      }
    } catch { setErr('That did not reach them.') }
    setBusy(false)
  }

  const isResident = trader.deal === 'resident'
  const isTalk = trader.deal === 'talk'
  const rod = trader.deal === 'rod' ? RODS.find(r => r.tier === trader.rodTier) : null

  async function buyRod() {
    if (busy || trader.deal !== 'rod') return
    setBusy(true); setErr(''); vibrate(14)
    try {
      const res = await buyRunnerRod(trader.key)
      if ('error' in res) { setErr(res.error); setBusy(false); return }
      announce(res.doubloons)
      onDealt(trader.key)
      setDone(`The ${rod?.name ?? 'rod'} is yours. Equip it from the tackle shop.`)
      vibrate([0, 40, 60, 80])
    } catch {
      setErr('The deal fell through. Try again.')
    }
    setBusy(false)
  }

  async function sellHold() {
    if (busy || trader.deal !== 'resident') return
    setBusy(true); setErr(''); vibrate(14)
    try {
      const res = await sellToResident(trader.zoneId)
      if ('error' in res) { setErr(res.error); setBusy(false); return }
      announce(res.doubloons)
      onHoldEmptied()
      setDone(`${res.earned.toLocaleString()} ⟡ for the lot. Hold's empty.`)
      vibrate([0, 30, 40, 60])
    } catch {
      setErr('The sale fell through. Try again.')
    }
    setBusy(false)
  }

  async function strike() {
    if (busy) return
    setBusy(true)
    setErr('')
    vibrate(14)
    try {
      const res = await strikeDeal(trader.key)
      if ('error' in res) { setErr(res.error); setBusy(false); return }
      announce(res.doubloons)
      if (res.earned != null) onHoldEmptied()
      onDealt(trader.key)
      setDone(
        res.earned != null
          ? `${res.earned.toLocaleString()} ⟡ for the lot. Hold's empty.`
          : `${res.qty} ${bait?.name ?? 'bait'} aboard.`,
      )
      vibrate([0, 30, 40, 60])
    } catch {
      // A server action that rejects rather than returning { error } would
      // otherwise leave the button spinning for ever.
      setErr('The deal fell through. Try again.')
    }
    setBusy(false)
  }

  // A resident is a shop, not an encounter: you can sell to them as often as
  // you have fish, and they are outside the daily deal cap entirely.
  const spent = !isResident && (alreadyDealt || done !== null)

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute', inset: 0, zIndex: 40, display: 'flex',
        alignItems: 'flex-end', justifyContent: 'center', padding: '1.25rem',
        background: 'rgba(2,8,14,0.6)', backdropFilter: 'blur(3px)',
      }}>
      <motion.div
        initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 380, borderRadius: 18, padding: '1.15rem',
          // Opaque base. This sits on painted water and a translucent panel over
          // art is unreadable at the exact moment it has something to say.
          background: 'rgba(10,16,22,0.98)',
          border: '1px solid rgba(255,206,138,0.32)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
        }}>

        {/* OUT. The footer has "Sail on" and "No thanks", which are ANSWERS —
            and somebody who opened this by accident, or who just wants the
            panel gone, should not have to pick one. Every other overlay on this
            chart closes from this corner. */}
        <button type="button" onClick={onClose} aria-label="Close" title="Close"
          style={{
            position: 'absolute', top: 12, right: 12,
            width: 28, height: 28, borderRadius: '50%', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
            color: '#cfcabf', cursor: 'pointer',
          }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>

        <p className="font-karla font-700 uppercase" style={{
          fontSize: '0.744rem', letterSpacing: '0.16em', color: 'rgba(255,206,138,0.75)',
          paddingRight: 34,
        }}>
          {KIND_LABEL[trader.kind]}
          {/* WHO THEY ARE, not what they are about to hand you.
              This used to read "Knows something useful" or "Heard something",
              which labelled the CONTENT and quietly turned every stranger into
              a category of loot. The persona's own mood says something about
              the person instead, and you find out what they know by listening,
              which is the right order for a conversation. */}
          {trader.deal === 'talk' && (
            <span style={{ color: 'rgba(255,206,138,0.45)' }}>
              {' · '}{trader.mood}
            </span>
          )}
        </p>
        <p className="font-cinzel font-700" style={{
          fontSize: '1.56rem', color: '#f2ead8', marginTop: 2,
        }}>{trader.name}</p>

        {/* WHAT THEY SAY.
            For a talker this IS the content — the thing you sailed over for —
            so it is set as a quote rather than as a caption: bigger, lighter,
            with a rule down the side to mark it as speech. Everyone else gets
            the same line as flavour above an offer, which is a smaller job. */}
        <p className="font-karla" style={{
          fontSize: isTalk ? '1rem' : '0.92rem',
          color: isTalk ? '#dbe8f2' : '#b9cbd8',
          lineHeight: 1.6, marginTop: isTalk ? 14 : 10,
          fontStyle: 'italic',
          ...(isTalk ? {
            paddingLeft: '0.85rem',
            borderLeft: '2px solid rgba(255,206,138,0.45)',
          } : {}),
        }}>{trader.deal === 'talk' ? trader.lines[said % trader.lines.length] : trader.line}</p>

        {/* ── THE OFFER ─────────────────────────────────────────────────
            Stated plainly. The flavour above is allowed its charm; the
            numbers are not, because a player deciding whether to spend
            needs to know exactly what happens. */}
        {/* Nothing to show a talker here. The line above is the whole of it,
            and a bordered box repeating "Worth remembering" under it was a
            caption for something that had already been said — plus a pill
            floating in the middle of it. Both are gone; "go on" is a real
            button in the footer where the other actions live. */}
        {!isTalk && <div style={{
          marginTop: 14, padding: '0.85rem 0.95rem', borderRadius: 12,
          background: 'rgba(255,255,255,0.045)',
          border: '1px solid rgba(255,255,255,0.09)',
        }}>
          {trader.deal === 'rod' ? (
            <>
              <p className="font-karla font-700 uppercase" style={{
                fontSize: '0.66rem', letterSpacing: '0.16em', color: '#c4b5fd',
              }}>Not sold ashore</p>
              <p className="font-cinzel font-700" style={{ fontSize: '1.224rem', color: '#f6ecd6', marginTop: 3 }}>
                {rod?.name ?? 'A rod'}
              </p>
              <p className="font-karla font-700" style={{ fontSize: '1.104rem', color: '#f0c040', marginTop: 4 }}>
                {trader.cost.toLocaleString()} ⟡
              </p>
              <p className="font-karla font-600" style={{ fontSize: '0.84rem', color: 'rgba(255,255,255,0.5)', marginTop: 6, lineHeight: 1.6 }}>
                No chandler ashore stocks this one. He will be gone when the
                light comes back, but there is always another night and always
                another runner.
              </p>
            </>
          ) : trader.deal === 'resident' ? (
            <>
              <p className="font-cinzel font-700" style={{ fontSize: '1.176rem', color: '#f6ecd6' }}>
                Sell the whole hold
              </p>
              <p className="font-karla font-700" style={{ fontSize: '1.104rem', color: '#f0c040', marginTop: 4 }}>
                {Math.round(trader.rate * 100)}% of market value
              </p>
              {/* THE WHOLE POINT, said plainly. A player deciding whether to
                  sail home needs the comparison in front of them, not the
                  memory of a number from another screen. */}
              <p className="font-karla font-600" style={{ fontSize: '0.84rem', color: 'rgba(255,255,255,0.5)', marginTop: 6, lineHeight: 1.6 }}>
                Paid now, right here.<br />
                The market ashore pays full price, but the catch has to be
                aboard when you get there.
              </p>
            </>
          ) : trader.deal === 'bait' ? (
            <>
              <p className="font-cinzel font-700" style={{ fontSize: '1.176rem', color: '#f6ecd6' }}>
                {trader.qty} {bait?.name ?? 'bait'}
              </p>
              <p className="font-karla font-700" style={{ fontSize: '1.104rem', color: '#f0c040', marginTop: 4 }}>
                {trader.cost.toLocaleString()} ⟡
                <span className="font-karla font-600" style={{
                  fontSize: '0.864rem', color: 'rgba(255,255,255,0.45)', marginLeft: 8,
                  textDecoration: 'line-through',
                }}>{trader.shopCost.toLocaleString()} ⟡</span>
              </p>
              <p className="font-karla font-600" style={{ fontSize: '0.84rem', color: '#7fd6a0', marginTop: 4 }}>
                {saving}% under the shop
              </p>
            </>
          ) : trader.deal === 'buy' ? (
            <>
              <p className="font-cinzel font-700" style={{ fontSize: '1.176rem', color: '#f6ecd6' }}>
                Sell the whole hold
              </p>
              <p className="font-karla font-700" style={{ fontSize: '1.104rem', color: '#f0c040', marginTop: 4 }}>
                {Math.round(trader.rate * 100)}% of market value
              </p>
              <p className="font-karla font-600" style={{ fontSize: '0.84rem', color: 'rgba(255,255,255,0.5)', marginTop: 4, lineHeight: 1.5 }}>
                Paid now, no settling. Better than a quick sell on the dock and
                worse than working the market yourself.
              </p>
            </>
          ) : null}
        </div>}

        {/* HOW MUCH MORE THEY KNOW. Dots, not a fraction: it is a hint of how
            long the conversation runs, not a counter to complete. Nothing is
            gated on hearing all of them. */}
        {isTalk && trader.lines.length > 1 && (
          <div style={{ display: 'flex', gap: 5, marginTop: 14, justifyContent: 'center' }}>
            {trader.lines.map((_, i) => (
              <span key={i} aria-hidden style={{
                width: 5, height: 5, borderRadius: '50%',
                background: i === said % trader.lines.length
                  ? 'rgba(255,206,138,0.9)' : 'rgba(255,255,255,0.18)',
                transition: 'background 0.2s',
              }} />
            ))}
          </div>
        )}

        {done && (
          <p className="font-karla font-700" style={{ fontSize: '1.008rem', color: '#7fd6a0', marginTop: 12, textAlign: 'center' }}>
            {done}
          </p>
        )}
        {err && (
          <p className="font-karla font-600" style={{ fontSize: '0.96rem', color: '#e6a0a0', marginTop: 12, textAlign: 'center', lineHeight: 1.5 }}>
            {err}
          </p>
        )}
        {!spent && !err && !isResident && !isTalk && (
          <p className="font-karla font-600" style={{
            fontSize: '0.792rem', color: 'rgba(255,255,255,0.35)', marginTop: 10, textAlign: 'center',
          }}>
            {dealsLeft} {dealsLeft === 1 ? 'deal' : 'deals'} left today
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {!spent && !isTalk && (
            <button onClick={isResident ? sellHold : trader.deal === 'rod' ? buyRod : strike}
              disabled={busy || (!isResident && dealsLeft <= 0)}
              className="font-cinzel font-700"
              style={{
                flex: 1.2, padding: '0.8rem', borderRadius: 11, fontSize: '1.128rem',
                color: dealsLeft <= 0 ? 'rgba(242,234,216,0.4)' : '#f2ead8',
                background: 'rgba(255,206,138,0.16)',
                border: '1px solid rgba(255,206,138,0.45)',
                cursor: busy || dealsLeft <= 0 ? 'default' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}>
              {busy ? '…'
                : trader.deal === 'bait' ? 'Buy'
                  : trader.deal === 'rod' ? 'Buy the rod'
                    : 'Sell the hold'}
            </button>
          )}
          {/* KEEP THEM TALKING, as a real action in the footer rather than a
              pill floating in the middle of a caption box. A talker with more
              to say leads with it; the close button is the quieter of the two. */}
          {isTalk && trader.lines.length > 1 && (
            <button onClick={() => { vibrate(8); setSaid(n => n + 1) }}
              className="font-karla font-700"
              style={{
                flex: 1, padding: '0.8rem', borderRadius: 11, fontSize: '1.128rem',
                color: '#f2ead8', background: 'rgba(255,206,138,0.16)',
                border: '1px solid rgba(255,206,138,0.45)', cursor: 'pointer',
              }}>
              Go on
            </button>
          )}
          {/* SPEAK TO THEM opens the scene. One button here, because the
              conversation is not a control in a shop panel: it is a portrait,
              their voice typed out, and where you stand with them, and it gets
              the whole screen. */}
          {folk && rap && (
            <button onClick={() => { vibrate(10); setScene(true) }}
              className="font-cinzel font-700"
              style={{
                flex: 1.2, padding: '0.8rem', borderRadius: 11, fontSize: '1.02rem',
                color: '#f2ead8',
                background: (!rap.chattedToday || !rap.giftedToday)
                  ? `${folk.accent}26` : 'rgba(255,255,255,0.05)',
                border: `1px solid ${(!rap.chattedToday || !rap.giftedToday)
                  ? folk.accent + '73' : 'rgba(255,255,255,0.16)'}`,
                cursor: 'pointer',
              }}>
              Speak to {folk.name.split(' ')[0]}
            </button>
          )}
          {/* flex: 1 ALWAYS. It was 0.8 when it stood alone, which on a phone
              left it four fifths of the bar with a fifth of dead space beside
              it and no reason for the gap. */}
          <button onClick={onClose}
            className="font-karla font-700"
            style={{
              flex: 1, padding: '0.8rem', borderRadius: 11, fontSize: isTalk ? '0.94rem' : '0.9rem',
              color: '#cfe0ec', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.16)', cursor: 'pointer',
            }}>
            {isTalk ? 'Thank them' : spent ? 'Sail on' : 'No thanks'}
          </button>
        </div>
      </motion.div>

      {/* ── THE CONVERSATION, GIVEN THE SCREEN ──────────────────────────
          Everything about knowing one of the regulars happens in here: their
          face, their voice typed out, where you stand, and what moved. The
          panel behind it stays what it always was, which is a shop. */}
      {folk && rap && (
        <FolkScene
          folk={folk}
          open={scene}
          tier={rap.tier}
          points={rap.points}
          // HIS OWN HELLO, never a line from the tier pool. The pool is what
          // the day's word hands out, and opening on its first entry meant the
          // button promised something new and then repeated the sentence
          // already on the screen.
          opener={folk.greeting}
          gain={gain}
          resolved={spoke}
          canChat={!rap.chattedToday}
          canGift={!rap.giftedToday && hold.length > 0}
          hold={hold}
          busy={busy}
          onChat={haveAWord}
          onGift={handOver}
          onClose={() => { setScene(false); setGain(null); setSpoke(null) }}
        />
      )}
    </div>
  )
}
