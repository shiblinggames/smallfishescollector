class_name ChartStudy
extends Room
## THE CHART ROOM (Godot port of app/(app)/tavern/chart-room and charting;
## Kong, 2026-10-03: "do it all"). Four puzzles a week, each with its own
## board for the week; every one banks charting points, and the points burn
## the fog off the World Chart, landmark by landmark; each landmark pays a
## skin voucher. Rules: core/chart_room.gd.
##
## THE CHART ROOM AS A PLACE (Kong, 2026-10-10: the Chart Room, Parlor and Den
## "were based on being a web app so ... animations and visuals and
## everything were all a bit lacking"; the Den and the Parlor went first and
## were approved, and this follows them). The room keeps the header every
## room has, with the four puzzles and the World Chart as its tabs (a closed
## one names its level). Under it the whole screen is the room: your charting
## points, the next landmark and a slim bar as words along the top (no boxed
## strip), then ONE flat CHART SHEET filling the rest: the day paper, rounded,
## a thin ink rim, a faint ink grid and two rhumb roses drawn in code (no
## texture, gradient or shadow; he wants it clean and rejected the faux wood).
## Each puzzle lies on the sheet large, its rules and score as ink words
## beside it (no boxed side panel), and every change of state moves (each
## board's header says how). Points banked fly off the board to the points
## line and count in.

const TEAL: Color = Color("#6fc4b4")
const TABS: Array = [
	["match", "Treasure Match"], ["minefield", "The Minefield"], ["rigging", "Lay the Rigging"],
	["hold", "The Hold"], ["chart", "The World Chart"],
]
## The height of the points line over the sheet.
const TOP_H: float = 60.0
## The sheet's inner margin.
const PAD: float = 32.0
## THE INKS ON THE CHART SHEET (the day paper's, named here so the boards
## cannot drift).
const SHEET_INK: Color = Paper.INK
const SHEET_INK_SOFT: Color = Paper.INK_SOFT
## The sheet's faint grid and rhumb lines.
const HAIR: Color = Color(0.18, 0.13, 0.09, 0.07)
## The words on the dark above the sheet.
const CREAM: Color = Kit.SEA_INK
const CREAM_SOFT: Color = Color(0.97, 0.94, 0.86, 0.68)
## Charted water on the sheet (the Minefield's unsounded tiles, the Rigging's
## cells): a flat sea wash, the colour charts give the sea.
const WASH: Color = Color(0.52, 0.66, 0.66)
const WASH_DEEP: Color = Color(0.36, 0.5, 0.52)

var tab: String = "match"
var _tabs: HBoxContainer
var _place: Control
var _top: HBoxContainer
var _pts_l: Label
var _next_l: Label
var _bar: Kit.Bar
var _claim_l: Label
var _charted_l: Label
var _sheet: ChartSheet
var _body: Control
var _view: Control = null
var _points: float = 0.0
var _shown_pts: float = -1.0
var _pending: int = 0


func _init() -> void:
	title = "The Chart Room"
	accent = TEAL


## Behind the sheet: the room's plain dark (no picture, no glow; Kong wants
## it clean).
func _backdrop() -> void:
	var bg: ColorRect = ColorRect.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.color = Color(0.05, 0.06, 0.06)
	add_child(bg)


## The puzzles and the World Chart are the header's tabs, beside the back pill.
func _badge() -> Control:
	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 2)
	_tabs.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return _tabs


