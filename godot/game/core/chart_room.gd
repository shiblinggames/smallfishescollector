class_name ChartRoom
extends RefCounted
## THE CHART ROOM, RULES (a port of web/lib/core/chartRoom.ts, lib/chartBoards,
## lib/worldChart, the four pure engines and the local store's chartLocal).
## Four weekly puzzles, each board built by code from the dice the first time
## its week is asked for and kept in the save, so a board never changes under
## a player mid-week:
##   TREASURE MATCH  a seeded Match-3; the run is REPLAYED from the swaps,
##                   never believed; the best score's tier (0-5) banks.
##   THE MINEFIELD   minesweeper; the mines never leave the rules; a bust
##                   resets to the opening; the first clear banks 3.
##   THE HOLD        four sudoku a week (Skiff to Man-o-War); a tally marks the
##                   wrong cells and spends the clean bonus; each solve pays
##                   doubloons and banks its difficulty.
##   THE RIGGING     connect the pairs, cover every plank; the first clear
##                   banks 5.
## Points are puzzle_points, lifetime; they uncover the World Chart's thirteen
## landmarks. On the web a landmark pays gems; in the port (gems retired, Kong
## 2026-10-03) it pays a SKIN VOUCHER (port_rules chartRoom.landmarkVouchers),
## and charting the whole sea one more. Parity: tests/parity/chart.json.

## The four pure engines live in parts beside this file (split 2026-10-10 for
## size): chart_room_match.gd, chart_room_minefield.gd, chart_room_sudoku.gd
## and chart_room_rigging.gd. This file keeps the weekly boards, the actions
## over the save and the World Chart.

const ChartMatch = preload("res://core/chart_room_match.gd")
const ChartMinefield = preload("res://core/chart_room_minefield.gd")
const ChartSudoku = preload("res://core/chart_room_sudoku.gd")
const ChartRigging = preload("res://core/chart_room_rigging.gd")

const WILD: int = ChartMatch.WILD
const HOLD_DIFFS: Array = ["easy", "medium", "hard", "extreme"]
const KEEP_WEEKS: int = 12


static func c() -> Dictionary:
	return Rules.data()["chartRoom"]


static func port() -> Dictionary:
	return Js.obj(Rules.data().get("chartRoomPort"))


## The Monday (UTC) of the week holding `ms`, YYYY-MM-DD: every puzzle's key.
static func week_of(ms: float) -> String:
	var days: int = int(floor(ms / 86400000.0))
	var dow: int = ((days + 4) % 7 + 7) % 7
	var monday: int = days - (dow + 6) % 7
	return Js.iso(float(monday) * 86400000.0).split("T")[0]


static func week() -> String:
	return week_of(Clock.now_ms())


static func _ch(db: CaptainStore) -> Dictionary:
	if not (db.save.get("charting") is Dictionary):
		db.save["charting"] = { "boards": { "match": {}, "minefield": {}, "sudoku": {}, "rigging": {} }, "match": {}, "minefield": {}, "rigging": {}, "hold": {} }
	return db.save["charting"]


static func _trim(by_week: Dictionary) -> Dictionary:
	var keys: Array = by_week.keys()
	keys.sort()
	var keep: Array = keys.slice(maxi(0, keys.size() - KEEP_WEEKS))
	var out: Dictionary = {}
	for k: Variant in keep:
		out[k] = by_week[k]
	return out


static func _points(db: CaptainStore, uid: String) -> float:
	return Js.nz(db.profile(uid, "puzzle_points").get("puzzle_points"), 0.0)


## This week's board of a kind: the one built, or a new one kept for the week.
static func _board(db: CaptainStore, kind: String, wk: String, build: Callable, ok: Callable = Callable()) -> Variant:
	var boards: Dictionary = _ch(db)["boards"][kind]
	if boards.has(wk) and (not ok.is_valid() or ok.call(boards[wk])):
		return boards[wk].duplicate(true)
	var b: Variant = build.call()
	if b == null:
		var prior: Array = boards.keys().filter(func(k: String) -> bool: return k < wk)
		prior.sort()
		return boards[prior[prior.size() - 1]].duplicate(true) if not prior.is_empty() else null
	boards[wk] = b
	_ch(db)["boards"][kind] = _trim(boards)
	return (b as Dictionary).duplicate(true)


