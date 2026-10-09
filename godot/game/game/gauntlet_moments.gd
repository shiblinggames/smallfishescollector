class_name GauntletMoments
extends Node2D
## THE GAUNTLET'S MOMENTS ON THE WATER (Kong, 2026-10-05: "Ok proceed", on the
## proposal; the web's shrine breaching and boss rising were the ones he
## loved, and he asked that each be DISTINCT, never one reused move). Between
## fights the dive happens in the world before any sheet comes up:
##   DESCENT   the water spirals under the party, darkening, and opens out in
##             the new band's colour as the depth card comes up
##   SHRINE    the chained idol breaches beside the party, slow and heavy; then
##             your answer: Davy's Coin spins up off the altar (onto your deck
##             if it falls your way, into the sea if not), the Blood Price
##             reddens the water in a ring round the stone, Walk On lets it
##             settle back under
##   FENCE     the peddler's boat rows in out of the dark, lantern lit, and ties
##             up alongside; it rows off when the stall closes
##   HOMEWARD  cashing out: the spiral turns the other way and opens, light
##             comes down through the water, and the party lifts toward it
##   DROWNED   lost to the Locker: the hulls settle under one by one and the
##             rings close over them
##   CURSE     dark ink spreads under the hulls from one point, bubbles over it
##   THE JOB   a launch of the Don's, green lantern lit, comes alongside with
##             the stakes and waits until the job is settled
##   BREATHER  the chop settles and light comes down round the party (short)
##   ARRIVALS  the lead elite comes out of a fog bank; each boss its own way
##             (see ENTRIES)
## Effects are particles and drawn shapes (FxSheet's rule); only the idol and
## the peddler's boat are paintings, as set pieces on the water.
## Lives in the sea's World (squashed by GROUND); the stage owns it.

## The sea's ground squash (one value, Chart.GROUND).
const GROUND: float = Chart.GROUND

var field: SeaField
var fx: BattleFx
var _whirls: Array = []
var _words: Array = []
var _rings: Array = []
var _coins: Array = []
var _shafts: Array = []
var _pieces: Dictionary = {}
## Over the hulls (the coin, the light coming down); this node itself lies
## on the water, under them.
var _over: Node2D


func _ready() -> void:
	z_index = -1
	_over = Node2D.new()
	_over.z_as_relative = false
	_over.z_index = 4
	_over.draw.connect(_draw_over)
	add_child(_over)


func _process(delta: float) -> void:
	for arr: Array in [_whirls, _words, _rings, _coins, _shafts, _charts, _gates, _trail, _booms, _stills]:
		for w: Dictionary in arr:
			w["t"] = float(w["t"]) + delta
		arr.assign(arr.filter(func(w: Dictionary) -> bool: return float(w["t"]) < float(w["life"])))
	for c: Dictionary in _coins:
		var u: float = clampf(float(c["t"]) / float(c["life"]), 0.0, 1.0)
		c["p"] = (c["a"] as Vector2).lerp(c["b"], u)
		c["lift"] = sin(u * PI) * float(c["h"])
		if not c.get("landed", false) and u >= 0.98:
			c["landed"] = true
			(c["on_land"] as Callable).call()
	queue_redraw()
	_over.queue_redraw()


func _wait(s: float) -> void:
	await get_tree().create_timer(s).timeout


# ── Drawing ────────────────────────────────────────────────────────────────────

