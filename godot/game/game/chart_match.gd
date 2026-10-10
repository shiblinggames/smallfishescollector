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
##
## ON THE CHART SHEET (THE CHART ROOM AS A PLACE, Kong 2026-10-10): the board
## lies large on the sheet, faint inked cells, the painted pieces kept; the
## rules, score, swaps and tier ladder are ink words beside it. THE MOTION:
## pieces DROP with weight (they fall faster as they go, by how far they
## fall, and land with a small squash and settle); a swap slides the two
## pieces (a swap that makes no line slides back); matched pieces swell and
## pop with a burst of bits in the piece's colour; the cascade falls in; a
## chain counter ("x2", "x3") grows beside the board while it runs; the score
## counts up and the swaps left tick down. The run's result is written in
## ink beside the board and the board pales under it.

const MAX_CELL: float = 84.0
const SIDE_W: float = 400.0
## Room at the board's right for the chain counter.
const CHAIN_W: float = 120.0
const TOKENS: Array = ["clownfish", "blue-tang", "pufferfish", "lionfish", "seahorse", "dumbo-octopus"]
const TOKEN_COL: Array = [Color("#ff7e1c"), Color("#2aa4ff"), Color("#ffd028"), Color("#ff4631"), Color("#0fd886"), Color("#bb55ff")]
const WILD_COL: Color = Color("#29b8ac")

var room: ChartStudy
var _st: Dictionary = {}
var _cols: int = 7
var _rows: int = 7
var _types: int = 6
var _rng: Dice.Mulberry32
var _board: Array = []
var _moves: Array = []
var _score: float = 0.0
var _shown_score: float = 0.0
var _left: int = 25
var _busy: bool = false
var _over: bool = false
var _sel: int = -1
var _drag_from: int = -1
var _drag_at: Vector2
var _tex: Array = []
var _wild: Texture2D
var _canvas: Control
var _t: float = 0.0
## The board's cell and where it starts on the canvas (it is centred).
var _cell: float = 64.0
var _org: Vector2 = Vector2.ZERO
# Animation: per-cell offsets (pixels), scales, and when each last landed.
var _off: Array = []
var _scale: Array = []
var _land: Array = []
var _bits: ChartStudy.Bits = ChartStudy.Bits.new()
var _rings: Array = []
var _pops: Array = []
## The chain counter beside the board: its level and when it last grew.
var _chain: int = 0
var _chain_t: float = -10.0
var _chain_end: float = -10.0
## The board pales under a finished run's result.
var _veil: float = 0.0
var _score_l: Label
var _moves_l: Label
var _best_l: Label
var _ladder: Control
var _result: VBoxContainer
var _again: Button
var _msg: Label


func _ready() -> void:
	add_theme_constant_override("separation", 40)
	for t: String in TOKENS:
		_tex.append(Skipper.tex("match/%s.png" % t))
	_wild = Skipper.tex("match/manta-ray.png")
	_st = RulesApi.run(room.session.store, room.session.uid, "getMatchState", [])
	_cols = int(_st["cols"])
	_rows = int(_st["rows"])
	_types = int(_st["types"])
	_canvas = Control.new()
	# The board and its words sit together in the middle of the sheet.
	alignment = BoxContainer.ALIGNMENT_CENTER
	resized.connect(_size_canvas)
	_canvas.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_canvas.mouse_filter = Control.MOUSE_FILTER_STOP
	_canvas.draw.connect(_draw_board)
	_canvas.gui_input.connect(_input_board)
	_canvas.resized.connect(_fit)
	add_child(_canvas)
	var side: VBoxContainer = VBoxContainer.new()
	side.custom_minimum_size = Vector2(SIDE_W, 0)
	side.add_theme_constant_override("separation", 8)
	add_child(side)
	ChartStudy.inked(side, "TREASURE MATCH", "eyebrow", Paper.RED)
	ChartStudy.inked(side, "Swap two neighbours to line up three or more. Four in a line leaves a Compass that completes any line it lands in; five clears that whole colour. 25 swaps a run, as many runs as you like; your best run this week sets your points.", "note", ChartStudy.SHEET_INK_SOFT, true)
	Paper.rule(side, false)
	ChartStudy.inked(side, "Score", "label", ChartStudy.SHEET_INK_SOFT)
	_score_l = ChartStudy.inked(side, "0", "display", ChartStudy.SHEET_INK)
	_moves_l = ChartStudy.inked(side, "", "heading", ChartStudy.SHEET_INK_SOFT)
	_ladder = Control.new()
	_ladder.custom_minimum_size = Vector2(0, 58)
	_ladder.draw.connect(_draw_ladder)
	side.add_child(_ladder)
	_best_l = ChartStudy.inked(side, "", "small", ChartStudy.SHEET_INK_SOFT, true)
	_msg = ChartStudy.inked(side, "", "body_strong", Paper.RED, true)
	# The run's result is written here when it ends.
	_result = VBoxContainer.new()
	_result.add_theme_constant_override("separation", 4)
	side.add_child(_result)
	var gap: Control = Control.new()
	gap.size_flags_vertical = Control.SIZE_EXPAND_FILL
	side.add_child(gap)
	_again = Paper.button("Start a fresh run", false, false)
	_again.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_again.pressed.connect(func() -> void:
		if not _busy:
			_new_run())
	side.add_child(_again)
	_new_run()


