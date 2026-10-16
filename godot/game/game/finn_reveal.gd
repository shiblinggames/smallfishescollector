class_name FinnReveal
extends Node2D
## THE REVEAL ON THE WATER (Kong, 2026-10-16: "Juice it up a bit since we have
## Godot now ... This is literally the climactic reveal", then "do it on the
## actual sea"). The Finndicate Lives On plays on the live sea, your ship and
## Finn's little boat on it, the camera framing the two; the words stay on the
## StoryScene's plate (stage_mode), and a line's `cue` (port_rules campaignText)
## starts a moment here:
##   approach  morning light comes up, the sea framed on the two boats, the
##             music thins
##   boat      his boat comes out of the haze ahead, his back to you, a line out
##   turn      it comes about to face you (lean, dip and flip); the music cuts,
##             one low knock, the camera leans in
##   push      in closer on him
##   ink       on the screen, the F from the orders in wet ink, growing into
##             FINNDICATE with the FINN lit (ink_off takes it away)
##   rise      the six giants come up out of your hold as pale ghosts
##   ring      they circle him, slow
##   drain     one at a time, in the order you caught them, each pours into him
##             and goes grey; a low note each
##   flatten   the swell lies down to glass
##   grey      the grey shapes settle into their circle
##   become    he grows, the light gathering in him
##   cracks    light breaks out along him
##   dark      a white flash, his true shape on the water, and the dark
##             spreading out from him across the whole sea
##   pull      the camera draws back: how small you are beside him
##   recede    the water pulls back from him in rings
##   title     ONE LAST RIDE, set the way the title screen sets the game's name
## THE LONG QUIET (kind "quiet", the same stage; Kong: "match it to the
## cinematic style of the finn node") opens where the fight left him, his
## true shape lit on black glass water, and runs the reveal backwards:
##   fading      the light in him going out
##   release     the six pour back out of him, circle once, and sink home one
##               at a time, a rising note each
##   dissolve    what is left of him goes up, grey, and the wind takes it
##   boat_ghost  the little boat on the water, grey, and him in it
##   fade        thinner; gone: the boat goes under, the sea closes over it
##   dawn        the morning comes back across the sea, the swell with it, the
##               music back
##   treasure    the Finndicate's hoard going out across the water in gold
##   epilogue    EPILOGUE, the camera drawn wide
## Effects are particles and drawn shapes (FxSheet's rule); the giants and his
## final shape are their own paintings, as set pieces on the water.
## Lives in the sea's World (squashed by Chart.GROUND); finish() puts the sea back.

const GROUND: float = Chart.GROUND
## Where he sits, from your ship (to the east, a touch up the water).
const FINN_AT: Vector2 = Vector2(380.0, -40.0)
const GHOST: Color = Color(0.72, 0.9, 1.0)
const DRAINED: Color = Color(0.5, 0.52, 0.56)
const GOLD: Color = Color(1.0, 0.8, 0.35)
## The morning after: soft blue water and a warm low light (over the bay's own).
const DAWN_THEME: Dictionary = { "sea": [Color8(24, 58, 80), Color8(52, 104, 126), Color8(120, 168, 172)], "light": Color(1.0, 0.9, 0.76), "dim": 0.0 }
const NIGHT_THEME: Dictionary = { "sea": [Color8(10, 8, 22), Color8(26, 18, 44), Color8(52, 36, 78)], "light": Color(0.55, 0.48, 0.72), "dim": 0.2 }

var sea: Sea
## "reveal" (The Finndicate Lives On) or "quiet" (The Long Quiet).
var kind: String = "reveal"
## The plate's screen-space layers: under the busts (the dark, the flash)
## and over them (the F, the title); StoryScene.under and .over.
var under: Control
var over: Control

var fx: BattleFx
var _finn: RevealHull
var _final: Sprite2D
var _ghosts: Array = []
var _ring_a: float = 0.0
var _ring_on: bool = false
var _ring_r: float = 230.0
var _home: Vector2
var _spot: Vector2
## The framing's base zoom: the two boats filling the screen the way a
## fight's line does (BattleStage FRAME_FILL), so the shots scale from it.
var _zoom0: float = 1.0
var _lamp: PointLight2D
var _dark: ColorRect
var _ink: InkWord
var _title: Label
var _done: Array = []
var _t: float = 0.0
var _glow: float = 0.0
var _calm: bool = false


