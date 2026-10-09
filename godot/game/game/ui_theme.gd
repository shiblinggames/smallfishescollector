class_name UiTheme
extends RefCounted
## ONE THEME FOR THE GAME'S UI (Godot port, stage 1; derived from Kit's
## tokens since the 2026-10-09 visual pass).
##
## Karla for reading, Cinzel for titles, as on the web. Controls are paper
## with ink (the day paper; a night screen restyles its own), radius 12 as
## Kit's large buttons, and focus is an inked ring at the control's radius + 3
## so a controller always shows where it is.

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


## The ring a focused control wears (day paper: inked gold).
static func focus_ring(radius: int, col: Color = Kit.ink(Kit.GOLD)) -> StyleBoxFlat:
	var focus: StyleBoxFlat = StyleBoxFlat.new()
	focus.draw_center = false
	focus.border_color = col
	focus.set_border_width_all(2)
	focus.set_corner_radius_all(radius + 3)
	focus.set_expand_margin_all(3)
	return focus


static func make() -> Theme:
	if _theme != null:
		return _theme
	var t: Theme = Theme.new()
	var body: FontFile = _font("karla-latin-400-normal.woff2")
	if body != null:
		t.default_font = body
	t.default_font_size = int(Kit.ROLES["body"][2])

	var btn: StyleBoxFlat = StyleBoxFlat.new()
	btn.bg_color = Kit.PAPER
	btn.border_color = Color(Kit.PAPER_INK, 0.45)
	btn.set_border_width_all(1)
	btn.set_corner_radius_all(Kit.R_LARGE)
	btn.set_content_margin_all(12)
	var hover: StyleBoxFlat = btn.duplicate()
	hover.bg_color = Kit.PAPER.lightened(0.1)
	var pressed: StyleBoxFlat = btn.duplicate()
	pressed.bg_color = Kit.PAPER.darkened(0.06)
	var disabled: StyleBoxFlat = btn.duplicate()
	disabled.border_color = Color(Kit.PAPER_INK, 0.15)
	disabled.bg_color = Kit.PAPER.darkened(0.04)
	var focus: StyleBoxFlat = focus_ring(Kit.R_LARGE)
	for kind: String in ["Button", "OptionButton"]:
		t.set_stylebox("normal", kind, btn)
		t.set_stylebox("hover", kind, hover)
		t.set_stylebox("pressed", kind, pressed)
		t.set_stylebox("hover_pressed", kind, pressed)
		t.set_stylebox("disabled", kind, disabled)
		t.set_stylebox("focus", kind, focus)
		for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
			t.set_color(st, kind, Kit.PAPER_INK)
		t.set_color("font_disabled_color", kind, Color(Kit.PAPER_INK, 0.4))
		t.set_font_size("font_size", kind, int(Kit.ROLES["button"][2]))
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
	t.set_color("selection_color", "LineEdit", Color(Paper.RED, 0.25))
	# Scroll bars: a thin inked groove and a darker thumb (and a night twin,
	# NightVScrollBar / NightHScrollBar: see night_scroll).
	for kind: String in ["VScrollBar", "HScrollBar"]:
		_scrollbar(t, kind, Kit.PAPER_INK)
		var nk: String = "Night" + kind
		t.set_type_variation(nk, kind)
		_scrollbar(t, nk, Paper.NIGHT_INK)

	# Sliders (Settings): an inked groove, the filled part in CHOSEN (it reads
	# on both papers), a round grabber.
	var groove: StyleBoxFlat = StyleBoxFlat.new()
	groove.bg_color = Color(0.5, 0.45, 0.38, 0.35)
	groove.set_corner_radius_all(3)
	groove.content_margin_top = 3
	groove.content_margin_bottom = 3
	var filled: StyleBoxFlat = groove.duplicate()
	filled.bg_color = Paper.CHOSEN
	var filled_hot: StyleBoxFlat = groove.duplicate()
	filled_hot.bg_color = Paper.CHOSEN.lightened(0.12)
	t.set_stylebox("slider", "HSlider", groove)
	t.set_stylebox("grabber_area", "HSlider", filled)
	t.set_stylebox("grabber_area_highlight", "HSlider", filled_hot)
	t.set_stylebox("focus", "HSlider", focus_ring(4))
	t.set_icon("grabber", "HSlider", _knob(18, Paper.NIGHT_INK, Color(0.25, 0.18, 0.1)))
	t.set_icon("grabber_highlight", "HSlider", _knob(18, Color.WHITE, Color(0.25, 0.18, 0.1)))
	t.set_icon("grabber_disabled", "HSlider", _knob(18, Color(0.6, 0.56, 0.5), Color(0.25, 0.18, 0.1, 0.5)))

	# Toggles (CheckButton): a pill in CHOSEN when on, a muted groove when off.
	t.set_icon("checked", "CheckButton", _switch(true, true))
	t.set_icon("unchecked", "CheckButton", _switch(false, true))
	t.set_icon("checked_disabled", "CheckButton", _switch(true, false))
	t.set_icon("unchecked_disabled", "CheckButton", _switch(false, false))
	t.set_icon("checked_mirrored", "CheckButton", _switch(true, true))
	t.set_icon("unchecked_mirrored", "CheckButton", _switch(false, true))
	t.set_icon("checked_disabled_mirrored", "CheckButton", _switch(true, false))
	t.set_icon("unchecked_disabled_mirrored", "CheckButton", _switch(false, false))
	var empty: StyleBoxEmpty = StyleBoxEmpty.new()
	for st: String in ["normal", "hover", "pressed", "hover_pressed", "disabled"]:
		t.set_stylebox(st, "CheckButton", empty)
	t.set_stylebox("focus", "CheckButton", focus_ring(Kit.R_SMALL))

	# The list an OptionButton drops (PopupMenu): paper, ink, a soft hover.
	var pop: StyleBoxFlat = StyleBoxFlat.new()
	pop.bg_color = Kit.PAPER
	pop.border_color = Color(Kit.PAPER_INK, 0.35)
	pop.set_border_width_all(1)
	pop.set_corner_radius_all(Kit.R_SMALL)
	pop.set_content_margin_all(6)
	var pop_hot: StyleBoxFlat = StyleBoxFlat.new()
	pop_hot.bg_color = Color(Kit.PAPER_INK, 0.1)
	pop_hot.set_corner_radius_all(6)
	t.set_stylebox("panel", "PopupMenu", pop)
	t.set_stylebox("hover", "PopupMenu", pop_hot)
	t.set_color("font_color", "PopupMenu", Kit.PAPER_INK)
	t.set_color("font_hover_color", "PopupMenu", Kit.PAPER_INK)
	t.set_color("font_disabled_color", "PopupMenu", Color(Kit.PAPER_INK, 0.4))
	t.set_color("font_separator_color", "PopupMenu", Kit.PAPER_INK_SOFT)
	t.set_font_size("font_size", "PopupMenu", int(Kit.ROLES["body"][2]))
	_theme = t
	return t


