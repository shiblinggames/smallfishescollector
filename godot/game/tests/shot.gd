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
	for w: String in ["dial", "card", "crate", "golden", "level", "look", "loadout", "hold", "almanac", "giants", "boss", "slain", "finn", "rankup", "dock", "ashore", "market", "tackle", "rods", "shelf", "buyer", "title", "crew", "purse", "vote", "shipyard", "yardport", "hotspot", "isle", "landed", "wanderers", "peddler", "runner", "regular", "talk", "crest", "portal", "portalsheet", "deadportal", "wake", "still", "waiting", "bloom", "front", "frontedge", "levels", "achievements", "clue", "arch", "anchorage", "worldchart", "crewhall", "crewroster", "crewhalltier", "crossing", "cloud", "digsite", "current", "kelp", "bottle", "chart", "chartzoom", "course", "wheel", "waitrest", "titlenew", "stow", "crates", "crateopen", "fight", "film", "boattab", "baitpick", "angler"]:
		if args.has(w):
			what = w
	var cycle: float = SeaClock.CYCLE_MS
	var base: float = floor(Time.get_unix_time_from_system() * 1000.0 / cycle) * cycle
	var at: float = base + cycle * (0.5 if night else (0.30 if args.has("dusk") else 0.1))
	# SHOT_T: the moment in the sea's day (0 to 1; 0.667 is sunrise, 0 noon).
	if OS.get_environment("SHOT_T") != "":
		at = base + cycle * float(OS.get_environment("SHOT_T"))
	Clock.install(func() -> float: return at)
	Main.straight_to_sea = what != "title" and what != "titlenew"
	if what == "title" or what == "titlenew":
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
	if what == "title" or what == "titlenew":
		if what == "titlenew":
			var tt: Title = main._screen
			tt._making = true
			tt._color = "pink"
			tt._founding = true
			tt._build()
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
	if OS.get_environment("FRONT_KIND") != "" and what != "front" and what != "frontedge":
		_to_front(sea, OS.get_environment("FRONT_KIND"), 0.5)
	p["current_perfect_streak"] = 8.0
	p["fishing_xp"] = 2400.0
	if OS.get_environment("SHOT_XP") != "":
		p["fishing_xp"] = float(OS.get_environment("SHOT_XP"))
		sea.session.changed.emit()
	hud._level_seen = sea.session.level()
	hud.refresh()
	hud._shot = { "fishId": 1.0, "catchDifficulty": 2.0, "biteRarity": 1.0, "waitMs": 9000.0, "jackpotMult": 1.0 }
	hud._cast_zone = "shallows"
	hud._mods = hud._tackle()
	for f: int in 20:
		await process_frame
	if what in ["loadout", "hold", "wheel", "almanac", "giants", "boss", "slain", "finn", "rankup"]:
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
		"front", "frontedge":
			# A front of the kind FRONT_KIND (default tempest), the view at its
			# heart or (frontedge) on its leading edge.
			_to_front(sea, OS.get_environment("FRONT_KIND") if OS.get_environment("FRONT_KIND") != "" else "tempest", 0.5 if what == "front" else -1.0)
			for f: int in 160:
				await process_frame
		"current":
			var lane: Dictionary = (Rules.data()["flow"]["currents"] as Array)[0]
			var a0: Array = lane["pts"][12]
			var a1: Array = lane["pts"][22]
			sea._boat.position = Vector2(float(a0[0]), float(a0[1]))
			var dir: Vector2 = (Vector2(float(a1[0]), float(a1[1])) - sea._boat.position).normalized()
			sea._boat.heading = dir.angle()
			sea._boat.target = Vector2(float(a1[0]), float(a1[1]))
			for f: int in 240:
				await process_frame
		"chart", "chartzoom", "course":
			sea._boat.position = Vector2(-1500, 2600)
			sea._course.set_to(Vector2(9000, 9000), "Abyss edge", what == "course")
			for f: int in 30:
				await process_frame
			if what != "course":
				sea._open_chart()
				await process_frame
				if what == "chart":
					sea._chart._scale_to = sea._chart._fit_scale() * 1.1
					sea._chart._center = Vector2(0, 9500)
				else:
					sea._chart._scale_to = 0.07
					sea._chart._center = Vector2(500, 1500)
				for f: int in 40:
					await process_frame
				if what == "chartzoom":
					var marks: Array = sea._chart._all_marks().filter(func(m: Dictionary) -> bool: return m["kind"] == "regular")
					if not marks.is_empty():
						sea._chart._open_card(marks[0])
			else:
				for f: int in 60:
					await process_frame
		"bottle":
			var bs: Array = Explore.bottles_around(0, 3000, 6000, Clock.now_ms())
			if not bs.is_empty():
				var bp: Dictionary = Explore.bottle_pos(bs[0], Clock.now_ms() / 1000.0)
				sea._boat.position = Vector2(float(bp["x"]) - 220.0, float(bp["y"]) + 40.0)
			sea._zoom_to = 1.5
			for f: int in 90:
				await process_frame
		"kelp":
			var bed: Dictionary = (Rules.data()["flow"]["kelp"] as Array)[3]
			sea._boat.position = Vector2(float(bed["x"]) - float(bed["r"]) * 0.3, float(bed["y"]))
			sea._zoom_to = 1.0
			for f: int in 60:
				await process_frame
		"cloud":
			sea._boat.position = Vector2(-1500, 2600)
			sea._sky._next = 0.0
			await process_frame
			await process_frame
			for c: Dictionary in sea._sky._clouds:
				if c["on"]:
					c["x"] = sea._boat.position.x - float(c["w"]) * 0.7
					c["y"] = sea._boat.position.y - 260.0
					c["age"] = 5.0
			for f: int in 20:
				await process_frame
		"digsite":
			var site: Dictionary = (Rules.data()["digSites"] as Array)[0]
			sea._boat.position = Vector2(float(site["x"]) + 160.0, float(site["y"]) + 60.0)
			for f: int in 90:
				await process_frame
		"bloom":
			p["fishing_xp"] = float((Rules.data()["xpTable"] as Array)[89])
			sea._boat.position = Vector2(300, 14100)
			sea._boat.heading = 0.0
			sea._boat.target = Vector2(1400, 14300)
			for f: int in 90:
				await process_frame
		"angler":
			# Finn (The Long Cast). FINN_STEP: "sea" (him on the water with his
			# mark, the story line), "talk" (the first meeting), "offer" (his
			# lines run through to the slip), "half" (a job half done, the line
			# under the level bar), "ready" (the job done: the slip and Hand it
			# over), "sealed" (the seal pressed).
			var step: String = OS.get_environment("FINN_STEP")
			var h: Dictionary = Finn.haunt(0, 1)
			sea._boat.position = Vector2(float(h["x"]) + 230.0, float(h["y"]) + 140.0)
			var sv: Dictionary = sea.session.save
			sv["profile"]["finn_encounters"] = 0
			sv["profile"]["finn_seen_beats"] = []
			sv["profile"]["finn_quest"] = null
			sv["profile"]["finn_quests_done"] = []
			sv["profile"]["finn_revealed"] = false
			if step in ["half", "ready", "sealed"]:
				Finn.speak(sea.session.store, sea.session.uid, 0.0)
				var sp: Dictionary = {}
				for f: Dictionary in sv["species"]:
					if f["habitat"] == "shallows":
						sp = f
						break
				var lt: Dictionary = sv["lifetime"]
				var k: String = Js.key(sp["id"])
				var n0: float = Js.num((lt.get(k, {}) as Dictionary).get("n"))
				lt[k] = { "n": n0 + (5.0 if step == "half" else 8.0), "last": "2026-10-01T00:00:00.000Z" }
			for f: int in 70:
				await process_frame
			if step in ["talk", "offer", "ready", "sealed"]:
				sea._open_finn()
				for f: int in 40:
					await process_frame
				var sc: FinnScene = null
				for c: Node in sea._hud_layer.get_children():
					if c is FinnScene:
						sc = c
				if step == "offer":
					for i: int in 12:
						sc._line.finish()
						await process_frame
						if not sc._queue.is_empty():
							sc._next_line()
						for f: int in 4:
							await process_frame
					for f: int in 40:
						await process_frame
				elif step == "sealed":
					for f: int in 30:
						await process_frame
					sc._turn_in()
					for f: int in 26:
						await process_frame
				else:
					for f: int in 160:
						await process_frame
		"crossing":
			# North through the arch and back (run with --write-movie): the
			# boat changes, the row changes, the name over the water.
			sea._boat.position = Vector2(North.GATE_X, Explore.NORTH_WALL + 520.0)
			sea._boat.heading = -PI / 2.0
			for f: int in 20:
				await process_frame
			sea._boat.target = Vector2(North.GATE_X, Explore.NORTH_WALL - 900.0)
			for f: int in 170:
				await process_frame
			sea._boat.target = Vector2(North.GATE_X, Explore.NORTH_WALL + 700.0)
			for f: int in 170:
				await process_frame
		"film":
			# One whole cast, for a film (run with --write-movie and --fixed-fps):
			# a moment still, the cast, a short wait, the bite, a perfect
			# strike, the fight and the card.
			sea._boat.position = Vector2(-1500, 2600)
			sea._zoom_to = 2.4
			sea._camera.zoom = Vector2(2.4, 2.4)
			hud._close_card()
			hud._set_phase("idle")
			# The rules keep real time; jump their clock past the wait, as
			# the smoke test does, so the film can cut the wait short.
			var ahead: Array = [0.0]
			Clock.install(func() -> float: return Time.get_unix_time_from_system() * 1000.0 + float(ahead[0]))
			for f: int in 30:
				await process_frame
			hud.cast()
			for f: int in 6:
				await process_frame
			ahead[0] = float(hud._shot["waitMs"]) + 1000.0
			hud._wait_left = 2.6
			var guard: int = 0
			while hud.phase != "hooked" and guard < 900:
				guard += 1
				await process_frame
			for f: int in 24:
				await process_frame
			guard = 0
			while hud._dial.zone_at(hud._dial.angle) != "perfect" and guard < 900:
				guard += 1
				await process_frame
			hud._dial.strike()
			for f: int in 100:
				await process_frame
		"fight":
			# Mid-fight: strike (FIGHT_R: perfect, catch, miss, penalty) and
			# shoot FIGHT_T seconds in.
			sea._boat.position = Vector2(-1500, 2600)
			sea._zoom_to = 2.0
			sea._camera.zoom = Vector2(2.0, 2.0)
			sea._boat.set_pose("wait")
			for f: int in 20:
				await process_frame
			var res: String = OS.get_environment("FIGHT_R") if OS.get_environment("FIGHT_R") != "" else "perfect"
			hud._on_struck(res, 0.0)
			await create_timer(float(OS.get_environment("FIGHT_T")) if OS.get_environment("FIGHT_T") != "" else 0.4).timeout
		"waitrest":
			# The same boat, waiting then reeled in: does the hull move?
			sea._boat.position = Vector2(-1500, 2600)
			sea._zoom_to = 2.2
			sea._camera.zoom = Vector2(2.2, 2.2)
			sea._boat.set_pose("wait")
			for f: int in 30:
				await process_frame
			var im: Image = root.get_viewport().get_texture().get_image()
			im.save_png(OS.get_cmdline_user_args()[0].replace(".png", "_a.png"))
			sea._boat.set_pose("rest")
			for f: int in 2:
				await process_frame
		"waiting":
			sea._boat.position = Vector2(-1500, 2600)
			sea._zoom_to = 1.4
			sea._boat.set_pose("wait")
			for f: int in 40:
				await process_frame
		"wake", "still":
			sea._boat.position = Vector2(-1500, 2600)
			if what == "wake":
				sea._sky._next = 0.0
				sea._boat.heading = 0.3
				sea._boat.target = Vector2(2500, 3800)
				for f: int in 160:
					await process_frame
			else:
				sea._zoom_to = 1.6
				for f: int in 200:
					await process_frame
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
			for f: int in 70:
				await process_frame
		"hold":
			hud._open_hold()
			for f: int in 70:
				await process_frame
		"wheel":
			sea._open_wheel()
			for f: int in 30:
				await process_frame
		"almanac":
			hud._open_log()
			for f: int in 40:
				await process_frame
		"giants":
			hud._open_log()
			for f: int in 10:
				await process_frame
			var a: Almanac = sea._locker._almanac
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
		"stow":
			sea._zoom_to = 1.6
			sea._camera.zoom = Vector2(1.6, 1.6)
			hud._shot["crateTier"] = "gold"
			hud._set_phase("result")
			hud._stow_card({ "stowed": "gold", "stash": { "gold": 2.0, "wooden": 1.0 } })
			for f: int in 45:
				await process_frame
		"baitpick":
			hud._toggle_bait_picker()
			for f: int in 20:
				await process_frame
		"arch", "anchorage":
			if OS.get_environment("SHIP_TIER") != "":
				p["ship_tier"] = float(OS.get_environment("SHIP_TIER"))
			sea._boat.position = Vector2(North.GATE_X, Explore.NORTH_WALL + (float(OS.get_environment("SHOT_DY")) if OS.get_environment("SHOT_DY") != "" else 700.0)) if what == "arch" else Vector2(-500.0, -3700.0)
			sea._boat.heading = -PI / 2.0
			for f: int in 90:
				await process_frame
		"worldchart":
			sea._open_chart()
			await process_frame
			sea._chart._scale_to = sea._chart._fit_scale()
			sea._chart._scale = sea._chart._fit_scale()
			sea._chart._center = WorldMap.WORLD_CENTRE
			for f: int in 40:
				await process_frame
		"clue":
			p["clue_hunts"] = { "easy": Clues.make_hunt("easy", 777, sea.session.save), "hard": Clues.make_hunt("hard", 4242, sea.session.save) }
			hud.refresh()
			for f: int in 40:
				await process_frame
		"achievements":
			RulesApi.run(sea.session.store, sea.session.uid, "setSeaPos", [0, 2600])
			hud.refresh()
			hud.open_guide("achievements")
			for f: int in 40:
				await process_frame
		"crewhall", "crewroster", "crewhalltier":
			# A few days of boards signed, so the roster has hands in it.
			for d: int in (6 if what != "crewhall" else 0):
				var st: Dictionary = RulesApi.run(sea.session.store, sea.session.uid, "getCrewState", [])
				for c: Dictionary in st["board"]:
					RulesApi.run(sea.session.store, sea.session.uid, "recruitCrew", [c["id"]])
				p["last_free_recruit_date"] = "old%d" % d
			p["crew_notices"] = { "harbor_bill": 2.0 }
			var ch: CrewHall = CrewHall.new()
			ch.session = sea.session
			ch.room = { "crewhall": "recruit", "crewroster": "roster", "crewhalltier": "hall" }[what]
			sea._room_layer.add_child(ch)
			for f: int in 20:
				await process_frame
			var list: Array = Js.list(ch._state.get("board" if what == "crewhall" else "roster"))
			if not list.is_empty() and what != "crewhalltier":
				ch._pick = list[0]
				ch._pick_kind = "board" if what == "crewhall" else "roster"
				ch._draw_room()
			for f: int in 30:
				await process_frame
		"levels":
			hud.open_guide()
			for f: int in 40:
				await process_frame
		"boattab":
			p["unlocked_boats"] = ["oak", "fire", "golden"]
			hud._open_loadout()
			for f: int in 30:
				await process_frame
			sea._locker._show_tab("boat")
			for f: int in 40:
				await process_frame
		"crates", "crateopen":
			p["crate_stash"] = { "gold": 2.0, "wooden": 3.0, "ancient": 1.0 }
			p["unlocked_hats"] = ["gray", "spotted"]
			p["unlocked_pets"] = ["parrot_red", "seal_brown", "crab_blue"]
			hud._open_loadout()
			for f: int in 30:
				await process_frame
			sea._locker._show_tab("crates")
			for f: int in 30:
				await process_frame
			if what == "crates":
				var sc: ScrollContainer = sea._locker._body.get_child(sea._locker._body.get_child_count() - 1)
				sc.scroll_vertical = 0
				for f: int in 5:
					await process_frame
			if what == "crateopen":
				sea._locker._open_crate("gold")
				await create_timer(float(OS.get_environment("CRATE_T")) if OS.get_environment("CRATE_T") != "" else 2.6).timeout
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
			if OS.get_environment("LV_ONE") != "":
				lu.claim = { "from": 14.0, "to": 15.0, "granted": [{ "level": 15.0, "reward": (Rules.data()["levelRewards"] as Dictionary).get("15", {}) }] }
			hud._action.visible = false
			hud.add_child(lu)
			await create_timer(1.8).timeout
	if args.has("nosun") and main.get_child_count() > 0:
		var sx: Node = main.get_child(main.get_child_count() - 1)
		if sx is Sea:
			(sx as Sea)._sun.visible = false
	if args.has("noshore") and main.get_child_count() > 0:
		var sy: Node = main.get_child(main.get_child_count() - 1)
		if sy is Sea:
			(sy as Sea)._water.set_shader_parameter("u_shore_on", 0.0)
	var wait: int = 150 if what == "crate" else (160 if what in ["card", "finn", "rankup", "slain"] else 50)
	for f: int in wait:
		await process_frame
	var img: Image = root.get_texture().get_image()
	img.save_png(out)
	print("  saved ", out)
	quit()


## Set the clock inside a front of this kind over (0, 2600): at u of its
## stay there (0.5 the middle), or (u < 0) just after its edge arrives.
func _to_front(sea: Sea, kind: String, u: float) -> void:
	var k0: int = int(floor(Clock.now_ms() / Weather.SLOT_MS))
	for k: int in 400:
		var fr: Dictionary = Weather.front(k0 + k)
		if not fr.is_empty() and fr["kind"] == kind:
			var spot: Vector2 = Vector2(0, 2600)
			var pass_t: Vector2 = Weather.passage(fr, spot)
			var tk: float = lerpf(pass_t.x, pass_t.y, u) if u >= 0.0 else pass_t.x + 2000.0
			Clock.install(func() -> float: return tk)
			sea._boat.position = spot
			return