## The board's size from the view: as large as fits, up to MAX_CELL, with
## CHAIN_W kept at its right for the chain counter.
func _size_canvas() -> void:
	_cell = ChartStudy.board_cell(size, _cols, _rows, MAX_CELL, SIDE_W, CHAIN_W)
	_canvas.custom_minimum_size = Vector2(_cols * _cell + CHAIN_W, 0)


func _fit() -> void:
	_org = Vector2.ZERO
	_canvas.queue_redraw()


func _new_run() -> void:
	_rng = Dice.Mulberry32.new(int(_st["seed"]))
	_board = ChartRoom.initial_board(_rng, _cols, _rows, _types)
	_moves = []
	_score = 0.0
	_shown_score = 0.0
	_left = int(_st["moves"])
	_over = false
	_sel = -1
	_off = []
	_scale = []
	_land = []
	_chain = 0
	for c: Node in _result.get_children():
		_result.remove_child(c)
		c.queue_free()
	if _veil > 0.0:
		create_tween().tween_property(self, "_veil", 0.0, 0.3)
	# The board drops in, column by column, from above the sheet's top.
	for i: int in _board.size():
		_off.append(Vector2(0, -_cell * (_rows + 1)))
		_scale.append(1.0)
		_land.append(-10.0)
	_score_l.text = "0"
	_msg.text = ""
	_words()
	_busy = true
	await _fall_all(0.06)
	_busy = false


func _words() -> void:
	_moves_l.text = "%d swap%s left" % [_left, "" if _left == 1 else "s"]
	var best: float = float(_st["bestScore"])
	_best_l.text = "Best this week: %s%s%d of 5 points banked" % [Js.thousands(best), Kit.SEP, int(_st["pointsAwarded"])]
	_ladder.queue_redraw()


## The score counts up to where it stands now.
func _count_score() -> void:
	var from: float = _shown_score
	_shown_score = _score
	if from == _score:
		return
	Motion.count(_score_l, from, _score, func(x: float) -> void:
		if is_instance_valid(_score_l):
			_score_l.text = Js.thousands(round(x)), false, 0.45)
	_ladder.queue_redraw()


