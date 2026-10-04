extends SceneTree
## TRAWLS (core/trawls.gd): the slot ladder, a hand sent out of their seat,
## one trawl per water and per hand, nothing collected before they are home,
## and the haul paid in fishing XP and doubloons near its expected size.
##
##   godot --headless --path godot/game -s tests/trawl_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://trawl_check"
	if DirAccess.dir_exists_absolute(Captains.dir_override):
		for f: String in DirAccess.get_files_at(Captains.dir_override):
			DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	await process_frame
	var now: Array = [1790000000000.0]
	Clock.install(func() -> float: return now[0])
	var c: Charter = Charter.found("Trawl check", false, "t0", "Captain 0")
	var s: Session = c.session_for("t0")
	var db: CaptainStore = s.store
	var uid: String = s.uid
	var p: Dictionary = db.me(uid)
	var cards: Array = Crew.cards()
	var ids: Array = []
	for k: int in 2:
		var id: float = db.next_id()
		ids.append(id)
		(s.save["crew"] as Array).append({
			"id": id, "card_id": cards[k]["id"], "rarity": 2.0, "power": 10.0, "dodge": 40.0, "fortune": 40.0, "effects": [],
			"pending_trait": null, "voyage_slot": null, "raid_slot": 0.0 if k == 0 else null, "xp": 0.0, "nickname": null,
			"recruited_at": "2026-10-01T00:00:00.000Z", "died_at": null,
		})
	p["fishing_xp"] = 0.0
	p["expedition_xp"] = 0.0
	check(Trawls.deploy(db, uid, "shallows", ids[0]).has("error"), "no trawl below Fishing 25")
	p["fishing_xp"] = float((Rules.data()["xpTable"] as Array)[29])
	check(int(Trawls.state(db, uid)["unlockedSlots"]) == 1, "one slot at Fishing 30, Nav 0")
	var r: Dictionary = Trawls.deploy(db, uid, "shallows", ids[0])
	check(not r.has("error"), "sent to the Shallows (%s)" % str(r.get("error", "")))
	var hand: Dictionary = (s.save["crew"] as Array)[(s.save["crew"] as Array).size() - 2]
	check(hand.get("raid_slot") == null, "out of their raid seat")
	check(Trawls.deploy(db, uid, "open_waters", ids[1]).has("error"), "a second trawl needs a second slot")
	check(Crew.assign(db, uid, ids[0], "raid", 0.0).has("error"), "a hand on a trawl cannot be seated")
	check(Trawls.collect(db, uid, "shallows").has("error"), "not home yet")
	now[0] += 68.0 * 60000.0
	var d0: float = Js.num(db.me(uid).get("doubloons"))
	var x0: float = Js.num(db.me(uid).get("fishing_xp"))
	r = Trawls.collect(db, uid, "shallows")
	var e: Dictionary = Trawls.expected("shallows", 40.0, 40.0)
	check(r.has("xpGained") and float(r["xpGained"]) >= float(e["xp"]) * 0.79 and float(r["xpGained"]) <= float(e["xp"]) * 1.21, "the XP near 700 (%s)" % str(r.get("xpGained")))
	check(Js.num(db.me(uid).get("fishing_xp")) == x0 + float(r["xpGained"]) and Js.num(db.me(uid).get("doubloons")) == d0 + float(r["doubloonsGained"]), "paid in XP and doubloons")
	check(Trawls.collect(db, uid, "shallows").has("error"), "collected once")
	check((Trawls.state(db, uid)["freeCrew"] as Array).size() == 2, "both hands free again")
	p["fishing_xp"] = float((Rules.data()["xpTable"] as Array)[49])
	p["expedition_xp"] = 1.0e9
	Trawls.deploy(db, uid, "shallows", ids[0])
	check(Trawls.deploy(db, uid, "shallows", ids[1]).has("error"), "one trawl to a water")
	check(Trawls.deploy(db, uid, "open_waters", ids[0]).has("error"), "one trawl to a hand")
	check(not Trawls.deploy(db, uid, "open_waters", ids[1]).has("error"), "a second slot at Fishing 50, Nav 20")
	Clock.install(Callable())
	print("  trawl check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(0 if bad == 0 else 1)
