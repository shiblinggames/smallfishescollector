'use client'

// The Giants room. Two kinds of "big" that mean different things:
//
//   THE ANCIENT DEEP MOUNTS — six species worth nothing at market because they
//   are not stock, they are mounts. Each is caught once and that is the whole
//   record, so they get full-width slabs rather than grid cells.
//
//   YOUR TROPHY RECORDS — ordinary species where your personal best landed in
//   the top size tier. Nothing gates these; they are the long tail of every
//   time the roll went your way, ranked by how close to the species maximum
//   you got.

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { ZONE_LABEL, ZONE_COLOR, ZONE_BG } from './zoneData'
import { fishArt, shortDate, isGiant } from '@/lib/almanac'
import { tierForLength, TIER_COLOR, TIER_LABEL, formatFishLength } from '@/lib/fishSize'
import type { AlmanacData, AlmanacEntry } from './almanacActions'

const ANCIENT = '#c084fc'

export default function AlmanacGiants({ data, giants }: { data: AlmanacData; giants: AlmanacEntry[] }) {
  // Every species whose PB hit the top tier, best proportion first. A 40in fish
  // that maxes at 42 is a better story than a 90in one that maxes at 200.
  const trophies = useMemo(() => data.entries
    .filter(e => !isGiant(e.sellValue, e.habitat) && e.pbLength != null && e.lengthMin != null && e.lengthMax != null)
    .map(e => ({ e, pct: (e.pbLength! - e.lengthMin!) / Math.max(0.01, e.lengthMax! - e.lengthMin!) }))
    .filter(x => tierForLength(x.e.pbLength!, x.e.lengthMin!, x.e.lengthMax!) === 'trophy')
    .sort((a, b) => b.pct - a.pct), [data.entries])

  const got = giants.filter(g => g.count > 0).length

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span aria-hidden style={{ width: 3, height: 15, borderRadius: 2, background: ANCIENT, flexShrink: 0 }} />
        <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#e8e3f5', flex: 1 }}>The Ancient Deep</p>
        <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: got === giants.length ? '#f0c040' : '#a49dc0', fontVariantNumeric: 'tabular-nums' }}>
          {got}/{giants.length}
        </span>
      </div>
      <p className="font-karla font-400 italic" style={{ fontSize: '0.64rem', color: '#9a93b8', lineHeight: 1.45, marginBottom: 10 }}>
        Six things that should not still be down there. They fetch nothing at market because nobody would dare buy one.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: '1.6rem' }}>
        {giants.map((g, i) => {
          const caught = g.count > 0
          return (
            <motion.div key={g.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.34, delay: i * 0.05 }}
              style={{
                position: 'relative', height: 118, borderRadius: 14, overflow: 'hidden',
                border: `1px solid ${caught ? ANCIENT + '77' : 'rgba(255,255,255,0.07)'}`,
                boxShadow: caught ? `0 6px 22px rgba(0,0,0,0.5), 0 0 20px ${ANCIENT}22` : undefined,
              }}>
              {/* The Ancient Deep itself behind each mount. Uncaught slabs keep
                  the water but lose the colour, so the room reads as six berths
                  in one place rather than six unrelated cards. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ZONE_BG.ancient_deep} alt="" aria-hidden loading="lazy" decoding="async"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${8 + i * 3}%`, filter: caught ? undefined : 'grayscale(0.9) brightness(0.4)' }} />
              <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(6,5,12,0.94) 0%, rgba(6,5,12,0.72) 46%, rgba(6,5,12,0.34) 100%)' }} />
              {caught && <span aria-hidden style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 76% 52%, ${ANCIENT}30, transparent 60%)` }} />}

              {/* The beast, given the right half of the slab. */}
              <div style={{ position: 'absolute', right: 4, top: 0, bottom: 0, width: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fishArt(g.name)} alt="" aria-hidden loading="lazy" decoding="async"
                  style={{ maxWidth: '100%', maxHeight: 104, objectFit: 'contain', filter: caught ? `drop-shadow(0 4px 15px ${ANCIENT}88)` : 'brightness(0) opacity(0.42)' }} />
              </div>

              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '62%', padding: '0.7rem 0.85rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.64rem', color: caught ? ANCIENT : '#847dab', marginBottom: 2 }}>
                  {caught ? `Mount ${i + 1} of ${giants.length}` : 'Unraised'}
                </p>
                <p className="font-cinzel font-800" style={{ fontSize: '1.08rem', lineHeight: 1.08, color: caught ? '#f2ecff' : '#8a83ad', textShadow: caught ? `0 2px 8px rgba(0,0,0,0.9), 0 0 14px ${ANCIENT}44` : undefined }}>
                  {caught ? g.name : '???'}
                </p>
                {caught ? (
                  <p className="font-karla font-600" style={{ fontSize: '0.64rem', color: '#b8b1d0', marginTop: 3, lineHeight: 1.35 }}>
                    {shortDate(g.firstCaughtAt)}
                    {g.pbLength != null ? ` · ${formatFishLength(g.pbLength)}` : ''}
                    {g.count > 1 ? ` · raised ×${g.count}` : ''}
                  </p>
                ) : (
                  <p className="font-karla font-400 italic" style={{ fontSize: '0.64rem', color: '#847dab', marginTop: 3 }}>Still down there</p>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* ── Trophy records ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span aria-hidden style={{ width: 3, height: 15, borderRadius: 2, background: TIER_COLOR.trophy, flexShrink: 0 }} />
        <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#e8e3f5', flex: 1 }}>Trophy Records</p>
        <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: '#a49dc0', fontVariantNumeric: 'tabular-nums' }}>{trophies.length}</span>
      </div>

      {trophies.length === 0 ? (
        <p className="font-karla font-400" style={{ fontSize: '0.7rem', color: '#8a83ad', lineHeight: 1.5, padding: '1rem 0' }}>
          No trophy-size catches yet. Every fish is rolled against its own length range, and the top of that range is a trophy.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {trophies.map(({ e, pct }) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.35rem 0.1rem', borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fishArt(e.name)} alt="" aria-hidden loading="lazy" decoding="async"
                style={{ width: 34, height: 26, objectFit: 'contain', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#e4dff2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</p>
                <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: ZONE_COLOR[e.habitat] ?? '#a49dc0' }}>{ZONE_LABEL[e.habitat] ?? e.habitat}</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: TIER_COLOR.trophy, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{formatFishLength(e.pbLength!)}</p>
                <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#ab9f86', marginTop: 2 }}>
                  {Math.round(pct * 100)}% of max · {TIER_LABEL.trophy}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
