class_name TitleCard
extends Control
## A TITLE OVER THE WATER (Kong, 2026-10-16: "I want it to feel like a true
## main story campaign"): the campaign's chapters and its bosses announced the
## way the finale's ONE LAST RIDE is, over the live sea instead of a sheet.
##   A CHAPTER: a letterbox; "Chapter II complete" first, alone; then the new
##              chapter's numeral, its name set wide in cream Cinzel, a rule
##              running out under it and the line of what it is about; any
##              press goes on once it has landed (or it goes on by itself).
##   A BOSS:    as the boss's fight begins, their name across a dark band,
##              what they are above it, held a moment and gone (a press skips).
## Words only, no art; a soft dark band behind them so they read over any sea.

signal finished

## The beat before, alone (a chapter's "Chapter II complete").
var prelude: String = ""
## The small line over the name (the numeral; a boss's title).
var eyebrow: String = ""
var title: String = ""
## The line under the name (what the chapter is about).
var subtitle: String = ""
## A chapter: the letterbox, and a press to go on. A boss: neither, and it
## goes by itself after `hold` seconds.
var chapter: bool = true
var hold: float = 2.2

var _band: ColorRect
var _bars: Array = []
var _pre: Label
var _eye: Label
var _name: Label
var _rule: ColorRect
var _sub: Label
var _font: FontVariation
var _landed: bool = false
var _gone: bool = false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP if chapter else Control.MOUSE_FILTER_IGNORE
	_band = ColorRect.new()
	_band.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sh: ShaderMaterial = ShaderMaterial.new()
	sh.shader = _band_shader()
	_band.material = sh
	_band.modulate.a = 0.0
	add_child(_band)
	if chapter:
		for top: bool in [true, false]:
			var bar: ColorRect = ColorRect.new()
			bar.color = Color(0, 0, 0, 0.92)
			bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
			bar.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE if top else Control.PRESET_BOTTOM_WIDE)
			bar.set_meta("top", top)
			add_child(bar)
			_bars.append(bar)
	_font = FontVariation.new()
	_font.base_font = Kit.font("cinzel", 800)
	_font.spacing_glyph = 2
	_pre = _label(prelude, Kit.font("cinzel", 700), 22, Color(BattleLook.CREAM, 0.85), 8)
	_eye = _label(eyebrow, Kit.font("karla", 700), 17 if not chapter else 19, Color(1.0, 0.82, 0.38, 0.95), 5)
	_name = _label(title.to_upper(), _font, 70 if chapter else 58, BattleLook.CREAM, 0)
	_sub = _label(subtitle, Kit.font("karla", 500), 21, Color(0.92, 0.88, 0.8, 0.85), 0)
	_sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_rule = ColorRect.new()
	_rule.color = Color(1.0, 0.82, 0.38, 0.7)
	_rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_rule)
	resized.connect(_layout)
	_layout()
	_play()


func _label(t: String, f: Font, fs: int, c: Color, spacing: int) -> Label:
	var l: Label = Label.new()
	l.text = t
	var fv: Font = f
	if spacing > 0:
		var v: FontVariation = FontVariation.new()
		v.base_font = f
		v.spacing_glyph = spacing
		fv = v
	l.add_theme_font_override("font", fv)
	l.add_theme_font_size_override("font_size", fs)
	l.add_theme_color_override("font_color", c)
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.75))
	l.add_theme_constant_override("shadow_offset_y", 3)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.modulate.a = 0.0
	add_child(l)
	return l


