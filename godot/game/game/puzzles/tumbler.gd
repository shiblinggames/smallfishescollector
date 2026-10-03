extends PuzzleBoard
## THE TUMBLER LOCK (port of expeditions/TumblerLockPuzzle; Rush Hour). Drag
## the iron bars along their grooves to clear a path so the gold bolt can run
## out the right edge of its row. One slide is one bar moved, any distance;
## busting the slide budget resets the stage. The stages play in order;
## solving the last solves the node.
##
## Grid notation per row: '.' empty, letters are bars (a straight run across
## or down), 'Z' is the bolt (across).

const CELL: float = 100.0
const EXIT: float = 46.0
const RED: Color = Color(0.94, 0.54, 0.54)

var _stages: Array = []
var _stage_i: int = 0
var _stage: Dictionary = {}
var _rows: int = 6
var _cols: int = 6
var _bars: Array = []
var _moves: int = 0
var _busy: bool = false
var _bolt_out: bool = false
var _bolt_out_at: float = -10.0
## The drag: which bar, where the press began, its free range, its offset.
var _drag: int = -1
var _drag_from: Vector2 = Vector2.ZERO
var _range: Vector2i = Vector2i.ZERO
var _off: float = 0.0
var _hover: int = -1
## Where each bar is drawn, in cells (eases toward where it is).
var _shown: Array = []


# ── The rules ─────────────────────────────────────────────────────────────────

## The bars of a stage, in order of first appearance: {id, axis ("h"/"v"),
## r, c (its top-left cell), len}.
static func parse(grid: Array) -> Dictionary:
	var cells: Dictionary = {}
	var cols: int = 0
	for r: int in grid.size():
		var row: String = str(grid[r])
		cols = maxi(cols, row.length())
		for c: int in row.length():
			var ch: String = row[c]
			if ch != ".":
				if not cells.has(ch):
					cells[ch] = []
				(cells[ch] as Array).append(Vector2i(r, c))
	var bars: Array = []
	for id: String in cells:
		var cs: Array = cells[id]
		cs.sort_custom(func(a: Vector2i, b: Vector2i) -> bool: return a.x < b.x or (a.x == b.x and a.y < b.y))
		var one_row: bool = true
		for v: Vector2i in cs:
			if v.x != (cs[0] as Vector2i).x:
				one_row = false
		bars.append({ "id": id, "axis": "h" if one_row else "v", "r": (cs[0] as Vector2i).x, "c": (cs[0] as Vector2i).y, "len": cs.size() })
	return { "bars": bars, "rows": grid.size(), "cols": cols }


static func cells_of(b: Dictionary) -> Array:
	var out: Array = []
	for i: int in int(b["len"]):
		out.append(Vector2i(int(b["r"]) + (i if b["axis"] == "v" else 0), int(b["c"]) + (i if b["axis"] == "h" else 0)))
	return out


static func occupancy(bars: Array, except_id: String) -> Dictionary:
	var occ: Dictionary = {}
	for b: Dictionary in bars:
		if b["id"] == except_id:
			continue
		for v: Vector2i in cells_of(b):
			occ[v] = true
	return occ


## How far bar `id` can slide along its axis with every other bar fixed:
## Vector2i(min (0 or less), max (0 or more)).
static func free_range(bars: Array, id: String, rows: int, cols: int) -> Vector2i:
	var bar: Dictionary = {}
	for b: Dictionary in bars:
		if b["id"] == id:
			bar = b
	var occ: Dictionary = occupancy(bars, id)
	var v: bool = bar["axis"] == "v"
	var br: int = int(bar["r"])
	var bc: int = int(bar["c"])
	var ln: int = int(bar["len"])
	var lo: int = 0
	var hi: int = 0
	var s: int = 1
	while true:
		var r: int = br - s if v else br
		var c: int = bc if v else bc - s
		if r < 0 or c < 0 or occ.has(Vector2i(r, c)):
			break
		lo = -s
		s += 1
	s = 1
	while true:
		var r2: int = br + ln - 1 + s if v else br
		var c2: int = bc if v else bc + ln - 1 + s
		if (r2 >= rows if v else c2 >= cols) or occ.has(Vector2i(r2, c2)):
			break
		hi = s
		s += 1
	return Vector2i(lo, hi)


## The bars with bar `id` slid `off` cells along its axis.
static func slide(bars: Array, id: String, off: int) -> Array:
	var out: Array = []
	for b: Dictionary in bars:
		var nb: Dictionary = b.duplicate()
		if b["id"] == id:
			if b["axis"] == "v":
				nb["r"] = int(b["r"]) + off
			else:
				nb["c"] = int(b["c"]) + off
		out.append(nb)
	return out


## The bolt (Z) has a clear run to the right edge of its row.
static func bolt_clear(bars: Array, cols: int) -> bool:
	var bolt: Dictionary = {}
	for b: Dictionary in bars:
		if b["id"] == "Z":
			bolt = b
	if bolt.is_empty():
		return false
	var occ: Dictionary = occupancy(bars, "Z")
	for x: int in range(int(bolt["c"]) + int(bolt["len"]), cols):
		if occ.has(Vector2i(int(bolt["r"]), x)):
			return false
	return true


