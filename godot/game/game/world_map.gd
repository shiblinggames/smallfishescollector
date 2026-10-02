class_name WorldMap
extends Control
## THE WORLD CHART (Godot, 2026-10-01; the web's Minimap.tsx rebuilt and
## widened at Kong's word: "a lot more feature rich", "take advantage of
## Godot", and GPS routing). Full screen, a sea chart in watercolour on paper:
##
##   THE SHEET    fx/chart_paper.gdshader: the waters as washes, pooled at
##                their edges, inked contours, a graticule, lamplight at night.
##   THE LAND     every port and isle drawn from its own painted plate.
##   THE FOG      fx/chart_fog.gdshader over it, from the captain's real fog
##                grid: unsailed water lies under cloud that dissolves at its
##                edge like wet paint.
##   LIVE         her (heading and wake), crewmates, the regulars where they
##                are now, the buyers, strangers she can see, today's hotspots
##                with their time left, squalls drifting with their heading,
##                the currents flowing, kelp, the portal, buried sites she
##                holds a bearing for, and her own pins.
##   GPS          click open water and the course is set there; click any mark
##                for its card (what it is, how far, how long at her speed) and
##                Set course, or Set course and sail it (the autopilot), or drop
##                a pin. The course draws on the chart and on the water.
##   PROGRESS     each water's share sailed, isles landed and sites dug.
## Zoom with the wheel (about the pointer), drag to pan, M or Escape to close.

signal closed

var sea: Sea
var _center: Vector2 = Vector2(0, 9500)
## The middle of the world: the crossing between the fishing sea and the
## anchorage (Kong, 2026-10-02), where the whole chart centres.
const WORLD_CENTRE: Vector2 = Vector2(-900.0, -1500.0)
var _center_to: Variant = null
var _scale: float = 0.03
var _scale_to: float = 0.03
var _paper: ColorRect
var _fog: ColorRect
var _land: Control
var _marks: Control
var _card: Pane
var _layers: Dictionary = { "ports": true, "people": true, "hotspots": true, "weather": true, "currents": true, "finds": true, "pins": true }
var _drag_from: Variant = null
var _dragged: bool = false
var _hover: Dictionary = {}
var _t: float = 0.0
var _plates: Array = []
var _fog_t: float = 99.0
var _pins: Array = []
var _progress: VBoxContainer


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	_paper = ColorRect.new()
	_paper.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_paper.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var pm: ShaderMaterial = ShaderMaterial.new()
	pm.shader = load("res://game/fx/chart_paper.gdshader")
	_paper.material = pm
	add_child(_paper)
	_land = Control.new()
	_land.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_land.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_land)
	for p: Dictionary in Chart.ports() + (Rules.data()["isles"] as Array):
		var pl: Variant = p.get("plate")
		if pl == null:
			continue
		var tr: TextureRect = TextureRect.new()
		tr.texture = Lit.diffuse(Skipper.tex(String((pl as Dictionary)["art"])))
		if tr.texture == null:
			continue
		tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_land.add_child(tr)
		_plates.append([tr, p, float((pl as Dictionary).get("width", 1.0))])
	_fog = ColorRect.new()
	_fog.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_fog.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var fm: ShaderMaterial = ShaderMaterial.new()
	fm.shader = load("res://game/fx/chart_fog.gdshader")
	_fog.material = fm
	add_child(_fog)
	_marks = Control.new()
	_marks.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_marks.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_marks.draw.connect(_draw_marks)
	add_child(_marks)
	_pins = _load_pins()
	_build_chrome()
	_center = sea._boat.position
	_scale = _fit_scale() * 3.0
	_scale_to = _scale
	modulate.a = 0.0
	create_tween().tween_property(self, "modulate:a", 1.0, 0.18)


func _fit_scale() -> float:
	# The whole world, centred on the crossing (the reef's arch): the fishing
	# sea below it, the anchorage and the campaign's water above.
	var half: float = Chart.LAST_OUTER + 1500.0
	return minf(size.x / (half * 2.0), size.y / (half * 2.0)) if size.x > 0.0 else 0.03


# ── Chrome: title, progress, layers, card, buttons ─────────────────────────────

