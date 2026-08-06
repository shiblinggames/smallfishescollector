// Skill tiers (not rarity) — how hard a badge is to earn, low → high.
// Grandmaster sits above Master: reserved for feats that require MAXING or
// COMPLETING multiple endgame systems at once (e.g. Fishing 100 + full
// collection), not just one long grind.
export type BadgeDifficulty = 'rookie' | 'seasoned' | 'veteran' | 'master' | 'grandmaster'

export interface Badge {
  id: string
  name: string
  description: string
  imageUrl: string
  difficulty: BadgeDifficulty
}

// Doubloons granted when a badge's reward is claimed (kept small + tunable —
// the badge itself is the real prize, this is a little bonus). Tops out at
// 10,000 for a Grandmaster feat; the lower tiers were rescaled under it.
export const BADGE_REWARD: Record<BadgeDifficulty, number> = {
  rookie:      250,
  seasoned:    1_000,
  veteran:     2_500,
  master:      5_000,
  grandmaster: 10_000,
}

// Achievement points per tier (1–5) — a skill score summed over earned badges.
export const BADGE_POINTS: Record<BadgeDifficulty, number> = {
  rookie:      1,
  seasoned:    2,
  veteran:     3,
  master:      4,
  grandmaster: 5,
}

// Display meta for each tier (pill label + accent color, a low→high progression).
// Grandmaster's chip renders PRISMATIC in the UI (see .tier-grandmaster-chip);
// the `color` here is the solid fallback used for its card border + progress bar.
export const DIFFICULTY_META: Record<BadgeDifficulty, { label: string; color: string }> = {
  rookie:      { label: 'Rookie',      color: '#7fae8f' },
  seasoned:    { label: 'Seasoned',    color: '#5ea0e8' },
  veteran:     { label: 'Veteran',     color: '#b06ff2' },
  master:      { label: 'Master',      color: '#f0c040' },
  grandmaster: { label: 'Grandmaster', color: '#c77dff' },
}