func _draw() -> void:
	_draw_arrivals()
	for w: Dictionary in _whirls:
		_draw_whirl(w)
	for r: Dictionary in _rings:
		if float(r["t"]) < 0.0:
			continue
		var u: float = float(r["t"]) / float(r["life"])
		var rad: float = lerpf(float(r["r0"]), float(r["r1"]), 1.0 - pow(1.0 - u, 2.0))
		var a: float = float(r["a"]) * sin(minf(1.0, u * 3.0) * PI * 0.5) * (1.0 - u)
		draw_set_transform(r["p"], 0.0, Vector2(1.0, GROUND))
		draw_arc(Vector2.ZERO, rad, 0.0, TAU, 72, Color(r["c"], a), float(r["w"]), true)
		draw_arc(Vector2.ZERO, rad * 0.94, 0.0, TAU, 72, Color(r["c"], a * 0.35), float(r["w"]) * 2.4, true)
	for wd: Dictionary in _words:
		var u3: float = float(wd["t"]) / float(wd["life"])
		var a3: float = sin(u3 * PI) * float(wd["a"])
		var f: Font = Kit.font("cinzel", 800)
		var size: int = int(wd["size"])
		var txt: String = str(wd["text"])
		var tw: float = f.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
		draw_set_transform(wd["p"], 0.0, Vector2(1.0 + u3 * 0.08, GROUND * (1.0 + u3 * 0.08)))
		draw_string(f, Vector2(-tw / 2.0, size * 0.35), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, size, Color(wd["c"], a3))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _draw_over() -> void:
	for s: Dictionary in _shafts:
		var u2: float = float(s["t"]) / float(s["life"])
		var a2: float = sin(u2 * PI) * 0.5
		_over.draw_set_transform(s["p"], 0.0, Vector2(1.0, 1.0))
		var wdt: float = float(s["w"])
		# Soft shafts: each a few nested slivers, bright at the top and gone
		# by the water, so no edge reads as a stripe.
		for k: int in 6:
			var x: float = (k - 2.5) * wdt * 0.22 + sin(float(s["t"]) * 0.7 + k) * 10.0
			var sway: float = sin(float(s["t"]) * 0.5 + k * 1.3) * 12.0
			for layer: int in 3:
				var hw: float = (10.0 + layer * 14.0)
				var bw: float = (26.0 + layer * 30.0)
				var la: float = a2 * (0.07 + 0.03 * (k % 2)) * (1.0 - layer * 0.3)
				var top: Color = Color(1.0, 0.95, 0.8, la)
				var bot: Color = Color(1.0, 0.95, 0.8, 0.0)
				var pts: PackedVector2Array = PackedVector2Array([Vector2(x - hw + sway, -900), Vector2(x + hw + sway, -900), Vector2(x * 1.6 + bw, 30), Vector2(x * 1.6 - bw, 30)])
				_over.draw_polygon(pts, PackedColorArray([top, top, bot, bot]))
	for c: Dictionary in _coins:
		var p: Vector2 = Vector2((c["p"] as Vector2).x, (c["p"] as Vector2).y)
		var spin: float = absf(cos(float(c["t"]) * 11.0))
		var rr: float = 17.0
		_over.draw_set_transform(p + Vector2(0, -float(c["lift"]) * GROUND - 60.0), 0.0, Vector2(maxf(0.08, spin), 1.0))
		# A flat coin: one gold fill in one darker ring (no shine, no bevel).
		_over.draw_circle(Vector2.ZERO, rr + 2.0, Color(0.45, 0.3, 0.08, 0.9))
		_over.draw_circle(Vector2.ZERO, rr, Color(0.98, 0.78, 0.3))
	_over.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _draw_whirl(w: Dictionary) -> void:
	var t: float = float(w["t"])
	var life: float = float(w["life"])
	var u: float = t / life
	var dir: float = float(w["dir"])
	# In over the first fifth, full in the middle, opening out at the end.
	var a: float = minf(1.0, u * 5.0) * (1.0 - smoothstep(0.65, 1.0, u))
	var open: float = smoothstep(0.55, 1.0, u)
	var rad: float = float(w["r"]) * (1.0 + open * 0.7) if dir > 0.0 else float(w["r"]) * (0.4 + u * 1.2)
	draw_set_transform(w["p"], 0.0, Vector2(1.0, GROUND))
	# The dark of the water going down (or, homeward, the light coming up).
	var core: Color = w["core"]
	for k: int in 9:
		var f: float = 1.0 - k / 9.0
		draw_circle(Vector2.ZERO, rad * f, Color(core, a * float(w.get("coreA", 0.085))))
	# Foam torn into streaks along the arms (broken, uneven, never a clean
	# line), and a finer, faster set between them.
	var foam: Color = w["foam"]
	var turn: float = t * (2.4 + u * 3.0) * dir
	for set: int in 2:
		var arms: int = 7 if set == 0 else 11
		var spd: float = 1.0 if set == 0 else 1.6
		for arm: int in arms:
			var a0: float = TAU * arm / arms + turn * spd + set * 0.3
			var seed: float = float(arm * 13 + set * 71)
			for i: int in 34:
				var s0: float = i / 34.0
				var s1: float = (i + 1.0) / 34.0 if set == 0 else (i + 0.62 + 0.3 * sin(seed + i * 2.3)) / 34.0
				var gap: float = sin(seed * 0.7 + i * 1.9 + t * 3.0)
				if set == 1 and gap < -0.2:
					continue
				var p0: Vector2 = Vector2.from_angle(a0 + s0 * 3.6 * dir) * rad * (1.0 - s0 * 0.88) * (1.0 + 0.04 * sin(seed + i))
				var p1: Vector2 = Vector2.from_angle(a0 + s1 * 3.6 * dir) * rad * (1.0 - s1 * 0.88) * (1.0 + 0.04 * sin(seed + i + 1.0))
				var wd: float = lerpf(11.0, 2.5, s0) * (1.0 if set == 0 else 0.4) * (0.55 + 0.45 * (0.5 + 0.5 * gap))
				var al: float = a * (0.5 - s0 * 0.4) * (1.0 if set == 0 else 0.55) * (0.55 + 0.45 * (0.5 + 0.5 * gap))
				draw_line(p0, p1, Color(foam, al), wd, true)


# ── The pieces (painted, set on the water) ─────────────────────────────────────

## A painted thing standing on the water, cut at the waterline.
class Piece:
	extends Node2D
	var tex: Texture2D
	var box: float = 360.0
	var glow_col: Color = Color(0.55, 0.6, 1.0)
	var spr: Sprite2D
	var glow: Sprite2D
	var mat: ShaderMaterial
	var bob: float = 1.0
	var _t: float = 0.0

	func _ready() -> void:
		glow = Sprite2D.new()
		glow.texture = Glow.radial(128, glow_col)
		glow.scale = Vector2(4.0, 4.0 * GROUND)
		glow.modulate.a = 0.0
		add_child(glow)
		spr = Sprite2D.new()
		spr.texture = tex
		var s: float = box / float(maxi(tex.get_width(), tex.get_height()))
		spr.scale = Vector2(s, s / GROUND)
		spr.offset = Vector2(0, -tex.get_height() * 0.42)
		mat = ShaderMaterial.new()
		var sh: Shader = Shader.new()
		sh.code = """shader_type canvas_item;
uniform float water_y = 0.86;
uniform vec4 tint : source_color = vec4(1.0, 1.0, 1.0, 0.0);
void fragment() {
	vec4 c = texture(TEXTURE, UV);
	float under = smoothstep(water_y - 0.015, water_y + 0.015, UV.y);
	c.rgb = mix(c.rgb, c.rgb * vec3(0.35, 0.55, 0.7), under * 0.75);
	c.a *= 1.0 - under * 0.92;
	c.rgb = mix(c.rgb, tint.rgb, tint.a);
	COLOR = c * COLOR;
}"""
		mat.shader = sh
		spr.material = mat
		add_child(spr)

	func _process(delta: float) -> void:
		_t += delta
		if spr != null:
			spr.rotation = sin(_t * 1.1) * 0.012 * bob