func _build_chrome() -> void:
	# A sheet of the same paper behind the title and the tally, so they read
	# over fog and land alike.
	var sheet: Panel = Panel.new()
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.bg_color = Color(0.95, 0.92, 0.85, 0.9)
	sb.border_color = Color(0.45, 0.36, 0.27, 0.35)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(10)
	sb.shadow_color = Color(0.2, 0.15, 0.1, 0.18)
	sb.shadow_size = 8
	sheet.add_theme_stylebox_override("panel", sb)
	sheet.position = Vector2(14, 12)
	sheet.size = Vector2(318, 228)
	sheet.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(sheet)
	var top: VBoxContainer = VBoxContainer.new()
	top.position = Vector2(28, 22)
	top.add_theme_constant_override("separation", 2)
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(top)
	Kit.text(top, "The Chart", "display", Color(0.22, 0.17, 0.13))
	var water: Dictionary = Chart.water_at(sea._boat.position)
	Kit.text(top, "You are in %s" % water.get("name", "the harbour approach"), "small", Color(0.32, 0.26, 0.2))
	# The weather, on its own sheet under the title.
	var wsheet: Panel = Panel.new()
	wsheet.add_theme_stylebox_override("panel", sb)
	wsheet.position = Vector2(14, 248)
	wsheet.size = Vector2(318, 128)
	wsheet.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(wsheet)
	var wcol: VBoxContainer = VBoxContainer.new()
	wcol.position = Vector2(14, 10)
	wcol.custom_minimum_size = Vector2(290, 0)
	wcol.add_theme_constant_override("separation", 3)
	wsheet.add_child(wcol)
	Kit.text(wcol, "Weather", "eyebrow", Color(0.6, 0.35, 0.18))
	for line: String in _weather_lines(Clock.now_ms()):
		Kit.text(wcol, line, "small", Color(0.25, 0.2, 0.16), true).custom_minimum_size = Vector2(290, 0)
	wcol.resized.connect(func() -> void: wsheet.size.y = wcol.size.y + 20.0)
	_progress = VBoxContainer.new()
	_progress.add_theme_constant_override("separation", 3)
	_progress.position = Vector2(28, 104)
	_progress.custom_minimum_size = Vector2(250, 0)
	add_child(_progress)
	_draw_progress()
	# The layers, as ink stamps along the bottom left.
	var layers: HBoxContainer = HBoxContainer.new()
	layers.add_theme_constant_override("separation", 6)
	layers.anchor_top = 1.0
	layers.anchor_bottom = 1.0
	layers.offset_left = 28
	layers.offset_top = -56
	layers.offset_bottom = -22
	add_child(layers)
	_rebuild_layers(layers)
	# Bottom right: back to her, the recall, close.
	var right: HBoxContainer = HBoxContainer.new()
	right.add_theme_constant_override("separation", 8)
	right.anchor_left = 1.0
	right.anchor_right = 1.0
	right.anchor_top = 1.0
	right.anchor_bottom = 1.0
	right.offset_left = -560
	right.offset_right = -28
	right.offset_top = -60
	right.offset_bottom = -22
	right.alignment = BoxContainer.ALIGNMENT_END
	add_child(right)
	var me: Button = ink_button("Find my boat")
	me.pressed.connect(func() -> void: _center_to = sea._boat.position)
	right.add_child(me)
	var left_ms: float = Portal.recall_left_ms(sea.session.profile(), "fishing")
	var ready_n: int = Portal.recalls_ready(sea.session.profile(), "fishing")
	var rc: Button = ink_button(("Recall home  ·  %d ready" % ready_n if ready_n > 1 else "Recall home") if left_ms <= 0.0 else "Recall in %dm" % int(ceil(left_ms / 60000.0)), left_ms <= 0.0)
	rc.disabled = left_ms > 0.0
	rc.pressed.connect(func() -> void:
		close()
		sea._press_recall())
	right.add_child(rc)
	var x: Button = Kit.close_button()
	x.pressed.connect(close)
	x.position = Vector2(0, 0)
	var xh: Control = Control.new()
	xh.anchor_left = 1.0
	xh.anchor_right = 1.0
	xh.offset_left = -58
	xh.offset_top = 22
	add_child(xh)
	xh.add_child(x)
	var gps_block: String = Rules.skill_block(_xp(), "set_course")
	var hint: Label = Kit.text(self, ("Click the water to set a course" if gps_block == "" else gps_block) + "  ·  click a mark for more  ·  wheel to zoom, drag to move  ·  M to close", "small", Color(0.3, 0.25, 0.2))
	hint.anchor_left = 0.5
	hint.anchor_right = 0.5
	hint.offset_left = -400
	hint.offset_right = 400
	hint.offset_top = 26
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER


func _rebuild_layers(row: HBoxContainer) -> void:
	for c: Node in row.get_children():
		c.queue_free()
	for key: String in ["ports", "people", "hotspots", "weather", "currents", "finds", "pins"]:
		var b: Button = ink_button(key.capitalize(), _layers[key])
		var k: String = key
		b.pressed.connect(func() -> void:
			_layers[k] = not _layers[k]
			_rebuild_layers(row))
		row.add_child(b)


var _salters_day: int = -1
var _salters_list: Array = []


## Today's salters across the whole sea (hashed from the cell and the day,
## the same people the sea puts out there).
func _salters(now: float) -> Array:
	var day: int = Traders.sea_day(now)
	if day != _salters_day:
		_salters_day = day
		var outer: float = Explore._outer()
		_salters_list = Traders.around(0.0, outer / 2.0, outer * 0.75, day, now).filter(func(w: Dictionary) -> bool: return w.get("kind", "") == "salter")
	return _salters_list


# ── Weather ────────────────────────────────────────────────────────────────────

const FRONT_INK: Dictionary = { "squall": Color(0.3, 0.34, 0.42), "gale": Color(0.24, 0.27, 0.36), "tempest": Color(0.2, 0.18, 0.3), "fog": Color(0.62, 0.66, 0.7), "wind": Color(0.32, 0.5, 0.36) }