export const BADGES: Badge[] = [
  // ── Fishing mastery ──────────────────────────────────────────────────────
  { id: 'prestige_i',     name: 'Prestige I',        description: 'Reach Prestige in any fishing zone',              imageUrl: '/badges/prestige_i.png',     difficulty: 'rookie'   },
  { id: 'trophy_catch',   name: 'Trophy Catch',       description: 'Land a Trophy-tier fish',                         imageUrl: '/badges/trophy_catch.png',   difficulty: 'veteran'  },
  { id: 'unbroken',       name: 'Unbroken',           description: 'Land 10 perfect catches in a row',                imageUrl: '/badges/unbroken.png',       difficulty: 'seasoned' },
  { id: 'relentless',     name: 'Relentless',         description: 'Land 15 perfect catches in a row',                imageUrl: '/badges/relentless.png',     difficulty: 'veteran'  },
  { id: 'untouchable',    name: 'Untouchable',        description: 'Land 20 perfect catches in a row',                imageUrl: '/badges/untouchable.png',    difficulty: 'master'   },
  { id: 'dead_eye',       name: 'Dead-Eye',           description: 'Land 1,000 perfect catches all-time',            imageUrl: '/badges/dead_eye.png',       difficulty: 'veteran'  },
  { id: 'master_angler',  name: 'Master Angler',      description: 'Reach Fishing Level 100',                         imageUrl: '/badges/master_angler.png',  difficulty: 'master'   },
  { id: 'zone_legend',    name: 'Zone Legend',        description: 'Reach Prestige in all 4 fishing zones',           imageUrl: '/badges/zone_legend.png',    difficulty: 'veteran'  },
  { id: 'prestige_stars', name: 'Prestige Stars',     description: 'Earn all 20 prestige stars (5 per zone)',         imageUrl: '/badges/prestige_stars.png', difficulty: 'grandmaster'   },

  // ── Fishing feats ────────────────────────────────────────────────────────
  { id: 'two_for_the_pot', name: 'Two for the Pot',   description: 'Reel in a double catch',                          imageUrl: '/badges/two_for_the_pot.png', difficulty: 'rookie'   },
  { id: 'saltlung',       name: 'Saltlung',           description: 'Cast your line 1,000 times',                      imageUrl: '/badges/saltlung.png',       difficulty: 'seasoned' },
  { id: 'crate_digger',   name: 'Crate Digger',       description: 'Open 50 supply crates',                           imageUrl: '/badges/crate_digger.png',   difficulty: 'seasoned' },

  // ── The collection ───────────────────────────────────────────────────────
  { id: 'half_the_sea',   name: 'Half the Sea',       description: 'Catch 50 fish species',                           imageUrl: '/badges/half_the_sea.png',   difficulty: 'rookie'   },
  { id: 'ancient_ones',   name: 'Ancient Ones',       description: 'Catch all 6 Ancient Deep trophies',               imageUrl: '/badges/ancient_ones.png',   difficulty: 'master'   },
  { id: 'full_collection',name: 'Full Collection',    description: 'Catch every fish species in the game',             imageUrl: '/badges/full_collection.png', difficulty: 'master'  },

  // ── The Completionist Rod ── the Fishing 100 + full-collection capstone.
  { id: 'completionist_rod', name: 'The Completionist', description: 'Claim the Completionist Rod',                     imageUrl: '/badges/completionist_rod.png', difficulty: 'grandmaster'   },
  { id: 'fully_rigged',      name: 'Fully Rigged',     description: 'Forge all 3 effects into the Completionist Rod',  imageUrl: '/badges/fully_rigged.png',      difficulty: 'veteran'  },
  { id: 'reforged',          name: 'Reforged',         description: 'Pay to re-forge the Completionist Rod into a fresh 3-effect loadout', imageUrl: '/badges/reforged.png',  difficulty: 'seasoned' },

  // ── Crew ─────────────────────────────────────────────────────────────────
  { id: 'growing_crew',     name: 'Growing Crew',      description: 'Recruit 25 crew',                                imageUrl: '/badges/growing_crew.png',     difficulty: 'rookie'   },
  { id: 'theres_a_grave',   name: "There's a Grave?",  description: 'Lose a crew member for the first time',          imageUrl: '/badges/theres_a_grave.png',   difficulty: 'rookie'   },
  { id: 'crewmaster',       name: 'Crewmaster',        description: 'Reach the top Crew Hall tier',                   imageUrl: '/badges/crewmaster.png',       difficulty: 'veteran'  },
  { id: 'full_muster',      name: 'Full Muster',       description: 'Recruit 100 crew',                               imageUrl: '/badges/full_muster.png',      difficulty: 'veteran'  },
  { id: 'legendary_recruit', name: 'Legendary Recruit', description: 'Recruit a legendary crew',                      imageUrl: '/badges/legendary_recruit.png', difficulty: 'seasoned' },
  { id: 'old_salt',         name: 'Old Salt',          description: 'Level a crew to 100',                            imageUrl: '/badges/old_salt.png',         difficulty: 'master'   },
  // ── Crew Hall, batch 31 — the bunks and the deep ──
  { id: 'leviathan_hall',   name: 'Leviathan Hall',    description: 'Build the Crew Hall to its final tier',           imageUrl: '/badges/leviathan_hall.png',   difficulty: 'veteran'  },
  { id: 'fully_outfitted',  name: 'Fully Outfitted',   description: 'Max both Drills and Stores',                     imageUrl: '/badges/fully_outfitted.png',  difficulty: 'veteran'  },
  { id: 'deep_cut',         name: 'Deep Cut',          description: 'Carry a stat only the Leviathan bunk can roll',   imageUrl: '/badges/deep_cut.png',         difficulty: 'seasoned' },
  { id: 'full_complement',  name: 'Full Complement',   description: 'Level 10 crew to 100',                           imageUrl: '/badges/full_complement.png',  difficulty: 'master'   },
  { id: 'divine_hand',      name: 'Divine Hand',       description: 'Land a Divine trait on a crew',                  imageUrl: '/badges/divine_hand.png',      difficulty: 'master'   },
  { id: 'six_divine',       name: 'Choir of the Deep', description: 'Hold six crew with Divine traits at once',       imageUrl: '/badges/six_divine.png',       difficulty: 'grandmaster' },

  // ── Expeditions & combat ─────────────────────────────────────────────────
  // 'navigator' id kept stable so existing unlocks survive; the label moved
  // to "Wayfinder" to free the name from the Navigator crew class.
  { id: 'navigator',        name: 'Wayfinder',         description: 'Reach Navigation Level 50',                      imageUrl: '/badges/navigator.png',        difficulty: 'seasoned' },
  { id: 'fleet_admiral',    name: 'Fleet Admiral',     description: 'Complete 100 voyages',                           imageUrl: '/badges/fleet_admiral.png',    difficulty: 'seasoned' },
  { id: 'master_navigator', name: 'Master Navigator',  description: 'Reach Navigation Level 100',                     imageUrl: '/badges/master_navigator.png', difficulty: 'master'   },
  // Challenge-mode boss clears only (normal campaign clears are story, not
  // achievements). All four entry-challenge clears are Seasoned.
  { id: 'corsairs_bane',  name: "Corsair's Bane",     description: 'Defeat Barnacle Pete in challenge mode',          imageUrl: '/badges/corsairs_bane.png',  difficulty: 'seasoned' },
  { id: 'ghost_ship',     name: "Krust's Crutch",     description: 'Defeat Captain Krust in challenge mode',          imageUrl: '/badges/ghost_ship.png',     difficulty: 'seasoned' },
  { id: 'cartographers_fall', name: "The Cartographer's Fall", description: 'Defeat the Cartographer in challenge mode', imageUrl: '/badges/cartographers_fall.png', difficulty: 'seasoned' },
  { id: 'toll_paid',      name: 'Toll Paid',          description: 'Defeat Tollmaster Spet in challenge mode',        imageUrl: '/badges/toll_paid.png',      difficulty: 'seasoned' },
  { id: 'swift_reckoning', name: 'Swift Reckoning',   description: "Clear Corsair's Reckoning in under 1:30",         imageUrl: '/badges/swift_reckoning.png', difficulty: 'veteran' },
  { id: 'opening_salvo',  name: 'Opening Salvo',      description: 'Land a single raid hit for 50 or more',           imageUrl: '/badges/opening_salvo.png',  difficulty: 'rookie'   },
  { id: 'hard_hitter',    name: 'Hard Hitter',        description: 'Land a single raid hit for 100 or more',          imageUrl: '/badges/hard_hitter.png',    difficulty: 'seasoned' },
  { id: 'heavy_broadside', name: 'Heavy Broadside',   description: 'Land a single raid hit for 250 or more',          imageUrl: '/badges/heavy_broadside.png', difficulty: 'veteran'  },
  { id: 'finndicates_bane', name: "Finndicate's Bane", description: 'Clear all four raids in challenge mode',         imageUrl: '/badges/finndicates_bane.png', difficulty: 'veteran' },

  // ── The Gauntlet ─────────────────────────────────────────────────────────
  { id: 'into_the_deep',  name: 'Into the Deep',      description: 'Descend to depth 5 in the Gauntlet',              imageUrl: '/badges/into_the_deep.png',  difficulty: 'seasoned' },
  { id: 'fathomless',     name: 'Fathomless',         description: 'Bank 500 Fathoms all-time',                       imageUrl: '/badges/fathomless.png',     difficulty: 'veteran'  },
  // Repointed from the retired "Davy Jones' Victor" (old Locker raid).
  { id: 'davy_jones',     name: "Davy Jones' Locker", description: 'Descend to depth 10 in the Gauntlet',             imageUrl: '/badges/davy_jones.png',     difficulty: 'veteran'  },

  // ── Broadsides (PvP) — PARKED 2026-07-23; restore these three with the feature.
  // { id: 'first_blood',    name: 'First Blood',        description: 'Win a ship duel',                                 imageUrl: '/badges/first_blood.png',    difficulty: 'rookie'   },
  // { id: 'brawler',        name: 'Broadside Brawler',  description: 'Win 10 ship duels',                               imageUrl: '/badges/brawler.png',        difficulty: 'seasoned' },
  // { id: 'duelist',        name: 'Duelist',            description: 'Win 25 ship duels',                               imageUrl: '/badges/duelist.png',        difficulty: 'veteran'  },

  // ── The Chart Room ───────────────────────────────────────────────────────
  { id: 'landfall',       name: 'Landfall',           description: 'Chart your first World Chart landmark',            imageUrl: '/badges/landfall.png',       difficulty: 'rookie'   },
  { id: 'quartermaster',  name: 'Quartermaster',      description: 'Bank 40 charting points',                         imageUrl: '/badges/quartermaster.png',  difficulty: 'rookie'   },
  { id: 'den_magnate',    name: 'Chartwright',        description: 'Bank 80 charting points',                         imageUrl: '/badges/den_magnate.png',    difficulty: 'seasoned' },
  { id: 'uncharted_no_more', name: 'Uncharted No More', description: 'Chart seven World Chart landmarks',             imageUrl: '/badges/uncharted_no_more.png', difficulty: 'seasoned' },
  { id: 'fully_laden',    name: 'Fully Laden',        description: 'Solve a Man-o-War hold (the hardest sudoku)',      imageUrl: '/badges/fully_laden.png',    difficulty: 'seasoned' },
  { id: 'the_long_watch', name: 'The Long Watch',     description: 'Bank 500 charting points',                        imageUrl: '/badges/the_long_watch.png', difficulty: 'master'   },
  { id: 'clean_manifest', name: 'Clean Manifest',     description: 'Stow all four holds in a single week',             imageUrl: '/badges/clean_manifest.png', difficulty: 'veteran'  },
  { id: 'master_cartographer', name: 'Master Cartographer', description: 'Chart the entire World Chart (all 13 landmarks)', imageUrl: '/badges/master_cartographer.png', difficulty: 'grandmaster' },

  // ── The Den & records ────────────────────────────────────────────────────
  { id: 'catfish_jackpot', name: 'Catfish Jackpot',   description: 'Win the slots Catfish Jackpot',                   imageUrl: '/badges/catfish_jackpot.png', difficulty: 'seasoned' },
  { id: 'tide_runner',    name: 'Tide Runner',        description: 'Reach 300m in a single Tide Run',                 imageUrl: '/badges/tide_runner.png',    difficulty: 'rookie'   },
  { id: 'tide_champion',  name: 'Tide Champion',      description: 'Reach 500m in a single Tide Run',                 imageUrl: '/badges/tide_champion.png',  difficulty: 'veteran'  },
  { id: 'tide_master',    name: 'Tide Master',        description: 'Reach 750m in a single Tide Run',                 imageUrl: '/badges/tide_master.png',    difficulty: 'master'   },

  // ── Wealth ───────────────────────────────────────────────────────────────
  { id: 'baby_steps',     name: 'Baby Steps',         description: 'Hold 100,000 doubloons at once',                  imageUrl: '/badges/baby_steps.png',     difficulty: 'rookie'   },
  { id: 'deep_pockets',   name: 'Deep Pockets',       description: 'Hold 1,000,000 doubloons at once',                imageUrl: '/badges/deep_pockets.png',   difficulty: 'veteran'  },
  { id: 'bilge_baron',    name: 'Bilge Baron',        description: 'Hold 2,500,000 doubloons at once',                imageUrl: '/badges/bilge_baron.png',    difficulty: 'master'   },

  // ── 2026-06 expansion (batches 9–10) ─────────────────────────────────────
  { id: 'got_away',       name: 'The One That Got Away', description: 'Lose 50 fish to snapped lines',                imageUrl: '/badges/got_away.png',       difficulty: 'rookie'   },
  { id: 'reel_lucky',     name: 'Reel Lucky',         description: 'Hit a fishing jackpot',                           imageUrl: '/badges/reel_lucky.png',     difficulty: 'veteran'  },
  { id: 'two_fisted',     name: 'Two-Fisted',         description: 'Land 100 double catches',                         imageUrl: '/badges/two_fisted.png',     difficulty: 'seasoned' },
  { id: 'sure_shot',      name: 'Sure Shot',          description: 'Land 250 perfect catches all-time',              imageUrl: '/badges/sure_shot.png',      difficulty: 'seasoned' },
  { id: 'salted_through', name: 'Salted Through',     description: 'Cast your line 10,000 times',                     imageUrl: '/badges/salted_through.png', difficulty: 'master'   },
  { id: 'maiden_voyage',  name: 'Maiden Voyage',      description: 'Complete your first voyage',                      imageUrl: '/badges/maiden_voyage.png',  difficulty: 'rookie'   },
  { id: 'old_sea_dog',    name: 'Old Sea Dog',        description: 'Complete 50 voyages',                             imageUrl: '/badges/old_sea_dog.png',    difficulty: 'seasoned' },
  { id: 'hundred_fins',   name: 'A Hundred Fins',     description: 'Catch 100 fish species',                          imageUrl: '/badges/hundred_fins.png',   difficulty: 'veteran'  },
  { id: 'three_legends',  name: 'The Three Legends',  description: 'Own 3 legendary crew at once',                    imageUrl: '/badges/three_legends.png',  difficulty: 'veteran'  },
  { id: 'beacon_breaker', name: 'Beacon Breaker',     description: 'Smash 500 beacons across all Tide Runs',          imageUrl: '/badges/beacon_breaker.png', difficulty: 'seasoned' },
  { id: 'long_haul',      name: 'The Long Haul',      description: 'Swim 100,000m total across Tide Runs',            imageUrl: '/badges/long_haul.png',      difficulty: 'veteran'  },
  { id: 'captains_colors', name: "Captain's Colors",  description: 'Become a Captain',                                imageUrl: '/badges/captains_colors.png', difficulty: 'rookie'  },

  // ── 2026-06 expansion II (batches 11–12) ─────────────────────────────────
  { id: 'crowned',        name: 'Crowned',            description: 'Make it all the way up the Pirate King ladder',   imageUrl: '/badges/crowned.png',        difficulty: 'master'   },
  { id: 'throne_in_sight', name: 'Throne in Sight',   description: 'Reach rung 7 of the Pirate King ladder',          imageUrl: '/badges/throne_in_sight.png', difficulty: 'seasoned' },
  { id: 'clean_sweep',    name: 'Clean Sweep',        description: "Clear a Captain's Board, every answer correct",   imageUrl: '/badges/clean_sweep.png',    difficulty: 'veteran'  },
  { id: 'parlor_hot_hand',     name: 'Hot Hand',      description: 'Answer 5 Parlor questions in a row',              imageUrl: '/badges/parlor_hot_hand.png',     difficulty: 'seasoned'    },
  { id: 'parlor_sharpshooter', name: 'Sharpshooter',  description: 'Answer 10 Parlor questions in a row',             imageUrl: '/badges/parlor_sharpshooter.png', difficulty: 'veteran'     },
  { id: 'parlor_flawless',     name: 'Flawless',      description: 'Answer 20 Parlor questions in a row',             imageUrl: '/badges/parlor_flawless.png',     difficulty: 'master'      },
  { id: 'parlor_cardsharp',    name: 'Cardsharp',     description: 'Reach the Cardsharp rank in the Parlor',          imageUrl: '/badges/parlor_cardsharp.png',    difficulty: 'seasoned'    },
  { id: 'parlor_kingpin',      name: 'Kingpin',       description: 'Reach the Kingpin rank in the Parlor',            imageUrl: '/badges/parlor_kingpin.png',      difficulty: 'veteran'     },
  { id: 'parlor_legend',       name: 'Parlor Legend', description: 'Reach the top Parlor rank',                       imageUrl: '/badges/parlor_legend.png',       difficulty: 'grandmaster' },
  { id: 'friend_at_sea',  name: 'A Friend at Sea',    description: 'Earn your first fishing pet',                     imageUrl: '/badges/friend_at_sea.png',  difficulty: 'rookie'   },
  { id: 'unstoppable',    name: 'Unstoppable',        description: 'Win 5 blackjack hands in a row',                  imageUrl: '/badges/unstoppable.png',    difficulty: 'veteran'  },
  { id: 'stacked_deck',   name: 'Stacked Deck',       description: 'Watch the dealer pull blackjack two hands running', imageUrl: '/badges/stacked_deck.png', difficulty: 'seasoned' },
  { id: 'called_it',      name: 'Called It',          description: 'Win a straight-up single-number roulette bet',    imageUrl: '/badges/called_it.png',      difficulty: 'seasoned' },
  { id: 'ship_of_the_line', name: 'Ship of the Line', description: 'Own the Man-o-War',                               imageUrl: '/badges/ship_of_the_line.png', difficulty: 'veteran' },
  { id: 'wrecking_crew',  name: 'Wrecking Crew',      description: 'Smash 2,000 beacons across all Tide Runs',        imageUrl: '/badges/wrecking_crew.png',  difficulty: 'master'   },
  { id: 'first_haul',     name: 'First Haul',         description: 'Collect your first trawl',                        imageUrl: '/badges/first_haul.png',     difficulty: 'rookie'   },
  { id: 'steady_nets',    name: 'Steady Nets',        description: 'Collect 25 trawls',                               imageUrl: '/badges/steady_nets.png',    difficulty: 'seasoned' },
  { id: 'deep_trawler',   name: 'Deep Trawler',       description: 'Collect 100 trawls',                              imageUrl: '/badges/deep_trawler.png',   difficulty: 'veteran'  },

  // ── 2026-07 fishing expansion (24 badges across every tier) ──────────────
  // Art PENDING — 4 sheets of 6 for the slice-badges run. Fishing pursuits +
  // three new-data hooks: goldens (shiny_catches), Finn wins (finn_wins), fish
  // value sold (fish_sold_doubloons), and boat-skin collection (ship_skins).
  { id: 'wet_behind_ears', name: 'Wet Behind the Ears', description: 'Reach Fishing Level 25',                        imageUrl: '/badges/wet_behind_ears.png', difficulty: 'rookie'     },
  { id: 'beginners_luck', name: "Beginner's Luck",     description: 'Open your first supply crate',                    imageUrl: '/badges/beginners_luck.png', difficulty: 'rookie'      },
  { id: 'struck_gold',    name: 'Struck Gold',         description: 'Catch your first golden fish',                    imageUrl: '/badges/struck_gold.png',    difficulty: 'rookie'      },
  { id: 'old_hand',       name: 'Old Hand',            description: 'Reach Fishing Level 50',                          imageUrl: '/badges/old_hand.png',       difficulty: 'seasoned'    },
  { id: 'crate_expectations', name: 'Crate Expectations', description: 'Open 250 supply crates',                       imageUrl: '/badges/crate_expectations.png', difficulty: 'seasoned' },
  { id: 'a_real_keeper',  name: 'A Real Keeper',       description: 'Land 10 Trophy-size catches',                     imageUrl: '/badges/a_real_keeper.png',  difficulty: 'seasoned'    },
  { id: 'full_stringer',  name: 'Full Stringer',       description: 'Keep 3 fishing pets at once',                     imageUrl: '/badges/full_stringer.png',  difficulty: 'seasoned'    },
  { id: 'one_upped',      name: 'One-Upped',           description: 'Win a challenge against Finn',                    imageUrl: '/badges/one_upped.png',      difficulty: 'seasoned'    },
  { id: 'fresh_coat',     name: 'Fresh Coat',          description: 'Own a boat skin',                                 imageUrl: '/badges/fresh_coat.png',     difficulty: 'seasoned'    },
  { id: 'twice_the_haul', name: 'Twice the Haul',      description: 'Land 500 double catches',                         imageUrl: '/badges/twice_the_haul.png', difficulty: 'veteran'     },
  { id: 'menagerie',      name: 'The Menagerie',       description: 'Keep 5 fishing pets at once',                     imageUrl: '/badges/menagerie.png',      difficulty: 'veteran'     },
  { id: 'fishmonger',     name: 'Fishmonger',          description: 'Sell 250,000 doubloons of fish',                  imageUrl: '/badges/fishmonger.png',     difficulty: 'veteran'     },
  { id: 'net_positive',   name: 'Net Positive',        description: 'Collect 500 trawls',                              imageUrl: '/badges/net_positive.png',   difficulty: 'veteran'     },
  { id: 'crack_shot',     name: 'Crack Shot',          description: 'Land 2,500 perfect catches all-time',            imageUrl: '/badges/crack_shot.png',     difficulty: 'master'      },
  { id: 'wreck_diver',    name: 'Wreck Diver',         description: 'Open 500 supply crates',                          imageUrl: '/badges/wreck_diver.png',    difficulty: 'master'      },
  { id: 'salvage_rights', name: 'Salvage Rights',      description: 'Open 1,000 supply crates',                        imageUrl: '/badges/salvage_rights.png', difficulty: 'grandmaster' },
  { id: 'high_water_mark', name: 'High Water Mark',    description: 'Reach Max Prestige in any fishing zone',          imageUrl: '/badges/high_water_mark.png', difficulty: 'master'     },
  { id: 'fish_baron',     name: 'Fish Baron',          description: 'Sell 1,000,000 doubloons of fish',                imageUrl: '/badges/fish_baron.png',     difficulty: 'master'      },
  { id: 'hoard_of_gold',  name: 'Hoard of Gold',       description: 'Catch 10 golden fish',                            imageUrl: '/badges/hoard_of_gold.png',  difficulty: 'master'      },
  { id: 'finns_rival',    name: "Finn's Rival",        description: 'Win 10 challenges against Finn',                  imageUrl: '/badges/finns_rival.png',    difficulty: 'master'      },
  { id: 'in_the_flow',    name: 'In the Flow',         description: 'Land 30 perfect catches in a row',                imageUrl: '/badges/in_the_flow.png',    difficulty: 'grandmaster' },
  { id: 'eagle_eyed',     name: 'Eagle-Eyed',          description: 'Land 5,000 perfect catches all-time',            imageUrl: '/badges/eagle_eyed.png',     difficulty: 'grandmaster' },
  { id: 'el_dorado',      name: 'El Dorado',           description: 'Catch 25 golden fish',                            imageUrl: '/badges/el_dorado.png',      difficulty: 'grandmaster' },
  { id: 'the_better_angler', name: 'The Better Angler', description: 'Win 25 challenges against Finn',                 imageUrl: '/badges/the_better_angler.png', difficulty: 'grandmaster' },
  { id: 'full_drydock',   name: 'Full Drydock',        description: 'Own every boat skin',                             imageUrl: '/badges/full_drydock.png',   difficulty: 'grandmaster' },

  // ── 2026-07 expansion (batches 13–16) ────────────────────────────────────
  // The Gauntlet — descent. (Depth 5 = into_the_deep, depth 10 = davy_jones.)
  { id: 'first_descent',  name: 'First Descent',      description: 'Cash out a Gauntlet run',                         imageUrl: '/badges/first_descent.png',  difficulty: 'rookie'   },
  { id: 'abyssward',      name: 'Abyssward',          description: 'Reach depth 20 in the Gauntlet',                  imageUrl: '/badges/abyssward.png',      difficulty: 'seasoned' },
  { id: 'forge_worthy',   name: 'Forge-Worthy',       description: 'Reach depth 35 in the Gauntlet',                  imageUrl: '/badges/forge_worthy.png',   difficulty: 'veteran'  },
  { id: 'davys_doorstep', name: "Davy's Doorstep",    description: 'Reach depth 60 in the Gauntlet',                  imageUrl: '/badges/davys_doorstep.png', difficulty: 'master'   },
  // The Gauntlet — the Locker (permanent upgrades).
  { id: 'well_provisioned', name: 'Well-Provisioned', description: 'Claim your first Gauntlet upgrade',               imageUrl: '/badges/well_provisioned.png', difficulty: 'rookie' },
  { id: 'locker_raider',  name: 'Locker Raider',      description: 'Claim 6 Gauntlet upgrades',                       imageUrl: '/badges/locker_raider.png',  difficulty: 'seasoned' },
  { id: 'forge_awakened', name: 'The Forge Awakens',  description: 'Unlock the Forge from the Gauntlet',              imageUrl: '/badges/forge_awakened.png', difficulty: 'veteran'  },
  { id: 'master_of_the_locker', name: 'Master of the Locker', description: 'Own every Gauntlet upgrade',             imageUrl: '/badges/master_of_the_locker.png', difficulty: 'master' },
  // The Gauntlet — the deep (runs, fathoms, prowess, greed, confluences).
  { id: 'push_your_luck', name: 'Push Your Luck',     description: 'Complete 10 Gauntlet runs',                       imageUrl: '/badges/push_your_luck.png', difficulty: 'rookie'   },
  { id: 'again_and_again', name: 'Again and Again',   description: 'Complete 50 Gauntlet runs',                       imageUrl: '/badges/again_and_again.png', difficulty: 'seasoned' },
  { id: 'fathom_hoarder', name: 'Fathom Hoarder',     description: 'Earn 1,000 Fathoms all-time',                     imageUrl: '/badges/fathom_hoarder.png', difficulty: 'veteran'  },
  { id: 'one_shot',       name: 'One Shot',           description: 'Land a single Gauntlet hit for 2,000 or more',    imageUrl: '/badges/one_shot.png',       difficulty: 'veteran'  },
  { id: 'greeds_price',   name: "Greed's Price",      description: 'Die deeper than your best cash-out',              imageUrl: '/badges/greeds_price.png',   difficulty: 'seasoned' },
  { id: 'storm_reader',   name: 'Storm Reader',       description: 'Discover your first confluence',                  imageUrl: '/badges/storm_reader.png',   difficulty: 'rookie'   },
  { id: 'deep_cartographer', name: 'Deep Cartographer', description: 'Discover every confluence',                     imageUrl: '/badges/deep_cartographer.png', difficulty: 'master' },
  // The Gauntlet — Hardcore. Crew you send in die for good.
  { id: 'drowned_ledger', name: 'The Drowned Ledger', description: 'Cash out a Hardcore Gauntlet run',                imageUrl: '/badges/drowned_ledger.png', difficulty: 'rookie'   },
  { id: 'the_unsinkable', name: 'The Unsinkable',     description: 'Reach depth 15 in the Hardcore Gauntlet',         imageUrl: '/badges/the_unsinkable.png', difficulty: 'seasoned' },
  { id: 'locker_bound',   name: 'Locker-Bound',       description: 'Reach depth 25 in the Hardcore Gauntlet',         imageUrl: '/badges/locker_bound.png',   difficulty: 'veteran'  },
  { id: 'the_deep_end',   name: 'The Deep End',       description: 'Reach depth 50 in the Hardcore Gauntlet',         imageUrl: '/badges/the_deep_end.png',   difficulty: 'master'   },
  { id: 'ferrymans_toll', name: "The Ferryman's Toll", description: 'Lose a squad to the Locker in Hardcore',         imageUrl: '/badges/ferrymans_toll.png', difficulty: 'seasoned' },
  // Davy's Terms — Pressure. Each pairs the weight of the board you signed with the
  // depth you actually brought it home from. Signing is free; surviving is not.
  { id: 'ink_and_salt',    name: 'Ink and Salt',     description: 'Cash out from depth 10 with 5+ Pressure',       imageUrl: '/badges/ink_and_salt.png',    difficulty: 'rookie'   },
  { id: 'the_weight',      name: 'The Weight',       description: 'Cash out from depth 20 with 15+ Pressure',      imageUrl: '/badges/the_weight.png',      difficulty: 'seasoned' },
  { id: 'crushing_depth',  name: 'Crushing Depth',   description: 'Cash out from depth 30 with 25+ Pressure',      imageUrl: '/badges/crushing_depth.png',  difficulty: 'veteran'  },
  { id: 'not_a_drop',      name: 'Not a Drop',       description: 'Cash out from depth 20 under Iron Rations II',  imageUrl: '/badges/not_a_drop.png',      difficulty: 'veteran'  },
  { id: 'paid_in_full',    name: 'Paid in Full',     description: 'Cash out from depth 35 with 40+ Pressure',      imageUrl: '/badges/paid_in_full.png',    difficulty: 'master'   },
  { id: 'for_glory_alone', name: 'For Glory Alone',  description: 'Cash out from depth 15 with every term signed', imageUrl: '/badges/for_glory_alone.png', difficulty: 'grandmaster' },
  // Blood Gems — the Hardcore premium currency.
  { id: 'blood_charged',   name: 'Blood-Charged',    description: 'Boost a recruit reroll with Blood Gems',          imageUrl: '/badges/blood_charged.png',   difficulty: 'rookie'   },
  { id: 'blood_rich',      name: 'Blood-Rich',       description: 'Earn 500 Blood Gems all-time',                    imageUrl: '/badges/blood_rich.png',      difficulty: 'seasoned' },
  { id: 'bloodhoard',      name: 'Bloodhoard',       description: 'Earn 2,000 Blood Gems all-time',                  imageUrl: '/badges/bloodhoard.png',      difficulty: 'veteran'  },
  { id: 'crimson_fortune', name: 'Crimson Fortune',  description: 'Win a crew skin from the blood gamble',           imageUrl: '/badges/crimson_fortune.png', difficulty: 'seasoned' },
  // Endgame & challenge.
  { id: 'weapon_of_legend', name: 'Weapon of Legend', description: 'Build your Man-o-War ultimate',                   imageUrl: '/badges/weapon_of_legend.png', difficulty: 'veteran' },
  { id: 'first_fusion',   name: 'First Fusion',       description: 'Forge your first item',                           imageUrl: '/badges/first_fusion.png',   difficulty: 'seasoned' },
  { id: 'ruse_undone',    name: 'Ruse Undone',        description: 'Defeat Admiral Ruse in challenge mode',           imageUrl: '/badges/ruse_undone.png',    difficulty: 'seasoned' },
  { id: 'account_settled', name: 'Account Settled',   description: 'Defeat the Quartermaster in challenge mode',      imageUrl: '/badges/account_settled.png', difficulty: 'seasoned' },
  { id: 'grand_forgemaster', name: 'Grand Forgemaster', description: 'Learn every forge recipe',                      imageUrl: '/badges/grand_forgemaster.png', difficulty: 'grandmaster' },
  { id: 'mark_of_mastery', name: 'Mark of Mastery',   description: 'Reach a Mark III ship class',                     imageUrl: '/badges/mark_of_mastery.png', difficulty: 'veteran' },
  { id: 'quick_draw',     name: 'Quick Draw',         description: 'Clear any raid in under 1:00',                    imageUrl: '/badges/quick_draw.png',     difficulty: 'veteran'  },
  { id: 'complete_captain', name: 'The Complete Captain', description: 'Reach Navigation 100 and Fishing 100',        imageUrl: '/badges/complete_captain.png', difficulty: 'grandmaster' },
  { id: 'six_legends',    name: 'The Avengers',       description: 'Own all 5 base legendary crew',                   imageUrl: '/badges/six_legends.png',    difficulty: 'master' },

  // ── 2026-07 expansion (batches 17–18) — crew skins + master feats ────────
  // Sheet 17 — crew skins.
  { id: 'colors_raised',  name: 'Colors Raised',      description: 'Own your first crew skin',                        imageUrl: '/badges/colors_raised.png',  difficulty: 'rookie'   },
  { id: 'the_chase',      name: 'The Chase',          description: 'Own a chase skin',                                imageUrl: '/badges/the_chase.png',      difficulty: 'veteran'  },
  { id: 'fashionista',    name: 'Fashionista',        description: 'Have a skin equipped on 5 crew at once',          imageUrl: '/badges/fashionista.png',    difficulty: 'veteran'  },
  { id: 'full_wardrobe',  name: 'Full Wardrobe',      description: 'Own all four skins for one legendary crew',       imageUrl: '/badges/full_wardrobe.png',  difficulty: 'master'   },
  { id: 'dressed_to_the_nines', name: 'Dressed to the Nines', description: 'Own 10 crew skins',                      imageUrl: '/badges/dressed_to_the_nines.png', difficulty: 'master' },
  { id: 'trophy_hunter',  name: 'Trophy Hunter',      description: 'Land 25 Trophy-size catches',                     imageUrl: '/badges/trophy_hunter.png',  difficulty: 'master'   },
  // Sheet 18 — challenge feats.
  { id: 'overkill',       name: 'Overkill',           description: 'Land a single raid hit for 500 or more',          imageUrl: '/badges/overkill.png',       difficulty: 'veteran'  },
  { id: 'all_hands_legends', name: 'All Hands, All Legends', description: 'Raid in the Man-o-War with 5 Level 100 legendary crew', imageUrl: '/badges/all_hands_legends.png', difficulty: 'grandmaster' },
  { id: 'iron_ruse',      name: 'Iron Ruse',          description: 'Beat the Admiral Ruse raid taking no damage',     imageUrl: '/badges/iron_ruse.png',      difficulty: 'master'   },
  { id: 'not_a_shot_fired', name: 'Not a Shot Fired', description: 'Sink a boss without a shot or a crew ability',    imageUrl: '/badges/not_a_shot_fired.png', difficulty: 'veteran'  },
  { id: 'tight_quarters', name: 'Tight Quarters',     description: 'Beat the Quartermaster raid using no crew abilities', imageUrl: '/badges/tight_quarters.png', difficulty: 'master' },
  { id: 'dead_reckoning', name: 'Dead Reckoning',     description: 'Clear the Cartographer raid missing no critical hits', imageUrl: '/badges/dead_reckoning.png', difficulty: 'master' },

  // ── 2026-07 expansion (batch 22) — Chapter IV: the Sunken Hand ────────────
  // Raids 7-8 challenge clears + the all-eight capstone, plus the two Ch4
  // ship refits (Sixth Berth / Expanded Armory).
  { id: 'blockade_broken', name: 'Blockade Broken',   description: 'Defeat Sal Brackwater in challenge mode',         imageUrl: '/badges/blockade_broken.png', difficulty: 'veteran'  },
  { id: 'don_drowned',     name: 'The Don Is Drowned', description: 'Defeat Don Finleone in challenge mode',           imageUrl: '/badges/don_drowned.png',     difficulty: 'veteran'  },
  { id: 'the_sunken_hand', name: 'The Sunken Hand',    description: 'Clear all 8 raids in challenge mode',             imageUrl: '/badges/the_sunken_hand.png', difficulty: 'master'   },
  { id: 'six_aboard',      name: 'Six Aboard',         description: 'Add the Sixth Berth to your ship',                imageUrl: '/badges/six_aboard.png',      difficulty: 'seasoned' },
  { id: 'expanded_armory', name: 'Expanded Armory',    description: 'Bolt the Expanded Armory onto your deck',         imageUrl: '/badges/expanded_armory.png', difficulty: 'seasoned' },
  { id: 'full_tackle_box', name: 'Full Tackle Box',    description: 'Own every rod money can buy',                     imageUrl: '/badges/full_tackle_box.png', difficulty: 'master'   },
  // ── The Abyssal Forge + Don's Gauntlet (art PENDING; dormant until Don's launches) ──
  // Two groups of six on the badges page: "Don's Gauntlet" (descent + hulls) and
  // "The Abyssal Forge" (forge + Locker mastery).
  // Sheet 23 — Don's Gauntlet: descent spine + hulls + a feat.
  { id: 'dons_descent',    name: 'The Green Beckons',  description: "Cash out a Don's Gauntlet run",                   imageUrl: '/badges/dons_descent.png',    difficulty: 'seasoned'    },
  { id: 'dons_doorstep',   name: "The Don's Doorstep", description: "Descend to depth 50 in Don's Gauntlet",           imageUrl: '/badges/dons_doorstep.png',   difficulty: 'master'      },
  { id: 'dons_reckoning',  name: "The Don's Reckoning", description: "Descend to depth 75 in Don's Gauntlet",          imageUrl: '/badges/dons_reckoning.png',  difficulty: 'grandmaster' },
  { id: 'dons_ghost_hull_won', name: 'Ghost of the Court', description: "Earn the Don's Ghost Hull from Don's Gauntlet", imageUrl: '/badges/dons_ghost_hull_won.png', difficulty: 'veteran'  },
  { id: 'first_convergence', name: 'The Convergence',  description: "Forge a convergence in Don's Gauntlet",           imageUrl: '/badges/first_convergence.png', difficulty: 'master'    },
  { id: 'one_true_shot',   name: 'One True Shot',      description: 'Land a single Gauntlet hit for 4,000+',           imageUrl: '/badges/one_true_shot.png',   difficulty: 'veteran'     },
  // Sheet 24 — The Abyssal Forge: forge mastery + challenge feats.
  { id: 'abyssal_smith',   name: 'The Abyssal Forge',  description: 'Forge your first tier-3 Abyssal item',            imageUrl: '/badges/abyssal_smith.png',   difficulty: 'master'      },
  { id: 'abyssal_master',  name: 'Abyssal Master',     description: 'Forge every Abyssal item',                        imageUrl: '/badges/abyssal_master.png',  difficulty: 'grandmaster' },
  { id: 'ghost_armory',    name: 'The Ghost Armory',   description: "Own all three Don's Gauntlet items",              imageUrl: '/badges/ghost_armory.png',    difficulty: 'veteran'     },
  { id: 'ultimate_only',   name: 'The Long Reload',    description: "Reach depth 10 in Don's Gauntlet firing only your Mega", imageUrl: '/badges/ultimate_only.png', difficulty: 'master'  },
  { id: 'weight_of_green', name: 'The Weight of the Green', description: "Bank from depth 30 in Don's Gauntlet carrying 5+ curses", imageUrl: '/badges/weight_of_green.png', difficulty: 'master' },
  { id: 'untouched',       name: 'Untouched',          description: "Bank a Don's Gauntlet run from depth 5 without taking a hit", imageUrl: '/badges/untouched.png', difficulty: 'veteran' },
  // ── Sheet 25 — The Sunken Hand. The finale itself, and the wreck it leaves.
  //
  // SPOILER RULE: not one of these may name the captain behind the Hand, or
  // hint that "the Hand" is a person rather than the organisation players have
  // chased since Chapter I. A badge list is read long before the raid is, and
  // it is the easiest place in the game to give the twist away. Everything here
  // talks about the WRECK and the SPOILS, never about who was steering.
  { id: 'one_last_ride',   name: 'One Last Ride',      description: 'Clear The Sunken Hand',                           imageUrl: '/badges/one_last_ride.png',   difficulty: 'master'      },
  { id: 'cut_off_at_the_wrist', name: 'Cut Off at the Wrist', description: 'Clear The Sunken Hand on Challenge',       imageUrl: '/badges/cut_off_at_the_wrist.png', difficulty: 'master'  },
  { id: 'the_long_quiet',  name: 'The Long Quiet',     description: 'See the Sunken Hand through to its end',          imageUrl: '/badges/the_long_quiet.png',  difficulty: 'seasoned'    },
  { id: 'ancient_tackle',  name: 'Ancient Tackle',     description: 'Earn your first Ancient-rarity item',             imageUrl: '/badges/ancient_tackle.png',  difficulty: 'veteran'     },
  { id: 'salvors_claim',   name: "Salvor's Claim",     description: 'Open a berth from the wreck',                     imageUrl: '/badges/salvors_claim.png',   difficulty: 'seasoned'    },
  { id: 'both_hands',      name: 'Both Hands',         description: 'Open both berths from the wreck',                 imageUrl: '/badges/both_hands.png',      difficulty: 'master'      },
  // ── Sheet 26 — The Primeval Spoils. What the wreck gives up, and the very
  //    long road to charging it all the way.
  { id: 'something_old',   name: 'Something Old',      description: 'Carry your first Primeval spoil',                 imageUrl: '/badges/something_old.png',   difficulty: 'veteran'     },
  { id: 'both_in_hand',    name: 'Both in Hand',       description: 'Own both Primeval spoils',                        imageUrl: '/badges/both_in_hand.png',    difficulty: 'master'      },

  // ── THE EXCHANGE ── contracts on the fish board. Every one of these is an
  // aggregate over exchange_positions, which is a durable log, so none of it
  // needed a counter.
  { id: 'first_contract',  name: 'Paper Captain',      description: 'Open your first contract on the Exchange',        imageUrl: '/badges/first_contract.png',  difficulty: 'rookie'      },
  { id: 'first_settle',    name: 'Read the Water',     description: 'Have a contract settle in your favour',           imageUrl: '/badges/first_settle.png',    difficulty: 'seasoned'    },
  { id: 'cut_losses',      name: 'Out Before the Bell', description: 'Sell a contract early rather than ride it out',  imageUrl: '/badges/cut_losses.png',      difficulty: 'seasoned'    },
  { id: 'worthless',       name: 'Not a Doubloon',     description: 'Watch a contract expire worthless',               imageUrl: '/badges/worthless.png',       difficulty: 'seasoned'    },
  { id: 'big_score',       name: "The Whole Berth",    description: 'Take 250,000 doubloons from a single contract',   imageUrl: '/badges/big_score.png',       difficulty: 'veteran'     },
  { id: 'market_maker',    name: 'Market Maker',       description: 'Settle 100 contracts',                            imageUrl: '/badges/market_maker.png',    difficulty: 'master'      },

  // ── BOUNTIES ── the daily orders board. bounty_progress is overwritten every
  // morning, so these read the lifetime counters bumped at claim time.
  { id: 'first_bounty',    name: 'Took the Job',       description: 'Claim your first bounty',                         imageUrl: '/badges/first_bounty.png',    difficulty: 'rookie'      },
  { id: 'full_board',      name: 'Board Cleared',      description: "Claim every order posted in one day",             imageUrl: '/badges/full_board.png',      difficulty: 'seasoned'    },
  { id: 'elite_order',     name: 'The Hard Way',       description: 'Claim an Elite bounty',                           imageUrl: '/badges/elite_order.png',     difficulty: 'veteran'     },
  { id: 'fifty_orders',    name: 'Known at the Docks', description: 'Claim 50 bounties',                               imageUrl: '/badges/fifty_orders.png',    difficulty: 'veteran'     },
  { id: 'seven_boards',    name: 'Every Morning',      description: 'Clear the whole board on 7 days',                 imageUrl: '/badges/seven_boards.png',    difficulty: 'master'      },
  { id: 'bounty_hoard',    name: "Harbourmaster's Favourite", description: 'Earn 5,000 gems from bounties',            imageUrl: '/badges/bounty_hoard.png',     difficulty: 'master'      },
  { id: 'waking_it',       name: 'Waking It',          description: 'Take a Primeval spoil to Tier III',               imageUrl: '/badges/waking_it.png',       difficulty: 'veteran'     },
  { id: 'fully_attuned',   name: 'Fully Attuned',      description: 'Take a Primeval spoil to Tier VI',                imageUrl: '/badges/fully_attuned.png',   difficulty: 'grandmaster' },
  { id: 'the_sixth_mount', name: 'The Sixth Mount',    description: 'Sail with all six item slots filled',             imageUrl: '/badges/the_sixth_mount.png', difficulty: 'veteran'     },
  { id: 'colours_of_the_hand', name: 'Colours of the Hand', description: 'Own all three hulls off The Sunken Hand',    imageUrl: '/badges/colours_of_the_hand.png', difficulty: 'master'  },

  // ── Sheet 27 — The daily docket. Clearing ALL THREE challenges in a day.
  //
  // ART PENDING, same sheet run as wreck_diver.
  //
  // Tuned against live numbers, not vibes: full sweeps land on about 18% of
  // played days, and the best player in the game has 28 of them across the
  // three months the feature has existed. So 7 is a real habit, 30 is past
  // anyone's current record, and 100 is a year-scale haul. The counter is
  // backfilled from history, so nobody's past sweeps are thrown away.
  { id: 'three_for_three', name: 'Three for Three',    description: 'Clear all three daily challenges, 7 times',      imageUrl: '/badges/three_for_three.png', difficulty: 'seasoned'    },
  { id: 'standing_watch',  name: 'Standing Watch',     description: 'Clear all three daily challenges, 30 times',     imageUrl: '/badges/standing_watch.png',  difficulty: 'veteran'     },
  { id: 'old_reliable',    name: 'Old Reliable',       description: 'Clear all three daily challenges, 100 times',    imageUrl: '/badges/old_reliable.png',    difficulty: 'master'      },

  // ── Sheet 27 continued — the two that finish the plate of six. Both mark
  //    content that shipped 2026-08-05 and had no recognition at all.
  { id: 'massive_booty',   name: 'Massive Booty',      description: 'Land a Massive Booty on a voyage',                imageUrl: '/badges/massive_booty.png',   difficulty: 'veteran'     },
  { id: 'the_fourth_task', name: 'The Fourth Task',    description: 'Clear 25 Master daily challenges',                imageUrl: '/badges/the_fourth_task.png', difficulty: 'master'      },
]

