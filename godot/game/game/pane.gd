class_name Pane
extends PanelContainer
## A PANEL PAINTED THE WAY THE WEB'S CSS PAINTS ONE (Godot port, the style
## kit): a container whose background is pane.gdshader, so a panel can have a
## gradient, a wash of light, a sheen, an inner glow, a border, an accent top
## edge and a soft shadow instead of a flat box. Lays its children out like any
## PanelContainer, inside `pad`.
##
## The look is a spec (a Dictionary), normally one of Kit's named surfaces:
##   radius      corner radius, px
##   fill        [color] or [[color, at 0..1], ...] up to 4; angle, CSS degrees
##   glow        [color, Vector2 centre (fractions), Vector2 radii (fractions)]
##   sheen       alpha of the white band down from the top
##   inset       [color, blur px]
##   border      [width px, color];  top  [width px, color]
##   shadow      [color, blur px, Vector2 offset]
##   pad         px, or [left, top, right, bottom]
##
## To round off what is inside a pane (art in a slab), set clip_children on a
## pane WITHOUT a shadow: the clip is to everything the pane draws, and a
## shadow would make it a dark box.

const SHADER: Shader = preload("res://game/pane.gdshader")

var spec: Dictionary = {}
var _mat: ShaderMaterial


func _init(s: Dictionary = {}) -> void:
	_mat = ShaderMaterial.new()
	_mat.shader = SHADER
	material = _mat
	set_spec(s)
	resized.connect(_sized)


func set_spec(s: Dictionary) -> void:
	spec = s
	Pane.apply(_mat, s)
	var pad: Variant = s.get("pad", 14)
	var box: StyleBoxEmpty = StyleBoxEmpty.new()
	if pad is Array:
		box.content_margin_left = float(pad[0])
		box.content_margin_top = float(pad[1])
		box.content_margin_right = float(pad[2])
		box.content_margin_bottom = float(pad[3])
	else:
		box.set_content_margin_all(float(pad))
	add_theme_stylebox_override("panel", box)
	queue_redraw()


func _sized() -> void:
	_mat.set_shader_parameter("rect_size", size)
	queue_redraw()


func _draw() -> void:
	var m: float = Pane.reach(spec)
	draw_rect(Rect2(Vector2(-m, -m), size + Vector2(m, m) * 2.0), Color.WHITE)


## How far past its rect the pane draws (its shadow).
static func reach(s: Dictionary) -> float:
	var sh: Variant = s.get("shadow")
	if sh == null:
		return 1.0
	var off: Vector2 = sh[2] if (sh as Array).size() > 2 else Vector2.ZERO
	return float(sh[1]) * 1.4 + maxf(absf(off.x), absf(off.y)) + 2.0


## Set a shader material from a spec.
static func apply(m: ShaderMaterial, s: Dictionary) -> void:
	m.set_shader_parameter("radius", float(s.get("radius", 14.0)))
	m.set_shader_parameter("angle", float(s.get("angle", 180.0)))
	var fill: Array = s.get("fill", [Color(0.05, 0.07, 0.09)])
	var stops: Array = []
	for i: int in fill.size():
		var f: Variant = fill[i]
		if f is Array:
			stops.append([f[0], float(f[1])])
		else:
			stops.append([f, 0.0 if fill.size() == 1 else float(i) / float(fill.size() - 1)])
	m.set_shader_parameter("stops", mini(4, stops.size()))
	for i: int in 4:
		var st: Array = stops[mini(i, stops.size() - 1)]
		m.set_shader_parameter("c%d" % i, st[0])
		m.set_shader_parameter("p%d" % i, st[1])
	var glow: Variant = s.get("glow")
	m.set_shader_parameter("glow", glow[0] if glow != null else Color(0, 0, 0, 0))
	if glow != null:
		m.set_shader_parameter("glow_at", glow[1])
		m.set_shader_parameter("glow_r", glow[2])
	m.set_shader_parameter("sheen", float(s.get("sheen", 0.0)))
	var inset: Variant = s.get("inset")
	m.set_shader_parameter("inset", inset[0] if inset != null else Color(0, 0, 0, 0))
	m.set_shader_parameter("inset_blur", float(inset[1]) if inset != null else 0.0)
	var b: Variant = s.get("border")
	m.set_shader_parameter("border", float(b[0]) if b != null else 0.0)
	m.set_shader_parameter("border_color", b[1] if b != null else Color(0, 0, 0, 0))
	var t: Variant = s.get("top")
	m.set_shader_parameter("top_border", float(t[0]) if t != null else 0.0)
	m.set_shader_parameter("top_color", t[1] if t != null else Color(0, 0, 0, 0))
	var sh: Variant = s.get("shadow")
	m.set_shader_parameter("shadow", sh[0] if sh != null else Color(0, 0, 0, 0))
	m.set_shader_parameter("shadow_blur", float(sh[1]) if sh != null else 0.0)
	m.set_shader_parameter("shadow_offset", (sh[2] if (sh as Array).size() > 2 else Vector2.ZERO) if sh != null else Vector2.ZERO)


## A button with a pane behind its text, and a second spec for hover and press.
class PaneButton:
	extends Button
	var normal: Dictionary = {}
	var hot: Dictionary = {}
	var _bg: Pane

	func _init(n: Dictionary, h: Dictionary = {}) -> void:
		normal = n
		hot = h if not h.is_empty() else n
		_bg = Pane.new(n)
		_bg.show_behind_parent = true
		_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		add_child(_bg)
		var empty: StyleBoxEmpty = StyleBoxEmpty.new()
		var pad: Variant = n.get("pad", 12)
		if pad is Array:
			empty.content_margin_left = float(pad[0])
			empty.content_margin_top = float(pad[1])
			empty.content_margin_right = float(pad[2])
			empty.content_margin_bottom = float(pad[3])
		else:
			empty.set_content_margin_all(float(pad))
		for st: String in ["normal", "hover", "pressed", "disabled", "hover_pressed"]:
			add_theme_stylebox_override(st, empty)
		# The focus ring follows the button's own shape, so a controller always
		# shows where it is without a pill drawn round a square.
		var ring: StyleBoxFlat = StyleBoxFlat.new()
		ring.draw_center = false
		ring.border_color = Color("#f0c040")
		ring.set_border_width_all(2)
		ring.set_corner_radius_all(int(minf(float(n.get("radius", 12)), 999.0)) + 3)
		ring.set_expand_margin_all(3)
		add_theme_stylebox_override("focus", ring)
		mouse_entered.connect(func() -> void: _bg.set_spec(hot))
		mouse_exited.connect(func() -> void: _bg.set_spec(normal))
		focus_entered.connect(func() -> void: _bg.set_spec(hot))
		focus_exited.connect(func() -> void: _bg.set_spec(normal))

	func restyle(n: Dictionary, h: Dictionary = {}) -> void:
		normal = n
		hot = h if not h.is_empty() else n
		_bg.set_spec(normal)