## THE SHRINE: the chained idol breaches, slow and heavy, rock and weed first.
func shrine_rise(at: Vector2) -> void:
	var pc: Piece = Piece.new()
	pc.tex = Skipper.tex("gauntlet-shrine.webp")
	pc.box = 380.0
	pc.glow_col = Color(0.55, 0.6, 1.0)
	pc.position = at
	pc.bob = 0.3
	get_parent().add_child(pc)
	_pieces["shrine"] = pc
	pc.spr.position.y = 330.0
	pc.spr.modulate.a = 0.0
	# Bubbles first: something big is coming up.
	for k: int in 18:
		fx.paint("bubble", BattleFx.up(at + Vector2(randf_range(-120, 120), randf_range(-30, 30))) + Vector2(0, -10), Vector2(randf_range(-14, 14), -randf_range(60, 120)), randf_range(0.7, 1.2), randf_range(10, 22), 4.0, Color(0.8, 0.9, 1.0, 0.8), { "delay": randf() * 0.7, "fade": 0.5 })
	_ring(at, 60.0, 260.0, 1.4, Color(0.75, 0.85, 1.0), 0.5, 3.0)
	await _wait(0.6)
	Sound.impact(false)
	Rumble.buzz([0, 30, 40, 50])
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(pc.spr, "position:y", 0.0, 1.9).set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT)
	tw.tween_property(pc.spr, "modulate:a", 1.0, 0.5)
	tw.tween_property(pc.glow, "modulate:a", 0.32, 1.6)
	# Water sheets off the stone as it clears the surface.
	for k2: int in 4:
		get_tree().create_timer(0.25 + 0.35 * k2).timeout.connect(func() -> void:
			if field != null:
				field.ring(at, 180.0 + 50.0 * k2, 1.6, 0.7)
			for j: int in 8:
				fx.paint("splash", BattleFx.up(at + Vector2(randf_range(-150, 150), 0)) + Vector2(0, -randf_range(40, 160)), Vector2(randf_range(-60, 60), randf_range(30, 90)), 0.7, randf_range(14, 26), 6.0, Color(0.85, 0.93, 1.0, 0.85), { "g": 320.0 }))
	await tw.finished


## Your answer at the shrine, staged: the coin, the price, or walking on.
func shrine_answer(pick: Dictionary, ship_at: Vector2) -> void:
	var pc: Piece = _pieces.get("shrine")
	if pc == null or not is_instance_valid(pc):
		return
	var at: Vector2 = pc.position
	match str(pick.get("choice", "walk")):
		"coin":
			var won: bool = pick.get("won", false) == true
			var land: Vector2 = ship_at if won else at + Vector2(150, 60)
			var done: Array = [false]
			_coins.append({ "a": at + Vector2(0, -10), "b": land, "t": 0.0, "life": 1.15, "h": 340.0 if won else 420.0, "p": at, "lift": 0.0,
				"on_land": func() -> void:
					done[0] = true
					if won:
						Sound.chest(false)
						fx.pulse(land, Color(1.0, 0.82, 0.35))
						for k: int in 16:
							fx.paint("spark", BattleFx.up(land) + Vector2(0, -60), Vector2.from_angle(TAU * k / 16.0) * randf_range(140, 260), 0.6, 22.0, 6.0, Color(1.0, 0.85, 0.4), { "drag": 3.0 })
					else:
						fx.splash(land)
						if field != null:
							field.ring(land, 140.0, 1.4, 0.8) })
			await _wait(1.5)
			await _settle(pc, 1.4)
		"blood":
			var red: Color = Color(0.85, 0.12, 0.12)
			var tw: Tween = create_tween().set_parallel()
			tw.tween_property(pc.glow, "modulate", Color(1.0, 0.25, 0.25, 0.7), 0.6)
			tw.tween_method(func(v: float) -> void: pc.mat.set_shader_parameter("tint", Color(0.7, 0.08, 0.08, v)), 0.0, 0.28, 0.6)
			pc.glow.texture = Glow.radial(128, red)
			for k: int in 4:
				_ring(at, 70.0, 420.0 + 60.0 * k, 2.4, red, 0.55, 5.0, 0.3 * k)
			for k2: int in 26:
				fx.paint("flash", BattleFx.up(at + Vector2.from_angle(randf() * TAU) * randf_range(60, 300)) , Vector2.ZERO, randf_range(1.0, 1.8), randf_range(40, 80), 120.0, Color(0.75, 0.05, 0.05, 0.28), { "delay": randf() * 0.8, "fade": 0.4 })
			Sound.impact(true)
			await _wait(2.2)
			await _settle(pc, 1.6)
		_:
			await _settle(pc, 2.4)


## Back under, slow: the stone settles and the water closes.
func _settle(pc: Piece, dur: float) -> void:
	_pieces.erase("shrine")
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(pc.spr, "position:y", 340.0, dur).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tw.tween_property(pc.glow, "modulate:a", 0.0, dur)
	tw.tween_property(pc.spr, "modulate:a", 0.0, dur * 0.9).set_delay(dur * 0.3)
	_ring(pc.position, 60.0, 240.0, dur + 0.6, Color(0.75, 0.85, 1.0), 0.4, 3.0, dur * 0.5)
	if field != null:
		field.ring(pc.position, 220.0, 1.6, 0.6)
	await tw.finished
	pc.queue_free()


