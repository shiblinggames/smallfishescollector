class_name Room
extends Control
## A ROOM ASHORE (Godot port of the shell the web's rooms share: RoomHeader,
## BackPill and the page column, docking). The Market and the Tackle Shop are
## rooms: full screen over the chart, a backdrop, a centred column that
## scrolls, and THE shared menu header (M1, Paper.header) on a strip of paper:
## an eyebrow and the title on the left, a badge and the back pill ("The Sea")
## on the right. Escape or the pad's B is the back pill. Subclasses build into
## `col` in `_build()` and may rebuild with `rebuild()` after anything
## changes. A room fades in and out (Motion).

signal closed

const INK: Color = Kit.INK
const SUB: Color = Kit.DIM
const GOLD: Color = Kit.GOLD
const COL_W: float = 980.0

var session: Session
var title: String = ""
## A small line over the title (optional).
var eyebrow: String = ""
var back_label: String = "The Sea"
## The room's colour: its eyebrows and selections.
var accent: Color = Kit.GOLD
var col: VBoxContainer
var header_badge: Control = null
var _scroll: ScrollContainer
var _toast: Pane
var _toast_l: Label
## Toasts waiting their turn: [text, colour].
var _toasts: Array = []
var _toasting: bool = false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.make()
	set_meta("paper_room", true)
	modulate.a = 0.0
	Motion.ease_fade(create_tween(), self, "modulate:a", 1.0, Motion.PANEL_FADE)
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

	# The toast: a slip of paper with inked words (Room.toast).
	_toast = Pane.new({ "radius": Kit.R_SMALL, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.35)], "shadow": [Color(0, 0, 0, 0.3), 14, Vector2(0, 4)], "pad": [18, 8, 18, 9], "paper": true })
	_toast.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_toast_l = Kit.text(_toast, "", "body_strong", Kit.PAPER_INK)
	_toast_l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_toast_l.custom_minimum_size = Vector2(0, 0)
	_toast_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_toast.anchor_left = 0.5
	_toast.anchor_right = 0.5
	_toast.anchor_top = 1.0
	_toast.anchor_bottom = 1.0
	_toast.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_toast.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_toast.offset_top = -80
	_toast.offset_bottom = -40
	_toast.visible = false
	add_child(_toast)
	rebuild()
	Motion.panel_in(_scroll)


## What stands behind the column. Rooms override it with their own picture.
func _backdrop() -> void:
	var bg: ColorRect = ColorRect.new()
	bg.color = Kit.BASE
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


## THE shared header (M1): a strip of paper with Paper.header on it, the back
## pill on the far right.
func _header() -> void:
	var strip: Pane = Kit.pane(col, { "radius": Kit.R_LARGE, "fill": [Kit.PAPER], "border": [1, Color(Kit.PAPER_INK, 0.3)], "shadow": [Color(0, 0, 0, 0.25), 12, Vector2(0, 3)], "pad": [22, 12, 14, 8], "paper": true })
	var h: Dictionary = Paper.header(strip, title, eyebrow, _back, [], null, Callable(), back_label, "")
	var badge: Control = _badge()
	if badge != null:
		(h["right"] as HBoxContainer).add_child(badge)
	var gap: Control = Control.new()
	gap.custom_minimum_size = Vector2(0, 4)
	col.add_child(gap)


func _badge() -> Control:
	return null


## Leave the room (or, in a room with sections, go back a level).
func _back() -> void:
	close()


func close() -> void:
	if Motion.closing(self):
		return
	closed.emit()
	Motion.ease_exit(create_tween(), self, "modulate:a", 0.0, Motion.PANEL_OUT)
	Motion.dismiss(self, _scroll)


## A word to the player: a paper slip at the foot of the room, inked (fg is
## the colour it would be on the dark, inked for the paper). Toasts queue; the
## same words twice in a row are dropped.
func toast(text: String, fg: Color = GOLD) -> void:
	if text == "":
		return
	if (_toasting and _toast_l.text == text) or _toasts.any(func(q: Array) -> bool: return q[0] == text):
		return
	_toasts.append([text, fg])
	if not _toasting:
		_next_toast()


func _next_toast() -> void:
	if _toasts.is_empty() or not is_inside_tree():
		_toasting = false
		return
	_toasting = true
	var q: Array = _toasts.pop_front()
	_toast_l.text = q[0]
	Kit.style(_toast_l, "body_strong", q[1])
	_toast_l.custom_minimum_size = Vector2(minf(560.0, _toast_l.get_theme_font("font").get_string_size(q[0], HORIZONTAL_ALIGNMENT_LEFT, -1, Kit.role_px("body_strong")).x + 4.0), 0)
	_toast.reset_size()
	_toast.visible = true
	await Motion.note_in(_toast)
	if not is_inside_tree():
		return
	await get_tree().create_timer(Motion.NOTE_IN + Motion.NOTE_HOLD).timeout
	if not is_inside_tree():
		return
	var tw: Tween = Motion.note_out(_toast, false)
	if tw != null:
		await tw.finished
	if is_inside_tree():
		_next_toast()


func _process(_delta: float) -> void:
	pass


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fish_back"):
		get_viewport().set_input_as_handled()
		_back()


# ── Pieces (on the style kit) ─────────────────────────────────────────────────

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
static func heading(parent: Control, t: String, c: Color = Color(Kit.DIM, Kit.EYEBROW_ALPHA), _px: int = 12) -> Label:
	return Kit.text(parent, t, "eyebrow", c)


## An image, fitted inside a box of this size, centred.
static func picture(parent: Control, url: Variant, size_px: Vector2, grey: bool = false) -> TextureRect:
	var r: TextureRect = TextureRect.new()
	r.texture = Skipper.tex(url)
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	r.custom_minimum_size = size_px
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if grey:
		# Known but not owned: the grey pencil every screen uses (Kit.grey).
		Kit.grey(r)
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
