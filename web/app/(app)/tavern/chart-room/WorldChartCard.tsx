'use client'

// The World Chart hero in the Chart Room — the collectible the four puzzles feed.
// A prominent banner: a heavily FOGGED map teaser (blurred so it never spoils the
// real reveal), the title, how much sea is charted, gems banked, and a pulsing
// badge when discoveries are waiting.

import Link from 'next/link'
import { landmarkViews, gemsBanked, LANDMARKS, WORLD_CHART_FULL_POINTS, WORLD_CHART_GRAND_TOTAL } from '@/lib/worldChart'
import { GEM_GLYPH } from '@/lib/uiTokens'

const GOLD = '#f0c040'
const GEM = '#c084fc'

export default function WorldChartCard({ points, claimed }: { points: number; claimed: number[] }) {
  const views = landmarkViews(points, claimed)
  const found = views.filter(v => v.revealed).length
  const pending = views.filter(v => v.claimable)
  const pendingGems = pending.reduce((s, v) => s + v.gems, 0)
  const gems = gemsBanked(claimed)
  const accent = pending.length > 0 ? GEM : GOLD

  return (
    <Link href="/charting/world-chart" className="tap" style={{ display: 'block', textDecoration: 'none' }}>
      <div style={{
        position: 'relative', borderRadius: 18, overflow: 'hidden', minHeight: 168,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '1rem 1.15rem 1.05rem',
        border: `1px solid ${accent}77`,
        boxShadow: pending.length > 0 ? `0 0 26px ${GEM}2a` : `0 0 18px ${GOLD}14`,
      }}>
        {/* Fogged map teaser — blurred + darkened so it reads as "a map under mist"
            without revealing any landmark. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/chartingmap.webp" alt="" aria-hidden loading="lazy"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(10px) brightness(0.5) saturate(0.85)', transform: 'scale(1.12)' }} />
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 20%, ${accent}1e, transparent 60%), linear-gradient(180deg, rgba(10,16,24,0.5) 0%, rgba(8,12,18,0.9) 100%)` }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <p className="font-karla font-800 uppercase" style={{ fontSize: '0.54rem', letterSpacing: '0.24em', color: accent, textShadow: `0 0 12px ${accent}66` }}>The Chart Room</p>
          <h2 className="font-cinzel font-800" style={{ fontSize: '1.7rem', color: '#f6eeda', lineHeight: 1.05, marginTop: 2, textShadow: '0 2px 10px rgba(0,0,0,0.7)' }}>The World Chart</h2>
          <p className="font-karla font-600" style={{ fontSize: '0.74rem', color: 'rgba(224,232,240,0.82)', marginTop: 5 }}>
            {found}/{LANDMARKS.length} landmarks charted · <span style={{ color: GEM, fontWeight: 800 }}>{GEM_GLYPH} {gems.toLocaleString()}/{WORLD_CHART_GRAND_TOTAL.toLocaleString()}</span>
          </p>
          <div style={{ height: 8, borderRadius: 999, background: 'rgba(0,0,0,0.45)', marginTop: 9, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ width: `${Math.min(100, (points / WORLD_CHART_FULL_POINTS) * 100)}%`, height: '100%', background: `linear-gradient(90deg, ${GOLD}, #ffe9a8)`, boxShadow: `0 0 10px ${GOLD}aa` }} />
          </div>
          {pending.length > 0 ? (
            <span className="font-karla font-800 uppercase tracking-[0.06em] animate-pulse" style={{ display: 'inline-block', marginTop: 10, fontSize: '0.64rem', color: '#1a1030', background: GEM, borderRadius: 999, padding: '0.28rem 0.7rem', boxShadow: `0 0 14px ${GEM}99` }}>
              New discovery · claim {GEM_GLYPH} {pendingGems}
            </span>
          ) : (
            <span className="font-cinzel font-700" style={{ display: 'inline-block', marginTop: 10, fontSize: '0.72rem', color: GOLD }}>Open the chart ›</span>
          )}
        </div>
      </div>
    </Link>
  )
}
