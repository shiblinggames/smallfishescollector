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

const WILD: int = -2
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


# ══ The engines ═══════════════════════════════════════════════════════════════

# ── Treasure Match (charting/treasureMatch.ts) ──

static func _rand_type(rng: Dice.Mulberry32, n: int) -> int:
	return int(floor(rng.next() * n))


static func initial_board(rng: Dice.Mulberry32, cols: int, rows: int, n: int) -> Array:
	var b: Array = []
	b.resize(cols * rows)
	b.fill(-1)
	for r: int in rows:
		for col: int in cols:
			var t: int = _rand_type(rng, n)
			var guard: int = 0
			while guard < 50:
				guard += 1
				var two_left: bool = col >= 2 and b[r * cols + col - 1] == t and b[r * cols + col - 2] == t
				var two_up: bool = r >= 2 and b[(r - 1) * cols + col] == t and b[(r - 2) * cols + col] == t
				if not two_left and not two_up:
					break
				t = _rand_type(rng, n)
			b[r * cols + col] = t
	return b


static func adjacent4(a: int, b: int, cols: int) -> bool:
	var ra: int = a / cols
	var ca: int = a % cols
	var rb: int = b / cols
	var cb: int = b % cols
	return (ra == rb and absi(ca - cb) == 1) or (ca == cb and absi(ra - rb) == 1)


## findColorRuns: maximal runs of 3+ of one colour or Compasses, with a real
## gem of the colour in them; colours in the order first seen on the board.
static func color_runs(board: Array, cols: int, rows: int) -> Array:
	var runs: Array = []
	var colors: Array = []
	for v: int in board:
		if v >= 0 and not colors.has(v):
			colors.append(v)
	var scan: Callable = func(line: Array) -> void:
		for color: int in colors:
			var run: Array = []
			for k: int in line.size() + 1:
				var v: int = board[line[k]] if k < line.size() else -99
				if v == color or v == WILD:
					run.append(line[k])
				else:
					if run.size() >= 3 and run.any(func(i: int) -> bool: return board[i] == color):
						runs.append({ "cells": run.duplicate(), "color": color, "hasWild": run.any(func(i: int) -> bool: return board[i] == WILD) })
					run = []
	for r: int in rows:
		var line: Array = []
		for col: int in cols:
			line.append(r * cols + col)
		scan.call(line)
	for col: int in cols:
		var line2: Array = []
		for r: int in rows:
			line2.append(r * cols + col)
		scan.call(line2)
	return runs


static func find_matches(board: Array, cols: int, rows: int) -> Array:
	var hit: Array = []
	for run: Dictionary in color_runs(board, cols, rows):
		for i: int in run["cells"]:
			if not hit.has(i):
				hit.append(i)
	return hit


static func swapped(board: Array, a: int, b: int) -> Array:
	var nx: Array = board.duplicate()
	var t: int = nx[a]
	nx[a] = nx[b]
	nx[b] = t
	return nx


static func collapse_refill(board: Array, cleared: Array, cols: int, rows: int, rng: Dice.Mulberry32, n: int, wild_chance: float) -> Array:
	var nx: Array = []
	nx.resize(cols * rows)
	nx.fill(-1)
	for col: int in cols:
		var stack: Array = []
		for r: int in range(rows - 1, -1, -1):
			var i: int = r * cols + col
			if not cleared.has(i):
				stack.append(board[i])
		while stack.size() < rows:
			stack.append(WILD if rng.next() < wild_chance else _rand_type(rng, n))
		for k: int in rows:
			nx[(rows - 1 - k) * cols + col] = stack[k]
	return nx


static func _pick_spawn(run: Array, a: int, b: int) -> int:
	if run.has(a):
		return a
	if run.has(b):
		return b
	return run[run.size() / 2]


