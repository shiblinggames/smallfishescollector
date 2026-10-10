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
##
## ON THE CHART SHEET (THE CHART ROOM AS A PLACE, Kong 2026-10-10): the hold
## lies large on the sheet, its bays ruled in ink; the givens are printed
## straight on the paper, and your lots are CRATES (flat pale squares with an
## ink rim and the figure on them). The four holds, the rules, the pad, Pencil
## and Tally are ink words and paper buttons beside it. THE MOTION: a placed
## lot's crate SLIDES into its cell (in from the left, a touch past and back);
## a cleared one slides out and fades; a deck, hull section or bay filled with
## nine different lots gets a small red ink stamp round it that presses in and
## fades (local, never the whole board); wrong lots marked by a tally or a
## hand-in SHAKE where they sit; a stowed hold is stamped STOWED.

const MAX_CELL: float = 72.0
const SIDE_W: float = 400.0
## Your lots, inked (the crate's figure).
const YOURS: Color = Color("#1f6f66")
const STAMP_RED: Color = Color(0.69, 0.23, 0.18)

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
var _cell: float = 52.0
var _org: Vector2 = Vector2.ZERO
## When each crate slid in, and the crates sliding out: [i, n, t].
var _placed_t: Dictionary = {}
var _gone: Array = []
## Stamps round a filled deck, hull section or bay: [kind, index, t].
var _stamps: Array = []
## The board moves until this time (a crate sliding, a stamp, a shake).
var _anim_until: float = 0.0
var _sb: StyleBoxFlat = StyleBoxFlat.new()
var _msg: Label


func _ready() -> void:
	add_theme_constant_override("separation", 40)
	focus_mode = Control.FOCUS_ALL
	_st = RulesApi.run(room.session.store, room.session.uid, "getHoldState", [])
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
	var side: VBoxContainer = VBoxContainer.new()
	side.custom_minimum_size = Vector2(SIDE_W, 0)
	side.add_theme_constant_override("separation", 8)
	add_child(side)
	ChartStudy.inked(side, "THE QUARTERMASTER'S HOLD", "eyebrow", Paper.RED)
	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 0)
	side.add_child(_tabs)
	ChartStudy.inked(side, "Stow the lots 1 to 9 so no deck (row), hull section (column) or bay (3 by 3) carries two of the same. Press a cell, then a number, or type it. A Tally marks wrong cells but spends the clean bonus. Solve any or all four this week.", "note", ChartStudy.SHEET_INK_SOFT, true)
	Paper.rule(side, false)
	_info = ChartStudy.inked(side, "", "heading", ChartStudy.SHEET_INK, true)
	_msg = ChartStudy.inked(side, "", "body_strong", Paper.RED, true)
	var gap: Control = Control.new()
	gap.size_flags_vertical = Control.SIZE_EXPAND_FILL
	side.add_child(gap)
	var pad: GridContainer = GridContainer.new()
	pad.columns = 5
	pad.add_theme_constant_override("h_separation", 6)
	pad.add_theme_constant_override("v_separation", 6)
	side.add_child(pad)
	for n: int in range(1, 10):
		var b: Button = Paper.button(str(n), false, false)
		b.custom_minimum_size = Vector2(64, 46)
		b.pressed.connect(func() -> void: _put(n))
		pad.add_child(b)
	var er: Button = Paper.button("Clear", false, false)
	er.custom_minimum_size = Vector2(64, 46)
	er.pressed.connect(func() -> void: _put(0))
	pad.add_child(er)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	side.add_child(row)
	_pencil_b = Paper.button("Pencil: off", false, false)
	_pencil_b.pressed.connect(func() -> void:
		_pencil = not _pencil
		_pencil_b.text = ("Pencil: %s" % ("ON" if _pencil else "off")).to_upper())
	row.add_child(_pencil_b)
	var tally: Button = Paper.button("Tally (spends the clean bonus)", false, false)
	tally.pressed.connect(_tally)
	row.add_child(tally)
	## Leaving the room inside the save debounce would drop the last edit.
	tree_exiting.connect(_flush_save)
	_open(_first_open())


## The hold's size from the view: as large as fits, up to MAX_CELL.
func _size_canvas() -> void:
	_cell = ChartStudy.board_cell(size, 9, 9, MAX_CELL, SIDE_W)
	_canvas.custom_minimum_size = Vector2(9.0 * _cell, 0)


func _fit() -> void:
	_org = Vector2(floorf((_canvas.size.x - 9.0 * _cell) / 2.0), 0.0)
	_canvas.queue_redraw()


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
	## A pending save belongs to the board being left, so it goes now, before _d changes.
	_flush_save()
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
	_msg.text = ""
	_placed_t.clear()
	_gone.clear()
	_stamps.clear()
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
	_info.text = "%s%spays %s ⟡%s and %d point%s%s" % [meta["label"], Kit.SEP, Js.thousands(float(meta["payout"])), (" + %s ⟡ clean" % Js.thousands(clean_extra)) if hints == 0 else "", int(meta["points"]), "" if int(meta["points"]) == 1 else "s", (Kit.SEP + "%d tall%s used" % [hints, "y" if hints == 1 else "ies"]) if hints > 0 else ""]


