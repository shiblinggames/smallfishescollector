class_name Sheet
extends Control
## THE SHEET A MENU OPENS INTO (Godot port of the Sheet in
## app/(app)/sea/FishingHere.tsx, on the style kit).
##
## One shell so the menus cannot drift into slightly different modals: the
## kit's scrim, the kit's modal pane rising in (from the bottom, or centred
## when wide), an eyebrow, the title and blurb, THE close button, and a body
## that scrolls. Escape, the pad's B, a press on the scrim or the close button
## all close it.

signal closed

var title: String = ""
var blurb: String = ""
var eyebrow: String = ""
var accent: Color = Kit.SAND
var wide: bool = false
var body: VBoxContainer
var _panel: Pane


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	var shade: ColorRect = Kit.scrim(self)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
			close())
	_panel = Kit.pane(self, Kit.modal(accent, 18))
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
	col.add_theme_constant_override("separation", 8)
	_panel.add_child(col)
	var head: HBoxContainer = HBoxContainer.new()
	col.add_child(head)
	var titles: VBoxContainer = VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_theme_constant_override("separation", 2)
	head.add_child(titles)
	if eyebrow != "":
		Kit.text(titles, eyebrow, "eyebrow", Kit.a(accent, 0.75))
	Kit.text(titles, title, "title")
	if blurb != "":
		Kit.text(titles, blurb, "note", Kit.DIM, true)
	var x: Button = Kit.close_button()
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
	_panel.offset_top += 22.0
	_panel.offset_bottom += 22.0
	var tw: Tween = create_tween().set_parallel(true)
	tw.tween_property(_panel, "modulate:a", 1.0, 0.16)
	tw.tween_property(_panel, "offset_top", y0, 0.32).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(_panel, "offset_bottom", y0 + h, 0.32).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	x.grab_focus.call_deferred()


func close() -> void:
	closed.emit()
	queue_free()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()


## A plain label, for screens not yet on the kit's roles: Cinzel 700 when
## title_font, else Karla 400.
static func text(parent: Control, t: String, px: int, col: Color, title_font: bool = false, wrap: bool = false) -> Label:
	var l: Label = Label.new()
	l.text = t
	l.add_theme_font_size_override("font_size", px)
	l.add_theme_color_override("font_color", col)
	l.add_theme_font_override("font", Kit.font("cinzel", 700) if title_font else Kit.font("karla", 400))
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.custom_minimum_size = Vector2(300, 0)
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(l)
	return l


## A section heading: the kit's eyebrow in the sheet's accent.
func section(t: String) -> void:
	var pad: Control = Control.new()
	pad.custom_minimum_size = Vector2(0, 8)
	body.add_child(pad)
	if t != "":
		Kit.text(body, t, "eyebrow", Kit.a(accent, 0.7))


## A key on the left, its value on the right ('good' green, 'warn' amber).
func stat(k: String, v: String, tone: String = "") -> void:
	Kit.stat_row(body, k, v, tone)


func note(t: String) -> void:
	Kit.text(body, t, "note", Kit.DIM, true)
