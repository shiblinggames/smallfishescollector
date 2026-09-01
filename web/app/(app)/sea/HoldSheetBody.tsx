'use client'

// ── WHAT IS IN THE HOLD, AND WHAT TO DO ABOUT IT ────────────────────────────
//
// The hold sheet listed EVERY species, one row each, sorted by value. At a
// Leviathan Hold that is up to 350 fish across dozens of species and the panel
// became a spreadsheet — you scrolled past thirty rows of two-doubloon minnows
// to find out you were carrying anything worth sailing home for.
//
// Nobody reads a hold to audit it. They open it to answer three questions, and
// this answers those in the order they get asked:
//
//   HOW FULL AM I — a bar, because "76/350" is a number you have to think about
//   and a bar is one you do not.
//   WHAT IS IT WORTH — the total, and the handful of species actually carrying
//   it. The rest collapse into one line, which can be opened if somebody
//   genuinely wants the manifest.
//   WHERE DO I TAKE IT — the lanes, and the yard where the barrels get bigger.
//
// ── THE LANE COPY WAS WRONG ─────────────────────────────────────────────────
//
// It advertised three lanes and led with "a quick sell from wherever you float
// gives you 75%". That lane does not exist. It went when /fishing did, because
// selling from anywhere is exactly the thing the ocean hub charges for — so the
// panel was describing a button that is not in the game and understating the
// buyer people can actually reach. `sellFish` and `quickSellAllFish` have since
// been deleted outright; see the note where they used to be in fishing/actions.

import { useState } from 'react'
import { motion } from 'framer-motion'
// The BASIC row, not the full species. This needs an id, a name and a price;
// asking for the fat type would make the panel refuse the cached species table
// that every caller actually has.
import type { FishSpeciesBasic } from '@/app/(app)/fishing/constants'
import { FISH_HOLD_TIERS } from '@/lib/fishHold'

/** How many species get a line of their own before the rest are folded away.
 *  Five is about what fits without scrolling on a phone, and past the fifth the
 *  rows stop changing any decision. */
const NAMED = 5

const GOLD = '#f0c040'
const SEA = 'rgba(190,212,228'

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-karla font-700 uppercase" style={{
      fontSize: '0.56rem', letterSpacing: '0.18em',
      color: `${SEA},0.45)`, margin: '1.1rem 0 0',
    }}>{children}</p>
  )
}

