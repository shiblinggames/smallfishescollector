class_name ChartHold
extends HBoxContainer
## THE QUARTERMASTER'S HOLD (Godot port of chart-room/hold/QuartermastersHold):
## four sudoku a week, a hold of nine bays each; stow the cargo lots 1 to 9 so
## no deck (row), hull section (column) or bay holds two of one. Skiff,
## Galleon, Dreadnought, Man-o-War, all open. Press a cell and a number (or
## type it); Pencil writes small notes; a Tally marks the wrong cells but
## spends the clean bonus; a full hold is handed in. Each solve pays doubloons
## and banks its difficulty in points. Progress saves as you go. The
## solutions never leave the rules (core/chart_room.gd).

const CELL: float = 52.0

var room: ChartStudy
var _st: Dictionary = {}
var _d: String = "easy"
var _givens: String = ""
var _entries: Array = []
var _notes: Array = []
var _wrong: Dictionary = {}
var _wrong_t: float = -10.0
var _sel: int = -1
var _pencil: bool = false
var _t: float = 0.0
var _save_t: float = -1.0
var _solved: Dictionary = {}
var _canvas: Control
var _tabs: HBoxContainer
var _info: Label
var _pencil_b: Button
var _stamp_t: float = -10.0


func _ready() -> void:
	add_theme_constant_override("separation", 18)
	focus_mode = Control.FOCUS_ALL
	_st = RulesApi.run(room.session.store, room.session.uid, "getHoldState", [])
	var wrap: VBoxContainer = room.sheet(self, 16)
	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 6)
	wrap.add_child(_tabs)
	_canvas = Control.new()
	_canvas.custom_minimum_size = Vector2(CELL * 9, CELL * 9)
	_canvas.mouse_filter = Control.MOUSE_FILTER_STOP
	_canvas.draw.connect(_draw_board)
	_canvas.gui_input.connect(_board_input)
	wrap.add_child(_canvas)
	var side: VBoxContainer = room.sheet(self, 18)
	side.get_parent().size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Paper.text(side, "THE QUARTERMASTER'S HOLD", "eyebrow", Paper.RED)
	Paper.text(side, "Stow the lots 1 to 9 so no deck (row), hull section (column) or bay (3 by 3) carries two of the same. Press a cell, then a number, or type it. A Tally marks wrong cells but spends the clean bonus. Solve any or all four this week.", "note", Paper.INK_SOFT, true)
	_info = Paper.text(side, "", "body_strong", Paper.INK, true)
	var pad: GridContainer = GridContainer.new()
	pad.columns = 5
	pad.add_theme_constant_override("h_separation", 6)
	pad.add_theme_constant_override("v_separation", 6)
	side.add_child(pad)
	for n: int in range(1, 10):
		var b: Button = Paper.button(str(n))
		b.custom_minimum_size = Vector2(52, 44)
		b.pressed.connect(func() -> void: _put(n))
		pad.add_child(b)
	var er: Button = Paper.button("Clear")
	er.custom_minimum_size = Vector2(52, 44)
	er.pressed.connect(func() -> void: _put(0))
	pad.add_child(er)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	side.add_child(row)
	_pencil_b = Paper.button("Pencil: off")
	_pencil_b.pressed.connect(func() -> void:
		_pencil = not _pencil
		_pencil_b.text = "Pencil: %s" % ("ON" if _pencil else "off"))
	row.add_child(_pencil_b)
	var tally: Button = Paper.button("Tally (spends the clean bonus)")
	tally.pressed.connect(_tally)
	row.add_child(tally)
	_open(_first_open())


func _first_open() -> String:
	for p: Dictionary in _st["puzzles"]:
		if p.get("solved") == null:
			return p["difficulty"]
	return "easy"


func _puz(d: String) -> Dictionary:
	for p: Dictionary in _st["puzzles"]:
		if p["difficulty"] == d:
			return p
	return {}


func _open(d: String) -> void:
	_d = d
	var p: Dictionary = _puz(d)
	_givens = p["givens"]
	var prog: String = str(p["progress"]) if p.get("progress") != null else _givens
	_entries = []
	for i: int in 81:
		_entries.append(int(prog[i]) if prog[i] != "." else 0)
	_notes = []
	var nparts: PackedStringArray = str(p["notes"]).split(",") if p.get("notes") != null else PackedStringArray()
	for i: int in 81:
		_notes.append(nparts[i] if nparts.size() == 81 else "")
	_solved = Js.obj(p.get("solved"))
	if not _solved.is_empty():
		var sol: String = prog
		for i: int in 81:
			_entries[i] = int(sol[i]) if sol[i] != "." else 0
	_wrong.clear()
	_sel = -1
	for c: Node in _tabs.get_children():
		c.queue_free()
	for q: Dictionary in _st["puzzles"]:
		var meta: Dictionary = ChartRoom.c()["hold"][q["difficulty"]]
		var label: String = "%s%s" % [meta["label"], "  ✓" if q.get("solved") != null else ""]
		var b: Button = Paper.tab(label, q["difficulty"] == d, false)
		var dd: String = q["difficulty"]
		b.pressed.connect(func() -> void: _open(dd))
		_tabs.add_child(b)
	_words()
	_canvas.queue_redraw()
	grab_focus()


