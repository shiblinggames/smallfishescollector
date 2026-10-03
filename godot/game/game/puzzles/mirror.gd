extends PuzzleBoard
## THE MIRROR RUN (port of expeditions/MirrorRunPuzzle). Turn the mirrors
## ('/' and '\') to bend the lantern's beam through every lens in one fired
## shot. A prism splits the beam into its two perpendicular directions, so the
## beam is a branching tree; walls stop it; lenses let it pass straight. The
## beam is hidden while planning; a miss shows only which lenses lit. Burn
## every fire in the budget without a hit and the mirrors reset to their start.

const REFLECT: Dictionary = {
	"/": { "right": "up", "up": "right", "left": "down", "down": "left" },
	"\\": { "right": "down", "down": "right", "left": "up", "up": "left" },
}
const STEP: Dictionary = {
	"up": Vector2i(0, -1), "down": Vector2i(0, 1), "left": Vector2i(-1, 0), "right": Vector2i(1, 0),
}
const PERP: Dictionary = {
	"right": ["up", "down"], "left": ["up", "down"], "up": ["left", "right"], "down": ["left", "right"],
}
## Cells a second the beam's front runs (the web's 0.42 px/ms at its ~35 px cell).
const SPEED: float = 12.0
const RED: Color = Color(0.89, 0.4, 0.29)

var _lvl: Dictionary = {}
var _cell: float = 60.0
var _init: Dictionary = {}
var _orient: Dictionary = {}
## The shown tilt of each mirror (eases toward its orientation).
var _tilt: Dictionary = {}
var _walls: Dictionary = {}
var _fixed: Dictionary = {}
var _prisms: Dictionary = {}
var _targets: Dictionary = {}
var _trace: Dictionary = {}
var _hover: String = ""
var _revealed: bool = false
var _firing: bool = false
var _failed: bool = false
var _fires_used: int = 0
var _front: float = 0.0
var _total: float = 0.0
var _fade_at: float = -10.0
var _fade_trace: Dictionary = {}
var _fire_b: Pane.PaneButton


# ── The rules ─────────────────────────────────────────────────────────────────

static func key(x: int, y: int) -> String:
	return "%d,%d" % [x, y]


## The beam tree for a layout and the mirrors' orientations ("x,y" -> "/" or
## "\"). Reflect at mirrors, split at prisms into two perpendicular beams,
## pass through lenses, stop at walls and the edge. A global (cell, dir) seen
## set and the guard bound the tree. Returns strokes ([{pts (cell centers, in
## cell units), start (distance along the tree where it begins)}]), crossed
## (lens key -> true) and hit (every lens crossed). The web's trace exactly.
static func trace(lvl: Dictionary, orient: Dictionary) -> Dictionary:
	var cols: int = int(Js.num(lvl["cols"]))
	var rows: int = int(Js.num(lvl["rows"]))
	var need: Dictionary = {}
	for tg: Dictionary in lvl.get("targets", []):
		need[key(int(tg["x"]), int(tg["y"]))] = true
	var walls: Dictionary = {}
	for w: Dictionary in lvl.get("walls", []):
		walls[key(int(w["x"]), int(w["y"]))] = true
	var mirrors: Dictionary = {}
	for m: Dictionary in lvl.get("mirrors", []):
		mirrors[key(int(m["x"]), int(m["y"]))] = true
	var prisms: Dictionary = {}
	var pr: Variant = lvl.get("prisms")
	if pr is Array:
		for p: Dictionary in pr:
			prisms[key(int(p["x"]), int(p["y"]))] = true
	var crossed: Dictionary = {}
	var seen: Dictionary = {}
	var strokes: Array = []
	var src: Dictionary = lvl["source"]
	var queue: Array = [{ "x": int(src["x"]), "y": int(src["y"]), "dir": str(src["dir"]), "first": true, "start": 0.0 }]
	var guard: int = cols * rows * 16
	while not queue.is_empty():
		var go: bool = guard > 0
		guard -= 1
		if not go:
			break
		var b: Dictionary = queue.pop_front()
		var x: int = b["x"]
		var y: int = b["y"]
		var dir: String = b["dir"]
		var first: bool = b["first"]
		var pts: PackedVector2Array = PackedVector2Array([Vector2(x + 0.5, y + 0.5)])
		var length: float = 0.0
		while true:
			var go2: bool = guard > 0
			guard -= 1
			if not go2:
				break
			var k: String = key(x, y)
			if not first and mirrors.has(k):
				dir = REFLECT[str(orient.get(k, "/"))][dir]
			if not first and prisms.has(k):
				for nd: String in PERP[dir]:
					queue.append({ "x": x, "y": y, "dir": nd, "first": true, "start": float(b["start"]) + length })
				break
			if need.has(k):
				crossed[k] = true
			var state: String = "%s,%s" % [k, dir]
			if seen.has(state):
				break
			seen[state] = true
			first = false
			var s: Vector2i = STEP[dir]
			var nx: int = x + s.x
			var ny: int = y + s.y
			if nx < 0 or ny < 0 or nx >= cols or ny >= rows:
				break
			if walls.has(key(nx, ny)):
				break
			x = nx
			y = ny
			length += 1.0
			pts.append(Vector2(x + 0.5, y + 0.5))
		if pts.size() >= 2:
			strokes.append({ "pts": pts, "start": float(b["start"]) })
	return { "strokes": strokes, "crossed": crossed, "hit": crossed.size() == need.size() }


