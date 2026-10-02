extends SceneTree
## THE TREASURE HUNTS AND ACHIEVEMENTS, through the rules (Godot port): every
## tier's hunt played from bottle to casket on a scratch captain (each step
## searched where it points, asked, or caught), and the achievement sweep.
##
##   godot --headless --path godot/game -s tests/clues_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://clue_captains"
	for f: String in DirAccess.get_files_at(Captains.dir_override) if DirAccess.dir_exists_absolute(Captains.dir_override) else PackedStringArray():
		DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	Main.straight_to_sea = true
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	await process_frame
	var sea: Sea = main.get_child(main.get_child_count() - 1)
	var db: CaptainStore = sea.session.store
	var uid: String = sea.session.uid
	check(Clues.on(), "the hunts are on in the port")
	var now: float = Clock.now_ms()
	var bs: Array = Clues.bottles(now)
	check(bs.size() >= 3 and bs.size() <= 5, "3 to 5 bottles a day (%d)" % bs.size())
	for b: Dictionary in bs:
		check(Clues._open_water(Vector2(float(b["x"]), float(b["y"]))), "bottle %s floats in open water" % b["key"])
	# A bottle, taken where it floats.
	var b0: Dictionary = bs[0]
	var at: Dictionary = Explore.bottle_pos(b0, now / 1000.0)
	RulesApi.run(db, uid, "setSeaPos", [at["x"], at["y"]])
	var r: Dictionary = RulesApi.run(db, uid, "openBottle", [b0["key"]])
	check(r.get("ok", false), "a bottle starts a hunt (%s)" % str(r.get("error", "")))
	var again: Dictionary = RulesApi.run(db, uid, "openBottle", [b0["key"]])
	check(not again.get("ok", false), "a bottle is taken once")
	var opened: int = 0
	for tier: String in Clues.TIERS:
		var hunts: Dictionary = Js.obj(db.me(uid).get("clue_hunts")).duplicate(true)
		if not hunts.has(tier):
			hunts[tier] = Clues.make_hunt(tier, 1000 + tier.length() * 7, db.save)
			db.update_profile(uid, { "clue_hunts": hunts })
		var guard: int = 0
		while guard < 10:
			guard += 1
			var s: Dictionary = Clues.current(db.me(uid), tier)
			if s.is_empty():
				break
			var res: Dictionary
			match s["kind"]:
				"catch":
					var got: Array = Clues.on_catch(db, uid, float(s["fish"]))
					check(got.size() == 1, "%s: the right catch answers the step" % tier)
					res = got[0] if not got.is_empty() else {}
				"speak":
					var w: Vector2 = Clues.folk_at(str(s["folk"]), Clock.now_ms())
					check(w != Vector2.INF, "%s: the regular %s is somewhere" % [tier, s["folk"]])
					RulesApi.run(db, uid, "setSeaPos", [w.x, w.y])
					res = RulesApi.run(db, uid, "clueSearch", [tier])
				_:
					RulesApi.run(db, uid, "setSeaPos", [99999, 99999])
					var far: Dictionary = RulesApi.run(db, uid, "clueSearch", [tier])
					check(not far.get("ok", false), "%s: searching the wrong water finds nothing" % tier)
					RulesApi.run(db, uid, "setSeaPos", [s["x"], s["y"]])
					res = RulesApi.run(db, uid, "digHere", [s["site"]]) if s["kind"] == "dig" else RulesApi.run(db, uid, "clueSearch", [tier])
			check(res.get("ok", false), "%s: a %s step is done (%s)" % [tier, s["kind"], str(res.get("error", ""))])
			if res.get("done", false):
				opened += 1
				check(Js.num(res.get("doubloons")) > 0.0, "%s: the casket pays" % tier)
				break
	check(opened == 4, "every tier's hunt ends in a casket (%d)" % opened)
	check(Js.num(db.me(uid).get("clues_done")) >= 4.0, "hunts are counted")
	var have: Array = Js.list(db.me(uid).get("unlocked_badges"))
	check(have.has("first_spade") and have.has("salted_away"), "the hunt badges are earned")
	check(Achievements.points(db, uid) > 0.0, "points add up")
	var cols: Array = Js.list(db.me(uid).get("unlocked_character_colors"))
	for c: Variant in Achievements.colors_for(Achievements.points(db, uid)):
		check(cols.has(c), "the points reached earn %s" % c)
	check(not cols.has("abyssal"), "the last colour is not given away")
	var dig_left: Dictionary = RulesApi.run(db, uid, "digHere", ["shallows-dig-0"])
	check(not dig_left.get("ok", false), "a site dug without a hunt gives nothing")
	print("  clues: %d caskets, %d points, colours %s" % [opened, int(Achievements.points(db, uid)), str(cols)])
	print("  clues %s" % ("FAILED" if bad > 0 else "ok"))
	quit(1 if bad > 0 else 0)
