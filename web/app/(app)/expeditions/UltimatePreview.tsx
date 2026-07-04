'use client'

// Looping in-picker preview of each ultimate weapon, so a captain knows what
// they're committing 750k + 24h to. Each scene is a tiny broadside diorama — your
// gun on the left, a target hull on the right — playing the weapon's signature
// blow on an endless loop. The FX echo the real combat identity (railgun = a
// piercing beam, barrage = four rapid shells, nuke = one blast that leaves a burn)
// without importing RaidCombat's heavy internals: self-contained motion loops.

import { motion } from 'framer-motion'
import type { ShipAugmentId } from '@/lib/shipAugments'

const MUZZLE = 16   // % from left — your gun deck
const TARGET = 80   // % from left — the enemy hull

/** A small stylised hull silhouette. `foe` flips it + tints it dark. */
function Hull({ foe, color }: { foe?: boolean; color: string }) {
  return (
    <svg width="46" height="30" viewBox="0 0 46 30" fill="none"
      style={{ transform: foe ? 'scaleX(-1)' : undefined, filter: foe ? 'none' : `drop-shadow(0 0 6px ${color}55)` }}>
      {/* hull */}
      <path d="M4 18 H42 L37 27 H9 Z" fill={foe ? '#2a3240' : '#3b4655'} stroke={foe ? '#455266' : color} strokeWidth="1.2" />
      {/* mast + sail */}
      <path d="M23 18 V4" stroke={foe ? '#556277' : color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M23 5 Q33 9 31 16 L23 15 Z" fill={foe ? '#37414f' : `${color}44`} stroke={foe ? '#4a586c' : `${color}88`} strokeWidth="1" />
    </svg>
  )
}

/** Shared stage: sea backdrop + both ships. Children draw the weapon FX over it. */
function Stage({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'relative', width: '100%', height: 118, borderRadius: 12, overflow: 'hidden',
      background: 'linear-gradient(180deg, #0a1420 0%, #0c1a2a 55%, #071019 100%)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* horizon shimmer */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: '62%', height: 1, background: `linear-gradient(90deg, transparent, ${color}33, transparent)` }} />
      {/* player gun */}
      <div style={{ position: 'absolute', left: `${MUZZLE}%`, top: '50%', transform: 'translate(-50%,-50%)' }}><Hull color={color} /></div>
      {/* target hull */}
      <div style={{ position: 'absolute', left: `${TARGET}%`, top: '50%', transform: 'translate(-50%,-50%)' }}><Hull foe color={color} /></div>
      {children}
    </div>
  )
}

// ── Railgun ── a charge at the muzzle, then a piercing lance that streaks across
//    and punches clean through the target (pierce = it never misses).
function RailgunFx({ color }: { color: string }) {
  const LOOP = 2.6
  return (
    <>
      {/* muzzle charge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.3, 0.9, 0.4] }}
        transition={{ duration: LOOP, times: [0, 0.28, 0.34, 0.4], repeat: Infinity, ease: 'easeOut' }}
        style={{ position: 'absolute', left: `${MUZZLE + 4}%`, top: '50%', width: 16, height: 16, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: `radial-gradient(circle, #fff 0%, ${color} 55%, transparent 75%)`, boxShadow: `0 0 16px ${color}` }}
      />
      {/* the beam — grows from muzzle to past the target, then snaps off */}
      <motion.div
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: [0, 0, 1, 1, 0], scaleX: [0, 0, 1, 1, 1] }}
        transition={{ duration: LOOP, times: [0, 0.34, 0.4, 0.52, 0.6], repeat: Infinity, ease: 'linear' }}
        style={{
          position: 'absolute', left: `${MUZZLE + 3}%`, top: '50%', height: 4,
          width: `${TARGET - MUZZLE + 6}%`, transformOrigin: 'left center', transform: 'translateY(-50%)',
          background: `linear-gradient(90deg, #fff, ${color})`, borderRadius: 2,
          boxShadow: `0 0 12px ${color}, 0 0 24px ${color}88`,
        }}
      />
      {/* pierce flash at the target */}
      <motion.div
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: [0, 0, 1, 0], scale: [0.3, 0.3, 2.1, 2.6] }}
        transition={{ duration: LOOP, times: [0, 0.4, 0.46, 0.62], repeat: Infinity, ease: 'easeOut' }}
        style={{ position: 'absolute', left: `${TARGET}%`, top: '50%', width: 22, height: 22, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: `radial-gradient(circle, #fff 0%, ${color} 50%, transparent 72%)` }}
      />
    </>
  )
}