func _ready() -> void:
	set_meta("fight", true)
	z_index = 2
	_calm = GameSettings.calm()
	_home = sea._boat.position
	_spot = _home + FINN_AT
	var vp: Vector2 = get_viewport_rect().size
	_zoom0 = clampf(vp.x * 0.62 / (absf(FINN_AT.x) + 520.0), 0.6, 1.6)
	fx = BattleFx.new()
	fx.field = sea._field
	fx.z_index = 6
	fx.set_meta("fight", true)
	sea._world.add_child(fx)
	# Your ship holds, facing him, and the HUD steps back for the film.
	sea._boat.velocity = Vector2.ZERO
	sea._boat.target = null
	sea._boat.hold_still = true
	sea._boat.face_to(-1.0 if FINN_AT.x < 0.0 else 1.0)
	sea._hud.visible = false
	sea.cine_dark = float(SeaClock.at(Clock.now_ms())["darkness"])
	sea.cine_clear = true
	_frame(Vector2(FINN_AT.x * 0.5, FINN_AT.y * 0.5), 1.0)
	if kind == "quiet":
		_quiet_open()


## Line i's cue, if it has one (StoryScene.line_shown).
func cue_line(_i: int, line: Dictionary) -> void:
	# The Long Quiet opens in the dark: it covers the sea from the first line
	# (the layer only exists once the scene is up).
	if kind == "quiet" and _dark == null and under != null:
		_spread_dark(true)
	var c: String = str(line.get("cue", ""))
	if c == "" or c in _done:
		return
	_done.append(c)
	match c:
		"approach":
			_approach()
		"boat":
			_boat()
		"turn":
			_turn()
		"push":
			_frame(FINN_AT, 1.75)
		"ink":
			_ink_in()
		"ink_off":
			_ink_out()
		"rise":
			_rise()
		"ring":
			_ring()
		"drain":
			_drain()
		"flatten":
			_flatten()
		"grey":
			_grey()
		"become":
			_become()
		"cracks":
			_cracks()
		"dark":
			_go_dark()
		"pull":
			_frame(Vector2(FINN_AT.x * 0.5, FINN_AT.y * 0.5 - 140.0), 0.62)
		"recede":
			_recede()
		"title":
			_title_in("ONE LAST RIDE")
		"fading":
			_fading()
		"release":
			_release()
		"dissolve":
			_dissolve()
		"boat_ghost":
			_boat_ghost()
		"fade":
			if _finn != null:
				_finn.create_tween().tween_property(_finn, "modulate:a", 0.35, 1.6)
		"gone":
			_gone()
		"dawn":
			_dawn()
		"treasure":
			_treasure()
		"epilogue":
			_frame(Vector2(FINN_AT.x * 0.3, -120.0), 0.5)
			_title_in("EPILOGUE")


# ── The camera ──────────────────────────────────────────────────────────────

## Frame the shot: `at` from your ship, in the world; k of the zoom she
## opened at (the fight's framing, so the water clears around the two boats).
func _frame(at: Vector2, k: float) -> void:
	var z: float = _zoom0 * k
	sea.stage = { "zoom": z, "shift": Vector2(at.x, at.y * GROUND - 30.0) * z }


# ── The beats ───────────────────────────────────────────────────────────────

func _approach() -> void:
	Sound.music_hush(0.4, 3.0)
	_frame(Vector2(FINN_AT.x * 0.5, FINN_AT.y * 0.5), 1.15)
	# The morning comes up, whatever hour she sailed in at.
	create_tween().tween_property(sea, "cine_dark", 0.0, 3.0).set_trans(Tween.TRANS_SINE)


func _boat() -> void:
	_finn = RevealHull.new()
	_finn.spot = _spot
	_finn.modulate.a = 0.0
	add_child(_finn)
	# His back to you: he faces the way you are not.
	_finn.facing = -1.0 if FINN_AT.x > 0.0 else 1.0
	create_tween().tween_property(_finn, "modulate:a", 1.0, 2.2).set_trans(Tween.TRANS_SINE)
	sea._field.ring(_spot, 120.0, 2.6, 0.2)


