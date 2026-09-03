'use client'

// ── THE FIGHT, ON THE WATER IT IS HAPPENING ON ──────────────────────────────
//
// You sail up to a hull in a bay and the guns open where you are. No page load,
// no second sea, no coming back to a chart that has to rebuild itself — the
// same shape fishing has always had: the rod comes out, the camera pushes in,
// and the water you were sailing a second ago is still under you.
//
// ── WHY THIS DOES NOT NEED A SECOND CANVAS ──────────────────────────────────
//
// `components/DialFx` records that a raid was made its own ROUTE partly because
// the sea is unmounted while you fight, and a browser evicts the oldest WebGL
// context when it runs out. That constraint is about a Pixi FX layer, and the
// raid has never had one: RaidCombat is DOM and framer-motion from end to end.
// Overlaying it costs no context at all.
//
// AND THE RULE IT LEAVES BEHIND IS NARROWER THAN IT LOOKS. The danger was
// never "Pixi in a raid" — it was a SECOND WebGL context. A fight over the
// chart can draw all the Pixi it likes THROUGH THE SEA'S OWN RENDERER, because
// that is one context and it is already open; see seaGunFx, which puts the
// broadside on the water that way. What must never happen is a raid opening a
// canvas of its own while this mount exists, which is what took the chart down
// and what that note in DialFx is actually about.
//
// ── ONE FIGHT, TWO DOORS ────────────────────────────────────────────────────
//
// `RaidGame` is mounted unchanged and fed by the same `getRaidPlayerStats` the
// routes call. There is one implementation of the fight; this is a second way
// to reach it, exactly as the Shipyard has a sheet and a route.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import RaidGame from '@/app/(app)/raids/RaidGame'
import type { ShipAnchor, ShipFx, FightFx } from '@/app/(app)/raids/RaidCombat'
import { getRaidConfigById } from '@/lib/raidRegistry'
import { raidSheetState, type RaidSheetState } from './raidSheetActions'

export default function RaidSheet({ raidId, anchors, onShipFx, onFightFx, onClose }: {
  /** Which fight. Resolved to a config through the registry, so this cannot
   *  drift from the raid the node map opens. */
  raidId: string | null
  /** Live handle to where the chart's two hulls are on screen. The chart owns
   *  it and writes into it every frame; the fight reads it on its own. */
  anchors?: { current: { player: ShipAnchor; enemy: ShipAnchor } | null }
  /** What the fight is doing to those hulls, for the chart to draw. */
  onShipFx?: (fx: { player: ShipFx; enemy: ShipFx }) => void
  /** And what it is doing to the water between them. */
  onFightFx?: (e: FightFx) => void
  onClose: () => void
}) {
  const [state, setState] = useState<RaidSheetState | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // READ ON EVERY OPEN. Crew, gear, items and the repair debt all change
  // between fights, and a payload kept from the last one would arm you with a
  // loadout you have since taken apart.
  useEffect(() => {
    if (!raidId) { setState(null); return }
    let live = true
    setErr(null)
    setState(null)
    raidSheetState().then(r => {
      if (!live) return
      if ('error' in r) setErr(r.error)
      else setState(r)
    }, () => { if (live) setErr('The crew did not answer. Try again.') })
    return () => { live = false }
  }, [raidId])

  if (!raidId || typeof document === 'undefined') return null
  const config = getRaidConfigById(raidId)
  if (!config) return null

  return createPortal(
    <div
      // The chart steers on pointer events; a fight over it emphatically does
      // not want any of them reaching the helm.
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, zIndex: 113,
        // NO BACKDROP OF ITS OWN. That is the whole point: what is behind this
        // is the sea, still running, still the water you sailed here across.
        //
        // BARELY A WASH NOW. It used to carry the deck's legibility, and it had
        // to be heavy at the foot to do it — which put a dark band across the
        // bottom of the water. The deck has its own base now, so this is only a
        // slight settling of the whole scene: enough to say the guns are out,
        // not enough to be a lid.
        background: 'linear-gradient(180deg, rgba(4,8,14,0.08) 0%, rgba(4,8,14,0.14) 60%, rgba(3,5,10,0.26) 100%)',
        overflowY: 'auto', overscrollBehavior: 'contain',
      }}>
      {state ? (
        <RaidGame
          config={config}
          shipImageUrl={state.shipImageUrl}
          shipName={state.shipName}
          username={state.username}
          playerCharacterColor={state.characterColor}
          playerEquippedHat={state.equippedHat}
          playerAvatarBg={state.avatarBgColor}
          playerAvatarBorder={state.avatarBorderColor}
          playerHPMax={state.playerHPMax}
          shipMinDamage={state.shipMinDamage}
          shipSpeed={state.shipSpeed}
          totalPower={state.totalPower}
          totalDodge={state.totalDodge}
          totalFortune={state.totalFortune}
          crewCount={state.crewCount}
          crewMembers={state.crewMembers}
          equippedShipSkin={state.equippedShipSkin}
          shipSkins={state.shipSkins}
          equippedItems={state.equippedRaidItems}
          ownedRaidItems={state.ownedRaidItems}
          ownedSpecialItems={state.ownedSpecialItems}
          classDamageMult={state.classDamageMult}
          legendaryLootMult={state.legendaryLootMult}
          classDoubloonMult={state.classDoubloonMult}
          shipClasses={state.shipClasses}
          equippedRepairKit={state.equippedRepairKit}
          initialExpeditionXP={state.expeditionXP}
          // PAINT NOTHING OVER THE WATER. Without this the fight lays its own
          // bay-water gradient across the screen — the chart's own water, from
          // the same function, opaque and still. That is what made an overlay
          // read as a page.
          overSea
          anchors={anchors}
          onShipFx={onShipFx}
          onFightFx={onFightFx}
          raidMods={state.raidMods}
          bonusChargeSlots={state.bonusChargeSlots}
          manowarAugment={state.manowarAugment}
          onLeave={onClose}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <p className="font-karla font-600 uppercase tracking-[0.16em]"
            style={{ fontSize: '0.62rem', color: err ? '#f87171' : '#8fb8cf' }}>
            {err ?? 'Beat to quarters…'}
          </p>
        </div>
      )}
    </div>,
    document.body,
  )
}