# ══ The engines (forwarders: the screens call these on ChartRoom) ═════════════

static func initial_board(rng: Dice.Mulberry32, cols: int, rows: int, n: int) -> Array:
	return ChartMatch.initial_board(rng, cols, rows, n)


static func adjacent4(a: int, b: int, cols: int) -> bool:
	return ChartMatch.adjacent4(a, b, cols)


static func find_matches(board: Array, cols: int, rows: int) -> Array:
	return ChartMatch.find_matches(board, cols, rows)


static func swapped(board: Array, a: int, b: int) -> Array:
	return ChartMatch.swapped(board, a, b)


## resolveSwap: null for a swap that makes no match.
static func resolve_swap(board: Array, a: int, b: int, cols: int, rows: int, n: int, rng: Dice.Mulberry32, wild_chance: float) -> Variant:
	return ChartMatch.resolve_swap(board, a, b, cols, rows, n, rng, wild_chance)


static func has_valid_move(board: Array, cols: int, rows: int) -> bool:
	return ChartMatch.has_valid_move(board, cols, rows)


static func reshuffle(rng: Dice.Mulberry32, cols: int, rows: int, n: int) -> Array:
	return ChartMatch.reshuffle(rng, cols, rows, n)


static func _box(idx: int) -> int:
	return ChartSudoku._box(idx)


static func neighbors4(i: int, cols: int, rows: int) -> Array:
	return ChartRigging.neighbors4(i, cols, rows)


# ══ The week's boards ═════════════════════════════════════════════════════════

static func _match_board(db: CaptainStore) -> Dictionary:
	var m: Dictionary = c()["match"]
	return _board(db, "match", week(), func() -> Variant:
		return { "seed": float(int(floor(Dice.next() * 0x7fffffff))), "cols": m["cols"], "rows": m["rows"], "types": m["types"], "target": m["target"], "moves": m["moves"] })


static func _minefield_board(db: CaptainStore) -> Dictionary:
	var m: Dictionary = c()["minefield"]
	return _board(db, "minefield", week(), func() -> Variant:
		var g: Dictionary = ChartMinefield.generate_minefield(int(m["cols"]), int(m["rows"]), int(m["mines"]))
		return { "cols": m["cols"], "rows": m["rows"], "mineCount": m["mines"], "mines": g["mines"], "opening": g["opening"] })


static func _sudoku_board(db: CaptainStore) -> Dictionary:
	return _board(db, "sudoku", week(), func() -> Variant:
		var out: Dictionary = {}
		for d: String in HOLD_DIFFS:
			out[d] = ChartSudoku.generate_sudoku(int(c()["hold"][d]["givens"]))
		return out, func(b: Variant) -> bool:
			return HOLD_DIFFS.all(func(d: String) -> bool: return Js.obj(b).has(d) and Js.obj(Js.obj(b)[d]).get("givens") is String))


static func _rigging_board(db: CaptainStore) -> Dictionary:
	var m: Dictionary = c()["rigging"]
	return _board(db, "rigging", week(), func() -> Variant:
		return ChartRigging.generate_rigging(int(m["cols"]), int(m["rows"]), int(m["colors"])))


## A puzzle's Fishing gate (port rules; none under the web's tables).
static func gate(db: CaptainStore, uid: String, kind: String) -> String:
	return Rules.gate_block("feature", "chart_%s" % kind, Js.num(db.profile(uid, "fishing_xp").get("fishing_xp")))


# ══ Treasure Match ════════════════════════════════════════════════════════════

static func match_state(db: CaptainStore, uid: String) -> Dictionary:
	var wk: String = week()
	var cfg: Dictionary = _match_board(db)
	var a: Dictionary = Js.obj(_ch(db)["match"].get(wk))
	if a.is_empty():
		a = { "status": "active", "best_score": 0.0, "points_awarded": 0.0 }
	return {
		"week": wk, "seed": cfg["seed"], "cols": cfg["cols"], "rows": cfg["rows"], "types": cfg["types"],
		"target": c()["match"]["target"], "moves": cfg["moves"], "status": a["status"], "bestScore": a["best_score"],
		"pointsAwarded": a["points_awarded"], "puzzlePoints": _points(db, uid),
	}