## THE FENCE: the peddler's boat rows in out of the dark, lantern lit.
func fence_arrive(at: Vector2) -> void:
	if _pieces.has("fence"):
		return
	var pc: Piece = Piece.new()
	pc.tex = Skipper.tex("gauntlet-merchant.webp")
	pc.box = 400.0
	pc.glow_col = Color(1.0, 0.75, 0.4)
	pc.position = at + Vector2(820, -120)
	get_parent().add_child(pc)
	_pieces["fence"] = pc
	pc.mat.set_shader_parameter("water_y", 0.9)
	pc.spr.modulate = Color(0.25, 0.3, 0.38, 0.0)
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(pc, "position", at, 2.4).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tw.tween_property(pc.spr, "modulate", Color.WHITE, 1.8)
	tw.tween_property(pc.glow, "modulate:a", 0.4, 1.2).set_delay(0.6)
	Sound.splash()
	# The oars: a pull, a ring either side, every half second.
	for k: int in 5:
		get_tree().create_timer(0.45 * k).timeout.connect(func() -> void:
			if is_instance_valid(pc) and field != null:
				field.ring(pc.position + Vector2(-40, 70), 90.0, 1.0, 0.5)
				field.ring(pc.position + Vector2(90, 40), 70.0, 0.9, 0.4))
	await tw.finished
	# Tied up: a bump, a ring.
	if field != null:
		field.ring(at, 160.0, 1.2, 0.5)
	Sound.clunk()


## The stall closed: off it rows, the way it came.
func fence_leave() -> void:
	var pc: Piece = _pieces.get("fence")
	_pieces.erase("fence")
	if pc == null or not is_instance_valid(pc):
		return
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(pc, "position", pc.position + Vector2(900, -160), 2.6).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tw.tween_property(pc.spr, "modulate", Color(0.25, 0.3, 0.38, 0.0), 2.4)
	tw.tween_property(pc.glow, "modulate:a", 0.0, 1.4)
	tw.finished.connect(pc.queue_free)


## DESCENT: the water spirals under the party and opens out on the new depth.
func descent(center: Vector2, depth: int, accent: Color) -> void:
	_whirls.append({ "p": center, "t": 0.0, "life": 2.4, "r": 560.0, "dir": 1.0, "core": Color(0.0, 0.02, 0.06), "foam": Color(0.8, 0.9, 1.0) })
	for k: int in 4:
		get_tree().create_timer(0.3 * k).timeout.connect(func() -> void:
			if field != null:
				field.ring(center, 500.0 - 90.0 * k, 1.4, 0.6))
	Rumble.buzz([0, 20, 40, 20])
	# The foam takes the band's colour as it opens (the depth card names it).
	(_whirls[-1] as Dictionary)["foam"] = Color(0.8, 0.9, 1.0).lerp(accent, 0.35)
	await _wait(2.0)


## HOMEWARD: the spiral turns back and opens; light comes down; the party lifts.
func homeward(center: Vector2, hulls: Array) -> void:
	_whirls.append({ "p": center, "t": 0.0, "life": 2.8, "r": 520.0, "dir": -1.0, "coreA": 0.022, "core": Color(1.0, 0.93, 0.75), "foam": Color(1.0, 0.97, 0.88) })
	_shafts.append({ "p": center, "t": 0.0, "life": 3.2, "w": 620.0 })
	Sound.chest(true)
	for h: Variant in hulls:
		if h is Node2D and is_instance_valid(h):
			var n: Node2D = h
			var tw: Tween = create_tween().set_parallel()
			tw.tween_property(n, "position:y", n.position.y - 70.0, 2.6).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
			tw.tween_property(n, "modulate", Color(1.25, 1.2, 1.05), 2.0)
	for k: int in 30:
		fx.paint("spark", BattleFx.up(center + Vector2(randf_range(-420, 420), randf_range(-200, 200))), Vector2(randf_range(-10, 10), -randf_range(40, 110)), randf_range(1.4, 2.4), randf_range(10, 20), 4.0, Color(1.0, 0.92, 0.7, 0.85), { "delay": randf() * 1.6, "fade": 0.5 })
	await _wait(2.8)


## DROWNED: the hulls settle under, one by one, and the rings close over them.
func drowned(hulls: Array) -> void:
	Sound.slack()
	var i: int = 0
	for h: Variant in hulls:
		if not (h is Node2D) or not is_instance_valid(h):
			continue
		var n: Node2D = h
		var at: Vector2 = n.position
		var dl: float = 0.55 * i
		var tw: Tween = create_tween().set_parallel()
		tw.tween_property(n, "position:y", at.y + 60.0, 2.2).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN).set_delay(dl)
		tw.tween_property(n, "rotation", 0.12 * (1 if i % 2 == 0 else -1), 2.2).set_delay(dl)
		tw.tween_property(n, "modulate", Color(0.25, 0.4, 0.5, 0.0), 2.0).set_delay(dl + 0.3)
		for k: int in 14:
			fx.paint("bubble", BattleFx.up(at + Vector2(randf_range(-110, 110), randf_range(-20, 20))) + Vector2(0, -20), Vector2(randf_range(-8, 8), -randf_range(50, 110)), randf_range(0.8, 1.4), randf_range(8, 18), 3.0, Color(0.75, 0.88, 1.0, 0.75), { "delay": dl + 0.4 + randf() * 1.4, "fade": 0.5 })
		_ring(at, 180.0, 40.0, 2.4, Color(0.7, 0.85, 1.0), 0.45, 4.0, dl + 1.2)
		i += 1
	await _wait(2.6 + 0.55 * maxi(0, i - 1))


