import Image from 'next/image'
import type { BorderStyle, ArtEffect } from '@/lib/types'
import { rarityFromVariant, RARITY_COLOR, IS_LEGENDARY_RARITY, IS_MYTHIC_RARITY } from '@/lib/variants'

interface Props {
  name: string
  filename: string
  borderStyle: BorderStyle
  artEffect: ArtEffect
  variantName?: string
  dropWeight?: number
  unowned?: boolean
  className?: string
}

const D = 140     // circle diameter px
const BORDER = 5  // ring thickness px

// Label color keyed by border_style
const variantLabelColor: Record<BorderStyle, string> = {
  standard:      '#8a8880',
  silver:        '#9ca3af',
  gold:          '#f0c040',
  pearl:         '#e8d5b0',
  prismatic:     'transparent', // uses gradient via inline style
  void:          '#a855f7',
  kraken:        '#00cc99',
  'davy-jones':  '#2a5fff',
  'golden-age':  '#e8b830',
  storm:         '#4a88c8',
  wanted:        '#aa4010',
}

const mythicGradient: Partial<Record<BorderStyle, string>> = {
  kraken:       'linear-gradient(90deg,#003a4a,#00cc99,#00ff88)',
  'golden-age': 'linear-gradient(90deg,#8b6018,#f0c040,#ffd700,#f0c040,#8b6018)',
}

// Inset box-shadow per border style (standard / silver / gold / void)
const insetShadow: Partial<Record<BorderStyle, string>> = {
  standard: `inset 0 0 0 ${BORDER}px #1a1a2e`,
  silver:   `inset 0 0 0 ${BORDER}px #9ca3af`,
  gold:     `inset 0 0 0 ${BORDER}px #c8a84b`,
  void:     `inset 0 0 0 ${BORDER}px #0d0010, inset 0 0 18px rgba(80,0,120,0.45)`,
}

// CSS class applied to the <img> for art effects
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
}

