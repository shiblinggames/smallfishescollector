'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  href: string
  eyebrow: string
  title: string
  description: string
  info: string[]
  icon: React.ReactNode
  accentColor?: string
  badge?: string
  external?: boolean
}

export default function ShopCard({ href, eyebrow, title, description, info, icon, accentColor = '#f0c040', badge, external }: Props) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)

  function handleClick() {
    if (external) {
      window.open(href, '_blank', 'noopener,noreferrer')
    } else {
      router.push(href)
    }
  }

  // Body-portaled bottom sheet — escapes stacking contexts (e.g. the
  // MobileTabBar) and clears Nav + safe-area at top/bottom, matching
  // the LeaderboardModal / RaidsSection NodeDetailSheet pattern.
  const sheet = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => setShowModal(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)',
      }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          maxHeight: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          background: 'linear-gradient(180deg, #0b1420 0%, #060c14 100%)',
          border: `1px solid ${accentColor}33`,
          borderBottom: 'none',
          borderRadius: '20px 20px 0 0',
          padding: '0.85rem 1.15rem calc(1.4rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Grab handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.7rem' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
        </div>

        {/* Header + close button */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.7rem', marginBottom: '0.95rem' }}>
          <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', minWidth: 0 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 11, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${accentColor}1c`, border: `1px solid ${accentColor}3a`,
              color: accentColor,
            }}>
              {icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <p className="sg-eyebrow" style={{ color: `${accentColor}aa`, marginBottom: 2 }}>{eyebrow}</p>
              <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8', lineHeight: 1.15 }}>{title}</p>
            </div>
          </div>
          <button
            onClick={() => setShowModal(false)}
            aria-label="Close"
            style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#9a9690', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Description */}
        <p className="font-karla" style={{ fontSize: '0.85rem', lineHeight: 1.55, color: 'rgba(240,237,232,0.7)', marginBottom: '1rem' }}>
          {description}
        </p>

        {/* Info list */}
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
          {info.map((item, i) => (
            <li key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${accentColor}1f`,
              borderRadius: 10,
              padding: '0.6rem 0.75rem',
            }}>
              <span style={{ color: accentColor, fontSize: '0.65rem', lineHeight: '1.5rem', flexShrink: 0 }}>✦</span>
              <span className="font-karla" style={{ fontSize: '0.78rem', lineHeight: 1.5, color: 'rgba(240,237,232,0.78)' }}>{item}</span>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  )

  return (
    <>
      <div
        role="link"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        style={{
          background: 'rgba(8,8,6,0.82)',
          border: `1px solid ${accentColor}30`,
          borderRadius: '14px',
          padding: '0.875rem',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* Top row: icon · eyebrow · badge · info */}
        <div className="flex items-center gap-2 mb-2.5">
          <div style={{
            width: 34, height: 34,
            background: `${accentColor}12`,
            border: `1px solid ${accentColor}30`,
            borderRadius: '9px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            color: accentColor,
          }}>
            {icon}
          </div>
          <p className="sg-eyebrow flex-1 truncate" style={{ color: accentColor + 'aa' }}>{eyebrow}</p>
          {badge && (
            <span className="font-karla font-700 uppercase tracking-[0.10em] text-[#f0c040]" style={{ fontSize: '0.48rem', flexShrink: 0 }}>{badge}</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setShowModal(true) }}
            style={{ color: '#4a4845', flexShrink: 0, lineHeight: 1 }}
            aria-label="More info"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
          </button>
        </div>

        {/* Title */}
        <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', lineHeight: 1.2, marginBottom: '0.3rem', color: accentColor }}>
          {title}
        </p>

        {/* Description */}
        <p className="font-karla text-[#a0a09a]" style={{ fontSize: '0.72rem', lineHeight: 1.4 }}>
          {description}
        </p>
      </div>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>{showModal && sheet}</AnimatePresence>,
        document.body,
      )}
    </>
  )
}