static func _cascades(start: Array, cols: int, rows: int, n: int, rng: Dice.Mulberry32, wild_chance: float, a: int, b: int) -> Dictionary:
	var steps: int = 0
	var total: float = 0.0
	var cur: Array = start
	var cascade: int = 1
	while true:
		var runs: Array = color_runs(cur, cols, rows)
		if runs.is_empty():
			break
		var wipe: Array = []
		for run: Dictionary in runs:
			if (run["cells"] as Array).size() >= 5 and not wipe.has(run["color"]):
				wipe.append(run["color"])
		var spawns: Array = []
		for run: Dictionary in runs:
			if (run["cells"] as Array).size() == 4 and not run["hasWild"] and not wipe.has(run["color"]):
				var s: int = _pick_spawn(run["cells"], a if cascade == 1 else -1, b if cascade == 1 else -1)
				if not spawns.has(s):
					spawns.append(s)
		var cleared_set: Dictionary = {}
		for run: Dictionary in runs:
			for i: int in run["cells"]:
				cleared_set[i] = true
		if not wipe.is_empty():
			for i: int in cur.size():
				if wipe.has(cur[i]):
					cleared_set[i] = true
		var cleared: Array = cleared_set.keys().filter(func(i: int) -> bool: return not spawns.has(i))
		total += float(cleared.size() * 10 * cascade)
		var with_wilds: Array = cur.duplicate()
		for s: int in spawns:
			with_wilds[s] = WILD
		cur = collapse_refill(with_wilds, cleared, cols, rows, rng, n, wild_chance)
		steps += 1
		cascade += 1
	return { "steps": steps, "gained": total, "board": cur }


## resolveSwap: null for a swap that makes no match.
static func resolve_swap(board: Array, a: int, b: int, cols: int, rows: int, n: int, rng: Dice.Mulberry32, wild_chance: float) -> Variant:
	if not adjacent4(a, b, cols):
		return null
	var r: Dictionary = _cascades(swapped(board, a, b), cols, rows, n, rng, wild_chance, a, b)
	if int(r["steps"]) == 0:
		return null
	return r


static func has_valid_move(board: Array, cols: int, rows: int) -> bool:
	for i: int in board.size():
		var r: int = i / cols
		var col: int = i % cols
		if col < cols - 1 and not find_matches(swapped(board, i, i + 1), cols, rows).is_empty():
			return true
		if r < rows - 1 and not find_matches(swapped(board, i, i + cols), cols, rows).is_empty():
			return true
	return false


static func reshuffle(rng: Dice.Mulberry32, cols: int, rows: int, n: int) -> Array:
	for k: int in 60:
		var b: Array = initial_board(rng, cols, rows, n)
		if has_valid_move(b, cols, rows):
			return b
	return initial_board(rng, cols, rows, n)


static func points_for_score(score: float) -> int:
	var p: int = 0
	for t: Dictionary in c()["matchTiers"]:
		if score >= float(t["score"]):
			p = int(t["points"])
	return p


# ── The Minefield (charting/minefield.ts) ──

static func neighbors8(i: int, cols: int, rows: int) -> Array:
	var r: int = i / cols
	var col: int = i % cols
	var out: Array = []
	for dr: int in range(-1, 2):
		for dc: int in range(-1, 2):
			if dr == 0 and dc == 0:
				continue
			var nr: int = r + dr
			var nc: int = col + dc
			if nr < 0 or nr >= rows or nc < 0 or nc >= cols:
				continue
			out.append(nr * cols + nc)
	return out


static func adjacent_mines(mines: Dictionary, i: int, cols: int, rows: int) -> int:
	var n: int = 0
	for j: int in neighbors8(i, cols, rows):
		if mines.has(j):
			n += 1
	return n


static func flood_reveal(mines: Dictionary, cols: int, rows: int, start: int, already: Dictionary, blocked: Dictionary) -> Array:
	if mines.has(start) or already.has(start) or blocked.has(start):
		return []
	var revealed: Array = []
	var seen: Dictionary = {}
	var stack: Array = [start]
	while not stack.is_empty():
		var cell: int = stack.pop_back()
		if seen.has(cell) or already.has(cell) or blocked.has(cell) or mines.has(cell):
			continue
		seen[cell] = true
		revealed.append(cell)
		if adjacent_mines(mines, cell, cols, rows) == 0:
			for nb: int in neighbors8(cell, cols, rows):
				if not seen.has(nb) and not already.has(nb) and not blocked.has(nb) and not mines.has(nb):
					stack.append(nb)
	return revealed


static func _set_of(list: Array) -> Dictionary:
	var d: Dictionary = {}
	for v: Variant in list:
		d[int(v)] = true
	return d


static func _sorted_ints(list: Array) -> Array:
	var out: Array = list.map(func(v: Variant) -> float: return float(v))
	out.sort()
	return out