func _build() -> void:
	var m: MarginContainer = col.get_parent() as MarginContainer
	if m != null:
		m.add_theme_constant_override("margin_bottom", 16)
	_place = Control.new()
	_place.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_place.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(_place)
	# Where the charting stands, along the top: the points, the next landmark
	# and its bar on the left; landmarks to claim and charted on the right.
	_top = HBoxContainer.new()
	_top.add_theme_constant_override("separation", 26)
	_top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_place.add_child(_top)
	var left: VBoxContainer = VBoxContainer.new()
	left.add_theme_constant_override("separation", 6)
	left.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_top.add_child(left)
	var line: HBoxContainer = HBoxContainer.new()
	line.add_theme_constant_override("separation", 14)
	left.add_child(line)
	_pts_l = says(line, "", "title", CREAM)
	_next_l = says(line, "", "small", CREAM_SOFT)
	_next_l.size_flags_vertical = Control.SIZE_SHRINK_END
	_bar = Kit.bar(left, 0.0, TEAL)
	_bar.custom_minimum_size = Vector2(420, 6)
	_bar.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	var gap: Control = Control.new()
	gap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top.add_child(gap)
	_claim_l = says(_top, "", "heading", Kit.SEA_GOLD)
	_claim_l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var ch: VBoxContainer = VBoxContainer.new()
	ch.add_theme_constant_override("separation", 0)
	ch.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_top.add_child(ch)
	says(ch, "Landmarks charted", "label", CREAM_SOFT).horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_charted_l = says(ch, "", "display_sm", CREAM)
	_charted_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_sheet = ChartSheet.new()
	_place.add_child(_sheet)
	_body = Control.new()
	_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_sheet.add_child(_body)
	_place.resized.connect(_layout)
	_fit()
	if not get_viewport().size_changed.is_connected(_fit):
		get_viewport().size_changed.connect(_fit)
	refresh_strip(false)
	open(tab)


## The place to the screen: the column as wide as the window allows, down to
## the foot (from the window, never a fixed 1600 x 900).
func _fit() -> void:
	if _place == null or not is_instance_valid(_place):
		return
	var vp: Vector2 = get_viewport_rect().size
	col.custom_minimum_size = Vector2(maxf(640.0, vp.x - 40.0), 0)
	var above: float = 0.0
	var sep: float = float(col.get_theme_constant("separation"))
	for c: Node in col.get_children():
		if c == _place:
			break
		if c is Control:
			above += (c as Control).get_combined_minimum_size().y + sep
	_place.custom_minimum_size = Vector2(0, maxf(560.0, vp.y - 22.0 - 16.0 - above))


func _layout() -> void:
	var w: float = _place.size.x
	var h: float = _place.size.y
	if w < 10.0 or h < 10.0:
		return
	_top.position = Vector2(4, 0)
	_top.size = Vector2(w - 8.0, TOP_H)
	var y0: float = TOP_H + 8.0
	_sheet.position = Vector2(0, y0)
	_sheet.size = Vector2(w, h - y0)
	_body.position = Vector2(PAD, PAD - 6.0)
	_body.size = _sheet.size - Vector2(PAD * 2.0, PAD * 2.0 - 12.0)


## Words on the dark (cream, or a tone), never catching the mouse.
static func says(parent: Node, t: String, role: String, c: Color = CREAM, wrap: bool = false) -> Label:
	var l: Label = Kit.text(parent, t, role, c, wrap)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


## THE BOARD'S CELL on the sheet: as large as the view's height allows (up
## to max_cell), leaving room beside it for its words (side_w, the gap, and
## any extra the board keeps at its right). The board and its words are then
## centred together, so a wide sheet has no gulf between them.
static func board_cell(view: Vector2, cols: int, rows: int, max_cell: float, side_w: float, extra_w: float = 0.0) -> float:
	var w: float = view.x - side_w - 40.0 - extra_w
	return maxf(20.0, floorf(minf(max_cell, minf(w / float(cols), view.y / float(rows)))))


## A RESULT WRITTEN ON THE SHEET (a strike, a tally, a claim): the board's
## message line takes the words and they rise in. The room's toast is only
## the fallback; results belong beside the board they happened on.
static func say(l: Label, t: String, c: Color = Paper.RED) -> void:
	if l == null or not is_instance_valid(l):
		return
	l.text = t
	l.add_theme_color_override("font_color", c)
	Motion.rise_word(l)


## Words on the sheet, in ink.
static func inked(parent: Node, t: String, role: String, c: Color = SHEET_INK, wrap: bool = false) -> Label:
	var l: Label = Kit.text(parent, t, role, c, wrap)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


