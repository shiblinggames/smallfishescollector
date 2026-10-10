class_name BunkTile
extends Button
## ONE BUNK IN THE CREW HALL (game/hall_bunks.gd). The bunk is a painting of
## the hall's tier (the sixth, the Leviathan's, is bone). Its states:
##   SHUT      not open at this hall tier: the bunk in grey pencil.
##   EMPTY     waiting: it lifts a little under the pointer; press to bunk.
##   SLEEPING  the hand's card rests in it, breathing; a z drifts up now and
##             then; the candle by it burns down as the stint runs (the
##             candle is the timer), with the time left and the XP it pays.
##   READY     the stint is done: a warm glow, the hand stirs; press to
##             collect.
## The Leviathan bunk breathes a teal glow of its own whatever its state.

const W: float = 168.0
const H: float = 236.0
## Where the bunk's front begins (a share of the painting's height): drawn
## over the sleeper.
const FRONT: float = 0.58

var owner_room: HallBunks
var slot: int = 0
var open: bool = true
var need_tier: int = 1
var art: Texture2D
var terms: Dictionary = {}
var member: Dictionary = {}

var _t: float = 0.0
var _hover: float = 0.0
var _pic: TextureRect
var _bunk: TextureRect
var _front: TextureRect
var _fx: Control
var _name: Label
var _sub: Label
var _was_ready: bool = false
## The hover the fx layer was last drawn with (an empty bunk's plus only
## changes with it).
var _drawn_hover: float = -1.0


func _ready() -> void:
	flat = true
	# A pad can reach a bunk; its ring is CHOSEN on the night paper.
	focus_mode = Control.FOCUS_ALL if open else Control.FOCUS_NONE
	add_theme_stylebox_override("focus", UiTheme.focus_ring(Kit.R_SMALL, Paper.CHOSEN))
	custom_minimum_size = Vector2(W, H)
	clip_contents = false
	_t = randf() * 5.0
	_bunk = TextureRect.new()
	_bunk.texture = art
	_bunk.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_bunk.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_bunk.position = Vector2(4, 54)
	_bunk.size = Vector2(W - 8, 130)
	_bunk.pivot_offset = _bunk.size / 2.0
	_bunk.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if not open:
		var m: ShaderMaterial = ShaderMaterial.new()
		m.shader = preload("res://game/fx/greyed.gdshader")
		m.set_shader_parameter("strength", 0.4)
		_bunk.material = m
	add_child(_bunk)
	if not member.is_empty():
		_pic = TextureRect.new()
		_pic.texture = owner_room.hall._thumb(str(member.get("filename", "")))
		_pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		_pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		_pic.size = Vector2(92, 100)
		_pic.position = Vector2(W / 2.0 - 46.0, 52.0)
		_pic.pivot_offset = Vector2(48, 104)
		_pic.rotation = -0.06
		_pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(_pic)
		# The bunk's front (its lower part) drawn again over the hand, so they
		# lie IN it, tucked under the rail and the blanket.
		var front: Control = Control.new()
		front.clip_contents = true
		front.mouse_filter = Control.MOUSE_FILTER_IGNORE
		front.position = Vector2(4, 54 + 130.0 * FRONT)
		front.size = Vector2(W - 8, 130.0 * (1.0 - FRONT))
		add_child(front)
		_front = TextureRect.new()
		_front.texture = art
		_front.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		_front.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		_front.position = Vector2(0, -130.0 * FRONT)
		_front.size = Vector2(W - 8, 130)
		_front.mouse_filter = Control.MOUSE_FILTER_IGNORE
		front.add_child(_front)
	_fx = Control.new()
	_fx.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fx.draw.connect(_draw_fx)
	add_child(_fx)
	_name = Paper.text(self, "", "small", Paper.ink())
	_name.position = Vector2(0, H - 44)
	_name.size = Vector2(W, 18)
	_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name.clip_text = true
	_sub = Paper.text(self, "", "small", Paper.ink_soft())
	_sub.position = Vector2(0, H - 24)
	_sub.size = Vector2(W, 18)
	_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_words()
	_was_ready = ready_now()
	mouse_entered.connect(func() -> void: _hover = 1.0)
	mouse_exited.connect(func() -> void: _hover = 0.0)
	focus_entered.connect(func() -> void: _hover = 1.0)
	focus_exited.connect(func() -> void: _hover = 0.0)
	pressed.connect(_press)
	Kit.tap(self)
	disabled = not open
	# A shut bunk is a still painting: nothing to animate, nothing to redraw.
	if not open:
		set_process(false)


