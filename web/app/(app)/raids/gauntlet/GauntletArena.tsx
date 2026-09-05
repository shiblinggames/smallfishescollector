'use client'

// ── THE ARENA ───────────────────────────────────────────────────────────────
//
// The water a gauntlet fight happens on. Phase 0 of the facelift: the fight
// stops being staged over a photograph and starts being fought on a live sea,
// the way the campaign's fights are on the chart — the same guns, the same
// wards, the same crew abilities landing in the same water.
//
// ── IT IS ITS OWN PIXI APPLICATION, AND THAT IS ONLY SAFE HERE ──────────────
//
// A browser allows few live WebGL contexts and EVICTS THE OLDEST. `DialFx`
// records what that cost once: a second context on the fishing dial killed the
// chart's renderer under a live DOM, and nothing anywhere listens for
// `webglcontextlost`.
//
// The rule that came out of it is ONE LIVE CONTEXT, not "never a second
// Application". This is safe because `/raids/gauntlet` is its own route and
// `/sea` is unmounted behind it, so this is the only context alive. Two things
// follow, and neither is optional:
//
//   1. This Application is created on mount and DESTROYED on unmount. The
//      cleanup below is load-bearing, not tidiness.
//   2. THE GAUNTLET MUST NEVER BECOME AN OVERLAY ON /sea. The moment it does,
//      this file takes the chart's context with it. If that day comes, this
//      has to move onto the chart's renderer the way the raid fight did.
//
// ── WHAT IT ACTUALLY IS ─────────────────────────────────────────────────────
//
// The smallest possible sibling of the chart, not a fork of it. It imports the
// sea's own LAYERS — the water shader, the gun effects, the ability effects —
// and owns nothing but a camera that does not move and two hulls that do.
// `SeaIslandsGPU` is deliberately not reused: it is the chart's renderer, bound
// to bays, isles, fog, traders and a forty-five-thousand-pixel world, none of
// which exist here.
//
// ── AND IT SPEAKS THE CONTRACT RaidCombat ALREADY KNOWS ─────────────────────
//
// `RaidCombat`'s `overSea` mode is renderer-agnostic by construction. It stands
// down its own backdrop, hides its own two ships, and asks for three things:
//
//   anchors     where each hull is on screen, and how wide, read every frame
//   onShipFx    the pose channel: recoil, shudder, list, the long roll of a sink
//   onFightFx   the event channel: guns, hits, crits, dodges, volleys, megas,
//               abilities, summons, wards, statuses
//
// Nothing in that contract knows whether it is talking to the chart or to this.
// Implementing the three of them inherits the entire fight, including every
// effect built for the sea this month, with no change to the combat engine.

import { useEffect, useRef } from 'react'
import { makeWater, rgb3 } from '@/app/(app)/sea/seaWater'
import { makeGunFx, type GunFx, type ImpactKind } from '@/app/(app)/sea/seaGunFx'
import { makeAbilityFx, type AbilityFx } from '@/app/(app)/sea/seaAbilityFx'
import { GROUND } from '@/app/(app)/sea/islandArt'
import type { ShipAnchor, ShipFx, FightFx } from '@/app/(app)/raids/RaidCombat'

/**
 * THE DUEL'S SHAPE, in arena units.
 *
 * The same framing the chart's fights settled on and for the same reason: your
 * hull low and to the left, theirs high and to the right, so the two read as an
 * engagement rather than as two sprites. These are fractions of the viewport,
 * so the shot composes itself on any window.
 */
const PLAYER_AT = { x: 0.30, y: 0.62 }
const ENEMY_AT = { x: 0.70, y: 0.34 }
/** Hull widths as a fraction of the viewport's width. The enemy reads slightly
 *  smaller because she is further away — the same distance cue the chart uses. */
const PLAYER_W = 0.42
const ENEMY_W = 0.34

