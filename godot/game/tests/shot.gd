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
	for w: String in ["dial", "card", "crate", "golden", "level", "look", "loadout", "hold", "almanac", "giants", "boss", "slain", "finn", "rankup"]:
		if args.has(w):
			what = w
	var cycle: float = SeaClock.CYCLE_MS
	var base: float = floor(Time.get_unix_time_from_system() * 1000.0 / cycle) * cycle
	var at: float = base + cycle * (0.5 if night else 0.1)
	Clock.install(func() -> float: return at)
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	await process_frame
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
	match what:
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
