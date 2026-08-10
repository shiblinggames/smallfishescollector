import { borrowedJawRaidEffects } from './finnItems'
export type RaidEffectType =
  | 'boss_damage_mult'      // value = damage multiplier on boss rounds
  | 'lethal_save'           // value = uses per raid run (raids only, not skirmishes)
  | 'speed_roll_nav_pct'    // value = fraction of Navigation added to the turn-order roll
  | 'incoming_damage_mult'  // value = multiplier on incoming enemy damage (e.g. 0.85 = -15%)
  | 'crit_damage_mult'      // value = multiplier on crit shots only (e.g. 1.15 = +15%)
  | 'noncrit_damage_mult'   // value = multiplier on hit + graze shots (e.g. 0.85 = -15%)
  | 'max_hp_mult'           // value = multiplier on player's max HP at raid start (e.g. 1.15 = +15%)
  | 'parry_chance'          // value = 0-1 chance, on a SUCCESSFUL dodge, to reflect a slice of the dodged shot
  | 'parry_reflect_pct'     // value = 0-1 fraction of the dodged shot's damage roll reflected back when parry triggers
  | 'burn_chance'           // value = 0-1 chance, each player hit, to set the enemy ablaze (DoT, see RaidCombat BURN_*)
  | 'freeze_chance'         // value = 0-1 chance, each player hit, to freeze the enemy (it loses a turn)
  | 'start_charge_chance'   // value = 0-1 chance to open each raid fight with 1 cannonball already loaded (the player-side "First Cut")
  | 'nonboss_damage_mult'   // value = damage multiplier vs NON-boss enemies (mobs / elites). Mirror of boss_damage_mult.
  | 'ramp_damage_per_turn'  // value = extra damage fraction PER TURN elapsed this fight (resets each enemy). turn 1 = +0, turn 2 = +value, …
  | 'dodge_pierce_chance'   // value = 0-1 chance, when the ENEMY would dodge your shot, to land it anyway ("see through the feint"). Only fires vs a would-be dodge, so naturally infrequent.
  | 'crit_upgrade_chance'   // value = 0-1 chance for a normal HIT to upgrade to a CRITICAL. Stacks with the Keen Cutlass crew effect + any tide crit bonus.
  | 'crit_strip_charge'     // value = 0-1 chance, on a player CRITICAL hit, to tear one loaded cannonball off the ENEMY's magazine. Mirror of the Raid-8 sharks' bite. The enemy's pickEnemyAction degrades gracefully (a shot it can no longer afford becomes a reload + re-attempt), so stripping just delays its fire/volley/ULTIMATE — never soft-locks it.
  | 'reload_charge_chance'  // value = 0-1 chance, on each RELOAD, to load a SECOND cannonball (catch the wind). Folds on top of any tide reload proc.
  | 'lifesteal_pct'         // value = 0-1 fraction of the damage you deal that heals your hull (Davy's Blood Cannon). Stacks additively with the Leviathan's Hunger boon's lifesteal.
  // ── THE RACK — one roll, several rounds ───────────────────────────────────
  // A chain-shot RACK holds different rounds, so a proc fires a SPREAD: a single
  // roll lands every status the rack carries, rather than rolling each separately.
  // The chance sits on each effect's `value` (the racks set them all the same, and
  // combat takes the max as the one trigger); the magnitudes and durations are
  // tuned in RaidCombat beside the other proc payloads.
  | 'weaken_on_hit'         // value = 0-1 chance to WEAKEN the enemy (it deals less damage)
  | 'corrode_on_hit'        // value = 0-1 chance to CORRODE it (its BARRIER takes amplified damage). The Ch4 answer to the Ch4 wall.
  | 'feeble_on_hit'         // value = 0-1 chance to make it FEEBLE (it takes more damage). Legendary rack only.
  // ── Don's Gauntlet chase — mechanics the roster never had ─────────────────
  | 'first_shot_mult'       // value = damage multiplier applied ONLY to the FIRST shot you fire each fight (Opening Statement). Nothing else rewards the opener. Multiplies onto the normal shot math.
  | 'max_hit_pct'           // value = 0-1 cap: a single incoming hit exceeding this fraction of your MAX HP CAN be knocked down to it (Made Man). A per-hit ceiling, not a flat reduction. Paired with max_hit_chance for the proc odds; multiple caps take the LOWEST (tightest).
  | 'max_hit_chance'        // value = 0-1 chance the max_hit_pct cap actually triggers on a hit that exceeds it. Absent = always (1). Made Man rolls this so a big blow only SOMETIMES gets capped.
  // ── Per-action damage lanes (The Primeval Maw) ────────────────────────────
  // Boons already split damage by action (tide.fireDmgMult / volleyDmgMult /
  // megaDmgMult); these are the ITEM-side mirror, so a lane bonus lands on that
  // action and leaks onto neither of the others.
  | 'fire_damage_mult'      // value = multiplier on a single FIRE shot only
  | 'volley_damage_mult'    // value = multiplier on VOLLEYS only
  | 'mega_damage_mult'      // value = multiplier on the MEGA (the player's ultimate) only
  | 'extra_start_charge_chance' // value = 0-1 chance for ONE MORE opening cannonball, rolled SEPARATELY from start_charge_chance and ADDED to it. Spet's primers are a tier family and take the best-of among themselves; this deliberately sits outside that so it stacks on top of them instead of being swallowed by the max.
  | 'crit_charge_refund_chance' // value = 0-1 chance, on a CRITICAL shot, that the shot costs NOTHING. Applies to fire, volley and mega alike, so it refunds whatever that action was about to spend.
  // ── THE WARD (Don's Palisade) ─────────────────────────────────────────────
  // A player BARRIER, which no item has ever granted. Every defensive item to
  // date either scales a percentage (incoming_damage_mult), raises the pool
  // (max_hp_mult) or caps one blow (max_hit_pct); a flat absorb that refills is
  // the inverse of all three, strongest against a stream of small hits and
  // weakest against a single enormous one. Stormward proves the fantasy but is
  // a Gauntlet BOON, so it does not exist in raids at all.
  //
  // It soaks from the same pool every other shield uses, so it shows in the one
  // combined shield chip on the HP bar rather than inventing a second bar.
  | 'ward_pct'              // value = 0-1 fraction of your MAX HP held as a barrier that soaks damage before the hull. Sources SUM.
  | 'ward_refill_pct'       // value = 0-1 fraction of the ward's capacity braced back on each RELOAD, never past the pool's opening size. Sources take the BEST.
  | 'afflicted_damage_mult' // value = damage multiplier vs an enemy that ALREADY carries any status/affliction (burning, frozen, weakened, corroded, feeble, slowed, marked…) at the moment you hit (The Shakedown). The proc that FIRST applies a status lands after this hit, so the bonus kicks in from the next hit on. Rewards a status/elemental build.
  // ── THE ABYSSAL TWISTS ────────────────────────────────────────────────────
  // One per Abyssal fusion, and found ONLY on the fusion. Everything else a
  // tier-3 carries is inherited from its two parents, which left most of them
  // reading as four base items in a trenchcoat rather than as a thing in their
  // own right. Each of these is a CONDITIONAL neither parent can produce alone —
  // the two halves finally talking to each other, the way a Gauntlet synergy
  // does. Deliberately small: an Abyssal's power still comes from slot
  // efficiency, not from these.
  | 'avenge_elite_mult'     // value = damage multiplier vs ELITE hulls, live only AFTER a killing blow has been cheated this fight (an item lethal save OR Laz's vengeance ward). Its own factor in the damage chain, so it stacks on top of Laz's rage buff when both fire.
  | 'pierce_crit'           // value = 1 (flag). A shot that lands through a would-be dodge (see dodge_pierce_chance) arrives as a CRITICAL rather than a plain hit. Dead weight without dodge_pierce_chance beside it.
  | 'crit_spread_chance'    // value = 0-1 chance, on a landed CRITICAL, to fire the rack's full spread even when the rack's own roll missed. Dead weight without weaken/corrode/feeble_on_hit beside it.
  | 'crit_ramp_turns'       // value = extra turns of ramp_damage_per_turn awarded by each landed CRITICAL this fight. Rides the same DAMAGE_RAMP_CAP, so it reaches the existing ceiling sooner rather than lifting it.
  | 'ambush_each_phase'     // value = 1 (flag). Re-arms first_shot_mult on every boss PHASE change, so each phase gets its own opening shot. Does nothing against an enemy without phases. Dead weight without first_shot_mult beside it.
  | 'charge_on_hit_chance'  // value = 0-1 chance, each time an enemy hit gets through to your hull, to load a cannonball. Being hit feeds the guns.
  | 'ward_refill_on_save'   // value = 1 (flag). When a killing blow is cheated, the shield pool is restored to its opening size. Dead weight without ward_pct beside it.
  | 'first_blow_parry_chance' // value = 0-1 chance that the FIRST enemy attack of each fight is turned aside outright: no damage, and parry_reflect_pct of it thrown back. Ordinary parry_chance only fires on a dodge you already won; this one needs no dodge at all.

export interface RaidEffect {
  type: RaidEffectType
  value: number
}

export interface RaidItemDef {
  id: string
  name: string
  description: string
  image: string | null
  emoji: string
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'ancient'
  effects: RaidEffect[]
  /** THE SUNKEN HAND. Fits ONLY the extra mount that opens by beating Finn,
   *  and that mount accepts nothing else, so it never competes for a normal
   *  slot and cannot be worn without the unlock. */
  finaleSlotOnly?: boolean
  /** Activatable items — a NET-NEW mechanic vs the passive `effects` above.
   *  Surfaced as a card in the Special ▸ action menu; usable ONCE per raid run
   *  and does NOT cost a turn. `refresh_ability` restores a random SPENT crew
   *  ability with the given `chance` (1 = guaranteed). An activatable item can
   *  still carry passive `effects` too (here they carry none). */
  activated?: {
    kind: 'refresh_ability'
    chance: number
  }
  source: string
  /** Tier family. Items sharing a `family` are higher/lower grades of the same
   *  drop and DO NOT stack — the better one supersedes the other. Equip enforces
   *  one-per-family so a player can never run both tiers (and assume they add up).
   *  Omitted = unique item, always stacks freely. */
  family?: string
}