func _words() -> void:
	var meta: Dictionary = ChartRoom.c()["hold"][_d]
	var p: Dictionary = _puz(_d)
	if not _solved.is_empty():
		_info.text = "%s stowed this week: %s ⟡%s, %d point%s." % [meta["label"], Js.thousands(float(_solved["doubloons"])), " (clean)" if _solved["clean"] else "", int(meta["points"]), "" if int(meta["points"]) == 1 else "s"]
		return
	var clean_extra: float = float(Js.round(float(meta["payout"]) * float(ChartRoom.c()["hold"]["cleanFraction"])))
	var hints: int = int(Js.num(p.get("hintsUsed")))
	_info.text = "%s  ·  pays %s ⟡%s and %d point%s%s" % [meta["label"], Js.thousands(float(meta["payout"])), (" + %s ⟡ clean" % Js.thousands(clean_extra)) if hints == 0 else "", int(meta["points"]), "" if int(meta["points"]) == 1 else "s", ("  ·  %d tall%s used" % [hints, "y" if hints == 1 else "ies"]) if hints > 0 else ""]


func _board_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var pos: Vector2 = (e as InputEventMouseButton).position
		var c: int = int(pos.x / CELL)
		var r: int = int(pos.y / CELL)
		if c >= 0 and c < 9 and r >= 0 and r < 9:
			_sel = r * 9 + c
			Rumble.tap(6)
			_canvas.queue_redraw()
			grab_focus()


func _unhandled_key_input(e: InputEvent) -> void:
	if not is_visible_in_tree() or not (e is InputEventKey) or not (e as InputEventKey).pressed:
		return
	var k: InputEventKey = e
	var kc: int = k.keycode
	if kc >= KEY_1 and kc <= KEY_9:
		_put(kc - KEY_0)
	elif kc >= KEY_KP_1 and kc <= KEY_KP_9:
		_put(kc - KEY_KP_0)
	elif kc == KEY_BACKSPACE or kc == KEY_DELETE or kc == KEY_0:
		_put(0)
	elif kc == KEY_N or kc == KEY_P:
		_pencil_b.emit_signal("pressed")
	elif _sel >= 0 and kc in [KEY_LEFT, KEY_RIGHT, KEY_UP, KEY_DOWN]:
		var r: int = _sel / 9
		var c: int = _sel % 9
		match kc:
			KEY_LEFT: c = (c + 8) % 9
			KEY_RIGHT: c = (c + 1) % 9
			KEY_UP: r = (r + 8) % 9
			KEY_DOWN: r = (r + 1) % 9
		_sel = r * 9 + c
		_canvas.queue_redraw()
	else:
		return
	get_viewport().set_input_as_handled()


func _put(n: int) -> void:
	if _sel < 0 or not _solved.is_empty() or _givens[_sel] != ".":
		return
	if _pencil and n > 0:
		var s: String = _notes[_sel]
		_notes[_sel] = s.replace(str(n), "") if s.contains(str(n)) else _sort_digits(s + str(n))
		_entries[_sel] = 0
	else:
		_entries[_sel] = n
		if n > 0:
			_notes[_sel] = ""
			# A placed lot clears its number from the notes it now rules out.
			for j: int in 81:
				if j != _sel and (j / 9 == _sel / 9 or j % 9 == _sel % 9 or ChartRoom._box(j) == ChartRoom._box(_sel)):
					_notes[j] = (_notes[j] as String).replace(str(n), "")
		_wrong.erase(_sel)
	Sound.plip()
	_save_t = 0.8
	_canvas.queue_redraw()
	if n > 0 and not _entries.has(0):
		_submit()


static func _sort_digits(s: String) -> String:
	var a: Array = []
	for ch: String in s:
		a.append(ch)
	a.sort()
	return "".join(PackedStringArray(a))


func _board_str() -> String:
	var s: String = ""
	for v: int in _entries:
		s += str(v) if v > 0 else "."
	return s


func _tally() -> void:
	if not _solved.is_empty():
		return
	var r: Variant = await room.session.act("tallyHold", [_d, _board_str()])
	room.session.persist()
	if r is Dictionary and (r as Dictionary).has("wrong"):
		_mark(r["wrong"])
		_puz(_d)["hintsUsed"] = r["hintsUsed"]
		_words()
		room.toast("The quartermaster marks %d wrong" % _wrong.size() if not _wrong.is_empty() else "Nothing stowed wrong so far")


func _mark(w: Array) -> void:
	_wrong.clear()
	for i: int in w.size():
		if w[i]:
			_wrong[i] = true
	_wrong_t = _t
	if not _wrong.is_empty():
		Sound.slack()


