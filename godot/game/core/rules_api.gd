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
## into the stash and is opened when the captain chooses), and "quickSellHold"
## (the Quick Sell skill).


## Run one call. Returns the result (a dictionary, or null where the TS returned
## nothing), or the string "not ported".
static func run(db: CaptainStore, uid: String, op: String, a: Array) -> Variant:
	# Where the line went in, for Finn's port jobs (the weather, the light and
	# the patch at that spot). Port rules; never under the parity run.
	if op == "castLine" and not Rules.web_only and a.size() > 2 and a[2] is Dictionary:
		db.me(uid)["finn_cast_at"] = { "x": Js.num((a[2] as Dictionary).get("x")), "y": Js.num((a[2] as Dictionary).get("y")) }
	var out: Variant = _run(db, uid, op, a)
	if op == "reelIn" and out is Dictionary and (out as Dictionary).get("caught") == true and not Rules.web_only:
		Finn.on_catch(db, uid, out)
	# A catch may answer a treasure hunt's step (port rules).
	if op == "reelIn" and out is Dictionary and (out as Dictionary).get("caught") == true and Clues.on():
		var fish: Dictionary = Js.obj((out as Dictionary).get("fish"))
		if fish.has("id"):
			var steps: Array = Clues.on_catch(db, uid, float(fish["id"]))
			if not steps.is_empty():
				(out as Dictionary)["clueSteps"] = steps
	# Achievements are earned on state: check after anything that may have
	# changed it (port rules; never under the parity run).
	if not READS.has(op):
		var got: Array = Achievements.sweep(db, uid)
		if not got.is_empty():
			db.save["badges_new"] = Js.list(db.save.get("badges_new")) + got
	return out


## Calls that change nothing.
const READS: Array = ["parlorState", "getCasinoState", "getSlotStats", "getSlotsJackpot", "getRouletteState", "resumeHand", "finnState", "folkState", "dealtToday", "getDigState", "marketRefresh", "heldGolden", "getCrewState", "skinsState", "getRaidMapView", "campaignView", "getDpsCheckPreview"]


