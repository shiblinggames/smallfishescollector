class_name AncientScenes
extends Control
## THE ANCIENT DEEP'S CEREMONY (Godot port of AncientSlainCinematic, FinnScene,
## AncientRankUp and VigilCapstone, fishing pass 3). One scene at a time, each a
## full-screen moment that ends with `done`:
##   slain     a giant's first landing: letterbox, rings, the giant rising, its
##             name and the count of the six ("The Apex Falls" for Megalodon,
##             "The Wall Is Complete" at six); closes itself after 2.9s (3.4s)
##   finn      Finn's words for that giant, a line at a time
##   rank_up   a released giant brought back on a perfect: its new rank and frame
##   capstone  all six mastered: the wall lights in gold, then the pet it pays

signal done

const FRAME: Dictionary = {
	1: ["Rope and driftwood", "#c08a5a"], 2: ["Iron banding", "#b8c4d0"], 3: ["Verdigris brass", "#2dd4bf"],
	4: ["Blood-dark", "#e0455a"], 5: ["Struck in gold", "#fbcc4a"],
}
const ROMAN: Array[String] = ["", "I", "II", "III", "IV", "V", "VI"]

var kind: String = "slain"
var data: Dictionary = {}
var _t: float = 0.0
var _lines: Array = []
var _line_i: int = 0
var _typed: int = 0
## Time on the current line (s): its pause and its typing count from here, not
## from the scene's start.
var _line_t: float = 0.0
var _at: PackedFloat32Array = PackedFloat32Array()
var _text: Label
var _col: VBoxContainer
var _closable: bool = false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	_col = VBoxContainer.new()
	_col.alignment = BoxContainer.ALIGNMENT_CENTER
	_col.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_col.add_theme_constant_override("separation", 10)
	add_child(_col)
	match kind:
		"slain":
			_slain()
		"finn":
			_finn()
		"rank_up":
			_rank_up()
		"capstone":
			_capstone()


func _label(text: String, px: int, col: Color, title: bool = true, wrap: bool = false) -> Label:
	var l: Label = Sheet.text(_col, text, px, col, title, wrap)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if wrap:
		l.custom_minimum_size = Vector2(640, 0)
		l.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	return l


func _art(path: String, h: float) -> TextureRect:
	var t: TextureRect = TextureRect.new()
	t.texture = Skipper.tex(path)
	t.custom_minimum_size = Vector2(0, h)
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_col.add_child(t)
	return t


func _rise(n: Control, from_y: float, seconds: float) -> void:
	n.modulate.a = 0.0
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(n, "modulate:a", 1.0, seconds * 0.5)
	n.position.y += from_y
	tw.tween_property(n, "position:y", n.position.y - from_y, seconds).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


# ── The giant slain ────────────────────────────────────────────────────────────

func _slain() -> void:
	var count: int = int(data["count"])
	var total: int = int(data.get("total", 6))
	var apex: bool = float(data["id"]) == 143.0 or count >= total
	var accent: Color = Color("#fb7185") if apex else Color("#a855f7")
	Rumble.buzz([60, 40, 60, 40, 120] if apex else [40, 30, 90])
	var eyebrow: String = "The Apex Falls" if float(data["id"]) == 143.0 else ("The Wall Is Complete" if count >= total else "Ancient Slain")
	_label(eyebrow.to_upper(), 16, accent)
	var art: TextureRect = _art("fish/%s" % ResultCard.fish_art_path(data["name"]).get_file(), 240)
	art.pivot_offset = Vector2(size.x / 2.0, 120)
	art.scale = Vector2(0.7, 0.7)
	var tw: Tween = create_tween()
	tw.tween_property(art, "scale", Vector2(1.06, 1.06), 0.6)
	tw.tween_property(art, "scale", Vector2.ONE, 0.3)
	_label(data["name"], 40, Color("#fdf4e3"))
	_label("%s / %s" % [ROMAN[clampi(count, 0, 6)], ROMAN[clampi(total, 0, 6)]], 20, accent)
	_label("Every giant on the wall" if count >= total else "Giants of the Ancient Deep", 15, Color(1, 1, 1, 0.6), false)
	_closable = true
	get_tree().create_timer(3.4 if apex else 2.9).timeout.connect(_finish)