export default function FishCard({ name, filename, borderStyle, artEffect, variantName, dropWeight, unowned, className = '' }: Props) {
  const src = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-arts/${filename}`

  const imageContent = unowned ? (
    <div className="w-full h-full bg-[#0a0a0a] flex items-center justify-center">
      <span className="font-karla font-300 text-xs text-[#3a3a3a] tracking-widest uppercase">???</span>
    </div>
  ) : (
    <>
      <Image
        src={src}
        alt={name}
        fill
        className={`object-cover ${artImageClass[artEffect]}`}
        sizes="140px"
        unoptimized
      />
      {artEffect === 'holographic' && (
        <div className="art-holographic" />
      )}
      {artEffect === 'ghost' && (
        <div className="art-ghost-overlay" />
      )}
      {artEffect === 'shadow' && (
        <div className="art-shadow-overlay" />
      )}
    </>
  )

  let frame: React.ReactNode

  if (borderStyle === 'prismatic' && !unowned) {
    // Spinning conic ring behind the image
    frame = (
      <div className="relative" style={{ width: D, height: D, borderRadius: '50%' }}>
        <div className="absolute inset-0 border-prismatic" style={{ borderRadius: '50%' }} />
        <div className="absolute overflow-hidden" style={{ inset: BORDER, borderRadius: '50%' }}>
          {imageContent}
        </div>
      </div>
    )
  } else if (borderStyle === 'pearl' && !unowned) {
    frame = (
      <div className="relative" style={{ width: D, height: D, borderRadius: '50%' }}>
        <div className="absolute inset-0 border-pearl" style={{ borderRadius: '50%' }} />
        <div className="absolute overflow-hidden" style={{ inset: BORDER, borderRadius: '50%' }}>
          {imageContent}
        </div>
      </div>
    )
  } else if (artEffect === 'ghost' && !unowned) {
    // Spinning pearlescent white ring
    frame = (
      <div className="relative" style={{ width: D, height: D, borderRadius: '50%' }}>
        <div className="absolute inset-0 border-ghost" style={{ borderRadius: '50%' }} />
        <div className="absolute overflow-hidden" style={{ inset: BORDER, borderRadius: '50%' }}>
          {imageContent}
        </div>
      </div>
    )
  } else if (borderStyle === 'kraken' && !unowned) {
    frame = (
      <div className="border-kraken-outer relative" style={{ width: D, height: D }}>
        <div className="absolute inset-0 border-kraken" style={{ borderRadius: '50%' }} />
        <div className="absolute overflow-hidden" style={{ inset: BORDER, borderRadius: '50%' }}>
          {imageContent}
          <div className="art-kraken-overlay" />
        </div>
      </div>
    )
  } else if (borderStyle === 'davy-jones' && !unowned) {
    frame = (
      <div className="border-davy-jones-outer relative" style={{ width: D, height: D }}>
        <div className="absolute inset-0 border-davy-jones" style={{ borderRadius: '50%' }} />
        <div className="absolute overflow-hidden" style={{ inset: BORDER, borderRadius: '50%' }}>
          {imageContent}
          <div className="art-davy-jones-overlay" />
        </div>
      </div>
    )
  } else if (borderStyle === 'golden-age' && !unowned) {
    frame = (
      <div className="border-golden-age-outer relative" style={{ width: D, height: D }}>
        <div className="absolute inset-0 border-golden-age" style={{ borderRadius: '50%' }} />
        <div className="absolute overflow-hidden" style={{ inset: BORDER, borderRadius: '50%' }}>
          {imageContent}
          <div className="art-golden-age-overlay" />
        </div>
      </div>
    )
  } else if (borderStyle === 'storm' && !unowned) {
    frame = (
      <div className="border-storm-outer relative" style={{ width: D, height: D }}>
        <div className="absolute inset-0 border-storm" style={{ borderRadius: '50%' }} />
        <div className="absolute overflow-hidden" style={{ inset: BORDER, borderRadius: '50%' }}>
          {imageContent}
          <div className="art-storm-overlay" />
        </div>
      </div>
    )
  } else if (borderStyle === 'wanted' && !unowned) {
    frame = (
      <div className="border-wanted-outer relative" style={{ width: D, height: D }}>
        <div className="absolute inset-0 border-wanted" style={{ borderRadius: '50%' }} />
        <div className="absolute overflow-hidden" style={{ inset: BORDER, borderRadius: '50%' }}>
          {imageContent}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="font-cinzel font-900 text-[0.85rem] tracking-[0.22em] uppercase rotate-[-18deg]"
                  style={{ color: 'rgba(160,10,10,0.98)', border: '3px solid rgba(155,15,15,0.96)', padding: '0.15em 0.5em', mixBlendMode: 'multiply', textShadow: '0 0 4px rgba(180,20,20,0.6)', fontWeight: 900 }}>
              Wanted
            </span>
          </div>
        </div>
      </div>
    )
  } else if (borderStyle === 'void' && !unowned) {
    // Outer glow wrapper so drop-shadow bleeds outside the clipped circle
    frame = (
      <div className="border-void-outer" style={{ width: D, height: D, borderRadius: '50%' }}>
        <div className="relative w-full h-full overflow-hidden" style={{ borderRadius: '50%' }}>
          {imageContent}
          <div className="absolute inset-0 pointer-events-none"
               style={{ borderRadius: '50%', boxShadow: insetShadow.void }} />
        </div>
      </div>
    )
  } else {
    // standard / silver / gold — inset box-shadow overlay
    const shadow = insetShadow[borderStyle] ?? insetShadow.standard!
    frame = (
      <div className="relative overflow-hidden" style={{ width: D, height: D, borderRadius: '50%' }}>
        {imageContent}
        <div className="absolute inset-0 pointer-events-none"
             style={{ borderRadius: '50%', boxShadow: shadow }} />
      </div>
    )
  }

  const isPrismaticLabel    = borderStyle === 'prismatic'    && !unowned
  const isHolographicLabel  = artEffect  === 'holographic'  && !unowned
  const labelColor = variantLabelColor[borderStyle]
  const rarity = dropWeight != null ? rarityFromVariant(variantName ?? '', dropWeight) : null
  const rarityColor = rarity ? RARITY_COLOR[rarity] : '#8a8880'
  const isLegendary = rarity ? IS_LEGENDARY_RARITY(rarity) : false
  const isMythic    = rarity ? IS_MYTHIC_RARITY(rarity)    : false
  const mythicGrad  = mythicGradient[borderStyle]

  const RAINBOW      = 'linear-gradient(90deg,#ff0080,#ff8c00,#ffe600,#00ff88,#00cfff,#8a5cf7)'
  const HOLO_SHIMMER = 'linear-gradient(90deg,#c8d0e0,#e8e0f0,#c8ddf8,#dcd0f0,#f0e4d0,#c8d0e0)'

  function variantNameStyle(): React.CSSProperties {
    if (isPrismaticLabel)
      return { background: RAINBOW, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }
    if (isHolographicLabel)
      return { background: HOLO_SHIMMER, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }
    if (borderStyle === 'silver') return { color: '#9ca3af' }
    if (borderStyle === 'gold')   return { color: '#f0c040' }
    if (artEffect === 'ghost')   return { color: '#a8c8f0' }
    if (artEffect === 'shadow')  return { color: '#9b7fe8' }
    if (borderStyle === 'pearl') return { color: '#e8d5b0' }
    if (isMythic && mythicGrad)  return { background: mythicGrad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }
    if (isMythic)                return { color: labelColor }
    return { color: rarity ? rarityColor : labelColor }
  }

  return (
    <div className={`fish-card flex flex-col items-center gap-1.5 ${className}`}>
      {frame}
      <div className="text-center">
        <p className="font-karla font-400 text-sm text-[#f0ede8]">{unowned ? '???' : name}</p>
        {variantName && !unowned && (
          <>
            {rarity && (
              <p className="font-karla font-600 text-[0.72rem] uppercase tracking-[0.10em]"
                 style={{ color: rarityColor }}>
                {rarity}
              </p>
            )}
            <p className="font-karla font-600 text-[0.72rem] uppercase tracking-[0.10em] whitespace-nowrap"
               style={variantNameStyle()}>
              {variantName}
            </p>
            {dropWeight != null && (
              <p className="font-karla font-300 text-[0.62rem] text-[#8a8880] mt-0.5">
                {dropWeight < 1 ? `${dropWeight.toFixed(2)}% chance` : dropWeight < 10 ? `${dropWeight.toFixed(1)}% chance` : `${Math.round(dropWeight)}% chance`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
