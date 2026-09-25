'use client'

// ── "UNLOCKED" ──────────────────────────────────────────────────────────────
//
// A banner at the top of the screen when you EARN a cosmetic: a skin, a boat
// or a border that a level step or an achievement share just opened
// (lib/cosmeticGates). One at a time, the picture on the left, what it is and
// why on the right. Never blocks: the container passes presses through and
// only the card itself takes them.
//
// It asks the server (checkUnlocks) on arrival, on every page change (at most
// every 15s), when the tab comes back, and whenever something fires
// `unlocks-check` (a level-up card closing). The server remembers what it has
// already announced, on the account, so each one shows once on any device.

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import { checkUnlocks, type UnlockNews } from '@/app/(app)/unlockActions'

const SHOW_MS = 6500
const MIN_GAP_MS = 15_000

const CAT_LABEL: Record<UnlockNews['cat'], string> = { skin: 'Skin', boat: 'Boat', border: 'Border' }

export default function UnlockBanner() {
  const pathname = usePathname()
  const [queue, setQueue] = useState<UnlockNews[]>([])
  const lastAt = useRef(0)
  const busy = useRef(false)

  const check = useCallback(async (force = false) => {
    const now = Date.now()
    if (busy.current || (!force && now - lastAt.current < MIN_GAP_MS)) return
    busy.current = true
    lastAt.current = now
    try {
      const news = await checkUnlocks()
      if (news.length) setQueue(q => [...q, ...news.filter(n => !q.some(x => x.key === n.key))])
    } catch { /* a missed check is caught by the next one */ }
    finally { busy.current = false }
  }, [])

  // Arrival waits a moment so it does not land on top of the page loading.
  useEffect(() => {
    const t = setTimeout(() => { void check() }, 2500)
    return () => clearTimeout(t)
  }, [pathname, check])

  useEffect(() => {
    const onEvent = () => { void check(true) }
    const onVis = () => { if (document.visibilityState === 'visible') void check() }
    window.addEventListener('unlocks-check', onEvent)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('unlocks-check', onEvent)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [check])

  const cur = queue[0]
  useEffect(() => {
    if (!cur) return
    const t = setTimeout(() => setQueue(q => q.slice(1)), SHOW_MS)
    return () => clearTimeout(t)
  }, [cur])

  return (
    <div aria-live="polite" style={{
      position: 'fixed', left: 0, right: 0, top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
      zIndex: 130, display: 'flex', justifyContent: 'center', pointerEvents: 'none', padding: '0 12px',
    }}>
      <AnimatePresence mode="wait">
        {cur && (
          <motion.div
            key={cur.key}
            initial={{ opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            data-no-steer
            onClick={() => setQueue(q => q.slice(1))}
            style={{
              pointerEvents: 'auto', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 14,
              width: 'min(440px, 100%)', padding: '10px 14px 10px 10px', borderRadius: 16,
              background: 'linear-gradient(180deg, rgba(22,28,40,0.98), rgba(12,16,24,0.98))',
              border: '1px solid rgba(240,192,64,0.45)',
              boxShadow: '0 12px 34px rgba(0,0,0,0.55), 0 0 22px rgba(240,192,64,0.14)',
            }}>
            <div style={{
              width: 64, height: 64, flexShrink: 0, borderRadius: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'radial-gradient(circle at 50% 40%, rgba(240,192,64,0.2), rgba(0,0,0,0.25) 75%)',
            }}>
              {cur.cat === 'boat' && cur.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={cur.image} alt="" style={{ width: 60, height: 60, objectFit: 'contain' }} />
                : <CharacterAvatar
                    characterColor={cur.cat === 'skin' ? cur.id : null}
                    equippedHat={null}
                    size={56}
                    ringColor={cur.cat === 'border' ? cur.ring : undefined}
                  />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="font-karla font-800 uppercase" style={{ margin: 0, fontSize: '0.58rem', letterSpacing: '0.18em', color: 'rgba(240,192,64,0.9)' }}>
                Unlocked · {CAT_LABEL[cur.cat]}
              </p>
              <p className="font-cinzel font-700" style={{ margin: '2px 0 0', fontSize: '1.02rem', color: '#f6efe0', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cur.name}
              </p>
              <p className="font-karla font-600" style={{ margin: '3px 0 0', fontSize: '0.72rem', color: 'rgba(214,224,238,0.7)' }}>
                For reaching {cur.reason}. {cur.cat === 'border' ? 'Wear it from your profile.' : 'Wear it from your Loadout.'}
              </p>
            </div>
            <span aria-hidden className="font-karla" style={{ fontSize: '1.1rem', color: 'rgba(214,224,238,0.45)', alignSelf: 'flex-start' }}>×</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
