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
	for w: String in ["dial", "card", "crate", "golden", "level", "look", "loadout", "hold", "almanac", "giants", "boss", "slain", "finn", "rankup", "dock", "ashore", "market", "tackle", "rods", "shelf", "buyer", "title", "crew", "purse", "vote", "shipyard", "yardport", "hotspot", "isle", "landed", "wanderers", "peddler", "runner", "regular", "talk", "crest", "portal", "portalsheet", "deadportal", "wake", "still", "waiting", "bloom", "front", "frontedge", "levels", "achievements", "clue", "arch", "anchorage", "worldchart", "crewhall", "crewroster", "crewhalltier", "crossing", "cloud", "digsite", "current", "kelp", "bottle", "chart", "chartzoom", "course", "wheel", "waitrest", "titlenew", "stow", "crates", "crateopen", "fight", "film", "boattab", "orders", "trawls", "baitpick", "angler", "journal", "chaptercard", "den", "parlor", "crewtrunk", "skinreveal", "finnmoment", "crewbunks", "chartroom", "battle", "coop", "ready", "campaign", "puzzle", "dive"]:
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
		# SETTINGS_TAB: the settings page open on that tab.
		if OS.get_environment("SETTINGS_TAB") != "":
			var ss: SettingsSheet = SettingsSheet.new()
			ss._tab = OS.get_environment("SETTINGS_TAB")
			main._screen.add_child(ss)
		for f: int in 40:
			await process_frame
		root.get_texture().get_image().save_png(out)
		print("  saved ", out)
		quit()
		return
	var sea: Sea = main.get_child(main.get_child_count() - 1)
	# PAUSE=1: the Esc menu over the sea.
	if OS.get_environment("PAUSE") == "1":
		for f: int in 60:
			await process_frame
		var esc: InputEventAction = InputEventAction.new()
		esc.action = "fish_back"
		esc.pressed = true
		main._unhandled_input(esc)
		for f: int in 20:
			await process_frame
		root.get_texture().get_image().save_png(out)
		print("  saved ", out)
		quit()
		return
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
			# MARKET_SELL: "tile" sells the first stack, "all" the lot (the
			# counter's animations), shot mid-way.
			var how: String = OS.get_environment("MARKET_SELL")
			if how != "":
				for f: int in 20:
					await process_frame
				var mr: MarketRoom = sea._room_layer.get_child(0)
				var tiles: Array = mr.find_children("*", "", true, false).filter(func(n: Node) -> bool: return n is Button and (n as Control).custom_minimum_size == MarketRoom.TILE)
				if how == "tile":
					mr._sell_tile(tiles[0], mr._entries().filter(func(e: Dictionary) -> bool: return e["qty"] > 0)[0])
				else:
					mr._sell_lot(tiles[0].get_parent())
				for f: int in int(OS.get_environment("SELL_F")) if OS.get_environment("SELL_F") != "" else 14:
					await process_frame
		"tackle", "rods", "shelf":
			sea._enter_room("tackle")
			await process_frame
			var room: TackleRoom = sea._room_layer.get_child(0)
			if what == "rods":
				room._open("rod")
			if what == "shelf":
				room._open("bait")
			if OS.get_environment("TACKLE") != "":
				p["unlocked_hats"] = ["brown", "gray"]
				p["has_auto_caster"] = true
				p["has_phantom_hook"] = true
				room._open(OS.get_environment("TACKLE"))
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
			if step == "catch":
				# Finn landing one: the shot mid-arc.
				sea._finn._next_catch = 0.0
				for f: int in int(OS.get_environment("CATCH_F")) if OS.get_environment("CATCH_F") != "" else 62:
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
		"journal", "chaptercard":
			# The Journal (JOURNAL_TAB story or people), or a chapter card
			# (CARD_CLOSING set for the closing one), on a captain partway in.
			var sv2: Dictionary = sea.session.save
			sv2["profile"]["finn_quests_done"] = Array(OS.get_environment("FINN_DONE").split(",")) if OS.get_environment("FINN_DONE") != "" else ["q1", "q2", "q3", "q21", "q22", "q23", "q4"]
			sv2["profile"]["finn_seen_beats"] = ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"]
			sv2["profile"]["finn_encounters"] = 14
			sv2["profile"]["finn_quest"] = null
			Finn.speak(sea.session.store, sea.session.uid, 14.0)
			for f: int in 30:
				await process_frame
			if what == "journal":
				hud.open_journal(OS.get_environment("JOURNAL_TAB") if OS.get_environment("JOURNAL_TAB") != "" else "story")
			else:
				var cc: ChapterCard = ChapterCard.new()
				cc.chapter = Finn.chapters()[1] if OS.get_environment("CARD_CLOSING") == "" else Finn.chapters()[0]
				cc.closing = OS.get_environment("CARD_CLOSING") != ""
				hud.add_child(cc)
			for f: int in 120:
				await process_frame
		"den":
			# The Den. DEN_GAME: slots, roulette or blackjack; DEN_PLAY: 1 plays
			# one round and shoots it mid-way (DEN_F frames in).
			var dp: Dictionary = sea.session.profile()
			dp["casino_chips"] = 2500.0
			dp["fishing_xp"] = float(Rules.data()["xpTable"][29])
			sea._enter_room("den")
			for f: int in 20:
				await process_frame
			var den: DenRoom = sea._room_layer.get_child(0)
			if OS.get_environment("DEN_GAME") != "":
				den._open(OS.get_environment("DEN_GAME"))
				for f: int in 10:
					await process_frame
			if OS.get_environment("DEN_FORCE") != "":
				dp["slots_force_next"] = OS.get_environment("DEN_FORCE")
			if OS.get_environment("DEN_PLAY") != "":
				var g: Node = den._table.get_child(den._table.get_child_count() - 1)
				g.call("play_for_shot")
			for f: int in int(OS.get_environment("DEN_F")) if OS.get_environment("DEN_F") != "" else 20:
				await process_frame
		"parlor":
			# The Parlor. PARLOR_TAB: board, king or capstan; PARLOR_PLAY: 1
			# turns the first card (or reveals the rung, or spins).
			var pp: Dictionary = sea.session.profile()
			pp["fishing_xp"] = float(Rules.data()["xpTable"][29])
			Parlor.board(sea.session.store, sea.session.uid)
			Parlor._p(sea.session.store, sea.session.uid)["dealt_at"] = Clock.now_ms() - 28800000.0 * 4.0
			var pr: ParlorRoom = ParlorRoom.new()
			pr.session = sea.session
			pr.tab = OS.get_environment("PARLOR_TAB") if OS.get_environment("PARLOR_TAB") != "" else "board"
			sea._room_layer.add_child(pr)
			for f: int in 20:
				await process_frame
			if OS.get_environment("PARLOR_PLAY") != "":
				match pr.tab:
					"board":
						var hb: Array = Parlor.board(sea.session.store, sea.session.uid)["hand"]
						pr._turn(hb[0], pr._body.get_child(1).get_child(0))
					"king":
						pr._king_rung(pr._body.get_child(0).get_child(1))
					"capstan":
						pr._cap_spin()
			for f: int in int(OS.get_environment("PARLOR_F")) if OS.get_environment("PARLOR_F") != "" else 30:
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
		"battle":
			# A fight on the water: Pete's raid from the Gunwharf. BATTLE_STEP:
			# "enter" (the cut and the enemy sailing in), "aim" (Fire chosen,
			# the bar up), "round" (a round played out, SHOT_F frames in).
			var bdb: CaptainStore = sea.session.store
			var bu: String = sea.session.uid
			p["expedition_xp"] = 2000.0
			p["ship_tier"] = 4.0
			for d: int in 2:
				var st1: Dictionary = RulesApi.run(bdb, bu, "getCrewState", [])
				for c: Dictionary in st1["board"]:
					RulesApi.run(bdb, bu, "recruitCrew", [c["id"]])
				p["last_free_recruit_date"] = "old%d" % d
			var ids2: Array = (RulesApi.run(bdb, bu, "getCrewState", [])["roster"] as Array).map(func(m: Dictionary) -> float: return float(m["id"]))
			for k: int in mini(3, ids2.size()):
				RulesApi.run(bdb, bu, "assignToRaid", [ids2[k], float(k)])
			if sea._berths.has("gunwharf"):
				sea._boat.position = (sea._berths["gunwharf"] as Node2D).position + Vector2(-500, 200)
			for f: int in 60:
				await process_frame
			sea._launch(OS.get_environment("BATTLE_RAID") if OS.get_environment("BATTLE_RAID") != "" else "corsairs_reckoning", "")
			var bst: BattleStage = null
			for f: int in 10:
				await process_frame
			for n: Node in sea._hud_layer.get_children():
				if n is BattleStage:
					bst = n
			var step: String = OS.get_environment("BATTLE_STEP")
			if step == "auto":
				bst.autoplay = true
			# BATTLE_SHOW stages one moment: flares, summon, wall, tide, aim.
			var show: String = OS.get_environment("BATTLE_SHOW")
			if show != "":
				for f: int in 170:
					await process_frame
				match show:
					"flares":
						bst.b["flares"] = { "name": "False Colors", "count": 9, "feint": 0.22, "cluster": 0.34, "fuse": 2.5, "per": 6.0 }
						bst._flares()
					"summon":
						bst._summon({ "kind": "leviathan", "name": "The Primeval Maw", "image": "/fish/megalodon.png", "color": "#f87171", "hits": [{ "seat": 0, "dmg": 41.0, "hp": 30.0 }], "enemyHp": 100.0 })
						for f: int in int(OS.get_environment("SHOT_F")):
							await process_frame
						root.get_texture().get_image().save_png(out)
						print("  saved ", out)
						quit()
						return
					"wall":
						var en: Dictionary = bst.b["enemy"]
						en["aegis"] = { "name": "The Last Wall", "left": 4.0, "of": 6.0 }
						en["burn"] = { "turns": 2.0, "dmg": 6.0 }
						en["ward"] = 2.0
						bst.b["seats"][0]["shield"] = 20.0
						bst.b["seats"][0]["freeze"] = 1.0
					"deckmenu":
						# The deck with a chooser open (MENU "", "fire" or "special").
						while bst._busy:
							await process_frame
						bst.b["seats"][0]["charges"] = 3.0
						bst.b["seats"][0]["hp"] = 50.0
						bst._menu = OS.get_environment("MENU")
						bst._paint_actions()
						for f: int in 20:
							await process_frame
						root.get_texture().get_image().save_png(out)
						print("  saved ", out)
						quit()
						return
					"crewsummon":
						# A crew summon (SUM_CLS, SUM_SKIN a skin's filename), captured FX_S in.
						while bst._busy:
							await process_frame
						var sc: Dictionary = bst.b["seats"][0]["crew"][0]
						if OS.get_environment("SUM_SKIN") != "":
							sc["filename"] = OS.get_environment("SUM_SKIN")
						var scls: String = OS.get_environment("SUM_CLS") if OS.get_environment("SUM_CLS") != "" else "blitz"
						var sev: Dictionary = { "t": "ability", "seat": 0, "crew": sc["id"], "cls": scls, "name": sc.get("name", ""), "target": 0, "heal": 12.0, "hits": [4.0, 5.0, 6.0], "dmg": 15.0, "charges": 2.0, "shield": 8.0 }
						bst._one(sev)
						await create_timer(float(OS.get_environment("FX_S")) if OS.get_environment("FX_S") != "" else 1.0).timeout
						root.get_texture().get_image().save_png(out)
						print("  saved ", out)
						quit()
						return
					"allev":
						# Every motion the stage has, played in turn (a runtime check).
						while bst._busy:
							await process_frame
						var evs: Array = [
							{ "t": "burn", "seat": 0, "dmg": 3.0, "hp": 70.0 }, { "t": "eBurn", "dmg": 3.0, "hp": 15.0 },
							{ "t": "frozen", "seat": 0 }, { "t": "eFrozen" }, { "t": "ablaze", "seat": 0 }, { "t": "iced", "seat": 0 },
							{ "t": "eAblaze", "seat": 0, "dmg": 2.0 }, { "t": "eIced", "seat": 0 }, { "t": "fumble", "seat": 0, "chip": 4.0, "hp": 66.0 },
							{ "t": "bite", "seat": 0, "charges": 1.0 }, { "t": "loaded", "seat": 0, "charges": 2.0 }, { "t": "strip", "seat": 0, "charges": 0.0 },
							{ "t": "leech", "seat": 0, "heal": 4.0, "hp": 70.0 }, { "t": "rack", "seat": 0, "landed": ["weaken"] }, { "t": "eHeal", "hp": 18.0, "heal": 2.0, "why": "Resilient" },
							{ "t": "refund", "seat": 0 }, { "t": "seize", "seat": 0 }, { "t": "steal", "seat": 0, "kept": true, "charges": 2.0, "eCharges": 0.0 },
							{ "t": "overkill", "seat": 0, "heal": 5.0, "hp": 72.0 }, { "t": "tithe", "seat": 0, "heal": 5.0 }, { "t": "coil", "seat": 0, "coils": 2.0, "of": 4.0 },
							{ "t": "streak", "seat": 0, "n": 3.0, "pct": 9.0 }, { "t": "streakBroken", "seat": 0 }, { "t": "eStatus", "seat": 0, "status": "corrode" },
							{ "t": "checkMet", "line": "Countered!" }, { "t": "checkFail", "line": "Too slow." }, { "t": "eSpecial", "name": "Hex", "line": "" },
							{ "t": "bond", "seat": 0, "to": 0, "text": "Echo  +1 ball" }, { "t": "bond", "seat": 0, "to": -1, "text": "Marked" }, { "t": "bond", "seat": 0, "to": 0, "text": "+6" },
							{ "t": "eBroadside", "action": "volley" }, { "t": "drum", "seat": 0, "name": "War Drum", "refreshed": "x" },
							{ "t": "comboNote", "foe": 0, "text": "War Drums  +1 ball" }, { "t": "comboBroken", "foe": 0, "name": "Hammer and Anvil" },
							{ "t": "execute", "seat": 0, "kind": "deathMark" },
							{ "t": "reaction", "id": "powder_keg", "name": "Powder Keg", "seat": 0, "foe": 0, "others": [], "enemyHp": 5.0, "dmg": 4.0, "new": [] },
						]
						for ev1: Dictionary in evs:
							await bst._one(ev1)
						print("  allev played ", evs.size())
					"wear":
						# What a ship wears (WEAR_SET a or b): statuses, coils, the co-op marks.
						var we: Dictionary = bst.b["enemy"]
						var me0: Dictionary = bst.b["seats"][0]
						if OS.get_environment("WEAR_SET") == "b":
							for st0: String in ["feeble", "enrage", "regen", "fortify"]:
								Battle.apply_status(we["statuses"], st0, 0.2, 9.0)
							we["fogged"] = 0.6
							we["burn"] = { "turns": 9.0, "dmg": 3.0 }
							Battle.apply_status(me0["statuses"], "blinded", 0.2, 9.0)
						else:
							for st1: String in ["marked", "corrode", "weaken", "silence", "slowed"]:
								Battle.apply_status(we["statuses"], st1, 0.2, 9.0)
							we["grip"] = { "0": 3.0 }
							we["spot"] = { "by": 1, "pct": 0.2 }
							we["boarded"] = true
							me0["freeze"] = 1.0
					"mega":
						var ms: Dictionary = bst.b["seats"][0]
						ms["mega"] = Armory.augment(OS.get_environment("MEGA") if OS.get_environment("MEGA") != "" else "railgun")
						ms["maxCharges"] = 4.0
						ms["charges"] = 4.0
						bst.b["enemy"]["pattern"] = ["reload"]
						while bst._busy:
							await process_frame
						bst._choose("mega")
						for f: int in 20:
							await process_frame
						for bar: Node in bst.find_children("", "AimBar", true, false):
							(bar as AimBar)._pos = (bar as AimBar)._zone
							(bar as AimBar).lock()
					"stamp":
						bst._stamp(OS.get_environment("TIER") if OS.get_environment("TIER") != "" else "coop", true)
						await create_timer(float(OS.get_environment("FX_S")) if OS.get_environment("FX_S") != "" else 0.6).timeout
						root.get_texture().get_image().save_png(out)
						print("  saved ", out)
						quit()
						return
					"fx":
						# One crafted event, captured FX_S seconds in: FX_EV fire,
						# volley, crit, edodge, ecrit, reload, railgun, barrage, nuke.
						while bst._busy:
							await process_frame
						var ev0: Dictionary = {}
						match OS.get_environment("FX_EV"):
							"fire":
								ev0 = { "t": "shot", "seat": 0, "action": "fire", "aim": "hit", "dmg": 9.0, "enemyHp": 11.0, "foe": 0 }
							"crit":
								ev0 = { "t": "shot", "seat": 0, "action": "fire", "aim": "critical", "dmg": 17.0, "enemyHp": 3.0, "foe": 0 }
							"volley":
								ev0 = { "t": "shot", "seat": 0, "action": "volley", "aim": "hit", "dmg": 16.0, "enemyHp": 4.0, "foe": 0 }
							"edodge":
								ev0 = { "t": "eShot", "target": 0, "action": "fire", "crit": false, "dodged": true, "dmg": 0.0, "hp": 77.0, "foe": 0 }
							"ecrit":
								ev0 = { "t": "eShot", "target": 0, "action": "volley", "crit": true, "dmg": 15.0, "hp": 62.0, "foe": 0 }
							"reload":
								ev0 = { "t": "reload", "seat": 0, "charges": 2.0 }
							_:
								ev0 = { "t": "shot", "seat": 0, "action": "mega", "mega": OS.get_environment("FX_EV"), "aim": "critical", "dmg": 48.0, "enemyHp": 1.0, "foe": 0 }
						bst._busy = true
						bst._one(ev0)
						await create_timer(float(OS.get_environment("FX_S")) if OS.get_environment("FX_S") != "" else 0.5).timeout
						root.get_texture().get_image().save_png(out)
						print("  saved ", out)
						quit()
						return
					"card":
						while bst._busy:
							await process_frame
						if OS.get_environment("CARD_BOSS") != "":
							var guard: int = 0
							while not bst.b["enemy"]["boss"] and guard < 20:
								guard += 1
								Battle.next_fight(bst.b)
							bst._portrait = Skipper.tex(str(bst.b["enemy"].get("portrait", "")).trim_prefix("/"))
							Battle.apply_status(bst.b["enemy"]["statuses"], "fortify", 0.3, 2.0)
							bst.b["enemy"]["burn"] = { "turns": 2.0, "dmg": 9.0 }
						if OS.get_environment("CARD_CAPTAIN") != "":
							bst._open_captain_card(0)
						else:
							bst._open_enemy_card()
						if OS.get_environment("CARD_SCROLL") != "":
							for f: int in 10:
								await process_frame
							for scn: Node in bst._card.find_children("", "ScrollContainer", true, false):
								(scn as ScrollContainer).scroll_vertical = int(OS.get_environment("CARD_SCROLL"))
					"flee":
						while bst._busy:
							await process_frame
						bst._flee()
					"tide":
						bst._tide(Rules.data()["tides"]["pool"][int(OS.get_environment("TIDE_I")) if OS.get_environment("TIDE_I") != "" else 0], "A TIDE TURNS")
					"aim":
						bst.b["seats"][0]["charges"] = 3.0
						var ak: String = OS.get_environment("AIM_KIND") if OS.get_environment("AIM_KIND") != "" else "decoys"
						if ak in ["blinded", "narrowed"]:
							Battle.apply_status(bst.b["seats"][0]["statuses"], ak, 0.12 if ak == "blinded" else 0.35, 2.0)
							bst.b["enemy"]["fog"] = 0.0
						else:
							bst.b["seats"][0]["afflict"] = { "kind": ak, "passes": 2.0 }
						bst.b["enemy"]["fog"] = 0.5
						bst.b["enemy"]["critDrift"] = 0.5
						while bst._busy:
							await process_frame
						bst._choose("fire")
			for f: int in 150:
				await process_frame
			if step == "aim" or step == "round":
				bst._choose("reload")
				for f: int in 260:
					await process_frame
				bst._choose("fire")
				for f: int in 40:
					await process_frame
				if step == "round":
					for bar: Node in bst.find_children("", "AimBar", true, false):
						(bar as AimBar).lock()
			for f: int in int(OS.get_environment("SHOT_F")) if OS.get_environment("SHOT_F") != "" else 10:
				await process_frame
			# RECAP=1: the combat log's recap opened over it.
			if OS.get_environment("RECAP") == "1":
				bst._clog._show_recap()
				for f: int in 12:
					await process_frame
		"ready":
			# The raid's entry screen. READY_MODE "solo" (alone at Pete) or
			# "line" (a Charter's line of three on Co-op, one not yet ready).
			var rdb: CaptainStore = sea.session.store
			var ru: String = sea.session.uid
			p["expedition_xp"] = 2000.0
			p["ship_tier"] = 4.0
			rdb.add_clear(ru, "corsairs_reckoning", 9000.0)
			rdb.add_clear(ru, "corsairs_reckoning@coop", 9000.0)
			for d: int in 2:
				var rst: Dictionary = RulesApi.run(rdb, ru, "getCrewState", [])
				for c: Dictionary in rst["board"]:
					RulesApi.run(rdb, ru, "recruitCrew", [c["id"]])
				p["last_free_recruit_date"] = "old%d" % d
			var rids: Array = (RulesApi.run(rdb, ru, "getCrewState", [])["roster"] as Array).map(func(m: Dictionary) -> float: return float(m["id"]))
			for k: int in mini(4, rids.size()):
				RulesApi.run(rdb, ru, "assignToRaid", [rids[k], float(k)])
			var rraid: String = OS.get_environment("READY_RAID") if OS.get_environment("READY_RAID") != "" else "corsairs_reckoning"
			var rs: ReadyScreen = ReadyScreen.new()
			rs.sea = sea
			if OS.get_environment("READY_MODE") == "line":
				var rt: RaidTable = RaidTable.new()
				root.add_child(rt)
				var card: Dictionary = RaidTable.card_of(sea.session, rraid)
				var card2: Dictionary = card.duplicate(true)
				card2["face"] = { "characterColor": "blue", "hat": null }
				card2["shipTier"] = 6.0
				var card3: Dictionary = card.duplicate(true)
				card3["face"] = { "characterColor": "pink", "hat": "golden" }
				card3["crew"] = []
				var mem: Array = [{ "key": "anna", "name": "Anna", "ready": true, "card": card }, { "key": "ben", "name": "Ben_the_Bold", "ready": true, "card": card2 }, { "key": "cal", "name": "Cal", "ready": false, "card": card3 }]
				rt._state({ "phase": "muster", "seq": 1, "raidId": rraid, "nodeId": "pete", "by": "anna", "tier": "coop", "members": mem, "tiers": RaidTable.tiers_open(mem) })
				rs.table = rt
				rs.my_key = "anna"
			else:
				rs.raid_id = rraid
				rs.node_id = "pete"
			sea._hud_layer.add_child(rs)
			for f: int in int(OS.get_environment("SHOT_F")) if OS.get_environment("SHOT_F") != "" else 30:
				await process_frame
		"coop":
			# A Charter's raid together, as a crewmate's screen sees it: the
			# table's states fed by hand (two ships, Ben's hull a Shipmate),
			# COOP_STEP: "plan" (the deck, Ben still choosing), "wait" (orders
			# given), "round" (a round of both ships played), "target" (a
			# mender's order aimed at Ben).
			var kdb: CaptainStore = sea.session.store
			var ku: String = sea.session.uid
			p["expedition_xp"] = 2000.0
			p["ship_tier"] = 4.0
			for d: int in 2:
				var kst: Dictionary = RulesApi.run(kdb, ku, "getCrewState", [])
				for c: Dictionary in kst["board"]:
					RulesApi.run(kdb, ku, "recruitCrew", [c["id"]])
				p["last_free_recruit_date"] = "old%d" % d
			var kids: Array = (RulesApi.run(kdb, ku, "getCrewState", [])["roster"] as Array).map(func(m: Dictionary) -> float: return float(m["id"]))
			for k: int in mini(3, kids.size()):
				RulesApi.run(kdb, ku, "assignToRaid", [kids[k], float(k)])
			var tb: RaidTable = RaidTable.new()
			root.add_child(tb)
			var s0: Dictionary = Battle.seat_for(kdb, ku, "Anna")
			s0["key"] = "anna"
			var s1: Dictionary = Battle.seat_for(kdb, ku, "Ben")
			s1["key"] = "ben"
			if OS.get_environment("COOP_TIER") != "":
				Dice.install(Dice.Mulberry32.new(int(OS.get_environment("COOP_SEED")) if OS.get_environment("COOP_SEED") != "" else 5))
			var kb: Dictionary = Battle.begin("corsairs_reckoning", [s0, s1], OS.get_environment("COOP_TIER") if OS.get_environment("COOP_TIER") != "" else "normal")
			var mate: Shipmate = sea._mate("ben")
			mate.set_mate_name("Ben")
			mate.set_look(Skipper.look_of(p))
			var gate: Vector2 = North.SEA_GATE + Vector2(-300, -1300)
			var mp: Vector2 = gate + BattleStage._offset(1)
			mate.state({ "x": mp.x, "y": mp.y, "facing": 1.0 })
			sea._boat.position = gate + Vector2(-400, 200)
			var seq: Array = [1]
			var push: Callable = func(ph: String, ev: Array, extra: Dictionary) -> void:
				seq[0] += 1 if ph == "playing" else 0
				var st: Dictionary = { "phase": ph, "seq": seq[0], "b": kb.duplicate(true), "ev": ev, "after": "plan", "left": 30.0, "plans": {}, "raidId": "corsairs_reckoning", "nodeId": "", "members": [{ "key": "anna", "name": "Anna" }, { "key": "ben", "name": "Ben" }], "result": "" }
				st.merge(extra, true)
				tb._state(st)
			if OS.get_environment("COOP_STEP") == "muster":
				var mu: RaidMuster = RaidMuster.new()
				mu.sea = sea
				sea._hud_layer.add_child(mu)
				tb._state({ "phase": "muster", "seq": 1, "left": 18.0, "raidId": "corsairs_reckoning", "nodeId": "pete", "by": "ben", "members": [{ "key": "ben", "name": "Ben" }, { "key": "cal", "name": "Cal" }] })
				for f: int in 30:
					await process_frame
				root.get_texture().get_image().save_png(out)
				print("  saved ", out)
				quit()
				return
			push.call("playing", [{ "t": "begin" }], {})
			sea.open_coop_battle(tb.state, "anna")
			var kst2: BattleStage = null
			for f: int in 10:
				await process_frame
			for n2: Node in sea._hud_layer.get_children():
				if n2 is BattleStage:
					kst2 = n2
			for f: int in 240:
				await process_frame
			push.call("plan", [], {})
			for f: int in 30:
				await process_frame
			var cs: String = OS.get_environment("COOP_STEP")
			if cs == "role":
				# A role's move on a field: ROLE shieldwright, sawbones, hexer, rallier, breakwater.
				var rr: String = OS.get_environment("ROLE")
				var rev: Dictionary = {}
				match rr:
					"shieldwright", "sawbones":
						rev = { "t": "role", "role": rr, "foe": 1, "to": 0, "amount": 9.0, "hp": 20.0, "shield": 9.0, "name": rr.capitalize() }
					"hexer":
						rev = { "t": "role", "role": "hexer", "foe": 1, "seat": 0, "status": "blinded", "name": "Hexer" }
					"rallier":
						rev = { "t": "role", "role": "rallier", "foe": 1, "all": [0, 1], "name": "Rallier" }
					_:
						rev = { "t": "intercept", "foe": 1, "from": 0, "seat": 0 }
				kst2._one(rev)
				await create_timer(float(OS.get_environment("FX_S")) if OS.get_environment("FX_S") != "" else 0.5).timeout
				root.get_texture().get_image().save_png(out)
				print("  saved ", out)
				quit()
				return
			if cs == "chips" or cs == "xfire":
				kb["seats"][0]["charges"] = 3.0
				kb["seats"][1]["charges"] = 3.0
				push.call("plan", [], { "plans": { "ben": { "action": "volley", "aim": "critical" } } })
				for f: int in 20:
					await process_frame
			if cs == "xfire":
				kst2._choose("fire")
				for f: int in 30:
					await process_frame
				var xev: Array = Battle.resolve(kb, [{ "action": "fire", "aim": "critical" }, { "action": "volley", "aim": "critical" }])
				push.call("playing", xev, {})
			if cs == "target":
				for c: Dictionary in kst2.b["seats"][0]["crew"]:
					kst2._plan["ability"] = { "crew": c["id"], "target": 1 }
					c["cls"] = "mender"
					break
				kst2._paint_actions()
			if cs == "wait" or cs == "round":
				kst2._choose("reload")
				for f: int in 20:
					await process_frame
				push.call("plan", [], { "plans": { "anna": { "action": "reload" } } })
			if cs == "round":
				for f: int in 40:
					await process_frame
				for sx: Dictionary in kb["seats"]:
					sx["charges"] = 3.0
				var ev: Array = Battle.resolve(kb, [{ "action": "fire", "aim": "critical", "target": 1 }, { "action": "volley", "aim": "critical", "target": 1 }])
				push.call("playing", ev, {})
			for f: int in int(OS.get_environment("SHOT_F")) if OS.get_environment("SHOT_F") != "" else 10:
				await process_frame
		"dive":
			# A gauntlet: the whole map cleared, the boat at a maelstrom.
			# DIVE_V "davy"/"don"; DIVE_STEP: "water" (the maelstrom, near),
			# "entry" (the ready check), "fight" (down, the first depth),
			# "draft" / "party" (the draft table, alone / three at it),
			# "curse", "breather", "shrine", "haul", "dead". SHOT_F frames.
			var gdb: CaptainStore = sea.session.store
			var gu: String = sea.session.uid
			p["expedition_xp"] = 3000000.0
			p["ship_tier"] = 6.0
			p["gauntlet_fathoms"] = 140.0
			p["gauntlet_deepest"] = 23.0
			p["dons_gauntlet_deepest"] = 12.0
			p["gauntlet_upgrades"] = ["second_cast", "salt_ward", "sounding_line", "vigor"]
			var gst: Dictionary = RulesApi.run(gdb, gu, "getCrewState", [])
			for c: Dictionary in gst["board"]:
				RulesApi.run(gdb, gu, "recruitCrew", [c["id"]])
			var gids: Array = (RulesApi.run(gdb, gu, "getCrewState", [])["roster"] as Array).map(func(m: Dictionary) -> float: return float(m["id"]))
			for k: int in mini(3, gids.size()):
				RulesApi.run(gdb, gu, "assignToRaid", [gids[k], float(k)])
			var gcl: Array = []
			for n: Dictionary in Campaign.nodes():
				if n["type"] == "raid":
					gdb.add_clear(gu, str(n["raidId"]), 200000.0)
				elif n["type"] == "skirmish":
					p["has_completed_practice_raid"] = true
				else:
					gcl.append(n["id"])
			p["raid_node_progress"] = { "cleared": gcl, "choices": {} }
			sea._campaign.refresh()
			sea._open_sea_gate()
			var gv: String = OS.get_environment("DIVE_V") if OS.get_environment("DIVE_V") != "" else "davy"
			var gat: Vector2 = GauntletTable.maelstrom_of(gv)
			sea._boat.position = gat + Vector2(-1150, 950)
			if OS.get_environment("CAMP_ZOOM") != "":
				sea._camera.zoom = Vector2.ONE * float(OS.get_environment("CAMP_ZOOM"))
			for f: int in 40:
				await process_frame
			var gstep: String = OS.get_environment("DIVE_STEP") if OS.get_environment("DIVE_STEP") != "" else "water"
			# The screens off the entry: the Codex, the Records, a held dive.
			var conf_ids: Array = Js.list(Gauntlet.t()["confluences"]).map(func(c: Dictionary) -> String: return str(c["id"]))
			p["gauntlet_confluences_seen"] = conf_ids.slice(0, 7)
			if gstep in ["records", "heldentry"]:
				var snap: Dictionary = { "depth": 23.0, "boons": { "powder_and_shot": 3.0, "broadside_mastery": 2.0, "grapeshot": 1.0, "bilge_pump": 2.0 }, "taken": [conf_ids[0]], "takenCv": [],
					"marks": [], "curses": { "crushing_depth": 1.0 }, "stats": { "shots": 140.0, "crits": 41.0, "dmgDealt": 48210.0, "dmgTaken": 9120.0, "highestHit": 1420.0 },
					"crew": [], "mode": "solo", "banked": true, "pot": 9240.0, "at": "2026-10-03T21:00:00.000Z", "ms": 1694000.0 }
				p["gauntlet_solo_deepest"] = 23.0
				p["gauntlet_solo_best_depth_ms"] = 1694000.0
				p["gauntlet_solo_deepest_died"] = 27.0
				p["gauntlet_solo_runs_completed"] = 6.0
				p["gauntlet_solo_runs_sunk"] = 9.0
				p["gauntlet_solo_deepest_run"] = snap
				var snap2: Dictionary = snap.duplicate(true)
				snap2["depth"] = 17.0
				snap2["crew"] = ["Ben", "Cal"]
				snap2["banked"] = false
				snap2["mode"] = "coop"
				p["gauntlet_coop_deepest"] = 14.0
				p["gauntlet_coop_best_depth_ms"] = 1210000.0
				p["gauntlet_coop_runs_completed"] = 2.0
				p["gauntlet_coop_runs_sunk"] = 1.0
				p["gauntlet_coop_deepest_run"] = snap
				p["gauntlet_last_run"] = snap2
				p["gauntlet_fathoms_earned"] = 412.0
				p["gauntlet_max_hit"] = 1420.0
			if gstep == "heldentry":
				p["gauntlet_held"] = { gv: { "status": "held", "depth": 12.0, "pot": 4410.0, "mode": "solo", "keys": ["me"], "names": { "me": "You" }, "at": "2026-10-03T21:00:00.000Z" } }
			if gstep == "codex" or gstep == "records":
				var cx0: Control = GauntletCodex.new() if gstep == "codex" else GauntletRecords.new()
				cx0.set("variant", gv)
				cx0.set("profile", p)
				if gstep == "codex" and OS.get_environment("CODEX_RUN") != "":
					cx0.set("run_cap", { "boons": { "powder_and_shot": 2.0, "broadside_mastery": 2.0, "grapeshot": 1.0, "bilge_pump": 1.0, "iron_hull": 1.0 }, "taken": [conf_ids[0]], "takenCv": [] })
				sea._hud_layer.add_child(cx0)
			elif gstep == "heldentry":
				sea.open_gauntlet(gv)
				for f: int in 6:
					await process_frame
				if OS.get_environment("ENTRY_TAB") != "":
					for n: Node in sea._hud_layer.get_children():
						if n is GauntletEntry:
							(n as GauntletEntry)._side_tab = OS.get_environment("ENTRY_TAB")
							(n as GauntletEntry)._side_paint()
			elif gstep != "water":
				Dice.install(Dice.Mulberry32.new(11))
				sea.open_gauntlet(gv)
				for f: int in 10:
					await process_frame
				var gt: GauntletTable = sea._solo_dive
				if gstep != "entry":
					gt.handle("me", sea.session, ["go"])
					for f: int in 150:
						await process_frame
					var gr: Dictionary = gt._r
					if gstep == "party":
						# Two more captains at the table (copies of this one).
						var ss: Array = gr["b"]["seats"]
						for nm: Array in [["ben", "Ben", "blue"], ["cal", "Cal", "pink"]]:
							var cp: Dictionary = (ss[0] as Dictionary).duplicate(true)
							cp["key"] = nm[0]
							cp["name"] = nm[1]
							cp["face"] = { "characterColor": nm[2], "hat": null }
							ss.append(cp)
							gr["caps"][nm[0]] = (gr["caps"]["me"] as Dictionary).duplicate(true)
						gr["run"]["drafts"] = 1.0
					match gstep:
						"draft", "party":
							gr["caps"]["me"]["boons"] = { "grapeshot": 1.0, "powder_and_shot": 2.0 }
							gt._open_draft("", 7)
							if gstep == "party":
								gt.handle("ben", sea.session, ["pick", { "card": 1.0 }])
						"curse":
							gr["_x"] = 0
							gr["curse"] = { "offer": Gauntlet.draw_curse({}, 7, false, gv), "acks": {}, "rerolls": {} }
							gt._enter("curse")
						"breather":
							gr["run"]["pot"] = 4620.0
							gr["run"]["roll"] = { "cleared": 14.0, "prevWasBoss": false, "roundsSinceBoss": 2.0 }
							gr["run"]["curses"] = { "crushing_depth": 1.0, str(Gauntlet.t()["curses"][3]["id"]): 1.0 }
							gr["caps"]["me"]["boons"] = { "powder_and_shot": 2.0, "broadside_mastery": 1.0, "grapeshot": 1.0 }
							gt._breather()
						"shrine":
							gr["shrine"] = { "picks": {}, "drafts": {} }
							gt._enter("shrine")
						"haul":
							gr["run"]["pot"] = 9240.0
							gr["run"]["roll"] = { "cleared": 19.0, "prevWasBoss": true, "roundsSinceBoss": 0.0 }
							gt._bank()
						"dead":
							gr["run"]["pot"] = 3100.0
							gt._dive_lost([])
							gt._advance()
			for f: int in int(OS.get_environment("SHOT_F")) if OS.get_environment("SHOT_F") != "" else 60:
				await process_frame
			if OS.get_environment("DIVE_PROBE") != "":
				for n: Node in sea._hud_layer.get_children():
					if n is BattleStage:
						var bs: BattleStage = n
						print("PROBE cam ", sea._camera.get_screen_center_position(), " camzoom ", sea._camera.zoom, " offset ", sea._camera.offset, " anchor ", sea._camera.anchor_mode, " boat ", sea._boat.position, " at ", bs._at, " foe ", bs._foe_pos, " stage ", sea.stage, " vp ", sea.get_viewport_rect().size)
		"campaign":
			# The campaign's water. CAMP_UPTO: every stop up to this node cleared
			# (raids by their clears); CAMP_AT: the node to sit beside (its dock
			# or its island); CAMP_OPEN: press it (its scene or its sheet);
			# CAMP_ZOOM: the camera's zoom; SHOT_F frames after.
			var cdb: CaptainStore = sea.session.store
			var cu: String = sea.session.uid
			p["expedition_xp"] = 3000000.0
			p["doubloons"] = 60000.0
			p["ship_tier"] = 4.0
			var st0: Dictionary = RulesApi.run(cdb, cu, "getCrewState", [])
			for c: Dictionary in st0["board"]:
				RulesApi.run(cdb, cu, "recruitCrew", [c["id"]])
			var ids3: Array = (RulesApi.run(cdb, cu, "getCrewState", [])["roster"] as Array).map(func(m: Dictionary) -> float: return float(m["id"]))
			for k: int in mini(3, ids3.size()):
				RulesApi.run(cdb, cu, "assignToRaid", [ids3[k], float(k)])
			var upto: String = OS.get_environment("CAMP_UPTO")
			if upto != "":
				var cl: Array = []
				for n: Dictionary in Campaign.nodes():
					if n["type"] == "raid":
						cdb.add_clear(cu, str(n["raidId"]), 200000.0)
					elif n["type"] == "skirmish":
						p["has_completed_practice_raid"] = true
					else:
						cl.append(n["id"])
					if n["id"] == upto:
						break
				p["raid_node_progress"] = { "cleared": cl, "choices": {} }
			sea._campaign.refresh()
			sea._open_sea_gate()
			var at_id: String = OS.get_environment("CAMP_AT") if OS.get_environment("CAMP_AT") != "" else "intro"
			var where: Vector2 = North.SEA_GATE + Vector2(0, -600)
			var shp: CampaignWater.Ship = sea._campaign.ship(at_id)
			if shp != null:
				where = shp.dock() + Vector2(-40, 30)
			else:
				for isl: Dictionary in Campaign.water()["beats"] + Campaign.water()["caches"]:
					if isl["node"] == at_id:
						for i: Dictionary in Campaign.water()["isles"]:
							if i["id"] == isl["isle"]:
								where = Vector2(float(i["x"]), float(i["y"])) + Vector2(-float(i["r"]) - 120.0, 120.0)
			sea._boat.position = where
			if OS.get_environment("CAMP_ZOOM") != "":
				sea._camera.zoom = Vector2.ONE * float(OS.get_environment("CAMP_ZOOM"))
			for f: int in 40:
				await process_frame
			if OS.get_environment("GW_TAB") != "":
				p["ship_tier"] = 6.0
				p["raid_items"] = ["corsair_cannon", "corsair_prime_cannon", "navigators_compass", "gunners_sight", "reinforced_hull", "war_drum", "krusts_carapace", "the_standing_wall", "bloodletter", "leviathans_cannon", "chain_shot", "incendiary_cannonball"]
				p["equipped_raid_items"] = ["the_standing_wall", "bloodletter", "gunners_sight"]
				p["owned_ship_skins"] = ["finndicate_hull", "galaxy_hull", "corsair_hull", "pitch_black_hull"]
				p["ship_name"] = "The Salt Widow"
				sea._dock("gunwharf")
				for f: int in 5:
					await process_frame
				for n: Node in sea._room_layer.get_children():
					if n is GunwharfSheet:
						n._tab = OS.get_environment("GW_TAB")
						if OS.get_environment("GW_REWALK") != "":
							p["ship_classes"] = { "thread": "master_gunner", "sunken_hand": "master_gunner_ii", "the_coffers": "ironside" }
							if not Js.includes(n.session.store.save["clears"], "the_throne"):
								n.session.store.save["clears"].append("the_throne")
							n._rewalk = { "thread": "helmsman" }
						n._paint()
			if OS.get_environment("CAMP_CHART") != "":
				sea._open_chart()
				await process_frame
				sea._chart._scale_to = float(OS.get_environment("CAMP_CHART"))
				sea._chart._center = Vector2(0, -11000)
			if OS.get_environment("CAMP_OPEN") != "":
				if OS.get_environment("CAMP_NOINTRO") != "":
					NodeSheet._intro_seen[OS.get_environment("CAMP_OPEN")] = true
				sea.open_node(OS.get_environment("CAMP_OPEN"))
			for f: int in int(OS.get_environment("SHOT_F")) if OS.get_environment("SHOT_F") != "" else 30:
				await process_frame
		"puzzle":
			# A campaign puzzle's board over the sea. PUZZLE_NODE: the node
			# (default smugglers_chart); PUZZLE_WIN: solve it on the spot (to
			# see the reveal); PUZZLE_FIRE: fire the mirror run's lantern;
			# SHOT_F frames after.
			var pid: String = OS.get_environment("PUZZLE_NODE") if OS.get_environment("PUZZLE_NODE") != "" else "smugglers_chart"
			var board: PuzzleBoard = PuzzleBoard.make(Campaign.node(pid)["puzzle"])
			sea._hud.hold_for(board)
			sea._hud_layer.add_child(board)
			if OS.get_environment("PUZZLE_WIN") != "":
				for f: int in 5:
					await process_frame
				board.win()
			if OS.get_environment("PUZZLE_FIRE") != "":
				for f: int in 5:
					await process_frame
				board.call("_fire")
			for f: int in int(OS.get_environment("SHOT_F")) if OS.get_environment("SHOT_F") != "" else 40:
				await process_frame
		"chartroom":
			# The Chart Room. CHART_TAB: match, minefield, rigging, hold, chart;
			# CHART_PTS: charting points to start with; SHOT_F frames after.
			p["fishing_xp"] = float(Rules.data()["xpTable"][40])
			p["puzzle_points"] = float(OS.get_environment("CHART_PTS")) if OS.get_environment("CHART_PTS") != "" else 130.0
			sea._enter_room("chart_room")
			for f: int in 20:
				await process_frame
			var cr: ChartStudy = sea._room_layer.get_child(0)
			if OS.get_environment("CHART_TAB") != "":
				cr.open(OS.get_environment("CHART_TAB"))
			for f: int in int(OS.get_environment("SHOT_F")) if OS.get_environment("SHOT_F") != "" else 40:
				await process_frame
		"crewbunks":
			# The Bunks room: a full hall, hands asleep, one stint done, a draw
			# from the deep waiting. BUNK_SHOW: "wake" collects the done one,
			# "promo" shows a promotion card; SHOT_F frames after.
			var sdb: CaptainStore = sea.session.store
			var su: String = sea.session.uid
			p["expedition_xp"] = 50000000.0
			p["fishing_xp"] = float(Rules.data()["xpTable"][80])
			p["doubloons"] = 9000000.0
			for d: int in 4:
				var st0: Dictionary = RulesApi.run(sdb, su, "getCrewState", [])
				for c: Dictionary in st0["board"]:
					RulesApi.run(sdb, su, "recruitCrew", [c["id"]])
				p["last_free_recruit_date"] = "old%d" % d
			for k: int in 5:
				RulesApi.run(sdb, su, "upgradeCrewHall", [])
			for k: int in 2:
				RulesApi.run(sdb, su, "buyHallUpgrade", ["drill"])
				RulesApi.run(sdb, su, "buyHallUpgrade", ["stores"])
			var ids: Array = (RulesApi.run(sdb, su, "getCrewState", [])["roster"] as Array).map(func(m: Dictionary) -> float: return float(m["id"]))
			RulesApi.run(sdb, su, "bunkCrew", [ids[0], 0.0, null])
			RulesApi.run(sdb, su, "bunkCrew", [ids[5], 5.0, 1.0])
			var t0: float = Clock.now_ms()
			Clock.install(func() -> float: return t0 + 3600000.0 * 1.2)
			RulesApi.run(sdb, su, "collectBunk", [ids[5]])
			RulesApi.run(sdb, su, "bunkCrew", [ids[1], 1.0, null])
			RulesApi.run(sdb, su, "bunkCrew", [ids[2], 2.0, null])
			Clock.install(func() -> float: return t0 + 3600000.0 * 3.05)
			RulesApi.run(sdb, su, "bunkCrew", [ids[3], 3.0, null])
			RulesApi.run(sdb, su, "checkPromotions", [])
			var ch: CrewHall = CrewHall.new()
			ch.session = sea.session
			ch.room = "bunks"
			sea._room_layer.add_child(ch)
			for f: int in 30:
				await process_frame
			var show: String = OS.get_environment("BUNK_SHOW")
			if show == "wake":
				var hb: HallBunks = ch.find_children("", "HallBunks", true, false)[0]
				for t: BunkTile in ch.find_children("", "BunkTile", true, false):
					if t.ready_now():
						hb.collect(t)
						break
			elif show == "pick":
				var hb2: HallBunks = ch.find_children("", "HallBunks", true, false)[0]
				for t: BunkTile in ch.find_children("", "BunkTile", true, false):
					if t.slot == 5:
						hb2.pick_for(t)
			elif show == "promo":
				var pc: PromotionCard = PromotionCard.new()
				var m0: Dictionary = (ch._state["roster"] as Array)[0]
				var cls: Dictionary = Crew.class_of(str(m0["slug"]))
				pc.promo = { "name": m0["name"], "art": "/card-arts/%s.webp" % str(m0["filename"]).get_basename(), "className": cls.get("name", ""), "color": cls.get("color", "#d9a83a"), "tier": "III", "level": 25.0, "from": cls["milestones"][1]["desc"], "to": cls["milestones"][2]["desc"] }
				ch.add_child(pc)
			for f: int in int(OS.get_environment("SHOT_F")) if OS.get_environment("SHOT_F") != "" else 30:
				await process_frame
		"finnmoment":
			# A chapter of the Long Cast closing on the water. FINN_CH: 1 to 5;
			# SHOT_F: frames in.
			for f: int in 30:
				await process_frame
			FinnMoment.play(sea._world, sea._boat.position, sea._field, int(OS.get_environment("FINN_CH")) if OS.get_environment("FINN_CH") != "" else 1, sea._boat.z_index + 1)
			for f: int in int(OS.get_environment("SHOT_F")) if OS.get_environment("SHOT_F") != "" else 40:
				await process_frame
		"crewtrunk", "skinreveal":
			# Hands aboard, then the Parlor's first ranks paid and opened.
			for d: int in 4:
				var st: Dictionary = RulesApi.run(sea.session.store, sea.session.uid, "getCrewState", [])
				for c: Dictionary in st["board"]:
					RulesApi.run(sea.session.store, sea.session.uid, "recruitCrew", [c["id"]])
				p["last_free_recruit_date"] = "old%d" % d
			Skins.grant(sea.session.store, sea.session.uid, "bosun", 5.0)
			var opened: Dictionary = {}
			for i: int in 4:
				opened = Skins.open(sea.session.store, sea.session.uid, "bosun")
			Skins.grant(sea.session.store, sea.session.uid, "captain", 1.0)
			var ch: CrewHall = CrewHall.new()
			ch.session = sea.session
			ch.room = "trunk"
			sea._room_layer.add_child(ch)
			for f: int in 20:
				await process_frame
			if what == "crewtrunk":
				ch._pick = opened.get("skin", {})
				ch._pick_kind = "skin"
				ch._draw_room()
				for f: int in 30:
					await process_frame
			else:
				var kind: String = OS.get_environment("SKIN_KIND") if OS.get_environment("SKIN_KIND") != "" else "captain"
				ch._open_voucher(kind)
				var frames: int = int(OS.get_environment("SHOT_F")) if OS.get_environment("SHOT_F") != "" else 200
				for f: int in frames:
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
		"trawls":
			var tdb: CaptainStore = sea.session.store
			p["fishing_xp"] = float((Rules.data()["xpTable"] as Array)[59])
			p["expedition_xp"] = 1.0e9
			var tc: Array = Crew.cards()
			var tids: Array = []
			for k: int in 5:
				var tid: float = tdb.next_id()
				tids.append(tid)
				(tdb.save["crew"] as Array).append({ "id": tid, "card_id": tc[k * 7]["id"], "rarity": 2.0, "power": 10.0, "dodge": 12.0 + k * 6.0, "fortune": 30.0 - k * 4.0, "effects": [], "pending_trait": null, "voyage_slot": null, "raid_slot": null, "xp": 4000.0 * k, "nickname": null, "recruited_at": "2026-10-01T00:00:00.000Z", "died_at": null })
			Trawls.deploy(tdb, sea.session.uid, "shallows", tids[0])
			Trawls.deploy(tdb, sea.session.uid, "deep", tids[1])
			(tdb.save["trawls"] as Array)[0]["ends_ms"] = Clock.now_ms() - 1000.0
			hud._set_phase("idle")
			hud._dial.visible = false
			sea._dock("trawl_fleet")
			for f: int in 10:
				await process_frame
			if OS.get_environment("TRAWL_PICK") != "":
				for n: Node in sea._room_layer.get_children():
					if n is TrawlHarbor:
						n._picking = "open_waters"
						n._paint()
			if OS.get_environment("TRAWL_HAUL") != "":
				for n: Node in sea._room_layer.get_children():
					if n is TrawlHarbor:
						n._collect("shallows")
			for f: int in 20:
				await process_frame
		"orders":
			var st0: Dictionary = Orders.state(sea.session.store, sea.session.uid)
			var o0: Dictionary = Js.obj(p["orders"])
			o0["p"] = [float(st0["orders"][0]["target"]), float(st0["orders"][1]["target"]) * 0.4, 0.0]
			o0["claimed"] = [false, false, false]
			p["orders"] = o0
			hud._set_phase("idle")
			hud._dial.visible = false
			hud.refresh()
			hud._open_loadout()
			for f: int in 30:
				await process_frame
			sea._locker._show_tab("orders")
			for f: int in 30:
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
