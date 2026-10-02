class_name Fx
extends RefCounted
## The loop's small moments over the HUD (Godot port, fishing pass 2), timed to
## the web's: the XP number that rises off the boat, the pills (Instant Bite,
## Second Wind), and the full-screen flash on a perfect.


## A label that rises and fades: the XP off the boat is 46px over 2s, opacity
## 0 -> 1 by 10%, held to 60%, gone by the end.
static func rise(parent: Control, text: String, at: Vector2, col: Color, px: int, rise_px: float = 46.0, seconds: float = 2.0, title: bool = false) -> Label:
	var l: Label = Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", px)
	l.add_theme_color_override("font_color", col)
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	l.add_theme_constant_override("shadow_offset_y", 2)
	l.add_theme_constant_override("shadow_outline_size", 6)
	if title:
		l.add_theme_font_override("font", UiTheme.title_font())
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.size = Vector2(400, 40)
	parent.add_child(l)
	l.position = at - Vector2(200, 20)
	l.modulate.a = 0.0
	var tw: Tween = l.create_tween()
	tw.set_parallel(true)
	tw.tween_property(l, "position:y", l.position.y - rise_px, seconds).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	tw.tween_property(l, "modulate:a", 1.0, seconds * 0.1)
	tw.tween_property(l, "modulate:a", 0.0, seconds * 0.4).set_delay(seconds * 0.6)
	tw.chain().tween_callback(l.queue_free)
	return l


## A small rounded pill that springs in, holds, and goes.
static func pill(parent: Control, text: String, at: Vector2, fg: Color, bg: Color, border: Color, hold_s: float) -> void:
	var p: PanelContainer = PanelContainer.new()
	var s: StyleBoxFlat = StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(1)
	s.set_corner_radius_all(20)
	s.content_margin_left = 14
	s.content_margin_right = 14
	s.content_margin_top = 5
	s.content_margin_bottom = 5
	p.add_theme_stylebox_override("panel", s)
	var l: Label = Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", 13)
	l.add_theme_color_override("font_color", fg)
	l.add_theme_font_override("font", UiTheme.title_font())
	p.add_child(l)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(p)
	p.position = at
	p.pivot_offset = p.get_combined_minimum_size() / 2.0
	p.position -= p.pivot_offset
	p.scale = Vector2(0.6, 0.6)
	p.modulate.a = 0.0
	var tw: Tween = p.create_tween()
	tw.tween_property(p, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(p, "modulate:a", 1.0, 0.12)
	tw.tween_interval(hold_s)
	tw.tween_property(p, "modulate:a", 0.0, 0.25)
	tw.tween_callback(p.queue_free)


## THE FULL-SCREEN PERFECT (1.4s): an amber wash, two rings thrown out from the
## middle, and the word itself on a spring.
class PerfectFlash:
	extends Control
	var t: float = 0.0
	## Where it blooms (screen point; the dial's centre). Small and local
	## since 2026-10-01: it fires on every perfect, so it is felt, not a wash
	## over the whole sea.
	var at: Vector2 = Vector2.INF
	var _word: Label

	func _ready() -> void:
		set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		_word = Label.new()
		_word.text = "Perfect"
		_word.add_theme_font_override("font", UiTheme.title_font())
		_word.add_theme_font_size_override("font_size", 34)
		_word.add_theme_color_override("font_color", Color("#fde68a"))
		_word.add_theme_color_override("font_shadow_color", Color(0.96, 0.62, 0.04, 0.9))
		_word.add_theme_constant_override("shadow_outline_size", 14)
		_word.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_word.add_theme_font_size_override("font_size", 28)
		_word.add_theme_constant_override("shadow_outline_size", 10)
		var c: Vector2 = at if at != Vector2.INF else get_viewport_rect().size / 2.0
		_word.position = c + Vector2(-200, -150 - 40)
		_word.size = Vector2(400, 40)
		_word.pivot_offset = Vector2(200, 20)
		_word.scale = Vector2(0.5, 0.5)
		add_child(_word)
		var tw: Tween = _word.create_tween()
		tw.tween_property(_word, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

	func _process(delta: float) -> void:
		t += delta
		if t >= 1.4:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var c: Vector2 = at if at != Vector2.INF else size / 2.0
		var fade: float = 1.0 - clampf((t - 0.9) / 0.5, 0.0, 1.0)
		modulate.a = fade
		# A soft warm glow about the dial, not across the screen.
		for k: int in 3:
			draw_circle(c, 170.0 - k * 30.0, Color(0.96, 0.62, 0.04, 0.035 * fade))
		var u1: float = clampf(t / 0.7, 0.0, 1.0)
		if u1 < 1.0:
			draw_arc(c, 70.0 * lerpf(1.6, 2.6, 1.0 - pow(1.0 - u1, 3.0)), 0.0, TAU, 96, Color(0.96, 0.62, 0.04, 0.55 * (1.0 - u1)), 1.6, true)
		var u2: float = clampf((t - 0.1) / 0.65, 0.0, 1.0)
		if u2 > 0.0 and u2 < 1.0:
			draw_arc(c, 70.0 * lerpf(1.5, 2.2, 1.0 - pow(1.0 - u2, 3.0)), 0.0, TAU, 96, Color(0.99, 0.9, 0.54, 0.4 * (1.0 - u2)), 1.0, true)
