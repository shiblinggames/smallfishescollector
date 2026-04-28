import Image from 'next/image'
import type { BorderStyle, ArtEffect, CardStats } from '@/lib/types'
import { rarityFromVariant, RARITY_COLOR } from '@/lib/variants'

interface Props {
  name: string
  filename: string
  borderStyle: BorderStyle
  artEffect: ArtEffect
  variantName?: string
  dropWeight?: number
  unowned?: boolean
  className?: string
  stats?: CardStats
  cardW?: number
  fill?: boolean
}

const DEFAULT_W = 140
const DEFAULT_H = 196
const R         = 12

const artImageClass: Record<ArtEffect, string> = {
  normal:       '',
  holographic:  '',
  rainbow:      'art-rainbow',
  ghost:        'art-ghost',
  shadow:       'art-shadow',
  kraken:       'art-kraken',
  'davy-jones': 'art-davy-jones',
  'golden-age': 'art-golden-age',
  storm:        'art-storm',
  wanted:       'art-wanted',
  divine:       'art-divine',
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span className="font-karla font-600 uppercase" style={{ fontSize: '0.55rem', color: '#7a7470', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0ede8', lineHeight: 1 }}>
        {value}
      </span>
    </div>
  )
}

export default function FishCard({ name, filename, borderStyle: _borderStyle, artEffect, variantName, dropWeight, unowned, className = '', stats, cardW = DEFAULT_W, fill = false }: Props) {
  const W: number | string = fill ? '100%' : cardW
  const H: number | string = fill ? '100%' : Math.round(cardW * DEFAULT_H / DEFAULT_W)
  const src = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-arts/${filename}`

  const innerContent = unowned ? (
    <div style={{ width: '100%', height: '100%', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    </div>
  ) : (
    <>
      {/* Clipped to the SVG card shape (x=10,y=10 in 380×540 = 2.63%/1.85%) so dark bg doesn't bleed into transparent SVG margin */}
      <div className="absolute inset-0" style={{ background: '#0d1b2e', clipPath: 'inset(1.85% 2.63% round 4.74%)' }} />
      {/* Clip art and text to the inner area defined by the golden border frame */}
      {/* Insets: 44/380 = 11.58% horizontal, 44/540 = 8.15% vertical (cardfront.svg coords) */}
      <div className="absolute overflow-hidden" style={{ left: '11.58%', top: '8.15%', right: '11.58%', bottom: '8.15%', borderRadius: 5 }}>
        <Image
          src={src}
          alt={name}
          fill
          className={`object-contain object-top ${artImageClass[artEffect]}`}
          sizes={fill ? '50vw' : `${W}px`}
          unoptimized
        />
        {artEffect === 'holographic' && <div className="art-holographic" />}
        {artEffect === 'ghost'       && <div className="art-ghost-overlay" />}
        {artEffect === 'shadow'      && <div className="art-shadow-overlay" />}
        {artEffect === 'kraken'      && <div className="art-kraken-overlay" />}
        {artEffect === 'davy-jones'  && <div className="art-davy-jones-overlay" />}
        {artEffect === 'golden-age'  && <div className="art-golden-age-overlay" />}
        {artEffect === 'storm'       && <div className="art-storm-overlay" />}
        {artEffect === 'divine'      && <><div className="art-divine-overlay" /><div className="art-divine-overlay-2" /></>}

        {/* Wanted stamp */}
        {artEffect === 'wanted' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 2 }}>
            <span className="font-cinzel font-900 tracking-[0.22em] uppercase rotate-[-18deg]"
              style={{ fontSize: '0.85rem', color: 'rgba(160,10,10,0.98)', border: '3px solid rgba(155,15,15,0.96)', padding: '0.15em 0.5em', mixBlendMode: 'multiply', textShadow: '0 0 4px rgba(180,20,20,0.6)', fontWeight: 900 }}>
              Wanted
            </span>
          </div>
        )}

        {/* Bottom gradient panel: name + rarity + stats */}
        {(() => {
          const rarity = (variantName && dropWeight != null) ? rarityFromVariant(variantName, dropWeight) : null
          const rarityColor = rarity ? (RARITY_COLOR[rarity] ?? '#a0a09a') : null
          return (
            <div className="absolute left-0 right-0 pointer-events-none" style={{ zIndex: 3, bottom: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.90) 55%, transparent 100%)',
              padding: '40px 10px 10px',
            }}>
              <p className="font-cinzel font-700 text-center" style={{ fontSize: '0.75rem', color: '#f0ede8', marginBottom: 4, letterSpacing: '0.04em' }}>
                {name}
              </p>
              {rarity && (
                <p className="font-karla font-700 text-center uppercase tracking-[0.12em]" style={{ fontSize: '0.45rem', color: rarityColor!, marginBottom: stats ? 8 : 0 }}>
                  {rarity}
                </p>
              )}
              {stats && (
                <div style={{ display: 'flex' }}>
                  <StatCell label="STR" value={stats.strength} />
                  <StatCell label="AGI" value={stats.agility} />
                  <StatCell label="WIT" value={stats.wit} />
                  <StatCell label="LCK" value={stats.luck} />
                </div>
              )}
            </div>
          )
        })()}
      </div>
    </>
  )

  let frame: React.ReactNode

  if (unowned) {
    frame = (
      <div style={{ width: W, height: H, borderRadius: R, background: '#080808', border: '2px dashed rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
    )
  } else {
    frame = (
      <div className="relative" style={{ width: W, height: H }}>
        {innerContent}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cardfront.svg" alt="" className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 10 }} />
      </div>
    )
  }

  return (
    <div className={`fish-card flex flex-col items-center ${fill ? 'w-full h-full' : ''} ${className}`}>
      {frame}
    </div>
  )
}