func _turn() -> void:
	if _finn == null:
		_boat()
	Sound.music_hush(0.0, 0.25)
	await _wait(0.35)
	Sound.knock()
	if not _calm:
		Rumble.buzz([0, 60, 30, 40])
	_finn.come_about(1.0 if FINN_AT.x > 0.0 else -1.0)
	_frame(Vector2(FINN_AT.x * 0.75, FINN_AT.y * 0.75), 1.45)


func _ink_in() -> void:
	if over == null:
		return
	_ink = InkWord.new()
	_ink.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_ink.mouse_filter = Control.MOUSE_FILTER_IGNORE
	over.add_child(_ink)
	Sound.wax_crack()


func _ink_out() -> void:
	if _ink != null and is_instance_valid(_ink):
		var ink: InkWord = _ink
		_ink = null
		var tw: Tween = ink.create_tween()
		tw.tween_property(ink, "modulate:a", 0.0, 0.9)
		tw.tween_callback(ink.queue_free)


func _rise() -> void:
	var ids: Array = _order()
	Sound.shimmer()
	for k: int in ids.size():
		var g: Sprite2D = _ghost(float(ids[k]), _home + Vector2(randf_range(-20, 20), -10.0))
		# Up out of the hold, one after another, hanging over your deck.
		var up: Vector2 = _home + Vector2(-120.0 + 48.0 * k, -150.0 - 18.0 * (k % 2))
		var tw: Tween = g.create_tween().set_parallel()
		tw.tween_property(g, "modulate:a", 0.85, 0.8).set_delay(0.28 * k)
		tw.tween_property(g, "position", up, 1.6).set_delay(0.28 * k).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
		fx.rise(_home + Vector2(randf_range(-30, 30), -20.0), GHOST, 5)


func _ring() -> void:
	if _ghosts.is_empty():
		_rise()
		await _wait(1.0)
	_ring_on = true
	_ring_a = 0.0
	_frame(Vector2(FINN_AT.x * 0.65, FINN_AT.y * 0.65 - 40.0), 1.05)
	for k: int in _ghosts.size():
		var g: Sprite2D = _ghosts[k]
		g.set_meta("glide", 0.0)
		g.create_tween().tween_method(func(u: float) -> void: g.set_meta("glide", u), 0.0, 1.0, 1.8).set_delay(0.12 * k).set_trans(Tween.TRANS_SINE)


func _drain() -> void:
	if not _ring_on:
		_ring()
		await _wait(1.8)
	for k: int in _ghosts.size():
		var g: Sprite2D = _ghosts[k]
		if not is_instance_valid(g):
			continue
		fx.motes(g.position, _spot + Vector2(0, -40), GHOST, 18, "spark")
		Sound.drain_note(k)
		await _wait(0.45)
		g.set_meta("drained", true)
		g.create_tween().tween_property(g, "modulate", Color(DRAINED, 0.55), 0.6)
		fx.pulse(_spot + Vector2(0, -40), Color(GHOST, 0.9))
		_glow = minf(1.0, _glow + 0.17)
		if _finn != null:
			_finn.glow = _glow
		if not _calm:
			Rumble.tap(4 + k)
		await _wait(0.4)
	if not _calm:
		Rumble.buzz([0, 80, 40, 60])


func _flatten() -> void:
	create_tween().tween_property(sea, "cine_swell", 0.04, 2.4).set_trans(Tween.TRANS_SINE)
	Sound.music_hush(0.0, 0.5)


func _grey() -> void:
	for g: Sprite2D in _ghosts:
		if is_instance_valid(g):
			g.set_meta("drained", true)
			g.create_tween().tween_property(g, "modulate", Color(DRAINED, 0.5), 1.0)
	_ring_r = 300.0


func _become() -> void:
	if _finn == null:
		_boat()
	Sound.charge()
	_frame(FINN_AT, 1.35)
	var tw: Tween = _finn.create_tween().set_parallel()
	tw.tween_property(_finn, "scale", Vector2(1.9, 1.9), 3.2).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tw.tween_property(_finn, "glow", 1.0, 2.0)
	for k: int in 3:
		fx.rise(_spot + Vector2(randf_range(-40, 40), -60.0 * k), Color(0.85, 0.75, 1.0), 6)


