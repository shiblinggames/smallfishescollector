extends RefCounted
## Part of ChartRoom: the Minefield engine (a port of web/lib/charting/
## minefield.ts), pure: the neighbours, the flood fill and the week's mine
## layout. Takes no save. Split out of core/chart_room.gd on 2026-10-10 for
## size; ChartRoom's Minefield actions call it.


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


static func set_of(list: Array) -> Dictionary:
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
		var forbidden: Dictionary = set_of([seed] + neighbors8(seed, cols, rows))
		var cand: Array = []
		for i: int in total:
			if not forbidden.has(i):
				cand.append(i)
		for i: int in range(cand.size() - 1, 0, -1):
			var j: int = int(floor(Dice.next() * (i + 1)))
			var t: int = cand[i]
			cand[i] = cand[j]
			cand[j] = t
		var mines: Dictionary = set_of(cand.slice(0, count))
		var opening: Array = flood_reveal(mines, cols, rows, seed, {}, {})
		if opening.size() >= min_open:
			return { "mines": _sorted_ints(mines.keys()), "opening": _sorted_ints(opening) }
	var forb: Dictionary = set_of([0] + neighbors8(0, cols, rows))
	var cands: Array = []
	for i: int in total:
		if not forb.has(i):
			cands.append(i)
	var ms: Dictionary = set_of(cands.slice(0, count))
	return { "mines": _sorted_ints(ms.keys()), "opening": _sorted_ints(flood_reveal(ms, cols, rows, 0, {}, {})) }