static func submit_match(db: CaptainStore, uid: String, moves: Variant) -> Dictionary:
	if not (moves is Array):
		return { "error": "Please reload the page and try again." }
	var g: String = gate(db, uid, "match")
	if g != "":
		return { "error": g }
	var wk: String = week()
	var cfg: Dictionary = _match_board(db)
	var row: Variant = _ch(db)["match"].get(wk)
	var attempt: Dictionary = Js.obj(row) if row != null else { "status": "active", "best_score": 0.0, "points_awarded": 0.0 }
	var old_points: float = _points(db, uid)
	var mv: Array = moves
	if mv.size() > int(cfg["moves"]):
		db.flag_anomaly(uid, "implausible:matchMoveCount", 3.0, { "sent": float(mv.size()), "allowed": cfg["moves"] })
		return { "error": "Invalid run" }
	var cols: int = int(cfg["cols"])
	var rows: int = int(cfg["rows"])
	var types: int = int(cfg["types"])
	var cells: int = cols * rows
	var rng: Dice.Mulberry32 = Dice.Mulberry32.new(int(cfg["seed"]))
	var board: Array = initial_board(rng, cols, rows, types)
	var score: float = 0.0
	var left: int = int(cfg["moves"])
	var wild: float = float(c()["match"]["wildDropChance"])
	for k: int in mv.size():
		var m: Variant = mv[k]
		if not (m is Array) or (m as Array).size() != 2:
			return { "error": "Invalid run" }
		var av: Variant = m[0]
		var bv: Variant = m[1]
		if not (av is float or av is int) or not (bv is float or bv is int) or float(av) != floor(float(av)) or float(bv) != floor(float(bv)):
			return { "error": "Invalid run" }
		var a: int = int(av)
		var b: int = int(bv)
		if a < 0 or b < 0 or a >= cells or b >= cells:
			return { "error": "Invalid run" }
		var res: Variant = resolve_swap(board, a, b, cols, rows, types, rng, wild)
		if res == null:
			var at: int = -1
			for q: int in mv.size():
				if is_same(mv[q], m):
					at = q
					break
			db.flag_anomaly(uid, "implausible:matchInvalidSwap", 3.0, { "a": float(a), "b": float(b), "at": float(at) })
			return { "error": "Invalid run" }
		board = res["board"]
		score += float(res["gained"])
		left -= 1
		if score >= float(cfg["target"]):
			break
		if left <= 0:
			break
		if not has_valid_move(board, cols, rows):
			board = reshuffle(rng, cols, rows, types)
	var best: float = maxf(float(attempt["best_score"]), floor(score))
	var tier: int = ChartMatch.points_for_score(best)
	var delta: int = maxi(0, tier - int(attempt["points_awarded"]))
	var maxed: bool = tier >= int(c()["match"]["maxPoints"])
	var ms: Dictionary = _ch(db)["match"]
	if delta <= 0:
		if row == null:
			ms[wk] = { "status": "cleared" if maxed else "active", "best_score": best, "points_awarded": 0.0 }
			_ch(db)["match"] = _trim(ms)
		elif float(row["best_score"]) < best:
			row["best_score"] = best
			if maxed:
				row["status"] = "cleared"
		return { "bestScore": best, "tier": float(tier), "pointsWon": 0.0, "maxed": maxed, "newPuzzlePoints": null }
	ms[wk] = { "status": "cleared" if maxed else "active", "best_score": best, "points_awarded": float(tier) }
	_ch(db)["match"] = _trim(ms)
	var np: float = old_points + delta
	db.update_profile(uid, { "puzzle_points": np })
	return { "bestScore": best, "tier": float(tier), "pointsWon": float(delta), "maxed": maxed, "newPuzzlePoints": np }


# ══ The Minefield ═════════════════════════════════════════════════════════════

