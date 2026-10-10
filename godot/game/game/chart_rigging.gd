class_name ChartRigging
extends HBoxContainer
## LAY THE RIGGING (Godot port of chart-room/rigging/RiggingGame): rope each
## pair of matching cleats together across the board, so that every square is
## under a rope and no two ropes cross. Drag from a cleat (or a rope's loose
## end) through the squares; drawing over another rope cuts it there; going
## back over your own rope takes it up. The week's board is solvable by
## construction; the solve is judged by the rules (core/chart_room.gd).
##
## ON THE CHART SHEET (THE CHART ROOM AS A PLACE, Kong 2026-10-10): no plank
## deck (he rejected the faux wood); the board is faint inked squares on the
## sheet, the cleats rings of their rope's colour with an inked iron cleat
## across. THE MOTION: lines are ROPES, drawn in code: a dark lay under the
## coloured strand, a twisted stroke along it every few pixels. A rope being
## drawn SAGS between the squares it passes (it hangs in your hand); let go
## and it TIGHTENS, springing a touch past straight and settling. A rope cut
## by another flashes; a finished rope gives a tick; a complete rig tightens
## every rope at once with a small settle.

const MAX_CELL: float = 72.0
const SIDE_W: float = 400.0

var room: ChartStudy
var _st: Dictionary = {}
var _cols: int = 9
var _rows: int = 9
var _pairs: Array = []
var _palette: Array = []
## color (int) -> [cells]
var _paths: Dictionary = {}
var _drawing: int = -1
var _done: bool = false
var _t: float = 0.0
var _canvas: Control
var _cell: float = 56.0
var _org: Vector2 = Vector2.ZERO
var _info: Label
var _save_t: float = -1.0
var _flash: Dictionary = {}
## When each rope was let go (its tightening), and how hard (a complete rig
## kicks every rope).
var _set_t: Dictionary = {}
var _set_k: Dictionary = {}


func _ready() -> void:
	add_theme_constant_override("separation", 40)
	_st = RulesApi.run(room.session.store, room.session.uid, "getRiggingState", [])
	_cols = int(_st["cols"])
	_rows = int(_st["rows"])
	_pairs = _st["pairs"]
	_palette = (ChartRoom.c()["rigging"]["palette"] as Array).map(func(h: Variant) -> Color: return Color(str(h)))
	for k: Variant in Js.obj(_st["paths"]):
		_paths[int(str(k))] = (_st["paths"][k] as Array).map(func(x: Variant) -> int: return int(x))
	_done = _st["status"] == "cleared"
	_canvas = Control.new()
	# The board and its words sit together in the middle of the sheet.
	alignment = BoxContainer.ALIGNMENT_CENTER
	resized.connect(_size_canvas)
	_canvas.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_canvas.mouse_filter = Control.MOUSE_FILTER_STOP
	_canvas.draw.connect(_draw_board)
	_canvas.gui_input.connect(_board_input)
	_canvas.resized.connect(_fit)
	add_child(_canvas)
	## Leaving the room inside the save debounce would drop the last rope.
	tree_exiting.connect(func() -> void:
		if _save_t > 0.0 and not _done:
			_save_t = -1.0
			_save())
	var side: VBoxContainer = VBoxContainer.new()
	side.custom_minimum_size = Vector2(SIDE_W, 0)
	side.add_theme_constant_override("separation", 8)
	add_child(side)
	ChartStudy.inked(side, "LAY THE RIGGING", "eyebrow", Paper.RED)
	ChartStudy.inked(side, "Rope each pair of matching cleats together. Every square must be under a rope, and no two ropes may cross. Drag from a cleat or a rope's loose end; drawing over another rope cuts it; going back takes your rope up. Lay it all to bank %d points." % int(_st["reward"]), "note", ChartStudy.SHEET_INK_SOFT, true)
	Paper.rule(side, false)
	_info = ChartStudy.inked(side, "", "heading", ChartStudy.SHEET_INK, true)
	var gap: Control = Control.new()
	gap.size_flags_vertical = Control.SIZE_EXPAND_FILL
	side.add_child(gap)
	var clear: Button = Paper.button("Take up every rope", false, false)
	clear.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	clear.pressed.connect(func() -> void:
		if _done:
			return
		_paths.clear()
		_changed())
	side.add_child(clear)
	_words()


## The board's size from the view: as large as fits, up to MAX_CELL.
func _size_canvas() -> void:
	_cell = ChartStudy.board_cell(size, _cols, _rows, MAX_CELL, SIDE_W)
	_canvas.custom_minimum_size = Vector2(_cols * _cell, 0)


