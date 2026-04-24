import type { BorderStyle, ArtEffect } from '@/lib/types'
import { rarityFromWeight, RARITY_COLOR, IS_LEGENDARY_RARITY, IS_MYTHIC_RARITY } from '@/lib/variants'

interface Props {
  name: string
  tier: 1 | 2 | 3
  borderStyle: BorderStyle
  artEffect: ArtEffect
  variantName: string
  dropWeight: number
}

const D = 140
const BORDER = 5

const tierEmoji: Record<number, string> = { 1: '~', 2: '~~', 3: '~~~' }

const tierBg: Record<number, string> = {
  1: 'from-blue-950 to-cyan-950',
  2: 'from-slate-900 to-blue-950',
  3: 'from-indigo-950 to-purple-950',
}

const artClass: Record<ArtEffect, string> = {
  normal: '', holographic: '', rainbow: 'art-rainbow', ghost: 'art-ghost', shadow: 'art-shadow',
  kraken: 'art-kraken', 'davy-jones': 'art-davy-jones', 'golden-age': 'art-golden-age',
  storm: 'art-storm', wanted: 'art-wanted',
}

const insetShadow: Partial<Record<BorderStyle, string>> = {
  standard: `inset 0 0 0 ${BORDER}px #1a1a2e`,
  silver:   `inset 0 0 0 ${BORDER}px #9ca3af`,
  gold:     `inset 0 0 0 ${BORDER}px #c8a84b`,
  void:     `inset 0 0 0 ${BORDER}px #0d0010, inset 0 0 18px rgba(80,0,120,0.45)`,
}

const variantLabelColor: Record<BorderStyle, string> = {
  standard:      '#a0a09a',
  silver:        '#9ca3af',
  gold:          '#f0c040',
  pearl:         '#e8d5b0',
  prismatic:     'transparent',
  void:          '#a855f7',
  kraken:        '#00cc99',
  'davy-jones':  '#1e6a90',
  'golden-age':  '#e8b830',
  storm:         '#4a88c8',
  wanted:        '#aa4010',
}

const mythicGradient: Partial<Record<BorderStyle, string>> = {
  kraken:       'linear-gradient(90deg,#003a4a,#00cc99,#00ff88)',
  'golden-age': 'linear-gradient(90deg,#8b6018,#f0c040,#ffd700,#f0c040,#8b6018)',
}