static func generate_minefield(cols: int, rows: int, count: int) -> Dictionary:
	var total: int = cols * rows
	var min_open: int = maxi(6, int(floor(total * 0.06)))
	for attempt: int in 200:
		var seed: int = int(floor(Dice.next() * total))
		var forbidden: Dictionary = _set_of([seed] + neighbors8(seed, cols, rows))
		var cand: Array = []
		for i: int in total:
			if not forbidden.has(i):
				cand.append(i)
		for i: int in range(cand.size() - 1, 0, -1):
			var j: int = int(floor(Dice.next() * (i + 1)))
			var t: int = cand[i]
			cand[i] = cand[j]
			cand[j] = t
		var mines: Dictionary = _set_of(cand.slice(0, count))
		var opening: Array = flood_reveal(mines, cols, rows, seed, {}, {})
		if opening.size() >= min_open:
			return { "mines": _sorted_ints(mines.keys()), "opening": _sorted_ints(opening) }
	var forb: Dictionary = _set_of([0] + neighbors8(0, cols, rows))
	var cands: Array = []
	for i: int in total:
		if not forb.has(i):
			cands.append(i)
	var ms: Dictionary = _set_of(cands.slice(0, count))
	return { "mines": _sorted_ints(ms.keys()), "opening": _sorted_ints(flood_reveal(ms, cols, rows, 0, {}, {})) }


# ── The Hold's sudoku (hold/sudoku.ts) ──

static func _box(idx: int) -> int:
	return (idx / 9 / 3) * 3 + (idx % 9) / 3


static func _shuffled(arr: Array) -> Array:
	var a: Array = arr.duplicate()
	for i: int in range(a.size() - 1, 0, -1):
		var j: int = int(floor(Dice.next() * (i + 1)))
		var t: Variant = a[i]
		a[i] = a[j]
		a[j] = t
	return a


static func _masks(board: Array) -> Array:
	var rws: Array = [0, 0, 0, 0, 0, 0, 0, 0, 0]
	var cls: Array = [0, 0, 0, 0, 0, 0, 0, 0, 0]
	var bxs: Array = [0, 0, 0, 0, 0, 0, 0, 0, 0]
	for i: int in board.size():
		var v: int = board[i]
		if v == 0:
			continue
		var bit: int = 1 << v
		rws[i / 9] |= bit
		cls[i % 9] |= bit
		bxs[_box(i)] |= bit
	return [rws, cls, bxs]


static func _cand_bits(m: Array, idx: int) -> int:
	var used: int = int(m[0][idx / 9]) | int(m[1][idx % 9]) | int(m[2][_box(idx)])
	return ~used & 0b1111111110


static func _digits(bits: int) -> Array:
	var out: Array = []
	for v: int in range(1, 10):
		if bits & (1 << v):
			out.append(v)
	return out


static func _set_cell(board: Array, m: Array, idx: int, v: int) -> void:
	board[idx] = v
	var bit: int = 1 << v
	m[0][idx / 9] |= bit
	m[1][idx % 9] |= bit
	m[2][_box(idx)] |= bit


static func _clear_cell(board: Array, m: Array, idx: int, v: int) -> void:
	board[idx] = 0
	var bit: int = ~(1 << v)
	m[0][idx / 9] &= bit
	m[1][idx % 9] &= bit
	m[2][_box(idx)] &= bit


## MRV: [idx, bits], or -1 full, or -2 a dead end.
static func _pick(board: Array, m: Array) -> Variant:
	var best: int = -1
	var best_bits: int = 0
	var best_count: int = 10
	for i: int in board.size():
		if board[i] != 0:
			continue
		var bits: int = _cand_bits(m, i)
		var count: int = _digits(bits).size()
		if count == 0:
			return -2
		if count < best_count:
			best_count = count
			best = i
			best_bits = bits
			if count == 1:
				break
	if best == -1:
		return -1
	return [best, best_bits]


static func _fill(board: Array, m: Array) -> bool:
	var p: Variant = _pick(board, m)
	if p is int:
		return p == -1
	for v: int in _shuffled(_digits(p[1])):
		_set_cell(board, m, p[0], v)
		if _fill(board, m):
			return true
		_clear_cell(board, m, p[0], v)
	return false