# ── The board ─────────────────────────────────────────────────────────────────

func board_name() -> String:
	return "The Tumbler Lock"


func how_to() -> String:
	return "Drag the iron bars along their grooves until the gold bolt can run out the right side. Moving one bar any distance is one slide. Run out of slides and the tumbler resets."


func board_size() -> Vector2:
	return Vector2(_cols * CELL + EXIT, _rows * CELL)


func build() -> void:
	_stages = (puzzle.get("tumbler", {}) as Dictionary).get("stages", [])
	_load_stage(0)


func _load_stage(i: int) -> void:
	_stage_i = i
	_stage = _stages[mini(i, _stages.size() - 1)]
	var p: Dictionary = parse(_stage["grid"])
	_rows = int(p["rows"])
	_cols = int(p["cols"])
	_start()


func _start() -> void:
	_bars = parse(_stage["grid"])["bars"]
	_moves = 0
	_bolt_out = false
	_drag = -1
	_shown.clear()
	for b: Dictionary in _bars:
		_shown.append(Vector2(int(b["c"]), int(b["r"])))


func _budget() -> int:
	return int(Js.num(_stage["moveBudget"]))


func words() -> void:
	var left: int = _budget() - _moves
	count_l.text = "Tumbler %d of %d  ·  %d slide%s left" % [_stage_i + 1, _stages.size(), left, "" if left == 1 else "s"]
	count_l.add_theme_color_override("font_color", RED if left <= int(ceil(_budget() * 0.2)) and not won else Paper.NIGHT_INK)
	if won:
		note_l.text = "The bolt runs free."
		note_l.add_theme_color_override("font_color", Paper.BRASS)
	else:
		note_l.text = "Slide the bars clear of the bolt's row."


func on_reset() -> void:
	if _busy or _bolt_out:
		return
	_start()


func _bar_at(p: Vector2) -> int:
	var c: int = int(floor(p.x / CELL))
	var r: int = int(floor(p.y / CELL))
	for i: int in _bars.size():
		if cells_of(_bars[i]).has(Vector2i(r, c)):
			return i
	return -1


func board_input(e: InputEvent) -> void:
	if e is InputEventMouseMotion:
		var mm: InputEventMouseMotion = e
		if _drag >= 0:
			var b: Dictionary = _bars[_drag]
			var raw: float = (mm.position.x - _drag_from.x if b["axis"] == "h" else mm.position.y - _drag_from.y) / CELL
			_off = clampf(raw, float(_range.x), float(_range.y))
		else:
			_hover = _bar_at(mm.position) if not (_busy or _bolt_out or won) else -1
			canvas.mouse_default_cursor_shape = Control.CURSOR_DRAG if _hover >= 0 else Control.CURSOR_ARROW
		return
	if not (e is InputEventMouseButton) or (e as InputEventMouseButton).button_index != MOUSE_BUTTON_LEFT:
		return
	var mb: InputEventMouseButton = e
	if mb.pressed:
		if _busy or _bolt_out or won:
			return
		var i: int = _bar_at(mb.position)
		if i < 0:
			return
		_drag = i
		_drag_from = mb.position
		_range = free_range(_bars, str(_bars[i]["id"]), _rows, _cols)
		_off = 0.0
		Rumble.tap(6)
		return
	if _drag < 0:
		return
	var id: String = str(_bars[_drag]["id"])
	var b2: Dictionary = _bars[_drag]
	var snapped: int = int(floor(_off + 0.5))
	# Drawn where it was let go, then eased onto its cell.
	var was: Vector2 = Vector2(int(b2["c"]), int(b2["r"]))
	_shown[_drag] = was + (Vector2(_off, 0) if b2["axis"] == "h" else Vector2(0, _off))
	_drag = -1
	_off = 0.0
	if snapped == 0:
		return
	_bars = slide(_bars, id, snapped)
	_moves += 1
	Rumble.tap(12)
	Sound.plip()
	if bolt_clear(_bars, _cols):
		_bolt_out = true
		_bolt_out_at = t
		Rumble.buzz([0, 20, 30, 20])
		Sound.job_tick(8)
		get_tree().create_timer(0.62).timeout.connect(_stage_done)
	elif _moves >= _budget():
		_busy = true
		shake()
		get_tree().create_timer(0.42).timeout.connect(_after_bust)
	words()


func _after_bust() -> void:
	_busy = false
	_start()
	words()


func _stage_done() -> void:
	if _stage_i >= _stages.size() - 1:
		win()
		return
	_busy = true
	Sound.seal(true)
	flash("Tumbler thrown", 0.9)
	get_tree().create_timer(0.9).timeout.connect(_next_stage)


func _next_stage() -> void:
	_busy = false
	_load_stage(_stage_i + 1)
	words()


