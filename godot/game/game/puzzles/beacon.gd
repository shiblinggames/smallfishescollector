extends PuzzleBoard
## THE BEACON CHAIN (port of expeditions/BeaconChainPuzzle; Lights Out). The
## smuggler's lane is marked by signal beacons wired as a tamper failsafe:
## pressing one flips it and the beacons above, below and beside it. Light the
## whole chain at once. The board is scrambled from the all-lit chain by
## random presses, so it is always solvable.

const CELL: float = 124.0
const GAP: float = 12.0

var _cols: int = 4
var _rows: int = 4
var _start: Array = []
var _lit: Array = []
## The light shown in each beacon (eases toward lit or dark).
var _glow: Array = []
var _flip_at: Array = []
var _hover: int = -1
var _taps: int = 0
var _last: int = 0


# ── The rules ─────────────────────────────────────────────────────────────────

## Press beacon i: it and its orthogonal neighbors flip.
static func tap(board: Array, cols: int, rows: int, i: int) -> Array:
	var c: int = i % cols
	var r: int = i / cols
	var next: Array = board.duplicate()
	for d: Vector2i in [Vector2i(0, 0), Vector2i(-1, 0), Vector2i(1, 0), Vector2i(0, -1), Vector2i(0, 1)]:
		var cc: int = c + d.x
		var rr: int = r + d.y
		if cc < 0 or cc >= cols or rr < 0 or rr >= rows:
			continue
		next[rr * cols + cc] = not next[rr * cols + cc]
	return next


static func dark_count(board: Array) -> int:
	var n: int = 0
	for v: bool in board:
		if not v:
			n += 1
	return n


static func solved(board: Array) -> bool:
	return dark_count(board) == 0


## Scramble from the all-lit chain with random presses; retry until it is
## meaningfully tangled (the web's guard: at least max(6, 35%) dark, else the
## darkest of 16 tries), and never hand back a chain already lit.
static func scramble(cols: int, rows: int, taps: int) -> Array:
	var n: int = cols * rows
	var min_dark: int = maxi(6, int(floor(n * 0.35)))
	var out: Array = []
	while out.is_empty():
		var lit: Array = []
		lit.resize(n)
		lit.fill(true)
		var best: Array = lit.duplicate()
		for attempt: int in 16:
			var s: Array = lit.duplicate()
			for k: int in taps:
				s = tap(s, cols, rows, randi() % n)
			var dark: int = dark_count(s)
			if dark >= min_dark:
				return s
			if dark > dark_count(best):
				best = s
		if dark_count(best) > 0:
			out = best
	return out


# ── The board ─────────────────────────────────────────────────────────────────

func board_name() -> String:
	return "The Beacon Chain"


func how_to() -> String:
	return "Press a beacon to light it or put it out. Each press also flips the beacons above, below, left and right of it. Light every beacon at once."


func board_size() -> Vector2:
	return Vector2(_cols * CELL + (_cols - 1) * GAP, _rows * CELL + (_rows - 1) * GAP)


func build() -> void:
	_cols = int(Js.num(puzzle.get("cols"))) if puzzle.get("cols") != null else 4
	_rows = int(Js.num(puzzle.get("rows"))) if puzzle.get("rows") != null else 4
	var taps: int = int(Js.num(puzzle.get("scrambleTaps"))) if puzzle.get("scrambleTaps") != null else 12
	_start = scramble(_cols, _rows, taps)
	_lit = _start.duplicate()
	for i: int in _lit.size():
		_glow.append(1.0 if _lit[i] else 0.0)
		_flip_at.append(-10.0)


func words() -> void:
	var lit: int = _lit.size() - dark_count(_lit)
	count_l.text = "%d of %d lit  ·  %d press%s" % [lit, _lit.size(), _taps, "" if _taps == 1 else "es"]
	if won:
		note_l.text = "The chain blazes as one."
		note_l.add_theme_color_override("font_color", Paper.BRASS)
	else:
		note_l.text = "Light every beacon at once."


func on_reset() -> void:
	_lit = _start.duplicate()
	_taps = 0
	for i: int in _lit.size():
		_flip_at[i] = t


func _cell_at(p: Vector2) -> int:
	var c: int = int(floor(p.x / (CELL + GAP)))
	var r: int = int(floor(p.y / (CELL + GAP)))
	if c < 0 or r < 0 or c >= _cols or r >= _rows:
		return -1
	if p.x - c * (CELL + GAP) > CELL or p.y - r * (CELL + GAP) > CELL:
		return -1
	return r * _cols + c