## A ring drawn on the water (growing, or closing when r1 < r0).
func _ring(at: Vector2, r0: float, r1: float, life: float, col: Color, a: float, w: float, delay: float = 0.0) -> void:
	_rings.append({ "p": at, "t": -delay, "life": life, "r0": r0, "r1": r1, "c": col, "a": a, "w": w })


## Everything left on the water, gone at once (the dive is over).
func clear() -> void:
	for k: Variant in _pieces:
		var pc: Node = _pieces[k]
		if is_instance_valid(pc):
			pc.queue_free()
	_pieces.clear()


# ── Arrivals: a boss (or an elite) comes onto the water its own way ────────────

## The bosses and elites with an entry of their own (the rest sail in).
const ENTRIES: Array = ["elite", "pete", "krust", "cartographer", "spet", "admiral", "quartermaster", "saltie", "don_finleone"]

var _charts: Array = []
var _gates: Array = []
var _trail: Array = []
var _booms: Array = []
var _stills: Array = []


static func entry_for(e: Dictionary) -> String:
	var id: String = str(e.get("id", ""))
	if e.get("boss", false) and ENTRIES.has(id):
		return id
	if e.get("elite", false) and not e.get("boss", false):
		return "elite"
	return ""


## Where the hull starts and how it looks before its entry plays (set at
## once, so nothing flickers in its finished place first).
func prep(kind: String, n: HullRig, at: Vector2) -> void:
	match kind:
		"elite", "cartographer":
			n.position = at
			n.modulate = Color(0.2, 0.25, 0.32, 0.0)
		"pete":
			n.position = at + Vector2(520, -460)
		"krust", "don_finleone":
			n.position = at
			n.sink = 1.0
		"spet", "quartermaster":
			n.position = at + Vector2(900, 0)
		"admiral":
			n.position = at + Vector2(760, 0)
		"saltie":
			n.position = at + Vector2(-60, -620)


func enter(kind: String, n: HullRig, at: Vector2) -> void:
	match kind:
		"elite": await _enter_fog(n, at)
		"pete": await _enter_swing(n, at)
		"krust": await _enter_breach(n, at)
		"cartographer": await _enter_inked(n, at)
		"spet": await _enter_toll(n, at)
		"admiral": await _enter_fleet(n, at)
		"quartermaster": await _enter_ledger(n, at)
		"saltie": await _enter_blockade(n, at)
		"don_finleone": await _enter_green(n, at)


## ELITE: a fog bank first, two lanterns in it, then the hull out of it.
func _enter_fog(n: HullRig, at: Vector2) -> void:
	for k: int in 46:
		var p: Vector2 = at + Vector2(randf_range(-320, 320), randf_range(-160, 160))
		fx.paint("mist", BattleFx.up(p) + Vector2(0, -randf_range(20, 120)), Vector2(-randf_range(14, 34), 0), randf_range(3.0, 4.2), randf_range(120, 220), randf_range(240, 340), Color(0.62, 0.68, 0.74, 0.34), { "delay": randf() * 0.6, "fade": 0.55, "in": 0.25 })
	for lp: Vector2 in [Vector2(-70, -150), Vector2(90, -120)]:
		fx.paint("flash", BattleFx.up(at) + lp, Vector2.ZERO, 2.6, 34.0, 40.0, Color(1.0, 0.75, 0.4, 0.8), { "delay": 0.35, "fade": 0.7, "in": 0.3 })
	await _wait(1.0)
	var tw: Tween = create_tween()
	tw.tween_property(n, "modulate", Color(0.75, 0.8, 0.86, 1.0), 1.0)
	tw.tween_property(n, "modulate", Color.WHITE, 0.8)
	await tw.finished


## PETE: the corsair swings in from the far water and turns hard into line.
func _enter_swing(n: HullRig, at: Vector2) -> void:
	var a: Vector2 = n.position
	var c: Vector2 = at + Vector2(560, 60)
	var tw: Tween = create_tween()
	tw.tween_method(func(u: float) -> void:
		n.position = a.lerp(c, u).lerp(c.lerp(at, u), u)
		n.heel = -0.12 * sin(u * PI), 0.0, 1.0, 2.0).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	for k: int in 9:
		get_tree().create_timer(0.22 * k).timeout.connect(func() -> void:
			if field != null and is_instance_valid(n):
				field.ring(n.position + Vector2(90, 20), 110.0, 1.3, 0.55))
	await tw.finished
	n.react(0.16, Vector2(-26, 0))
	for j: int in 12:
		fx.paint("splash", BattleFx.up(at + Vector2(-140, 10)) + Vector2(0, -40), Vector2(randf_range(-160, -40), -randf_range(60, 180)), 0.7, randf_range(16, 26), 6.0, Color(0.88, 0.95, 1.0, 0.85), { "g": 360.0 })
	Sound.splash()
	await _wait(0.4)


## KRUST: the iron hull comes up stern first, shedding sheets of water.
func _enter_breach(n: HullRig, at: Vector2) -> void:
	for k: int in 14:
		fx.paint("bubble", BattleFx.up(at + Vector2(randf_range(-150, 150), randf_range(-30, 30))), Vector2(0, -randf_range(60, 120)), randf_range(0.6, 1.0), randf_range(10, 20), 4.0, Color(0.8, 0.9, 1.0, 0.8), { "delay": randf() * 0.5 })
	await _wait(0.5)
	Sound.impact(true)
	Rumble.buzz([0, 40, 40, 70])
	var tw: Tween = create_tween()
	tw.tween_property(n, "sink", 0.0, 2.2).set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT)
	for k2: int in 6:
		get_tree().create_timer(0.2 + 0.3 * k2).timeout.connect(func() -> void:
			if field != null:
				field.ring(at, 200.0 + 40.0 * k2, 1.5, 0.8)
			for j: int in 10:
				fx.paint("splash", BattleFx.up(at + Vector2(randf_range(-170, 170), 0)) + Vector2(0, -randf_range(60, 200)), Vector2(randf_range(-40, 40), randf_range(40, 120)), 0.8, randf_range(14, 28), 6.0, Color(0.85, 0.93, 1.0, 0.85), { "g": 380.0 }))
	await tw.finished


