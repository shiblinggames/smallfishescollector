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
	return minf(size.x / 47000.0, size.y / 30000.0) if size.x > 0.0 else 0.03


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
	me.pressed.connect(func() -> void: _center = sea._boat.position)
	right.add_child(me)
	var left_ms: float = Portal.recall_left_ms(sea.session.profile(), "fishing")
	var rc: Button = ink_button("Recall home" if left_ms <= 0.0 else "Recall in %dm" % int(ceil(left_ms / 60000.0)), left_ms <= 0.0)
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
	var hint: Label = Kit.text(self, "Click the water to set a course  ·  click a mark for more  ·  wheel to zoom, drag to move  ·  M to close", "small", Color(0.3, 0.25, 0.2))
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
		Kit.text(row, "%s  ·  %d%%  ·  isles %d/%d  ·  dug %d/%d" % [w["name"], int(round(100.0 * seen / maxf(1.0, total))), got, isles.size(), gd, sites.size()], "small", ink)
		var bar: Kit.Bar = Kit.bar(row, float(seen) / maxf(1.0, total), Color(0.3, 0.5, 0.62), true)
		bar.custom_minimum_size.x = 240


## A button in the chart's own hand: ink on paper.
static func ink_button(text: String, on: bool = false) -> Pane.PaneButton:
	var ink: Color = Color(0.24, 0.18, 0.13)
	var n: Dictionary = { "radius": 9, "fill": [Color(0.55, 0.36, 0.2, 0.85) if on else Color(0.93, 0.88, 0.78, 0.92)], "border": [1, Color(ink, 0.55)], "shadow": [Color(0, 0, 0, 0.18), 6, Vector2(0, 2)], "pad": [12, 6, 12, 7] }
	var hv: Dictionary = n.duplicate()
	hv["fill"] = [Color(0.62, 0.42, 0.24, 0.9) if on else Color(0.97, 0.93, 0.85, 0.96)]
	var b: Pane.PaneButton = Pane.PaneButton.new(n, hv)
	b.text = text.to_upper()
	b.add_theme_font_override("font", Kit.tracked("karla", 700, 11, 0.08))
	b.add_theme_font_size_override("font_size", 11)
	var c: Color = Color(0.98, 0.94, 0.86) if on else ink
	for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(st, c)
	b.add_theme_color_override("font_disabled_color", Color(c, 0.4))
	b.custom_minimum_size = Vector2(0, 32)
	b.focus_mode = Control.FOCUS_NONE
	Kit.tap(b)
	return b


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
			_scale_to = clampf(_scale_to * (1.18 if mb.button_index == MOUSE_BUTTON_WHEEL_UP else 1.0 / 1.18), _fit_scale() * 0.9, 0.3)
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
		for k: String in sea._mates:
			var m: Shipmate = sea._mates[k]
			out.append({ "kind": "mate", "at": m.position, "name": m.mate_name, "color": Color(0.25, 0.45, 0.75), "data": {} })
	if _layers["hotspots"]:
		for h: Dictionary in Hotspots.at_time(now):
			out.append({ "kind": "hotspot", "at": Vector2(float(h["x"]), float(h["y"])), "name": _hotspot_name(h), "color": _hotspot_color(h), "data": h })
	if _layers["weather"]:
		for s: Dictionary in Weather.squalls(now):
			out.append({ "kind": "squall", "at": Weather.pos(s, now), "name": "A squall", "color": Color(0.3, 0.32, 0.38), "data": s })
	if _layers["finds"]:
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
			"squall":
				var sr: float = float(m["data"]["r"]) * _scale
				for j: int in 3:
					_marks.draw_circle(at + Vector2.from_angle(_t * 0.2 + j * 2.1) * sr * 0.18, sr * (0.75 - j * 0.12), Color(0.18, 0.2, 0.26, 0.10))
				_marks.draw_arc(at, sr * 0.45, _t * 0.6, _t * 0.6 + 4.2, 40, Color(0.2, 0.22, 0.28, 0.5), 2.0, true)
				var v: Vector2 = Vector2(float(m["data"]["vx"]), float(m["data"]["vy"])).normalized()
				_marks.draw_line(at, at + v * sr * 0.6, Color(0.2, 0.22, 0.28, 0.6), 2.0, true)
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
		_marks.draw_rect(box, Color(0.95, 0.91, 0.82, 0.95))
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


func _set_course(w: Vector2, name: String, sail: bool) -> void:
	if sea._course.set_to(w, name, sail):
		Sound.bell()


func _open_card(m: Dictionary) -> void:
	if _card != null:
		_card.queue_free()
	_card = Pane.new({ "radius": 14, "fill": [Color(0.95, 0.91, 0.82, 0.97)], "border": [1, Color(0.24, 0.18, 0.13, 0.5)], "shadow": [Color(0, 0, 0, 0.3), 18, Vector2(0, 6)], "pad": 18 })
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
		"stranger": "Wanderer", "mate": "Crewmate", "hotspot": "Hotspot", "squall": "Weather", "dig": "Buried", "pin": "Your pin" }.get(m["kind"], "")
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
	go.pressed.connect(func() -> void:
		_set_course(m["at"], str(m["name"]), false)
		_card.queue_free()
		_card = null)
	row.add_child(go)
	var sail: Button = ink_button("Set course & sail", true)
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
		"mate":
			return ["Sailing in your Charter."]
		"hotspot":
			var left: float = maxf(0.0, (float(d["endsAt"]) - Clock.now_ms()) / 60000.0)
			var tier: Array = Hotspots.DEFS[d["kind"]]["tiers"][int(d["tier"]) - 1]
			return [str(tier[1]), "Gone in %d minutes." % int(ceil(left))]
		"squall":
			return ["Rain, rough water and a dark sky, drifting at %d px a second. Pays nothing; rides hard." % int(Vector2(float(d["vx"]), float(d["vy"])).length())]
		"dig":
			return ["Dug." if d["dug"] else "Something lies on the bottom here. Sail over it and drop the grapple."]
		"pin":
			return ["Your own mark on the chart."]
	return []
