'use client'

// The Giants room — the six Ancient Deep mounts, and nothing else.
//
// They are worth nothing at market because they are not stock, they are
// mounts, so they get full-width slabs rather than grid cells. Post-finale
// each slab carries its VIGIL RANK and can be released back into the deep.
//
// Trophy records used to share this room. They were cut: an ordinary species
// whose PB landed in the top size tier already wears a trophy icon in the
// collection, so listing them again here said the same thing twice and buried
// the six under a long tail of everything else.

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ZONE_BG } from './zoneData'
import { fishArt, shortDate } from '@/lib/almanac'
import { formatFishLength } from '@/lib/fishSize'
import type { AlmanacData, AlmanacEntry } from './almanacActions'
import {
  VIGIL_MAX_RANK, VIGIL_MAX_TOTAL, VIGIL_FIGHT_TELL, VIGIL_FRAME,
  vigilTotal, vigilNumeral, vigilChanges,
} from '@/lib/ancientVigil'
import AncientRelease from './AncientRelease'
import { releaseAncient } from './actions'

const ANCIENT = '#c084fc'

export default function AlmanacGiants({ data, giants }: { data: AlmanacData; giants: AlmanacEntry[] }) {
  const got = giants.filter(g => g.everCaught).length
  const vigil = data.vigil
  const unlocked = data.vigilUnlocked
  const total = vigilTotal(vigil)
  // The giant whose release ceremony is open, if any.
  const [releasing, setReleasing] = useState<AlmanacEntry | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  // Giants released during THIS visit. The almanac payload is fetched once on
  // open, so without this the slab would still read as mounted behind the
  // ceremony that just let it go.
  const [localReleased, setLocalReleased] = useState<number[]>([])

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span aria-hidden style={{ width: 3, height: 15, borderRadius: 2, background: ANCIENT, flexShrink: 0 }} />
        <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#e8e3f5', flex: 1 }}>The Ancient Deep</p>
        {/* Post-finale the wall counts VIGIL, not mounts: everyone who gets
            here already has all six, so "6/6" said nothing. */}
        <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: unlocked ? (total === VIGIL_MAX_TOTAL ? '#f0c040' : '#c9a7ff') : got === giants.length ? '#f0c040' : '#a49dc0', fontVariantNumeric: 'tabular-nums' }}>
          {unlocked ? `${total}/${VIGIL_MAX_TOTAL} Vigil` : `${got}/${giants.length}`}
        </span>
      </div>
      <p className="font-karla font-400 italic" style={{ fontSize: '0.64rem', color: '#9a93b8', lineHeight: 1.45, marginBottom: 10 }}>
        {unlocked
          ? 'Finn is done, and the six are stirring again. Put one back in the water and it will come up harder than it did the first time.'
          : 'Six things that should not still be down there. They fetch nothing at market because nobody would dare buy one.'}
      </p>

      {/* THE SIX, one per row on a phone and TWO ACROSS once there is room.
          They are wide banners with the giant's art inset on the right, so a
          single column on a desktop leaves each of them stretched to a metre of
          nothing between the words and the picture. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 9, marginBottom: '1.6rem' }}>
        {giants.map((g, i) => {
          const caught = g.everCaught
          const entry = unlocked ? vigil[String(g.id)] : undefined
          const rank = entry?.rank ?? 0
          const atLarge = entry?.released === true || localReleased.includes(g.id)
          const frame = rank ? VIGIL_FRAME[rank] : null
          // Tappable only where there is something to do or read: a mounted
          // giant can be released, one at large explains where it went.
          const tappable = unlocked && caught
          const edge = atLarge ? 'rgba(148,163,184,0.55)' : frame ? `${frame.accent}88` : caught ? ANCIENT + '77' : 'rgba(255,255,255,0.07)'
          return (
            <div key={g.id}>
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.34, delay: i * 0.05 }}
              onClick={tappable ? () => setOpenId(v => (v === g.id ? null : g.id)) : undefined}
              style={{
                position: 'relative', height: 118, borderRadius: 14, overflow: 'hidden',
                // An empty berth is DASHED and unlit: it must not read as a
                // mount with different text on it.
                // The rank's own border -- it thickens and brightens up the
                // ladder, so the six read as different objects at a glance.
                border: atLarge ? '1px dashed rgba(120,150,180,0.42)' : frame ? frame.border : `1px solid ${edge}`,
                cursor: tappable ? 'pointer' : undefined,
                boxShadow: atLarge ? 'inset 0 -34px 60px -34px rgba(56,110,150,0.4)'
                  : caught ? (frame ? `0 6px 22px rgba(0,0,0,0.5), 0 0 ${frame.trophy ? 34 : 18}px ${frame.glow}` : '0 6px 22px rgba(0,0,0,0.5)') : undefined,
              }}>
              {/* The Ancient Deep itself behind each mount. Uncaught slabs keep
                  the water but lose the colour, so the room reads as six berths
                  in one place rather than six unrelated cards. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ZONE_BG.ancient_deep} alt="" aria-hidden loading="lazy" decoding="async"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: `center ${8 + i * 3}%`,
                  filter: atLarge ? 'saturate(0.5) brightness(0.5)' : caught ? undefined : 'grayscale(0.9) brightness(0.4)' }} />
              <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(6,5,12,0.94) 0%, rgba(6,5,12,0.72) 46%, rgba(6,5,12,0.34) 100%)' }} />
              {/* THE RANK'S MATERIAL. Layered gradients, never a flat fill, so
                  the painted water still reads through it. */}
              {frame && !atLarge && <span aria-hidden style={{ position: 'absolute', inset: 0, background: frame.plate }} />}
              {caught && !atLarge && <span aria-hidden style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 76% 52%, ${ANCIENT}1e, transparent 58%)` }} />}
              {atLarge && <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 76% 92%, rgba(56,110,150,0.22), transparent 62%)' }} />}

              {/* The beast, given the right half of the slab. */}
              <div style={{ position: 'absolute', right: 4, top: 0, bottom: 0, width: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fishArt(g.name)} alt="" aria-hidden loading="lazy" decoding="async"
                  style={{ maxWidth: '100%', maxHeight: 104, objectFit: 'contain',
                    // At large: the berth keeps its water but the mount is gone
                    // to a shape in the dark, so an empty slot reads as absence
                    // rather than as never-caught.
                    filter: atLarge ? 'brightness(0.16) opacity(0.4) blur(0.6px)'
                      // Rank V: the giant itself is struck in gold.
                      : frame?.fishFilter ? frame.fishFilter
                      : caught ? `drop-shadow(0 5px 10px rgba(0,0,0,0.6))${frame ? ` drop-shadow(0 0 12px ${frame.glow})` : ''}`
                      : 'brightness(0) opacity(0.42)' }} />
              </div>

              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '62%', padding: '0.7rem 0.85rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.64rem', color: atLarge ? '#94a3b8' : frame ? frame.accent : caught ? ANCIENT : '#847dab', marginBottom: 2 }}>
                  {/* "Mount 3 of 6" was this slab's INDEX on the wall, not a
                      rank -- it told you nothing. Once the Vigil is open the
                      slot carries the rank instead, and two ordinal-looking
                      numbers never stack. */}
                  {!caught ? 'Unraised'
                    : atLarge ? 'Berth empty'
                    : frame?.trophy ? 'Mastered'
                    : rank ? `Rank ${vigilNumeral(rank)} of ${vigilNumeral(VIGIL_MAX_RANK)}`
                    : `Mount ${i + 1} of ${giants.length}`}
                </p>
                <p className="font-cinzel font-800" style={{ fontSize: '1.08rem', lineHeight: 1.08, color: atLarge ? 'rgba(190,205,220,0.72)' : caught ? '#f2ecff' : '#8a83ad', textShadow: atLarge ? '0 2px 8px rgba(0,0,0,0.9)' : caught ? `0 2px 8px rgba(0,0,0,0.9), 0 0 14px ${ANCIENT}44` : undefined }}>
                  {caught ? g.name : '???'}
                </p>
                {caught ? (
                  <p className="font-karla font-600" style={{ fontSize: '0.64rem', color: '#b8b1d0', marginTop: 3, lineHeight: 1.35 }}>
                    {/* Built from the parts that EXIST. An ancient is logged on
                        profiles.ancient_catches, which keeps no date and no
                        count, so a fixed separator printed a leading dot on
                        exactly the six that matter most in this room. */}
                    {atLarge
                      ? 'Somewhere in the Ancient Deep. It rises for a lure, and nothing else.'
                      : ([
                          shortDate(g.firstCaughtAt),
                          g.pbLength != null ? formatFishLength(g.pbLength) : '',
                          // `raised xN` counts CATCHES; a rank counts PERFECTS.
                          // Showing both invites "which one is lying?", so the
                          // rank takes the slot once the Vigil is open.
                          !unlocked && g.count > 1 ? `raised ×${g.count}` : '',
                        ].filter(Boolean).join(' · ') || 'Raised')}
                  </p>
                ) : (
                  <p className="font-karla font-400 italic" style={{ fontSize: '0.64rem', color: '#847dab', marginTop: 3 }}>Still down there</p>
                )}
              </div>

              {/* Rank numeral, right edge — the wall reads at a glance without
                  opening anything. */}
              {frame && !atLarge && (
                <span aria-hidden className="font-cinzel font-800" style={{
                  position: 'absolute', right: 10, top: 8, fontSize: '0.8rem', lineHeight: 1,
                  color: frame.accent, textShadow: `0 0 12px ${frame.glow}, 0 2px 6px rgba(0,0,0,0.9)`,
                }}>{vigilNumeral(rank)}</span>
              )}
              {tappable && (
                <span aria-hidden style={{
                  position: 'absolute', right: 10, bottom: 9, width: 6, height: 6, borderRadius: '50%',
                  background: openId === g.id ? (frame?.accent ?? ANCIENT) : 'rgba(255,255,255,0.28)',
                }} />
              )}
            </motion.div>

            {/* Detail — expands under the slab it belongs to, so the wall stays
                the wall instead of throwing a modal over it. */}
            <AnimatePresence initial={false}>
              {openId === g.id && (
                <motion.div key={`d-${g.id}`}
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  style={{ overflow: 'hidden' }}>
                  <div style={{
                    marginTop: 7, padding: '0.8rem 0.9rem', borderRadius: 12,
                    background: 'rgba(8,6,16,0.72)',
                    border: `1px solid ${atLarge ? 'rgba(148,163,184,0.3)' : `${frame?.accent ?? ANCIENT}33`}`,
                  }}>
                    {atLarge ? (
                      <p className="font-karla" style={{ fontSize: '0.7rem', color: '#b8b1d0', lineHeight: 1.5 }}>
                        It is out there now, and it will not come up for ordinary bait. Take a Golden or Luminous Lure down to the Ancient Deep and land it on a perfect to raise its rank.
                      </p>
                    ) : rank >= VIGIL_MAX_RANK ? (
                      <p className="font-karla" style={{ fontSize: '0.7rem', color: '#e7d5aa', lineHeight: 1.5 }}>
                        Mastered. There is nothing left this one can teach you.
                      </p>
                    ) : (
                      <>
                        <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.52rem', color: frame?.accent ?? ANCIENT, marginBottom: 5 }}>
                          Release for Rank {vigilNumeral(rank + 1)}
                        </p>
                        <p className="font-karla" style={{ fontSize: '0.68rem', color: '#b8b1d0', lineHeight: 1.5 }}>
                          {VIGIL_FIGHT_TELL[g.id]}
                        </p>
                        <ul style={{ margin: '7px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {vigilChanges(rank + 1).map(line => (
                            <li key={line} className="font-karla" style={{ fontSize: '0.66rem', color: '#9a93b8', lineHeight: 1.4 }}>· {line}</li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setReleasing(g) }}
                          className="font-karla font-700 uppercase tracking-[0.12em] tap"
                          style={{
                            marginTop: 10, width: '100%', padding: '0.6rem', borderRadius: 10,
                            background: 'transparent', border: `1px solid ${frame?.accent ?? ANCIENT}66`,
                            color: frame?.accent ?? ANCIENT, fontSize: '0.62rem', cursor: 'pointer',
                          }}>
                          Release it
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          )
        })}
      </div>

      {/* The ceremony. Optimistic on success: the slab flips to At large the
          moment the server confirms, so the wall matches the fiction you just
          watched instead of waiting on a refetch. */}
      {releasing && (
        <AncientRelease
          name={releasing.name}
          fishId={releasing.id}
          rank={vigil[String(releasing.id)]?.rank ?? 1}
          onConfirm={async () => {
            const res = await releaseAncient(releasing.id)
            if ('ok' in res) setLocalReleased(prev => [...prev, releasing.id])
          }}
          onClose={() => { setReleasing(null); setOpenId(null) }}
        />
      )}

    </>
  )
}
