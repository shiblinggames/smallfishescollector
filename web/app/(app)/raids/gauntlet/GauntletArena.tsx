'use client'

// ── THE ARENA ───────────────────────────────────────────────────────────────
//
// The water a gauntlet run happens on. Phase 0 of the facelift put the FIGHT on
// a live sea, the way the campaign's fights are on the chart; phase 3 keeps
// that sea under the whole run, so a boon surfaces on the water you were just
// fighting on rather than on a screen that replaced it.
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
// ── ONE ARENA PER RUN, NOT ONE PER SCREEN ───────────────────────────────────
//
// GauntletGame renders this as the FIRST child, keyed "arena", of every phase
// of a live run. React reconciles a component's top-level children by position
// and key, so the same Application survives every phase change: the water you
// fall through is the water you fight on is the water the boon surfaces on.
// Keep it first and keyed in every branch, or it reloads — and reloading is a
// second context for a frame, which is the one thing this file must not do.
//
// ── WHAT IT ACTUALLY IS ─────────────────────────────────────────────────────
//
// The smallest possible sibling of the chart, not a fork of it. It imports the
// sea's own LAYERS — the water shader, the gun effects, the ability effects —
// and adds two of its own: the weather of a descent, and the scenery that
// makes Davy's water Davy's and the Don's the Don's. It owns nothing but a
// camera that does not move and two hulls that do. `SeaIslandsGPU` is
// deliberately not reused: it is the chart's renderer, bound to bays, isles,
// fog, traders and a forty-five-thousand-pixel world, none of which exist here.
//
// ── AND THE SHIPS STAND WHERE THE CHART'S SHIPS STAND ───────────────────────
//
// `duelFrame` in raidWaters is the chart's own construction of a broadside —
// the stand-off, the camera lift, the fitted zoom, the ground squash — and the
// arena composes its fight from it. Your hull is anchored at its CENTRE and
// theirs at its WATERLINE, exactly as the chart reports them, because the
// fight's overlays lift each side by what its anchor means.
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
import { hullWater, type HullWater } from '@/app/(app)/sea/seaCaptain'
import { makeAbilityFx, type AbilityFx } from '@/app/(app)/sea/seaAbilityFx'
import { GROUND } from '@/app/(app)/sea/islandArt'
import { texture } from '@/app/(app)/sea/skiffArt'
import { duelFrame, type HullPaint } from '@/app/(app)/sea/raidWaters'
import { makeWeather, type Weather } from './gauntletWeather'
import { makeScenery, type Scenery, type Mood, type BeatKind, type SceneVariant } from './gauntletScenery'
import type { ShipAnchor, ShipFx, FightFx } from '@/app/(app)/raids/RaidCombat'

export type { Mood, BeatKind } from './gauntletScenery'

export type ArenaTheme = {
  /** Three water stops, deep to pale, as the chart's waters are written. */
  sea: [string, string, string]
  /** The run's own colour, for the bolt, the bubbles and the maw. */
  key: number
  /** How bad it is here: depth, plus Pressure, plus whatever a boss adds.
   *  Everything the weather does reads this one number. */
  heavy: number
  /** A boss depth turns the maw on overhead. */
  boss: boolean
  /** How dark the hour is here. The deep gets heavier as you fall. */
  dark: number
  /** Swell and rush: how much the water is moving, and how hard. */
  swell: number
  rush: number
}

export type ArenaScene = {
  variant: SceneVariant
  hardcore: boolean
  /** The Don himself, at his milestone depths. */
  apex: boolean
  /** 0 at the surface, 1 at the deepest anyone reaches. */
  deep: number
}

export type ArenaHandle = {
  /** Where the two hulls are, for the fight to hang its effects on. */
  anchors: { current: { player: ShipAnchor; enemy: ShipAnchor } | null }
  /** The pose channel. */
  shipFx(fx: { player: ShipFx; enemy: ShipFx }): void
  /** The event channel. */
  fightFx(e: FightFx): void
  /** A ceremony the run wants played on the water: a card turning, a curse
   *  taking, a chest opening. Mood changes fire their own; this is for the
   *  moments inside a screen. */
  beat(kind: BeatKind, tint?: number): void
}

