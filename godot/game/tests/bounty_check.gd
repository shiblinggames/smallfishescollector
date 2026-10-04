extends SceneTree
## THE BOUNTY BOARD (core/bounties.gd): shut until Chapter I, a rung per
## chapter, progress since the board was dealt, a claim paying doubloons and
## points once, the board turning over when finished, one swap a board, the
## event meters, and the milestone ladder.
##
##   godot --headless --path godot/game -s tests/bounty_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://bounty_check"
	if DirAccess.dir_exists_absolute(Captains.dir_override):
		for f: String in DirAccess.get_files_at(Captains.dir_override):
			DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	await process_frame
	var now: Array = [1790000000000.0]
	Clock.install(func() -> float: return now[0])
	var c: Charter = Charter.found("Bounty check", false, "b0", "Captain 0")
	var s: Session = c.session_for("b0")
	var db: CaptainStore = s.store
	var uid: String = s.uid
	check(Bounties.state(db, uid)["unlocked"] == false, "shut before Chapter I")
	now[0] += 1000.0
	db.add_clear(uid, "captain_krust", 300000.0)
	now[0] += 1000.0
	var st: Dictionary = Bounties.state(db, uid)
	check(st["unlocked"] and (st["bounties"] as Array).size() == 1 and st["bounties"][0]["tier"] == "easy", "Chapter I: one easy order")
	check(float(st["bounties"][0]["progress"]) == 0.0, "a clear before the board does not count")
	check(not (st["news"] as Dictionary).is_empty(), "the rung announced")
	Bounties.mark_rung_seen(db, uid, 1.0)
	check((Bounties.state(db, uid)["news"] as Dictionary).is_empty(), "announced once")
	# Chapter IV: four orders, one of each tier.
	for r: String in ["tollmasters_cut", "the_quartermaster", "the_throne"]:
		db.add_clear(uid, r, 400000.0)
	st = Bounties.state(db, uid)
	var tiers: Array = (st["bounties"] as Array).map(func(v: Dictionary) -> String: return v["tier"])
	check(tiers.size() == 4 and tiers.has("elite"), "Chapter IV: four orders, the elite among them (%s)" % str(tiers))
	var fams: Array = []
	for v: Dictionary in st["bounties"]:
		var f: Variant = Bounties.by_id(v["id"]).get("family")
		check(f == null or not fams.has(f), "never two of a family")
		fams.append(f)
	# A raid-count order and the claim.
	for v: Dictionary in st["bounties"]:
		if float(v["progress"]) < float(v["target"]):
			check(Bounties.claim(db, uid, v["id"]).has("error"), "not before it is done")
			break
	# Do every order by force through the meters' own records.
	var p: Dictionary = db.me(uid)
	var board: Dictionary = p["bounty_board"]
	var before: float = Js.num(p.get("doubloons"))
	for id: Variant in board["ids"]:
		_satisfy(db, uid, Bounties.by_id(str(id)), now)
	st = Bounties.state(db, uid)
	var done: int = (st["bounties"] as Array).filter(func(v: Dictionary) -> bool: return float(v["progress"]) >= float(v["target"])).size()
	check(done == 4, "every order measured done (%d of 4: %s)" % [done, str((st["bounties"] as Array).map(func(v: Dictionary) -> String: return "%s %d/%d" % [v["id"], int(v["progress"]), int(v["target"])]))])
	var r: Dictionary = Bounties.claim(db, uid, str(board["ids"][0]))
	check(r.get("ok", false) and float(r["doubloons"]) == float(Bounties.data()["doubloons"][Bounties.by_id(str(board["ids"][0]))["tier"]]), "paid in doubloons by tier (%s)" % str(r))
	check(Js.num(db.me(uid).get("doubloons")) == before + float(r["doubloons"]), "the doubloons landed")
	check(Bounties.claim(db, uid, str(board["ids"][0])).has("error"), "paid once")
	var pts: float = float(r["points"])
	for k: int in range(1, 4):
		r = Bounties.claim(db, uid, str(board["ids"][k]))
		pts += float(r.get("points", 0.0))
	check(r.get("sweep", false), "the last claim sweeps the board")
	check(Js.num(db.me(uid).get("bounty_points")) == pts and pts == 1.0 + 2.0 + 3.0 + 5.0 + 3.0, "points by tier and the sweep (%s)" % str(pts))
	st = Bounties.state(db, uid)
	check(int(st["board"]) == int(board["n"]) + 1 and (st["bounties"] as Array).all(func(v: Dictionary) -> bool: return not v["claimed"]), "a new board posted at once")
	# One swap a board.
	var first_id: String = st["bounties"][0]["id"]
	check(Bounties.reroll(db, uid, first_id).get("ok", false), "a swap")
	check(Bounties.reroll(db, uid, str(db.me(uid)["bounty_board"]["ids"][1])).has("error"), "one swap a board")
	# The ladder.
	p = db.me(uid)
	p["bounty_points"] = 30.0
	r = Bounties.claim_milestone(db, uid)
	check(r.get("ok", false) and float(r["doubloons"]) == 5000.0, "the first milestone: 5,000")
	check(Bounties.claim_milestone(db, uid).has("error"), "the next needs more points")
	p["bounty_points"] = 1200.0
	p["bounty_milestones_claimed"] = 8.0
	r = Bounties.claim_milestone(db, uid)
	check(r.get("ok", false) and r["shipSkinId"] == "corsair_hull" and Js.list(db.me(uid).get("owned_ship_skins")).has("corsair_hull"), "the capstone: the Corsair Hull")
	Clock.install(Callable())
	print("  bounty check: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(0 if bad == 0 else 1)


## Make an order's meter read done, through the records it reads.
func _satisfy(db: CaptainStore, uid: String, b: Dictionary, now: Array) -> void:
	now[0] += 1000.0
	var m: Dictionary = b["meter"]
	var n: int = int(b["target"])
	match str(m["kind"]):
		"raid_clear":
			for i: int in n:
				db.add_clear(uid, m["raidId"], 300000.0)
		"raid_any", "raid_distinct":
			for i: int in n:
				db.add_clear(uid, ["captain_krust", "tollmasters_cut", "the_quartermaster", "the_throne", "cartographer"][i], 300000.0)
		"raid_any_of":
			db.add_clear(uid, m["raidIds"][0], 300000.0)
		"raid_fast":
			db.add_clear(uid, m["raidId"], float(m["underS"]) * 500.0)
		"raid_budget":
			for i: int in int(m["raids"]):
				db.add_clear(uid, "captain_krust", 60000.0)
		"voyages", "voyage_route", "voyage_haul", "voyage_haul_total":
			if not (db.save.get("voyages") is Array):
				db.save["voyages"] = []
			for i: int in n:
				db.save["voyages"].append({ "id": db.next_id(), "route": m.get("route", "deep"), "status": "revealed", "total_doubloons": 20000.0, "created_ms": now[0], "crew_variant_ids": [], "crew_lost": [], "events": [] })
		"counter":
			db.bump_stat(uid, str(m["column"]), float(n))
		"event":
			Bounties.log_event(db, uid, str(m["eventKind"]), float(m["atLeast"]))