func _cracks() -> void:
	if _finn == null:
		_boat()
	_finn.cracking = true
	if not _calm:
		Rumble.buzz([0, 40, 30, 40, 30, 60])
	for k: int in 5:
		fx.flare_up(_spot + Vector2(randf_range(-50, 50), randf_range(-110, -20)), k == 4)
		await _wait(0.22)


func _go_dark() -> void:
	# The flash.
	Sound.boom()
	var flash: ColorRect = ColorRect.new()
	flash.color = Color(1, 1, 1, 0.0)
	flash.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if under != null:
		under.add_child(flash)
		var ft: Tween = flash.create_tween()
		ft.tween_property(flash, "color:a", 0.6 if _calm else 0.95, 0.12)
		ft.tween_property(flash, "color:a", 0.0, 1.1)
		ft.tween_callback(flash.queue_free)
	if not _calm:
		Rumble.buzz([0, 120, 60, 200])
	# His true shape, where the little boat was.
	if _finn != null:
		_finn.visible = false
	_true_shape()
	_lamp.create_tween().tween_property(_lamp, "energy", 1.4, 1.6).set_delay(0.3)
	var t2: Tween = _final.create_tween().set_parallel()
	t2.tween_property(_final, "modulate", Color(1, 1, 1, 1), 1.2).set_delay(0.15)
	t2.tween_property(_final, "position", _spot + Vector2(0, 0), 1.4)
	# Back as he rises, to take in the size of him.
	_frame(Vector2(FINN_AT.x * 0.7, FINN_AT.y * 0.7 - 160.0), 0.82)
	sea._field.ring(_spot, 420.0, 3.0, 0.6)
	_spread_dark()
	create_tween().tween_property(sea, "cine_dark", 0.95, 3.6).set_delay(0.5)
	sea.water_theme = NIGHT_THEME
	await _wait(1.6)
	Sound.music_track("night", 0.55)


## His true shape on the water (unseen; the caller brings it in), lit by its
## own light so the dark never takes him.
func _true_shape() -> void:
	_final = Sprite2D.new()
	_final.texture = Skipper.tex("finn_final.png")
	var h: float = 560.0
	var s: float = h / (float(_final.texture.get_height()) if _final.texture != null else 600.0)
	_final.scale = Vector2(s, s / GROUND)
	_final.offset = Vector2(0, -(float(_final.texture.get_height()) if _final.texture != null else 600.0) / 2.0)
	_final.position = _spot + Vector2(0, 10)
	_final.modulate = Color(0.75, 0.6, 0.95, 0.0)
	add_child(_final)
	# His own light: the dark takes the sea, never him.
	_lamp = PointLight2D.new()
	_lamp.texture = Glow.radial(256, Color(0.85, 0.7, 1.0), true)
	_lamp.texture_scale = 5.0
	_lamp.color = Color(0.85, 0.72, 1.0)
	_lamp.energy = 0.0
	_lamp.position = _spot + Vector2(0, -300)
	add_child(_lamp)


## The dark, out from him across the sea (now: already everywhere).
func _spread_dark(now: bool = false) -> void:
	if under != null:
		_dark = ColorRect.new()
		_dark.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		_dark.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var mat: ShaderMaterial = ShaderMaterial.new()
		mat.shader = _dark_shader()
		mat.set_shader_parameter("u_r", 0.0)
		_dark.material = mat
		under.add_child(_dark)
		under.move_child(_dark, 0)
		if now:
			mat.set_shader_parameter("u_r", 2.2)
		else:
			var dt: Tween = _dark.create_tween()
			dt.tween_method(func(r: float) -> void: mat.set_shader_parameter("u_r", r), 0.0, 2.2, 3.4).set_delay(0.3).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)


func _recede() -> void:
	for k: int in 3:
		sea._field.ring(_spot, 220.0 + 140.0 * k, 2.4, 0.5)
		await _wait(0.5)


