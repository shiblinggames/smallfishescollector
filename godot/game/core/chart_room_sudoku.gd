extends RefCounted
## Part of ChartRoom: the Hold's sudoku engine (a port of web/lib/hold/
## sudoku.ts), pure: the bitmask solver, the solution counter and the
## generator. Takes no save. Split out of core/chart_room.gd on 2026-10-10 for
## size; ChartRoom forwards _box for the Hold screen.


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