static func _tiles(indices: Array, layout: Dictionary) -> Array:
	var mines: Dictionary = ChartMinefield.set_of(layout["mines"])
	return indices.map(func(i: Variant) -> Dictionary: return { "i": float(i), "adj": float(ChartMinefield.adjacent_mines(mines, int(i), int(layout["cols"]), int(layout["rows"]))) })


static func _fresh_mf(layout: Dictionary) -> Dictionary:
	return { "revealed": (layout["opening"] as Array).duplicate(), "flagged": [], "status": "active", "points_awarded": 0.0, "busts": 0.0 }


static func _save_mf(db: CaptainStore, wk: String, a: Dictionary) -> void:
	var cur: Variant = _ch(db)["minefield"].get(wk)
	if cur != null and float(cur["points_awarded"]) != 0.0:
		return
	_ch(db)["minefield"][wk] = { "revealed": (a["revealed"] as Array).duplicate(), "flagged": (a["flagged"] as Array).duplicate(), "status": a["status"], "busts": a["busts"], "points_awarded": 0.0 }
	_ch(db)["minefield"] = _trim(_ch(db)["minefield"])


static func minefield_state(db: CaptainStore, uid: String) -> Dictionary:
	var wk: String = week()
	var layout: Dictionary = _minefield_board(db)
	var a: Variant = _ch(db)["minefield"].get(wk)
	if a == null:
		a = _fresh_mf(layout)
		_save_mf(db, wk, a)
	a = Js.obj(a).duplicate(true)
	return {
		"week": wk, "cols": layout["cols"], "rows": layout["rows"], "mineCount": layout["mineCount"],
		"revealed": _tiles(a["revealed"], layout), "flagged": a["flagged"], "status": a["status"], "busts": a["busts"],
		"pointsAwarded": a["points_awarded"], "reward": c()["minefield"]["points"], "puzzlePoints": _points(db, uid),
	}


static func reveal_cell(db: CaptainStore, uid: String, index: Variant) -> Dictionary:
	var wk: String = week()
	var layout: Dictionary = _minefield_board(db)
	var cells: int = int(layout["cols"]) * int(layout["rows"])
	if not (index is float or index is int) or float(index) != floor(float(index)) or int(index) < 0 or int(index) >= cells:
		return { "error": "Invalid tile" }
	var g: String = gate(db, uid, "minefield")
	if g != "":
		return { "error": g }
	var i: int = int(index)
	var existing: Variant = _ch(db)["minefield"].get(wk)
	var a: Dictionary = Js.obj(existing).duplicate(true) if existing != null else _fresh_mf(layout)
	if a["status"] == "cleared":
		return { "busted": false, "cleared": true, "revealed": _tiles(a["revealed"], layout), "status": "cleared", "busts": a["busts"], "pointsWon": 0.0, "newPuzzlePoints": null }
	var rset: Dictionary = ChartMinefield.set_of(a["revealed"])
	var fset: Dictionary = ChartMinefield.set_of(a["flagged"])
	if rset.has(i) or fset.has(i):
		return { "busted": false, "cleared": false, "revealed": _tiles(a["revealed"], layout), "status": "active", "busts": a["busts"], "pointsWon": 0.0, "newPuzzlePoints": null }
	var mines: Dictionary = ChartMinefield.set_of(layout["mines"])
	if mines.has(i):
		a["revealed"] = (layout["opening"] as Array).duplicate()
		a["busts"] = float(a["busts"]) + 1.0
		_save_mf(db, wk, a)
		return { "busted": true, "cleared": false, "revealed": _tiles(a["revealed"], layout), "status": "active", "busts": a["busts"], "pointsWon": 0.0, "newPuzzlePoints": null }
	var fresh: Array = ChartMinefield.flood_reveal(mines, int(layout["cols"]), int(layout["rows"]), i, rset, fset)
	var rev: Array = (a["revealed"] as Array).duplicate()
	for f: int in fresh:
		if not rset.has(f):
			rset[f] = true
			rev.append(float(f))
	a["revealed"] = rev
	var cleared: bool = rev.size() >= cells - int(layout["mineCount"])
	var won: float = 0.0
	var np: Variant = null
	if cleared and float(a["points_awarded"]) == 0.0:
		a["status"] = "cleared"
		a["points_awarded"] = float(c()["minefield"]["points"])
		var cur: Variant = _ch(db)["minefield"].get(wk)
		if cur == null or float(cur["points_awarded"]) == 0.0:
			_ch(db)["minefield"][wk] = a.duplicate(true)
			_ch(db)["minefield"] = _trim(_ch(db)["minefield"])
			won = float(c()["minefield"]["points"])
			np = _points(db, uid) + won
			db.update_profile(uid, { "puzzle_points": np })
	else:
		if cleared:
			a["status"] = "cleared"
		_save_mf(db, wk, a)
	return { "busted": false, "cleared": cleared, "revealed": _tiles(a["revealed"], layout), "status": a["status"], "busts": a["busts"], "pointsWon": won, "newPuzzlePoints": np }


