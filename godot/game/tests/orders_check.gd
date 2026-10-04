extends SceneTree
## THE DAY'S ORDERS (core/orders.gd): three orders counted by catches, each
## claimed once for its doubloons; the sweep stows a fishing crate and deals a
## new board at once; the Master order runs on its own track.
##
##   godot --headless --path godot/game -s tests/orders_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://orders_check"
	if DirAccess.dir_exists_absolute(Captains.dir_override):
		for f: String in DirAccess.get_files_at(Captains.dir_override):
			DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	await process_frame
	var c: Charter = Charter.found("Orders check", false, "o0", "Captain 0")
	var s: Session = c.session_for("o0")
	var db: CaptainStore = s.store
	var uid: String = s.uid
	var p: Dictionary = db.me(uid)
	p["fishing_xp"] = 0.0
	var st: Dictionary = Orders.state(db, uid)
	check((st["orders"] as Array).size() == 3 and (st["master"] as Dictionary).is_empty(), "three orders, no Master below 75")
	check(Orders.claim(db, uid, 0).has("error"), "an unfinished order cannot be claimed")
	check(Orders.sweep(db, uid).has("error"), "no sweep before all three are claimed")
	var first: Array = (st["orders"] as Array).map(func(o: Dictionary) -> String: return str(o["label"]))
	# Finish all three by force (each order's target, as its own kind).
	var o: Dictionary = Js.obj(db.me(uid)["orders"])
	for i: int in 3:
		o["p"][i] = float(st["orders"][i]["target"])
	db.update_profile(uid, { "orders": o })
	var d0: float = Js.num(db.me(uid).get("doubloons"))
	var r: Dictionary = Orders.claim(db, uid, 0)
	check(r.get("ok", false) and Js.num(db.me(uid).get("doubloons")) == d0 + float(st["orders"][0]["reward"]), "claimed for its doubloons (%s)" % str(r))
	check(Orders.claim(db, uid, 0).has("error"), "once only")
	Orders.claim(db, uid, 1)
	Orders.claim(db, uid, 2)
	check(Orders.state(db, uid)["sweepable"] == true, "all three claimed: sweepable")
	r = Orders.sweep(db, uid)
	var stash: Dictionary = Js.obj(db.me(uid).get("crate_stash"))
	check(r.get("ok", false) and Js.num(stash.get(r["crate"])) >= 1.0, "the sweep stows a crate (%s)" % str(r))
	st = Orders.state(db, uid)
	check(int(st["board"]) == 2 and (st["claimed"] as Array).all(func(x: Variant) -> bool: return x == false) and float(st["progress"][0]) == 0.0, "a fresh board dealt")
	var second: Array = (st["orders"] as Array).map(func(x: Dictionary) -> String: return str(x["label"]))
	check(first != second, "the new board's orders are dealt anew (%s / %s)" % [str(first), str(second)])
	# A catch counts.
	var done: Array = Orders.count(db, uid, "shallows", 1.0, 10.0, 1000.0, true)
	check(float(Orders.state(db, uid)["progress"][0]) > 0.0 or done.size() > 0, "a big catch counts against the board")
	# The Master, at 75, on its own track.
	p = db.me(uid)
	p["fishing_xp"] = float((Rules.data()["xpTable"] as Array)[79])
	st = Orders.state(db, uid)
	check(not (st["master"] as Dictionary).is_empty(), "the Master order at Fishing 80")
	o = Js.obj(db.me(uid)["orders"])
	o["mp"] = float(st["master"]["target"])
	db.update_profile(uid, { "orders": o })
	r = Orders.claim(db, uid, 3)
	check(r.get("ok", false) and r.has("crate"), "the Master pays a crate (%s)" % str(r))
	check(float(Orders.state(db, uid)["masterProgress"]) == 0.0 and int(Js.obj(db.me(uid)["orders"])["board"]) == 1, "a new Master dealt; the board untouched")
	print("  orders check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(0 if bad == 0 else 1)
