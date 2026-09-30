class_name GoldenChoice
extends Control
## THE GOLDEN CHOICE (Godot port of components/GoldenChoice.tsx, fishing pass 2).
##
## A golden fish waits on hold until it is sold or mounted, and this asks. It
## cannot be dismissed (no Escape, no click outside, no close): on the web a
## dismissable choice stranded seventy percent of every golden ever caught.
## It comes up after a golden is landed and whenever the sea opens with one
## still waiting, oldest first; after an answer the next one in line follows.
## No price is shown, as on the web.

signal answered

var session: Session
var golden: Dictionary = {}
var _error: Label
var _busy: bool = false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0.012, 0.024, 0.04, 0.9)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(shade)
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	var card: PanelContainer = PanelContainer.new()
	var s: StyleBoxFlat = StyleBoxFlat.new()
	s.bg_color = Color("#0b0a06")
	s.border_color = Color("#f0c04088")
	s.set_border_width_all(1)
	s.set_corner_radius_all(20)
	s.set_content_margin_all(24)
	s.shadow_color = Color(0.94, 0.75, 0.25, 0.13)
	s.shadow_size = 40
	card.add_theme_stylebox_override("panel", s)
	card.custom_minimum_size = Vector2(420, 0)
	center.add_child(card)
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	card.add_child(col)
	_text(col, "A GOLDEN ONE", 12, Color("#f0c040"), true)
	var art: String = ResultCard.fish_art_path(golden.get("name", ""))
	if ResourceLoader.exists(art):
		var t: TextureRect = TextureRect.new()
		t.texture = load(art)
		t.custom_minimum_size = Vector2(0, 150)
		t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		var m: ShaderMaterial = ShaderMaterial.new()
		m.shader = load("res://game/golden.gdshader")
		t.material = m
		col.add_child(t)
	_text(col, golden.get("name", "A golden fish"), 26, Color("#f6ecd4"), true)
	var mounted: bool = golden.get("alreadyMounted", false)
	_text(col, "You have one of these on the wall already. This one can only be sold." if mounted else "Sell it, or mount it in your Captain's Log. One of each species only.", 15, Color(0.84, 0.78, 0.65, 0.75), false)
	_error = _text(col, "", 14, Color("#f0a890"), false)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	col.add_child(row)
	var sell: Button = Button.new()
	sell.text = "Sell"
	sell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sell.custom_minimum_size = Vector2(0, 48)
	sell.pressed.connect(func() -> void: _answer("sell"))
	row.add_child(sell)
	if not mounted:
		var mount: Button = Button.new()
		mount.text = "Mount it"
		mount.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		mount.size_flags_stretch_ratio = 1.25
		mount.custom_minimum_size = Vector2(0, 48)
		mount.pressed.connect(func() -> void: _answer("mount"))
		row.add_child(mount)
		mount.grab_focus.call_deferred()
	else:
		sell.grab_focus.call_deferred()
	_text(col, "It waits here until you decide. Nothing is lost either way.", 12, Color(1, 1, 1, 0.4), false)
	card.pivot_offset = Vector2(210, 200)
	card.scale = Vector2(0.9, 0.9)
	card.modulate.a = 0.0
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(card, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(card, "modulate:a", 1.0, 0.2)


func _text(parent: Control, text: String, px: int, col: Color, title: bool) -> Label:
	var l: Label = Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", px)
	l.add_theme_color_override("font_color", col)
	if title:
		l.add_theme_font_override("font", UiTheme.title_font())
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	parent.add_child(l)
	return l


func _answer(how: String) -> void:
	if _busy:
		return
	_busy = true
	Rumble.buzz(Rumble.GOLDEN)
	var id: float = float(golden["id"])
	var r: Dictionary = Fishing.sell_golden_trophy(session.store, session.uid, id) if how == "sell" else Fishing.mount_golden_trophy(session.store, session.uid, id)
	session.persist()
	_busy = false
	if r.has("error"):
		_error.text = r["error"]
		return
	answered.emit()
	queue_free()


## Block other input while it is up: the choice has to be made.
func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back") or event.is_action_pressed("fish_act"):
		get_viewport().set_input_as_handled()