export const BADGE_MAP: Record<string, Badge> = Object.fromEntries(
  BADGES.map(b => [b.id, b])
)

/** Doubloon reward for a badge id (0 if unknown). */
export function badgeReward(id: string): number {
  const b = BADGE_MAP[id]
  return b ? BADGE_REWARD[b.difficulty] : 0
}

/** Achievement points (1–4) for a badge id (0 if unknown). */
export function badgePoints(id: string): number {
  const b = BADGE_MAP[id]
  return b ? BADGE_POINTS[b.difficulty] : 0
}

// Longer "what it takes" blurb shown in the badge detail modal — a sentence or
// two of context/tips beyond the one-line description.
export const BADGE_DETAIL: Record<string, string> = {
  prestige_i:       'Prestige a zone by maxing its catalogue, then resetting it for a permanent sell bonus. Your first prestige proves you have fully worked a fishing ground.',
  trophy_catch:     'Every cast rolls a size, and roughly 1 in 30 lands in the top Trophy band. Keep fishing and one of the giants is yours.',
  unbroken:         'String together 10 perfect reel-ins with no misses between them. A single slip resets the count to zero.',
  relentless:       'Fifteen flawless catches back to back. The line never wavers.',
  untouchable:      'Twenty perfect reels in a row. A streak only the steadiest hands ever reach.',
  dead_eye:         'A lifetime tally of 1,000 perfect catches. It builds up cast by cast, no streak required.',
  master_angler:    'Reach Fishing Level 100, the cap. The mark of a true angler.',
  zone_legend:      'Reach Prestige at least once in all four main fishing zones, from the shallows to the abyss.',
  prestige_stars:   'Earn every prestige star: all five in each of the four zones, twenty in total. The fishing endgame.',
  two_for_the_pot:  'Pull up two fish on a single cast. It happens on its own from time to time, more often with the right gear running. Lucky, and a little greedy.',
  saltlung:         'Cast your line a thousand times across your whole career. Pure time on the water, one cast at a time.',
  wreck_diver:      'Five hundred supply crates prised open. Nobody sets out to do this. It is what a few thousand casts leaves behind.',
  three_for_three:  'The tide sets three tasks at dawn, and clearing the lot before it turns is a full docket. Seven of them. Most captains take the easy two and call it a day.',
  standing_watch:   'Thirty full dockets. Not thirty days of fishing, thirty days of finishing, which is a harder thing and a rarer one.',
  old_reliable:     'A hundred days where every task the tide set got done. No streak to protect and nothing forcing your hand, just a captain who keeps turning up and clearing the board.',
  massive_booty:    'One voyage in a hundred comes back so heavy the hold will not shut. Ten times the coin, ten times the gems, and nothing you did earned it beyond being at sea when the luck landed.',
  the_fourth_task:  'Twenty-five Master challenges cleared. They only appear once you can reach the Ancient Deep, and they ask for a day of real work apiece. Nobody clears twenty-five by accident.',
  salvage_rights:   'A thousand supply crates, opened one at a time. Whatever the sea was keeping in them, it is yours now.',
  crate_digger:     'Crack open 50 supply crates. They wash up from voyages, raids, and the daily haul, and you have hauled in fifty of them.',
  half_the_sea:     'Catch 50 different fish species. A solid start on filling out the logbook.',
  ancient_ones:     'Land all six Ancient Deep trophies. The rarest, oldest fish in the sea.',
  full_collection:  'Catch every single species in the game. The ultimate collector’s feat.',
  completionist_rod:'Claim the Completionist Rod. The capstone tool, earned only at Fishing Level 100 with every species landed. The proof you’ve mastered the sea.',
  fully_rigged:     'Fill all three of the Completionist Rod’s power sockets. A rod built exactly the way you fish.',
  reforged:         'Pay the re-forge fee to swap the Completionist Rod into a fresh three-effect loadout. A rod remade to fit how your fishing has changed.',
  growing_crew:     'Recruit 25 crew over your career, living or lost.',
  theres_a_grave:   'Lose a crew member for the first time. The sea takes its due eventually. A sobering milestone.',
  legendary_recruit:'Add a legendary fish to your crew. Catfish, Doby Mick, or Mako. The rarest hands aboard.',
  crewmaster:       'Upgrade the Crew Hall all the way to its top tier, the Hall of Legends.',
  full_muster:      'Recruit 100 crew in total. A constant churn of fresh hands through the hall.',
  old_salt:         'Level a single crew member all the way to 100. Hundreds of raids of XP poured into one soul.',
  leviathan_hall:   'Raise the Crew Hall to Leviathan Hall, its sixth and final tier, and open the bunk that sits deepest in it.',
  fully_outfitted:  'Buy Drills VI and Stores VI. The hall trains as fast and as long as it ever will.',
  deep_cut:         'Carry a trait with a stat at 4. No recruit board rolls that high, so there is only one place it can have come from.',
  full_complement:  'Level ten separate crew to 100. A whole watch of them, every one finished.',
  divine_hand:      'Land the Divine trait on a crew: +4 Power, +4 Savvy and +4 Fortune, the ceiling of the encoding and the rarest thing the deep gives up.',
  six_divine:       'Hold six Divine crew at the same time. Six perfect hands, built one stat at a time out of the Leviathan bunk.',
  navigator:        'Reach Navigation Level 50, earned steadily on raids and voyages.',
  fleet_admiral:    'Complete 100 voyages. Pure patience and a fleet that keeps sailing.',
  opening_salvo:    'Land a single raid cannon hit for 50 or more damage. Your guns are finding their range.',
  hard_hitter:      'Land a single raid hit for 100 or more. Your build is starting to bite.',
  heavy_broadside:  'Land a single raid hit for 250 or more. A devastating broadside reserved for the top builds.',
  swift_reckoning:  'Clear the normal Corsair’s Reckoning raid in under a minute and a half. A clean, fast run start to finish.',
  corsairs_bane:    'Defeat Barnacle Pete in challenge mode. The harder, tuned-up version of the first raid.',
  ghost_ship:       'Defeat Captain Krust in challenge mode.',
  cartographers_fall:'Defeat the Cartographer in challenge mode. The normal clear is just the story. This is the real test.',
  toll_paid:        'Defeat Tollmaster Spet in challenge mode, the hard version of the Chapter II finale.',
  master_navigator: 'Reach Navigation Level 100, the navigation cap.',
  finndicates_bane: 'Clear all four raids in challenge mode. The complete hard-mode gauntlet.',
  into_the_deep:    'Descend to depth 5 in the Davy Jones Gauntlet on a single run.',
  fathomless:       'Bank 500 Fathoms across all your Gauntlet runs.',
  davy_jones:       'Reach depth 10 in the Gauntlet. About as deep as anyone has gone.',
  // Broadsides (PvP) lore — PARKED 2026-07-23; restore with the feature.
  // first_blood:      'Win your first ship duel against another captain.',
  // brawler:          'Win 10 ship duels.',
  // duelist:          'Win 25 ship duels — a feared name on the ladder.',
  landfall:         'Chart your first landmark on the World Chart. The fog parts, and the sea starts to fill in.',
  quartermaster:    'Bank 40 charting points from the Chart Room puzzles.',
  den_magnate:      'Bank 80 charting points from the Chart Room puzzles.',
  uncharted_no_more:'Chart seven of the thirteen World Chart landmarks. Past the halfway mark of the sea.',
  fully_laden:      'Solve a Man-o-War hold, the hardest cargo manifest in the Chart Room.',
  the_long_watch:   'Bank 500 charting points. A patient hand at the puzzles, week after week.',
  clean_manifest:   'Stow all four holds (Skiff, Galleon, Dreadnought, and Man-o-War) in a single week.',
  master_cartographer: 'Chart the entire World Chart, all thirteen landmarks. The whole sea is yours, Master Cartographer.',
  catfish_jackpot:  'Hit the global Catfish Jackpot on the slots. Three catfish on one spin, and the whole pot is yours.',
  tide_runner:      'Reach 300m in a single Tide Run.',
  tide_champion:    'Reach 500m in a single Tide Run. Contest-winning distance.',
  tide_master:      'Reach 750m in a single Tide Run, out past anyone’s record.',
  baby_steps:       'Hold 100,000 doubloons at once. Your first real nest egg.',
  deep_pockets:     'Hold 1,000,000 doubloons at once.',
  bilge_baron:      'Hold 2,500,000 doubloons at once. The hold is fit to burst.',
  got_away:         'Lose 50 fish to lines that snapped or slipped the hook. It happens to every angler who spends real time on the water.',
  reel_lucky:       'Land a fishing jackpot, the rare cast that pays out many times over. You cannot chase it, only ride it when it comes.',
  two_fisted:       'Pull up two fish on one cast 100 times over. The right gear makes it happen more often, but it always feels greedy.',
  sure_shot:        'Bank 250 perfect catches across your career. No streak required, it builds one clean reel at a time.',
  salted_through:   'Cast your line ten thousand times. A milestone only the most weathered hands ever reach.',
  maiden_voyage:    'Send your crew out on their very first voyage. Every fleet starts with one ship leaving port.',
  old_sea_dog:      'Complete 50 voyages. Patience, a steady fleet, and a lot of time at the wheel.',
  hundred_fins:     'Catch 100 different fish species. The logbook is starting to look serious.',
  three_legends:    'Have any three legendary crew aboard at the same time. The start of a truly rare muster.',
  beacon_breaker:   'Smash 500 beacons across all your Tide Runs. Every run chips away at the total.',
  long_haul:        'Cover 100,000 meters in total across every Tide Run you have ever made. The long, steady grind of the open channel.',
  captains_colors:  'Become a Captain and back the studio. The badge worn by those who keep the seas afloat.',
  crowned:          'Answer every rung of the weekly Pirate King ladder and take the crown. One wrong answer ends the run, so a clean climb to the top is a rare feat.',
  throne_in_sight:  'Climb to the seventh rung of the Pirate King ladder. The crown is within reach, if your nerve holds.',
  clean_sweep:      "Answer every card on a weekly Captain's Board correctly. No slip-ups, the whole board cleared.",
  parlor_hot_hand:     'Answer five Parlor questions in a row without a miss. The table starts to lean your way.',
  parlor_sharpshooter: 'Ten straight, no slips. Across the board and the King alike. The room takes notice.',
  parlor_flawless:     'Twenty questions running, not one wrong. The steadiest hand the Parlor has seen.',
  parlor_cardsharp:    'Climb to the Cardsharp rank on the Parlor standing ladder. A name worth carrying.',
  parlor_kingpin:      'Reach Kingpin on the Parlor standing ladder. Deep into the long game of wits.',
  parlor_legend:       'Reach the very top of the Parlor and be named a Legend. The whole 3,000-gem climb, complete.',
  friend_at_sea:    'Earn your first fishing pet. A small companion to ride along on every cast.',
  unstoppable:      'Win five blackjack hands in a row. The cards are running hot and you have not blinked.',
  stacked_deck:     'Sit through the dealer drawing a natural blackjack two hands running. Brutal luck, but a story worth a badge.',
  called_it:        'Win a straight-up bet on a single roulette number. One number, full odds, dead on.',
  ship_of_the_line: 'Own the Man-o-War, the mightiest hull money can buy. A true ship of the line.',
  wrecking_crew:    'Smash 2,000 beacons across every Tide Run you have ever made. A long trail of wreckage.',
  first_haul:       'Send a crew member out to trawl a zone and collect the haul they bring back. Passive fishing, your first catch of many.',
  steady_nets:      'Collect 25 trawls. The nets are always out, and the doubloons keep coming in.',
  deep_trawler:     'Collect 100 trawls. A steady second income hauled up one cycle at a time.',
  // ── 2026-07 expansion ──
  first_descent:    'Survive a Gauntlet run and cash out at any depth. Your first haul back up from the dark.',
  abyssward:        'Reach depth 20 on a single Gauntlet run. The pressure is starting to bite.',
  forge_worthy:     'Reach depth 35 in the Gauntlet, well past where the Forge is earned.',
  davys_doorstep:   'Reach depth 60. The deepest the Gauntlet goes. Knock on the Locker itself.',
  well_provisioned: 'Spend Fathoms on your first permanent Gauntlet upgrade from the Locker.',
  locker_raider:    'Claim six Gauntlet upgrades in total. The Locker is paying dividends.',
  forge_awakened:   'Unlock the Forge by going deep in the Gauntlet. The key to fusing raid items.',
  master_of_the_locker: 'Own every permanent Gauntlet upgrade the Locker offers. Nothing left to buy.',
  push_your_luck:   'Complete 10 Gauntlet runs, win or lose. Every dive teaches you something.',
  again_and_again:  'Complete 50 Gauntlet runs. A true regular of the deep.',
  fathom_hoarder:   'Earn 1,000 Fathoms across all your Gauntlet runs, banked over a long grind.',
  one_shot:         'Land a single Gauntlet hit for 2,000 damage or more. A deep run and a stacked build turn one blow into a kill.',
  greeds_price:     'Die on a Gauntlet run deeper than your best cash-out. You had a new record in hand and pushed one fight too far.',
  storm_reader:     'Discover your first confluence. Two boons that combine into something greater. The Gauntlet rewards a sharp eye.',
  deep_cartographer:'Discover every confluence. You have charted every way the deep’s gifts combine.',
  drowned_ledger:   'Sail a squad down into the Hardcore Gauntlet and cash out. Crew on the line the whole way, and you brought them home.',
  the_unsinkable:   'Reach depth 15 in the Hardcore Gauntlet, where a single fall would take your whole squad. Nerve most captains never test.',
  locker_bound:     'Reach depth 25 in the Hardcore Gauntlet. This deep, with your crew as the stake, few ever go and fewer return.',
  ferrymans_toll:   'Lose a squad to the Locker in Hardcore. The deep took them for good. The toll every hardcore captain pays sooner or later.',
  ink_and_salt:     'Sign Davy’s terms for at least 5 Pressure and bring the run home from depth 10. Your first taste of a weighted board.',
  the_weight:       'Cash out from depth 20 carrying 15+ Pressure. Depth 20 is exactly where Pressure starts paying, so this is the first run that was worth the ink.',
  crushing_depth:   'Cash out from depth 30 carrying 25+ Pressure. The depth where the bonus pays in full, at the weight where Davy starts handing out colors nobody can buy.',
  not_a_drop:       'Cash out from depth 20 with Iron Rations II signed. No crew heal, no repair kit, no lifesteal, no regen, no patch-up between fights. Nothing put a single point of hull back on your ship the whole way down.',
  paid_in_full:     'Cash out from depth 35 carrying 40+ Pressure. The heaviest board that still buys an extra gem, hauled up well past the depth it pays at.',
  for_glory_alone:  'Cash out from depth 15 with every term on the board signed at its worst tier. The gems stopped climbing 42 Pressure ago. There is nothing at the bottom of this one but the badge.',
  weapon_of_legend: 'Build a Man-o-War ultimate from the Quartermaster’s stolen plans. The nuke, the railgun, or the barrage.',
  first_fusion:     'Forge your first item at the Forge, fusing two raid items into one prismatic piece of gear.',
  ruse_undone:      'Defeat Admiral Ruse and the Coffers Fleet in challenge mode. The harder cut of Raid 5.',
  account_settled:  'Defeat the Quartermaster in challenge mode, the hard version of the Chapter III finale.',
  grand_forgemaster:'Learn every recipe the Forge has to offer. Nothing the deep drops is beyond your fusing.',
  mark_of_mastery:  'Take a single ship-class line all the way to its Mark III, three chapter-end picks deep.',
  quick_draw:       'Clear any raid in under a minute. A monster build turns a fight into a formality.',
  complete_captain: 'Reach both Navigation Level 100 and Fishing Level 100. Max the sea and the sail alike.',
  six_legends:      'Have all five base legendary crew aboard at once: Catfish, Doby Mick, Mako, Dole, and Laz. The rarest muster the sea has ever seen.',
  colors_raised:    'Buy and own your first crew skin. Alternate art for a legendary, rare, or epic crew. Skins are bought with gems from the Crew screen.',
  the_chase:        'Own a chase skin. The rarest, animated art reserved for legendary crew, sold at the top of each skin set. A real gem investment.',
  fashionista:      'Have a skin equipped on five different crew at the same time. A whole deck dressed to impress.',
  full_wardrobe:    'Own all four skins for a single legendary crew at once. The complete wardrobe for one legend runs deep into the gems.',
  dressed_to_the_nines: 'Own ten crew skins across your roster. A serious wardrobe, and a serious pile of gems spent looking good.',
  trophy_hunter:    'Land twenty-five Trophy-size catches. Roughly one cast in thirty rolls the top size band, so this is a long, patient hunt across the whole sea.',
  overkill:         'Land a single raid hit of 500 or more. It takes a monster build (stacked classes, forged items, and a perfect crit) to break the ceiling.',
  all_hands_legends: 'Sail into a raid aboard the Man-o-War with all five crew slots filled by legendary crew, every one of them at Level 100. The finest fleet a captain can muster.',
  iron_ruse:        'Beat the entire Admiral Ruse raid without your ship taking a single point of damage. Perfect dodges and perfect reads, start to finish.',
  not_a_shot_fired: 'Sink a raid boss without ever firing a shot OR using a crew ability. Let riposte and damage over time do all the killing. A build puzzle, not a lucky break.',
  tight_quarters:   'Clear the whole Quartermaster raid without using a single crew ability. Just you, your guns, and your nerve.',
  dead_reckoning:   'Clear the entire Cartographer raid without missing one critical hit. Every shot lands true across the longest fight on the map.',
  // ── Chapter IV: the Sunken Hand ──
  blockade_broken:  'Defeat Sal Brackwater in challenge mode, the tuned-up cut of Raid 7. Break the blockade that walled off the don, the hard way.',
  don_drowned:      'Defeat Don Finleone in challenge mode, the hardest cut of the final raid. The biggest name in the sea, answered for on the cruelest terms.',
  the_sunken_hand:  'Clear every raid, one through eight, in challenge mode. The whole Sunken Hand pulled apart finger by finger. The complete hard-mode campaign.',
  six_aboard:       'Buy the Sixth Berth and sail with a crew of six. One more hand, and one more ability, on every raid and voyage from here on.',
  expanded_armory:  'Buy the Expanded Armory from the don’s shipwright and bolt one more raid-item mount to your deck. One more piece of gear working every fight.',
  full_tackle_box:  'Own every purchasable rod in the tackle shop, from the Driftwood Staff to the Lightsaber. The Completionist Rod is earned, not bought, so it does not count. A serious pile of doubloons spent across the whole catalogue.',
}

