class_name UiTheme
extends RefCounted
## ONE THEME FOR THE GAME'S UI (Godot port, stage 1).
##
## Karla for reading, Cinzel for titles, as on the web. Panels are a SOLID dark
## base (panels on art need one), gold is a translucent tint and never a solid
## fill, and focus is drawn so a controller always shows where it is.

static var _theme: Theme = null
static var _title: FontFile = null


static func _font(file: String) -> FontFile:
	var path: String = "res://art/fonts/%s" % file
	if ResourceLoader.exists(path):
		return load(path)
	return null


static func title_font() -> Font:
	if _title == null:
		_title = _font("cinzel-latin-700-normal.woff2")
	return _title if _title != null else ThemeDB.fallback_font


static func card() -> StyleBoxFlat:
	var s: StyleBoxFlat = StyleBoxFlat.new()
	s.bg_color = Color("#0e1a24")
	s.border_color = Color(0.94, 0.75, 0.25, 0.35)
	s.set_border_width_all(1)
	s.set_corner_radius_all(14)
	s.set_content_margin_all(22)
	return s


static func make() -> Theme:
	if _theme != null:
		return _theme
	var t: Theme = Theme.new()
	var body: FontFile = _font("karla-latin-400-normal.woff2")
	if body != null:
		t.default_font = body
	t.default_font_size = 16

	var btn: StyleBoxFlat = StyleBoxFlat.new()
	btn.bg_color = Color("#12222e")
	btn.border_color = Color(0.94, 0.75, 0.25, 0.55)
	btn.set_border_width_all(1)
	btn.set_corner_radius_all(26)
	btn.set_content_margin_all(12)
	var hover: StyleBoxFlat = btn.duplicate()
	hover.bg_color = Color("#1b3040")
	var pressed: StyleBoxFlat = btn.duplicate()
	pressed.bg_color = Color(0.94, 0.75, 0.25, 0.18)
	var disabled: StyleBoxFlat = btn.duplicate()
	disabled.border_color = Color(1, 1, 1, 0.12)
	disabled.bg_color = Color("#0e1a24")
	var focus: StyleBoxFlat = StyleBoxFlat.new()
	focus.draw_center = false
	focus.border_color = Color("#f0c040")
	focus.set_border_width_all(2)
	focus.set_corner_radius_all(28)
	focus.set_expand_margin_all(3)
	for kind: String in ["Button", "OptionButton"]:
		t.set_stylebox("normal", kind, btn)
		t.set_stylebox("hover", kind, hover)
		t.set_stylebox("pressed", kind, pressed)
		t.set_stylebox("disabled", kind, disabled)
		t.set_stylebox("focus", kind, focus)
		t.set_color("font_color", kind, Color("#f0c040"))
		t.set_color("font_hover_color", kind, Color("#f7d774"))
		t.set_color("font_disabled_color", kind, Color("#6a6764"))
		t.set_font_size("font_size", kind, 17)
		if title_font() != null:
			t.set_font("font", kind, title_font())

	var bar_bg: StyleBoxFlat = StyleBoxFlat.new()
	bar_bg.bg_color = Color(1, 1, 1, 0.10)
	bar_bg.set_corner_radius_all(5)
	var bar_fill: StyleBoxFlat = StyleBoxFlat.new()
	bar_fill.bg_color = Color("#5eead4")
	bar_fill.set_corner_radius_all(5)
	t.set_stylebox("background", "ProgressBar", bar_bg)
	t.set_stylebox("fill", "ProgressBar", bar_fill)
	_theme = t
	return t
