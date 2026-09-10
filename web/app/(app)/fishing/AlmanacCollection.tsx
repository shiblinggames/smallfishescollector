'use client'

// The Collection room: every species, under the water it comes from.
//
// Each habitat opens with a BANNER cut from that zone's painted plate, the
// same art the zone selector and the fishing screen use. A flat coloured rule
// and a label made five near-identical grey grids; the banner makes scrolling
// this feel like descending, and ties a species to a place you have actually
// been rather than to a word.
//
// An uncaught species shows its real silhouette rather than a locked box, so
// a gap reads as a specific missing fish. Name, stats and flavour stay hidden
// until you land one.

import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import { ZONE_LABEL, ZONE_COLOR, ZONE_ORDER } from './zoneData'
import { RARITY_LABEL, RARITY_COLOR, fishArt, isGiant, shortDate } from '@/lib/almanac'
import { tierForLength, TIER_LABEL, TIER_COLOR, formatFishLength } from '@/lib/fishSize'
import { PRESTIGE_MAX, goldenBoostPct, zoneRewardDoubloons } from '@/lib/zoneRewards'
import { claimZoneReward, prestigeZone } from './actions'
import type { AlmanacData, AlmanacEntry } from './almanacActions'

const GOLD = '#f0c040'

// ── Views ────────────────────────────────────────────────────────────────────
// The Collection is 146 species and the only way through it was top to bottom
// by water. These are the questions a collector actually asks of a list that
// size, and each is one tap.
//
// BY WATER keeps the chapter headings and the per-zone progress rules. Every
// other view is a FLAT grid, because the moment you sort across the whole book
// the zone headings are lying about what is under them.
//
// A sorted view also prints the value it sorted BY under each name. That is
// not the clutter the default grid was carrying: it is the answer to the
// question you just asked, and without it "Most Caught" is a list in an order
// you have to take on faith.

type ViewKey = 'water' | 'missing' | 'trophies' | 'goldens' | 'most' | 'biggest' | 'valuable' | 'rarest' | 'newest'

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'water',    label: 'By Water' },
  { key: 'missing',  label: 'Still Missing' },
  { key: 'trophies', label: 'Trophies' },
  { key: 'goldens',  label: 'Goldens' },
  { key: 'most',     label: 'Most Caught' },
  { key: 'biggest',  label: 'Biggest' },
  { key: 'valuable', label: 'Most Valuable' },
  { key: 'rarest',   label: 'Rarest' },
  { key: 'newest',   label: 'Newest' },
]

/** How far into its own species' range your best of that fish sits. The fair
 *  way to rank "biggest" across a book holding a 6in seahorse and a 516in
 *  whale shark: otherwise the list is just the big species, every time. */
function sizePct(e: AlmanacEntry): number {
  if (e.pbLength == null || e.lengthMin == null || e.lengthMax == null || e.lengthMax <= e.lengthMin) return -1
  return (e.pbLength - e.lengthMin) / (e.lengthMax - e.lengthMin)
}

