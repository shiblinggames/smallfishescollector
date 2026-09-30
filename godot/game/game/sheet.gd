class_name Sheet
extends Control
## THE SHEET THE ROD'S MENUS OPEN INTO (Godot port of the Sheet in
## app/(app)/sea/FishingHere.tsx, fishing pass 3).
##
## One shell so the menus cannot drift into slightly different modals: a dimmed
## backdrop, an opaque panel that springs up (from the bottom, or centred when
## wide), the title and blurb, a close button, and a body that scrolls. Escape,
## the pad's B, a press on the backdrop or the close button all close it.

signal closed

var title: String = ""
var blurb: String = ""
var wide: bool = false
var body: VBoxContainer
var _panel: PanelContainer


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0.008, 0.03, 0.055, 0.62)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			close())
	add_child(shade)
	_panel = PanelContainer.new()
	var s: StyleBoxFlat = StyleBoxFlat.new()
	s.bg_color = Color(0.04, 0.063, 0.086, 0.98)
	s.border_color = Color(0.7, 0.84, 0.91, 0.28)
	s.set_border_width_all(1)
	s.set_corner_radius_all(18)
	s.set_content_margin_all(18)
	s.shadow_color = Color(0, 0, 0, 0.6)
	s.shadow_size = 24
	_panel.add_theme_stylebox_override("panel", s)
	add_child(_panel)
	var vp: Vector2 = get_viewport_rect().size
	var w: float = minf(1060.0, vp.x - 40.0) if wide else 560.0
	var h: float = vp.y * (0.86 if wide else 0.7)
	_panel.anchor_left = 0.5
	_panel.anchor_right = 0.5
	_panel.anchor_top = 0.5 if wide else 1.0
	_panel.anchor_bottom = _panel.anchor_top
	_panel.offset_left = -w / 2.0
	_panel.offset_right = w / 2.0
	_panel.offset_top = -h / 2.0 if wide else -h - 20.0
	_panel.offset_bottom = h / 2.0 if wide else -20.0
	var col: VBoxContainer = VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	_panel.add_child(col)
	var head: HBoxContainer = HBoxContainer.new()
	col.add_child(head)
	var titles: VBoxContainer = VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(titles)
	Sheet.text(titles, title, 20, Color("#f2ead8"), true)
	if blurb != "":
		Sheet.text(titles, blurb, 14, Color("#9fb4c2"), false, true)
	var x: Button = Button.new()
	x.text = "✕"
	x.custom_minimum_size = Vector2(36, 36)
	x.pressed.connect(close)
	head.add_child(x)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(scroll)
	body = VBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 6)
	scroll.add_child(body)
	_panel.pivot_offset = Vector2(w / 2.0, h / 2.0)
	_panel.modulate.a = 0.0
	var y0: float = _panel.offset_top
	_panel.offset_top += 26.0
	_panel.offset_bottom += 26.0
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(_panel, "modulate:a", 1.0, 0.15)
	tw.tween_property(_panel, "offset_top", y0, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(_panel, "offset_bottom", y0 + h, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	x.grab_focus.call_deferred()


func close() -> void:
	closed.emit()
	queue_free()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()


static func text(parent: Control, t: String, px: int, col: Color, title_font: bool = false, wrap: bool = false) -> Label:
	var l: Label = Label.new()
	l.text = t
	l.add_theme_font_size_override("font_size", px)
	l.add_theme_color_override("font_color", col)
	if title_font:
		l.add_theme_font_override("font", UiTheme.title_font())
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.custom_minimum_size = Vector2(300, 0)
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(l)
	return l


## SheetLabel: a small upper-case heading over a section.
func section(t: String) -> void:
	var l: Label = Sheet.text(body, t.to_upper(), 11, Color(0.75, 0.83, 0.89, 0.5))
	l.add_theme_constant_override("line_spacing", 4)
	var pad: Control = Control.new()
	pad.custom_minimum_size = Vector2(0, 6)
	body.add_child(pad)
	body.move_child(pad, l.get_index())


## StatRow: a key on the left, its value on the right ('good' green, 'warn' amber).
func stat(k: String, v: String, tone: String = "") -> void:
	var row: HBoxContainer = HBoxContainer.new()
	body.add_child(row)
	var kl: Label = Sheet.text(row, k, 14, Color(0.75, 0.83, 0.89, 0.72))
	kl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var col: Color = Color("#7fd6a0") if tone == "good" else (Color("#e8c98a") if tone == "warn" else Color("#f2ead8"))
	Sheet.text(row, v, 15, col)


func note(t: String) -> void:
	Sheet.text(body, t, 13, Color("#9fb4c2"), false, true)