## THE FORECAST on the chart (the Storm Glass and Sky Reader skills): the
## front over the sea now, shaded across the water it covers, its edges
## inked; with Sky Reader, the next two drawn as the road each will take.
func _draw_weather(now: float, small: Font) -> void:
	var xp: float = _xp()
	if not Rules.has_skill(xp, "storm_glass") and Rules.skill("storm_glass").size() > 0:
		return
	var f: Dictionary = Weather.current(now)
	if not f.is_empty():
		var e: Vector2 = Weather.edges(f, now)
		var r: float = Weather.reach()
		var s0: float = maxf(e.y, -r)
		var s1: float = minf(e.x, r)
		if s1 > s0:
			var d: Vector2 = f["dir"]
			var n: Vector2 = d.orthogonal() * r * 2.0
			var c: Vector2 = Weather.centre()
			var col: Color = FRONT_INK[f["kind"]]
			var pts: PackedVector2Array = PackedVector2Array([to_screen(c + d * s0 - n), to_screen(c + d * s0 + n), to_screen(c + d * s1 + n), to_screen(c + d * s1 - n)])
			_marks.draw_colored_polygon(pts, Color(col, 0.16 + 0.03 * sin(_t * 1.5)))
			if e.x < r:
				_marks.draw_line(pts[2], pts[3], Color(col, 0.7), 2.5, true)
			if e.y > -r:
				_marks.draw_line(pts[0], pts[1], Color(col, 0.5), 1.5, true)
			var mid: Vector2 = c + d * ((s0 + s1) / 2.0)
			_name(small, to_screen(mid), str(f["name"]), 13, col.darkened(0.3), true, true)
	if Rules.has_skill(xp, "sky_reader"):
		for nf: Dictionary in Weather.ahead(now, 2):
			var d2: Vector2 = nf["dir"]
			var c2: Vector2 = Weather.centre()
			var col2: Color = FRONT_INK[nf["kind"]]
			var a: Vector2 = to_screen(c2 - d2 * Weather.reach() * 0.7)
			var b: Vector2 = to_screen(c2 + d2 * Weather.reach() * 0.7)
			var steps: int = 22
			for k: int in steps:
				if k % 2 == 0:
					_marks.draw_line(a.lerp(b, float(k) / steps), a.lerp(b, float(k + 1) / steps), Color(col2, 0.55), 2.0, true)
			var head: Vector2 = (b - a).normalized()
			_marks.draw_colored_polygon(PackedVector2Array([b, b - head * 16.0 + head.orthogonal() * 8.0, b - head * 16.0 - head.orthogonal() * 8.0]), Color(col2, 0.7))
			_name(small, a + Vector2(8, -8), "%s in %s" % [nf["name"], Weather.mins(float(nf["start"]) - now)], 12, col2.darkened(0.3), false, true)


## The forecast in words, under the chart's title sheet.
func _weather_lines(now: float) -> Array:
	var xp: float = _xp()
	var at: Vector2 = sea._boat.position
	var out: Array = []
	var f: Dictionary = Weather.current(now)
	var here: float = Weather.depth(f, at, now)
	var glass: bool = Rules.has_skill(xp, "storm_glass") or Rules.skill("storm_glass").is_empty()
	if f.is_empty():
		out.append("Fair weather over the sea.")
	elif not glass:
		out.append("%s over you." % f["name"] if here > 0.0 else "Fair weather where you are.")
	else:
		var pass_t: Vector2 = Weather.passage(f, at)
		if now < pass_t.x:
			out.append("%s coming in from %s; reaches you in %s." % [f["name"], f["from"], Weather.mins(pass_t.x - now)])
		elif now < pass_t.y:
			out.append("%s over you; clears here in %s." % [f["name"], Weather.mins(pass_t.y - now)])
		else:
			out.append("%s has passed you, still out over the sea." % f["name"])
	if glass:
		var n: int = 2 if Rules.has_skill(xp, "sky_reader") else 1
		for nf: Dictionary in Weather.ahead(now, n):
			out.append("Next: %s in %s, from %s, about %s." % [nf["name"], Weather.mins(float(nf["start"]) - now), nf["from"], Weather.mins(float(nf["dur"]))])
		if n == 1 and Rules.skill("sky_reader").size() > 0:
			out.append("Sky Reader at Fishing %d looks further ahead." % int(Rules.skill("sky_reader")["level"]))
	else:
		out.append("Storm Glass at Fishing %d shows what is coming." % int(Rules.skill("storm_glass")["level"]))
	return out


## Each water: how much of it she has sailed, isles landed, sites dug.
func _draw_progress() -> void:
	for c: Node in _progress.get_children():
		c.queue_free()
	var bits: PackedByteArray = sea._fog
	var landed: Array = sea.session.save.get("discoveries", [])
	var dug: Array = Explore.get_dig_state(sea.session.store, sea.session.uid)["dug"]
	var ink: Color = Color(0.25, 0.2, 0.16)
	Kit.text(_progress, "Charted  %d%%" % int(round(Explore.fog_progress(bits) * 100.0)), "label", ink)
	for w: Dictionary in Chart.WATERS:
		var seen: int = 0
		var total: int = 0
		for i: int in Explore.water_cells():
			var r: float = Explore.fog_centre(i).length()
			if r >= float(w["inner"]) and r < float(w["outer"]):
				total += 1
				if Explore.fog_has(bits, i):
					seen += 1
		var isles: Array = (Rules.data()["isles"] as Array).filter(func(i: Dictionary) -> bool: return i["band"] == w["id"])
		var got: int = isles.filter(func(i: Dictionary) -> bool: return Js.includes(landed, i["id"])).size()
		var sites: Array = (Rules.data()["digSites"] as Array).filter(func(d: Dictionary) -> bool: return d["band"] == w["id"])
		var gd: int = sites.filter(func(d: Dictionary) -> bool: return dug.has(d["id"])).size()
		var row: VBoxContainer = VBoxContainer.new()
		row.add_theme_constant_override("separation", 1)
		_progress.add_child(row)
		if Clues.on():
			Kit.text(row, "%s  ·  %d%%  ·  isles %d/%d" % [w["name"], int(round(100.0 * seen / maxf(1.0, total))), got, isles.size()], "small", ink)
		else:
			Kit.text(row, "%s  ·  %d%%  ·  isles %d/%d  ·  dug %d/%d" % [w["name"], int(round(100.0 * seen / maxf(1.0, total))), got, isles.size(), gd, sites.size()], "small", ink)
		var bar: Kit.Bar = Kit.bar(row, float(seen) / maxf(1.0, total), Color(0.3, 0.5, 0.62), true)
		bar.custom_minimum_size.x = 240


