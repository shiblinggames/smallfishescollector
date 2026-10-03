extends SceneTree
## THE LONG CAST'S PORT JOBS, through the rules (Godot port): the ladder with
## the port's eight slotted in (and the web's 32 alone under parity), every job
## worked from first meeting to the last giant on a scratch captain, the new
## types counted only by their own catches (the fish he describes, the light
## and weather at the cast's spot, a shoal, a trophy), and the description
## veiled.
##
##   godot --headless --path godot/game -s tests/finn_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://finn_captains"
	for f: String in DirAccess.get_files_at(Captains.dir_override) if DirAccess.dir_exists_absolute(Captains.dir_override) else PackedStringArray():
		DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	# Midday on the sea (the conditions jobs must not be met by the hour the
	# test happens to run at: at night an ordinary catch is a night catch).
	var cycle: float = SeaClock.CYCLE_MS
	var noon: float = floor(Time.get_unix_time_from_system() * 1000.0 / cycle) * cycle + cycle * 0.1
	Clock.install(func() -> float: return noon)
	Main.straight_to_sea = true
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	await process_frame
	var sea: Sea = main.get_child(main.get_child_count() - 1)
	var db: CaptainStore = sea.session.store
	var uid: String = sea.session.uid
	var ladder: Array = Finn.quests()
	check(ladder.size() == 40, "the ladder is the web's 32 and the port's 8 (%d)" % ladder.size())
	var ids: Array = ladder.map(func(q: Dictionary) -> String: return q["id"])
	check(ids.find("p1") == ids.find("q3") + 1, "p1 follows q3")
	var p1: Dictionary = Finn.quest_by_id("p1")
	check(p1.has("hint") and not str(p1["hint"]).to_lower().contains("walleye"), "the fish he describes is not named (%s)" % str(p1.get("hint", "")))
	check(str(p1["give"]).ends_with("\""), "he says the description")
	# Work the whole ladder.
	var prof: Dictionary = db.me(uid)
	prof["fishing_xp"] = float(Rules.data()["xpTable"][98])
	var handed: int = 0
	for k: int in 200:
		var st: Dictionary = Finn.state(db, uid)
		if st["quest"] == null:
			var r: Variant = Finn.speak(db, uid, float(st["encounters"]))
			st = Finn.state(db, uid)
			if st["quest"] == null:
				break
		var q: Dictionary = Finn.quest_by_id(st["quest"]["id"])
		check(not st["quest"]["done"], "%s starts not done" % q["id"])
		_work(db, uid, q, sea)
		st = Finn.state(db, uid)
		check(st["quest"]["done"], "%s is done once worked (%s)" % [q["id"], str(st["quest"]["progressText"])])
		var t: Dictionary = Finn.turn_in(db, uid)
		check(not t.has("error"), "%s hands in (%s)" % [q["id"], str(t.get("error", ""))])
		handed += 1
	check(handed == 40, "every job handed in (%d)" % handed)
	print("  finn check: %s (%d jobs)" % ["ok" if bad == 0 else "%d FAILED" % bad, handed])
	quit(0 if bad == 0 else 1)


## Do what a job asks, the way a catch would; and check the port's types are
## not done by the wrong catches first.
func _work(db: CaptainStore, uid: String, q: Dictionary, sea: Sea) -> void:
	var prof: Dictionary = db.me(uid)
	var target: float = float(q["target"])
	match q["type"]:
		"catch_ancient":
			prof["ancient_catches"] = Js.list(prof.get("ancient_catches")) + [q["ancientId"]]
		"catch_species":
			# Another fish of the same water does not count.
			_land(db, uid, _other_species(db, q))
			check(not Finn.state(db, uid)["quest"]["done"], "%s: the wrong fish does not count" % q["id"])
			_land(db, uid, float(q["speciesId"]))
		"catch_condition", "catch_hotspot", "catch_trophy":
			# A catch in the water, not under the condition: nothing.
			prof["finn_cast_at"] = { "x": 0.0, "y": 99999.0 }
			Finn.on_catch(db, uid, { "fish": { "habitat": q["zone"] }, "sizeTier": "small" })
			check(Finn.state(db, uid)["quest"]["have"] == 0.0, "%s: an ordinary catch does not count" % q["id"])
			var tally: Dictionary = Js.obj(prof.get("finn_tally")).duplicate()
			tally[Finn.tally_key(q)] = Js.num(tally.get(Finn.tally_key(q))) + target
			prof["finn_tally"] = tally
		_:
			var zone: String = str(q.get("zone", "shallows"))
			var pick: float = -1.0
			for f: Dictionary in db.save["species"]:
				if f["habitat"] == zone and float(f["bite_rarity"]) >= float(q.get("minRarity", 0)):
					pick = float(f["id"])
					break
			for i: int in int(target):
				_land(db, uid, pick)
			var zp: Dictionary = Js.obj(prof.get("zone_perfects")).duplicate()
			zp[zone] = Js.num(zp.get(zone)) + target
			prof["zone_perfects"] = zp
			prof["current_perfect_streak"] = target


func _land(db: CaptainStore, uid: String, id: float) -> void:
	db.me(uid)
	var lt: Dictionary = db.save["lifetime"]
	var k: String = Js.key(id)
	var n: float = Js.num((lt.get(k, {}) as Dictionary).get("n")) if lt.get(k) is Dictionary else 0.0
	lt[k] = { "n": n + 1.0, "last": "2026-10-03T00:00:00.000Z" }


func _other_species(db: CaptainStore, q: Dictionary) -> float:
	for f: Dictionary in db.save["species"]:
		if f["habitat"] == q["zone"] and float(f["id"]) != float(q["speciesId"]):
			return float(f["id"])
	return -1.0
