class_name ChartWorld
extends HBoxContainer
## THE WORLD CHART (Godot port of chart-room/WorldChartCard and the web's
## charting map): a painted sea under a drifting fog. Your lifetime charting
## points burn it off landmark by landmark; an uncovered landmark glows until
## you claim it, and claiming it burns the fog back there, letters its name on
## the chart and pays a skin voucher (port rules: Bosun's for the first ten,
## Captain's for the last three, one more Captain's for the whole sea).
##
## ON THE CHART SHEET (THE CHART ROOM AS A PLACE, Kong 2026-10-10): the
## painted map lies large on the sheet (the map is the game's own chart, not a
## backdrop), its thirteen landmarks listed beside it as ink words with their
## vouchers and a flat Claim. THE MOTION: a claim burns the fog back from the
## landmark, its name-ribbon UNFURLS (a flat paper ribbon with an ink rim,
## wiped open from its middle with a touch past and back) and the name writes
## itself in; the voucher it pays flies off the map to the charted count over
## the sheet, which counts on. The NEXT landmark still in the fog wears a
## faint ink ring with its progress drawn round it in the room's teal and
## the points still wanted written under it.

const SIDE_W: float = 420.0

var room: ChartStudy
var _st: Dictionary = {}
var _area: Control
var _map: TextureRect
var _pins: Control
var _mat: ShaderMaterial
var _aspect: float = 0.8
var _burn: Dictionary = {}
## When each landmark's ribbon began to unfurl (a fresh claim).
var _unfurl: Dictionary = {}
var _t: float = 0.0
var _list: VBoxContainer
var _busy: bool = false
var _msg: Label


func _ready() -> void:
	add_theme_constant_override("separation", 40)
	_area = Control.new()
	# The map and its list sit together in the middle of the sheet.
	alignment = BoxContainer.ALIGNMENT_CENTER
	resized.connect(_size_area)
	_area.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_area.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_area.resized.connect(_fit)
	add_child(_area)
	var tex: Texture2D = Skipper.tex("chartingmap.webp")
	_aspect = float(tex.get_width()) / float(tex.get_height()) if tex != null else 0.8
	_map = TextureRect.new()
	_map.texture = tex
	_map.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_map.stretch_mode = TextureRect.STRETCH_SCALE
	_mat = ShaderMaterial.new()
	_mat.shader = preload("res://game/fx/chart_fog_holes.gdshader")
	_mat.set_shader_parameter("aspect", _aspect)
	var nz: NoiseTexture2D = NoiseTexture2D.new()
	nz.seamless = true
	nz.width = 256
	nz.height = 256
	var fn: FastNoiseLite = FastNoiseLite.new()
	fn.frequency = 0.012
	fn.fractal_octaves = 4
	nz.noise = fn
	_mat.set_shader_parameter("noise_tex", nz)
	_map.material = _mat
	_area.add_child(_map)
	# A thin ink rim round the map, as a chart pasted on the sheet.
	var rim: Control = Control.new()
	rim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	rim.draw.connect(func() -> void: rim.draw_rect(Rect2(Vector2(-3, -3), rim.size + Vector2(6, 6)), Color(ChartStudy.SHEET_INK, 0.45), false, 1.0))
	_map.add_child(rim)
	_pins = Control.new()
	_pins.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_pins.mouse_filter = Control.MOUSE_FILTER_STOP
	_pins.draw.connect(_draw_pins)
	_pins.gui_input.connect(_board_input)
	_map.add_child(_pins)
	var side: VBoxContainer = VBoxContainer.new()
	side.custom_minimum_size = Vector2(SIDE_W, 0)
	side.add_theme_constant_override("separation", 8)
	add_child(side)
	ChartStudy.inked(side, "THE WORLD CHART", "eyebrow", Paper.RED)
	ChartStudy.inked(side, "Your charting points, banked by every puzzle and never spent, burn the fog off the sea one landmark at a time. Each landmark you uncover pays a skin voucher when you claim it; chart the whole sea for one more.", "note", ChartStudy.SHEET_INK_SOFT, true)
	_msg = ChartStudy.inked(side, "", "body_strong", Paper.RED, true)
	Paper.rule(side, false)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	side.add_child(scroll)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 6)
	scroll.add_child(_list)
	_load()
	# Already charted: burned clear from the start.
	for l: Dictionary in ChartRoom.landmarks():
		if _claimed(int(l["id"])):
			_burn[int(l["id"])] = 1.0
	_push_holes()


## The area as wide as the map at the view's full height (or narrower, to
## leave the list its room).
func _size_area() -> void:
	var h: float = minf(size.y, (size.x - SIDE_W - 40.0) / _aspect)
	_area.custom_minimum_size = Vector2(floorf(h * _aspect), 0)


## The map as large as the area holds, its aspect kept, at the area's top.
func _fit() -> void:
	var a: Vector2 = _area.size
	var h: float = minf(a.y, a.x / _aspect)
	var w: float = h * _aspect
	_map.position = Vector2(floorf((a.x - w) / 2.0), 0.0)
	_map.size = Vector2(w, h)