## A button in the chart's own hand: ink on paper.
static func ink_button(text: String, on: bool = false) -> Pane.PaneButton:
	return Paper.button(text, on)


# ── Pins (kept per captain on this machine) ────────────────────────────────────

func _load_pins() -> Array:
	return Prefs.get_value("pins:%s" % sea.session.uid, []) as Array


func _save_pins() -> void:
	Prefs.set_value("pins:%s" % sea.session.uid, _pins)


# ── View ───────────────────────────────────────────────────────────────────────

func to_screen(w: Vector2) -> Vector2:
	return size / 2.0 + (w - _center) * _scale


func to_world(s: Vector2) -> Vector2:
	return _center + (s - size / 2.0) / _scale


func _process(delta: float) -> void:
	_t += delta
	var before: float = _scale
	_scale = lerpf(_scale, _scale_to, 1.0 - exp(-delta * 12.0))
	if absf(before - _scale) > 0.000001 and _zoom_about != Vector2.INF:
		# Keep the point under the pointer under the pointer.
		var w: Vector2 = _zoom_world
		_center = w - (_zoom_about - size / 2.0) / _scale
	if _center_to != null:
		_center = _center.lerp(_center_to, 1.0 - exp(-delta * 6.0))
		if _center.distance_to(_center_to) < 5.0:
			_center_to = null
	var pm2: ShaderMaterial = _paper.material
	var ws: Array[Dictionary] = Chart.WATERS
	pm2.set_shader_parameter("u_bands_a", Vector4(float(ws[0]["inner"]), float(ws[1]["inner"]), float(ws[2]["inner"]), float(ws[3]["inner"])))
	pm2.set_shader_parameter("u_bands_b", Vector2(float(ws[4]["inner"]), Chart.LAST_OUTER))
	pm2.set_shader_parameter("u_outer", Chart.LAST_OUTER)
	var fm2: ShaderMaterial = _fog.material
	fm2.set_shader_parameter("u_outer", Chart.LAST_OUTER)
	fm2.set_shader_parameter("u_wall", Explore.NORTH_WALL)
	pm2.set_shader_parameter("u_wall", Explore.NORTH_WALL)
	pm2.set_shader_parameter("u_gate", Vector2(North.GATE_X, North.GATE_HALF))
	pm2.set_shader_parameter("u_anchor", Vector3(North.EXP_ORIGIN.x, North.EXP_ORIGIN.y, North.EXP_EDGE))
	var dark: float = float(SeaClock.at(Clock.now_ms())["darkness"])
	for m: ShaderMaterial in [_paper.material, _fog.material]:
		m.set_shader_parameter("u_center", _center)
		m.set_shader_parameter("u_scale", _scale)
		m.set_shader_parameter("u_res", size)
		m.set_shader_parameter("u_dark", dark)
	_fog_t += delta
	if _fog_t > 1.0:
		_fog_t = 0.0
		_upload_fog()
	for e: Array in _plates:
		var tr: TextureRect = e[0]
		var p: Dictionary = e[1]
		var r: float = float(p["r"])
		var w2: float = r * 2.0 * float(e[2]) * _scale
		var h2: float = w2 * tr.texture.get_height() / tr.texture.get_width()
		var c: Vector2 = to_screen(Vector2(float(p["x"]), float(p["y"])))
		tr.position = c - Vector2(w2 / 2.0, h2 * 0.55)
		tr.size = Vector2(w2, h2)
		tr.visible = w2 > 3.0
		tr.modulate = Color(1, 1, 1, 0.92).lerp(Color(0.55, 0.5, 0.5, 0.92), dark * 0.5)
	_marks.queue_redraw()


## The fog mask at four times the grid, each sailed cell stamped as a soft
## round blot, so clearings are rounded and run into each other.
func _upload_fog() -> void:
	var w: int = Explore.fog_w()
	var h: int = Explore.fog_h()
	const K: int = 4
	var img: Image = Image.create(w * K, h * K, false, Image.FORMAT_L8)
	var bits: PackedByteArray = sea._fog
	var blot: float = K * 1.45
	for i: int in w * h:
		if not Explore.fog_has(bits, i):
			continue
		var cx: float = (i % w + 0.5) * K
		var cy: float = (i / w + 0.5) * K
		for y: int in range(maxi(0, int(cy - blot - 1)), mini(h * K, int(cy + blot + 2))):
			for x: int in range(maxi(0, int(cx - blot - 1)), mini(w * K, int(cx + blot + 2))):
				var d: float = Vector2(x + 0.5 - cx, y + 0.5 - cy).length() / blot
				if d < 1.0:
					var v: float = maxf(img.get_pixel(x, y).r, 1.0 - d * d)
					img.set_pixel(x, y, Color(v, v, v))
	var m: ShaderMaterial = _fog.material
	m.set_shader_parameter("u_fog", ImageTexture.create_from_image(img))
	m.set_shader_parameter("u_origin", Vector2(-float(Explore._outer()), Explore.NORTH_WALL))
	m.set_shader_parameter("u_span", Vector2(w, h) * Explore.FOG_CELL)


