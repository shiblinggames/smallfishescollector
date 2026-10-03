class_name LegendaryUnlock
extends Control
## A LEGENDARY JOINS THE BOARD (Godot port of LegendaryUnlockOverlay): a story
## stop that is a legendary's debut (Mako, Dole, Laz, Mira) puts them in the
## recruit pool. Their card rises out of the dark on slow gold rays, the name
## is pressed in under it, and a line says where to find them. Any press goes
## on once it has landed.

signal finished

const GOLD: Color = Color(1.0, 0.8, 0.36)

var crew: Dictionary = {}
var _t: float = 0.0
var _fx: Control
var _card: TextureRect
var _ready_at: float = 1.2


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var shade: ColorRect = Kit.scrim(self, true)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fx = Control.new()
	_fx.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fx.draw.connect(_draw_rays)
	add_child(_fx)
	var col: VBoxContainer = VBoxContainer.new()
	col.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	col.offset_left = -300
	col.offset_right = 300
	col.offset_top = -330
	col.offset_bottom = 330
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 6)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(col)
	var eb: Label = Kit.text(col, "A LEGENDARY JOINS THE BOARD", "eyebrow", GOLD)
	eb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_card = TextureRect.new()
	_card.texture = Skipper.tex("card-arts/%s.webp" % str(crew.get("filename", "")).get_basename())
	_card.custom_minimum_size = Vector2(0, 420)
	_card.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_card.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(_card)
	var nm: Label = Kit.lift(Kit.text(col, str(crew.get("name", "")), "display", Color(0.98, 0.94, 0.85)))
	nm.add_theme_font_size_override("font_size", 46)
	nm.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var line: Label = Kit.text(col, "%s can now turn up on the Crew Hall's board of hopefuls." % crew.get("name", ""), "body", Color(0.92, 0.88, 0.8), true)
	line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var go: Label = Kit.text(col, "Press to go on", "small", Color(0.9, 0.86, 0.78, 0.55))
	go.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	# In: the card rises and brightens, then the name drops in.
	_card.modulate = Color(0, 0, 0, 0)
	nm.modulate.a = 0.0
	line.modulate.a = 0.0
	go.modulate.a = 0.0
	nm.pivot_offset = Vector2(300, 30)
	nm.scale = Vector2(1.6, 1.6)
	var tw: Tween = create_tween()
	tw.tween_property(_card, "modulate", Color(1, 1, 1, 1), 0.9).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(_card, "position:y", _card.position.y, 0.9).from(_card.position.y + 40.0)
	tw.tween_callback(func() -> void:
		Sound.chest(true)
		Rumble.buzz([0, 30, 40, 50]))
	tw.tween_property(nm, "modulate:a", 1.0, 0.15)
	tw.parallel().tween_property(nm, "scale", Vector2.ONE, 0.22).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_IN)
	tw.tween_property(line, "modulate:a", 1.0, 0.4)
	tw.tween_property(go, "modulate:a", 1.0, 0.4).set_delay(0.6)


func _process(delta: float) -> void:
	_t += delta
	_fx.queue_redraw()


## Slow gold rays turning behind the card, and a warm bloom.
func _draw_rays() -> void:
	var c: Vector2 = size / 2.0 + Vector2(0, -60)
	var grow: float = clampf(_t / 1.0, 0.0, 1.0)
	for k: int in 16:
		var a: float = _t * 0.12 + k * TAU / 16.0
		var len: float = 520.0 * grow
		var p: PackedVector2Array = PackedVector2Array([c, c + Vector2.from_angle(a - 0.06) * len, c + Vector2.from_angle(a + 0.06) * len])
		_fx.draw_colored_polygon(p, Color(GOLD, 0.06 + 0.03 * sin(_t * 1.5 + k)))
	for k: int in 5:
		_fx.draw_circle(c, (260.0 - k * 45.0) * grow, Color(GOLD, 0.035 * (k + 1)))


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		accept_event()
		_go()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_accept") or event.is_action_pressed("fish_back") or event.is_action_pressed("fish_act"):
		get_viewport().set_input_as_handled()
		_go()


func _go() -> void:
	if _t < _ready_at or is_queued_for_deletion():
		return
	var tw: Tween = create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.3)
	tw.tween_callback(func() -> void:
		finished.emit()
		queue_free())