func leviathan() -> bool:
	return slot == int(Bunks.b()["leviathanSlot"])


func progress() -> float:
	if terms.is_empty():
		return 0.0
	return Bunks.stint_progress(terms["since"], Clock.now_ms(), float(terms["cap"]))


func ready_now() -> bool:
	return not terms.is_empty() and Bunks.stint_done(terms["since"], Clock.now_ms(), float(terms["cap"]))


func _words() -> void:
	if not open:
		_name.text = "The Leviathan bunk" if leviathan() else "Bunk %d" % (slot + 1)
		_name.add_theme_color_override("font_color", Paper.ink_faint())
		_sub.text = "Hall tier %d" % need_tier
		return
	if member.is_empty():
		_name.text = "The Leviathan bunk" if leviathan() else "Bunk %d" % (slot + 1)
		_sub.text = "Empty"
		return
	_name.text = str(member.get("name", ""))
	if ready_now():
		_sub.text = "Done  ·  press to collect"
		_sub.add_theme_color_override("font_color", HallBunks.GOLD)
	else:
		var left: float = Bunks.ms_until_done(terms["since"], Clock.now_ms(), float(terms["cap"]))
		var mins: int = int(ceil(left / 60000.0))
		var pay: String = "a draw" if leviathan() else "+%s XP" % Js.thousands(floor(float(terms["rate"]) * float(terms["cap"])))
		_sub.text = "%s left  ·  %s" % [("%dh %dm" % [mins / 60, mins % 60]) if mins >= 60 else "%dm" % mins, pay]


func _press() -> void:
	if not open:
		return
	Rumble.tap(8)
	if member.is_empty():
		owner_room.pick_for(self)
	elif ready_now():
		owner_room.collect(self)
	else:
		# Still asleep: a little rustle, and the time left.
		var tw: Tween = create_tween()
		tw.tween_property(_pic, "rotation", -0.12, 0.08).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tw.tween_property(_pic, "rotation", -0.06, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## Just bunked: the card drops into the bunk and settles.
func tuck_in() -> void:
	if _pic == null:
		return
	var home: Vector2 = _pic.position
	_pic.position = home - Vector2(0, 60)
	_pic.modulate.a = 0.0
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(_pic, "position", home, 0.45).set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)
	tw.tween_property(_pic, "modulate:a", 1.0, 0.2)


func _process(delta: float) -> void:
	_t += delta
	var lift: float = -4.0 * _hover if open and member.is_empty() else 0.0
	_bunk.position.y = lerpf(_bunk.position.y, 54.0 + lift, Motion.hover_k(delta))
	if _pic != null:
		var rdy: bool = ready_now()
		if rdy:
			# Awake and wanting out: a little bounce now and then.
			var b: float = maxf(0.0, sin(_t * 5.0)) * 4.0 if fmod(_t, 2.4) < 0.65 else 0.0
			_pic.position.y = 52.0 - b
			_pic.scale = Vector2.ONE
		else:
			# Asleep: a slow breath.
			var br: float = sin(_t * TAU / 3.4)
			_pic.scale = Vector2(1.0 + 0.012 * br, 1.0 + 0.022 * br)
		if rdy != _was_ready:
			_was_ready = rdy
			if rdy:
				Sound.bell()
	if int(_t * 2.0) != int((_t - delta) * 2.0):
		_words()
	# The fx move only for a sleeper, a waker, the Leviathan's glow, or an
	# empty bunk's plus as the hover changes; otherwise they are left drawn.
	if not member.is_empty() or (leviathan() and open) or _hover != _drawn_hover:
		_drawn_hover = _hover
		_fx.queue_redraw()


