// ── EXPEDITION OPPORTUNITIES ─────────────────────────────────────────────────
// What is worth a captain's time on the Expeditions hub RIGHT NOW.
//
// This is the ongoing successor to Captain's Orders. Orders TEACH and then latch
// shut; this REMINDS, forever. The distinction is everything: a tips carousel talks
// AT you regardless of your state ("try the Gauntlet!") and every player learns to
// ignore it within a day. This only ever speaks when there is something concretely
// worth doing, it points at the single highest-value one, and it goes quiet when you
// are caught up. It is a to-do list the game keeps FOR you, not a lecture it reads.
//
// Pure and data-only so it can be unit-tested against real player states — the whole
// value is in the RANKING, and ranking is exactly the thing that rots silently.

export type OpportunityTone = 'urgent' | 'reward' | 'progress' | 'idle'
export type OpportunityAction =
  | { kind: 'modal'; modal: 'campaign' | 'voyages' | 'gauntlets' }
  | { kind: 'href'; href: string }
  | { kind: 'event'; event: string }

export interface Opportunity {
  id: string
  title: string
  detail: string
  cta: string
  tone: OpportunityTone
  action: OpportunityAction
}

export interface OpportunityState {
  repairOwed: number
  voyageStatus: 'idle' | 'sailing' | 'returned'
  /** Doubloons + gems waiting in a returned voyage, for the claim nudge. */
  voyageRewardDoubloons: number
  voyageRewardGems: number
  /** Can a voyage be sent at all — crew on the voyage track, or free to be put there. */
  canVoyage: boolean
  freeRecruitAvailable: boolean
  /** The campaign's next node, and whether it can be entered. */
  nextNodeName: string | null
  nextNodeIsFight: boolean
  nextNodeLocked: boolean
  raidCrewAboard: number
  /** Crew the captain owns, so a "crew your deck" nudge only fires when they can. */
  crewOwned: number
  /** An available, un-cleared Challenge raid, if any — harder replays of beaten
   *  bosses for better loot. Null when none is open. */
  challengeName: string | null
  /** Owned raid items not currently slotted, and whether a slot is free for them. */
  unequippedItems: number
  itemSlotsFree: number
  /** Gems, and whether a crew skin they do not own is affordable. */
  gems: number
  canAffordNewSkin: boolean
}

/**
 * Ranked, highest-value first. The order is the design:
 *
 *   1. REPAIR — a broken ship cannot fight, so it blocks the whole campaign.
 *   2. CLAIM A RETURNED VOYAGE — free money already earned, sitting there decaying in
 *      attention. Nothing else is more clearly worth a tap.
 *   3. FREE RECRUIT — free, resets daily, and crew is the bottleneck on everything.
 *   4. DAILY GAUNTLET — one run a day, easy to forget, pays real currency.
 *   5. THE NEXT FIGHT — progress the story, the spine of the mode.
 *   6. SEND AN IDLE VOYAGE — passive income sitting unused.
 *   7. EQUIP AN ITEM — power in the hold doing nothing.
 *   8. SPEND GEMS ON A SKIN — the soft, aspirational one, last.
 */
export function deriveOpportunities(s: OpportunityState): Opportunity[] {
  const out: Opportunity[] = []

  if (s.repairOwed > 0) {
    out.push({
      id: 'repair', tone: 'urgent',
      title: 'Your ship needs repairs',
      detail: `${s.repairOwed.toLocaleString()} ⟡ to fix her. You cannot fight broken.`,
      cta: 'Repair the ship', action: { kind: 'modal', modal: 'campaign' },
    })
  }

  if (s.voyageStatus === 'returned') {
    const bits = [
      s.voyageRewardDoubloons > 0 ? `${s.voyageRewardDoubloons.toLocaleString()} ⟡` : null,
      s.voyageRewardGems > 0 ? `${s.voyageRewardGems} ◆` : null,
    ].filter(Boolean).join(' and ')
    out.push({
      id: 'claim_voyage', tone: 'reward',
      title: 'Your voyage is back',
      detail: bits ? `${bits} to claim.` : 'Your crew are home. Claim the haul.',
      cta: 'Claim the haul', action: { kind: 'modal', modal: 'voyages' },
    })
  }

  if (s.freeRecruitAvailable) {
    out.push({
      id: 'free_recruit', tone: 'reward',
      title: 'A free recruit is waiting',
      detail: 'Your daily free crew is at the Crew Hall.',
      cta: 'Recruit for free', action: { kind: 'href', href: '/crew' },
    })
  }


  // A fight is waiting. Either the deck is crewed (advance) or it is empty (crew up).
  // These are mutually exclusive, so exactly one fires, and the strip can never say
  // "nothing pending" while a fight is sitting there with an empty deck.
  const fightWaiting = s.nextNodeName && s.nextNodeIsFight && !s.nextNodeLocked
  if (fightWaiting && s.raidCrewAboard === 0 && s.crewOwned > 0) {
    out.push({
      id: 'crew_deck', tone: 'urgent',
      title: 'Your raid deck is empty',
      detail: `${s.nextNodeName} is next and you are sailing alone.`,
      cta: 'Crew the deck', action: { kind: 'href', href: '/crew?tab=roster&filter=raid' },
    })
  } else if (fightWaiting && s.raidCrewAboard > 0) {
    out.push({
      id: 'next_fight', tone: 'progress',
      title: `Next: ${s.nextNodeName}`,
      detail: 'Your deck is crewed and the battle is ready.',
      cta: 'To the fight', action: { kind: 'modal', modal: 'campaign' },
    })
  }

  // A Challenge is a harder rerun of a boss you have already beaten, for better loot.
  // Only surfaced when your deck is crewed — being sent at a hard fight with an empty
  // ship would be a trap, and the empty-deck nudge above already owns that case.
  if (s.challengeName && s.raidCrewAboard > 0) {
    out.push({
      id: 'challenge', tone: 'progress',
      title: 'A Challenge is open',
      detail: `${s.challengeName} can be fought again, harder, for better loot.`,
      cta: 'Take the Challenge', action: { kind: 'modal', modal: 'campaign' },
    })
  }

  if (s.voyageStatus === 'idle' && s.canVoyage) {
    out.push({
      id: 'send_voyage', tone: 'idle',
      title: 'A voyage could be earning',
      detail: 'Send spare crew for doubloons and Nav XP while you play.',
      cta: 'Send a voyage', action: { kind: 'modal', modal: 'voyages' },
    })
  }

  if (s.unequippedItems > 0 && s.itemSlotsFree > 0) {
    out.push({
      id: 'equip_item', tone: 'idle',
      title: `${s.unequippedItems} raid item${s.unequippedItems === 1 ? '' : 's'} sitting in your hold`,
      detail: 'Half your power in a fight, and unslotted they do nothing.',
      cta: 'Open your loadout', action: { kind: 'event', event: 'expedition:open-loadout' },
    })
  }

  if (s.canAffordNewSkin) {
    out.push({
      id: 'buy_skin', tone: 'idle',
      title: 'A crew skin is within reach',
      detail: `${s.gems.toLocaleString()} gems, enough for a legendary crew skin.`,
      cta: 'Visit the Crew Hall', action: { kind: 'href', href: '/crew' },
    })
  }

  return out
}

/** The single most valuable thing right now, or null when a captain is all caught up. */
export function topOpportunity(s: OpportunityState): Opportunity | null {
  return deriveOpportunities(s)[0] ?? null
}