export const RAID_ITEMS: RaidItemDef[] = [
  // Two tiers of the same chase item. The normal raid drops the
  // weaker version (more common), the challenge raid drops both at
  // higher rates with the legendary Prime variant as the chase.
  {
    id: 'corsair_cannon',
    name: 'Corsair Cannon',
    description: '+10% damage to raid bosses.',
    image: '/corsaircannon-v2.png',
    emoji: '💣',
    rarity: 'epic',
    effects: [{ type: 'boss_damage_mult', value: 1.10 }],
    source: "Barnacle Pete's Raid",
    family: 'corsair',
  },
  {
    id: 'corsair_prime_cannon',
    name: "Corsair's Prime Cannon",
    description: '+20% damage to raid bosses. The captain-grade version of the Corsair Cannon.',
    image: '/corsairsprimecannon.png',
    emoji: '💣',
    rarity: 'legendary',
    effects: [{ type: 'boss_damage_mult', value: 1.20 }],
    source: "Barnacle Pete's Raid",
    family: 'corsair',
  },
  {
    id: 'quartermasters_anchor',
    name: "Quartermaster's Anchor",
    description: 'Once per raid, a killing blow leaves you at 1 HP instead of sinking. Raids only, never skirmishes.',
    image: '/quartermastersanchor.png',
    emoji: '⚓',
    rarity: 'epic',
    effects: [{ type: 'lethal_save', value: 1 }],
    source: "Quartermaster's Cache",
  },
  {
    id: 'navigators_compass',
    name: "Navigator's Compass",
    // Reads as "a fifth" now after the 0.25 → 0.20 nerf (2026-05-29).
    // Combined with the d20 → d30 speed roll, the build still earns
    // first strike a clear majority of the time but late-game
    // determinism is meaningfully flatter than before.
    description: 'Adds 20% of your Savvy to your turn-order roll, so you strike first more often.',
    image: '/navigatorscompass.png',
    emoji: '🧭',
    rarity: 'epic',
    effects: [{ type: 'speed_roll_nav_pct', value: 0.20 }],
    source: "Quartermaster's Cache",
  },
  // Same two-tier treatment as the Corsair Cannon. Krust's Carapace
  // is the standard plate; Captain's Carapace is the full-grade
  // version of his own armor, dropped only at the higher rate from
  // his Consignment (with Prime rates in challenge mode).
  {
    id: 'krusts_carapace',
    name: "Krust's Carapace",
    description: 'Cuts incoming enemy fire by 10%.',
    image: '/captainshull.png',
    emoji: '🛡️',
    rarity: 'epic',
    effects: [{ type: 'incoming_damage_mult', value: 0.90 }],
    source: "Krust's Consignment",
    family: 'carapace',
  },
  {
    id: 'captains_carapace',
    name: "Captain's Carapace",
    description: "Cuts incoming enemy fire by 15%. The plated hide Krust himself hid behind for years.",
    image: '/captainscarapace.png',
    emoji: '🛡️',
    rarity: 'legendary',
    effects: [{ type: 'incoming_damage_mult', value: 0.85 }],
    source: "Krust's Consignment",
    family: 'carapace',
  },
  {
    id: 'gunners_sight',
    name: "Gunner's Sight",
    description: '+15% damage on critical hits, but non-critical shots hit for 15% less. A trade for the steady-handed.',
    image: '/gunnerssight.png',
    emoji: '🎯',
    rarity: 'epic',
    effects: [
      { type: 'crit_damage_mult',    value: 1.15 },
      { type: 'noncrit_damage_mult', value: 0.85 },
    ],
    source: 'Driftwood Cache',
  },
  {
    id: 'reinforced_hull',
    name: 'Reinforced Hull',
    description: '+15% max HP at the start of every raid. Heavier strakes, slower to sink.',
    image: '/reinforcedhull.png',
    emoji: '🛠️',
    rarity: 'epic',
    effects: [{ type: 'max_hp_mult', value: 1.15 }],
    source: 'Driftwood Cache',
  },
  // The Cartographer's signature drop — same two-tier shape as the
  // Corsair Cannon + Krust's Carapace pairs. Cartographer's Astrolabe
  // is the standard, dropped from his normal raid. Mastercraft Astrolabe
  // is the master-grade version at higher numbers, dropped only at
  // the chase rate (and bumped by the challenge variant). Both grant
  // a player-side mirror of the boss's Riposte: on a successful dodge,
  // a chance to reflect a slice of the would-be hit back at him.
  // The Sunken Cache pair (Gullet, Chapter II). Two themed cannonballs, each a
  // 15% on-hit status proc. Burn = damage-over-time scaled to the hit; Freeze =
  // skip the enemy's turn. Effects resolved in RaidCombat (BURN_* consts +
  // burn_chance/freeze_chance handling).
  {
    id: 'incendiary_cannonball',
    name: 'Incendiary Cannonball',
    description: 'Each hit has a 15% chance to set the enemy ablaze, burning them for 2 turns (damage scaled to the hit that lit them).',
    image: '/incendiarycannonball.png',
    emoji: '🔥',
    rarity: 'epic',
    effects: [{ type: 'burn_chance', value: 0.15 }],
    source: 'The Sunken Cache',
  },
  {
    id: 'frozen_cannonball',
    name: 'Frozen Cannonball',
    description: 'Each hit has a 15% chance to freeze the enemy solid, making them lose their next turn.',
    image: '/frozencannonball.png',
    emoji: '❄️',
    rarity: 'epic',
    effects: [{ type: 'freeze_chance', value: 0.15 }],
    source: 'The Sunken Cache',
  },
  // Tollmaster Spet's signature drop (The Tollmaster's Cut, Chapter II). The
  // player-side mirror of his crew's "First Cut" trait: start every raid fight
  // with cannonballs already chambered, so YOU take the first shot. Two-tier
  // like the other boss drops (epic standard + legendary "prime" from challenge).
  {
    id: 'spets_primer',
    name: "Spet's Primer",
    description: '50% chance to start each raid fight with a cannonball already loaded, so you can fire on the opening bell.',
    image: '/spetsprimer.png',
    emoji: '🧨',
    rarity: 'epic',
    effects: [{ type: 'start_charge_chance', value: 0.5 }],
    source: "The Tollmaster's Cut",
    family: 'primer',
  },
  {
    id: 'tollmasters_primer',
    name: "Tollmaster's Primer",
    description: 'Always start each raid fight with a cannonball already loaded. The Tollmaster never waits to take his cut.',
    image: '/tollmastersprimer.png',
    emoji: '🧨',
    rarity: 'legendary',
    effects: [{ type: 'start_charge_chance', value: 1.0 }],
    source: "The Tollmaster's Cut",
    family: 'primer',
  },
  {
    id: 'cartographers_astrolabe',
    name: "Cartographer's Astrolabe",
    description: 'On a successful dodge, 30% chance to deflect 50% of the incoming shot back at the attacker.',
    image: '/cartographersastrolabe.png',
    emoji: '🧭',
    rarity: 'epic',
    effects: [
      { type: 'parry_chance',      value: 0.30 },
      { type: 'parry_reflect_pct', value: 0.50 },
    ],
    source: "The Cartographer's Survey",
    family: 'astrolabe',
  },
  {
    id: 'captains_astrolabe',
    name: 'Mastercraft Astrolabe',
    description: "On a successful dodge, 50% chance to deflect 75% of the incoming shot back at the attacker. The Cartographer's own brass instrument, machined to a finer tolerance than any other in his cabin.",
    image: '/mastercraftastrolabe.png',
    emoji: '🧭',
    rarity: 'legendary',
    effects: [
      { type: 'parry_chance',      value: 0.50 },
      { type: 'parry_reflect_pct', value: 0.75 },
    ],
    source: "The Cartographer's Survey",
    family: 'astrolabe',
  },
  {
    id: 'chain_shot',
    name: 'Chain-Shot Rack',
    description: "Landed hits have a 25% chance to fire a spread that tears both rigging and plating. WEAKENED: it deals 20% less damage. CORRODED: its barrier takes 30% more damage. Both for 2 rounds. Sal Brackwater's own answer, turned back on the Finndicate.",
    image: '/chainshotrack.png',
    emoji: '⛓️',
    rarity: 'epic',
    effects: [
      { type: 'weaken_on_hit',  value: 0.25 },
      { type: 'corrode_on_hit', value: 0.25 },
    ],
    source: 'The Blockade: Sal Brackwater',
    family: 'chainshot',
  },
  {
    // The legendary rack: SAL'S OWN, hauled off the wreck. Named for him the way
    // Krust's Carapace becomes the Captain's and Spet's Primer becomes the
    // Tollmaster's — the tier-up is the boss's personal version of the thing he used
    // on you. (It was briefly the "Langrage Rack", after the real naval term for scrap
    // iron fired to shred rigging. Correct, and completely illegible. "Grapeshot" was
    // out too: that name already belongs to a Gauntlet boon.)
    // Same family as the Chain-Shot Rack, so the two can never be run together.
    id: 'brackwater_rack',
    name: 'Brackwater Rack',
    description: "Landed hits have a 35% chance to fire a spread of scrap iron. WEAKENED: it deals 20% less damage. CORRODED: its barrier takes 30% more damage. FEEBLE: it takes 20% more damage. All three, for 2 rounds. Sal's own rack, hauled off his wreck and turned around.",
    image: '/brackwaterrack.png',
    emoji: '⛓️',
    rarity: 'legendary',
    effects: [
      { type: 'weaken_on_hit',  value: 0.35 },
      { type: 'corrode_on_hit', value: 0.35 },
      { type: 'feeble_on_hit',  value: 0.35 },
    ],
    source: 'The Blockade: Sal Brackwater',
    family: 'chainshot',
  },
  {
    // Raid-8 signature EPIC: the players' answer to the sharks' bite, turned
    // back on the court. A crit tears a loaded cannonball off the enemy — enough
    // to knock an Ultimate off full or downgrade a volley. Shares the 'court_bite'
    // family with the Signet so the two never stack (the Signet supersedes).
    id: 'court_fang',
    name: "The Court's Fang",
    description: 'A tooth pried from one of the don’s court. On a CRITICAL hit, 20% chance to tear a loaded cannonball clean off the enemy’s rack, delaying its next shot.',
    image: '/thecourtsfang.png',
    emoji: '🦈',
    rarity: 'epic',
    effects: [
      { type: 'crit_strip_charge', value: 0.2 },
    ],
    source: 'The Throne: Don Finleone',
    family: 'court_bite',
  },
  {
    id: 'dons_signet',
    name: "The Don's Signet",
    description: 'The ring every captain in the Finndicate answered to, and every gun in his court. On a CRITICAL hit, the command turns against them: 50% chance to tear a loaded cannonball off the enemy’s rack, delaying its next shot.',
    image: '/thedonssignet.png',
    emoji: '💍',
    rarity: 'legendary',
    effects: [
      { type: 'crit_strip_charge', value: 0.5 },
    ],
    source: 'The Throne: Don Finleone',
    family: 'court_bite',
  },
  // ── Davy Jones Gauntlet chest cannons ──────────────────────────────────────
  // Two rare chest-only drops + the forged combination. Odds climb up the
  // chest ladder (see lib/gauntlet chestCannonDropChance). Collect BOTH and the
  // forge (in the Manage Ship loadout drawer) sacrifices them for the Grand
  // Cannon — recipe in DAVY_FORGE below. Art is a cannon placeholder for now.
  // ── THE SUNKEN HAND (Finn) ────────────────────────────────────────────────
  // What he drained, given back as gear. His two real drops split across the
  // two halves of the game: the Maw below mounts on your hull, and its opposite
  // number (The Primeval Eye) is a FISHING special and lives in specialItems.
  {
    // THE SUNKEN HAND. Fits ONLY the extra mount that opens by beating Finn,
    // and that mount takes nothing else. It never competes for a normal slot.
    finaleSlotOnly: true,
    id: 'borrowed_jaw',
    name: 'The Primeval Maw',
    // Does NOT name him. This description is reachable BEFORE the reveal: the
    // finale node previews while locked, its sheet opens, and its drop rail
    // opens DropDetailModal, which renders this string. Naming him here told
    // the twist to anyone who tapped the item they were working toward.
    description: 'The oldest teeth in the sea, cut back out of what wore them and bolted to your hull. It gains a TIER for every stretch of Fishing XP you earn while it is mounted, and each tier keeps everything the tiers below it unlocked. Six in all.',
    image: '/primevilmaw.png',
    emoji: '🦈',
    rarity: 'ancient',
    // No flat effects: everything it does comes from its CHARGE level (see
    // lib/finnItems). Leaving a static bonus here would stack on top of the
    // milestone and quietly double-count it.
    effects: [],
    source: 'The Sunken Hand',
  },

  {
    id: 'davys_heavy_cannon',
    name: "Davy's Heavy Cannon",
    description: 'Your damage climbs +5% every turn of a fight (resets when the next enemy draws alongside). Long fights end ugly for them.',
    image: '/davysheavycannon.png',
    emoji: '💣',
    rarity: 'legendary',
    effects: [{ type: 'ramp_damage_per_turn', value: 0.05 }],
    source: 'The Davy Jones Gauntlet',
  },
  {
    id: 'davys_hand_cannon',
    name: "Davy's Hand Cannon",
    description: '+20% damage to non-boss enemies. Tears through a crew before the captain ever shows his colors.',
    image: '/davyshandcannon.png',
    emoji: '💥',
    rarity: 'legendary',
    effects: [{ type: 'nonboss_damage_mult', value: 1.20 }],
    source: 'The Davy Jones Gauntlet',
  },
  {
    id: 'davys_grand_cannon',
    name: "Davy's Grand Cannon",
    description: 'Both Davy cannons forged onto one mount: damage climbs +4% each turn of a fight AND +17% damage to non-boss enemies. Tuned down a hair to share a single carriage.',
    image: '/davysgrandcannon.png',
    emoji: '☠️',
    rarity: 'legendary',
    effects: [
      { type: 'ramp_damage_per_turn', value: 0.04 },
      { type: 'nonboss_damage_mult',  value: 1.17 },
    ],
    source: "Forged from Davy's Heavy + Hand Cannon",
  },
  {
    // First LIFESTEAL item in the game. Hardcore-Gauntlet-only chest chase; the
    // lifesteal stacks additively with the Leviathan's Hunger boon.
    id: 'davys_blood_cannon',
    name: "Davy's Blood Cannon",
    description: 'The gun drinks every wound it opens: you heal 8% of the damage you deal. The deep gives nothing back but what you take by force.',
    image: '/davysbloodcannon.png',
    emoji: '🩸',
    rarity: 'rare',
    effects: [{ type: 'lifesteal_pct', value: 0.08 }],
    source: 'Hardcore · The Davy Jones Gauntlet',
  },
  // ── Blood Cannon fusions — keep the 8% lifesteal, bolt on a damage lane.
  //    Damage side taxed ~15% for the saved slot (lifesteal stays full).
  {
    id: 'bloodletter',
    name: 'Bloodletter',
    description: 'The blood gun wed to the long ramp: you heal 8% of the damage you deal AND your damage climbs +4% every turn of a fight. Bleed them slow.',
    image: '/forge_bloodletter.png',
    emoji: '🩸',
    rarity: 'legendary',
    effects: [{ type: 'lifesteal_pct', value: 0.08 }, { type: 'ramp_damage_per_turn', value: 0.04 }],
    source: "Forged from Davy's Blood + Heavy Cannon",
  },
  {
    id: 'reavers_cannon',
    name: "Reaver's Cannon",
    description: 'Heal 8% of the damage you deal and hit non-boss enemies for +17%. Reave through a crew and drink the whole time.',
    image: '/forge_reaverscannon.png',
    emoji: '🩸',
    rarity: 'legendary',
    effects: [{ type: 'lifesteal_pct', value: 0.08 }, { type: 'nonboss_damage_mult', value: 1.17 }],
    source: "Forged from Davy's Blood + Hand Cannon",
  },
  // ── Don's Gauntlet chase — its own two items, mechanics the roster never had.
  //    Art PENDING (emoji fallback for now, like the Abyssal tier-3 items). ──────
  {
    id: 'opening_statement',   // display: Vanguard Battery
    name: 'Vanguard Battery',
    description: 'Your FIRST shot of every fight lands for +30% damage, and every shot after is normal. The vanguard gun runs hot off the first pull, so lead with a loaded volley or Mega and open heavy.',
    image: '/vanguardbattery.png',
    emoji: '🎯',
    rarity: 'legendary',
    effects: [{ type: 'first_shot_mult', value: 1.3 }],
    source: "Don's Gauntlet",
  },
  {
    id: 'made_man',            // display: Dampener Plate
    name: 'Dampener Plate',
    description: 'When a single hit would take more than 25% of your max hull, there is a 50% chance the plating dampens it back down to 25%. It blunts the heaviest blows, but the slow bleed still gets through.',
    image: '/dampenerplate.png',
    emoji: '🕴️',
    rarity: 'legendary',
    effects: [{ type: 'max_hit_pct', value: 0.25 }, { type: 'max_hit_chance', value: 0.5 }],
    source: "Don's Gauntlet",
  },
  {
    id: 'the_shakedown',       // display: Carrion Sight
    name: 'Carrion Sight',
    description: 'You deal +25% damage to any enemy already suffering a status: burning, frozen, weakened, corroded, or any hex you laid on it. The glass finds the crack in a hull that is already breaking.',
    image: '/carrionsight.png',
    emoji: '💢',
    rarity: 'legendary',
    effects: [{ type: 'afflicted_damage_mult', value: 1.25 }],
    source: "Don's Gauntlet",
  },
  // ── Forge fusions (learned in The Forge, sacrificing both components) ────────
  // Offense fusions run at ~85% of each parent effect (they trade raw numbers for
  // the slot a single mount saves); defence/tempo fusions keep full strength.
  {
    id: 'siege_cannon',
    name: 'Siege Cannon',
    description: '+17% damage to bosses AND your damage climbs +4% every turn of a fight. Built for the long guns against a heavy hull.',
    image: '/forge_seigecannon.png',
    emoji: '🎆',
    rarity: 'legendary',
    effects: [
      { type: 'boss_damage_mult',     value: 1.17 },
      { type: 'ramp_damage_per_turn', value: 0.04 },
    ],
    source: "Forged from Corsair's Prime Cannon + Davy's Heavy Cannon",
  },
  {
    id: 'sharpshooters_cannon',
    name: "Sharpshooter's Cannon",
    description: '+17% damage to non-boss enemies AND +13% critical damage, but non-crit shots hit for 13% less. A crew-shredder for the steady-handed.',
    image: '/forge_sharpshooterscannon.png',
    emoji: '🎯',
    rarity: 'legendary',
    effects: [
      { type: 'nonboss_damage_mult', value: 1.17 },
      { type: 'crit_damage_mult',    value: 1.13 },
      { type: 'noncrit_damage_mult', value: 0.87 },
    ],
    source: "Forged from Davy's Hand Cannon + Gunner's Sight",
  },
  {
    id: 'warlords_cannon',
    name: "Warlord's Cannon",
    description: '+17% damage to bosses AND +13% critical damage, but non-crit shots hit for 13% less. The killing piece for a captain who lands his crits.',
    image: '/forge_warlordscannon.png',
    emoji: '⚔️',
    rarity: 'legendary',
    effects: [
      { type: 'boss_damage_mult',    value: 1.17 },
      { type: 'crit_damage_mult',    value: 1.13 },
      { type: 'noncrit_damage_mult', value: 0.87 },
    ],
    source: "Forged from Corsair's Prime Cannon + Gunner's Sight",
  },
  {
    id: 'ironclad_bulwark',
    name: 'Ironclad Bulwark',
    description: '+15% max HP AND cuts incoming enemy fire by 15%. Heavier strakes over the captain-grade plated hide.',
    image: '/forge_ironcladbulwark.png',
    emoji: '🛡️',
    rarity: 'legendary',
    effects: [
      { type: 'max_hp_mult',         value: 1.15 },
      { type: 'incoming_damage_mult', value: 0.85 },
    ],
    source: "Forged from Reinforced Hull + Captain's Carapace",
  },
  {
    id: 'last_bastion',
    name: 'Last Bastion',
    description: 'Once per raid, a killing blow leaves you at 1 HP instead of sinking, AND +15% max HP. The hull that refuses the deep.',
    image: '/forge_lastbastion.png',
    emoji: '⚓',
    rarity: 'legendary',
    effects: [
      { type: 'lethal_save', value: 1 },
      { type: 'max_hp_mult', value: 1.15 },
    ],
    source: "Forged from Quartermaster's Anchor + Reinforced Hull",
  },
  {
    id: 'deflector_plate',
    name: 'Deflector Plate',
    description: 'On a successful dodge, 50% chance to deflect 75% of the shot back at the attacker, AND cuts incoming enemy fire by 15%.',
    image: '/forge_deflectorplate.png',
    emoji: '🪞',
    rarity: 'legendary',
    effects: [
      { type: 'parry_chance',         value: 0.50 },
      { type: 'parry_reflect_pct',    value: 0.75 },
      { type: 'incoming_damage_mult', value: 0.85 },
    ],
    source: "Forged from Mastercraft Astrolabe + Captain's Carapace",
  },
  {
    id: 'vanguards_chronometer',
    name: "Vanguard's Chronometer",
    description: 'Adds 20% of your Savvy to your turn-order roll so you strike first more often, AND always opens each fight with a cannonball already loaded.',
    image: '/forge_vanguardchronometer.png',
    emoji: '🧭',
    rarity: 'legendary',
    effects: [
      { type: 'speed_roll_nav_pct',  value: 0.20 },
      { type: 'start_charge_chance', value: 1.00 },
    ],
    source: "Forged from Navigator's Compass + Tollmaster's Primer",
  },
  // ── Farmable-only fusions ───────────────────────────────────────────────────
  // Built entirely from REPEATABLE boss drops (never the campaign either/or
  // choice items), so every captain can forge these regardless of which cache
  // pick they made. Palette is limited to boss/non-boss/ramp/mitigation/parry/
  // start-loaded (crit, speed, +HP, lethal-save only come from choice items).
  {
    id: 'marauders_cannon',
    name: "Marauder's Cannon",
    description: '+17% damage to bosses AND +17% damage to non-boss enemies. One gun that tears through anything under your sights.',
    image: '/forge_marauderscannon.png',
    emoji: '🏴‍☠️',
    rarity: 'legendary',
    effects: [
      { type: 'boss_damage_mult',    value: 1.17 },
      { type: 'nonboss_damage_mult', value: 1.17 },
    ],
    source: "Forged from Corsair's Prime Cannon + Davy's Hand Cannon",
  },
  {
    id: 'dreadnought_cannon',
    name: 'Dreadnought Cannon',
    description: '+17% damage to bosses AND cuts incoming enemy fire by 15%. A heavy gun on a heavier hull, so trade blows with a captain and walk away.',
    image: '/forge_dreadnoughtcannon.png',
    emoji: '🛡️',
    rarity: 'legendary',
    effects: [
      { type: 'boss_damage_mult',     value: 1.17 },
      { type: 'incoming_damage_mult', value: 0.85 },
    ],
    source: "Forged from Corsair's Prime Cannon + Captain's Carapace",
  },
  {
    id: 'bastion_primer',
    name: 'Bastion Primer',
    description: 'Cuts incoming enemy fire by 15% AND always opens each fight with a cannonball already loaded. Weather the first blow, answer with your own.',
    image: '/forge_bastionprimer.png',
    emoji: '🧱',
    rarity: 'legendary',
    effects: [
      { type: 'incoming_damage_mult', value: 0.85 },
      { type: 'start_charge_chance',  value: 1.00 },
    ],
    source: "Forged from Captain's Carapace + Tollmaster's Primer",
  },
  {
    id: 'riposte_chronometer',
    name: "Riposte Chronometer",
    description: 'On a successful dodge, 50% chance to deflect 75% of the shot back at the attacker, AND always open each fight with a cannonball already loaded. Slip the blow and return it.',
    image: '/forge_riposte_chronometer.png',
    emoji: '🤺',
    rarity: 'legendary',
    effects: [
      { type: 'parry_chance',        value: 0.50 },
      { type: 'parry_reflect_pct',   value: 0.75 },
      { type: 'start_charge_chance', value: 1.00 },
    ],
    source: "Forged from Mastercraft Astrolabe + Tollmaster's Primer",
  },
  // ── Chapter III, Raid 5 — Admiral Ruse (the deception fleet) ────────────────
  // Anti-evasion "see through the feint": a CHANCE, when the enemy would dodge
  // your shot, to land it anyway. Only rolls on a would-be dodge (the fleet only
  // dodges on its dodge turns), so it stays a modest edge, never oppressive.
  {
    id: 'tell_tale_glass',
    name: 'Tell-Tale Glass',
    description: "When an enemy would dodge your shot, 20% chance to read the feint and land it anyway.",
    image: '/telltaleglass.png',
    emoji: '🔭',
    rarity: 'epic',
    effects: [{ type: 'dodge_pierce_chance', value: 0.20 }],
    source: "Admiral Ruse's Coffers",
    family: 'tell_tale',
  },
  {
    id: 'admirals_eye',
    name: "Admiral's Eye",
    description: "When an enemy would dodge your shot, 35% chance to read the feint and land it anyway.",
    image: '/admiralseye.png',
    emoji: '👁️',
    rarity: 'legendary',
    effects: [{ type: 'dodge_pierce_chance', value: 0.35 }],
    source: "Admiral Ruse's Coffers",
    family: 'tell_tale',
  },
  // ── Chapter III, Raid 6 — The Quartermaster (finale) ───────────────────────
  // ACTIVATABLE (the first of its kind): beat the drum to rally a spent crew
  // back to their station — restores a random USED crew ability. Once per raid,
  // free action, from the Special ▸ menu. Epic gambles on it; legendary is sure.
  {
    id: 'war_drum',
    name: 'War Drum',
    description: 'Once per raid: beat the drum for a 40% chance to restore a random spent crew ability. Fires from the Special menu and does not cost your turn.',
    image: '/wardrum.png',
    emoji: '🥁',
    rarity: 'epic',
    effects: [],
    activated: { kind: 'refresh_ability', chance: 0.40 },
    source: "The Quartermaster's Cache",
    family: 'war_drum',
  },
  {
    id: 'thunder_drum',
    name: 'Thunder Drum',
    description: 'Once per raid: beat the drum to restore a random spent crew ability, guaranteed. Fires from the Special menu and does not cost your turn.',
    image: '/thunderdrum.png',
    emoji: '🥁',
    rarity: 'legendary',
    effects: [],
    activated: { kind: 'refresh_ability', chance: 1.00 },
    source: "The Quartermaster's Cache",
    family: 'war_drum',
  },
  // ── Chapter III, the last Cache — masts vs sails (choose ONE) ───────────────
  // A rig upgrade split down "aim harder vs shoot more." Both from the final
  // Quartermaster's Cache choice node (before the betrayal).
  {
    id: 'crows_nest_rigging',
    name: "Crow's-Nest Rigging",
    description: "Each of your normal hits has a 15% chance to become a critical hit for much bigger damage.",
    image: '/crowsnestrigging.png',
    emoji: '🗼',
    rarity: 'epic',
    effects: [{ type: 'crit_upgrade_chance', value: 0.15 }],
    source: "The Quartermaster's Cache",
  },
  {
    id: 'trade_wind_sails',
    name: 'Trade-Wind Sails',
    description: 'Each time you reload, a 15% chance to load 2 cannonballs at once instead of 1.',
    image: '/tradewindsails.png',
    emoji: '⛵',
    rarity: 'epic',
    effects: [{ type: 'reload_charge_chance', value: 0.15 }],
    source: "The Quartermaster's Cache",
  },

  // ── THE ROADS NOT TAKEN ─────────────────────────────────────────────────────
  // Three fusions, one per either/or Cache (EXCLUSIVE_CHOICE_PAIRS below). Each
  // needs BOTH halves of a choice the campaign only ever let you make once, so
  // none of them was buildable at all until the Reclamation opened and started
  // selling back the road you didn't walk.
  //
  // Each fusion is designed to RESOLVE the tension of its choice rather than to
  // simply stack both sides: the Sight's non-crit penalty is what the Bulwark
  // pays off, and the whole point of the Emberfrost is that you no longer have to
  // pick which way the enemy suffers.
  {
    id: 'emberfrost_cannonball',
    name: 'Emberfrost Cannonball',
    image: '/forge_emberfrostcannonball.png',
    description: 'Each hit has an 18% chance to set the enemy ablaze for 2 turns, and an 18% chance to freeze them solid and cost them their next turn. Both can land on the same shot.',
    emoji: '🔥',
    rarity: 'legendary',
    effects: [
      { type: 'burn_chance',   value: 0.18 },
      { type: 'freeze_chance', value: 0.18 },
    ],
    source: 'Forged from the Incendiary + Frozen Cannonball',
  },
  {
    id: 'deadmans_bearing',
    name: "Deadman's Bearing",
    image: '/forge_deadmansbearing.png',
    description: 'Adds 25% of your Savvy to your turn-order roll, and once per raid a killing blow leaves you at 1 HP instead of sinking. Strike first, and refuse to go down.',
    emoji: '⚓',
    rarity: 'legendary',
    effects: [
      { type: 'speed_roll_nav_pct', value: 0.25 },
      { type: 'lethal_save',        value: 1 },
    ],
    source: "Forged from the Quartermaster's Anchor + Navigator's Compass",
  },
  {
    id: 'heavy_gunners_sight',
    name: "Heavy Gunner's Sight",
    image: '/forge_heavygunnerssight.png',
    description: '+18% critical damage and +12% max HP, and none of the Sight’s non-crit penalty. The same steady hands, behind heavier strakes.',
    emoji: '🎯',
    rarity: 'legendary',
    effects: [
      { type: 'crit_damage_mult', value: 1.18 },
      { type: 'max_hp_mult',      value: 1.12 },
    ],
    source: "Forged from the Gunner's Sight + Reinforced Hull",
  },

  // ══ TIER 3 — THE ABYSSAL FORGE ══════════════════════════════════════════════
  // Forged from two TIER-2 fusions, so each one carries what four base items
  // once did, in a single mount. They are deliberately tuned to roughly the SUM
  // of their two parents rather than an inflated multiple: the payoff is slot
  // efficiency (two items in one), not raw number growth. They STACK (no shared
  // family) — the limiter is the destructive forge chain behind each one.
  // Art pending: image null falls back to the emoji until the PNGs land.
  {
    id: 'leviathans_cannon',
    name: "Leviathan's Cannon",
    image: '/forge_leviathanscannon.png',
    description: '+30% damage to bosses, your damage climbs +4% every turn of a fight, every critical hit advances that climb by one more turn, and +13% critical damage at the cost of 10% off your non-crits. The siege gun and the warlord’s piece welded into one barrel.',
    emoji: '🐋',
    rarity: 'legendary',
    effects: [
      { type: 'boss_damage_mult',     value: 1.30 },
      { type: 'ramp_damage_per_turn', value: 0.04 },
      // THE TWIST. The Siege Cannon brought the ramp and the Warlord's brought the
      // crit bias, and on the fusion they sat in separate columns doing separate
      // jobs. Now a crit STOKES the siege: the ramp is normally on the clock alone,
      // so this is the only way to make it run ahead of the turn count.
      { type: 'crit_ramp_turns',      value: 1 },
      { type: 'crit_damage_mult',     value: 1.13 },
      { type: 'noncrit_damage_mult',  value: 0.90 },
    ],
    source: "Abyssal Forge: Siege Cannon + Warlord's Cannon",
  },
  {
    id: 'aegis_of_the_deep',
    name: 'Aegis of the Deep',
    image: '/forge_aegisofthedeep.png',
    description: '+15% max HP, cuts incoming enemy fire by 25%, on a successful dodge a 50% chance to deflect 75% of the shot back at the attacker, and a 35% chance the first blow of every fight is turned aside outright. Nothing the deep throws reaches the hull clean.',
    emoji: '🛡️',
    rarity: 'legendary',
    effects: [
      { type: 'max_hp_mult',          value: 1.15 },
      { type: 'incoming_damage_mult', value: 0.75 },
      { type: 'parry_chance',         value: 0.50 },
      { type: 'parry_reflect_pct',    value: 0.75 },
      // THE TWIST. The Deflector Plate's parry only ever fires on a dodge you
      // already won, which means the hull's own bulk (the Ironclad half) does
      // nothing to help it land. Bracing the OPENING blow needs no dodge at all,
      // so for one shot a fight the two halves are the same mechanic.
      { type: 'first_blow_parry_chance', value: 0.35 },
    ],
    source: 'Abyssal Forge: Ironclad Bulwark + Deflector Plate',
  },
  {
    id: 'drowned_crown',
    name: 'Drowned Crown',
    image: '/forge_drownedcrown.png',
    description: '+17% damage to bosses AND non-boss enemies, +15% max HP, and once per raid a killing blow leaves you at 1 HP instead of sinking. Cheat death that way and you deal a further +10% to elite hulls for the rest of the fight. The crown that will not be taken.',
    emoji: '👑',
    rarity: 'legendary',
    effects: [
      { type: 'boss_damage_mult',    value: 1.17 },
      { type: 'nonboss_damage_mult', value: 1.17 },
      { type: 'max_hp_mult',         value: 1.15 },
      { type: 'lethal_save',         value: 1 },
      // THE TWIST, and the one this fusion needed most: before it, the Crown added
      // literally nothing its two parents did not already give. Marauder's brought
      // the damage and Last Bastion brought the save, and they never once touched.
      // Now the save ARMS the damage. Elites only, so it stays a spike rather than
      // a flat buff, and it deliberately reads off ANY cheated death — including
      // Laz's vengeance ward, where it stacks on top of his rage rather than
      // replacing it.
      { type: 'avenge_elite_mult',   value: 1.10 },
    ],
    source: "Abyssal Forge: Marauder's Cannon + Last Bastion",
  },
  {
    id: 'tempest_chronometer',
    name: 'Tempest Chronometer',
    image: '/forge_tempestchronometer.png',
    description: 'Adds 20% of your Savvy to your turn-order roll, opens every fight with a cannonball loaded and a 50% chance of loading a second, and on a successful dodge a 50% chance to deflect 75% of the shot back. Strike first, and answer everything.',
    emoji: '🌀',
    rarity: 'legendary',
    effects: [
      { type: 'speed_roll_nav_pct',  value: 0.20 },
      { type: 'start_charge_chance', value: 1.00 },
      // THE SECOND BALL, and the whole reason to forge this. A COIN FLIP for
      // it rather than a guarantee: opening at 2 of a 3-round magazine every
      // single fight was too much certainty to hand out, and half the time is
      // plenty to make the fusion feel like it did something without making the
      // opening turn identical every fight.
      //
      // Both components already grant start_charge_chance 1, and the primers are
      // a tier family that takes best-of among themselves, so 1 and 1 folded to
      // 1. That left the fusion differing from a Riposte Chronometer by nothing
      // but the speed roll, while costing two legendaries destroyed, four base
      // drops, three forges and 250 Fathoms. Six of the eight Abyssals pay
      // something over the union of their parts; this was one of the two that
      // did not.
      //
      // extra_start_charge_chance is the right lever rather than a bigger number
      // somewhere: it is documented as sitting OUTSIDE the primer best-of family
      // precisely so it stacks on top of them, and two parts that each open
      // loaded fusing into one that opens with two is legible without reading a
      // stat line.
      //
      // The magazine is 3 and a volley costs 3, so even when it lands this
      // does NOT buy a turn-one volley. It buys about a turn of tempo, half the
      // time, which is modest beside Leviathan's permanent +30% boss damage.
      { type: 'extra_start_charge_chance', value: 0.50 },
      { type: 'parry_chance',        value: 0.50 },
      { type: 'parry_reflect_pct',   value: 0.75 },
    ],
    source: "Abyssal Forge: Vanguard's Chronometer + Riposte Chronometer",
  },
  // ── NEW forge results — Ch3/4 items + Don's Gauntlet items. Art PENDING
  //    (emoji fallback, like the first Abyssal batch). Tier-2 first, then tier-3.
  {
    id: 'carrion_rack',
    name: 'Carrion Rack',
    description: '30% chance each hit to Weaken, Corrode and make the enemy Feeble, and you deal +21% damage to anything already suffering a status. It opens the wound and twists it.',
    image: '/forge_carrionrack.png',
    emoji: '☠️',
    rarity: 'legendary',
    effects: [
      { type: 'weaken_on_hit',        value: 0.30 },
      { type: 'corrode_on_hit',       value: 0.30 },
      { type: 'feeble_on_hit',        value: 0.30 },
      { type: 'afflicted_damage_mult', value: 1.21 },
    ],
    source: 'Forged from Carrion Sight + Brackwater Rack',
  },
  {
    id: 'ambush_signet',
    name: 'Ambush Signet',
    description: 'Your first shot each fight lands +26% harder, and a critical hit has a 45% chance to tear a loaded cannonball off the enemy. Open loud, and disarm them while they reel.',
    image: '/forge_ambushsignet.png',
    emoji: '💍',
    rarity: 'legendary',
    effects: [
      { type: 'first_shot_mult',   value: 1.26 },
      { type: 'crit_strip_charge', value: 0.45 },
    ],
    source: "Forged from Vanguard Battery + The Don's Signet",
  },
  {
    id: 'bastion_drum',
    name: 'Bastion Drum',
    description: 'A single hit over 25% of your max hull has a 50% chance to be dampened back to it, and once per raid you can beat the drum to bring a spent crew ability back. Hold the line, then rally.',
    image: '/forge_bastiondrum.png',
    emoji: '🥁',
    rarity: 'legendary',
    effects: [
      { type: 'max_hit_pct',    value: 0.25 },
      { type: 'max_hit_chance', value: 0.5 },
    ],
    activated: { kind: 'refresh_ability', chance: 1.0 },
    source: 'Forged from Dampener Plate + Thunder Drum',
  },
  {
    id: 'hawkeye_glass',
    name: 'Hawkeye Glass',
    description: 'A 30% chance to see through a feint and land a shot the enemy would have dodged, and a 13% chance any clean hit sharpens into a crit. Nothing slips the glass.',
    image: '/forge_hawkeyeglass.png',
    emoji: '🦅',
    rarity: 'legendary',
    effects: [
      { type: 'dodge_pierce_chance', value: 0.30 },
      { type: 'crit_upgrade_chance', value: 0.13 },
    ],
    source: "Forged from Admiral's Eye + Crow's-Nest Rigging",
  },
  {
    id: 'predators_battery',
    name: "Predator's Battery",
    description: 'Your first shot each fight lands +26% harder, and you deal +21% damage to any enemy already suffering a status. Pick the wounded, and open on them hard.',
    image: '/forge_predatorsbattery.png',
    emoji: '🎯',
    rarity: 'legendary',
    effects: [
      { type: 'first_shot_mult',       value: 1.26 },
      { type: 'afflicted_damage_mult', value: 1.21 },
    ],
    source: 'Forged from Vanguard Battery + Carrion Sight',
  },
  {
    id: 'rally_rigging',
    name: 'Rally Rigging',
    description: 'Each reload has a 15% chance to catch the wind and load a second cannonball, and once per raid you can rally a spent crew ability back to the line. Never lose your tempo.',
    image: '/forge_rallyrigging.png',
    emoji: '🪢',
    rarity: 'legendary',
    effects: [
      { type: 'reload_charge_chance', value: 0.15 },
    ],
    activated: { kind: 'refresh_ability', chance: 1.0 },
    source: 'Forged from Trade-Wind Sails + Thunder Drum',
  },
  // ── TIER 3 · Abyssal ────────────────────────────────────────────────────────
  {
    id: 'plague_cannon',
    name: 'Plague Cannon',
    description: '35% chance each hit to Weaken, Corrode and make the enemy Feeble, with a further 25% chance a critical hit lands all three on its own. You deal +25% damage to anything afflicted, and your criticals hit +15% harder. A rotting hull dies screaming.',
    image: '/forge_plaguecannon.png',
    emoji: '☠️',
    rarity: 'legendary',
    effects: [
      { type: 'weaken_on_hit',        value: 0.35 },
      { type: 'corrode_on_hit',       value: 0.35 },
      { type: 'feeble_on_hit',        value: 0.35 },
      // THE TWIST. The Carrion Rack brought the spread and the Sharpshooter's
      // brought the crit, and the fusion let you roll them as two unrelated dice.
      // Tying the second to the first means aiming well now spreads the rot, which
      // is the only thing on this weapon that rewards the shot itself.
      { type: 'crit_spread_chance',   value: 0.25 },
      { type: 'afflicted_damage_mult', value: 1.25 },
      { type: 'crit_damage_mult',     value: 1.15 },
    ],
    source: "Abyssal Forge: Carrion Rack + Sharpshooter's Cannon",
  },
  {
    id: 'warden_of_the_deep',
    name: 'Warden of the Deep',
    description: 'A big hit has a 60% chance to be dampened to 25% of your hull, every hit that does reach you has a 20% chance to load a cannonball, the first killing blow each raid leaves you standing, 25% of your Savvy joins your turn-order roll, and once per raid you rally a spent ability. The deep does not let you fall.',
    image: '/forge_wardenofthedeep.png',
    emoji: '🛡️',
    rarity: 'legendary',
    effects: [
      { type: 'max_hit_pct',        value: 0.25 },
      { type: 'max_hit_chance',     value: 0.6 },
      { type: 'lethal_save',        value: 1 },
      { type: 'speed_roll_nav_pct', value: 0.25 },
      // THE TWIST. Bastion Drum blunts the blow, Deadman's Bearing buys tempo, and
      // on the fusion the two were strangers: soaking a hit never once helped you
      // act. Now the hits that DO land pay you back in the one currency the warden
      // otherwise has no way to generate, so being ground down still arms the guns.
      { type: 'charge_on_hit_chance', value: 0.20 },
    ],
    activated: { kind: 'refresh_ability', chance: 1.0 },
    source: 'Abyssal Forge: Bastion Drum + Deadman’s Bearing',
  },
  {
    id: 'oracles_eye',
    name: "Oracle's Eye",
    description: 'A 35% chance to see through a feint, and a shot that slips through one lands as a critical. An 18% chance a clean hit becomes a crit, criticals hit +20% harder, and +12% max hull. You see the shot before it is taken.',
    image: '/forge_oracleseye.png',
    emoji: '👁️',
    rarity: 'legendary',
    effects: [
      { type: 'dodge_pierce_chance', value: 0.35 },
      // THE TWIST. Hawkeye Glass reads the feint and Heavy Gunner's Sight punishes
      // a crit, and the fusion never joined them: piercing a dodge landed an
      // ordinary hit like any other. Reading the enemy's weave IS the perfect shot,
      // so it should pay like one.
      { type: 'pierce_crit',         value: 1 },
      { type: 'crit_upgrade_chance', value: 0.18 },
      { type: 'crit_damage_mult',    value: 1.20 },
      { type: 'max_hp_mult',         value: 1.12 },
    ],
    source: "Abyssal Forge: Hawkeye Glass + Heavy Gunner's Sight",
  },
  {
    id: 'warlords_reckoning',
    name: "Warlord's Reckoning",
    description: 'Your first shot each fight lands +35% harder, and against a boss every new phase counts as a fresh opening shot. A crit has a 50% chance to strip a loaded cannonball, and you deal +22% to bosses AND non-bosses alike. When you open, the account is already settled.',
    image: '/forge_warlordsreckoning.png',
    emoji: '⚔️',
    rarity: 'legendary',
    effects: [
      { type: 'first_shot_mult',   value: 1.35 },
      // THE TWIST. Ambush Signet pays the opener and Marauder's pays the boss, and
      // against a boss the two pulled apart: the longest fights in the game are
      // exactly the ones where a single opening shot matters least. A phase change
      // is the fight resetting its stance, so it re-arms the ambush.
      { type: 'ambush_each_phase', value: 1 },
      { type: 'crit_strip_charge', value: 0.50 },
      { type: 'boss_damage_mult',  value: 1.22 },
      { type: 'nonboss_damage_mult', value: 1.22 },
    ],
    source: "Abyssal Forge: Ambush Signet + Marauder's Cannon",
  },
  // ── DON'S HARDCORE CHASE ────────────────────────────────────────────────────
  // The mirror of Davy's Blood Cannon: one mechanic, held by one item, dropped by
  // one place. Davy's pays you for aggression (heal by dealing damage); the Don's
  // pays you for the pause, since the ward braces on the turn you RELOAD rather
  // than the turn you shoot. Two hardcore chases that oppose each other in the
  // loop they reward, not just in the stat they carry.
  //
  // Rarity `rare` and modest numbers, exactly like the Blood Cannon at 8%
  // lifesteal. A hardcore chase is not a big number, it is the ONLY source of its
  // mechanic.

  {
    id: 'dons_palisade',
    name: "Don's Palisade",
    image: '/donspalisade.png',
    description: 'Opens every fight behind a barrier worth 12% of your hull, and every Reload braces 50% of it back. The Don does not need to be there for it to hold.',
    emoji: '\u{1F6E1}',
    rarity: 'rare',
    effects: [
      { type: 'ward_pct',        value: 0.12 },
      { type: 'ward_refill_pct', value: 0.50 },
    ],
    source: "Hardcore \u00B7 Don's Gauntlet",
  },
  {
    id: 'palisade_bulwark',
    name: 'Palisade Bulwark',
    image: '/forge_palisadebulwark.png',
    description: 'Opens every fight behind a barrier worth 16% of your hull and braces 50% of it back on every Reload, and a single hit over 25% of your max hull has a 50% chance to be dampened back to it. The chip and the haymaker, both answered.',
    emoji: '\u{1F6E1}',
    rarity: 'epic',
    effects: [
      { type: 'ward_pct',        value: 0.16 },
      { type: 'ward_refill_pct', value: 0.50 },
      { type: 'max_hit_pct',     value: 0.25 },
      { type: 'max_hit_chance',  value: 0.50 },
    ],
    source: "Forged from Don's Palisade + Dampener Plate",
  },
  {
    id: 'the_standing_wall',
    name: 'The Standing Wall',
    image: '/forge_thelastwall.png',
    description: 'Opens every fight behind a barrier worth 22% of your hull and braces 60% of it back on every Reload, a single hit over 25% of your max hull has a 50% chance to be dampened back to it, +15% max hull, and once per raid a killing blow leaves you at 1 HP instead of sinking with the barrier restored to full. A wall does not fall twice.',
    emoji: '\u{1F6E1}',
    rarity: 'legendary',
    effects: [
      { type: 'ward_pct',        value: 0.22 },
      { type: 'ward_refill_pct', value: 0.60 },
      { type: 'max_hit_pct',     value: 0.25 },
      { type: 'max_hit_chance',  value: 0.50 },
      { type: 'max_hp_mult',     value: 1.15 },
      { type: 'lethal_save',     value: 1 },
      // THE TWIST. Palisade Bulwark brought the ward and Last Bastion brought the
      // save, and the fusion spent them in sequence: the ward drains, then much
      // later the save catches you at 1 HP with nothing left standing between you
      // and the next blow — the worst possible moment to have no barrier. Cheating
      // death now puts the wall back up, so the save buys a real second wind
      // instead of one turn of borrowed time.
      { type: 'ward_refill_on_save', value: 1 },
    ],
    source: 'Abyssal Forge: Palisade Bulwark + Last Bastion',
  },
]

