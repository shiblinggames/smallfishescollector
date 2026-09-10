'use client'

// WHAT YOU WERE OWED FOR LEVELLING.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// Fishing level rewards are granted by claimFishingLevelRewards, which is
// idempotent and state-based: it compares claimed_fishing_levels against the
// level your XP actually implies and hands over the difference. It was called
// from exactly one place, on the fishing screen's mount — and the fishing
// screen now redirects every captain to the chart. So the rewards accrued
// correctly and were never handed to anybody who sails.
//
// The chart calls it now, on the crossing itself, and this is what says so.
//
// ── IT IS A MOMENT, NOT A RECEIPT ───────────────────────────────────────────
//
// The first cut was a list on a green card: a number, then rows of what it
// paid. Correct, and it read like a bank statement. A level is the one thing
// this game asks a captain to work towards, and the card for it should look
// like the water it opened. So the top of the card is the PLATE of the water
// the level belongs to — the one it just unlocked if it did, the deepest one
// open to them if not — with the number set into it under a slow turn of
// gold, and the receipt sits below in the dark where receipts belong.

import { motion, AnimatePresence } from 'framer-motion'
import { rewardLabel, type LevelReward } from '@/lib/levelRewards'
import { fishingLevelPerks, zonesUnlockedBetween } from '@/lib/fishingUnlocks'
import { fishingGearUnlockedBetween } from '@/lib/gearUnlocks'
import { ZONE_BG, ZONE_COLOR, ZONE_LABEL, ZONE_MIN_LEVEL } from '../fishing/zoneData'

export type Granted = { level: number; reward: LevelReward }[]

const GOLD = '#f0c040'

/** The deepest water open at this level, by the zones' own thresholds. */
function deepestOpen(level: number): string {
  let best = 'shallows'
  let bestMin = -1
  for (const [zone, min] of Object.entries(ZONE_MIN_LEVEL)) {
    if (min <= level && min > bestMin && ZONE_BG[zone]) { best = zone; bestMin = min }
  }
  return best
}