func _draw_fx() -> void:
	var lev: bool = leviathan() and open
	var c: Vector2 = Vector2(W / 2.0, 120.0)
	if lev:
		var g: float = 0.5 + 0.5 * sin(_t * 1.6)
		_fx.draw_circle(c, 78.0, Color(HallBunks.LEVIATHAN, 0.05 + 0.05 * g))
		_fx.draw_circle(c, 52.0, Color(HallBunks.LEVIATHAN, 0.04 + 0.04 * g))
	if member.is_empty():
		if open:
			var a: float = 0.35 + 0.35 * _hover
			_fx.draw_circle(Vector2(W / 2.0, 104.0), 15.0, Color(Paper.NIGHT_INK, 0.08 + 0.1 * _hover))
			_fx.draw_line(Vector2(W / 2.0 - 7, 104), Vector2(W / 2.0 + 7, 104), Color(Paper.NIGHT_INK, a), 2.0, true)
			_fx.draw_line(Vector2(W / 2.0, 97), Vector2(W / 2.0, 111), Color(Paper.NIGHT_INK, a), 2.0, true)
		return
	if ready_now():
		var p: float = Motion.pulse(_t)
		_fx.draw_circle(c, 70.0, Color(HallBunks.GOLD, 0.08 + 0.07 * p))
		_fx.draw_arc(c, 62.0 + 4.0 * p, 0.0, TAU, 48, Color(HallBunks.GOLD, 0.35 + 0.25 * p), 2.0, true)
		return
	# Asleep: z's drifting up from the pillow end, one every ~1.4 s.
	var f: Font = Kit.font("cinzel", 700)
	for k: int in 3:
		var u: float = fmod(_t / 4.2 + float(k) / 3.0, 1.0)
		var zp: Vector2 = Vector2(W / 2.0 + 30.0 + 16.0 * u + sin(u * 9.0) * 3.0, 64.0 - 52.0 * u)
		var a2: float = sin(u * PI) * 0.75
		_fx.draw_string(f, zp, "z", HORIZONTAL_ALIGNMENT_LEFT, -1, int(11.0 + 9.0 * u), Color(Paper.NIGHT_INK, a2))
	# The candle: wax burning down with the stint, the flame flickering.
	var pr: float = progress()
	var base: Vector2 = Vector2(18.0, 182.0)
	var full_h: float = 60.0
	var hgt: float = maxf(4.0, full_h * (1.0 - pr))
	_fx.draw_rect(Rect2(base + Vector2(-9, 0), Vector2(18, 5)), Color(0.55, 0.42, 0.25))
	_fx.draw_rect(Rect2(base + Vector2(-5, -hgt), Vector2(10, hgt)), Color(0.93, 0.88, 0.76))
	# A drip down the side, longer as it burns.
	_fx.draw_rect(Rect2(base + Vector2(3, -hgt), Vector2(2, minf(hgt, 6.0 + 20.0 * pr))), Color(0.98, 0.95, 0.85))
	var top: Vector2 = base + Vector2(0, -hgt)
	_fx.draw_line(top, top + Vector2(0, -4), Color(0.2, 0.15, 0.1), 1.5)
	var fl: float = 1.0 + 0.12 * sin(_t * 17.0) + 0.08 * sin(_t * 29.0)
	var fp: Vector2 = top + Vector2(sin(_t * 7.0) * 0.8, -10.0)
	_fx.draw_circle(fp, 16.0 * fl, Color(1.0, 0.7, 0.3, 0.10))
	_fx.draw_colored_polygon(_flame(fp, 4.2 * fl, 9.0 * fl), Color(1.0, 0.62, 0.2, 0.95))
	_fx.draw_colored_polygon(_flame(fp + Vector2(0, 2), 2.2 * fl, 5.0 * fl), Color(1.0, 0.93, 0.6))


static func _flame(at: Vector2, w: float, h: float) -> PackedVector2Array:
	var pts: PackedVector2Array = PackedVector2Array()
	for i: int in 12:
		var a: float = TAU * float(i) / 12.0
		var y: float = sin(a)
		var r: float = w * (1.0 - 0.35 * maxf(0.0, -y))
		pts.append(at + Vector2(cos(a) * r, y * (h if y < 0.0 else w)))
	return pts