var _zoom_about: Vector2 = Vector2.INF
var _zoom_world: Vector2 = Vector2.ZERO


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb: InputEventMouseButton = event
		if mb.pressed and (mb.button_index == MOUSE_BUTTON_WHEEL_UP or mb.button_index == MOUSE_BUTTON_WHEEL_DOWN):
			_zoom_about = mb.position
			_zoom_world = to_world(mb.position)
			_scale_to = clampf(_scale_to * (1.18 if mb.button_index == MOUSE_BUTTON_WHEEL_UP else 1.0 / 1.18), _fit_scale(), 0.3)
			# All the way out, the chart settles on the crossing at its centre.
			if _scale_to <= _fit_scale() * 1.01:
				_zoom_about = Vector2.INF
				_center_to = WORLD_CENTRE
			accept_event()
			return
		if mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed:
				_drag_from = mb.position
				_dragged = false
			else:
				if not _dragged:
					_click(mb.position)
				_drag_from = null
		elif mb.button_index == MOUSE_BUTTON_RIGHT and mb.pressed:
			_set_course(to_world(mb.position), "A spot on the chart", false)
	elif event is InputEventMouseMotion:
		var mm: InputEventMouseMotion = event
		if _drag_from != null and (mm.button_mask & MOUSE_BUTTON_MASK_LEFT) != 0:
			if mm.position.distance_to(_drag_from) > 6.0:
				_dragged = true
			if _dragged:
				_center_to = null
				_center -= mm.relative / _scale
				_zoom_about = Vector2.INF
		_hover = _pick(mm.position)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("chart") or event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		if _card != null and event.is_action_pressed("fish_back"):
			_card.queue_free()
			_card = null
		else:
			close()


func close() -> void:
	closed.emit()
	var tw: Tween = create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.14)
	tw.tween_callback(queue_free)


# ── What is on the chart ───────────────────────────────────────────────────────

## Every mark, as { kind, at (world), name, color, data }.
func _all_marks() -> Array:
	var out: Array = []
	var now: float = Clock.now_ms()
	if _layers["ports"]:
		for p: Dictionary in Chart.ports():
			out.append({ "kind": "port", "at": Vector2(float(p["x"]), float(p["y"])), "name": p["name"], "color": Color(0.72, 0.5, 0.18), "data": p })
		for i: Dictionary in Rules.data()["isles"]:
			var c: Vector2 = Vector2(float(i["x"]), float(i["y"]))
			if not _seen(c) and not Js.includes(sea.session.save.get("discoveries", []), i["id"]):
				continue
			out.append({ "kind": "isle", "at": c, "name": i["name"], "color": Color(0.45, 0.4, 0.3), "data": i })
		if sea._portal != null:
			out.append({ "kind": "portal", "at": sea._portal.position, "name": "Home Portal", "color": Color(str(Portal.tier_def(sea._portal.tier).get("accent", "#7fc8de"))), "data": {} })
	if _layers["people"]:
		for k: String in sea._regulars:
			var w: Wanderer = sea._regulars[k]
			out.append({ "kind": "regular", "at": w.position, "name": str(w.info["name"]), "color": w.accent, "data": w.info })
		for b: Buyer in sea._buyers:
			out.append({ "kind": "buyer", "at": b.position, "name": str(b.info["name"]), "color": Color(0.85, 0.62, 0.2), "data": b.info })
		for k: String in sea._strangers:
			var w: Wanderer = sea._strangers[k]
			out.append({ "kind": "stranger", "at": w.position, "name": str(w.info["name"]), "color": Color(0.5, 0.45, 0.42), "data": w.info })
		# Market Sense (a skill): every salter buying today, out of sight too.
		if Rules.has_skill(_xp(), "market_sense"):
			for s: Dictionary in _salters(now):
				if not sea._strangers.has(str(s["key"])):
					out.append({ "kind": "salter", "at": Vector2(float(s["x"]), float(s["y"])), "name": "%s  ·  %d%%" % [s["name"], int(round(float(s["rate"]) * 100.0))], "color": Color(0.85, 0.62, 0.2), "data": s })
		for k: String in sea._mates:
			var m: Shipmate = sea._mates[k]
			out.append({ "kind": "mate", "at": m.position, "name": m.mate_name, "color": Color(0.25, 0.45, 0.75), "data": {} })
	if _layers["hotspots"]:
		for h: Dictionary in Hotspots.at_time(now):
			out.append({ "kind": "hotspot", "at": Vector2(float(h["x"]), float(h["y"])), "name": _hotspot_name(h), "color": _hotspot_color(h), "data": h })
	# Buried sites are a treasure hunt's to find, not the chart's (port rules).
	if _layers["finds"] and not Clues.on():
		var digs: Dictionary = Explore.get_dig_state(sea.session.store, sea.session.uid)
		for d: Dictionary in Rules.data()["digSites"]:
			if not digs["bearings"].has(d["id"]):
				continue
			out.append({ "kind": "dig", "at": Vector2(float(d["x"]), float(d["y"])), "name": str(d["name"]), "color": Color(0.6, 0.2, 0.15), "data": { "dug": digs["dug"].has(d["id"]) } })
	if _layers["pins"]:
		for i: int in _pins.size():
			var p: Dictionary = _pins[i]
			out.append({ "kind": "pin", "at": Vector2(float(p["x"]), float(p["y"])), "name": str(p["name"]), "color": Color(0.75, 0.2, 0.25), "data": { "i": i } })
	return out


func _hotspot_color(h: Dictionary) -> Color:
	return Color({ "shoal": "#3fa37a", "trench": "#7b5fd0", "flotsam": "#c99a1e" }.get(h["kind"], "#999999"))


func _hotspot_name(h: Dictionary) -> String:
	return str(Hotspots.DEFS[h["kind"]]["tiers"][int(h["tier"]) - 1][0])


func _seen(w: Vector2) -> bool:
	if w.y < Explore.NORTH_WALL:
		return true
	return Explore.fog_has(sea._fog, Explore.fog_index(w.x, w.y))


