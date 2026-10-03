extends PuzzleBoard
## THE CARGO SHUFFLE (port of expeditions/CargoShufflePuzzle; Sokoban). Push
## the powder crates onto their deck marks. Crates only push, never pull, and
## one at a time. The rooms play in order; solving the last solves the node.
## Every step costs a move (pushes included); busting a room's move budget
## resets the room. Undo takes back one move and its cost.
##
## Grid notation per row: '#' wall, ' ' floor, '@' sailor, '$' crate, '.'
## mark, '*' crate on a mark, '+' sailor on a mark. A cell is r * 100 + c.

const RED: Color = Color(0.94, 0.54, 0.54)

var _rooms: Array = []
var _room_i: int = 0
var _room: Dictionary = {}
var _p: Dictionary = {}
var _cell: float = 70.0
var _player: int = 0
var _crates: Array = []
var _moves: int = 0
var _history: Array = []
var _stuck: bool = false
## Busy between a bust and its reset, and between rooms.
var _busy: bool = false
var _solved_room: bool = false
## Where each piece is drawn (eases toward where it is).
var _pd: Vector2 = Vector2.ZERO
var _cd: Array = []
var _bump: Vector2 = Vector2.ZERO
var _bump_at: float = -10.0
var _seat_at: Dictionary = {}
var _press: Vector2 = Vector2(-1, -1)
## Set the pieces straight down (no slide) on the next frame.
var _snap: bool = true
var _undo_b: Pane.PaneButton


# ── The rules ─────────────────────────────────────────────────────────────────

static func key(r: int, c: int) -> int:
	return r * 100 + c


static func parse(grid: Array) -> Dictionary:
	var walls: Dictionary = {}
	var plates: Dictionary = {}
	var crates: Array = []
	var player: int = 0
	var cols: int = 0
	for r: int in grid.size():
		var row: String = str(grid[r])
		cols = maxi(cols, row.length())
		for c: int in row.length():
			var ch: String = row[c]
			if ch == "#":
				walls[key(r, c)] = true
			if ch == "@" or ch == "+":
				player = key(r, c)
			if ch == "$" or ch == "*":
				crates.append(key(r, c))
			if ch == "." or ch == "*" or ch == "+":
				plates[key(r, c)] = true
	return { "walls": walls, "plates": plates, "crates": crates, "player": player, "rows": grid.size(), "cols": cols }


## One step of the sailor (dr, dc). A wall stops it; a crate ahead is pushed
## one cell if the cell past it is free (no wall, no other crate); never two.
## Returns {ok, pushed, player, crates}.
static func step(walls: Dictionary, player: int, crates: Array, dr: int, dc: int) -> Dictionary:
	var nk: int = player + dr * 100 + dc
	if walls.has(nk):
		return { "ok": false, "pushed": false, "player": player, "crates": crates }
	var next: Array = crates
	var pushed: bool = false
	var at: int = crates.find(nk)
	if at >= 0:
		var bk: int = nk + dr * 100 + dc
		if walls.has(bk) or crates.has(bk):
			return { "ok": false, "pushed": false, "player": player, "crates": crates }
		next = crates.duplicate()
		next[at] = bk
		pushed = true
	return { "ok": true, "pushed": pushed, "player": nk, "crates": next }


static func solved(crates: Array, plates: Dictionary) -> bool:
	for k: int in crates:
		if not plates.has(k):
			return false
	return true


## A crate off its mark with a wall on a vertical side and a horizontal side
## can never be pushed again.
static func deadlocked(k: int, walls: Dictionary, plates: Dictionary) -> bool:
	if plates.has(k):
		return false
	return (walls.has(k - 100) or walls.has(k + 100)) and (walls.has(k - 1) or walls.has(k + 1))


# ── The board ─────────────────────────────────────────────────────────────────

func board_name() -> String:
	return "The Cargo Shuffle"


func how_to() -> String:
	return "Move with the arrow keys or WASD, or drag across the hold. Shove every crate onto a marked square. Crates only push, never pull, and only one at a time. Run out of moves and the hold resets."


func board_size() -> Vector2:
	return Vector2(620, 620)


func build() -> void:
	_rooms = (puzzle.get("cargo", {}) as Dictionary).get("rooms", [])
	_load_room(0)


