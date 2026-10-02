extends SceneTree
## NOTICES (core/crew.gd): the odds a board brings an Epic or a Legendary,
## free (the Tavern Notice), from a Harbor Bill and from a Captain's
## Proclamation, over 20,000 boards each; a Last Will casket always holds a
## Bill; posting spends one and replaces the board; none held, none posted.
##
##   godot --headless --path godot/game -s tests/notice_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	Captains.dir_override = "user://notice_captains"
	for f: String in DirAccess.get_files_at(Captains.dir_override) if DirAccess.dir_exists_absolute(Captains.dir_override) else PackedStringArray():
		DirAccess.remove_absolute("%s/%s" % [Captains.dir_override, f])
	Main.straight_to_sea = true
	var main: Node = (load("res://main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	await process_frame
	var sea: Sea = main.get_child(main.get_child_count() - 1)
	var db: CaptainStore = sea.session.store
	var uid: String = sea.session.uid
	# Every legendary in reach, so the odds are the odds.
	db.me(uid)["legendary_unlocks"] = ["mako", "dole", "coelacanth", "moorish_idol"]
	var unlocks: Array = db.me(uid)["legendary_unlocks"]
	var want: Dictionary = { "free": [0.05, 0.0], "harbor_bill": [0.15, 0.01], "captains_proclamation": [0.20, 1.0 / 34.0] }
	for k: String in want:
		var w: Array = Crew.port()["freeWeights"] if k == "free" else Crew.notice_defs()[k]["weights"]
		var epic: int = 0
		var leg: int = 0
		var n: int = 20000
		for i: int in n:
			var b: Array = Crew.roll_board(3, w, unlocks)
			if b.any(func(c: Dictionary) -> bool: return float(c["rarity"]) == 3.0):
				epic += 1
			if b.any(func(c: Dictionary) -> bool: return float(c["rarity"]) == 4.0):
				leg += 1
		var e: float = float(epic) / n
		var l: float = float(leg) / n
		print("  %s: Epic on %.1f%% of boards (want %.1f%%), Legendary on %.2f%% (want %.2f%%)" % [k, e * 100.0, want[k][0] * 100.0, l * 100.0, want[k][1] * 100.0])
		check(absf(e - float(want[k][0])) < 0.012, "%s Epic rate" % k)
		check(absf(l - float(want[k][1])) < 0.006, "%s Legendary rate" % k)
	# A Last Will casket always holds a Bill.
	var before: float = Js.num(Crew.notices_held(db.me(uid)).get("harbor_bill"))
	var cask: Dictionary = Clues.open_casket(db, uid, "elite")
	check(Js.obj(cask.get("notices")).has("harbor_bill"), "a Last Will casket holds a Harbor Bill")
	check(Js.num(Crew.notices_held(db.me(uid)).get("harbor_bill")) == before + 1.0, "the Bill is held")
	# Posting: one spent, a fresh board; none held, refused.
	var board0: Array = Js.list(db.save.get("recruits")).map(func(r: Dictionary) -> float: return float(r["id"]))
	var post: Dictionary = RulesApi.run(db, uid, "postNotice", ["harbor_bill"])
	check(post.has("state"), "a Bill posts (%s)" % str(post.get("error", "")))
	check(Js.num(Crew.notices_held(db.me(uid)).get("harbor_bill")) == before, "the Bill is spent")
	var board1: Array = Js.list(db.save.get("recruits")).map(func(r: Dictionary) -> float: return float(r["id"]))
	check(board1.size() == 3 and not board1.any(func(id: float) -> bool: return board0.has(id)), "the board is replaced")
	check(RulesApi.run(db, uid, "getCrewState", [])["board"].size() == 3, "the posted board is not taken down by today's free one")
	var none: Dictionary = RulesApi.run(db, uid, "postNotice", ["captains_proclamation"])
	check(none.has("error"), "no Proclamation held, none posted")
	print("  notices %s" % ("FAILED" if bad > 0 else "ok"))
	quit(1 if bad > 0 else 0)
