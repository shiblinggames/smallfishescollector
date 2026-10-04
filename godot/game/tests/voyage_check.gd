extends SceneTree
## VOYAGES (core/voyages.gd): the route gates and crew minimum, runs in sea
## days, one at sea at a time, nothing paid before they are home, the haul
## paid once (doubloons, Navigation XP, crew XP to survivors), a lost hand
## remembered not deleted, and Fortune taking the risk to nothing.
##
##   godot --headless --path godot/game -s tests/voyage_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://voyage_check"
	if DirAccess.dir_exists_absolute(Captains.dir_override):
		for f: String in DirAccess.get_files_at(Captains.dir_override):
			DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	await process_frame
	var now: Array = [1790000000000.0]
	Clock.install(func() -> float: return now[0])
	var c: Charter = Charter.found("Voyage check", false, "v0", "Captain 0")
	var s: Session = c.session_for("v0")
	var db: CaptainStore = s.store
	var uid: String = s.uid
	var p: Dictionary = db.me(uid)
	p["ship_tier"] = 4.0
	p["expedition_xp"] = 0.0
	var cards: Array = Crew.cards()
	var ids: Array = []
	for k: int in 3:
		var id: float = db.next_id()
		ids.append(id)
		(s.save["crew"] as Array).append({
			"id": id, "card_id": cards[k]["id"], "rarity": 2.0, "power": 12.0, "dodge": 10.0, "fortune": 2.0, "effects": [],
			"pending_trait": null, "voyage_slot": null, "raid_slot": null, "xp": 0.0, "nickname": null,
			"recruited_at": "2026-10-01T00:00:00.000Z", "died_at": null,
		})
	check(Voyages.send(db, uid, "coastal").has("error"), "no crew, no voyage")
	Crew.assign(db, uid, ids[0], "voyage", 0.0)
	check(Voyages.send(db, uid, "open").has("error"), "the Crossing needs Navigation 5")
	check(is_equal_approx(Voyages.base_ms("coastal"), 2.0 * SeaClock.CYCLE_MS) and is_equal_approx(Voyages.base_ms("shroud"), 11.0 * SeaClock.CYCLE_MS), "routes run 2 to 11 sea days")
	var r: Dictionary = Voyages.send(db, uid, "coastal")
	check(r.get("ok", false), "the Inner Sea with one hand (%s)" % str(r.get("error", "")))
	var v: Dictionary = r.get("voyage", {})
	check(float(v.get("duration_ms", 0.0)) <= 2.0 * SeaClock.CYCLE_MS and float(v.get("duration_ms", 0.0)) >= 1.6 * SeaClock.CYCLE_MS, "about two sea days (%s)" % str(v.get("duration_ms")))
	check(Voyages.send(db, uid, "coastal").has("error"), "one voyage at sea")
	check(Crew.assign(db, uid, ids[0], "raid", 0.0).has("error"), "a hand at sea cannot be reseated")
	check(Voyages.reveal(db, uid, float(v["id"])).has("error"), "not home yet")
	now[0] += float(v["duration_ms"])
	var d0: float = Js.num(db.me(uid).get("doubloons"))
	r = Voyages.reveal(db, uid, float(v["id"]))
	check(r.get("ok", false), "home and paid (%s)" % str(r.get("error", "")))
	check(Js.num(db.me(uid).get("doubloons")) == d0 + float(r["earnedDoubloons"]) and float(r["earnedDoubloons"]) >= 1.0, "the doubloons paid")
	check(Js.num(db.me(uid).get("expedition_xp")) == float(r["xpEarned"]) and float(r["xpEarned"]) > 0.0, "Navigation XP paid")
	check(Js.num((s.save["crew"] as Array)[(s.save["crew"] as Array).size() - 3].get("xp")) == float(r["crewXp"]), "crew XP to the hand")
	check(Voyages.reveal(db, uid, float(v["id"])).has("error"), "paid once")
	check(not str(r["event"]["narrative"]).contains("{captain}"), "the captain named in the tale")
	# The risk: Fortune takes it to nothing at the route's own level.
	check(is_equal_approx(Voyages.loss_chance("deep", 0.0), 0.10) and Voyages.loss_chance("deep", 15.0) == 0.0 and Voyages.loss_chance("open", 0.0) == 0.0, "the loss chance and Fortune")
	# A lost hand is remembered, not deleted, and earns nothing.
	p["expedition_xp"] = 1.0e9
	Crew.assign(db, uid, ids[1], "voyage", 1.0)
	r = Voyages.send(db, uid, "deep")
	check(r.get("ok", false), "the Howling Deep with two (%s)" % str(r.get("error", "")))
	v = r["voyage"]
	v["crew_lost"] = [ids[1]]
	now[0] += float(v["duration_ms"])
	r = Voyages.reveal(db, uid, float(v["id"]))
	var lost: Dictionary = (s.save["crew"] as Array)[(s.save["crew"] as Array).size() - 2]
	check(lost.get("died_at") != null and lost.get("died_on_voyage_id") == v["id"] and Js.num(lost.get("xp")) == 0.0, "the lost hand remembered, no XP")
	check((r["crewLostNames"] as Array).size() == 1, "named in the haul")
	# Safe Passage takes the risk away.
	p["gauntlet_upgrades"] = ["safe_voyages"]
	check(float(Voyages.state(db, uid)["routes"][2]["lossChance"]) == 0.0, "Safe Passage: no risk")
	Clock.install(Callable())
	print("  voyage check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(0 if bad == 0 else 1)