func _pick(s: Vector2) -> Dictionary:
	var best: Dictionary = {}
	var bd: float = 20.0
	for m: Dictionary in _all_marks():
		var d: float = to_screen(m["at"]).distance_to(s)
		var r: float = 20.0 if m["kind"] in ["port", "isle", "hotspot", "squall"] else 14.0
		if d < minf(bd, r):
			bd = d
			best = m
	return best


func _draw_marks() -> void:
	var font: Font = Kit.font("cinzel", 700)
	var small: Font = Kit.font("karla", 700)
	var ink: Color = Color(0.2, 0.16, 0.13)
	var now: float = Clock.now_ms()
	if _layers["weather"]:
		_draw_weather(now, small)
	# The currents: flowing dashes down each lane.
	if _layers["currents"]:
		for lane: Dictionary in SeaFlow.flow()["currents"]:
			var pts: Array = lane["pts"]
			var walked: float = 0.0
			for k: int in range(1, pts.size()):
				var a: Vector2 = Vector2(float(pts[k - 1][0]), float(pts[k - 1][1]))
				var b: Vector2 = Vector2(float(pts[k][0]), float(pts[k][1]))
				var seg: float = a.distance_to(b)
				var s: float = fposmod(_t * 900.0 - walked, 900.0)
				while s < seg:
					if not _seen(a.move_toward(b, s)):
						s += 900.0
						continue
					var p0: Vector2 = to_screen(a.move_toward(b, s))
					var p1: Vector2 = to_screen(a.move_toward(b, minf(s + 380.0, seg)))
					_marks.draw_line(p0, p1, Color(0.95, 0.98, 1.0, 0.55), maxf(1.5, float(lane["half"]) * _scale * 0.35), true)
					s += 900.0
				walked += seg
		for k: Dictionary in SeaFlow.flow()["kelp"]:
			if not _seen(Vector2(float(k["x"]), float(k["y"]))):
				continue
			var c: Vector2 = to_screen(Vector2(float(k["x"]), float(k["y"])))
			var r: float = float(k["r"]) * _scale
			for j: int in 3:
				_marks.draw_circle(c + Vector2.from_angle(j * 2.1 + float(k["seed"])) * r * 0.25, r * (0.8 - j * 0.12), Color(0.36, 0.5, 0.3, 0.16))
			for j: int in 5:
				var a: float = j * 1.25 + float(k["seed"]) * 0.7
				var p0: Vector2 = c + Vector2.from_angle(a) * r * 0.55
				var pts: PackedVector2Array = PackedVector2Array()
				for q: int in 5:
					pts.append(p0 + Vector2(sin(q * 1.3 + j) * r * 0.06, -q * r * 0.09))
				_marks.draw_polyline(pts, Color(0.22, 0.34, 0.18, 0.55), 1.2, true)
	# The course: ink dashes from her to the destination, and a flag there.
	var crs: Course = sea._course
	if crs != null and crs.active():
		var path: PackedVector2Array = crs.path
		for k: int in range(1, path.size()):
			var a: Vector2 = to_screen(path[k - 1])
			var b: Vector2 = to_screen(path[k])
			var seg: float = a.distance_to(b)
			var s: float = fposmod(_t * 30.0, 14.0)
			while s < seg:
				_marks.draw_line(a.move_toward(b, s), a.move_toward(b, minf(s + 8.0, seg)), Color(0.7, 0.18, 0.15, 0.9), 2.5, true)
				s += 14.0
		var d: Vector2 = to_screen(crs.dest)
		_marks.draw_line(d, d - Vector2(0, 26), ink, 2.0, true)
		_marks.draw_colored_polygon(PackedVector2Array([d - Vector2(0, 26), d - Vector2(-16, 20), d - Vector2(0, 14)]), Color(0.75, 0.2, 0.18))
		var info: String = "%s  ·  %s" % [crs.label, Course.eta_text(crs.eta())]
		_marks.draw_string(small, d + Vector2(10, -28), info, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, ink)
	# Every mark (names that would land on another are left off).
	_taken.clear()
	for m: Dictionary in _all_marks():
		var at: Vector2 = to_screen(m["at"])
		if at.x < -60 or at.y < -60 or at.x > size.x + 60 or at.y > size.y + 60:
			continue
		var c: Color = m["color"]
		var hot: bool = not _hover.is_empty() and _hover["at"] == m["at"]
		match m["kind"]:
			"port":
				_name(font, at + Vector2(0, 26), str(m["name"]), 13 if _scale > 0.05 else 11, ink, true, hot)
			"isle":
				var been: bool = Js.includes(sea.session.save.get("discoveries", []), m["data"]["id"])
				if _scale > 0.045 or hot:
					_name(small, at + Vector2(0, 18), ("\u2713 " if been else "") + str(m["name"]), 11, Color(ink, 0.85), true, hot)
			"portal":
				_marks.draw_arc(at, 9.0, 0.0, TAU, 32, c, 2.5, true)
				_marks.draw_arc(at, 5.0, _t * 2.0, _t * 2.0 + 4.0, 16, c, 2.0, true)
			"salter":
				_marks.draw_circle(at + Vector2(1, 1.5), 5.0, Color(0, 0, 0, 0.25))
				_marks.draw_circle(at, 5.0, Color(c, 0.85))
				_marks.draw_arc(at, 8.0, 0.0, TAU, 20, Color(c.darkened(0.3), 0.8), 1.4, true)
				if _scale > 0.035 or hot:
					_name(small, at + Vector2(10, 4), str(m["name"]), 11, c.darkened(0.45), false, hot)
			"regular", "buyer", "stranger", "mate":
				var rr: float = 6.0 if m["kind"] != "stranger" else 4.0
				_marks.draw_circle(at + Vector2(1, 1.5), rr, Color(0, 0, 0, 0.25))
				_marks.draw_circle(at, rr, c)
				_marks.draw_arc(at, rr, 0.0, TAU, 20, ink, 1.2, true)
				if m["kind"] != "stranger" and (_scale > 0.05 or hot):
					_name(small, at + Vector2(9, 4), str(m["name"]), 11, ink, false, hot)
			"hotspot":
				var hr: float = maxf(8.0, float(m["data"]["r"]) * _scale)
				var pulse: float = 0.5 + 0.5 * sin(_t * 2.0)
				_marks.draw_circle(at, hr, Color(c, 0.18 + 0.08 * pulse))
				_marks.draw_arc(at, hr, 0.0, TAU, 40, Color(c, 0.85), 2.0, true)
				var left: float = maxf(0.0, (float(m["data"]["endsAt"]) - now) / 60000.0)
				_name(small, at + Vector2(hr + 4, 4), "%s  \u00b7  %dm" % [m["name"], int(ceil(left))], 11, Color(c.darkened(0.35), 1.0), false, hot)
			"dig":
				var dug: bool = m["data"]["dug"]
				var xc: Color = Color(0.4, 0.4, 0.38) if dug else c
				_marks.draw_line(at - Vector2(7, 7), at + Vector2(7, 7), xc, 3.0, true)
				_marks.draw_line(at - Vector2(7, -7), at + Vector2(7, -7), xc, 3.0, true)
				if _scale > 0.05 or hot:
					_name(small, at + Vector2(10, 4), ("\u2713 " if dug else "") + str(m["name"]), 11, ink, false, hot)
			"pin":
				_marks.draw_line(at, at - Vector2(0, 18), ink, 1.6, true)
				_marks.draw_circle(at - Vector2(0, 20), 6.0, c)
				_name(small, at + Vector2(8, -14), str(m["name"]), 11, ink, false, true)
		if hot:
			_marks.draw_arc(at, 14.0, 0.0, TAU, 32, Color(0.75, 0.2, 0.18, 0.8), 2.0, true)
	# Her: a hull mark pointing the way she is going, and her wake behind.
	var me: Vector2 = to_screen(sea._boat.position)
	var dir: Vector2 = Vector2.from_angle(sea._boat.heading)
	for j: int in 5:
		_marks.draw_circle(me - dir * (8.0 + j * 7.0), 3.0 - j * 0.45, Color(1, 1, 1, 0.45 - j * 0.08))
	var pts: PackedVector2Array = PackedVector2Array([me + dir * 12.0, me - dir * 7.0 + dir.orthogonal() * 7.0, me - dir * 3.0, me - dir * 7.0 - dir.orthogonal() * 7.0])
	_marks.draw_circle(me, 16.0 + 3.0 * sin(_t * 3.0), Color(0.75, 0.2, 0.18, 0.18))
	_marks.draw_colored_polygon(pts, Color(0.75, 0.2, 0.18))
	_marks.draw_polyline(PackedVector2Array([pts[0], pts[1], pts[2], pts[3], pts[0]]), ink, 1.2, true)
	# The compass rose, bottom right.
	_rose(Vector2(size.x - 90, size.y - 140), 42.0, ink)
	# The hover note.
	if not _hover.is_empty():
		var at2: Vector2 = to_screen(_hover["at"])
		var dist: float = sea._boat.position.distance_to(_hover["at"])
		var secs: float = dist / maxf(1.0, Boat.SPEED * sea._boat.hull * sea._boat.boat_speed * 0.92)
		var note: String = "%s  ·  about %s" % [_hover["name"], Course.eta_text(secs)]
		var w: float = small.get_string_size(note, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
		var box: Rect2 = Rect2(at2 + Vector2(16, -34), Vector2(w + 16, 22))
		_marks.draw_rect(box, Color(Kit.PAPER, 0.95))
		_marks.draw_rect(box, Color(ink, 0.5), false, 1.0)
		_marks.draw_string(small, box.position + Vector2(8, 16), note, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, ink)


var _taken: Array[Rect2] = []


## Draw a name unless it would land on one already drawn (hovered marks
## always get theirs).
func _name(font: Font, at: Vector2, text: String, size_px: int, col: Color, centred: bool, force: bool = false) -> void:
	var w: float = font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size_px).x
	var pos: Vector2 = at - Vector2(w / 2.0, 0) if centred else at
	var rect: Rect2 = Rect2(pos - Vector2(2, size_px), Vector2(w + 4, size_px + 4))
	if not force:
		for r: Rect2 in _taken:
			if r.intersects(rect):
				return
	_taken.append(rect)
	_marks.draw_string(font, pos + Vector2(1, 1), text, HORIZONTAL_ALIGNMENT_LEFT, -1, size_px, Color(0.96, 0.92, 0.84, 0.7))
	_marks.draw_string(font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size_px, col)