/** Where the chart's water sits in the viewport: under the nav, over the tab
 *  bar on a phone. The arena composes to the same box so the shot matches. */
function waterBox(W: number, H: number) {
  const top = W < 640 ? 44 : 60
  const bottom = W < 640 ? 60 : 0
  return { cx: W / 2, cy: top + (H - top - bottom) / 2 }
}

export default function GauntletArena({ theme, scene, mood, depth, shipUrl, enemyUrl, enemyPaint, shipFlip, seaBeam, enemyHidden, handle }: {
  theme: ArenaTheme
  scene: ArenaScene
  /** Which screen of the run this is under. Drives the grade and the beats. */
  mood: Mood
  /** Which depth this is. A change plays the fall — see fallRef. */
  depth: number
  /** The player's hull art, as the fight already knows it. */
  shipUrl: string
  /**
   * HER PAINT. Every enemy below a Man-o-War flies the player's own v3 art, so
   * without this every schooner in the gauntlet is the same schooner — and the
   * gauntlet draws its mobs FROM the raid configs, so you meet the same three
   * hulls over and over down a dive. From `hullPaint`, so a ship is the same
   * colour here as she is in her own raid.
   */
  enemyPaint?: HullPaint
  /** The enemy's, this depth. Empty when there is none yet. */
  enemyUrl: string
  /** Whether the player's sprite is drawn mirrored — the ships table's own flag. */
  shipFlip?: boolean
  /** How much of the warship's box is hull, from the ships table. */
  seaBeam: number
  /**
   * Hold the enemy off the water. Set while you are still FALLING toward a
   * depth, and between fights: you ride the descent alone and she fades in as
   * the fight opens, which is what makes an arrival read as an arrival.
   */
  enemyHidden?: boolean
  /** Filled in on mount; the fight reads it and calls into it. */
  handle: React.MutableRefObject<ArenaHandle | null>
}) {
  const holder = useRef<HTMLDivElement | null>(null)
  // The live theme, so a depth change repaints without rebuilding the world.
  const themeRef = useRef(theme)
  themeRef.current = theme
  const sceneRef = useRef({ ...scene, mood })
  sceneRef.current = { ...scene, mood }
  const artRef = useRef({ shipUrl, enemyUrl, shipFlip: !!shipFlip, seaBeam, enemyPaint })
  artRef.current = { shipUrl, enemyUrl, shipFlip: !!shipFlip, seaBeam, enemyPaint }
  const hiddenRef = useRef(!!enemyHidden)
  hiddenRef.current = !!enemyHidden
  /** 1 the instant a new depth arrives, decayed by the frame loop. */
  const fallRef = useRef(0)
  const depthSeen = useRef(depth)
  if (depthSeen.current !== depth) { depthSeen.current = depth; fallRef.current = 1 }
  // NO LURCH ON A PHASE CHANGE. A surge here was tried with the sweeping tide
  // and read as seasickness; the water holds still while the light dips.

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
        // ── NO MULTISAMPLING. ───────────────────────────────────────────
        //
        // The chart asks for it because it draws islands: hard-edged geometry
        // with long diagonals, which is exactly what MSAA is for. This arena
        // draws a sea painted by a fragment shader, two soft-edged ship
        // paintings and a few hundred alpha-blended particles. There is not a
        // polygon edge in it for MSAA to smooth, so the whole cost — a bigger
        // framebuffer and a resolve pass every frame, on a phone, full screen —
        // buys a difference nobody can see.
        //
        // It matters here more than it would anywhere else because the aim
        // bar's needle and target band are COMPOSITOR animations, and a
        // saturated GPU stutters those even when the main thread is idle.
        antialias: false,
        // The chart's own reasoning: full retina costs fill rate for a picture
        // nobody reads at that density. A shade over one is the honest floor.
        // LOWER THAN THE CHART'S, and for the same reason as the line above:
        // the chart is a map you read, this is water behind a fight. It was
        // 1.25, which on a 2x desktop monitor rendered the arena at five
        // eighths of native and upscaled it, visibly soft against the crisp
        // DOM fight on top. 1.5 halves that gap for a fifth more fragment
        // work than 1.25, and stays under the chart's 2 on purpose: the aim
        // bar's compositor animations are what a saturated GPU stutters.
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

      // The layers, bottom to top. The scenery's far half — the deep, the
      // silhouettes, the shafts — sits between the water and the effects, so
      // a shot lands in front of the wreck-field and the wreck-field lies in
      // the water. Its near half goes over everything, rain included.
      const guns: GunFx = makeGunFx(PIXI)
      const spells: AbilityFx = makeAbilityFx(PIXI)
      const weather: Weather = makeWeather(PIXI)
      const scenery: Scenery = makeScenery(PIXI)
      world.addChild(weather.water, scenery.far, guns.view, spells.view)

      /**
       * ── EVERY GUN FIRED ONCE, TWENTY THOUSAND PIXELS AWAY ───────────
       *
       * The first Lock of a run stalls and every Lock after it is clean. That
       * is not a React shape and it is not fill rate: it is FIRST USE. A
       * particle system does no GPU work at all until something in it is
       * actually drawn, and then it does all of it at once — upload the
       * texture, compile and link the program for its blend mode, allocate the
       * buffers. On a phone that is tens of milliseconds, and it lands on the
       * single frame in the fight that must not stall, because the first thing
       * the first Lock does is fire a gun.
       *
       * So they are all fired here instead, at mount, off in the far
       * north-west where nothing is looked at. The particles are pooled and age
       * out on their own; what stays behind is the compiled program and the
       * uploaded texture, and every Lock after this one is the good one.
       *
       * It lands on the descent screen — a second of falling water, which is
       * the best place in a run to spend a frame.
       */
      {
        const FAR = -20000
        guns.fire(FAR, FAR, FAR - 120, FAR)
        guns.volley(FAR, FAR, FAR - 120, FAR, 3)
        guns.impact(FAR, FAR, 'hit')
        guns.impact(FAR, FAR, 'crit')
        guns.shock(FAR, FAR)
        guns.wake(FAR, FAR, 1, 0)
        // The crew fire abilities within a turn or two of the first shot, and
        // they are a second system with a second program.
        spells.cast(FAR, FAR, FAR - 120, FAR, 0xffffff, 'buff', 1)
      }

      // ── THE TWO HULLS ───────────────────────────────────────────────
      //
      // Plain sprites in the world. The fight poses them through `shipFx`; it
      // never positions them, because where a hull SITS is the arena's business
      // and what is happening TO her is the fight's.
      //
      // Your hull is anchored at its CENTRE and theirs at its WATERLINE, the
      // way the chart draws them: the boat is drawn centred on her position,
      // and an encounter's mark is planted at its foot. The fight's overlays
      // lift each side by what its anchor means, so the two must not agree.
      //
      // TEXTURE.FROM DOES NOT LOAD A URL. In Pixi v8 it reads the cache; hand
      // it a path and you get an empty texture and a sprite that draws
      // nothing. The chart has its own loader for precisely this reason — a
      // plain Image and decode() — and it caches, so the two renderers share
      // one copy of a hull.
      const mkHull = (anchorY: number) => {
        const node = new PIXI.Container()
        const sp = new PIXI.Sprite(PIXI.Texture.EMPTY)
        sp.anchor.set(0.5, anchorY)
        node.addChild(sp)
        world.addChild(node)
        return { node, sp, url: '', water: null as HullWater | null }
      }
      // ── AND THE WATER SHE IS IN ────────────────────────────────────────
      // Her reflection under her and the wet band over her, the pair the
      // chart gives every hull — see hullWater. Built once the bitmap is here
      // (both are cut from it) and laid against her every frame after sizing.
      const load = (h: ReturnType<typeof mkHull>, url: string) => {
        h.url = url
        if (h.water) { h.water.back.destroy(); h.water.soak.destroy(); h.water = null }
        if (!url) { h.sp.texture = PIXI.Texture.EMPTY; return }
        void texture(PIXI, url).then(tex => {
          if (dead || h.url !== url) return
          h.sp.texture = tex
          const w = hullWater(PIXI, url)
          if (!w) return
          h.node.addChildAt(w.back, 0)
          h.node.addChild(w.soak)
          h.water = w
        }).catch(() => {})
      }
      const player = mkHull(0.5)
      const enemy = mkHull(1)
      /**
       * ── THE PAINT, AS A COLOUR MATRIX ───────────────────────────────
       *
       * Not `tint`: tint MULTIPLIES, so it can only ever make a hull darker,
       * and a dark hull tinted green is a black hull. A hue rotation moves the
       * colour without touching how bright she is, which is what paint does.
       *
       * The filter is only attached when there is something to rotate — the
       * wheel includes 0 on purpose, and a hull wearing the art as painted
       * should not pay for a render pass to be told so. On a small sprite the
       * pass is a few hundred square pixels; it is nothing beside the water,
       * and it is the only filter in this arena.
       */
      let paintNow: HullPaint | null = null
      const paintEnemy = (p: HullPaint | undefined) => {
        if (p === paintNow) return
        paintNow = p ?? null
        if (!p || (p.hue === 0 && p.sat === 1 && p.bright === 1)) { enemy.node.filters = []; return }
        // AT THE RENDERER'S RESOLUTION. A filter draws its sprite into a
        // texture of its own and a Pixi filter's default resolution is 1 —
        // not the renderer's — so on a phone the one hull wearing paint was
        // drawn at 1x and scaled up, soft, beside a player hull drawn sharp.
        // 'inherit' is the renderer's own, and the antialias likewise.
        const f = new PIXI.ColorMatrixFilter({ resolution: 'inherit', antialias: 'inherit' })
        // Each call multiplies onto the matrix already there, and a fresh
        // filter starts as identity — so the three compose in one pass.
        if (p.hue) f.hue(p.hue, true)
        // Pixi's saturate takes an OFFSET where 0 is unchanged; CSS takes a
        // MULTIPLIER where 1 is. x = a * 2/3 + 1, so a = (mult - 1) * 1.5.
        if (p.sat !== 1) f.saturate((p.sat - 1) * 1.5, true)
        if (p.bright !== 1) f.brightness(p.bright, true)
        // ON THE NODE, not the sprite: her reflection wears her paint too.
        enemy.node.filters = [f]
      }
      paintEnemy(artRef.current.enemyPaint)
      // SHE IS NOT HERE UNTIL THE FIGHT IS. The alpha eases toward whatever
      // `enemyHidden` says, and starting at Pixi's default of 1 meant every
      // screen that does NOT want her — the fall, the breather, the reward —
      // opened with her on the water for the few frames it took to fade her
      // off. Most visible at the very start of a run, where the descent is the
      // first thing you see.
      enemy.node.alpha = 0
      // AND NEITHER IS SHE. `showHull` is `mood === 'fight' || 'dead'`, and
      // this too started at Pixi's 1 — so a run opened with her parked on the
      // descent screen for the few frames it took to ease her off, which is
      // the "picture of a ship rather than a ship" this file already warns
      // about further down.
      player.node.alpha = 0
      load(player, artRef.current.shipUrl)
      load(enemy, artRef.current.enemyUrl)
      // Over the hulls: rain falls in front of a ship, and so do the motes,
      // the vignette and the ceremonies.
      // The painted conditions ride OVER the hulls and under the rain. See
      // AbilityFx.over for why they cannot share `view`.
      // The guns' fire and the spells' painted set go OVER the hulls: a
      // fireball centred on a ship and drawn under her is a fireball nobody
      // sees.
      world.addChild(guns.over, spells.over, weather.air, scenery.near)

      // Anchors are read by the fight EVERY FRAME through a ref, so neither
      // side re-renders to keep a hitsplat over a hull.
      const anchors: { current: { player: ShipAnchor; enemy: ShipAnchor } | null } = {
        current: { player: { x: 0, y: 0, w: 0, box: 0 }, enemy: { x: 0, y: 0, w: 0, box: 0 } },
      }
      const pose = { player: null as ShipFx | null, enemy: null as ShipFx | null }

      /**
       * ── WHERE THE CANVAS IS ON THE GLASS, MEASURED ONCE ─────────────
       *
       * This was read EVERY FRAME, and reading a rect forces the browser to
       * lay the page out THERE AND THEN before it can answer. Sixty forced
       * layouts a second, on the main thread, beside an aim bar the player is
       * judging by eye — which is the exact cost RaidCombat's own anchor loop
       * is written to avoid, with a long note saying why. This loop did the
       * thing that note warns about, in the same fight, for a number that
       * cannot change without a resize: the holder is `position: fixed;
       * inset: 0`.
       */
      let box = el.getBoundingClientRect()
      const remeasure = () => { box = el.getBoundingClientRect() }
      const ro = new ResizeObserver(remeasure)
      ro.observe(el)
      window.addEventListener('resize', remeasure)

      /**
       * AND THE WATER'S COLOURS, PARSED ONCE PER PALETTE.
       *
       * `rgb3` parses a hex string and allocates a Float32Array. Three of them
       * a frame, a hundred and eighty a second, for three values that are the
       * same until the mood or the depth changes. `water.set` copies out of
       * whatever it is handed, so one array each can be reused forever.
       */
      const pal = { key: '', deep: rgb3('#000000'), mid: rgb3('#000000'), shallow: rgb3('#000000') }
      const palette = (deep: string, mid: string, shallow: string) => {
        const k = `${deep}|${mid}|${shallow}`
        if (pal.key !== k) {
          pal.key = k
          pal.deep = rgb3(deep); pal.mid = rgb3(mid); pal.shallow = rgb3(shallow)
        }
        return pal
      }
      const uRes = new Float32Array(2)

      /** Where the two hulls stand, in screen pixels, from the chart's duel. */
      const frame = () => {
        const W = app.screen.width, H = app.screen.height
        const { cx, cy } = waterBox(W, H)
        return duelFrame(W, H, cx, cy, artRef.current.seaBeam, artRef.current.enemyUrl, GROUND)
      }

      // ── THE FIGHT'S THREE HANDLES, AND THE RUN'S FOURTH ─────────────
      handle.current = {
        anchors,
        shipFx(fx) { pose.player = fx.player; pose.enemy = fx.enemy },
        beat(kind, tint) { scenery.beat(kind, tint) },
        fightFx(e) {
          const f = frame()
          // Effects aim at the hulls' middles: hers is her centre already,
          // theirs is a little above the waterline they are anchored on.
          const me = { x: f.player.x, y: f.player.y }
          const them = { x: f.enemy.x, y: f.enemy.y - f.enemy.hull * 0.22 }
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
      let gone = 0 // how far under she is, once she is dead
      app.ticker.add(() => {
        const dt = Math.min(0.05, app.ticker.deltaMS / 1000)
        t += dt

        const W = app.screen.width, H = app.screen.height
        const th2 = themeRef.current
        const sc = sceneRef.current
        const art = artRef.current

        // A new enemy at a new depth is a new bitmap. The chart swaps marks;
        // the arena swaps textures, and a stale load can never land because
        // the loader checks the url it was asked for is still the one wanted.
        if (art.enemyUrl !== enemy.url) load(enemy, art.enemyUrl)
        if (art.shipUrl !== player.url) load(player, art.shipUrl)

        // ── THE FALL ────────────────────────────────────────────────
        // Pushed to 1 when the depth changes and decayed here. While it is up
        // the rise tears past and the hulls settle back down, which is what
        // turns a cut between fights into a drop into the next one.
        if (fallRef.current > 0) fallRef.current = Math.max(0, fallRef.current - dt * 0.85)
        const fall = fallRef.current

        scenery.set({
          variant: sc.variant, hardcore: sc.hardcore, boss: th2.boss, apex: sc.apex,
          deep: sc.deep, mood: sc.mood, key: th2.key,
          deepColor: parseInt(th2.sea[0].replace('#', ''), 16),
        })

        uRes[0] = W; uRes[1] = H
        const pc = palette(th2.sea[0], th2.sea[1], th2.sea[2])
        water?.set({
          uTime: t,
          uRes,
          uShallow: pc.shallow,
          uMid: pc.mid,
          uDeep: pc.deep,
          // The mood grades the water: a curse is a darker room.
          uDark: Math.min(0.95, th2.dark + scenery.grade()),
          uSwell: th2.swell,
          uRush: th2.rush,
        })
        water?.size(W, H)

        const f = frame()

        // THE HULLS, POSED. The bob is the arena's; everything else on these
        // two nodes came from the fight through `shipFx`.
        // The hulls ride the fall down and settle: a drop you can feel on the
        // ships themselves, not only in the water going past them.
        const drop = fall * fall * 120
        const bob = Math.sin(t * 1.7) * 3.4 + Math.sin(t * 2.6 + 1.1) * 2.1
        // THE FIGHT'S POSE DIES WITH THE FIGHT. `pose` is whatever the last
        // frame of combat pushed through `shipFx`, and nothing was clearing
        // it: a hull that ended the fight burning, frozen, listing or behind a
        // ward kept its condition ring and its list through the reward, the
        // breather and the next descent, on a screen where the ships are not
        // even meant to be. The pose belongs to the fight only.
        if (sc.mood !== 'fight') { pose.player = null; pose.enemy = null }
        const pf = pose.player, ef = pose.enemy
        // Sized only once the real bitmap is in: an empty texture is 1x1 and
        // would fix the aspect at a square before the art arrives.
        if (player.sp.texture.width > 2) {
          player.sp.width = f.player.box
          player.sp.height = f.player.box * (player.sp.texture.height / player.sp.texture.width)
        }
        if (art.shipFlip) player.sp.scale.x = -Math.abs(player.sp.scale.x)
        player.water?.fit(player.sp)
        // DEAD IN THE WATER. The run's own ending, the same settle-and-roll a
        // sunk hull gets, but slower, because it is yours.
        if (sc.mood === 'dead') gone = Math.min(1, gone + dt * 0.35)
        else if (gone > 0) gone = Math.max(0, gone - dt * 2)
        player.node.x = f.player.x + (pf?.x ?? 0)
        player.node.y = f.player.y + (pf?.y ?? 0) + bob - drop + gone * gone * 90
        player.node.rotation = ((pf?.rot ?? 0) * Math.PI) / 180 - gone * 0.35
        // ON THE WATER ONLY WHEN IT IS HERS TO BE ON: the fight, and the going
        // under. Every other screen is a log and a dock, and a hull parked in
        // the middle of one read as a picture of a ship, not a ship. The
        // descent is the sea swallowing a depth number; she is not in it.
        // Eased, so she does not blink out at the end of a fight.
        const showHull = sc.mood === 'fight' || sc.mood === 'dead'
        const wantHull = (showHull ? 1 : 0) * (1 - gone * 0.85)
        player.node.alpha += Math.max(-dt * 2.2, Math.min(dt * 1.6, wantHull - player.node.alpha))

        if (enemy.sp.texture.width > 2) {
          enemy.sp.width = f.enemy.box
          enemy.sp.height = f.enemy.box * (enemy.sp.texture.height / enemy.sp.texture.width)
        }
        enemy.water?.fit(enemy.sp)
        enemy.node.x = f.enemy.x + (ef?.x ?? 0)
        enemy.node.y = f.enemy.y + (ef?.y ?? 0) - bob * 0.6 - drop * 1.35
        enemy.node.rotation = ((ef?.rot ?? 0) * Math.PI) / 180
        // GOING DOWN. The fight says when; how it looks is the arena's, the
        // same settle-and-roll the chart gives a hull it has sunk.
        if (ef?.sink) {
          enemy.node.alpha = Math.max(0, enemy.node.alpha - dt * 0.8)
          enemy.node.y += dt * 26
          enemy.node.rotation -= dt * 0.22
        } else {
          // Eased both ways, so she does not blink out at the top of a descent
          // and does not blink in at the bottom of one.
          paintEnemy(art.enemyPaint)
          const want = hiddenRef.current || !art.enemyUrl ? 0 : 1
          enemy.node.alpha += Math.max(-dt * 2.2, Math.min(dt * 1.6, want - enemy.node.alpha))
        }

        // AND WHERE THEY ARE, for the fight to aim at. The box is the canvas's
        // own, so the numbers are in the same screen space the fight's overlays
        // are laid out in. Widths are the HULLS, not the boxes, exactly as the
        // chart reports them. `box` is the cached rect — see above.
        const A = anchors.current!
        A.player.x = box.left + player.node.x
        A.player.y = box.top + player.node.y
        A.player.w = f.player.hull
        A.enemy.x = box.left + enemy.node.x
        A.enemy.y = box.top + enemy.node.y
        A.enemy.w = f.enemy.hull
        // AND THE BOXES THE SPRITES ABOVE ARE ACTUALLY DRAWN AT, which is what
        // the fight's own hidden stand-ins have to match or every aura laid
        // over them sits somewhere the ship is not.
        A.player.box = f.player.box
        A.enemy.box = f.enemy.box

        // The wards and the conditions ride the same measurements, around the
        // hulls' middles.
        const ey = f.enemy.y - f.enemy.hull * 0.22
        /**
         * ── A WARD IS PLANTED ON THE WATER, SO IT IS GIVEN THE WATERLINE ──
         *
         * The ward draws a footprint at the point it is handed and stands its
         * dome up from there. The enemy's anchor IS her waterline (her sprite
         * hangs from its foot), but the player's is her sprite's CENTRE — so
         * her shield's footprint was cutting through the middle of her hull
         * and its dome stood a fifth of a ship above her rigging. It never
         * looked like a shell around a ship because it was a shell around a
         * point half way up one.
         *
         * Her keel sits about 0.28 of the sprite's height below its centre
         * (the same figure the chart's own captain uses), so that is where the
         * shell is planted. The enemy's ward takes her true waterline for the
         * same reason, rather than the lifted point her burning uses: fire is
         * on the hull, a shell is on the sea.
         */
        const playerWater = f.player.y + player.sp.height * 0.28
        spells.ward('player', f.player.x, playerWater, f.player.hull * 0.6, 0x5eead4, !!pf?.guard)
        spells.ward('enemy', f.enemy.x, f.enemy.y, f.enemy.hull * 0.6, 0xc084fc, !!ef?.guard)
        spells.status('player', f.player.x, f.player.y, f.player.hull * 0.6, pf?.status ?? 0)
        spells.status('enemy', f.enemy.x, ey, f.enemy.hull * 0.6, ef?.status ?? 0)

        weather.theme({ key: th2.key, pale: 0xcfe6f0 })
        weather.advance(dt, t, W, H, th2.heavy, th2.boss, fall)
        scenery.advance(dt, t, W, H, th2.heavy, fall)
        guns.advance(dt)
        spells.advance(dt)
      })

      cleanup = () => {
        handle.current = null
        ro.disconnect()
        window.removeEventListener('resize', remeasure)
        weather.destroy()
        scenery.destroy()
        guns.destroy()
        spells.destroy()
        // THE CONTEXT GOES WITH THE ROUTE. See the note at the top: this is
        // what makes a second Application safe at all.
        // THE FILTER COMES OFF FIRST. The water is a sprite wearing a shader,
        // and destroying the renderer with that shader still bound to its
        // textures is what Pixi's "destroyed while still bound" warnings were:
        // teardown-only noise, but noise that hides a real one. Unbind, then
        // destroy the filter, then the Application.
        if (water) {
          const fs = water.sprite.filters
          water.sprite.filters = []
          if (Array.isArray(fs)) for (const f of fs) f.destroy()
          water.sprite.destroy()
        }
        app.destroy(true, { children: true, texture: false })
      }
    })().catch(() => {
      // An arena that will not start must not take the run with it. The fight
      // still plays; it simply plays over nothing.
    })

    return () => { dead = true; cleanup?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * ── THE BOX IS OPAQUE BEFORE THE RENDERER EXISTS ──────────────────────────
   *
   * Mounting this thing is four awaits deep — the Pixi module, the Application,
   * the water's shader, the hull textures — and until the first of them lands
   * this is an EMPTY DIV. Behind it is the app's own /raids page image, so
   * starting a run flashed the practice-raid backdrop for as long as the boot
   * took, with the hulls fading in over it as their textures arrived.
   *
   * A background colour on the div costs nothing and cannot be late. It is the
   * theme's own deepest water stop, so the moment the shader does come up it
   * paints over a sea of the same colour and there is nothing to see.
   */
  return <div ref={holder} aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', background: theme.sea[0] }} />
}

/** Height is a screen measurement inside a squashed plane — kept here so the
 *  descent's camera work has the chart's own conversion to hand. */
export const ARENA_GROUND = GROUND