static func count_solutions(source: Array, limit: int = 2) -> int:
	var board: Array = source.duplicate()
	var m: Array = _masks(board)
	var found: Array = [0]
	var rec: Array = []
	rec.append(func() -> void:
		if found[0] >= limit:
			return
		var p: Variant = _pick(board, m)
		if p is int:
			if p == -1:
				found[0] += 1
			return
		for v: int in _digits(p[1]):
			_set_cell(board, m, p[0], v)
			rec[0].call()
			_clear_cell(board, m, p[0], v)
			if found[0] >= limit:
				return)
	rec[0].call()
	return found[0]


static func _str(board: Array) -> String:
	var s: String = ""
	for v: int in board:
		s += str(v) if v != 0 else "."
	return s


static func generate_sudoku(target_givens: int) -> Dictionary:
	var full: Array = []
	full.resize(81)
	full.fill(0)
	_fill(full, _masks(full))
	var puzzle: Array = full.duplicate()
	var givens: int = 81
	var order: Array = []
	for i: int in 81:
		order.append(i)
	for idx: int in _shuffled(order):
		if givens <= target_givens:
			break
		if puzzle[idx] == 0:
			continue
		var backup: int = puzzle[idx]
		puzzle[idx] = 0
		if count_solutions(puzzle, 2) != 1:
			puzzle[idx] = backup
		else:
			givens -= 1
	return { "givens": _str(puzzle), "solution": _str(full) }


# ── The Rigging (rigging/rigging.ts) ──

static func neighbors4(i: int, cols: int, rows: int) -> Array:
	var r: int = i / cols
	var col: int = i % cols
	var out: Array = []
	if r > 0:
		out.append(i - cols)
	if r < rows - 1:
		out.append(i + cols)
	if col > 0:
		out.append(i - 1)
	if col < cols - 1:
		out.append(i + 1)
	return out


static func generate_rigging(cols: int, rows: int, colors: int) -> Dictionary:
	var path: Array = []
	for r: int in rows:
		if r % 2 == 0:
			for col: int in cols:
				path.append(r * cols + col)
		else:
			for col: int in range(cols - 1, -1, -1):
				path.append(r * cols + col)
	var n: int = path.size()
	var pos: Dictionary = {}
	for k: int in n:
		pos[path[k]] = k
	for it: int in cols * rows * 12:
		var at_tail: bool = int(floor(Dice.next() * 2)) == 0
		var end_cell: int = path[n - 1] if at_tail else path[0]
		var nb: Array = neighbors4(end_cell, cols, rows)
		var v: int = nb[int(floor(Dice.next() * nb.size()))]
		var j: int = pos[v]
		var lo: int
		var hi: int
		if at_tail:
			if j >= n - 2:
				continue
			lo = j + 1
			hi = n - 1
		else:
			if j <= 1:
				continue
			lo = 0
			hi = j - 1
		while lo < hi:
			var t: int = path[lo]
			path[lo] = path[hi]
			path[hi] = t
			pos[path[lo]] = lo
			pos[path[hi]] = hi
			lo += 1
			hi -= 1
		if lo == hi:
			pos[path[lo]] = lo
	var lengths: Array = []
	lengths.resize(colors)
	lengths.fill(2)
	var remaining: int = n - 2 * colors
	while remaining > 0:
		lengths[int(floor(Dice.next() * colors))] += 1
		remaining -= 1
	var pairs: Array = []
	var cursor: int = 0
	for color: int in colors:
		var seg: Array = path.slice(cursor, cursor + lengths[color])
		cursor += lengths[color]
		pairs.append({ "color": float(color), "a": float(seg[0]), "b": float(seg[seg.size() - 1]) })
	return { "cols": float(cols), "rows": float(rows), "pairs": pairs }


static func path_valid(cells: Variant, pair: Dictionary, cols: int, rows: int) -> bool:
	if not (cells is Array) or (cells as Array).size() < 2:
		return false
	var p: Array = cells
	var a: int = int(pair["a"])
	var b: int = int(pair["b"])
	var first: int = int(Js.num(p[0]))
	var last: int = int(Js.num(p[p.size() - 1]))
	if not (first == a or first == b) or not (last == a or last == b) or first == last:
		return false
	var seen: Dictionary = {}
	for k: int in p.size():
		if not (p[k] is float or p[k] is int):
			return false
		var cell: int = int(p[k])
		if float(p[k]) != float(cell) or cell < 0 or cell >= cols * rows or seen.has(cell):
			return false
		seen[cell] = true
		if k > 0 and not neighbors4(int(p[k - 1]), cols, rows).has(cell):
			return false
	return true