func _submit() -> void:
	var r: Variant = await room.session.act("submitHold", [_d, _board_str()])
	room.session.persist()
	var res: Dictionary = r if r is Dictionary else {}
	if res.has("error"):
		room.toast(str(res["error"]))
		return
	if not res.get("correct", false):
		_mark(res.get("wrong", []))
		if res.has("hintsUsed"):
			_puz(_d)["hintsUsed"] = res["hintsUsed"]
		_words()
		room.toast("Not quite: the wrong lots are marked (that counts as a tally)")
		return
	_solved = { "doubloons": res["doubloonsWon"], "clean": res["clean"] }
	_puz(_d)["solved"] = _solved
	_stamp_t = _t
	Sound.perfect()
	Rumble.buzz([0, 30, 30, 60])
	room.toast("Stowed! +%s ⟡%s" % [Js.thousands(float(res["doubloonsWon"])), "  (clean)" if res["clean"] else ""])
	room.banked(float(res["pointsWon"]))
	_open(_d)


func _process(delta: float) -> void:
	_t += delta
	if _save_t > 0.0:
		_save_t -= delta
		if _save_t <= 0.0 and _solved.is_empty():
			room.session.act("saveHoldProgress", [_d, _board_str(), ",".join(PackedStringArray(_notes))])
			room.session.persist()
	_canvas.queue_redraw()


func _draw_board() -> void:
	var big: Font = Kit.font("cinzel", 800)
	var small: Font = Kit.font("karla", 700)
	_canvas.draw_rect(Rect2(Vector2.ZERO, _canvas.size), Color("#f2e6cc"))
	var sel_v: int = _entries[_sel] if _sel >= 0 else 0
	for i: int in 81:
		var p: Vector2 = Vector2(i % 9, i / 9) * CELL
		var r: Rect2 = Rect2(p, Vector2(CELL, CELL))
		# Bays alternate a little darker, like stacked crates.
		if (ChartRoom._box(i) % 2) == 1:
			_canvas.draw_rect(r, Color(0.55, 0.42, 0.25, 0.08))
		if _sel >= 0 and (i / 9 == _sel / 9 or i % 9 == _sel % 9 or ChartRoom._box(i) == ChartRoom._box(_sel)):
			_canvas.draw_rect(r, Color(0.43, 0.77, 0.71, 0.14))
		if sel_v > 0 and _entries[i] == sel_v:
			_canvas.draw_rect(r, Color(0.43, 0.77, 0.71, 0.28))
		if i == _sel:
			_canvas.draw_rect(r.grow(-2), Color(0.25, 0.6, 0.55, 0.9), false, 3.0)
		if _wrong.has(i):
			var k: float = clampf(1.0 - (_t - _wrong_t) / 3.0, 0.35, 1.0)
			_canvas.draw_rect(r.grow(-1), Color(0.85, 0.2, 0.15, 0.25 * k))
		var v: int = _entries[i]
		if v > 0:
			var given: bool = _givens[i] != "."
			var s: String = str(v)
			var w: float = big.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 26).x
			var col: Color = Paper.INK if given else (Color("#b03a2e") if _wrong.has(i) else Color("#1f6f66"))
			_canvas.draw_string(big, r.get_center() + Vector2(-w / 2.0, 9), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 26, col)
		elif (_notes[i] as String) != "":
			for ch: String in _notes[i]:
				var d: int = int(ch) - 1
				var np: Vector2 = p + Vector2(8 + (d % 3) * 16, 14 + (d / 3) * 16)
				_canvas.draw_string(small, np, ch, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(Paper.INK, 0.6))
	for k: int in 10:
		var wdt: float = 3.0 if k % 3 == 0 else 1.0
		var c: Color = Color(Paper.INK, 0.85 if k % 3 == 0 else 0.3)
		_canvas.draw_line(Vector2(k * CELL, 0), Vector2(k * CELL, 9 * CELL), c, wdt)
		_canvas.draw_line(Vector2(0, k * CELL), Vector2(9 * CELL, k * CELL), c, wdt)
	# Stowed: a STOWED stamp pressed across the hold.
	if not _solved.is_empty():
		var u: float = clampf((_t - _stamp_t) / 0.25, 0.0, 1.0)
		var sc: float = lerpf(1.6, 1.0, u)
		var txt: String = "STOWED"
		var w2: float = big.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, int(54 * sc)).x
		var c2: Vector2 = _canvas.size / 2.0
		_canvas.draw_set_transform(c2, -0.18, Vector2.ONE)
		_canvas.draw_rect(Rect2(Vector2(-w2 / 2.0 - 16, -44 * sc), Vector2(w2 + 32, 64 * sc)), Color(0.69, 0.23, 0.18, 0.85 * u), false, 4.0)
		_canvas.draw_string(big, Vector2(-w2 / 2.0, 0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, int(54 * sc), Color(0.69, 0.23, 0.18, 0.8 * u))
		_canvas.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
