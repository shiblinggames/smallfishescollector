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
	for w: String in ["dial", "card", "crate", "golden", "level"]:
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
	match what:
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
	var wait: int = 150 if what == "crate" else (160 if what == "card" else 50)
	for f: int in wait:
		await process_frame
	var img: Image = root.get_texture().get_image()
	img.save_png(out)
	print("  saved ", out)
	quit()
