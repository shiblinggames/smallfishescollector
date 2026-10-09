class_name ChartMatch
extends HBoxContainer
## TREASURE MATCH (Godot port of charting/TreasureMatchGame): swap two
## neighbouring gems to line up three or more; they clear, everything above
## falls, new gems drop in, and cascades score more each level. A line of
## four leaves a Compass (a wild that completes any line it lands in); a line
## of five clears its whole colour. 25 swaps a run; the best run's score sets
## the week's tier (0 to 5 points); unlimited runs on the week's one board.
## The board runs here on the same seeded engine the rules replay
## (core/chart_room.gd): the swaps are sent, never the score.

const CELL: float = 64.0
const TOKENS: Array = ["clownfish", "blue-tang", "pufferfish", "lionfish", "seahorse", "dumbo-octopus"]
const TOKEN_COL: Array = [Color("#ff7e1c"), Color("#2aa4ff"), Color("#ffd028"), Color("#ff4631"), Color("#0fd886"), Color("#bb55ff")]

var room: ChartStudy
var _st: Dictionary = {}
var _cols: int = 7
var _rows: int = 7
var _types: int = 6
var _rng: Dice.Mulberry32
var _board: Array = []
var _moves: Array = []
var _score: float = 0.0
var _left: int = 25
var _busy: bool = false
var _over: bool = false
var _sel: int = -1
var _drag_from: int = -1
var _drag_at: Vector2
var _tex: Array = []
var _wild: Texture2D
var _canvas: Control
# Animation: per-cell offsets (pixels) and scales.
var _off: Array = []
var _scale: Array = []
var _sparks: Array = []
var _pops: Array = []
var _score_l: Label
var _moves_l: Label
var _best_l: Label
var _ladder: Control
var _end: Control


func _ready() -> void:
	add_theme_constant_override("separation", 18)
	for t: String in TOKENS:
		_tex.append(Skipper.tex("match/%s.png" % t))
	_wild = Skipper.tex("match/manta-ray.png")
	_st = RulesApi.run(room.session.store, room.session.uid, "getMatchState", [])
	_cols = int(_st["cols"])
	_rows = int(_st["rows"])
	_types = int(_st["types"])
	var wrap: VBoxContainer = room.sheet(self, 16)
	_canvas = Control.new()
	_canvas.custom_minimum_size = Vector2(CELL * _cols, CELL * _rows)
	_canvas.mouse_filter = Control.MOUSE_FILTER_STOP
	_canvas.draw.connect(_draw_board)
	_canvas.gui_input.connect(_input_board)
	_canvas.clip_contents = true
	wrap.add_child(_canvas)
	var side: VBoxContainer = room.sheet(self, 18)
	side.get_parent().size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Paper.text(side, "TREASURE MATCH", "eyebrow", Paper.RED)
	Paper.text(side, "Swap two neighbours to line up three or more. Four in a line leaves a Compass that completes any line it lands in; five clears that whole colour. 25 swaps a run, as many runs as you like; your best run this week sets your points.", "note", Paper.INK_SOFT, true)
	_score_l = Paper.text(side, "", "display", Paper.INK)
	_moves_l = Paper.text(side, "", "body_strong", Paper.INK_SOFT)
	_ladder = Control.new()
	_ladder.custom_minimum_size = Vector2(0, 54)
	_ladder.draw.connect(_draw_ladder)
	side.add_child(_ladder)
	_best_l = Paper.text(side, "", "small", Paper.INK_SOFT, true)
	var again: Button = Paper.button("Start a fresh run")
	again.pressed.connect(func() -> void:
		if not _busy:
			_new_run())
	side.add_child(again)
	_new_run()


func _new_run() -> void:
	_rng = Dice.Mulberry32.new(int(_st["seed"]))
	_board = ChartRoom.initial_board(_rng, _cols, _rows, _types)
	_moves = []
	_score = 0.0
	_left = int(_st["moves"])
	_over = false
	_sel = -1
	_off = []
	_scale = []
	for i: int in _board.size():
		_off.append(Vector2(0, -CELL * (_rows + 1 - i / _cols) * 0.0))
		_scale.append(1.0)
	if _end != null:
		Motion.leave(_end, true, false)
		_end = null
	# The board drops in, column by column.
	for i: int in _board.size():
		_off[i] = Vector2(0, -CELL * (_rows + 2))
	_fall_all(0.5, true)
	_words()


func _words() -> void:
	_score_l.text = Js.thousands(_score)
	_moves_l.text = "%d swap%s left" % [_left, "" if _left == 1 else "s"]
	var best: float = float(_st["bestScore"])
	_best_l.text = "Best this week: %s  ·  %d of 5 points banked" % [Js.thousands(best), int(_st["pointsAwarded"])]
	_ladder.queue_redraw()