// ── Forge recipes ─────────────────────────────────────────────────────────────
// Own EVERY component → can forge the result, which sacrifices the components.
// Generic so any future item can be made forgeable: just add a recipe here (and
// the result + component items above). The Manage Ship forge UI maps over this
// list and the forgeRaidItem server action validates against it.
export interface ForgeRecipe {
  /** Item ids consumed by the forge (all required). */
  components: string[]
  /** Item id produced. */
  result: string
  /** Fathoms to LEARN the recipe before it can be forged (the meta sink). Once
   *  learned it's permanent; forging then only needs the components. */
  fathomCost: number
  /** Forge tier. Omitted = 2 (the ordinary forge, unlocked by the Davy Locker's
   *  `forge` upgrade). 3 = THE ABYSSAL FORGE: its components are themselves
   *  tier-2 fusions, and it's gated on Don's `dg_abyssal_forge` unlock instead. */
  tier?: 2 | 3
}

// The forge web: components are shared across recipes (e.g. Davy's Heavy feeds
// both the Grand and the Siege) so one drop can be spent down different paths —
// forge one, then refarm the boss for another copy to forge the other. Every
// recipe learns for a flat 150 Fathoms (the component chase is the real gate).
// Boss-drop components use the LEGENDARY ("prime"/captain-grade) tier, never the
// standard epic — so the recipe is a real chase and the fusion reflects the
// legendary's stronger effect. Non-boss components (Davy cannons, Gunner's
// Sight, Reinforced Hull, Compass, Anchor) have no tier and pass through.
export const FORGE_RECIPES: ForgeRecipe[] = [
  { components: ['navigators_compass', 'tollmasters_primer'],   result: 'vanguards_chronometer', fathomCost: 150 },
  { components: ['davys_heavy_cannon', 'davys_hand_cannon'],    result: 'davys_grand_cannon',     fathomCost: 150 },
  { components: ['corsair_prime_cannon', 'davys_heavy_cannon'], result: 'siege_cannon',           fathomCost: 150 },
  { components: ['davys_hand_cannon', 'gunners_sight'],         result: 'sharpshooters_cannon',   fathomCost: 150 },
  { components: ['reinforced_hull', 'captains_carapace'],       result: 'ironclad_bulwark',       fathomCost: 150 },
  { components: ['quartermasters_anchor', 'reinforced_hull'],   result: 'last_bastion',           fathomCost: 150 },
  { components: ['captains_astrolabe', 'captains_carapace'],    result: 'deflector_plate',        fathomCost: 150 },
  { components: ['corsair_prime_cannon', 'gunners_sight'],      result: 'warlords_cannon',        fathomCost: 150 },
  // Farmable-only (no campaign either/or components) — forgeable by everyone.
  { components: ['corsair_prime_cannon', 'davys_hand_cannon'],  result: 'marauders_cannon',       fathomCost: 150 },
  { components: ['corsair_prime_cannon', 'captains_carapace'],  result: 'dreadnought_cannon',     fathomCost: 150 },
  { components: ['captains_carapace', 'tollmasters_primer'],    result: 'bastion_primer',         fathomCost: 150 },
  { components: ['captains_astrolabe', 'tollmasters_primer'],   result: 'riposte_chronometer',    fathomCost: 150 },
  // Blood Cannon fusions (Hardcore Blood Cannon + a normal-run damage cannon).
  { components: ['davys_blood_cannon', 'davys_heavy_cannon'],   result: 'bloodletter',            fathomCost: 150 },
  { components: ['davys_blood_cannon', 'davys_hand_cannon'],    result: 'reavers_cannon',         fathomCost: 150 },
  // The roads not taken — each needs BOTH halves of an either/or Cache, so none of
  // these can be LEARNED until the Reclamation sells back the side you left behind
  // (unobtainableComponents blocks the learn and says so). They are the reason the
  // Reclamation is worth the doubloons.
  { components: ['incendiary_cannonball', 'frozen_cannonball'],    result: 'emberfrost_cannonball', fathomCost: 150 },
  { components: ['quartermasters_anchor', 'navigators_compass'],   result: 'deadmans_bearing',  fathomCost: 150 },
  { components: ['gunners_sight', 'reinforced_hull'],              result: 'heavy_gunners_sight',   fathomCost: 150 },
  // ── TIER 3, THE ABYSSAL FORGE (gated on Don's `dg_abyssal_forge` unlock, not
  //    the ordinary `forge`). Components are themselves tier-2 fusions, so each
  //    one consumes four base items' worth of forging. Parents are DISJOINT
  //    across the four recipes, so each Abyssal is its own build identity. ──────
  // The Palisade's line. Like Davy's Blood Cannon feeding the Bloodletter and
  // the Reaver's Cannon, the hardcore mechanic PROPAGATES rather than being
  // spent: every child keeps the ward, so forging your chase away never costs
  // you the only thing that grants it.
  { components: ['dons_palisade', 'made_man'],                          result: 'palisade_bulwark',    fathomCost: 150 },
  { components: ['palisade_bulwark', 'last_bastion'],                   result: 'the_standing_wall',   fathomCost: 250, tier: 3 },
  { components: ['siege_cannon', 'warlords_cannon'],                    result: 'leviathans_cannon',   fathomCost: 250, tier: 3 },
  { components: ['ironclad_bulwark', 'deflector_plate'],                result: 'aegis_of_the_deep',   fathomCost: 250, tier: 3 },
  { components: ['marauders_cannon', 'last_bastion'],                   result: 'drowned_crown',       fathomCost: 250, tier: 3 },
  { components: ['vanguards_chronometer', 'riposte_chronometer'],       result: 'tempest_chronometer', fathomCost: 250, tier: 3 },
  // ── NEW tier-2 fusions — Ch3/4 raid items + the Don's Gauntlet items. ────────
  { components: ['the_shakedown', 'brackwater_rack'],           result: 'carrion_rack',      fathomCost: 150 },
  { components: ['opening_statement', 'dons_signet'],           result: 'ambush_signet',     fathomCost: 150 },
  { components: ['made_man', 'thunder_drum'],                   result: 'bastion_drum',      fathomCost: 150 },
  { components: ['admirals_eye', 'crows_nest_rigging'],         result: 'hawkeye_glass',     fathomCost: 150 },
  { components: ['opening_statement', 'the_shakedown'],         result: 'predators_battery', fathomCost: 150 },
  { components: ['trade_wind_sails', 'thunder_drum'],           result: 'rally_rigging',     fathomCost: 150 },
  // ── NEW tier-3 Abyssal fusions — pairs of the tier-2 items above + unused ones.
  { components: ['carrion_rack', 'sharpshooters_cannon'],       result: 'plague_cannon',       fathomCost: 250, tier: 3 },
  { components: ['bastion_drum', 'deadmans_bearing'],           result: 'warden_of_the_deep',  fathomCost: 250, tier: 3 },
  { components: ['hawkeye_glass', 'heavy_gunners_sight'],       result: 'oracles_eye',         fathomCost: 250, tier: 3 },
  { components: ['ambush_signet', 'marauders_cannon'],          result: 'warlords_reckoning',  fathomCost: 250, tier: 3 },
]

