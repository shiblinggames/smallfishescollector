class_name CrewWatersView
extends Control
## FISHING TOGETHER, ON THIS GAME'S SCREEN (game/crew_fishing.gd runs it on
## the founder's): a crewmate's catch popping over their ship, words on the
## water; the crew's callouts in a line under the top of the screen; the crew
## streak as motes rising round every hull in it, with its count; and a derby's
## standings and clock at the right. Flat words, no boxes, no icons.

var sea: Sea
var fishing: CrewFishing
var my_key: String = ""

var _pops: Array = []
var _calls: Array = []
var _call_l: Label
var _call_t: float = 0.0
var _streak_l: Label
var _derby_box: VBoxContainer
var _derby_title: Label
var _derby_rows: Label
var _t: float = 0.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_call_l = _label(22, BattleLook.CREAM)
	_call_l.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	_call_l.offset_left = -520
	_call_l.offset_right = 520
	_call_l.offset_top = 362
	_call_l.offset_bottom = 396
	_call_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_call_l.modulate.a = 0.0
	_streak_l = _label(18, Color(1.0, 0.84, 0.42))
	_streak_l.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	_streak_l.offset_left = -200
	_streak_l.offset_right = 200
	_streak_l.offset_top = 330
	_streak_l.offset_bottom = 358
	_streak_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_streak_l.visible = false
	_derby_box = VBoxContainer.new()
	_derby_box.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	_derby_box.offset_left = -330
	_derby_box.offset_right = -24
	_derby_box.offset_top = 150
	_derby_box.offset_bottom = 360
	_derby_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_derby_box.add_theme_constant_override("separation", 2)
	add_child(_derby_box)
	_derby_title = _label(17, Color(1.0, 0.84, 0.42), _derby_box)
	_derby_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_derby_rows = _label(15, Color(0.94, 0.9, 0.82), _derby_box)
	_derby_rows.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_derby_box.visible = false
	fishing.popped.connect(_on_pop)
	fishing.called.connect(_on_call)
	fishing.streak_changed.connect(func(_n: int, _k: Array) -> void: _paint_streak())
	fishing.derby_changed.connect(func(_st: Dictionary) -> void: _paint_derby())
	_paint_streak()
	_paint_derby()


func _label(px: int, col: Color, parent: Node = self) -> Label:
	var l: Label = Label.new()
	l.add_theme_font_override("font", Kit.font("cinzel", 700))
	l.add_theme_font_size_override("font_size", px)
	l.add_theme_color_override("font_color", col)
	l.add_theme_color_override("font_outline_color", Color(0.02, 0.04, 0.06, 0.85))
	l.add_theme_constant_override("outline_size", 8)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(l)
	return l


func _on_pop(key: String, pop: Dictionary) -> void:
	# Your own catch has its own moment; the pops are the crew's.
	if key == my_key:
		return
	var text: String = str(pop.get("name", ""))
	if Js.num(pop.get("size")) > 0.0:
		text += "  %s in" % Js.thousands(round(Js.num(pop["size"])))
	_pops.append({ "key": key, "text": text, "golden": pop.get("golden", false), "t": 0.0 })


func _on_call(text: String, about: String) -> void:
	# The catcher hears about their own catch from their own screens.
	if about != "" and about == my_key:
		return
	_calls.append(text)


func _paint_streak() -> void:
	var n: int = fishing.streak
	_streak_l.visible = n >= 2 and fishing.streak_keys.has(my_key)
	_streak_l.text = "Crew streak  %d" % n


func _paint_derby() -> void:
	var st: Dictionary = fishing.derby
	_derby_box.visible = not st.is_empty()
	if st.is_empty():
		return
	var lines: PackedStringArray = []
	var i: int = 0
	for r: Dictionary in Js.list(st.get("rows")):
		i += 1
		lines.append("%d.  %s   %s" % [i, r.get("name", "?"), r.get("label", "")])
		if i >= 4:
			break
	if lines.is_empty():
		lines.append("No catches yet")
	_derby_rows.text = "\n".join(lines)


func _node_of(key: String) -> Node2D:
	if key == my_key:
		return sea._boat
	return sea._mates.get(key)


func _process(delta: float) -> void:
	_t += delta
	# The callouts, one at a time.
	if _call_t > 0.0:
		_call_t -= delta
		_call_l.modulate.a = clampf(minf(_call_t, 3.6 - _call_t) / 0.35, 0.0, 1.0)
	elif not _calls.is_empty():
		_call_l.text = str(_calls.pop_front())
		_call_t = 3.6
	else:
		_call_l.modulate.a = 0.0
	if _derby_box.visible:
		var left: float = maxf(0.0, Js.num(fishing.derby.get("left")) - float(Time.get_ticks_msec() - fishing.derby_got_ms) / 1000.0)
		_derby_title.text = "Derby: %s   %d:%02d" % [fishing.derby.get("title", ""), int(left) / 60, int(left) % 60]
	for p: Dictionary in _pops:
		p["t"] = float(p["t"]) + delta
	_pops = _pops.filter(func(p: Dictionary) -> bool: return float(p["t"]) < 2.6)
	queue_redraw()


func _draw() -> void:
	var font: Font = Kit.font("cinzel", 700)
	for p: Dictionary in _pops:
		var n: Node2D = _node_of(str(p["key"]))
		if n == null or not is_instance_valid(n):
			continue
		var t: float = float(p["t"])
		var at: Vector2 = n.get_global_transform_with_canvas().origin + Vector2(0, -150.0 - 40.0 * t)
		var a: float = clampf(minf(t / 0.2, (2.6 - t) / 0.5), 0.0, 1.0)
		var col: Color = Color(1.0, 0.82, 0.3, a) if p["golden"] else Color(0.97, 0.94, 0.86, a)
		var w: float = font.get_string_size(str(p["text"]), HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x
		draw_string_outline(font, at - Vector2(w / 2.0, 0), str(p["text"]), HORIZONTAL_ALIGNMENT_LEFT, -1, 20, 7, Color(0.02, 0.04, 0.06, 0.8 * a))
		draw_string(font, at - Vector2(w / 2.0, 0), str(p["text"]), HORIZONTAL_ALIGNMENT_LEFT, -1, 20, col)
	# The crew streak: motes rising off the water round every hull in it, more
	# as it climbs.
	var n2: int = fishing.streak
	if n2 >= 2:
		var count: int = mini(6 + n2 * 2, 40)
		for k: Variant in fishing.streak_keys:
			var hull: Node2D = _node_of(str(k))
			if hull == null or not is_instance_valid(hull):
				continue
			var c: Vector2 = hull.get_global_transform_with_canvas().origin
			for i: int in count:
				var seed: float = float(i) * 12.9898 + float(str(k).hash() % 97)
				var x: float = fmod(abs(sin(seed) * 43758.5453), 1.0)
				var life: float = fmod(_t * (0.35 + 0.25 * x) + x * 3.0, 1.0)
				var pos: Vector2 = c + Vector2((x - 0.5) * 220.0, 30.0 - life * 150.0)
				draw_circle(pos, 1.6 + 2.2 * x, Color(1.0, 0.84, 0.42, (1.0 - life) * 0.75 * sin(life * PI)))
