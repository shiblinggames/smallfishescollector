class_name DialButton
extends Button
## THE CAST BUTTON (Godot port of components/DialButton.tsx, on the style
## kit): built like the dial above it, a domed glass face in a dark bezel, the
## action's colour lighting its channel, its label and the glow around it, a
## crescent of reflection across the top. Teal to cast, gold to reel in; dim
## when it cannot.

var accent: Color = Color("#67d4e8"):
	set(c):
		accent = c
		_restyle()

var _face: Pane
var _shine: TextureRect


func _init(diameter: float = 112.0) -> void:
	custom_minimum_size = Vector2(diameter, diameter)
	var empty: StyleBoxEmpty = StyleBoxEmpty.new()
	for st: String in ["normal", "hover", "pressed", "disabled", "hover_pressed", "focus"]:
		add_theme_stylebox_override(st, empty)
	_face = Pane.new({})
	_face.show_behind_parent = true
	_face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_face.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_face)
	# The glass: a crescent of light across the upper third.
	_shine = TextureRect.new()
	_shine.texture = Glow.radial(128, Color.WHITE)
	_shine.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_shine.anchor_left = 0.12
	_shine.anchor_right = 0.88
	_shine.anchor_top = -0.18
	_shine.anchor_bottom = 0.34
	_shine.modulate.a = 0.13
	_shine.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_shine.show_behind_parent = true
	add_child(_shine)
	add_theme_font_override("font", Kit.tracked("karla", 700, 14, 0.18))
	add_theme_font_size_override("font_size", 14)
	add_theme_constant_override("line_spacing", 2)
	add_theme_constant_override("outline_size", 0)
	autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	Kit.tap(self)
	_restyle()


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED or what == NOTIFICATION_ENTER_TREE:
		_restyle()


## Disabled changes the look too, so set it through here.
func set_lit(on: bool) -> void:
	disabled = not on
	_restyle()


func _restyle() -> void:
	if _face == null:
		return
	var lit: bool = not disabled
	var r: float = minf(size.x, size.y) / 2.0 if size.x > 0.0 else custom_minimum_size.x / 2.0
	# Paper and wood (2026-10-01): a disc of stained wood, the action's
	# colour pooled round its rim; greyed when it cannot.
	_face.set_spec({
		"radius": r, "fill": [Kit.WOOD_HI if lit else Kit.WOOD_HI.lerp(Color(0.5, 0.48, 0.45), 0.6), Kit.WOOD_LO if lit else Kit.WOOD_LO.lerp(Color(0.4, 0.38, 0.36), 0.6)],
		"glow": [Color(1, 0.9, 0.7, 0.18), Vector2(0.5, 0.3), Vector2(0.6, 0.5)],
		"inset": [Color(accent, 0.75 if lit else 0.15), 8],
		"border": [3, Color(0.22, 0.13, 0.07, 0.9)],
		"shadow": [Color(accent, 0.45) if lit else Color(0, 0, 0, 0.45), 24, Vector2(0, 5)],
		"pad": 0, "keep": true, "grain": true,
	})
	var ink: Color = Kit.WOOD_INK if lit else Color(Kit.WOOD_INK, 0.55)
	for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color", "font_disabled_color"]:
		add_theme_color_override(st, ink)
	add_theme_color_override("font_shadow_color", Color(0.15, 0.08, 0.03, 0.6) if lit else Color(0, 0, 0, 0))
	add_theme_constant_override("shadow_offset_y", 0)
	add_theme_constant_override("shadow_outline_size", 8)