export function getForgeRecipe(resultId: string): ForgeRecipe | undefined {
  return FORGE_RECIPES.find(r => r.result === resultId)
}

// Don's Gauntlet base items. Recipes that consume one stay OFF the Forge board
// until the player has Don's access — otherwise a live (Don's-locked) player
// would see locked "chase" rows spoiling unreleased items. gated in ForgeBoard.
export const GAUNTLET2_BASE_ITEM_IDS = ['opening_statement', 'made_man', 'the_shakedown']
/** Does this recipe directly consume a Don's-Gauntlet item? */
export function recipeNeedsGauntlet2(resultId: string): boolean {
  const r = getForgeRecipe(resultId)
  return !!r && r.components.some(c => GAUNTLET2_BASE_ITEM_IDS.includes(c))
}

// ── THE FORGE IS A CONTESTED GRAPH, NOT A LIST ──────────────────────────────
// 17 recipes draw on only 13 components, and 11 of those 13 feed two or more
// recipes. Davy's Hand Cannon alone feeds four. Forging is DESTRUCTIVE, so
// spending a shared component on one recipe silently closes off the others until
// you refarm it. That trade IS the interesting decision in the forge, and a flat
// list of recipes hides it completely. These let the UI put it front and center.

/** Every distinct item that is a component of some recipe. */
export function forgeComponentIds(): string[] {
  return [...new Set(FORGE_RECIPES.flatMap(r => r.components))]
}

