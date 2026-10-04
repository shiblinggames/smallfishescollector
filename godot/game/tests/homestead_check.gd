extends SceneTree
## THE HOMESTEAD (core/homestead.gd): the house built a rung at a time for its
## price, the slots and rooms it opens, furnishing (bought once, found pieces
## refused, put back free), the name's rules, the gallery's six, the badges.
##
##   godot --headless --path godot/game -s tests/homestead_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://homestead_check"
	if DirAccess.dir_exists_absolute(Captains.dir_override):
		for f: String in DirAccess.get_files_at(Captains.dir_override):
			DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	await process_frame
	var c: Charter = Charter.found("Home check", false, "h0", "Captain 0")
	var s: Session = c.session_for("h0")
	var db: CaptainStore = s.store
	var uid: String = s.uid
	var p: Dictionary = db.me(uid)
	p["doubloons"] = 400000.0
	check(Homestead.open_slots(Homestead.of(db)).size() == 1, "a lean-to has one slot")
	check(Homestead.furnish(db, uid, "floor-kelp").has("error"), "no floor in a lean-to")
	var r: Dictionary = Homestead.build(db, uid)
	check(r.get("ok", false) and Js.num(db.me(uid).get("doubloons")) == 340000.0, "a cottage for 60,000")
	r = Homestead.furnish(db, uid, "floor-kelp")
	check(r.get("ok", false) and Js.num(db.me(uid).get("doubloons")) == 328000.0, "kelp weave for 12,000")
	Homestead.furnish(db, uid, "floor-board")
	check(Homestead.furnish(db, uid, "floor-kelp").get("spent", -1.0) == 0.0, "an owned piece goes back free")
	check(Homestead.furnish(db, uid, "floor-abyssal").has("error"), "a found piece is not for sale")
	check(Homestead.rename(db, uid, "  Salt   Hollow ").get("ok", false) and Homestead.of(db)["name"] == "Salt Hollow", "named, spaces tidied")
	check(Homestead.rename(db, uid, "<b>x</b>").has("error"), "markup refused")
	check(Homestead.pin(db, uid, ["unbroken"]).has("error"), "no gallery before the longhouse")
	Homestead.build(db, uid)
	p = db.me(uid)
	p["unlocked_badges"] = ["unbroken", "saltlung"]
	Homestead.pin(db, uid, ["unbroken", "saltlung", "not_earned"])
	check(Homestead.of(db)["pinned"] == ["unbroken", "saltlung"], "only earned badges hang")
	var got: Array = Achievements.sweep(db, uid)
	check(got.has("roof_of_your_own") and got.has("the_longhouse") and got.has("name_on_the_chart") and not got.has("the_great_hall"), "the house badges (%s)" % str(got))
	print("  homestead check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(0 if bad == 0 else 1)
