class_name Paper
extends RefCounted
## PAPER AND INK (Kong, 2026-10-01: the menus move off the dark kit onto
## painted paper and wood, to match the world chart and the watercolour sea).
##
## The pieces every paper screen shares: a sheet (fx/paper.gdshader, grained,
## tea-stained, deckled), a watercolour blot to set art on, ink buttons, ink
## text, and the item tile (a blot, the art, a name, and a hand-drawn ring in
## red ink round the one you wear). Inks and pigments are named here so the
## screens cannot drift.

const INK: Color = Color(0.22, 0.17, 0.13)
const INK_SOFT: Color = Color(0.40, 0.33, 0.26)
const INK_FAINT: Color = Color(0.55, 0.48, 0.40)
const RED: Color = Color(0.66, 0.2, 0.15)
const GREEN: Color = Color(0.22, 0.48, 0.3)
const PAPER: Color = Color(0.93, 0.89, 0.80)
const WOOD: Color = Color(0.42, 0.28, 0.17)
## The rarity pigments: the kit's rarity hues, as watercolour on paper.
const RARITY: Array[Color] = [Color(0.52, 0.56, 0.6), Color(0.3, 0.6, 0.38), Color(0.28, 0.48, 0.74), Color(0.55, 0.36, 0.72), Color(0.84, 0.56, 0.16)]

static var _mat_cache: Shader


static func rarity(r: float) -> Color:
	return RARITY[clampi(int(r) - 1, 0, 4)]


static func _shader() -> Shader:
	if _mat_cache == null:
		_mat_cache = load("res://game/fx/paper.gdshader")
	return _mat_cache


## A sheet of paper filling its parent (or sized by the caller).
static func sheet(parent: Control, deckle: float = 7.0, stain: float = 1.0, tint: Color = PAPER) -> ColorRect:
	var r: ColorRect = ColorRect.new()
	r.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var m: ShaderMaterial = ShaderMaterial.new()
	m.shader = _shader()
	m.set_shader_parameter("u_deckle", deckle)
	m.set_shader_parameter("u_stain", stain)
	m.set_shader_parameter("u_paper", tint)
	m.set_shader_parameter("u_seed", randf() * 50.0)
	r.material = m
	r.resized.connect(func() -> void: m.set_shader_parameter("u_size", r.size))
	parent.add_child(r)
	return r


## A watercolour blot of pigment, filling its parent.
static func blot(parent: Control, pigment: Color, strength: float = 1.0) -> ColorRect:
	var r: ColorRect = sheet(parent, 0.0, 0.0)
	var m: ShaderMaterial = r.material
	m.set_shader_parameter("u_wash", Color(pigment, strength))
	return r


static func text(parent: Node, t: String, role: String, col: Color = INK, wrap: bool = false) -> Label:
	return Kit.text(parent, t, role, col, wrap)


## A button of paper (or, on, of stained wood) with inked capitals.
static func button(label: String, on: bool = false) -> Pane.PaneButton:
	var n: Dictionary = { "radius": 9, "fill": [Color(0.55, 0.36, 0.2, 0.9) if on else Color(0.95, 0.91, 0.82, 0.95)], "border": [1, Color(INK, 0.5)], "shadow": [Color(0, 0, 0, 0.16), 6, Vector2(0, 2)], "pad": [12, 6, 12, 7] }
	var hv: Dictionary = n.duplicate()
	hv["fill"] = [Color(0.62, 0.42, 0.24, 0.95) if on else Color(0.99, 0.96, 0.89, 1.0)]
	hv["border"] = [1, Color(INK, 0.8)]
	var b: Pane.PaneButton = Pane.PaneButton.new(n, hv)
	b.text = label.to_upper()
	b.add_theme_font_override("font", Kit.tracked("karla", 700, 11, 0.08))
	b.add_theme_font_size_override("font_size", 11)
	var c: Color = Color(0.98, 0.94, 0.86) if on else INK
	for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(st, c)
	b.add_theme_color_override("font_disabled_color", Color(c, 0.4))
	b.custom_minimum_size = Vector2(0, 32)
	b.focus_mode = Control.FOCUS_NONE
	Kit.tap(b)
	return b


