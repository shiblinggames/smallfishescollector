class_name ChartMines
extends HBoxContainer
## THE MINEFIELD (Godot port of charting/MinefieldGame): a harbour of drifting
## sea mines. Press a tile of water to sound it: a number says how many mines
## touch it, open water spreads. Right press (or Flag mode) marks a mine.
## Strike one and the harbour resets to its opening (flags kept); clear every
## safe tile to bank the week's points. The mines never leave the rules; the
## board learns of one only by striking it.
##
## ON THE CHART SHEET (THE CHART ROOM AS A PLACE, Kong 2026-10-10): the
## harbour is unsounded water on the chart (flat sea-wash tiles); sounded
## water is the bare paper with its sounding written in ink, as a chart's
## depths are. THE MOTION, SOUNDING THE DEPTHS: a press drops a lead line (a
## short drawn plumb on its line) into the tile; where it lands a ripple
## opens, the water draws back to paper and the number writes itself in, left
## to right; open water spreads outward from there, tile by tile by distance.
## A mine: the lead finds it, a local splash of water bits jumps up, the
## tile darkens and the mine shows, the tile shudders; then the harbour's
## sounded water closes back over (the reset). A flag plants with a small pop.
## A cleared harbour sends a ring of ink across it.

const MAX_CELL: float = 64.0
const SIDE_W: float = 400.0
const NUM_COL: Array = [Color(0, 0, 0, 0), Color("#2f6fb0"), Color("#2e8a4a"), Color("#b5352a"), Color("#5b3a9e"), Color("#8a3b12"), Color("#1d7a7a"), Color("#333333"), Color("#777777")]
## The lead's fall into a tile.
const DROP: float = 0.2
## The spread's pace, a tile a step.
const SPREAD: float = 0.035

var room: ChartStudy
var _st: Dictionary = {}
var _cols: int = 9
var _rows: int = 12
var _adj: Dictionary = {}
var _flags: Dictionary = {}
## When each flag was planted (its pop).
var _flag_t: Dictionary = {}
var _flag_mode: bool = false
var _busy: bool = false
var _t: float = 0.0
## When each sounded tile opens (a spread opens later the further it is).
var _born: Dictionary = {}
## Tiles closing back to water (the reset after a strike): index -> time.
var _closing: Dictionary = {}
var _plumb: Dictionary = {}
var _boom: Dictionary = {}
var _wave_t: float = -10.0
var _wave_at: int = 0
var _bits: ChartStudy.Bits = ChartStudy.Bits.new()
var _canvas: Control
var _cell: float = 46.0
var _org: Vector2 = Vector2.ZERO
var _info: Label
var _mode_b: Button
var _msg: Label


func _ready() -> void:
	add_theme_constant_override("separation", 40)
	_st = RulesApi.run(room.session.store, room.session.uid, "getMinefieldState", [])
	_cols = int(_st["cols"])
	_rows = int(_st["rows"])
	_take(_st["revealed"], -1)
	for f: Variant in _st["flagged"]:
		_flags[int(f)] = true
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
	ChartStudy.inked(side, "THE MINEFIELD", "eyebrow", Paper.RED)
	ChartStudy.inked(side, "Sound the harbour: press a tile of water. Its number is how many mines touch it; open water spreads on its own. Right press, or Flag mode, marks a mine. Strike one and the harbour resets (your flags stay). Clear every safe tile to bank %d points; as many tries as you like." % int(_st["reward"]), "note", ChartStudy.SHEET_INK_SOFT, true)
	Paper.rule(side, false)
	_info = ChartStudy.inked(side, "", "heading", ChartStudy.SHEET_INK, true)
	_msg = ChartStudy.inked(side, "", "body_strong", Paper.RED, true)
	var gap: Control = Control.new()
	gap.size_flags_vertical = Control.SIZE_EXPAND_FILL
	side.add_child(gap)
	_mode_b = Paper.button("Flag mode: off", false, false)
	_mode_b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_mode_b.pressed.connect(func() -> void:
		_flag_mode = not _flag_mode
		_mode_b.text = ("Flag mode: %s" % ("ON" if _flag_mode else "off")).to_upper())
	side.add_child(_mode_b)
	_words()


## The harbour's size from the view: as large as fits, up to MAX_CELL.
func _size_canvas() -> void:
	_cell = ChartStudy.board_cell(size, _cols, _rows, MAX_CELL, SIDE_W)
	_canvas.custom_minimum_size = Vector2(_cols * _cell, 0)


func _fit() -> void:
	_org = Vector2(floorf((_canvas.size.x - _cols * _cell) / 2.0), 0.0)
	_canvas.queue_redraw()


