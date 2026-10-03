extends SceneTree
## THE CAMPAIGN PUZZLES, by their rules (game/puzzles/*.gd, ports of the five
## boards in web/app/(app)/expeditions): the beacon press flips its cross; the
## cipher turn moves its neighbors; the mirror beam reflects, splits at the
## prism, passes the lenses and stops at walls (on the real coffers_lens
## layout); the cargo sailor pushes one crate, never two, never pulls; the
## tumbler bars slide only along their grooves, only as far as is clear, and
## the bolt runs out when its row is clear.
##
##   godot --headless --path godot/game -s tests/puzzle_check.gd

var bad: int = 0


func check(ok: bool, what: String) -> void:
	if not ok:
		bad += 1
		print("  FAILED: %s" % what)


func _init() -> void:
	_beacon()
	_cipher()
	_mirror()
	_cargo()
	_tumbler()
	_make()
	print("puzzles: %s" % ("ok" if bad == 0 else "%d FAILED" % bad))
	quit(1 if bad > 0 else 0)


func _beacon() -> void:
	var B: GDScript = load("res://game/puzzles/beacon.gd")
	var lit: Array = []
	lit.resize(16)
	lit.fill(true)
	# A middle press flips five; a corner three; an edge four.
	var a: Array = B.call("tap", lit, 4, 4, 5)
	var dark: Array = []
	for i: int in 16:
		if not a[i]:
			dark.append(i)
	check(dark == [1, 4, 5, 6, 9], "a middle press flips its cross: %s" % [dark])
	check(int(B.call("dark_count", B.call("tap", lit, 4, 4, 0))) == 3, "a corner press flips three")
	check(int(B.call("dark_count", B.call("tap", lit, 4, 4, 7))) == 4, "an edge press flips four (no wrap)")
	check(B.call("tap", a, 4, 4, 5) == lit, "pressing twice undoes it")
	check(bool(B.call("solved", lit)) and not bool(B.call("solved", a)), "solved is every beacon lit")
	for k: int in 30:
		var s: Array = B.call("scramble", 4, 4, 12)
		check(s.size() == 16 and not bool(B.call("solved", s)), "a scramble is never already lit")


func _cipher() -> void:
	var C: GDScript = load("res://game/puzzles/cipher.gd")
	var z: Array = [0, 0, 0, 0, 0]
	check(C.call("turn", z, 5, 2) == [0, 1, 1, 1, 0], "a middle turn moves both neighbors")
	check(C.call("turn", z, 5, 0) == [1, 1, 0, 0, 0], "an end turn moves its one neighbor")
	check(C.call("turn", z, 5, 4) == [0, 0, 0, 1, 1], "the other end too")
	var three: Array = C.call("turn", C.call("turn", C.call("turn", z, 5, 0), 5, 0), 5, 0)
	check(three == [3, 3, 0, 0, 0] and bool(C.call("solved", three, 3)), "three turns of three positions come back to the mark")
	check(int(C.call("aligned_count", [3, 1, 0, 2, 6], 3)) == 3, "aligned is a whole multiple of the positions")
	for k: int in 30:
		var s: Array = C.call("scramble", 5, 3, 9)
		check(s.size() == 5 and not bool(C.call("solved", s, 3)), "a scramble is never already sealed")


