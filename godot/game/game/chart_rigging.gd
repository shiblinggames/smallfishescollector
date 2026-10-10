class_name ChartRigging
extends HBoxContainer
## LAY THE RIGGING (Godot port of chart-room/rigging/RiggingGame): rope each
## pair of matching cleats together across the deck, so that every plank is
## under a rope and no two ropes cross. Drag from a cleat (or a rope's loose
## end) through the planks; drawing over another rope cuts it there; going
## back over your own rope takes it up. The week's board is solvable by
## construction; the solve is judged by the rules (core/chart_room.gd).

const CELL: float = 56.0

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
var _info: Label
var _save_t: float = -1.0
var _flash: Dictionary = {}


func _ready() -> void:
	add_theme_constant_override("separation", 18)
	_st = RulesApi.run(room.session.store, room.session.uid, "getRiggingState", [])
	_cols = int(_st["cols"])
	_rows = int(_st["rows"])
	_pairs = _st["pairs"]
	_palette = (ChartRoom.c()["rigging"]["palette"] as Array).map(func(h: Variant) -> Color: return Color(str(h)))
	for k: Variant in Js.obj(_st["paths"]):
		_paths[int(str(k))] = (_st["paths"][k] as Array).map(func(x: Variant) -> int: return int(x))
	_done = _st["status"] == "cleared"
	var wrap: VBoxContainer = room.sheet(self, 16)
	_canvas = Control.new()
	_canvas.custom_minimum_size = Vector2(CELL * _cols, CELL * _rows)
	_canvas.mouse_filter = Control.MOUSE_FILTER_STOP
	_canvas.draw.connect(_draw_board)
	_canvas.gui_input.connect(_board_input)
	wrap.add_child(_canvas)
	## Leaving the room inside the save debounce would drop the last rope.
	tree_exiting.connect(func() -> void:
		if _save_t > 0.0 and not _done:
			_save_t = -1.0
			_save())
	var side: VBoxContainer = room.sheet(self, 18)
	side.get_parent().size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Paper.text(side, "LAY THE RIGGING", "eyebrow", Paper.RED)
	Paper.text(side, "Rope each pair of matching cleats together. Every plank must be under a rope, and no two ropes may cross. Drag from a cleat or a rope's loose end; drawing over another rope cuts it; going back takes your rope up. Lay it all to bank %d points." % int(_st["reward"]), "note", Paper.INK_SOFT, true)
	_info = Paper.text(side, "", "body_strong", Paper.INK, true)
	var clear: Button = Paper.button("Take up every rope")
	clear.pressed.connect(func() -> void:
		if _done:
			return
		_paths.clear()
		_changed())
	side.add_child(clear)
	_words()


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
		_info.text = "%d of %d ropes laid  ·  %d of %d planks covered" % [ropes, _pairs.size(), _covered(), _cols * _rows]


func _cell(p: Vector2) -> int:
	var c: int = int(p.x / CELL)
	var r: int = int(p.y / CELL)
	if c < 0 or c >= _cols or r < 0 or r >= _rows or p.x < 0 or p.y < 0:
		return -1
	return r * _cols + c


func _board_input(e: InputEvent) -> void:
	if _done:
		return
	if e is InputEventMouseButton and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var mb: InputEventMouseButton = e
		if mb.pressed:
			var i: int = _cell(mb.position)
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
			_canvas.queue_redraw()
		else:
			if _drawing >= 0:
				_drawing = -1
				_changed()
	elif e is InputEventMouseMotion and _drawing >= 0:
		_extend(_cell((e as InputEventMouseMotion).position))


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
	# Every rope laid over every plank: hand it in.
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
		_flash["all"] = _t
		Sound.perfect()
		Rumble.buzz([0, 30, 30, 60])
		room.banked(float(res.get("pointsWon", 0.0)))
		_words()


