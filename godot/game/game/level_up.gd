class_name LevelUp
extends Control
## THE FISHING LEVEL-UP (Godot port of LevelRewardsGrant / LevelUpCelebration,
## fishing pass 2).
##
## Shown when claimFishingLevelRewards covered a level (to > from), which it
## does on opening the sea and after a catch that crossed one: most levels pay
## nothing and every one of them is still a level. A white flash, three rings,
## the number counting up from the old level, what was paid, and the waters
## that opened. A press anywhere closes it.

signal closed

var claim: Dictionary = {}
var _t: float = 0.0
var _num: Label


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	Rumble.buzz(Rumble.LEVEL_UP)
	var from: int = int(claim["from"])
	var to: int = int(claim["to"])
	var col: VBoxContainer = VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	col.add_theme_constant_override("separation", 8)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(col)
	_text(col, "Level Up!", 20, Color.WHITE, true)
	_num = _text(col, str(from), 80, Color("#f0c040"), true)
	_num.pivot_offset = Vector2(size.x / 2.0, 50)
	_text(col, "FISHING", 12, Color(1, 1, 1, 0.6), true)
	if to - from > 1:
		_text(col, "%d levels earned" % (to - from), 15, Color(1, 1, 1, 0.7), false)
	var granted: Array = claim.get("granted", [])
	for g: Dictionary in granted:
		var label: String = reward_label(g["reward"])
		if label != "":
			_chip(col, ("Lv %d · %s" % [int(g["level"]), label]) if granted.size() > 1 else label)
	var opened: Array[String] = []
	var mins: Dictionary = Rules.data()["zones"]["minLevel"]
	for w: Dictionary in Chart.WATERS:
		var need: int = int(mins.get(w["id"], 1))
		if need > from and need <= to:
			opened.append(w["name"])
	if opened.size() > 0:
		_text(col, ("New water open: " if opened.size() == 1 else "New waters open: ") + ", ".join(opened), 16, Color("#7dd3fc"), true)
	if to - from > 1:
		_text(col, "These were waiting for you. Everything you earn is held until you are back at the chart.", 13, Color(1, 1, 1, 0.5), false)
	_text(col, "press to continue", 12, Color(1, 1, 1, 0.4), false)
	# The number counts up, a step at a time.
	var steps: int = maxi(1, to - from)
	var per: float = clampf(0.9 / steps, 0.13, 0.42)
	var tw: Tween = create_tween()
	tw.tween_interval(0.34)
	for n: int in range(from + 1, to + 1):
		tw.tween_callback(func() -> void:
			_num.text = str(n)
			_num.scale = Vector2(1.25, 1.25))
		tw.tween_property(_num, "scale", Vector2.ONE, per).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## rewardLabel: "360 ⟡, 15 ◆ and 5 Minnow".
static func reward_label(r: Dictionary) -> String:
	var parts: Array[String] = []
	if Js.num(r.get("doubloons")) > 0:
		parts.append("%s ⟡" % Js.thousands(float(r["doubloons"])))
	if Js.num(r.get("gems")) > 0:
		parts.append("%d ◆" % int(r["gems"]))
	for type: Variant in Js.obj(r.get("bait")):
		parts.append("%d %s" % [int((r["bait"] as Dictionary)[type]), Rules.bait(type)["name"]])
	if r.get("holdFloor") != null:
		var tiers: Array = Rules.data()["fishHoldTiers"]
		parts.append(String((tiers[clampi(int(r["holdFloor"]), 0, tiers.size() - 1)] as Dictionary)["name"]))
	if parts.size() <= 1:
		return parts[0] if parts.size() == 1 else ""
	return ", ".join(parts.slice(0, parts.size() - 1)) + " and " + parts[parts.size() - 1]


func _text(parent: Control, text: String, px: int, col: Color, title: bool) -> Label:
	var l: Label = Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", px)
	l.add_theme_color_override("font_color", col)
	if title:
		l.add_theme_font_override("font", UiTheme.title_font())
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(l)
	return l


func _chip(parent: Control, text: String) -> void:
	var center: CenterContainer = CenterContainer.new()
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(center)
	var p: PanelContainer = PanelContainer.new()
	var s: StyleBoxFlat = StyleBoxFlat.new()
	s.bg_color = Color(0.94, 0.75, 0.25, 0.12)
	s.border_color = Color(0.94, 0.75, 0.25, 0.5)
	s.set_border_width_all(1)
	s.set_corner_radius_all(18)
	s.content_margin_left = 16
	s.content_margin_right = 16
	s.content_margin_top = 6
	s.content_margin_bottom = 6
	p.add_theme_stylebox_override("panel", s)
	center.add_child(p)
	var l: Label = Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", 16)
	l.add_theme_color_override("font_color", Color("#f7d774"))
	p.add_child(l)


func _process(delta: float) -> void:
	_t += delta
	queue_redraw()


func _draw() -> void:
	var c: Vector2 = size / 2.0
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.03, 0.06, 0.12, 0.94))
	# The rays, turning slowly.
	var turn: float = _t / 22.0 * TAU
	for i: int in 12:
		var a: float = turn + i * TAU / 12.0
		draw_colored_polygon(PackedVector2Array([c, c + Vector2.from_angle(a - 0.1) * 520.0, c + Vector2.from_angle(a + 0.1) * 520.0]), Color(0.94, 0.75, 0.25, 0.05))
	# The white flash, then three rings.
	var f: float = clampf(_t / 0.5, 0.0, 1.0)
	if f < 1.0:
		draw_circle(c, 55.0 * lerpf(0.4, 2.2, f), Color(1, 1, 1, 0.6 * (1.0 - f)))
	for n: int in 3:
		var u: float = clampf((_t - 0.12 * n) / 1.1, 0.0, 1.0)
		if u > 0.0 and u < 1.0:
			var col: Color = Color(0.38, 0.65, 0.98, 0.75) if n != 1 else Color(0.94, 0.75, 0.25, 0.6)
			draw_arc(c, 55.0 * lerpf(1.0, [4.5, 3.9, 3.3][n], 1.0 - pow(1.0 - u, 3.0)), 0.0, TAU, 96, Color(col, col.a * (1.0 - u)), 2.0, true)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		_close()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_act") or event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		_close()


func _close() -> void:
	if _t < 0.6:
		return
	closed.emit()
	queue_free()
