extends PuzzleBoard
## THE CIPHER DIALS (port of expeditions/CipherDialsPuzzle). A manifest is
## sealed behind a row of wax dials, rigged so a turn of one also turns the
## dials on either side of it. Line every seal to the brass index at the top
## (position 0) at once. Scrambled from the aligned row by random turns, so it
## is always solvable. State is the running turn count per dial (dials only
## ever turn forward); a dial is aligned when its count is a whole multiple of
## the positions.

const DIAL: float = 118.0
const GAP: float = 16.0
const TOP: float = 40.0

var _n: int = 5
var _positions: int = 3
var _start: Array = []
var _count: Array = []
## The shown angle of each pointer and its spin (a spring toward the count).
var _ang: Array = []
var _vel: Array = []
var _hover: int = -1
var _turns: int = 0


# ── The rules ─────────────────────────────────────────────────────────────────

## Turn dial i one notch: its immediate neighbors turn with it (an end dial
## has only the one).
static func turn(state: Array, n: int, i: int) -> Array:
	var next: Array = state.duplicate()
	for j: int in [i - 1, i, i + 1]:
		if j >= 0 and j < n:
			next[j] = int(next[j]) + 1
	return next


static func aligned(v: int, positions: int) -> bool:
	return v % positions == 0


static func aligned_count(state: Array, positions: int) -> int:
	var n: int = 0
	for v: int in state:
		if aligned(v, positions):
			n += 1
	return n


static func solved(state: Array, positions: int) -> bool:
	return aligned_count(state, positions) == state.size()


## Scramble from the aligned row with random turns; retry until at least one
## seal is off the index (the web's guard), and never hand back a solved row.
static func scramble(n: int, positions: int, turns: int) -> Array:
	while true:
		for attempt: int in 16:
			var s: Array = []
			s.resize(n)
			s.fill(0)
			for k: int in turns:
				s = turn(s, n, randi() % n)
			if not solved(s, positions):
				return s
	return []


# ── The board ─────────────────────────────────────────────────────────────────

func board_name() -> String:
	return "The Cipher Dials"


func how_to() -> String:
	return "Press a dial to turn it one notch. Turning one also turns the dials on either side of it. Line every seal up with the gold mark at the top."


func board_size() -> Vector2:
	return Vector2(_n * DIAL + (_n - 1) * GAP, DIAL + TOP + 30.0)


func build() -> void:
	_n = int(Js.num(puzzle.get("dials"))) if puzzle.get("dials") != null else 5
	_positions = int(Js.num(puzzle.get("positions"))) if puzzle.get("positions") != null else 3
	var turns: int = int(Js.num(puzzle.get("scrambleTurns"))) if puzzle.get("scrambleTurns") != null else 9
	_start = scramble(_n, _positions, turns)
	_count = _start.duplicate()
	for i: int in _n:
		_ang.append(_target(i))
		_vel.append(0.0)


func _target(i: int) -> float:
	return float(_count[i]) * TAU / float(_positions)


func words() -> void:
	count_l.text = "%d of %d sealed  ·  %d turn%s" % [aligned_count(_count, _positions), _n, _turns, "" if _turns == 1 else "s"]
	if won:
		note_l.text = "The cipher reads true."
		note_l.add_theme_color_override("font_color", Paper.BRASS)
	else:
		note_l.text = "A gold rim is a seal on the mark."


func on_reset() -> void:
	# Back to the scramble this board was dealt; the pointers wind on round
	# to it, never backward.
	for i: int in _n:
		var now: int = int(_count[i])
		var want: int = int(_start[i])
		while posmod(now, _positions) != posmod(want, _positions):
			now += 1
		_count[i] = now
	_start = _count.duplicate()
	_turns = 0


func _dial_at(p: Vector2) -> int:
	var i: int = int(floor(p.x / (DIAL + GAP)))
	if i < 0 or i >= _n:
		return -1
	if p.distance_to(_centre(i)) > DIAL * 0.5:
		return -1
	return i


func _centre(i: int) -> Vector2:
	return Vector2(i * (DIAL + GAP) + DIAL / 2.0, TOP + DIAL / 2.0)


