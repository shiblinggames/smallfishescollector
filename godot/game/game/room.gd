class_name Room
extends Control
## A ROOM ASHORE (Godot port of the shell the web's rooms share: RoomHeader,
## BackPill and the page column, docking). The Market and the Tackle Shop are
## rooms: full screen over the chart, a backdrop, a centred column that
## scrolls, and a header with the back pill on the left ("The Sea"), the title
## in the middle and a badge on the right. Escape or the pad's B is the back
## pill. Subclasses build into `col` in `_build()` and may rebuild with
## `rebuild()` after anything changes.

signal closed

const INK: Color = Color("#f4ecd8")
const SUB: Color = Color("#9a958c")
const GOLD: Color = Color("#f0c040")
const COL_W: float = 980.0

var session: Session
var title: String = ""
var back_label: String = "The Sea"
## The room's colour: the title's glow, its eyebrows and selections.
var accent: Color = Kit.GOLD
var col: VBoxContainer
var header_badge: Control = null
var _scroll: ScrollContainer
var _toast: Pane
var _toast_l: Label
var _toast_t: float = 0.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	set_meta("paper_room", true)
	_backdrop()
	_scroll = ScrollContainer.new()
	_scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(_scroll)
	var center: CenterContainer = CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.use_top_left = false
	_scroll.add_child(center)
	var margin: MarginContainer = MarginContainer.new()
	margin.add_theme_constant_override("margin_top", 22)
	margin.add_theme_constant_override("margin_bottom", 40)
	center.add_child(margin)
	col = VBoxContainer.new()
	col.custom_minimum_size = Vector2(minf(COL_W, get_viewport_rect().size.x - 48.0), 0)
	col.add_theme_constant_override("separation", 10)
	margin.add_child(col)

	_toast = Pane.new({ "radius": 999, "fill": [Color("#1c2030")], "border": [1, Color(1, 1, 1, 0.1)], "shadow": [Color(0, 0, 0, 0.5), 16, Vector2(0, 4)], "pad": [18, 8, 18, 9] })
	_toast_l = Kit.text(_toast, "", "value", GOLD)
	_toast.anchor_left = 0.5
	_toast.anchor_right = 0.5
	_toast.anchor_top = 1.0
	_toast.anchor_bottom = 1.0
	_toast.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_toast.offset_top = -80
	_toast.offset_bottom = -40
	_toast.visible = false
	add_child(_toast)
	rebuild()


## What stands behind the column. Rooms override it with their own picture.
func _backdrop() -> void:
	var bg: ColorRect = ColorRect.new()
	bg.color = Color("#0a0c10")
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)


func _build() -> void:
	pass


func rebuild() -> void:
	var keep: float = _scroll.scroll_vertical
	for c: Node in col.get_children():
		col.remove_child(c)
		c.queue_free()
	_header()
	_build()
	_scroll.set_deferred("scroll_vertical", keep)


func _header() -> void:
	var row: HBoxContainer = HBoxContainer.new()
	row.custom_minimum_size = Vector2(0, 40)
	col.add_child(row)
	var left: HBoxContainer = HBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(left)
	var pill: Button = Kit.back_pill(back_label)
	pill.pressed.connect(_back)
	left.add_child(pill)
	var t: Label = Kit.text(row, title, "title", INK)
	Kit.glow(t, accent)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var right: HBoxContainer = HBoxContainer.new()
	right.alignment = BoxContainer.ALIGNMENT_END
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(right)
	var badge: Control = _badge()
	if badge != null:
		right.add_child(badge)
	var gap: Control = Control.new()
	gap.custom_minimum_size = Vector2(0, 8)
	col.add_child(gap)


func _badge() -> Control:
	return null


## Leave the room (or, in a room with sections, go back a level).
func _back() -> void:
	close()


func close() -> void:
	closed.emit()
	queue_free()


func toast(text: String, fg: Color = GOLD) -> void:
	_toast_l.text = text
	_toast_l.add_theme_color_override("font_color", fg)
	_toast.visible = true
	_toast.modulate.a = 1.0
	_toast_t = 2.5


func _process(delta: float) -> void:
	if _toast_t > 0.0:
		_toast_t -= delta
		_toast.modulate.a = clampf(_toast_t / 0.4, 0.0, 1.0)
		if _toast_t <= 0.0:
			_toast.visible = false


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		_back()


# ── Pieces (on the style kit) ─────────────────────────────────────────────────

## THE back pill (Kit).
static func back_pill(label: String) -> Button:
	return Kit.back_pill(label)


## A flat style, for the few places that set a stylebox directly. Panels made
## with panel() become Kit panes from it.
static func box(bg: Color, border: Color, radius: int = 14, pad: int = 14, border_w: int = 1) -> StyleBoxFlat:
	var s: StyleBoxFlat = StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(border_w)
	s.set_corner_radius_all(radius)
	s.set_content_margin_all(pad)
	return s


## A panel: a Kit pane from a flat style's colours, radius and padding.
static func panel(parent: Control, style: StyleBoxFlat) -> PanelContainer:
	var spec: Dictionary = {
		"radius": style.corner_radius_top_left, "fill": [style.bg_color],
		"pad": [style.content_margin_left, style.content_margin_top, style.content_margin_right, style.content_margin_bottom],
	}
	if style.border_width_left > 0 and style.border_color.a > 0.0:
		spec["border"] = [style.border_width_left, style.border_color]
	return Kit.pane(parent, spec)


static func text(parent: Control, t: String, px: int, c: Color, title_font: bool = false, wrap: bool = false) -> Label:
	return Sheet.text(parent, t, px, c, title_font, wrap)


## THE chip (Kit), in the foreground colour; a faint background reads as quiet.
static func chip(parent: Control, t: String, fg: Color, bg: Color, _border: Color, _px: int = 11) -> PanelContainer:
	return Kit.chip(parent, t, fg, bg.a < 0.08 and fg.a < 0.9)


## A small upper-case heading: the kit's eyebrow.
static func heading(parent: Control, t: String, c: Color = Color(0.75, 0.83, 0.89, 0.6), _px: int = 12) -> Label:
	return Kit.text(parent, t, "eyebrow", c)


## A button in one colour: the kit's accent button (small under 44 tall).
static func tinted(t: String, c: Color, _px: int = 14, h: float = 38.0) -> Button:
	return Kit.button(t, "accent", "large" if h >= 44.0 else "small", c)


## An image, fitted inside a box of this size, centred.
static func picture(parent: Control, url: Variant, size_px: Vector2, grey: bool = false) -> TextureRect:
	var r: TextureRect = TextureRect.new()
	r.texture = Skipper.tex(url)
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	r.custom_minimum_size = size_px
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if grey:
		r.modulate = Color(0.55, 0.55, 0.55, 0.8)
	parent.add_child(r)
	return r


## THE progress bar (Kit); 3 tall or less is the mini.
static func bar(parent: Control, frac: float, c: Color, h: float = 6.0) -> Control:
	return Kit.bar(parent, frac, c, h <= 3.0)


## Every child of a grid laid into rows of `n`, each cell sharing the width.
static func grid(parent: Control, n: int, gap: int = 10) -> GridContainer:
	var g: GridContainer = GridContainer.new()
	g.columns = n
	g.add_theme_constant_override("h_separation", gap)
	g.add_theme_constant_override("v_separation", gap)
	parent.add_child(g)
	return g
