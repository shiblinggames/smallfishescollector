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
import { ZONE_LABEL, ZONE_COLOR } from './zoneData'
import { fishArt, shortDate, isGiant } from '@/lib/bestiary'
import { tierForLength, TIER_COLOR, TIER_LABEL, formatFishLength } from '@/lib/fishSize'
import type { BestiaryData, BestiaryEntry } from './bestiaryActions'

const ANCIENT = '#c084fc'

export default function BestiaryGiants({ data, giants }: { data: BestiaryData; giants: BestiaryEntry[] }) {
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
        <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: got === giants.length ? '#f0c040' : '#6b6486', fontVariantNumeric: 'tabular-nums' }}>
          {got}/{giants.length}
        </span>
      </div>
      <p className="font-karla font-400 italic" style={{ fontSize: '0.64rem', color: '#5b5478', lineHeight: 1.45, marginBottom: 10 }}>
        Six things that should not still be down there. They fetch nothing at market because nobody would dare buy one.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1.5rem' }}>
        {giants.map((g, i) => {
          const caught = g.count > 0
          return (
            <motion.div key={g.id}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 11,
                borderRadius: 13, padding: '0.6rem 0.75rem', overflow: 'hidden',
                background: caught
                  ? 'linear-gradient(180deg, rgba(28,18,40,0.95) 0%, rgba(12,9,20,0.97) 100%)'
                  : 'rgba(255,255,255,0.022)',
                border: `1px solid ${caught ? ANCIENT + '66' : 'rgba(255,255,255,0.06)'}`,
              }}>
              {caught && <span aria-hidden style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 16% 50%, ${ANCIENT}22, transparent 62%)`, pointerEvents: 'none' }} />}
              <div style={{ position: 'relative', width: 62, height: 50, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fishArt(g.name)} alt="" aria-hidden loading="lazy" decoding="async"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: caught ? 'drop-shadow(0 2px 8px rgba(192,132,252,0.4))' : 'brightness(0) opacity(0.4)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: caught ? '#f0eaff' : '#4e4866', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {caught ? g.name : '???'}
                </p>
                {caught ? (
                  <p className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#8b83a8', marginTop: 2 }}>
                    Raised {shortDate(g.firstCaughtAt)}
                    {g.pbLength != null ? ` · ${formatFishLength(g.pbLength)}` : ''}
                    {g.count > 1 ? ` · ×${g.count}` : ''}
                  </p>
                ) : (
                  <p className="font-karla font-400 italic" style={{ fontSize: '0.58rem', color: '#403a58', marginTop: 2 }}>Still down there</p>
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
        <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: '#6b6486', fontVariantNumeric: 'tabular-nums' }}>{trophies.length}</span>
      </div>

      {trophies.length === 0 ? (
        <p className="font-karla font-400" style={{ fontSize: '0.7rem', color: '#4e4866', lineHeight: 1.5, padding: '1rem 0' }}>
          No trophy-size catches yet. Every fish is rolled against its own length range, and the top of that range is a trophy.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {trophies.map(({ e, pct }) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, padding: '0.42rem 0.6rem' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fishArt(e.name)} alt="" aria-hidden loading="lazy" decoding="async"
                style={{ width: 34, height: 26, objectFit: 'contain', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#e4dff2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</p>
                <p className="font-karla font-600" style={{ fontSize: '0.5rem', color: ZONE_COLOR[e.habitat] ?? '#6b6486' }}>{ZONE_LABEL[e.habitat] ?? e.habitat}</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p className="font-cinzel font-700" style={{ fontSize: '0.8rem', color: TIER_COLOR.trophy, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{formatFishLength(e.pbLength!)}</p>
                <p className="font-karla font-600" style={{ fontSize: '0.46rem', color: '#7a7264', marginTop: 2 }}>
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
