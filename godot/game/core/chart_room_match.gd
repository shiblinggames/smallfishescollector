extends RefCounted
## Part of ChartRoom: the Treasure Match engine (a port of web/lib/charting/
## treasureMatch.ts), pure: the seeded board, the colour runs, the cascades
## and the reshuffle. Takes no save. Split out of core/chart_room.gd on
## 2026-10-10 for size; ChartRoom forwards what the screens use.

const WILD: int = -2


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
	var log: Array = []
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
		log.append({ "cleared": cleared, "spawns": spawns, "gained": float(cleared.size() * 10 * cascade), "board": cur })
		steps += 1
		cascade += 1
	return { "steps": steps, "gained": total, "board": cur, "log": log }


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
	for t: Dictionary in ChartRoom.c()["matchTiers"]:
		if score >= float(t["score"]):
			p = int(t["points"])
	return p