func _load() -> void:
	_st = RulesApi.run(room.session.store, room.session.uid, "getWorldChartState", [])
	for c: Node in _list.get_children():
		c.queue_free()
	for l: Dictionary in ChartRoom.landmarks():
		var id: int = int(l["id"])
		var found: bool = float(_st["points"]) >= float(l["threshold"])
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		_list.add_child(row)
		var icon: TextureRect = TextureRect.new()
		icon.texture = Skipper.tex(str(Skins.kind_def(ChartRoom.voucher_for(id)).get("art", "")))
		icon.custom_minimum_size = Vector2(30, 30)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.modulate = Color(1, 1, 1, 1.0 if found and not _claimed(id) else 0.45)
		row.add_child(icon)
		var v: VBoxContainer = VBoxContainer.new()
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.add_theme_constant_override("separation", 0)
		row.add_child(v)
		ChartStudy.inked(v, str(l["name"]) if found else "Somewhere in the fog", "body_strong", ChartStudy.SHEET_INK if found else ChartStudy.SHEET_INK_SOFT)
		var status: String
		if _claimed(id):
			status = "Charted"
		elif found:
			status = "Uncovered: claim it"
		else:
			status = "%d points" % int(l["threshold"])
		ChartStudy.inked(v, status, "small", Paper.RED if found and not _claimed(id) else ChartStudy.SHEET_INK_SOFT)
		if found and not _claimed(id):
			var b: Pane.PaneButton = ChartStudy.primary("Claim")
			b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			b.pressed.connect(func() -> void: _claim(l))
			row.add_child(b)


func _claimed(id: int) -> bool:
	return (_st["claimed"] as Array).any(func(x: Variant) -> bool: return int(x) == id)


func _push_holes() -> void:
	var holes: Array = []
	for l: Dictionary in ChartRoom.landmarks():
		var b: float = float(_burn.get(int(l["id"]), 0.0))
		holes.append(Vector4(float(l["x"]), float(l["y"]), float(l["r"]), b))
	_mat.set_shader_parameter("holes", holes)


func _board_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var p: Vector2 = (e as InputEventMouseButton).position
		for l: Dictionary in ChartRoom.landmarks():
			var at: Vector2 = Vector2(float(l["x"]), float(l["y"])) * _pins.size
			if p.distance_to(at) < 34.0 and float(_st["points"]) >= float(l["threshold"]) and not _claimed(int(l["id"])):
				_claim(l)
				return


func _claim(l: Dictionary) -> void:
	if _busy:
		return
	_busy = true
	var r: Variant = await room.session.act("claimLandmark", [l["id"]])
	room.session.persist()
	_busy = false
	var res: Dictionary = r if r is Dictionary else {}
	if res.has("error"):
		ChartStudy.say(_msg, str(res["error"]))
		return
	var id: int = int(l["id"])
	_st["claimed"] = res["claimed"]
	Sound.chest(true)
	Rumble.buzz([0, 40, 30, 70])
	# The fog burns back from the landmark, and its ribbon unfurls.
	var tw: Tween = create_tween()
	tw.tween_method(func(u: float) -> void:
		_burn[id] = u
		_push_holes(), 0.0, 1.0, 1.4).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	_unfurl[id] = _t + 0.35
	var kinds: Array = Js.list(res.get("vouchers"))
	var names: Array = kinds.map(func(k: Variant) -> String: return str(Skins.kind_def(str(k)).get("name", k)))
	var said: String = "%s charted.%s" % [l["name"], (" %s in your Trunk." % " and ".join(PackedStringArray(names))) if not names.is_empty() else ""]
	if res.get("completed", false):
		said += " The whole sea is charted!"
	ChartStudy.say(_msg, said, Paper.GREEN)
	_load()
	# The vouchers it paid fly off the map to the charted count, one after
	# another; the count moves on as the first lands.
	var at: Vector2 = _pins.get_global_rect().position + Vector2(float(l["x"]), float(l["y"])) * _pins.size
	if kinds.is_empty():
		room.refresh_strip(true)
	for k: int in kinds.size():
		var art: Texture2D = Skipper.tex(str(Skins.kind_def(str(kinds[k])).get("art", "")))
		var landed: Callable = func() -> void:
			if is_instance_valid(room):
				room.refresh_strip(true)
		get_tree().create_timer(0.7 + 0.25 * k).timeout.connect(func() -> void:
			if is_instance_valid(room):
				room.fly("", at, room.charted_point(), Kit.SEA_GOLD, landed if k == 0 else Callable(), art))


func _process(delta: float) -> void:
	_t += delta
	_pins.queue_redraw()


## The next landmark still in the fog (or none).
func _next() -> Dictionary:
	for l: Dictionary in ChartRoom.landmarks():
		if float(_st["points"]) < float(l["threshold"]):
			return l
	return {}