## THE ONE THING TO DO on the sheet (Claim, Play again): a flat ink button
## with paper words. Not the wooden plank (Kong rejected the faux wood).
static func primary(label: String) -> Pane.PaneButton:
	var n: Dictionary = { "radius": Kit.R_SMALL, "fill": [SHEET_INK], "pad": [20, 8, 20, 9], "keep": true }
	var h: Dictionary = n.duplicate()
	h["fill"] = [SHEET_INK.lightened(0.14)]
	var b: Pane.PaneButton = Pane.PaneButton.new(n, h)
	b.text = label.to_upper()
	var r: Array = Kit.ROLES["button_small"]
	b.add_theme_font_override("font", Kit.tracked(r[0], r[1], r[2], r[3]))
	b.add_theme_font_size_override("font_size", r[2])
	for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(st, Kit.PAPER)
	b.add_theme_color_override("font_disabled_color", Color(Kit.PAPER, 0.45))
	b.custom_minimum_size = Vector2(0, 36)
	b.focus_mode = Control.FOCUS_ALL
	Kit.tap(b)
	return b


## The points, the next landmark and what it pays, and claims waiting.
## `animate`: the bar fills and the count rolls to the new figure.
func refresh_strip(animate: bool = true) -> void:
	var w: Dictionary = RulesApi.run(session.store, session.uid, "getWorldChartState", [])
	_points = float(w["points"])
	var claimed: Array = w["claimed"]
	_pending = 0
	var nxt: Dictionary = {}
	for l: Dictionary in ChartRoom.landmarks():
		if _points >= float(l["threshold"]) and not claimed.any(func(x: Variant) -> bool: return int(x) == int(l["id"])):
			_pending += 1
		if nxt.is_empty() and _points < float(l["threshold"]):
			nxt = l
	if not animate or _shown_pts < 0.0:
		_shown_pts = _points
		_pts_l.text = _pts_words(_points)
	elif _shown_pts != _points:
		var from: float = _shown_pts
		_shown_pts = _points
		Motion.count(_pts_l, from, _points, func(x: float) -> void:
			if is_instance_valid(_pts_l):
				_pts_l.text = _pts_words(round(x)))
		_pts_l.pivot_offset = Vector2(0, _pts_l.size.y / 2.0)
		var tw: Tween = _pts_l.create_tween()
		tw.tween_property(_pts_l, "scale", Vector2.ONE * 1.08, 0.08)
		tw.tween_property(_pts_l, "scale", Vector2.ONE, 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	if nxt.is_empty():
		_next_l.text = "The whole sea is charted."
	else:
		var pay: String = str(Skins.kind_def(ChartRoom.voucher_for(int(nxt["id"]))).get("name", "a skin voucher"))
		_next_l.text = "%d more to uncover %s%sit pays a %s" % [int(float(nxt["threshold"]) - _points), nxt["name"], Kit.SEP, pay]
	_claim_l.text = ("%d landmark%s to claim" % [_pending, "" if _pending == 1 else "s"]) if _pending > 0 else ""
	_charted_l.text = "%d of %d" % [claimed.size(), ChartRoom.landmarks().size()]
	var prev_at: float = 0.0
	for l: Dictionary in ChartRoom.landmarks():
		if not nxt.is_empty() and int(l["id"]) == int(nxt["id"]):
			break
		prev_at = float(l["threshold"])
	_bar.set_value(1.0 if nxt.is_empty() else clampf((_points - prev_at) / maxf(1.0, float(nxt["threshold"]) - prev_at), 0.0, 1.0), animate)
	_paint_tabs()


static func _pts_words(p: float) -> String:
	return "%s charting point%s" % [Js.thousands(p), "" if int(p) == 1 else "s"]


func _paint_tabs() -> void:
	for c: Node in _tabs.get_children():
		_tabs.remove_child(c)
		c.queue_free()
	for t: Array in TABS:
		var lock: String = "" if t[0] == "chart" else ChartRoom.gate(session.store, session.uid, t[0])
		var label: String = t[1]
		if lock != "":
			label = t[1] + Kit.SEP + lock
		# Only the tab shown is "on"; landmarks waiting are a dot beside it.
		var b: Pane.PaneButton = Paper.tab(label, t[0] == tab, false)
		if t[0] == "chart" and _pending > 0 and tab != "chart":
			CrewHall.notice_dot(b)
		# A puzzle still closed says when, and does not open.
		b.disabled = lock != ""
		var key: String = t[0]
		b.pressed.connect(func() -> void:
			## A board mid-move (a cascade, a sounding, a claim) keeps the
			## sheet: freeing it would strand its coroutine half done.
			if _view != null and is_instance_valid(_view) and _view.get("_busy") == true:
				return
			if key != tab:
				open(key))
		_tabs.add_child(b)


func open(which: String) -> void:
	tab = which
	_paint_tabs()
	if _view != null and is_instance_valid(_view):
		_body.remove_child(_view)
		_view.queue_free()
	var v: Control
	match which:
		"minefield":
			v = ChartMines.new()
		"rigging":
			v = ChartRigging.new()
		"hold":
			v = ChartHold.new()
		"chart":
			v = ChartWorld.new()
		_:
			v = ChartMatch.new()
	v.set("room", self)
	_body.add_child(v)
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_view = v
	# The new board is laid down on the sheet: it slides a little from the
	# right as it fades in (the sheet itself stays put).
	v.modulate.a = 0.0
	var tw: Tween = v.create_tween().set_parallel(true)
	Motion.ease_fade(tw, v, "modulate:a", 1.0, Motion.PANEL_IN)
	tw.tween_method(func(x: float) -> void:
		if is_instance_valid(v):
			v.offset_left = x
			v.offset_right = x, 26.0, 0.0, 0.3).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


## A puzzle banked points: "+N" lifts off the board where they were won (a
## point on screen; INF for the sheet's middle), flies to the points line and
## the line counts them in.
func banked(points: float, from: Vector2 = Vector2.INF) -> void:
	if points <= 0.0:
		return
	Sound.chest(false)
	if from == Vector2.INF:
		from = _sheet.get_global_rect().get_center()
	fly("+%d" % int(points), from, _pts_l.get_global_rect().position + Vector2(_pts_l.size.x * 0.3, _pts_l.size.y / 2.0), Kit.SEA_GOLD, func() -> void: refresh_strip(true))


## INK IN FLIGHT: a figure lifts off where it was won and flies in an arc to
## where it counts, shrinking as it goes; `landed` runs as it arrives.
## `art`: a picture flies instead of the words (a voucher).
func fly(t: String, from: Vector2, to: Vector2, c: Color = Kit.SEA_GOLD, landed: Callable = Callable(), art: Texture2D = null) -> void:
	var l: Control
	if art != null:
		var tr: TextureRect = TextureRect.new()
		tr.texture = art
		tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		tr.custom_minimum_size = Vector2(64, 64)
		tr.size = Vector2(64, 64)
		l = tr
	else:
		var lb: Label = says(null, t, "display_sm", c)
		Kit.style(lb, "display_sm", c)
		lb.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.5))
		lb.add_theme_constant_override("outline_size", 6)
		l = lb
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.top_level = true
	l.z_index = 60
	add_child(l)
	l.modulate.a = 0.0
	await get_tree().process_frame
	if not is_instance_valid(l):
		return
	if art == null:
		l.reset_size()
	l.pivot_offset = l.size / 2.0
	var a: Vector2 = from - l.size / 2.0
	var b: Vector2 = to - l.size / 2.0
	var tw: Tween = l.create_tween()
	tw.tween_method(func(u: float) -> void:
		l.modulate.a = 1.0
		l.position = a + Vector2(0, -22.0 * sin(u * PI / 2.0))
		l.scale = Vector2.ONE * (1.0 + 0.15 * u), 0.0, 1.0, 0.18).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	var lifted: Vector2 = a + Vector2(0, -22.0)
	tw.tween_method(func(u: float) -> void:
		var e: float = u * u * (3.0 - 2.0 * u)
		var p: Vector2 = lifted.lerp(b, e)
		p.y -= sin(u * PI) * 60.0
		l.position = p
		l.scale = Vector2.ONE * lerpf(1.15, 0.5, e)
		l.modulate.a = 1.0 - clampf((u - 0.8) / 0.2, 0.0, 1.0), 0.0, 1.0, 0.66)
	tw.tween_callback(func() -> void:
		if landed.is_valid():
			landed.call()
		l.queue_free())


