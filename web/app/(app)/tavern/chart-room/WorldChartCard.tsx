'use client'

// The World Chart hero card in the Chart Room — the collectible the four puzzles
// feed. Shows how much of the sea is charted, gems banked, and a pulsing badge
// when discoveries are waiting to be claimed.

import Link from 'next/link'
import { landmarkViews, gemsClaimed, LANDMARKS, WORLD_CHART_FULL_POINTS, WORLD_CHART_TOTAL_GEMS } from '@/lib/worldChart'
import { GEM_GLYPH } from '@/lib/bossRaids'

const GOLD = '#f0c040'
const GEM = '#c084fc'

export default function WorldChartCard({ points, claimed }: { points: number; claimed: number[] }) {
  const views = landmarkViews(points, claimed)
  const found = views.filter(v => v.revealed).length
  const pending = views.filter(v => v.claimable)
  const pendingGems = pending.reduce((s, v) => s + v.gems, 0)
  const gems = gemsClaimed(claimed)

  return (
    <Link href="/charting/world-chart" className="tap" style={{ display: 'block', textDecoration: 'none' }}>
      <div style={{
        position: 'relative', display: 'flex', gap: 12, alignItems: 'center', padding: '0.7rem 0.8rem',
        borderRadius: 16, overflow: 'hidden',
        background: 'linear-gradient(180deg, rgba(30,40,54,0.6), rgba(14,20,28,0.72))',
        border: `1px solid ${pending.length > 0 ? GEM + '77' : GOLD + '44'}`,
        boxShadow: pending.length > 0 ? `0 0 22px ${GEM}22` : `0 0 18px ${GOLD}10`,
      }}>
        {/* map thumbnail */}
        <div style={{ position: 'relative', width: 74, height: 92, borderRadius: 10, overflow: 'hidden', flexShrink: 0, border: `1px solid ${GOLD}33` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/chartingmap.webp" alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 40%, transparent 30%, rgba(6,10,16,0.5) 100%)' }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-cinzel font-800" style={{ fontSize: '1rem', color: '#f4ecd8' }}>The World Chart</p>
          <p className="font-karla" style={{ fontSize: '0.64rem', color: 'rgba(200,214,226,0.62)', marginTop: 2, lineHeight: 1.35 }}>
            {found}/{LANDMARKS.length} landmarks · <span style={{ color: GEM }}>{GEM_GLYPH} {gems.toLocaleString()}/{WORLD_CHART_TOTAL_GEMS.toLocaleString()}</span>
          </p>
          <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', marginTop: 6, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, (points / WORLD_CHART_FULL_POINTS) * 100)}%`, height: '100%', background: `linear-gradient(90deg, ${GOLD}, #ffe9a8)` }} />
          </div>
          {pending.length > 0 ? (
            <span className="font-karla font-800 uppercase tracking-[0.06em] animate-pulse" style={{ display: 'inline-block', marginTop: 7, fontSize: '0.56rem', color: '#1a1030', background: GEM, borderRadius: 999, padding: '0.2rem 0.55rem', boxShadow: `0 0 12px ${GEM}88` }}>
              New discovery · claim {GEM_GLYPH} {pendingGems}
            </span>
          ) : (
            <span className="font-karla font-700" style={{ display: 'inline-block', marginTop: 7, fontSize: '0.58rem', color: GOLD }}>Open the chart ›</span>
          )}
        </div>
      </div>
    </Link>
  )
}