func _draw_pins() -> void:
	var f: Font = Kit.font("cinzel", 800)
	var nxt: Dictionary = _next()
	var prev_at: float = 0.0
	for l: Dictionary in ChartRoom.landmarks():
		if not nxt.is_empty() and int(l["id"]) == int(nxt["id"]):
			break
		prev_at = float(l["threshold"])
	for l: Dictionary in ChartRoom.landmarks():
		var id: int = int(l["id"])
		var at: Vector2 = Vector2(float(l["x"]), float(l["y"])) * _pins.size
		var found: bool = float(_st["points"]) >= float(l["threshold"])
		if found and not _claimed(id):
			# Uncovered, unclaimed: a gold beacon pulsing through the fog.
			var g: float = 0.5 + 0.5 * sin(_t * 3.0 + float(id))
			_pins.draw_circle(at, 26.0 + 6.0 * g, Color(1.0, 0.8, 0.3, 0.18 + 0.12 * g))
			_pins.draw_circle(at, 12.0, Color(0.95, 0.7, 0.25))
			_pins.draw_arc(at, 18.0 + 6.0 * g, 0.0, TAU, 32, Color(0.85, 0.6, 0.2, 0.8), 2.0, true)
			_ribbon(at + Vector2(0, -34), "Claim", 1.0, 13, Paper.RED)
		elif _claimed(id):
			# Charted: its ribbon (the newest one unfurls and writes itself in).
			var k: float = 1.0
			if _unfurl.has(id):
				k = clampf((_t - float(_unfurl[id])) / 1.1, 0.0, 1.0)
			_ribbon(at + Vector2(0, 30), str(l["name"]), k, 13, ChartStudy.SHEET_INK)
		elif not nxt.is_empty() and id == int(nxt["id"]):
			# The next in the fog: a faint ring, its progress drawn round it.
			var frac: float = clampf((float(_st["points"]) - prev_at) / maxf(1.0, float(nxt["threshold"]) - prev_at), 0.0, 1.0)
			_pins.draw_arc(at, 20.0, 0.0, TAU, 40, Color(ChartStudy.SHEET_INK, 0.35), 1.5, true)
			if frac > 0.0:
				_pins.draw_arc(at, 20.0, -PI / 2.0, -PI / 2.0 + TAU * frac, 40, Kit.ink(ChartStudy.TEAL), 4.0, true)
			var s: String = "%d more" % int(float(nxt["threshold"]) - float(_st["points"]))
			var w: float = f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x
			_pins.draw_string_outline(f, at + Vector2(-w / 2.0, 42), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, 5, Color(Kit.PAPER, 0.85))
			_pins.draw_string(f, at + Vector2(-w / 2.0, 42), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, ChartStudy.SHEET_INK)


## A NAME-RIBBON: a flat paper strip with an ink rim and the words inked on
## it, centred on `at`. k (0 to 1) unfurls it: the strip wipes open from its
## middle (a touch past its width and back), then the words write in.
func _ribbon(at: Vector2, s: String, k: float, px: int, ink: Color) -> void:
	if k <= 0.0:
		return
	var f: Font = Kit.font("cinzel", 800)
	var tw: float = f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
	var full: Vector2 = Vector2(tw + 18.0, px + 10.0)
	var open: float = clampf(k / 0.45, 0.0, 1.0)
	var e: float = 1.0 + 2.2 * pow(open - 1.0, 3.0) + 1.2 * pow(open - 1.0, 2.0)
	var w: float = full.x * e
	var r: Rect2 = Rect2(at - Vector2(w, full.y) / 2.0, Vector2(w, full.y))
	var sb: StyleBoxFlat = StyleBoxFlat.new()
	sb.bg_color = Color(Kit.PAPER.lightened(0.3), 0.95)
	sb.set_corner_radius_all(3)
	sb.border_color = Color(ChartStudy.SHEET_INK, 0.55)
	sb.set_border_width_all(1)
	sb.anti_aliasing = true
	_pins.draw_style_box(sb, r)
	# The ribbon's tails, folded back at each end.
	var tl: float = 7.0
	for side: float in [-1.0, 1.0]:
		var x: float = at.x + side * w / 2.0
		_pins.draw_colored_polygon(PackedVector2Array([Vector2(x, r.position.y + 3), Vector2(x + side * tl, r.position.y + 1), Vector2(x + side * (tl - 4.0), r.get_center().y + 2), Vector2(x + side * tl, r.end.y + 3), Vector2(x, r.end.y - 3)]), Color(Kit.PAPER.darkened(0.08), 0.95 * open))
	var wk: float = clampf((k - 0.4) / 0.6, 0.0, 1.0)
	if wk <= 0.0:
		return
	var shown: String = s.substr(0, int(ceil(s.length() * wk)))
	_pins.draw_string(f, Vector2(at.x - tw / 2.0, at.y + f.get_ascent(px) * 0.36), shown, HORIZONTAL_ALIGNMENT_LEFT, -1, px, ink)


## For tests/shot.gd (CHART_PLAY): claim the first landmark waiting.
func play_for_shot(_how: String) -> void:
	for l: Dictionary in ChartRoom.landmarks():
		if float(_st["points"]) >= float(l["threshold"]) and not _claimed(int(l["id"])):
			_claim(l)
			return
