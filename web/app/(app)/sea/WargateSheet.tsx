'use client'

// ── THE WARGATE'S LEDGER ────────────────────────────────────────────────────
//
// What the standing portal north of the sea gate shows when you step in: every
// boss on the water, in campaign order, as the same cards the expedition map
// deals — the drops, the records, all of it — with one difference of verb.
// Pressing the card does not enter the raid; it SAILS you there. The gate
// opens on that boss's own water and you arrive at their mooring.
//
// THE GATE KEEPS TROPHIES, IT DOES NOT TELL FORTUNES. A boss you have bested
// gets a card and a crossing. A boss you have MET but not beaten is named and
// shown — you have stood off their hull, there is nothing left to spoil — but
// the gate will not carry you to a fight you have not won: the voyage out is
// still yours to sail. And a boss the campaign has not reached is not here at
// all, not even as a silhouette.
//
// The data is bossCardState — the node map's own read, the same one the boss
// card over the water uses — so the gate cannot disagree with the map about
// what is cleared, what is next, and what a card shows.

import { createPortal } from 'react-dom'
import { getRaidConfigById } from '@/lib/raidRegistry'
import { ENCOUNTERS, BAY_BY_ID, type Encounter } from './raidWaters'
import { RAID_MAP, type RaidNodeView } from '@/lib/raidMap'

/** The sea's fights, in campaign order — the gate lists exactly what stands on
 *  the water, which is the set you can actually be carried to. */
function seaBosses(): Encounter[] {
  return [...ENCOUNTERS]
    .filter(e => RAID_MAP.find(n => n.id === e.node)?.type === 'raid')
    .sort((a, b) => RAID_MAP.findIndex(n => n.id === a.node) - RAID_MAP.findIndex(n => n.id === b.node))
}