export type ArenaTheme = {
  /** Three water stops, deep to pale, as the chart's waters are written. */
  sea: [string, string, string]
  /** How dark the hour is here. The deep gets heavier as you fall. */
  dark: number
  /** Swell and rush: how much the water is moving, and how hard. */
  swell: number
  rush: number
}

export type ArenaHandle = {
  /** Where the two hulls are, for the fight to hang its effects on. */
  anchors: { current: { player: ShipAnchor; enemy: ShipAnchor } | null }
  /** The pose channel. */
  shipFx(fx: { player: ShipFx; enemy: ShipFx }): void
  /** The event channel. */
  fightFx(e: FightFx): void
}

export default function GauntletArena({ theme, shipUrl, enemyUrl, shipFlip, handle }: {
  theme: ArenaTheme
  /** The player's hull art, as the fight already knows it. */
  shipUrl: string
  /** The enemy's, this depth. */
  enemyUrl: string
  /** Whether the player's sprite is drawn mirrored — the ships table's own flag. */
  shipFlip?: boolean
  /** Filled in on mount; the fight reads it and calls into it. */
  handle: React.MutableRefObject<ArenaHandle | null>
}) {
  const holder = useRef<HTMLDivElement | null>(null)
  // The live theme, so a depth change repaints without rebuilding the world.
  const themeRef = useRef(theme)
  themeRef.current = theme
  const artRef = useRef({ shipUrl, enemyUrl, shipFlip: !!shipFlip })
  artRef.current = { shipUrl, enemyUrl, shipFlip: !!shipFlip }

  useEffect(() => {
    let dead = false
    let cleanup: (() => void) | null = null

    ;(async () => {
      const PIXI = await import('pixi.js')
      if (dead || !holder.current) return
      const el = holder.current

      const app = new PIXI.Application()
      await app.init({
        backgroundAlpha: 0,
        resizeTo: el,
        antialias: true,
        // The chart's own reasoning: full retina costs fill rate for a picture
        // nobody reads at that density. A shade over one is the honest floor.
        resolution: Math.min(1.5, window.devicePixelRatio || 1),
        autoDensity: true,
        preference: 'webgl',
      })
      if (dead) { app.destroy(true, { children: true }); return }
      el.appendChild(app.canvas)

      // ── THE WATER ───────────────────────────────────────────────────
      const th = themeRef.current
      const water = await makeWater(PIXI, {
        uTime: 0,
        uCam: new Float32Array([0, 0]),
        uZoom: 1,
        uRes: new Float32Array([app.screen.width, app.screen.height]),
        uShallow: rgb3(th.sea[2]),
        uMid: rgb3(th.sea[1]),
        uDeep: rgb3(th.sea[0]),
        uDark: th.dark,
        uLight: new Float32Array([0.5, -0.2]),
        uSwell: th.swell,
        uRush: th.rush,
        uWarm: 0,
      })
      if (dead) { app.destroy(true, { children: true }); return }
      if (water) {
        app.stage.addChild(water.sprite)
        water.size(app.screen.width, app.screen.height)
      }

      // ── THE WORLD ───────────────────────────────────────────────────
      //
      // A render group, because the chart's profiling says a moving container
      // with children walks all of them. This one does not move yet, and it
      // will when the descent gets a camera, so it is a group from the start.
      const world = new PIXI.Container()
      world.isRenderGroup = true
      app.stage.addChild(world)

      // The effect layers, under the hulls: a shot lands IN the water and the
      // ship floats on it. Same order the chart uses.
      const guns: GunFx = makeGunFx(PIXI)
      const spells: AbilityFx = makeAbilityFx(PIXI)
      world.addChild(guns.view, spells.view)

      // ── THE TWO HULLS ───────────────────────────────────────────────
      //
      // Plain sprites in the world. The fight poses them through `shipFx`; it
      // never positions them, because where a hull SITS is the arena's business
      // and what is happening TO her is the fight's.
      const mkHull = (url: string, flip: boolean) => {
        const node = new PIXI.Container()
        const sp = new PIXI.Sprite(PIXI.Texture.from(url))
        sp.anchor.set(0.5)
        if (flip) sp.scale.x = -1
        node.addChild(sp)
        world.addChild(node)
        return { node, sp }
      }
      const art = artRef.current
      const player = mkHull(art.shipUrl, art.shipFlip)
      const enemy = mkHull(art.enemyUrl, false)

      // Anchors are read by the fight EVERY FRAME through a ref, so neither
      // side re-renders to keep a hitsplat over a hull.
      const anchors: { current: { player: ShipAnchor; enemy: ShipAnchor } | null } = {
        current: { player: { x: 0, y: 0, w: 0 }, enemy: { x: 0, y: 0, w: 0 } },
      }
      const pose = { player: null as ShipFx | null, enemy: null as ShipFx | null }

      /** Where a hull stands, in screen pixels, from the framing above. */
      const station = (at: { x: number; y: number }) => ({
        x: app.screen.width * at.x,
        y: app.screen.height * at.y,
      })

      // ── THE FIGHT'S THREE HANDLES ───────────────────────────────────
      handle.current = {
        anchors,
        shipFx(fx) { pose.player = fx.player; pose.enemy = fx.enemy },
        fightFx(e) {
          const P = station(PLAYER_AT), E = station(ENEMY_AT)
          const me = { x: P.x, y: P.y }
          const them = { x: E.x, y: E.y }
          if (e.kind === 'fire') {
            if (e.side === 'player') guns.fire(me.x, me.y, them.x, them.y)
            else guns.fire(them.x, them.y, me.x, me.y)
            return
          }
          if (e.kind === 'volley' || e.kind === 'mega') {
            const from = e.side === 'player' ? me : them
            const to = e.side === 'player' ? them : me
            const hex = (e.color ?? '#ffffff').replace('#', '')
            const n = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16)
            const tint = Number.isFinite(n) ? n : 0xffffff
            if (e.kind === 'volley') guns.volley(from.x, from.y, to.x, to.y, e.guns ?? 3)
            else if (e.mega === 'railgun') guns.railgun(from.x, from.y, to.x, to.y, tint)
            else if (e.mega === 'nuke_launch') guns.nukeLaunch(from.x, from.y)
            else if (e.mega === 'nuke_blast') guns.nukeBlast(to.x, to.y, tint)
            else if (e.mega === 'barrage') guns.volley(from.x, from.y, to.x, to.y, 4, true)
            return
          }
          const at = e.side === 'enemy' ? them : me
          const other = e.side === 'enemy' ? me : them
          if (e.kind === 'summon' || e.kind === 'ability') {
            const hex = (e.color ?? '#ffffff').replace('#', '')
            const n = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16)
            const tint = Number.isFinite(n) ? n : 0xffffff
            if (e.kind === 'summon') spells.summon(at.x, at.y, tint, e.power ?? 1)
            else spells.cast(at.x, at.y, other.x, other.y, tint, e.shape ?? 'buff', e.power ?? 1)
            return
          }
          if (e.kind === 'sink') { guns.sink(at.x, at.y); return }
          if (e.kind === 'dodge') { guns.wake(at.x, at.y, at.x - other.x, at.y - other.y); return }
          if (e.kind === 'miss') {
            const dx = at.x - other.x, dy = at.y - other.y
            const len = Math.hypot(dx, dy) || 1
            const wide = (Math.random() - 0.5) * 160
            guns.impact(
              at.x - (dx / len) * 120 - (dy / len) * wide,
              at.y - (dy / len) * 120 + (dx / len) * wide,
              'miss' as ImpactKind)
            return
          }
          guns.impact(at.x, at.y, e.kind === 'crit' ? 'crit' : 'hit')
          if (e.kind === 'crit') guns.shock(at.x, at.y)
        },
      }

      // ── THE FRAME ───────────────────────────────────────────────────
      let t = 0
      app.ticker.add(() => {
        const dt = Math.min(0.05, app.ticker.deltaMS / 1000)
        t += dt

        const W = app.screen.width, H = app.screen.height
        const th2 = themeRef.current
        water?.set({
          uTime: t,
          uRes: new Float32Array([W, H]),
          uShallow: rgb3(th2.sea[2]),
          uMid: rgb3(th2.sea[1]),
          uDeep: rgb3(th2.sea[0]),
          uDark: th2.dark,
          uSwell: th2.swell,
          uRush: th2.rush,
        })
        water?.size(W, H)

        const P = station(PLAYER_AT), E = station(ENEMY_AT)
        const pw = W * PLAYER_W, ew = W * ENEMY_W

        // THE HULLS, POSED. The bob is the arena's; everything else on these
        // two nodes came from the fight through `shipFx`.
        const bob = Math.sin(t * 1.7) * 3.4 + Math.sin(t * 2.6 + 1.1) * 2.1
        const pf = pose.player, ef = pose.enemy
        player.sp.width = pw
        player.sp.height = pw * (player.sp.texture.height / Math.max(1, player.sp.texture.width))
        if (art.shipFlip) player.sp.scale.x = -Math.abs(player.sp.scale.x)
        player.node.x = P.x + (pf?.x ?? 0)
        player.node.y = P.y + (pf?.y ?? 0) + bob
        player.node.rotation = ((pf?.rot ?? 0) * Math.PI) / 180

        enemy.sp.width = ew
        enemy.sp.height = ew * (enemy.sp.texture.height / Math.max(1, enemy.sp.texture.width))
        enemy.node.x = E.x + (ef?.x ?? 0)
        enemy.node.y = E.y + (ef?.y ?? 0) - bob * 0.6
        enemy.node.rotation = ((ef?.rot ?? 0) * Math.PI) / 180
        // GOING DOWN. The fight says when; how it looks is the arena's, the
        // same settle-and-roll the chart gives a hull it has sunk.
        if (ef?.sink) {
          enemy.node.alpha = Math.max(0, enemy.node.alpha - dt * 0.8)
          enemy.node.y += dt * 26
          enemy.node.rotation -= dt * 0.22
        } else if (enemy.node.alpha < 1) {
          enemy.node.alpha = 1
        }

        // AND WHERE THEY ARE, for the fight to aim at. The box is the canvas's
        // own, so the numbers are in the same screen space the fight's overlays
        // are laid out in.
        const box = el.getBoundingClientRect()
        const A = anchors.current!
        A.player.x = box.left + player.node.x
        A.player.y = box.top + player.node.y
        A.player.w = pw
        A.enemy.x = box.left + enemy.node.x
        A.enemy.y = box.top + enemy.node.y
        A.enemy.w = ew

        // The wards and the conditions ride the same measurements.
        spells.ward('player', P.x, P.y, pw * 0.6, 0x5eead4, !!pf?.guard)
        spells.ward('enemy', E.x, E.y, ew * 0.6, 0xc084fc, !!ef?.guard)
        spells.status('player', P.x, P.y, pw * 0.6, pf?.status ?? 0)
        spells.status('enemy', E.x, E.y, ew * 0.6, ef?.status ?? 0)

        guns.advance(dt)
        spells.advance(dt)
      })

      cleanup = () => {
        handle.current = null
        guns.destroy()
        spells.destroy()
        // THE CONTEXT GOES WITH THE ROUTE. See the note at the top: this is
        // what makes a second Application safe at all.
        app.destroy(true, { children: true, texture: false })
      }
    })().catch(() => {
      // An arena that will not start must not take the run with it. The fight
      // still plays; it simply plays over nothing.
    })

    return () => { dead = true; cleanup?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={holder} aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none' }} />
}

/** Height is a screen measurement inside a squashed plane — kept here so the
 *  descent's camera work has the chart's own conversion to hand. */
export const ARENA_GROUND = GROUND