func _load_room(i: int) -> void:
	_room_i = i
	_room = _rooms[mini(i, _rooms.size() - 1)]
	_p = parse(_room["grid"])
	_cell = floor(minf(minf(620.0 / float(_p["cols"]), 620.0 / float(_p["rows"])), 74.0))
	_solved_room = false
	_start()


func _start() -> void:
	_player = int(_p["player"])
	_crates = (_p["crates"] as Array).duplicate()
	_moves = 0
	_history.clear()
	_stuck = false
	_snap = true


func _budget() -> int:
	return int(Js.num(_room["moveBudget"]))


func extra(box: VBoxContainer) -> void:
	_undo_b = Paper.button("Undo  Z")
	_undo_b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_undo_b.pressed.connect(_undo)
	box.add_child(_undo_b)


func words() -> void:
	var left: int = _budget() - _moves
	count_l.text = "Hold %d of %d  ·  %d move%s left" % [_room_i + 1, _rooms.size(), left, "" if left == 1 else "s"]
	count_l.add_theme_color_override("font_color", RED if left <= int(ceil(_budget() * 0.2)) and not won else Paper.NIGHT_INK)
	if won:
		note_l.text = "The hold sits trim."
		note_l.add_theme_color_override("font_color", Paper.BRASS)
	elif _stuck:
		note_l.text = "A crate is jammed in a corner. Undo or Reset to free it."
		note_l.add_theme_color_override("font_color", RED)
	else:
		note_l.text = "%d of %d crates on their marks." % [_seated(), _crates.size()]
		note_l.add_theme_color_override("font_color", Paper.NIGHT_INK_SOFT)
	if _undo_b != null:
		_undo_b.disabled = _history.is_empty() or won


func _seated() -> int:
	var n: int = 0
	for k: int in _crates:
		if (_p["plates"] as Dictionary).has(k):
			n += 1
	return n


func on_reset() -> void:
	if _busy or _solved_room:
		return
	_start()


func _undo() -> void:
	if _busy or _solved_room or won or _history.is_empty():
		return
	Rumble.tap(6)
	var last: Dictionary = _history.pop_back()
	_player = int(last["player"])
	_crates = last["crates"]
	_moves -= 1
	_stuck = false
	for k: int in _crates:
		if deadlocked(k, _p["walls"], _p["plates"]):
			_stuck = true
	words()


func on_key(e: InputEvent) -> bool:
	if not (e is InputEventKey) and not (e is InputEventJoypadButton) and not (e is InputEventJoypadMotion):
		return false
	if e.is_action_pressed("sail_up", true):
		_step(-1, 0)
	elif e.is_action_pressed("sail_down", true):
		_step(1, 0)
	elif e.is_action_pressed("sail_left", true):
		_step(0, -1)
	elif e.is_action_pressed("sail_right", true):
		_step(0, 1)
	elif e is InputEventKey and (e as InputEventKey).pressed and ((e as InputEventKey).keycode == KEY_Z or (e as InputEventKey).keycode == KEY_BACKSPACE):
		_undo()
	elif e is InputEventKey and (e as InputEventKey).pressed and (e as InputEventKey).keycode == KEY_R:
		on_reset()
		words()
	else:
		return false
	return true


func _step(dr: int, dc: int) -> void:
	if _busy or _solved_room or won:
		return
	var walls: Dictionary = _p["walls"]
	var plates: Dictionary = _p["plates"]
	var r: Dictionary = step(walls, _player, _crates, dr, dc)
	if not r["ok"]:
		Rumble.tap(8)
		_bump = Vector2(dc, dr)
		_bump_at = t
		return
	_history.append({ "player": _player, "crates": _crates })
	var was: Array = _crates
	_player = int(r["player"])
	_crates = r["crates"]
	_moves += 1
	if r["pushed"]:
		for i: int in _crates.size():
			if _crates[i] != was[i]:
				var k: int = int(_crates[i])
				if deadlocked(k, walls, plates):
					Rumble.buzz([0, 30, 40, 30])
					_stuck = true
				else:
					Rumble.tap(12)
				if plates.has(k):
					_seat_at[i] = t
					Sound.job_tick(_seated() * 3)
				else:
					Sound.plip()
	else:
		Rumble.tap(4)
	if solved(_crates, plates):
		_solved_room = true
		words()
		get_tree().create_timer(0.35).timeout.connect(_room_done)
		return
	if _moves >= _budget():
		# Budget spent without a solve: the hold resets.
		_busy = true
		shake()
		get_tree().create_timer(0.42).timeout.connect(_after_bust)
	words()