func _mirror() -> void:
	var M: GDScript = load("res://game/puzzles/mirror.gd")
	var lvl: Dictionary = Campaign.node("coffers_lens")["puzzle"]["mirror"]
	var o: Dictionary = M.call("start_orient", lvl)
	check(o.size() == 7 and o["3,0"] == "/" and o["6,5"] == "\\", "the start orientations read")
	# At the start: right along the top row, '/' at (3,0) turns it up and off.
	var tr: Dictionary = M.call("trace", lvl, o)
	check(not tr["hit"] and (tr["crossed"] as Dictionary).is_empty(), "the start lights nothing")
	check((tr["strokes"] as Array).size() == 1 and (tr["strokes"][0]["pts"] as PackedVector2Array).size() == 4, "one short stroke at the start")
	# The solve: (3,0) '\' down the column (through the lens at 3,2) to the
	# prism at (3,5), which splits left and right. Left: (1,5) '/' down, (1,7)
	# '\' right through the lens at (3,7). Right: (6,5) '/' up, (6,1) '\' left
	# through the lens at (4,1).
	var sol: Dictionary = o.duplicate()
	sol["3,0"] = "\\"
	sol["1,5"] = "/"
	sol["1,7"] = "\\"
	sol["6,5"] = "/"
	sol["6,1"] = "\\"
	tr = M.call("trace", lvl, sol)
	check(tr["hit"], "the known solve lights every lens")
	check((tr["strokes"] as Array).size() == 3, "the prism splits the beam in two (3 strokes): %d" % (tr["strokes"] as Array).size())
	var trunk: PackedVector2Array = tr["strokes"][0]["pts"]
	check(trunk[trunk.size() - 1] == Vector2(3.5, 5.5), "the trunk ends at the prism")
	check(trunk.has(Vector2(3.5, 2.5)), "the beam passes straight through a lens")
	check(is_equal_approx(float(tr["strokes"][1]["start"]), 8.0), "a branch starts where the trunk reached the prism")
	# One mirror wrong: only the lenses its branches reach.
	var part: Dictionary = o.duplicate()
	part["3,0"] = "\\"
	tr = M.call("trace", lvl, part)
	check(not tr["hit"] and (tr["crossed"] as Dictionary).keys() == ["3,2"], "half a route lights only the lens it crosses: %s" % [(tr["crossed"] as Dictionary).keys()])
	var near: Dictionary = sol.duplicate()
	near["6,1"] = "/"
	tr = M.call("trace", lvl, near)
	check(not tr["hit"] and (tr["crossed"] as Dictionary).size() == 2 and not (tr["crossed"] as Dictionary).has("4,1"), "one mirror off misses its lens")
	# Walls stop the beam (a small layout of the same rules).
	var tiny: Dictionary = { "cols": 5, "rows": 1, "source": { "x": 0, "y": 0, "dir": "right" }, "targets": [{ "x": 1, "y": 0 }, { "x": 4, "y": 0 }], "walls": [{ "x": 3, "y": 0 }], "mirrors": [] }
	tr = M.call("trace", tiny, {})
	var st: PackedVector2Array = tr["strokes"][0]["pts"]
	check(st[st.size() - 1] == Vector2(2.5, 0.5), "a wall stops the beam short of it")
	check((tr["crossed"] as Dictionary).has("1,0") and not tr["hit"], "the lens before the wall lights, the one past it does not")
	# A beam that loops back on itself is bounded.
	var loop: Dictionary = { "cols": 3, "rows": 3, "source": { "x": 0, "y": 0, "dir": "right" }, "targets": [], "walls": [], "mirrors": [{ "x": 2, "y": 0, "init": "\\" }, { "x": 2, "y": 2, "init": "/" }, { "x": 0, "y": 2, "init": "\\" }, { "x": 0, "y": 0, "init": "/" }] }
	tr = M.call("trace", loop, M.call("start_orient", loop))
	check((tr["strokes"] as Array).size() == 1, "a looping beam ends")


func _cargo() -> void:
	var K: GDScript = load("res://game/puzzles/cargo.gd")
	var p: Dictionary = K.call("parse", ["#######", "#@$ $ #", "# $   #", "#  .. #", "#######"])
	var walls: Dictionary = p["walls"]
	check(int(p["player"]) == 101 and (p["crates"] as Array) == [102, 104, 202], "the room parses")
	# Push the crate right: the sailor steps in, the crate one on.
	var r: Dictionary = K.call("step", walls, 101, p["crates"], 0, 1)
	check(r["ok"] and r["pushed"] and int(r["player"]) == 102 and (r["crates"] as Array).has(103), "a push moves the crate one cell")
	# Push again: two crates in a row do not move.
	var r2: Dictionary = K.call("step", walls, 102, r["crates"], 0, 1)
	check(not r2["ok"] and int(r2["player"]) == 102, "two crates in a row cannot be pushed")
	# Walk away from a crate: it stays (no pulling).
	var r3: Dictionary = K.call("step", walls, 102, r["crates"], 0, -1)
	check(r3["ok"] and not r3["pushed"] and int(r3["player"]) == 101 and (r3["crates"] as Array) == (r["crates"] as Array), "stepping away never pulls")
	# A wall stops the sailor; a crate against a wall cannot be pushed.
	check(not K.call("step", walls, 101, p["crates"], -1, 0)["ok"], "a wall stops the sailor")
	var q: Dictionary = K.call("parse", ["#####", "# @$#", "#####"])
	check(not K.call("step", q["walls"], q["player"], q["crates"], 0, 1)["ok"], "a crate against a wall cannot be pushed")
	check(bool(K.call("deadlocked", 103, q["walls"], q["plates"])), "a crate in a corner off its mark is stuck")
	check(not bool(K.call("solved", p["crates"], p["plates"])), "not solved with crates off the marks")
	check(bool(K.call("solved", [303, 304], p["plates"])), "solved when every crate sits on a mark")
	# The live rooms parse with a sailor, and as many marks as crates.
	for room: Dictionary in Campaign.node("throne_locks")["puzzle"]["cargo"]["rooms"]:
		var rp: Dictionary = K.call("parse", room["grid"])
		check((rp["crates"] as Array).size() == (rp["plates"] as Dictionary).size() and (rp["crates"] as Array).size() > 0, "a live room has a mark for every crate")