static func toggle_flag(db: CaptainStore, uid: String, index: Variant) -> Dictionary:
	var wk: String = week()
	var layout: Dictionary = _minefield_board(db)
	var cells: int = int(layout["cols"]) * int(layout["rows"])
	if not (index is float or index is int) or float(index) != floor(float(index)) or int(index) < 0 or int(index) >= cells:
		return { "error": "Invalid tile" }
	var existing: Variant = _ch(db)["minefield"].get(wk)
	var a: Dictionary = Js.obj(existing).duplicate(true) if existing != null else _fresh_mf(layout)
	if a["status"] == "cleared":
		return { "flagged": a["flagged"] }
	if (a["revealed"] as Array).any(func(x: Variant) -> bool: return int(x) == int(index)):
		return { "flagged": a["flagged"] }
	var fl: Array = (a["flagged"] as Array).duplicate()
	var at: int = -1
	for k: int in fl.size():
		if int(fl[k]) == int(index):
			at = k
	if at >= 0:
		fl.remove_at(at)
	else:
		fl.append(float(index))
	a["flagged"] = fl
	_save_mf(db, wk, a)
	return { "flagged": fl }


# ══ The Quartermaster's Hold ══════════════════════════════════════════════════

static func _empty_hold() -> Dictionary:
	return { "progress": {}, "solved": {}, "doubloons_awarded": 0.0 }


static func _board_ok(s: Variant) -> bool:
	if not (s is String) or (s as String).length() != 81:
		return false
	for ch: String in s:
		if not (ch == "." or (ch >= "1" and ch <= "9")):
			return false
	return true


static func _notes_ok(n: String) -> bool:
	if n.length() > 810:
		return false
	var parts: PackedStringArray = n.split(",")
	if parts.size() != 81:
		return false
	for p: String in parts:
		var seen: Dictionary = {}
		for ch: String in p:
			if ch < "1" or ch > "9" or seen.has(ch):
				return false
			seen[ch] = true
	return true


## saveHold: written only over the row read (by its stamp).
static func _save_hold(db: CaptainStore, wk: String, read: Dictionary, nxt: Dictionary) -> bool:
	var cur: Variant = _ch(db)["hold"].get(wk)
	if not read.has("updated_at"):
		if cur != null:
			return false
	elif cur == null or cur.get("updated_at") != read["updated_at"]:
		return false
	var row: Dictionary = nxt.duplicate(true)
	row["updated_at"] = "%s#%d" % [Js.iso(Clock.now_ms()), int(db.next_id())]
	_ch(db)["hold"][wk] = row
	_ch(db)["hold"] = _trim(_ch(db)["hold"])
	return true


static func _hold_row(db: CaptainStore, wk: String) -> Dictionary:
	var r: Variant = _ch(db)["hold"].get(wk)
	return Js.obj(r).duplicate(true) if r != null else _empty_hold()


static func hold_state(db: CaptainStore, uid: String) -> Dictionary:
	var wk: String = week()
	var puzzles: Dictionary = _sudoku_board(db)
	var a: Dictionary = _hold_row(db, wk)
	var out: Array = []
	for d: String in HOLD_DIFFS:
		var prog: Dictionary = Js.obj(a["progress"].get(d))
		var sol: Dictionary = Js.obj(a["solved"].get(d))
		out.append({
			"difficulty": d, "givens": puzzles[d]["givens"],
			"progress": prog.get("entries") if not prog.is_empty() else null,
			"notes": prog.get("notes") if not prog.is_empty() else null,
			"hintsUsed": Js.nz(prog.get("hints"), 0.0),
			"solved": { "doubloons": sol["doubloons"], "clean": sol["clean"] } if not sol.is_empty() else null,
		})
	return { "date": wk, "puzzles": out, "doubloonsAwarded": a["doubloons_awarded"], "puzzlePoints": _points(db, uid) }


