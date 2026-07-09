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
  | 'reload_charge_chance'  // value = 0-1 chance, on each RELOAD, to load a SECOND cannonball (catch the wind). Folds on top of any tide reload proc.
  | 'lifesteal_pct'         // value = 0-1 fraction of the damage you deal that heals your hull (Davy's Blood Cannon). Stacks additively with the Leviathan's Hunger boon's lifesteal.

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
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  effects: RaidEffect[]
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
    description: 'Adds a fifth of your Savvy to your turn-order roll, so you strike first more often.',
    image: '/navigatorscompass.png',
    emoji: '🧭',
    rarity: 'epic',
    effects: [{ type: 'speed_roll_nav_pct', value: 0.20 }],
    source: "Quartermaster's Cache",
  },
  // Same two-tier treatment as the Corsair Cannon. Krust's Carapace
  // is the standard plate; Captain's Carapace is the full-grade
  // version of his own armour, dropped only at the higher rate from
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
    description: 'On a successful dodge, 30% chance to deflect half the incoming shot back at the attacker.',
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
  // ── Davy Jones Gauntlet chest cannons ──────────────────────────────────────
  // Two rare chest-only drops + the forged combination. Odds climb up the
  // chest ladder (see lib/gauntlet chestCannonDropChance). Collect BOTH and the
  // forge (in the Manage Ship loadout drawer) sacrifices them for the Grand
  // Cannon — recipe in DAVY_FORGE below. Art is a cannon placeholder for now.
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
    description: '+20% damage to non-boss enemies. Tears through a crew before the captain ever shows his colours.',
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
    description: 'The gun drinks every wound it opens — you heal 8% of the damage you deal. The deep gives nothing back but what you take by force.',
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
    description: 'Adds a fifth of your Savvy to your turn-order roll so you strike first more often, AND always open each fight with a cannonball already loaded.',
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
    description: '+17% damage to bosses AND cuts incoming enemy fire by 15%. A heavy gun on a heavier hull — trade blows with a captain and walk away.',
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
]

export function getForgeRecipe(resultId: string): ForgeRecipe | undefined {
  return FORGE_RECIPES.find(r => r.result === resultId)
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

/** Components a player can NEVER obtain for this recipe because they took the
 *  OTHER side of an either/or Cache choice (they own the sibling). Empty = the
 *  recipe is still buildable (missing parts are farmable / choice not yet made). */
export function unobtainableComponents(components: string[], ownedItems: string[]): { id: string; sibling: string; source: string }[] {
  const owned = new Set(ownedItems)
  const out: { id: string; sibling: string; source: string }[] = []
  for (const id of components) {
    if (owned.has(id)) continue
    const ex = exclusiveSiblingOf(id)
    if (ex && owned.has(ex.sibling)) out.push({ id, sibling: ex.sibling, source: ex.source })
  }
  return out
}

/** Whether an item is a forged combination (a FORGE_RECIPES result) — used to
 *  give fusions a distinct prismatic treatment vs the flat rarity colours. */
export function isForgedRaidItem(id: string): boolean {
  return FORGE_RECIPES.some(r => r.result === id)
}

/** The Davy recipe — its components double as the Gauntlet chest drop pool. */
export const DAVY_FORGE = getForgeRecipe('davys_grand_cannon')!

export function getRaidItem(id: string): RaidItemDef | undefined {
  return RAID_ITEMS.find(i => i.id === id)
}

export function getActiveEffects(equippedItemIds: string[]): RaidEffect[] {
  return equippedItemIds.flatMap(id => getRaidItem(id)?.effects ?? [])
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
  const ids = new Set<string>(recipe.components)
  const fams = new Set(recipe.components.map(c => getRaidItem(c)?.family).filter(Boolean) as string[])
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