func _fit() -> void:
	_org = Vector2(floorf((_canvas.size.x - _cols * _cell) / 2.0), 0.0)
	_canvas.queue_redraw()


func _pair_of(color: int) -> Dictionary:
	for p: Dictionary in _pairs:
		if int(p["color"]) == color:
			return p
	return {}


func _end_color(i: int) -> int:
	for p: Dictionary in _pairs:
		if int(p["a"]) == i or int(p["b"]) == i:
			return int(p["color"])
	return -1


func _owner(i: int) -> int:
	for col: int in _paths:
		if (_paths[col] as Array).has(i):
			return col
	return -1


func _complete(col: int) -> bool:
	var p: Array = _paths.get(col, [])
	var pr: Dictionary = _pair_of(col)
	if p.size() < 2 or pr.is_empty():
		return false
	var ends: Array = [int(pr["a"]), int(pr["b"])]
	return ends.has(p[0]) and ends.has(p[p.size() - 1]) and p[0] != p[p.size() - 1]


func _covered() -> int:
	var n: int = 0
	for col: int in _paths:
		n += (_paths[col] as Array).size()
	return n


func _words() -> void:
	var ropes: int = _pairs.filter(func(p: Dictionary) -> bool: return _complete(int(p["color"]))).size()
	if _done:
		_info.text = "Rigged this week. %d points banked." % int(_st["pointsAwarded"])
	else:
		_info.text = "%d of %d ropes laid%s%d of %d squares covered" % [ropes, _pairs.size(), Kit.SEP, _covered(), _cols * _rows]


func _cell_at(p: Vector2) -> int:
	var q: Vector2 = p - _org
	if q.x < 0 or q.y < 0:
		return -1
	var c: int = int(q.x / _cell)
	var r: int = int(q.y / _cell)
	if c < 0 or c >= _cols or r < 0 or r >= _rows:
		return -1
	return r * _cols + c


func _board_input(e: InputEvent) -> void:
	if _done:
		return
	if e is InputEventMouseButton and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var mb: InputEventMouseButton = e
		if mb.pressed:
			var i: int = _cell_at(mb.position)
			if i < 0:
				return
			var ec: int = _end_color(i)
			if ec >= 0:
				# From a cleat: a fresh rope from here.
				_paths[ec] = [i]
				_drawing = ec
				Sound.plip()
			else:
				var own: int = _owner(i)
				if own >= 0:
					# From a rope: cut it back to here and carry on.
					var p: Array = _paths[own]
					_paths[own] = p.slice(0, p.find(i) + 1)
					_drawing = own
			_set_t.erase(_drawing)
			_canvas.queue_redraw()
		else:
			if _drawing >= 0:
				# Let go: the rope tightens.
				_set_t[_drawing] = _t
				_set_k[_drawing] = 1.0
				_drawing = -1
				_changed()
	elif e is InputEventMouseMotion and _drawing >= 0:
		_extend(_cell_at((e as InputEventMouseMotion).position))


func _extend(i: int) -> void:
	if i < 0:
		return
	var p: Array = _paths.get(_drawing, [])
	if p.is_empty():
		return
	var last: int = p[p.size() - 1]
	if i == last:
		return
	if not ChartRoom.neighbors4(last, _cols, _rows).has(i):
		return
	# Back over our own rope: take it up to there.
	var at: int = p.find(i)
	if at >= 0:
		_paths[_drawing] = p.slice(0, at + 1)
		_canvas.queue_redraw()
		return
	# Already at the other cleat: the rope is done.
	if _complete(_drawing):
		return
	var ec: int = _end_color(i)
	if ec >= 0 and ec != _drawing:
		return
	# Over another rope: cut it.
	var own: int = _owner(i)
	if own >= 0 and own != _drawing:
		var op: Array = _paths[own]
		_paths[own] = op.slice(0, op.find(i))
		_flash[own] = _t
		_set_t[own] = _t
		_set_k[own] = 0.7
		Sound.slack()
	p.append(i)
	_paths[_drawing] = p
	if _complete(_drawing):
		Sound.job_tick(_pairs.filter(func(q: Dictionary) -> bool: return _complete(int(q["color"]))).size() * 2)
		_flash[_drawing] = _t
	_words()
	_canvas.queue_redraw()