func _after_bust() -> void:
	_busy = false
	_start()
	words()


func _room_done() -> void:
	if _room_i >= _rooms.size() - 1:
		win()
		return
	_busy = true
	Sound.seal(true)
	Rumble.buzz([0, 20, 30, 20])
	flash("Hold secured", 0.9)
	get_tree().create_timer(0.9).timeout.connect(_next_room)


func _next_room() -> void:
	_busy = false
	_load_room(_room_i + 1)
	words()


func _at(k: int) -> Vector2:
	return _origin() + Vector2(k % 100, k / 100) * _cell


func _origin() -> Vector2:
	return (canvas.size - Vector2(float(_p["cols"]), float(_p["rows"])) * _cell) / 2.0 if canvas != null else Vector2.ZERO


func board_input(e: InputEvent) -> void:
	if not (e is InputEventMouseButton):
		return
	var mb: InputEventMouseButton = e
	if mb.button_index != MOUSE_BUTTON_LEFT:
		return
	if mb.pressed:
		_press = mb.position
		return
	if _press.x < 0:
		return
	var d: Vector2 = mb.position - _press
	var from: Vector2 = _press
	_press = Vector2(-1, -1)
	if d.length() >= 18.0:
		# A drag: one step along its longer axis.
		if absf(d.x) > absf(d.y):
			_step(0, 1 if d.x > 0 else -1)
		else:
			_step(1 if d.y > 0 else -1, 0)
		return
	# A press beside the sailor: a step that way.
	var o: Vector2 = from - _origin()
	var c: int = int(floor(o.x / _cell))
	var r: int = int(floor(o.y / _cell))
	var pr: int = _player / 100
	var pc: int = _player % 100
	if absi(r - pr) + absi(c - pc) == 1:
		_step(r - pr, c - pc)


func tick(delta: float) -> void:
	if (_snap or _cd.size() != _crates.size()) and canvas.size.x > 0.0:
		_snap = false
		_pd = _at(_player)
		_cd.clear()
		for ck: int in _crates:
			_cd.append(_at(ck))
	if _cd.size() != _crates.size():
		return
	var k: float = 1.0 - exp(-delta * 20.0)
	_pd = _pd.lerp(_at(_player), k)
	for i: int in _crates.size():
		_cd[i] = (_cd[i] as Vector2).lerp(_at(int(_crates[i])), 1.0 - exp(-delta * 18.0))