static func save_hold_progress(db: CaptainStore, uid: String, d: String, entries: Variant, notes: Variant = null) -> Dictionary:
	if not HOLD_DIFFS.has(d):
		return { "error": "Unknown hold" }
	if not _board_ok(entries):
		return { "error": "Invalid board" }
	if notes != null and (not (notes is String) or not _notes_ok(notes)):
		return { "error": "Invalid notes" }
	var wk: String = week()
	var a: Dictionary = _hold_row(db, wk)
	if Js.obj(a["solved"]).has(d):
		return { "ok": true }
	var prev: Dictionary = Js.obj(a["progress"].get(d))
	var progress: Dictionary = Js.obj(a["progress"]).duplicate(true)
	var p: Dictionary = { "entries": entries, "hints": Js.nz(prev.get("hints"), 0.0) }
	var nn: Variant = notes if notes != null else prev.get("notes")
	if nn != null:
		p["notes"] = nn
	progress[d] = p
	_save_hold(db, wk, a, { "progress": progress, "solved": a["solved"], "doubloons_awarded": a["doubloons_awarded"] })
	return { "ok": true }


static func _wrong(entries: String, solution: String, filled_only: bool) -> Array:
	var w: Array = []
	for i: int in 81:
		w.append((not filled_only or entries[i] != ".") and entries[i] != solution[i])
	return w


static func tally_hold(db: CaptainStore, uid: String, d: String, entries: Variant) -> Dictionary:
	if not HOLD_DIFFS.has(d):
		return { "error": "Unknown hold" }
	if not _board_ok(entries):
		return { "error": "Invalid board" }
	var wk: String = week()
	var puzzles: Dictionary = _sudoku_board(db)
	var a: Dictionary = _hold_row(db, wk)
	var wrong: Array = _wrong(entries, puzzles[d]["solution"], true)
	var hints: float = Js.nz(Js.obj(a["progress"].get(d)).get("hints"), 0.0) + 1.0
	var progress: Dictionary = Js.obj(a["progress"]).duplicate(true)
	progress[d] = { "entries": entries, "hints": hints }
	if not _save_hold(db, wk, a, { "progress": progress, "solved": a["solved"], "doubloons_awarded": a["doubloons_awarded"] }):
		return { "error": "The quartermaster lost count. Try again." }
	return { "wrong": wrong, "hintsUsed": hints }