## The start orientations of a layout.
static func start_orient(lvl: Dictionary) -> Dictionary:
	var o: Dictionary = {}
	for m: Dictionary in lvl.get("mirrors", []):
		o[key(int(m["x"]), int(m["y"]))] = str(m["init"])
	return o


static func flip(o: String) -> String:
	return "\\" if o == "/" else "/"


static func length_of(pts: PackedVector2Array) -> float:
	var l: float = 0.0
	for i: int in range(1, pts.size()):
		l += pts[i].distance_to(pts[i - 1])
	return l


## The polyline cut at a distance along it.
static func cut(pts: PackedVector2Array, upto: float) -> PackedVector2Array:
	var out: PackedVector2Array = PackedVector2Array()
	if upto <= 0.0 or pts.size() < 2:
		return out
	out.append(pts[0])
	var acc: float = 0.0
	for i: int in range(1, pts.size()):
		var seg: float = pts[i].distance_to(pts[i - 1])
		if acc + seg <= upto:
			out.append(pts[i])
			acc += seg
		else:
			out.append(pts[i - 1].lerp(pts[i], (upto - acc) / seg if seg > 0.0 else 0.0))
			break
	return out


# ── The board ─────────────────────────────────────────────────────────────────

func board_name() -> String:
	return "The Mirror Run"


func how_to() -> String:
	return "Press a mirror to turn it. Bend the lantern's beam through all %d lenses in one shot. The prism splits the beam in two, so both branches must land. The beam stays hidden until you fire; plan it, then fire." % _targets.size()


func board_size() -> Vector2:
	return Vector2(int(Js.num(_lvl["cols"])), int(Js.num(_lvl["rows"]))) * _cell


func build() -> void:
	_lvl = puzzle.get("mirror", {})
	var cols: int = int(Js.num(_lvl["cols"]))
	var rows: int = int(Js.num(_lvl["rows"]))
	_cell = minf(66.0, floor(620.0 / float(maxi(cols, rows))))
	_init = start_orient(_lvl)
	_orient = _init.duplicate()
	for k: String in _orient:
		_tilt[k] = _angle_of(str(_orient[k]))
	for w: Dictionary in _lvl.get("walls", []):
		_walls[key(int(w["x"]), int(w["y"]))] = true
	for m: Dictionary in _lvl.get("mirrors", []):
		if m.get("fixed", false):
			_fixed[key(int(m["x"]), int(m["y"]))] = true
	var pr: Variant = _lvl.get("prisms")
	if pr is Array:
		for p: Dictionary in pr:
			_prisms[key(int(p["x"]), int(p["y"]))] = true
	for tg: Dictionary in _lvl.get("targets", []):
		_targets[key(int(tg["x"]), int(tg["y"]))] = true
	_retrace()