func _board_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var pos: Vector2 = (e as InputEventMouseButton).position - _org
		var c: int = int(floorf(pos.x / _cell))
		var r: int = int(floorf(pos.y / _cell))
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
		if _entries[_sel] > 0:
			_gone.append([_sel, _entries[_sel], _t])
			_anim_until = _t + 0.4
		_entries[_sel] = 0
	else:
		var was: int = _entries[_sel]
		_entries[_sel] = n
		# The crate: the old one slides out as another (or none) takes its place.
		if was > 0 and was != n:
			_gone.append([_sel, was, _t])
		if n > 0 and was != n:
			_placed_t[_sel] = _t
			_stamp_groups(_sel)
		_anim_until = _t + 1.4
		if n > 0:
			_notes[_sel] = ""
			# A placed lot clears its number from the notes it now rules out.
			for j: int in 81:
				if j != _sel and (j / 9 == _sel / 9 or j % 9 == _sel % 9 or ChartRoom._box(j) == ChartRoom._box(_sel)):
					_notes[j] = (_notes[j] as String).replace(str(n), "")
		_wrong.erase(_sel)
	Sound.plip()
	_keep()
	_save_t = 0.8
	_canvas.queue_redraw()
	if n > 0 and not _entries.has(0):
		_submit()


## A deck (row), hull section (column) or bay just filled with nine
## different lots gets its stamp. Only what the player can see for
## themselves (full, no repeats); never whether it matches the solution.
func _stamp_groups(i: int) -> void:
	var any: bool = false
	for g: Array in [["row", i / 9], ["col", i % 9], ["box", ChartRoom._box(i)]]:
		var seen: Dictionary = {}
		var ok: bool = true
		for j: int in 81:
			if not _in_group(j, g[0], g[1]):
				continue
			var v: int = _entries[j]
			if v == 0 or seen.has(v):
				ok = false
				break
			seen[v] = true
		if ok:
			_stamps.append([g[0], g[1], _t])
			any = true
	if any:
		Sound.seal(false)


static func _in_group(j: int, kind: String, idx: int) -> bool:
	match kind:
		"row":
			return j / 9 == idx
		"col":
			return j % 9 == idx
	return ChartRoom._box(j) == idx


static func _sort_digits(s: String) -> String:
	var a: Array = []
	for ch: String in s:
		a.append(ch)
	a.sort()
	return "".join(PackedStringArray(a))


## Mirrors the board into the snapshot fetched at open, so a tab revisit (or the
## redraw after a solve) shows the work instead of the board as it was at open.
func _keep() -> void:
	var p: Dictionary = _puz(_d)
	p["progress"] = _board_str()
	p["notes"] = ",".join(PackedStringArray(_notes))


func _flush_save() -> void:
	if _save_t > 0.0 and _solved.is_empty():
		_save_t = -1.0
		_save()


func _save() -> void:
	room.session.act("saveHoldProgress", [_d, _board_str(), ",".join(PackedStringArray(_notes))])
	room.session.persist()


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
		ChartStudy.say(_msg, "The quartermaster marks %d wrong." % _wrong.size() if not _wrong.is_empty() else "Nothing stowed wrong so far.", Paper.RED if not _wrong.is_empty() else Paper.GREEN)


func _mark(w: Array) -> void:
	_wrong.clear()
	for i: int in w.size():
		if w[i]:
			_wrong[i] = true
	_wrong_t = _t
	_anim_until = _t + 3.1
	if not _wrong.is_empty():
		Sound.slack()


func _submit() -> void:
	var r: Variant = await room.session.act("submitHold", [_d, _board_str()])
	room.session.persist()
	var res: Dictionary = r if r is Dictionary else {}
	if res.has("error"):
		ChartStudy.say(_msg, str(res["error"]))
		return
	if not res.get("correct", false):
		_mark(res.get("wrong", []))
		if res.has("hintsUsed"):
			_puz(_d)["hintsUsed"] = res["hintsUsed"]
		_words()
		ChartStudy.say(_msg, "Not quite: the wrong lots are marked (that counts as a tally).")
		return
	_keep()
	_solved = { "doubloons": res["doubloonsWon"], "clean": res["clean"] }
	_puz(_d)["solved"] = _solved
	Sound.perfect()
	Rumble.buzz([0, 30, 30, 60])
	var stowed: String = "Stowed! +%s ⟡%s" % [Js.thousands(float(res["doubloonsWon"])), " (clean)" if res["clean"] else ""]
	room.banked(float(res["pointsWon"]), _canvas.get_global_rect().position + _org + Vector2(9, 9) * _cell / 2.0)
	_open(_d)
	ChartStudy.say(_msg, stowed, Paper.GREEN)
	# After the reopen (which clears the board's moments), the stamp lands.
	_stamp_t = _t
	_anim_until = _t + 0.4


