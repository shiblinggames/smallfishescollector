import Link from 'next/link'
import React from 'react'

// Shared presentational pieces for the Fishing / Navigation profile tabs.
// Used by both the owner /profile and the public /u/[username] page so the
// two stay visually in sync.

/** Headline rank/level banner that opens each tab (Angler level, Navigator
 *  rank). `icon` is an inline SVG sized ~24px. */
export function RankHero({ color, kicker, title, sub, icon }: {
  color: string
  kicker: string
  title: string
  sub?: string
  icon: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '1.05rem 1.15rem', borderRadius: 20,
      border: `1px solid ${color}38`,
      background: `radial-gradient(ellipse at 0% 0%, ${color}22 0%, rgba(8,14,24,0.45) 70%)`,
      boxShadow: `inset 0 0 26px ${color}10`,
    }}>
      <div style={{
        width: 54, height: 54, borderRadius: 15, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}1c`, border: `1px solid ${color}40`,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.56rem', color: `${color}cc` }}>{kicker}</p>
        <p className="font-cinzel font-700" style={{ fontSize: '1.35rem', color: '#f5f2ec', lineHeight: 1.12, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</p>
        {sub && <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: '#9a948c', marginTop: 4 }}>{sub}</p>}
      </div>
    </div>
  )
}

/** A single stat in the row beneath a RankHero. */
export function StatTile({ label, value, color = '#f0ede8' }: {
  label: string
  value: React.ReactNode
  color?: string
}) {
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '0.8rem 0.5rem', borderRadius: 14, background: 'rgba(8,14,24,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</p>
      <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#9a948c', marginTop: 6 }}>{label}</p>
    </div>
  )
}

/** Full-width call-to-action linking out to the relevant game loop. */
export function ProfileCta({ href, label, color }: { href: string; label: string; color: string }) {
  return (
    <Link href={href} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0.85rem 1.1rem', borderRadius: 16,
      background: `${color}14`, border: `1px solid ${color}45`,
      textDecoration: 'none',
    }}>
      <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.72rem', color }}>{label}</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    </Link>
  )
}

export const FishIcon = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12c3-4 7-6 11-6 3 0 5 1.5 6.5 3.5C19 11.5 19 12.5 20.5 14.5 19 16.5 17 18 14 18c-4 0-8-2-11-6z" />
    <path d="M3 12c-0.6 1.4-0.6 2.6 0 4M3 12c-0.6-1.4-0.6-2.6 0-4" />
    <circle cx="15.5" cy="10.5" r="0.9" fill="#60a5fa" stroke="none" />
  </svg>
)

export const CompassIcon = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M15.5 8.5l-2 5-5 2 2-5z" />
  </svg>
)
