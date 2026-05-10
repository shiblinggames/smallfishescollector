'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function PendingSaleSettledToast({
  amount,
  onDismiss,
}: {
  amount: number | null
  onDismiss: () => void
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!amount) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 3500)
    const cleanup = setTimeout(onDismiss, 4000)
    return () => { clearTimeout(t); clearTimeout(cleanup) }
  }, [amount, onDismiss])

  if (amount === null && !visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 56px)',
        left: 0, right: 0,
        display: 'flex', justifyContent: 'center',
        zIndex: 60,
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence>
        {visible && amount !== null && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onClick={() => setVisible(false)}
            style={{
              pointerEvents: 'auto',
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '0.6rem 0.95rem',
              background: 'linear-gradient(180deg, rgba(28,20,8,0.95) 0%, rgba(14,10,4,0.97) 100%)',
              border: '1px solid rgba(240,192,64,0.45)',
              borderRadius: 999,
              boxShadow: '0 4px 24px rgba(0,0,0,0.45), 0 0 28px rgba(240,192,64,0.18)',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>⏳</span>
            <span className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.15em', color: '#f0c040' }}>
              Sale settled
            </span>
            <span className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#f0ede8' }}>
              +{amount.toLocaleString()} ⟡
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