func _budget() -> int:
	return int(Js.num(_lvl["fireBudget"])) if _lvl.get("fireBudget") != null else -1


func _retrace() -> void:
	_trace = trace(_lvl, _orient)
	_total = 0.0
	for s: Dictionary in _trace["strokes"]:
		_total = maxf(_total, float(s["start"]) + length_of(s["pts"]))


func _angle_of(o: String) -> float:
	# The mirror's line, from vertical: '/' leans right, '\' leans left.
	return PI / 4.0 if o == "/" else -PI / 4.0


func extra(box: VBoxContainer) -> void:
	_fire_b = Paper.button("Fire the lantern", true)
	_fire_b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_fire_b.pressed.connect(_fire)
	box.add_child(_fire_b)
	Paper.text(box, "Space or Enter fires too.", "note", Paper.ink_faint())


func words() -> void:
	var b: int = _budget()
	var lens: int = _targets.size()
	var solved_now: bool = _revealed and bool(_trace["hit"])
	if b >= 0:
		count_l.text = "%d of %d fires left  ·  %d lenses" % [maxi(0, b - _fires_used), b, lens]
	else:
		count_l.text = "%d lenses" % lens
	var col: Color = Paper.NIGHT_INK_SOFT
	if solved_now:
		note_l.text = "The beam strikes true."
		col = Paper.BRASS
	elif _failed:
		note_l.text = "Out of fires. The mirrors reset. Plan it through."
		col = RED
	elif _revealed:
		note_l.text = "Lit %d of %d lenses. Turn the mirrors and fire again." % [(_trace["crossed"] as Dictionary).size(), lens]
		col = RED
	else:
		note_l.text = "Plan the path, then fire."
	note_l.add_theme_color_override("font_color", col)
	if _fire_b != null:
		_fire_b.disabled = solved_now or _firing or _failed
		_fire_b.text = ("Lens lit" if solved_now else "Resetting" if _failed else "Firing" if _firing else "Fire again" if _revealed else "Fire the lantern").to_upper()


func on_reset() -> void:
	# The mirrors back to their start; fires spent stay spent.
	if _firing or _failed:
		return
	_orient = _init.duplicate()
	_revealed = false
	_retrace()


func on_key(e: InputEvent) -> bool:
	if e.is_action_pressed("fish_act"):
		_fire()
		return true
	return false


func _fire() -> void:
	if won or _firing or _failed:
		return
	Rumble.tap(18)
	Sound.cannon()
	_fires_used += 1
	_revealed = false
	_firing = true
	_front = 0.0
	words()


func _finish() -> void:
	_firing = false
	_revealed = true
	if bool(_trace["hit"]):
		win()
	else:
		_fade_at = t
		_fade_trace = _trace
		Sound.slack()
		var b: int = _budget()
		if b >= 0 and _fires_used >= b:
			_failed = true
			shake()
			get_tree().create_timer(1.2).timeout.connect(_after_bust)
	words()


func _after_bust() -> void:
	_orient = _init.duplicate()
	_fires_used = 0
	_revealed = false
	_failed = false
	_retrace()
	words()


func _cell_key(p: Vector2) -> String:
	var x: int = int(floor(p.x / _cell))
	var y: int = int(floor(p.y / _cell))
	if x < 0 or y < 0 or x >= int(Js.num(_lvl["cols"])) or y >= int(Js.num(_lvl["rows"])):
		return ""
	return key(x, y)


