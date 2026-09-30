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
var col: VBoxContainer
var header_badge: Control = null
var _scroll: ScrollContainer
var _toast: PanelContainer
var _toast_l: Label
var _toast_t: float = 0.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
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

	_toast = PanelContainer.new()
	var ts: StyleBoxFlat = StyleBoxFlat.new()
	ts.bg_color = Color("#1c2030")
	ts.set_corner_radius_all(999)
	ts.content_margin_left = 18
	ts.content_margin_right = 18
	ts.content_margin_top = 8
	ts.content_margin_bottom = 8
	_toast.add_theme_stylebox_override("panel", ts)
	_toast_l = Label.new()
	_toast_l.add_theme_font_override("font", UiTheme.title_font())
	_toast_l.add_theme_color_override("font_color", GOLD)
	_toast.add_child(_toast_l)
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
	left.size_flags_stretch_ratio = 1.0
	row.add_child(left)
	var pill: Button = Room.back_pill(back_label)
	pill.pressed.connect(_back)
	left.add_child(pill)
	var t: Label = Label.new()
	t.text = title
	t.add_theme_font_override("font", UiTheme.title_font())
	t.add_theme_font_size_override("font_size", 24)
	t.add_theme_color_override("font_color", INK)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(t)
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


# ── Pieces ─────────────────────────────────────────────────────────────────────

## BackPill: a dark gold-edged pill with a chevron and the place it goes back to.
static func back_pill(label: String) -> Button:
	var b: Button = Button.new()
	b.text = "‹  " + label.to_upper()
	b.tooltip_text = "Back to %s" % label
	b.add_theme_font_size_override("font_size", 12)
	b.add_theme_color_override("font_color", Color("#e3d8bc"))
	b.add_theme_color_override("font_hover_color", Color("#f4ecd8"))
	var s: StyleBoxFlat = StyleBoxFlat.new()
	s.bg_color = Color(0.13, 0.1, 0.05, 0.92)
	s.border_color = Color(0.77, 0.66, 0.42, 0.5)
	s.set_border_width_all(1)
	s.set_corner_radius_all(999)
	s.content_margin_left = 14
	s.content_margin_right = 16
	s.content_margin_top = 6
	s.content_margin_bottom = 6
	var h: StyleBoxFlat = s.duplicate()
	h.bg_color = Color(0.2, 0.15, 0.08, 0.95)
	b.add_theme_stylebox_override("normal", s)
	b.add_theme_stylebox_override("hover", h)
	b.add_theme_stylebox_override("pressed", h)
	b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return b


static func box(bg: Color, border: Color, radius: int = 14, pad: int = 14, border_w: int = 1) -> StyleBoxFlat:
	var s: StyleBoxFlat = StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(border_w)
	s.set_corner_radius_all(radius)
	s.set_content_margin_all(pad)
	return s


static func panel(parent: Control, style: StyleBoxFlat) -> PanelContainer:
	var p: PanelContainer = PanelContainer.new()
	p.add_theme_stylebox_override("panel", style)
	parent.add_child(p)
	return p


static func text(parent: Control, t: String, px: int, c: Color, title_font: bool = false, wrap: bool = false) -> Label:
	return Sheet.text(parent, t, px, c, title_font, wrap)


## A small rounded chip of text.
static func chip(parent: Control, t: String, fg: Color, bg: Color, border: Color, px: int = 11) -> PanelContainer:
	var s: StyleBoxFlat = box(bg, border, 999, 0)
	s.content_margin_left = 8
	s.content_margin_right = 8
	s.content_margin_top = 2
	s.content_margin_bottom = 3
	var p: PanelContainer = panel(parent, s)
	p.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	p.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var l: Label = Label.new()
	l.text = t
	l.add_theme_font_size_override("font_size", px)
	l.add_theme_color_override("font_color", fg)
	p.add_child(l)
	return p


## A small upper-case heading.
static func heading(parent: Control, t: String, c: Color = Color(0.75, 0.83, 0.89, 0.6), px: int = 12) -> Label:
	var l: Label = text(parent, t.to_upper(), px, c)
	return l


## A flat button in one colour: text and border tinted, a faint fill.
static func tinted(t: String, c: Color, px: int = 14, h: float = 38.0) -> Button:
	var b: Button = Button.new()
	b.text = t
	b.custom_minimum_size = Vector2(0, h)
	b.add_theme_font_size_override("font_size", px)
	b.add_theme_color_override("font_color", c)
	b.add_theme_color_override("font_hover_color", c.lightened(0.25))
	b.add_theme_color_override("font_disabled_color", Color(c, 0.45))
	var s: StyleBoxFlat = box(Color(c, 0.10), Color(c, 0.45), 10, 0)
	s.content_margin_left = 14
	s.content_margin_right = 14
	var hv: StyleBoxFlat = s.duplicate()
	hv.bg_color = Color(c, 0.2)
	var dis: StyleBoxFlat = s.duplicate()
	dis.bg_color = Color(c, 0.04)
	dis.border_color = Color(c, 0.18)
	b.add_theme_stylebox_override("normal", s)
	b.add_theme_stylebox_override("hover", hv)
	b.add_theme_stylebox_override("pressed", hv)
	b.add_theme_stylebox_override("disabled", dis)
	return b


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


## A thin progress bar in one colour.
static func bar(parent: Control, frac: float, c: Color, h: float = 6.0) -> ProgressBar:
	var b: ProgressBar = ProgressBar.new()
	b.show_percentage = false
	b.custom_minimum_size = Vector2(0, h)
	b.max_value = 1.0
	b.step = 0.0
	b.value = clampf(frac, 0.0, 1.0)
	var bg: StyleBoxFlat = box(Color(0.07, 0.08, 0.1, 0.92), Color(0, 0, 0, 0), 999, 0, 0)
	var fill: StyleBoxFlat = box(c, Color(0, 0, 0, 0), 999, 0, 0)
	b.add_theme_stylebox_override("background", bg)
	b.add_theme_stylebox_override("fill", fill)
	parent.add_child(b)
	return b


## Every child of a grid laid into rows of `n`, each cell sharing the width.
static func grid(parent: Control, n: int, gap: int = 10) -> GridContainer:
	var g: GridContainer = GridContainer.new()
	g.columns = n
	g.add_theme_constant_override("h_separation", gap)
	g.add_theme_constant_override("v_separation", gap)
	parent.add_child(g)
	return g