// ── Barrage ── four shells fired in a rapid stagger, each landing its own hit.
function BarrageFx({ color }: { color: string }) {
  const LOOP = 2.8
  const shells = [0, 1, 2, 3]
  return (
    <>
      {shells.map(i => {
        const start = 0.06 + i * 0.09
        const travel = 0.14
        return (
          <div key={i}>
            {/* the shell in flight */}
            <motion.div
              initial={{ opacity: 0, left: `${MUZZLE + 4}%`, top: '50%' }}
              animate={{
                opacity: [0, 1, 1, 0],
                left: [`${MUZZLE + 4}%`, `${TARGET - 2}%`, `${TARGET - 2}%`],
                top: ['50%', `${44 + i * 3}%`, `${44 + i * 3}%`],
              }}
              transition={{ duration: LOOP, times: [start, start + 0.02, start + travel, start + travel + 0.02], repeat: Infinity, ease: 'easeIn' }}
              style={{ position: 'absolute', width: 7, height: 7, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: `radial-gradient(circle, #fff, ${color})`, boxShadow: `0 0 8px ${color}` }}
            />
            {/* impact burst */}
            <motion.div
              initial={{ opacity: 0, scale: 0.2 }}
              animate={{ opacity: [0, 0, 1, 0], scale: [0.2, 0.2, 1.5, 2] }}
              transition={{ duration: LOOP, times: [0, start + travel, start + travel + 0.03, start + travel + 0.14], repeat: Infinity, ease: 'easeOut' }}
              style={{ position: 'absolute', left: `${TARGET}%`, top: `${44 + i * 3}%`, width: 16, height: 16, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: `radial-gradient(circle, #fff 0%, ${color} 55%, transparent 75%)` }}
            />
          </div>
        )
      })}
    </>
  )
}

// ── Nuke ── a lobbed shell, a blinding flash, an expanding fireball with two shock
//    rings, an ember spray, and a lingering burn (Fallout) on the wreck.
function NukeFx({ color }: { color: string }) {
  const LOOP = 3.4
  const embers = Array.from({ length: 9 }, (_, i) => ({
    angle: (i / 9) * Math.PI * 2,
    dist: 26 + (i % 3) * 10,
  }))
  return (
    <>
      {/* lobbed shell arcing in */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0], left: [`${MUZZLE + 4}%`, `${TARGET}%`, `${TARGET}%`], top: ['50%', '20%', '50%'] }}
        transition={{ duration: LOOP, times: [0, 0.03, 0.24, 0.28], repeat: Infinity, ease: 'easeIn' }}
        style={{ position: 'absolute', width: 9, height: 9, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: `radial-gradient(circle, #fff, ${color})`, boxShadow: `0 0 8px ${color}` }}
      />
      {/* white core flash */}
      <motion.div
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: [0, 0, 1, 0], scale: [0.2, 0.2, 2.4, 3.4] }}
        transition={{ duration: LOOP, times: [0, 0.28, 0.33, 0.46], repeat: Infinity, ease: 'easeOut' }}
        style={{ position: 'absolute', left: `${TARGET}%`, top: '50%', width: 34, height: 34, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(circle, #fff 0%, #ffe6b0 45%, transparent 72%)' }}
      />
      {/* fireball */}
      <motion.div
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: [0, 0, 0.95, 0], scale: [0.2, 0.2, 2.9, 3.6] }}
        transition={{ duration: LOOP, times: [0, 0.3, 0.4, 0.6], repeat: Infinity, ease: 'easeOut' }}
        style={{ position: 'absolute', left: `${TARGET}%`, top: '50%', width: 30, height: 30, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: `radial-gradient(circle, #fff2c0 0%, ${color} 45%, #7a1010 80%, transparent 100%)` }}
      />
      {/* two shock rings */}
      {[0, 1].map(r => (
        <motion.div key={r}
          initial={{ opacity: 0, scale: 0.2 }}
          animate={{ opacity: [0, 0, 0.8, 0], scale: [0.2, 0.2, 3.4 + r * 1.4, 4.2 + r * 1.4] }}
          transition={{ duration: LOOP, times: [0, 0.32 + r * 0.04, 0.42 + r * 0.04, 0.62 + r * 0.04], repeat: Infinity, ease: 'easeOut' }}
          style={{ position: 'absolute', left: `${TARGET}%`, top: '50%', width: 24, height: 24, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: `2px solid ${color}cc` }}
        />
      ))}
      {/* embers */}
      {embers.map((e, i) => (
        <motion.div key={i}
          initial={{ opacity: 0, x: 0, y: 0 }}
          animate={{ opacity: [0, 0, 1, 0], x: [0, 0, Math.cos(e.angle) * e.dist], y: [0, 0, Math.sin(e.angle) * e.dist] }}
          transition={{ duration: LOOP, times: [0, 0.33, 0.4, 0.58], repeat: Infinity, ease: 'easeOut' }}
          style={{ position: 'absolute', left: `${TARGET}%`, top: '50%', width: 4, height: 4, marginLeft: -2, marginTop: -2, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }}
        />
      ))}
      {/* lingering burn on the wreck (Fallout) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 0.7, 0.7, 0], scale: [1, 1, 1.1, 0.9, 1] }}
        transition={{ duration: LOOP, times: [0, 0.42, 0.5, 0.85, 0.95], repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', left: `${TARGET}%`, top: '52%', width: 20, height: 14, transform: 'translate(-50%,-50%)', borderRadius: '50%', background: `radial-gradient(circle, ${color}bb 0%, transparent 70%)`, filter: 'blur(2px)' }}
      />
    </>
  )
}

export default function UltimatePreview({ id, color }: { id: ShipAugmentId; color: string }) {
  return (
    <Stage color={color}>
      {id === 'railgun' && <RailgunFx color={color} />}
      {id === 'barrage' && <BarrageFx color={color} />}
      {id === 'nuke' && <NukeFx color={color} />}
    </Stage>
  )
}
