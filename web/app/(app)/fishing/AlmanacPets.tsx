'use client'

// The Pets room. Everything that has ever ridden on your boat, grouped by
// species, rarest variant first within each.
//
// Both the species list and the order come from PETS itself, so adding a
// seventh species means editing the registry and nothing here. That is the
// same lesson the gear modal's hardcoded [parrot, monkey, seal] taught.

import { motion } from 'framer-motion'
import { PETS, PET_SPECIES_ORDER, PET_SPECIES_LABEL } from '@/lib/pets'
import type { AlmanacData } from './almanacActions'

export default function AlmanacPets({ data }: { data: AlmanacData }) {
  const owned = new Set(data.unlockedPets)

  return (
    <>
      <p className="font-karla font-400 italic" style={{ fontSize: '0.64rem', color: '#9a93b8', lineHeight: 1.45, marginBottom: '1rem' }}>
        Every one of them came out of a crate. The rarer the crate, the better the odds one was in it.
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
              {list.map((p, i) => {
                const has = owned.has(p.id)
                return (
                  <motion.div key={p.id}
                    initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.26, delay: Math.min(i * 0.03, 0.3) }}
                    style={{
                      position: 'relative', borderRadius: 11, overflow: 'hidden',
                      padding: '0.7rem 0.35rem 0.55rem', textAlign: 'center',
                      background: has ? `linear-gradient(180deg, ${p.accentColor}22, rgba(0,0,0,0.30))` : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${has ? p.accentColor + '55' : 'rgba(255,255,255,0.06)'}`,
                    }}>
                    {has && <span aria-hidden style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 34%, ${p.accentColor}1f, transparent 70%)`, pointerEvents: 'none' }} />}
                    <div style={{ position: 'relative', height: 66, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginBottom: 3 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.restImageUrl} alt="" aria-hidden loading="lazy" decoding="async"
                        style={{ maxWidth: 72, maxHeight: 66, objectFit: 'contain', filter: has ? `drop-shadow(0 3px 10px ${p.accentColor}80)` : 'brightness(0) opacity(0.4)' }} />
                    </div>
                    <p className="font-karla font-700" style={{ fontSize: '0.62rem', lineHeight: 1.15, color: has ? '#ded8ee' : '#8a83ad', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {has ? p.name : '???'}
                    </p>
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