/** The recipes a given component feeds. */
export function recipesUsingComponent(componentId: string): ForgeRecipe[] {
  return FORGE_RECIPES.filter(r => r.components.includes(componentId))
}

/** What you GIVE UP by forging `resultId`: the other recipes its components feed,
 *  which this forge would spend the parts for. Only counts recipes you could still
 *  otherwise make (not ones already forged), because a path you have already walked
 *  is not a path you are losing. */
export function forgeOpportunityCost(
  resultId: string,
  ownedItems: string[],
): { component: string; alsoFeeds: string[] }[] {
  const recipe = getForgeRecipe(resultId)
  if (!recipe) return []
  const owned = new Set(ownedItems)
  const out: { component: string; alsoFeeds: string[] }[] = []
  for (const c of recipe.components) {
    const alsoFeeds = recipesUsingComponent(c)
      .filter(r => r.result !== resultId && !owned.has(r.result))
      .map(r => r.result)
    if (alsoFeeds.length > 0) out.push({ component: c, alsoFeeds })
  }
  return out
}

// Either/or campaign choices — the "pick one, and only once" Cache nodes in the
// raid map (raidMap.ts node.choice). Taking one item means the other is gone for
// good, so a recipe that needs the road-not-taken can never be completed. We use
// this to BLOCK learning such a recipe (and explain why) instead of letting a
// player burn Fathoms on something they can't build. (May open another way later.)
export const EXCLUSIVE_CHOICE_PAIRS: { items: [string, string]; source: string }[] = [
  { items: ['quartermasters_anchor', 'navigators_compass'], source: "the Quartermaster's Cache" },
  { items: ['gunners_sight', 'reinforced_hull'],            source: 'the Driftwood Cache' },
  { items: ['incendiary_cannonball', 'frozen_cannonball'],  source: 'the Sunken Cache' },
]