static func submit_hold(db: CaptainStore, uid: String, d: String, entries: Variant) -> Dictionary:
	if not HOLD_DIFFS.has(d):
		return { "error": "Unknown hold" }
	if not _board_ok(entries):
		return { "error": "Invalid board" }
	var g: String = gate(db, uid, "hold")
	if g != "":
		return { "error": g }
	var wk: String = week()
	var puzzles: Dictionary = _sudoku_board(db)
	var a: Dictionary = _hold_row(db, wk)
	if Js.obj(a["solved"]).has(d):
		return { "error": "This hold is already stowed" }
	var givens: String = puzzles[d]["givens"]
	var solution: String = puzzles[d]["solution"]
	var e: String = entries
	for i: int in 81:
		if givens[i] != "." and e[i] != givens[i]:
			return { "error": "The manifest has been tampered with" }
	if e.contains("."):
		return { "error": "The hold is not yet full" }
	var old_points: float = _points(db, uid)
	var meta: Dictionary = c()["hold"][d]
	if e != solution:
		var hints: float = Js.nz(Js.obj(a["progress"].get(d)).get("hints"), 0.0) + 1.0
		var progress: Dictionary = Js.obj(a["progress"]).duplicate(true)
		progress[d] = { "entries": e, "hints": hints }
		if not _save_hold(db, wk, a, { "progress": progress, "solved": a["solved"], "doubloons_awarded": a["doubloons_awarded"] }):
			return { "error": "The quartermaster lost count. Try again." }
		return { "correct": false, "wrong": _wrong(e, solution, false), "doubloonsWon": 0.0, "clean": false, "newDoubloons": null, "pointsWon": 0.0, "newPuzzlePoints": old_points, "hintsUsed": hints }
	var clean: bool = Js.nz(Js.obj(a["progress"].get(d)).get("hints"), 0.0) == 0.0
	var won: float = float(meta["payout"]) + (float(Js.round(float(meta["payout"]) * float(c()["hold"]["cleanFraction"]))) if clean else 0.0)
	var pts: float = float(meta["points"])
	var solved: Dictionary = Js.obj(a["solved"]).duplicate(true)
	solved[d] = { "doubloons": won, "clean": clean, "points": pts, "solved_at": Js.iso(Clock.now_ms()) }
	var progress2: Dictionary = Js.obj(a["progress"]).duplicate(true)
	progress2[d] = { "entries": e, "hints": Js.nz(Js.obj(a["progress"].get(d)).get("hints"), 0.0) }
	if not _save_hold(db, wk, a, { "progress": progress2, "solved": solved, "doubloons_awarded": float(a["doubloons_awarded"]) + won }):
		return { "error": "This hold is already stowed" }
	var nd: float = db.grant(uid, "doubloons", won)
	db.update_profile(uid, { "puzzle_points": old_points + pts })
	db.ledger(uid, won, "The Hold: %s%s" % [meta["label"], " (clean)" if clean else ""])
	if d == "extreme":
		db.grant_badge(uid, "fully_laden")
	if solved.size() == HOLD_DIFFS.size():
		db.grant_badge(uid, "clean_manifest")
	return { "correct": true, "doubloonsWon": won, "clean": clean, "newDoubloons": nd, "pointsWon": pts, "newPuzzlePoints": old_points + pts }


# ══ Lay the Rigging ═══════════════════════════════════════════════════════════

static func _rig_row(db: CaptainStore, wk: String) -> Dictionary:
	var r: Variant = _ch(db)["rigging"].get(wk)
	return Js.obj(r).duplicate(true) if r != null else { "paths": {}, "status": "active", "points_awarded": 0.0 }


static func _save_rig(db: CaptainStore, wk: String, paths: Dictionary) -> void:
	var cur: Variant = _ch(db)["rigging"].get(wk)
	if cur != null and cur["status"] != "active":
		return
	_ch(db)["rigging"][wk] = { "paths": paths.duplicate(true), "status": "active", "points_awarded": Js.nz(Js.obj(cur).get("points_awarded"), 0.0) if cur != null else 0.0 }
	_ch(db)["rigging"] = _trim(_ch(db)["rigging"])


static func rigging_state(db: CaptainStore, uid: String) -> Dictionary:
	var wk: String = week()
	var layout: Dictionary = _rigging_board(db)
	var a: Dictionary = _rig_row(db, wk)
	return {
		"week": wk, "cols": layout["cols"], "rows": layout["rows"], "pairs": layout["pairs"],
		"paths": Js.nz(a.get("paths"), {}), "status": a["status"], "pointsAwarded": a["points_awarded"],
		"reward": c()["rigging"]["points"], "puzzlePoints": _points(db, uid),
	}


static func save_rigging(db: CaptainStore, uid: String, paths: Variant) -> Dictionary:
	if not (paths is Dictionary):
		return { "error": "Invalid paths" }
	var wk: String = week()
	var cur: Variant = _ch(db)["rigging"].get(wk)
	if cur != null and cur["status"] == "cleared":
		return { "ok": true }
	_save_rig(db, wk, paths)
	return { "ok": true }


