class_name SummonCast
extends Control
## A CREW SUMMON (Godot over the web's AbilitySummonFx, 2026-10-04; Kong: "I
## want using crew summons to feel very satisfying"). One pass of about two
## seconds, over everything in the fight:
##   GATHER   the screen sinks into the dark, washed in the crew's colour
##            (their class's, or their equipped skin's); motes are drawn in to
##            the middle and a ring of light tightens.
##   ARRIVE   a white flash, and the crew blooms out of it (big, settling with
##            a little overshoot), light rays turning behind them and two rune
##            rings turning opposite ways; a burst of sparks out from them; the
##            name lands in Cinzel, its letters drawing together, the order's
##            name over it.
##   HOLD     the crew stands there a beat, breathing, embers rising.
##   DEPART   they swell a little and come apart into motes drifting up as the
##            dark lifts.
## A CHASE SKIN gets the legendary weight: a wider bloom, a second flash in
## its colour, more of everything, and its signature (ChaseFx, the summon
## version) played over the portrait. All particles; no art but the crew's own.
## Click or Space hurries it along.

signal done

var tex: Texture2D
var col: Color = Color(0.7, 0.8, 1.0)
var crew_name: String = ""
var order: String = ""
var skin: Dictionary = {}

const DUR: float = 2.1
var _t: float = 0.0
var _pic: TextureRect
var _hold: Control
var _name: Label
var _eyebrow: Label
var _var: FontVariation
var _light: Node2D
var _parts: Array = []
var _glow: Texture2D
var _skip: bool = false


func _chase() -> bool:
	return skin.get("chase", false) == true


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_glow = Glow.radial(128, Color.WHITE)
	# The portrait, held in a box the chase signature can fill.
	var h: float = minf(size.y * 0.5, 420.0)
	_hold = Control.new()
	_hold.size = Vector2(h, h)
	_hold.pivot_offset = Vector2(h, h) / 2.0
	_hold.position = size / 2.0 - Vector2(h, h) / 2.0 - Vector2(0, 40)
	_hold.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_hold)
	_pic = TextureRect.new()
	_pic.texture = tex
	_pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_pic.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# The card's painting ends in a straight edge: it fades into the light.
	var sh: Shader = Shader.new()
	sh.code = "shader_type canvas_item;
void fragment() {
	vec4 c = texture(TEXTURE, UV);
	c.a *= 1.0 - smoothstep(0.78, 1.0, UV.y);
	COLOR = c * COLOR;
}"
	var mat: ShaderMaterial = ShaderMaterial.new()
	mat.shader = sh
	_pic.material = mat
	_hold.add_child(_pic)
	if _chase():
		var cf: ChaseFx = ChaseFx.over(_hold, skin, true)
		if cf != null:
			cf.summon = true
	_hold.modulate.a = 0.0
	_hold.scale = Vector2(1.6, 1.6)
	# The names.
	_eyebrow = Kit.text(self, order.to_upper(), "small", col.lightened(0.35))
	_eyebrow.add_theme_font_override("font", Kit.font("karla", 800))
	_eyebrow.add_theme_font_size_override("font_size", 14)
	_eyebrow.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_eyebrow.size = Vector2(size.x, 20)
	_eyebrow.position = Vector2(0, _hold.position.y + h + 18.0)
	_eyebrow.modulate.a = 0.0
	_var = FontVariation.new()
	_var.base_font = Kit.font("cinzel", 800)
	_var.spacing_glyph = 16
	_name = Label.new()
	_name.text = crew_name.to_upper()
	_name.add_theme_font_override("font", _var)
	_name.add_theme_font_size_override("font_size", 40)
	_name.add_theme_color_override("font_color", Color.WHITE)
	_name.add_theme_color_override("font_shadow_color", Color(col, 0.9))
	_name.add_theme_constant_override("shadow_outline_size", 18)
	_name.add_theme_constant_override("shadow_offset_x", 0)
	_name.add_theme_constant_override("shadow_offset_y", 0)
	_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name.size = Vector2(size.x, 50)
	_name.position = Vector2(0, _hold.position.y + h + 38.0)
	_name.modulate.a = 0.0
	add_child(_name)
	# The light: added over the dark, under the portrait.
	_light = Node2D.new()
	var m: CanvasItemMaterial = CanvasItemMaterial.new()
	m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	_light.material = m
	_light.draw.connect(_draw_light)
	_light.show_behind_parent = false
	add_child(_light)
	move_child(_light, 0)
	_run()