## The sounded tiles from the rules. from: the tile the lead went into (the
## rest open outward from it, by distance); -1, all at once (as it stood).
## Tiles sounded before and not now close back to water.
func _take(tiles: Array, from: int) -> void:
	var was: Dictionary = _adj.duplicate()
	_adj.clear()
	for t: Dictionary in tiles:
		var i: int = int(t["i"])
		_adj[i] = int(t["adj"])
		if from >= 0 and not was.has(i):
			var d: float = Vector2(i % _cols - from % _cols, i / _cols - from / _cols).length()
			_born[i] = _t + DROP + SPREAD * d
		elif from < 0 and not was.has(i):
			_born[i] = -10.0
	for i: int in was:
		if not _adj.has(i):
			_closing[i] = _t + 0.012 * float(_closing.size() % 30)
			_born.erase(i)


func _words() -> void:
	var safe: int = _cols * _rows - int(_st["mineCount"])
	if _st["status"] == "cleared":
		_info.text = "Harbour cleared this week. %d points banked." % int(_st["pointsAwarded"])
	else:
		_info.text = "%d of %d safe tiles sounded%s%d mines%s%d flagged%s%d strike%s" % [_adj.size(), safe, Kit.SEP, int(_st["mineCount"]), Kit.SEP, _flags.size(), Kit.SEP, int(_st["busts"]), "" if int(_st["busts"]) == 1 else "s"]


func _board_input(e: InputEvent) -> void:
	if _busy or _st["status"] == "cleared":
		return
	if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
		var mb: InputEventMouseButton = e
		var q: Vector2 = mb.position - _org
		if q.x < 0.0 or q.y < 0.0:
			return
		var c: int = int(q.x / _cell)
		var r: int = int(q.y / _cell)
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
		if _flags.has(i):
			_flag_t[i] = _t
		Sound.plip()
		_words()
		_canvas.queue_redraw()


func _reveal(i: int) -> void:
	if _adj.has(i) or _flags.has(i):
		return
	_busy = true
	# The lead goes in as you press; the rules answer under it.
	_plumb = { "i": i, "t": _t }
	var r: Variant = await room.session.act("revealCell", [float(i)])
	room.session.persist()
	if not (r is Dictionary) or (r as Dictionary).has("error"):
		_busy = false
		_plumb = {}
		ChartStudy.say(_msg, str((r as Dictionary).get("error", "")) if r is Dictionary else "")
		return
	var res: Dictionary = r
	_st["busts"] = res["busts"]
	_st["status"] = res["status"]
	if res["busted"]:
		await get_tree().create_timer(DROP).timeout
		_boom = { "i": i, "t": _t }
		_bits.burst(_mid(i), Color(0.75, 0.88, 0.9), 14, _cell * 7.0, true, _cell * 0.07)
		_bits.burst(_mid(i), ChartStudy.WASH_DEEP, 8, _cell * 5.0, true, _cell * 0.06)
		Sound.splash()
		Sound.chest(true)
		Rumble.buzz([0, 60, 40, 90])
		ChartStudy.say(_msg, "Boom! A mine. The harbour resets; your flags stay.")
		await get_tree().create_timer(0.9).timeout
		_take(res["revealed"], -1)
	else:
		_msg.text = ""
		_take(res["revealed"], i)
		Sound.plip()
		get_tree().create_timer(DROP).timeout.connect(func() -> void:
			if is_inside_tree():
				Sound.splash())
	_busy = false
	if res["cleared"]:
		_st["pointsAwarded"] = float(_st["pointsAwarded"]) + float(res["pointsWon"])
		_wave_t = _t + 0.3
		_wave_at = i
		Sound.perfect()
		room.banked(float(res["pointsWon"]), _canvas.get_global_rect().position + _mid(i))
	_words()


func _process(delta: float) -> void:
	_t += delta
	_bits.step(delta, 1400.0)
	_canvas.queue_redraw()


func _pos(i: int) -> Vector2:
	return _org + Vector2(i % _cols, i / _cols) * _cell


func _mid(i: int) -> Vector2:
	return _pos(i) + Vector2(_cell, _cell) / 2.0