/** Detail blurb for a badge id (falls back to its short description). */
export function badgeDetail(id: string): string {
  return BADGE_DETAIL[id] ?? BADGE_MAP[id]?.description ?? ''
}

export const MAX_EQUIPPED_BADGES = 3

// Per-slot, per-frame overlay positions (% relative to character container).
// Tune these via /fishing-test.
export type BadgeFrame = 'rest' | 'wait' | 'cast'
export type BadgePos = { top: number; left: number; width: number; rotate: number }

export const BADGE_SLOT_POSITIONS: Record<number, Record<BadgeFrame, BadgePos>> = {
  0: {
    rest: { top: 84,   left: 36,   width: 5.5, rotate: 0 },
    wait: { top: 79.9, left: 43,   width: 5.5, rotate: 0 },
    cast: { top: 84.1, left: 42.6, width: 5.5, rotate: 0 },
  },
  1: {
    rest: { top: 85,   left: 41.6, width: 5.5, rotate: 0 },
    wait: { top: 80.9, left: 48.7, width: 5.5, rotate: 0 },
    cast: { top: 85,   left: 48.2, width: 5.5, rotate: 0 },
  },
  2: {
    rest: { top: 85.4, left: 47.3, width: 5.5, rotate: 0 },
    wait: { top: 81.3, left: 54.4, width: 5.5, rotate: 0 },
    cast: { top: 85.4, left: 53.9, width: 5.5, rotate: 0 },
  },
}
