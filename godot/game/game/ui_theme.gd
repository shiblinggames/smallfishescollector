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
	btn.bg_color = Kit.PAPER
	btn.border_color = Color(Kit.PAPER_INK, 0.45)
	btn.set_border_width_all(1)
	btn.set_corner_radius_all(26)
	btn.set_content_margin_all(12)
	var hover: StyleBoxFlat = btn.duplicate()
	hover.bg_color = Kit.PAPER.lightened(0.1)
	var pressed: StyleBoxFlat = btn.duplicate()
	pressed.bg_color = Kit.PAPER.darkened(0.06)
	var disabled: StyleBoxFlat = btn.duplicate()
	disabled.border_color = Color(Kit.PAPER_INK, 0.15)
	disabled.bg_color = Kit.PAPER.darkened(0.04)
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
		t.set_color("font_color", kind, Kit.PAPER_INK)
		t.set_color("font_hover_color", kind, Kit.PAPER_INK)
		t.set_color("font_pressed_color", kind, Kit.PAPER_INK)
		t.set_color("font_focus_color", kind, Kit.PAPER_INK)
		t.set_color("font_disabled_color", kind, Color(Kit.PAPER_INK, 0.4))
		t.set_font_size("font_size", kind, 17)
		if title_font() != null:
			t.set_font("font", kind, title_font())

	# Text fields: a pressed-in strip of paper with an ink rule under it.
	var field: StyleBoxFlat = StyleBoxFlat.new()
	field.bg_color = Kit.PAPER.darkened(0.05)
	field.border_color = Color(Kit.PAPER_INK, 0.35)
	field.border_width_bottom = 2
	field.border_width_top = 1
	field.border_width_left = 1
	field.border_width_right = 1
	field.set_corner_radius_all(6)
	field.content_margin_left = 10
	field.content_margin_right = 10
	field.content_margin_top = 6
	field.content_margin_bottom = 6
	var field_on: StyleBoxFlat = field.duplicate()
	field_on.border_color = Color(Kit.PAPER_INK, 0.75)
	t.set_stylebox("normal", "LineEdit", field)
	t.set_stylebox("focus", "LineEdit", field_on)
	t.set_stylebox("read_only", "LineEdit", field)
	t.set_color("font_color", "LineEdit", Kit.PAPER_INK)
	t.set_color("font_placeholder_color", "LineEdit", Color(Kit.PAPER_INK, 0.45))
	t.set_color("caret_color", "LineEdit", Kit.PAPER_INK)
	t.set_color("selection_color", "LineEdit", Color(0.66, 0.2, 0.15, 0.25))
	# Scroll bars: a thin inked groove and a darker thumb.
	for kind: String in ["VScrollBar", "HScrollBar"]:
		var groove: StyleBoxFlat = StyleBoxFlat.new()
		groove.bg_color = Color(Kit.PAPER_INK, 0.07)
		groove.set_corner_radius_all(4)
		groove.content_margin_left = 3
		groove.content_margin_right = 3
		var thumb: StyleBoxFlat = StyleBoxFlat.new()
		thumb.bg_color = Color(Kit.PAPER_INK, 0.35)
		thumb.set_corner_radius_all(4)
		var thumb_hot: StyleBoxFlat = thumb.duplicate()
		thumb_hot.bg_color = Color(Kit.PAPER_INK, 0.55)
		t.set_stylebox("scroll", kind, groove)
		t.set_stylebox("grabber", kind, thumb)
		t.set_stylebox("grabber_highlight", kind, thumb_hot)
		t.set_stylebox("grabber_pressed", kind, thumb_hot)

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