# ── Finn ───────────────────────────────────────────────────────────────────────

func _finn() -> void:
	var bg: TextureRect = TextureRect.new()
	bg.texture = Skipper.tex("scenes/last-fathom.jpg")
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.modulate = Color(1.0, 1.0, 1.0)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)
	move_child(bg, 0)
	# Finn, facing the captain (his avatar is mirrored on the web too).
	var finn: TextureRect = TextureRect.new()
	finn.texture = Skipper.tex("finn_portrait.png")
	finn.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	finn.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	finn.flip_h = (Rules.data()["finnAvatar"] as Dictionary).get("mirrored", true)
	finn.size = Vector2(440, 320)
	finn.position = Vector2(size.x * 0.1, size.y * 0.5 - 200.0)
	finn.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(finn)
	var beat: Dictionary = data["beat"]
	_lines = beat["lines"]
	var accent: Color = Color(beat.get("accent", "#c8a060"))
	_col.alignment = BoxContainer.ALIGNMENT_END
	_col.offset_left = size.x * 0.42
	_col.offset_right = -60
	_col.offset_bottom = -90
	var plate: Label = _label("FINN", 14, accent)
	plate.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_text = _label("", 24, Color("#f2ecdd"), false, true)
	_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_text.size_flags_horizontal = Control.SIZE_FILL
	_text.custom_minimum_size = Vector2(minf(640.0, size.x * 0.5), 0)
	var hint: Label = _label("Press to continue", 12, Color(1, 1, 1, 0.45), false)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_start_line(0)


## Emphasis in the lines is *starred*; drawn plain, the stars dropped.
static func _plain(t: String) -> String:
	return t.replace("*", "")


func _start_line(i: int) -> void:
	_line_i = i
	_typed = 0
	_line_t = 0.0
	if i < _lines.size():
		_at = TypedLine.schedule(_plain(String((_lines[i] as Dictionary)["text"])))


func _advance() -> void:
	if _typed < _at.size():
		_typed = _at.size()
		return
	_start_line(_line_i + 1)
	if _line_i >= _lines.size():
		_finish()


# ── The rank-up ────────────────────────────────────────────────────────────────

func _rank_up() -> void:
	var from: int = int(data["from"])
	var to: int = int(data["to"])
	var fr: Array = FRAME[clampi(to, 1, 5)]
	var accent: Color = Color(fr[1])
	Rumble.buzz([30, 40, 60] if to >= 4 else [20, 40])
	_label("IT COMES UP", 13, Color(1, 1, 1, 0.55))
	_label("Mastered" if to >= 5 else "Mounted", 22, accent)
	var art: TextureRect = _art("fish/%s" % ResultCard.fish_art_path(data["name"]).get_file(), 190)
	art.modulate = Color(0.35, 0.35, 0.35)
	var reveal: Tween = create_tween()
	reveal.tween_interval([0, 0, 0.9, 1.05, 1.2, 1.5][clampi(to, 0, 5)])
	reveal.tween_property(art, "modulate", Color.WHITE, 0.32)
	if to >= 5:
		var m: ShaderMaterial = ShaderMaterial.new()
		m.shader = load("res://game/golden.gdshader")
		reveal.tween_callback(func() -> void: art.material = m)
	_label(data["name"], 30, Color("#fdf4e3"))
	_label("Rank V · Struck in gold" if to >= 5 else "Rank %s → %s" % [ROMAN[from], ROMAN[to]], 18, accent)
	_label(fr[0], 14, Color(1, 1, 1, 0.6), false)
	_label("It has nothing left to teach you. The wall keeps it in gold." if to >= 5 else "Back on the wall, and heavier than it was. Let it go again when you want the next rung.", 15, Color(1, 1, 1, 0.75), false, true)
	_label("Press to continue", 12, Color(1, 1, 1, 0.45), false)
	_closable = true


