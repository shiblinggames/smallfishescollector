extends SceneTree
## THE RECRUIT ROOM, DEEPER (core/crew.gd, core/voyages.gd; Kong 2026-10-10):
## the bad-luck count (dry posted boards counted, any notice; an Epic or
## better resets it; the free board leaves it be; at the threshold the next
## posted board is sure of an Epic or better, the rest as rolled), the crew
## seen and signed (backfilled once from the save, grown as boards roll and
## hands sign, a dismissal keeping them, NEW on a face never had before), and
## the notices a voyage brings home in place of the web's gems.
##
##   godot --headless --path godot/game -s tests/crew_pull_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _rar(st: Dictionary) -> Array:
	return Js.list(st.get("board")).map(func(c: Dictionary) -> float: return float(c["rarity"]))


func _init() -> void:
	Captains.dir_override = "user://crew_pull_check"
	if DirAccess.dir_exists_absolute(Captains.dir_override):
		for f: String in DirAccess.get_files_at(Captains.dir_override):
			DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	await process_frame
	var now: Array = [1790000000000.0]
	Clock.install(func() -> float: return now[0])
	var c: Charter = Charter.found("Crew pull check", false, "c0", "Captain 0")
	var s: Session = c.session_for("c0")
	var db: CaptainStore = s.store
	var uid: String = s.uid
	var p: Dictionary = db.me(uid)
	var defs: Dictionary = Crew.notice_defs()
	var after: int = Crew.pity_after()
	check(after == 9, "the threshold is in the rules (%d)" % after)

	# ── The book: backfilled on the first read ────────────────────────────
	var cards: Array = Crew.cards()
	var hand_id: float = db.next_id()
	(s.save["crew"] as Array).append({
		"id": hand_id, "card_id": cards[5]["id"], "rarity": 1.0, "power": 3.0, "dodge": 3.0, "fortune": 3.0, "effects": [],
		"pending_trait": null, "voyage_slot": null, "raid_slot": null, "xp": 0.0, "nickname": null,
		"recruited_at": "2026-10-01T00:00:00.000Z", "died_at": null,
	})
	p.erase("crew_seen")
	p.erase("crew_signed")
	var st: Dictionary = RulesApi.run(db, uid, "getCrewState", [])
	var seen: Array = st["crewSeen"]
	check(seen.has(float(cards[5]["id"])), "a hand aboard is seen")
	check(Js.list(st["crewSigned"]).has(float(cards[5]["id"])), "a hand aboard is signed")
	for b: Dictionary in st["board"]:
		check(seen.has(float(b["cardId"])), "the board standing is seen (%s)" % b["name"])
	check(st.has("pity") and float(st["pity"]["within"]) == float(after + 1), "a fresh count: Epic or better within %d" % (after + 1))

	# ── NEW: a face never had before ──────────────────────────────────────
	p["crew_seen"] = []
	p["crew_notices"] = { "harbor_bill": 40.0, "captains_proclamation": 5.0 }
	var r: Dictionary = RulesApi.run(db, uid, "postNotice", ["harbor_bill"])
	check(r.has("state"), "a Bill posts")
	var b1: Array = r["state"]["board"]
	check(b1.all(func(x: Dictionary) -> bool: return x.get("isNew") == true), "a board on an empty book: every face NEW")
	for x: Dictionary in b1:
		check(Js.list(r["state"]["crewSeen"]).has(float(x["cardId"])), "a posted face is seen")
	r = RulesApi.run(db, uid, "postNotice", ["harbor_bill"])
	var had: Array = b1.map(func(x: Dictionary) -> float: return float(x["cardId"]))
	for x: Dictionary in r["state"]["board"]:
		check((x.get("isNew") == true) == (not had.has(float(x["cardId"]))), "NEW only for a face not had before (%s)" % x["name"])

	# ── Signing: signed, and a dismissal keeps it ─────────────────────────
	var cand: Dictionary = r["state"]["board"][0]
	r = RulesApi.run(db, uid, "recruitCrew", [cand["id"]])
	check(r.has("state") and Js.list(r["state"]["crewSigned"]).has(float(cand["cardId"])), "a signing is in the book (%s)" % str(r.get("error", "")))
	var new_id: float = -1.0
	for m: Dictionary in r["state"]["roster"]:
		if float(m["cardId"]) == float(cand["cardId"]):
			new_id = float(m["id"])
	r = RulesApi.run(db, uid, "dismissCrew", [new_id])
	check(r.has("state") and Js.list(r["state"]["crewSigned"]).has(float(cand["cardId"])), "dismissed, still signed ever")

	# ── The pity count ────────────────────────────────────────────────────
	var real_w: Array = (defs["harbor_bill"]["weights"] as Array).duplicate()
	defs["harbor_bill"]["weights"] = [1.0, 0.0, 0.0, 0.0]
	p["crew_pity"] = 0.0
	for i: int in after:
		r = RulesApi.run(db, uid, "postNotice", ["harbor_bill"])
		check(_rar(r["state"]).all(func(x: float) -> bool: return x == 1.0), "an all-common notice stays common before the threshold (post %d)" % (i + 1))
		check(float(r["state"]["pity"]["count"]) == float(i + 1), "a dry post counts (%d)" % (i + 1))
	check(float(r["state"]["pity"]["within"]) == 1.0, "at the threshold: guaranteed on the next")
	# The free board at sunrise neither counts nor resets.
	p["last_free_recruit_date"] = "old"
	st = RulesApi.run(db, uid, "getCrewState", [])
	check(float(st["pity"]["count"]) == float(after), "the free board leaves the count be")
	r = RulesApi.run(db, uid, "postNotice", ["harbor_bill"])
	var rs: Array = _rar(r["state"])
	check(rs.filter(func(x: float) -> bool: return x >= 3.0).size() == 1, "the guarantee fires: one Epic or better (%s)" % str(rs))
	check(rs.filter(func(x: float) -> bool: return x == 1.0).size() == rs.size() - 1, "the rest of the board as rolled")
	check(r.get("pityLifted") == true, "the post says it was lifted")
	check(float(r["state"]["pity"]["count"]) == 0.0, "an Epic resets the count")
	# Shared across notices; an Epic rolled on its own resets it too.
	defs["captains_proclamation"]["weights"] = [1.0, 0.0, 0.0, 0.0]
	RulesApi.run(db, uid, "postNotice", ["harbor_bill"])
	r = RulesApi.run(db, uid, "postNotice", ["captains_proclamation"])
	check(float(r["state"]["pity"]["count"]) == 2.0, "the count is shared across notices")
	defs["harbor_bill"]["weights"] = [0.0, 0.0, 1.0, 0.0]
	r = RulesApi.run(db, uid, "postNotice", ["harbor_bill"])
	check(float(r["state"]["pity"]["count"]) == 0.0 and r.get("pityLifted") != true, "a rolled Epic resets it, no lift")
	# A notice with no Legendary odds never lifts to one: a Bill at
	# Epic-only odds lifts to an Epic.
	defs["harbor_bill"]["weights"] = [1.0, 0.0, 0.0, 0.0]
	p["crew_pity"] = float(after)
	r = RulesApi.run(db, uid, "postNotice", ["harbor_bill"])
	check(not _rar(r["state"]).has(4.0), "no Legendary where the odds give none")
	defs["harbor_bill"]["weights"] = real_w
	defs["captains_proclamation"]["weights"] = [47.8, 44.0, 7.2, 1.0]

	# ── The voyage's notices ──────────────────────────────────────────────
	var vt: Dictionary = Crew.port()["noticeDrops"]["voyage"]
	for key: String in Voyages.ROUTES:
		check(Js.num(Js.obj(vt.get(key)).get("harbor_bill")) > 0.0, "%s may bring a Harbor Bill" % key)
	check(Js.num(Js.obj(vt.get("booty")).get("harbor_bill")) >= 1.0, "Massive Booty brings a Bill")
	p["ship_tier"] = 4.0
	p["crew_notices"] = {}
	var vid: float = db.next_id()
	(s.save["crew"] as Array).append({
		"id": vid, "card_id": cards[2]["id"], "rarity": 2.0, "power": 12.0, "dodge": 10.0, "fortune": 2.0, "effects": [],
		"pending_trait": null, "voyage_slot": null, "raid_slot": null, "xp": 0.0, "nickname": null,
		"recruited_at": "2026-10-01T00:00:00.000Z", "died_at": null,
	})
	Crew.assign(db, uid, vid, "voyage", 0.0)
	var keep: Dictionary = vt["coastal"]
	vt["coastal"] = { "harbor_bill": 1.0 }
	var sent: Dictionary = Voyages.send(db, uid, "coastal")
	check(sent.get("ok", false), "a voyage sails (%s)" % str(sent.get("error", "")))
	now[0] += float(sent["voyage"]["duration_ms"])
	r = Voyages.reveal(db, uid, float(sent["voyage"]["id"]))
	check(Js.obj(r.get("notices")).has("harbor_bill") and Js.num(Crew.notices_held(p).get("harbor_bill")) == 1.0, "a voyage home brings a Bill, held")
	vt["coastal"] = { "harbor_bill": 0.0 }
	sent = Voyages.send(db, uid, "coastal")
	(sent["voyage"]["events"] as Array)[0]["booty"] = true
	now[0] += float(sent["voyage"]["duration_ms"])
	r = Voyages.reveal(db, uid, float(sent["voyage"]["id"]))
	check(Js.num(Js.obj(r.get("notices")).get("harbor_bill")) == 1.0 and Js.num(Crew.notices_held(p).get("harbor_bill")) == 2.0, "Massive Booty brings its Bill")
	sent = Voyages.send(db, uid, "coastal")
	now[0] += float(sent["voyage"]["duration_ms"])
	r = Voyages.reveal(db, uid, float(sent["voyage"]["id"]))
	check(Js.obj(r.get("notices")).is_empty(), "no chance, no notice")
	vt["coastal"] = keep

	# ── The lines and the traits the room shows ───────────────────────────
	var missing: Array = []
	for cd: Dictionary in cards:
		var slug: String = str(cd["slug"]).to_lower()
		if Crew.group_for(slug) > 0 and Crew.quip(slug) == "":
			missing.append(slug)
		check(not Crew.quip(slug).contains("—"), "no em-dash in %s's line" % slug)
	check(missing.is_empty(), "every crewmate has a line (missing %s)" % str(missing))
	check(Crew.trait_effect(["s:0,0,2"]) == "+2 Fortune", "a trait said by its numbers (%s)" % Crew.trait_effect(["s:0,0,2"]))
	Clock.install(Callable())
	print("  crew pull %s" % ("FAILED" if bad > 0 else "ok"))
	quit(1 if bad > 0 else 0)