func board_input(e: InputEvent) -> void:
	if e is InputEventMouseMotion:
		var k: String = _cell_key((e as InputEventMouseMotion).position)
		_hover = k if _orient.has(k) and not _fixed.has(k) else ""
		canvas.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if _hover != "" else Control.CURSOR_ARROW
	elif e is InputEventMouseButton:
		var mb: InputEventMouseButton = e
		if mb.button_index != MOUSE_BUTTON_LEFT or not mb.pressed:
			return
		var k2: String = _cell_key(mb.position)
		if k2 == "" or not _orient.has(k2) or _fixed.has(k2):
			return
		if won or _firing or _failed:
			return
		Rumble.tap(12)
		Sound.plip()
		_orient[k2] = flip(str(_orient[k2]))
		_revealed = false
		_retrace()
		words()


func tick(delta: float) -> void:
	var k: float = 1.0 - exp(-delta * 18.0)
	for m: String in _orient:
		_tilt[m] = lerp_angle(float(_tilt[m]), _angle_of(str(_orient[m])), k)
	if _firing:
		var dur: float = clampf(_total / SPEED, 0.7, 2.1)
		_front += delta * (_total / dur if dur > 0.0 else 1.0)
		if _front >= _total:
			_front = _total
			_finish()


func _pts(cells: PackedVector2Array) -> PackedVector2Array:
	var out: PackedVector2Array = PackedVector2Array()
	for p: Vector2 in cells:
		out.append(p * _cell)
	return out


func _beam(tr: Dictionary, front: float, col: Color, alpha: float, head: bool) -> void:
	for s: Dictionary in tr["strokes"]:
		var vis: float = front - float(s["start"])
		if vis <= 0.0:
			continue
		var pts: PackedVector2Array = _pts(cut(s["pts"], vis))
		if pts.size() < 2:
			continue
		canvas.draw_polyline(pts, Color(col, 0.1 * alpha), 22.0, true)
		canvas.draw_polyline(pts, Color(col, 0.22 * alpha), 10.0, true)
		canvas.draw_polyline(pts, Color(col.lerp(Color.WHITE, 0.3), 0.95 * alpha), 3.4, true)
		if head and vis < length_of(s["pts"]):
			var hp: Vector2 = pts[pts.size() - 1]
			glow(hp, 16.0, col, 1.0)
			canvas.draw_circle(hp, 4.0, Color.WHITE)