func _process(delta: float) -> void:
	_t += delta
	if _save_t > 0.0:
		_save_t -= delta
		if _save_t <= 0.0 and not _done:
			_save()
	_canvas.queue_redraw()


func _centre(i: int) -> Vector2:
	return Vector2(i % _cols, i / _cols) * CELL + Vector2(CELL, CELL) / 2.0


func _draw_board() -> void:
	# The deck: planks running across, a little grain.
	for r: int in _rows:
		var shade: float = 0.04 * float(r % 2)
		_canvas.draw_rect(Rect2(0, r * CELL, _canvas.size.x, CELL), Color("#8a6a48").darkened(0.1 + shade))
		_canvas.draw_line(Vector2(0, r * CELL), Vector2(_canvas.size.x, r * CELL), Color(0, 0, 0, 0.25), 1.5)
		for c: int in _cols:
			if (c + r) % 3 == 0:
				_canvas.draw_circle(Vector2(c * CELL + 10, r * CELL + CELL * 0.5), 1.5, Color(0, 0, 0, 0.2))
	# The ropes: a dark lay under a coloured strand, a twist drawn along it.
	for col: int in _paths:
		var p: Array = _paths[col]
		if p.size() < 2:
			continue
		var pts: PackedVector2Array = PackedVector2Array()
		for i: int in p:
			pts.append(_centre(i))
		var colr: Color = _palette[col % _palette.size()]
		var fl: float = 0.0
		if _flash.has(col):
			fl = clampf(1.0 - (_t - float(_flash[col])) / 0.5, 0.0, 1.0)
		if _flash.has("all"):
			fl = maxf(fl, 0.5 + 0.5 * sin((_t - float(_flash["all"])) * 4.0) if _t - float(_flash["all"]) < 1.5 else 0.0)
		_canvas.draw_polyline(pts, colr.darkened(0.55), 20.0, true)
		_canvas.draw_polyline(pts, colr.lerp(Color.WHITE, fl * 0.5), 14.0, true)
		# The twist: short diagonal strokes along the rope.
		for k: int in pts.size() - 1:
			var a: Vector2 = pts[k]
			var b: Vector2 = pts[k + 1]
			var d: Vector2 = (b - a).normalized()
			var nrm: Vector2 = Vector2(-d.y, d.x)
			for s: int in 4:
				var m: Vector2 = a.lerp(b, (float(s) + 0.5) / 4.0)
				_canvas.draw_line(m - nrm * 5.0 - d * 3.0, m + nrm * 5.0 + d * 3.0, Color(colr.darkened(0.3), 0.7), 2.0, true)
		for pt: Vector2 in pts:
			_canvas.draw_circle(pt, 7.0, colr.darkened(0.55))
			_canvas.draw_circle(pt, 5.0, colr.lerp(Color.WHITE, fl * 0.5))
	# The cleats: iron horns on a ring of the rope's colour.
	for pr: Dictionary in _pairs:
		var colr2: Color = _palette[int(pr["color"]) % _palette.size()]
		var done: bool = _complete(int(pr["color"]))
		for e: int in [int(pr["a"]), int(pr["b"])]:
			var c: Vector2 = _centre(e)
			var pulse: float = 0.0 if done else 0.5 + 0.5 * sin(_t * 3.0 + float(pr["color"]))
			_canvas.draw_circle(c, CELL * 0.38 + 2.0 * pulse, Color(colr2, 0.35))
			_canvas.draw_circle(c, CELL * 0.3, colr2)
			_canvas.draw_circle(c, CELL * 0.3, Color(0, 0, 0, 0.0))
			_canvas.draw_rect(Rect2(c - Vector2(CELL * 0.26, 3), Vector2(CELL * 0.52, 6)), Color("#3b3b40"))
			_canvas.draw_circle(c, 5.0, Color("#3b3b40"))
			if done:
				_canvas.draw_arc(c, CELL * 0.34, 0.0, TAU, 24, Color(1, 1, 1, 0.8), 2.0, true)