/** The either/or sibling of an item (the other option at its Cache), or null. */
export function exclusiveSiblingOf(id: string): { sibling: string; source: string } | null {
  for (const p of EXCLUSIVE_CHOICE_PAIRS) {
    if (id === p.items[0]) return { sibling: p.items[1], source: p.source }
    if (id === p.items[1]) return { sibling: p.items[0], source: p.source }
  }
  return null
}

/** Cache components this recipe needs that the player does NOT currently hold.
 *
 *  These are never permanently lost, which is the whole reason the Quartermaster's
 *  Ghost exists. Two separate rules used to strand a player here: the Cache only
 *  ever let you take ONE side, and the forge DESTROYS what it fuses, so you could
 *  end up missing a component you actually chose. The Ghost answers both, since he
 *  only ever offers what is not currently in your raid_items.
 *
 *  This is a HINT, not a block: it tells the player where to go, and nothing more.
 *  (It replaces unobtainableComponents, which hard-blocked the recipe and, for a
 *  player who had forged their pick away, claimed they had taken the other road.) */
export function cacheComponentsMissing(components: string[], ownedItems: string[]): { id: string; source: string }[] {
  const owned = new Set(ownedItems)
  const out: { id: string; source: string }[] = []
  for (const id of components) {
    if (owned.has(id)) continue
    const ex = exclusiveSiblingOf(id)
    if (ex) out.push({ id, source: ex.source })
  }
  return out
}

/** Whether an item is a forged combination (a FORGE_RECIPES result) — used to
 *  give fusions a distinct prismatic treatment vs the flat rarity colors. */
export function isForgedRaidItem(id: string): boolean {
  return FORGE_RECIPES.some(r => r.result === id)
}
/** Tier-3 ABYSSAL fusion? Needed as its own predicate because a tier-3 result
 *  also passes isForgedRaidItem (it IS a recipe result) — callers that want to
 *  distinguish the two tiers (the fancier border, the Abyssal-Forge gate) must
 *  check this FIRST. */
export function isAbyssalForgedItem(id: string): boolean {
  return getForgeRecipe(id)?.tier === 3
}

// ── EPIC → LEGENDARY (the Abyssal Accelerator) ──────────────────────────────
// Every boss signature drop has an EPIC and a LEGENDARY "chase" grade sharing a
// `family` (so the two never stack). The Abyssal Accelerator transmutes the epic
// into its legendary counterpart. This is the canonical pairing — keep in sync
// with the item defs above and the loot tables in lib/bossRaids.ts.
export const EPIC_TO_LEGENDARY: Record<string, string> = {
  corsair_cannon:          'corsair_prime_cannon',
  krusts_carapace:         'captains_carapace',
  cartographers_astrolabe: 'captains_astrolabe',
  spets_primer:            'tollmasters_primer',
  tell_tale_glass:         'admirals_eye',
  war_drum:                'thunder_drum',
  court_fang:              'dons_signet',
  chain_shot:              'brackwater_rack',
}

/** The legendary an epic boss item transmutes into, or null if it has none. */
export function legendaryForEpic(id: string): string | null {
  return EPIC_TO_LEGENDARY[id] ?? null
}

/** True if this item is an epic boss drop the Accelerator can transmute. */
export function isConvertibleEpic(id: string): boolean {
  return id in EPIC_TO_LEGENDARY
}

// ── ABYSSAL BUILD PLANNER ───────────────────────────────────────────────────
// The forge board answers "what can I forge right now?", one recipe at a time.
// The planner answers the OTHER question: "I want THESE pieces — what does the
// whole farm look like?" A tier-3 Abyssal is two tier-2 fusions, each two base
// drops, so the flat recipe never shows the four drops actually behind it. These
// pure helpers expand a set of targets all the way down to base drops (with
// multiplicity — forging is destructive, so two builds sharing a part each need
// their own copy).
//
// Targets span BOTH benches. A tier-2 fusion is a perfectly good thing to plan
// toward, and planning one alongside an Abyssal that eats it is the case the
// multiplicity accounting exists for.

/** Every BASE item consumed to forge `resultId` from scratch, with multiplicity.
 *  Recurses through intermediate fusions until it hits items that aren't
 *  themselves a recipe result (the true drops). */
export function forgeBaseLeaves(resultId: string): string[] {
  const r = getForgeRecipe(resultId)
  if (!r) return [resultId]
  return r.components.flatMap(forgeBaseLeaves)
}

/** Every recipe that must be FORGED to build `resultId` from base parts — the
 *  target itself plus every intermediate fusion, with multiplicity (a shared
 *  intermediate is forged once per parent that needs it). */
export function forgeSubRecipeIds(resultId: string): string[] {
  const r = getForgeRecipe(resultId)
  if (!r) return []
  return [resultId, ...r.components.flatMap(forgeSubRecipeIds)]
}

/** ONE node of a build tree: an item, what still has to happen to it, and what
 *  sits under it. `find` is a base drop to go and get, `forge` is a fusion to
 *  run, `have` is already aboard (so its subtree is pruned — descending past it
 *  would bill you for parts you already spent). */
export interface ForgeTreeNode {
  id: string
  status: 'have' | 'forge' | 'find'
  /** Where a `find` node drops. Only set for base drops. */
  source?: string
  children: ForgeTreeNode[]
}