## THE CARTOGRAPHER: chart lines spread across the water and the hull inks in
## along them.
func _enter_inked(n: HullRig, at: Vector2) -> void:
	_charts.append({ "p": at, "t": 0.0, "life": 3.4 })
	await _wait(0.9)
	var tw: Tween = create_tween()
	tw.tween_property(n, "modulate", Color(0.3, 0.32, 0.4, 0.85), 0.8)
	tw.tween_property(n, "modulate", Color.WHITE, 0.9)
	await tw.finished
	await _wait(0.3)


## TOLLMASTER SPET: two buoys light, a chain drops between them, and he sails
## through his own gate.
func _enter_toll(n: HullRig, at: Vector2) -> void:
	var g: Dictionary = { "p": at + Vector2(260, 0), "t": 0.0, "life": 4.0, "drop": 0.0 }
	_gates.append(g)
	Sound.bell()
	await _wait(0.8)
	var tw: Tween = create_tween()
	tw.tween_property(n, "position", at, 2.2).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	get_tree().create_timer(0.9).timeout.connect(func() -> void:
		var dt: Tween = create_tween()
		dt.tween_method(func(v: float) -> void: g["drop"] = v, 0.0, 1.0, 0.6).set_ease(Tween.EASE_IN)
		Sound.clunk()
		for j: int in 10:
			fx.paint("splash", BattleFx.up(g["p"]) + Vector2(randf_range(-30, 30), -20), Vector2(randf_range(-60, 60), -randf_range(80, 160)), 0.7, randf_range(14, 22), 6.0, Color(0.88, 0.95, 1.0, 0.85), { "g": 360.0, "delay": 0.4 }))
	for k: int in 8:
		get_tree().create_timer(0.27 * k).timeout.connect(func() -> void:
			if field != null and is_instance_valid(n):
				field.ring(n.position + Vector2(100, 20), 100.0, 1.2, 0.5))
	await tw.finished


## THE ADMIRAL: his fleet comes in behind him, fans out into line, and only
## he stays (the others were the line's ghosts all along).
func _enter_fleet(n: HullRig, at: Vector2) -> void:
	var ghosts: Array = []
	for k: int in 2:
		var gh: Sprite2D = Sprite2D.new()
		gh.texture = n.tex
		var s: float = n.box * 0.7 / float(maxi(1, n.tex.get_width()))
		gh.scale = Vector2(-s, s / GROUND)
		gh.offset = Vector2(0, -n.tex.get_height() * 0.38)
		gh.modulate = Color(0.7, 0.85, 0.8, 0.0)
		gh.position = at + Vector2(900 + 120 * k, 0)
		get_parent().add_child(gh)
		ghosts.append(gh)
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(n, "position", at, 1.8).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	for k2: int in 2:
		var gh2: Sprite2D = ghosts[k2]
		var dy: float = -230.0 if k2 == 0 else 210.0
		tw.tween_property(gh2, "position", at + Vector2(140, dy), 1.9).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT).set_delay(0.15 + 0.1 * k2)
		tw.tween_property(gh2, "modulate:a", 0.42, 0.6).set_delay(0.15)
	for k3: int in 7:
		get_tree().create_timer(0.25 * k3).timeout.connect(func() -> void:
			if field != null and is_instance_valid(n):
				field.ring(n.position + Vector2(110, 20), 110.0, 1.2, 0.5))
	await tw.finished
	await _wait(0.3)
	var out: Tween = create_tween().set_parallel()
	for gh3: Sprite2D in ghosts:
		out.tween_property(gh3, "modulate:a", 0.0, 0.9)
		for j: int in 8:
			fx.paint("mist", BattleFx.up(gh3.position) + Vector2(randf_range(-90, 90), -randf_range(20, 110)), Vector2(randf_range(-20, 20), -20), 1.2, 60.0, 140.0, Color(0.7, 0.85, 0.8, 0.3), { "fade": 0.4 })
	await out.finished
	for gh4: Sprite2D in ghosts:
		gh4.queue_free()


## THE QUARTERMASTER: a line of gold laid on the water like a ledger column,
## and his ship comes in along it, the coins sinking as he passes.
func _enter_ledger(n: HullRig, at: Vector2) -> void:
	for k: int in 18:
		_trail.append({ "p": at + Vector2(80 + 46 * k, sin(k * 0.8) * 18.0), "t": -0.05 * k, "life": 3.6 - 0.05 * k })
	Sound.chest(false)
	await _wait(0.9)
	var tw: Tween = create_tween()
	tw.tween_property(n, "position", at, 2.2).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	await tw.finished


## SAL BRACKWATER: a boom of floats draws across the water behind him, and the
## blockade ship slides down into place in front of it.
func _enter_blockade(n: HullRig, at: Vector2) -> void:
	_booms.append({ "p": at + Vector2(180, -470), "t": 0.0, "life": 3.8, "w": 560.0 })
	await _wait(0.6)
	var tw: Tween = create_tween()
	tw.tween_property(n, "position", at, 2.0).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	for k: int in 7:
		get_tree().create_timer(0.28 * k).timeout.connect(func() -> void:
			if field != null and is_instance_valid(n):
				field.ring(n.position + Vector2(0, -30), 130.0, 1.3, 0.5))
	await tw.finished
	n.react(-0.08, Vector2(0, 12))
	await _wait(0.3)