func _layout() -> void:
	var vp: Vector2 = size
	var cy: float = vp.y * (0.42 if chapter else 0.3)
	var w: float = minf(1300.0, vp.x - 80.0)
	var x0: float = (vp.x - w) / 2.0
	_band.position = Vector2(0, cy - 150.0)
	_band.size = Vector2(vp.x, 300.0)
	_pre.position = Vector2(x0, cy - 20.0)
	_pre.size = Vector2(w, 40.0)
	_eye.position = Vector2(x0, cy - 78.0)
	_eye.size = Vector2(w, 30.0)
	_name.position = Vector2(x0, cy - 50.0)
	_name.size = Vector2(w, 90.0)
	_rule.position = Vector2(vp.x / 2.0 - _rule.size.x / 2.0, cy + 50.0)
	_rule.size.y = 2.0
	_sub.position = Vector2(x0 + w * 0.15, cy + 66.0)
	_sub.size = Vector2(w * 0.7, 60.0)
	for bar: ColorRect in _bars:
		if bar.get_meta("top"):
			bar.offset_bottom = bar.get_meta("h", 0.0)
		else:
			bar.offset_top = -float(bar.get_meta("h", 0.0))


func _bar_h(h: float) -> void:
	for bar: ColorRect in _bars:
		bar.set_meta("h", h)
	_layout()


func _play() -> void:
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(_band, "modulate:a", 1.0, 0.6)
	if chapter:
		tw.tween_method(_bar_h, 0.0, 72.0, 0.7).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	# A chapter: what has closed, alone, first.
	if prelude != "":
		await _wait(0.5)
		Sound.knock()
		var p: Tween = _pre.create_tween()
		p.tween_property(_pre, "modulate:a", 1.0, 0.7)
		p.tween_interval(1.5)
		p.tween_property(_pre, "modulate:a", 0.0, 0.6)
		await p.finished
	else:
		await _wait(0.25)
	# The name: wide, settling in as it comes up; the line over it; the rule.
	if chapter:
		Sound.horn()
	else:
		Sound.knock()
	var n: Tween = create_tween().set_parallel()
	n.tween_property(_eye, "modulate:a", 1.0, 0.6)
	n.tween_property(_name, "modulate:a", 1.0, 0.9).set_delay(0.15)
	n.tween_method(func(g: float) -> void: _font.spacing_glyph = int(g), 26.0, 8.0, 1.6).set_delay(0.15).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	n.tween_method(func(wd: float) -> void:
		_rule.size.x = wd
		_rule.position.x = size.x / 2.0 - wd / 2.0, 0.0, 360.0 if chapter else 260.0, 1.2).set_delay(0.5).set_trans(Tween.TRANS_SINE)
	if subtitle != "":
		n.tween_property(_sub, "modulate:a", 1.0, 0.9).set_delay(1.1)
	await n.finished
	_landed = true
	if chapter:
		# It waits for a press, and goes on by itself if none comes.
		await _wait(7.0)
	else:
		await _wait(hold)
	_out()


func _out() -> void:
	if _gone:
		return
	_gone = true
	var tw: Tween = create_tween().set_parallel()
	for c: Control in [_band, _pre, _eye, _name, _rule, _sub]:
		tw.tween_property(c, "modulate:a", 0.0, 0.6)
	if chapter:
		tw.tween_method(_bar_h, 72.0, 0.0, 0.6)
	await tw.finished
	finished.emit()
	queue_free()


func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
		accept_event()
		if _landed:
			_out()


func _unhandled_input(e: InputEvent) -> void:
	if not (e is InputEventKey) or not (e as InputEventKey).pressed or (e as InputEventKey).echo:
		return
	if (e as InputEventKey).keycode in [KEY_SPACE, KEY_ENTER, KEY_KP_ENTER, KEY_ESCAPE] and (_landed or not chapter):
		get_viewport().set_input_as_handled()
		_out()


func _wait(s: float) -> void:
	await get_tree().create_timer(s).timeout


## A dark band, soft at its top and bottom edges, so the words read over any sea.
func _band_shader() -> Shader:
	var s: Shader = Shader.new()
	s.code = """
shader_type canvas_item;
void fragment() {
	float e = smoothstep(0.0, 0.35, UV.y) * (1.0 - smoothstep(0.65, 1.0, UV.y));
	float x = 1.0 - smoothstep(0.2, 0.5, abs(UV.x - 0.5)) * 0.6;
	COLOR = vec4(0.0, 0.0, 0.02, 0.62 * e * x);
}
"""
	return s