export default function DemoFishCard({ name, tier, borderStyle, artEffect, variantName, dropWeight }: Props) {
  const rarity = rarityFromWeight(dropWeight)
  const isPrismatic = borderStyle === 'prismatic'
  const isLegendary = IS_LEGENDARY_RARITY(rarity)
  const isMythic    = IS_MYTHIC_RARITY(rarity)
  const mythicGrad  = mythicGradient[borderStyle]
  const labelText = `${rarity} · ${variantName}`
  const art = (
    <div className={`w-full h-full bg-gradient-to-br ${tierBg[tier]} flex flex-col items-center justify-center gap-2 ${artClass[artEffect]}`}>
      <span className="font-cinzel font-700 text-[#f0ede8] text-2xl">{tierEmoji[tier]}</span>
      <span className="sg-eyebrow text-[0.55rem]">Tier {tier}</span>
    </div>
  )

  let frame: React.ReactNode

  if (borderStyle === 'prismatic') {
    frame = (
      <div className="relative" style={{ width: D, height: D, borderRadius: '50%' }}>
        <div className="absolute inset-0 border-prismatic" style={{ borderRadius: '50%' }} />
        <div className="absolute overflow-hidden" style={{ inset: BORDER, borderRadius: '50%' }}>
          {art}
          {artEffect === 'holographic' && <div className="art-holographic" />}
          {artEffect === 'ghost'  && <div className="art-ghost-overlay" />}
          {artEffect === 'shadow' && <div className="art-shadow-overlay" />}
        </div>
      </div>
    )
  } else if (artEffect === 'ghost') {
    frame = (
      <div className="relative" style={{ width: D, height: D, borderRadius: '50%' }}>
        <div className="absolute inset-0 border-ghost" style={{ borderRadius: '50%' }} />
        <div className="absolute overflow-hidden" style={{ inset: BORDER, borderRadius: '50%' }}>
          {art}
          <div className="art-ghost-overlay" />
        </div>
      </div>
    )
  } else if (borderStyle === 'kraken') {
    frame = (
      <div className="border-kraken-outer relative" style={{ width: D, height: D }}>
        <div className="absolute inset-0 border-kraken" style={{ borderRadius: '50%' }} />
        <div className="absolute overflow-hidden" style={{ inset: BORDER, borderRadius: '50%' }}>
          {art}
          <div className="art-kraken-overlay" />
        </div>
      </div>
    )
  } else if (borderStyle === 'davy-jones') {
    frame = (
      <div className="border-davy-jones-outer relative" style={{ width: D, height: D }}>
        <div className="absolute inset-0 border-davy-jones" style={{ borderRadius: '50%' }} />
        <div className="absolute overflow-hidden" style={{ inset: BORDER, borderRadius: '50%' }}>
          {art}
          <div className="art-davy-jones-overlay" />
        </div>
      </div>
    )
  } else if (borderStyle === 'golden-age') {
    frame = (
      <div className="border-golden-age-outer relative" style={{ width: D, height: D }}>
        <div className="absolute inset-0 border-golden-age" style={{ borderRadius: '50%' }} />
        <div className="absolute overflow-hidden" style={{ inset: BORDER, borderRadius: '50%' }}>
          {art}
          <div className="art-golden-age-overlay" />
        </div>
      </div>
    )
  } else if (borderStyle === 'storm') {
    frame = (
      <div className="border-storm-outer relative" style={{ width: D, height: D }}>
        <div className="absolute inset-0 border-storm" style={{ borderRadius: '50%' }} />
        <div className="absolute overflow-hidden" style={{ inset: BORDER, borderRadius: '50%' }}>
          {art}
          <div className="art-storm-overlay" />
        </div>
      </div>
    )
  } else if (borderStyle === 'wanted') {
    frame = (
      <div className="border-wanted-outer relative" style={{ width: D, height: D }}>
        <div className="absolute inset-0 border-wanted" style={{ borderRadius: '50%' }} />
        <div className="absolute overflow-hidden" style={{ inset: BORDER, borderRadius: '50%' }}>
          {art}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="font-cinzel font-700 text-[0.6rem] tracking-[0.18em] uppercase rotate-[-18deg]"
                  style={{ color: 'rgba(155,20,20,0.82)', border: '2px solid rgba(155,20,20,0.7)', padding: '0.1em 0.35em', mixBlendMode: 'multiply' }}>
              Wanted
            </span>
          </div>
        </div>
      </div>
    )
  } else if (borderStyle === 'void') {
    frame = (
      <div className="border-void-outer" style={{ width: D, height: D, borderRadius: '50%' }}>
        <div className="relative w-full h-full overflow-hidden" style={{ borderRadius: '50%' }}>
          {art}
          {artEffect === 'holographic' && <div className="art-holographic" />}
          {artEffect === 'shadow' && <div className="art-shadow-overlay" />}
          <div className="absolute inset-0 pointer-events-none"
               style={{ borderRadius: '50%', boxShadow: insetShadow.void }} />
        </div>
      </div>
    )
  } else {
    const shadow = insetShadow[borderStyle] ?? insetShadow.standard!
    frame = (
      <div className="relative overflow-hidden" style={{ width: D, height: D, borderRadius: '50%' }}>
        {art}
        {artEffect === 'holographic' && <div className="art-holographic" />}
        {artEffect === 'shadow' && <div className="art-shadow-overlay" />}
        <div className="absolute inset-0 pointer-events-none"
             style={{ borderRadius: '50%', boxShadow: shadow }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      {frame}
      <div className="text-center">
        <p className="font-karla font-400 text-sm text-[#f0ede8]">{name}</p>
        {isPrismatic || isLegendary ? (
          <p className="font-karla font-600 text-[0.6rem] uppercase tracking-[0.10em] whitespace-nowrap"
             style={{
               background: 'linear-gradient(90deg,#ff0080,#ff8c00,#ffe600,#00ff88,#00cfff,#8a5cf7)',
               WebkitBackgroundClip: 'text',
               WebkitTextFillColor: 'transparent',
             }}>
            {labelText}
          </p>
        ) : isMythic && mythicGrad ? (
          <p className="font-karla font-600 text-[0.6rem] uppercase tracking-[0.10em] whitespace-nowrap"
             style={{ background: mythicGrad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {labelText}
          </p>
        ) : (
          <p className="font-karla font-600 text-[0.6rem] uppercase tracking-[0.10em] whitespace-nowrap"
             style={{ color: isMythic ? variantLabelColor[borderStyle] : (RARITY_COLOR[rarity] ?? variantLabelColor[borderStyle]) }}>
            {labelText}
          </p>
        )}
      </div>
    </div>
  )
}