## DON FINLEONE: the sea goes green and still, the ripples running backward
## into one point, and he comes up through the middle of it, level and slow.
func _enter_green(n: HullRig, at: Vector2) -> void:
	var green: Color = Color(0.35, 0.95, 0.55)
	_stills.append({ "p": at, "t": 0.0, "life": 4.6 })
	for k: int in 5:
		_ring(at, 620.0 - 40.0 * k, 30.0, 1.6, green, 0.5, 3.0, 0.25 * k)
	await _wait(1.5)
	var tw: Tween = create_tween()
	tw.tween_method(func(v: float) -> void:
		n.sink = v
		n.heel = -v * 0.25 * n.face, 1.0, 0.0, 2.6).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	for j: int in 24:
		fx.paint("flash", BattleFx.up(at + Vector2(randf_range(-200, 200), randf_range(-40, 40))), Vector2(0, -randf_range(30, 80)), randf_range(1.2, 2.0), randf_range(20, 40), 6.0, Color(green, 0.5), { "delay": randf() * 1.6, "fade": 0.5 })
	await tw.finished


func _draw_arrivals() -> void:
	var ink: Color = Color(0.88, 0.82, 0.66)
	for c: Dictionary in _charts:
		var u: float = float(c["t"]) / float(c["life"])
		var grow: float = smoothstep(0.0, 0.45, u)
		var a: float = (1.0 - smoothstep(0.7, 1.0, u)) * 0.55
		draw_set_transform(c["p"], 0.0, Vector2(1.0, GROUND))
		for r: int in 3:
			var rad: float = 160.0 + 130.0 * r
			draw_arc(Vector2.ZERO, rad, -PI / 2.0, -PI / 2.0 + TAU * grow, 64, Color(ink, a * (0.9 - r * 0.2)), 2.0, true)
		for k: int in 16:
			var ang: float = TAU * k / 16.0
			var long: float = (460.0 if k % 4 == 0 else (300.0 if k % 2 == 0 else 200.0)) * grow
			draw_line(Vector2.ZERO, Vector2.from_angle(ang) * long, Color(ink, a * (0.8 if k % 4 == 0 else 0.4)), 2.5 if k % 4 == 0 else 1.2, true)
		for k2: int in 5:
			var y: float = (k2 - 2) * 120.0
			var half: float = sqrt(maxf(0.0, 440.0 * 440.0 - y * y)) * grow
			draw_dashed_line(Vector2(-half, y), Vector2(half, y), Color(ink, a * 0.35), 1.2, 10.0)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	for g: Dictionary in _gates:
		var u2: float = float(g["t"]) / float(g["life"])
		var a2: float = minf(1.0, u2 * 5.0) * (1.0 - smoothstep(0.75, 1.0, u2))
		var p: Vector2 = g["p"]
		var top: Vector2 = Vector2(p.x, p.y - 260.0 * GROUND)
		var bot: Vector2 = Vector2(p.x, p.y + 260.0 * GROUND)
		var drop: float = float(g["drop"])
		if drop < 1.0:
			var pts: PackedVector2Array = PackedVector2Array()
			for i: int in 17:
				var f: float = i / 16.0
				pts.append(top.lerp(bot, f) + Vector2(sin(f * PI) * 40.0 * (1.0 + drop * 3.0), -70.0 + drop * 70.0 * sin(f * PI)))
			draw_polyline(pts, Color(0.45, 0.42, 0.38, a2 * (1.0 - drop)), 4.0, true)
			for i2: int in pts.size():
				draw_arc(pts[i2], 4.0, 0.0, TAU, 8, Color(0.6, 0.56, 0.5, a2 * (1.0 - drop)), 1.5, true)
		for b: Vector2 in [top, bot]:
			draw_rect(Rect2(b + Vector2(-9, -78), Vector2(18, 78)), Color(0.55, 0.16, 0.12, a2))
			draw_rect(Rect2(b + Vector2(-9, -52), Vector2(18, 14)), Color(0.92, 0.88, 0.8, a2))
			draw_circle(b + Vector2(0, -86), 9.0, Color(1.0, 0.82, 0.45, a2))
			draw_circle(b + Vector2(0, -86), 22.0, Color(1.0, 0.8, 0.4, a2 * 0.25))
			draw_set_transform(b, 0.0, Vector2(1.0, GROUND))
			draw_arc(Vector2.ZERO, 26.0, 0.0, TAU, 24, Color(0.85, 0.93, 1.0, a2 * 0.4), 2.0, true)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	for c2: Dictionary in _trail:
		if float(c2["t"]) < 0.0:
			continue
		var u3: float = float(c2["t"]) / float(c2["life"])
		var a3: float = minf(1.0, float(c2["t"]) * 4.0) * (1.0 - smoothstep(0.7, 1.0, u3))
		draw_set_transform(c2["p"], 0.0, Vector2(1.0, GROUND))
		draw_circle(Vector2.ZERO, 26.0, Color(1.0, 0.8, 0.35, a3 * 0.18))
		draw_circle(Vector2.ZERO, 11.0, Color(0.98, 0.78, 0.3, a3))
		draw_arc(Vector2.ZERO, 8.0, 0.0, TAU, 16, Color(0.6, 0.42, 0.12, a3), 1.5, true)
		draw_circle(Vector2(-3, -3), 3.0, Color(1.0, 0.96, 0.75, a3))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	for bm: Dictionary in _booms:
		var u4: float = float(bm["t"]) / float(bm["life"])
		var span: float = float(bm.get("w", 760.0)) * smoothstep(0.0, 0.35, u4)
		var a4: float = minf(1.0, u4 * 6.0) * (1.0 - smoothstep(0.8, 1.0, u4))
		var bp: Vector2 = bm["p"]
		var bpts: PackedVector2Array = PackedVector2Array()
		for i3: int in 25:
			var x: float = lerpf(-span, span, i3 / 24.0)
			bpts.append(bp + Vector2(x, sin(x * 0.02 + float(bm["t"]) * 2.0) * 4.0))
		draw_polyline(bpts, Color(0.5, 0.42, 0.32, a4 * 0.9), 3.0, true)
		for i4: int in range(0, 25, 3):
			draw_set_transform(bpts[i4], 0.0, Vector2(1.0, GROUND))
			draw_circle(Vector2.ZERO, 14.0, Color(0.85, 0.75, 0.55, a4))
			draw_arc(Vector2.ZERO, 22.0, 0.0, TAU, 20, Color(0.85, 0.93, 1.0, a4 * 0.35), 2.0, true)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	for st: Dictionary in _stills:
		var u5: float = float(st["t"]) / float(st["life"])
		var a5: float = smoothstep(0.0, 0.3, u5) * (1.0 - smoothstep(0.75, 1.0, u5))
		draw_set_transform(st["p"], 0.0, Vector2(1.0, GROUND))
		for k5: int in 8:
			draw_circle(Vector2.ZERO, 640.0 * (1.0 - k5 / 8.0), Color(0.1, 0.45, 0.25, a5 * 0.05))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