func _tumbler() -> void:
	var T: GDScript = load("res://game/puzzles/tumbler.gd")
	var p: Dictionary = T.call("parse", ["AA...O", "P..Q.O", "PZZQ.O", "P..Q..", "B...CC", "B.RRR."])
	var bars: Array = p["bars"]
	var by: Dictionary = {}
	for b: Dictionary in bars:
		by[b["id"]] = b
	check(bars.size() == 8 and by["Z"]["axis"] == "h" and int(by["Z"]["len"]) == 2 and by["Q"]["axis"] == "v" and int(by["Q"]["len"]) == 3, "the stage parses")
	check(str(bars[0]["id"]) == "A", "bars keep their order of first appearance")
	# The bolt cannot run left past P, and right only to Q.
	check(T.call("free_range", bars, "Z", 6, 6) == Vector2i(0, 0), "the bolt is boxed in")
	# Q (column 3, rows 1..3) can go down? row 4 col 3 is '.', row 5 col 3 is R.
	check(T.call("free_range", bars, "Q", 6, 6) == Vector2i(-1, 1), "Q slides up to the top and down to R: %s" % [T.call("free_range", bars, "Q", 6, 6)])
	check(T.call("free_range", bars, "A", 6, 6) == Vector2i(0, 3), "A slides right to O")
	check(not bool(T.call("bolt_clear", bars, 6)), "the bolt's row is blocked")
	var moved: Array = T.call("slide", bars, "Q", -1)
	check(int(moved[3]["r"]) == 0 and int(moved[3]["c"]) == 3 and int(bars[3]["r"]) == 1, "a slide moves only along the groove and copies")
	check(bool(T.call("bolt_clear", moved, 6)) == false, "Q up one still blocks the bolt (rows 0..2)")
	# A small lock: the bar Q across the bolt's row slides down out of it.
	var lk: Dictionary = T.call("parse", ["ZZ.Q", "...Q", "...."])
	check(not bool(T.call("bolt_clear", lk["bars"], 4)), "Q blocks the bolt")
	check(T.call("free_range", lk["bars"], "Q", 3, 4) == Vector2i(0, 1), "Q slides down one, no further than the edge")
	check(T.call("free_range", lk["bars"], "Z", 3, 4) == Vector2i(0, 1), "the bolt slides right up to Q")
	check(bool(T.call("bolt_clear", T.call("slide", lk["bars"], "Q", 1), 4)), "Q down clears the row: the bolt runs out")
	# The last stage's own data: every stage has a bolt.
	for stg: Dictionary in Campaign.node("throne_gates")["puzzle"]["tumbler"]["stages"]:
		var sp: Dictionary = T.call("parse", stg["grid"])
		var has_z: bool = false
		for b: Dictionary in sp["bars"]:
			if b["id"] == "Z":
				has_z = true
		check(has_z and not bool(T.call("bolt_clear", sp["bars"], int(sp["cols"]))), "a live stage starts with the bolt blocked")


func _make() -> void:
	for id: String in ["smugglers_chart", "gullet_cipher", "coffers_lens", "coffers_vault_lens", "throne_locks", "throne_gates"]:
		var b: PuzzleBoard = PuzzleBoard.make(Campaign.node(id)["puzzle"])
		check(b != null, "%s makes a board" % id)
		if b != null:
			b.free()
	var nk: PuzzleBoard = PuzzleBoard.make({ "kind": null, "cols": 4, "rows": 4 })
	check(nk != null and (nk.get_script() as GDScript).resource_path.ends_with("beacon.gd"), "no kind is the beacon chain")
	if nk != null:
		nk.free()