export default function AlmanacCollection({ data, onChanged }: {
  data: AlmanacData
  /** The room changed the book (a prestige wiped a water). Asks the shell
   *  to read it again. */
  onChanged?: () => void
}) {
  const [detail, setDetail] = useState<AlmanacEntry | null>(null)
  const [view, setView] = useState<ViewKey>('water')

  // ── WHAT A WATER PAYS, AND THE PRESTIGE ──────────────────────────────────
  //
  // This lived in the fish collection drawer under the rod, which was the one
  // other place the collection was drawn. The drawer is gone -- Log opens this
  // book now -- so the payout and the prestige come with it, drawn in this
  // book's own type rather than the drawer's boxes.
  //
  // Claimed is held here, optimistically, because a claim is one number in
  // the nav and should not wait for a full re-read of the book. A prestige
  // DOES re-read, through onChanged: it wipes a water's log and the shelves
  // under the heading have to empty.
  const [claimed, setClaimed] = useState(data.zoneRewardsClaimed)
  useEffect(() => { setClaimed(data.zoneRewardsClaimed) }, [data.zoneRewardsClaimed])
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  const claim = async (zone: string) => {
    if (busy) return
    setBusy(zone)
    const res = await claimZoneReward(zone).catch(() => null)
    if (res && !('error' in res)) {
      setClaimed(prev => ({ ...prev, [zone]: true }))
      // Into the purse in the nav, now. Same event every payout fires.
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
    }
    setBusy(null)
  }
  const prestige = async (zone: string) => {
    if (busy) return
    setBusy(zone); setConfirm(null)
    const res = await prestigeZone(zone).catch(() => null)
    if (res && !('error' in res)) {
      setClaimed(prev => ({ ...prev, [zone]: false }))
      // The rod keeps its own idea of what is logged, for the NEW pill on a
      // catch. A wiped water has to be forgotten there too.
      window.dispatchEvent(new CustomEvent('zone-prestiged', { detail: { zone } }))
      onChanged?.()
    }
    setBusy(null)
  }

  // Species you hold a MOUNTED golden of. Not entry.everGolden, which stays
  // true after you sell the fish: the mark says the golden is on your wall,
  // and the Goldens room draws the same line.
  const mountedGolden = useMemo(
    () => new Set(data.goldens.filter(g => g.status !== 'sold').map(g => g.fishId)),
    [data.goldens])

  // The six Giants have their own room; listing them here too would make the
  // Ancient Deep read as 18 species when only 12 are fishable stock.
  const collectable = useMemo(
    () => data.entries.filter(e => !isGiant(e.sellValue, e.habitat)),
    [data.entries])

  const byZone = useMemo(() => {
    const m = new Map<string, AlmanacEntry[]>()
    for (const e of collectable) {
      const arr = m.get(e.habitat) ?? []
      arr.push(e); m.set(e.habitat, arr)
    }
    return m
  }, [collectable])

  /** The flat list for every view except By Water, plus the caption each card
   *  carries in that view. */
  const flat = useMemo((): { list: AlmanacEntry[]; note: (e: AlmanacEntry) => string } => {
    const caught = collectable.filter(e => e.everCaught)
    switch (view) {
      case 'missing':
        return {
          list: collectable.filter(e => !e.everCaught)
            .sort((a, b) => a.rarity - b.rarity || a.name.localeCompare(b.name)),
          note: e => RARITY_LABEL[e.rarity],
        }
      // TROPHIES ranks by share of the species' own range: how well you did
      // against that fish. Ties (and there are many, since a maxed roll is
      // exactly 100%) break on raw length so the bigger animal leads.
      case 'trophies':
        return {
          list: caught.filter(e => sizePct(e) >= 0 && tierForLength(e.pbLength!, e.lengthMin!, e.lengthMax!) === 'trophy')
            .sort((a, b) => sizePct(b) - sizePct(a) || (b.pbLength ?? 0) - (a.pbLength ?? 0)),
          note: e => `${Math.round(sizePct(e) * 100)}% of max`,
        }
      case 'goldens':
        return {
          list: caught.filter(e => mountedGolden.has(e.id))
            .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name)),
          note: e => e.pbLength != null ? formatFishLength(e.pbLength) : RARITY_LABEL[e.rarity],
        }
      case 'most':
        return { list: [...caught].sort((a, b) => b.count - a.count), note: e => `×${e.count}` }
      // BIGGEST is raw inches, deliberately a different question from
      // Trophies. Ranked by share it would have been the same list: every
      // maxed roll is exactly 100%, so the top of it WAS the trophy list in
      // another order. Raw length asks "what are the largest animals I have
      // ever landed", and the answer is whale sharks, not a perfect bluegill.
      case 'biggest':
        return {
          list: caught.filter(e => e.pbLength != null).sort((a, b) => (b.pbLength ?? 0) - (a.pbLength ?? 0)),
          note: e => formatFishLength(e.pbLength!),
        }
      case 'valuable':
        return { list: [...collectable].sort((a, b) => b.sellValue - a.sellValue), note: e => `${e.sellValue.toLocaleString()} ⟡` }
      case 'rarest':
        return {
          list: [...collectable].sort((a, b) => b.rarity - a.rarity || b.difficulty - a.difficulty || a.name.localeCompare(b.name)),
          note: e => RARITY_LABEL[e.rarity],
        }
      case 'newest':
        return {
          list: caught.filter(e => e.firstCaughtAt)
            .sort((a, b) => (a.firstCaughtAt! > b.firstCaughtAt! ? -1 : 1)),
          note: e => shortDate(e.firstCaughtAt),
        }
      default:
        return { list: [], note: () => '' }
    }
  }, [view, collectable, mountedGolden])

  return (
    <>
      {/* One row, horizontally scrollable, one active at a time. A dropdown
          would hide eight of the nine questions behind a tap. */}
      <div className="scrollbar-hide" style={{ display: 'flex', gap: 6, overflowX: 'auto', overflowY: 'hidden', marginBottom: '1.1rem', paddingBottom: 2, WebkitOverflowScrolling: 'touch' }}>
        {VIEWS.map(v => {
          const on = view === v.key
          return (
            <button key={v.key} type="button" onClick={() => setView(v.key)}
              className="font-karla font-700"
              style={{
                flexShrink: 0, padding: '0.34rem 0.62rem', borderRadius: 999,
                fontSize: '0.66rem', whiteSpace: 'nowrap', cursor: 'pointer',
                background: on ? 'rgba(167,139,250,0.20)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${on ? 'rgba(167,139,250,0.62)' : 'rgba(255,255,255,0.10)'}`,
                color: on ? '#efeaf8' : '#a49dc0',
                WebkitTapHighlightColor: 'transparent',
              }}>
              {v.label}
            </button>
          )
        })}
      </div>

      {view === 'water' ? ZONE_ORDER.map(zone => {
        const list = byZone.get(zone)
        if (!list?.length) return null
        const got = list.filter(e => e.everCaught).length
        const color = ZONE_COLOR[zone]
        const done = got === list.length
        const pct = got / list.length

        // The prestige side of the heading. `done` above is EVER charted and
        // drives the rule; the payout is about THIS cycle, which a prestige
        // has emptied, so it reads the cycle count instead.
        const lvl = data.prestige[zone] ?? 0
        const boost = data.goldenBoosts[zone] ?? 0
        const atMax = lvl >= PRESTIGE_MAX
        const reward = zoneRewardDoubloons(zone, lvl)
        const pays = reward > 0 && zone !== 'ancient_deep'
        const cycleDone = list.every(e => e.cycleCount > 0)
        const isClaimed = !!claimed[zone]
        const isBusy = busy === zone
        const asking = confirm === zone
        const label = ZONE_LABEL[zone]

        return (
          <div key={zone} style={{ marginBottom: '1.5rem' }}>

            {/* A CHAPTER HEADING, not a picture. The zone's painted plate as
                a 74px band fought the specimens under it, and it boxed the
                section back up right after the cards lost their boxes. On
                paper the right answer is type: the name, the count, and a rule
                in the water's own colour. */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <p className="font-cinzel font-800" style={{ fontSize: '1.24rem', color: '#f2ecdd', lineHeight: 1.1 }}>
                  {ZONE_LABEL[zone]}
                </p>
                <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: done ? GOLD : color, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {done ? "✦ all charted" : `${got} / ${list.length}`}
                </span>
              </div>
              {/* The rule doubles as the progress bar: it fills in the zone's
                  colour as far as you have charted and stays a hairline for the
                  rest, so one line does two jobs. */}
              <div style={{ position: 'relative', height: 2, marginTop: 8, background: 'rgba(255,255,255,0.10)', borderRadius: 2, overflow: 'hidden' }}>
                <motion.span aria-hidden initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: done ? GOLD : color, boxShadow: `0 0 8px ${done ? GOLD : color}88` }} />
              </div>

              {/* ── THE PRESTIGE LINE ──────────────────────────────────
                  Under the rule, in the same type as the rest of the heading:
                  the stars you have earned here, the golden boost if any, and
                  on the right the one thing this water is offering you now.
                  A line of type and a small tinted button, never a boxed
                  strip -- this is a page in a book, not a drawer. */}
              {pays && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    {/* Five stars, filled to the level. Gold once every one is. */}
                    <span aria-label={atMax ? 'Max Prestige' : `Prestige ${lvl}`} style={{ display: 'inline-flex', gap: 2, fontSize: '0.72rem', lineHeight: 1, letterSpacing: '0.04em' }}>
                      {Array.from({ length: PRESTIGE_MAX }).map((_, i) => (
                        <span key={i} style={{ color: i < lvl ? (atMax ? GOLD : color) : 'rgba(255,255,255,0.16)', textShadow: i < lvl ? `0 0 8px ${atMax ? GOLD : color}66` : 'none' }}>★</span>
                      ))}
                    </span>
                    {atMax && (
                      <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.56rem', color: GOLD }}>Max Prestige</span>
                    )}
                    {boost > 0 && (
                      <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.56rem', color: GOLD, background: `${GOLD}16`, border: `1px solid ${GOLD}44`, borderRadius: 999, padding: '0.16rem 0.5rem', whiteSpace: 'nowrap' }}>
                        ✦ +{goldenBoostPct(boost)}% goldens
                      </span>
                    )}
                  </div>

                  {/* The offer. In order: nothing to claim yet, a reward to
                      take, or, with the reward taken and the water still
                      complete, the prestige. */}
                  {!cycleDone ? (
                    <span className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#a49dc0', whiteSpace: 'nowrap' }}>
                      {isClaimed ? 'Reward claimed' : `${reward.toLocaleString()} ⟡ when every fish is charted`}
                    </span>
                  ) : !isClaimed ? (
                    <button type="button" disabled={isBusy} onClick={() => void claim(zone)}
                      className="font-karla font-700 uppercase tracking-[0.1em]"
                      style={{ fontSize: '0.6rem', padding: '0.42rem 0.8rem', borderRadius: 9, cursor: isBusy ? 'default' : 'pointer', background: `${color}22`, border: `1px solid ${color}77`, color: '#efe9ff', opacity: isBusy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                      {isBusy ? '…' : `Claim ${reward.toLocaleString()} ⟡`}
                    </button>
                  ) : !asking ? (
                    <button type="button" disabled={isBusy} onClick={() => setConfirm(zone)}
                      className="font-karla font-700 uppercase tracking-[0.1em]"
                      style={{ fontSize: '0.6rem', padding: '0.42rem 0.8rem', borderRadius: 9, cursor: 'pointer', background: atMax ? `${GOLD}1c` : `${color}22`, border: `1px solid ${atMax ? GOLD : color}77`, color: atMax ? GOLD : '#efe9ff', whiteSpace: 'nowrap' }}>
                      {atMax ? `✦ Wipe for +${goldenBoostPct(1)}% goldens` : `★ Prestige ${lvl + 1}`}
                    </button>
                  ) : null}
                </div>
              )}

              {/* The question, asked in full before anything is wiped. */}
              {pays && asking && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  style={{ marginTop: 10, padding: '0.8rem 0.9rem', borderRadius: 12, background: 'rgba(10,9,13,0.55)', border: `1px solid ${atMax ? GOLD : color}44` }}>
                  <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.58rem', color: atMax ? GOLD : color, marginBottom: 6 }}>
                    {atMax ? 'Wipe for gold' : `Prestige ${lvl + 1}`}
                  </p>
                  <p className="font-karla font-500" style={{ fontSize: '0.74rem', color: '#d9d3ea', lineHeight: 1.5 }}>
                    {atMax ? (
                      <>Your {label} log is wiped. Your <span style={{ color: '#f5c451', fontWeight: 700 }}>golden trophies stay</span>. In return, a permanent <span style={{ color: GOLD, fontWeight: 700 }}>+{goldenBoostPct(1)}% golden catch chance</span> here, on top of your +{goldenBoostPct(boost)}%.</>
                    ) : (
                      <>Your {label} log is wiped. Your <span style={{ color: '#f5c451', fontWeight: 700 }}>golden trophies stay</span>. In return, a permanent <span style={{ color, fontWeight: 700 }}>+{(lvl + 1) * 10}% XP</span> on every catch here{lvl + 1 >= PRESTIGE_MAX ? '. This is the last one: Max Prestige.' : ', up to +50% at Max Prestige.'} Chart it again and it pays again.</>
                    )}
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setConfirm(null)}
                      className="font-karla font-700 uppercase tracking-[0.1em]"
                      style={{ fontSize: '0.6rem', padding: '0.42rem 0.8rem', borderRadius: 9, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', color: '#a49dc0' }}>
                      Not yet
                    </button>
                    <button type="button" disabled={isBusy} onClick={() => void prestige(zone)}
                      className="font-karla font-700 uppercase tracking-[0.1em]"
                      style={{ fontSize: '0.6rem', padding: '0.42rem 0.8rem', borderRadius: 9, cursor: isBusy ? 'default' : 'pointer', background: atMax ? `${GOLD}22` : `${color}22`, border: `1px solid ${atMax ? GOLD : color}88`, color: atMax ? GOLD : '#efe9ff', opacity: isBusy ? 0.6 : 1 }}>
                      {isBusy ? '…' : atMax ? 'Yes, wipe for gold' : 'Yes, prestige'}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            {/* minmax(0, 1fr), NOT 1fr. A 1fr track has an auto MINIMUM, so a
                child that cannot shrink below its content sets the track
                width: one "Stoplight Loosejaw" widened its own column and
                squeezed the two beside it, and the row stopped lining up with
                every other row. minmax(0, ...) lets the tracks actually be
                equal and hands the overflow to the ellipsis already waiting
                for it. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: '0.35rem 0.2rem' }}>
              {list.map(e => <SpeciesCard key={e.id} entry={e} goldMounted={mountedGolden.has(e.id)} onOpen={() => e.everCaught && setDetail(e)} />)}
            </div>
          </div>
        )
      }) : (
        <div style={{ marginBottom: '1.5rem' }}>
          <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#a49dc0', marginBottom: 10 }}>
            {flat.list.length} {flat.list.length === 1 ? 'species' : 'species'}
          </p>
          {flat.list.length === 0 ? (
            <p className="font-karla font-400 italic" style={{ fontSize: '0.72rem', color: '#8a83ad', lineHeight: 1.5, padding: '1.5rem 0' }}>
              {view === 'missing'
                ? 'Nothing missing. Every fish in every water is in the book.'
                : 'Nothing here yet. Go and land some.'}
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: '0.35rem 0.2rem' }}>
              {flat.list.map(e => (
                <SpeciesCard key={e.id} entry={e} goldMounted={mountedGolden.has(e.id)}
                  note={flat.note(e)}
                  onOpen={() => e.everCaught && setDetail(e)} />
              ))}
            </div>
          )}
        </div>
      )}

      <SpeciesSheet entry={detail} onClose={() => setDetail(null)} goldens={data.goldens} />
    </>
  )
}

/** ONE mark per species, in one corner:
 *
 *    trophy size, golden on the wall  ->  a GOLD trophy
 *    trophy size                      ->  a pewter trophy
 *    neither                          ->  nothing
 *
 *  THERE IS NO GOLDEN-WITHOUT-TROPHY STATE, and that is not an oversight.
 *  Every golden rolls at its species' maximum length: all 48 in the database
 *  sit at exactly 100% of their range, and every one of the 31 currently
 *  mounted has a personal best at least that long. So a golden IS a trophy,
 *  always, and a separate "golden but not trophy" mark could never render.
 *
 *  Which makes the metal say something clean: a pewter cup is a trophy you
 *  measured your way into, a gold one is a trophy the sea handed you. If the
 *  base cup were gold too, "gold trophy" would say nothing.
 */
function CollectionMark({ trophy, golden }: { trophy: boolean; golden: boolean }) {
  if (!trophy) return null
  const c = golden ? GOLD : '#c8d2e0'

  return (
    <motion.span aria-hidden
      title={golden ? 'Trophy size, golden mounted' : 'Trophy size landed'}
      initial={{ scale: 0 }} animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 460, damping: 14, delay: 0.14 }}
      style={{
        position: 'absolute', right: 3, top: 1, width: 16, height: 16, pointerEvents: 'none',
        // drop-shadow on the wrapper, not an feGaussianBlur inside each SVG:
        // up to 146 of these mount at once.
        filter: golden
          ? `drop-shadow(0 0 3px ${GOLD}cc) drop-shadow(0 1px 2px rgba(0,0,0,0.85))`
          : 'drop-shadow(0 1px 2px rgba(0,0,0,0.85))',
      }}>
      <svg viewBox="0 0 24 24" width="16" height="16">
        <g stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M8 4h8v4.2c0 2.6-1.8 4.3-4 4.3s-4-1.7-4-4.3z" fill={c} fillOpacity="0.9" />
          <path d="M8 5.4H5.6c0 2.6 1 3.9 2.6 4.3" />
          <path d="M16 5.4h2.4c0 2.6-1 3.9-2.6 4.3" />
          <path d="M12 12.5v3.2" />
          <path d="M8.6 19h6.8" />
          <path d="M10 15.7h4l.7 3.3h-5.4z" fill={c} fillOpacity="0.9" />
        </g>
      </svg>
    </motion.span>
  )
}

function SpeciesCard({ entry, goldMounted, note, onOpen }: { entry: AlmanacEntry; goldMounted: boolean; note?: string; onOpen: () => void }) {
  // everCaught, not count > 0. A prestiged zone was fully collected to earn
  // the prestige, so those species are charted even though the log was wiped.
  const caught = entry.everCaught
  const isTrophy = entry.pbLength != null && entry.lengthMin != null && entry.lengthMax != null
    && tierForLength(entry.pbLength, entry.lengthMin, entry.lengthMax) === 'trophy'
  // NO GOLD HERE. Whether you have taken a golden of a species is the Goldens
  // room's whole job; painting it into this grid too made the Collection look
  // like a worse version of that tab. Here a fish is its rarity and nothing
  // else.
  const c = RARITY_COLOR[entry.rarity]

  return (
    <motion.button type="button" onClick={onOpen} disabled={!caught}
      whileTap={caught ? { scale: 0.94 } : undefined}
      whileHover={caught ? { y: -3 } : undefined}
      transition={{ type: 'spring', stiffness: 520, damping: 30 }}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center',
        background: 'none', border: 'none', padding: '0.35rem 0.15rem 0.55rem',
        cursor: caught ? 'pointer' : 'default', textAlign: 'center',
        // minWidth 0 so a long name can actually be clipped rather than
        // setting this button's min-content width. See the grid comment.
        minWidth: 0, maxWidth: '100%',
        WebkitTapHighlightColor: 'transparent',
      }}>

      <div style={{ position: 'relative', width: '100%', height: 74, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {caught && (
          <span aria-hidden style={{
            position: 'absolute', left: '50%', top: '48%', transform: 'translate(-50%, -50%)',
            width: 76, height: 76, borderRadius: '50%', pointerEvents: 'none',
            background: `radial-gradient(circle, ${c}16 0%, transparent 66%)`,
          }} />
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fishArt(entry.name)} alt="" aria-hidden loading="lazy" decoding="async"
          style={{
            position: 'relative', maxWidth: 84, maxHeight: 72, objectFit: 'contain',
            filter: caught ? 'drop-shadow(0 4px 7px rgba(0,0,0,0.55))' : 'brightness(0) opacity(0.26)',
          }} />

        {caught && (
          <span aria-hidden style={{
            position: 'absolute', left: '50%', bottom: 1, transform: 'translateX(-50%)',
            width: 44, height: 5, borderRadius: '50%', pointerEvents: 'none',
            background: 'radial-gradient(ellipse, rgba(0,0,0,0.45) 0%, transparent 72%)',
          }} />
        )}

        {caught && <CollectionMark trophy={isTrophy} golden={goldMounted} />}
      </div>

      {/* The name, one line, always. Fixed height so a two-word species and a
          "Stoplight Loosejaw" leave the tiles exactly the same size. */}
      <p className="font-cinzel font-700" style={{
        width: '100%', minWidth: 0, marginTop: 6, height: '1.05rem',
        fontSize: '0.82rem', lineHeight: '1.05rem',
        color: caught ? '#efeaf8' : '#7b7499',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {caught ? entry.name : '???'}
      </p>

      {/* Only in a sorted view, and only ever the thing it was sorted by. */}
      {note && (
        <span className="font-karla font-700" style={{
          width: '100%', minWidth: 0, marginTop: 1, height: '0.9rem',
          fontSize: '0.62rem', lineHeight: '0.9rem', color: '#a49dc0',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          display: 'block',
        }}>{note}</span>
      )}
    </motion.button>
  )
}

/** The full record for one species: what it is, and what you have done to it. */
function SpeciesSheet({ entry, onClose, goldens }: {
  entry: AlmanacEntry | null
  onClose: () => void
  goldens: AlmanacData['goldens']
}) {
  const mine = useMemo(() => entry ? goldens.filter(g => g.fishId === entry.id) : [], [entry, goldens])
  // The portal target only exists after mount.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!entry || !mounted) return null

  const color = ZONE_COLOR[entry.habitat] ?? '#a78bfa'
  const rc = RARITY_COLOR[entry.rarity]
  const tier = entry.pbLength != null && entry.lengthMin != null && entry.lengthMax != null
    ? tierForLength(entry.pbLength, entry.lengthMin, entry.lengthMax) : null
  // Where your best sits inside the species' possible range.
  const pbPct = entry.pbLength != null && entry.lengthMin != null && entry.lengthMax != null && entry.lengthMax > entry.lengthMin
    ? Math.max(0, Math.min(1, (entry.pbLength - entry.lengthMin) / (entry.lengthMax - entry.lengthMin))) : null

  // Portalled to <body>, and NOT because of the usual fixed-positioning
  // trap. PopupShell renders in place, and this sheet lives inside the
  // Almanac's scrolling room, which carries zIndex 1 to sit over the backdrop
  // art. That is a stacking context: everything inside it is pinned below the
  // header and masthead, which are siblings at zIndex 2, however high the
  // sheet's own z-index goes. Escaping to the body is the fix; 120 then keeps
  // it clear of the Almanac shell's own 111.
  return createPortal(
    <PopupShell
      open onClose={onClose} zIndex={120}
      // PopupShell's default top padding is 76px, reserved for the app's Nav
      // header. This sheet is portalled ABOVE a full-screen overlay that
      // already covers the Nav, so that reservation only pushed the card off
      // centre. Symmetric gutters instead, and the card centres in the real
      // viewport.
      paddingTop="calc(env(safe-area-inset-top, 0px) + 1rem)"
      paddingBottom="calc(env(safe-area-inset-bottom, 0px) + 1rem)"
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={e => e.stopPropagation()}
        style={{
          // margin: auto, NOT align-items/alignSelf center. Auto margins in a
          // flex container absorb the free space when there is any and compute
          // to 0 when there is not, so a card taller than the screen scrolls
          // from its top edge instead of having it clipped off, which is what
          // centring by alignment does. It also stops the card stretching to
          // fill the flex row and growing a tail of empty panel.
          margin: 'auto',
          width: '100%', maxWidth: 'var(--modal-w)', borderRadius: 18, overflow: 'hidden',
          // Solid base: this sits over the overlay's art.
          background: 'linear-gradient(180deg, #16141b 0%, #0c0b10 100%)',
          border: `1px solid ${color}55`,
        }}>

        {/* Plate — the almanac's own paper, not the zone's water. A painted
            seascape behind the specimen made the sheet look like it belonged to
            the fishing screen; this is a page in a book. */}
        <div style={{ position: 'relative', height: 168, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/almanac-paper.jpg" alt="" aria-hidden
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,9,13,0.30) 0%, rgba(10,9,13,0.55) 68%, rgba(12,10,18,0.92) 100%)' }} />
          {/* The specimen's own pool of light on the page, gold once you have
              taken a golden of it. */}
          <span aria-hidden style={{ position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%, -50%)', width: 220, height: 150, borderRadius: '50%', background: `radial-gradient(ellipse, ${entry.everGolden ? 'rgba(240,192,64,0.18)' : color + '20'} 0%, transparent 68%)` }} />
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '0.6rem' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fishArt(entry.name)} alt="" aria-hidden
              style={{ position: 'relative', maxWidth: 190, maxHeight: 140, objectFit: 'contain', filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.65))' }} />
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ position: 'absolute', top: 9, right: 9, width: 28, height: 28, borderRadius: '50%', padding: 0, background: 'rgba(6,6,12,0.72)', border: '1px solid rgba(255,255,255,0.2)', color: '#cfcabf', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
          <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ position: 'absolute', left: 12, top: 11, fontSize: '0.66rem', color, textShadow: '0 1px 4px rgba(0,0,0,0.95)' }}>
            {ZONE_LABEL[entry.habitat] ?? entry.habitat}
          </span>
        </div>

        <div style={{ padding: '0.2rem 1rem 1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 2 }}>
            <p className="font-cinzel font-800" style={{ fontSize: '1.25rem', color: '#f2eeff', lineHeight: 1.1 }}>{entry.name}</p>
            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.66rem', padding: '0.12rem 0.4rem', borderRadius: 999, color: rc, background: rc + '1c', border: `1px solid ${rc}55` }}>
              {RARITY_LABEL[entry.rarity]}
            </span>
            {entry.everGolden && (
              <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.66rem', padding: '0.12rem 0.4rem', borderRadius: 999, color: GOLD, background: 'rgba(240,192,64,0.12)', border: `1px solid ${GOLD}88` }}>
                Golden taken
              </span>
            )}
          </div>
          {entry.scientificName && (
            <p className="font-karla font-400 italic" style={{ fontSize: '0.68rem', color: '#a49dc0', marginBottom: 10 }}>{entry.scientificName}</p>
          )}

          {/* Your record with this fish. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 6, marginBottom: 12 }}>
            <Cell label="Caught" value={`${entry.count}`} />
            <Cell label="Goldens" value={`${mine.length}`} accent={mine.length ? GOLD : undefined} />
            <Cell label="Worth" value={`${entry.sellValue.toLocaleString()} ⟡`} accent={GOLD} />
          </div>

          {/* Personal best against the whole possible range. */}
          {entry.pbLength != null && entry.lengthMin != null && entry.lengthMax != null && (
            <div style={{ marginBottom: 12, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 11, padding: '0.6rem 0.7rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
                <span className="font-karla font-600 uppercase tracking-[0.09em]" style={{ fontSize: '0.66rem', color: '#9a93b8' }}>Your best</span>
                <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: tier ? TIER_COLOR[tier] : '#ded8ee' }}>
                  {formatFishLength(entry.pbLength)}{tier ? ` · ${TIER_LABEL[tier]}` : ''}
                </span>
              </div>
              <div style={{ position: 'relative', height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)' }}>
                {pbPct != null && (
                  <motion.span aria-hidden initial={{ left: '0%' }} animate={{ left: `${pbPct * 100}%` }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    style={{ position: 'absolute', top: -3, width: 3, height: 12, borderRadius: 2, background: tier ? TIER_COLOR[tier] : '#ded8ee', transform: 'translateX(-50%)' }} />
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#8a83ad' }}>{formatFishLength(entry.lengthMin)}</span>
                <span className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#8a83ad' }}>{formatFishLength(entry.lengthMax)}</span>
              </div>
            </div>
          )}

          {entry.funFact && (
            <p className="font-karla font-400 italic" style={{ fontSize: '0.74rem', color: '#a8a0c0', lineHeight: 1.45, marginBottom: 10 }}>{entry.funFact}</p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', columnGap: 16, rowGap: 5 }}>
            <Row label="Difficulty" value={`${entry.difficulty}/10`} />
            {entry.sizeCategory && <Row label="Size class" value={cap(entry.sizeCategory)} />}
            {entry.dietType && <Row label="Diet" value={cap(entry.dietType)} />}
            {entry.region && <Row label="Region" value={cap(entry.region)} />}
            {entry.firstCaughtAt && <Row label="First caught" value={shortDate(entry.firstCaughtAt)} />}
            {entry.lastCaughtAt && <Row label="Last caught" value={shortDate(entry.lastCaughtAt)} />}
            {entry.pbAt && <Row label="Best landed" value={shortDate(entry.pbAt)} />}
          </div>
        </div>
      </motion.div>
    </PopupShell>,
    document.body,
  )
}

function Cell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '0.42rem 0.5rem', textAlign: 'center' }}>
      <p className="font-karla font-600 uppercase tracking-[0.09em]" style={{ fontSize: '0.64rem', color: '#9a93b8', marginBottom: 2 }}>{label}</p>
      <p className="font-cinzel font-700" style={{ fontSize: '0.86rem', lineHeight: 1, color: accent ?? '#ded8ee', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
      <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#9a93b8', whiteSpace: 'nowrap' }}>{label}</span>
      <span className="font-karla font-700" style={{ fontSize: '0.64rem', color: accent ?? '#c8c2dc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