func _rose(c: Vector2, r: float, ink: Color) -> void:
	_marks.draw_circle(c, r * 1.05, Color(0.93, 0.89, 0.8, 0.6))
	_marks.draw_arc(c, r, 0.0, TAU, 48, Color(ink, 0.6), 1.2, true)
	for k: int in 8:
		var a: float = k * TAU / 8.0 - PI / 2.0
		var long: float = r * (0.95 if k % 2 == 0 else 0.6)
		var tip: Vector2 = c + Vector2.from_angle(a) * long
		var side: Vector2 = Vector2.from_angle(a + PI / 2.0) * r * 0.12
		var fill: Color = Color(0.7, 0.2, 0.17) if k == 0 else Color(ink, 0.75 if k % 2 == 0 else 0.45)
		_marks.draw_colored_polygon(PackedVector2Array([c + side, tip, c - side]), fill)
	_marks.draw_string(Kit.font("cinzel", 700), c + Vector2(-5, -r - 6), "N", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, ink)


# ── Clicking ───────────────────────────────────────────────────────────────────

func _click(s: Vector2) -> void:
	var m: Dictionary = _pick(s)
	if m.is_empty():
		# Open water: set the course there straight away (GPS), and say so.
		_set_course(to_world(s), "A spot on the chart", false)
		return
	_open_card(m)