## A rule drawn in ink, a little uneven.
static func rule(parent: Control) -> Control:
	var c: Control = Control.new()
	c.custom_minimum_size = Vector2(0, 8)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	c.draw.connect(func() -> void:
		var w: float = c.size.x
		var pts: PackedVector2Array = PackedVector2Array()
		for i: int in 25:
			var x: float = w * i / 24.0
			pts.append(Vector2(x, 4.0 + sin(i * 1.7) * 0.5))
		c.draw_polyline(pts, Color(INK, 0.3), 1.0, true))
	parent.add_child(c)
	return c


## A label and a value on one line, in ink.
static func stat(parent: Node, label: String, value: String, tone: Color = INK) -> HBoxContainer:
	var h: HBoxContainer = HBoxContainer.new()
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(h)
	var l: Label = text(h, label, "small", INK_SOFT)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text(h, value, "value", tone)
	return h


## AN ITEM ON PAPER: a watercolour blot in its pigment, the art on it, its name
## under, a corner note (a count, a price), and the red ink ring when worn.
class Tile:
	extends Button
	var on: bool = false
	var pigment: Color = Color(0.4, 0.55, 0.62)
	var art: Texture2D
	var label: String = ""
	var corner: String = ""
	var dim: bool = false
	var _t: float = 0.0
	var _hot: float = 0.0
	var _pic: TextureRect

	func _ready() -> void:
		flat = true
		focus_mode = Control.FOCUS_ALL
		var empty: StyleBoxEmpty = StyleBoxEmpty.new()
		for st: String in ["normal", "hover", "pressed", "focus", "disabled", "hover_pressed"]:
			add_theme_stylebox_override(st, empty)
		var holder: Control = Control.new()
		holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		holder.offset_bottom = -24
		add_child(holder)
		Paper.blot(holder, pigment, 0.9 if not dim else 0.4)
		_pic = TextureRect.new()
		_pic.texture = art
		_pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		_pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		_pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		_pic.offset_left = 10
		_pic.offset_right = -10
		_pic.offset_top = 8
		_pic.offset_bottom = -6
		_pic.pivot_offset = Vector2(0, 0)
		_pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if dim:
			_pic.modulate = Color(1, 1, 1, 0.55)
		holder.add_child(_pic)
		var n: Label = Paper.text(self, label, "small", Paper.RED if on else Paper.INK)
		n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		n.clip_text = true
		n.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		n.anchor_top = 1.0
		n.anchor_bottom = 1.0
		n.anchor_right = 1.0
		n.offset_top = -22
		n.offset_left = 2
		n.offset_right = -2
		n.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if corner != "":
			var c: Label = Paper.text(self, corner, "value", Paper.INK)
			c.anchor_left = 1.0
			c.anchor_right = 1.0
			c.offset_left = -60
			c.offset_right = -4
			c.offset_top = 2
			c.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		mouse_entered.connect(func() -> void: _hot = 1.0)
		mouse_exited.connect(func() -> void: _hot = 0.0)
		focus_entered.connect(func() -> void: _hot = 1.0)
		focus_exited.connect(func() -> void: _hot = 0.0)
		Kit.tap(self)

	func _process(delta: float) -> void:
		_t += delta
		var k: float = 1.0 - exp(-delta * 14.0)
		var s: float = lerpf(_pic.scale.x, 1.0 + 0.07 * _hot, k)
		_pic.pivot_offset = _pic.size / 2.0
		_pic.scale = Vector2(s, s)
		_pic.rotation = lerpf(_pic.rotation, sin(_t * 2.2) * 0.035 * _hot, k)
		if on:
			queue_redraw()

	## The worn one is circled in red ink, by hand: an ellipse that does not
	## quite close, wobbling a little as if the pen were still on it.
	func _draw() -> void:
		if not on:
			return
		var c: Vector2 = Vector2(size.x / 2.0, (size.y - 24.0) / 2.0 + 2.0)
		var r: Vector2 = Vector2(size.x * 0.47, (size.y - 24.0) * 0.5)
		var pts: PackedVector2Array = PackedVector2Array()
		var n: int = 48
		for i: int in n + 6:
			var a: float = -2.2 + TAU * i / float(n)
			var wob: float = 1.0 + sin(a * 3.0 + 1.3) * 0.03 + sin(a * 7.0 + _t * 0.6) * 0.008 + (i / float(n)) * 0.04
			pts.append(c + Vector2(cos(a) * r.x, sin(a) * r.y) * wob)
		draw_polyline(pts, Color(Paper.RED, 0.8), 2.2, true)
