'use client'

// The Record: everything about your fishing that is not a creature.
//
// Most of this is DERIVED from fish_collection joined to the species table, so
// it is complete back to your first cast without anything ever having been
// counted. Where a number does need its own counter (crates by tier, bait by
// type, the sale figures) it started the day the Almanac shipped, and the row
// says so rather than quietly reading as a lifetime total.

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { ZONE_LABEL, ZONE_COLOR, ZONE_ORDER } from './zoneData'
const ACCENT = '#a78bfa'
import { RARITY_LABEL, RARITY_COLOR, fishArt, compact, shortDate } from '@/lib/almanac'
import { CRATE_TIERS } from '@/components/CrateOpening'
import { BAITS } from '@/lib/bait'
import type { AlmanacData } from './almanacActions'

const GOLD = '#f0c040'
const CRATE_ORDER = ['wooden', 'metal', 'gold', 'diamond', 'ancient'] as const

export default function AlmanacRecord({ data }: { data: AlmanacData }) {
  // Two different questions. WHAT YOU HAVE MET is everCaught, which counts a
  // prestiged zone as collected. HOW MUCH YOU HAVE LANDED can only come from
  // real counts, so the bars and totals use those and a wiped species simply
  // contributes nothing rather than a made-up 1.
  const metAny = useMemo(() => data.entries.filter(e => e.everCaught), [data.entries])
  const caughtOnly = useMemo(() => data.entries.filter(e => e.count > 0), [data.entries])

  const byZone = useMemo(() => ZONE_ORDER.map(z => ({
    key: z,
    n: caughtOnly.filter(e => e.habitat === z).reduce((a, e) => a + e.count, 0),
  })).filter(r => r.n > 0), [caughtOnly])

  const byRarity = useMemo(() => [1, 2, 3, 4, 5].map(r => ({
    key: r,
    n: caughtOnly.filter(e => e.rarity === r).reduce((a, e) => a + e.count, 0),
    have: metAny.filter(e => e.rarity === r).length,
    total: data.entries.filter(e => e.rarity === r).length,
  })), [caughtOnly, metAny, data.entries])

  const mostCaught = useMemo(() => [...caughtOnly].sort((a, b) => b.count - a.count).slice(0, 5), [caughtOnly])

  // Everything you have ever landed, at list price. Not what you were paid:
  // the market moves and quick-sell takes its cut.
  const worthLanded = useMemo(() => caughtOnly.reduce((a, e) => a + e.count * e.sellValue, 0), [caughtOnly])

  const firstEver = useMemo(() => caughtOnly
    .filter(e => e.firstCaughtAt)
    .sort((a, b) => (a.firstCaughtAt! < b.firstCaughtAt! ? -1 : 1))[0] ?? null, [caughtOnly])

  const newest = useMemo(() => caughtOnly
    .filter(e => e.firstCaughtAt)
    .sort((a, b) => (a.firstCaughtAt! > b.firstCaughtAt! ? -1 : 1))[0] ?? null, [caughtOnly])

  const crateRows = CRATE_ORDER.map(t => ({ t, n: data.stats.crateOpens[t] ?? 0 })).filter(r => r.n > 0)
  const crateCounted = crateRows.reduce((a, r) => a + r.n, 0)
  const baitRows = BAITS.map(b => ({ b, n: data.stats.baitUsed[b.type] ?? 0 })).filter(r => r.n > 0).sort((a, b) => b.n - a.n)

  const charted = metAny.length
  const total = data.entries.length
  const totalCatches = useMemo(() => caughtOnly.reduce((a, e) => a + e.count, 0), [caughtOnly])

  const zoneMax = Math.max(1, ...byZone.map(r => r.n))
  const rarityMax = Math.max(1, ...byRarity.map(r => r.n))

  return (
    <>
      {/* ── The standing ── moved down out of the header, which is nothing but
          the tabs now. It gets to be the top of a page here instead of a strip
          you scroll past on your way somewhere else. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span className="font-cinzel font-800" style={{ fontSize: '2.1rem', lineHeight: 1, color: '#efe9ff', fontVariantNumeric: 'tabular-nums' }}>{charted}</span>
          <span className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#a49dc0' }}>of {total} charted</span>
        </div>
        <span className="font-karla font-700" style={{ fontSize: '0.78rem', color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
          {total > 0 ? Math.round((charted / total) * 100) : 0}%
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginBottom: 11 }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${total > 0 ? (charted / total) * 100 : 0}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          style={{ height: '100%', borderRadius: 999, background: `linear-gradient(90deg, #6d5bb0, ${ACCENT})` }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', marginBottom: '1.6rem', borderTop: '1px solid rgba(255,255,255,0.09)', borderBottom: '1px solid rgba(255,255,255,0.09)' }}>
        <Stat label="Catches" value={compact(totalCatches)} />
        <Stat label="Casts" value={compact(data.stats.casts)} />
        <Stat label="Perfects" value={compact(data.stats.perfects)} accent="#7dd3fc" />
        <Stat label="Trophies" value={compact(data.stats.trophySizeCatches)} accent="#fbbf24" />
      </div>

      {/* ── The career ── no longer hidden behind a disclosure, because this
          tab exists to hold exactly this. */}
      <Section title="The Career" note="Everything the log has kept on you" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 16, rowGap: 5, marginBottom: '1.5rem' }}>
        <Line label="Best perfect streak" value={data.stats.bestPerfectStreak.toLocaleString()} accent="#7dd3fc" />
        <Line label="Crates opened" value={compact(data.stats.cratesOpened)} />
        <Line label="Double catches" value={compact(data.stats.doubleCatches)} />
        <Line label="Rod jackpots" value={compact(data.stats.jackpots)} accent="#fbbf24" />
        <Line label="Snags" value={compact(data.stats.snags)} />
        <Line label="Fishing XP" value={compact(data.stats.fishingXP)} />
        <Line label="Goldens landed" value={`${data.goldens.length}`} accent={GOLD} />
        <Line label="Species met" value={`${charted}`} />
      </div>

      {ZONE_ORDER.some(z => (data.prestige[z] ?? 0) > 0) && (
        <>
          <Section title="Prestige" note="Waters you have cleared and started over" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 16, rowGap: 5, marginBottom: '1.5rem' }}>
            {ZONE_ORDER.filter(z => (data.prestige[z] ?? 0) > 0).map(z => (
              <Line key={z} label={ZONE_LABEL[z]} value={`✦ ${data.prestige[z]}`} accent={GOLD} />
            ))}
          </div>
        </>
      )}

      {/* ── Where you fish ── */}
      <Section title="By Water" note="Every catch, counted from your first cast" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: '1.4rem' }}>
        {byZone.map(({ key, n }, i) => (
          <Bar key={key} label={ZONE_LABEL[key]} value={n} pct={n / zoneMax} color={ZONE_COLOR[key]} delay={i * 0.05} />
        ))}
      </div>

      {/* ── What you pull up ── */}
      <Section title="By Rarity" note="Caught, and how much of each tier you have met" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: '1.4rem' }}>
        {byRarity.map(({ key, n, have, total }, i) => (
          <Bar key={key} label={RARITY_LABEL[key]} value={n} pct={n / rarityMax} color={RARITY_COLOR[key]}
            trailing={`${have}/${total} met`} delay={i * 0.05} />
        ))}
      </div>

      {/* ── The regulars ── */}
      {mostCaught.length > 0 && (
        <>
          <Section title="Most Caught" note="The fish that keep taking your hook" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: '1.4rem' }}>
            {mostCaught.map((e, i) => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.3rem 0.1rem', borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
                <span className="font-cinzel font-700" style={{ fontSize: '0.68rem', color: '#8a83ad', width: 12, flexShrink: 0 }}>{i + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fishArt(e.name)} alt="" aria-hidden loading="lazy" decoding="async"
                  style={{ width: 34, height: 28, objectFit: 'contain', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#e4dff2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</p>
                  <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: ZONE_COLOR[e.habitat] ?? '#a49dc0' }}>{ZONE_LABEL[e.habitat] ?? e.habitat}</p>
                </div>
                <span className="font-cinzel font-700" style={{ fontSize: '0.86rem', color: '#ded8ee', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>×{e.count}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Crates ── */}
      <Section title="Crates Opened"
        note={crateCounted > 0
          ? `${compact(data.stats.cratesOpened)} opened all time, ${compact(crateCounted)} of them counted by tier`
          : `${compact(data.stats.cratesOpened)} opened all time. Tiers are counted from now on`} />
      {crateRows.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7, marginBottom: '1.4rem' }}>
          {crateRows.map(({ t, n }) => {
            const c = CRATE_TIERS[t]
            return (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0.35rem 0.1rem 0.35rem 0.6rem', borderLeft: `2px solid ${c.accent}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/${c.art}closed.png`} alt="" aria-hidden loading="lazy" decoding="async"
                  style={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-karla font-700" style={{ fontSize: '0.64rem', color: c.accent, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#ded8ee', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{n.toLocaleString()}</p>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="font-karla font-400" style={{ fontSize: '0.66rem', color: '#8a83ad', lineHeight: 1.5, marginBottom: '1.4rem' }}>
          Nothing counted yet. The next crate you crack starts the tally.
        </p>
      )}

      {/* ── Bait ── */}
      {baitRows.length > 0 && (
        <>
          <Section title="Bait Burned" note="Counted from now on, by what you tie on" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: '1.4rem' }}>
            {baitRows.map(({ b, n }) => (
              <div key={b.type} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: '0.2rem 0.1rem' }}>
                <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: b.color }}>{b.name}</span>
                <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: '#c8c2dc', fontVariantNumeric: 'tabular-nums' }}>{n.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── The ledger ── */}
      <Section title="The Ledger" note="What all of it has been worth" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7, marginBottom: '1.4rem' }}>
        <Panel label="Worth landed" value={`${compact(worthLanded)} ⟡`} accent={GOLD}
          note="Everything ever caught, at list price" />
        <Panel label="Earned selling" value={`${compact(data.stats.doubloonsFromFish)} ⟡`} accent={GOLD}
          note="What the market actually paid" />
        {data.stats.fishSoldCount > 0 && <Panel label="Fish sold" value={compact(data.stats.fishSoldCount)} note="Counted from now on" />}
        {data.stats.biggestSale > 0 && <Panel label="Best single sale" value={`${compact(data.stats.biggestSale)} ⟡`} accent={GOLD} note="Counted from now on" />}
      </div>

      {/* ── Firsts ── */}
      {(firstEver || newest) && (
        <>
          <Section title="Firsts" note="Where it started, and the latest name in the book" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '0.6rem' }}>
            {firstEver && <Milestone label="First fish you ever landed" entry={firstEver} />}
            {newest && newest.id !== firstEver?.id && <Milestone label="Newest species charted" entry={newest} />}
          </div>
        </>
      )}
    </>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ padding: '0.55rem 0.3rem', textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="font-cinzel font-700" style={{ fontSize: '0.98rem', lineHeight: 1, color: accent ?? '#d8d2ea', fontVariantNumeric: 'tabular-nums', marginBottom: 3 }}>{value}</p>
      <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.56rem', color: '#9a93b8' }}>{label}</p>
    </div>
  )
}