func _process(delta: float) -> void:
	_t += delta
	if _save_t > 0.0:
		_save_t -= delta
		if _save_t <= 0.0 and _solved.is_empty():
			_save()
	## The board is still between edits; it only moves while a crate slides,
	## a stamp fades, a tally fades or the STOWED stamp lands.
	if _t < _anim_until or _t - _stamp_t < 0.3:
		_canvas.queue_redraw()


func _cell_rect(i: int) -> Rect2:
	return Rect2(_org + Vector2(i % 9, i / 9) * _cell, Vector2(_cell, _cell))


## A crate: a flat pale square, an ink rim, the lot's figure inked on it.
func _crate(r: Rect2, n: int, col: Color, a: float) -> void:
	var cr: Rect2 = r.grow(-_cell * 0.09)
	_sb.bg_color = Color(Kit.PAPER.lightened(0.42), a)
	_sb.set_corner_radius_all(int(_cell * 0.1))
	_sb.border_color = Color(ChartStudy.SHEET_INK, 0.45 * a)
	_sb.set_border_width_all(1)
	_sb.anti_aliasing = true
	_canvas.draw_style_box(_sb, cr)
	var big: Font = Kit.font("cinzel", 800)
	var px: int = int(_cell * 0.48)
	var s: String = str(n)
	var w: float = big.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
	_canvas.draw_string(big, cr.get_center() + Vector2(-w / 2.0, big.get_ascent(px) * 0.36), s, HORIZONTAL_ALIGNMENT_LEFT, -1, px, Color(col, a))


