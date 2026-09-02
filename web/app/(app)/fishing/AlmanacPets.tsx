'use client'

// The Pets room. Everything that has ever ridden on your boat, grouped by
// species, rarest variant first within each.
//
// Both the species list and the order come from PETS itself, so adding a
// seventh species means editing the registry and nothing here. That is the
// same lesson the gear modal's hardcoded [parrot, monkey, seal] taught.

import { motion } from 'framer-motion'
import { PETS, PET_SPECIES_ORDER, PET_SPECIES_LABEL, petDropShare } from '@/lib/pets'
import { petArt } from '@/lib/almanac'
import type { AlmanacData } from './almanacActions'

export default function AlmanacPets({ data }: { data: AlmanacData }) {
  const owned = new Set(data.unlockedPets)

  return (
    <>
      {/* The odds are the SHARE OF PET FINDS, not a chance per crate. A pet
          costs two rolls: whether the crate hides one at all, which depends
          entirely on the crate tier, and then which pet it is, which does not.
          Only the second is a property of the pet, so only the second can be
          printed under it. The first belongs in this line. */}
      <p className="font-karla font-400 italic" style={{ fontSize: '0.64rem', color: '#9a93b8', lineHeight: 1.45, marginBottom: '1rem' }}>
        Nearly every one came out of a crate, from about 1 in 200 wooden ones up to 1 in 10 Ancient Chests. When one does turn up, this is how often it is each of them.
      </p>

      {PET_SPECIES_ORDER.map(species => {
        // Weight is the drop weight, so ascending weight is rarest first.
        const list = PETS.filter(p => p.species === species).sort((a, b) => a.weight - b.weight)
        const got = list.filter(p => owned.has(p.id)).length
        const done = got === list.length
        // The species' own colour comes from its rarest member, so each block
        // is tinted by its chase pet rather than a hand-kept palette.
        const accent = list[0]?.accentColor ?? '#a78bfa'
        return (
          <div key={species} style={{ marginBottom: '1.35rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span aria-hidden style={{ width: 3, height: 15, borderRadius: 2, background: accent, flexShrink: 0 }} />
              <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#e8e3f5', flex: 1, minWidth: 0 }}>{PET_SPECIES_LABEL[species]}</p>
              <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: done ? '#f0c040' : '#a49dc0', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {done ? '✦ complete' : `${got}/${list.length}`}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(228px, 1fr))', gap: '0.5rem 0.4rem' }}>
              {list.map((p, i) => {
                const has = owned.has(p.id)
                return (
                  <motion.div key={p.id}
                    initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.26, delay: Math.min(i * 0.03, 0.3) }}
                    style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0.35rem 0.15rem 0.5rem', minWidth: 0, maxWidth: '100%' }}>
                    <div style={{ position: 'relative', width: '100%', height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {has && (
                        <span aria-hidden style={{
                          position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%, -50%)',
                          width: 122, height: 122, borderRadius: '50%', pointerEvents: 'none',
                          background: `radial-gradient(circle, ${p.accentColor}1c 0%, transparent 66%)`,
                        }} />
                      )}
                      {/* An EARNED pet is concealed outright rather than shown
                          as a silhouette: its shape is the surprise, and the
                          Vigil's plesiosaur is unmistakable in outline. */}
                      {!has && p.earnedOnly ? (
                        <span aria-hidden className="font-cinzel font-800" style={{ position: 'relative', fontSize: '2.4rem', color: 'rgba(224,69,90,0.4)' }}>?</span>
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={petArt(p.restImageUrl)} alt="" aria-hidden loading="lazy" decoding="async"
                          style={{ position: 'relative', maxWidth: 112, maxHeight: 106, objectFit: 'contain', filter: has ? 'drop-shadow(0 4px 8px rgba(0,0,0,0.55))' : 'brightness(0) opacity(0.26)' }} />
                      )}
                      {has && (
                        <span aria-hidden style={{
                          position: 'absolute', left: '50%', bottom: 2, transform: 'translateX(-50%)',
                          width: 58, height: 7, borderRadius: '50%', pointerEvents: 'none',
                          background: 'radial-gradient(ellipse, rgba(0,0,0,0.45) 0%, transparent 72%)',
                        }} />
                      )}
                    </div>
                    <p className="font-cinzel font-700" style={{ width: '100%', minWidth: 0, marginTop: 7, fontSize: '0.86rem', height: '1.1rem', lineHeight: '1.1rem', color: has ? '#efeaf8' : '#7b7499', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {has ? p.name : '???'}
                    </p>
                    {/* Shown on the ones you have NOT found too. A masked name
                        keeps the surprise; the odds are what tells you the
                        silhouette in the corner is worth chasing. Fixed height
                        so a row of cards cannot end up ragged. */}
                    <p className="font-karla font-600" style={{ fontSize: '0.6rem', height: '0.85rem', lineHeight: '0.85rem', color: p.earnedOnly ? '#e0455a' : has ? '#a49dc0' : '#6f6890', fontVariantNumeric: 'tabular-nums' }}>
                      {/* An earned pet is not in the roll at all, so "0.0% of
                          finds" would read as astronomically rare rather than
                          impossible. Name the reason instead. */}
                      {p.earnedOnly ? 'Never from a crate' : `${(petDropShare(p) * 100).toFixed(1)}% of finds`}
                    </p>
                    <span aria-hidden style={{ marginTop: 4, width: has ? 28 : 14, height: 1.5, borderRadius: 2, background: has ? `linear-gradient(90deg, transparent, ${p.accentColor}, transparent)` : 'rgba(255,255,255,0.10)' }} />
                  </motion.div>
                )
              })}
            </div>
          </div>
        )
      })}
    </>
  )
}