func _draw_board() -> void:
	var fnt: Font = Kit.font("cinzel", 800)
	var px: int = int(_cell * 0.46)
	var bw: Vector2 = Vector2(_cols, _rows) * _cell
	var boom_i: int = int(_boom.get("i", -1)) if not _boom.is_empty() and _t - float(_boom["t"]) < 1.1 else -1
	for i: int in _cols * _rows:
		var p: Vector2 = _pos(i)
		var r: Rect2 = Rect2(p + Vector2(2, 2), Vector2(_cell - 4, _cell - 4))
		# The faint inked cell every tile sits in.
		_canvas.draw_rect(Rect2(p + Vector2(0.5, 0.5), Vector2(_cell - 1, _cell - 1)), Color(ChartStudy.SHEET_INK, 0.12), false, 1.0)
		if i == boom_i:
			_draw_mine(i, r)
			continue
		var open_k: float = 0.0
		if _adj.has(i):
			open_k = clampf((_t - float(_born.get(i, -10.0))) / 0.22, 0.0, 1.0)
		elif _closing.has(i):
			# Closing back to water after a strike.
			open_k = 1.0 - clampf((_t - float(_closing[i])) / 0.3, 0.0, 1.0)
			if open_k <= 0.0:
				_closing.erase(i)
		if open_k < 1.0:
			# Unsounded water: a flat wash, a slow swell through its shade;
			# as it is sounded it draws back into its middle.
			var sw: float = 0.5 + 0.5 * sin(_t * 1.3 + float(i % _cols) * 0.55 + float(i / _cols) * 0.4)
			var wr: Rect2 = r.grow(-(r.size.x / 2.0) * open_k * open_k)
			var col: Color = ChartStudy.WASH.lerp(ChartStudy.WASH_DEEP, 0.15 + 0.2 * sw)
			_box(wr, col, 5.0 * (1.0 - open_k))
			if open_k == 0.0:
				_canvas.draw_line(r.position + Vector2(r.size.x * 0.2, r.size.y * 0.62), r.position + Vector2(r.size.x * 0.8, r.size.y * 0.62 - 3.0 * sw), Color(1, 1, 1, 0.16), 1.5, true)
		if _adj.has(i) and open_k > 0.0:
			# The ripple where the lead went in, and the sounding written in.
			var age: float = _t - float(_born.get(i, -10.0))
			if age < 0.45:
				var u: float = age / 0.45
				_canvas.draw_arc(r.get_center(), _cell * (0.15 + 0.5 * u), 0.0, TAU, 24, Color(ChartStudy.WASH_DEEP, 0.7 * (1.0 - u)), 2.0, true)
			var n: int = int(_adj[i])
			if n > 0:
				var s: String = str(n)
				var w: float = fnt.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
				var at: Vector2 = r.get_center() + Vector2(-w / 2.0, fnt.get_ascent(px) * 0.36)
				# Written in left to right (a clip that opens over the figure).
				var wk: float = clampf((age - 0.08) / 0.2, 0.0, 1.0)
				if wk > 0.0:
					var clip: Rect2 = Rect2(at + Vector2(0, -px), Vector2(w * wk, px * 1.4))
					_ink_clipped(fnt, at, s, px, Color(NUM_COL[mini(n, 8)], 1.0), clip)
		if _flags.has(i) and not _adj.has(i):
			_draw_flag(i, r)
	_canvas.draw_rect(Rect2(_org - Vector2(3, 3), bw + Vector2(6, 6)), Color(ChartStudy.SHEET_INK, 0.45), false, 1.0)
	_draw_plumb()
	_bits.draw(_canvas)
	# A cleared harbour: a ring of ink running out across it.
	if _t > _wave_t and _t - _wave_t < 1.2:
		var u2: float = (_t - _wave_t) / 1.2
		var c0: Vector2 = _mid(_wave_at)
		_canvas.draw_arc(c0, bw.length() * u2, 0.0, TAU, 96, Color(Paper.RED, 0.5 * (1.0 - u2)), 3.0, true)


## Ink clipped to a rectangle (a figure being written in): drawn letter by
## letter, each letter only once its left edge is inside the clip, faded in
## as the clip passes it.
func _ink_clipped(fnt: Font, at: Vector2, s: String, px: int, c: Color, clip: Rect2) -> void:
	var x: float = at.x
	for ch: String in s:
		var cw: float = fnt.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
		var k: float = clampf((clip.end.x - x) / maxf(1.0, cw), 0.0, 1.0)
		if k > 0.0:
			_canvas.draw_string(fnt, Vector2(x, at.y), ch, HORIZONTAL_ALIGNMENT_LEFT, -1, px, Color(c, c.a * k))
		x += cw


