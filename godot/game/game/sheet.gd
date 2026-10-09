class_name Sheet
extends Control
## THE SHEET A MENU OPENS INTO (Godot port of the Sheet in
## app/(app)/sea/FishingHere.tsx, on the style kit).
##
## One shell so the menus cannot drift into slightly different modals: the
## kit's scrim, the kit's modal pane rising in (Motion.panel_in; from the
## bottom, or centred when wide), THE shared header (Paper.header: eyebrow and
## title on the left, "Close  Esc" on the right, the rule), the blurb, and a
## body that scrolls. Escape, the pad's B, a press on the scrim or Close all
## close it (Motion.dismiss: it fades out). Focus goes to the first thing in
## the body only once a pad or the arrow keys are used.

signal closed

var title: String = ""
var blurb: String = ""
var eyebrow: String = ""
var accent: Color = Kit.SAND
var wide: bool = false
var body: VBoxContainer
var _panel: Pane
var _shade: ColorRect
var _pad_focus: bool = false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	_shade = Kit.scrim(self)
	_shade.gui_input.connect(func(e: InputEvent) -> void:
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
	var head: Dictionary = Paper.header(col, title, eyebrow, close)
	if blurb != "":
		Kit.text(head["titles"] as VBoxContainer, blurb, "note", Kit.DIM, true)
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(scroll)
	if Paper.is_night(self):
		UiTheme.night_scroll(scroll)
	body = VBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 6)
	scroll.add_child(body)
	Motion.panel_in(_panel)


func close() -> void:
	if Motion.closing(self):
		return
	closed.emit()
	Motion.dismiss(self, _panel, _shade)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		close()


## The first arrow key or pad press puts focus on the body's first control
## (a mouse never sees a ring).
func _input(event: InputEvent) -> void:
	if _pad_focus or Motion.closing(self):
		return
	var nav: bool = false
	for a: String in ["ui_up", "ui_down", "ui_left", "ui_right", "ui_focus_next"]:
		if event.is_action_pressed(a):
			nav = true
	if not nav:
		return
	_pad_focus = true
	var f: Control = get_viewport().gui_get_focus_owner()
	if f != null and is_ancestor_of(f):
		return
	var first: Control = Sheet.first_focus(body)
	if first == null:
		first = Sheet.first_focus(_panel)
	if first != null:
		first.grab_focus()
		get_viewport().set_input_as_handled()


## The first visible control under `root` that takes focus (depth first).
static func first_focus(root: Node) -> Control:
	if root == null:
		return null
	for c: Node in root.get_children():
		if c is Control and not (c as Control).is_visible_in_tree():
			continue
		if c is Control and (c as Control).focus_mode != Control.FOCUS_NONE and not (c is BaseButton and (c as BaseButton).disabled):
			return c
		var deeper: Control = first_focus(c)
		if deeper != null:
			return deeper
	return null


## A plain label, for screens not yet on the kit's roles: the pixel size goes
## to the nearest role (Kit.role_for_px), its face and tracking; a size well
## off the role's keeps its own px (the floor is 10).
static func text(parent: Control, t: String, px: int, col: Color, title_font: bool = false, wrap: bool = false) -> Label:
	var l: Label = Label.new()
	l.text = t
	var caps: bool = t.length() > 2 and t == t.to_upper() and t != t.to_lower()
	var role: String = Kit.role_for_px(px, title_font, caps)
	Kit.style(l, role, col)
	if absi(Kit.role_px(role) - px) > 1:
		l.add_theme_font_size_override("font_size", maxi(10, px))
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
		Kit.text(body, t, "eyebrow", Kit.a(accent, Kit.EYEBROW_ALPHA))


## A key on the left, its value on the right ('good' green, 'warn' amber).
func stat(k: String, v: String, tone: String = "") -> void:
	Kit.stat_row(body, k, v, tone)


func note(t: String) -> void:
	Kit.text(body, t, "note", Kit.DIM, true)