func _draw_board() -> void:
	var big: Font = Kit.font("cinzel", 800)
	var small: Font = Kit.font("karla", 700)
	var px: int = int(_cell * 0.5)
	var npx: int = maxi(10, int(_cell * 0.22))
	var sel_v: int = _entries[_sel] if _sel >= 0 else 0
	for i: int in 81:
		var r: Rect2 = _cell_rect(i)
		var p: Vector2 = r.position
		# Bays alternate a little darker.
		if (ChartRoom._box(i) % 2) == 1:
			_canvas.draw_rect(r, Color(ChartStudy.SHEET_INK, 0.045))
		if _sel >= 0 and (i / 9 == _sel / 9 or i % 9 == _sel % 9 or ChartRoom._box(i) == ChartRoom._box(_sel)):
			_canvas.draw_rect(r, Color(0.43, 0.77, 0.71, 0.14))
		if sel_v > 0 and _entries[i] == sel_v:
			_canvas.draw_rect(r, Color(0.43, 0.77, 0.71, 0.26))
		if _wrong.has(i):
			var k: float = clampf(1.0 - (_t - _wrong_t) / 3.0, 0.35, 1.0)
			_canvas.draw_rect(r.grow(-1), Color(0.85, 0.2, 0.15, 0.22 * k))
		var v: int = _entries[i]
		if v > 0:
			if _givens[i] != ".":
				# A given: printed straight on the paper.
				var s: String = str(v)
				var w: float = big.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
				_canvas.draw_string(big, r.get_center() + Vector2(-w / 2.0, big.get_ascent(px) * 0.36), s, HORIZONTAL_ALIGNMENT_LEFT, -1, px, ChartStudy.SHEET_INK)
			else:
				# Yours: a crate, sliding in from the left a touch past and back.
				var age: float = _t - float(_placed_t.get(i, -10.0))
				var off: float = 0.0
				var a: float = 1.0
				if age < 0.24:
					var u: float = age / 0.24
					var e: float = 1.0 + 2.7 * pow(u - 1.0, 3.0) + 1.7 * pow(u - 1.0, 2.0)
					off = -_cell * 0.7 * (1.0 - e)
					a = clampf(u * 2.5, 0.0, 1.0)
				# A wrong one shakes where it sits.
				if _wrong.has(i) and _t - _wrong_t < 0.45:
					off += sin((_t - _wrong_t) * 55.0) * _cell * 0.08 * (1.0 - (_t - _wrong_t) / 0.45)
				_crate(Rect2(r.position + Vector2(off, 0), r.size), v, Color("#b03a2e") if _wrong.has(i) else YOURS, a)
		elif (_notes[i] as String) != "":
			for ch: String in _notes[i]:
				var d: int = int(ch) - 1
				var np: Vector2 = p + Vector2(_cell * (0.2 + (d % 3) * 0.3) - npx * 0.25, _cell * (0.3 + (d / 3) * 0.3))
				_canvas.draw_string(small, np, ch, HORIZONTAL_ALIGNMENT_LEFT, -1, npx, Color(ChartStudy.SHEET_INK, 0.6))
	# Crates sliding out (cleared or replaced): off to the right, fading.
	_gone = _gone.filter(func(g: Array) -> bool: return _t - float(g[2]) < 0.2)
	for g: Array in _gone:
		var u2: float = (_t - float(g[2])) / 0.2
		var r2: Rect2 = _cell_rect(int(g[0]))
		_crate(Rect2(r2.position + Vector2(_cell * 0.5 * u2 * u2, 0), r2.size), int(g[1]), YOURS, 1.0 - u2)
	for k: int in 10:
		var wdt: float = 2.5 if k % 3 == 0 else 1.0
		var c: Color = Color(ChartStudy.SHEET_INK, 0.8 if k % 3 == 0 else 0.25)
		_canvas.draw_line(_org + Vector2(k * _cell, 0), _org + Vector2(k * _cell, 9 * _cell), c, wdt)
		_canvas.draw_line(_org + Vector2(0, k * _cell), _org + Vector2(9 * _cell, k * _cell), c, wdt)
	if _sel >= 0:
		_canvas.draw_rect(_cell_rect(_sel).grow(-2.0), Color(0.25, 0.6, 0.55, 0.95), false, 3.0)
	_draw_stamps()
	# Stowed: a STOWED stamp pressed across the hold.
	if not _solved.is_empty():
		var u3: float = clampf((_t - _stamp_t) / 0.25, 0.0, 1.0)
		var sc: float = lerpf(1.6, 1.0, u3)
		var txt: String = "STOWED"
		var spx: int = int(_cell * 1.05 * sc)
		var w2: float = big.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, spx).x
		var c2: Vector2 = _org + Vector2(9, 9) * _cell / 2.0
		_canvas.draw_set_transform(c2, -0.18, Vector2.ONE)
		_canvas.draw_rect(Rect2(Vector2(-w2 / 2.0 - 16, -spx * 0.82), Vector2(w2 + 32, spx * 1.18)), Color(STAMP_RED, 0.85 * u3), false, 4.0)
		_canvas.draw_string(big, Vector2(-w2 / 2.0, 0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, spx, Color(STAMP_RED, 0.8 * u3))
		_canvas.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## THE GROUP STAMPS: a red ink frame round a filled deck, hull section or
## bay, pressed in (a touch large, then down) with a small tick at its
## corner, held a moment and faded. Local to that group.
func _draw_stamps() -> void:
	_stamps = _stamps.filter(func(s: Array) -> bool: return _t - float(s[2]) < 1.3)
	for s: Array in _stamps:
		var age: float = _t - float(s[2])
		var r: Rect2
		match str(s[0]):
			"row":
				r = Rect2(_org + Vector2(0, int(s[1]) * _cell), Vector2(9 * _cell, _cell))
			"col":
				r = Rect2(_org + Vector2(int(s[1]) * _cell, 0), Vector2(_cell, 9 * _cell))
			_:
				r = Rect2(_org + Vector2((int(s[1]) % 3) * 3, (int(s[1]) / 3) * 3) * _cell, Vector2(3, 3) * _cell)
		var press: float = clampf(age / 0.14, 0.0, 1.0)
		var a: float = (0.25 + 0.75 * press) * (1.0 - clampf((age - 0.7) / 0.6, 0.0, 1.0))
		var rr: Rect2 = r.grow((1.0 - press) * 6.0 - 3.0)
		_canvas.draw_rect(r.grow(-3.0), Color(STAMP_RED, 0.08 * a))
		_canvas.draw_rect(rr, Color(STAMP_RED, 0.85 * a), false, 2.5)
		# The tick, inked at the frame's top right corner.
		var t0: Vector2 = Vector2(rr.end.x - _cell * 0.08, rr.position.y + _cell * 0.22)
		var tk: float = _cell * 0.13
		_canvas.draw_polyline(PackedVector2Array([t0 + Vector2(-tk * 1.6, 0), t0 + Vector2(-tk, tk * 0.6), t0 + Vector2(0, -tk * 0.6)]), Color(STAMP_RED, a), 2.5, true)


## For tests/shot.gd (CHART_PLAY): a lot into the first open cell (the lowest
## figure its deck, section and bay do not hold yet).
func play_for_shot(_how: String) -> void:
	for i: int in 81:
		if _givens[i] == "." and _entries[i] == 0:
			_sel = i
			for n: int in range(1, 10):
				var clash: bool = false
				for j: int in 81:
					if _entries[j] == n and (j / 9 == i / 9 or j % 9 == i % 9 or ChartRoom._box(j) == ChartRoom._box(i)):
						clash = true
						break
				if not clash:
					_put(n)
					return