func board_input(e: InputEvent) -> void:
	if e is InputEventMouseMotion:
		_hover = _cell_at((e as InputEventMouseMotion).position)
	elif e is InputEventMouseButton:
		var mb: InputEventMouseButton = e
		if mb.button_index != MOUSE_BUTTON_LEFT or not mb.pressed or won:
			return
		var i: int = _cell_at(mb.position)
		if i < 0:
			return
		_press(i)


func _press(i: int) -> void:
	var was: Array = _lit
	_lit = tap(_lit, _cols, _rows, i)
	_taps += 1
	_last = i
	for k: int in _lit.size():
		if _lit[k] != was[k]:
			_flip_at[k] = t
	Rumble.tap(8)
	Sound.plip()
	if solved(_lit):
		win()
	words()


func _neighbors(i: int) -> Array:
	var out: Array = [i]
	var c: int = i % _cols
	var r: int = i / _cols
	if c > 0:
		out.append(i - 1)
	if c < _cols - 1:
		out.append(i + 1)
	if r > 0:
		out.append(i - _cols)
	if r < _rows - 1:
		out.append(i + _cols)
	return out


func tick(delta: float) -> void:
	var k: float = 1.0 - exp(-delta * 10.0)
	for i: int in _lit.size():
		_glow[i] = lerpf(float(_glow[i]), 1.0 if _lit[i] else 0.0, k)


func draw_board() -> void:
	var cross: Array = _neighbors(_hover) if _hover >= 0 and not won else []
	var lc: Vector2 = _centre(_last)
	for i: int in _lit.size():
		var c: Vector2 = _centre(i)
		var g: float = float(_glow[i])
		var rect: Rect2 = Rect2(c - Vector2(CELL, CELL) / 2.0, Vector2(CELL, CELL))
		# The solve: a wave of light out from the last beacon pressed.
		var wave: float = 0.0
		if won:
			var d: float = t - won_at - lc.distance_to(c) / 900.0
			wave = clampf(1.0 - absf(d - 0.15) / 0.25, 0.0, 1.0)
		box(rect, Color(0.07, 0.09, 0.13).lerp(Color(0.2, 0.15, 0.07), g), 14.0, Color(GOLD, 0.15 + 0.35 * g) if g > 0.05 else Color(0.52, 0.63, 0.74, 0.16), 1.0)
		if cross.has(i):
			box(rect.grow(-3), Color(0, 0, 0, 0), 12.0, Color(Paper.BRASS, 0.75 if i == _hover else 0.4), 2.0)
		var pop: float = clampf(1.0 - (t - float(_flip_at[i])) / 0.3, 0.0, 1.0)
		var s: float = 1.0 + 0.16 * sin(pop * PI)
		var flick: float = 0.9 + 0.1 * sin(t * 9.0 + i * 1.7) * sin(t * 5.3 + i)
		glow(c, CELL * (0.5 + 0.12 * wave), GOLD, g * 0.55 * flick + wave * 0.5)
		# The lantern: an iron cap and base, the glass between.
		var iron: Color = Color(0.2, 0.22, 0.26).lerp(Color(0.5, 0.36, 0.16), g)
		canvas.draw_rect(Rect2(c + Vector2(-16, -34) * s, Vector2(32, 7) * s), iron)
		canvas.draw_rect(Rect2(c + Vector2(-19, 26) * s, Vector2(38, 8) * s), iron)
		canvas.draw_line(c + Vector2(0, -34) * s, c + Vector2(0, -42) * s, iron, 3.0)
		canvas.draw_arc(c + Vector2(0, -45) * s, 5.0 * s, 0, TAU, 16, iron, 2.0, true)
		var glass: Color = Color(0.17, 0.2, 0.25).lerp(Color(0.98, 0.8, 0.42), g * flick)
		canvas.draw_circle(c, 22.0 * s, glass)
		canvas.draw_arc(c, 22.0 * s, 0, TAU, 32, iron.lerp(HOT, g * 0.5), 3.0, true)
		if g > 0.05:
			canvas.draw_circle(c + Vector2(0, 3) * s, 10.0 * s * g, Color(HOT, g))
			canvas.draw_circle(c + Vector2(-6, -7) * s, 5.0 * s, Color(1, 0.97, 0.9, 0.85 * g))
		else:
			canvas.draw_circle(c, 7.0, Color(0.24, 0.27, 0.33))
		for bar: float in [-11.0, 11.0]:
			canvas.draw_line(c + Vector2(bar, -20) * s, c + Vector2(bar, 20) * s, Color(iron, 0.7), 2.0)


func _centre(i: int) -> Vector2:
	var c: int = i % _cols
	var r: int = i / _cols
	return Vector2(c * (CELL + GAP) + CELL / 2.0, r * (CELL + GAP) + CELL / 2.0)