export interface ForgePlan {
  targets: string[]
  /** Base drops to farm: id → total quantity across all targets. */
  baseQty: Record<string, number>
  /** Recipes to forge: id → how many times (target + intermediates). */
  forgeCount: Record<string, number>
  /** Distinct recipes not yet learned — what Fathoms actually get spent on. */
  learnRecipeIds: string[]
  fathomCost: number
  baseTotal: number
  forgeTotal: number
  /** Of `baseTotal`, how many are already aboard. `baseTotal - baseHave` is the
   *  number the player still has to go and get. */
  baseHave: number
  /** Per-id slice of the above: id → how many of that drop are already aboard.
   *  Capped at the quantity the plan actually needs. */
  baseHaveQty: Record<string, number>
  /** One tree per target, in the order given. The totals above are folded FROM
   *  these, so what the tree draws and what the tiles count are the same walk. */
  trees: ForgeTreeNode[]
}

/** Kept so older call sites naming the Abyssal-only shape still compile. */
export type AbyssalPlan = ForgePlan

/** Walk a target's tree, stopping wherever the player ALREADY holds the node.
 *  An owned intermediate means everything beneath it is done, so descending
 *  past it would bill the player for parts they have already spent.
 *
 *  `owned` should be raw ownership, not effectiveOwnedItems — a component that
 *  was consumed into a fusion is gone from the hold and has to be re-farmed if
 *  another target needs its own copy.
 *
 *  `used` is threaded across every target in the plan, which is what makes the
 *  shared-part problem legible: raid_items is a SET, so an owned id settles the
 *  FIRST place the plan needs it and every later occurrence has to be farmed or
 *  forged from scratch. The tree shows that second copy as real work instead of
 *  quietly counting the same item twice. */
function walkTree(resultId: string, owned: Set<string>, used: Record<string, number>): ForgeTreeNode {
  const spent = used[resultId] ?? 0
  if (owned.has(resultId) && spent === 0) {
    used[resultId] = spent + 1
    return { id: resultId, status: 'have', children: [] }
  }
  const r = getForgeRecipe(resultId)
  // A base drop with no recipe behind it: something to go and find.
  if (!r) return { id: resultId, status: 'find', source: getRaidItem(resultId)?.source, children: [] }
  return { id: resultId, status: 'forge', children: r.components.map(c => walkTree(c, owned, used)) }
}

/** The full component tree for each target, expanded to base drops. Exported so
 *  the planner can let you traverse a build rather than only read its totals. */
export function buildForgeTrees(targetIds: string[], ownedItems: string[] = []): ForgeTreeNode[] {
  const owned = new Set(ownedItems)
  const used: Record<string, number> = {}
  return targetIds.map(t => walkTree(t, owned, used))
}

/** Fold a tree into the running totals. An owned node counts as one part that is
 *  both NEEDED and ABOARD, so "3 of 12 aboard" stays honest for a build whose
 *  finished intermediates are the progress. */
function foldTree(
  n: ForgeTreeNode,
  baseQty: Record<string, number>,
  forgeCount: Record<string, number>,
  haveQty: Record<string, number>,
) {
  if (n.status === 'have') {
    baseQty[n.id] = (baseQty[n.id] || 0) + 1
    haveQty[n.id] = (haveQty[n.id] || 0) + 1
    return
  }
  if (n.status === 'find') {
    baseQty[n.id] = (baseQty[n.id] || 0) + 1
    return
  }
  forgeCount[n.id] = (forgeCount[n.id] || 0) + 1
  for (const c of n.children) foldTree(c, baseQty, forgeCount, haveQty)
}

/** Aggregate the full farm for a set of target results. `learnedRecipes` bills
 *  the Fathom cost only for recipes the player still needs to learn. */
export function planForgeBuild(
  targetIds: string[],
  learnedRecipes: string[] = [],
  ownedItems: string[] = [],
): ForgePlan {
  const baseQty: Record<string, number> = {}
  const forgeCount: Record<string, number> = {}
  const baseHaveQty: Record<string, number> = {}
  // ONE traversal feeds both the drawn tree and the counted totals. They used to
  // be the same walk written twice, which is exactly how a summary starts
  // disagreeing with the thing it summarises.
  const trees = buildForgeTrees(targetIds, ownedItems)
  for (const t of trees) foldTree(t, baseQty, forgeCount, baseHaveQty)
  const learned = new Set(learnedRecipes)
  const learnRecipeIds = Object.keys(forgeCount).filter(id => !learned.has(id))
  const fathomCost = learnRecipeIds.reduce((s, id) => s + (getForgeRecipe(id)?.fathomCost ?? 0), 0)
  return {
    targets: targetIds, baseQty, forgeCount, learnRecipeIds, fathomCost, baseHaveQty, trees,
    baseTotal: Object.values(baseQty).reduce((a, b) => a + b, 0),
    forgeTotal: Object.values(forgeCount).reduce((a, b) => a + b, 0),
    baseHave: Object.values(baseHaveQty).reduce((a, b) => a + b, 0),
  }
}

/** Previous name, from when the planner only handled tier-3 Abyssals. */
export const planAbyssalBuild = planForgeBuild

/** Ownership EXPANDED through the forge: everything in raid_items, plus every
 *  component that was CONSUMED into a fusion the player owns (recursively, so
 *  future fusion-of-fusion tiers expand too). The forge is destructive — a
 *  forged-away Cache pick vanishes from raid_items, but the player still MADE
 *  that choice. The Reclamation reads this, not raw ownership; otherwise it
 *  offers to sell back the side you took and forged, instead of the road not
 *  taken. */
export function effectiveOwnedItems(ownedItems: string[]): Set<string> {
  const owned = new Set(ownedItems)
  let grew = true
  while (grew) {
    grew = false
    for (const r of FORGE_RECIPES) {
      if (!owned.has(r.result)) continue
      for (const c of r.components) {
        if (!owned.has(c)) { owned.add(c); grew = true }
      }
    }
  }
  return owned
}

/** The Davy recipe — its components double as the Gauntlet chest drop pool. */
export const DAVY_FORGE = getForgeRecipe('davys_grand_cannon')!

/** CHARGED ITEMS carry their level on the id, as "borrowed_jaw#4".
 *
 *  Finn's spoils are not fixed stat sticks: what The Primeval Maw does depends
 *  on how far it has been charged, and combat is spread across two engines and
 *  twenty-odd routes that all already receive the equipped list. Riding the id
 *  means the charge reaches every one of them without a new prop, and every
 *  lookup below strips the tag, so a tagged id names the same item everywhere:
 *  same name, same art, same rarity. Only its EFFECTS differ.
 *
 *  The tag is added at the server boundary (getRaidPlayerStats). Nothing writes
 *  a tagged id back to the database. */
export function baseItemId(id: string): string {
  const cut = id.indexOf('#')
  return cut < 0 ? id : id.slice(0, cut)
}

/** The charge level riding an id, or null if it carries none. */
export function itemChargeLevel(id: string): number | null {
  const cut = id.indexOf('#')
  if (cut < 0) return null
  const n = Number(id.slice(cut + 1))
  return Number.isFinite(n) ? n : null
}

export function getRaidItem(id: string): RaidItemDef | undefined {
  const base = baseItemId(id)
  return RAID_ITEMS.find(i => i.id === base)
}

// ── READING AN ITEM CARD ──────────────────────────────────────────────────────
// A forged item carries four effects and an Abyssal five or six, and written as
// one sentence that is a wall of clauses joined by commas: nobody reads to the
// end of it, and two mechanics separated by ", and" look like one mechanic. So
// the card renders a LIST, one line per mechanic, and these build it.
//
// The lines are generated from the `effects` themselves rather than written by
// hand, which is the whole point: the number on the card is the number combat
// uses, permanently, and a retune cannot leave stale copy behind. Related
// effects are folded into ONE line where they are really one mechanic (the hit
// cap and its odds; the ward and its brace; the rack's three ailments), because
// splitting those reads as more mechanics than the item actually has.
//
// `description` is still the canonical one-line summary and is what the copy
// audit checks. It stays for tooltips, chat lines and anywhere a single string
// is needed. The card shows the generated list plus the description's closing
// line of character (see itemFlavor).

const asPct = (n: number) => `${Math.round(n * 100)}%`
/** A multiplier as a signed change: 1.22 → "+22%", 0.9 → "-10%". */
const asDelta = (m: number) => `${m >= 1 ? '+' : '-'}${Math.round(Math.abs(1 - m) * 100)}%`
/** A reduction multiplier as the size of the cut: 0.75 → "25%". */
const asCut = (m: number) => `${Math.round((1 - m) * 100)}%`

/** The closing line of character on an item's description, or null when it is
 *  all mechanics. Read off `description` rather than stored as its own field so
 *  the two can never disagree about what the item's voice is.
 *
 *  The rule is "a final sentence carrying no digits", and it is reliable here
 *  for a specific reason: audit-item-copy.mts REQUIRES every effect worth a
 *  percentage to print that percentage in the description, and gates the commit
 *  on it. A trailing sentence with no number in it therefore cannot be carrying
 *  a mechanic. If that audit is ever relaxed, this needs a real field instead. */
export function itemFlavor(def: RaidItemDef): string | null {
  const sentences = def.description.split(/(?<=\.)\s+/)
  if (sentences.length < 2) return null
  const last = sentences[sentences.length - 1]
  return /\d/.test(last) ? null : last
}

/** The effect types a forged item has that NEITHER of its components carries:
 *  its SIGNATURE, the thing the fusion does that the sum of its parts cannot.
 *  Derived from the recipe, so an item earns the callout by actually having one
 *  rather than by sitting on a list somebody has to remember to update.
 *
 *  Today only the tier-3 Abyssals have any (every tier-2 fusion is exactly its
 *  parents added together), which is precisely why the Abyssals needed one. */
export function signatureEffectTypes(def: RaidItemDef): Set<RaidEffectType> {
  const recipe = getForgeRecipe(def.id)
  if (!recipe) return new Set()
  const fromParents = new Set(recipe.components.flatMap(c => getRaidItem(c)?.effects.map(e => e.type) ?? []))
  return new Set(def.effects.map(e => e.type).filter(t => !fromParents.has(t)))
}

export interface ItemEffectLine {
  text: string
  /** This line describes the item's signature. Called out on the card, because
   *  otherwise the one mechanic that makes the fusion worth forging reads as
   *  just another bullet among six. */
  signature: boolean
}

/** One player-facing line per mechanic, in reading order: what you do to them,
 *  then what they cannot do to you, then the procs. Every effect type must be
 *  handled here or it is silently invisible on every card in the game.
 *
 *  Signature lines are hoisted to the TOP. A signature effect is deliberately
 *  given its OWN line even where it would read naturally folded into the one
 *  above it (the crit-bought ramp, the phase ambush, the pierced critical), so
 *  that it can be lifted out and coloured on its own. */