static func rigging_solved(cols: int, rows: int, pairs: Array, paths: Dictionary) -> bool:
	var covered: Dictionary = {}
	for pair: Dictionary in pairs:
		var p: Variant = paths.get(Js.key(pair["color"]))
		if p == null or not path_valid(p, pair, cols, rows):
			return false
		for cell: Variant in p:
			if covered.has(int(cell)):
				return false
			covered[int(cell)] = true
	return covered.size() == cols * rows


# ══ The week's boards ═════════════════════════════════════════════════════════

static func _match_board(db: CaptainStore) -> Dictionary:
	var m: Dictionary = c()["match"]
	return _board(db, "match", week(), func() -> Variant:
		return { "seed": float(int(floor(Dice.next() * 0x7fffffff))), "cols": m["cols"], "rows": m["rows"], "types": m["types"], "target": m["target"], "moves": m["moves"] })


static func _minefield_board(db: CaptainStore) -> Dictionary:
	var m: Dictionary = c()["minefield"]
	return _board(db, "minefield", week(), func() -> Variant:
		var g: Dictionary = generate_minefield(int(m["cols"]), int(m["rows"]), int(m["mines"]))
		return { "cols": m["cols"], "rows": m["rows"], "mineCount": m["mines"], "mines": g["mines"], "opening": g["opening"] })


static func _sudoku_board(db: CaptainStore) -> Dictionary:
	return _board(db, "sudoku", week(), func() -> Variant:
		var out: Dictionary = {}
		for d: String in HOLD_DIFFS:
			out[d] = generate_sudoku(int(c()["hold"][d]["givens"]))
		return out, func(b: Variant) -> bool:
			return HOLD_DIFFS.all(func(d: String) -> bool: return Js.obj(b).has(d) and Js.obj(Js.obj(b)[d]).get("givens") is String))


static func _rigging_board(db: CaptainStore) -> Dictionary:
	var m: Dictionary = c()["rigging"]
	return _board(db, "rigging", week(), func() -> Variant:
		return generate_rigging(int(m["cols"]), int(m["rows"]), int(m["colors"])))


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
	var tier: int = points_for_score(best)
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
	_after_points(db, uid)
	return { "bestScore": best, "tier": float(tier), "pointsWon": float(delta), "maxed": maxed, "newPuzzlePoints": np }


# ══ The Minefield ═════════════════════════════════════════════════════════════

static func _tiles(indices: Array, layout: Dictionary) -> Array:
	var mines: Dictionary = _set_of(layout["mines"])
	return indices.map(func(i: Variant) -> Dictionary: return { "i": float(i), "adj": float(adjacent_mines(mines, int(i), int(layout["cols"]), int(layout["rows"]))) })


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
	var rset: Dictionary = _set_of(a["revealed"])
	var fset: Dictionary = _set_of(a["flagged"])
	if rset.has(i) or fset.has(i):
		return { "busted": false, "cleared": false, "revealed": _tiles(a["revealed"], layout), "status": "active", "busts": a["busts"], "pointsWon": 0.0, "newPuzzlePoints": null }
	var mines: Dictionary = _set_of(layout["mines"])
	if mines.has(i):
		a["revealed"] = (layout["opening"] as Array).duplicate()
		a["busts"] = float(a["busts"]) + 1.0
		_save_mf(db, wk, a)
		return { "busted": true, "cleared": false, "revealed": _tiles(a["revealed"], layout), "status": "active", "busts": a["busts"], "pointsWon": 0.0, "newPuzzlePoints": null }
	var fresh: Array = flood_reveal(mines, int(layout["cols"]), int(layout["rows"]), i, rset, fset)
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
			_after_points(db, uid)
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
	_after_points(db, uid)
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
	if not rigging_solved(int(layout["cols"]), int(layout["rows"]), layout["pairs"], pd):
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
	_after_points(db, uid)
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


## Points just banked (port only): nothing to do yet but keep the hook (the
## Den's purse once read them on the web).
static func _after_points(_db: CaptainStore, _uid: String) -> void:
	pass


static func mark_guide_seen(db: CaptainStore, uid: String) -> Dictionary:
	db.update_profile(uid, { "has_seen_charting_guide": true })
	return { "ok": true }