export default function WargateSheet({ status, onSail, onClose }: {
  /**
   * EVERY CAMPAIGN NODE'S STATUS, from the chart (its `liveStatus`), so the
   * gate opens INSTANTLY (Kong, 2026-09-25: it took a long time to load, and
   * sometimes said "defeat bosses" at a captain who had). It used to read the
   * whole boss ledger from the server on open, and while that read was out
   * the list was empty, which the sheet took for "nothing bested". Since the
   * gate sails on one press it needs only who is bested, which the chart
   * already knows and keeps live as fights are won.
   */
  status: Record<string, string>
  /** THE CROSSING. Hands back the encounter whose mooring the gate opens on. */
  onSail: (enc: Encounter) => void
  onClose: () => void
}) {
  if (typeof document === 'undefined') return null

  const bosses = seaBosses()
  const viewOf = (id: string): RaidNodeView | null => {
    const node = RAID_MAP.find(n => n.id === id)
    const st = status[id]
    if (!node || !st) return null
    return { node, status: st as RaidNodeView['status'], claimable: false }
  }


  return createPortal(
    <div
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      style={{ position: 'fixed', inset: 0, zIndex: 118 }}>
      {/* The scrim is the close: the gate is a place you step out of. */}
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 30%, rgba(20,32,50,0.88) 0%, rgba(2,5,10,0.96) 70%)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
      }} />
      {/* ── THE SCROLLER, AND WHY IT COULD NOT SCROLL ──────────────────
          This carried `pointerEvents: 'none'` so that a tap on the empty water
          either side of the column reached the scrim behind it and closed the
          sheet. It also means the browser hands every wheel and every touch to
          whatever is underneath — so the one element with `overflowY: auto` on
          it never saw a single scroll gesture, and a gate with more bosses than
          fit the window simply stopped at the fold.

          The tap still closes. It closes the way PopupShell's does: only when
          the press landed on this element ITSELF rather than on the column
          inside it, which is the same thing "tap the empty space" means and
          does not cost the sheet its scroll. */}
      <div
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
        style={{
          position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          // The sheet sits over the nav, so there is nothing to clear but the
          // status bar: the title goes just under the safe area. Anything more
          // is a blank band that reads as a broken header.
          padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 14px 40px',
        }}>
        <div style={{ width: 'min(720px, 100%)' }}>
          {/* THE HEADER ROW. Title on the left, the close on the right. The
              scrim still closes too, but on a phone the column fills the
              width and there is no scrim to tap, which is how a sheet ends up
              with no way out. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            {/* The title and nothing else. The eyebrow and the blurb were
                chrome between you and the bosses. */}
            <h2 className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#f4efe4', lineHeight: 1.05, alignSelf: 'center' }}>The Wargate</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="tap"
              style={{
                width: 34, height: 34, borderRadius: '50%', padding: 0, flexShrink: 0,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)',
                color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>

          {/* ART FORWARD, like the campaign's Bosses tab: a portrait tile with
              the name over a bottom scrim and a check when bested, two to a
              row, grouped by chapter. The old list was a thumbnail in a box
              beside three lines of type, which is a table row with a picture
              in it, not a door. */}
          {(() => {
            const shown = bosses
              .map(e => ({ e, v: viewOf(e.node) }))
              // NOT REACHED, NOT SHOWN. The list ends where the campaign does,
              // which is the whole of the no-spoilers rule.
              .filter((x): x is { e: Encounter; v: RaidNodeView } => !!x.v && x.v.status !== 'locked')
            const chapters: { bay: (typeof BAY_BY_ID)[string]; items: typeof shown }[] = []
            for (const x of shown) {
              const bay = BAY_BY_ID[x.e.bay]
              const last = chapters[chapters.length - 1]
              if (last && last.bay.id === bay.id) last.items.push(x)
              else chapters.push({ bay, items: [x] })
            }
            // NOTHING PUT DOWN YET. The sheet used to open on an empty
            // column with a title over it, which reads as broken rather than
            // as early. It is a promise now: this is what the room is FOR.
            if (chapters.length === 0) {
              return (
                <p className="font-karla font-600" style={{
                  fontSize: '0.82rem', lineHeight: 1.6, color: 'rgba(214,232,240,0.62)',
                  textAlign: 'center', padding: '2.5rem 1rem',
                }}>
                  Defeat bosses to unlock portals to get back to them.
                </p>
              )
            }
            return chapters.map(({ bay, items }) => (
              <div key={bay.id} style={{ marginBottom: 18 }}>
                <p className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.22em', color: 'rgba(196,169,106,0.85)', paddingBottom: 6, marginBottom: 10, borderBottom: '1px solid rgba(196,169,106,0.18)' }}>
                  Chapter {['I', 'II', 'III', 'IV', 'V'][bay.chapter - 1] ?? bay.chapter} · {bay.name}
                </p>
                {/* ── AS MANY ACROSS AS FIT ─────────────────────────────
                    Two columns, always, in a 720px sheet made each portrait
                    355px wide and 390 tall, so a monitor showed four bosses
                    and a scroll. A chapter has at most four entries, and at
                    170px a card is still a face and a name, so on a wide sheet
                    every chapter is one row. The 45% floor keeps a phone at
                    two across, exactly as it was. A chapter with one boss
                    stays centred, capped so it is not a poster. */}
                <div style={{ display: 'grid', gridTemplateColumns: items.length === 1 ? 'minmax(0, min(72%, 240px))' : 'repeat(auto-fill, minmax(min(170px, 45%), 1fr))', justifyContent: 'center', gap: 10 }}>
                  {items.map(({ e, v }) => {
                    const cleared = v.status === 'cleared'
                    const art = v.node.image ?? null
                    const cfg = v.node.raidId ? getRaidConfigById(v.node.raidId) : undefined
                    const name = cfg?.enemies[cfg.bossId]?.name ?? v.node.label
                    const accent = cleared ? '#c4a96a' : '#4f4a42'
                    return (
                      <button key={e.node} type="button" className="tap"
                        // ONE PRESS TO GO (Kong, 2026-09-25). A bested boss's tile
                        // sails there; it used to open the boss card first, a
                        // second menu for a place you had already chosen.
                        onClick={() => { if (cleared) onSail(e) }}
                        aria-label={cleared ? `Sail to ${name}` : `${name}, not yet bested`}
                        style={{
                          position: 'relative', aspectRatio: '4 / 4.4', borderRadius: 16, overflow: 'hidden',
                          cursor: cleared ? 'pointer' : 'default', padding: 0,
                          border: `1px solid ${accent}${cleared ? '99' : '3a'}`,
                          background: cleared ? '#0c1119' : 'radial-gradient(circle at 50% 34%, #1a2636 0%, #0a0f16 72%)',
                          boxShadow: cleared ? '0 6px 18px rgba(0,0,0,0.42), 0 0 0 1px rgba(196,169,106,0.18)' : '0 6px 18px rgba(0,0,0,0.42)',
                        }}>
                        {art && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={art} alt="" loading="lazy" decoding="async"
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 16%',
                              filter: cleared ? 'grayscale(0.28) brightness(0.82)' : 'grayscale(0.85) brightness(0.45)' }} />
                        )}
                        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(6,10,16,0) 42%, rgba(6,10,16,0.92) 100%)' }} />
                        {cleared && (
                          <span title="Bested" aria-hidden style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: '50%', background: '#2dd4aa', display: 'grid', placeItems: 'center', boxShadow: '0 0 9px rgba(45,212,170,0.55)' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#06110c" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
                          </span>
                        )}
                        <div style={{ position: 'absolute', left: 10, right: 10, bottom: 9, textAlign: 'left' }}>
                          <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: cleared ? '#f4efe4' : '#b8bec8', lineHeight: 1.15, textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>{name}</p>
                          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.14em', marginTop: 3, color: cleared ? 'rgba(196,169,106,0.95)' : '#7d8794' }}>
                            {cleared ? 'Sail there →' : 'Not yet bested'}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          })()}

        </div>
      </div>

    </div>,
    document.body,
  )
}