# ── The capstone ───────────────────────────────────────────────────────────────

func _capstone() -> void:
	_label("THE LONG VIGIL", 16, Color("#fbcc4a"))
	var grid: GridContainer = GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 16)
	grid.add_theme_constant_override("v_separation", 12)
	grid.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_col.add_child(grid)
	var counter: Label = _label("0 of 6", 16, Color(1, 1, 1, 0.7), false)
	var tiles: Array[TextureRect] = []
	for id: float in Vigil.ANCIENT_IDS:
		var f: Variant = (data["species"] as Callable).call(id)
		var t: TextureRect = TextureRect.new()
		t.texture = Skipper.tex("fish/%s" % ResultCard.fish_art_path((f as Dictionary)["name"] if f != null else "").get_file())
		t.custom_minimum_size = Vector2(180, 100)
		t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		t.modulate = Color(0.3, 0.3, 0.3)
		grid.add_child(t)
		tiles.append(t)
	var tw: Tween = create_tween()
	for i: int in tiles.size():
		tw.tween_interval(0.42 if i == 0 else 0.3)
		var t: TextureRect = tiles[i]
		var n: int = i + 1
		tw.tween_callback(func() -> void:
			var m: ShaderMaterial = ShaderMaterial.new()
			m.shader = load("res://game/golden.gdshader")
			t.material = m
			t.modulate = Color.WHITE
			counter.text = "%d of 6" % n)
	tw.tween_interval(0.7)
	tw.tween_callback(func() -> void:
		counter.text = "All six, mastered"
		Rumble.buzz([0, 18, 40, 22]))
	tw.tween_interval(0.62)
	tw.tween_callback(func() -> void:
		for c: Node in _col.get_children():
			c.queue_free()
		_label("THE VIGIL IS KEPT", 16, Color("#e0455a"))
		var pet: TextureRect = _art("plesiosaur_baby.png", 210)
		_rise(pet, 120.0, 1.15)
		_label("Baby Plesiosaurus", 32, Color("#fdf4e3"))
		_label("Earned, never found", 14, Color("#e0455a"), false)
		_label("It rides the bow, so it sails alongside whatever pet you already keep. No crate will ever hand out another.", 15, Color(1, 1, 1, 0.75), false, true)
		_label("Press to continue", 12, Color(1, 1, 1, 0.45), false)
		_closable = true)


# ── Shared ─────────────────────────────────────────────────────────────────────

func _process(delta: float) -> void:
	_t += delta
	if kind == "finn" and _text != null and _line_i < _lines.size():
		_line_t += delta
		var line: String = _plain(String((_lines[_line_i] as Dictionary)["text"]))
		var ms: float = (_line_t - Js.num((_lines[_line_i] as Dictionary).get("pause")) / 1000.0) * 1000.0
		while _typed < _at.size() and _at[_typed] <= ms:
			_typed += 1
		_text.text = line.substr(0, _typed)
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.02, 0.01, 0.03, 0.92) if kind != "finn" else Color(0, 0, 0, 0.35))
	if kind == "slain" or kind == "rank_up":
		var bars: float = size.y * 0.13 * clampf(_t / 0.5, 0.0, 1.0)
		draw_rect(Rect2(0, 0, size.x, bars), Color.BLACK)
		draw_rect(Rect2(0, size.y - bars, size.x, bars), Color.BLACK)
		var c: Vector2 = size / 2.0
		for n: int in 3:
			var u: float = clampf((_t - 0.15 * n) / 1.2, 0.0, 1.0)
			if u > 0.0 and u < 1.0:
				draw_arc(c, 130.0 * lerpf(1.0, 2.4, u), 0.0, TAU, 96, Color(0.66, 0.33, 0.97, 0.5 * (1.0 - u)), 2.0, true)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		_press()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_act") or event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		_press()


func _press() -> void:
	if kind == "finn":
		_advance()
	elif _closable and _t > 0.5:
		_finish()


func _finish() -> void:
	if is_queued_for_deletion():
		return
	done.emit()
	queue_free()