function Line({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
      <span className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#9a93b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span className="font-karla font-700" style={{ fontSize: '0.68rem', color: accent ?? '#c8c2dc', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

function Section({ title, note }: { title: string; note?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#e8e3f5' }}>{title}</p>
      {note && <p className="font-karla font-400 italic" style={{ fontSize: '0.66rem', color: '#9a93b8', marginTop: 1, lineHeight: 1.4 }}>{note}</p>}
    </div>
  )
}

function Bar({ label, value, pct, color, trailing, delay }: {
  label: string; value: number; pct: number; color: string; trailing?: string; delay: number
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
        <span className="font-karla font-700" style={{ fontSize: '0.64rem', color: '#d4cfe4', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
          {trailing && <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#9a93b8', whiteSpace: 'nowrap' }}>{trailing}</span>}
          <span className="font-cinzel font-700" style={{ fontSize: '0.78rem', color, fontVariantNumeric: 'tabular-nums' }}>{value.toLocaleString()}</span>
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(2, pct * 100)}%` }}
          transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
          style={{ height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${color}88, ${color})` }} />
      </div>
    </div>
  )
}

function Panel({ label, value, accent, note }: { label: string; value: string; accent?: string; note?: string }) {
  return (
    <div style={{ padding: '0.1rem 0 0.3rem 0.6rem', borderLeft: `2px solid ${accent ?? 'rgba(255,255,255,0.16)'}` }}>
      <p className="font-karla font-600 uppercase tracking-[0.09em]" style={{ fontSize: '0.64rem', color: '#9a93b8', marginBottom: 3 }}>{label}</p>
      <p className="font-cinzel font-700" style={{ fontSize: '1rem', lineHeight: 1, color: accent ?? '#ded8ee', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {note && <p className="font-karla font-400" style={{ fontSize: '0.66rem', color: '#8a83ad', marginTop: 3, lineHeight: 1.3 }}>{note}</p>}
    </div>
  )
}

function Milestone({ label, entry }: { label: string; entry: AlmanacData['entries'][number] }) {
  const c = ZONE_COLOR[entry.habitat] ?? '#a78bfa'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0.35rem 0.1rem 0.35rem 0.6rem', borderLeft: `2px solid ${c}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fishArt(entry.name)} alt="" aria-hidden loading="lazy" decoding="async"
        style={{ width: 40, height: 34, objectFit: 'contain', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-karla font-600 uppercase tracking-[0.09em]" style={{ fontSize: '0.64rem', color: '#9a93b8' }}>{label}</p>
        <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: '#e8e3f5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</p>
        <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: c }}>{shortDate(entry.firstCaughtAt)}</p>
      </div>
    </div>
  )
}