# ── The curse, the Don's job, the breather ─────────────────────────────────────

## THE CURSE: dark ink spreads under the hulls from one point, a trail of
## bubbles breaking over it.
func curse(center: Vector2, col: Color) -> void:
	var from: Vector2 = center + Vector2(260, 120)
	var ink: Color = Color(0.01, 0.0, 0.03)
	Sound.slack()
	for k: int in 34:
		var f: float = k / 33.0
		var p: Vector2 = from.lerp(center + Vector2(randf_range(-260, 260), randf_range(-120, 120)), f)
		fx.paint("mist", BattleFx.up(p), Vector2(randf_range(-10, 10), 0), 2.6, 60.0, randf_range(220, 340), Color(ink, 0.5), { "delay": f * 1.0, "fade": 0.55, "in": 0.2 })
	for k2: int in 26:
		var p2: Vector2 = from.lerp(center, randf()) + Vector2(randf_range(-120, 120), randf_range(-50, 50))
		fx.paint("bubble", BattleFx.up(p2) + Vector2(0, -10), Vector2(randf_range(-6, 6), -randf_range(40, 90)), randf_range(0.7, 1.2), randf_range(8, 16), 3.0, Color(col.lightened(0.4), 0.7), { "delay": 0.3 + randf() * 1.3, "fade": 0.5 })
	_ring(from, 30.0, 320.0, 2.2, col, 0.35, 3.0)
	await _wait(2.0)


## THE DON'S JOB: a launch of his, green lantern lit, comes alongside with the
## stakes and waits; it leaves when the job is settled.
func launch_arrive(at: Vector2) -> void:
	if _pieces.has("launch"):
		return
	var n: HullRig = HullRig.new()
	n.tex = Skipper.tex("ship-hero/sloop_v3.png")
	n.def = {}
	n.box = 230.0
	n.face = -1.0
	n.position = at + Vector2(760, 40)
	n.modulate = Color(0.55, 0.9, 0.65, 0.0)
	get_parent().add_child(n)
	_pieces["launch"] = n
	var lamp: Sprite2D = Sprite2D.new()
	lamp.texture = Glow.radial(64, Color(0.4, 1.0, 0.55))
	lamp.position = Vector2(-30, -170)
	lamp.scale = Vector2(1.6, 1.6)
	lamp.modulate.a = 0.0
	n.add_child(lamp)
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(n, "position", at, 2.0).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tw.tween_property(n, "modulate", Color(0.75, 1.0, 0.82, 0.92), 1.2)
	tw.tween_property(lamp, "modulate:a", 0.8, 0.8).set_delay(0.6)
	for k: int in 7:
		get_tree().create_timer(0.28 * k).timeout.connect(func() -> void:
			if field != null and is_instance_valid(n):
				field.ring(n.position + Vector2(70, 15), 80.0, 1.1, 0.45))
	await tw.finished
	Sound.bell()


func launch_leave() -> void:
	var n: Node2D = _pieces.get("launch")
	_pieces.erase("launch")
	if n == null or not is_instance_valid(n):
		return
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(n, "position", n.position + Vector2(820, 60), 2.4).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tw.tween_property(n, "modulate:a", 0.0, 2.2)
	tw.finished.connect(n.queue_free)


## THE BREATHER: the chop settles and light comes down through the water round
## the party (short: it comes often).
func breather(center: Vector2) -> void:
	_shafts.append({ "p": center, "t": 0.0, "life": 2.6, "w": 520.0 })
	for k: int in 14:
		fx.paint("spark", BattleFx.up(center + Vector2(randf_range(-360, 360), randf_range(-160, 160))), Vector2(0, -randf_range(10, 30)), randf_range(1.4, 2.2), randf_range(8, 14), 3.0, Color(1.0, 0.95, 0.8, 0.6), { "delay": randf() * 1.0, "fade": 0.5 })
	await _wait(1.3)