## Where a flying voucher lands (the charted count).
func charted_point() -> Vector2:
	return _charted_l.get_global_rect().get_center()


# ── The chart sheet ────────────────────────────────────────────────────────────

## THE CHART SHEET: one flat sheet of the day paper, R_LARGE corners, a thin
## ink rim, a faint ink grid and two rhumb roses (lines fanning from a point,
## as old charts have) drawn in code at low alpha. No texture, no gradient,
## no shadow.
class ChartSheet:
	extends Control

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_PASS
		resized.connect(queue_redraw)

	func _draw() -> void:
		var sb: StyleBoxFlat = StyleBoxFlat.new()
		sb.bg_color = Kit.PAPER
		sb.set_corner_radius_all(Kit.R_LARGE)
		sb.border_color = Color(SHEET_INK, 0.55)
		sb.set_border_width_all(1)
		sb.anti_aliasing = true
		draw_style_box(sb, Rect2(Vector2.ZERO, size))
		# The grid: thin hairlines every 64px, inset from the rim.
		var step: float = 64.0
		var x: float = step
		while x < size.x - 8.0:
			draw_line(Vector2(x, 8), Vector2(x, size.y - 8), HAIR, 1.0)
			x += step
		var y: float = step
		while y < size.y - 8.0:
			draw_line(Vector2(8, y), Vector2(size.x - 8, y), HAIR, 1.0)
			y += step
		# Two rhumb roses: sixteen lines each, clipped to the sheet.
		for c: Vector2 in [Vector2(size.x * 0.22, size.y * 0.62), Vector2(size.x * 0.8, size.y * 0.3)]:
			for k: int in 16:
				var d: Vector2 = Vector2.from_angle(TAU * k / 16.0)
				var e: Vector2 = _clip(c, d)
				draw_line(c, e, Color(HAIR, HAIR.a * (0.9 if k % 4 == 0 else 0.55)), 1.0, true)

	## Where a line from c along d leaves the sheet (8px in from the rim).
	func _clip(c: Vector2, d: Vector2) -> Vector2:
		var t: float = 1e9
		if d.x > 0.001:
			t = minf(t, (size.x - 8.0 - c.x) / d.x)
		elif d.x < -0.001:
			t = minf(t, (8.0 - c.x) / d.x)
		if d.y > 0.001:
			t = minf(t, (size.y - 8.0 - c.y) / d.y)
		elif d.y < -0.001:
			t = minf(t, (8.0 - c.y) / d.y)
		return c + d * t