func _gui_input(ev: InputEvent) -> void:
	if ev is InputEventMouseButton and ev.pressed:
		_skip = true
		accept_event()


func _unhandled_input(ev: InputEvent) -> void:
	if ev is InputEventKey and ev.pressed and (ev as InputEventKey).keycode in [KEY_SPACE, KEY_ENTER, KEY_ESCAPE]:
		_skip = true
		get_viewport().set_input_as_handled()


func _centre() -> Vector2:
	return _hold.position + _hold.size / 2.0


func _run() -> void:
	var c: Vector2 = _centre()
	var big: float = 1.6 if _chase() else 1.0
	Sound.charge()
	# GATHER: motes drawn in to the middle.
	for k: int in int(36 * big):
		var a: float = randf() * TAU
		var d: float = randf_range(260, 520)
		_parts.append({ "kind": "gather", "a": c + Vector2.from_angle(a) * d, "b": c, "t": -randf() * 0.25, "life": 0.45, "c": col.lightened(0.3), "r": randf_range(2.0, 4.0) })
	await _wait(0.42)
	# ARRIVE.
	Sound.seal(true)
	Sound.impact(true)
	Rumble.buzz([0, 50, 20, 70])
	_parts.append({ "kind": "flash", "p": c, "t": 0.0, "life": 0.35, "c": Color.WHITE, "r": 260.0 * big })
	if _chase():
		_parts.append({ "kind": "flash", "p": c, "t": -0.08, "life": 0.5, "c": col, "r": 420.0 })
	for k2: int in int(46 * big):
		var a2: float = randf() * TAU
		_parts.append({ "kind": "spark", "p": c, "v": Vector2.from_angle(a2) * randf_range(220, 640) * big, "t": 0.0, "life": randf_range(0.5, 0.9), "c": col.lightened(0.4) if k2 % 3 else Color(1, 0.95, 0.85), "r": randf_range(2.0, 4.5) })
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(_hold, "modulate:a", 1.0, 0.18)
	tw.tween_property(_hold, "scale", Vector2.ONE, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(_name, "modulate:a", 1.0, 0.2).set_delay(0.12)
	tw.tween_property(_var, "spacing_glyph", 3, 0.42).set_delay(0.12).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	tw.tween_property(_eyebrow, "modulate:a", 1.0, 0.3).set_delay(0.22)
	# HOLD: the crew breathes; embers rise.
	var held: float = 0.0
	while held < 1.05 and not _skip:
		if randf() < 0.6:
			_parts.append({ "kind": "spark", "p": c + Vector2(randf_range(-_hold.size.x * 0.35, _hold.size.x * 0.35), _hold.size.y * 0.35), "v": Vector2(randf_range(-14, 14), randf_range(-140, -70)), "t": 0.0, "life": 1.0, "c": col.lightened(0.3), "r": randf_range(1.5, 3.0) })
		await get_tree().process_frame
		held += get_process_delta_time()
	# DEPART: swell a little and come apart into motes drifting up.
	for k3: int in 40:
		var at: Vector2 = c + Vector2(randf_range(-_hold.size.x * 0.32, _hold.size.x * 0.32), randf_range(-_hold.size.y * 0.4, _hold.size.y * 0.4))
		_parts.append({ "kind": "spark", "p": at, "v": Vector2(randf_range(-30, 30), randf_range(-160, -60)), "t": -randf() * 0.2, "life": 0.8, "c": col.lightened(0.45), "r": randf_range(1.5, 3.5) })
	var out: Tween = create_tween().set_parallel()
	out.tween_property(_hold, "scale", Vector2(1.08, 1.08), 0.4).set_ease(Tween.EASE_IN)
	out.tween_property(_hold, "modulate:a", 0.0, 0.38).set_ease(Tween.EASE_IN)
	out.tween_property(_name, "modulate:a", 0.0, 0.3)
	out.tween_property(_eyebrow, "modulate:a", 0.0, 0.3)
	out.tween_property(self, "_fade", 0.0, 0.42)
	await out.finished
	done.emit()
	queue_free()


## How dark the screen is (1 while the summon holds it).
var _fade: float = 0.0


func _process(delta: float) -> void:
	_t += delta
	if _t < 0.3:
		_fade = maxf(_fade, _t / 0.3)
	for p: Dictionary in _parts:
		p["t"] = float(p["t"]) + delta
		if p.has("v"):
			p["p"] = (p["p"] as Vector2) + (p["v"] as Vector2) * delta
			p["v"] = (p["v"] as Vector2) * (1.0 - delta * 1.8)
	_parts = _parts.filter(func(p: Dictionary) -> bool: return float(p["t"]) < float(p["life"]))
	# The crew breathes while it holds.
	if _hold.modulate.a > 0.95 and _t > 0.9:
		var br: float = 1.0 + 0.012 * sin(_t * 3.0)
		_hold.scale = Vector2(br, br)
	queue_redraw()
	_light.queue_redraw()


func _draw() -> void:
	# The dark, washed in the crew's colour at the middle.
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.01, 0.015, 0.03, 0.86 * _fade))
	var c: Vector2 = _centre()
	var rr: float = maxf(size.x, size.y) * 0.55
	draw_texture_rect(_glow, Rect2(c - Vector2(rr, rr * 0.8), Vector2(rr, rr * 0.8) * 2.0), false, Color(col, 0.28 * _fade))