func _changed() -> void:
	_words()
	_canvas.queue_redraw()
	_save_t = 0.6
	# Every rope laid over every square: hand it in.
	if _covered() == _cols * _rows and _pairs.all(func(p: Dictionary) -> bool: return _complete(int(p["color"]))):
		_submit()


func _save() -> void:
	room.session.act("saveRiggingPaths", [_wire()])
	room.session.persist()


func _wire() -> Dictionary:
	var out: Dictionary = {}
	for col: int in _paths:
		out[str(col)] = (_paths[col] as Array).map(func(x: int) -> float: return float(x))
	return out


func _submit() -> void:
	var r: Variant = await room.session.act("submitRigging", [_wire()])
	room.session.persist()
	var res: Dictionary = r if r is Dictionary else {}
	if res.get("solved", false):
		_done = true
		_st["status"] = "cleared"
		_st["pointsAwarded"] = float(_st["pointsAwarded"]) + float(res.get("pointsWon", 0.0))
		# The whole rig hauls taut together: every rope kicks and settles.
		for col: int in _paths:
			_set_t[col] = _t + 0.03 * float(col)
			_set_k[col] = -1.4
		_flash["all"] = _t
		Sound.perfect()
		Rumble.buzz([0, 30, 30, 60])
		room.banked(float(res.get("pointsWon", 0.0)), _canvas.get_global_rect().position + _org + Vector2(_cols, _rows) * _cell / 2.0)
		_words()


func _process(delta: float) -> void:
	_t += delta
	if _save_t > 0.0:
		_save_t -= delta
		if _save_t <= 0.0 and not _done:
			_save()
	_canvas.queue_redraw()


func _centre(i: int) -> Vector2:
	return _org + Vector2(i % _cols, i / _cols) * _cell + Vector2(_cell, _cell) / 2.0


## How much a rope hangs: 1 while it is in your hand; let go, a damped spring
## through straight (a touch past it, bowing up) to rest.
func _slack(col: int) -> float:
	if col == _drawing:
		return 1.0
	if not _set_t.has(col):
		return 0.0
	var age: float = _t - float(_set_t[col])
	if age < 0.0:
		return 0.0
	if age > 0.9:
		_set_t.erase(col)
		return 0.0
	return float(_set_k.get(col, 1.0)) * exp(-age * 6.5) * cos(age * 19.0)


## The rope's line: each step between squares a curve hanging by `sag`
## pixels at its middle (straight down for a run across, a little aside for
## a run down), sampled into points.
func _rope_points(p: Array, sag: float) -> PackedVector2Array:
	var pts: PackedVector2Array = PackedVector2Array()
	pts.append(_centre(p[0]))
	for k: int in p.size() - 1:
		var a: Vector2 = _centre(p[k])
		var b: Vector2 = _centre(p[k + 1])
		var d: Vector2 = (b - a) / _cell
		var mid: Vector2 = (a + b) / 2.0 + Vector2(sag * 0.3 * absf(d.y), sag * absf(d.x))
		for s: int in range(1, 9):
			var u: float = float(s) / 8.0
			pts.append(a.lerp(mid, u).lerp(mid.lerp(b, u), u))
	return pts