func _title_in(words: String) -> void:
	if over == null:
		return
	if _title != null and is_instance_valid(_title):
		_title.queue_free()
	_title = Label.new()
	_title.text = words
	_title.add_theme_font_override("font", Kit.font("cinzel", 800))
	_title.add_theme_font_size_override("font_size", 64)
	_title.add_theme_color_override("font_color", BattleLook.CREAM)
	_title.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.7))
	_title.add_theme_constant_override("shadow_offset_y", 4)
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	_title.offset_left = -600
	_title.offset_right = 600
	_title.offset_top = 150
	_title.offset_bottom = 240
	_title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_title.modulate.a = 0.0
	over.add_child(_title)
	var sp: FontVariation = FontVariation.new()
	sp.base_font = Kit.font("cinzel", 800)
	sp.spacing_glyph = 4
	_title.add_theme_font_override("font", sp)
	var tw: Tween = _title.create_tween().set_parallel()
	tw.tween_property(_title, "modulate:a", 1.0, 1.6).set_delay(0.4)
	tw.tween_method(func(g: float) -> void: sp.spacing_glyph = int(g), 4.0, 18.0, 3.0).set_delay(0.4).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	Sound.knock()


## The scene is over: the sea as it was.
func finish() -> void:
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(self, "modulate:a", 0.0, 0.8)
	for n: CanvasItem in [_dark, _title, _ink]:
		if n != null and is_instance_valid(n):
			n.queue_free()
	sea.stage = null
	sea.water_theme = {}
	var st: Tween = sea.create_tween().set_parallel()
	st.tween_property(sea, "cine_swell", 1.0, 2.0)
	st.tween_property(sea, "cine_dark", float(SeaClock.at(Clock.now_ms())["darkness"]), 2.0)
	st.chain().tween_callback(func() -> void: sea.cine_dark = -1.0)
	sea._boat.hold_still = false
	sea.cine_clear = false
	sea._hud.visible = true
	Sound.music_release()
	await tw.finished
	if is_instance_valid(fx):
		fx.queue_free()
	queue_free()


# ── Each frame ─────────────────────────────────────────────────────────────

func _process(delta: float) -> void:
	_t += delta
	if _dark != null and is_instance_valid(_dark):
		# The dark spreads from where he stands on the screen.
		var vp: Vector2 = get_viewport_rect().size
		var at: Vector2 = sea._world.get_global_transform_with_canvas() * (_spot + Vector2(0, -60))
		(_dark.material as ShaderMaterial).set_shader_parameter("u_c", at / vp)
	if _ring_on:
		_ring_a += delta * 0.32
		var n: int = _ghosts.size()
		for k: int in n:
			var g: Sprite2D = _ghosts[k]
			if not is_instance_valid(g):
				continue
			var a: float = _ring_a + TAU * k / float(maxi(1, n))
			var on_ring: Vector2 = _spot + Vector2(cos(a) * _ring_r, sin(a) * _ring_r * 0.55 - 70.0 + sin(_t * 1.3 + k) * 8.0)
			var u: float = float(g.get_meta("glide", 1.0))
			g.position = g.position.lerp(on_ring, u if u < 1.0 else 1.0 - exp(-delta * 4.0))
			g.flip_h = cos(a + PI / 2.0) < 0.0
			# Those in front of him ride over him; the far side under.
			g.z_index = 3 if sin(a) > 0.0 else 0


func _wait(s: float) -> void:
	await get_tree().create_timer(s).timeout


## The order you caught them (the save keeps it), the six by number if not.
func _order() -> Array:
	var got: Array = Js.list(sea.session.profile().get("ancient_catches"))
	var out: Array = []
	for id: Variant in got:
		if not out.has(float(id)):
			out.append(float(id))
	for id: float in Vigil.ANCIENT_IDS:
		if not out.has(id):
			out.append(id)
	return out.slice(0, 6)


## The dark spreading from him: everything inside the front goes to night,
## the front itself a thin cold rim.
func _dark_shader() -> Shader:
	var s: Shader = Shader.new()
	s.code = """
shader_type canvas_item;
uniform vec2 u_c = vec2(0.6, 0.42);
uniform float u_r = 0.0;
void fragment() {
	vec2 d = (UV - u_c) * vec2(1.6, 1.0);
	float r = length(d);
	float inside = 1.0 - smoothstep(u_r - 0.12, u_r, r);
	float rim = smoothstep(u_r - 0.05, u_r, r) * (1.0 - smoothstep(u_r, u_r + 0.03, r));
	vec3 col = mix(vec3(0.02, 0.01, 0.05), vec3(0.55, 0.45, 0.9), rim);
	COLOR = vec4(col, inside * 0.55 + rim * 0.35);
}
"""
	return s