func draw_board() -> void:
	var cols: int = int(Js.num(_lvl["cols"]))
	var rows: int = int(Js.num(_lvl["rows"]))
	var cs: Vector2 = Vector2(_cell, _cell)
	box(Rect2(Vector2.ZERO, canvas.size), Color(0.04, 0.075, 0.125), 12.0, Color(0.12, 0.18, 0.26), 1.0)
	for x: int in range(1, cols):
		canvas.draw_line(Vector2(x * _cell, 0), Vector2(x * _cell, canvas.size.y), Color(1, 1, 1, 0.04), 1.0)
	for y: int in range(1, rows):
		canvas.draw_line(Vector2(0, y * _cell), Vector2(canvas.size.x, y * _cell), Color(1, 1, 1, 0.04), 1.0)
	var solved_now: bool = won
	var crossed: Dictionary = _trace["crossed"]
	# Walls: weathered stone.
	for k: String in _walls:
		var c: Vector2 = _centre(k)
		canvas.draw_rect(Rect2(c - cs / 2.0, cs), Color(0.47, 0.51, 0.59, 0.16))
		box(Rect2(c - cs * 0.33, cs * 0.66), Color(0.59, 0.63, 0.7, 0.32), 5.0, Color(0.7, 0.75, 0.82, 0.25), 1.0)
	# The lantern.
	var src: Dictionary = _lvl["source"]
	var sc: Vector2 = (Vector2(int(src["x"]), int(src["y"])) + Vector2(0.5, 0.5)) * _cell
	glow(sc, _cell * 0.55, GOLD, 0.8 + 0.15 * sin(t * 4.0))
	canvas.draw_circle(sc, _cell * 0.18, GOLD)
	canvas.draw_circle(sc, _cell * 0.09, HOT)
	var sd: Vector2i = STEP[str(src["dir"])]
	canvas.draw_line(sc + Vector2(sd) * _cell * 0.22, sc + Vector2(sd) * _cell * 0.4, Color(GOLD, 0.8), 3.0, true)
	# Prisms: a cut crystal, turned on its point.
	for k: String in _prisms:
		var c: Vector2 = _centre(k)
		var r: float = _cell * 0.3
		glow(c, _cell * 0.45, Color(0.49, 0.83, 0.99), 0.5)
		var dia: PackedVector2Array = PackedVector2Array([c + Vector2(0, -r), c + Vector2(r, 0), c + Vector2(0, r), c + Vector2(-r, 0)])
		canvas.draw_colored_polygon(dia, Color(0.4, 0.78, 0.96, 0.75))
		canvas.draw_colored_polygon(PackedVector2Array([c + Vector2(0, -r), c + Vector2(r, 0), c]), Color(0.75, 0.92, 1.0, 0.6))
		dia.append(dia[0])
		canvas.draw_polyline(dia, Color(0.73, 0.9, 0.99), 1.5, true)
	# The beam: travelling while it fires, gold on a hit, fading on a miss.
	if _firing:
		_beam(_trace, _front, HOT, 1.0, true)
	elif solved_now:
		var pulse: float = 0.85 + 0.15 * sin(t * 5.0)
		_beam(_trace, _total + 1.0, GOLD, pulse, false)
	elif t - _fade_at < 0.35 and not _fade_trace.is_empty():
		_beam(_fade_trace, 9999.0, HOT, 1.0 - (t - _fade_at) / 0.35, false)
	# Lenses: a ring, lit when the last shot crossed it.
	for k: String in _targets:
		var c: Vector2 = _centre(k)
		var lit: bool = _revealed and crossed.has(k)
		var r: float = _cell * 0.29
		if lit:
			glow(c, _cell * 0.6, GOLD, 0.9)
		var bounce: float = 0.0
		if solved_now:
			var since: float = t - won_at
			bounce = sin(clampf(since / 0.46, 0.0, 1.0) * PI) * 0.2
			var ring: float = clampf(since / 0.52, 0.0, 1.0)
			if ring < 1.0:
				canvas.draw_arc(c, _cell * (0.3 + 0.55 * ring), 0, TAU, 40, Color(GOLD, 1.0 - ring), 2.0, true)
		canvas.draw_circle(c, r * (1.0 + bounce), Color(GOLD, 0.55) if lit else Color(0.35, 0.48, 0.6, 0.18))
		canvas.draw_arc(c, r * (1.0 + bounce), 0, TAU, 40, GOLD if lit else Color(0.35, 0.48, 0.6), 2.5, true)
		canvas.draw_circle(c, r * 0.3, Color(HOT, 0.9) if lit else Color(0.35, 0.48, 0.6, 0.5))
	# Mirrors: a silvered line on a pivot; fixed ones are dull iron.
	for k: String in _orient:
		var c: Vector2 = _centre(k)
		var fixed: bool = _fixed.has(k)
		if not fixed:
			canvas.draw_circle(c, _cell * 0.36, Color(0.8, 0.84, 0.89, 0.07))
			canvas.draw_arc(c, _cell * 0.36, 0, TAU, 32, Color(Paper.BRASS, 0.8) if k == _hover else Color(0.8, 0.84, 0.89, 0.16), 2.0 if k == _hover else 1.0, true)
		var d: Vector2 = Vector2.from_angle(float(_tilt[k]) - PI / 2.0) * _cell * 0.36
		var mc: Color = Color(0.34, 0.38, 0.45) if fixed else (GOLD if solved_now else Color(0.86, 0.89, 0.93))
		if not fixed:
			canvas.draw_line(c - d, c + d, Color(mc, 0.25), 9.0, true)
		canvas.draw_line(c - d, c + d, mc, 4.0 if fixed else 3.2, true)
		canvas.draw_circle(c, 3.0, Color(0.2, 0.22, 0.26))


func _centre(k: String) -> Vector2:
	var p: PackedStringArray = k.split(",")
	return (Vector2(int(p[0]), int(p[1])) + Vector2(0.5, 0.5)) * _cell
