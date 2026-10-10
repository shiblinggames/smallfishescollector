extends RefCounted
## Part of ChartRoom: the Rigging engine (a port of web/lib/rigging/
## rigging.ts), pure: the snake-path generator and the path validator. Takes
## no save. Split out of core/chart_room.gd on 2026-10-10 for size; ChartRoom
## forwards neighbors4 for the Rigging screen.


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