export function effectLines(def: RaidItemDef): ItemEffectLine[] {
  const val = (t: RaidEffectType) => def.effects.find(e => e.type === t)?.value
  const has = (t: RaidEffectType) => def.effects.some(e => e.type === t)
  const sig = signatureEffectTypes(def)
  const out: ItemEffectLine[] = []
  /** Push a line, tagging it as the signature when any effect it describes is
   *  one that neither component could supply. */
  const add = (text: string, ...types: RaidEffectType[]) => {
    out.push({ text, signature: types.some(t => sig.has(t)) })
  }

  // -- Damage --
  const boss = val('boss_damage_mult')
  const mob = val('nonboss_damage_mult')
  if (boss != null && mob != null && boss === mob) {
    // Equal on both is one mechanic ("+22% damage"), not two lines that a
    // player has to notice are the same number.
    add(`${asDelta(boss)} damage to everything, bosses and mobs alike`, 'boss_damage_mult', 'nonboss_damage_mult')
  } else {
    if (boss != null) add(`${asDelta(boss)} damage to bosses`, 'boss_damage_mult')
    if (mob != null) add(`${asDelta(mob)} damage to mobs and elites`, 'nonboss_damage_mult')
  }
  const ramp = val('ramp_damage_per_turn')
  if (ramp != null) add(`Your damage climbs ${asDelta(1 + ramp)} every turn of a fight`, 'ramp_damage_per_turn')
  const critRamp = val('crit_ramp_turns')
  if (critRamp != null) {
    add(critRamp === 1
      ? `Each critical hit advances your damage climb by an extra turn`
      : `Each critical hit advances your damage climb by an extra ${critRamp} turns`, 'crit_ramp_turns')
  }
  const firstShot = val('first_shot_mult')
  if (firstShot != null) add(`Your first shot each fight lands ${asDelta(firstShot)} harder`, 'first_shot_mult')
  if (has('ambush_each_phase')) add(`Against a boss, every new phase counts as a fresh opening shot`, 'ambush_each_phase')
  const critDmg = val('crit_damage_mult')
  if (critDmg != null) add(`${asDelta(critDmg)} critical damage`, 'crit_damage_mult')
  const noncrit = val('noncrit_damage_mult')
  if (noncrit != null) add(`${asCut(noncrit)} off your non-critical damage`, 'noncrit_damage_mult')
  const critUp = val('crit_upgrade_chance')
  if (critUp != null) add(`${asPct(critUp)} chance a clean hit becomes a critical`, 'crit_upgrade_chance')
  const fire = val('fire_damage_mult')
  if (fire != null) add(`${asDelta(fire)} damage on a single shot`, 'fire_damage_mult')
  const volley = val('volley_damage_mult')
  if (volley != null) add(`${asDelta(volley)} volley damage`, 'volley_damage_mult')
  const mega = val('mega_damage_mult')
  if (mega != null) add(`${asDelta(mega)} ultimate damage`, 'mega_damage_mult')
  const afflicted = val('afflicted_damage_mult')
  if (afflicted != null) add(`${asDelta(afflicted)} damage to an enemy that already carries an affliction`, 'afflicted_damage_mult')
  const avenge = val('avenge_elite_mult')
  if (avenge != null) add(`Cheat a killing blow and you deal ${asDelta(avenge)} to elite hulls for the rest of that fight`, 'avenge_elite_mult')
  const steal = val('lifesteal_pct')
  // The cap is always twice your total lifesteal, as a share of max HP, so this
  // raises the ceiling as well as the rate — stated because a player weighing
  // the Blood Cannon against a flat-damage mount cannot see the second half.
  if (steal != null) add(`Heals you for ${asPct(steal)} of the damage you deal, and lifts your per-hit heal cap by ${asPct(steal * 2)} of your hull`, 'lifesteal_pct')

  // -- Staying afloat --
  const hp = val('max_hp_mult')
  if (hp != null) add(`${asDelta(hp)} max hull`, 'max_hp_mult')
  const incoming = val('incoming_damage_mult')
  if (incoming != null) add(`Cuts incoming enemy fire by ${asCut(incoming)}`, 'incoming_damage_mult')
  const ward = val('ward_pct')
  if (ward != null) {
    const refill = val('ward_refill_pct')
    add(refill != null
      ? `Opens every fight behind a barrier worth ${asPct(ward)} of your hull, and braces ${asPct(refill)} of it back on every Reload`
      : `Opens every fight behind a barrier worth ${asPct(ward)} of your hull`, 'ward_pct', 'ward_refill_pct')
  }
  const cap = val('max_hit_pct')
  if (cap != null) {
    const odds = val('max_hit_chance') ?? 1
    add(odds >= 1
      ? `A single hit bigger than ${asPct(cap)} of your max hull is knocked back down to it`
      : `A single hit bigger than ${asPct(cap)} of your max hull has a ${asPct(odds)} chance to be knocked back down to it`,
      'max_hit_pct', 'max_hit_chance')
  }
  const parry = val('parry_chance')
  if (parry != null) {
    const reflect = val('parry_reflect_pct')
    add(reflect != null
      ? `On a successful dodge, ${asPct(parry)} chance to throw ${asPct(reflect)} of the shot back at them`
      : `On a successful dodge, ${asPct(parry)} chance to turn the shot aside`, 'parry_chance', 'parry_reflect_pct')
  }
  const firstBlow = val('first_blow_parry_chance')
  if (firstBlow != null) add(`${asPct(firstBlow)} chance the first blow of every fight is turned aside outright, with no dodge needed`, 'first_blow_parry_chance')
  if (has('lethal_save')) add(`Once per raid a killing blow leaves you at 1 HP instead of sinking`, 'lethal_save')
  if (has('ward_refill_on_save')) add(`Cheat a killing blow and your barrier comes straight back to full`, 'ward_refill_on_save')

  // -- Procs and tempo --
  const rack = val('weaken_on_hit') ?? val('corrode_on_hit') ?? val('feeble_on_hit')
  if (rack != null) {
    const parts = [
      has('weaken_on_hit') ? 'Weaken it' : null,
      has('corrode_on_hit') ? 'Corrode its barrier' : null,
      has('feeble_on_hit') ? 'make it Feeble' : null,
    ].filter(Boolean) as string[]
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
    add(`${asPct(rack)} chance each hit to ${list}, all together`, 'weaken_on_hit', 'corrode_on_hit', 'feeble_on_hit')
  }
  const spread = val('crit_spread_chance')
  if (spread != null) add(`A critical hit gets its own ${asPct(spread)} chance to land that same spread`, 'crit_spread_chance')
  const burn = val('burn_chance')
  if (burn != null) add(`${asPct(burn)} chance each hit to set the enemy ablaze`, 'burn_chance')
  const freeze = val('freeze_chance')
  if (freeze != null) add(`${asPct(freeze)} chance each hit to freeze the enemy for a turn`, 'freeze_chance')
  const pierce = val('dodge_pierce_chance')
  if (pierce != null) add(`${asPct(pierce)} chance to see through a feint and land the shot anyway`, 'dodge_pierce_chance')
  if (has('pierce_crit')) add(`A shot that slips through a feint lands as a critical`, 'pierce_crit')
  const strip = val('crit_strip_charge')
  if (strip != null) add(`${asPct(strip)} chance on a critical to tear a loaded cannonball off them`, 'crit_strip_charge')
  const refund = val('crit_charge_refund_chance')
  if (refund != null) add(`${asPct(refund)} chance a critical costs you nothing at all`, 'crit_charge_refund_chance')
  const openLoaded = val('start_charge_chance')
  if (openLoaded != null) {
    add(openLoaded >= 1
      ? `Opens every fight with a cannonball already loaded`
      : `${asPct(openLoaded)} chance to open a fight with a cannonball already loaded`, 'start_charge_chance')
  }
  const extraOpen = val('extra_start_charge_chance')
  if (extraOpen != null) add(`${asPct(extraOpen)} chance to open a fight with a SECOND cannonball loaded as well`, 'extra_start_charge_chance')
  const reload = val('reload_charge_chance')
  if (reload != null) add(`${asPct(reload)} chance a Reload loads a second cannonball`, 'reload_charge_chance')
  const chargeOnHit = val('charge_on_hit_chance')
  if (chargeOnHit != null) add(`${asPct(chargeOnHit)} chance that a hit reaching your hull loads a cannonball`, 'charge_on_hit_chance')
  const speed = val('speed_roll_nav_pct')
  if (speed != null) add(`Adds ${asPct(speed)} of your Savvy to your turn-order roll`, 'speed_roll_nav_pct')
  if (def.activated?.kind === 'refresh_ability') {
    out.push({
      text: def.activated.chance >= 1
        ? `Once per raid, rally a spent crew ability back for another use`
        : `Once per raid, a ${asPct(def.activated.chance)} chance to rally a spent crew ability`,
      signature: false,
    })
  }

  // Signature first. Stable within each group, so the reading order above still
  // holds for everything that is not called out.
  return [...out.filter(l => l.signature), ...out.filter(l => !l.signature)]
}

export function getActiveEffects(equippedItemIds: string[]): RaidEffect[] {
  return equippedItemIds.flatMap(id => {
    // A charged item's effects come from its milestone, never from the def.
    const lvl = itemChargeLevel(id)
    if (lvl !== null && baseItemId(id) === 'borrowed_jaw') return borrowedJawRaidEffects(lvl)
    return getRaidItem(id)?.effects ?? []
  })
}

/** The first equipped item that can be ACTIVATED (War Drum / Thunder Drum). One
 *  is expected at most — the family dedup keeps a player from running both tiers.
 *  Returns null when nothing activatable is equipped. */
export function getActivatableItem(equippedItemIds: string[]): RaidItemDef | null {
  for (const id of equippedItemIds) {
    const it = getRaidItem(id)
    if (it?.activated) return it
  }
  return null
}

/** Equipped items in `equippedIds` that belong to the SAME tier family as
 *  `itemId` (excluding itemId itself). Equipping `itemId` should drop these —
 *  tiers of one drop don't stack. Empty for unique items. */
export function conflictingFamilyItems(itemId: string, equippedIds: string[]): string[] {
  const fam = getRaidItem(itemId)?.family
  if (!fam) return []
  return equippedIds.filter(id => id !== itemId && getRaidItem(id)?.family === fam)
}

/** The raw items a forged result was made from, that it therefore can't sit
 *  beside: its recipe components PLUS any other tier sharing a component's family
 *  (so a fusion excludes both the standard AND prime grade of an ingredient).
 *  Empty for a non-forged item. This is what keeps a fusion off the same loadout
 *  as its own ingredients, blocking the cheap "forge it, then re-equip a refarmed
 *  component to run the effect twice" double-dip. Forging two DIFFERENT fusions
 *  is still allowed — that's an earned specialisation, not this cheap stack. */
export function fusionExcludedItems(resultId: string): string[] {
  const recipe = getForgeRecipe(resultId)
  if (!recipe) return []
  // Walk the FULL ancestor chain, not just the direct components. A tier-3
  // Abyssal fusion is forged from tier-2 fusions, which are themselves forged
  // from tier-1 items — so stopping one level down would let a player refarm a
  // GRANDPARENT and equip it beside the tier-3 that already contains its stats
  // (the exact double-dip this exclusion exists to prevent). Cycle-safe.
  const ids = new Set<string>()
  const queue = [...recipe.components]
  while (queue.length) {
    const id = queue.pop()!
    if (ids.has(id)) continue
    ids.add(id)
    const sub = getForgeRecipe(id)
    if (sub) queue.push(...sub.components)
  }
  const fams = new Set([...ids].map(c => getRaidItem(c)?.family).filter(Boolean) as string[])
  if (fams.size) for (const it of RAID_ITEMS) if (it.family && fams.has(it.family)) ids.add(it.id)
  return [...ids]
}

/** Everything equipped that can't coexist with `itemId` and must be dropped when
 *  it's equipped: same-family tiers (conflictingFamilyItems) PLUS the forge
 *  relationship in BOTH directions — a fusion vs its ingredients (+ their tiers),
 *  and a raw ingredient vs a fusion forged from it. The single source of truth
 *  for the equip swap + the loadout sanitiser. */
export function conflictingRaidItems(itemId: string, equippedIds: string[]): string[] {
  const out = new Set<string>(conflictingFamilyItems(itemId, equippedIds))
  const myExcluded = new Set(fusionExcludedItems(itemId)) // itemId is a fusion → its ingredients
  for (const id of equippedIds) {
    if (id === itemId) continue
    // itemId (a fusion) excludes an equipped ingredient, OR an equipped fusion
    // excludes itemId (itemId is one of its ingredients).
    if (myExcluded.has(id) || fusionExcludedItems(id).includes(itemId)) out.add(id)
  }
  return [...out]
}

/** Sanitise an equipped list so nothing that can't coexist rides together —
 *  family tiers AND forge ingredient/fusion pairs. Keeps the earlier item of any
 *  conflict; order-preserving; unique items pass through. Supersedes the
 *  family-only dedupe (which it still uses under the hood). */
export function dedupeRaidItems(equippedIds: string[]): string[] {
  const out: string[] = []
  for (const id of equippedIds) {
    if (conflictingRaidItems(id, out).length === 0) out.push(id)
  }
  return out
}

/** Drop all-but-the-first item of each tier family from an equipped list, so a
 *  loadout can never carry two grades of the same drop (which a player might
 *  wrongly assume stack). Order-preserving; unique items pass through. */
export function dedupeRaidItemFamilies(equippedIds: string[]): string[] {
  const seenFamilies = new Set<string>()
  const out: string[] = []
  for (const id of equippedIds) {
    const fam = getRaidItem(id)?.family
    if (fam) {
      if (seenFamilies.has(fam)) continue
      seenFamilies.add(fam)
    }
    out.push(id)
  }
  return out
}