func _draw_ladder() -> void:
	var tiers: Array = ChartRoom.c()["matchTiers"]
	var w: float = _ladder.size.x
	var top: float = float(tiers[tiers.size() - 1]["score"])
	var y: float = 18.0
	_ladder.draw_rect(Rect2(0, y - 4, w, 8), Color(Paper.INK, 0.1))
	var f: float = clampf(_score / top, 0.0, 1.0)
	_ladder.draw_rect(Rect2(0, y - 4, w * f, 8), Kit.ink(ChartStudy.TEAL))
	var bf: float = clampf(float(_st["bestScore"]) / top, 0.0, 1.0)
	_ladder.draw_line(Vector2(w * bf, y - 8), Vector2(w * bf, y + 8), Color(Paper.RED, 0.8), 2.0)
	var fnt: Font = Kit.font("karla", 700)
	for t: Dictionary in tiers:
		var x: float = w * float(t["score"]) / top
		var reached: bool = _score >= float(t["score"])
		_ladder.draw_circle(Vector2(x, y), 7.0, Kit.ink(ChartStudy.TEAL) if reached else Color(Paper.INK, 0.25))
		var s: String = "%d" % int(t["points"])
		var sw: float = fnt.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
		_ladder.draw_string(fnt, Vector2(x - sw / 2.0, y + 4), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(1, 1, 1) if reached else Paper.INK)
		var ss: String = Js.thousands(float(t["score"]))
		var ssw: float = fnt.get_string_size(ss, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x
		_ladder.draw_string(fnt, Vector2(clampf(x - ssw / 2.0, 0, w - ssw), y + 26), ss, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Paper.INK_SOFT)


# ── Input ─────────────────────────────────────────────────────────────────────

func _cell_at(p: Vector2) -> int:
	var c: int = int(p.x / CELL)
	var r: int = int(p.y / CELL)
	if c < 0 or c >= _cols or r < 0 or r >= _rows:
		return -1
	return r * _cols + c


func _input_board(e: InputEvent) -> void:
	if _busy or _over:
		return
	if e is InputEventMouseButton and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var mb: InputEventMouseButton = e
		var i: int = _cell_at(mb.position)
		if mb.pressed:
			_drag_from = i
			_drag_at = mb.position
			if i < 0:
				return
			if _sel >= 0 and _sel != i and ChartRoom.adjacent4(_sel, i, _cols):
				var a: int = _sel
				_sel = -1
				_try(a, i)
			else:
				_sel = i
				Sound.plip()
			_canvas.queue_redraw()
		else:
			_drag_from = -1
	elif e is InputEventMouseMotion and _drag_from >= 0:
		var d: Vector2 = (e as InputEventMouseMotion).position - _drag_at
		if d.length() > CELL * 0.45:
			var c: int = _drag_from % _cols
			var r: int = _drag_from / _cols
			if absf(d.x) > absf(d.y):
				c += 1 if d.x > 0 else -1
			else:
				r += 1 if d.y > 0 else -1
			var from: int = _drag_from
			_drag_from = -1
			if c >= 0 and c < _cols and r >= 0 and r < _rows:
				_sel = -1
				_try(from, r * _cols + c)


## A swap tried: one that makes no line slides back (no swap spent).
func _try(a: int, b: int) -> void:
	_busy = true
	var dir: Vector2 = Vector2(b % _cols - a % _cols, b / _cols - a / _cols) * CELL
	var ok: bool = not ChartRoom.find_matches(ChartRoom.swapped(_board, a, b), _cols, _rows).is_empty()
	await _tween_swap(a, b, dir, 0.14)
	if not ok:
		Sound.slack()
		await _tween_swap(a, b, dir, 0.14, true)
		_busy = false
		return
	var pre: Array = ChartRoom.swapped(_board, a, b)
	var res: Variant = ChartRoom.resolve_swap(_board, a, b, _cols, _rows, _types, _rng, float(ChartRoom.c()["match"]["wildDropChance"]))
	_board = pre
	_off[a] = Vector2.ZERO
	_off[b] = Vector2.ZERO
	_moves.append([float(a), float(b)])
	_left -= 1
	var lvl: int = 1
	for step: Dictionary in res["log"]:
		await _play_step(step, lvl)
		lvl += 1
	_score += float(res["gained"])
	_board = res["board"]
	_words()
	if _score >= float(_st["target"]) or _left <= 0:
		await _finish()
	elif not ChartRoom.has_valid_move(_board, _cols, _rows):
		room.toast("No swaps left on the board: a fresh deal")
		_board = ChartRoom.reshuffle(_rng, _cols, _rows, _types)
		for i: int in _board.size():
			_off[i] = Vector2(0, -CELL * (_rows + 2))
		await _fall_all(0.4, true)
	_busy = false


func _tween_swap(a: int, b: int, dir: Vector2, secs: float, back: bool = false) -> void:
	var tw: Tween = create_tween()
	tw.tween_method(func(u: float) -> void:
		var k: float = (1.0 - u) if back else u
		_off[a] = dir * k
		_off[b] = -dir * k
		_canvas.queue_redraw(), 0.0, 1.0, secs).set_trans(Tween.TRANS_SINE)
	await tw.finished
	if back:
		_off[a] = Vector2.ZERO
		_off[b] = Vector2.ZERO


## One cascade level: the cleared pop, the points rise, and everything falls.
func _play_step(step: Dictionary, lvl: int) -> void:
	var cleared: Array = step["cleared"]
	var spawns: Array = step["spawns"]
	var centre: Vector2 = Vector2.ZERO
	for i: int in cleared:
		centre += _pos(i) + Vector2(CELL, CELL) / 2.0
		var col: Color = TOKEN_COL[_board[i]] if _board[i] >= 0 and _board[i] < TOKEN_COL.size() else Color("#29e0d2")
		for k: int in 5:
			_sparks.append({ "p": _pos(i) + Vector2(CELL, CELL) / 2.0, "v": Vector2.from_angle(randf() * TAU) * (80.0 + randf() * 120.0), "t": 0.0, "c": col })
	centre /= maxf(1.0, float(cleared.size()))
	_pops.append({ "p": centre, "t": 0.0, "text": "+%d%s" % [int(step["gained"]), ("  x%d" % lvl) if lvl > 1 else ""] })
	Sound.job_tick(mini(lvl * 2, 12))
	if lvl >= 3:
		Rumble.tap(10)
	var tw: Tween = create_tween()
	tw.tween_method(func(u: float) -> void:
		for i: int in cleared:
			_scale[i] = 1.0 - u
		for s: int in spawns:
			_scale[s] = 1.0 + 0.3 * sin(u * PI)
		_canvas.queue_redraw(), 0.0, 1.0, 0.18)
	await tw.finished
	for s: int in spawns:
		_board[s] = ChartRoom.WILD
	# Where each cell of the next board falls from.
	var nb: Array = step["board"]
	for col: int in _cols:
		var survivors: Array = []
		for r: int in range(_rows - 1, -1, -1):
			var i: int = r * _cols + col
			if not cleared.has(i):
				survivors.append(r)
		for k: int in _rows:
			var to_r: int = _rows - 1 - k
			var from_r: int = survivors[k] if k < survivors.size() else -1 - (k - survivors.size())
			var idx: int = to_r * _cols + col
			_off[idx] = Vector2(0, (from_r - to_r) * CELL)
			_scale[idx] = 1.0
	_board = nb.duplicate()
	await _fall_all(0.22, false)


func _fall_all(secs: float, stagger: bool) -> void:
	var start: Array = _off.duplicate()
	var tw: Tween = create_tween()
	tw.tween_method(func(u: float) -> void:
		for i: int in _off.size():
			var d: float = (float(i % _cols) * 0.05) if stagger else 0.0
			var k: float = clampf((u * (1.0 + 0.35 * float(stagger)) - d), 0.0, 1.0)
			var e: float = _bounce(k)
			_off[i] = (start[i] as Vector2) * (1.0 - e)
		_canvas.queue_redraw(), 0.0, 1.0, secs)
	await tw.finished
	for i: int in _off.size():
		_off[i] = Vector2.ZERO
		_scale[i] = 1.0


static func _bounce(t: float) -> float:
	if t < 0.75:
		return 1.0 - pow(1.0 - t / 0.75, 2.0)
	var u: float = (t - 0.75) / 0.25
	return 1.0 - 0.06 * sin(u * PI)


func _finish() -> void:
	_over = true
	var r: Variant = await room.session.act("submitMatch", [_moves])
	room.session.persist()
	var res: Dictionary = r if r is Dictionary else {}
	if res.has("error"):
		room.toast(str(res["error"]))
		return
	_st = RulesApi.run(room.session.store, room.session.uid, "getMatchState", [])
	_words()
	room.banked(float(res.get("pointsWon", 0.0)))
	# The run's card over the board.
	_end = Control.new()
	_end.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_canvas.add_child(_end)
	# THE scrim (the kit's tinted base), over the board only.
	Kit.scrim(_end, Kit.SCRIM_SHEET, false)
	var v: VBoxContainer = VBoxContainer.new()
	v.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	v.offset_left = -170
	v.offset_right = 170
	v.offset_top = -80
	v.offset_bottom = 80
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	_end.add_child(v)
	var head: String = "Top of the ladder!" if res.get("maxed", false) else ("Run over" if _left <= 0 else "Done")
	var l1: Label = Kit.text(v, head, "title", Paper.NIGHT_INK)
	l1.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var l2: Label = Kit.text(v, "%s  ·  tier %d of 5" % [Js.thousands(_score), int(res.get("tier", 0))], "heading", ChartStudy.TEAL.lightened(0.2))
	l2.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var won: int = int(res.get("pointsWon", 0))
	var l3: Label = Kit.text(v, ("+%d charting point%s" % [won, "" if won == 1 else "s"]) if won > 0 else "No new points: beat your best tier to bank more.", "small", Paper.NIGHT_INK_SOFT, true)
	l3.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var again: Button = Kit.button("Play again", "primary", "small")
	again.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	again.pressed.connect(_new_run)
	v.add_child(again)
	_end.modulate.a = 0.0
	Motion.ease_fade(create_tween(), _end, "modulate:a", 1.0, Motion.PANEL_FADE + 0.07)
	if won > 0:
		Sound.perfect()


func _process(delta: float) -> void:
	var live: bool = false
	for s: Dictionary in _sparks:
		s["t"] = float(s["t"]) + delta
		s["p"] = (s["p"] as Vector2) + (s["v"] as Vector2) * delta
		s["v"] = (s["v"] as Vector2) * 0.9 + Vector2(0, 260.0 * delta)
	_sparks = _sparks.filter(func(s: Dictionary) -> bool: return float(s["t"]) < 0.6)
	for p: Dictionary in _pops:
		p["t"] = float(p["t"]) + delta
	_pops = _pops.filter(func(p: Dictionary) -> bool: return float(p["t"]) < 0.9)
	live = not _sparks.is_empty() or not _pops.is_empty() or _sel >= 0
	if live:
		_canvas.queue_redraw()


func _pos(i: int) -> Vector2:
	return Vector2(i % _cols, i / _cols) * CELL


func _draw_board() -> void:
	# The tray: a dark wood well with faint cells.
	_canvas.draw_rect(Rect2(Vector2.ZERO, _canvas.size), Color("#1a2a2c"))
	for i: int in _board.size():
		var odd: bool = (i % _cols + i / _cols) % 2 == 0
		_canvas.draw_rect(Rect2(_pos(i) + Vector2(1, 1), Vector2(CELL - 2, CELL - 2)), Color(1, 1, 1, 0.05 if odd else 0.02))
	for i: int in _board.size():
		var t: int = _board[i]
		var sc: float = _scale[i] if i < _scale.size() else 1.0
		if sc <= 0.01:
			continue
		var p: Vector2 = _pos(i) + (_off[i] if i < _off.size() else Vector2.ZERO)
		var tex: Texture2D = _wild if t == ChartRoom.WILD else (_tex[t] if t >= 0 and t < _tex.size() else null)
		if tex == null:
			continue
		var pad: float = 5.0 + (CELL - 10.0) * (1.0 - sc) / 2.0
		if t == ChartRoom.WILD:
			var g: float = 0.5 + 0.5 * sin(Time.get_ticks_msec() / 220.0)
			_canvas.draw_circle(p + Vector2(CELL, CELL) / 2.0, CELL * 0.48, Color(0.16, 0.88, 0.82, 0.18 + 0.12 * g))
		_canvas.draw_texture_rect(tex, Rect2(p + Vector2(pad, pad), Vector2(CELL - pad * 2.0, CELL - pad * 2.0)), false)
		if i == _sel:
			var pulse: float = 0.5 + 0.5 * sin(Time.get_ticks_msec() / 120.0)
			_canvas.draw_arc(p + Vector2(CELL, CELL) / 2.0, CELL * 0.47, 0.0, TAU, 32, Color(1, 0.95, 0.7, 0.6 + 0.4 * pulse), 3.0, true)
	for s: Dictionary in _sparks:
		var a: float = 1.0 - float(s["t"]) / 0.6
		_canvas.draw_circle(s["p"], 3.0 * a + 1.0, Color(s["c"], a))
	var fnt: Font = Kit.font("cinzel", 800)
	for p2: Dictionary in _pops:
		var u: float = float(p2["t"]) / 0.9
		var txt: String = p2["text"]
		var w: float = fnt.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x
		var at: Vector2 = (p2["p"] as Vector2) + Vector2(-w / 2.0, -40.0 * u)
		_canvas.draw_string_outline(fnt, at, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, 6, Color(0, 0, 0, 0.6 * (1.0 - u)))
		_canvas.draw_string(fnt, at, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color(1.0, 0.92, 0.6, 1.0 - u))