# ── Finn's boat for the reveal ─────────────────────────────────────────────

## His hull from the sea, held on its mark (not circling his mooring), no
## plate (his name would give him away), no fish landed, and turned by hand.
class RevealHull:
	extends FinnHull
	var spot: Vector2 = Vector2.ZERO
	var facing: float = 1.0:
		set(v):
			facing = v
			_facing = v
	var glow: float = 0.0
	var cracking: bool = false
	var _turning: bool = false
	var _ct: float = 0.0

	func _ready() -> void:
		super._ready()
		_next_catch = 1e9
		_plate.visible = false
		mark = ""

	func _place(_first: bool = false) -> void:
		position = spot
		if not _turning:
			skipper.scale.x = _facing

	## Lean, dip and flip, the way the ships come about.
	func come_about(to: float) -> void:
		_turning = true
		var from: float = _facing
		var tw: Tween = create_tween()
		tw.tween_method(func(u: float) -> void:
			skipper.scale.x = lerpf(from, to, u)
			skipper.rotation = sin(u * PI) * 0.12 * signf(to)
			skipper.position.y = sin(u * PI) * 10.0, 0.0, 1.0, 0.9).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		tw.tween_callback(func() -> void:
			_facing = to
			facing = to
			skipper.rotation = 0.0
			skipper.position.y = 0.0
			_turning = false)

	func _process(delta: float) -> void:
		super._process(delta)
		_ct += delta
		# The light gathering in him, then breaking out along him.
		var g: float = glow * (0.85 + 0.15 * sin(_ct * 9.0))
		var c: Color = Color.WHITE.lerp(Color(0.9, 0.82, 1.0), g * 0.6)
		if cracking:
			c = c.lerp(Color(1.4, 1.35, 1.6), 0.5 + 0.5 * sin(_ct * 22.0))
		skipper.modulate = c
		queue_redraw()

	func _draw() -> void:
		if glow <= 0.01:
			return
		var g: float = glow * (0.85 + 0.15 * sin(_ct * 9.0))
		for k: int in 3:
			draw_circle(Vector2(0, -40.0), (40.0 + 28.0 * k) * (1.0 + g * 0.3), Color(0.8, 0.7, 1.0, 0.07 * g))
		if cracking:
			for k: int in 7:
				var a: float = TAU * k / 7.0 + _ct * 0.6
				var p0: Vector2 = Vector2(0, -50) + Vector2.from_angle(a) * 12.0
				var p1: Vector2 = Vector2(0, -50) + Vector2.from_angle(a + sin(_ct * 3.0 + k) * 0.3) * (60.0 + 30.0 * sin(_ct * 7.0 + k))
				draw_line(p0, p1, Color(1.0, 0.95, 1.0, 0.75), 2.5, true)


# ── The F ──────────────────────────────────────────────────────────────────