export default function LevelRewardsGrant({ granted, from, to, onDone }: {
  granted: Granted
  /** The span this covers: the card is for every level in (from, to], paid or
   *  not. `granted` is only the ones that paid. */
  from: number
  to: number
  onDone: () => void
}) {
  const many = to - from > 1
  // WHAT THE LEVEL OPENED, not just what it paid. A level-up that lists coin
  // and says nothing about the water it just unlocked has buried the headline:
  // the reward is spendable, the zone is a place you can now go.
  const zones = zonesUnlockedBetween(from, to)
  const gear = fishingGearUnlockedBetween(from, to)
  const perks = fishingLevelPerks(to)

  // THE WATER ON THE CARD. The one this span opened, if it opened one — that
  // is the headline and it gets the picture. Otherwise the deepest water they
  // can already fish, which is where this level was earned.
  const hero = zones.length ? zones[zones.length - 1].key : deepestOpen(to)
  const heroArt = ZONE_BG[hero] ?? ZONE_BG.shallows
  const heroColor = ZONE_COLOR[hero] ?? GOLD
  const heroLabel = ZONE_LABEL[hero] ?? 'the Shallows'
  const opened = zones.length > 0

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onDone}
        // The chart under this steers on pointerdown and CAPTURES the pointer
        // for the rest of the gesture, so an overlay without this both sails
        // the boat and never receives its own click. See PopupShell.
        data-no-steer
        style={{
          position: 'fixed', inset: 0, zIndex: 90,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem', background: 'rgba(2,8,14,0.74)', backdropFilter: 'blur(4px)',
        }}>
        <motion.div onClick={e => e.stopPropagation()}
          initial={{ y: 22, scale: 0.96 }} animate={{ y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          style={{
            position: 'relative', width: '100%', maxWidth: 'var(--modal-w)',
            borderRadius: 20, overflow: 'hidden',
            // An opaque floor. This sits over the chart, which is painted.
            background: '#0a1118',
            border: `1px solid ${GOLD}66`,
            boxShadow: `0 24px 70px rgba(0,0,0,0.7), 0 0 40px ${GOLD}1a`,
          }}>

          {/* ── THE PLATE ──────────────────────────────────────────────
              The water's own painting, the same one the zone selector and
              the fishing screen use, faded into the card at the foot so the
              number sits IN the picture rather than on a strip of it. */}
          <div style={{ position: 'relative', height: 190, overflow: 'hidden' }}>
            <motion.img src={heroArt} alt="" aria-hidden decoding="async"
              initial={{ scale: 1.12 }} animate={{ scale: 1 }}
              transition={{ duration: 6, ease: 'easeOut' }}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            {/* Down into the card, and darker at the top so the eyebrow reads. */}
            <div aria-hidden style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, rgba(4,8,12,0.55) 0%, rgba(4,8,12,0.12) 35%, rgba(10,17,24,0.35) 70%, #0a1118 100%)',
            }} />
            {/* A slow turn of gold behind the number. Same rays the badge wall
                turns, masked to a soft disc so the picture keeps its edges. */}
            <motion.div aria-hidden
              initial={{ opacity: 0 }} animate={{ opacity: 1, rotate: 360 }}
              transition={{ opacity: { duration: 0.8 }, rotate: { duration: 18, repeat: Infinity, ease: 'linear' } }}
              style={{
                position: 'absolute', left: '50%', top: '58%', width: 320, height: 320, marginLeft: -160, marginTop: -160,
                background: `conic-gradient(from 0deg, ${GOLD}00 0deg, ${GOLD}55 28deg, ${GOLD}00 58deg, ${GOLD}00 120deg, ${GOLD}40 150deg, ${GOLD}00 180deg, ${GOLD}00 240deg, ${GOLD}4d 268deg, ${GOLD}00 300deg, ${GOLD}00 360deg)`,
                filter: 'blur(3px)',
                maskImage: 'radial-gradient(circle, rgba(0,0,0,1) 22%, rgba(0,0,0,0) 62%)',
                WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,1) 22%, rgba(0,0,0,0) 62%)',
                pointerEvents: 'none',
              }} />

            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 10 }}>
              <p className="font-karla font-700 uppercase" style={{
                fontSize: '0.62rem', letterSpacing: '0.24em', color: `${GOLD}d0`,
                textShadow: '0 2px 10px rgba(0,0,0,0.9)',
              }}>{many ? `${to - from} levels earned` : 'Level earned'}</p>
              {/* THE NUMBER. Set in, not stamped on: gold with a dark edge, so
                  it holds against sand and against open water alike. */}
              <motion.p className="font-cinzel font-800"
                initial={{ scale: 0.55, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.12 }}
                style={{
                  fontSize: '4.2rem', lineHeight: 1, marginTop: 2, color: '#fbe9b0',
                  textShadow: `0 0 26px ${GOLD}99, 0 3px 0 #6b4a08, 0 6px 18px rgba(0,0,0,0.9)`,
                  fontVariantNumeric: 'tabular-nums',
                }}>{to}</motion.p>
              <p className="font-karla font-700 uppercase" style={{
                fontSize: '0.66rem', letterSpacing: '0.22em', color: 'rgba(244,236,216,0.9)', marginTop: 4,
                textShadow: '0 2px 10px rgba(0,0,0,0.9)',
              }}>Fishing</p>
            </div>
          </div>

          {/* ── THE HEADLINE ───────────────────────────────────────────
              If a water opened, it is the first thing said, in that water's
              own colour. If not, the deepest water open is named, so the
              number is about somewhere. */}
          <div style={{ padding: '0.15rem 1.15rem 0', textAlign: 'center' }}>
            {opened ? (
              zones.map(z => (
                <p key={z.key} className="font-cinzel font-700" style={{
                  fontSize: '1.15rem', lineHeight: 1.35, color: ZONE_COLOR[z.key] ?? heroColor,
                  textShadow: `0 0 18px ${ZONE_COLOR[z.key] ?? heroColor}55`,
                }}>{z.label} {zones.length > 1 ? 'is open' : 'is open to you'}</p>
              ))
            ) : (
              <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: 'rgba(190,212,228,0.6)', lineHeight: 1.5 }}>
                Earned on the {heroLabel}.
              </p>
            )}
          </div>

          <div style={{ padding: '0.7rem 1.15rem 1.1rem' }}>
            {/* ── WHAT IT PAID ─────────────────────────────────────────
                Chips, one per level that paid, rather than a ledger. */}
            {granted.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                {granted.map(g => (
                  <span key={g.level} className="font-karla font-700" style={{
                    display: 'inline-flex', alignItems: 'baseline', gap: 6,
                    fontSize: '0.78rem', color: '#f4ecd8',
                    background: `${GOLD}14`, border: `1px solid ${GOLD}4d`, borderRadius: 999,
                    padding: '0.3rem 0.7rem',
                  }}>
                    {many && <span style={{ fontSize: '0.62rem', color: 'rgba(190,212,228,0.6)', fontVariantNumeric: 'tabular-nums' }}>Lv {g.level}</span>}
                    {rewardLabel(g.reward)}
                  </span>
                ))}
              </div>
            )}

            {/* ── WHAT IT OPENED ───────────────────────────────────────── */}
            {gear.length > 0 && (
              <div style={{ marginTop: granted.length ? 12 : 0 }}>
                <p className="font-karla font-700 uppercase" style={{
                  fontSize: '0.6rem', letterSpacing: '0.18em', color: `${GOLD}b8`, textAlign: 'center', marginBottom: 7,
                }}>Now in the tackle shop</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {gear.map((g, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 12, padding: '0.4rem 0.7rem 0.4rem 0.45rem',
                    }}>
                      {g.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.image} alt="" style={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))' }} />
                      )}
                      <span className="font-karla font-600" style={{ fontSize: '0.82rem', color: '#e6eef5' }}>{g.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* The two numbers every level moves. Small, because they are a
                steady drip rather than an event, but a level that changed nothing
                you can name is a level that felt like nothing. */}
            <p className="font-karla font-600" style={{
              fontSize: '0.74rem', color: 'rgba(190,212,228,0.55)', marginTop: 12, lineHeight: 1.55, textAlign: 'center',
            }}>
              Catch zone +{perks.catchZone}° · bites {perks.biteSpeed}% quicker
            </p>

            {many && (
              // SAY WHY IT ARRIVED IN A HEAP. Several levels at once looks like a
              // bug unless somebody explains it, and the honest explanation is
              // that they were owed.
              <p className="font-karla font-600" style={{
                fontSize: '0.74rem', color: 'rgba(190,212,228,0.5)', marginTop: 8, lineHeight: 1.55, textAlign: 'center',
              }}>
                These were waiting for you. Everything you earn is held until you are back at the chart.
              </p>
            )}

            <button type="button" onClick={onDone} className="font-cinzel font-700"
              style={{
                marginTop: 14, width: '100%', padding: '0.72rem', borderRadius: 12,
                fontSize: '1rem', color: '#f2ead8',
                background: `${GOLD}1f`,
                border: `1px solid ${GOLD}77`, cursor: 'pointer',
                boxShadow: `0 0 22px ${GOLD}14`,
              }}>
              Take it aboard
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