func _xp() -> float:
	return Js.num(sea.session.profile().get("fishing_xp"))


func _set_course(w: Vector2, name: String, sail: bool) -> void:
	if sea._course.set_to(w, name, sail):
		Sound.bell()


func _open_card(m: Dictionary) -> void:
	if _card != null:
		_card.queue_free()
	_card = Pane.new({ "radius": 14, "fill": [Color(Kit.PAPER, 0.97)], "border": [1, Color(0.24, 0.18, 0.13, 0.5)], "shadow": [Color(0, 0, 0, 0.3), 18, Vector2(0, 6)], "pad": 18 })
	_card.anchor_left = 1.0
	_card.anchor_right = 1.0
	_card.offset_left = -360
	_card.offset_right = -28
	_card.offset_top = 90
	add_child(_card)
	var v: VBoxContainer = VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)
	_card.add_child(v)
	var dist: float = SeaRoute.length_of(SeaRoute.plan(sea._boat.position, m["at"]))
	var secs: float = dist / maxf(1.0, Boat.SPEED * sea._boat.hull * sea._boat.boat_speed * 0.92)
	var eyebrow: String = { "port": "Port", "isle": "Isle", "portal": "The Homestead Portal", "regular": "One of the regulars", "buyer": "Buyer",
		"stranger": "Wanderer", "mate": "Crewmate", "hotspot": "Hotspot", "salter": "Salter", "dig": "Buried", "pin": "Your pin" }.get(m["kind"], "")
	var ink: Color = Color(0.22, 0.17, 0.13)
	Kit.text(v, eyebrow, "eyebrow", Color(0.6, 0.35, 0.18))
	Kit.text(v, str(m["name"]), "title", ink)
	for line: String in _card_lines(m):
		Kit.text(v, line, "small", Color(ink, 0.85), true)
	if dist > 0.0:
		Kit.text(v, "About %s from her, by the course round the land." % Course.eta_text(secs), "small", Color(ink, 0.6), true)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	v.add_child(row)
	var go: Button = ink_button("Set course")
	go.visible = Rules.skill_block(_xp(), "set_course") == ""
	go.pressed.connect(func() -> void:
		_set_course(m["at"], str(m["name"]), false)
		_card.queue_free()
		_card = null)
	row.add_child(go)
	var sail: Button = ink_button("Set course & sail", true)
	sail.visible = go.visible and Rules.skill_block(_xp(), "autopilot") == ""
	sail.pressed.connect(func() -> void:
		_set_course(m["at"], str(m["name"]), true)
		close())
	row.add_child(sail)
	if m["kind"] == "pin":
		var rm: Button = ink_button("Remove pin")
		rm.pressed.connect(func() -> void:
			_pins.remove_at(int(m["data"]["i"]))
			_save_pins()
			_card.queue_free()
			_card = null)
		v.add_child(rm)
	else:
		var pin: Button = ink_button("Drop a pin here")
		pin.pressed.connect(func() -> void:
			_pins.append({ "x": (m["at"] as Vector2).x, "y": (m["at"] as Vector2).y, "name": "Pin: %s" % m["name"] })
			_save_pins()
			_card.queue_free()
			_card = null)
		v.add_child(pin)
	Kit.modal_in(_card)


func _card_lines(m: Dictionary) -> Array:
	var d: Dictionary = m["data"]
	match m["kind"]:
		"port":
			return [Chart.dock_label(d) + "."]
		"isle":
			var been: bool = Js.includes(sea.session.save.get("discoveries", []), d["id"])
			return ["%s  ·  %s" % [str(d["band"]).replace("_", " ").capitalize(), "Been ashore" if been else "Not yet landed"],
				"A note post." if d["kind"] == "note" else "A chest waits ashore."]
		"portal":
			return ["Reaches %s." % Portal.tier_def(sea._portal.tier).get("name", "the Shallows") if sea._portal.live else "Dead water. It wants a portal stone."]
		"regular":
			var f: Dictionary = Folk.by_id(str(d.get("folkId", "")))
			return [str(f.get("blurb", f.get("role", "")))]
		"buyer":
			return ["Takes the whole hold at %d%% of market value." % int(round(float(d.get("rate", 0.8)) * 100.0))]
		"stranger":
			return [str(Rules.data()["traders"]["kindLabel"].get(d.get("kind", ""), "")), "They will have moved on by tomorrow."]
		"salter":
			return ["Buys the whole hold at %d%% of market value." % int(round(float(d["rate"]) * 100.0)), "Here today; moved on by tomorrow."]
		"mate":
			return ["Sailing in your Charter."]
		"hotspot":
			var left: float = maxf(0.0, (float(d["endsAt"]) - Clock.now_ms()) / 60000.0)
			var tier: Array = Hotspots.DEFS[d["kind"]]["tiers"][int(d["tier"]) - 1]
			return [str(tier[1]), "Gone in %d minutes." % int(ceil(left))]
		"dig":
			return ["Dug." if d["dug"] else "Something lies on the bottom here. Sail over it and drop the grapple."]
		"pin":
			return ["Your own mark on the chart."]
	return []