## The F from the orders, in wet red ink; then FINN lit in gold and DICATE
## after it, quieter: the name was the answer the whole time.
class InkWord:
	extends Control
	var _t: float = 0.0
	var _splats: Array = []

	func _ready() -> void:
		for k: int in 9:
			_splats.append([Vector2(randf_range(-70, 70), randf_range(-60, 50)), randf_range(3, 9), randf_range(0.0, 0.3)])

	func _process(delta: float) -> void:
		_t += delta
		queue_redraw()

	func _draw() -> void:
		var f: Font = Kit.font("cinzel", 800)
		var c: Vector2 = Vector2(size.x / 2.0, size.y * 0.3)
		var fs: int = 128
		var full: String = "FINNDICATE"
		var w: float = f.get_string_size(full, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var x0: float = c.x - w / 2.0
		var ink: Color = Color(0.62, 0.08, 0.1)
		# 1. The F alone, in the middle, bleeding in.
		var a_f: float = clampf(_t / 0.5, 0.0, 1.0)
		var settle: float = clampf((_t - 1.4) / 0.9, 0.0, 1.0)
		var s_ease: float = settle * settle * (3.0 - 2.0 * settle)
		var fw: float = f.get_string_size("F", HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var f_x: float = lerpf(c.x - fw / 2.0, x0, s_ease)
		var f_col: Color = ink.lerp(Color(1.0, 0.8, 0.35), clampf((_t - 2.2) / 0.6, 0.0, 1.0))
		for sp: Array in _splats:
			var u: float = clampf((_t - float(sp[2])) / 0.35, 0.0, 1.0) * (1.0 - s_ease)
			if u > 0.0:
				draw_circle(Vector2(c.x, c.y - fs * 0.35) + (sp[0] as Vector2) * u, float(sp[1]) * u, Color(ink, 0.6 * (1.0 - s_ease)))
		draw_string(f, Vector2(f_x + 3, c.y + 4), "F", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(0, 0, 0, 0.5 * a_f))
		draw_string(f, Vector2(f_x, c.y), "F", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(f_col, a_f))
		if _t < 2.2:
			return
		# 2. INN after it in gold, a letter at a time; then DICATE, quieter.
		var x: float = x0 + fw
		for k: int in range(1, full.length()):
			var ch: String = full[k]
			var at: float = 2.2 + 0.16 * (k - 1) + (0.5 if k >= 4 else 0.0)
			var u: float = clampf((_t - at) / 0.35, 0.0, 1.0)
			var col: Color = Color(1.0, 0.8, 0.35) if k < 4 else Color(0.95, 0.9, 0.82, 0.55)
			if u > 0.0:
				draw_string(f, Vector2(x + 3, c.y + 4 - (1.0 - u) * 14.0), ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(0, 0, 0, 0.5 * u))
				draw_string(f, Vector2(x, c.y - (1.0 - u) * 14.0), ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(col, col.a * u))
			x += f.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x


## A giant as a pale ghost on the water (added, unseen).
func _ghost(id: float, at: Vector2) -> Sprite2D:
	var sp: Dictionary = sea.session.store.species(id)
	var g: Sprite2D = Sprite2D.new()
	g.texture = Skipper.tex("fish/%s" % ResultCard.fish_art_path(str(sp.get("name", ""))).get_file())
	var tex_w: float = float(g.texture.get_width()) if g.texture != null else 400.0
	var w: float = 150.0
	g.scale = Vector2(w / tex_w, w / tex_w / GROUND)
	g.modulate = Color(GHOST, 0.0)
	var m: CanvasItemMaterial = CanvasItemMaterial.new()
	m.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	g.material = m
	g.position = at
	add_child(g)
	_ghosts.append(g)
	return g


# ── The Long Quiet ─────────────────────────────────────────────────────────

## Where the fight left him: his true shape, lit, on black glass water.
func _quiet_open() -> void:
	sea.cine_dark = 0.95
	sea.cine_swell = 0.04
	sea.water_theme = NIGHT_THEME
	_true_shape()
	_final.modulate = Color(1, 1, 1, 0.0)
	_final.create_tween().tween_property(_final, "modulate:a", 1.0, 1.4)
	_lamp.energy = 1.2
	Sound.music_track("night", 0.3)
	_frame(Vector2(FINN_AT.x * 0.7, FINN_AT.y * 0.7 - 160.0), 0.82)


func _fading() -> void:
	if _final == null:
		return
	var tw: Tween = _final.create_tween().set_parallel()
	tw.tween_property(_final, "modulate", Color(0.7, 0.66, 0.8, 1.0), 2.0)
	tw.tween_property(_lamp, "energy", 0.5, 2.0)
	for k: int in 3:
		fx.rise(_spot + Vector2(randf_range(-60, 60), -120.0 - 80.0 * k), Color(0.8, 0.7, 1.0), 5)


## The six pour back out of him, circle once, and sink home one at a time.
func _release() -> void:
	var ids: Array = _order()
	for k: int in ids.size():
		var g: Sprite2D = _ghost(float(ids[k]), _spot + Vector2(0, -160))
		g.modulate = Color(DRAINED, 0.0)
		g.create_tween().tween_property(g, "modulate", Color(GHOST, 0.85), 1.2).set_delay(0.2 * k)
		g.set_meta("glide", 0.0)
		g.create_tween().tween_method(func(u: float) -> void: g.set_meta("glide", u), 0.0, 1.0, 1.6).set_delay(0.2 * k).set_trans(Tween.TRANS_SINE)
		fx.motes(_spot + Vector2(0, -60), _spot + Vector2(cos(TAU * k / 6.0) * 220.0, sin(TAU * k / 6.0) * 120.0), GHOST, 8, "spark")
	_ring_r = 260.0
	_ring_on = true
	Sound.shimmer()
	await _wait(3.4)
	# Home: down into the water, one after another.
	for k: int in _ghosts.size():
		var g: Sprite2D = _ghosts[k]
		if not is_instance_valid(g):
			continue
		var tw: Tween = g.create_tween().set_parallel()
		tw.tween_property(g, "modulate:a", 0.0, 1.1)
		tw.tween_property(g, "scale", g.scale * Vector2(1.0, 0.4), 1.1)
		sea._field.ring(g.position, 90.0, 2.2, 0.35)
		Sound.drain_note(5 - k)
		await _wait(0.55)


func _dissolve() -> void:
	if _final == null:
		return
	var tw: Tween = _final.create_tween().set_parallel()
	tw.tween_property(_final, "modulate", Color(0.6, 0.6, 0.64, 0.0), 2.6)
	tw.tween_property(_final, "position", _spot + Vector2(40, -90), 2.6).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tw.tween_property(_lamp, "energy", 0.0, 2.0)
	# The night lifts a little with him gone: enough to see what is left.
	create_tween().tween_property(sea, "cine_dark", 0.6, 3.0)
	Sound.whoosh()
	for k: int in 6:
		fx.rise(_spot + Vector2(randf_range(-80, 80), -60.0 - 70.0 * k), Color(0.75, 0.75, 0.78), 6)
		await _wait(0.3)


func _boat_ghost() -> void:
	_finn = RevealHull.new()
	_finn.spot = _spot
	_finn.facing = 1.0 if FINN_AT.x > 0.0 else -1.0
	_finn.modulate = Color(0.86, 0.88, 0.95, 0.0)
	add_child(_finn)
	_finn.create_tween().tween_property(_finn, "modulate:a", 0.85, 1.8)
	# A pale light of his own, the last of it.
	var l: PointLight2D = PointLight2D.new()
	l.texture = Glow.radial(256, Color(0.8, 0.85, 1.0), true)
	l.texture_scale = 2.6
	l.color = Color(0.8, 0.86, 1.0)
	l.energy = 0.0
	l.position = Vector2(0, -60)
	_finn.add_child(l)
	l.create_tween().tween_property(l, "energy", 1.1, 1.8)
	_frame(Vector2(FINN_AT.x * 0.75, FINN_AT.y * 0.75), 1.4)


func _gone() -> void:
	if _finn == null:
		return
	_finn.set_process(false)
	var tw: Tween = _finn.create_tween().set_parallel()
	tw.tween_property(_finn, "modulate:a", 0.0, 1.8)
	tw.tween_property(_finn, "position:y", _spot.y + 26.0, 1.8).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	sea._field.ring(_spot, 160.0, 3.0, 0.5)
	Sound.knock()


## The morning comes back across the sea.
func _dawn() -> void:
	sea.water_theme = DAWN_THEME
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(sea, "cine_dark", 0.0, 6.0).set_trans(Tween.TRANS_SINE)
	tw.tween_property(sea, "cine_swell", 1.0, 7.0).set_trans(Tween.TRANS_SINE)
	if _dark != null and is_instance_valid(_dark):
		var mat: ShaderMaterial = _dark.material
		tw.tween_method(func(r: float) -> void: mat.set_shader_parameter("u_r", r), 2.2, 0.0, 5.0).set_trans(Tween.TRANS_SINE)
	Sound.music_track("dawn", 0.7)
	_frame(Vector2(FINN_AT.x * 0.4, FINN_AT.y * 0.4), 1.0)


## The Finndicate's hoard, going back out across the water in gold.
func _treasure() -> void:
	Sound.chest(true)
	for k: int in 8:
		var a: float = TAU * k / 8.0
		var far: Vector2 = _home + Vector2(cos(a) * 900.0, sin(a) * 500.0)
		fx.motes(_home, far, GOLD, 6, "spark")
		await _wait(0.18)
