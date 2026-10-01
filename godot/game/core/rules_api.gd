class_name RulesApi
extends RefCounted
## EVERY RULES CALL BY NAME (Godot port, the Charter slice): the one place an
## action by its TS name ("castLine", "buyBait", ...) meets the ported function.
## The parity replay drives the rules through it, the solo game calls it
## through Session.act, and in a Charter the founder's game runs a crewmate's
## actions through it on that crewmate's captain.
##
## A few names exist only for the port: "setSeaPos" (where the boat is moored),
## "marketRefresh" (catch the market up, so a crewmate's copy of it never
## rolls dice of its own), and "stowCrate"/"openCrate" (a reeled crate goes
## into the stash and is opened when the captain chooses).


## Run one call. Returns the result (a dictionary, or null where the TS returned
## nothing), or the string "not ported".
static func run(db: CaptainStore, uid: String, op: String, a: Array) -> Variant:
	match op:
		"castLine": return Fishing.cast_line(db, uid, a[0], a[1], a[2] if a.size() > 2 else null)
		"reelIn": return Fishing.reel_in(db, uid, float(a[0]), a[1], a[2])
		"reelCrate": return Fishing.reel_crate(db, uid, a[0])
		"stowCrate": return Fishing.stow_crate(db, uid, a[0])
		"openCrate": return Fishing.open_crate(db, uid, a[0])
		"rerollWormhole": return Fishing.reroll_wormhole(db, uid)
		"tideTurnerSkip": return Fishing.tide_turner_skip(db, uid)
		"heldGolden": return Fishing.held_golden(db, uid)
		"sellGoldenTrophy": return Fishing.sell_golden_trophy(db, uid, float(a[0]))
		"mountGoldenTrophy": return Fishing.mount_golden_trophy(db, uid, float(a[0]))
		"claimFishingLevelRewards": return Fishing.claim_fishing_level_rewards(db, uid)
		"claimZoneReward": return Fishing.claim_zone_reward(db, uid, a[0])
		"prestigeZone": return Fishing.prestige_zone(db, uid, a[0])
		"releaseAncient": return Fishing.release_ancient(db, uid, float(a[0]))
		"setAutoFishing":
			Loadout.set_auto_fishing(db, uid, a[0])
			return null
		"setShowWaitTimer":
			Loadout.set_show_wait_timer(db, uid, a[0])
			return null
		"buySpecialItem": return Loadout.buy_special_item(db, uid, a[0])
		"equipSpecialItem": return Loadout.equip_special_item(db, uid, a[0])
		"buyHat": return Loadout.buy_hat(db, uid, a[0])
		"equipHat": return Loadout.equip_hat(db, uid, a[0])
		"buyBoat": return Loadout.buy_boat(db, uid, a[0])
		"equipBoat": return Loadout.equip_boat(db, uid, a[0])
		"equipPet": return Loadout.equip_pet(db, uid, a[0], a[1] if a.size() > 1 else "stern")
		"setCompletionistEffects": return Loadout.set_completionist_effects(db, uid, a[0])
		"updateCharacterColor": return Loadout.update_character_color(db, uid, a[0])
		"equipTackleRod": return Loadout.equip_tackle_rod(db, uid, float(a[0]))
		"marketSellFish": return Selling.market_sell_fish(db, uid, float(a[0]), float(a[1]))
		"sellEntireHold": return Selling.sell_entire_hold(db, uid)
		"sellToResident": return Selling.sell_to_resident(db, uid, a[0])
		"buyBait": return Harbour.buy_bait(db, uid, a[0], float(a[1]))
		"purchaseRod": return Harbour.purchase_rod(db, uid, float(a[0]))
		"sellRod": return Harbour.sell_rod(db, uid, float(a[0]))
		"buyReel": return Harbour.buy_reel(db, uid)
		"buyHook": return Harbour.buy_hook(db, uid)
		"upgradeFishHold": return Harbour.upgrade_fish_hold(db, uid)
		"claimCompletionistRod": return Harbour.claim_completionist_rod(db, uid)
		"buyShipyardTier": return Shipyard.buy_tier(db, uid, a[0])
		"equipRod": return Shipyard.equip_rod(db, uid, float(a[0]))
		"folkState": return Folk.state(db, uid)
		"talkToFolk": return Folk.talk(db, uid, a[0])
		"askForFavourite": return Folk.ask(db, uid, a[0])
		"deliverToFolk": return Folk.deliver(db, uid, a[0])
		"buyFolkRod": return Folk.buy_rod(db, uid, a[0])
		"strikeDeal": return Traders.strike_deal(db, uid, a[0])
		"wagerForRunnerRod": return Traders.wager(db, uid, a[0])
		"dealtToday": return Traders.dealt_today(db, uid)
		"buyPortalTier": return Portal.buy_tier(db, uid)
		"spendRecall": return Portal.spend_recall(db, uid, a[0])
		"goAshore": return Explore.go_ashore(db, uid, a[0])
		"digHere": return Explore.dig_here(db, uid, a[0])
		"openBottle": return Explore.open_bottle(db, uid, a[0])
		"getDigState": return Explore.get_dig_state(db, uid)
		"saveSeaPosition": return Explore.save_sea_position(db, uid, float(a[0]), float(a[1]), a[2] if a.size() > 2 else [])
		"setSeaPos":
			db.update_profile(uid, { "sea_x": float(a[0]), "sea_y": float(a[1]) })
			return null
		"marketRefresh":
			Market.current(db.save)
			return null
		"markAlmanacViewed":
			AlmanacData.mark_viewed(db, uid)
			return null
	return "not ported"
