class_name ChartMines
extends HBoxContainer
## THE MINEFIELD (Godot port of charting/MinefieldGame): a harbour of drifting
## sea mines. Press a tile of water to sound it: a number says how many mines
## touch it, open water spreads. Right press (or Flag mode) marks a mine.
## Strike one and the harbour resets to its opening (flags kept); clear every
## safe tile to bank the week's points. The mines never leave the rules; the
## board learns of one only by striking it.

const CELL: float = 46.0
const NUM_COL: Array = [Color(0, 0, 0, 0), Color("#2f6fb0"), Color("#2e8a4a"), Color("#c0392b"), Color("#5b3a9e"), Color("#8a3b12"), Color("#1d7a7a"), Color("#333333"), Color("#777777")]

var room: ChartStudy
var _st: Dictionary = {}
var _cols: int = 9
var _rows: int = 12
var _adj: Dictionary = {}
var _flags: Dictionary = {}
var _flag_mode: bool = false
var _busy: bool = false
var _t: float = 0.0
var _born: Dictionary = {}
var _boom: Dictionary = {}
var _canvas: Control
var _info: Label
var _mode_b: Button


func _ready() -> void:
	add_theme_constant_override("separation", 18)
	_st = RulesApi.run(room.session.store, room.session.uid, "getMinefieldState", [])
	_cols = int(_st["cols"])
	_rows = int(_st["rows"])
	_take(_st["revealed"], false)
	for f: Variant in _st["flagged"]:
		_flags[int(f)] = true
	var wrap: VBoxContainer = room.sheet(self, 16)
	_canvas = Control.new()
	_canvas.custom_minimum_size = Vector2(CELL * _cols, CELL * _rows)
	_canvas.mouse_filter = Control.MOUSE_FILTER_STOP
	_canvas.draw.connect(_draw_board)
	_canvas.gui_input.connect(_board_input)
	wrap.add_child(_canvas)
	var side: VBoxContainer = room.sheet(self, 18)
	side.get_parent().size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Paper.text(side, "THE MINEFIELD", "eyebrow", Paper.RED)
	Paper.text(side, "Sound the harbour: press a tile of water. Its number is how many mines touch it; open water spreads on its own. Right press, or Flag mode, marks a mine. Strike one and the harbour resets (your flags stay). Clear every safe tile to bank %d points; as many tries as you like." % int(_st["reward"]), "note", Paper.INK_SOFT, true)
	_info = Paper.text(side, "", "body_strong", Paper.INK, true)
	_mode_b = Paper.button("Flag mode: off")
	_mode_b.pressed.connect(func() -> void:
		_flag_mode = not _flag_mode
		_mode_b.text = "Flag mode: %s" % ("ON" if _flag_mode else "off"))
	side.add_child(_mode_b)
	_words()


func _take(tiles: Array, fresh: bool) -> void:
	var was: Dictionary = _adj.duplicate()
	_adj.clear()
	for t: Dictionary in tiles:
		var i: int = int(t["i"])
		_adj[i] = int(t["adj"])
		if fresh and not was.has(i):
			_born[i] = _t + 0.012 * float(_born.size() % 40)


func _words() -> void:
	var safe: int = _cols * _rows - int(_st["mineCount"])
	if _st["status"] == "cleared":
		_info.text = "Harbour cleared this week. %d points banked." % int(_st["pointsAwarded"])
	else:
		_info.text = "%d of %d safe tiles sounded  ·  %d mines  ·  %d flagged  ·  %d strike%s" % [_adj.size(), safe, int(_st["mineCount"]), _flags.size(), int(_st["busts"]), "" if int(_st["busts"]) == 1 else "s"]


func _board_input(e: InputEvent) -> void:
	if _busy or _st["status"] == "cleared":
		return
	if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
		var mb: InputEventMouseButton = e
		var c: int = int(mb.position.x / CELL)
		var r: int = int(mb.position.y / CELL)
		if c < 0 or c >= _cols or r < 0 or r >= _rows:
			return
		var i: int = r * _cols + c
		if mb.button_index == MOUSE_BUTTON_RIGHT or (mb.button_index == MOUSE_BUTTON_LEFT and _flag_mode):
			_flag(i)
		elif mb.button_index == MOUSE_BUTTON_LEFT:
			_reveal(i)


func _flag(i: int) -> void:
	if _adj.has(i):
		return
	var r: Variant = await room.session.act("toggleFlag", [float(i)])
	room.session.persist()
	if r is Dictionary and (r as Dictionary).has("flagged"):
		_flags.clear()
		for f: Variant in r["flagged"]:
			_flags[int(f)] = true
		Sound.plip()
		_words()
		_canvas.queue_redraw()