func _draw_board() -> void:
	var bw: Vector2 = Vector2(_cols, _rows) * _cell
	# The board on the sheet: faint inked squares, a dot in each, a thin rim.
	for i: int in _cols * _rows:
		var p: Vector2 = _org + Vector2(i % _cols, i / _cols) * _cell
		_canvas.draw_rect(Rect2(p + Vector2(0.5, 0.5), Vector2(_cell - 1, _cell - 1)), Color(ChartStudy.SHEET_INK, 0.1), false, 1.0)
		_canvas.draw_circle(p + Vector2(_cell, _cell) / 2.0, 1.6, Color(ChartStudy.SHEET_INK, 0.22))
	_canvas.draw_rect(Rect2(_org - Vector2(3, 3), bw + Vector2(6, 6)), Color(ChartStudy.SHEET_INK, 0.45), false, 1.0)
	var all_k: float = 0.0
	if _flash.has("all"):
		var ag: float = _t - float(_flash["all"])
		all_k = clampf(1.0 - ag / 0.8, 0.0, 1.0)
	# The ropes.
	var w: float = _cell * 0.24
	for col: int in _paths:
		var p: Array = _paths[col]
		if p.size() < 2:
			continue
		var pts: PackedVector2Array = _rope_points(p, _cell * 0.2 * _slack(col))
		var colr: Color = _palette[col % _palette.size()]
		var fl: float = 0.0
		if _flash.has(col):
			fl = clampf(1.0 - (_t - float(_flash[col])) / 0.5, 0.0, 1.0)
		fl = maxf(fl, all_k * 0.6)
		var body: Color = colr.lerp(Color.WHITE, fl * 0.45)
		var lay: Color = colr.darkened(0.55)
		_canvas.draw_polyline(pts, lay, w + 4.0, true)
		for k: int in p.size():
			_canvas.draw_circle(_centre(p[k]) if k == 0 or k == p.size() - 1 else pts[k * 8], (w + 4.0) / 2.0, lay)
		_canvas.draw_polyline(pts, body, w, true)
		for k: int in p.size():
			_canvas.draw_circle(_centre(p[k]) if k == 0 or k == p.size() - 1 else pts[k * 8], w / 2.0, body)
		_twist(pts, w, colr.darkened(0.42))
	# The cleats: a ring of the rope's colour, an inked iron cleat across it.
	for pr: Dictionary in _pairs:
		var colr2: Color = _palette[int(pr["color"]) % _palette.size()]
		var done: bool = _complete(int(pr["color"]))
		for e: int in [int(pr["a"]), int(pr["b"])]:
			var c: Vector2 = _centre(e)
			var pulse: float = 0.0 if done else 0.5 + 0.5 * sin(_t * 3.0 + float(pr["color"]))
			_canvas.draw_circle(c, _cell * 0.36 + 2.0 * pulse, Color(colr2, 0.28))
			_canvas.draw_circle(c, _cell * 0.29, colr2)
			_canvas.draw_arc(c, _cell * 0.29, 0.0, TAU, 28, colr2.darkened(0.5), 1.5, true)
			var iron: Color = Color(0.17, 0.16, 0.17)
			_canvas.draw_rect(Rect2(c - Vector2(_cell * 0.22, _cell * 0.045), Vector2(_cell * 0.44, _cell * 0.09)), iron)
			_canvas.draw_circle(c - Vector2(_cell * 0.22, 0), _cell * 0.05, iron)
			_canvas.draw_circle(c + Vector2(_cell * 0.22, 0), _cell * 0.05, iron)
			_canvas.draw_circle(c, _cell * 0.075, iron)
			if done:
				Paper.ring(_canvas, c, Vector2(_cell, _cell) * 0.4, 0.0, Color(ChartStudy.SHEET_INK, 0.7), 1.6)


## THE TWIST: short strokes across the rope at a lean, every few pixels
## along it, so the strand reads as laid rope.
func _twist(pts: PackedVector2Array, w: float, c: Color) -> void:
	var step: float = maxf(5.0, w * 0.55)
	var carry: float = step * 0.5
	for k: int in pts.size() - 1:
		var a: Vector2 = pts[k]
		var b: Vector2 = pts[k + 1]
		var seg: float = a.distance_to(b)
		if seg < 0.01:
			continue
		var d: Vector2 = (b - a) / seg
		var n: Vector2 = Vector2(-d.y, d.x)
		var x: float = carry
		while x < seg:
			var m: Vector2 = a + d * x
			_canvas.draw_line(m - n * w * 0.42 - d * w * 0.22, m + n * w * 0.42 + d * w * 0.22, Color(c, 0.9), 2.0, true)
			x += step
		carry = x - seg


## For tests/shot.gd (CHART_PLAY): a rope drawn from the first unfinished
## cleat a few squares toward its mate and held (it sags); "set" lets go of
## it (it tightens).
func play_for_shot(how: String) -> void:
	for pr: Dictionary in _pairs:
		var col: int = int(pr["color"])
		if _complete(col):
			continue
		_paths[col] = [int(pr["a"])]
		_drawing = col
		var goal: int = int(pr["b"])
		for step: int in 4:
			var p: Array = _paths[col]
			var last: int = p[p.size() - 1]
			var best: int = -1
			var bd: float = 1e9
			for n: int in ChartRoom.neighbors4(last, _cols, _rows):
				var ec: int = _end_color(n)
				if p.has(n) or (ec >= 0 and ec != col):
					continue
				var d: float = Vector2(n % _cols - goal % _cols, n / _cols - goal / _cols).length()
				if d < bd:
					bd = d
					best = n
			if best < 0:
				break
			_extend(best)
		if how == "set":
			_set_t[col] = _t
			_set_k[col] = 1.0
			_drawing = -1
			_changed()
		return