# ── Bits of ink and water (drawn in code) ─────────────────────────────────────

## A SMALL BURST of bits from a point, drawn by the board that owns it: call
## burst() to add, step() each frame, draw() from the board's draw. Local
## (they fly a cell or two), gravity pulls them down, they fade.
class Bits:
	extends RefCounted
	var bits: Array = []

	## n bits of colour c from p; speed the throw; up: thrown upward more
	## (a splash) than round (a pop).
	func burst(p: Vector2, c: Color, n: int, speed: float, up: bool = false, size_px: float = 3.5) -> void:
		for i: int in n:
			var v: Vector2 = Vector2.from_angle(randf() * TAU) * speed * randf_range(0.45, 1.0)
			if up:
				v = Vector2(randf_range(-0.45, 0.45) * speed, -randf_range(0.6, 1.15) * speed)
			bits.append({ "p": p, "v": v, "t": 0.0, "life": randf_range(0.4, 0.65), "c": c, "s": size_px * randf_range(0.7, 1.2) })

	func step(delta: float, gravity: float = 900.0) -> bool:
		for b: Dictionary in bits:
			b["t"] = float(b["t"]) + delta
			b["v"] = (b["v"] as Vector2) * pow(0.12, delta) + Vector2(0, gravity * delta)
			b["p"] = (b["p"] as Vector2) + (b["v"] as Vector2) * delta
		bits = bits.filter(func(b: Dictionary) -> bool: return float(b["t"]) < float(b["life"]))
		return not bits.is_empty()

	func draw(ci: CanvasItem) -> void:
		for b: Dictionary in bits:
			var a: float = 1.0 - float(b["t"]) / float(b["life"])
			ci.draw_circle(b["p"], float(b["s"]) * (0.4 + 0.6 * a), Color(b["c"], a))