## THE LEAD LINE: a thin line from above the tile, the lead on its end
## dropping into the tile's middle; on landing it is drawn back up.
func _draw_plumb() -> void:
	if _plumb.is_empty():
		return
	var age: float = _t - float(_plumb["t"])
	var c: Vector2 = _mid(int(_plumb["i"]))
	var top: Vector2 = c - Vector2(0, _cell * 1.4)
	var k: float
	if age < DROP:
		var u: float = age / DROP
		k = u * u
	elif age < DROP + 0.3:
		k = 1.0 - (age - DROP) / 0.3 * 0.9
	else:
		_plumb = {}
		return
	var a: float = 1.0 if age < DROP + 0.15 else 1.0 - (age - DROP - 0.15) / 0.15
	var lead: Vector2 = top.lerp(c, k)
	_canvas.draw_line(top - Vector2(0, _cell * 0.3), lead, Color(ChartStudy.SHEET_INK, 0.6 * a), 1.5, true)
	# The lead: a small tapered weight.
	var w: float = _cell * 0.1
	_canvas.draw_colored_polygon(PackedVector2Array([lead + Vector2(-w * 0.5, -w * 1.6), lead + Vector2(w * 0.5, -w * 1.6), lead + Vector2(w, 0), lead + Vector2(0, w * 0.5), lead + Vector2(-w, 0)]), Color(0.25, 0.25, 0.27, a))


## A struck mine: the tile darkened, the mine on it, the tile shuddering.
func _draw_mine(i: int, r: Rect2) -> void:
	var age: float = _t - float(_boom["t"])
	var sh: float = sin(age * 60.0) * _cell * 0.06 * maxf(0.0, 1.0 - age / 0.35)
	var rr: Rect2 = Rect2(r.position + Vector2(sh, 0), r.size)
	var fade: float = 1.0 - clampf((age - 0.8) / 0.3, 0.0, 1.0)
	_box(rr, Color(0.16, 0.2, 0.22, 0.95 * fade), 5.0)
	var c: Vector2 = rr.get_center()
	var iron: Color = Color(0.06, 0.07, 0.08, fade)
	for k: int in 8:
		var d: Vector2 = Vector2.from_angle(TAU * k / 8.0)
		_canvas.draw_line(c + d * _cell * 0.18, c + d * _cell * 0.32, iron, 3.0, true)
	_canvas.draw_circle(c, _cell * 0.22, iron)
	if age < 0.4:
		var u: float = age / 0.4
		_canvas.draw_arc(c, _cell * (0.3 + 0.9 * u), 0.0, TAU, 32, Color(0.85, 0.94, 0.95, 0.9 * (1.0 - u)), 3.0 * (1.0 - u) + 1.0, true)


## A pennant on a pole, planted with a pop (it grows past its size and
## settles), waving a little.
func _draw_flag(i: int, r: Rect2) -> void:
	var age: float = _t - float(_flag_t.get(i, -10.0))
	var s: float = 1.0
	if age < 0.25:
		var u: float = age / 0.25
		s = lerpf(0.0, 1.25, u / 0.5) if u < 0.5 else lerpf(1.25, 1.0, (u - 0.5) / 0.5)
	var base: Vector2 = r.get_center() + Vector2(-_cell * 0.08, _cell * 0.26)
	var hgt: float = _cell * 0.52 * s
	_canvas.draw_line(base, base + Vector2(0, -hgt), ChartStudy.SHEET_INK, 2.0, true)
	var wv: float = sin(_t * 5.0 + float(i)) * _cell * 0.04
	var fw: float = _cell * 0.32 * s
	_canvas.draw_colored_polygon(PackedVector2Array([base + Vector2(1, -hgt), base + Vector2(fw, -hgt + _cell * 0.11 * s + wv), base + Vector2(1, -hgt + _cell * 0.22 * s)]), Paper.RED)
	_canvas.draw_line(base + Vector2(-_cell * 0.1, 0), base + Vector2(_cell * 0.1, 0), ChartStudy.SHEET_INK, 2.0, true)
	if age < 0.3:
		var u2: float = age / 0.3
		_canvas.draw_arc(base, _cell * (0.1 + 0.25 * u2), PI, TAU, 16, Color(Paper.RED, 0.6 * (1.0 - u2)), 1.5, true)


var _sb: StyleBoxFlat = StyleBoxFlat.new()


func _box(r: Rect2, fill: Color, radius: float) -> void:
	if r.size.x <= 0.5 or r.size.y <= 0.5:
		return
	_sb.bg_color = fill
	_sb.set_corner_radius_all(int(radius))
	_sb.anti_aliasing = true
	_canvas.draw_style_box(_sb, r)


## For tests/shot.gd (CHART_PLAY): "flag" plants a flag, anything else sounds
## the first unsounded tile from the middle of the harbour.
func play_for_shot(how: String) -> void:
	var mid: int = (_rows / 2) * _cols + _cols / 2
	for k: int in _cols * _rows:
		var i: int = (mid + k) % (_cols * _rows)
		if not _adj.has(i) and not _flags.has(i):
			if how == "flag":
				_flag(i)
			else:
				_reveal(i)
			return
