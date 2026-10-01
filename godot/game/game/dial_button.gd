class_name DialButton
extends Button
## THE CAST BUTTON (Godot port of components/DialButton.tsx). Since
## 2026-10-01 a WATERCOLOUR SEAL (fx/seal.gdshader; Kong chose it over the
## wooden disc): a round of torn paper with a ring of pigment in the action's
## colour (sea-teal to cast, warm red-gold to reel), the word inked on its
## face, dull when it cannot be pressed, and a ring of wet pigment running out
## across it on a press.

var accent: Color = Color("#67d4e8"):
	set(c):
		accent = c
		_restyle()

var _face: ColorRect
var _mat: ShaderMaterial
var _since: float = 9.0
var _hot: float = 0.0
var _hovered: bool = false


func _init(diameter: float = 112.0) -> void:
	custom_minimum_size = Vector2(diameter, diameter)
	var empty: StyleBoxEmpty = StyleBoxEmpty.new()
	for st: String in ["normal", "hover", "pressed", "disabled", "hover_pressed", "focus"]:
		add_theme_stylebox_override(st, empty)
	_face = ColorRect.new()
	_face.show_behind_parent = true
	_face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_face.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	# A little larger than the button, for the seal's shadow.
	_face.offset_left = -diameter * 0.07
	_face.offset_top = -diameter * 0.07
	_face.offset_right = diameter * 0.07
	_face.offset_bottom = diameter * 0.07
	_mat = ShaderMaterial.new()
	_mat.shader = load("res://game/fx/seal.gdshader")
	_mat.set_shader_parameter("paper", Kit.PAPER)
	_mat.set_shader_parameter("ink", Kit.PAPER_INK)
	_face.material = _mat
	add_child(_face)
	add_theme_font_override("font", Kit.tracked("cinzel", 800, 15, 0.1))
	add_theme_font_size_override("font_size", 15)
	add_theme_constant_override("line_spacing", 0)
	add_theme_constant_override("outline_size", 0)
	autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	button_down.connect(func() -> void: _since = 0.0)
	mouse_entered.connect(func() -> void: _hovered = true)
	mouse_exited.connect(func() -> void: _hovered = false)
	Kit.tap(self)
	_restyle()


func _process(delta: float) -> void:
	_since += delta
	_hot = lerpf(_hot, 1.0 if _hovered and not disabled else 0.0, 1.0 - exp(-delta * 10.0))
	_mat.set_shader_parameter("press", _since)
	_mat.set_shader_parameter("hover", _hot)


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED or what == NOTIFICATION_ENTER_TREE:
		_restyle()


## Disabled changes the look too, so set it through here.
func set_lit(on: bool) -> void:
	disabled = not on
	_restyle()


## The action's colour as pigment: its hue, laid on paper.
func _pigment() -> Color:
	return Color.from_hsv(accent.h, clampf(accent.s * 0.85, 0.35, 0.8), 0.58)


func _restyle() -> void:
	if _mat == null:
		return
	var lit: bool = not disabled
	var pig: Color = _pigment()
	_mat.set_shader_parameter("pigment", pig)
	_mat.set_shader_parameter("lit", 1.0 if lit else 0.0)
	var word: Color = Color.from_hsv(pig.h, minf(1.0, pig.s * 1.1), 0.3) if lit else Color(Kit.PAPER_INK, 0.45)
	for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color", "font_disabled_color"]:
		add_theme_color_override(st, word)
	add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0))
