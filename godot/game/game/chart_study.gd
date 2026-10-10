class_name ChartStudy
extends Room
## THE CHART ROOM (Godot port of app/(app)/tavern/chart-room and charting;
## Kong, 2026-10-03: "do it all"). Four puzzles a week, each with its own
## board for the week; every one banks charting points, and the points burn
## the fog off the World Chart, landmark by landmark; each landmark pays a
## skin voucher. Rules: core/chart_room.gd. On the fishing side's day paper.
##
##   the strip    your points, the next landmark and what it pays
##   the tabs     Treasure Match, the Minefield, Lay the Rigging, the
##                Quartermaster's Hold (each opens at a Fishing level), and
##                the World Chart

const TEAL: Color = Color("#6fc4b4")
const TABS: Array = [
	["match", "Treasure Match"], ["minefield", "The Minefield"], ["rigging", "Lay the Rigging"],
	["hold", "The Hold"], ["chart", "The World Chart"],
]

var tab: String = "match"
var _tabs: HBoxContainer
var _body: VBoxContainer
var _pts_l: Label
var _next_l: Label
var _bar: Kit.Bar
var _points: float = 0.0
var _pending: int = 0


func _init() -> void:
	title = "The Chart Room"
	eyebrow = "Puzzles of the week"
	accent = TEAL


func _backdrop() -> void:
	var bg: ColorRect = ColorRect.new()
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.color = Color("#0d1416")
	add_child(bg)
	var glow: TextureRect = TextureRect.new()
	glow.texture = Glow.radial(256, Color(0.45, 0.85, 0.8))
	glow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	glow.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	glow.modulate = Color(1, 1, 1, 0.07)
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(glow)


func _build() -> void:
	var strip: Pane = Kit.pane(col, { "radius": 10, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.3)], "shadow": [Color(0, 0, 0, 0.45), 16, Vector2(0, 5)], "pad": [22, 12, 22, 14], "paper": true })
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	strip.add_child(row)
	var left: VBoxContainer = VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_theme_constant_override("separation", 2)
	row.add_child(left)
	_pts_l = Paper.text(left, "", "heading", Paper.INK)
	# THE progress bar (Kit.bar), inked for the paper strip.
	_bar = Kit.bar(left, 0.0, Kit.ink(TEAL))
	_next_l = Paper.text(left, "", "note", Paper.INK_SOFT, true)
	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 8)
	col.add_child(_tabs)
	_body = VBoxContainer.new()
	_body.add_theme_constant_override("separation", 12)
	col.add_child(_body)
	refresh_strip()
	open(tab)


## The points, the next landmark and what it pays, and claims waiting.
func refresh_strip() -> void:
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
	_pts_l.text = "%d charting point%s" % [int(_points), "" if int(_points) == 1 else "s"]
	if nxt.is_empty():
		_next_l.text = "The whole sea is charted."
	else:
		var pay: String = str(Skins.kind_def(ChartRoom.voucher_for(int(nxt["id"]))).get("name", "a skin voucher"))
		_next_l.text = "%d more to uncover %s  ·  it pays a %s" % [int(float(nxt["threshold"]) - _points), nxt["name"], pay]
	if _pending > 0:
		_next_l.text += "   ·   %d landmark%s to claim on the World Chart" % [_pending, "" if _pending == 1 else "s"]
	var prev_at: float = 0.0
	for l: Dictionary in ChartRoom.landmarks():
		if not nxt.is_empty() and int(l["id"]) == int(nxt["id"]):
			break
		prev_at = float(l["threshold"])
	_bar.set_value(1.0 if nxt.is_empty() else clampf((_points - prev_at) / maxf(1.0, float(nxt["threshold"]) - prev_at), 0.0, 1.0))
	_paint_tabs()


func _paint_tabs() -> void:
	for c: Node in _tabs.get_children():
		_tabs.remove_child(c)
		c.queue_free()
	for t: Array in TABS:
		var lock: String = "" if t[0] == "chart" else ChartRoom.gate(session.store, session.uid, t[0])
		var label: String = t[1]
		if lock != "":
			label = "%s  ·  %s" % [t[1], lock]
		elif t[0] == "chart" and _pending > 0:
			label = "%s  ·  %d to claim" % [t[1], _pending]
		# Only the tab shown is "on"; landmarks waiting are a dot beside it.
		var b: Button = Paper.button(label, t[0] == tab)
		if t[0] == "chart" and _pending > 0 and tab != "chart":
			CrewHall.notice_dot(b)
		b.disabled = lock != ""
		b.pressed.connect(func() -> void: open(t[0]))
		_tabs.add_child(b)


func open(which: String) -> void:
	tab = which
	_paint_tabs()
	for c: Node in _body.get_children():
		c.queue_free()
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
	# The board fades in (it sits in a column, so it does not slide).
	Motion.panel_in(v, false)


## A puzzle banked points: the strip counts them in.
func banked(points: float) -> void:
	if points <= 0.0:
		return
	Sound.chest(false)
	toast("+%d charting point%s" % [int(points), "" if int(points) == 1 else "s"])
	refresh_strip()


## A paper panel in the room's style; returns its content column.
func sheet(parent: Node, pad: int = 18) -> VBoxContainer:
	var p: Pane = Kit.pane(parent, { "radius": 12, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.3)], "shadow": [Color(0, 0, 0, 0.45), 16, Vector2(0, 5)], "pad": [pad, pad - 4, pad, pad], "paper": true })
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	p.add_child(v)
	return v