func _draw_light() -> void:
	var c: Vector2 = _centre()
	var big: float = 1.6 if _chase() else 1.0
	var a: float = _hold.modulate.a
	if a > 0.01:
		# The bloom behind the crew.
		var br: float = _hold.size.x * (0.75 if _chase() else 0.6)
		_light.draw_texture_rect(_glow, Rect2(c - Vector2(br, br), Vector2(br, br) * 2.0), false, Color(col, 0.55 * a))
		# Light rays turning slowly.
		var n: int = 18 if _chase() else 12
		for k: int in n:
			var an: float = _t * 0.25 + TAU * k / n
			var l: float = _hold.size.x * (0.9 + 0.12 * sin(_t * 2.0 + k)) * big
			# Thin, bright at the crew and fading out along its length.
			var w: float = 0.022 + 0.01 * sin(_t * 3.0 + k * 1.7)
			var rc: Color = col.lightened(0.3)
			_light.draw_polygon(PackedVector2Array([c, c + Vector2.from_angle(an - w) * l, c + Vector2.from_angle(an + w) * l]),
				PackedColorArray([Color(rc, 0.2 * a), Color(rc, 0.0), Color(rc, 0.0)]))
		# Two rune rings turning opposite ways.
		for ring: Array in [[_hold.size.x * 0.56, 1.0, 36], [_hold.size.x * 0.66, -0.7, 48]]:
			for k2: int in int(ring[2]):
				var an2: float = _t * float(ring[1]) + TAU * k2 / float(ring[2])
				var pr: Vector2 = c + Vector2.from_angle(an2) * float(ring[0])
				var on: bool = k2 % 4 == 0
				_light.draw_circle(pr, 3.2 if on else 1.6, Color(col.lightened(0.5), (0.9 if on else 0.5) * a))
	for p: Dictionary in _parts:
		var u: float = clampf(float(p["t"]) / float(p["life"]), 0.0, 1.0)
		if float(p["t"]) < 0.0:
			continue
		match str(p["kind"]):
			"gather":
				var g: Vector2 = (p["a"] as Vector2).lerp(p["b"], smoothstep(0.0, 1.0, u))
				_light.draw_texture_rect(_glow, Rect2(g - Vector2(9, 9), Vector2(18, 18)), false, Color(p["c"], 0.8 * u))
				_light.draw_circle(g, float(p["r"]), Color(p["c"], u))
			"flash":
				var fr: float = float(p["r"]) * (0.4 + u)
				_light.draw_texture_rect(_glow, Rect2(p["p"] - Vector2(fr, fr), Vector2(fr, fr) * 2.0), false, Color(p["c"], (1.0 - u) * (0.35 if GameSettings.calm() else 1.0)))
			_:
				var sr: float = float(p["r"]) * (1.0 - u * 0.5)
				_light.draw_texture_rect(_glow, Rect2(p["p"] - Vector2(sr, sr) * 3.0, Vector2(sr, sr) * 6.0), false, Color(p["c"], 0.45 * (1.0 - u)))
				_light.draw_circle(p["p"], sr * 0.6, Color(Color(p["c"]).lightened(0.3), 1.0 - u))


func _wait(s: float) -> void:
	var left: float = s
	while left > 0.0 and not _skip:
		await get_tree().process_frame
		left -= get_process_delta_time()