## The swaps left tick down: the words dip and come back.
func _tick_moves() -> void:
	_words()
	_moves_l.pivot_offset = Vector2(0, _moves_l.size.y / 2.0)
	var tw: Tween = _moves_l.create_tween()
	tw.tween_property(_moves_l, "scale", Vector2(1.0, 0.82), 0.06)
	tw.tween_property(_moves_l, "scale", Vector2.ONE, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _draw_ladder() -> void:
	var tiers: Array = ChartRoom.c()["matchTiers"]
	var w: float = _ladder.size.x - 8.0
	var top: float = float(tiers[tiers.size() - 1]["score"])
	var y: float = 18.0
	var teal: Color = Kit.ink(ChartStudy.TEAL)
	_ladder.draw_line(Vector2(4, y), Vector2(4 + w, y), Color(ChartStudy.SHEET_INK, 0.15), 4.0, true)
	var f: float = clampf(_shown_score / top, 0.0, 1.0)
	if f > 0.0:
		_ladder.draw_line(Vector2(4, y), Vector2(4 + w * f, y), teal, 4.0, true)
	var bf: float = clampf(float(_st["bestScore"]) / top, 0.0, 1.0)
	if bf > 0.0:
		_ladder.draw_line(Vector2(4 + w * bf, y - 9), Vector2(4 + w * bf, y + 9), Color(Paper.RED, 0.8), 2.0)
	var fnt: Font = Kit.font("karla", 700)
	for t: Dictionary in tiers:
		var x: float = 4 + w * float(t["score"]) / top
		var reached: bool = _shown_score >= float(t["score"])
		_ladder.draw_circle(Vector2(x, y), 8.0, teal if reached else Kit.PAPER)
		_ladder.draw_arc(Vector2(x, y), 8.0, 0.0, TAU, 24, teal if reached else Color(ChartStudy.SHEET_INK, 0.4), 1.0, true)
		var s: String = "%d" % int(t["points"])
		var sw: float = fnt.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
		_ladder.draw_string(fnt, Vector2(x - sw / 2.0, y + 4), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Kit.PAPER if reached else ChartStudy.SHEET_INK)
		var ss: String = Js.thousands(float(t["score"]))
		var ssw: float = fnt.get_string_size(ss, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
		_ladder.draw_string(fnt, Vector2(clampf(x - ssw / 2.0, 0, _ladder.size.x - ssw), y + 30), ss, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, ChartStudy.SHEET_INK_SOFT)


# ── Input ─────────────────────────────────────────────────────────────────────

func _cell_at(p: Vector2) -> int:
	var q: Vector2 = p - _org
	if q.x < 0.0 or q.y < 0.0:
		return -1
	var c: int = int(q.x / _cell)
	var r: int = int(q.y / _cell)
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
		if d.length() > _cell * 0.45:
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
	var dir: Vector2 = Vector2(b % _cols - a % _cols, b / _cols - a / _cols)
	var ok: bool = not ChartRoom.find_matches(ChartRoom.swapped(_board, a, b), _cols, _rows).is_empty()
	await _tween_swap(a, b, dir, 0.16)
	if not ok:
		Sound.slack()
		await _tween_swap(a, b, dir, 0.16, true)
		_busy = false
		return
	var pre: Array = ChartRoom.swapped(_board, a, b)
	var res: Variant = ChartRoom.resolve_swap(_board, a, b, _cols, _rows, _types, _rng, float(ChartRoom.c()["match"]["wildDropChance"]))
	_board = pre
	_off[a] = Vector2.ZERO
	_off[b] = Vector2.ZERO
	_moves.append([float(a), float(b)])
	_left -= 1
	_tick_moves()
	var base: float = _score
	var lvl: int = 1
	for step: Dictionary in res["log"]:
		await _play_step(step, lvl)
		lvl += 1
	_chain_end = _t
	_board = res["board"]
	# The steps counted the score in as they ran; this settles it on the total.
	_score = base + float(res["gained"])
	_count_score()
	_words()
	if _score >= float(_st["target"]) or _left <= 0:
		await _finish()
	elif not ChartRoom.has_valid_move(_board, _cols, _rows):
		ChartStudy.say(_msg, "No swaps left on the board: a fresh deal.")
		_board = ChartRoom.reshuffle(_rng, _cols, _rows, _types)
		for i: int in _board.size():
			_off[i] = Vector2(0, -_cell * (_rows + 1))
		await _fall_all(0.04)
	_busy = false


## The two pieces slide past each other; the one you moved rides a touch
## larger (it is in your hand).
func _tween_swap(a: int, b: int, dir: Vector2, secs: float, back: bool = false) -> void:
	var tw: Tween = create_tween()
	tw.tween_method(func(u: float) -> void:
		var k: float = (1.0 - u) if back else u
		_off[a] = dir * _cell * k
		_off[b] = -dir * _cell * k
		_scale[a] = 1.0 + 0.1 * sin(u * PI)
		_canvas.queue_redraw(), 0.0, 1.0, secs).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	await tw.finished
	_scale[a] = 1.0
	if back:
		_off[a] = Vector2.ZERO
		_off[b] = Vector2.ZERO
		_land[a] = _t
		_land[b] = _t


## One cascade level: the cleared swell and pop in bursts of their colour,
## the chain counter grows, the points rise, and everything falls.
func _play_step(step: Dictionary, lvl: int) -> void:
	var cleared: Array = step["cleared"]
	var spawns: Array = step["spawns"]
	var centre: Vector2 = Vector2.ZERO
	for i: int in cleared:
		centre += _mid(i)
	centre /= maxf(1.0, float(cleared.size()))
	_chain = lvl
	_chain_t = _t
	Sound.job_tick(mini(lvl * 2, 12))
	if lvl >= 3:
		Rumble.tap(10)
	# The swell, then the pop.
	var tw: Tween = create_tween()
	tw.tween_method(func(u: float) -> void:
		for i: int in cleared:
			_scale[i] = 1.0 + 0.16 * sin(u * PI * 0.5)
		_canvas.queue_redraw(), 0.0, 1.0, 0.09)
	await tw.finished
	for i: int in cleared:
		var col: Color = _colour(_board[i])
		_bits.burst(_mid(i), col, 7, _cell * 3.0, false, _cell * 0.06)
		_rings.append({ "p": _mid(i), "t": _t, "c": col })
	_pops.append({ "p": centre, "t": _t, "text": "+%s" % Js.thousands(float(step["gained"])) })
	_score += float(step["gained"])
	_count_score()
	var tw2: Tween = create_tween()
	tw2.tween_method(func(u: float) -> void:
		for i: int in cleared:
			_scale[i] = 1.16 * (1.0 - u)
		for s: int in spawns:
			_scale[s] = 1.0 + 0.3 * sin(u * PI)
		_canvas.queue_redraw(), 0.0, 1.0, 0.12)
	await tw2.finished
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
			_off[idx] = Vector2(0, (from_r - to_r) * _cell)
			_scale[idx] = 1.0
	_board = nb.duplicate()
	await _fall_all(0.0)


## Everything with an offset falls home WITH WEIGHT: each piece accelerates
## as it falls (a further fall takes longer, as a drop does), lands, and
## squashes and settles (_land, read by the draw). stagger: a delay per
## column, so a fresh board pours in left to right.
func _fall_all(stagger: float) -> void:
	var start: Array = _off.duplicate()
	var dur: Array = []
	var delay: Array = []
	var total: float = 0.0
	for i: int in _off.size():
		var cells: float = absf((start[i] as Vector2).y) / maxf(1.0, _cell)
		var d: float = 0.12 + 0.09 * sqrt(cells)
		dur.append(d)
		# Lower pieces first within a column, so a column lands bottom up.
		var dl: float = stagger * float(i % _cols) + (0.012 * float(_rows - 1 - i / _cols) if stagger > 0.0 else 0.0)
		delay.append(dl)
		total = maxf(total, d + dl)
	var landed: Array = []
	landed.resize(_off.size())
	landed.fill(false)
	var any_moving: bool = false
	for v: Vector2 in start:
		if v != Vector2.ZERO:
			any_moving = true
	if not any_moving:
		return
	var tw: Tween = create_tween()
	tw.tween_method(func(clock: float) -> void:
		for i: int in _off.size():
			if (start[i] as Vector2) == Vector2.ZERO:
				continue
			var k: float = clampf((clock - float(delay[i])) / float(dur[i]), 0.0, 1.0)
			# Accelerating: the distance left falls as 1 - k squared.
			_off[i] = (start[i] as Vector2) * (1.0 - k * k)
			if k >= 1.0 and not landed[i]:
				landed[i] = true
				_land[i] = _t
		_canvas.queue_redraw(), 0.0, total, total)
	await tw.finished
	var thud: bool = false
	for i: int in _off.size():
		if not landed[i] and (start[i] as Vector2) != Vector2.ZERO:
			_land[i] = _t
		_off[i] = Vector2.ZERO
		_scale[i] = 1.0
		thud = thud or (start[i] as Vector2) != Vector2.ZERO
	if thud and stagger > 0.0:
		Sound.clunk()


func _finish() -> void:
	_over = true
	var r: Variant = await room.session.act("submitMatch", [_moves])
	room.session.persist()
	var res: Dictionary = r if r is Dictionary else {}
	if res.has("error"):
		ChartStudy.say(_msg, str(res["error"]))
		return
	_st = RulesApi.run(room.session.store, room.session.uid, "getMatchState", [])
	_words()
	var won: int = int(res.get("pointsWon", 0))
	room.banked(float(won), _canvas.get_global_rect().position + _org + Vector2(_cols, _rows) * _cell / 2.0)
	# The board pales and the run's result is written beside it.
	create_tween().tween_property(self, "_veil", 1.0, 0.4)
	var head: String = "Top of the ladder!" if res.get("maxed", false) else ("Run over" if _left <= 0 else "Done")
	var l1: Label = ChartStudy.inked(_result, head, "title", Paper.RED)
	var l2: Label = ChartStudy.inked(_result, "%s%stier %d of 5" % [Js.thousands(_score), Kit.SEP, int(res.get("tier", 0))], "heading", ChartStudy.SHEET_INK)
	var l3: Label = ChartStudy.inked(_result, ("+%d charting point%s banked" % [won, "" if won == 1 else "s"]) if won > 0 else "No new points: beat your best tier to bank more.", "small", ChartStudy.SHEET_INK_SOFT, true)
	var again: Pane.PaneButton = ChartStudy.primary("Play again")
	again.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	again.pressed.connect(func() -> void:
		if not _busy:
			_new_run())
	_result.add_child(again)
	var d: float = 0.0
	for c: CanvasItem in [l1, l2, l3, again]:
		Motion.rise_word(c, d)
		d += 0.08
	if won > 0:
		Sound.perfect()


func _process(delta: float) -> void:
	_t += delta
	_bits.step(delta)
	_rings = _rings.filter(func(r: Dictionary) -> bool: return _t - float(r["t"]) < 0.4)
	_pops = _pops.filter(func(p: Dictionary) -> bool: return _t - float(p["t"]) < 0.9)
	_canvas.queue_redraw()


func _pos(i: int) -> Vector2:
	return _org + Vector2(i % _cols, i / _cols) * _cell


func _mid(i: int) -> Vector2:
	return _pos(i) + Vector2(_cell, _cell) / 2.0


func _colour(t: int) -> Color:
	return TOKEN_COL[t] if t >= 0 and t < TOKEN_COL.size() else WILD_COL


## A piece's squash after it lands: a quick damped wobble, flatter then
## taller, settling inside a third of a second.
func _squash(i: int) -> float:
	var age: float = _t - float(_land[i]) if i < _land.size() else 10.0
	if age < 0.0 or age > 0.32:
		return 0.0
	var u: float = age / 0.32
	return sin(u * PI * 2.0) * (1.0 - u) * 0.14


func _draw_board() -> void:
	var bw: Vector2 = Vector2(_cols, _rows) * _cell
	# The board on the sheet: faint inked cells and a thin rim.
	for i: int in _board.size():
		var odd: bool = (i % _cols + i / _cols) % 2 == 0
		_canvas.draw_rect(Rect2(_pos(i) + Vector2(1, 1), Vector2(_cell - 2, _cell - 2)), Color(ChartStudy.SHEET_INK, 0.06 if odd else 0.025))
	_canvas.draw_rect(Rect2(_org - Vector2(3, 3), bw + Vector2(6, 6)), Color(ChartStudy.SHEET_INK, 0.45), false, 1.0)
	# The pieces (drawn clipped to the board's column: a falling one comes in
	# from the board's top edge, not over the words above).
	for i: int in _board.size():
		var t: int = _board[i]
		var sc: float = _scale[i] if i < _scale.size() else 1.0
		if sc <= 0.01:
			continue
		var p: Vector2 = _pos(i) + (_off[i] if i < _off.size() else Vector2.ZERO)
		if p.y + _cell < _org.y:
			continue
		var tex: Texture2D = _wild if t == ChartRoom.WILD else (_tex[t] if t >= 0 and t < _tex.size() else null)
		if tex == null:
			continue
		var sq: float = _squash(i)
		var inner: float = (_cell - 10.0) * sc
		var sz: Vector2 = Vector2(inner * (1.0 + sq * 0.8), inner * (1.0 - sq))
		# Anchored at its foot, so the squash sits on the cell below.
		var foot: Vector2 = p + Vector2(_cell / 2.0, _cell - 5.0 - (_cell - 10.0 - inner) / 2.0)
		var r: Rect2 = Rect2(foot - Vector2(sz.x / 2.0, sz.y), sz)
		if t == ChartRoom.WILD:
			var g: float = 0.5 + 0.5 * sin(_t * 4.5)
			_canvas.draw_circle(r.get_center(), _cell * 0.48, Color(WILD_COL, 0.14 + 0.1 * g))
		if r.position.y < _org.y:
			# Coming in over the board's top edge: only the part inside shows.
			var cut: float = _org.y - r.position.y
			if cut >= r.size.y:
				continue
			var src: Rect2 = Rect2(0, tex.get_height() * cut / r.size.y, tex.get_width(), tex.get_height() * (1.0 - cut / r.size.y))
			_canvas.draw_texture_rect_region(tex, Rect2(r.position + Vector2(0, cut), Vector2(r.size.x, r.size.y - cut)), src)
		else:
			_canvas.draw_texture_rect(tex, r, false)
		if i == _sel:
			var pulse: float = 0.5 + 0.5 * sin(_t * 8.0)
			Paper.ring(_canvas, p + Vector2(_cell, _cell) / 2.0, Vector2(_cell, _cell) * 0.47, _t, Color(Paper.RED, 0.6 + 0.4 * pulse), 2.4)
	# The pops: a thin ring opening in the piece's colour, and the bits.
	for rg: Dictionary in _rings:
		var u: float = (_t - float(rg["t"])) / 0.4
		_canvas.draw_arc(rg["p"], _cell * (0.25 + 0.4 * u), 0.0, TAU, 28, Color(rg["c"], 0.8 * (1.0 - u)), 3.0 * (1.0 - u) + 1.0, true)
	_bits.draw(_canvas)
	var fnt: Font = Kit.font("cinzel", 800)
	for p2: Dictionary in _pops:
		var u2: float = (_t - float(p2["t"])) / 0.9
		var txt: String = p2["text"]
		var w: float = fnt.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 24).x
		var at: Vector2 = (p2["p"] as Vector2) + Vector2(-w / 2.0, -36.0 * u2)
		var a: float = 1.0 - clampf((u2 - 0.6) / 0.4, 0.0, 1.0)
		_canvas.draw_string_outline(fnt, at, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 24, 6, Color(Kit.PAPER, 0.9 * a))
		_canvas.draw_string(fnt, at, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 24, Color(Paper.MONEY, a))
	# The finished run: the board pales under its result.
	if _veil > 0.0:
		_canvas.draw_rect(Rect2(_org - Vector2(4, 4), bw + Vector2(8, 8)), Color(Kit.PAPER, 0.55 * _veil))
	_draw_chain(bw)


## THE CHAIN COUNTER beside the board's top right: "x2", "x3"... grows a
## size each level with a pop, and fades once the chain ends.
func _draw_chain(bw: Vector2) -> void:
	if _chain < 2:
		return
	var since_end: float = _t - _chain_end if _chain_end > _chain_t else 0.0
	var a: float = 1.0 - clampf((since_end - 0.5) / 0.4, 0.0, 1.0)
	if a <= 0.0:
		return
	var age: float = _t - _chain_t
	var pop: float = 1.0 + 0.35 * maxf(0.0, 1.0 - age / 0.18)
	var px: int = int((34.0 + 8.0 * float(mini(_chain, 6))) * pop)
	var fnt: Font = Kit.font("cinzel", 800)
	var s: String = "x%d" % _chain
	var sz: Vector2 = fnt.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, px)
	var room_right: float = _canvas.size.x - (_org.x + bw.x)
	var at: Vector2
	if room_right > sz.x + 30.0:
		at = Vector2(_org.x + bw.x + 22.0, _org.y + 40.0 + fnt.get_ascent(px) * 0.5)
	else:
		at = Vector2(_org.x + bw.x - sz.x - 10.0, _org.y + fnt.get_ascent(px) + 6.0)
	var lbl: String = "CHAIN"
	var lf: Font = Kit.font("karla", 700)
	_canvas.draw_string(lf, at + Vector2(2, -fnt.get_ascent(px) - 2.0), lbl, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(ChartStudy.SHEET_INK_SOFT, a))
	_canvas.draw_string_outline(fnt, at, s, HORIZONTAL_ALIGNMENT_LEFT, -1, px, 6, Color(Kit.PAPER, 0.9 * a))
	_canvas.draw_string(fnt, at, s, HORIZONTAL_ALIGNMENT_LEFT, -1, px, Color(Paper.RED, a))


## For tests/shot.gd (CHART_PLAY): the first swap on the board that makes a line.
func play_for_shot(_how: String) -> void:
	for a: int in _board.size():
		for b: int in [a + 1, a + _cols]:
			if b >= _board.size() or (b == a + 1 and a % _cols == _cols - 1):
				continue
			if not ChartRoom.find_matches(ChartRoom.swapped(_board, a, b), _cols, _rows).is_empty():
				_try(a, b)
				return