static func _scrollbar(t: Theme, kind: String, ink: Color) -> void:
	var groove: StyleBoxFlat = StyleBoxFlat.new()
	groove.bg_color = Color(ink, 0.07)
	groove.set_corner_radius_all(4)
	groove.content_margin_left = 3
	groove.content_margin_right = 3
	var thumb: StyleBoxFlat = StyleBoxFlat.new()
	thumb.bg_color = Color(ink, 0.35)
	thumb.set_corner_radius_all(4)
	var thumb_hot: StyleBoxFlat = thumb.duplicate()
	thumb_hot.bg_color = Color(ink, 0.55)
	t.set_stylebox("scroll", kind, groove)
	t.set_stylebox("grabber", kind, thumb)
	t.set_stylebox("grabber_highlight", kind, thumb_hot)
	t.set_stylebox("grabber_pressed", kind, thumb_hot)


## A scroll container on the night paper: its bars in the night ink.
static func night_scroll(sc: ScrollContainer) -> ScrollContainer:
	sc.get_v_scroll_bar().theme_type_variation = &"NightVScrollBar"
	sc.get_h_scroll_bar().theme_type_variation = &"NightHScrollBar"
	return sc


## A round knob, drawn (no art file): fill and a hairline rim.
static func _knob(d: int, fill: Color, rim: Color) -> ImageTexture:
	var img: Image = Image.create(d, d, false, Image.FORMAT_RGBA8)
	var c: Vector2 = Vector2(d, d) / 2.0
	var r: float = d / 2.0 - 1.0
	for y: int in d:
		for x: int in d:
			var dist: float = (Vector2(x, y) + Vector2(0.5, 0.5)).distance_to(c)
			var a: float = clampf(r - dist + 0.5, 0.0, 1.0)
			var col: Color = rim if dist > r - 1.4 else fill
			img.set_pixel(x, y, Color(col, col.a * a))
	return ImageTexture.create_from_image(img)


## A toggle switch, drawn: a pill (CHOSEN on, a muted groove off) and a knob.
static func _switch(on: bool, enabled: bool) -> ImageTexture:
	var w: int = 40
	var h: int = 22
	var img: Image = Image.create(w, h, false, Image.FORMAT_RGBA8)
	var track: Color = Paper.CHOSEN if on else Color(0.5, 0.45, 0.38, 0.45)
	var knob: Color = Paper.NIGHT_INK
	if not enabled:
		track.a *= 0.45
		knob.a = 0.6
	var r: float = h / 2.0
	var kc: Vector2 = Vector2(w - r if on else r, r)
	for y: int in h:
		for x: int in w:
			var p: Vector2 = Vector2(x, y) + Vector2(0.5, 0.5)
			var cx: float = clampf(p.x, r, w - r)
			var dt: float = p.distance_to(Vector2(cx, r))
			var at: float = clampf(r - dt, 0.0, 1.0)
			var col: Color = Color(track, track.a * at)
			var dk: float = p.distance_to(kc)
			var ak: float = clampf(r - 3.0 - dk + 0.5, 0.0, 1.0)
			if ak > 0.0:
				col = Color(col.lerp(Color(knob, 1.0), ak), maxf(col.a, knob.a * ak))
			img.set_pixel(x, y, col)
	return ImageTexture.create_from_image(img)