func draw_board() -> void:
	var o: Vector2 = _origin()
	var cols: int = int(_p["cols"])
	var rows: int = int(_p["rows"])
	var cs: Vector2 = Vector2(_cell, _cell)
	var walls: Dictionary = _p["walls"]
	var plates: Dictionary = _p["plates"]
	var grid: Array = _room["grid"]
	box(Rect2(o - Vector2(6, 6), cs * Vector2(cols, rows) + Vector2(12, 12)), Color(0.08, 0.05, 0.02), 10.0, Color(0.77, 0.66, 0.42, 0.4), 1.0)
	for r: int in rows:
		var row: String = str(grid[r])
		for c: int in row.length():
			var k: int = key(r, c)
			var p: Vector2 = o + Vector2(c, r) * _cell
			if walls.has(k):
				# Near-black raised timber, so the room's shape reads at once.
				canvas.draw_rect(Rect2(p, cs), Color(0.1, 0.065, 0.03))
				canvas.draw_line(p + Vector2(1, 1.5), p + Vector2(_cell - 1, 1.5), Color(1, 1, 1, 0.05), 2.0)
				canvas.draw_line(p + Vector2(1, _cell - 1.5), p + Vector2(_cell - 1, _cell - 1.5), Color(0, 0, 0, 0.6), 2.0)
				continue
			# Warm deck planks, checkered so distances read.
			var light: bool = (r + c) % 2 == 0
			canvas.draw_rect(Rect2(p, cs), Color(0.41, 0.3, 0.18) if light else Color(0.36, 0.26, 0.15))
			canvas.draw_line(p + Vector2(0, _cell * 0.5), p + Vector2(_cell, _cell * 0.5), Color(0, 0, 0, 0.12), 1.0)
			canvas.draw_rect(Rect2(p, cs), Color(0, 0, 0, 0.22), false, 1.0)
			if plates.has(k):
				var c0: Vector2 = p + cs / 2.0
				var pulse: float = 0.6 + 0.4 * sin(t * 2.4 + c + r)
				box(Rect2(c0 - cs * 0.31, cs * 0.62), Color(0.94, 0.75, 0.25, 0.1), 4.0, Color(0.94, 0.75, 0.25, 0.65 + 0.25 * pulse), 2.0)
				var dm: PackedVector2Array = PackedVector2Array([c0 + Vector2(0, -7), c0 + Vector2(7, 0), c0 + Vector2(0, 7), c0 + Vector2(-7, 0)])
				canvas.draw_colored_polygon(dm, Color(0.94, 0.75, 0.25, 0.75))
	# The crates: a wooden box, a frame, two plank lines; gold when seated.
	for i: int in _crates.size():
		var at: Vector2 = _cd[i] if i < _cd.size() else _at(int(_crates[i]))
		var seated: bool = plates.has(int(_crates[i]))
		var pop: float = 0.0
		if _seat_at.has(i):
			pop = sin(clampf((t - float(_seat_at[i])) / 0.3, 0.0, 1.0) * PI) * 0.08
		var inset: float = _cell * (0.08 - pop)
		var rect: Rect2 = Rect2(at + Vector2(inset, inset), cs - Vector2(inset, inset) * 2.0)
		if seated:
			glow(rect.get_center(), _cell * 0.7, GOLD, 0.45)
		canvas.draw_rect(Rect2(rect.position + Vector2(0, 4), rect.size), Color(0, 0, 0, 0.35))
		box(rect, Color(0.88, 0.72, 0.38) if seated else Color(0.6, 0.44, 0.24), 3.0, Color(0.54, 0.41, 0.13) if seated else Color(0.24, 0.16, 0.07), 2.0)
		var slat: Color = Color(0.47, 0.34, 0.04, 0.45) if seated else Color(0, 0, 0, 0.28)
		for f: float in [0.33, 0.66]:
			canvas.draw_line(rect.position + Vector2(3, rect.size.y * f), rect.position + Vector2(rect.size.x - 3, rect.size.y * f), slat, 1.5)
		canvas.draw_line(rect.position + Vector2(3, 3), rect.end - Vector2(3, 3), Color(slat, slat.a * 0.6), 1.5)
	# The sailor: a brass-ringed token with a ship's wheel on it.
	var bk: float = clampf((t - _bump_at) / 0.16, 0.0, 1.0)
	var jab: Vector2 = _bump * sin(bk * PI) * 6.0 if bk < 1.0 else Vector2.ZERO
	var pc: Vector2 = _pd + cs / 2.0 + jab
	var pr: float = _cell * 0.37
	canvas.draw_circle(pc + Vector2(0, 3), pr, Color(0, 0, 0, 0.5))
	glow(pc, pr * 1.5, Color(0.77, 0.66, 0.42), 0.3)
	canvas.draw_circle(pc, pr, Color(0.14, 0.22, 0.33))
	canvas.draw_circle(pc + Vector2(-pr * 0.25, -pr * 0.3), pr * 0.55, Color(0.22, 0.33, 0.46, 0.6))
	canvas.draw_arc(pc, pr, 0, TAU, 40, Color(0.77, 0.66, 0.42), 2.5, true)
	var wc: Color = Color(0.94, 0.9, 0.78)
	for s: int in 4:
		var d: Vector2 = Vector2.from_angle(PI * s / 4.0) * pr * 0.66
		canvas.draw_line(pc - d, pc + d, wc, 1.8, true)
	canvas.draw_arc(pc, pr * 0.42, 0, TAU, 28, wc, 2.0, true)
	canvas.draw_circle(pc, pr * 0.15, wc)