func _reveal(i: int) -> void:
	if _adj.has(i) or _flags.has(i):
		return
	_busy = true
	var r: Variant = await room.session.act("revealCell", [float(i)])
	room.session.persist()
	_busy = false
	if not (r is Dictionary) or (r as Dictionary).has("error"):
		room.toast(str((r as Dictionary).get("error", "")) if r is Dictionary else "")
		return
	var res: Dictionary = r
	_st["busts"] = res["busts"]
	_st["status"] = res["status"]
	if res["busted"]:
		_boom = { "i": i, "t": _t }
		Sound.chest(true)
		Rumble.buzz([0, 60, 40, 90])
		room.toast("Boom! The harbour resets. Your flags stay.")
		await get_tree().create_timer(0.6).timeout
		_take(res["revealed"], false)
	else:
		_take(res["revealed"], true)
		Sound.plip()
	if res["cleared"]:
		_st["pointsAwarded"] = float(_st["pointsAwarded"]) + float(res["pointsWon"])
		Sound.perfect()
		room.banked(float(res["pointsWon"]))
	_words()


func _process(delta: float) -> void:
	_t += delta
	_canvas.queue_redraw()


func _draw_board() -> void:
	var fnt: Font = Kit.font("cinzel", 800)
	_canvas.draw_rect(Rect2(Vector2.ZERO, _canvas.size), Color("#163238"))
	for i: int in _cols * _rows:
		var p: Vector2 = Vector2(i % _cols, i / _cols) * CELL
		var r: Rect2 = Rect2(p + Vector2(1, 1), Vector2(CELL - 2, CELL - 2))
		if _adj.has(i):
			# Sounded: calm pale water, a little ripple as it opens.
			var age: float = _t - float(_born.get(i, -10.0))
			var k: float = clampf(age / 0.25, 0.0, 1.0)
			_canvas.draw_rect(r, Color("#cfe6e2").lerp(Color("#2b5d66"), 1.0 - k))
			if k < 1.0:
				_canvas.draw_arc(r.get_center(), CELL * 0.5 * k, 0.0, TAU, 20, Color(1, 1, 1, 0.5 * (1.0 - k)), 2.0, true)
			var n: int = int(_adj[i])
			if n > 0:
				var s: String = str(n)
				var w: float = fnt.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x
				_canvas.draw_string(fnt, r.get_center() + Vector2(-w / 2.0, 8), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color(NUM_COL[mini(n, 8)], k))
		else:
			# Unsounded: deep chop, a slow swell across it.
			var sw: float = 0.5 + 0.5 * sin(_t * 1.4 + float(i % _cols) * 0.6 + float(i / _cols) * 0.35)
			_canvas.draw_rect(r, Color("#2b5d66").lerp(Color("#33707a"), sw * 0.6))
			_canvas.draw_line(r.position + Vector2(8, CELL * 0.62), r.position + Vector2(CELL - 10, CELL * 0.62 - 3.0 * sw), Color(1, 1, 1, 0.12), 1.5, true)
			if _flags.has(i):
				# A little red pennant on a pole.
				var base: Vector2 = r.get_center() + Vector2(-4, 12)
				_canvas.draw_line(base, base + Vector2(0, -24), Color("#3a2a1c"), 2.0)
				var wv: float = sin(_t * 6.0 + float(i)) * 2.0
				_canvas.draw_colored_polygon(PackedVector2Array([base + Vector2(1, -24), base + Vector2(15, -19 + wv), base + Vector2(1, -13)]), Color("#d9483b"))
	# A strike: the mine shown where it was, and a ring of spray.
	if not _boom.is_empty():
		var age2: float = _t - float(_boom["t"])
		if age2 < 1.2:
			var c: Vector2 = Vector2(int(_boom["i"]) % _cols, int(_boom["i"]) / _cols) * CELL + Vector2(CELL, CELL) / 2.0
			var u: float = age2 / 1.2
			_canvas.draw_circle(c, CELL * 0.32, Color("#222222", 1.0 - u))
			for k: int in 8:
				var a: float = TAU * k / 8.0
				_canvas.draw_line(c + Vector2.from_angle(a) * CELL * 0.3, c + Vector2.from_angle(a) * CELL * 0.45, Color("#222222", 1.0 - u), 3.0)
			_canvas.draw_arc(c, CELL * (0.4 + 2.5 * u), 0.0, TAU, 40, Color(1.0, 0.75, 0.4, 0.9 * (1.0 - u)), 6.0 * (1.0 - u) + 1.0, true)
	if _st["status"] == "cleared":
		var g: float = 0.5 + 0.5 * sin(_t * 2.0)
		_canvas.draw_rect(Rect2(Vector2.ZERO, _canvas.size), Color(1.0, 0.85, 0.4, 0.06 + 0.04 * g))