static func _run(db: CaptainStore, uid: String, op: String, a: Array) -> Variant:
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
		"levelFloors": return Shipyard.level_floors(db, uid)
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
		"buyGauntletUpgrade": return Gauntlet.buy_upgrade(db, uid, str(a[0]))
		"toggleGauntletUpgrade": return Gauntlet.toggle_upgrade(db, uid, str(a[0]))
		"equipSpecialItem": return Loadout.equip_special_item(db, uid, a[0])
		"equipSecondSpecial": return Loadout.equip_second_special(db, uid, a[0])
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
		"quickSellHold": return Selling.quick_sell_hold(db, uid)
		"buyBait": return Harbour.buy_bait(db, uid, a[0], float(a[1]))
		"purchaseRod": return Harbour.purchase_rod(db, uid, float(a[0]))
		"sellRod": return Harbour.sell_rod(db, uid, float(a[0]))
		"buyReel": return Harbour.buy_reel(db, uid)
		"buyHook": return Harbour.buy_hook(db, uid)
		"upgradeFishHold": return Harbour.upgrade_fish_hold(db, uid)
		"claimCompletionistRod": return Harbour.claim_completionist_rod(db, uid)
		"buyShipyardTier": return Shipyard.buy_tier(db, uid, a[0])
		"buyRepairKit": return RepairKits.buy(db, uid)
		"equipRepairKit": return RepairKits.equip(db, uid, str(a[0]))
		"forgeState": return Forge.state(db, uid)
		"forgeTry": return Forge.try_pair(db, uid, str(a[0]), str(a[1]))
		"forgeRaidItem": return Forge.forge(db, uid, str(a[0]))
		"forgeTransmute": return Forge.transmute(db, uid, str(a[0]))
		"forgeNote": return Forge.buy_note(db, uid)
		"forgeTemper": return Forge.temper(db, uid, str(a[0]))
		"forgeSalvage": return Forge.salvage(db, uid, str(a[0]))
		"bountyState": return Bounties.state(db, uid)
		"claimBounty": return Bounties.claim(db, uid, str(a[0]))
		"rerollBounty": return Bounties.reroll(db, uid, str(a[0]))
		"claimBountyMilestone": return Bounties.claim_milestone(db, uid)
		"markBountyRungSeen": return Bounties.mark_rung_seen(db, uid, float(a[0]))
		"voyageState": return Voyages.state(db, uid)
		"sendVoyage": return Voyages.send(db, uid, str(a[0]))
		"revealVoyage": return Voyages.reveal(db, uid, float(a[0]))
		"trawlState": return Trawls.state(db, uid)
		"deployTrawl": return Trawls.deploy(db, uid, str(a[0]), float(a[1]))
		"collectTrawl": return Trawls.collect(db, uid, str(a[0]))
		"ordersState": return Orders.state(db, uid)
		"claimOrder": return Orders.claim(db, uid, int(a[0]))
		"sweepOrders": return Orders.sweep(db, uid)
		"buyShip": return Hulls.buy(db, uid)
		"renameShip": return Hulls.rename(db, uid, str(a[0]))
		"equipShipSkin": return Hulls.equip_skin(db, uid, a[0])
		"equipRod": return Shipyard.equip_rod(db, uid, float(a[0]))
		"folkState": return Folk.state(db, uid)
		"parlorState": return Parlor.state(db, uid)
		"skinsState": return Skins.state(db, uid)
		"openSkinVoucher": return Skins.open(db, uid, str(a[0]))
		"equipCrewSkin": return Skins.equip(db, uid, str(a[0]), a[1])
		"boardReveal": return Parlor.board_reveal(db, uid, str(a[0]))
		"boardAnswer": return Parlor.board_answer(db, uid, str(a[0]), float(a[1]))
		"kingStart": return Parlor.king_start(db, uid)
		"kingAnswer": return Parlor.king_answer(db, uid, float(a[0]), float(a[1]))
		"kingFifty": return Parlor.king_fifty(db, uid)
		"kingWalk": return Parlor.king_walk(db, uid)
		"capstanSpin": return Parlor.capstan_spin(db, uid, float(a[0]))
		"capstanConsonant": return Parlor.capstan_letter(db, uid, float(a[0]), str(a[1]), false)
		"capstanVowel": return Parlor.capstan_letter(db, uid, float(a[0]), str(a[1]), true)
		"capstanSolve": return Parlor.capstan_solve(db, uid, float(a[0]), str(a[1]))
		"getCasinoState": return Casino.state(db, uid)
		"buyInCasino": return Casino.buy_in(db, uid, a[0])
		"cashOutCasino": return Casino.cash_out(db, uid)
		"spinSlots": return Casino.spin_slots(db, uid, a[0])
		"getSlotStats": return Casino.slot_stats(db, uid)
		"getSlotsJackpot": return Casino.jackpot_state(db)
		"getRouletteState": return Casino.roulette_state(db, uid)
		"placeBetsAndSpin": return Casino.spin_roulette(db, uid, a[0])
		"dealBlackjack": return Casino.deal(db, uid, a[0])
		"acceptInsurance": return Casino.insurance(db, uid, true)
		"declineInsurance": return Casino.insurance(db, uid, false)
		"hit": return Casino._move(db, uid, "hit")
		"stand": return Casino._move(db, uid, "stand")
		"doubleDown": return Casino._move(db, uid, "double")
		"split": return Casino._move(db, uid, "split")
		"resumeHand": return Casino.resume(db, uid)
		"finnState": return Finn.state(db, uid)
		"speakToFinn": return Finn.speak(db, uid, float(a[0]))
		"turnInFinnQuest": return Finn.turn_in(db, uid)
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
		"clueSearch": return Clues.search(db, uid, a[0])
		"clueAnswer": return Clues.answer(db, uid, str(a[0]), float(a[1]))
		"getCrewState": return Crew.state(db, uid)
		"getRaidMapView": return Campaign.view(db, uid)
		"saveEquippedRaidItems": return Armory.save_equipped(db, uid, a[0])
		"buySixthBerth": return Armory.buy_sixth_berth(db, uid)
		"buyArmoryExpansion": return Armory.buy_armory_expansion(db, uid)
		"getUltimateState": return Armory.ultimate_state(db, uid)
		"startUltimateBuild": return Armory.start_ultimate(db, uid, a[0])
		"swapUltimateBuild": return Armory.swap_ultimate(db, uid, a[0])
		"startUltimateRetool": return Armory.retool_ultimate(db, uid, a[0])
		"buyUltimateSchematics": return Armory.buy_schematics(db, uid)
		"switchUltimate": return Armory.switch_ultimate(db, uid, a[0])
		"campaignView": return Campaign.slim(Campaign.view(db, uid))
		"markChapterUnlockSeen": return Campaign.mark_chapter_seen(db, uid, a[0])
		"claimMilestoneNode": return Campaign.claim_milestone(db, uid, a[0])
		"markStoryNodeRead": return Campaign.mark_story_read(db, uid, a[0])
		"solvePuzzleNode": return Campaign.solve_puzzle(db, uid, a[0])
		"claimQuartermasterChoice": return Campaign.claim_choice(db, uid, a[0], a[1])
		"standForMuster": return Campaign.stand_muster(db, uid, a[0])
		"pickRaidEventChoice": return Campaign.pick_event(db, uid, a[0], a[1])
		"rollDiceNode": return Campaign.roll_dice(db, uid, a[0], a[1])
		"claimScoutDebt": return Campaign.claim_scout_debt(db, uid, a[0])
		"pickShipClass": return Campaign.pick_class(db, uid, a[0], a[1])
		"refitShipClasses": return Campaign.refit_classes(db, uid, Js.obj(a[0]))
		"chooseSpoil": return Campaign.choose_spoil(db, uid, a[0])
		"buySpoil": return Campaign.buy_spoil(db, uid, a[0])
		"getDpsCheckPreview": return Campaign.dps_preview(db, uid, a[0])
		"resolveDpsCheck": return Campaign.resolve_dps(db, uid, a[0], a[1])
		"recruitCrew": return Crew.recruit(db, uid, float(a[0]))
		"upgradeCrewHall": return Crew.upgrade_hall(db, uid)
		"dismissCrew": return Crew.dismiss(db, uid, float(a[0]))
		"renameCrew": return Crew.rename(db, uid, float(a[0]), str(a[1]))
		"postNotice": return Crew.post_notice(db, uid, str(a[0]))
		"bunkCrew": return Bunks.bunk(db, uid, float(a[0]), float(a[1]), a[2] if a.size() > 2 else null)
		"collectBunk": return Bunks.collect(db, uid, float(a[0]))
		"buyHallUpgrade": return Bunks.buy(db, uid, str(a[0]))
		"resolveTraitOffer": return Bunks.answer(db, uid, float(a[0]), bool(a[1]))
		"checkPromotions": return Bunks.promotions(db, uid)
		"assignToRaid": return Crew.assign(db, uid, float(a[0]), "raid" if a[1] != null else null, a[1])
		"assignToVoyage": return Crew.assign(db, uid, float(a[0]), "voyage" if a[1] != null else null, a[1])
		"benchCrew": return Crew.assign(db, uid, float(a[0]), null, null)
		"getMatchState": return ChartRoom.match_state(db, uid)
		"submitMatch": return ChartRoom.submit_match(db, uid, a[0])
		"getMinefieldState": return ChartRoom.minefield_state(db, uid)
		"revealCell": return ChartRoom.reveal_cell(db, uid, a[0])
		"toggleFlag": return ChartRoom.toggle_flag(db, uid, a[0])
		"getHoldState": return ChartRoom.hold_state(db, uid)
		"saveHoldProgress": return ChartRoom.save_hold_progress(db, uid, str(a[0]), a[1], a[2] if a.size() > 2 else null)
		"tallyHold": return ChartRoom.tally_hold(db, uid, str(a[0]), a[1])
		"submitHold": return ChartRoom.submit_hold(db, uid, str(a[0]), a[1])
		"getRiggingState": return ChartRoom.rigging_state(db, uid)
		"saveRiggingPaths": return ChartRoom.save_rigging(db, uid, a[0])
		"submitRigging": return ChartRoom.submit_rigging(db, uid, a[0])
		"getWorldChartState": return ChartRoom.world_state(db, uid)
		"claimLandmark": return ChartRoom.claim_landmark(db, uid, a[0])
		"markChartingGuideSeen": return ChartRoom.mark_guide_seen(db, uid)
		"getDigState": return Explore.get_dig_state(db, uid)
		"saveSeaPosition": return Explore.save_sea_position(db, uid, float(a[0]), float(a[1]), a[2] if a.size() > 2 else [], a[3] if a.size() > 3 else [])
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