export default function HoldSheetBody({ rows, species, count, capacity, tier }: {
  rows: { fishId: number; qty: number }[] | null
  species: FishSpeciesBasic[]
  count: number
  capacity: number
  /** Which rung of FISH_HOLD_TIERS is fitted, so the sheet can name the next
   *  one and its price rather than saying "upgrade it somewhere". */
  tier: number
}) {
  const [full, setFull] = useState(false)

  if (rows === null) {
    return (
      <p className="font-karla font-600" style={{ fontSize: '0.816rem', color: `${SEA},0.5)`, marginTop: 16 }}>
        Counting the barrels…
      </p>
    )
  }

  const byId = new Map(species.map(f => [f.id, f]))
  const priced = rows
    .map(r => ({ ...r, sp: byId.get(r.fishId) }))
    .filter((r): r is { fishId: number; qty: number; sp: FishSpeciesBasic } => !!r.sp)
    .sort((a, b) => (b.sp.sell_value * b.qty) - (a.sp.sell_value * a.qty))

  const total = priced.reduce((n, r) => n + r.sp.sell_value * r.qty, 0)
  const shown = full ? priced : priced.slice(0, NAMED)
  const rest = priced.slice(NAMED)
  const restFish = rest.reduce((n, r) => n + r.qty, 0)
  const restValue = rest.reduce((n, r) => n + r.sp.sell_value * r.qty, 0)

  const fill = capacity > 0 ? Math.min(1, count / capacity) : 0
  const nearFull = fill >= 0.9
  const next = tier < FISH_HOLD_TIERS.length - 1 ? FISH_HOLD_TIERS[tier + 1] : null

  return (
    <>
      {/* ── HOW FULL ── a bar, not a fraction to do arithmetic on. It also
          turns before it bites: amber at three quarters, red at nine tenths,
          so the decision arrives while there is still room to act on it. */}
      <div style={{ marginTop: 12 }}>
        <div style={{
          height: 8, borderRadius: 999, overflow: 'hidden',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <motion.div
            initial={false}
            animate={{ width: `${fill * 100}%` }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            style={{
              height: '100%',
              background: nearFull ? '#f87171' : fill >= 0.75 ? '#e8b463' : '#5fb0c8',
            }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
          {/* THE NUMBER, NOT THE TIER'S NAME. "Leviathan Hold" is charming and
              tells you nothing; the capacity beside it is the whole fact. Same
              call as the Shipyard, which stopped naming its rungs too. */}
          <span className="font-karla font-600" style={{ fontSize: '0.72rem', color: `${SEA},0.55)` }}>
            {Math.round(fill * 100)}% full
          </span>
          <span className="font-karla font-700" style={{
            fontSize: '0.72rem', fontVariantNumeric: 'tabular-nums',
            color: nearFull ? '#f87171' : `${SEA},0.75)`,
          }}>
            {count} of {capacity}
          </span>
        </div>
      </div>

      {priced.length === 0 ? (
        <p className="font-karla font-600" style={{
          fontSize: '0.816rem', color: `${SEA},0.55)`, marginTop: 16, lineHeight: 1.6,
        }}>
          Empty. Everything you land goes in here until you sell it.
        </p>
      ) : (
        <>
          <Label>Worth the most</Label>
          <div style={{ marginTop: 4 }}>
            {shown.map(r => (
              <div key={r.fishId} style={{
                display: 'flex', alignItems: 'baseline', gap: 8,
                padding: '0.34rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                <span className="font-karla font-700" style={{
                  flexShrink: 0, fontSize: '0.792rem', color: `${SEA},0.6)`,
                  fontVariantNumeric: 'tabular-nums', minWidth: 26,
                }}>×{r.qty}</span>
                <span className="font-karla font-600 truncate" style={{ flex: 1, minWidth: 0, fontSize: '0.84rem', color: '#f2ead8' }}>
                  {r.sp.name}
                </span>
                <span className="font-karla font-700" style={{
                  flexShrink: 0, fontSize: '0.816rem', color: GOLD, fontVariantNumeric: 'tabular-nums',
                }}>⟡ {(r.sp.sell_value * r.qty).toLocaleString()}</span>
              </div>
            ))}
          </div>

          {/* THE REST, AS ONE LINE. Openable rather than gone: the manifest is
              occasionally what somebody wants, and it is never what they opened
              the panel for. */}
          {rest.length > 0 && (
            <button type="button" data-no-steer
              onClick={e => { e.stopPropagation(); setFull(v => !v) }}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 8, width: '100%',
                padding: '0.44rem 0', background: 'none', border: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer', textAlign: 'left',
              }}>
              <span className="font-karla font-700" style={{
                flexShrink: 0, fontSize: '0.792rem', color: `${SEA},0.4)`,
                fontVariantNumeric: 'tabular-nums', minWidth: 26,
              }}>×{restFish}</span>
              <span className="font-karla font-600" style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', color: `${SEA},0.55)` }}>
                {full ? 'Hide the rest' : `${rest.length} other ${rest.length === 1 ? 'kind' : 'kinds'}, smaller money`}
              </span>
              <span className="font-karla font-700" style={{
                flexShrink: 0, fontSize: '0.792rem', color: `${GOLD}99`, fontVariantNumeric: 'tabular-nums',
              }}>⟡ {restValue.toLocaleString()}</span>
            </button>
          )}

          {/* MARKET value, and it says so. What the hold actually fetches
              depends on who buys it, so a single "worth" number would be wrong
              everywhere except one counter. */}
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10,
            paddingTop: 10, borderTop: `1px solid ${GOLD}47`,
          }}>
            <span className="font-cinzel font-700" style={{ flex: 1, fontSize: '0.96rem', color: '#f2ead8' }}>
              At full market
            </span>
            <span className="font-cinzel font-700" style={{
              fontSize: '1.08rem', color: GOLD, fontVariantNumeric: 'tabular-nums',
            }}>⟡ {total.toLocaleString()}</span>
          </div>
        </>
      )}

      {/* ── WHERE IT GOES ── two lanes, which is how many there are. The
          third one this used to lead with was retired with /fishing. */}
      <Label>Where to sell it</Label>
      <Lane
        name="A buyer out here"
        pays="78 to 86%"
        note="Sail to the trader in your water. The deeper the band, the better the rate, because carrying it further is the whole cost." />
      <Lane
        name="The Market, ashore"
        pays="100%"
        note="Full price, less a 3% cut if you are not a Captain. You have to bring the catch home to the Mainland yourself." />

      {/* ── AND WHERE IT GETS BIGGER ── the question a full hold actually
          raises, which this panel never answered. */}
      <Label>Where to make it bigger</Label>
      {next ? (
        <p className="font-karla font-600" style={{
          fontSize: '0.792rem', color: `${SEA},0.62)`, marginTop: 6, lineHeight: 1.65,
        }}>
          The Shipyard on the Mainland fits a bigger one:{' '}
          <span style={{ color: '#f2ead8' }}>+{next.capacity - capacity} fish</span>, taking you to{' '}
          {next.capacity}, for{' '}
          <span style={{ color: GOLD, fontVariantNumeric: 'tabular-nums' }}>⟡ {next.cost.toLocaleString()}</span>.
        </p>
      ) : (
        <p className="font-karla font-600" style={{
          fontSize: '0.792rem', color: `${SEA},0.62)`, marginTop: 6, lineHeight: 1.65,
        }}>
          {capacity} fish is the biggest hold there is. Nothing at the Shipyard will better it.
        </p>
      )}
    </>
  )
}

function Lane({ name, pays, note }: { name: string; pays: string; note: string }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="font-cinzel font-700" style={{ flex: 1, fontSize: '0.86rem', color: '#f2ead8' }}>
          {name}
        </span>
        <span className="font-karla font-700" style={{ fontSize: '0.8rem', color: GOLD }}>{pays}</span>
      </div>
      <p className="font-karla font-600" style={{
        fontSize: '0.752rem', color: `${SEA},0.55)`, marginTop: 2, lineHeight: 1.55,
      }}>{note}</p>
    </div>
  )
}
