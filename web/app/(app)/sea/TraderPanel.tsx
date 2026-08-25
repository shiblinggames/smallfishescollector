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

import { useState } from 'react'
import { motion } from 'framer-motion'
import { getBait } from '@/lib/bait'
import { vibrate } from '@/lib/haptics'
import { KIND_LABEL, type Trader } from '@/lib/seaTraders'
import { strikeDeal, sellToResident, buyRunnerRod } from './traderActions'
import { RODS } from '@/lib/rods'

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
          width: '100%', maxWidth: 380, borderRadius: 18, padding: '1.15rem',
          // Opaque base. This sits on painted water and a translucent panel over
          // art is unreadable at the exact moment it has something to say.
          background: 'rgba(10,16,22,0.98)',
          border: '1px solid rgba(255,206,138,0.32)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
        }}>

        <p className="font-karla font-700 uppercase" style={{
          fontSize: '0.58rem', letterSpacing: '0.16em', color: 'rgba(255,206,138,0.75)',
        }}>{KIND_LABEL[trader.kind]}</p>
        <p className="font-cinzel font-700" style={{
          fontSize: '1.15rem', color: '#f2ead8', marginTop: 2,
        }}>{trader.name}</p>

        <p className="font-karla" style={{
          fontSize: '0.86rem', color: '#b9cbd8', lineHeight: 1.55, marginTop: 10,
          fontStyle: 'italic',
        }}>{trader.line}</p>

        {/* ── THE OFFER ─────────────────────────────────────────────────
            Stated plainly. The flavour above is allowed its charm; the
            numbers are not, because a player deciding whether to spend
            needs to know exactly what happens. */}
        <div style={{
          marginTop: 14, padding: '0.85rem 0.95rem', borderRadius: 12,
          background: 'rgba(255,255,255,0.045)',
          border: '1px solid rgba(255,255,255,0.09)',
        }}>
          {trader.deal === 'rod' ? (
            <>
              <p className="font-karla font-700 uppercase" style={{
                fontSize: '0.54rem', letterSpacing: '0.16em', color: '#c4b5fd',
              }}>Not sold ashore</p>
              <p className="font-cinzel font-700" style={{ fontSize: '1.02rem', color: '#f6ecd6', marginTop: 3 }}>
                {rod?.name ?? 'A rod'}
              </p>
              <p className="font-karla font-700" style={{ fontSize: '0.92rem', color: '#f0c040', marginTop: 4 }}>
                {trader.cost.toLocaleString()} ⟡
              </p>
              <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginTop: 6, lineHeight: 1.6 }}>
                No chandler ashore stocks this one. He will be gone when the
                light comes back, but there is always another night and always
                another runner.
              </p>
            </>
          ) : trader.deal === 'talk' ? (
            // A talker's whole offer IS the line above. Repeating it here, or
            // dressing it as a transaction, would make a conversation look like
            // a vending machine that failed.
            <p className="font-karla font-600" style={{
              fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 1.5,
            }}>
              {trader.topic === 'hint' ? 'Worth remembering.' : 'Something they heard.'}
            </p>
          ) : trader.deal === 'resident' ? (
            <>
              <p className="font-cinzel font-700" style={{ fontSize: '0.98rem', color: '#f6ecd6' }}>
                Sell the whole hold
              </p>
              <p className="font-karla font-700" style={{ fontSize: '0.92rem', color: '#f0c040', marginTop: 4 }}>
                {Math.round(trader.rate * 100)}% of market value
              </p>
              {/* THE WHOLE POINT, said plainly. A player deciding whether to
                  sail home needs the comparison in front of them, not the
                  memory of a number from another screen. */}
              <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginTop: 6, lineHeight: 1.6 }}>
                Paid now, right here.<br />
                The market ashore pays full price, but you have to sail back for
                it and wait for it to settle.
              </p>
            </>
          ) : trader.deal === 'bait' ? (
            <>
              <p className="font-cinzel font-700" style={{ fontSize: '0.98rem', color: '#f6ecd6' }}>
                {trader.qty} {bait?.name ?? 'bait'}
              </p>
              <p className="font-karla font-700" style={{ fontSize: '0.92rem', color: '#f0c040', marginTop: 4 }}>
                {trader.cost.toLocaleString()} ⟡
                <span className="font-karla font-600" style={{
                  fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginLeft: 8,
                  textDecoration: 'line-through',
                }}>{trader.shopCost.toLocaleString()} ⟡</span>
              </p>
              <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#7fd6a0', marginTop: 4 }}>
                {saving}% under the shop
              </p>
            </>
          ) : trader.deal === 'buy' ? (
            <>
              <p className="font-cinzel font-700" style={{ fontSize: '0.98rem', color: '#f6ecd6' }}>
                Sell the whole hold
              </p>
              <p className="font-karla font-700" style={{ fontSize: '0.92rem', color: '#f0c040', marginTop: 4 }}>
                {Math.round(trader.rate * 100)}% of market value
              </p>
              <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginTop: 4, lineHeight: 1.5 }}>
                Paid now, no settling. Better than a quick sell on the dock and
                worse than working the market yourself.
              </p>
            </>
          ) : null}
        </div>

        {done && (
          <p className="font-karla font-700" style={{ fontSize: '0.84rem', color: '#7fd6a0', marginTop: 12, textAlign: 'center' }}>
            {done}
          </p>
        )}
        {err && (
          <p className="font-karla font-600" style={{ fontSize: '0.8rem', color: '#e6a0a0', marginTop: 12, textAlign: 'center', lineHeight: 1.5 }}>
            {err}
          </p>
        )}
        {!spent && !err && !isResident && !isTalk && (
          <p className="font-karla font-600" style={{
            fontSize: '0.66rem', color: 'rgba(255,255,255,0.35)', marginTop: 10, textAlign: 'center',
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
                flex: 1, padding: '0.72rem', borderRadius: 11, fontSize: '0.88rem',
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
          <button onClick={onClose}
            className="font-karla font-700"
            style={{
              flex: spent ? 1 : 0.8, padding: '0.72rem', borderRadius: 11, fontSize: '0.86rem',
              color: '#cfe0ec', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.16)', cursor: 'pointer',
            }}>
            {isTalk ? 'Thank them' : spent ? 'Sail on' : 'No thanks'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
