extends SceneTree
## RENOWN (core/renown.gd): levels past 100 on the web's curve, a point spent
## once, a token clearing one board, a token bought for doubloons.
##
##   godot --headless --path godot/game -s tests/renown_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://renown_check"
	if DirAccess.dir_exists_absolute(Captains.dir_override):
		for f: String in DirAccess.get_files_at(Captains.dir_override):
			DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	await process_frame
	var c: Charter = Charter.found("Renown check", false, "r0", "Captain 0")
	var s: Session = c.session_for("r0")
	var db: CaptainStore = s.store
	var uid: String = s.uid
	var top: float = float((Rules.data()["xpTable"] as Array)[99])
	check(Renown.level("fishing", top) == 0, "nothing at 100 itself")
	check(Renown.level("fishing", top + 49999.0) == 0 and Renown.level("fishing", top + 50000.0) == 1, "the first at 50,000 past")
	check(Renown.level("fishing", top + 115000.0) == 2, "the second 65,000 after")
	check(Renown.cost_of(20) == 200000.0, "steady at 200,000")
	var p: Dictionary = db.me(uid)
	p["fishing_xp"] = top + 115000.0
	p["doubloons"] = 250000.0
	var st: Dictionary = Renown.allocate(db, uid, "fishing", "wisdom")
	check(int(st.get("available", -1)) == 1 and Js.obj(db.me(uid)["fishing_renown_alloc"]).get("wisdom") == 1.0, "a point spent")
	Renown.allocate(db, uid, "fishing", "wisdom")
	check(Renown.allocate(db, uid, "fishing", "bounty").has("error"), "no more than earned")
	check(is_equal_approx(float(Rules.fishing_renown(db.me(uid)["fishing_renown_alloc"])["xpMult"]), 1.04), "two Wisdom: +4% XP")
	check(Renown.respec(db, uid, "fishing").has("error"), "no token, no respec")
	check(Renown.buy_respec(db, uid).get("ok", false) and Js.num(db.me(uid).get("doubloons")) == 50000.0, "a token for 200,000")
	st = Renown.respec(db, uid, "fishing")
	check(int(st.get("available", -1)) == 2 and int(st["respecs"]) == 0, "the board cleared, the token spent")
	print("  renown check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(0 if bad == 0 else 1)
