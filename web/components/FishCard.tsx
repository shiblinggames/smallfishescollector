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

const artBg: Partial<Record<ArtEffect, string>> = {
  ghost:        '#1e3040',
  shadow:       '#020204',
  kraken:       '#001a10',
  'davy-jones': '#010620',
  'golden-age': '#1e1400',
  storm:        'radial-gradient(ellipse at 50% 30%, #151220 0%, #050406 100%)',
  wanted:       '#120800',
  divine:       '#0e0c08',
}

const artImageClass: Record<ArtEffect, string> = {
  normal:       '',
  holographic:  '',
  rainbow:      'art-rainbow',
  ghost:        'art-ghost',
  shadow:       'art-shadow',
  pearl:        'art-pearl',
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
      <span className="font-karla font-600 uppercase" style={{ fontSize: '0.55rem', color: '#7a6a50', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#2a1f0e', lineHeight: 1 }}>
        {value}
      </span>
    </div>
  )
}

export default function FishCard({ name, filename, borderStyle: _borderStyle, artEffect, variantName, dropWeight, unowned, className = '', stats, cardW = DEFAULT_W, fill = false }: Props) {
  const W: number | string = fill ? '100%' : cardW
  const H: number | string = fill ? '100%' : Math.round(cardW * DEFAULT_H / DEFAULT_W)
  const src = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-arts/${filename}`

  const rarity = (variantName && dropWeight != null) ? rarityFromVariant(variantName, dropWeight) : null
  const rarityColor = rarity ? (RARITY_COLOR[rarity] ?? '#a0a09a') : null

  let frame: React.ReactNode

  if (unowned) {
    frame = (
      <div style={{ width: W, height: H, borderRadius: R, background: '#1a1410', border: '2px dashed rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
    )
  } else {
    frame = (
      <div className="relative overflow-hidden" style={{ width: W, height: H, borderRadius: R, background: artBg[artEffect] ?? '#c8a870' }}>
        {/* Cardfront base */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cardfront2.png" alt="" className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }} />

        {/* Fish art — on top of cardfront */}
        <Image
          src={src}
          alt={name}
          fill
          className={`object-contain object-top ${artImageClass[artEffect]}`}
          sizes={fill ? '50vw' : `${W}px`}
          unoptimized
          style={{ zIndex: 2 }}
        />
        {artEffect === 'pearl'       && <div className="art-pearl-overlay" style={{ zIndex: 3 }} />}
        {artEffect === 'holographic' && <div className="art-holographic" style={{ zIndex: 3 }} />}

        {/* Wanted stamp */}
        {artEffect === 'wanted' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 3 }}>
            <span className="font-cinzel font-900 uppercase rotate-[-18deg]"
              style={{ fontSize: '1rem', letterSpacing: '0.2em', color: 'rgba(190,15,15,1)', border: '2.5px solid rgba(175,15,15,0.95)', padding: '0.1em 0.55em', fontWeight: 900, background: 'rgba(0,0,0,0.18)', textShadow: '0 0 8px rgba(210,20,20,0.65)', boxShadow: '0 0 0 1px rgba(175,15,15,0.35), 0 0 12px rgba(190,15,15,0.3)' }}>
              WANTED
            </span>
          </div>
        )}

        {/* Bottom text: name + rarity + stats */}
        <div className="absolute left-0 right-0 pointer-events-none" style={{ zIndex: 6, bottom: 0, padding: '8px 10px 10px' }}>
          <p className="font-cinzel font-700 text-center" style={{ fontSize: '0.75rem', color: '#2a1f0e', marginBottom: 4, letterSpacing: '0.04em' }}>
            {name}
          </p>
          {rarity && (
            <p className="font-karla font-700 text-center uppercase tracking-[0.12em]" style={{ fontSize: '0.45rem', color: rarityColor!, marginBottom: stats ? 8 : 0 }}>
              {rarity}
            </p>
          )}
          {stats && (
            <div style={{ display: 'flex' }}>
              <StatCell label="PWR" value={stats.power} />
              <StatCell label="DGE" value={stats.dodge} />
              <StatCell label="FTN" value={stats.fortune} />
            </div>
          )}
        </div>

        {/* Art effect overlays — above fish art */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 4 }}>
          {artEffect === 'ghost'       && <div className="art-ghost-overlay" />}
          {artEffect === 'shadow'      && <div className="art-shadow-overlay" />}
          {artEffect === 'kraken'      && <div className="art-kraken-overlay" />}
          {artEffect === 'davy-jones'  && <div className="art-davy-jones-overlay" />}
          {artEffect === 'golden-age'  && <div className="art-golden-age-overlay" />}
          {artEffect === 'storm'       && <><div className="art-storm-bg" /><div className="art-storm-overlay" /></>}
          {artEffect === 'wanted'      && <div className="art-wanted-overlay" />}
          {artEffect === 'divine'      && <><div className="art-divine-overlay" /><div className="art-divine-overlay-2" /></>}
        </div>
      </div>
    )
  }

  return (
    <div className={`fish-card flex flex-col items-center ${fill ? 'w-full h-full' : ''} ${className}`}>
      {frame}
    </div>
  )
}
