class_name DialButton
extends Button
## CAST AND REEL IN (Godot port of components/DialButton.tsx). Since
## 2026-10-01 LETTERING ON THE WATER (Kong turned down the dark dial, the
## wooden disc and the watercolour seal): no button to see, just the word,
## lettered under the boat like the status cues, with the key beside it and
## a soft stroke of light under it that swells while the pointer is on it and
## flashes on a press. Sea-light to cast, warm gold to reel; dim and quiet
## when it cannot be pressed. The whole lettering is the thing you press, and
## Space or the pad's A press it too.

var accent: Color = Kit.CAST:
	set(c):
		accent = c
		_restyle()

const KEY_HINT: String = "SPACE"

var _hot: float = 0.0
var _hovered: bool = false
var _since: float = 9.0
var _t: float = 0.0
## The key's box, made once (the button redraws every frame).
static var _key_box: StyleBoxFlat


func _init(_diameter: float = 0.0) -> void:
	var empty: StyleBoxEmpty = StyleBoxEmpty.new()
	for st: String in ["normal", "hover", "pressed", "disabled", "hover_pressed", "focus"]:
		add_theme_stylebox_override(st, empty)
	add_theme_font_override("font", Kit.tracked("cinzel", 800, 26, 0.12))
	add_theme_font_size_override("font_size", 26)
	add_theme_constant_override("outline_size", 0)
	add_theme_constant_override("shadow_outline_size", 8)
	add_theme_constant_override("shadow_offset_x", 0)
	add_theme_constant_override("shadow_offset_y", 1)
	alignment = HORIZONTAL_ALIGNMENT_CENTER
	focus_mode = Control.FOCUS_NONE
	button_down.connect(func() -> void: _since = 0.0)
	mouse_entered.connect(func() -> void: _hovered = true)
	mouse_exited.connect(func() -> void: _hovered = false)
	Kit.tap(self)
	_restyle()


func _process(delta: float) -> void:
	_t += delta
	_since += delta
	_hot = lerpf(_hot, 1.0 if _hovered and not disabled else 0.0, 1.0 - exp(-delta * 10.0))
	queue_redraw()


## Disabled changes the look too, so set it through here.
func set_lit(on: bool) -> void:
	disabled = not on
	_restyle()


func _ink() -> Color:
	if disabled:
		return Color(0.86, 0.84, 0.8, 0.55)
	return accent.lerp(Color.WHITE, 0.55)


func _restyle() -> void:
	var ink: Color = _ink()
	for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color", "font_disabled_color"]:
		add_theme_color_override(st, ink)
	# The one recipe for lettering on the water (Kit.lift): its shade.
	add_theme_color_override("font_shadow_color", Kit.SEA_SHADE)
	add_theme_font_size_override("font_size", 26 if text.length() <= 12 else 18)
	queue_redraw()


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		_restyle()


## The stroke of light under the word, and the key beside it.
func _draw() -> void:
	if text == "":
		return
	var f: Font = get_theme_font("font")
	var px: int = get_theme_font_size("font_size")
	var tw: float = f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
	var c: Vector2 = size / 2.0
	var y: float = c.y + px * 0.62
	var glow: Color = accent.lerp(Color.WHITE, 0.4)
	var flash: float = 1.0 - smoothstep(0.0, 0.45, _since)
	var breathe: float = 0.5 + 0.5 * sin(_t * 2.0)
	var reach: float = tw * (0.36 + 0.14 * _hot + 0.2 * flash)
	var a: float = (0.0 if disabled else (0.28 + 0.12 * breathe + 0.35 * _hot)) + 0.5 * flash
	# A soft stroke: brightest in the middle, fading to nothing at its ends.
	var n: int = 24
	for i: int in n:
		var k0: float = float(i) / n
		var k1: float = float(i + 1) / n
		var fall: float = 1.0 - pow(absf((k0 + k1) - 1.0), 1.6)
		var x0: float = c.x - reach + reach * 2.0 * k0
		var x1: float = c.x - reach + reach * 2.0 * k1
		draw_line(Vector2(x0, y + 1.5), Vector2(x1, y + 1.5), Color(0, 0, 0, 0.35 * a * fall), 3.0, true)
		draw_line(Vector2(x0, y), Vector2(x1, y), Color(glow, a * fall), 2.0, true)
	# The key, small and quiet, to the right of the word.
	if not disabled:
		var kf: Font = Kit.tracked("karla", 700, 10, 0.16)
		var kw: float = kf.get_string_size(KEY_HINT, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x
		var kx: float = c.x + tw / 2.0 + 14.0
		var ky: float = c.y + 4.0
		var box: Rect2 = Rect2(kx - 6.0, ky - 11.0, kw + 12.0, 16.0)
		if _key_box == null:
			_key_box = StyleBoxFlat.new()
			_key_box.bg_color = Color(0, 0, 0, 0.22)
			_key_box.border_color = Color(1, 1, 1, 0.28)
			_key_box.set_border_width_all(1)
			_key_box.set_corner_radius_all(4)
		draw_style_box(_key_box, box)
		draw_string(kf, Vector2(kx, ky + 1.0), KEY_HINT, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(1, 1, 1, 0.6))
