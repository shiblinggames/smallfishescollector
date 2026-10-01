extends SceneTree
## A LOOK AT THE SCREEN (Godot port): the real game, drawn, saved as a picture.
## Needs a window (not --headless). Plays on a scratch captain; no real save is
## touched.
##
##   godot --path godot/game -s tests/shot.gd -- <out.png> [night] [what]
##
## what: dial (a hot streak on the dial), card (a catch card), crate (a gold
## crate opening), golden (the golden choice), level (a level-up). Default dial.


func _init() -> void:
	Captains.dir_override = "user://shot_captains"
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var out: String = args[0] if args.size() > 0 else "user://shot.png"
	var night: bool = args.has("night")
	var what: String = "dial"
	for w: String in ["dial", "card", "crate", "golden", "level", "look", "loadout", "hold", "almanac", "giants", "boss", "slain", "finn", "rankup", "dock", "ashore", "market", "tackle", "rods", "shelf", "buyer", "title", "crew", "purse", "vote", "shipyard", "yardport", "hotspot", "isle", "landed", "wanderers", "peddler", "runner", "regular", "talk", "crest", "portal", "portalsheet", "deadportal"]:
		if args.has(w):
			what = w
	var cycle: float = SeaClock.CYCLE_MS
	var base: float = floor(Time.get_unix_time_from_system() * 1000.0 / cycle) * cycle
	var at: float = base + cycle * (0.5 if night else 0.1)
	Clock.install(func() -> float: return at)
	Main.straight_to_sea = what != "title"
	if what == "title":
		Captains.dir_override = "user://shot_title_captains"
		Charter.dir_override = "user://shot_title_charters"
		if Captains.list().is_empty():
			Captains.make("Anna")
			var ben: Session = Captains.make("Ben_the_Bold")
			ben.profile()["fishing_xp"] = 52000.0
			ben.profile()["doubloons"] = 184200.0
			ben.profile()["character_color"] = "blue"
			ben.profile()["equipped_hat"] = "golden"
			ben.persist()
			Charter.found("The Salt Ledger", true, SteamLayer.player_key(), "Anna")
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	await process_frame
	if what == "title":
		for f: int in 40:
			await process_frame
		root.get_texture().get_image().save_png(out)
		print("  saved ", out)
		quit()
		return
	var sea: Sea = main.get_child(main.get_child_count() - 1)
	sea._boat.position = Vector2(-120, 2300)
	var hud: FishingHud = sea._hud
	var p: Dictionary = sea.session.profile()
	p["current_perfect_streak"] = 8.0
	p["fishing_xp"] = 2400.0
	hud._level_seen = sea.session.level()
	hud.refresh()
	hud._shot = { "fishId": 1.0, "catchDifficulty": 2.0, "biteRarity": 1.0, "waitMs": 9000.0, "jackpotMult": 1.0 }
	hud._cast_zone = "shallows"
	hud._mods = hud._tackle()
	for f: int in 20:
		await process_frame
	if what in ["loadout", "hold", "almanac", "giants", "boss", "slain", "finn", "rankup"]:
		# A captain with something to show: catches, clothes, pets and giants.
		var save: Dictionary = sea.session.save
		for id: int in [1, 2, 3, 4, 5, 7, 9, 12, 16, 20]:
			save["collection"][str(id)] = { "catch_count": 3.0, "is_golden": id == 4 }
			save["lifetime"][str(id)] = { "n": 5.0 + id, "last": "2026-09-30T10:00:00.000Z", "first": "2026-09-29T10:00:00.000Z" }
			save["hold"][str(id)] = 2.0
		save["bests"]["4"] = { "len": 8.8, "at": "2026-09-30T10:00:00.000Z" }
		p["unlocked_hats"] = ["golden", "blue"]
		p["unlocked_boats"] = ["fire", "oak"]
		p["unlocked_pets"] = ["parrot_red", "crab_blue"]
		p["ancient_catches"] = [144.0, 145.0, 146.0, 147.0]
		p["ancient_vigil"] = { "144": { "rank": 3.0, "released": false }, "145": { "rank": 5.0, "released": false }, "146": { "rank": 1.0, "released": true } }
		save["clears"] = ["the_sunken_hand"]
		save["rodItems"] = { "galaxy": 1.0, "twinstrike": 1.0 }
		hud.refresh()
	if what in ["dock", "ashore", "market", "tackle", "rods", "shelf", "buyer", "shipyard", "yardport"]:
		var save: Dictionary = sea.session.save
		for id: int in [1, 2, 3, 4, 5, 7, 9, 12, 16, 20, 31, 40]:
			save["collection"][str(id)] = { "catch_count": 3.0, "is_golden": null }
		save["hold"] = { "1": 6.0, "4": 3.0, "9": 2.0, "20": 5.0, "31": 1.0 }
		p["doubloons"] = 48250.0
		p["fishing_xp"] = float((Rules.data()["xpTable"] as Array)[33])
		p["rod_tier"] = 3.0
		save["rodItems"] = { "driftwood": 1.0, "fiberglass": 1.0 }
		# A day of market so the board has history.
		save["market"] = Market.fresh(at - 30.0 * Market.HOUR)
		Market.current(save)
		sea._boat.position = Chart.HOME
		hud.refresh()
	match what:
		"dock":
			pass
		"isle", "landed":
			var isle: Dictionary = (Rules.data()["isles"] as Array)[0]
			sea._boat.position = Vector2(float(isle["x"]) - 120.0, float(isle["y"]) + float(isle["r"]) + 140.0)
			for f: int in 4:
				await process_frame
			if what == "landed":
				await sea._land(isle)
		"hotspot":
			var hs: Dictionary = Hotspots.at_time(at)[0]
			sea._boat.position = Vector2(float(hs["x"]) - float(hs["r"]) * 0.5, float(hs["y"]))
			for f: int in 3:
				await process_frame
			sea._spot_t = 99.0
		"shipyard":
			p["hull_speed_tier"] = 2.0
			sea._enter_room("shipyard")
		"yardport":
			sea._boat.position = Vector2(900, -620)
		"purse":
			sea.session.save["charter"] = { "name": "The Salt Ledger", "crew": ["Anna", "Ben"], "ledger": [
				{ "by": "Anna", "amount": 100.0, "reason": "Brought 100 ⟡ aboard" }, { "by": "Ben", "amount": 100.0, "reason": "Brought 100 ⟡ aboard" },
				{ "by": "Ben", "amount": -100.0, "reason": "Bought 10× Worms" }, { "by": "Anna", "amount": 640.0, "reason": "Sold 17 fish (market)" },
				{ "by": "Ben", "amount": 1500.0, "reason": "Claimed the Shallows' completion reward" } ] }
			hud._open_sheet(Menus.purse_sheet(sea.session))
		"vote":
			sea.net = (main as Main).net
			sea._on_proposed(1, "Ben", "Ben proposes Prestige 2 in The Shallows. The crew's log there is wiped; goldens stay. In return, +20% XP on every catch there for the whole crew.")
		"crew":
			sea._boat.position = Vector2(-150, 2300)
			var m: Shipmate = sea._mate("local-ben")
			m.set_mate_name("Ben_the_Bold")
			m.set_look({ "color": "blue", "hat": "golden", "boat": "fire", "rodSlug": "rod_galaxy", "hook": "/hook_gold.png" })
			m.state({ "x": 180.0, "y": 2330.0, "vx": 0.0, "vy": 0.0, "pose": "wait", "facing": 1.0 })
			var far: Shipmate = sea._mate("local-cleo")
			far.set_mate_name("Cleo")
			far.set_look({ "color": "pink" })
			far.state({ "x": 2400.0, "y": 1800.0, "pose": "rest" })
			sea.net = (main as Main).net
		"ashore":
			sea._go_ashore()
		"market":
			Prefs.set_value("market_advanced", true)
			sea._enter_room("market")
		"tackle", "rods", "shelf":
			sea._enter_room("tackle")
			await process_frame
			var room: TackleRoom = sea._room_layer.get_child(0)
			if what == "rods":
				room._open("rod")
			if what == "shelf":
				room._open("bait")
		"buyer":
			var b: Buyer = sea._buyers[0]
			sea._boat.position = b.position + Vector2(-60, 200)
			for f: int in 3:
				await process_frame
			sea._hail(b)
		"wanderers", "peddler", "runner":
			# Someone near the Shallows' edge with a bait bundle, or (at night,
			# in the Ancient Deep) a blockade runner, hailed.
			var now: float = Clock.now_ms()
			var want: String = "wager" if what == "runner" else "bait"
			var step: float = SeaClock.CYCLE_MS if want == "wager" else 600000.0
			var t: Dictionary = {}
			for k: int in 400:
				for x: Dictionary in Traders.around(0, 6000 if want == "bait" else 18000, 9000 if want == "bait" else 6000, Traders.sea_day(now + k * step), now + k * step):
					if x["deal"] == want:
						t = x
						break
				if not t.is_empty():
					var then: float = now + k * step
					Clock.install(func() -> float: return then)
					sea._trader_cell = ""
					break
			var dp: Dictionary = Folk.drift_pos(float(t["x"]), float(t["y"]), float(t["driftR"]), float(t["driftRate"]), float(t["driftPhase"]), Clock.now_ms() / 1000.0)
			sea._boat.position = Vector2(float(dp["x"]) - 120.0, float(dp["y"]) + 160.0)
			for f: int in 4:
				await process_frame
			if what != "wanderers":
				sea._hail_wanderer(sea._strangers[t["key"]])
		"regular", "talk", "crest":
			var meg: Wanderer = sea._regulars["folk:meg"]
			sea._boat.position = meg.position + Vector2(-60, 200)
			for f: int in 3:
				await process_frame
			if what != "regular":
				sea._hail_wanderer(meg)
				for f: int in 3:
					await process_frame
				var tp: TraderPanel = sea._hud_layer.get_child(sea._hud_layer.get_child_count() - 1)
				await tp._open_scene()
				var sc: FolkScene = tp.get_child(tp.get_child_count() - 1)
				if what == "crest":
					sc._raise_crest(4, "I don't say this. I am saying it now. You're all right.")
				else:
					sc.rap["points"] = 9.0
					sc._gain({ "points": 10.0, "tier": 1, "tierUp": null })
					sc._line.finish()
			else:
				sea._regulars["folk:meg"].done = false
		"portal", "portalsheet", "deadportal":
			if what != "deadportal":
				sea.session.save["discoveries"] = ["shallows-0", "open_waters-0", "deep-0"]
				p["portal_tier"] = 3.0
			sea._portal_state()
			sea._boat.position = Vector2(float(Portal.AT["x"]) - 80.0, float(Portal.AT["y"]) + 60.0)
			for f: int in 3:
				await process_frame
			if what == "portalsheet":
				sea._open_portal()
				await process_frame
				var sh: PortalSheet = sea._hud_layer.get_child(sea._hud_layer.get_child_count() - 1)
				sh._sel = Portal.tier_def(4)
				sh._draw()
		"boss":
			sea._boat.position = Vector2(0, 19000)
			p["fishing_xp"] = float((Rules.data()["xpTable"] as Array)[89])
			hud._cast_zone = "ancient_deep"
			hud._shot = { "fishId": 147.0, "catchDifficulty": 5.0, "biteRarity": 5.0, "waitMs": 9000.0, "vigilRank": 3.0 }
			hud._mods = hud._tackle()
			hud._bite()
		"slain", "finn", "rankup":
			var a: AncientScenes = AncientScenes.new()
			a.kind = { "slain": "slain", "finn": "finn", "rankup": "rank_up" }[what]
			a.data = { "id": 146.0, "name": "Mosasaurus", "count": 3, "total": 6, "beat": (Rules.data()["finnAncientBeats"] as Dictionary)["146"], "from": 2.0, "to": 3.0 }
			hud.add_child(a)
		"loadout":
			hud._open_loadout()
		"hold":
			hud._open_hold()
		"almanac":
			hud._open_log()
		"giants":
			hud._open_log()
			await process_frame
			var a: Almanac = main.get_child(main.get_child_count() - 1)._hud.get_parent().get_child(-1)
			a._room = "Giants"
			a._draw_tabs()
			a._draw_room()
		"look":
			for k: String in ["character_color", "equipped_hat", "equipped_boat", "equipped_pet", "equipped_pet_bow"]:
				p[k] = { "character_color": "ruby", "equipped_hat": "golden", "equipped_boat": "fire", "equipped_pet": "parrot_red", "equipped_pet_bow": "plesiosaur_baby" }[k]
			p["rod_tier"] = 18.0
			sea._boat.set_look(Skipper.look_of(p))
			sea._zoom_to = 2.2
			sea._camera.zoom = Vector2(2.2, 2.2)
		"dial":
			hud._bite()
		"card":
			var fish: Dictionary = sea.session.store.species(4.0)
			hud._set_phase("result")
			hud._fish_card({ "caught": true, "fish": fish, "isNewSpecies": true, "xpGained": 42.0, "xpCatch": 20.0, "perfectBonusXP": 8.0, "xpStreak": 14.0, "perfectStreak": 9.0, "sizeIn": 7.4, "sizeMin": 2.0, "sizeMax": 9.0, "sizeTier": "large", "isPB": true, "previousBest": 6.1, "catchQty": 3.0, "baitSaved": true, "wormhole": true }, true)
		"crate":
			hud._shot["crateTier"] = "gold"
			hud._set_phase("result")
			hud._crate_card({ "type": "doubloons", "amount": 1250.0, "newDoubloons": 3400.0 })
		"golden":
			var g: GoldenChoice = GoldenChoice.new()
			g.session = sea.session
			g.golden = { "id": 1.0, "name": "Bluegill", "fishId": 1.0, "sizeIn": 8.0, "alreadyMounted": false }
			hud.add_child(g)
		"level":
			var lu: LevelUp = LevelUp.new()
			lu.claim = { "from": 4.0, "to": 6.0, "granted": [{ "level": 5.0, "reward": (Rules.data()["levelRewards"] as Dictionary)["5"] }, { "level": 6.0, "reward": (Rules.data()["levelRewards"] as Dictionary)["6"] }] }
			hud.add_child(lu)
	var wait: int = 150 if what == "crate" else (160 if what in ["card", "finn", "rankup", "slain"] else 50)
	for f: int in wait:
		await process_frame
	var img: Image = root.get_texture().get_image()
	img.save_png(out)
	print("  saved ", out)
	quit()
