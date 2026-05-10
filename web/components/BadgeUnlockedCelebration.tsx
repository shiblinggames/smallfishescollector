'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BADGE_MAP } from '@/lib/badges'

export default function BadgeUnlockedCelebration({
  badgeId,
  onDismiss,
}: {
  badgeId: string | null
  onDismiss: () => void
}) {
  useEffect(() => {
    if (!badgeId) return
    const t = setTimeout(onDismiss, 4500)
    return () => clearTimeout(t)
  }, [badgeId, onDismiss])

  const badge = badgeId ? BADGE_MAP[badgeId] : null

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 56px)',
        left: 0, right: 0,
        display: 'flex', justifyContent: 'center',
        zIndex: 70,
        pointerEvents: 'none',
        padding: '0 1rem',
      }}
    >
      <AnimatePresence>
        {badge && (
          <motion.div
            key={badge.id}
            initial={{ opacity: 0, y: -24, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            onClick={onDismiss}
            style={{
              pointerEvents: 'auto',
              position: 'relative',
              width: '100%', maxWidth: 360,
              background: 'linear-gradient(180deg, rgba(28,20,8,0.97) 0%, rgba(14,10,4,0.98) 100%)',
              border: '1px solid rgba(240,192,64,0.5)',
              borderRadius: 16,
              padding: '0.85rem 1rem',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 36px rgba(240,192,64,0.22)',
              display: 'flex', alignItems: 'center', gap: 12,
              cursor: 'pointer',
              overflow: 'hidden',
            }}
          >
            {/* Subtle rotating gold rays behind the badge image */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
              style={{
                position: 'absolute',
                left: -30, top: '50%',
                width: 140, height: 140,
                marginTop: -70,
                background: 'conic-gradient(from 0deg, rgba(240,192,64,0) 0deg, rgba(240,192,64,0.4) 30deg, rgba(240,192,64,0) 60deg, rgba(240,192,64,0) 180deg, rgba(240,192,64,0.32) 210deg, rgba(240,192,64,0) 240deg, rgba(240,192,64,0) 360deg)',
                filter: 'blur(2px)',
                maskImage: 'radial-gradient(circle, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 65%)',
                WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 65%)',
                pointerEvents: 'none',
              }}
            />

            <motion.div
              initial={{ scale: 0.4, rotate: -120 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.12 }}
              style={{
                position: 'relative',
                width: 56, height: 56, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <motion.div
                animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.75, 0.4] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  position: 'absolute', inset: -6,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(240,192,64,0.5) 0%, rgba(240,192,64,0) 70%)',
                  filter: 'blur(4px)',
                }}
              />
              <img
                src={badge.imageUrl}
                alt={badge.name}
                style={{
                  position: 'relative',
                  width: '100%', height: '100%', objectFit: 'contain',
                  filter: 'drop-shadow(0 0 12px rgba(240,192,64,0.6))',
                }}
              />
            </motion.div>

            <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.55rem', letterSpacing: '0.22em', color: '#f0c040', marginBottom: 2 }}>
                Badge Unlocked
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#f0ede8', lineHeight: 1.2, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {badge.name}
              </p>
              <p className="font-karla font-300" style={{ fontSize: '0.66rem', color: '#a0a09a', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {badge.description}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