static func submit_rigging(db: CaptainStore, uid: String, paths: Variant) -> Dictionary:
	var wk: String = week()
	var layout: Dictionary = _rigging_board(db)
	var a: Dictionary = _rig_row(db, wk)
	var old_points: float = _points(db, uid)
	var pd: Dictionary = paths if paths is Dictionary else {}
	var g: String = gate(db, uid, "rigging")
	if g != "":
		return { "error": g }
	if not ChartRigging.rigging_solved(int(layout["cols"]), int(layout["rows"]), layout["pairs"], pd):
		if a["status"] != "cleared":
			_save_rig(db, wk, pd)
		return { "solved": false, "pointsWon": 0.0, "newPuzzlePoints": null }
	if float(a["points_awarded"]) > 0.0 or a["status"] == "cleared":
		return { "solved": true, "pointsWon": 0.0, "newPuzzlePoints": null }
	_save_rig(db, wk, pd)
	var cur: Variant = _ch(db)["rigging"].get(wk)
	if cur == null or cur["status"] != "active" or float(cur["points_awarded"]) != 0.0:
		return { "solved": true, "pointsWon": 0.0, "newPuzzlePoints": null }
	var pts: float = float(c()["rigging"]["points"])
	_ch(db)["rigging"][wk] = { "paths": pd.duplicate(true), "status": "cleared", "points_awarded": pts }
	db.update_profile(uid, { "puzzle_points": old_points + pts })
	return { "solved": true, "pointsWon": pts, "newPuzzlePoints": old_points + pts }


# ══ The World Chart ═══════════════════════════════════════════════════════════

static func landmarks() -> Array:
	return c()["landmarks"]


static func world_state(db: CaptainStore, uid: String) -> Dictionary:
	var p: Dictionary = db.profile(uid, "puzzle_points, charting_landmarks_claimed")
	return { "points": Js.nz(p.get("puzzle_points"), 0.0), "claimed": Js.list(Js.nz(p.get("charting_landmarks_claimed"), [])) }


## What a landmark pays in the port: a skin voucher kind (the last of all
## pays the completion's too). "" under the web's tables (gems).
static func voucher_for(id: int) -> String:
	return str(Js.obj(port().get("landmarkVouchers")).get(str(id), ""))


static func claim_landmark(db: CaptainStore, uid: String, id: Variant) -> Dictionary:
	var lm: Dictionary = {}
	for l: Dictionary in landmarks():
		if (id is float or id is int) and int(l["id"]) == int(id) and float(id) == float(int(id)):
			lm = l
	if lm.is_empty():
		return { "error": "Unknown landmark" }
	var prof: Dictionary = db.me(uid)
	var points: float = Js.nz(prof.get("puzzle_points"), 0.0)
	var claimed: Array = Js.list(Js.nz(prof.get("charting_landmarks_claimed"), []))
	if points < float(lm["threshold"]):
		return { "error": "Not yet discovered" }
	if claimed.any(func(x: Variant) -> bool: return int(x) == int(lm["id"])):
		return { "error": "Already claimed" }
	var nc: Array = claimed.duplicate()
	nc.append(lm["id"])
	var completed: bool = nc.size() == landmarks().size()
	prof["charting_landmarks_claimed"] = nc
	var out: Dictionary = { "ok": true, "completed": completed, "claimed": nc }
	if port().is_empty():
		var bonus: float = float(c()["completionBonus"]) if completed else 0.0
		var awarded: float = float(lm["gems"]) + bonus
		out["gems"] = db.grant(uid, "gems", awarded)
		db.ledger(uid, float(lm["gems"]), "World Chart: %s" % lm["name"], "gems")
		if completed:
			db.ledger(uid, bonus, "World Chart: fully charted", "gems")
		out["awarded"] = awarded
		out["bonus"] = bonus
	else:
		# The port: a skin voucher (and one more for charting it all).
		var kinds: Array = []
		var k: String = voucher_for(int(lm["id"]))
		if k != "":
			kinds.append(k)
		if completed and str(port().get("completionVoucher", "")) != "":
			kinds.append(str(port()["completionVoucher"]))
		for kk: String in kinds:
			Skins.grant(db, uid, kk)
		out["vouchers"] = kinds
	db.grant_badge(uid, "landfall")
	if nc.size() >= 7:
		db.grant_badge(uid, "uncharted_no_more")
	if completed:
		db.grant_badge(uid, "master_cartographer")
	return out


static func mark_guide_seen(db: CaptainStore, uid: String) -> Dictionary:
	db.update_profile(uid, { "has_seen_charting_guide": true })
	return { "ok": true }
