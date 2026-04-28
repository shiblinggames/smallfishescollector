import Image from 'next/image'
import type { BorderStyle, ArtEffect, CardStats } from '@/lib/types'

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
}

const W      = 140   // card width px
const H      = 196   // card height px
const BORDER = 4     // ring thickness px
const R      = 10    // corner radius px

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

const insetShadow: Partial<Record<BorderStyle, string>> = {
  standard: `inset 0 0 0 ${BORDER}px #1a1a2e`,
  silver:   `inset 0 0 0 ${BORDER}px #9ca3af`,
  gold:     `inset 0 0 0 ${BORDER}px #c8a84b`,
  void:     `inset 0 0 0 ${BORDER}px #0d0010, inset 0 0 18px rgba(80,0,120,0.45)`,
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <span className="font-karla font-600 uppercase" style={{ fontSize: '0.44rem', color: '#7a7470', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#f0ede8', lineHeight: 1 }}>
        {value}
      </span>
    </div>
  )
}

export default function FishCard({ name, filename, borderStyle, artEffect, variantName, dropWeight, unowned, className = '', stats }: Props) {
  const src = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-arts/${filename}`

  // Art + overlays + stats panel — all positioned inside the clipped inner frame
  const innerContent = unowned ? (
    <div style={{ width: '100%', height: '100%', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    </div>
  ) : (
    <>
      <Image
        src={src}
        alt={name}
        fill
        className={`object-contain ${artImageClass[artEffect]}`}
        sizes="140px"
        unoptimized
      />
      {artEffect === 'holographic' && <div className="art-holographic" />}
      {artEffect === 'ghost'       && <div className="art-ghost-overlay" />}
      {artEffect === 'shadow'      && <div className="art-shadow-overlay" />}
      {borderStyle === 'kraken'     && <div className="art-kraken-overlay" />}
      {borderStyle === 'davy-jones' && <div className="art-davy-jones-overlay" />}
      {borderStyle === 'golden-age' && <div className="art-golden-age-overlay" />}
      {borderStyle === 'storm'      && <div className="art-storm-overlay" />}
      {borderStyle === 'god'        && <><div className="art-divine-overlay" /><div className="art-divine-overlay-2" /></>}

      {/* Wanted stamp */}
      {borderStyle === 'wanted' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 2 }}>
          <span className="font-cinzel font-900 tracking-[0.22em] uppercase rotate-[-18deg]"
            style={{ fontSize: '0.85rem', color: 'rgba(160,10,10,0.98)', border: '3px solid rgba(155,15,15,0.96)', padding: '0.15em 0.5em', mixBlendMode: 'multiply', textShadow: '0 0 4px rgba(180,20,20,0.6)', fontWeight: 900 }}>
            Wanted
          </span>
        </div>
      )}

      {/* Bottom gradient panel: name + stats */}
      <div className="absolute left-0 right-0 bottom-0 pointer-events-none" style={{ zIndex: 3,
        background: 'linear-gradient(to top, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.82) 55%, transparent 100%)',
        padding: '22px 8px 9px',
      }}>
        <p className="font-cinzel font-700 text-center" style={{ fontSize: '0.6rem', color: '#f0ede8', marginBottom: stats ? 6 : 0, letterSpacing: '0.04em' }}>
          {name}
        </p>
        {stats && (
          <div style={{ display: 'flex' }}>
            <StatCell label="STR" value={stats.strength} />
            <StatCell label="AGI" value={stats.agility} />
            <StatCell label="WIT" value={stats.wit} />
            <StatCell label="LCK" value={stats.luck} />
          </div>
        )}
      </div>
    </>
  )

  // Clip wrapper — all border variants share this inner clipping div
  function clipped(children: React.ReactNode) {
    return (
      <div className="absolute overflow-hidden" style={{ inset: BORDER, borderRadius: R - BORDER }}>
        {children}
      </div>
    )
  }

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
  } else if (borderStyle === 'void') {
    frame = (
      <div className="border-void-outer" style={{ width: W, height: H, borderRadius: R }}>
        <div className="relative w-full h-full overflow-hidden" style={{ borderRadius: R }}>
          {innerContent}
          <div className="absolute inset-0 pointer-events-none" style={{ borderRadius: R, boxShadow: insetShadow.void }} />
        </div>
      </div>
    )
  } else if (['standard', 'silver', 'gold'].includes(borderStyle)) {
    const shadow = insetShadow[borderStyle] ?? insetShadow.standard!
    frame = (
      <div className="relative overflow-hidden" style={{ width: W, height: H, borderRadius: R }}>
        {innerContent}
        <div className="absolute inset-0 pointer-events-none" style={{ borderRadius: R, boxShadow: shadow }} />
      </div>
    )
  } else {
    // Spinning-ring border styles: prismatic, pearl, ghost, kraken, davy-jones, golden-age, storm, wanted, god
    const borderClass: Partial<Record<BorderStyle, string>> = {
      prismatic:     'border-prismatic',
      pearl:         'border-pearl',
      kraken:        'border-kraken',
      'davy-jones':  'border-davy-jones',
      'golden-age':  'border-golden-age',
      storm:         'border-storm',
      wanted:        'border-wanted',
      god:           'border-god',
    }
    const outerClass: Partial<Record<BorderStyle, string>> = {
      kraken:       'border-kraken-outer',
      'davy-jones': 'border-davy-jones-outer',
      'golden-age': 'border-golden-age-outer',
      storm:        'border-storm-outer',
      wanted:       'border-wanted-outer',
      god:          'border-god-outer',
    }
    const ghostBorder = artEffect === 'ghost' ? 'border-ghost' : null
    const ringClass = ghostBorder ?? borderClass[borderStyle] ?? 'border-prismatic'
    const wrapClass = outerClass[borderStyle] ?? ''

    frame = (
      <div className={`${wrapClass} relative`} style={{ width: W, height: H, borderRadius: R }}>
        <div className={`absolute inset-0 ${ringClass}`} style={{ borderRadius: R }} />
        {clipped(innerContent)}
      </div>
    )
  }

  return (
    <div className={`fish-card flex flex-col items-center ${className}`}>
      {frame}
    </div>
  )
}
