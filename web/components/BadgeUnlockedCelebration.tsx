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
    const t = setTimeout(onDismiss, 5500)
    return () => clearTimeout(t)
  }, [badgeId, onDismiss])

  const badge = badgeId ? BADGE_MAP[badgeId] : null

  return (
    <AnimatePresence>
      {badge && (
        <motion.div
          key={badge.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onDismiss}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.82)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem',
            cursor: 'pointer',
          }}
        >
          {/* Radiating gold rays behind badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 0.55, scale: 1, rotate: 360 }}
            transition={{ duration: 18, repeat: Infinity, ease: 'linear', opacity: { duration: 0.6 }, scale: { duration: 0.6, ease: 'easeOut' } }}
            style={{
              position: 'absolute',
              width: 520, height: 520, maxWidth: '95vw', maxHeight: '95vw',
              background: 'conic-gradient(from 0deg, rgba(240,192,64,0) 0deg, rgba(240,192,64,0.55) 20deg, rgba(240,192,64,0) 40deg, rgba(240,192,64,0) 80deg, rgba(240,192,64,0.45) 100deg, rgba(240,192,64,0) 120deg, rgba(240,192,64,0) 200deg, rgba(240,192,64,0.5) 220deg, rgba(240,192,64,0) 240deg, rgba(240,192,64,0) 320deg, rgba(240,192,64,0.4) 340deg, rgba(240,192,64,0) 360deg)',
              filter: 'blur(2px)',
              maskImage: 'radial-gradient(circle, rgba(0,0,0,0.4) 20%, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 75%)',
              WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,0.4) 20%, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 75%)',
              pointerEvents: 'none',
            }}
          />

          <motion.div
            initial={{ scale: 0.4, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 20, delay: 0.05 }}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%', maxWidth: 360,
              background: 'linear-gradient(180deg, rgba(28,20,8,0.96) 0%, rgba(14,10,4,0.98) 100%)',
              border: '1px solid rgba(240,192,64,0.45)',
              borderRadius: 20,
              padding: '1.6rem 1.4rem 1.4rem',
              boxShadow: '0 0 80px rgba(240,192,64,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
              textAlign: 'center',
              cursor: 'default',
            }}
          >
            <p
              className="font-karla font-700 uppercase"
              style={{ fontSize: '0.62rem', letterSpacing: '0.28em', color: '#f0c040', marginBottom: '0.9rem' }}
            >
              Badge Unlocked
            </p>

            <motion.div
              initial={{ scale: 0.2, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.18 }}
              style={{
                position: 'relative',
                width: 152, height: 152, margin: '0 auto 1.1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {/* Inner pulse glow */}
              <motion.div
                animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.85, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  position: 'absolute', inset: 0,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(240,192,64,0.45) 0%, rgba(240,192,64,0) 70%)',
                  filter: 'blur(8px)',
                }}
              />
              <img
                src={badge.imageUrl}
                alt={badge.name}
                style={{
                  position: 'relative',
                  width: '100%', height: '100%',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 0 22px rgba(240,192,64,0.6))',
                }}
              />
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.42 }}
              className="font-cinzel font-700"
              style={{ fontSize: '1.4rem', color: '#f0ede8', lineHeight: 1.15, marginBottom: '0.45rem' }}
            >
              {badge.name}
            </motion.p>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
              className="font-karla font-300"
              style={{ fontSize: '0.78rem', color: '#bdbab5', lineHeight: 1.45, marginBottom: '1.3rem' }}
            >
              {badge.description}
            </motion.p>

            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              onClick={onDismiss}
              className="font-karla font-700 uppercase"
              style={{
                background: 'linear-gradient(180deg, rgba(240,192,64,0.22) 0%, rgba(240,192,64,0.1) 100%)',
                border: '1px solid rgba(240,192,64,0.55)',
                color: '#f0c040',
                fontSize: '0.7rem', letterSpacing: '0.18em',
                padding: '0.7rem 1.6rem',
                borderRadius: 10,
                cursor: 'pointer',
              }}
            >
              Continue
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