func tick(delta: float) -> void:
	var k: float = 1.0 - exp(-delta * 20.0)
	for i: int in _bars.size():
		var b: Dictionary = _bars[i]
		var goal: Vector2 = Vector2(int(b["c"]), int(b["r"]))
		if b["id"] == "Z" and _bolt_out:
			goal.x = float(_cols + 1)
		if i == _drag:
			_shown[i] = goal + (Vector2(_off, 0) if b["axis"] == "h" else Vector2(0, _off))
		else:
			_shown[i] = (_shown[i] as Vector2).lerp(goal, k if not (b["id"] == "Z" and _bolt_out) else 1.0 - exp(-delta * 7.0))


func draw_board() -> void:
	var w: float = _cols * CELL
	var h: float = _rows * CELL
	box(Rect2(0, 0, w, h), Color(0.09, 0.08, 0.05), 12.0, Color(0.77, 0.66, 0.42, 0.35), 1.0)
	for x: int in range(1, _cols):
		canvas.draw_line(Vector2(x * CELL, 4), Vector2(x * CELL, h - 4), Color(1, 1, 1, 0.035), 1.0)
	for y: int in range(1, _rows):
		canvas.draw_line(Vector2(4, y * CELL), Vector2(w - 4, y * CELL), Color(1, 1, 1, 0.035), 1.0)
	# The exit on the bolt's row: a lit notch in the frame and a channel out.
	var bolt_r: int = 0
	for b: Dictionary in _bars:
		if b["id"] == "Z":
			bolt_r = int(b["r"])
	var ey: float = bolt_r * CELL
	var open: float = clampf((t - _bolt_out_at) / 0.4, 0.0, 1.0) if _bolt_out else 0.0
	canvas.draw_rect(Rect2(w, ey + CELL * 0.18, EXIT, CELL * 0.64), Color(0.09, 0.08, 0.05, 0.85))
	glow(Vector2(w + 3, ey + CELL * 0.5), CELL * (0.45 + 0.3 * open), GOLD, 0.55 + 0.2 * sin(t * 3.0) + open)
	canvas.draw_rect(Rect2(w - 3, ey + CELL * 0.22, 6, CELL * 0.56), GOLD)
	# The bars: iron, riveted; the bolt in gold.
	for i: int in _bars.size():
		var b: Dictionary = _bars[i]
		var bolt: bool = b["id"] == "Z"
		var at: Vector2 = _shown[i]
		var sz: Vector2 = Vector2(int(b["len"]), 1) if b["axis"] == "h" else Vector2(1, int(b["len"]))
		var rect: Rect2 = Rect2(at * CELL, sz * CELL).grow(-6.0)
		var lift: float = 3.0 if i == _drag else 0.0
		rect.position.y -= lift
		var alpha: float = 1.0
		if bolt and _bolt_out:
			alpha = clampf(1.0 - (at.x - float(_cols) + 0.5) / 1.2, 0.0, 1.0)
		canvas.draw_rect(Rect2(rect.position + Vector2(0, 5 + lift), rect.size), Color(0, 0, 0, 0.4 * alpha))
		if bolt:
			glow(rect.get_center(), maxf(rect.size.x, rect.size.y) * 0.6, GOLD, 0.35 * alpha)
		var fill: Color = Color(0.89, 0.72, 0.32) if bolt else Color(0.3, 0.33, 0.38)
		if (i == _hover or i == _drag) and not bolt:
			fill = fill.lightened(0.12)
		box(rect, Color(fill, alpha), 10.0, Color(1.0, 0.91, 0.68, alpha) if bolt else Color(1, 1, 1, (0.4 if i == _drag or i == _hover else 0.16) * alpha), 2.0)
		canvas.draw_line(rect.position + Vector2(8, 4), Vector2(rect.end.x - 8, rect.position.y + 4), Color(1, 1, 1, 0.22 * alpha), 2.0)
		# Rivets, one per cell; a groove arrow on iron to show its axis.
		for k: int in int(b["len"]):
			var cc: Vector2 = (at + (Vector2(k, 0) if b["axis"] == "h" else Vector2(0, k)) + Vector2(0.5, 0.5)) * CELL
			cc.y -= lift
			canvas.draw_circle(cc, 5.0, Color(0.47, 0.34, 0.04, 0.75 * alpha) if bolt else Color(0, 0, 0, 0.4))
			canvas.draw_circle(cc + Vector2(-1, -1), 2.0, Color(1, 1, 1, 0.25 * alpha))
		if not bolt:
			var cen: Vector2 = rect.get_center()
			var ax: Vector2 = Vector2(1, 0) if b["axis"] == "h" else Vector2(0, 1)
			var reach: float = (rect.size.x if b["axis"] == "h" else rect.size.y) * 0.5 - 12.0
			for sgn: float in [-1.0, 1.0]:
				var tip: Vector2 = cen + ax * sgn * reach
				var nrm: Vector2 = Vector2(-ax.y, ax.x)
				canvas.draw_colored_polygon(PackedVector2Array([tip, tip - ax * sgn * 8.0 + nrm * 5.0, tip - ax * sgn * 8.0 - nrm * 5.0]), Color(1, 1, 1, 0.22 if i == _hover or i == _drag else 0.1))
