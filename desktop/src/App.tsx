// The spike's fishing screen: a deliberately small loop around the REAL parts.
// The dial is the website's (components/FishingDial DialSVG), the zones come
// from the website's buildFishZones, and every cast and reel goes through the
// Game API seam exactly as the website's fishing screen does, which in this
// build lands in the local core and a save file on this machine.

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/gameApi'
import { DialSVG } from '@/components/FishingDial'
import { buildFishZones, type ZoneDef } from '@/app/(app)/fishing/depths'
import { getLevelFromXP } from '@/lib/fishingLevel'
import type { CrateLoot } from '@/lib/crateLoot'
import { openSave, currentSave } from './localGameApi'
import { saveStorage } from './saveStorage'

type Shot = { fishId: number; catchDifficulty: number; waitMs: number; baitRemaining?: number }
type Phase = 'loading' | 'idle' | 'waiting' | 'dial' | 'reeling'

function zoneAt(zones: ZoneDef[], angle: number): ZoneDef['type'] {
  const a = ((angle % 360) + 360) % 360
  for (const z of zones) {
    const inside = z.from <= z.to ? a >= z.from && a < z.to : a >= z.from || a < z.to
    if (inside) return z.type
  }
  return 'miss'
}

function crateSays(loot: CrateLoot): string {
  switch (loot.type) {
    case 'doubloons': return `${loot.amount.toLocaleString()} ⟡`
    case 'bait': return `${loot.quantity} ${loot.baitName}`
    case 'pet': return `${loot.petName} came aboard`
    case 'skin': return `the ${loot.skinName} colors`
    case 'boat': return `the ${loot.boatName}`
    case 'hat': return `the ${loot.hatName} bandana`
  }
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [where, setWhere] = useState('')
  const [shot, setShot] = useState<Shot | null>(null)
  const [zones, setZones] = useState<ZoneDef[]>([])
  const [angle, setAngle] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const [, bump] = useState(0)
  const angleRef = useRef(0)
  const raf = useRef(0)

  const say = (line: string) => setLog(l => [line, ...l].slice(0, 8))

  useEffect(() => {
    void (async () => {
      const { storage, where } = await saveStorage()
      await openSave(storage)
      setWhere(where)
      setPhase('idle')
    })()
  }, [])

  const cast = useCallback(async () => {
    if (phase !== 'idle') return
    setPhase('waiting')
    const r = await api.fishing.castLine('worm', 'shallows')
    if ('error' in r) { say(r.error); setPhase('idle'); return }
    setShot(r)
    bump(n => n + 1)
    if (r.fishId === -1) {
      // A crate: haul it up once it surfaces and open it.
      setTimeout(async () => {
        const loot = await api.fishing.reelCrate('shallows', r.crateTier ?? 'wooden', 'catch')
        say('error' in loot ? loot.error : `A ${r.crateTier ?? 'wooden'} crate: ${crateSays(loot)}`)
        bump(n => n + 1)
        setPhase('idle')
      }, Math.max(800, r.waitMs))
      return
    }
    setTimeout(() => {
      const z = buildFishZones(r.catchDifficulty)
      ;(window as unknown as { __stbZones?: ZoneDef[] }).__stbZones = z   // test hook: the zones in play
      setZones(z)
      angleRef.current = 0
      setPhase('dial')
    }, Math.max(800, r.waitMs))
  }, [phase])

  // The needle sweeps while the dial is up.
  useEffect(() => {
    if (phase !== 'dial') return
    let last = performance.now()
    const speed = 200 + (shot?.catchDifficulty ?? 1) * 45
    const tick = (t: number) => {
      angleRef.current = (angleRef.current + ((t - last) / 1000) * speed) % 360
      ;(window as unknown as { __stbNeedle?: number }).__stbNeedle = angleRef.current   // test hook: where the needle is
      last = t
      setAngle(angleRef.current)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [phase, shot])

  const stop = useCallback(async () => {
    if (phase !== 'dial' || !shot) return
    cancelAnimationFrame(raf.current)
    setPhase('reeling')
    const result = zoneAt(zones, angleRef.current)
    const r = await api.fishing.reelIn(shot.fishId, result, 'worm')
    if ('error' in r) say(r.error)
    else if (!r.caught) say((result === 'penalty' ? 'Snagged. The line went slack.' : 'It slipped the hook.'))
    else say(`${result === 'perfect' ? 'Perfect! ' : ''}${r.fish.name}${r.catchQty && r.catchQty > 1 ? ` x${r.catchQty}` : ''}, ${r.sizeIn}" · +${r.xpGained} XP${r.isNewSpecies ? ' · new species' : ''}`)
    bump(n => n + 1)
    setPhase('idle')
  }, [phase, shot, zones])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      if (phase === 'idle') void cast()
      else if (phase === 'dial') void stop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, cast, stop])

  const save = currentSave()
  const xp = Number(save?.profile.fishing_xp ?? 0)
  const hold = save ? Object.values(save.hold).reduce((n, q) => n + q, 0) : 0

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', height: '100%', padding: 24, boxSizing: 'border-box', gap: 16 }}>
      <header style={{ display: 'flex', gap: 24, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 22, letterSpacing: 1 }}>The Shallows</strong>
        <span>Fishing Lv {getLevelFromXP(xp)} · {xp.toLocaleString()} XP</span>
        <span>{save?.bait.worm ?? 0} worms</span>
        <span>{hold} in the hold</span>
        <span>{save ? Object.keys(save.collection).length : 0} species logged</span>
        <span style={{ opacity: 0.55, fontSize: 12, marginLeft: 'auto' }}>Offline · save: {where}</span>
      </header>

      <main style={{ display: 'grid', placeItems: 'center' }} onClick={() => { if (phase === 'dial') void stop() }}>
        {phase === 'dial' || phase === 'reeling' ? (
          <div style={{ width: 360, height: 360, position: 'relative' }}>
            <DialSVG zones={zones} angle={angle} needleColor="#f4ecd8" zoneOpacityFn={() => 1} />
          </div>
        ) : (
          <button onClick={() => void cast()} disabled={phase !== 'idle'}
            style={{ fontSize: 20, padding: '14px 36px', borderRadius: 999, border: '1px solid rgba(240,192,64,0.6)', background: 'rgba(240,192,64,0.12)', color: '#f0c040', cursor: 'pointer' }}>
            {phase === 'loading' ? 'Opening the save…' : phase === 'waiting' ? 'Waiting for a bite…' : 'Cast (Space)'}
          </button>
        )}
      </main>

      <footer style={{ minHeight: 170 }}>
        {phase === 'dial' && <div style={{ opacity: 0.8, marginBottom: 8 }}>Something bit. Stop the needle (Space or click).</div>}
        {log.map((l, i) => <div key={i} style={{ opacity: 1 - i * 0.11 }}>{l}</div>)}
      </footer>
    </div>
  )
}