func board_input(e: InputEvent) -> void:
	if e is InputEventMouseMotion:
		_hover = _dial_at((e as InputEventMouseMotion).position)
	elif e is InputEventMouseButton:
		var mb: InputEventMouseButton = e
		if mb.button_index != MOUSE_BUTTON_LEFT or not mb.pressed or won:
			return
		var i: int = _dial_at(mb.position)
		if i < 0:
			return
		_count = turn(_count, _n, i)
		_turns += 1
		Rumble.tap(8)
		Sound.plip()
		for j: int in [i - 1, i, i + 1]:
			if j >= 0 and j < _n and aligned(int(_count[j]), _positions):
				Sound.job_tick(aligned_count(_count, _positions) * 2)
				break
		if solved(_count, _positions):
			win()
		words()


func tick(delta: float) -> void:
	# A springy turn that overshoots a touch and settles.
	for i: int in _n:
		var a: float = float(_ang[i])
		var v: float = float(_vel[i])
		v += (_target(i) - a) * 320.0 * delta
		v *= exp(-delta * 19.0)
		_ang[i] = a + v * delta
		_vel[i] = v


func draw_board() -> void:
	var w: float = canvas.size.x
	# The brass rail the index marks hang from.
	canvas.draw_line(Vector2(0, 14), Vector2(w, 14), Color(Paper.BRASS, 0.35), 2.0, true)
	for i: int in _n:
		var c: Vector2 = _centre(i)
		var on: bool = aligned(int(_count[i]), _positions)
		var r: float = DIAL * 0.5
		var near: bool = _hover >= 0 and not won and absi(i - _hover) <= 1
		var sweep: float = 0.0
		if won:
			sweep = clampf(1.0 - absf(t - won_at - 0.12 * i - 0.2) / 0.3, 0.0, 1.0)
		var breathe: float = 0.0 if on or won else 0.5 + 0.5 * sin(t * 2.6 + i * 0.7)
		glow(c, r * 1.25, GOLD, (0.5 if on else 0.18 * breathe) + sweep * 0.6)
		canvas.draw_circle(c, r, Color(0.06, 0.08, 0.12))
		canvas.draw_circle(c, r - 4.0, Color(0.13, 0.17, 0.23).lerp(Color(0.24, 0.18, 0.08), 1.0 if on else 0.0))
		canvas.draw_arc(c, r - 2.0, 0, TAU, 64, GOLD if on else Color(0.59, 0.7, 0.82, 0.45), 3.0, true)
		if near:
			canvas.draw_arc(c, r + 6.0, 0, TAU, 64, Color(Paper.BRASS, 0.85 if i == _hover else 0.4), 2.0, true)
		canvas.draw_arc(c, r * 0.72, 0, TAU, 48, Color(GOLD, 0.35) if on else Color(0.59, 0.7, 0.82, 0.25), 2.0, true)
		# The glyph ticks, one per position; the index is position 0, at top.
		for k: int in _positions:
			var a: float = -PI / 2.0 + TAU * k / float(_positions)
			var d: Vector2 = Vector2.from_angle(a)
			canvas.draw_line(c + d * (r * 0.74), c + d * (r * 0.9), Color(GOLD, 0.7) if on else Color(0.3, 0.35, 0.42), 4.0, true)
		# The index: a brass mark above the dial.
		var tri: PackedVector2Array = PackedVector2Array([c + Vector2(0, -r - 6), c + Vector2(-9, -r - 22), c + Vector2(9, -r - 22)])
		canvas.draw_colored_polygon(tri, GOLD)
		canvas.draw_line(c + Vector2(0, -r - 22), Vector2(c.x, 14), Color(Paper.BRASS, 0.5), 2.0)
		# The seal's pointer, turned by its count.
		var pa: float = -PI / 2.0 + float(_ang[i])
		var pd: Vector2 = Vector2.from_angle(pa)
		var pc: Color = GOLD.lerp(HOT, sweep) if on else Color(0.79, 0.85, 0.92)
		canvas.draw_line(c - pd * 6.0, c + pd * (r * 0.6), Color(0, 0, 0, 0.4), 9.0, true)
		canvas.draw_line(c - pd * 6.0, c + pd * (r * 0.6), pc, 6.0, true)
		canvas.draw_circle(c + pd * (r * 0.6), 7.0, pc)
		canvas.draw_circle(c, 9.0, GOLD if on else Color(0.33, 0.39, 0.48))
		canvas.draw_arc(c, 9.0, 0, TAU, 20, Color(0, 0, 0, 0.45), 1.5, true)
	# The words under the row.
	var lc: Color = GOLD if won else Paper.NIGHT_INK_FAINT
	ink("THE CIPHER READS TRUE" if won else "TURN ONE, TURN ITS NEIGHBORS", Vector2(w / 2.0, TOP + DIAL + 22.0), 13, lc, "karla", 700)
