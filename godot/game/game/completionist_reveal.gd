class_name CompletionistReveal
extends Control
## THE COMPLETIONIST'S CLAIM (Godot port of the claim reveal in
## TackleShopClient.tsx, docking): full screen, a prism fan of rays turning
## slowly behind the rod (one turn in 30s), three rings spreading out, the
## rod, its name in the prism's gold, the line, and its gifts arriving one
## by one. A press anywhere, or any key, once they are in, continues.

const PRISM: Array[Color] = [Color("#f26d6d"), Color("#f2c14e"), Color("#57d06a"), Color("#5aa9f0")]

var gifts: Array[String] = []
var rod_name: String = "Completionist Rod"
var _t: float = 0.0
var _done: bool = false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	var v: VBoxContainer = VBoxContainer.new()
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_theme_constant_override("separation", 8)
	v.custom_minimum_size = Vector2(560, 0)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	center.add_child(v)
	var k: Label = Room.text(v, "COMPLETIONIST", 13, Color(1, 1, 1, 0.7))
	k.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	Room.picture(v, "rod_completionist_thumb.png", Vector2(0, 230))
	var n: Label = Room.text(v, rod_name, 30, PRISM[1], true)
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var line: Label = Room.text(v, "You have seen every fish the sea holds. Every gift it gave you now folds into one rod, yours to forge as you please.", 15, Color("#d8d2c4"), false, true)
	line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var flow: HFlowContainer = HFlowContainer.new()
	flow.alignment = FlowContainer.ALIGNMENT_CENTER
	flow.add_theme_constant_override("h_separation", 6)
	flow.add_theme_constant_override("v_separation", 6)
	v.add_child(flow)
	for i: int in gifts.size():
		var c: Color = PRISM[i % PRISM.size()]
		var chip: PanelContainer = Room.chip(flow, gifts[i], c, Color(c, 0.12), Color(c, 0.4), 13)
		chip.modulate.a = 0.0
		var tw: Tween = create_tween()
		tw.tween_interval(1.0 + i * 0.22)
		tw.tween_property(chip, "modulate:a", 1.0, 0.3)
	var go: Label = Room.text(v, "Press to continue", 13, Color(1, 1, 1, 0.55))
	go.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	go.modulate.a = 0.0
	var tg: Tween = create_tween()
	tg.tween_interval(1.4 + gifts.size() * 0.22)
	tg.tween_property(go, "modulate:a", 1.0, 0.4)
	tg.tween_callback(func() -> void: _done = true)
	modulate.a = 0.0
	create_tween().tween_property(self, "modulate:a", 1.0, 0.3)


func _process(delta: float) -> void:
	_t += delta
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.02, 0.02, 0.04, 0.94))
	var c: Vector2 = size / 2.0 + Vector2(0, -40)
	var spin: float = _t / 30.0 * TAU
	var reach: float = size.length()
	for i: int in 24:
		var a0: float = spin + TAU * i / 24.0
		var a1: float = a0 + TAU / 24.0 * 0.45
		var col: Color = PRISM[i % PRISM.size()]
		draw_colored_polygon(PackedVector2Array([c, c + Vector2.from_angle(a0) * reach, c + Vector2.from_angle(a1) * reach]), Color(col, 0.07))
	for k: int in 3:
		var age: float = fmod(_t * 0.5 + k / 3.0, 1.0)
		draw_arc(c, 60.0 + age * 420.0, 0.0, TAU, 96, Color(PRISM[k], (1.0 - age) * 0.35), 2.0, true)


func _gui_input(event: InputEvent) -> void:
	if _done and event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		queue_free()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_pressed() and not event.is_echo() and (event is InputEventKey or event is InputEventJoypadButton):
		get_viewport().set_input_as_handled()
		if _done:
			queue_free()
