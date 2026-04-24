'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { useRef } from 'react'
import { getTabDirection } from '@/lib/navigation'

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const prevPathRef = useRef(pathname)

  const direction = getTabDirection(prevPathRef.current, pathname)
  prevPathRef.current = pathname

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        custom={direction}
        initial="enter"
        animate="center"
        exit="exit"
        variants={{
          enter: (dir: number) => ({
            opacity: 0,
            x: dir !== 0 ? dir * 32 : 0,
            y: dir === 0 ? 10 : 0,
          }),
          center: { opacity: 1, x: 0, y: 0 },
          exit: (dir: number) => ({
            opacity: 0,
            x: dir !== 0 ? dir * -32 : 0,
            y: dir === 0 ? -6 : 0,
          }),
        }}
        transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
