class_name ChartWorld
extends HBoxContainer
## THE WORLD CHART (Godot port of chart-room/WorldChartCard and the web's
## charting map): a painted sea under a drifting fog. Your lifetime charting
## points burn it off landmark by landmark; an uncovered landmark glows until
## you claim it, and claiming it burns the fog back there, letters its name on
## the chart and pays a skin voucher (port rules: Bosun's for the first ten,
## Captain's for the last three, one more Captain's for the whole sea).

const MAP_H: float = 640.0

var room: ChartStudy
var _st: Dictionary = {}
var _map: TextureRect
var _pins: Control
var _mat: ShaderMaterial
var _burn: Dictionary = {}
var _t: float = 0.0
var _list: VBoxContainer
var _busy: bool = false


func _ready() -> void:
	add_theme_constant_override("separation", 18)
	var wrap: VBoxContainer = room.sheet(self, 14)
	var tex: Texture2D = Skipper.tex("chartingmap.webp")
	var aspect: float = float(tex.get_width()) / float(tex.get_height()) if tex != null else 0.8
	_map = TextureRect.new()
	_map.texture = tex
	_map.custom_minimum_size = Vector2(MAP_H * aspect, MAP_H)
	_map.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_map.stretch_mode = TextureRect.STRETCH_SCALE
	_mat = ShaderMaterial.new()
	_mat.shader = preload("res://game/fx/chart_fog_holes.gdshader")
	_mat.set_shader_parameter("aspect", aspect)
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
	wrap.add_child(_map)
	_pins = Control.new()
	_pins.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_pins.mouse_filter = Control.MOUSE_FILTER_STOP
	_pins.draw.connect(_draw_pins)
	_pins.gui_input.connect(_input)
	_map.add_child(_pins)
	var side: VBoxContainer = room.sheet(self, 18)
	side.get_parent().size_flags_horizontal = Control.SIZE_EXPAND_FILL
	Paper.text(side, "THE WORLD CHART", "eyebrow", Paper.RED)
	Paper.text(side, "Your charting points, banked by every puzzle and never spent, burn the fog off the sea one landmark at a time. Each landmark you uncover pays a skin voucher when you claim it; chart the whole sea for one more.", "note", Paper.INK_SOFT, true)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(0, 470)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	side.add_child(scroll)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 4)
	scroll.add_child(_list)
	_load()
	# Already uncovered: burned clear from the start.
	for l: Dictionary in ChartRoom.landmarks():
		if _claimed(int(l["id"])):
			_burn[int(l["id"])] = 1.0
	_push_holes()


func _load() -> void:
	_st = RulesApi.run(room.session.store, room.session.uid, "getWorldChartState", [])
	for c: Node in _list.get_children():
		c.queue_free()
	for l: Dictionary in ChartRoom.landmarks():
		var id: int = int(l["id"])
		var found: bool = float(_st["points"]) >= float(l["threshold"])
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
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
		Paper.text(v, str(l["name"]) if found else "Somewhere in the fog", "body_strong", Paper.INK if found else Paper.INK_SOFT)
		var status: String
		if _claimed(id):
			status = "Charted"
		elif found:
			status = "Uncovered: claim it on the chart"
		else:
			status = "%d points" % int(l["threshold"])
		Paper.text(v, status, "small", Paper.RED if found and not _claimed(id) else Paper.INK_SOFT)
		if found and not _claimed(id):
			var b: Button = Paper.button("Claim", true)
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


func _input(e: InputEvent) -> void:
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
		room.toast(str(res["error"]))
		return
	var id: int = int(l["id"])
	_st["claimed"] = res["claimed"]
	Sound.chest(true)
	Rumble.buzz([0, 40, 30, 70])
	# The fog burns back from the landmark.
	var tw: Tween = create_tween()
	tw.tween_method(func(u: float) -> void:
		_burn[id] = u
		_push_holes(), 0.0, 1.0, 1.4).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	_pins.set_meta("named", { "id": id, "t": _t })
	var kinds: Array = Js.list(res.get("vouchers"))
	var names: Array = kinds.map(func(k: Variant) -> String: return str(Skins.kind_def(str(k)).get("name", k)))
	room.toast("%s charted%s" % [l["name"], ("  ·  " + " and ".join(PackedStringArray(names)) + " in your Trunk") if not names.is_empty() else ""])
	if res.get("completed", false):
		room.toast("The whole sea is charted!")
	_load()
	room.refresh_strip()


func _process(delta: float) -> void:
	_t += delta
	_pins.queue_redraw()


func _draw_pins() -> void:
	var f: Font = Kit.font("cinzel", 800)
	var named: Dictionary = _pins.get_meta("named", {})
	for l: Dictionary in ChartRoom.landmarks():
		var id: int = int(l["id"])
		var at: Vector2 = Vector2(float(l["x"]), float(l["y"])) * _pins.size
		var found: bool = float(_st["points"]) >= float(l["threshold"])
		if found and not _claimed(id):
			# Uncovered, unclaimed: a gold beacon pulsing through the fog.
			var g: float = 0.5 + 0.5 * sin(_t * 3.0 + float(id))
			_pins.draw_circle(at, 26.0 + 6.0 * g, Color(1.0, 0.8, 0.3, 0.18 + 0.12 * g))
			_pins.draw_circle(at, 12.0, Color(0.95, 0.7, 0.25))
			_pins.draw_arc(at, 18.0 + 6.0 * g, 0.0, TAU, 32, Color(1.0, 0.85, 0.4, 0.8), 2.0, true)
			var s: String = "Claim"
			var w: float = f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
			_pins.draw_string_outline(f, at + Vector2(-w / 2.0, -26), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, 5, Color(0.2, 0.12, 0.05, 0.8))
			_pins.draw_string(f, at + Vector2(-w / 2.0, -26), s, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(1.0, 0.9, 0.6))
		elif _claimed(id):
			# Charted: its name lettered in ink (the newest one writes itself in).
			var k: float = 1.0
			if not named.is_empty() and int(named["id"]) == id:
				k = clampf((_t - float(named["t"]) - 0.5) / 0.9, 0.0, 1.0)
			var nm: String = str(l["name"])
			var shown: String = nm.substr(0, int(ceil(nm.length() * k)))
			var w2: float = f.get_string_size(nm, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x
			var p: Vector2 = at + Vector2(-w2 / 2.0, 30)
			_pins.draw_string_outline(f, p, shown, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, 5, Color(0.97, 0.94, 0.86, 0.85))
			_pins.draw_string(f, p, shown, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(0.25, 0.17, 0.08))
