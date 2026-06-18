'use client'

// Casino lobby — the one front door for all three tavern casino games.
// One shared chip purse (buy in / cash out here or at any table), a
// per-game session breakdown, and the three table cards. (Roulette
// released to the public 2026-06-11 after its prod tap-test.)

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { buyInCasino, cashOutCasino } from './actions'
import type { CasinoWallet, CasinoSessionNets, DenTopEarner } from './types'
import { CASINO_BUY_IN_PRESETS, CASINO_BUY_IN_MAX, DEN_PURSE_TIERS } from '../constants'
import BlackjackHubCard from '../BlackjackHubCard'
import FishSlotsCard from '../FishSlotsCard'
import RouletteHubCard from '../RouletteHubCard'
import { useAnimatedNumber } from '../useAnimatedNumber'
import { Avatar } from '@/app/(app)/leaderboard/boardUI'
import BecomeCaptainButton from '@/components/BecomeCaptainButton'

const GOLD = '#f0c040'
const MEMBER_START_CAP = DEN_PURSE_TIERS[0].cap
const MEMBER_MAX_CAP = DEN_PURSE_TIERS[DEN_PURSE_TIERS.length - 1].cap

export default function CasinoLobby({ initial, jackpotPot, topEarners }: {
  initial: CasinoWallet
  jackpotPot: number
  topEarners: DenTopEarner[]
}) {
  const [chips, setChips] = useState(initial.chips)
  const [doubloons, setDoubloons] = useState(initial.doubloons)
  const [sessionBuyIns, setSessionBuyIns] = useState(initial.sessionBuyIns)
  const [dailyBoughtIn, setDailyBoughtIn] = useState(initial.dailyBoughtIn)
  const [dailyCap, setDailyCap] = useState(initial.dailyCap)
  const [nets, setNets] = useState<CasinoSessionNets>(initial.sessionNets)
  const [buyInAmount, setBuyInAmount] = useState(500)
  const [showBuyPanel, setShowBuyPanel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Server-side updates (a hand settled, a spin landed, then the player
  // navigated back here) must reach the optimistic state — resync when
  // the server prop changes.
  useEffect(() => {
    setChips(initial.chips)
    setDoubloons(initial.doubloons)
    setSessionBuyIns(initial.sessionBuyIns)
    setDailyBoughtIn(initial.dailyBoughtIn)
    setDailyCap(initial.dailyCap)
    setNets(initial.sessionNets)
  }, [initial])

  const dailyRemaining = Math.max(0, dailyCap - dailyBoughtIn)
  const buyInCap = Math.min(CASINO_BUY_IN_MAX, doubloons, dailyRemaining)
  const canBuyIn = buyInAmount > 0 && buyInAmount <= buyInCap && !isPending
  const sessionTotal = nets.blackjack + nets.roulette + nets.slots
  const animatedChips = useAnimatedNumber(chips)
  const animatedTally = useAnimatedNumber(sessionTotal)
  // Buy panel is forced open when the purse is empty — that IS the
  // first-visit flow ("buy chips before you sit at a table").
  const panelOpen = chips === 0 || showBuyPanel

  function doBuyIn() {
    if (!canBuyIn) return
    setError(null)
    startTransition(async () => {
      const r = await buyInCasino(buyInAmount)
      if ('error' in r) { setError(r.error); return }
      setChips(r.newChips)
      setDoubloons(r.newDoubloons)
      setSessionBuyIns(r.sessionBuyIns)
      setDailyBoughtIn(r.dailyBoughtIn)
      setDailyCap(r.dailyCap)
      setShowBuyPanel(false)
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.newDoubloons }))
    })
  }

  function doCashOut() {
    if (chips <= 0 || isPending) return
    setError(null)
    startTransition(async () => {
      const r = await cashOutCasino()
      if ('error' in r) { setError(r.error); return }
      setChips(0)
      setDoubloons(r.newDoubloons)
      setSessionBuyIns(0)
      setNets({ blackjack: 0, roulette: 0, slots: 0 })
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: r.newDoubloons }))
    })
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {/* Header row. Side rails get equal flex so the title sits at
          the true center regardless of the link/balance widths. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href="/tavern" className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: '#a89878', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            ← Tavern
          </Link>
        </div>
        <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0e8d0', textAlign: 'center', whiteSpace: 'nowrap' }}>
          The Den
        </p>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <span className="font-karla" style={{ fontSize: '0.58rem', color: '#7a7672', whiteSpace: 'nowrap' }}>
            {doubloons.toLocaleString()} ⟡
          </span>
        </div>
      </div>

      {/* Wallet panel — the shared purse. Same wood/brass family as the
          Blackjack table so the lobby reads as part of the card room. */}
      <div style={{
        background: 'linear-gradient(180deg, #1a1410 0%, #0b0908 100%)',
        border: '1px solid rgba(196,169,106,0.25)',
        borderRadius: 16,
        padding: '1rem 1rem 0.9rem',
        boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.55rem', color: '#a68a4a' }}>Chips</p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: GOLD, lineHeight: 1 }}>
              {animatedChips.toLocaleString()} ⟡
            </p>
          </div>
          <div style={{ textAlign: 'center', minWidth: 88 }}>
            {sessionBuyIns > 0 && (() => {
              const color = animatedTally === 0 ? '#8a8478' : animatedTally > 0 ? '#7fd49a' : '#e07070'
              return (
                <>
                  <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.55rem', color: '#a68a4a' }}>Session</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color, lineHeight: 1 }}>
                    {animatedTally > 0 ? '+' : ''}{animatedTally.toLocaleString()} ⟡
                  </p>
                </>
              )
            })()}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {chips > 0 && (
              <button
                type="button"
                disabled={isPending}
                onClick={doCashOut}
                className="font-karla font-700 uppercase tracking-[0.1em]"
                style={{
                  padding: '0.5rem 0.85rem', borderRadius: 999,
                  background: 'rgba(196,169,106,0.1)',
                  border: '1px solid rgba(196,169,106,0.45)',
                  color: '#c4a96a',
                  fontSize: '0.62rem',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                }}
              >
                Cash Out
              </button>
            )}
          </div>
        </div>

        {/* Per-game session breakdown — only once a session is live. */}
        {sessionBuyIns > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 14,
            marginTop: 10, paddingTop: 10,
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            {([['Blackjack', nets.blackjack], ['Roulette', nets.roulette], ['Slots', nets.slots]] as const)
              .map(([game, net]) => (
                <div key={game} style={{ textAlign: 'center' }}>
                  <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.12em', color: '#7a7672' }}>{game}</p>
                  <p className="font-cinzel font-700" style={{
                    fontSize: '0.78rem', lineHeight: 1.3,
                    color: net === 0 ? '#8a8478' : net > 0 ? '#7fd49a' : '#e07070',
                  }}>
                    {net > 0 ? '+' : ''}{net.toLocaleString()} ⟡
                  </p>
                </div>
              ))}
          </div>
        )}

        {/* Buy-in — full panel when the purse is empty (first visit /
            after cash-out), collapsible top-up otherwise. */}
        <div style={{ marginTop: 12 }}>
          {panelOpen ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="font-karla" style={{ fontSize: '0.72rem', color: '#a09988', lineHeight: 1.5, textAlign: 'center' }}>
                {chips === 0 ? <>Trade doubloons for chips to sit at any table. Cash out any time.</> : <>Top up the purse. Chips work at every table.</>}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {CASINO_BUY_IN_PRESETS.map(amt => {
                  const disabled = amt > buyInCap
                  const selected = buyInAmount === amt
                  return (
                    <button
                      key={amt}
                      type="button"
                      disabled={disabled || isPending}
                      onClick={() => setBuyInAmount(amt)}
                      className="font-karla font-700"
                      style={{
                        padding: '0.7rem 0', borderRadius: 10,
                        background: selected ? 'rgba(240,192,64,0.12)' : 'rgba(4,10,20,0.5)',
                        border: `1px solid ${selected ? GOLD : 'rgba(255,255,255,0.12)'}`,
                        color: disabled ? '#3a3835' : selected ? GOLD : '#9a9488',
                        fontSize: '0.85rem',
                        cursor: disabled || isPending ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {amt.toLocaleString()} ⟡
                    </button>
                  )
                })}
              </div>
              <motion.button
                type="button"
                disabled={!canBuyIn}
                onClick={doBuyIn}
                whileTap={canBuyIn ? { y: 3, scale: 0.94 } : undefined}
                transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                className="font-cinzel font-700 uppercase tracking-[0.1em]"
                style={{
                  padding: '0.9rem 0', borderRadius: 14,
                  background: canBuyIn ? 'linear-gradient(180deg, rgba(240,192,64,0.35) 0%, rgba(196,169,106,0.18) 100%)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${canBuyIn ? GOLD : 'rgba(255,255,255,0.1)'}`,
                  color: canBuyIn ? '#f0d695' : '#5a5550',
                  fontSize: '0.9rem', letterSpacing: '0.08em',
                  cursor: canBuyIn ? 'pointer' : 'not-allowed',
                }}
              >
                {isPending ? 'Buying…' : `Buy ${buyInAmount.toLocaleString()} ⟡ in chips`}
              </motion.button>
              {chips > 0 && (
                <button
                  type="button"
                  onClick={() => setShowBuyPanel(false)}
                  className="font-karla"
                  style={{ background: 'none', border: 'none', color: '#7a7672', fontSize: '0.65rem', cursor: 'pointer', padding: 0 }}
                >
                  Close
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled={isPending || buyInCap <= 0}
              onClick={() => setShowBuyPanel(true)}
              className="font-karla font-700 uppercase tracking-[0.1em]"
              style={{
                width: '100%',
                padding: '0.6rem 0', borderRadius: 10,
                background: 'rgba(240,192,64,0.08)',
                border: '1px solid rgba(240,192,64,0.35)',
                color: buyInCap > 0 ? '#d4ba78' : '#5a5550',
                fontSize: '0.65rem',
                cursor: buyInCap > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              {buyInCap > 0 ? 'Buy More Chips' : 'Daily buy-in cap reached'}
            </button>
          )}
        </div>

        {/* Daily cap line */}
        <p className="font-karla" style={{ fontSize: '0.62rem', color: '#7a7470', marginTop: 10, textAlign: 'center', letterSpacing: '0.04em' }}>
          {dailyRemaining > 0
            ? `${dailyRemaining.toLocaleString()} ⟡ of today's ${dailyCap.toLocaleString()} ⟡ buy-in cap left`
            : 'Daily buy-in cap reached, back tomorrow'}
        </p>

        {/* Non-member cap upsell — Captains jump from the flat 2k to 5k+ and
            climb to 10k with charting points. */}
        {!initial.isMember && (
          <div style={{ marginTop: 11, paddingTop: 11, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <p className="font-karla" style={{ fontSize: '0.66rem', color: '#a89e86', textAlign: 'center', lineHeight: 1.45 }}>
              Need a bigger cap? Captains start at <span className="font-700" style={{ color: GOLD }}>{MEMBER_START_CAP.toLocaleString()} ⟡</span>/day and climb to <span className="font-700" style={{ color: GOLD }}>{MEMBER_MAX_CAP.toLocaleString()} ⟡</span>.
            </p>
            <BecomeCaptainButton style={{ padding: '0.55rem 1.05rem', fontSize: '0.8rem' }} />
          </div>
        )}

        {error && (
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#f08a8a', textAlign: 'center', marginTop: 8 }}>{error}</p>
        )}
      </div>

      {/* The tables */}
      <div className="grid grid-cols-2 gap-3">
        <BlackjackHubCard />
        <FishSlotsCard jackpotPot={jackpotPot} />
        <RouletteHubCard />
      </div>

      {/* High Rollers — top 3 combined lifetime earners across every
          Den game. Rows link to profiles like the leaderboard proper. */}
      {topEarners.length > 0 && (
        <div style={{
          background: 'linear-gradient(180deg, #1a1410 0%, #0b0908 100%)',
          border: '1px solid rgba(196,169,106,0.25)',
          borderRadius: 16,
          padding: '0.85rem 1rem 0.75rem',
          boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
        }}>
          <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.55rem', color: '#a68a4a', textAlign: 'center', marginBottom: 8 }}>
            High Rollers
          </p>
          {topEarners.map((e, i) => (
            <Link
              key={e.userId}
              href={`/u/${e.username}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0.45rem 0.2rem',
                borderBottom: i < topEarners.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                textDecoration: 'none',
              }}
            >
              <span style={{ fontSize: i === 0 ? '1.05rem' : '0.9rem', lineHeight: 1, flexShrink: 0 }}>{['🥇', '🥈', '🥉'][i]}</span>
              <Avatar
                username={e.username}
                size={i === 0 ? 30 : 26}
                characterColor={e.characterColor}
                equippedHat={e.equippedHat}
                avatarBg={e.avatarBg}
                avatarBorder={e.avatarBorder}
              />
              <p className="flex-1 font-karla font-700 truncate" style={{ fontSize: '0.78rem', color: '#c8c8c2', minWidth: 0 }}>
                {e.username}
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#7fd49a', flexShrink: 0 }}>
                +{e.score.toLocaleString()} ⟡
              </p>
            </Link>
          ))}
        </div>
      )}

      <p className="font-karla" style={{ fontSize: '0.6rem', color: '#5a5248', textAlign: 'center', lineHeight: 1.5 }}>
        One purse, every table. Session winnings track per game until you cash out.
      </p>
    </div>
  )
}
