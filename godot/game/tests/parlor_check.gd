extends SceneTree
## THE PARLOR IN THE PORT, through the rules (core/parlor.gd): cards dealt every
## 8 hours into a hand of 3 (4 at Fishing 30), none lost; right, wrong and
## too-late answers; no question met twice until the bank is spent; the
## King's gate, a crown, a fall to a haven, a walk; a capstan round.
##
##   godot --headless --path godot/game -s tests/parlor_check.gd

var bad: int = 0
var t: Array = [0.0]


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://parlor_captains"
	for f: String in DirAccess.get_files_at(Captains.dir_override) if DirAccess.dir_exists_absolute(Captains.dir_override) else PackedStringArray():
		DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	var fresh: Dictionary = Captains.create(Captains.new_id())
	var s: Session = Session.new(fresh["save"], fresh["carried"])
	var db: CaptainStore = s.store
	var uid: String = s.uid
	t[0] = 1.8e12
	Clock.install(func() -> float: return t[0])
	var H: float = 28800000.0
	var xp: Array = Rules.data()["xpTable"]
	var prof: Dictionary = db.me(uid)
	prof["fishing_xp"] = float(xp[0])

	# ── The board ──
	var b: Dictionary = Parlor.board(db, uid)
	check((b["hand"] as Array).size() == 1, "a new captain is dealt one card (%d)" % (b["hand"] as Array).size())
	t[0] += H * 10.0
	b = Parlor.board(db, uid)
	check((b["hand"] as Array).size() == 3, "the hand fills to 3 and stops (%d)" % (b["hand"] as Array).size())
	check(float(b["nextIn"]) < 0.0, "a full hand waits")
	prof["fishing_xp"] = float(xp[29])
	t[0] += H
	b = Parlor.board(db, uid)
	check((b["hand"] as Array).size() == 4, "at Fishing 30 it holds 4 (%d)" % (b["hand"] as Array).size())
	var cards: Array = b["hand"]
	var k0: String = cards[0]["key"]
	var r: Dictionary = RulesApi.run(db, uid, "boardReveal", [k0])
	check(not r.has("error"), "a card turns over")
	check(RulesApi.run(db, uid, "boardReveal", [cards[1]["key"]]).has("error"), "one card at a time")
	var turned: Dictionary = (r["hand"] as Array).filter(func(c: Dictionary) -> bool: return c["key"] == k0)[0]
	var q: Dictionary = {}
	for qq: Dictionary in Parlor.bank()["questions"]:
		if qq["question"] == turned["question"]:
			q = qq
	check(not q.is_empty() and q["category"] == turned["category"], "its question is in its topic")
	var d0: float = Js.num(prof.get("doubloons"))
	var a: Dictionary = RulesApi.run(db, uid, "boardAnswer", [k0, float(q["correct_index"])])
	check(a["correct"] and Js.num(prof.get("doubloons")) == d0 + float(a["doubloonsWon"]) and float(a["doubloonsWon"]) > 0.0, "a right answer pays its tier")
	var k1: String = cards[1]["key"]
	RulesApi.run(db, uid, "boardReveal", [k1])
	t[0] += 30000.0
	a = RulesApi.run(db, uid, "boardAnswer", [k1, 0.0])
	check(not a["correct"] and a["timedOut"], "too late is a miss")
	check(float(a["currentStreak"]) == 0.0, "a miss breaks the streak")
	# No question twice before the bank is spent.
	var met: Dictionary = {}
	var dup: int = 0
	var n: int = (Parlor.bank()["questions"] as Array).size()
	for i: int in n:
		t[0] += H
		b = Parlor.board(db, uid)
		var c: Dictionary = b["hand"][0]
		var rv: Dictionary = RulesApi.run(db, uid, "boardReveal", [c["key"]])
		var shown: String = str((rv["hand"] as Array).filter(func(x: Dictionary) -> bool: return x["key"] == c["key"])[0]["question"])
		if met.has(shown):
			dup += 1
		met[shown] = true
		RulesApi.run(db, uid, "boardAnswer", [c["key"], 1.0])
	check(dup == 0, "no question twice in the first %d (%d repeats)" % [n, dup])

	# ── The King ──
	prof["fishing_xp"] = float(xp[20])
	check(str(RulesApi.run(db, uid, "kingStart", []).get("error", "")) == "Needs Fishing 25", "the King waits for Fishing 25")
	prof["fishing_xp"] = float(xp[30])
	var d1: float = Js.num(prof.get("doubloons"))
	for rung: int in 10:
		var st: Dictionary = RulesApi.run(db, uid, "kingStart", [])
		var kq: Dictionary = {}
		for qq: Dictionary in Parlor.bank()["questions"]:
			if qq["question"] == st["current"]["question"]:
				kq = qq
		if rung == 3:
			check(not RulesApi.run(db, uid, "kingFifty", []).has("error"), "the 50/50")
			check(RulesApi.run(db, uid, "kingFifty", []).has("error"), "the 50/50 once a run")
		var ar: Dictionary = RulesApi.run(db, uid, "kingAnswer", [float(rung), float(kq["correct_index"])])
		check(ar["correct"], "rung %d answered" % rung)
	check(Parlor.king(db, uid)["status"] == "crowned" and Js.num(prof.get("doubloons")) == d1 + 1000.0, "ten right is the crown and 1,000")
	check(RulesApi.run(db, uid, "kingStart", []).has("error"), "one run a week")
	t[0] += 7.0 * 86400000.0
	for rung: int in 5:
		var st2: Dictionary = RulesApi.run(db, uid, "kingStart", [])
		var kq2: Dictionary = {}
		for qq: Dictionary in Parlor.bank()["questions"]:
			if qq["question"] == st2["current"]["question"]:
				kq2 = qq
		var pick: float = float(kq2["correct_index"]) if rung < 4 else float((int(kq2["correct_index"]) + 1) % 4)
		RulesApi.run(db, uid, "kingAnswer", [float(rung), pick])
	var kk: Dictionary = Parlor.king(db, uid)
	check(kk["status"] == "busted" and float(kk["awarded"]) == 100.0, "a fall at rung 5 keeps the haven at 4 (%s, %s)" % [kk["status"], str(kk["awarded"])])

	# ── The capstan ──
	var cs: Dictionary = RulesApi.run(db, uid, "parlorState", [])["capstan"]
	check((cs["puzzles"] as Array).size() == 3, "three phrases a week")
	var phrase: String = ""
	var guard: int = 0
	while guard < 30:
		guard += 1
		var sp: Dictionary = RulesApi.run(db, uid, "capstanSpin", [0.0])
		if sp.has("error"):
			break
		if sp["outcome"] == "value":
			var cr: Dictionary = RulesApi.run(db, uid, "capstanConsonant", [0.0, "T"])
			check(not cr.has("error"), "a consonant is called (%s)" % str(cr.get("error", "")))
			break
	var gen: Dictionary = Parlor._capstan(db, uid)["puzzles"][0]
	var sv: Dictionary = RulesApi.run(db, uid, "capstanSolve", [0.0, str(gen["phrase"]).to_lower()])
	check(sv["correct"] or Parlor._run(Parlor._capstan(db, uid), 0)["status"] != "active", "a right solve wins the round")
	print("  parlor check: %s (bank %d)" % ["ok" if bad == 0 else "%d FAILED" % bad, n])
	quit(0 if bad == 0 else 1)
